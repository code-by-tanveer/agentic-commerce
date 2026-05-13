export interface Variant {
  id: string;
  title: string;
  price: number;
  currency: string;
  available: boolean;
  checkoutUrl: string;
  options?: Record<string, string>;
}

// Reasoning chip — mirrors backend `ReasoningChip` and the wire schema in
// `frontend/lib/events.ts::ReasoningChipSchema`. `kind` is open-ended on the
// wire but the renderer (`ReasoningChips`) maps a fixed set per
// DESIGN.md §8 Cycle 2 directive: size_match, price, discount, shipping,
// ethics, low_stock. Unknown kinds fall through to a neutral ink treatment.
export type ReasoningChipKind =
  | 'size_match'
  | 'price'
  | 'discount'
  | 'shipping'
  | 'ethics'
  | 'low_stock'
  | (string & {}); // keep open-ended for forward compat

export type ReasoningChipTone = 'positive' | 'neutral' | 'warning';

export interface ReasoningChip {
  kind: ReasoningChipKind;
  label: string;
  detail?: string;
  tone?: ReasoningChipTone;
}

// Merchant info — mirrors backend `NormalizedProduct.merchantInfo`. Every
// field except `name` is optional; absent fields render the
// "merchant didn't publish this" line per PRODUCT.md acceptance #5.
export type ReturnsPolicyKind = '2-day' | '14-day' | 'final-sale' | (string & {});

export interface MerchantInfo {
  name: string;
  rating?: number;            // 0..5, optionally fractional
  returnsPolicy?: ReturnsPolicyKind;
  shippingDays?: string;      // free-form, e.g. "Ships in 2-3 days"
  carbon?: string;            // free-form, e.g. "Ships carbon-neutral"
}

export interface Product {
  id: string;
  upid?: string;
  title: string;
  description: string;
  images: string[];
  price: number;
  currency: string;
  merchant: string;
  url?: string;
  checkoutUrl: string;
  variants?: Variant[];
  // Cycle 2 additions — mirror backend `NormalizedProduct`. Default to `[]`
  // and `undefined` respectively when the BE has nothing to surface.
  reasoningChips?: ReasoningChip[];
  merchantInfo?: MerchantInfo;
}

// ---------------------------------------------------------------------------
// Cycle 3 — Shortlist / view-mode / outfits.
// ---------------------------------------------------------------------------

export type ShortlistLane = 'love' | 'maybe' | 'skip';

export interface ShortlistItem {
  productId: string;
  lane: ShortlistLane;
  snapshot: Product;
  // Wire layout: backend persists `addedAt` as an ISO string. We keep the
  // wire shape permissive (string | number) so a future change to epoch ms
  // doesn't break the panel render.
  addedAt: string | number;
}

export interface SavedOutfit {
  id: string;
  anchorProductId: string;
  items: Product[];
  savedAt: string | number;
  rationale?: string;
}

export type ViewMode = 'list' | 'collage';

// ---------------------------------------------------------------------------
// Cycle 4 — Moodboard. Mirrors the backend `moodboard` SSE event payload
// (see `frontend/lib/events.ts::MoodboardEventSchema`). The `extract_style_
// from_image` vision tool produces these; the FE renders one as a sub-block
// above the next assistant turn's search results.
// ---------------------------------------------------------------------------
export interface Moodboard {
  toolCallId: string;
  imageUrl: string;
  description: string;
  attributes: string[];
  suggestedQuery: string;
}
