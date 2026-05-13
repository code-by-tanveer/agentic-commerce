import { describe, expect, it } from 'vitest';
import {
  eventSchemas,
  serverEventSchema,
  type ServerEvent,
  type ServerEventType,
} from './events.js';

// Architect Top-5 #4 — drift defence between the BE event emitters and the
// shared `@agentic/events` Zod schemas. Every arm of the discriminated union
// gets a minimal-valid + minimal-invalid round-trip.

// Minimal-valid payloads per discriminated arm.
const validFixtures: Record<ServerEventType, ServerEvent> = {
  text_delta: { type: 'text_delta', text: 'hi' },
  tool_status: {
    type: 'tool_status',
    toolCallId: 'call_1',
    name: 'search_catalog',
    status: 'running',
  },
  products: {
    type: 'products',
    toolCallId: 'call_1',
    query: 'lamps',
    products: [],
  },
  comparison: {
    type: 'comparison',
    toolCallId: 'call_1',
    products: [],
    axes: [],
  },
  moodboard: {
    type: 'moodboard',
    toolCallId: 'call_1',
    imageUrl: 'signed:abc',
    description: 'desc',
    attributes: [],
    suggestedQuery: 'q',
  },
  reasoning_chip: {
    type: 'reasoning_chip',
    productId: 'p1',
    chip: { kind: 'discount', label: '20% off' },
  },
  preference_update: {
    type: 'preference_update',
    key: 'size',
    value: 'M',
    source: 'user',
  },
  outfit: {
    type: 'outfit',
    toolCallId: 'call_1',
    anchorProductId: 'p1',
    items: [],
    rationale: 'goes together',
  },
  error: {
    type: 'error',
    code: 'internal',
    message: 'oops',
    retryable: true,
  },
  done: { type: 'done', turnsUsed: 1 },
};

// Minimal invalid payloads — each omits or breaks a required field.
const invalidFixtures: Record<ServerEventType, unknown> = {
  text_delta: { type: 'text_delta' }, // missing `text`
  tool_status: { type: 'tool_status', toolCallId: 'c', name: 'n' }, // missing status
  products: { type: 'products', toolCallId: 'c', products: [] }, // missing `query`
  comparison: { type: 'comparison', toolCallId: 'c', products: [] }, // missing `axes`
  moodboard: { type: 'moodboard', toolCallId: 'c' }, // missing imageUrl/description/...
  reasoning_chip: { type: 'reasoning_chip', productId: 'p' }, // missing chip
  preference_update: {
    type: 'preference_update',
    key: 'banana', // not in PREFERENCE_KEYS enum (post-Round-1 lift)
    value: 'x',
    source: 'user',
  },
  outfit: { type: 'outfit', toolCallId: 'c', anchorProductId: 'p', items: [] }, // missing rationale
  error: { type: 'error', code: 'internal', message: 'm' }, // missing retryable
  done: { type: 'done' }, // missing turnsUsed
};

describe('serverEventSchema', () => {
  it('exposes a schema for every ServerEventType arm', () => {
    // Keys of `eventSchemas` are the source of truth for the union types.
    expect(Object.keys(eventSchemas).sort()).toEqual(
      [
        'comparison',
        'done',
        'error',
        'moodboard',
        'outfit',
        'preference_update',
        'products',
        'reasoning_chip',
        'text_delta',
        'tool_status',
      ].sort(),
    );
  });

  for (const type of Object.keys(eventSchemas) as ServerEventType[]) {
    it(`parses a minimal-valid '${type}' payload`, () => {
      const fixture = validFixtures[type];
      const parsed = serverEventSchema.parse(fixture);
      expect(parsed.type).toBe(type);
    });

    it(`rejects a minimal-invalid '${type}' payload`, () => {
      const r = serverEventSchema.safeParse(invalidFixtures[type]);
      expect(r.success).toBe(false);
    });
  }

  it("rejects preference_update.key === 'banana' (post-Round-1 enum lift)", () => {
    const r = serverEventSchema.safeParse({
      type: 'preference_update',
      key: 'banana',
      value: 'x',
      source: 'user',
    });
    expect(r.success).toBe(false);
  });
});
