import type { FastifyBaseLogger } from 'fastify';
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionToolMessageParam,
} from 'groq-sdk/resources/chat/completions';
import { env } from '../config/env.js';
import { appendMessage } from '../db/repos/messages.js';
import { listPreferences } from '../db/repos/preferences.js';
import { Cache } from './cache.js';
import { ContentSanitizer } from './contentSanitizer.js';
import { streamChatCompletion } from './groqClient.js';
import { RateLimitedError } from './groqBreaker.js';
import type { ToolRegistry } from './toolRegistry.js';
import type { ServerEvent } from '../stream/events.js';
import type { PreferencesSnapshot, ToolContext } from '../types/tool.js';

/**
 * polish-round-2 T2.1: ADR-0002 compliance. The agent loop accumulates every
 * user-visible block it emits (text deltas coalesced, tool result events
 * passed through as-is) and persists the assembled assistant turn on every
 * exit path — `done` writes status='done', the catch / abort branch writes
 * status='truncated' (or 'error' for an explicit failure). The FE's
 * `appendMessage` round-trip in `useConversation` is now defence-in-depth
 * redundancy: if the BE persistence succeeds, the FE write is a no-op
 * overwrite of the same shape; if either side drops, the other side has it.
 * Do NOT remove the FE call.
 */
type AssistantBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_status'; toolCallId: string; name: string; args?: unknown; status: 'running' | 'done' | 'error'; errorMessage?: string }
  | { type: 'products'; toolCallId: string; query: string; products: unknown[] }
  | { type: 'comparison'; toolCallId: string; products: unknown[]; axes: string[] }
  | { type: 'moodboard'; toolCallId: string; imageUrl: string; description: string; attributes: string[]; suggestedQuery: string }
  | { type: 'outfit'; toolCallId: string; anchorProductId: string; items: unknown[]; rationales?: (string | null)[]; rationale: string };

/**
 * Append an emitted SSE event to the running assistantBlocks list. Returns a
 * new list (immutable for traceability). Text deltas coalesce into the last
 * text block; tool_status with the same toolCallId+name replaces the prior
 * status frame so a running→done transition doesn't double-render on
 * persistence-side reload.
 */
function appendBlock(blocks: AssistantBlock[], event: ServerEvent): AssistantBlock[] {
  switch (event.type) {
    case 'text_delta': {
      const last = blocks[blocks.length - 1];
      if (last && last.type === 'text') {
        return [...blocks.slice(0, -1), { type: 'text', text: last.text + event.text }];
      }
      return [...blocks, { type: 'text', text: event.text }];
    }
    case 'tool_status': {
      const next: AssistantBlock = {
        type: 'tool_status',
        toolCallId: event.toolCallId,
        name: event.name,
        args: event.args,
        status: event.status,
        errorMessage: event.errorMessage,
      };
      const idx = blocks.findIndex(
        (b) => b.type === 'tool_status' && b.toolCallId === event.toolCallId && b.name === event.name,
      );
      if (idx === -1) return [...blocks, next];
      return [...blocks.slice(0, idx), next, ...blocks.slice(idx + 1)];
    }
    case 'products':
      return [...blocks, { type: 'products', toolCallId: event.toolCallId, query: event.query, products: event.products }];
    case 'comparison':
      return [...blocks, { type: 'comparison', toolCallId: event.toolCallId, products: event.products, axes: event.axes }];
    case 'moodboard':
      return [...blocks, { type: 'moodboard', toolCallId: event.toolCallId, imageUrl: event.imageUrl, description: event.description, attributes: event.attributes, suggestedQuery: event.suggestedQuery }];
    case 'outfit':
      return [
        ...blocks,
        {
          type: 'outfit',
          toolCallId: event.toolCallId,
          anchorProductId: event.anchorProductId,
          items: event.items,
          rationales: event.rationales,
          rationale: event.rationale,
        },
      ];
    // text_delta / preference_update / reasoning_chip / error / done are
    // either non-block side-channels (preference_update) or terminal frames
    // (error/done) — the agent writes status separately and does not snapshot
    // them as blocks.
    default:
      return blocks;
  }
}

/**
 * Appended to the base system prompt at agent-loop start. Cycle-2 directive
 * from cycle-2.md: extract size/budget/ships-to/shipping_speed proactively;
 * palette/ethics is user-initiated only.
 */
