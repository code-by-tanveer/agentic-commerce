import type { MerchantInfo, NormalizedProduct, NormalizedVariant } from '../types/product.js';

interface RawMedia {
  url?: string;
  src?: string;
  image_url?: string;
  type?: string;
}

interface RawVariant {
  id?: string;
  title?: string;
  sku?: string;
  price?: number | string | { amount?: number | string; currency?: string };
  currency?: string;
  availability?: string | boolean;
  available?: boolean;
  checkout_url?: string;
  checkoutUrl?: string;
  options?: Record<string, string> | Array<{ name: string; value: string }>;
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
  description?: string;
  url?: string;
  media?: RawMedia[];
  images?: Array<string | RawMedia>;
  price_range?: { min?: number | string; max?: number | string; currency?: string };
  price?: number | string | { amount?: number | string; currency?: string };
  compare_at_price?: number | string | { amount?: number | string; currency?: string };
  compareAtPrice?: number | string | { amount?: number | string; currency?: string };
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

function parseMoney(value: unknown): { amount: number; currency: string } {
  if (value == null) return { amount: 0, currency: 'USD' };
  if (typeof value === 'number') return { amount: value, currency: 'USD' };
  if (typeof value === 'string') {
    const n = Number(value);
    return { amount: Number.isFinite(n) ? n : 0, currency: 'USD' };
  }
  if (typeof value === 'object') {
    const v = value as { amount?: number | string; currency?: string };
    const amount = typeof v.amount === 'number' ? v.amount : Number(v.amount ?? 0);
    return { amount: Number.isFinite(amount) ? amount : 0, currency: v.currency ?? 'USD' };
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

function normalizeVariant(v: RawVariant, fallbackCurrency: string): NormalizedVariant {
  const money = parseMoney(v.price);
  const opts: Record<string, string> = {};
  if (Array.isArray(v.options)) {
    for (const o of v.options) opts[o.name] = o.value;
  } else if (v.options && typeof v.options === 'object') {
    Object.assign(opts, v.options);
  }
  const available =
    typeof v.available === 'boolean'
      ? v.available
      : typeof v.availability === 'boolean'
        ? v.availability
        : v.availability === 'in_stock' || v.availability === 'available';

  let shipsTo: string[] | undefined;
  const rawShipsTo = v.seller?.ships_to;
  if (Array.isArray(rawShipsTo)) {
    shipsTo = rawShipsTo.filter((s): s is string => typeof s === 'string');
  } else if (typeof rawShipsTo === 'string' && rawShipsTo.length > 0) {
    shipsTo = [rawShipsTo];
  }

  return {
    id: String(v.id ?? ''),
    title: v.title ?? v.sku ?? 'Variant',
    price: money.amount,
    currency: money.currency || fallbackCurrency,
    available,
    checkoutUrl: v.checkout_url ?? v.checkoutUrl ?? '',
    options: Object.keys(opts).length ? opts : undefined,
    shipsTo,
  };
}

function pickMerchantName(raw: RawProduct): string {
  if (typeof raw.merchant === 'string') return raw.merchant;
  if (raw.merchant && typeof raw.merchant === 'object' && raw.merchant.name) {
    return raw.merchant.name;
  }
  return (
    raw.seller?.name ??
    raw.shop?.name ??
    raw.variants?.[0]?.seller?.name ??
    'Shopify Merchant'
  );
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

export function normalizeProduct(raw: RawProduct): NormalizedProduct {
  const variants = (raw.variants ?? []).map((v) => normalizeVariant(v, 'USD'));
  const firstAvailable = variants.find((v) => v.available && v.checkoutUrl) ?? variants[0];

  const price =
    firstAvailable?.price ??
    parseMoney(raw.price ?? raw.price_range?.min).amount;
  // R3-cleanup (architect-code MEDIUM): `price_range` carries its currency on
  // the wrapper object (`{min,max,currency}`), but `parseMoney` only inspects
  // `{amount,currency}` — so passing the wrapper used to silently fall back to
  // 'USD' for non-USD merchants. Read the wrapper's currency explicitly here
  // before falling back. Order: variant currency → product `price` money →
  // `price_range.currency` → 'USD'.
  const currency =
    firstAvailable?.currency ??
    (raw.price != null ? parseMoney(raw.price).currency : undefined) ??
    raw.price_range?.currency ??
    'USD';

  const merchant = pickMerchantName(raw);
  const merchantInfo = pickMerchantInfo(raw, merchant);
  const merchantTags = pickMerchantTags(raw);

  const compareAtRaw = raw.compare_at_price ?? raw.compareAtPrice;
  const compareAt = compareAtRaw != null ? parseMoney(compareAtRaw).amount : undefined;

  return {
    id: String(raw.id ?? raw.upid ?? ''),
    upid: raw.upid ?? raw.id,
    title: raw.title ?? raw.name ?? 'Untitled product',
    description: raw.description ?? '',
    images: pickImages(raw),
    price,
    compareAtPrice: compareAt && compareAt > 0 ? compareAt : undefined,
    currency,
    merchant,
    url: raw.url,
    checkoutUrl: firstAvailable?.checkoutUrl ?? '',
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
  if (r.catalog && typeof r.catalog === 'object') {
    const c = r.catalog as Record<string, unknown>;
    if (c.product) return c.product as RawProduct;
  }
  const list = extractProducts(result);
  return list[0] ?? null;
}
