import { describe, expect, it } from 'vitest';
import { computeChips } from './reasoning.js';
import type { NormalizedProduct } from '../types/product.js';
import type { PreferencesSnapshot } from '../types/tool.js';

// Architect Top-5 #2 — pure rules-engine fixture tests for the reasoning chip
// computation. No DB, no MCP, no I/O — every case is a synchronous fixture.

function product(overrides: Partial<NormalizedProduct> = {}): NormalizedProduct {
  return {
    id: 'p1',
    title: 'Product',
    description: '',
    images: [],
    price: 100,
    currency: 'USD',
    merchant: 'Acme',
    checkoutUrl: '',
    reasoningChips: [],
    ...overrides,
  };
}

function prefs(entries: Record<string, unknown>): PreferencesSnapshot {
  const out: Record<string, { value: unknown; source: 'user'; updatedAt: string }> = {};
  for (const [k, v] of Object.entries(entries)) {
    out[k] = { value: v, source: 'user', updatedAt: '2026-01-01T00:00:00Z' };
  }
  return out as PreferencesSnapshot;
}

describe('computeChips', () => {
  it('returns no chips when prefs and product are empty', () => {
    expect(computeChips(product(), {} as PreferencesSnapshot)).toEqual([]);
  });

  describe('size_match', () => {
    it('emits size_match when prefs.size matches a variant.options.size', () => {
      const p = product({
        variants: [
          {
            id: 'v1',
            title: 'V',
            price: 100,
            currency: 'USD',
            available: true,
            checkoutUrl: '',
            options: { size: '8' },
          },
        ],
      });
      const chips = computeChips(p, prefs({ size: '8' }));
      const match = chips.find((c) => c.kind === 'size_match');
      expect(match).toBeDefined();
      expect(match?.label.toLowerCase()).toContain('size 8 match');
    });

    it('matches case-insensitively', () => {
      const p = product({
        variants: [
          {
            id: 'v1',
            title: 'V',
            price: 100,
            currency: 'USD',
            available: true,
            checkoutUrl: '',
            options: { size: 'M' },
          },
        ],
      });
      // pref is upper, variant is upper — should still match via lowercase fold.
      const chips = computeChips(p, prefs({ size: 'm' }));
      expect(chips.some((c) => c.kind === 'size_match')).toBe(true);

      // And inversely: pref lower, variant upper.
      const p2 = product({
        variants: [
          {
            id: 'v1',
            title: 'V',
            price: 100,
            currency: 'USD',
            available: true,
            checkoutUrl: '',
            options: { Size: 'L' }, // capital `S`-key
          },
        ],
      });
      const chips2 = computeChips(p2, prefs({ size: 'l' }));
      expect(chips2.some((c) => c.kind === 'size_match')).toBe(true);
    });
  });

  describe('discount', () => {
    it('emits discount when compareAtPrice yields >=15% off', () => {
      const p = product({ price: 70, compareAtPrice: 100 }); // 30% off
      const chips = computeChips(p, {} as PreferencesSnapshot);
      expect(chips.some((c) => c.kind === 'discount')).toBe(true);
    });

    it('does NOT emit discount below the 15% floor', () => {
      const p = product({ price: 70, compareAtPrice: 75 }); // 6.7% off
      const chips = computeChips(p, {} as PreferencesSnapshot);
      expect(chips.some((c) => c.kind === 'discount')).toBe(false);
    });
  });

  describe('price (warning)', () => {
    it('emits price chip when product.price exceeds prefs.budget.max', () => {
      const p = product({ price: 80 });
      const chips = computeChips(p, prefs({ budget: { max: 50 } }));
      const priceChip = chips.find((c) => c.kind === 'price');
      expect(priceChip).toBeDefined();
      expect(priceChip?.tone).toBe('warning');
    });
  });

  describe('shipping', () => {
    it('emits shipping when prefs.ships_to is covered by a variant.shipsTo region', () => {
      const p = product({
        variants: [
          {
            id: 'v1',
            title: 'V',
            price: 100,
            currency: 'USD',
            available: true,
            checkoutUrl: '',
            shipsTo: ['GB', 'FR'],
          },
        ],
      });
      const chips = computeChips(p, prefs({ ships_to: 'GB' }));
      expect(chips.some((c) => c.kind === 'shipping')).toBe(true);
    });
  });

  describe('ships_to_match (Round-5 merchantInfo.shipsTo)', () => {
    // Round 5 polish (T4.A): the new chip reads merchant-level destination
    // lists (the surface where Shopify metafields actually publish ships-to)
    // and sits between fast_shipping and ethics in the rank.
    it('emits ships_to_match when merchantInfo.shipsTo includes prefs.ships_to', () => {
      const p = product({
        merchantInfo: { name: 'Acme', shipsTo: ['US', 'CA', 'GB'] },
      });
      const chips = computeChips(p, prefs({ ships_to: 'GB' }));
      const match = chips.find((c) => c.kind === 'ships_to_match');
      expect(match).toBeDefined();
      expect(match?.label).toBe('Ships to GB');
      expect(match?.tone).toBe('positive');
    });

    it('matches case-insensitively (lower-case pref against upper-case list)', () => {
      const p = product({
        merchantInfo: { name: 'Acme', shipsTo: ['US', 'DE'] },
      });
      const chips = computeChips(p, prefs({ ships_to: 'de' }));
      expect(chips.some((c) => c.kind === 'ships_to_match')).toBe(true);
    });

    it('does NOT emit when merchantInfo.shipsTo is absent (graceful-degrade)', () => {
      const p = product({ merchantInfo: { name: 'Acme' } });
      const chips = computeChips(p, prefs({ ships_to: 'GB' }));
      expect(chips.some((c) => c.kind === 'ships_to_match')).toBe(false);
    });

    it('does NOT emit on explicit mismatch', () => {
      const p = product({
        merchantInfo: { name: 'Acme', shipsTo: ['US', 'CA'] },
      });
      const chips = computeChips(p, prefs({ ships_to: 'GB' }));
      expect(chips.some((c) => c.kind === 'ships_to_match')).toBe(false);
    });
  });

  describe('fast_shipping', () => {
    it("emits fast_shipping when merchantInfo.shippingDays parses to <=3 days ('2-3 days')", () => {
      const p = product({
        merchantInfo: { name: 'Acme', shippingDays: '2-3 days' },
      });
      const chips = computeChips(p, {} as PreferencesSnapshot);
      expect(chips.some((c) => c.kind === 'fast_shipping')).toBe(true);
    });

    it("does NOT emit fast_shipping for '7-10 days'", () => {
      const p = product({
        merchantInfo: { name: 'Acme', shippingDays: '7-10 days' },
      });
      const chips = computeChips(p, {} as PreferencesSnapshot);
      expect(chips.some((c) => c.kind === 'fast_shipping')).toBe(false);
    });
  });

  describe('ethics (Round-2 synonym taxonomy)', () => {
    // The Round-2 polish replaced the free-text ethics chip with a closed
    // vocabulary (`ETHICS_VALUES`) plus per-value synonym lists
    // (`ETHICS_SYNONYMS`). Substring matching is case-insensitive so a
    // merchant tag like 'GOTS-certified-organic' fires the `'organic'` value
    // via the `'organic'` / `'gots'` synonyms.
    it('emits ethics for an exact synonym hit', () => {
      const p = product({ merchantTags: ['vegan'] });
      const chips = computeChips(p, prefs({ ethics: ['vegan'] }));
      const ethics = chips.find((c) => c.kind === 'ethics');
      expect(ethics).toBeDefined();
      expect(ethics?.label).toBe('Matches vegan');
    });

    it("emits ethics via a synonym substring ('gots' → 'organic')", () => {
      const p = product({ merchantTags: ['GOTS-certified-organic'] });
      const chips = computeChips(p, prefs({ ethics: ['organic'] }));
      expect(chips.some((c) => c.kind === 'ethics')).toBe(true);
    });

    it('accepts ethics as a single string OR an array', () => {
      const p = product({ merchantTags: ['vegan'] });
      // String form.
      expect(
        computeChips(p, prefs({ ethics: 'vegan' })).some((c) => c.kind === 'ethics'),
      ).toBe(true);
      // Array form.
      expect(
        computeChips(p, prefs({ ethics: ['vegan'] })).some((c) => c.kind === 'ethics'),
      ).toBe(true);
    });

    it('does NOT emit ethics for a non-vocabulary value', () => {
      const p = product({ merchantTags: ['carbon-neutral'] });
      // 'carbon-neutral' isn't in ETHICS_VALUES — should be filtered out.
      expect(
        computeChips(p, prefs({ ethics: ['carbon-neutral'] })).some(
          (c) => c.kind === 'ethics',
        ),
      ).toBe(false);
    });
  });

  describe('ranking and cap', () => {
    it('returns chips ordered by RANK and caps at MAX_CHIPS = 4', () => {
      // Build a product + prefs that fire ALL 6 rules.
      const p = product({
        price: 80,
        compareAtPrice: 200, // 60% off → discount
        merchantInfo: { name: 'Acme', shippingDays: '1-2 days' }, // fast_shipping
        merchantTags: ['vegan'],
        variants: [
          {
            id: 'v1',
            title: 'V',
            price: 80,
            currency: 'USD',
            available: true,
            checkoutUrl: '',
            options: { size: 'M' },
            shipsTo: ['GB'],
          },
        ],
      });
      const chips = computeChips(
        p,
        prefs({
          size: 'M',
          budget: { max: 50 },
          ships_to: 'GB',
          ethics: ['vegan'],
        }),
      );

      // MAX_CHIPS = 4
      expect(chips.length).toBe(4);

      // RANK order (Round-5): size_match=0, discount=1, price=2,
      // fast_shipping=3, ships_to_match=4, ethics=5, shipping=6. The fixture
      // doesn't set merchantInfo.shipsTo so ships_to_match doesn't fire;
      // top-4 by rank: size_match, discount, price, fast_shipping (shipping
      // + ethics are sliced off the tail).
      expect(chips.map((c) => c.kind)).toEqual([
        'size_match',
        'discount',
        'price',
        'fast_shipping',
      ]);
    });
  });
});
