import { ETHICS_SYNONYMS, isEthicsValue, type EthicsValue } from '@agentic/events';
import type { NormalizedProduct, ReasoningChip } from '../types/product.js';
import type { PreferenceEntrySnapshot, PreferencesSnapshot } from '../types/tool.js';

/**
 * Pure rules-engine for product reasoning chips. NO DB, NO MCP, NO logging.
 * Given a product + a preferences snapshot, return ≤4 chips ranked by signal
 * strength. Round 2 polish (T2.10, persona-sasha) promotes `ethics` above
 * `shipping`: for a values-led shopper who has explicitly saved one or more
 * ethics values, ethics belongs in the visible top-4 even when shipping has
 * a chip to fire. `MAX_CHIPS = 4`, so the prior tail position meant ethics
 * was the first thing sliced off the chip strip — the exact wrong order for
 * the persona who set the preference. New rank:
 *
 *   size_match > discount > price > fast_shipping > ethics > shipping
 *
 * Tests for this file should be trivial — feed in fixtures, assert on the
 * returned array. See cycle-2.md "Backend engineer" hard rules.
 */

const MAX_CHIPS = 4;

const RANK: Record<string, number> = {
  size_match: 0,
  discount: 1,
  price: 2,
  fast_shipping: 3,
  // Round 2: ethics promoted above shipping. See header comment.
  ethics: 4,
  shipping: 5,
};

// Cycle 7 polish (T1.35): the gift-deadline persona needs a quick visual cue
// when a merchant ships in ≤3 days. `MerchantInfo.shippingDays` is free-form
// ("Ships in 2-3 business days", "5 day shipping", etc.) so we parse loosely
// and emit only when the highest day-count we can extract is ≤3.
const FAST_SHIPPING_MAX_DAYS = 3;
const SHIPPING_DAYS_REGEX = /(\d+)(?:\s*[-–]\s*(\d+))?\s*(?:business\s+)?days?/i;

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

function fastShippingChip(product: NormalizedProduct): ReasoningChip | null {
  const raw = product.merchantInfo?.shippingDays;
  if (!raw) return null;
  const m = SHIPPING_DAYS_REGEX.exec(raw);
  if (!m) return null;
  const lo = Number(m[1]);
  const hi = m[2] != null ? Number(m[2]) : lo;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  const maxDays = Math.max(lo, hi);
  if (maxDays > FAST_SHIPPING_MAX_DAYS) return null;
  return {
    kind: 'fast_shipping',
    label: `Ships in ${maxDays} day${maxDays === 1 ? '' : 's'}`,
    detail: `Merchant published shipping window: ${raw}.`,
    tone: 'positive',
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
  // Round 2 polish (T2.10): `prefs.ethics` is expected to be `EthicsValue[]`
  // (a closed vocabulary; see `@agentic/events::ETHICS_VALUES`). We accept a
  // bare string defensively for back-compat with any preference rows written
  // by Round 1's free-text path. Each preferred value walks
  // `ETHICS_SYNONYMS[value]` and a case-insensitive substring match against
  // any of the product's `merchantTags` entries fires the chip. The chip
  // detail names BOTH the matched tag and the user's preference so the
  // shopper can verify *why* the chip fired — opaque "matches your values"
  // copy was the prior persona-sasha complaint.
  const wantedRaw = readValue<unknown>(prefs, 'ethics');
  if (wantedRaw == null) return null;

  const wantedRawArr: unknown[] = Array.isArray(wantedRaw)
    ? wantedRaw
    : typeof wantedRaw === 'string'
      ? [wantedRaw]
      : [];
  const wanted: EthicsValue[] = wantedRawArr.filter(isEthicsValue);
  if (wanted.length === 0) return null;

  const tags = product.merchantTags ?? [];
  if (tags.length === 0) return null;
  const tagsLower = tags.map((t) => t.toLowerCase());

  for (const value of wanted) {
    const synonyms = ETHICS_SYNONYMS[value];
    for (const syn of synonyms) {
      const s = syn.toLowerCase();
      const hitIdx = tagsLower.findIndex((t) => t.includes(s));
      if (hitIdx === -1) continue;
      const matchedTag = tags[hitIdx];
      return {
        kind: 'ethics',
        label: `Matches ${value}`,
        detail: `Tag '${matchedTag}' matches your '${value}' preference`,
        tone: 'positive',
      };
    }
  }
  return null;
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
  const fs = fastShippingChip(product);
  if (fs) candidates.push(fs);
  const sh = shippingChip(product, prefs);
  if (sh) candidates.push(sh);
  const e = ethicsChip(product, prefs);
  if (e) candidates.push(e);

  candidates.sort((a, b) => (RANK[a.kind] ?? 99) - (RANK[b.kind] ?? 99));
  return candidates.slice(0, MAX_CHIPS);
}
