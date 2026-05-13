export interface Variant {
  id: string;
  title: string;
  price: number;
  currency: string;
  available: boolean;
  checkoutUrl: string;
  options?: Record<string, string>;
  // Per-variant images. Shopify ships `variant.media[]`; we use the first
  // entry as the card hero when the variant is selected. Falls back to the
  // product-level image set when absent.
  images?: string[];
}

// Reasoning chip — mirrors backend `ReasoningChip` and the wire schema in
// `@agentic/events::reasoningChipSchema` (the canonical home; `frontend/lib/
// events.ts` is just a re-export — R3-cleanup architect-code MEDIUM). `kind`
// is open-ended on the wire but the renderer (`ReasoningChips`) maps a fixed
// set per DESIGN.md §8 Cycle 2 directive: size_match, price, discount,
// shipping, ethics, low_stock. Unknown kinds fall through to a neutral ink
// treatment.
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
  // Round 2 polish (T2.11, persona-sasha). Backend `normalize.ts` reads from
  // `country_of_origin` / `origin_country` / `country` / `made_in`. Uppercase
  // ISO-3166 alpha-2 when the upstream looks like a code; verbatim string
  // otherwise. Absent → MerchantBlock surfaces the existing
  // "merchant didn't publish this" line (PRODUCT.md acceptance #5).
  originCountry?: string;
  // Cycle 7 (T7.4, persona-priya): ISO-3166 alpha-2 country codes the
  // merchant publishes as supported destinations. Mirrors
  // `packages/events::merchantInfoSchema.shipsTo`. Used by the Buy-button
  // tooltip to enumerate where the merchant ships; absent / empty array
  // both mean "merchant didn't publish destinations" — the trust line
  // omits the row rather than asserting "ships to: unknown".
  shipsTo?: string[];
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
// (see `@agentic/events::moodboardEventSchema` — canonical home; the
// `frontend/lib/events.ts` re-export is the import path. R3-cleanup
// architect-code MEDIUM). The `extract_style_
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

// ---------------------------------------------------------------------------
// Cycle 5 — SummaryBlob. Mirrors `backend/src/services/summary.ts::SummaryBlob`.
// Rendered by the server-rendered `/s/[id]` lookbook page. `snapshot` on each
// shortlist row is the BE `ShortlistRow.snapshot` — opaque `unknown` on the
// wire so a delisted-product reshape doesn't break the page; the renderer
// narrows to `Product` defensively (PRODUCT.md acceptance #5).
// ---------------------------------------------------------------------------
export interface SummaryProduct {
  productId: string;
  lane: 'love' | 'maybe';
  snapshot: Product;
  addedAt: string;
}

export interface SummaryOutfit {
  id: string;
  anchorProductId: string;
  items: Product[];
  savedAt: string;
  rationale?: string;
}

export interface SummaryBlob {
  gist: string;
  createdAt: string;
  love: SummaryProduct[];
  maybe: SummaryProduct[];
  outfits: SummaryOutfit[];
  merchantCount: number;
}
