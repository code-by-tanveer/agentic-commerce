import { z } from 'zod';
import { getProduct, searchCatalog } from '../catalog.js';
import { complementaryCategoriesFor } from '../outfitCategories.js';
import { computeChips } from '../reasoning.js';
import type { NormalizedProduct, ReasoningChip } from '../../types/product.js';
import type { PreferencesSnapshot, Tool } from '../../types/tool.js';

/**
 * `recommend_outfit` — build a coordinated 2-4 item bundle around an anchor.
 *
 * ADR-0003 justification (composition over raw MCP):
 *   1. Resolve the anchor product (one MCP `get_product`).
 *   2. Derive 2-3 complementary categories from a small heuristic table
 *      (`outfitCategories.ts`). This is the *taste* layer the LLM can't
 *      reliably do on its own — without it, the agent would have to invent
 *      pairings in prose.
 *   3. Fan out parallel `searchCatalog` calls (1 per category) — pure
 *      composition, not something the model can do in a single MCP hop.
 *   4. Rank each sub-result set by (preference match → cheapest available
 *      → fall back to first available) and pick 1-2 per category, capped
 *      at `max_items` items total.
 *   5. Attach a per-item `rationale` built from *real* catalog data (shared
 *      tags, same merchant, similar price band, same shipping region). NO
 *      hallucinated provenance — rationale is omitted when no real signal
 *      supports it.
 *
 * The aggregation + ranking + rationale step is what justifies this tool's
 * existence in the registry. Without it, the LLM would have to speculate on
 * pairings in prose.
 *
 * Maps to one `outfit` SSE event.
 */

const argsSchema = z
  .object({
    anchor_product_id: z.string().trim().min(1),
    max_items: z.number().int().min(1).max(4).optional(),
  })
  .strict();

export type RecommendOutfitArgs = z.infer<typeof argsSchema>;

export interface RecommendOutfitItem extends NormalizedProduct {
  rationale?: string;
}

export type RecommendOutfitResult =
  | {
      ok: true;
      anchorProductId: string;
      items: RecommendOutfitItem[];
      rationale: string;
    }
  | {
      ok: false;
      anchorProductId: string;
      error: 'anchor_not_found' | 'no_complementary_categories';
      detail: string;
    };

const description =
  'Build a coordinated 2-4 item outfit/bundle around an anchor product. ' +
  'Use when the user asks "what goes with X", "complete this look", "pair this with…", ' +
  'or any other coordinated-set request. ' +
  'Composition value (vs a raw MCP call): the tool fans out 2-3 parallel `search_catalog` ' +
  'calls for derived complementary categories, ranks the sub-results by preference match → ' +
  'cheapest available, and attaches a per-item rationale built strictly from catalog data ' +
  '(shared tags, same merchant, similar price band, same shipping region). ' +
  'Returns `{ anchorProductId, items, rationale }`; if the anchor type has no known ' +
  'complementary categories, returns a graceful "no_complementary_categories" tool result.';

