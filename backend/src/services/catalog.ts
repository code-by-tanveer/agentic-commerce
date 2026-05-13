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
  // Shopify's Catalog MCP returns -32603 ("An unexpected error occurred")
  // on ANY value of `filters.ships_to`, regardless of country code (verified
  // 2026-05-13: US/GB/DE/FR/IN/JP/CA all error). The field is in the spec but
  // unimplemented on Shopify's side. We rely entirely on the post-fetch JS
  // filter below (against `merchantInfo.shipsTo`) for ships-to handling — the
  // belt-and-braces upstream filter was, in practice, only-braces.
  const filters: Record<string, unknown> = {
    available: opts.filters?.available ?? true,
  };

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

/**
 * Catalog reconcile (2026-05-13): the Shopify Catalog MCP exposes a
 * `lookup_catalog` tool (capability `dev.ucp.shopping.catalog.lookup`) that
 * resolves multiple product IDs in a single round-trip. Verified live against
 * `https://catalog.shopify.com/api/ucp/mcp`:
 *
 *   - Input shape: `{ catalog: { ids: string[] } }`, `ids` is a `gid://` array
 *     (max 10 per the tool's `inputSchema.catalog.ids.maxItems`).
 *   - Output shape: `structuredContent.products: RawProduct[]` — the same
 *     element shape `search_catalog` ships, so `extractProducts` already
 *     handles unwrapping.
 *   - Partial failure: missing IDs are NOT thrown — instead they surface as
 *     `structuredContent.messages[{type:'info', code:'not_found', content:id}]`
 *     entries while the successful IDs still come back in `products[]`. The
 *     top-level `ucp.status` stays `success`. Caller decides what to do.
 *
 * Returns ordered products keyed by the input array, plus the subset of
 * `ids` that did NOT resolve. The order pairing keeps comparison UIs
 * deterministic ("column 1 is the first id you asked for"); products that
 * the MCP returns but we didn't ask for (shouldn't happen, but defend) are
 * appended at the end of `products`. Inputs > 10 are batched.
 */
export async function lookupCatalog(
  ids: string[],
  opts: { signal?: AbortSignal; log?: FastifyBaseLogger } = {},
): Promise<{ products: NormalizedProduct[]; missing: string[] }> {
  const out: NormalizedProduct[] = [];
  const found = new Map<string, NormalizedProduct>();

  // Shopify caps `ids` at 10 per call — chunk transparently so callers can
  // pass up to `compare_products`' 6 today (well under the cap), but the
  // batching is in place for future growth.
  const CHUNK = 10;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const result = await callTool(
      'lookup_catalog',
      {
        catalog: { ids: chunk },
      },
      { signal: opts.signal, log: opts.log },
    );
    for (const raw of extractProducts(result)) {
      const normalized = normalizeProduct(raw);
      // `extractProducts` already understands `structuredContent.products` —
      // see normalize.ts. Index by both the normalized id and the upid
      // because Shopify echoes the requested `gid://` form on responses.
      if (normalized.id) found.set(normalized.id, normalized);
      if (normalized.upid && normalized.upid !== normalized.id) {
        found.set(normalized.upid, normalized);
      }
    }
  }

  const missing: string[] = [];
  for (const id of ids) {
    const hit = found.get(id);
    if (hit) {
      out.push(hit);
      // Remove so we can detect server-returned-but-not-requested at the end.
      found.delete(hit.id);
      if (hit.upid) found.delete(hit.upid);
    } else {
      missing.push(id);
    }
  }
  // Defensive: any extras the server returned that we didn't recognise get
  // appended verbatim. In practice `found` should be empty here.
  for (const extra of found.values()) {
    if (!out.includes(extra)) out.push(extra);
  }
  return { products: out, missing };
}
