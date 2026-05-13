// @agentic/events — single source of truth for the BE→FE SSE protocol.
//
// Cycle 6 unification: prior to this cycle, the schemas existed in two
// near-mirror files (`backend/src/stream/events.ts` and
// `frontend/lib/events.ts`) and drifted at least once per cycle. This
// workspace is what both sides now import. Adding a new arm here is the
// only edit required — the BE and FE both re-export verbatim.
//
// Naming. Backend historically used camelCase exports (`serverEventSchema`,
// `normalizedProductSchema`), frontend used PascalCase (`ServerEventSchema`,
// `NormalizedProductSchema`). We export BOTH so neither side needs a churn
// edit. The camelCase ones are the primary names; PascalCase aliases live
// at the bottom.
//
// Strict vs lenient. The canonical `normalizedProductSchema` is `.strict()`
// (extra fields fail). For inbound wire validation on the FE we also export
// `normalizedProductLenient` (`.passthrough()`) so a client built against an
// older schema does not reject a newer payload. The default `serverEventSchema`
// uses the strict variant; if a client wants forward-compat it can build its
// own discriminated union from the lenient products schema.

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Preference keys — single source of truth for the BE preferences repo, the
// BE preferences REST routes, the `save_preference` tool, the FE API layer,
// and the wire schema for the `preference_update` SSE event. Prior to Cycle 7
// polish, BE and FE each kept a private copy; this lift collapses them.
// ---------------------------------------------------------------------------

export const PREFERENCE_KEYS = [
  'size',
  'budget',
  'ships_from',
  'ships_to',
  'palette',
  'ethics',
  'shipping_speed',
  // Round 5 polish (T4.O, persona-diane): "who are you shopping for" — gift
  // use case. User-initiated (don't proactively save). Free-text for now;
  // the FE will wrap a select around it later. Common values:
  // 'self' | 'partner' | 'kid_4_to_12' | 'kid_13_to_17' | 'adult_friend' |
  // 'parent' | … (free-text).
  'shopping_for',
] as const;

export type PreferenceKey = (typeof PREFERENCE_KEYS)[number];

