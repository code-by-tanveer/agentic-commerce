import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import Groq from 'groq-sdk';
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
} from 'groq-sdk/resources/chat/completions';
import { env } from '../config/env.js';

const client = new Groq({ apiKey: env.GROQ_API_KEY });

/**
 * polish-round-2 T2.14: minimal logger surface so this module doesn't need to
 * import FastifyBaseLogger (cyclic-friendly). Callers pass through their
 * route/ctx logger; absence is fine — usage logging stays on stdout-less.
 */
export interface GroqLog {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

export interface StreamChatOpts {
  model?: string;
  messages: ChatCompletionMessageParam[];
  tools?: ChatCompletionTool[];
  tool_choice?: ChatCompletionToolChoiceOption;
  temperature?: number;
  /** Hard cap on output tokens. Cycle 4 uses this on the vision call. */
  max_tokens?: number;
  /**
   * OpenAI-shape `frequency_penalty` (range -2..2). Mitigates token-level
   * repetition traps observed on `openai/gpt-oss-120b` (e.g. the model
   * emitting `≈ ₹ ₹ ₹ ≈ ₹ ₹ ₹ ...` indefinitely when the rupee glyph hits a
   * degenerate state). Forwarded as-is to Groq.
   */
  frequency_penalty?: number;
  /** OpenAI-shape `presence_penalty` (range -2..2). Companion to frequency_penalty. */
  presence_penalty?: number;
  signal?: AbortSignal;
  /** Free-form tag forwarded into usage_log.jsonl so we can break out vision vs chat spend (cycle-4.md open question Q3). */
  usageTag?: string;
  /** polish-round-2 T2.14: when supplied, emits a `groq chat ok` log line at completion. */
  log?: GroqLog;
}

export interface NonStreamChatOpts extends Omit<StreamChatOpts, never> {
  // same shape; explicit alias for readability
}

const RETRIABLE_HTTP = new Set([429, 503]);

function jitter(baseMs: number): number {
  return baseMs + Math.floor(Math.random() * baseMs);
}

function isRetriable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: number };
  return typeof e.status === 'number' && RETRIABLE_HTTP.has(e.status);
}

/**
 * Edge-case hardening (2026-05): Groq sends `Retry-After` on 429 (and
 * sometimes 503) — sometimes seconds, sometimes a date. The earlier audit
 * flagged that we were ignoring it and burning quota with a fixed
 * jittered 400ms backoff while the server explicitly told us to wait longer.
 *
 * If the header is present and parses to a sane delay (≤30s — we don't want
 * to hold a request open longer than the user's likely patience), honour it
 * with a small jitter to avoid stampeding when many requests rate-limit at
 * once. Otherwise fall back to the original jittered base.
 */
const MAX_RETRY_AFTER_MS = 30_000;
function retryAfterDelay(err: unknown, fallbackBaseMs: number): number {
  if (!err || typeof err !== 'object') return jitter(fallbackBaseMs);
  // groq-sdk exposes response headers under `.headers` on its APIError shape.
  // Cast loosely — the SDK's type isn't exported in a stable way and we only
  // care about the one field.
  const headers = (err as { headers?: Record<string, string | string[] | undefined> }).headers;
  const raw = headers?.['retry-after'] ?? headers?.['Retry-After'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return jitter(fallbackBaseMs);
  // Numeric seconds form.
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    const ms = Math.min(Math.round(asNumber * 1000), MAX_RETRY_AFTER_MS);
    // Add ≤200ms jitter so concurrent retriers don't all wake at the same ms.
    return ms + Math.floor(Math.random() * 200);
  }
  // HTTP-date form.
  const asDate = Date.parse(value);
  if (Number.isFinite(asDate)) {
    const ms = Math.min(Math.max(asDate - Date.now(), 0), MAX_RETRY_AFTER_MS);
    return ms + Math.floor(Math.random() * 200);
  }
  return jitter(fallbackBaseMs);
}

/**
 * Abort-aware sleep. Resolves when either the timer fires OR the signal
 * aborts — whichever comes first. The caller then re-checks `signal.aborted`
 * to decide whether to skip the retry. Without this, a user-aborted request
 * still serves a retry attempt against Groq, which then throws a separate
 * AbortError downstream — wasted RTT and one extra log line per abort.
 */
function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, ms));
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Best-effort append of Groq usage to `usage_log.jsonl` next to the DB file.
 * Failures are swallowed; never blocks the request.
 */
async function recordUsage(
  model: string,
  usage: ChatCompletion['usage'] | undefined,
  meta: Record<string, unknown> = {},
): Promise<void> {
  try {
    if (!usage) return;
    const dir = dirname(resolve(env.DB_PATH));
    await mkdir(dir, { recursive: true });
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        model,
        usage,
        ...meta,
      }) + '\n';
    await appendFile(resolve(dir, 'usage_log.jsonl'), line, 'utf8');
  } catch {
    // R3-cleanup (architect-code LOW): best-effort — usage telemetry must
    // not break the request path. A full disk, EROFS, or any append failure
    // silently drops the line; the chat completion already succeeded.
  }
}