const PREFERENCE_SYSTEM_ADDENDUM = `
Preference memory: this session has a persistent preferences store. If the \
user states a preference (size, budget, ships-to, shipping speed), call \
\`save_preference\` BEFORE responding so the chat remembers. Do NOT proactively \
extract \`palette\`, \`ethics\`, or \`shopping_for\` — only save those when the \
user explicitly mentions them. You can call \`get_preferences\` if the context \
is unclear about what's already saved. When a relevant preference exists, fold \
it into your search filters (e.g. pass \`filters.ships_to\` to \
\`search_catalog\`).

Ethics is user-initiated (don't proactively save). When a user says \
"I care about ethical sourcing" or names a value, map it to the closest entry \
in this closed vocabulary: sustainable, fair-trade, organic, b-corp, \
women-owned, small-batch, vegan, recycled. If the user names multiple, save \
them all in a single \`save_preference\` call with \`key: "ethics"\` and \
\`value\` as the array of mapped values (e.g. \`["fair-trade", "b-corp"]\`). \
If a user says something vague like "ethical brands only" without naming a \
specific value, ask one short clarifying question listing the vocabulary \
before saving.

Shopping-for (gift use case) is user-initiated — don't proactively save. When \
a user explicitly states the recipient ("a gift for my niece", "buying for my \
dad", "shopping for myself"), map to one of: self, partner, kid_4_to_12, \
kid_13_to_17, adult_friend, parent. If the recipient doesn't cleanly map to \
one of those values, save the user's own phrase as the value (free-text is \
accepted). Save in a single \`save_preference\` call with \`key: \
"shopping_for"\`. Don't ask for the recipient unprompted — the persona who'd \
benefit from this lead will surface it themselves.

Comparisons: when the user asks "which is better at X", "compare X and Y on Z", \
or any side-by-side question naming a specific criterion (battery, weight, \
material, fit, screen size, sound quality, durability, etc.), call \
\`compare_products\` and ALWAYS pass an \`axes\` array that names that \
criterion verbatim (lowercased). For an open-ended "compare X and Y" with no \
stated criterion, omit \`axes\` to get the default price/rating/shipping rows. \
Never dump all eight default rows when the user asked about one thing — a \
focused \`axes\` array is what keeps the table on-topic.

Coordinated sets: when the user asks "what goes with X", "complete this look", \
"pair this with", or any similar coordinated-set request, call \
\`recommend_outfit(anchor_product_id=...)\`. Do NOT speculate about pairings in \
prose without calling the tool. If the user's message contains \
\`[pair_anchor:<id>]\` use that id verbatim as \`anchor_product_id\` — the FE \
appends it when the user taps the in-card "Pair with…" button so you don't \
need to re-look up the product. Do NOT echo the bracketed marker back to the \
user in your reply. If \`recommend_outfit\` returns a graceful \
"no_complementary_categories" result, report that plainly to the user — do not \
invent pairings to fill the gap.

Image inputs: when the user sends an image (a "find something like this" \
message with a moodboard upstream), trust the \`extract_style_from_image\` \
tool's output. Don't re-describe the image yourself. If \`attributes\` is empty \
or \`suggestedQuery\` looks generic, ask one specific clarifying question before \
searching. The tool only accepts \`signed:\` URLs minted by /api/upload — never \
pass an external http(s) URL.`.trim();

// R3-cleanup (architect-code LOW): promoted from file-local to
// `env.AGENT_MAX_TURNS` so ops can tune the turn budget without a code edit.
const MAX_TURNS = env.AGENT_MAX_TURNS;

/**
 * Rupee-bug mitigation (2026-05): `openai/gpt-oss-120b` was observed getting
 * stuck in a token-level repetition trap when asked about prices in rupees,
 * emitting `≈ ₹ ₹ ₹ ≈ ₹ ₹ ₹` until the SDK's default token budget exhausted.
 * Without an explicit cap, the model would fill thousands of tokens with the
 * degenerate pattern + trailing whitespace, producing a bubble that extended
 * outside its box on the FE.
 *
 * These three settings are the belt-and-braces fix:
 *  - `max_tokens` caps the per-turn output so a stuck model can't run away.
 *  - `frequency_penalty` discourages the repetition trap from forming in the
 *    first place at the sampler level.
 *  - `REPETITION_*` constants below drive a runtime detector that early-aborts
 *    the stream if the trap fires anyway (defence against a future regression
 *    on a different model where the penalty doesn't help).
 *
 * 800 tokens is enough for our longest sanctioned shopping-context answers
 * (verified against the cycle-7 prompt rubric); raising it would re-open the
 * spillover window. Tradeoff: an answer that legitimately needs >800 tokens
 * will be cut with `finish_reason=length` rather than continuing — the agent
 * loop handles that path the same as `stop` so the FE just sees `done`.
 */
