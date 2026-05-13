import type { FastifyBaseLogger } from 'fastify';
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionToolMessageParam,
} from 'groq-sdk/resources/chat/completions';
import { env } from '../config/env.js';
import { listPreferences } from '../db/repos/preferences.js';
import { Cache } from './cache.js';
import { streamChatCompletion } from './groqClient.js';
import type { ToolRegistry } from './toolRegistry.js';
import type { ServerEvent } from '../stream/events.js';
import type { PreferencesSnapshot, ToolContext } from '../types/tool.js';

/**
 * Appended to the base system prompt at agent-loop start. Cycle-2 directive
 * from cycle-2.md: extract size/budget/ships-to/shipping_speed proactively;
 * palette/ethics is user-initiated only.
 */
const PREFERENCE_SYSTEM_ADDENDUM = `
Preference memory: this session has a persistent preferences store. If the \
user states a preference (size, budget, ships-to, shipping speed), call \
\`save_preference\` BEFORE responding so the chat remembers. Do NOT proactively \
extract \`palette\` or \`ethics\` — only save those when the user explicitly \
mentions them. You can call \`get_preferences\` if the context is unclear about \
what's already saved. When a relevant preference exists, fold it into your \
search filters (e.g. pass \`filters.ships_to\` to \`search_catalog\`).

Coordinated sets: when the user asks "what goes with X", "complete this look", \
"pair this with", or any similar coordinated-set request, call \
\`recommend_outfit(anchor_product_id=...)\`. Do NOT speculate about pairings in \
prose without calling the tool. If \`recommend_outfit\` returns a graceful \
"no_complementary_categories" result, report that plainly to the user — do not \
invent pairings to fill the gap.

Image inputs: when the user sends an image (a "find something like this" \
message with a moodboard upstream), trust the \`extract_style_from_image\` \
tool's output. Don't re-describe the image yourself. If \`attributes\` is empty \
or \`suggestedQuery\` looks generic, ask one specific clarifying question before \
searching. The tool only accepts \`signed:\` URLs minted by /api/upload — never \
pass an external http(s) URL.`.trim();

const MAX_TURNS = 4;

export interface RunAgentOpts {
  sessionId: string;
  history: ChatCompletionMessageParam[];
  system: string;
  registry: ToolRegistry;
  emit: (event: ServerEvent) => void;
  signal: AbortSignal;
  log: FastifyBaseLogger;
  preferences?: PreferencesSnapshot;
  cache?: Cache;
}

interface AccumulatedToolCall {
  id: string;
  name: string;
  argsText: string;
}

