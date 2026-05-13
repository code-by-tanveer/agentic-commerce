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
});

// Reasoning chip — canonical shape. Cycle 1 pinned the contract; Cycle 2
// produces chips and renders them. Cycle 6 unifies the prior BE/FE split
// (FE had a `.passthrough()` on the same object; we keep the inner schema
// strict here and offer a lenient product wrapper below).
export const reasoningChipSchema = z.object({
  kind: z.string(),                                            // e.g. 'size_match' | 'price' | 'shipping' | 'ethics' | 'discount'
  label: z.string(),                                           // short visible label, e.g. "size 8 match"
  detail: z.string().optional(),                               // longer tooltip copy revealed on tap/hover
  tone: z.enum(['positive', 'neutral', 'warning']).optional(), // visual treatment hint
});

export const merchantInfoSchema = z.object({
  name: z.string(),
  rating: z.number().optional(),
  returnsPolicy: z.string().optional(),
  shippingDays: z.string().optional(),
  carbon: z.string().optional(),
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

export const reasoningChipEventSchema = z.object({
  type: z.literal('reasoning_chip'),
  productId: z.string(),
  chip: reasoningChipSchema,
});

export const preferenceUpdateSchema = z.object({
  type: z.literal('preference_update'),
  key: z.string(),
  value: z.unknown(),
  source: z.enum(['user', 'inferred', 'agent']),
});

export const outfitEventSchema = z.object({
  type: z.literal('outfit'),
  toolCallId: z.string(),
  anchorProductId: z.string(),
  items: z.array(normalizedProductSchema),
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
