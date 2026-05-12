import { z } from 'zod';
import { getProduct } from '../catalog.js';
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
  'Compare 2–6 products side-by-side along a set of axes (defaults: price, rating, shipping). Fans out parallel `get_product_details` calls and returns a comparison table that the UI renders inline. Use when the user asks "which one is better" or "compare X and Y".';

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
        description: 'Optional comparison axes. Defaults to price, rating, shipping.',
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
      const fetched = await Promise.all(
        args.ids.map((id) => getProduct(id, { signal: ctx.signal })),
      );
      products = fetched.filter((p): p is NormalizedProduct => p !== null);
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