export async function runAgent(opts: RunAgentOpts): Promise<void> {
  const {
    sessionId,
    history,
    system,
    registry,
    emit,
    signal,
    log,
    cache = new Cache(),
  } = opts;

  // Snapshot preferences ONCE per request and freeze for the loop. Tools
  // read from ctx.preferences but never re-load — see cycle-2.md hard rule.
  // Cycle 7 perf polish (T1.26): the chat route now kicks off `listPreferences`
  // in parallel with the SSE header flush and passes the resolved snapshot
  // here. The inline `listPreferences` fallback remains as a safety net for
  // any callers that don't pre-load (tests, future entry points).
  let preferences: PreferencesSnapshot = opts.preferences ?? ({} as PreferencesSnapshot);
  if (!opts.preferences) {
    try {
      preferences = (await listPreferences(sessionId)) as PreferencesSnapshot;
    } catch (err) {
      log.warn({ err }, 'failed to load preferences; continuing with empty snapshot');
    }
  }

  const prefsSummary = summarisePreferences(preferences);
  const composedSystem = prefsSummary
    ? `${system}\n\n${PREFERENCE_SYSTEM_ADDENDUM}\n\nCurrently saved preferences: ${prefsSummary}`
    : `${system}\n\n${PREFERENCE_SYSTEM_ADDENDUM}\n\nNo preferences saved yet.`;

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: composedSystem },
    ...history,
  ];

  const tools = registry.toGroqSchema();

  let turnsUsed = 0;

  const ctx: ToolContext = {
    sessionId,
    log,
    emit,
    preferences,
    cache,
    signal,
  };

  try {
    for (let turn = 1; turn <= MAX_TURNS; turn++) {
      if (signal.aborted) {
        emit({ type: 'error', code: 'internal', message: 'aborted', retryable: false });
        return;
      }

      turnsUsed = turn;
      const isFinalTurn = turn === MAX_TURNS;

      const stream = await streamChatCompletion({
        model: env.GROQ_MODEL,
        messages,
        tools,
        tool_choice: isFinalTurn ? 'none' : 'auto',
        signal,
      });

      let aggregateContent = '';
      const toolCallAccumulator = new Map<number, AccumulatedToolCall>();
      let finishReason: 'stop' | 'length' | 'tool_calls' | 'function_call' | null = null;

      for await (const chunk of stream) {
        if (signal.aborted) return;
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta;
        if (delta?.content) {
          aggregateContent += delta.content;
          emit({ type: 'text_delta', text: delta.content });
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const slot = toolCallAccumulator.get(tc.index) ?? {
              id: '',
              name: '',
              argsText: '',
            };
            if (tc.id) slot.id = tc.id;
            if (tc.function?.name) slot.name = tc.function.name;
            if (tc.function?.arguments) slot.argsText += tc.function.arguments;
            toolCallAccumulator.set(tc.index, slot);
          }
        }
        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }
      }

      // Append the assistant turn to history (with tool_calls if any).
      const orderedToolCalls = Array.from(toolCallAccumulator.entries())
        .sort(([a], [b]) => a - b)
        .map(([, v]) => v);

      if (orderedToolCalls.length > 0) {
        const assistantMsg: ChatCompletionAssistantMessageParam = {
          role: 'assistant',
          content: aggregateContent || null,
          tool_calls: orderedToolCalls.map(
            (t): ChatCompletionMessageToolCall => ({
              id: t.id || `call_${turn}_${Math.random().toString(36).slice(2, 8)}`,
              type: 'function',
              function: { name: t.name, arguments: t.argsText || '{}' },
            }),
          ),
        };
        messages.push(assistantMsg);
      } else if (aggregateContent) {
        messages.push({ role: 'assistant', content: aggregateContent });
      }

      if (finishReason === 'tool_calls' || orderedToolCalls.length > 0) {
        if (isFinalTurn) {
          // Should not happen — tool_choice=none on final turn — but defend.
          emit({ type: 'done', turnsUsed });
          return;
        }

        // Emit running statuses up-front.
        for (const tc of orderedToolCalls) {
          let parsedArgs: unknown;
          try {
            parsedArgs = tc.argsText ? JSON.parse(tc.argsText) : {};
          } catch {
            parsedArgs = { __raw: tc.argsText };
          }
          emit({
            type: 'tool_status',
            toolCallId: tc.id,
            name: tc.name,
            args: parsedArgs,
            status: 'running',
          });
        }

        // Dispatch in parallel.
        const dispatched = await Promise.all(
          orderedToolCalls.map(async (tc) => {
            let parsedArgs: unknown;
            try {
              parsedArgs = tc.argsText ? JSON.parse(tc.argsText) : {};
            } catch (err) {
              const message = err instanceof Error ? err.message : 'invalid_json';
              return {
                tc,
                assistantString: JSON.stringify({ error: 'invalid_json_args', detail: message }),
                events: [
                  {
                    type: 'tool_status' as const,
                    toolCallId: tc.id,
                    name: tc.name,
                    status: 'error' as const,
                    errorMessage: message,
                  },
                ],
              };
            }
            const result = await registry.dispatch(tc.name, parsedArgs, ctx, {
              toolCallId: tc.id,
            });
            return { tc, ...result };
          }),
        );

        for (const { tc, events, assistantString } of dispatched) {
          // Order: ship the data events first, then a `done` status, unless
          // dispatch already emitted an error status (in which case we skip
          // the implicit done).
          const errored = events.some(
            (e) => e.type === 'tool_status' && e.status === 'error',
          );
          for (const e of events) emit(e);
          if (!errored) {
            emit({
              type: 'tool_status',
              toolCallId: tc.id,
              name: tc.name,
              status: 'done',
            });
          }

          const toolMsg: ChatCompletionToolMessageParam = {
            role: 'tool',
            tool_call_id: tc.id,
            content: assistantString,
          };
          messages.push(toolMsg);
        }

        // loop to next turn
        continue;
      }

      // No tool calls — model has produced a text answer.
      if (finishReason === 'stop' || finishReason === 'length' || finishReason === null) {
        emit({ type: 'done', turnsUsed });
        return;
      }

      // Unknown finish reason: end gracefully.
      emit({ type: 'done', turnsUsed });
      return;
    }

    // Hit max turns without resolution.
    emit({ type: 'done', turnsUsed });
  } catch (err) {
    if (signal.aborted) {
      // FE bailed; don't emit (the stream is closed anyway).
      return;
    }
    // Full raw error (stack + cause) goes to the log at error level. Only
    // the sanitized one-liner ships over SSE — Cycle 1 D2 security finding.
    log.error({ err }, 'agent loop failed');
    const mapped = classifyError(err);
    emit({
      type: 'error',
      code: mapped.code,
      message: mapped.message,
      retryable: mapped.retryable,
    });
  }
}

