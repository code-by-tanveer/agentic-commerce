'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { ApiError, appendMessage, getOrCreateSession, type PreferenceKey } from '@/lib/api';
import { streamChat, StreamError, type ChatRequestMessage } from '@/lib/stream';
import type { NormalizedProduct, ServerEvent } from '@/lib/events';
import { useOptionalPreferences } from './usePreferences';

// ---------------------------------------------------------------------------
// Block model — assistant messages are an ordered list of typed sub-blocks
// (DESIGN.md §3 principle 5 — components are first-class peers of text).
// User messages always carry exactly one text block.
// ---------------------------------------------------------------------------

export type ToolStatusKind = 'running' | 'done' | 'error';

export interface TextBlock {
  type: 'text';
  text: string;
  // Cycle 4 — when the user drops/pastes an image, the text block carries a
  // signed upload URL so the bubble can render a thumbnail next to the text.
  // Optional and additive; pure-text messages omit it.
  imageUrl?: string;
}

// Cycle 4 — vision-extracted moodboard. Rendered as a small card above the
// next product results. Editable: each attribute chip is removable; the user
// can add new chips and trigger a refine (`useConversation.refineMoodboard`).
export interface MoodboardBlock {
  type: 'moodboard';
  toolCallId: string;
  imageUrl: string;
  description: string;
  attributes: string[];
  suggestedQuery: string;
}

export interface ToolStatusBlock {
  type: 'tool_status';
  toolCallId: string;
  name: string;
  args?: unknown;
  status: ToolStatusKind;
  errorMessage?: string;
}

export interface ProductsBlock {
  type: 'products';
  toolCallId: string;
  query: string;
  products: NormalizedProduct[];
}

export interface ComparisonBlock {
  type: 'comparison';
  toolCallId: string;
  products: NormalizedProduct[];
  axes: string[];
}

// Cycle 3 — `outfit` SSE events render as a single OutfitBundle inside the
// assistant message. The bundle is composition (anchor + 2-4 complementary
// items + per-bundle rationale).
//
// Round 2 polish: the event now carries a parallel `rationales` array
// (`rationales[i]` is the provenance string for `items[i]`, or null when no
// real signal supports it) that `OutfitBundle` renders per cell. We keep the
// bundle-level `rationale` for the header summary.
export interface OutfitBlock {
  type: 'outfit';
  toolCallId: string;
  anchorProductId: string;
  items: NormalizedProduct[];
  rationales?: (string | null)[];
  rationale: string;
}

export interface ErrorBlock {
  type: 'error';
  code: string;
  message: string;
  retryable: boolean;
}

export type Block =
  | TextBlock
  | ToolStatusBlock
  | ProductsBlock
  | ComparisonBlock
  | OutfitBlock
  | MoodboardBlock
  | ErrorBlock;

export type MessageStatus = 'streaming' | 'done' | 'error';
export type MessageRole = 'user' | 'assistant';

export interface Message {
  id: string;
  role: MessageRole;
  blocks: Block[];
  status?: MessageStatus;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

interface State {
  sessionId: string | null;
  messages: Message[];
  isStreaming: boolean;
}

type Action =
  | { type: 'session_ready'; sessionId: string }
  | { type: 'send'; userMessage: Message; assistantPlaceholder: Message }
  | { type: 'retry_reset'; assistantId: string }
  | { type: 'apply_event'; assistantId: string; event: ServerEvent }
  | { type: 'finalize'; assistantId: string }
  | { type: 'fail'; assistantId: string; error: ErrorBlock }
  | { type: 'reset' };

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  status: 'done',
  blocks: [
    {
      type: 'text',
      text:
        "Tell me what you're shopping for — a vibe, a need, a specific product. Results come from Shopify merchants, ranked by your preferences, not by paid placement.",
    },
  ],
};

const initialState: State = {
  sessionId: null,
  messages: [WELCOME],
  isStreaming: false,
};

