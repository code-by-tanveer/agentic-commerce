import { z } from 'zod';
import { searchCatalog } from '../catalog.js';
import { stableKey } from '../cache.js';
import { computeChips } from '../reasoning.js';
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
}

const description =
  'Search a multi-merchant Shopify catalog for products. Accepts a free-form natural-language `query` plus optional `filters` ({ price: { min?, max? }, available?, ships_to? }) and `limit` (default 8, max 20). `ships_to` is forwarded to the catalog so honor saved preferences when relevant. Results are normalized across merchants and returned as product cards rendered inline in the chat UI.';

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

    const cached = ctx.cache.get<SearchCatalogResult>(cacheKey);
    if (cached) {
      // Recompute chips against the *current* preferences snapshot — chips
      // are session-state-derived and should never come out of the cache.
      const products = cached.products.map((p) => ({
        ...p,
        reasoningChips: computeChips(p, ctx.preferences),
      }));
      return { products };
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
    return { products: withChips };
  },
  toEvents(args, result, { toolCallId }) {
    const events = [
      {
        type: 'products' as const,
        toolCallId,
        query: args.query,
        products: result.products,
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
