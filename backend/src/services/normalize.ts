import type { MerchantInfo, NormalizedProduct, NormalizedVariant } from '../types/product.js';

interface RawMedia {
  url?: string;
  src?: string;
  image_url?: string;
  type?: string;
  alt_text?: string;
}

// Shopify Catalog MCP (UCP 2026-04-08) wraps prices in a MoneyV2-style object
// where `amount` is an integer in MINOR units (cents) — `{amount: 14999,
// currency: 'USD'}` means $149.99. We accept both that shape and the older
// generic shape (`{amount, currency}` with a float, or a bare number/string)
// so this module remains backward-compatible if Shopify ever changes the
// wire or a different MCP is plugged in. See `parseMoney` for the heuristic.
type RawMoney =
  | number
  | string
  | { amount?: number | string; currency?: string }
  | null
  | undefined;

interface RawVariant {
  id?: string;
  title?: string;
  sku?: string;
  price?: RawMoney;
  currency?: string;
  // Shopify ships `availability: {available: boolean}` (UCP 2026-04-08).
  // Pre-Shopify shapes used a bare boolean or a string ("in_stock"). Accept
  // all three so swapping MCPs doesn't churn this module.
  availability?: string | boolean | { available?: boolean };
  available?: boolean;
  checkout_url?: string;
  checkoutUrl?: string;
  // Shopify variant URL is the canonical product page (`…/products/slug?variant=…`).
  // No separate checkout-url field exists on the wire; we treat the variant
  // URL as both the merchant page link AND the checkout-url surface (FE deep-
  // links to it from card / comparison / outfit).
  url?: string;
  // Shopify variants carry their OWN `media[]` array — the per-variant image
  // (e.g. the white-on-navy Reebok Club C 85 shoe for the "white" Color
  // variant). Without capturing this, the card image stays pinned to the
  // product's first media when the user switches variants, so a "Black" pill
  // tap leaves a white shoe on screen. Verified on the live MCP.
  media?: RawMedia[];
  images?: Array<string | RawMedia>;
  // Shopify variant options are `[{name, label}]`, NOT `[{name, value}]`.
  // Both shapes are supported via `coerceOptionValue` (`label` is the
  // canonical field; `value` is retained for legacy callers / mocks).
  options?:
    | Record<string, unknown>
    | Array<{ name?: string; value?: unknown; label?: unknown }>;
  seller?: { name?: string; shop?: string; ships_to?: string | string[] };
}

interface RawMerchant {
  name?: string;
  shop?: string;
  rating?: number | string;
  // Round 5 polish (T4.W, persona-oscar): review count surfaces under
  // several Shopify-metafield spellings depending on the merchant — accept
  // all three and let `pickMerchantInfo` coerce to a non-negative integer.
  review_count?: number | string;
  reviewCount?: number | string;
  n_reviews?: number | string;
  returns_policy?: string;
  returnsPolicy?: string;
  shipping_days?: string;
  shippingDays?: string;
  carbon?: string;
  carbon_estimate?: string;
  tags?: string[];
  // Round 2 polish (T2.11, persona-sasha): merchants publish provenance under
  // several spellings depending on their Shopify metafield convention. We
  // accept the common four and let `pickOriginCountry` pick whichever the
  // upstream MCP actually populated.
  country_of_origin?: string;
  origin_country?: string;
  country?: string;
  made_in?: string;
  // Round 5 polish (T4.A): merchants publish destination country lists under
  // both snake- and camel-case in real Shopify metafields. Accept either; if
  // a merchant surfaces a single string ("US"), wrap it in `[string]` in
  // `pickShipsTo` before normalising case.
  ships_to?: string | string[];
  shipsTo?: string | string[];
}

