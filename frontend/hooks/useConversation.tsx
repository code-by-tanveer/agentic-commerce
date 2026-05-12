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
        "Hi — tell me what you're shopping for. A vibe, a need, or a specific product. I'll surface options from Shopify merchants.",
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
      return {
        ...state,
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
            case 'error':
              return {
                ...m,
                status: 'error',
                blocks: [
                  ...m.blocks,
                  {
                    type: 'error',
                    code: event.code,
                    message: event.message,
                    retryable: event.retryable,
                  },
                ],
              };
            // 'done' handled by 'finalize'; 'preference_update', 'outfit',
            // 'moodboard', 'reasoning_chip' arrive in later cycles — ignore.
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

interface ConversationContextValue {
  sessionId: string | null;
  messages: Message[];
  isStreaming: boolean;
  // Back-compat for InputBar / Header — same field name, new meaning.
  isSearching: boolean;
  send: (text: string) => Promise<void>;
  retry: (messageId: string) => Promise<void>;
  reset: () => void;
}

const ConversationContext = createContext<ConversationContextValue | null>(null);

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
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || state.isStreaming) return;

      const userMessage: Message = {
        id: rid(),
        role: 'user',
        status: 'done',
        blocks: [{ type: 'text', text: trimmed }],
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

  const value = useMemo<ConversationContextValue>(
    () => ({
      sessionId: state.sessionId,
      messages: state.messages,
      isStreaming: state.isStreaming,
      isSearching: state.isStreaming,
      send,
      retry,
      reset,
    }),
    [state.sessionId, state.messages, state.isStreaming, send, retry, reset],
  );

  return <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>;
}

export function useConversation(): ConversationContextValue {
  const ctx = useContext(ConversationContext);
  if (!ctx) throw new Error('useConversation must be used inside <ConversationProvider>');
  return ctx;
}