type ErrorCode =
  | 'rate_limited'
  | 'mcp_error'
  | 'tool_error'
  | 'invalid_request'
  | 'internal';

interface ClassifiedError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

/**
 * Cycle 6 carry-over D2: produce a granular `(code, message, retryable)` for
 * every error class. The raw error stays in logs (above); only this sanitized
 * one-liner travels over the SSE `error` frame so we never leak Groq SDK or
 * MCP internals to the user.
 */
function classifyError(err: unknown): ClassifiedError {
  if (!err || typeof err !== 'object') {
    return {
      code: 'internal',
      message: "Something went wrong on our side. Try again?",
      retryable: true,
    };
  }
  const e = err as {
    status?: number;
    name?: string;
    code?: string;
    error?: { code?: string; type?: string };
  };

  // McpError — catalog unreachable / MCP-level failure.
  if (e.name === 'McpError') {
    return {
      code: 'mcp_error',
      message: "Couldn't reach the catalog. Retry?",
      retryable: true,
    };
  }

  // Groq rate limit: HTTP 429 OR error code `rate_limit_exceeded`.
  const groqErrCode = e.error?.code ?? e.code;
  if (e.status === 429 || groqErrCode === 'rate_limit_exceeded') {
    return {
      code: 'rate_limited',
      message: 'Hitting traffic — retrying in a few seconds.',
      retryable: true,
    };
  }

  // Auth / permission — surface as a generic "service unavailable" so we don't
  // hint at key state. Admins handle the rotation; users can't retry their way
  // out of it. Cycle 7 polish (T1.20): copy now matches `retryable: false`
  // (prior "Please try again." invited a retry the FE never rendered, and
  // wouldn't help if it did — the key is rotated server-side).
  if (
    e.status === 401 ||
    e.status === 403 ||
    groqErrCode === 'invalid_api_key'
  ) {
    return {
      code: 'invalid_request',
      message: 'Service unavailable. Contact support.',
      retryable: false,
    };
  }

  // Tool-dispatch throw bubbled out of `runAgent`. We tag those by `name`
  // when we surface them in this catch (rare — most tool throws are already
  // converted to `tool_status: error` inside the registry). If we ever do see
  // one here, it's not retryable as-is — the LLM picked bad args.
  if (e.name === 'ToolDispatchError') {
    return {
      code: 'tool_error',
      message: 'A tool failed. Try rephrasing?',
      retryable: false,
    };
  }

  // Groq 5xx / network-level (APIConnectionError etc. all surface with a
  // missing or >=500 status).
  if (typeof e.status === 'number' && e.status >= 500) {
    return {
      code: 'internal',
      message: "Something went wrong on our side. Try again?",
      retryable: true,
    };
  }
  if (e.name === 'APIConnectionError' || e.name === 'APIConnectionTimeoutError') {
    return {
      code: 'internal',
      message: "Something went wrong on our side. Try again?",
      retryable: true,
    };
  }

  return {
    code: 'internal',
    message: "Something went wrong on our side. Try again?",
    retryable: true,
  };
}

function summarisePreferences(prefs: PreferencesSnapshot): string {
  const parts: string[] = [];
  for (const [key, entry] of Object.entries(prefs)) {
    if (!entry) continue;
    const v = (entry as { value?: unknown }).value;
    parts.push(`${key}=${JSON.stringify(v)}`);
  }
  return parts.join(', ');
}