interface RawProduct {
  id?: string;
  upid?: string;
  title?: string;
  name?: string;
  // Shopify ships `description: {plain: string, html?: string}`. Pre-Shopify
  // shapes used a bare string. Both supported.
  description?: string | { plain?: string; html?: string };
  url?: string;
  media?: RawMedia[];
  images?: Array<string | RawMedia>;
  // Shopify ships `price_range: {min: MoneyV2, max: MoneyV2}` where each side
  // is a `{amount: <minor-units>, currency}` object. We still accept the
  // older flat-number shape (`{min: 42, currency: 'USD'}`) for the unit
  // tests that pass synthetic data.
  price_range?: {
    min?: RawMoney;
    max?: RawMoney;
    currency?: string;
  };
  price?: RawMoney;
  compare_at_price?: RawMoney;
  compareAtPrice?: RawMoney;
  variants?: RawVariant[];
  seller?: RawMerchant;
  merchant?: string | RawMerchant;
  shop?: RawMerchant;
  tags?: string[];
  rating?: number | string;
  // Round 5 polish (T4.W): some MCPs surface review_count at product level.
  review_count?: number | string;
  reviewCount?: number | string;
  n_reviews?: number | string;
  returns_policy?: string;
  shipping_days?: string;
  carbon?: string;
  // Round 2 polish (T2.11): some MCPs surface country at product level rather
  // than merchant level (a single merchant ships goods made in multiple
  // countries). Accept both placements and prefer product-level if present.
  country_of_origin?: string;
  origin_country?: string;
  country?: string;
  made_in?: string;
  // Round 5 polish (T4.A): merchant-info `shipsTo` can be surfaced at
  // product level too — the MCP normalizes the merchant's destination list
  // onto each product. Accept both placements; product-level wins.
  ships_to?: string | string[];
  shipsTo?: string | string[];
}

// Currencies that do NOT use 2 decimal places (ISO-4217). Shopify's MoneyV2
// returns `amount` as an integer in MINOR units — so a JPY amount of `12000`
// is ¥12,000 (not ¥120.00) and must NOT be divided by 100. Anything not in
// this map is assumed to be 2-decimal (USD/EUR/GBP/CAD/AUD/CHF/SEK/…).
// Source: ISO-4217 currency exponent. Kept small; extend as needed.
const CURRENCY_DECIMALS: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  HUF: 0, // Shopify treats HUF as 0-decimal in MoneyV2.
  TWD: 0,
  BHD: 3,
  JOD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
};

// Heuristic: when Shopify ships a money object the `amount` is an integer in
// minor units (cents). When a unit-test or legacy MCP ships a flat number, it
// is already in major units. We can distinguish reliably because Shopify
// always wraps in `{amount, currency}` — so we ONLY divide by the currency
// exponent when the input was an object AND the value parses as an integer.
// A non-integer (`{amount: 14.99}`) is treated as already major-units.
function parseMoney(value: unknown): { amount: number; currency: string } {
  if (value == null) return { amount: 0, currency: 'USD' };
  if (typeof value === 'number') return { amount: value, currency: 'USD' };
  if (typeof value === 'string') {
    const n = Number(value);
    return { amount: Number.isFinite(n) ? n : 0, currency: 'USD' };
  }
  if (typeof value === 'object') {
    const v = value as { amount?: number | string; currency?: string };
    const rawAmount =
      typeof v.amount === 'number' ? v.amount : Number(v.amount ?? 0);
    if (!Number.isFinite(rawAmount)) {
      return { amount: 0, currency: v.currency ?? 'USD' };
    }
    const currency = v.currency ?? 'USD';
    // Shopify's MoneyV2 is integer minor units. If the parsed amount is a
    // non-zero integer (and currency has decimals), divide by 10^decimals
    // to get major units. A fractional amount (e.g. `{amount: 14.99}`) is a
    // legacy / test shape and is passed through unchanged.
    const decimals = CURRENCY_DECIMALS[currency.toUpperCase()] ?? 2;
    if (decimals > 0 && Number.isInteger(rawAmount) && rawAmount !== 0) {
      return { amount: rawAmount / Math.pow(10, decimals), currency };
    }
    return { amount: rawAmount, currency };
  }
  return { amount: 0, currency: 'USD' };
}

function pickImages(p: RawProduct): string[] {
  const out: string[] = [];
  for (const m of p.media ?? []) {
    const url = m.url ?? m.src ?? m.image_url;
    if (url) out.push(url);
  }
  for (const i of p.images ?? []) {
    if (typeof i === 'string') out.push(i);
    else if (i.url ?? i.src ?? i.image_url) out.push((i.url ?? i.src ?? i.image_url)!);
  }
  return Array.from(new Set(out));
}

function coerceOptionValue(val: unknown): string | undefined {
  // Shopify Catalog MCP (UCP 2026-04-08) ships variant options as nested
  // objects like `{Color: {label: "Black"}}` or `{Size: {value: {label: "8"}}}`,
  // not flat strings. Without coercion the products event fails Zod
  // (`options.Color: expected string, received object`) and 10+ real
  // products silently turn into an `event_validation_failed` error frame.
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (val && typeof val === 'object') {
    const o = val as Record<string, unknown>;
    if (typeof o.label === 'string') return o.label;
    if (typeof o.value === 'string') return o.value;
    if (typeof o.name === 'string') return o.name;
    if (o.label && typeof o.label === 'object') {
      const inner = (o.label as Record<string, unknown>).value ?? (o.label as Record<string, unknown>).label;
      if (typeof inner === 'string') return inner;
    }
    if (o.value && typeof o.value === 'object') {
      const inner = (o.value as Record<string, unknown>).label ?? (o.value as Record<string, unknown>).value;
      if (typeof inner === 'string') return inner;
    }
  }
  return undefined;
}