/**
 * Streaming chat completion with Groq's primary model, falling back to
 * GROQ_FALLBACK_MODEL on 429/503. The fallback is engaged once: if the
 * primary throws a retriable error we retry it once with jittered backoff,
 * and if that also fails we retry the same call against the fallback model.
 *
 * Returns an async iterator of ChatCompletionChunk. Caller is responsible
 * for parsing tool_calls/text out of each chunk.
 */
export async function streamChatCompletion(
  opts: StreamChatOpts,
): Promise<AsyncIterable<ChatCompletionChunk> & { model: string }> {
  const primary = opts.model ?? env.GROQ_MODEL;
  const fallback = env.GROQ_FALLBACK_MODEL;
  const tag = opts.usageTag;
  const log = opts.log;
  const startedAt = performance.now();

  const tryOnce = async (model: string) =>
    client.chat.completions.create(
      {
        model,
        messages: opts.messages,
        tools: opts.tools,
        tool_choice: opts.tool_choice,
        temperature: opts.temperature,
        max_tokens: opts.max_tokens,
        frequency_penalty: opts.frequency_penalty,
        presence_penalty: opts.presence_penalty,
        stream: true,
      },
      { signal: opts.signal },
    );

  try {
    const stream = await tryOnce(primary);
    return wrapStream(stream, primary, tag, log, startedAt);
  } catch (err) {
    if (!isRetriable(err)) throw err;
    // Edge-case hardening (2026-05): honour `Retry-After` if present, and
    // make the wait abort-aware — a user who navigated away should not
    // wake a retry attempt against Groq.
    await abortableDelay(retryAfterDelay(err, 400), opts.signal);
    if (opts.signal?.aborted) throw err;
    try {
      const stream = await tryOnce(primary);
      return wrapStream(stream, primary, tag, log, startedAt);
    } catch (err2) {
      if (!isRetriable(err2) || primary === fallback) throw err2;
      if (opts.signal?.aborted) throw err2;
      // fallback model — single attempt
      const stream = await tryOnce(fallback);
      return wrapStream(stream, fallback, tag, log, startedAt);
    }
  }
}

function wrapStream(
  stream: AsyncIterable<ChatCompletionChunk>,
  model: string,
  tag: string | undefined,
  log: GroqLog | undefined,
  startedAt: number,
): AsyncIterable<ChatCompletionChunk> & { model: string } {
  // Tap to record usage when the final chunk arrives.
  const tapped = (async function* () {
    let finalUsage: ChatCompletion['usage'] | undefined;
    for await (const chunk of stream) {
      // The chunk's `usage` field (when present) reflects cumulative usage at
      // stream end on Groq's OpenAI-shape stream.
      const usage = (chunk as ChatCompletionChunk & { usage?: ChatCompletion['usage'] }).usage;
      if (usage) {
        finalUsage = usage;
        void recordUsage(model, usage, tag ? { mode: 'stream', tag } : { mode: 'stream' });
      }
      yield chunk;
    }
    // polish-round-2 T2.14: emit a single durations + tokens log line per call
    // (after the stream is fully consumed).
    if (log) {
      const durationMs = Math.round(performance.now() - startedAt);
      log.info(
        {
          model,
          durationMs,
          promptTokens: finalUsage?.prompt_tokens,
          completionTokens: finalUsage?.completion_tokens,
          usageTag: tag,
        },
        'groq chat ok',
      );
    }
  })();
  return Object.assign(tapped, { model });
}

/**
 * Non-streaming chat completion. Same retry + fallback rules as streaming.
 */
export async function chatCompletion(opts: NonStreamChatOpts): Promise<ChatCompletion> {
  const primary = opts.model ?? env.GROQ_MODEL;
  const fallback = env.GROQ_FALLBACK_MODEL;
  const startedAt = performance.now();

  const tryOnce = (model: string) =>
    client.chat.completions.create(
      {
        model,
        messages: opts.messages,
        tools: opts.tools,
        tool_choice: opts.tool_choice,
        temperature: opts.temperature,
        max_tokens: opts.max_tokens,
        frequency_penalty: opts.frequency_penalty,
        presence_penalty: opts.presence_penalty,
        stream: false,
      },
      { signal: opts.signal },
    );

  let model = primary;
  let resp: ChatCompletion;
  try {
    resp = await tryOnce(primary);
  } catch (err) {
    if (!isRetriable(err)) throw err;
    await abortableDelay(retryAfterDelay(err, 400), opts.signal);
    if (opts.signal?.aborted) throw err;
    try {
      resp = await tryOnce(primary);
    } catch (err2) {
      if (!isRetriable(err2) || primary === fallback) throw err2;
      if (opts.signal?.aborted) throw err2;
      model = fallback;
      resp = await tryOnce(fallback);
    }
  }
  void recordUsage(model, resp.usage, opts.usageTag ? { mode: 'sync', tag: opts.usageTag } : { mode: 'sync' });
  // polish-round-2 T2.14: same shape as the streaming log line, emitted once.
  if (opts.log) {
    const durationMs = Math.round(performance.now() - startedAt);
    opts.log.info(
      {
        model,
        durationMs,
        promptTokens: resp.usage?.prompt_tokens,
        completionTokens: resp.usage?.completion_tokens,
        usageTag: opts.usageTag,
      },
      'groq chat ok',
    );
  }
  return resp;
}
