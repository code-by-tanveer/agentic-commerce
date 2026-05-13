import { z } from 'zod';
import { lookupCatalog } from '../catalog.js';
import { stableKey } from '../cache.js';
import { computeChips } from '../reasoning.js';
import type { NormalizedProduct } from '../../types/product.js';
import type { Tool } from '../../types/tool.js';

const DEFAULT_AXES = ['price', 'rating', 'shipping'] as const;

const argsSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(2).max(6),
  axes: z.array(z.string().trim().min(1)).optional(),
});

export type CompareProductsArgs = z.infer<typeof argsSchema>;

export interface CompareProductsResult {
  products: NormalizedProduct[];
  axes: string[];
}

const description =
  'Compare 2–6 products side-by-side along a set of axes. ALWAYS pass an `axes` array that reflects what the user actually asked about — e.g. for "which has better battery" pass `["battery"]`, for "compare on price and shipping" pass `["price","shipping"]`. Only omit `axes` for a fully open-ended "compare X and Y" with no stated criterion (defaults to price/rating/shipping). The UI renders only the axes you list, so a focused `axes` array keeps the table short and on-topic; an over-broad list produces a noisy 8-row dump. Use when the user asks "which one is better", "compare X and Y", or "which is better at <criterion>".';

export const compareProductsTool: Tool<CompareProductsArgs, CompareProductsResult> = {
  name: 'compare_products',
  description,
  emits: ['comparison'],
  parameters: {
    type: 'object',
    properties: {
      ids: {
        type: 'array',
        items: { type: 'string' },
        minItems: 2,
        maxItems: 6,
        description: 'Product ids to compare.',
      },
      axes: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Comparison axes to show as rows. Strongly recommended — pass the dimensions the user actually asked about (e.g. ["battery"], ["price","shipping"], ["material","origin"]). The UI shows EXACTLY the axes you list (plus the product image header). Omit only for an open-ended "compare X and Y" with no stated criterion; in that case the UI shows the default 3-row set (price/rating/shipping). Known axis aliases: price, rating, shipping, returns, origin/country, merchant. Unknown axes (e.g. battery, weight, material, features) render as a free-form row pulled from product description/specs.',
      },
    },
    required: ['ids'],
    additionalProperties: false,
  },
  parseArgs(raw) {
    return argsSchema.parse(raw);
  },
  async execute(args, ctx) {
    if (ctx.signal.aborted) throw new Error('aborted');

    const cacheKey = stableKey(['compare_products', [...args.ids].sort()]);
    const cached = ctx.cache.get<NormalizedProduct[]>(cacheKey);
    let products: NormalizedProduct[];
    if (cached) {
      products = cached;
    } else {
      // Catalog reconcile (2026-05-13): switched from N parallel `get_product`
      // round-trips to a single `lookup_catalog` call. Shopify exposes this as
      // `dev.ucp.shopping.catalog.lookup` and returns up to 10 products per
      // request (we cap at 6 already via the args schema). Saves N-1 HTTP
      // hops on every compare, and missing IDs come back gracefully as
      // `messages` entries rather than throws — `lookupCatalog` surfaces them
      // via the `missing` array, which we log for observability.
      // R3-cleanup (architect-code LOW): thread `ctx.log` for MCP retry visibility.
      const { products: fetched, missing } = await lookupCatalog(args.ids, {
        signal: ctx.signal,
        log: ctx.log,
      });
      if (missing.length > 0) {
        ctx.log.warn(
          { tool: 'compare_products', missing, requested: args.ids.length },
          'compare_products: lookup_catalog returned partial result',
        );
      }
      products = fetched;
      ctx.cache.set(cacheKey, products);
    }

    const chipped = products.map((p) => ({
      ...p,
      reasoningChips: computeChips(p, ctx.preferences),
    }));

    const axes = args.axes && args.axes.length > 0 ? args.axes : [...DEFAULT_AXES];
    return { products: chipped, axes };
  },
  toEvents(args, result, { toolCallId }) {
    const events = [
      {
        type: 'comparison' as const,
        toolCallId,
        products: result.products,
        axes: result.axes,
      },
    ];
    const summary = result.products
      .map((p) => `- ${p.id}: ${p.title} ($${p.price.toFixed(2)} ${p.currency})`)
      .join('\n');
    const assistantString = `Comparing ${result.products.length} product(s) on axes [${result.axes.join(', ')}]:\n${summary}\n\nThe comparison table has been rendered for the user.`;
    return { events, assistantString };
  },
};
