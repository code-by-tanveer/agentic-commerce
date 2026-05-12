import { z } from 'zod';
import { getProduct } from '../catalog.js';
import { stableKey } from '../cache.js';
import { computeChips } from '../reasoning.js';
import type { NormalizedProduct } from '../../types/product.js';
import type { Tool } from '../../types/tool.js';

const argsSchema = z.object({
  id: z.string().trim().min(1),
});

export type GetProductDetailsArgs = z.infer<typeof argsSchema>;

export interface GetProductDetailsResult {
  product: NormalizedProduct | null;
}

const description =
  'Fetch full details for a single product by id from the Shopify catalog. Use after `search_catalog` to expand on one item the user is interested in. The result is rendered as a single inline product card.';

export const getProductDetailsTool: Tool<GetProductDetailsArgs, GetProductDetailsResult> = {
  name: 'get_product_details',
  description,
  emits: ['products'],
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Product id (UPID) returned by search_catalog.',
      },
    },
    required: ['id'],
    additionalProperties: false,
  },
  parseArgs(raw) {
    return argsSchema.parse(raw);
  },
  async execute(args, ctx) {
    const key = stableKey(['get_product_details', args.id]);
    const cached = ctx.cache.get<GetProductDetailsResult>(key);
    let product: NormalizedProduct | null;
    if (cached) {
      product = cached.product;
    } else {
      if (ctx.signal.aborted) throw new Error('aborted');
      product = await getProduct(args.id, { signal: ctx.signal });
      ctx.cache.set(key, { product });
    }

    if (product) {
      product = {
        ...product,
        reasoningChips: computeChips(product, ctx.preferences),
      };
    }
    return { product };
  },
  toEvents(args, result, { toolCallId }) {
    if (!result.product) {
      return {
        events: [
          {
            type: 'tool_status' as const,
            toolCallId,
            name: 'get_product_details',
            args,
            status: 'error' as const,
            errorMessage: 'product_not_found',
          },
        ],
        assistantString: JSON.stringify({ error: 'product_not_found', id: args.id }),
      };
    }
    const p = result.product;
    return {
      events: [
        {
          type: 'products' as const,
          toolCallId,
          query: p.title,
          products: [p],
        },
      ],
      assistantString: `Fetched product ${p.id}: ${p.title} ($${p.price.toFixed(2)} ${p.currency}, ${p.merchant}). It has been rendered as a card.`,
    };
  },
};