// Variant `availability` shape varies per MCP. Shopify Catalog MCP ships
// `{available: boolean}`; pre-Shopify shapes used a bare boolean or string
// ("in_stock" / "available"). All three are normalised to a single boolean.
function coerceAvailable(v: RawVariant): boolean {
  if (typeof v.available === 'boolean') return v.available;
  const a = v.availability;
  if (typeof a === 'boolean') return a;
  if (typeof a === 'string') return a === 'in_stock' || a === 'available';
  if (a && typeof a === 'object' && typeof a.available === 'boolean') {
    return a.available;
  }
  return false;
}

function normalizeVariant(v: RawVariant, fallbackCurrency: string): NormalizedVariant {
  const money = parseMoney(v.price);
  const opts: Record<string, string> = {};
  if (Array.isArray(v.options)) {
    for (const o of v.options) {
      if (!o || typeof o.name !== 'string') continue;
      // Shopify ships `{name, label}` per variant. Pre-Shopify mocks used
      // `{name, value}`. Try `label` first (the Shopify path), then `value`,
      // then the whole option entry (in case it's a nested object).
      const coerced =
        coerceOptionValue(o.label) ??
        coerceOptionValue(o.value) ??
        coerceOptionValue(o);
      if (coerced != null) opts[o.name] = coerced;
    }
  } else if (v.options && typeof v.options === 'object') {
    for (const [k, raw] of Object.entries(v.options as Record<string, unknown>)) {
      const coerced = coerceOptionValue(raw);
      if (coerced != null) opts[k] = coerced;
    }
  }
  const available = coerceAvailable(v);

  let shipsTo: string[] | undefined;
  const rawShipsTo = v.seller?.ships_to;
  if (Array.isArray(rawShipsTo)) {
    shipsTo = rawShipsTo.filter((s): s is string => typeof s === 'string');
  } else if (typeof rawShipsTo === 'string' && rawShipsTo.length > 0) {
    shipsTo = [rawShipsTo];
  }

  // Shopify variants carry the canonical product/variant page URL as `url`
  // (`…/products/slug?variant=…`). There is no separate `checkout_url` on
  // the wire — the variant URL deep-links into the merchant's PDP / cart and
  // is what the FE renders the "Buy" affordance against. Order of preference:
  // explicit `checkoutUrl` / `checkout_url` (legacy MCPs that surface a true
  // cart URL) → the Shopify `url` field → empty.
  const checkoutUrl =
    v.checkout_url ?? v.checkoutUrl ?? v.url ?? '';

  // Per-variant image list. Shopify ships `media[]` per variant; legacy MCPs
  // sometimes use `images[]` (string or {url} entries). De-dup, preserve order.
  const variantImages: string[] = [];
  for (const m of v.media ?? []) {
    const url = m.url ?? m.src ?? m.image_url;
    if (url && !variantImages.includes(url)) variantImages.push(url);
  }
  for (const i of v.images ?? []) {
    if (typeof i === 'string' && !variantImages.includes(i)) variantImages.push(i);
    else if (i && typeof i === 'object') {
      const url = i.url ?? i.src ?? i.image_url;
      if (url && !variantImages.includes(url)) variantImages.push(url);
    }
  }

  return {
    id: String(v.id ?? ''),
    title: v.title ?? v.sku ?? 'Variant',
    price: money.amount,
    currency: money.currency || fallbackCurrency,
    available,
    checkoutUrl,
    options: Object.keys(opts).length ? opts : undefined,
    shipsTo,
    images: variantImages.length ? variantImages : undefined,
  };
}

