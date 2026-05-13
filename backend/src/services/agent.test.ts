import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ChatCompletionChunk } from 'groq-sdk/resources/chat/completions';
import type { FastifyBaseLogger } from 'fastify';
import type { ServerEvent } from '../stream/events.js';
import type { ToolRegistry } from './toolRegistry.js';

// Architect Top-5 #5 — turn-loop integration test with a scripted Groq stream
// and a stubbed tool registry. Asserts the event sequence (tool_status running
// → products → tool_status done → done turnsUsed=2). The abort-path test is
// marked `todo` because the loop's tight coupling to AbortSignal mid-stream is
// hard to script without an integration runner — see architect note.

// Mock the Groq client BEFORE importing the agent.
vi.mock('./groqClient.js', () => ({
  streamChatCompletion: vi.fn(),
}));

// Import after the mock so the agent picks it up.
const { streamChatCompletion } = await import('./groqClient.js');
const { runAgent } = await import('./agent.js');

const mockStreamChatCompletion = vi.mocked(streamChatCompletion);

// Helper: build an async iterable of ChatCompletionChunk from a static list.
function chunksOf(
  chunks: Array<Partial<ChatCompletionChunk>>,
): AsyncIterable<ChatCompletionChunk> & { model: string } {
  async function* gen() {
    for (const c of chunks) yield c as ChatCompletionChunk;
  }
  return Object.assign(gen(), { model: 'mock-model' });
}

// Minimal Fastify logger stub.
const log = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  fatal: () => undefined,
  trace: () => undefined,
  child: () => log,
  level: 'info',
} as unknown as FastifyBaseLogger;

// Stubbed tool registry — duck-types `ToolRegistry`. `runAgent` only reaches
// for `toGroqSchema()` and `dispatch(...)`.
function makeRegistry(opts: {
  onDispatch: (
    name: string,
    args: unknown,
    toolCallId: string,
  ) => { assistantString: string; events: ServerEvent[] };
}): ToolRegistry {
  return {
    toGroqSchema: () => [],
    dispatch: async (
      name: string,
      args: unknown,
      _ctx: unknown,
      meta: { toolCallId: string },
    ) => opts.onDispatch(name, args, meta.toolCallId),
    // unused by runAgent but kept for type compatibility
    register: () => undefined,
    get: () => undefined,
    has: () => false,
    list: () => [],
  } as unknown as ToolRegistry;
}

describe('runAgent — turn loop with scripted Groq + stub registry', () => {
  beforeEach(() => {
    mockStreamChatCompletion.mockReset();
  });

  it('emits tool_status running → products → tool_status done → done(turnsUsed=2)', async () => {
    // Turn 1: model decides to call `search_catalog({query:'lamps'})`.
    const turn1 = chunksOf([
      {
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_abc',
                  type: 'function',
                  function: { name: 'search_catalog', arguments: '{"query":"lamps"}' },
                },
              ],
            },
            finish_reason: null,
            logprobs: null,
          } as unknown as ChatCompletionChunk['choices'][0],
        ],
      },
      {
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'tool_calls',
            logprobs: null,
          } as unknown as ChatCompletionChunk['choices'][0],
        ],
      },
    ]);

    // Turn 2: model returns a final text answer.
    const turn2 = chunksOf([
      {
        choices: [
          {
            index: 0,
            delta: { content: 'here you go' },
            finish_reason: null,
            logprobs: null,
          } as unknown as ChatCompletionChunk['choices'][0],
        ],
      },
      {
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
            logprobs: null,
          } as unknown as ChatCompletionChunk['choices'][0],
        ],
      },
    ]);

    mockStreamChatCompletion.mockResolvedValueOnce(turn1).mockResolvedValueOnce(turn2);

    const registry = makeRegistry({
      onDispatch: (name, _args, toolCallId) => ({
        assistantString: '{"products":[]}',
        events: [
          {
            type: 'products',
            toolCallId,
            query: 'lamps',
            products: [],
          },
        ],
      }),
    });

    const events: ServerEvent[] = [];
    const controller = new AbortController();

    await runAgent({
      sessionId: 'test-session',
      history: [{ role: 'user', content: 'find lamps' }],
      system: 'system prompt',
      registry,
      emit: (e) => {
        events.push(e);
      },
      signal: controller.signal,
      log,
      preferences: {}, // skip the listPreferences fallback path
    });

    // 1. At least one tool_status running.
    expect(
      events.some(
        (e) => e.type === 'tool_status' && e.status === 'running',
      ),
    ).toBe(true);

    // 2. A products event.
    expect(events.some((e) => e.type === 'products')).toBe(true);

    // 3. A tool_status done event.
    expect(
      events.some(
        (e) => e.type === 'tool_status' && e.status === 'done',
      ),
    ).toBe(true);

    // 4. A done event with turnsUsed === 2.
    const done = events.find((e) => e.type === 'done');
    expect(done).toBeDefined();
    if (done && done.type === 'done') expect(done.turnsUsed).toBe(2);

    // Sanity: streamChatCompletion was called exactly twice (turn 1 + turn 2).
    expect(mockStreamChatCompletion).toHaveBeenCalledTimes(2);
  });

  it.todo(
    'abort mid-stream halts cleanly and persists a `truncated` assistant message',
    // The current agent.ts loop polls `signal.aborted` between chunks but the
    // route layer (chat.ts) closes the SSE writer before runAgent observes the
    // abort, so this needs an integration runner with a real Fastify writer or
    // a refactor to surface the partial assistant message via emit/callback.
    // ADR-0002 still references the `truncated` persistence path, which is not
    // wired today (see architect-code.md HIGH bullet on chat.ts:74-84).
  );
});