function updateAssistant(
  messages: Message[],
  assistantId: string,
  fn: (m: Message) => Message,
): Message[] {
  return messages.map((m) => (m.id === assistantId ? fn(m) : m));
}

// Find or insert a tool_status block by toolCallId. Returns the new block list.
function upsertToolStatus(blocks: Block[], next: ToolStatusBlock): Block[] {
  const idx = blocks.findIndex(
    (b) => b.type === 'tool_status' && b.toolCallId === next.toolCallId,
  );
  if (idx === -1) return [...blocks, next];
  const copy = blocks.slice();
  copy[idx] = next;
  return copy;
}

// Append text to the last text block, or push a new one if the last block
// isn't text. Keeps streaming deltas coalesced.
function appendText(blocks: Block[], delta: string): Block[] {
  const last = blocks[blocks.length - 1];
  if (last && last.type === 'text') {
    const updated: TextBlock = { type: 'text', text: last.text + delta };
    return [...blocks.slice(0, -1), updated];
  }
  return [...blocks, { type: 'text', text: delta }];
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'session_ready':
      return { ...state, sessionId: action.sessionId };

    case 'send':
      return {
        ...state,
        messages: [...state.messages, action.userMessage, action.assistantPlaceholder],
        isStreaming: true,
      };

    case 'retry_reset':
      return {
        ...state,
        isStreaming: true,
        messages: updateAssistant(state.messages, action.assistantId, (m) => ({
          ...m,
          status: 'streaming',
          blocks: [],
        })),
      };

    case 'apply_event': {
      const { assistantId, event } = action;
      // Once the BE emits `error`, the SSE stream is terminal — the BE closes
      // the writer without a `done` event. Flipping `isStreaming: false` here
      // (in parallel with appending the error block below) unblocks `send`
      // and `retry`, which both early-return on `state.isStreaming`. Without
      // this, the input stays disabled and the Retry button is a no-op.
      const nextIsStreaming = event.type === 'error' ? false : state.isStreaming;
      return {
        ...state,
        isStreaming: nextIsStreaming,
        messages: updateAssistant(state.messages, assistantId, (m) => {
          switch (event.type) {
            case 'text_delta':
              return { ...m, blocks: appendText(m.blocks, event.text) };
            case 'tool_status':
              return {
                ...m,
                blocks: upsertToolStatus(m.blocks, {
                  type: 'tool_status',
                  toolCallId: event.toolCallId,
                  name: event.name,
                  args: event.args,
                  status: event.status,
                  errorMessage: event.errorMessage,
                }),
              };
            case 'products':
              return {
                ...m,
                blocks: [
                  ...m.blocks,
                  {
                    type: 'products',
                    toolCallId: event.toolCallId,
                    query: event.query,
                    products: event.products,
                  },
                ],
              };
            case 'comparison':
              return {
                ...m,
                blocks: [
                  ...m.blocks,
                  {
                    type: 'comparison',
                    toolCallId: event.toolCallId,
                    products: event.products,
                    axes: event.axes,
                  },
                ],
              };
            case 'outfit':
              // Cycle 3 — push as a sub-block on the assistant message. Do
              // NOT route through Shortlist; the user's explicit Save Outfit
              // action is what persists items to the Love lane. Round 2:
              // forward the parallel `rationales` array (may be undefined
              // when the BE has no per-item signal — OutfitBundle gates on
              // length and null-entries safely).
              return {
                ...m,
                blocks: [
                  ...m.blocks,
                  {
                    type: 'outfit',
                    toolCallId: event.toolCallId,
                    anchorProductId: event.anchorProductId,
                    items: event.items,
                    rationales: event.rationales,
                    rationale: event.rationale,
                  },
                ],
              };
            case 'moodboard':
              // Cycle 4 — push as a sub-block. The Moodboard component
              // renders inline above the next `products` block on the same
              // assistant turn.
              return {
                ...m,
                blocks: [
                  ...m.blocks,
                  {
                    type: 'moodboard',
                    toolCallId: event.toolCallId,
                    imageUrl: event.imageUrl,
                    description: event.description,
                    attributes: event.attributes,
                    suggestedQuery: event.suggestedQuery,
                  },
                ],
              };
            case 'error':
              return {
                ...m,
                status: 'error',
                blocks: [
                  ...m.blocks,
                  {
                    type: 'error',
                    code: event.code,
                    // Round 2 polish: when the BE classifies an error as
                    // `rate_limited` it ships a Groq-flavoured message
                    // ("Hitting traffic — retrying in a few seconds.") that
                    // doesn't tell the user the real failure mode they hit in
                    // this deploy: the daily Groq quota is finite and may be
                    // exhausted (see `docs/ARCHITECTURE.md`). Honest copy that
                    // names the daily-exhaust path keeps the retry affordance
                    // (still useful for transient bursts) and avoids the
                    // implicit "this will fix itself" promise.
                    message:
                      event.code === 'rate_limited'
                        ? 'Hitting traffic — try again in a moment. If this keeps happening, daily quota may be exhausted.'
                        : event.message,
                    retryable: event.retryable,
                  },
                ],
              };
            // 'done' handled by 'finalize'; 'preference_update' forwarded
            // above; 'reasoning_chip' is a Cycle 5+ side-channel — ignore.
            default:
              return m;
          }
        }),
      };
    }

    case 'finalize':
      return {
        ...state,
        isStreaming: false,
        messages: updateAssistant(state.messages, action.assistantId, (m) => ({
          ...m,
          status: m.status === 'error' ? 'error' : 'done',
        })),
      };

    case 'fail':
      return {
        ...state,
        isStreaming: false,
        messages: updateAssistant(state.messages, action.assistantId, (m) => ({
          ...m,
          status: 'error',
          blocks: [...m.blocks, action.error],
        })),
      };

    case 'reset':
      return { ...initialState, sessionId: state.sessionId };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context + provider
// ---------------------------------------------------------------------------

// Cycle 4 — send options. `imageUrl` rides on the user text block so the
// bubble can render an inline thumbnail; the wire history strips the image
// since the BE looks at the upstream `moodboard` event for the vision tool.
export interface SendOptions {
  imageUrl?: string;
}

// T1.27 — split context: state churns per text_delta; actions are stable.
// Consumers that only need actions (InputBar, MessageRenderer's retry path,
// Moodboard refine) subscribe to ConversationActionsContext and don't
// re-render per token.
interface ConversationStateValue {
  sessionId: string | null;
  messages: Message[];
  isStreaming: boolean;
  // Back-compat alias — same field name, new meaning.
  isSearching: boolean;
}

interface ConversationActionsValue {
  send: (text: string, opts?: SendOptions) => Promise<void>;
  retry: (messageId: string) => Promise<void>;
  refineMoodboard: (messageId: string, attributes: string[]) => Promise<void>;
  reset: () => void;
}

type ConversationContextValue = ConversationStateValue & ConversationActionsValue;

const ConversationStateContext = createContext<ConversationStateValue | null>(null);
const ConversationActionsContext = createContext<ConversationActionsValue | null>(null);

function rid(): string {
  return Math.random().toString(36).slice(2, 12);
}

// Flatten our internal Message[] into the wire-shape history the backend wants.
// Tool result blocks ride on the assistant turn's persisted record server-side;
// the request body only carries user + assistant text. (Backend reconstructs
// tool history from `messages` table for follow-ups.)
function toWireHistory(messages: Message[]): ChatRequestMessage[] {
  const out: ChatRequestMessage[] = [];
  for (const m of messages) {
    if (m.id === 'welcome') continue;
    const text = m.blocks
      .filter((b): b is TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    if (!text) continue;
    out.push({ role: m.role, content: text });
  }
  return out;
}

export function ConversationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef<AbortController | null>(null);
  // Optional — the PreferencesProvider may or may not be mounted (tests, etc.).
  // When present, we forward `preference_update` events into it so the
  // PreferencesCard updates without a refetch (cycle-2 acceptance #1).
  const prefs = useOptionalPreferences();
  // Keep a live ref so the streaming closure always sees the latest callback.
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  // Lazily resolve a session id on mount. Non-fatal if it fails (the user can
  // still chat — the server will mint one from the cookie).
  useEffect(() => {
    let cancelled = false;
    void getOrCreateSession()
      .then((s) => {
        if (!cancelled) dispatch({ type: 'session_ready', sessionId: s.id });
      })
      .catch(() => {
        // ignore; sessionId stays null
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Core streaming pump. Shared by send + retry.
  const run = useCallback(
    async (assistantId: string, wireHistory: ChatRequestMessage[], sessionId: string | null) => {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;

      try {
        for await (const event of streamChat(
          { sessionId: sessionId ?? undefined, messages: wireHistory },
          ctl.signal,
        )) {
          if (event.type === 'done') {
            dispatch({ type: 'finalize', assistantId });
            break;
          }
          // `preference_update` doesn't belong to the assistant message — it's
          // a side-channel notification. Forward to the PreferencesProvider
          // (if mounted) and DO NOT block or alter the stream.
          if (event.type === 'preference_update') {
            prefsRef.current?.applyServerUpdate(
              event.key as PreferenceKey,
              event.value,
              event.source,
            );
            continue;
          }
          dispatch({ type: 'apply_event', assistantId, event });
        }
      } catch (err) {
        const message =
          err instanceof StreamError
            ? err.kind === 'http'
              ? 'The server rejected the request.'
              : err.kind === 'aborted'
                ? 'Cancelled.'
                : "Connection lost. Try again?"
            : err instanceof ApiError
              ? err.message
              : 'Something went wrong.';
        dispatch({
          type: 'fail',
          assistantId,
          error: {
            type: 'error',
            code: err instanceof StreamError ? err.kind : 'internal',
            message,
            retryable: true,
          },
        });
        return;
      } finally {
        if (abortRef.current === ctl) abortRef.current = null;
      }

      // Best-effort persistence checkpoint. Graceful no-op on failure — the
      // next request's body is the canonical history regardless.
      if (sessionId) {
        // Snapshot the message from the latest state via the ref-free path:
        // we re-read the current message list right before persisting.
        const snapshot = latestMessageRef.current?.(assistantId);
        if (snapshot) {
          try {
            await appendMessage(sessionId, {
              id: snapshot.id,
              role: snapshot.role,
              blocks: snapshot.blocks,
              status: snapshot.status,
            });
          } catch {
            // ignore — persistence is non-fatal
          }
        }
      }
    },
    [],
  );

  // Stash a snapshot accessor so `run` (which closes over the initial state)
  // can still read the post-finalize message. Updated every render.
  const latestMessageRef = useRef<((id: string) => Message | undefined) | null>(null);
  latestMessageRef.current = (id: string) => state.messages.find((m) => m.id === id);

  const send = useCallback(
    async (text: string, opts?: SendOptions) => {
      const trimmed = text.trim();
      if (!trimmed || state.isStreaming) return;

      const userMessage: Message = {
        id: rid(),
        role: 'user',
        status: 'done',
        blocks: [{ type: 'text', text: trimmed, imageUrl: opts?.imageUrl }],
      };
      const assistantId = rid();
      const assistantPlaceholder: Message = {
        id: assistantId,
        role: 'assistant',
        status: 'streaming',
        blocks: [],
      };
      dispatch({ type: 'send', userMessage, assistantPlaceholder });

      const wire = toWireHistory([...state.messages, userMessage]);
      // When a signed upload URL rides along, append it to the user content so
      // the backend agent can pass it to `extract_style_from_image`. The
      // BE-side SSRF gate rejects anything that's not a `signed:` URL.
      if (opts?.imageUrl && wire.length > 0) {
        const last = wire[wire.length - 1];
        wire[wire.length - 1] = {
          ...last,
          content: `${last.content}\n\n[attached image: ${opts.imageUrl}]`,
        };
      }
      await run(assistantId, wire, state.sessionId);
    },
    [run, state.isStreaming, state.messages, state.sessionId],
  );

  const refineMoodboard = useCallback(
    async (messageId: string, attributes: string[]) => {
      if (state.isStreaming) return;
      const idx = state.messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      const refined = attributes
        .map((a) => a.trim())
        .filter(Boolean)
        .join(', ');
      if (!refined) return;

      // Re-send the conversation up to (and including) the moodboard's turn,
      // appending a synthetic user message that nudges the agent to re-search
      // with the edited attributes. The agent's existing system prompt will
      // route this through `search_catalog`.
      const priorWire = toWireHistory(state.messages.slice(0, idx + 1));
      const userMessage: Message = {
        id: rid(),
        role: 'user',
        status: 'done',
        blocks: [{ type: 'text', text: `Refine search: ${refined}` }],
      };
      const assistantId = rid();
      const assistantPlaceholder: Message = {
        id: assistantId,
        role: 'assistant',
        status: 'streaming',
        blocks: [],
      };
      dispatch({ type: 'send', userMessage, assistantPlaceholder });
      const wire: ChatRequestMessage[] = [
        ...priorWire,
        { role: 'user', content: `Refine search: ${refined}` },
      ];
      await run(assistantId, wire, state.sessionId);
    },
    [run, state.isStreaming, state.messages, state.sessionId],
  );

  const retry = useCallback(
    async (messageId: string) => {
      if (state.isStreaming) return;
      const idx = state.messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      const failed = state.messages[idx];
      if (failed.role !== 'assistant') return;

      // Reconstruct the wire history up to (but excluding) the failed turn,
      // then reset the assistant message in place and rerun.
      const priorWire = toWireHistory(state.messages.slice(0, idx));
      dispatch({ type: 'retry_reset', assistantId: failed.id });
      await run(failed.id, priorWire, state.sessionId);
    },
    [run, state.isStreaming, state.messages, state.sessionId],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: 'reset' });
  }, []);

  const stateValue = useMemo<ConversationStateValue>(
    () => ({
      sessionId: state.sessionId,
      messages: state.messages,
      isStreaming: state.isStreaming,
      isSearching: state.isStreaming,
    }),
    [state.sessionId, state.messages, state.isStreaming],
  );

  // Actions are referentially stable (their identity only changes when their
  // own deps shift), so this memo barely ever invalidates — components that
  // only consume actions don't re-render per text_delta.
  const actionsValue = useMemo<ConversationActionsValue>(
    () => ({ send, retry, refineMoodboard, reset }),
    [send, retry, refineMoodboard, reset],
  );

  return (
    <ConversationStateContext.Provider value={stateValue}>
      <ConversationActionsContext.Provider value={actionsValue}>
        {children}
      </ConversationActionsContext.Provider>
    </ConversationStateContext.Provider>
  );
}

export function useConversationState(): ConversationStateValue {
  const ctx = useContext(ConversationStateContext);
  if (!ctx)
    throw new Error('useConversationState must be used inside <ConversationProvider>');
  return ctx;
}

export function useConversationActions(): ConversationActionsValue {
  const ctx = useContext(ConversationActionsContext);
  if (!ctx)
    throw new Error('useConversationActions must be used inside <ConversationProvider>');
  return ctx;
}

// Back-compat: existing consumers using `useConversation()` continue to work —
// they get both halves merged. New code should prefer the split hooks to
// minimise re-renders.
export function useConversation(): ConversationContextValue {
  return { ...useConversationState(), ...useConversationActions() };
}
