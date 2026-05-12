import type { NormalizedProduct, ReasoningChip } from '../types/product.js';
import type { PreferenceEntrySnapshot, PreferencesSnapshot } from '../types/tool.js';

/**
 * Pure rules-engine for product reasoning chips. NO DB, NO MCP, NO logging.
 * Given a product + a preferences snapshot, return ≤4 chips ranked by signal
 * strength per cycle-2.md:
 *
 *   size_match > discount > price > shipping > ethics
 *
 * Tests for this file should be trivial — feed in fixtures, assert on the
 * returned array. See cycle-2.md "Backend engineer" hard rules.
 */

const MAX_CHIPS = 4;

const RANK: Record<string, number> = {
  size_match: 0,
  discount: 1,
  price: 2,
  shipping: 3,
  ethics: 4,
};

function readEntry(
  prefs: PreferencesSnapshot,
  key: string,
): PreferenceEntrySnapshot | undefined {
  const raw = prefs[key];
  if (!raw) return undefined;
  // The PreferencesSnapshot value is either a fully-shaped entry (loaded from
  // the repo) or — defensively — a bare value if a future caller passes one.
  // We accept both to keep this function lenient and pure.
  if (typeof raw === 'object' && raw !== null && 'value' in (raw as object)) {
    return raw as PreferenceEntrySnapshot;
  }
  return { value: raw as unknown, source: 'user', updatedAt: '' };
}

function readValue<T = unknown>(
  prefs: PreferencesSnapshot,
  key: string,
): T | undefined {
  return readEntry(prefs, key)?.value as T | undefined;
}

function normaliseSize(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') return v.trim().toLowerCase();
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    const o = v as { value?: unknown };
    if (o.value != null) return normaliseSize(o.value);
  }
  return undefined;
}

function sizeChip(product: NormalizedProduct, prefs: PreferencesSnapshot): ReasoningChip | null {
  const wantedRaw = readValue(prefs, 'size');
  const wanted = normaliseSize(wantedRaw);
  if (!wanted) return null;
  const variants = product.variants ?? [];
  for (const v of variants) {
    const opt = v.options?.size ?? v.options?.Size;
    if (opt && opt.trim().toLowerCase() === wanted) {
      return {
        kind: 'size_match',
        label: `size ${wanted} match`,
        detail: `Available in your saved size (${wanted}).`,
        tone: 'positive',
      };
    }
  }
  return null;
}

function discountChip(product: NormalizedProduct): ReasoningChip | null {
  const compare = product.compareAtPrice;
  if (!compare || compare <= 0 || compare <= product.price) return null;
  const pct = Math.round(((compare - product.price) / compare) * 100);
  if (pct < 15) return null;
  return {
    kind: 'discount',
    label: `${pct}% off`,
    detail: `Reduced from ${product.currency} ${compare.toFixed(2)}.`,
    tone: 'positive',
  };
}

function priceChip(product: NormalizedProduct, prefs: PreferencesSnapshot): ReasoningChip | null {
  const budget = readValue<unknown>(prefs, 'budget');
  if (!budget || typeof budget !== 'object') return null;
  const b = budget as { max?: unknown };
  const max = typeof b.max === 'number' ? b.max : Number(b.max);
  if (!Number.isFinite(max)) return null;
  if (product.price <= max) return null;
  const over = product.price - max;
  return {
    kind: 'price',
    label: `over budget`,
    detail: `${product.currency} ${over.toFixed(2)} above your ${product.currency} ${max.toFixed(2)} cap.`,
    tone: 'warning',
  };
}

function shippingChip(product: NormalizedProduct, prefs: PreferencesSnapshot): ReasoningChip | null {
  const wanted = readValue<unknown>(prefs, 'ships_to');
  const target =
    typeof wanted === 'string'
      ? wanted.trim().toUpperCase()
      : undefined;
  if (!target) return null;
  // Look at variant-level ships_to first, then fall back to the merchant
  // region embedded in MerchantInfo (no dedicated field today — best effort).
  const variantRegions = (product.variants ?? []).flatMap(
    (v) => v.shipsTo?.map((s) => s.toUpperCase()) ?? [],
  );
  const matches = variantRegions.includes(target);
  if (!matches) return null;
  return {
    kind: 'shipping',
    label: `ships to ${target}`,
    detail: `Merchant ships this product to ${target}.`,
    tone: 'neutral',
  };
}

function ethicsChip(product: NormalizedProduct, prefs: PreferencesSnapshot): ReasoningChip | null {
  const wantedRaw = readValue<unknown>(prefs, 'ethics');
  if (!wantedRaw) return null;
  const wanted: string[] = Array.isArray(wantedRaw)
    ? wantedRaw.filter((s): s is string => typeof s === 'string').map((s) => s.toLowerCase())
    : typeof wantedRaw === 'string'
      ? [wantedRaw.toLowerCase()]
      : [];
  if (wanted.length === 0) return null;
  const tags = (product.merchantTags ?? []).map((t) => t.toLowerCase());
  if (tags.length === 0) return null;
  const hit = wanted.find((w) => tags.includes(w));
  if (!hit) return null;
  return {
    kind: 'ethics',
    label: hit,
    detail: `Merchant lists "${hit}" — matches your saved values.`,
    tone: 'positive',
  };
}

export function computeChips(
  product: NormalizedProduct,
  prefs: PreferencesSnapshot,
): ReasoningChip[] {
  const candidates: ReasoningChip[] = [];
  const s = sizeChip(product, prefs);
  if (s) candidates.push(s);
  const d = discountChip(product);
  if (d) candidates.push(d);
  const p = priceChip(product, prefs);
  if (p) candidates.push(p);
  const sh = shippingChip(product, prefs);
  if (sh) candidates.push(sh);
  const e = ethicsChip(product, prefs);
  if (e) candidates.push(e);

  candidates.sort((a, b) => (RANK[a.kind] ?? 99) - (RANK[b.kind] ?? 99));
  return candidates.slice(0, MAX_CHIPS);
}
