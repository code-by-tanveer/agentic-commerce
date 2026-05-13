import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import { Cache } from '../cache.js';
import { _clearAll, _setClock } from '../taskPrefs.js';
import type { NormalizedProduct } from '../../types/product.js';
import type { ToolContext, PreferencesSnapshot } from '../../types/tool.js';

// 2026-05-13: assert the new `appliedFilters` field on emitted `products`
// events, plus the task-tier write-through into the in-memory scratchpad.
// The MCP layer is mocked at the `catalog.js` boundary, consistent with
// `compareProducts.test.ts`.

vi.mock('../catalog.js', () => ({
  searchCatalog: vi.fn(),
  getProduct: vi.fn(),
  lookupCatalog: vi.fn(),
}));

const { searchCatalog } = await import('../catalog.js');
const { searchCatalogTool } = await import('./searchCatalog.js');
const { getTaskPrefs } = await import('../taskPrefs.js');

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

const product = (id: string, title: string, price = 50): NormalizedProduct => ({
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

function makeCtx(
  overrides: Partial<ToolContext> & { sessionId?: string } = {},
): ToolContext {
  const ctrl = new AbortController();
  return {
    sessionId: overrides.sessionId ?? 'sess-1',
    log,
    emit: () => undefined,
    preferences: ({} as PreferencesSnapshot),
    cache: new Cache(),
    signal: ctrl.signal,
    ...overrides,
  };
}

let clock = 1_700_000_000_000;

beforeEach(() => {
  clock = 1_700_000_000_000;
  _setClock(() => clock);
  _clearAll();
  mockSearchCatalog.mockReset();
});

describe('search_catalog — appliedFilters event field', () => {
  it('emits appliedFilters with the LLM-supplied budget on the products event', async () => {
    mockSearchCatalog.mockResolvedValueOnce([
      product('p1', 'Cheap lamp', 12),
      product('p2', 'Pricier lamp', 14),
    ]);
    const args = searchCatalogTool.parseArgs({
      query: 'lamp',
      filters: { price: { max: 15 } },
    });
    const result = await searchCatalogTool.execute(args, makeCtx());
    const { events } = searchCatalogTool.toEvents(args, result, {
      toolCallId: 'call_1',
    });
    expect(events).toHaveLength(1);
    const evt = events[0] as {
      type: 'products';
      appliedFilters?: { budget?: { max?: number } };
    };
    expect(evt.type).toBe('products');
    expect(evt.appliedFilters).toEqual({ budget: { max: 15 } });
  });

  it('writes budget into the task scratchpad so subsequent turns can read it', async () => {
    mockSearchCatalog.mockResolvedValueOnce([product('p1', 'lamp', 12)]);
    const args = searchCatalogTool.parseArgs({
      query: 'lamp',
      filters: { price: { max: 15 } },
    });
    await searchCatalogTool.execute(args, makeCtx({ sessionId: 'live' }));
    const snap = getTaskPrefs('live') as { budget?: { max?: number } };
    expect(snap.budget).toEqual({ max: 15 });
  });

  it('clears task-tier budget on a topic shift between two searches (regression for the lamp→shoes bug)', async () => {
    mockSearchCatalog
      .mockResolvedValueOnce([product('p1', 'lamp', 12)])
      .mockResolvedValueOnce([
        product('p2', 'running shoe A', 80),
        product('p3', 'running shoe B', 120),
      ]);

    // Turn 1: "lamp under $15" — budget=15 lands in the scratchpad.
    const a1 = searchCatalogTool.parseArgs({
      query: 'lamp',
      filters: { price: { max: 15 } },
    });
    await searchCatalogTool.execute(a1, makeCtx({ sessionId: 'sess' }));
    expect((getTaskPrefs('sess') as { budget?: unknown }).budget).toBeDefined();

    // Turn 2: "running shoes" — the topic differs, so the prior budget
    // must NOT show up on appliedFilters and the agent must not silently
    // filter out the $80 / $120 results.
    const a2 = searchCatalogTool.parseArgs({ query: 'running shoes' });
    const r2 = await searchCatalogTool.execute(a2, makeCtx({ sessionId: 'sess' }));
    const { events } = searchCatalogTool.toEvents(a2, r2, { toolCallId: 'call_2' });
    const evt = events[0] as {
      appliedFilters?: { budget?: unknown };
    };
    expect(evt.appliedFilters?.budget).toBeUndefined();
    expect(r2.products).toHaveLength(2);
  });

  it('includes ships_to from identity-tier prefs when filters omit it', async () => {
    mockSearchCatalog.mockResolvedValueOnce([product('p1', 'sofa', 200)]);
    const args = searchCatalogTool.parseArgs({ query: 'sofa' });
    const result = await searchCatalogTool.execute(
      args,
      makeCtx({
        sessionId: 'sess',
        preferences: {
          ships_to: { value: 'IN', source: 'user', updatedAt: '2026-05-13' },
        },
      }),
    );
    const { events } = searchCatalogTool.toEvents(args, result, {
      toolCallId: 'call_ships',
    });
    const evt = events[0] as {
      appliedFilters?: { shipsTo?: string };
    };
    expect(evt.appliedFilters?.shipsTo).toBe('IN');
  });

  it('forwards LLM-supplied shipping_speed into both the task scratchpad and appliedFilters', async () => {
    mockSearchCatalog.mockResolvedValueOnce([product('p1', 'lamp', 12)]);
    const args = searchCatalogTool.parseArgs({
      query: 'lamp',
      filters: { shipping_speed: 'fast' },
    });
    const result = await searchCatalogTool.execute(args, makeCtx({ sessionId: 'sp' }));
    const { events } = searchCatalogTool.toEvents(args, result, {
      toolCallId: 'call_sp',
    });
    const evt = events[0] as {
      appliedFilters?: { shippingSpeed?: string };
    };
    expect(evt.appliedFilters?.shippingSpeed).toBe('fast');
    expect((getTaskPrefs('sp') as { shipping_speed?: string }).shipping_speed).toBe('fast');
  });
});
