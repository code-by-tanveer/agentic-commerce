import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
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

export interface StreamChatOpts {
  model?: string;
  messages: ChatCompletionMessageParam[];
  tools?: ChatCompletionTool[];
  tool_choice?: ChatCompletionToolChoiceOption;
  temperature?: number;
  signal?: AbortSignal;
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
    // best-effort
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

  const tryOnce = async (model: string) =>
    client.chat.completions.create(
      {
        model,
        messages: opts.messages,
        tools: opts.tools,
        tool_choice: opts.tool_choice,
        temperature: opts.temperature,
        stream: true,
      },
      { signal: opts.signal },
    );

  try {
    const stream = await tryOnce(primary);
    return wrapStream(stream, primary);
  } catch (err) {
    if (!isRetriable(err)) throw err;
    // retry once with jitter
    await new Promise((r) => setTimeout(r, jitter(400)));
    try {
      const stream = await tryOnce(primary);
      return wrapStream(stream, primary);
    } catch (err2) {
      if (!isRetriable(err2) || primary === fallback) throw err2;
      // fallback model — single attempt
      const stream = await tryOnce(fallback);
      return wrapStream(stream, fallback);
    }
  }
}

function wrapStream(
  stream: AsyncIterable<ChatCompletionChunk>,
  model: string,
): AsyncIterable<ChatCompletionChunk> & { model: string } {
  // Tap to record usage when the final chunk arrives.
  const tapped = (async function* () {
    for await (const chunk of stream) {
      // The chunk's `usage` field (when present) reflects cumulative usage at
      // stream end on Groq's OpenAI-shape stream.
      const usage = (chunk as ChatCompletionChunk & { usage?: ChatCompletion['usage'] }).usage;
      if (usage) void recordUsage(model, usage, { mode: 'stream' });
      yield chunk;
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

  const tryOnce = (model: string) =>
    client.chat.completions.create(
      {
        model,
        messages: opts.messages,
        tools: opts.tools,
        tool_choice: opts.tool_choice,
        temperature: opts.temperature,
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
    await new Promise((r) => setTimeout(r, jitter(400)));
    try {
      resp = await tryOnce(primary);
    } catch (err2) {
      if (!isRetriable(err2) || primary === fallback) throw err2;
      model = fallback;
      resp = await tryOnce(fallback);
    }
  }
  void recordUsage(model, resp.usage, { mode: 'sync' });
  return resp;
}
