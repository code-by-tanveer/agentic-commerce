import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import { Cache } from '../cache.js';
import type { NormalizedProduct } from '../../types/product.js';
import type { ToolContext, PreferencesSnapshot } from '../../types/tool.js';

// Test focuses on the orchestration logic of `recommend_outfit`:
//   - Anchor product resolves via `get_product`.
//   - Complementary category fan-out shape.
//   - Graceful `anchor_not_found` / `no_complementary_categories` paths.
//   - Bundle rationale doesn't claim "all ship from <empty>" when the
//     anchor merchant is empty.
//   - Result event shape conforms to the BE→FE outfit schema (rationales
//     parallel to items).

vi.mock('../catalog.js', () => ({
  getProduct: vi.fn(),
  searchCatalog: vi.fn(),
  lookupCatalog: vi.fn(),
}));

const { getProduct, searchCatalog } = await import('../catalog.js');
const { recommendOutfitTool } = await import('./recommendOutfit.js');

const mockGetProduct = vi.mocked(getProduct);
const mockSearchCatalog = vi.mocked(searchCatalog);

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

function product(
  id: string,
  title: string,
  overrides: Partial<NormalizedProduct> = {},
): NormalizedProduct {
  return {
    id,
    upid: id,
    title,
    description: 'fixture',
    images: [],
    price: 100,
    currency: 'USD',
    merchant: 'Acme',
    checkoutUrl: `https://example.com/${id}`,
    reasoningChips: [],
    merchantInfo: { name: 'Acme' },
    ...overrides,
  };
}

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
  mockGetProduct.mockReset();
  mockSearchCatalog.mockReset();
});

describe('recommend_outfit', () => {
  it('returns anchor_not_found when the anchor product fails to resolve', async () => {
    mockGetProduct.mockResolvedValueOnce(null);
    const args = recommendOutfitTool.parseArgs({
      anchor_product_id: 'gid://shopify/p/missing',
    });
    const result = await recommendOutfitTool.execute(args, makeCtx());

    expect(result).toMatchObject({
      ok: false,
      error: 'anchor_not_found',
      anchorProductId: 'gid://shopify/p/missing',
    });
    expect(mockSearchCatalog).not.toHaveBeenCalled();

    const { events, assistantString } = recommendOutfitTool.toEvents(args, result, {
      toolCallId: 'call_a',
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'tool_status', status: 'error' });
    expect(assistantString).toContain('anchor_not_found');
  });

  it('returns no_complementary_categories when the anchor has no taxonomy hit', async () => {
    // Title that won't match any rule in outfitCategories.ts.
    mockGetProduct.mockResolvedValueOnce(
      product('gid://shopify/p/odd', 'mystery bracket assembly', {
        description: '',
        merchantTags: [],
      }),
    );
    const args = recommendOutfitTool.parseArgs({
      anchor_product_id: 'gid://shopify/p/odd',
    });
    const result = await recommendOutfitTool.execute(args, makeCtx());

    expect(result).toMatchObject({
      ok: false,
      error: 'no_complementary_categories',
    });
    // No fan-out search calls when categories is empty.
    expect(mockSearchCatalog).not.toHaveBeenCalled();
  });

  it('fans out to complementary categories and emits an outfit event with parallel rationales', async () => {
    const anchor = product('gid://shopify/p/sweater', 'merino wool sweater', {
      description: 'soft merino',
      merchant: 'Wovens Co',
    });
    mockGetProduct.mockResolvedValueOnce(anchor);
    // Sweater → ['bottoms', 'shoes'] per outfitCategories rules.
    mockSearchCatalog
      .mockResolvedValueOnce([
        product('gid://shopify/p/jeans', 'classic jeans', { merchant: 'Wovens Co' }),
        product('gid://shopify/p/chinos', 'chinos', { merchant: 'OtherCo' }),
      ])
      .mockResolvedValueOnce([
        product('gid://shopify/p/boots', 'lace-up boots', { merchant: 'Wovens Co' }),
      ]);

    const args = recommendOutfitTool.parseArgs({
      anchor_product_id: 'gid://shopify/p/sweater',
    });
    const result = await recommendOutfitTool.execute(args, makeCtx());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.items.length).toBeGreaterThan(0);

    // Two fan-out calls (bottoms + shoes).
    expect(mockSearchCatalog).toHaveBeenCalledTimes(2);
    expect(mockSearchCatalog.mock.calls.map((c) => c[0])).toEqual([
      'bottoms',
      'shoes',
    ]);

    const { events } = recommendOutfitTool.toEvents(args, result, {
      toolCallId: 'call_outfit',
    });
    expect(events).toHaveLength(1);
    const ev = events[0];
    if (ev.type !== 'outfit') throw new Error('expected outfit event');
    expect(ev.items.length).toBe(result.items.length);
    expect(ev.rationales).toBeDefined();
    expect(ev.rationales).toHaveLength(ev.items.length);
    // The item-shaped event entries must NOT carry a `rationale` field
    // (that lives on the parallel array). The element type is plain
    // NormalizedProduct — defended in toEvents.
    for (const item of ev.items as Array<Record<string, unknown>>) {
      expect(item).not.toHaveProperty('rationale');
    }
  });

  it('does not claim "all pieces ship from <empty>" when anchor merchant is blank', async () => {
    // Regression: prior bundle rationale builder treated an empty-string
    // anchor merchant as a valid "all from <empty>" claim, since
    // `merchantSet.has('')` returned true when every item also had an
    // empty merchant. Now guarded by `Boolean(anchor.merchant)`.
    const anchor = product('gid://shopify/p/anchor', 'merino sweater', {
      merchant: '',
    });
    mockGetProduct.mockResolvedValueOnce(anchor);
    mockSearchCatalog
      .mockResolvedValueOnce([
        product('gid://shopify/p/x', 'jeans', { merchant: '' }),
      ])
      .mockResolvedValueOnce([
        product('gid://shopify/p/y', 'boots', { merchant: '' }),
      ]);

    const args = recommendOutfitTool.parseArgs({
      anchor_product_id: 'gid://shopify/p/anchor',
    });
    const result = await recommendOutfitTool.execute(args, makeCtx());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.rationale).not.toMatch(/ship from \./);
    expect(result.rationale).not.toMatch(/ship from\s+\./);
  });
});