export const recommendOutfitTool: Tool<RecommendOutfitArgs, RecommendOutfitResult> = {
  name: 'recommend_outfit',
  description,
  emits: ['outfit'],
  parameters: {
    type: 'object',
    properties: {
      anchor_product_id: {
        type: 'string',
        description: 'Product id (UPID) to build the bundle around.',
      },
      max_items: {
        type: 'integer',
        minimum: 1,
        maximum: 4,
        description: 'Maximum number of items in the bundle. Default 3, hard cap 4.',
      },
    },
    required: ['anchor_product_id'],
    additionalProperties: false,
  },
  parseArgs(raw) {
    return argsSchema.parse(raw);
  },
  async execute(args, ctx) {
    if (ctx.signal.aborted) throw new Error('aborted');
    const maxItems = Math.min(args.max_items ?? 3, 4);

    // 1. Fetch anchor.
    // R3-cleanup (architect-code LOW): thread `ctx.log` for MCP retry visibility.
    const anchor = await getProduct(args.anchor_product_id, { signal: ctx.signal, log: ctx.log });
    if (!anchor) {
      return {
        ok: false,
        anchorProductId: args.anchor_product_id,
        error: 'anchor_not_found',
        detail: `Could not resolve product ${args.anchor_product_id} via the catalog.`,
      } satisfies RecommendOutfitResult;
    }

    // 2. Derive complementary categories.
    const categories = complementaryCategoriesFor(anchor);
    if (categories.length === 0) {
      return {
        ok: false,
        anchorProductId: anchor.id,
        error: 'no_complementary_categories',
        detail: `No complementary categories known for "${anchor.title}". Recommend products of this type individually.`,
      } satisfies RecommendOutfitResult;
    }

    // 3. Parallel fan-out (each search threads ctx.signal — ARCH §7).
    if (ctx.signal.aborted) throw new Error('aborted');
    const settled = await Promise.all(
      categories.map(async (q) => {
        try {
          // R3-cleanup (architect-code LOW): thread `ctx.log` for MCP retry visibility.
          const products = await searchCatalog(q, 4, { signal: ctx.signal, log: ctx.log });
          return { query: q, products };
        } catch (err) {
          ctx.log.warn({ err, query: q }, 'recommend_outfit sub-search failed');
          return { query: q, products: [] as NormalizedProduct[] };
        }
      }),
    );

    // 4. Pick top 1-2 per category. Ranking: preference match → cheapest
    // available → first available. Skip items that match the anchor id.
    const picked: RecommendOutfitItem[] = [];
    for (const { products } of settled) {
      const candidates = products.filter((p) => p.id && p.id !== anchor.id);
      if (candidates.length === 0) continue;
      const ranked = rankCandidates(candidates, ctx.preferences);
      // Take up to 2 per category, but stop if we already hit the cap.
      const remainingSlots = Math.max(0, maxItems - picked.length);
      const take = Math.min(2, remainingSlots, ranked.length);
      for (let i = 0; i < take; i++) {
        const item = ranked[i];
        const chips = computeChips(item, ctx.preferences);
        const rationale = buildItemRationale(anchor, item);
        const withRationale: RecommendOutfitItem = {
          ...item,
          reasoningChips: chips,
        };
        if (rationale) withRationale.rationale = rationale;
        picked.push(withRationale);
      }
      if (picked.length >= maxItems) break;
    }

    if (picked.length === 0) {
      return {
        ok: false,
        anchorProductId: anchor.id,
        error: 'no_complementary_categories',
        detail: `Complementary categories returned no matching products for "${anchor.title}".`,
      } satisfies RecommendOutfitResult;
    }

    const rationale = buildBundleRationale(anchor, picked, categories);
    return {
      ok: true,
      anchorProductId: anchor.id,
      items: picked.slice(0, maxItems),
      rationale,
    } satisfies RecommendOutfitResult;
  },
  toEvents(_args, result, { toolCallId }) {
    if (!result.ok) {
      // Graceful — surface a tool_status update so the FE/loop knows, but
      // don't emit an `outfit` event. Assistant string explains plainly.
      const errMsg =
        result.error === 'anchor_not_found'
          ? `Anchor product not found.`
          : `No complementary categories known for this product type.`;
      return {
        events: [
          {
            type: 'tool_status' as const,
            toolCallId,
            name: 'recommend_outfit',
            status: 'error' as const,
            errorMessage: errMsg,
          },
        ],
        assistantString: JSON.stringify({
          ok: false,
          error: result.error,
          detail: result.detail,
          anchorProductId: result.anchorProductId,
        }),
      };
    }

    // Cycle 7 polish (T1.21): per-item rationale used to be computed-then-
    // stripped. We now ship it as a parallel `rationales` array on the
    // `outfit` event so the FE can render it under each cell. The element
    // shape of `items` stays plain `NormalizedProduct[]` to avoid churning
    // every FE consumer of the bundle.
    const itemsForEvent: NormalizedProduct[] = result.items.map((item) => {
      const { rationale: _r, ...rest } = item;
      void _r;
      return rest as NormalizedProduct;
    });
    const rationales: (string | null)[] = result.items.map((item) => item.rationale ?? null);

    const events = [
      {
        type: 'outfit' as const,
        toolCallId,
        anchorProductId: result.anchorProductId,
        items: itemsForEvent,
        rationales,
        rationale: result.rationale,
      },
    ];
    const itemsSummary = result.items
      .map(
        (i) =>
          `- ${i.id}: ${i.title} ($${i.price.toFixed(2)} ${i.currency}, ${i.merchant})${
            i.rationale ? ` — ${i.rationale}` : ''
          }`,
      )
      .join('\n');
    const assistantString =
      `Built an outfit bundle around anchor ${result.anchorProductId} with ${result.items.length} item(s).\n` +
      `Bundle thesis: ${result.rationale}\n` +
      `${itemsSummary}\n\n` +
      `Rendered as an OutfitBundle card for the user; reference items by title.`;
    return { events, assistantString };
  },
};