// Derive a human-friendly merchant name from the variant URL hostname when
// no explicit merchant/seller/shop blob is present in the wire. The Shopify
// Catalog MCP (UCP 2026-04-08) does NOT surface a shop name field — the only
// merchant identity that survives the wire is the host segment of
// `variant.url` (e.g. `lumecube.com`, `commonwealthrunning.com`). Falling
// back to the literal string "Shopify Merchant" — as we did before — meant
// every card said "Sold by Shopify Merchant", which is both inaccurate and
// useless to the shopper. We strip a leading `www.`, the TLD, and title-case
// the result. Unknowable cases still fall back to "Shopify Merchant".
function deriveMerchantFromUrl(url: string | undefined): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (!host) return undefined;
    const stripped = host.replace(/^www\./, '');
    // Take the first dotted segment (`lumecube.com` → `lumecube`). For
    // multi-segment hosts (`us.sennheiser-hearing.com`) we still take the
    // *first non-www* label — which surfaces the shop's brand for the
    // common `<brand>.shopify.com` / `<brand>.com` cases. Hyphens become
    // spaces; otherwise the segment is title-cased word-by-word.
    const head = stripped.split('.')[0];
    if (!head) return undefined;
    return head
      .split(/[-_]/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  } catch {
    return undefined;
  }
}

function pickMerchantName(raw: RawProduct): string {
  if (typeof raw.merchant === 'string') return raw.merchant;
  if (raw.merchant && typeof raw.merchant === 'object' && raw.merchant.name) {
    return raw.merchant.name;
  }
  const fromBlob =
    raw.seller?.name ??
    raw.shop?.name ??
    raw.variants?.[0]?.seller?.name;
  if (fromBlob) return fromBlob;
  // Shopify path: derive from the first variant's URL hostname.
  const fromUrl =
    deriveMerchantFromUrl(raw.variants?.[0]?.url) ??
    deriveMerchantFromUrl(raw.url);
  return fromUrl ?? 'Shopify Merchant';
}

function pickMerchantObject(raw: RawProduct): RawMerchant | undefined {
  if (raw.merchant && typeof raw.merchant === 'object') return raw.merchant;
  if (raw.seller && typeof raw.seller === 'object') return raw.seller;
  if (raw.shop && typeof raw.shop === 'object') return raw.shop;
  return undefined;
}

// Round 2 polish (T2.11): pull a country-of-origin string from any of the
// common Shopify metafield spellings, preferring product-level over merchant-
// level (a merchant may ship goods made in multiple countries). When the raw
// value looks like an ISO-3166 alpha-2 code (length 2 + letters only), we
// uppercase it so the FE display-name lookup is deterministic; otherwise the
// raw string is passed through verbatim — the FE renders "Made in {x}"
// without enforcing a vocabulary, and the caller can still read free-form
// strings like "northern Italy" or "EU".
function pickOriginCountry(raw: RawProduct, m: RawMerchant | undefined): string | undefined {
  const candidate =
    raw.country_of_origin ??
    raw.origin_country ??
    raw.country ??
    raw.made_in ??
    m?.country_of_origin ??
    m?.origin_country ??
    m?.country ??
    m?.made_in ??
    undefined;
  if (typeof candidate !== 'string') return undefined;
  const trimmed = candidate.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length === 2 && /^[A-Za-z]{2}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return trimmed;
}

// Round 5 polish (T4.A): canonicalise the `ships_to` / `shipsTo` raw value
// into an uppercase ISO-3166-style array. Single strings get wrapped. Empty
// strings drop. Non-strings drop. Duplicates after upper-casing collapse —
// the FE renders a country list and would dedupe on render anyway, but doing
// it here keeps the schema-validated payload tight.
function normaliseShipsTo(raw: string | string[] | undefined): string[] | undefined {
  if (raw == null) return undefined;
  const arr = Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];
  for (const entry of arr) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (trimmed.length === 0) continue;
    const upper = trimmed.toUpperCase();
    if (!out.includes(upper)) out.push(upper);
  }
  return out.length > 0 ? out : undefined;
}

// Round 5 polish (T4.W): coerce `review_count` / `reviewCount` / `n_reviews`
// to a non-negative integer. Strings are parsed with `Number`; anything that
// parses to NaN or negative is dropped (we'd rather omit the field than
// surface a misleading "0 reviews" or "-3" on the FE).
function pickReviewCount(raw: RawProduct, m: RawMerchant | undefined): number | undefined {
  const candidate =
    m?.review_count ??
    m?.reviewCount ??
    m?.n_reviews ??
    raw.review_count ??
    raw.reviewCount ??
    raw.n_reviews ??
    undefined;
  if (candidate == null) return undefined;
  const n = typeof candidate === 'number' ? candidate : Number(candidate);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}

