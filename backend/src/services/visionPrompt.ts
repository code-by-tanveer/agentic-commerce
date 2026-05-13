/**
 * Vision-extraction system prompt + tolerant output parser.
 *
 * The agent loop wraps `extract_style_from_image`: this prompt is what we
 * hand the Groq vision model alongside the image. Hard requirements:
 *   - Output a single JSON object with these exact keys: description,
 *     attributes, suggestedQuery.
 *   - `attributes` is a string[] of at most 8 short phrases (≤4 words).
 *   - `suggestedQuery` is a single product-search-ready phrase.
 *
 * If the model misbehaves we fall back to `attributes: []`, which causes
 * the agent prompt addendum to trigger a clarifying question (cycle-4.md
 * acceptance criterion #5).
 */

export const VISION_PROMPT = `You are a product-style extractor for a shopping assistant. Look at the supplied image and return EXACTLY one JSON object describing what someone shopping for a similar item would care about. Do not include prose, markdown, or commentary — only the JSON.

Schema:
{
  "description": string,        // one short sentence, 8-25 words, factual not poetic
  "attributes": string[],       // 3-8 short tags: material, color, silhouette, style, pattern, era, etc. Each ≤4 words, lowercased.
  "suggestedQuery": string      // a product-search-ready phrase 3-10 words, e.g. "tan leather slingback flats"
}

Rules:
- If the image has clear foreground vs background (a product centered against a backdrop, an outfit photo with environmental context), describe only the foreground subject. Ignore background clutter, signage, watermarks, and adjacent unrelated items.
- If the image is too dark, blurry, or ambiguous to confidently extract attributes, return "attributes": [] and a "description" that names the difficulty plainly (e.g. "image is too dim to read color or fabric").
- Never guess the brand unless a logo is plainly legible.
- Never include people's names, faces, or PII in any field.
- Output ONLY the JSON object. No backticks, no leading "json", no trailing text.

Example:
{"description":"a cropped beige wool blazer with notched lapels and gold buttons","attributes":["wool","cropped","beige","blazer","notched lapel","gold buttons"],"suggestedQuery":"cropped beige wool blazer with gold buttons"}`;

export interface VisionOutput {
  description: string;
  attributes: string[];
  suggestedQuery: string;
}

/**
 * Tolerant parser for the vision model's response. Order of attempts:
 *   1. `JSON.parse` on the raw string.
 *   2. Extract the first top-level `{...}` substring and parse that.
 *   3. Heuristic regex: pull `description`, `attributes`, `suggestedQuery`
 *      out of free-form text.
 *   4. Final fallback: stuff the raw text into `description`, leave the
 *      rest empty — the agent prompt addendum will then ask a clarifying
 *      question.
 */
export function parseVisionOutput(raw: string): VisionOutput {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return { description: '', attributes: [], suggestedQuery: '' };
  }

  // Strip ```json fences if the model added them.
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  const direct = tryJson(stripped);
  if (direct) return direct;

  // Find first { ... matching } and try that.
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const slice = stripped.slice(start, end + 1);
    const fromSlice = tryJson(slice);
    if (fromSlice) return fromSlice;
  }

  // Regex fallback for malformed shapes.
  const descMatch = /"?description"?\s*[:=]\s*"([^"]*)"/i.exec(stripped);
  const queryMatch = /"?suggested[_ ]?query"?\s*[:=]\s*"([^"]*)"/i.exec(stripped);
  const attrsMatch = /"?attributes"?\s*[:=]\s*\[([^\]]*)\]/i.exec(stripped);
  if (descMatch || queryMatch || attrsMatch) {
    const attrs = attrsMatch
      ? attrsMatch[1]
          .split(',')
          .map((s) => s.trim().replace(/^"|"$/g, ''))
          .filter(Boolean)
          .slice(0, 8)
      : [];
    return {
      description: descMatch?.[1] ?? '',
      attributes: attrs,
      suggestedQuery: queryMatch?.[1] ?? '',
    };
  }

  return { description: trimmed, attributes: [], suggestedQuery: '' };
}

function tryJson(s: string): VisionOutput | null {
  try {
    const obj = JSON.parse(s) as unknown;
    if (!obj || typeof obj !== 'object') return null;
    const o = obj as Record<string, unknown>;
    const description = typeof o.description === 'string' ? o.description : '';
    const suggestedQuery =
      typeof o.suggestedQuery === 'string'
        ? o.suggestedQuery
        : typeof o.suggested_query === 'string'
          ? (o.suggested_query as string)
          : '';
    const rawAttrs = Array.isArray(o.attributes) ? o.attributes : [];
    const attributes = rawAttrs
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);
    return { description, attributes, suggestedQuery };
  } catch {
    return null;
  }
}
