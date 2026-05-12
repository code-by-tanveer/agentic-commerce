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
