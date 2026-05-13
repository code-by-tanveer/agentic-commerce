import { describe, expect, it } from 'vitest';
import { extractProducts, normalizeProduct } from './normalize.js';

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

// ---------------------------------------------------------------------------
// Real Shopify Catalog MCP (UCP 2026-04-08) fixtures.
//
// These are verbatim copy-pastes from `curl https://catalog.shopify.com/api/ucp/mcp`
// (search_catalog tool, profile = the upstream UCP profile). Captured 2026-05-13.
// They pin every shape divergence between the wire and our prior assumed model:
//
//   1. `description: {plain}` not bare string
//   2. `price: {amount: <minor-units>, currency}` — integer cents, NOT dollars
//   3. `price_range: {min: MoneyV2, max: MoneyV2}` — wrappers around MoneyV2
//   4. `availability: {available: boolean}` — nested, not bare
//   5. Variant `options: [{name, label}]` — not `[{name, value}]`
//   6. Variant `url` (the canonical product page) — no separate `checkout_url`
//   7. No top-level product `url` — propagate from variants[0]
//   8. No merchant/seller/shop blob — must derive from variant URL host
//
// If Shopify ever changes the wire, refresh these fixtures and re-run.
// ---------------------------------------------------------------------------

describe('normalizeProduct — real Shopify fixtures', () => {
  it('desk lamp: parses MoneyV2 cents, variant URL becomes checkoutUrl + product url, merchant derives from host', () => {
    const raw = {
      id: 'gid://shopify/p/3lpAsimzbK80q4zN4ccM87',
      title: 'Lume Cube Edge Light 2.0 Black LED Desk Lamp',
      description: {
        plain:
          'A modern clamp-on LED desk lamp with edge-lit technology, adjustable brightness, and color temperature control for optimal focus and workspace ambiance.',
      },
      options: [
        { name: 'Color', values: [{ label: 'Black' }, { label: 'White' }] },
      ],
      media: [
        {
          type: 'image',
          url: 'https://cdn.shopify.com/s/files/1/0078/6628/6137/files/edge-light-2-0-lume-cube-led-desk-lamp_01.jpg',
          alt_text: 'Lume Cube Edge Light 2.0 LED Desk Lamp LC-EDGE2',
        },
      ],
      variants: [
        {
          id: 'gid://shopify/ProductVariant/42035779272761?shop=7866286137',
          title: 'Lume Cube Edge Light 2.0 Black LED Desk Lamp',
          url: 'https://lumecube.com/products/edge-light-2-0-black-led-desk-lamp?variant=42035779272761',
          price: { amount: 14999, currency: 'USD' },
          availability: { available: true },
          options: [{ name: 'Color', label: 'Black' }],
        },
        {
          id: 'gid://shopify/ProductVariant/42035774193721?shop=7866286137',
          title: 'Lume Cube Edge Light 2.0 White LED Desk Lamp',
          url: 'https://lumecube.com/products/edge-light-2-0-white-led-desk-lamp?variant=42035774193721',
          price: { amount: 14999, currency: 'USD' },
          availability: { available: true },
          options: [{ name: 'Color', label: 'White' }],
        },
      ],
      price_range: {
        min: { amount: 14999, currency: 'USD' },
        max: { amount: 14999, currency: 'USD' },
      },
    };

    const out = normalizeProduct(raw);

    // MoneyV2 cents → major units.
    expect(out.price).toBe(149.99);
    expect(out.currency).toBe('USD');

    // description.plain is unpacked.
    expect(out.description).toContain('clamp-on LED desk lamp');

    // Top-level product url propagated from first variant.
    expect(out.url).toBe(
      'https://lumecube.com/products/edge-light-2-0-black-led-desk-lamp?variant=42035779272761',
    );
    // checkoutUrl == variant.url for the first available variant.
    expect(out.checkoutUrl).toBe(
      'https://lumecube.com/products/edge-light-2-0-black-led-desk-lamp?variant=42035779272761',
    );

    // Variant availability extracted from `{available: true}` wrapper.
    expect(out.variants?.[0]?.available).toBe(true);

    // Variant options use `{name, label}` shape, not `{name, value}`.
    expect(out.variants?.[0]?.options).toEqual({ Color: 'Black' });
    expect(out.variants?.[1]?.options).toEqual({ Color: 'White' });

    // Variant price also normalized to major units.
    expect(out.variants?.[0]?.price).toBe(149.99);
    expect(out.variants?.[0]?.currency).toBe('USD');

    // Merchant derives from `lumecube.com` → "Lumecube".
    expect(out.merchant).toBe('Lumecube');

    // Image survives from `media[].url`.
    expect(out.images).toEqual([
      'https://cdn.shopify.com/s/files/1/0078/6628/6137/files/edge-light-2-0-lume-cube-led-desk-lamp_01.jpg',
    ]);
  });

  it('running shoes: multi-option variants (Color/Fit/Shoe size/Size) all survive verbatim', () => {
    const raw = {
      id: 'gid://shopify/p/1AnCOGcT8JmvQgupBNR9Cl',
      title: "Men's On Cloudrunner 2 (Clearance)",
      description: {
        plain:
          'Supportive, cushioned running shoes with recycled mesh and advanced comfort for every run.',
      },
      options: [
        {
          name: 'Color',
          values: [
            { label: 'White' },
            { label: 'White/Green (Final Sale)' },
            { label: 'Wolf/Ivory (Final Sale)' },
          ],
        },
        { name: 'Fit', values: [{ label: 'Regular' }, { label: 'Wide' }] },
        { name: 'Shoe size', values: [{ label: '8.5' }] },
        {
          name: 'Size',
          values: [{ label: '10.5' }, { label: '11' }, { label: '11.5' }, { label: '9' }],
        },
      ],
      media: [
        {
          type: 'image',
          url: 'https://cdn.shopify.com/s/files/1/0314/5200/4483/files/Screenshot_2025-12-07_at_1.43.41_PM.png',
          alt_text: "Men's On Cloudrunner 2 (Clearance)",
        },
      ],
      variants: [
        {
          id: 'gid://shopify/ProductVariant/46998510272725?shop=31452004483',
          title: "Men's On Cloudrunner 2 (Clearance)",
          url: 'https://commonwealthrunning.com/products/mens-on-cloudrunner-2?variant=46998510272725',
          price: { amount: 12495, currency: 'USD' },
          availability: { available: true },
          options: [
            { name: 'Fit', label: 'Regular' },
            { name: 'Color', label: 'White' },
            { name: 'Shoe size', label: '8.5' },
            { name: 'Size', label: '11' },
          ],
        },
        {
          id: 'gid://shopify/ProductVariant/46998510469333?shop=31452004483',
          title: "Men's On Cloudrunner 2 (Clearance)",
          url: 'https://commonwealthrunning.com/products/mens-on-cloudrunner-2?variant=46998510469333',
          price: { amount: 12495, currency: 'USD' },
          availability: { available: true },
          options: [
            { name: 'Fit', label: 'Regular' },
            { name: 'Color', label: 'White' },
            { name: 'Shoe size', label: '8.5' },
            { name: 'Size', label: '11.5' },
          ],
        },
      ],
      price_range: {
        min: { amount: 12495, currency: 'USD' },
        max: { amount: 12495, currency: 'USD' },
      },
    };

    const out = normalizeProduct(raw);

    // All four options survive on each variant (regression test: prior code
    // read `o.value` and dropped every Shopify variant option silently).
    expect(out.variants?.[0]?.options).toEqual({
      Fit: 'Regular',
      Color: 'White',
      'Shoe size': '8.5',
      Size: '11',
    });
    expect(out.variants?.[1]?.options).toEqual({
      Fit: 'Regular',
      Color: 'White',
      'Shoe size': '8.5',
      Size: '11.5',
    });

    // Different variants have different sizes (the reasoning-chip size match
    // path depends on this).
    expect(out.variants?.[0]?.options?.Size).toBe('11');
    expect(out.variants?.[1]?.options?.Size).toBe('11.5');

    // Price: 12495 cents → $124.95.
    expect(out.price).toBe(124.95);
    expect(out.variants?.[0]?.price).toBe(124.95);

    // Merchant derived from `commonwealthrunning.com` host.
    expect(out.merchant).toBe('Commonwealthrunning');
  });

  it('price_range.min MoneyV2 backs product price when no variants surface a price', () => {
    // Shopify can return a product with `price_range` but no individually-
    // priced variants in some lookups. Make sure the wrapper is unpacked to
    // major units (not left as integer cents).
    const out = normalizeProduct({
      id: 'p1',
      title: 'Vase',
      price_range: {
        min: { amount: 1800, currency: 'USD' },
        max: { amount: 2700, currency: 'USD' },
      },
    });
    expect(out.price).toBe(18);
    expect(out.currency).toBe('USD');
  });

  it('availability: {available: false} → variant.available === false', () => {
    const out = normalizeProduct({
      id: 'p1',
      variants: [
        {
          id: 'v1',
          price: { amount: 5000, currency: 'USD' },
          availability: { available: false },
        },
      ],
    });
    expect(out.variants?.[0]?.available).toBe(false);
  });

  it('JPY MoneyV2 (zero-decimal currency) is NOT divided by 100', () => {
    // ¥12,000 should display as ¥12,000 — dividing by 100 would print ¥120.
    const out = normalizeProduct({
      id: 'p1',
      variants: [
        {
          id: 'v1',
          price: { amount: 12000, currency: 'JPY' },
          availability: { available: true },
        },
      ],
    });
    expect(out.variants?.[0]?.price).toBe(12000);
    expect(out.variants?.[0]?.currency).toBe('JPY');
    expect(out.price).toBe(12000);
  });

  it('legacy flat-number price (`{price: 70}`) is treated as already-major-units', () => {
    // Back-compat: unit tests / older MCPs that ship a bare number should
    // pass through unchanged. We only divide when the input is an object
    // (Shopify MoneyV2 shape) AND the amount is a non-zero integer.
    const out = normalizeProduct({ price: 70 });
    expect(out.price).toBe(70);
  });

  it('extractProducts unwraps structuredContent.products from the real MCP envelope', () => {
    // The Shopify MCP wraps results in `result.structuredContent.products`.
    // Passing the inner `result` payload through `extractProducts` must
    // produce the products array unchanged.
    const wireEnvelope = {
      structuredContent: {
        ucp: { version: '2026-04-08', status: 'success' },
        products: [
          { id: 'a', title: 'A' },
          { id: 'b', title: 'B' },
        ],
      },
    };
    const out = extractProducts(wireEnvelope);
    expect(out).toHaveLength(2);
    expect(out[0]?.id).toBe('a');
  });
});