const TEXT_MAX_TOKENS = 800;
const TEXT_FREQUENCY_PENALTY = 0.3;

/**
 * Rolling repetition detector: if the last N emitted-text segments
 * (text_deltas) are byte-identical AND short (≤8 chars), the stream is in a
 * degenerate state. 12 consecutive identical short deltas is well past any
 * legitimate pattern (markdown bullet lists, tables, etc. would tokenize to
 * varied chunks) and well before the user sees the bubble explode.
 */
const REPETITION_WINDOW = 12;
const REPETITION_MAX_CHUNK_LEN = 8;

export interface RunAgentOpts {
  sessionId: string;
  history: ChatCompletionMessageParam[];
  system: string;
  registry: ToolRegistry;
  /**
   * polish-round-2 T2.6: emit is async so the agent loop can apply
   * backpressure when `SseWriter` is waiting on a `drain`. Tools that emit
   * via `ctx.emit` (none today) get the same wrapped function — they may
   * fire-and-forget if they prefer.
   */
  emit: (event: ServerEvent) => void | Promise<void>;
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
    emit: rawEmit,
    signal,
    log,
    cache = new Cache(),
  } = opts;

  // polish-round-2 T2.1: every emit goes through this wrapper so the assistant
  // turn snapshot stays in lockstep with the SSE stream. The block list is
  // the exact ordered set of things the FE renders for this turn.
  // polish-round-2 T2.6: `emit` is async — the underlying SseWriter may need
  // to await `drain`. The agent loop awaits every emit so backpressure
  // propagates back into the Groq stream (chunk reads naturally slow as the
  // event loop is held on `drain`).
  let assistantBlocks: AssistantBlock[] = [];
  const emit = async (event: ServerEvent): Promise<void> => {
    assistantBlocks = appendBlock(assistantBlocks, event);
    await rawEmit(event);
  };

  const persistAssistant = async (
    status: 'done' | 'truncated' | 'error',
  ): Promise<void> => {
    if (assistantBlocks.length === 0) return;
    try {
      await appendMessage(sessionId, {
        role: 'assistant',
        blocks: assistantBlocks,
        status,
      });
    } catch (err) {
      // Persistence must never break the response. FE `appendMessage` round-trip
      // is the redundancy belt for exactly this case.
      log.warn({ err, status, sessionId }, 'failed to persist assistant turn');
    }
  };

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
    // No tool currently invokes ctx.emit — the registry's `toEvents` is the
    // sanctioned path. If a future tool wants progress events, it can
    // fire-and-forget (returned promise is ignored) since ToolContext.emit
    // is typed `void`. The wrapped `emit` here is the canonical async one.
    emit: (e: ServerEvent) => {
      void emit(e);
    },
    preferences,
    cache,
    signal,
  };

  try {
    for (let turn = 1; turn <= MAX_TURNS; turn++) {
      if (signal.aborted) {
        // R3-cleanup (architect-code MEDIUM): the prior `emit({...message:
        // 'aborted'...})` here was a no-op — `chat.ts` already closes the
        // writer in its `onClose` handler before this branch fires, so the
        // event would never reach the FE. Persisting `truncated` per ADR-0002
        // and returning is sufficient.
        await persistAssistant('truncated');
        return;
      }

      turnsUsed = turn;
      const isFinalTurn = turn === MAX_TURNS;

      let stream = await streamChatCompletion({
        model: env.GROQ_MODEL,
        messages,
        tools,
        tool_choice: isFinalTurn ? 'none' : 'auto',
        max_tokens: TEXT_MAX_TOKENS,
        frequency_penalty: TEXT_FREQUENCY_PENALTY,
        signal,
        // T2.12: symmetric usage tagging — text completion path tags every
        // call so `usage_log.jsonl` differentiates by tag, not by absence.
        usageTag: 'text',
        // T2.14: per-call `groq chat ok` log line with durationMs + token counts.
        log,
      });

      let aggregateContent = '';
      let toolCallAccumulator = new Map<number, AccumulatedToolCall>();
      let finishReason: 'stop' | 'length' | 'tool_calls' | 'function_call' | null = null;
      // Slot keys for tool-call accumulator are normally the streamed
      // `tc.index` from Groq. XML-recovered calls are synthesised after the
      // stream's own indices, starting at a high offset that can't collide.
      let xmlRecoveredSlotBase = 1_000_000;

      // Cycle 7: belt-and-braces sanitizer for any model that emits
      // Claude-style XML function calls in the content stream (e.g.
      // `<function(name){...}</function>`) instead of using OpenAI's
      // `tool_calls` channel. Buffers content across chunks because the open
      // tag may land in one chunk and the close in another. See
      // contentSanitizer.ts for the parser.
      let sanitizer = new ContentSanitizer();

      // llama-3.3-70b on Groq occasionally emits a malformed function call
      // (mixed XML/JSON syntax) for non-shopping messages, which surfaces as a
      // 400 `tool_use_failed` partway through the stream. Recover by re-running
      // the same turn with tools disabled — the model produces a clean text
      // response and the user never sees the underlying glitch. Distinct from
      // the XML-leak path above: this one fires when Groq itself rejects the
      // call before it ever reaches `delta.content`.
      // Rolling window of recent short text-delta emissions. When the model
      // gets stuck in a token-level repetition trap (see TEXT_MAX_TOKENS doc
      // above), the same short string lands here back-to-back. If the entire
      // window is identical, we early-terminate the stream instead of
      // forwarding the degenerate output to the FE.
      const recentChunks: string[] = [];
      const detectRepetition = (chunk: string): boolean => {
        if (chunk.length > REPETITION_MAX_CHUNK_LEN) {
          // Long chunks reset the detector — legitimate prose contains varied
          // tokenization, so any single emission this large is evidence the
          // model is not in a stuck state.
          recentChunks.length = 0;
          return false;
        }
        recentChunks.push(chunk);
        if (recentChunks.length > REPETITION_WINDOW) recentChunks.shift();
        if (recentChunks.length < REPETITION_WINDOW) return false;
        const first = recentChunks[0];
        return recentChunks.every((c) => c === first);
      };

      const consume = async (s: AsyncIterable<unknown>): Promise<void> => {
        for await (const chunk of s as AsyncIterable<{
          choices?: Array<{ delta?: { content?: string; tool_calls?: unknown }; finish_reason?: typeof finishReason }>;
        }>) {
          if (signal.aborted) return;
          const choice = chunk.choices?.[0];
          if (!choice) continue;
          const delta = choice.delta as
            | { content?: string; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> }
            | undefined;
          if (delta?.content) {
            const { safeText, foundCalls, droppedReasons } = sanitizer.feed(delta.content);
            if (safeText) {
              if (detectRepetition(safeText)) {
                log.warn(
                  { pattern: 'token-repetition', sample: safeText, window: REPETITION_WINDOW },
                  'detected degenerate token repetition; stopping stream early',
                );
                finishReason = 'stop';
                return;
              }
              aggregateContent += safeText;
              await emit({ type: 'text_delta', text: safeText });
            }
            for (const call of foundCalls) {
              log.warn({ pattern: 'xml-function-call', name: call.name }, 'model emitted xml-style function call; recovered');
              const idx = xmlRecoveredSlotBase++;
              toolCallAccumulator.set(idx, {
                id: `xml_recovered_${idx - 1_000_000}`,
                name: call.name,
                argsText: call.argsJson,
              });
              // Treat recovered calls as a tool_calls finish — the model
              // thought it called the tool, so we should dispatch and let it
              // continue rather than stop on the (possibly absent) finish
              // reason.
              finishReason = 'tool_calls';
            }
            for (const reason of droppedReasons) {
              log.warn({ pattern: 'xml-function-call', reason }, 'dropped malformed xml-style function call');
            }
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const slot = toolCallAccumulator.get(tc.index) ?? { id: '', name: '', argsText: '' };
              if (tc.id) slot.id = tc.id;
              if (tc.function?.name) slot.name = tc.function.name;
              if (tc.function?.arguments) slot.argsText += tc.function.arguments;
              toolCallAccumulator.set(tc.index, slot);
            }
          }
          if (choice.finish_reason) finishReason = choice.finish_reason;
        }
        // End-of-stream flush: empty the sanitizer's tail buffer so any
        // trailing safe text gets emitted (and any unclosed `<function` open
        // tag gets dropped with a log line).
        const tail = sanitizer.flush();
        if (tail.safeText) {
          aggregateContent += tail.safeText;
          await emit({ type: 'text_delta', text: tail.safeText });
        }
        for (const reason of tail.droppedReasons) {
          log.warn({ pattern: 'xml-function-call', reason }, 'dropped malformed xml-style function call at flush');
        }
      };

      try {
        await consume(stream);
      } catch (err) {
        const apiErr = err as { status?: number; error?: { code?: string } };
        const isToolUseFailed =
          apiErr?.status === 400 && apiErr?.error?.code === 'tool_use_failed';
        // Recover from tool_use_failed on ALL turns, including the final one.
        // On the final turn the cause is typically "tool_choice: none, but
        // model called a tool" — the model insists on another tool despite
        // our directive. Retrying with `tools: undefined` (below) guarantees
        // a clean text-only summary instead of leaving the user with an
        // error block after we already streamed real product cards.
        if (!isToolUseFailed) throw err;
        log.warn({ err, finalTurn: isFinalTurn }, 'groq tool_use_failed; retrying turn without tools on fallback model');
        // Discard any partial accumulation from the failed attempt — the BE
        // hasn't emitted anything FE-visible yet for this turn (text_delta
        // would only fire on `delta.content`, which doesn't accompany the
        // malformed tool call).
        aggregateContent = '';
        toolCallAccumulator = new Map();
        finishReason = null;
        sanitizer = new ContentSanitizer();
        xmlRecoveredSlotBase = 1_000_000;
        // Switch to the fallback model for the no-tools retry. `openai/gpt-
        // oss-120b` has been observed to ignore `tools: undefined` + `tool_
        // choice: 'none'` and hallucinate tool calls (e.g. `repo_browser.open_
        // file`), producing a second `tool_use_failed` on the retry itself.
        // `llama-3.1-8b-instant` respects the directive and produces clean
        // text-only summaries. If even the fallback fails the outer catch
        // below ends the turn gracefully so the user keeps the cards.
        try {
          stream = await streamChatCompletion({
            model: env.GROQ_FALLBACK_MODEL,
            messages,
            tools: undefined,
            tool_choice: 'none',
            max_tokens: TEXT_MAX_TOKENS,
            frequency_penalty: TEXT_FREQUENCY_PENALTY,
            signal,
            usageTag: 'text-fallback-no-tools',
            log,
          });
          await consume(stream);
        } catch (retryErr) {
          // Second-tier safety net: the user already has the streamed product
          // cards from the earlier turns. Rather than surfacing an error block,
          // log the retry failure and let the loop fall through to the
          // `done` emission below with empty `aggregateContent`. The UI shows
          // products without a closing paragraph — strictly better than
          // products + "Something went wrong".
          log.error({ retryErr }, 'fallback retry also failed; ending turn gracefully');
          aggregateContent = '';
          toolCallAccumulator = new Map();
          // Force the downstream branch to treat this as a terminal text turn
          // (no further tool calls), so the loop emits `done` cleanly with
          // whatever was streamed earlier this turn (typically nothing —
          // products already shipped on prior turns).
          finishReason = 'stop' as 'stop' | 'length' | 'tool_calls' | 'function_call' | null;
        }
      }

      if (signal.aborted) {
        await persistAssistant('truncated');
        return;
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
          await emit({ type: 'done', turnsUsed });
          await persistAssistant('done');
          return;
        }

        // Edge-case hardening (2026-05): the model can emit a tool-call
        // payload right as the user navigates away. The for-loop guard above
        // catches abort BETWEEN turns; this catches it between consuming the
        // LLM response and dispatching its tool calls. Without this check
        // we'd Promise.all() N MCP / vision RTTs against a doomed stream.
        if (signal.aborted) {
          await persistAssistant('truncated');
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
          await emit({
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
          for (const e of events) await emit(e);
          if (!errored) {
            await emit({
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
        await emit({ type: 'done', turnsUsed });
        await persistAssistant('done');
        return;
      }

      // Unknown finish reason: end gracefully.
      await emit({ type: 'done', turnsUsed });
      await persistAssistant('done');
      return;
    }

    // Hit max turns without resolution.
    await emit({ type: 'done', turnsUsed });
    await persistAssistant('done');
  } catch (err) {
    if (signal.aborted) {
      // FE bailed; don't emit (the stream is closed anyway). Persist whatever
      // we'd accumulated as `truncated` so reload-history reflects the real
      // mid-stream state per ADR-0002.
      await persistAssistant('truncated');
      return;
    }
    // Full raw error (stack + cause) goes to the log at error level. Only
    // the sanitized one-liner ships over SSE — Cycle 1 D2 security finding.
    log.error({ err }, 'agent loop failed');
    const mapped = classifyError(err);
    await emit({
      type: 'error',
      code: mapped.code,
      message: mapped.message,
      retryable: mapped.retryable,
    });
    await persistAssistant('error');
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
      message: 'Something went wrong on our side.',
      retryable: true,
    };
  }

  // Circuit-breaker short-circuit (ARCH §9). Distinct from the single-request
  // 429 branch below: this means the SERVER decided not to even attempt the
  // Groq call because the process-wide breaker is OPEN (or HALF_OPEN with a
  // probe in flight). The user sees a clean copy line instead of stuck
  // "thinking..." and FE retry logic can use the longer breaker cooldown.
  if (err instanceof RateLimitedError) {
    return {
      code: 'rate_limited',
      message:
        'Search is briefly paused due to upstream limits — try again in a few minutes.',
      retryable: true,
    };
  }
  const e = err as {
    status?: number;
    name?: string;
    code?: string | number;
    ucpCode?: string;
    error?: { code?: string; type?: string };
  };

  // McpError — UCP catalog/mcp transport failure. The UCP 2026-04-08
  // overview spec partitions JSON-RPC errors into a fixed set of code
  // classes; conflating them all into one retryable "couldn't reach
  // catalog" message hides a real distinction:
  //
  //   -32001 + ucpCode in {invalid_profile_url, profile_unreachable,
  //                        profile_malformed, version_unsupported}
  //          → CLIENT-config fault. Retrying with the same profile/version
  //            will fail the same way. `retryable: false`. These are ops
  //            problems (bad UCP_PROFILE_URL, profile not on a CDN, etc.) —
  //            surface them as invalid_request so the agent loop doesn't
  //            burn turns retrying.
  //   -32000 → transport-level (auth, rate limit, unavailable). Retryable.
  //   -32602 → invalid params (we sent bad shape). Not retryable.
  //   -32603 → internal server error. Retryable.
  //   anything else / no code → conservative `retryable: true`.
  if (e.name === 'McpError') {
    const jsonRpcCode = typeof e.code === 'number' ? e.code : undefined;
    const ucpCode = e.ucpCode;
    if (jsonRpcCode === -32001) {
      // -32001 always wraps a UCP discovery/negotiation failure; the inner
      // `ucpCode` is the actionable bit. All four documented codes are
      // operator-fix, not user-retry.
      return {
        code: 'invalid_request',
        message:
          ucpCode === 'version_unsupported'
            ? 'Catalog protocol version mismatch. Contact support.'
            : 'Catalog profile unavailable. Contact support.',
        retryable: false,
      };
    }
    if (jsonRpcCode === -32602) {
      return {
        code: 'invalid_request',
        message: "Couldn't reach the catalog.",
        retryable: false,
      };
    }
    return {
      code: 'mcp_error',
      message: "Couldn't reach the catalog.",
      retryable: true,
    };
  }

  // Groq rate limit: HTTP 429 OR error code `rate_limit_exceeded`.
  const groqErrCode = e.error?.code ?? e.code;
  if (e.status === 429 || groqErrCode === 'rate_limit_exceeded') {
    return {
      code: 'rate_limited',
      message: 'Hitting traffic. Retrying.',
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
      message: 'A tool failed.',
      retryable: false,
    };
  }

  // Groq 5xx / network-level (APIConnectionError etc. all surface with a
  // missing or >=500 status).
  if (typeof e.status === 'number' && e.status >= 500) {
    return {
      code: 'internal',
      message: 'Something went wrong on our side.',
      retryable: true,
    };
  }
  if (e.name === 'APIConnectionError' || e.name === 'APIConnectionTimeoutError') {
    return {
      code: 'internal',
      message: 'Something went wrong on our side.',
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
