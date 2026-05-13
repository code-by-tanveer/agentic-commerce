import { z } from 'zod';
import { searchCatalog } from '../catalog.js';
import { stableKey } from '../cache.js';
import { computeChips } from '../reasoning.js';
import { getTaskPrefs, noteTopic, setTaskPref } from '../taskPrefs.js';
import type { AppliedFilters } from '../../stream/events.js';
import type { NormalizedProduct } from '../../types/product.js';
import type { Tool } from '../../types/tool.js';

const filterSchema = z
  .object({
    price: z
      .object({
        min: z.number().nonnegative().optional(),
        max: z.number().nonnegative().optional(),
      })
      .optional(),
    available: z.boolean().optional(),
    ships_to: z.string().optional(),
    // 2026-05-13: shipping_speed accepted as a task-tier filter. The catalog
    // MCP doesn't honour it server-side, but we mirror it through to the
    // task-pref scratchpad and the `appliedFilters` event so the FE can
    // attribute the result set correctly.
    shipping_speed: z.string().optional(),
  })
  .strict()
  .optional();

const argsSchema = z.object({
  query: z.string().trim().min(1).max(500),
  filters: filterSchema,
  limit: z.number().int().min(1).max(20).optional(),
});

export type SearchCatalogArgs = z.infer<typeof argsSchema>;
export interface SearchCatalogResult {
  products: NormalizedProduct[];
  /**
   * The merged filter set that actually drove this search — LLM-supplied
   * filters + identity-tier prefs from SQLite + task-tier prefs from the
   * scratchpad at write time. Surfaced on the `products` SSE event so the FE
   * can render attribution chips per message and the NoResults block can
   * explain *why* a result set is empty without inferring from sibling
   * events. Distinct from `args.filters`: this is the post-merge view.
   */
  appliedFilters: AppliedFilters;
}

const description =
  'Search a multi-merchant Shopify catalog for products. Accepts a free-form natural-language `query` plus optional `filters` ({ price: { min?, max? }, available?, ships_to?, shipping_speed? }) and `limit` (default 8, max 20). Pass task-bound knobs (price/budget, shipping_speed) here EVERY TURN you want them honored — they are not persisted across topic shifts. `ships_to` and identity prefs are read from the saved preferences store automatically; you do not need to re-pass them. Results are normalized across merchants and returned as product cards rendered inline in the chat UI.';

export const searchCatalogTool: Tool<SearchCatalogArgs, SearchCatalogResult> = {
  name: 'search_catalog',
  description,
  emits: ['products'],
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural-language description of what the user is looking for.',
      },
      filters: {
        type: 'object',
        properties: {
          price: {
            type: 'object',
            properties: {
              min: { type: 'number', minimum: 0 },
              max: { type: 'number', minimum: 0 },
            },
            additionalProperties: false,
          },
          available: { type: 'boolean' },
          ships_to: {
            type: 'string',
            description: 'ISO country code or region the items must ship to.',
          },
          shipping_speed: {
            type: 'string',
            description:
              'Desired shipping speed for THIS search (e.g. "fast", "<=3 days"). Pass per-turn — not persisted across topic shifts.',
          },
        },
        additionalProperties: false,
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 20,
        description: 'Maximum number of products to return. Defaults to 8.',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  parseArgs(raw) {
    return argsSchema.parse(raw);
  },
  async execute(args, ctx) {
    const limit = args.limit ?? 8;
    const cacheKey = stableKey([
      'search_catalog',
      args.query.trim().toLowerCase(),
      args.filters ?? null,
      limit,
    ]);

    // Topic-shift signal BEFORE any read or write. If the query string
    // differs from the topic the scratchpad was last keyed on, this drops
    // every prior task-tier entry — even if the current call doesn't itself
    // set a budget / shipping_speed. This is the load-bearing line for the
    // "lamp under $15 → running shoes" regression: without it, the merged
    // filter view would silently carry budget=15 into the shoe search.
    noteTopic(ctx.sessionId, args.query);

    // Write task-tier prefs through to the scratchpad BEFORE the MCP call.
    // The agent loop reads getTaskPrefs() when composing the next turn's
    // system prompt, so a within-turn write makes the value visible from
    // turn N+1 onward. The query string is the topic hint — agent-side
    // topic detection lives in the prompt; this is just the comparator.
    const budget = args.filters?.price;
    if (budget && (typeof budget.min === 'number' || typeof budget.max === 'number')) {
      setTaskPref(ctx.sessionId, 'budget', budget, args.query);
    }
    if (args.filters?.shipping_speed) {
      setTaskPref(ctx.sessionId, 'shipping_speed', args.filters.shipping_speed, args.query);
    }

    const cached = ctx.cache.get<{ products: NormalizedProduct[] }>(cacheKey);
    if (cached) {
      // Recompute chips against the *current* preferences snapshot — chips
      // are session-state-derived and should never come out of the cache.
      const products = cached.products.map((p) => ({
        ...p,
        reasoningChips: computeChips(p, ctx.preferences),
      }));
      return { products, appliedFilters: composeAppliedFilters(args, ctx) };
    }

    if (ctx.signal.aborted) throw new Error('aborted');
    // R3-cleanup (architect-code LOW): thread `ctx.log` into the MCP call so
    // retry attempts surface in the per-request log namespace.
    const products = await searchCatalog(args.query, limit, {
      filters: {
        ships_to: args.filters?.ships_to,
        available: args.filters?.available,
      },
      signal: ctx.signal,
      log: ctx.log,
    });

    // Post-fetch price filter (MCP `filters.price` not guaranteed honoured).
    let filtered = products;
    const max = args.filters?.price?.max;
    const min = args.filters?.price?.min;
    if (typeof max === 'number') filtered = filtered.filter((p) => p.price <= max);
    if (typeof min === 'number') filtered = filtered.filter((p) => p.price >= min);

    ctx.log.info(
      {
        query: args.query,
        filters: args.filters,
        rawCount: products.length,
        filteredCount: filtered.length,
        samplePrices: products.slice(0, 3).map((p) => `${p.currency} ${p.price}`),
      },
      'search_catalog debug',
    );

    // Cache the un-chipped products; chips are recomputed per call so prefs
    // edits inside the same turn pick up immediately.
    ctx.cache.set(cacheKey, { products: filtered });

    const withChips = filtered.map((p) => ({
      ...p,
      reasoningChips: computeChips(p, ctx.preferences),
    }));
    return { products: withChips, appliedFilters: composeAppliedFilters(args, ctx) };
  },
  toEvents(args, result, { toolCallId }) {
    const events = [
      {
        type: 'products' as const,
        toolCallId,
        query: args.query,
        products: result.products,
        appliedFilters: result.appliedFilters,
      },
    ];
    const summary = result.products
      .slice(0, 8)
      .map((p) => `- ${p.id}: ${p.title} ($${p.price.toFixed(2)} ${p.currency}, ${p.merchant})`)
      .join('\n');
    const assistantString = `Found ${result.products.length} product(s) for "${args.query}":\n${summary || '(no results)'}\n\nThese have been rendered as cards for the user; reference them by title, not id.`;
    return { events, assistantString };
  },
};

