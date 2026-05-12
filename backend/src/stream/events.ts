import { z } from 'zod';

// ---------------------------------------------------------------------------
// Product shape (matches services/normalize.ts output). Re-stated as a Zod
// schema so we can validate every event before write.
// ---------------------------------------------------------------------------

const normalizedVariantSchema = z.object({
  id: z.string(),
  title: z.string(),
  price: z.number(),
  currency: z.string(),
  available: z.boolean(),
  checkoutUrl: z.string(),
  options: z.record(z.string()).optional(),
  shipsTo: z.array(z.string()).optional(),
});

// Reasoning chip — canonical shape, mirrored on the FE at
// `frontend/lib/events.ts::ReasoningChipSchema`. Any change here must land
// in both files in the same PR.
const reasoningChipSchema = z.object({
  kind: z.string(),                                            // e.g. 'size_match' | 'price' | 'shipping' | 'ethics' | 'discount'
  label: z.string(),                                           // short visible label, e.g. "size 8 match"
  detail: z.string().optional(),                               // longer tooltip copy revealed on tap/hover
  tone: z.enum(['positive', 'neutral', 'warning']).optional(), // visual treatment hint
});

const merchantInfoSchema = z.object({
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
} as const;
