import type { NormalizedProduct } from '../types/product.js';

/**
 * Map an anchor product to 2-3 complementary category search queries.
 *
 * Pure function — no I/O, no logging. Used by `recommend_outfit` to fan out
 * search calls (ADR-0003: the tool's value is composition, not raw MCP).
 *
 * The keyword table is intentionally small. We match on the product title +
 * merchantTags using simple substring/keyword rules, fall back to the closest
 * "parent" category one level up, and return `[]` for unknown types — the
 * caller is responsible for surfacing a graceful "no complementary categories"
 * tool message in that case.
 */

interface Rule {
  /** Keywords to match (lowercased substrings, any-of). */
  match: readonly string[];
  /** Complementary search queries to fan out to. */
  complements: readonly string[];
}

// Order matters — first match wins. Most specific first.
const RULES: readonly Rule[] = [
  // Fashion
  { match: ['shoe', 'sneaker', 'boot', 'heel', 'sandal', 'loafer'], complements: ['tops', 'bottoms'] },
  { match: ['dress', 'gown'], complements: ['outerwear', 'shoes'] },
  { match: ['top', 'shirt', 'blouse', 'tee', 't-shirt', 'tank', 'sweater', 'hoodie'], complements: ['bottoms', 'shoes'] },
  { match: ['bottom', 'pants', 'jeans', 'trouser', 'skirt', 'short'], complements: ['tops', 'shoes'] },
  { match: ['jacket', 'coat', 'outerwear'], complements: ['tops', 'bottoms'] },
  // Home
  { match: ['sofa', 'couch'], complements: ['side table', 'lamp', 'rug'] },
  { match: ['chair', 'armchair'], complements: ['side table', 'lamp', 'rug'] },
  { match: ['bed', 'mattress'], complements: ['bedding', 'lamp', 'side table'] },
  { match: ['desk'], complements: ['desk chair', 'lamp'] },
  { match: ['lamp'], complements: ['side table', 'throw pillow'] },
  { match: ['table'], complements: ['lamp', 'rug'] },
  { match: ['rug'], complements: ['lamp', 'throw pillow'] },
];

function haystack(product: NormalizedProduct): string {
  const title = product.title?.toLowerCase() ?? '';
  const tags = (product.merchantTags ?? []).map((t) => t.toLowerCase()).join(' ');
  const desc = (product.description ?? '').toLowerCase().slice(0, 200);
  return `${title} ${tags} ${desc}`;
}

/**
 * Return 2-3 complementary category strings. Returns `[]` when the anchor
 * doesn't match any known fashion/home taxonomy — caller surfaces a graceful
 * "no complementary categories" message.
 */
export function complementaryCategoriesFor(product: NormalizedProduct): string[] {
  if (!product) return [];
  const text = haystack(product);
  for (const rule of RULES) {
    if (rule.match.some((kw) => text.includes(kw))) {
      // Cap at 3 — the brief allows 2-3.
      return rule.complements.slice(0, 3);
    }
  }
  return [];
}
