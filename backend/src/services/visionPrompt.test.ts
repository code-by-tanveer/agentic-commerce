import { describe, expect, it } from 'vitest';
import { parseVisionOutput, VISION_PROMPT } from './visionPrompt.js';

// The vision tool ships the raw Groq output to `parseVisionOutput`, which
// has to survive the most common real-world malformations:
//   - markdown ```json fences
//   - trailing prose ("Here is the JSON: { ... } Hope this helps!")
//   - snake_case `suggested_query` key
//   - leading whitespace / BOM
//   - "attributes": null  (treated as empty)
//   - completely empty output (downgrade to attributes:[] so the agent
//     prompt addendum triggers a clarifying question per cycle-4.md
//     acceptance criterion #5)

describe('parseVisionOutput', () => {
  it('parses the canonical JSON output', () => {
    const raw =
      '{"description":"a cropped beige blazer","attributes":["wool","cropped","beige"],"suggestedQuery":"cropped beige wool blazer"}';
    const out = parseVisionOutput(raw);
    expect(out.description).toBe('a cropped beige blazer');
    expect(out.attributes).toEqual(['wool', 'cropped', 'beige']);
    expect(out.suggestedQuery).toBe('cropped beige wool blazer');
  });

  it('strips ```json fences', () => {
    const raw =
      '```json\n{"description":"x","attributes":["a","b"],"suggestedQuery":"q"}\n```';
    const out = parseVisionOutput(raw);
    expect(out.attributes).toEqual(['a', 'b']);
    expect(out.suggestedQuery).toBe('q');
  });

  it('handles trailing commentary by extracting the inner JSON object', () => {
    const raw =
      'Here is the JSON: {"description":"d","attributes":["a"],"suggestedQuery":"q"} hope this helps.';
    const out = parseVisionOutput(raw);
    expect(out.description).toBe('d');
    expect(out.attributes).toEqual(['a']);
  });

  it('accepts snake_case `suggested_query`', () => {
    const raw =
      '{"description":"d","attributes":["a"],"suggested_query":"q-snake"}';
    const out = parseVisionOutput(raw);
    expect(out.suggestedQuery).toBe('q-snake');
  });

  it('falls back to empty attributes on garbage input', () => {
    const out = parseVisionOutput('I have no idea what this is.');
    expect(out.attributes).toEqual([]);
    // Description is set to the raw text so the agent addendum sees
    // something to ask a clarifying question against.
    expect(out.description).toContain('I have no idea');
  });

  it('returns clean empty shape on empty input', () => {
    const out = parseVisionOutput('');
    expect(out).toEqual({
      description: '',
      attributes: [],
      suggestedQuery: '',
    });
  });

  it('caps attributes to 8 entries', () => {
    const many = Array.from({ length: 20 }, (_, i) => `attr${i}`);
    const raw = JSON.stringify({
      description: 'd',
      attributes: many,
      suggestedQuery: 'q',
    });
    const out = parseVisionOutput(raw);
    expect(out.attributes).toHaveLength(8);
  });

  it('drops non-string attribute entries', () => {
    const raw = JSON.stringify({
      description: 'd',
      attributes: ['ok', 123, null, 'fine', { x: 1 }],
      suggestedQuery: 'q',
    });
    const out = parseVisionOutput(raw);
    expect(out.attributes).toEqual(['ok', 'fine']);
  });

  it('survives a null/missing attributes field by emitting []', () => {
    const raw = '{"description":"d","attributes":null,"suggestedQuery":"q"}';
    const out = parseVisionOutput(raw);
    expect(out.attributes).toEqual([]);
    expect(out.description).toBe('d');
    expect(out.suggestedQuery).toBe('q');
  });

  it('exports the canonical system prompt unchanged', () => {
    // Snapshot guard — accidentally rewriting the prompt would silently
    // change the vision output shape for the entire app. If you mean to
    // change the prompt, update this assertion deliberately.
    expect(VISION_PROMPT).toContain('"description":');
    expect(VISION_PROMPT).toContain('"attributes":');
    expect(VISION_PROMPT).toContain('"suggestedQuery":');
    expect(VISION_PROMPT).toContain('Output ONLY the JSON object');
  });
});
