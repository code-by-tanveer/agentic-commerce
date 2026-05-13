import { describe, expect, it } from 'vitest';
import { normalizeProduct } from './normalize.js';

// Architect Top-5 #1 — fixture-driven coverage of `normalize.ts`. The function
// is the only place where wire-shape catalog payloads cross into our internal
// types, so its tolerance for missing / inconsistent fields is the load-bearing
// invariant. These cases pin sensible defaults + drift-defence.

describe('normalizeProduct', () => {
  it('returns sensible defaults for an empty object', () => {
    const out = normalizeProduct({});
    expect(out).toMatchObject({
      title: 'Untitled product',
      price: 0,
      currency: 'USD',
      reasoningChips: [],
      merchant: 'Shopify Merchant',
      images: [],
      description: '',
      checkoutUrl: '',
    });
    // `variants` should be absent when no raw variants were supplied
    // (current impl: `variants.length ? variants : undefined`).
    expect(out.variants).toBeUndefined();
  });

  it('omits `variants` when raw has no variants; pulls price from price_range.min when provided', () => {
    const withRange = normalizeProduct({ price_range: { min: 42 } });
    expect(withRange.variants).toBeUndefined();
    expect(withRange.price).toBe(42);

    const empty = normalizeProduct({});
    expect(empty.variants).toBeUndefined();
    expect(empty.price).toBe(0);
  });

  it('treats empty media + undefined images as `images: []`', () => {
    const out = normalizeProduct({ media: [], images: undefined });
    expect(out.images).toEqual([]);
  });

  it('sets compareAtPrice when compare_at_price > price', () => {
    const out = normalizeProduct({ price: 70, compare_at_price: 100 });
    expect(out.compareAtPrice).toBe(100);

    // When compare_at_price is missing, the field should NOT be set
    // (Zod schema treats it as optional; the inferred type omits it).
    const noCompare = normalizeProduct({ price: 70 });
    expect(noCompare.compareAtPrice).toBeUndefined();
  });

  it('accepts merchant as a string OR an object with `name`', () => {
    const asString = normalizeProduct({ merchant: 'Acme' });
    expect(asString.merchant).toBe('Acme');

    const asObject = normalizeProduct({ merchant: { name: 'Acme' } });
    expect(asObject.merchant).toBe('Acme');
    expect(asObject.merchantInfo?.name).toBe('Acme');
  });

  it("normalizes variant.seller.ships_to from both string ('GB') and array (['GB','FR'])", () => {
    const single = normalizeProduct({
      variants: [{ id: 'v1', seller: { ships_to: 'GB' } }],
    });
    expect(single.variants?.[0]?.shipsTo).toEqual(['GB']);

    const multi = normalizeProduct({
      variants: [{ id: 'v1', seller: { ships_to: ['GB', 'FR'] } }],
    });
    expect(multi.variants?.[0]?.shipsTo).toEqual(['GB', 'FR']);
  });

  // Round 5 polish (T4.A): `shipsTo` reads from `ships_to` / `shipsTo` on
  // BOTH the raw product and the merchant blob; entries get upper-cased.
  it("reads merchantInfo.shipsTo from `ships_to` and `shipsTo`, upper-casing entries", () => {
    const snake = normalizeProduct({
      merchant: { name: 'M', ships_to: ['us', 'ca'] },
    });
    expect(snake.merchantInfo?.shipsTo).toEqual(['US', 'CA']);

    const camel = normalizeProduct({
      merchant: { name: 'M', shipsTo: ['gb', 'de'] },
    });
    expect(camel.merchantInfo?.shipsTo).toEqual(['GB', 'DE']);

    // Single string at product level → wrapped + upper-cased.
    const single = normalizeProduct({ merchant: { name: 'M' }, ships_to: 'fr' });
    expect(single.merchantInfo?.shipsTo).toEqual(['FR']);

    // Absence → undefined (graceful-degrade, no empty array).
    const none = normalizeProduct({ merchant: { name: 'M' } });
    expect(none.merchantInfo?.shipsTo).toBeUndefined();
  });

  // Round 5 polish (T4.W): `reviewCount` reads from `review_count` /
  // `reviewCount` / `n_reviews`; coerces to a non-negative integer.
  it('reads merchantInfo.reviewCount from review_count / reviewCount / n_reviews', () => {
    const snake = normalizeProduct({ merchant: { name: 'M', review_count: 42 } });
    expect(snake.merchantInfo?.reviewCount).toBe(42);

    const camel = normalizeProduct({ merchant: { name: 'M', reviewCount: '1280' } });
    expect(camel.merchantInfo?.reviewCount).toBe(1280);

    const n = normalizeProduct({ merchant: { name: 'M', n_reviews: 7 } });
    expect(n.merchantInfo?.reviewCount).toBe(7);

    // Negative / NaN drop.
    const bad = normalizeProduct({ merchant: { name: 'M', review_count: -3 } });
    expect(bad.merchantInfo?.reviewCount).toBeUndefined();
  });

  it('does not throw on a deliberately ragged raw payload', () => {
    // Mixed bag — should never throw, only fall back.
    expect(() =>
      normalizeProduct({
        title: 'X',
        price: 'not-a-number' as unknown as number,
        media: undefined,
        images: undefined,
        variants: [
          { id: 'v', price: { amount: 'NaN' } as unknown as { amount: number } },
        ],
        merchant: { name: 'M' },
      }),
    ).not.toThrow();
  });
});
