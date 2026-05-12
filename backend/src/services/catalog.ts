import { callTool } from './mcpClient.js';
import { extractProduct, extractProducts, normalizeProduct } from './normalize.js';
import type { NormalizedProduct } from '../types/product.js';

export interface SearchCatalogFilters {
  ships_to?: string;
  available?: boolean;
}

export interface SearchCatalogOpts {
  filters?: SearchCatalogFilters;
  signal?: AbortSignal;
}

export async function searchCatalog(
  query: string,
  limit = 8,
  opts: SearchCatalogOpts = {},
): Promise<NormalizedProduct[]> {
  // Merge in caller-supplied filters. We always default `available: true`
  // unless the caller explicitly overrides it.
  const filters: Record<string, unknown> = {
    available: opts.filters?.available ?? true,
  };
  if (opts.filters?.ships_to) {
    filters.ships_to = opts.filters.ships_to;
  }

  const result = await callTool(
    'search_catalog',
    {
      catalog: {
        query,
        filters,
        limit,
      },
    },
    { signal: opts.signal },
  );
  return extractProducts(result).map(normalizeProduct);
}

export async function getProduct(
  id: string,
  opts: { signal?: AbortSignal } = {},
): Promise<NormalizedProduct | null> {
  const result = await callTool(
    'get_product',
    {
      catalog: { id },
    },
    { signal: opts.signal },
  );
  const raw = extractProduct(result);
  return raw ? normalizeProduct(raw) : null;
}
