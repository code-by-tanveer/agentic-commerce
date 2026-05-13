import type { FastifyBaseLogger } from 'fastify';
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
  // R3-cleanup (architect-code LOW): optional logger threaded through to
  // `mcpClient.callTool` so retry attempts emit a `mcp retry` debug line.
  log?: FastifyBaseLogger;
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
    { signal: opts.signal, log: opts.log },
  );
  const products = extractProducts(result).map(normalizeProduct);

  // Round 5 polish (T4.L, persona-marcus): the MCP receives `filters.ships_to`
  // but we don't trust it to honour the filter — if it ignores the field a
  // user gets results they can't actually receive. Belt-and-braces post-filter
  // here. Critically, we ONLY drop products where `merchantInfo.shipsTo` is
  // present AND explicitly excludes the requested country. Products where
  // the merchant didn't publish a destination list are kept (the
  // graceful-degrade path — strict-filtering would slice too much). Case-
  // insensitive match against the upper-cased ISO code we normalise to.
  const wanted = opts.filters?.ships_to;
  if (wanted) {
    const target = wanted.trim().toUpperCase();
    if (target.length > 0) {
      return products.filter((p) => {
        const list = p.merchantInfo?.shipsTo;
        if (!Array.isArray(list) || list.length === 0) return true;
        return list.map((s) => s.toUpperCase()).includes(target);
      });
    }
  }
  return products;
}

export async function getProduct(
  id: string,
  opts: { signal?: AbortSignal; log?: FastifyBaseLogger } = {},
): Promise<NormalizedProduct | null> {
  const result = await callTool(
    'get_product',
    {
      catalog: { id },
    },
    // R3-cleanup (architect-code LOW): forward the logger to `callTool` so
    // retry observability lights up without the caller writing custom plumbing.
    { signal: opts.signal, log: opts.log },
  );
  const raw = extractProduct(result);
  return raw ? normalizeProduct(raw) : null;
}
