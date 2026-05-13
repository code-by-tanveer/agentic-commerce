/**
 * Cycle 7: defensive sanitizer for models that emit Claude-style XML
 * function calls in the content stream instead of using OpenAI's
 * `tool_calls` channel.
 *
 * Observed in the wild on `llama-3.3-70b-versatile`. The model emits patterns
 * like
 *   <function(save_preference){"key":"budget","value":{...}}</function>
 *   <function=search_catalog{"query":"lamps"}</function>
 *   <function(name="search_catalog") {"query":"lamps"}</function>
 *   <function name="search_catalog">{"query":"lamps"}</function>
 * directly in `delta.content`, so the agent loop never sees them as tool
 * calls and they leak to the FE as text — the user sees raw XML and the
 * conversation hangs.
 *
 * This sanitizer is stateful because `delta.content` arrives in chunks: the
 * `<function` open tag may land in one chunk and the closing `</function>`
 * in another. It buffers any pending open until a safe boundary (no `<function`
 * tag waiting on a close), then flushes the rest as safe text.
 *
 * The primary mitigation is still picking a model that uses OpenAI tool_calls
 * natively (see ADR-0001 Cycle 7 addendum). This is belt-and-braces: if any
 * future model regresses, the user never sees XML and the recovered tool call
 * still dispatches.
 */

export interface RecoveredCall {
  name: string;
  argsJson: string;
}

export interface FeedResult {
  safeText: string;
  foundCalls: RecoveredCall[];
  /**
   * When the sanitizer drops a malformed `<function ...</function>` segment
   * (parse failed), it surfaces a short description here so the caller can
   * `log.warn` once per occurrence. Empty when nothing was dropped.
   */
  droppedReasons: string[];
}

export interface FlushResult {
  safeText: string;
  /**
   * `flush()` is called once at end-of-stream. If the buffer still has an
   * unclosed `<function...` open tag, we don't know whether the model meant
   * a real call or genuinely typed `<function` text. We drop it (it would
   * have leaked as XML otherwise) and surface a reason for logging.
   */
  droppedReasons: string[];
}

/**
 * Minimum bytes we want before deciding a `<function` open tag is "definitely
 * a function call" vs just the prefix of innocuous content. In practice all
 * four variants resolve well inside this window once the name appears.
 */
const OPEN_TAG = '<function';
const CLOSE_TAG = '</function>';

export class ContentSanitizer {
  private buffer = '';

  /**
   * Feed a chunk of `delta.content`. Returns whatever text is safe to emit
   * as `text_delta` (no pending `<function` open in it) and any function
   * calls that fully closed inside this feed.
   */
  feed(chunk: string): FeedResult {
    this.buffer += chunk;
    return this.drain(/* atEnd */ false);
  }

  /**
   * End-of-stream. Flush whatever text is left. If an open `<function` tag
   * is still pending without a close, drop it — it would have leaked as raw
   * XML to the FE otherwise.
   */
  flush(): FlushResult {
    const result = this.drain(/* atEnd */ true);
    const droppedReasons = [...result.droppedReasons];
    if (this.buffer.length > 0) {
      // Whatever's left starts with `<function` (or a prefix of it) — drain
      // already emitted everything safe before that point.
      const head = this.buffer.slice(0, 80);
      droppedReasons.push(`unclosed <function tag at stream end: ${head}`);
      this.buffer = '';
    }
    return { safeText: result.safeText, droppedReasons };
  }

  /**
   * Core drain loop. Walks the buffer, peeling off:
   *  - plain text up to the next `<function` (or a possible prefix of it),
   *  - completed `<function...>...</function>` segments → recovered calls,
   *  - malformed `<function...</function>` segments (drop + reason),
   *  - a trailing partial open tag → leave in the buffer for the next feed.
   */
  private drain(atEnd: boolean): FeedResult {
    let safeText = '';
    const foundCalls: RecoveredCall[] = [];
    const droppedReasons: string[] = [];

    while (this.buffer.length > 0) {
      const openIdx = this.buffer.indexOf(OPEN_TAG);

      if (openIdx === -1) {
        // No `<function` anywhere. We can emit everything except for a
        // trailing partial-prefix of OPEN_TAG, because the next chunk might
        // complete it (e.g. buffer ends with `<func` and next chunk is
        // `tion=search_catalog...`).
        const safeUpTo = atEnd ? this.buffer.length : safeTailBoundary(this.buffer);
        safeText += this.buffer.slice(0, safeUpTo);
        this.buffer = this.buffer.slice(safeUpTo);
        break;
      }

      // Emit everything before the open tag as safe text.
      if (openIdx > 0) {
        safeText += this.buffer.slice(0, openIdx);
        this.buffer = this.buffer.slice(openIdx);
      }

      // Buffer now starts at `<function`. Look for the close tag.
      const closeIdx = this.buffer.indexOf(CLOSE_TAG);
      if (closeIdx === -1) {
        // Open tag with no close yet. Wait for more content (unless we're
        // flushing — caller handles that by reading `this.buffer` after).
        break;
      }

      const segment = this.buffer.slice(0, closeIdx + CLOSE_TAG.length);
      this.buffer = this.buffer.slice(closeIdx + CLOSE_TAG.length);
      const parsed = parseFunctionSegment(segment);
      if (parsed.ok) {
        foundCalls.push({ name: parsed.name, argsJson: parsed.argsJson });
      } else {
        droppedReasons.push(parsed.reason);
      }
    }

    return { safeText, foundCalls, droppedReasons };
  }
}