function pickMerchantInfo(raw: RawProduct, name: string): MerchantInfo {
  const m = pickMerchantObject(raw);
  const info: MerchantInfo = { name };

  const rating =
    typeof m?.rating === 'number'
      ? m.rating
      : typeof m?.rating === 'string'
        ? Number(m.rating)
        : typeof raw.rating === 'number'
          ? raw.rating
          : typeof raw.rating === 'string'
            ? Number(raw.rating)
            : undefined;
  if (rating !== undefined && Number.isFinite(rating)) info.rating = rating;

  const reviewCount = pickReviewCount(raw, m);
  if (reviewCount !== undefined) info.reviewCount = reviewCount;

  const returnsPolicy =
    m?.returns_policy ?? m?.returnsPolicy ?? raw.returns_policy ?? undefined;
  if (returnsPolicy) info.returnsPolicy = returnsPolicy;

  const shippingDays =
    m?.shipping_days ?? m?.shippingDays ?? raw.shipping_days ?? undefined;
  if (shippingDays) info.shippingDays = shippingDays;

  const carbon = m?.carbon ?? m?.carbon_estimate ?? raw.carbon ?? undefined;
  if (carbon) info.carbon = carbon;

  const originCountry = pickOriginCountry(raw, m);
  if (originCountry) info.originCountry = originCountry;

  // Round 5 polish (T4.A): read `ships_to` / `shipsTo` from BOTH the raw
  // product and the merchant blob (product-level wins — same convention as
  // `pickOriginCountry`). Single strings are wrapped to `[string]`; every
  // entry is upper-cased.
  const shipsTo =
    normaliseShipsTo(raw.ships_to) ??
    normaliseShipsTo(raw.shipsTo) ??
    normaliseShipsTo(m?.ships_to) ??
    normaliseShipsTo(m?.shipsTo);
  if (shipsTo) info.shipsTo = shipsTo;

  return info;
}

function pickMerchantTags(raw: RawProduct): string[] | undefined {
  const m = pickMerchantObject(raw);
  const tags = m?.tags ?? raw.tags;
  if (Array.isArray(tags) && tags.length > 0) {
    return tags.filter((t): t is string => typeof t === 'string');
  }
  return undefined;
}

// Shopify Catalog MCP ships `price_range: {min: MoneyV2, max: MoneyV2}` where
// each side is `{amount: <minor-units>, currency}`. The older test/mock shape
// is a flat number (`{min: 42}`). `parseMoney` handles both transparently —
// this helper exists so the call site can fall back without the verbose
// `parseMoney(raw.price_range?.min)` repetition.
function priceRangeMin(raw: RawProduct): { amount: number; currency: string } | undefined {
  const min = raw.price_range?.min;
  if (min == null) return undefined;
  const parsed = parseMoney(min);
  // If `price_range.currency` is set on the wrapper (legacy shape) AND the
  // inner money object did NOT carry its own currency, prefer the wrapper.
  if (
    raw.price_range?.currency &&
    (typeof min === 'number' || typeof min === 'string')
  ) {
    return { amount: parsed.amount, currency: raw.price_range.currency };
  }
  return parsed;
}