// ---------------------------------------------------------------------------
// Ranking + rationale helpers (pure).
// ---------------------------------------------------------------------------

function rankCandidates(
  candidates: NormalizedProduct[],
  prefs: PreferencesSnapshot,
): NormalizedProduct[] {
  return [...candidates].sort((a, b) => {
    const ac = scoreForPrefs(a, prefs);
    const bc = scoreForPrefs(b, prefs);
    if (ac !== bc) return bc - ac; // higher score first
    // tie-break: cheapest available
    const aAvail = isAvailable(a);
    const bAvail = isAvailable(b);
    if (aAvail !== bAvail) return aAvail ? -1 : 1;
    return a.price - b.price;
  });
}

function isAvailable(p: NormalizedProduct): boolean {
  if (p.variants && p.variants.length > 0) {
    return p.variants.some((v) => v.available);
  }
  // No variant data — fall back to "checkoutUrl present" as a heuristic.
  return Boolean(p.checkoutUrl);
}

function scoreForPrefs(p: NormalizedProduct, prefs: PreferencesSnapshot): number {
  // Reuse computeChips heuristics — but we only credit `positive` chips for
  // ranking (e.g. size_match, ships_to, ethics tag match).
  const chips = computeChips(p, prefs);
  let score = 0;
  for (const c of chips as ReasoningChip[]) {
    if (c.tone === 'positive') score += 2;
    else if (c.tone === 'warning') score -= 1;
  }
  if (isAvailable(p)) score += 1;
  return score;
}

function buildItemRationale(
  anchor: NormalizedProduct,
  item: NormalizedProduct,
): string | undefined {
  const reasons: string[] = [];

  // Same merchant?
  if (
    anchor.merchant &&
    item.merchant &&
    anchor.merchant.toLowerCase() === item.merchant.toLowerCase()
  ) {
    reasons.push(`same merchant (${item.merchant})`);
  }

  // Shared merchant tags?
  const anchorTags = new Set((anchor.merchantTags ?? []).map((t) => t.toLowerCase()));
  const itemTags = (item.merchantTags ?? []).map((t) => t.toLowerCase());
  const sharedTag = itemTags.find((t) => anchorTags.has(t));
  if (sharedTag) {
    reasons.push(`shared tag "${sharedTag}"`);
  }

  // Similar price band? (within ±50% of anchor price, both non-zero)
  if (anchor.price > 0 && item.price > 0) {
    const ratio = item.price / anchor.price;
    if (ratio >= 0.5 && ratio <= 1.5) {
      reasons.push(`similar price band`);
    }
  }

  // Same shipping region?
  const anchorRegions = new Set(
    (anchor.variants ?? []).flatMap((v) => v.shipsTo ?? []).map((s) => s.toUpperCase()),
  );
  const itemRegions = (item.variants ?? [])
    .flatMap((v) => v.shipsTo ?? [])
    .map((s) => s.toUpperCase());
  const sharedRegion = itemRegions.find((r) => anchorRegions.has(r));
  if (sharedRegion) {
    reasons.push(`ships to the same region (${sharedRegion})`);
  }

  if (reasons.length === 0) return undefined;
  return reasons.slice(0, 2).join('; ');
}

function buildBundleRationale(
  anchor: NormalizedProduct,
  items: RecommendOutfitItem[],
  categories: string[],
): string {
  const cats = categories.slice(0, items.length).join(' + ');
  const merchantSet = new Set(items.map((i) => i.merchant).filter(Boolean));
  const sameMerchant = merchantSet.size === 1 && merchantSet.has(anchor.merchant);
  const merchantNote = sameMerchant
    ? ` All ${items.length} pieces ship from ${anchor.merchant}.`
    : '';
  return `Pairing "${anchor.title}" with ${cats} to complete the look.${merchantNote}`;
}