/**
 * Merge the three sources of filter truth — the LLM-supplied `args.filters`,
 * the identity-tier prefs snapshot (SQLite), and the task-tier scratchpad —
 * into the wire-shaped `appliedFilters` payload. Precedence: explicit args
 * win over prefs (the agent's job is to inline the relevant prefs on each
 * call); identity prefs win over task prefs for `ships_to` because shipping
 * destination is the canonical identity fact (ADR-0005); task prefs win over
 * identity prefs for `budget` / `shipping_speed` because those keys never
 * live in identity tier (and if they're somehow there from a pre-tier-model
 * save, see TODO below).
 *
 * TODO v1.5: `size` belongs to the scoped tier (e.g. `size:shoe=8` vs
 * `size:dress=M`) and is intentionally NOT surfaced on `appliedFilters` yet.
 * It continues to be read from identity-tier prefs unconditionally; we'll
 * thread a scoped read-through here when the scoped tier ships.
 */
function composeAppliedFilters(
  args: SearchCatalogArgs,
  ctx: { sessionId: string; preferences: import('../../types/tool.js').PreferencesSnapshot },
): AppliedFilters {
  const out: AppliedFilters = {};

  // Identity-tier reads — go straight through to the wire field.
  const idShipsTo = ctx.preferences.ships_to?.value;
  if (args.filters?.ships_to) {
    out.shipsTo = args.filters.ships_to;
  } else if (typeof idShipsTo === 'string' && idShipsTo.length > 0) {
    out.shipsTo = idShipsTo;
  }

  // Task-tier reads — pull the latest snapshot (it includes the write we
  // just did above for the current turn).
  const task = getTaskPrefs(ctx.sessionId) as ReturnType<typeof getTaskPrefs>;
  const argBudget = args.filters?.price;
  if (argBudget && (typeof argBudget.min === 'number' || typeof argBudget.max === 'number')) {
    out.budget = { ...argBudget };
  } else if ('budget' in task && task.budget) {
    out.budget = { ...task.budget };
  }

  const argShipSpeed = args.filters?.shipping_speed;
  if (typeof argShipSpeed === 'string' && argShipSpeed.length > 0) {
    out.shippingSpeed = argShipSpeed;
  } else if ('shipping_speed' in task && typeof task.shipping_speed === 'string') {
    out.shippingSpeed = task.shipping_speed;
  }

  if ('shopping_for' in task && typeof task.shopping_for === 'string') {
    out.shoppingFor = task.shopping_for;
  }

  return out;
}