export function isPreferenceKey(value: string): value is PreferenceKey {
  return (PREFERENCE_KEYS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Ethics taxonomy — Round 2 polish (T2.10, persona-sasha).
//
// Before: `prefs.ethics` was a free-text string, and the `ethics` chip in
// `reasoning.ts` did a literal case-insensitive `tags.includes(w)` against
// `product.merchantTags`. The substring match meant a saved preference of
// "sustainable" silently never fired against tags like `organic-cotton`,
// `gots-certified`, or `b-corp` — the chip looked decorative but was broken
// by design for the 90% of merchants who don't tag themselves "sustainable".
//
// After: a closed-set vocabulary (`ETHICS_VALUES`) plus a per-value synonym
// list (`ETHICS_SYNONYMS`) that the reasoning rule walks. `prefs.ethics` is
// expected to be `EthicsValue[]` (the FE renders a multi-select chip grid),
// though `reasoning.ts` still accepts a bare string defensively. The
// `save_preference` tool and the FE PreferencesCard both target this shape.
// ---------------------------------------------------------------------------

export const ETHICS_VALUES = [
  'sustainable',
  'fair-trade',
  'organic',
  'b-corp',
  'women-owned',
  'small-batch',
  'vegan',
  'recycled',
] as const;

export type EthicsValue = (typeof ETHICS_VALUES)[number];

// Synonyms used by the BE reasoning rule for chip-firing. Lower-case, and
// matched as case-insensitive substrings against `product.merchantTags`
// entries (so "GOTS-certified-organic" matches `'organic'` via the
// `'organic'` synonym; "Certified B Corp" matches `'b-corp'` via `'b corp'`).
// Keep this owned in code and transparent — see persona-sasha §"What I'd need".
export const ETHICS_SYNONYMS: Record<EthicsValue, readonly string[]> = {
  sustainable: ['sustainable', 'eco', 'eco-friendly', 'low-impact'],
  'fair-trade': ['fair-trade', 'fairtrade', 'fair trade'],
  organic: ['organic', 'organic-cotton', 'gots'],
  'b-corp': ['b-corp', 'b corp', 'bcorp', 'certified-b'],
  'women-owned': ['women-owned', 'women owned', 'female-founded'],
  'small-batch': ['small-batch', 'small batch', 'limited-run', 'limited run'],
  vegan: ['vegan', 'plant-based'],
  recycled: ['recycled', 'reclaimed', 'upcycled'],
};

export function isEthicsValue(v: unknown): v is EthicsValue {
  return typeof v === 'string' && (ETHICS_VALUES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Product shape (mirrors services/normalize.ts output on the BE).
// ---------------------------------------------------------------------------

export const normalizedVariantSchema = z.object({
  id: z.string(),
  title: z.string(),
  price: z.number(),
  currency: z.string(),
  available: z.boolean(),
  checkoutUrl: z.string(),
  options: z.record(z.string()).optional(),
  shipsTo: z.array(z.string()).optional(),
  // Per-variant image list. Shopify Catalog MCP ships `variant.media[]`
  // (verified on the live wire — Reebok Club C 85 'white' variant has its
  // own URL distinct from the product's first media). Optional because
  // legacy MCPs and the product-level image set are still valid fallbacks
  // — the FE prefers `selectedVariant.images[0]` then `product.images[0]`.
  images: z.array(z.string()).optional(),
});

// Reasoning chip — canonical shape. Cycle 1 pinned the contract; Cycle 2
// produces chips and renders them. Cycle 6 unifies the prior BE/FE split
// (FE had a `.passthrough()` on the same object; we keep the inner schema
// strict here and offer a lenient product wrapper below).
export const reasoningChipSchema = z.object({
  kind: z.string(),                                            // 'size_match' | 'discount' | 'price' | 'fast_shipping' | 'shipping' | 'ethics' (Cycle 7 added 'fast_shipping')
  label: z.string(),                                           // short visible label, e.g. "size 8 match"
  detail: z.string().optional(),                               // longer tooltip copy revealed on tap/hover
  tone: z.enum(['positive', 'neutral', 'warning']).optional(), // visual treatment hint
});

// `originCountry` — Round 2 polish (T2.11, persona-sasha). Where the merchant
// (or product) declares it's made. Normalized by `services/normalize.ts` to
// uppercase ISO-3166 alpha-2 when the source looks like a code; passed through
// verbatim otherwise so the FE can still render free-form strings like
// "Made in northern Italy" without dropping them. Absent → MerchantBlock
// renders the existing "merchant didn't publish this" line per PRODUCT.md
// acceptance #5 (no fake provenance).
export const merchantInfoSchema = z.object({
  name: z.string(),
  rating: z.number().optional(),
  // Round 5 polish (T4.W, persona-oscar): number of reviews backing the
  // rating. Power users want it on cards + ComparisonTable as a separate
  // column. Optional so omission gracefully degrades — MerchantBlock falls
  // back to the prior rating-only row when the merchant hasn't published it.
  reviewCount: z.number().int().nonnegative().optional(),
  returnsPolicy: z.string().optional(),
  shippingDays: z.string().optional(),
  carbon: z.string().optional(),
  originCountry: z.string().optional(),
  // Round 5 polish (T4.A, personas Priya/Marcus/Aleksey/Ronan): ISO-3166
  // alpha-2 country codes the merchant publishes as supported destinations.
  // Normalized to uppercase by `services/normalize.ts::pickMerchantInfo`.
  // Drives the `ships_to_match` reasoning chip + the post-fetch filter in
  // `services/catalog.ts::searchCatalog` (drop on explicit mismatch only —
  // products without a `shipsTo` array are kept, per the graceful-degrade
  // rule: "the merchant didn't publish this").
  shipsTo: z.array(z.string()).optional(),
});

export const normalizedProductSchema = z.object({
  id: z.string(),
  upid: z.string().optional(),
  title: z.string(),
  description: z.string(),
  images: z.array(z.string()),
  price: z.number(),
  compareAtPrice: z.number().optional(),
  currency: z.string(),
  merchant: z.string(),
  url: z.string().optional(),
  checkoutUrl: z.string(),
  variants: z.array(normalizedVariantSchema).optional(),
  reasoningChips: z.array(reasoningChipSchema).default([]),
  merchantInfo: merchantInfoSchema.optional(),
  merchantTags: z.array(z.string()).optional(),
});

// Lenient variant for inbound wire validation. The FE accepts payloads that
// carry future fields (e.g. a new `sustainabilityScore` added in a later
// cycle should not crash a client built against the current schema).
export const normalizedProductLenient = normalizedProductSchema.passthrough();

// ---------------------------------------------------------------------------
// ServerEvent schemas. Discriminated on `type`.
// ---------------------------------------------------------------------------

export const textDeltaSchema = z.object({
  type: z.literal('text_delta'),
  text: z.string(),
});

export const toolStatusSchema = z.object({
  type: z.literal('tool_status'),
  toolCallId: z.string(),
  name: z.string(),
  args: z.unknown().optional(),
  status: z.enum(['running', 'done', 'error']),
  errorMessage: z.string().optional(),
});

export const productsEventSchema = z.object({
  type: z.literal('products'),
  toolCallId: z.string(),
  query: z.string(),
  products: z.array(normalizedProductSchema),
});

export const comparisonEventSchema = z.object({
  type: z.literal('comparison'),
  toolCallId: z.string(),
  products: z.array(normalizedProductSchema),
  axes: z.array(z.string()),
});

export const moodboardEventSchema = z.object({
  type: z.literal('moodboard'),
  toolCallId: z.string(),
  imageUrl: z.string(),
  description: z.string(),
  attributes: z.array(z.string()),
  suggestedQuery: z.string(),
});

// R3-cleanup (architect-code MEDIUM): [DEFERRED] reasoning_chip side-channel.
// No tool emits this event today; chips ship inline on each product via
// `normalizedProductSchema.reasoningChips`. The arm is preserved in the
// discriminated union (and the events.test.ts fixtures) so a future per-product
// late-binding push doesn't need a wire-schema migration. The FE switch
// silently drops the event — see `frontend/hooks/useConversation.tsx`.
export const reasoningChipEventSchema = z.object({
  type: z.literal('reasoning_chip'),
  productId: z.string(),
  chip: reasoningChipSchema,
});

// `key` is the closed enum lifted to `PREFERENCE_KEYS` above. Cycle 7 polish
// removed the prior `z.string()` widening — FE no longer needs the unsafe
// `as PreferenceKey` cast at the boundary.
export const preferenceUpdateSchema = z.object({
  type: z.literal('preference_update'),
  key: z.enum(PREFERENCE_KEYS),
  value: z.unknown(),
  source: z.enum(['user', 'inferred', 'agent']),
});

// `rationales` is a parallel array to `items`: `rationales[i]` is the
// per-item provenance for `items[i]` (built from catalog data — same merchant,
// shared tags, similar price band, shared shipping region). May be `null` when
// no real signal supports it. Always the same length as `items`. Cycle 7
// polish renders these per-cell on the FE; the parallel-array shape keeps the
// `items: NormalizedProduct[]` element type untouched so existing FE props
// don't churn. `rationale` (singular) remains the bundle-level summary.
export const outfitEventSchema = z.object({
  type: z.literal('outfit'),
  toolCallId: z.string(),
  anchorProductId: z.string(),
  items: z.array(normalizedProductSchema),
  rationales: z.array(z.string().nullable()).optional(),
  rationale: z.string(),
});

export const errorEventSchema = z.object({
  type: z.literal('error'),
  code: z.enum([
    'rate_limited',
    'mcp_error',
    'tool_error',
    'invalid_request',
    'internal',
  ]),
  message: z.string(),
  retryable: z.boolean(),
});

export const doneEventSchema = z.object({
  type: z.literal('done'),
  turnsUsed: z.number().int().nonnegative(),
});

export const serverEventSchema = z.discriminatedUnion('type', [
  textDeltaSchema,
  toolStatusSchema,
  productsEventSchema,
  comparisonEventSchema,
  moodboardEventSchema,
  reasoningChipEventSchema,
  preferenceUpdateSchema,
  outfitEventSchema,
  errorEventSchema,
  doneEventSchema,
]);

export type ServerEvent = z.infer<typeof serverEventSchema>;
export type ServerEventType = ServerEvent['type'];
export type NormalizedProduct = z.infer<typeof normalizedProductSchema>;
export type NormalizedVariant = z.infer<typeof normalizedVariantSchema>;
export type ReasoningChip = z.infer<typeof reasoningChipSchema>;
export type MerchantInfo = z.infer<typeof merchantInfoSchema>;

export const eventSchemas = {
  text_delta: textDeltaSchema,
  tool_status: toolStatusSchema,
  products: productsEventSchema,
  comparison: comparisonEventSchema,
  moodboard: moodboardEventSchema,
  reasoning_chip: reasoningChipEventSchema,
  preference_update: preferenceUpdateSchema,
  outfit: outfitEventSchema,
  error: errorEventSchema,
  done: doneEventSchema,
} as const satisfies Record<ServerEventType, z.ZodTypeAny>;

// ---------------------------------------------------------------------------
// PascalCase aliases — preserved so the FE code can `import { NormalizedProduct
// Schema } from '@agentic/events'` without a renaming churn. The objects are
// identical references; either name resolves to the same Zod schema instance.
// ---------------------------------------------------------------------------

export const NormalizedVariantSchema = normalizedVariantSchema;
export const ReasoningChipSchema = reasoningChipSchema;
export const MerchantInfoSchema = merchantInfoSchema;
export const NormalizedProductSchema = normalizedProductSchema;
export const NormalizedProductLenient = normalizedProductLenient;
export const TextDeltaSchema = textDeltaSchema;
export const ToolStatusSchema = toolStatusSchema;
export const ProductsEventSchema = productsEventSchema;
export const ComparisonEventSchema = comparisonEventSchema;
export const MoodboardEventSchema = moodboardEventSchema;
export const ReasoningChipEventSchema = reasoningChipEventSchema;
export const PreferenceUpdateSchema = preferenceUpdateSchema;
export const OutfitEventSchema = outfitEventSchema;
export const ErrorEventSchema = errorEventSchema;
export const DoneEventSchema = doneEventSchema;
export const ServerEventSchema = serverEventSchema;
export const EVENT_SCHEMAS = eventSchemas;
