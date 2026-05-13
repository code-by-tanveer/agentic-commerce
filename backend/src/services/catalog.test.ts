import { describe, expect, it, vi, beforeEach } from 'vitest';

// Catalog reconcile (2026-05-13): asserts the `lookupCatalog` wrapper added in
// this cycle correctly unwraps Shopify's `structuredContent.products` shape,
// preserves input ordering for caller determinism, surfaces `not_found` IDs
// via the `missing` array, and batches inputs over Shopify's max-10 cap.
//
// Captured responses mirror live curl probes against
// `https://catalog.shopify.com/api/ucp/mcp` on 2026-05-13. If Shopify changes
// the envelope (e.g. moves `products` out from under `structuredContent`),
// these tests catch it before users see a silent empty result.

vi.mock('./mcpClient.js', () => ({
  callTool: vi.fn(),
}));

const { callTool } = await import('./mcpClient.js');
const { lookupCatalog } = await import('./catalog.js');

const mockCallTool = vi.mocked(callTool);

beforeEach(() => {
  mockCallTool.mockReset();
});

const productFixture = (id: string, title: string): Record<string, unknown> => ({
  id,
  title,
  description: 'fixture',
  variants: [
    {
      id: `${id}-v1`,
      title: 'default',
      price: { amount: 99, currency: 'USD' },
      available: true,
      checkout_url: `https://example.com/checkout/${id}`,
    },
  ],
});

describe('lookupCatalog', () => {
  it('unwraps structuredContent.products and preserves request order', async () => {
    const ids = [
      'gid://shopify/p/AAA',
      'gid://shopify/p/BBB',
      'gid://shopify/p/CCC',
    ];
    mockCallTool.mockResolvedValueOnce({
      structuredContent: {
        ucp: { status: 'success' },
        // Note the deliberate reorder — server returns BBB, AAA, CCC. Our
        // wrapper must re-pair against the input id list.
        products: [
          productFixture('gid://shopify/p/BBB', 'B item'),
          productFixture('gid://shopify/p/AAA', 'A item'),
          productFixture('gid://shopify/p/CCC', 'C item'),
        ],
        messages: [],
      },
    });

    const { products, missing } = await lookupCatalog(ids);

    expect(missing).toEqual([]);
    expect(products.map((p) => p.id)).toEqual(ids);
    expect(products.map((p) => p.title)).toEqual(['A item', 'B item', 'C item']);

    // Confirm the wire shape: one MCP call with `lookup_catalog` and the ids.
    expect(mockCallTool).toHaveBeenCalledOnce();
    expect(mockCallTool.mock.calls[0][0]).toBe('lookup_catalog');
    expect(mockCallTool.mock.calls[0][1]).toEqual({ catalog: { ids } });
  });

  it('reports missing ids when Shopify returns a partial result', async () => {
    const ids = ['gid://shopify/p/AAA', 'gid://shopify/p/NOPE'];
    mockCallTool.mockResolvedValueOnce({
      structuredContent: {
        ucp: { status: 'success' },
        products: [productFixture('gid://shopify/p/AAA', 'A item')],
        messages: [
          { type: 'info', code: 'not_found', content: 'gid://shopify/p/NOPE' },
        ],
      },
    });

    const { products, missing } = await lookupCatalog(ids);

    expect(products).toHaveLength(1);
    expect(products[0].id).toBe('gid://shopify/p/AAA');
    expect(missing).toEqual(['gid://shopify/p/NOPE']);
  });

  it('chunks ids >10 into multiple lookup_catalog calls', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `gid://shopify/p/P${i}`);
    mockCallTool
      .mockResolvedValueOnce({
        structuredContent: {
          products: ids
            .slice(0, 10)
            .map((id, i) => productFixture(id, `T${i}`)),
        },
      })
      .mockResolvedValueOnce({
        structuredContent: {
          products: ids.slice(10).map((id, i) => productFixture(id, `T${10 + i}`)),
        },
      });

    const { products, missing } = await lookupCatalog(ids);

    expect(mockCallTool).toHaveBeenCalledTimes(2);
    expect((mockCallTool.mock.calls[0][1] as { catalog: { ids: string[] } }).catalog.ids).toHaveLength(10);
    expect((mockCallTool.mock.calls[1][1] as { catalog: { ids: string[] } }).catalog.ids).toHaveLength(2);
    expect(products).toHaveLength(12);
    expect(missing).toEqual([]);
    expect(products.map((p) => p.id)).toEqual(ids);
  });

  it('returns an empty missing array when called with no ids', async () => {
    const { products, missing } = await lookupCatalog([]);
    expect(products).toEqual([]);
    expect(missing).toEqual([]);
    expect(mockCallTool).not.toHaveBeenCalled();
  });
});
