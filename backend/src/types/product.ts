export interface NormalizedVariant {
  id: string;
  title: string;
  price: number;
  currency: string;
  available: boolean;
  checkoutUrl: string;
  options?: Record<string, string>;
  /**
   * Regions/countries this variant ships to. Drives the `shipping` reasoning
   * chip; populated from `seller.ships_to` when MCP provides it.
   */
  shipsTo?: string[];
}

/**
 * Reasoning chip rendered under a product title. Shape mirrors the unified
 * `reasoningChipSchema` in `stream/events.ts` and the FE
 * `lib/events.ts::ReasoningChipSchema`. Any change must land in all three.
 */
export interface ReasoningChip {
  kind: string;
  label: string;
  detail?: string;
  tone?: 'positive' | 'neutral' | 'warning';
}

export interface MerchantInfo {
  name: string;
  rating?: number;
  returnsPolicy?: string;
  shippingDays?: string;
  carbon?: string;
}

export interface NormalizedProduct {
  id: string;
  upid?: string;
  title: string;
  description: string;
  images: string[];
  price: number;
  /** Optional `compare_at_price` carried through from MCP so chip rules can compute discount %. */
  compareAtPrice?: number;
  currency: string;
  merchant: string;
  url?: string;
  checkoutUrl: string;
  variants?: NormalizedVariant[];
  /** Computed in the tool layer; `normalize.ts` initializes to `[]`. */
  reasoningChips: ReasoningChip[];
  /** Merchant transparency block (PRODUCT.md move #5). Graceful fallback to `{ name }`. */
  merchantInfo?: MerchantInfo;
  /** Merchant-published tags (sustainability, ethics, etc.) used by the `ethics` chip rule. */
  merchantTags?: string[];
}

export interface SearchResponse {
  products: NormalizedProduct[];
}
