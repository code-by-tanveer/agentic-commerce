// Frontend mirror of backend `stream/events.ts`. Manual sync; ADR-0002 notes the
// drift risk and CI lint mitigation. Any new arm here must land in the backend
// in the same PR (and vice-versa).

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Product shape — mirrors backend NormalizedProduct. Kept permissive on the
// nested fields the FE doesn't yet render (reasoningChips, merchantInfo arrive
// in Cycle 2) so we don't reject otherwise-valid payloads.
// ---------------------------------------------------------------------------

export const NormalizedVariantSchema = z.object({
  id: z.string(),
  title: z.string(),
  price: z.number(),
  currency: z.string(),
  available: z.boolean(),
  checkoutUrl: z.string(),
  options: z.record(z.string()).optional(),
});

// Reasoning chip — canonical shape, mirrored from
// `backend/src/stream/events.ts::reasoningChipSchema`. Any change here must
// land in both files in the same PR. Cycle 1 pinned the contract; Cycle 2
// produces chips and renders them.
export const ReasoningChipSchema = z
  .object({
    kind: z.string(),                                            // 'size_match' | 'price' | 'shipping' | 'ethics' | 'discount' | ...
    label: z.string(),                                           // short visible label, e.g. "size 8 match"
    detail: z.string().optional(),                               // longer tooltip copy revealed on tap/hover
    tone: z.enum(['positive', 'neutral', 'warning']).optional(), // visual treatment hint
  })
  .passthrough();

export type ReasoningChip = z.infer<typeof ReasoningChipSchema>;

// Merchant transparency block — mirrors backend `NormalizedProduct.merchantInfo`
// added in Cycle 2. Every field except `name` is optional; FE renders
// "merchant didn't publish this" for the missing ones (PRODUCT.md #5).
export const MerchantInfoSchema = z
  .object({
    name: z.string(),
    rating: z.number().optional(),
    returnsPolicy: z.string().optional(),
    shippingDays: z.string().optional(),
    carbon: z.string().optional(),
  })
  .passthrough();

export const NormalizedProductSchema = z
  .object({
    id: z.string(),
    upid: z.string().optional(),
    title: z.string(),
    description: z.string(),
    images: z.array(z.string()),
    price: z.number(),
    currency: z.string(),
    merchant: z.string(),
    url: z.string().optional(),
    checkoutUrl: z.string(),
    variants: z.array(NormalizedVariantSchema).optional(),
    // Cycle 2 additions — both optional on the wire; BE populates them but
    // we don't reject a payload that omits them (e.g. a Cycle 1 cached event
    // replayed into a Cycle 2 client).
    reasoningChips: z.array(ReasoningChipSchema).optional(),
    merchantInfo: MerchantInfoSchema.optional(),
  })
  .passthrough();

export type NormalizedProduct = z.infer<typeof NormalizedProductSchema>;

// ---------------------------------------------------------------------------
// Event arms — keep names + shapes identical to backend/src/stream/events.ts.
// ---------------------------------------------------------------------------

export const TextDeltaSchema = z.object({
  type: z.literal('text_delta'),
  text: z.string(),
});

export const ToolStatusSchema = z.object({
  type: z.literal('tool_status'),
  toolCallId: z.string(),
  name: z.string(),
  args: z.unknown().optional(),
  status: z.enum(['running', 'done', 'error']),
  errorMessage: z.string().optional(),
});

export const ProductsEventSchema = z.object({
  type: z.literal('products'),
  toolCallId: z.string(),
  query: z.string(),
  products: z.array(NormalizedProductSchema),
});

export const ComparisonEventSchema = z.object({
  type: z.literal('comparison'),
  toolCallId: z.string(),
  products: z.array(NormalizedProductSchema),
  axes: z.array(z.string()),
});

export const MoodboardEventSchema = z.object({
  type: z.literal('moodboard'),
  toolCallId: z.string(),
  imageUrl: z.string(),
  description: z.string(),
  attributes: z.array(z.string()),
  suggestedQuery: z.string(),
});

export const ReasoningChipEventSchema = z.object({
  type: z.literal('reasoning_chip'),
  productId: z.string(),
  chip: ReasoningChipSchema,
});

export const PreferenceUpdateSchema = z.object({
  type: z.literal('preference_update'),
  key: z.string(),
  value: z.unknown(),
  source: z.enum(['user', 'inferred', 'agent']),
});

export const OutfitEventSchema = z.object({
  type: z.literal('outfit'),
  toolCallId: z.string(),
  anchorProductId: z.string(),
  items: z.array(NormalizedProductSchema),
  rationale: z.string(),
});

export const ErrorEventSchema = z.object({
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

export const DoneEventSchema = z.object({
  type: z.literal('done'),
  turnsUsed: z.number(),
});

export const ServerEventSchema = z.discriminatedUnion('type', [
  TextDeltaSchema,
  ToolStatusSchema,
  ProductsEventSchema,
  ComparisonEventSchema,
  MoodboardEventSchema,
  ReasoningChipEventSchema,
  PreferenceUpdateSchema,
  OutfitEventSchema,
  ErrorEventSchema,
  DoneEventSchema,
]);

export type ServerEvent = z.infer<typeof ServerEventSchema>;
export type ServerEventType = ServerEvent['type'];

// Per-type schema lookup so the stream parser can validate by the SSE `event:`
// line without re-discriminating.
export const EVENT_SCHEMAS = {
  text_delta: TextDeltaSchema,
  tool_status: ToolStatusSchema,
  products: ProductsEventSchema,
  comparison: ComparisonEventSchema,
  moodboard: MoodboardEventSchema,
  reasoning_chip: ReasoningChipEventSchema,
  preference_update: PreferenceUpdateSchema,
  outfit: OutfitEventSchema,
  error: ErrorEventSchema,
  done: DoneEventSchema,
} as const satisfies Record<ServerEventType, z.ZodTypeAny>;