export function normalizeProduct(raw: RawProduct): NormalizedProduct {
  const variants = (raw.variants ?? []).map((v) => normalizeVariant(v, 'USD'));
  const firstAvailable = variants.find((v) => v.available && v.checkoutUrl) ?? variants[0];

  const rangeMin = priceRangeMin(raw);
  const price =
    firstAvailable?.price ??
    (raw.price != null ? parseMoney(raw.price).amount : undefined) ??
    rangeMin?.amount ??
    0;
  // R3-cleanup (architect-code MEDIUM): `price_range` carries its currency on
  // the wrapper object (`{min,max,currency}`), but `parseMoney` only inspects
  // `{amount,currency}` — so passing the wrapper used to silently fall back to
  // 'USD' for non-USD merchants. Read the wrapper's currency explicitly here
  // before falling back. Order: variant currency → product `price` money →
  // `price_range.min`'s embedded currency → `price_range.currency` → 'USD'.
  const currency =
    firstAvailable?.currency ??
    (raw.price != null ? parseMoney(raw.price).currency : undefined) ??
    rangeMin?.currency ??
    raw.price_range?.currency ??
    'USD';

  const merchant = pickMerchantName(raw);
  const merchantInfo = pickMerchantInfo(raw, merchant);
  const merchantTags = pickMerchantTags(raw);

  const compareAtRaw = raw.compare_at_price ?? raw.compareAtPrice;
  const compareAt = compareAtRaw != null ? parseMoney(compareAtRaw).amount : undefined;

  // Shopify products do NOT carry a top-level `url` — the canonical merchant
  // page URL lives on each variant. Propagate the first variant's URL up to
  // the product so the FE card / comparison row can deep-link without
  // peeking at `variants[]`. Legacy MCPs that surface a top-level `url`
  // continue to take precedence.
  const productUrl = raw.url ?? raw.variants?.[0]?.url;

  return {
    id: String(raw.id ?? raw.upid ?? ''),
    upid: raw.upid ?? raw.id,
    title: raw.title ?? raw.name ?? 'Untitled product',
    // Shopify returns `description: { plain: "...", html?: "..." }` rather
    // than a flat string. Coerce here so the products event schema
    // (`description: z.string()`) is satisfied without leaking shape changes
    // upstream to FE renderers.
    description:
      typeof raw.description === 'string'
        ? raw.description
        : raw.description?.plain ?? '',
    images: pickImages(raw),
    price,
    compareAtPrice: compareAt && compareAt > 0 ? compareAt : undefined,
    currency,
    merchant,
    url: productUrl,
    // checkoutUrl falls back to the product URL when the first-available
    // variant didn't surface one — guarantees `checkoutUrl` is at minimum
    // a valid merchant page link (the FE Buy affordance never opens to ''.)
    checkoutUrl: firstAvailable?.checkoutUrl || productUrl || '',
    variants: variants.length ? variants : undefined,
    // Tools layer fills these in via `computeChips(product, ctx.preferences)`
    // before emitting. `normalize.ts` stays pure-shape (cycle-2.md rule).
    reasoningChips: [],
    merchantInfo,
    merchantTags,
  };
}

export function extractProducts(result: unknown): RawProduct[] {
  if (!result || typeof result !== 'object') return [];
  const r = result as Record<string, unknown>;
  if (Array.isArray(r.products)) return r.products as RawProduct[];
  // Shopify Catalog MCP (UCP 2026-04-08) wraps `products` under
  // `structuredContent`. Without this branch, every successful catalog
  // search appeared to return zero products and the agent reported
  // "no results" while the wire showed 10+ items.
  if (r.structuredContent && typeof r.structuredContent === 'object') {
    const sc = r.structuredContent as Record<string, unknown>;
    if (Array.isArray(sc.products)) return sc.products as RawProduct[];
    if (sc.catalog && typeof sc.catalog === 'object') {
      const c = sc.catalog as Record<string, unknown>;
      if (Array.isArray(c.products)) return c.products as RawProduct[];
      if (Array.isArray(c.results)) return c.results as RawProduct[];
    }
  }
  if (r.catalog && typeof r.catalog === 'object') {
    const c = r.catalog as Record<string, unknown>;
    if (Array.isArray(c.products)) return c.products as RawProduct[];
    if (Array.isArray(c.results)) return c.results as RawProduct[];
  }
  if (Array.isArray((r as { content?: unknown }).content)) {
    const content = (r as { content: Array<{ type?: string; json?: unknown; text?: string }> }).content;
    for (const block of content) {
      if (block.json && typeof block.json === 'object') {
        const nested = block.json as Record<string, unknown>;
        if (Array.isArray(nested.products)) return nested.products as RawProduct[];
        if (nested.catalog && typeof nested.catalog === 'object') {
          const c = nested.catalog as Record<string, unknown>;
          if (Array.isArray(c.products)) return c.products as RawProduct[];
        }
      }
      if (typeof block.text === 'string') {
        try {
          const parsed = JSON.parse(block.text);
          if (parsed?.products) return parsed.products as RawProduct[];
          if (parsed?.catalog?.products) return parsed.catalog.products as RawProduct[];
        } catch {
          // ignore
        }
      }
    }
  }
  return [];
}

export function extractProduct(result: unknown): RawProduct | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  if (r.product && typeof r.product === 'object') return r.product as RawProduct;
  if (r.structuredContent && typeof r.structuredContent === 'object') {
    const sc = r.structuredContent as Record<string, unknown>;
    if (sc.product && typeof sc.product === 'object') return sc.product as RawProduct;
    if (sc.catalog && typeof sc.catalog === 'object') {
      const c = sc.catalog as Record<string, unknown>;
      if (c.product) return c.product as RawProduct;
    }
  }
  if (r.catalog && typeof r.catalog === 'object') {
    const c = r.catalog as Record<string, unknown>;
    if (c.product) return c.product as RawProduct;
  }
  const list = extractProducts(result);
  return list[0] ?? null;
}
