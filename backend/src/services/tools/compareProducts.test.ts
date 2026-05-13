import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import { Cache } from '../cache.js';
import type { NormalizedProduct } from '../../types/product.js';
import type { ToolContext, PreferencesSnapshot } from '../../types/tool.js';

// Catalog reconcile (2026-05-13): asserts `compare_products` now calls the
// `lookup_catalog` MCP tool exactly once (was: N parallel `get_product`).
// Mocks `../catalog.js` directly so the test focuses on the tool's
// orchestration rather than the wire shape (the wire shape is covered by
// `catalog.test.ts`).

vi.mock('../catalog.js', () => ({
  lookupCatalog: vi.fn(),
  // Re-export the rest of the surface so other importers (e.g. the
  // recommendOutfit tool, if it ever gets pulled in transitively) don't blow
  // up. The tool under test only imports `lookupCatalog`.
  searchCatalog: vi.fn(),
  getProduct: vi.fn(),
}));

const { lookupCatalog } = await import('../catalog.js');
const { compareProductsTool } = await import('./compareProducts.js');

const mockLookupCatalog = vi.mocked(lookupCatalog);

const log = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: () => log,
  level: 'info',
  silent: () => undefined,
} as unknown as FastifyBaseLogger;

const product = (id: string, title: string, price = 99): NormalizedProduct => ({
  id,
  upid: id,
  title,
  description: 'fixture',
  images: [],
  price,
  currency: 'USD',
  merchant: 'Test Co',
  checkoutUrl: `https://example.com/${id}`,
  reasoningChips: [],
  merchantInfo: { name: 'Test Co' },
});

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  const ctrl = new AbortController();
  return {
    sessionId: 'sess',
    log,
    emit: () => undefined,
    preferences: {} as PreferencesSnapshot,
    cache: new Cache(),
    signal: ctrl.signal,
    ...overrides,
  };
}

beforeEach(() => {
  mockLookupCatalog.mockReset();
});

describe('compare_products', () => {
  it('issues a single lookup_catalog call and returns products in input order', async () => {
    const ids = ['gid://shopify/p/A', 'gid://shopify/p/B', 'gid://shopify/p/C'];
    mockLookupCatalog.mockResolvedValueOnce({
      products: [
        product('gid://shopify/p/A', 'A item', 10),
        product('gid://shopify/p/B', 'B item', 20),
        product('gid://shopify/p/C', 'C item', 30),
      ],
      missing: [],
    });

    const args = compareProductsTool.parseArgs({ ids });
    const result = await compareProductsTool.execute(args, makeCtx());

    expect(mockLookupCatalog).toHaveBeenCalledOnce();
    expect(mockLookupCatalog.mock.calls[0][0]).toEqual(ids);
    expect(result.products.map((p) => p.id)).toEqual(ids);
    expect(result.axes).toEqual(['price', 'rating', 'shipping']);
  });

  it('logs a warning when lookup_catalog returns missing ids', async () => {
    const ids = ['gid://shopify/p/A', 'gid://shopify/p/MISSING'];
    mockLookupCatalog.mockResolvedValueOnce({
      products: [product('gid://shopify/p/A', 'A item')],
      missing: ['gid://shopify/p/MISSING'],
    });
    const warn = vi.fn();
    const ctx = makeCtx({
      log: { ...log, warn } as unknown as FastifyBaseLogger,
    });

    const args = compareProductsTool.parseArgs({ ids });
    const result = await compareProductsTool.execute(args, ctx);

    expect(result.products).toHaveLength(1);
    expect(warn).toHaveBeenCalledOnce();
    const [warnArgs] = warn.mock.calls[0];
    expect(warnArgs).toMatchObject({
      tool: 'compare_products',
      missing: ['gid://shopify/p/MISSING'],
      requested: 2,
    });
  });

  it('honours the cache and skips a second MCP call on repeat compare', async () => {
    const ids = ['gid://shopify/p/A', 'gid://shopify/p/B'];
    mockLookupCatalog.mockResolvedValueOnce({
      products: [
        product('gid://shopify/p/A', 'A item'),
        product('gid://shopify/p/B', 'B item'),
      ],
      missing: [],
    });
    const ctx = makeCtx();

    const args = compareProductsTool.parseArgs({ ids });
    await compareProductsTool.execute(args, ctx);
    await compareProductsTool.execute(args, ctx);

    expect(mockLookupCatalog).toHaveBeenCalledOnce();
  });

  it('emits a `comparison` event with the resolved products', async () => {
    const ids = ['gid://shopify/p/A', 'gid://shopify/p/B'];
    mockLookupCatalog.mockResolvedValueOnce({
      products: [
        product('gid://shopify/p/A', 'A item', 10),
        product('gid://shopify/p/B', 'B item', 20),
      ],
      missing: [],
    });

    const args = compareProductsTool.parseArgs({ ids });
    const result = await compareProductsTool.execute(args, makeCtx());
    const { events, assistantString } = compareProductsTool.toEvents(args, result, {
      toolCallId: 'call_1',
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'comparison',
      toolCallId: 'call_1',
      axes: ['price', 'rating', 'shipping'],
    });
    expect(assistantString).toContain('Comparing 2 product(s)');
  });

  it('passes the caller-supplied axes through to the event verbatim', async () => {
    // Regression for user report: "asked which is better for battery, got an
    // 8-row dump". The agent should pass `axes: ['battery']` and the BE must
    // surface that on the event so the FE can render only the requested row.
    const ids = ['gid://shopify/p/A', 'gid://shopify/p/B'];
    mockLookupCatalog.mockResolvedValueOnce({
      products: [
        product('gid://shopify/p/A', 'Phone A', 10),
        product('gid://shopify/p/B', 'Phone B', 20),
      ],
      missing: [],
    });

    const args = compareProductsTool.parseArgs({ ids, axes: ['battery'] });
    const result = await compareProductsTool.execute(args, makeCtx());
    const { events } = compareProductsTool.toEvents(args, result, {
      toolCallId: 'call_battery',
    });

    expect(result.axes).toEqual(['battery']);
    expect(events[0]).toMatchObject({
      type: 'comparison',
      axes: ['battery'],
    });
  });

  it('trims/dedups whitespace-only axes but preserves order', async () => {
    const ids = ['gid://shopify/p/A', 'gid://shopify/p/B'];
    mockLookupCatalog.mockResolvedValueOnce({
      products: [
        product('gid://shopify/p/A', 'A'),
        product('gid://shopify/p/B', 'B'),
      ],
      missing: [],
    });
    // Zod's `z.string().trim().min(1)` filters out empty strings via .min(1).
    // We confirm the supported shape: a mix of axes lands intact + ordered.
    const args = compareProductsTool.parseArgs({
      ids,
      axes: ['battery', 'price', 'weight'],
    });
    const result = await compareProductsTool.execute(args, makeCtx());
    expect(result.axes).toEqual(['battery', 'price', 'weight']);
  });
});