/**
 * Find the boundary at which it's safe to emit `buffer[0..i)` without risking
 * cutting the start of a `<function` open tag mid-token. Returns the largest
 * `i` such that `buffer.slice(i)` is a proper prefix of OPEN_TAG (incl. empty).
 *
 * Examples (with OPEN_TAG = '<function'):
 *   "hello world"      → 11  (whole string safe)
 *   "hello <"          → 6   ('<' is a prefix of '<function')
 *   "hello <f"         → 6
 *   "hello <function"  → 6   ('<function' itself is a complete prefix)
 *   "hello <x"         → 8   ('<x' is not a prefix; whole string safe)
 */
function safeTailBoundary(buffer: string): number {
  const maxCheck = Math.min(OPEN_TAG.length, buffer.length);
  for (let k = maxCheck; k > 0; k--) {
    if (buffer.endsWith(OPEN_TAG.slice(0, k))) {
      return buffer.length - k;
    }
  }
  return buffer.length;
}

type ParseOutcome =
  | { ok: true; name: string; argsJson: string }
  | { ok: false; reason: string };

/**
 * Parse a single `<function...</function>` segment into a name + JSON args
 * string. Accepts the four observed variants and any near-miss formatting.
 */
function parseFunctionSegment(segment: string): ParseOutcome {
  // Slice off `<function` prefix and `</function>` suffix.
  if (!segment.startsWith(OPEN_TAG) || !segment.endsWith(CLOSE_TAG)) {
    return { ok: false, reason: 'segment missing open/close tag' };
  }
  const inner = segment.slice(OPEN_TAG.length, segment.length - CLOSE_TAG.length);

  // Find the first `{` — that's the start of the JSON args. Everything before
  // it is the name decorator: one of
  //   =name
  //   (name)
  //   (name="name")  + optional whitespace
  //    name="name">
  // (note the leading space variants — `<function name="...">`).
  const jsonStart = inner.indexOf('{');
  if (jsonStart === -1) return { ok: false, reason: 'no JSON args in segment' };

  const decorator = inner.slice(0, jsonStart);
  const rest = inner.slice(jsonStart);

  const name = extractName(decorator);
  if (!name) return { ok: false, reason: `could not extract name from "${decorator}"` };

  const argsJson = extractBalancedJson(rest);
  if (!argsJson) return { ok: false, reason: 'unbalanced JSON braces in segment' };

  // Sanity: argsJson must actually parse. If it doesn't, drop — a synthetic
  // tool call with broken JSON would fail in the dispatcher anyway, and the
  // user is better served seeing a clean recovery than the error path.
  try {
    JSON.parse(argsJson);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `args JSON parse failed: ${msg}` };
  }

  return { ok: true, name, argsJson };
}

/**
 * Pull the function name out of the decorator (text between `<function` and
 * the opening `{` of the args). Liberal in what it accepts.
 */
function extractName(decorator: string): string | null {
  // 1. `name="search_catalog"` form (variants 3 and 4).
  const quoted = /name\s*=\s*"([a-zA-Z_][a-zA-Z0-9_]*)"/.exec(decorator);
  if (quoted) return quoted[1] ?? null;

  // 2. `(name)` form (variant 2).
  const paren = /\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/.exec(decorator);
  if (paren) return paren[1] ?? null;

  // 3. `=name` form (variant 1).
  const eq = /=\s*([a-zA-Z_][a-zA-Z0-9_]*)/.exec(decorator);
  if (eq) return eq[1] ?? null;

  // 4. Bare identifier as a last resort, e.g. `<function search_catalog>`.
  const bare = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/.exec(decorator);
  if (bare) return bare[1] ?? null;

  return null;
}

/**
 * Read a balanced JSON object starting at `source[0] === '{'`. Returns the
 * substring up to and including the matching `}`, or null if unbalanced.
 * Handles nested objects, strings (with escaped quotes), and any trailing
 * garbage after the closing brace.
 */
function extractBalancedJson(source: string): string | null {
  if (source[0] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(0, i + 1);
    }
  }
  return null;
}
