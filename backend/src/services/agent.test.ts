import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ChatCompletionChunk } from 'groq-sdk/resources/chat/completions';
import type { FastifyBaseLogger } from 'fastify';
import type { ServerEvent } from '../stream/events.js';
import type { ToolRegistry } from './toolRegistry.js';

// Architect Top-5 #5 — turn-loop integration test with a scripted Groq stream
// and a stubbed tool registry. Asserts the event sequence (tool_status running
// → products → tool_status done → done turnsUsed=2). The Round-3 abort case
// resolves the prior `it.todo`: a scripted stream that yields one text_delta,
// then waits on the AbortSignal so abort fires mid-stream and the loop
// persists `truncated` per ADR-0002 / polish-round-2 T2.1.

// Mock the Groq client BEFORE importing the agent.
vi.mock('./groqClient.js', () => ({
  streamChatCompletion: vi.fn(),
}));

// polish-round-3: capture `appendMessage` calls so the abort case can assert
// the truncated-persist path without touching the real DB. The Round-2 test
// run-pre-Round-3 didn't import the messages repo here at all; mocking it now
// is harmless for the existing turn-loop case (that test reaches the `done`
// branch and triggers `appendMessage(..., status:'done')`, which the spy
// happily accepts).
vi.mock('../db/repos/messages.js', () => ({
  appendMessage: vi.fn().mockResolvedValue(undefined),
}));

// Import after the mocks so the agent picks them up.
const { streamChatCompletion } = await import('./groqClient.js');
const { appendMessage } = await import('../db/repos/messages.js');
const { runAgent } = await import('./agent.js');

const mockStreamChatCompletion = vi.mocked(streamChatCompletion);
const mockAppendMessage = vi.mocked(appendMessage);

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
    mockAppendMessage.mockReset();
    mockAppendMessage.mockResolvedValue(undefined as never);
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

  it('recovers an XML-style function call leaked into the content stream', async () => {
    // Turn 1: the model emits a `<function(...)>...</function>` block in the
    // content channel instead of using `tool_calls`. The sanitizer must
    // strip it from the SSE text stream and synthesise a tool dispatch.
    const turn1 = chunksOf([
      {
        choices: [
          {
            index: 0,
            delta: { content: 'sure thing ' },
            finish_reason: null,
            logprobs: null,
          } as unknown as ChatCompletionChunk['choices'][0],
        ],
      },
      {
        choices: [
          {
            index: 0,
            delta: {
              content:
                '<function(search_catalog){"query":"desk lamp"}</function>',
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
            // The model thought it called the tool but emitted `stop` —
            // the sanitizer should override finish_reason to tool_calls.
            finish_reason: 'stop',
            logprobs: null,
          } as unknown as ChatCompletionChunk['choices'][0],
        ],
      },
    ]);

    // Turn 2: post-tool, model produces a clean text answer.
    const turn2 = chunksOf([
      {
        choices: [
          {
            index: 0,
            delta: { content: 'here are some lamps' },
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

    mockStreamChatCompletion
      .mockResolvedValueOnce(turn1)
      .mockResolvedValueOnce(turn2);

    const registry = makeRegistry({
      onDispatch: (name, _args, toolCallId) => ({
        assistantString: '{"products":[]}',
        events: [
          {
            type: 'products',
            toolCallId,
            query: 'desk lamp',
            products: [],
          },
        ],
      }),
    });

    const events: ServerEvent[] = [];
    const controller = new AbortController();

    await runAgent({
      sessionId: 'xml-recovery-session',
      history: [{ role: 'user', content: 'find me a desk lamp' }],
      system: 'system prompt',
      registry,
      emit: (e) => {
        events.push(e);
      },
      signal: controller.signal,
      log,
      preferences: {},
    });

    // 1. The XML never leaked into a text_delta.
    const textDeltas = events.flatMap((e) =>
      e.type === 'text_delta' ? [e.text] : [],
    );
    const joined = textDeltas.join('');
    expect(joined).not.toContain('<function');
    expect(joined).not.toContain('</function>');

    // 2. The pre-XML text DID arrive.
    expect(joined).toContain('sure thing');

    // 3. A tool_status running fired (the sanitizer synthesised a call).
    const running = events.find(
      (e) => e.type === 'tool_status' && e.status === 'running',
    );
    expect(running).toBeDefined();
    if (running && running.type === 'tool_status') {
      expect(running.name).toBe('search_catalog');
      expect(running.toolCallId).toMatch(/^xml_recovered_/);
    }

    // 4. The tool was dispatched and produced a products event.
    expect(events.some((e) => e.type === 'products')).toBe(true);

    // 5. The agent looped to turn 2 and finished cleanly.
    const done = events.find((e) => e.type === 'done');
    expect(done).toBeDefined();
    if (done && done.type === 'done') expect(done.turnsUsed).toBe(2);

    // 6. streamChatCompletion was called twice (one tool turn + one finish).
    expect(mockStreamChatCompletion).toHaveBeenCalledTimes(2);
  });

  it('aborts mid-stream cleanly and persists a `truncated` assistant message', async () => {
    const controller = new AbortController();

    // Hand-rolled async iterable so we can interleave a yield with the
    // abort. Generator: yield chunk-1 (one text_delta), then await the
    // AbortSignal, then yield chunk-2. The agent's `if (signal.aborted)`
    // check fires at the top of the next iteration after chunk-2 lands.
    //
    // The shape mirrors what `wrapStream` returns: an async iterable with
    // a `.model` field tacked on.
    async function* gen(): AsyncGenerator<ChatCompletionChunk> {
      yield {
        choices: [
          {
            index: 0,
            delta: { content: 'partial ' },
            finish_reason: null,
            logprobs: null,
          } as unknown as ChatCompletionChunk['choices'][0],
        ],
      } as ChatCompletionChunk;

      // Wait for the abort to fire (or short fallback so the test can't
      // hang if the abort never lands).
      await new Promise<void>((resolve) => {
        if (controller.signal.aborted) return resolve();
        const onAbort = () => {
          controller.signal.removeEventListener('abort', onAbort);
          resolve();
        };
        controller.signal.addEventListener('abort', onAbort, { once: true });
        // Safety net in case something upstream forgets to abort.
        setTimeout(resolve, 500).unref?.();
      });

      // After abort fires, deliver one more chunk so the agent loop comes
      // back up the for-await and hits the `signal.aborted` guard at the
      // top of the next iteration.
      yield {
        choices: [
          {
            index: 0,
            delta: { content: 'never-emitted' },
            finish_reason: null,
            logprobs: null,
          } as unknown as ChatCompletionChunk['choices'][0],
        ],
      } as ChatCompletionChunk;
    }
    const stream = Object.assign(gen(), { model: 'mock-model' });
    mockStreamChatCompletion.mockResolvedValueOnce(stream);

    const registry = makeRegistry({
      onDispatch: () => ({ assistantString: '{}', events: [] }),
    });

    const events: ServerEvent[] = [];

    // Fire the abort shortly after `runAgent` starts. ~10ms is plenty for
    // the loop to consume chunk-1 and emit the first `text_delta`.
    const abortTimer = setTimeout(() => controller.abort(), 10);
    abortTimer.unref?.();

    await expect(
      runAgent({
        sessionId: 'abort-session',
        history: [{ role: 'user', content: 'find lamps' }],
        system: 'system prompt',
        registry,
        emit: (e) => {
          events.push(e);
        },
        signal: controller.signal,
        log,
        preferences: {},
      }),
    ).resolves.toBeUndefined();

    clearTimeout(abortTimer);

    // 1. The early text_delta DID arrive before the abort.
    const textDeltas = events.filter((e) => e.type === 'text_delta');
    expect(textDeltas.length).toBeGreaterThanOrEqual(1);
    if (textDeltas[0]?.type === 'text_delta') {
      expect(textDeltas[0].text).toBe('partial ');
    }

    // 2. No `done` and no extra text_deltas after the abort.
    expect(events.some((e) => e.type === 'done')).toBe(false);
    expect(textDeltas.length).toBe(1);

    // 3. `appendMessage` was called with status:'truncated' (ADR-0002 /
    //    polish-round-2 T2.1 compliance).
    expect(mockAppendMessage).toHaveBeenCalledTimes(1);
    const [sessionArg, msgArg] = mockAppendMessage.mock.calls[0]!;
    expect(sessionArg).toBe('abort-session');
    expect(msgArg).toMatchObject({
      role: 'assistant',
      status: 'truncated',
    });
    // The accumulated block snapshot must contain the partial text.
    const blocks = (msgArg as { blocks: Array<{ type: string; text?: string }> }).blocks;
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks.some((b) => b.type === 'text' && b.text === 'partial ')).toBe(
      true,
    );
  });

  // Regression for the 2026-05 "rupee bug": `openai/gpt-oss-120b` got stuck
  // in a token-level repetition trap, emitting `≈ ₹ ` over and over until the
  // stream filled. The agent loop must (a) detect the degenerate pattern and
  // early-terminate, and (b) request `max_tokens` + `frequency_penalty` on
  // every text-completion call so the trap is less likely to form in the
  // first place. This test asserts both: the SDK invocation includes the
  // mitigation params, and the FE never sees more than REPETITION_WINDOW
  // identical short text_deltas in a row even on a pathological stream.
  it('aborts early on degenerate token repetition and forwards penalty params', async () => {
    // 50 consecutive identical short deltas — way past the 12-chunk detector
    // window. A non-mitigated agent would forward all 50 to the FE; we expect
    // ≤12 + a sane terminator instead.
    const reptChunks = Array.from({ length: 50 }, () => ({
      choices: [
        {
          index: 0,
          delta: { content: '≈ ₹ ' },
          finish_reason: null,
          logprobs: null,
        } as unknown as ChatCompletionChunk['choices'][0],
      ],
    }));
    // Plus a final stop frame the model would emit if it ever escaped (it
    // shouldn't reach this in the asserted behaviour, but include it so the
    // test fails loudly if the early-abort regresses to forwarding everything).
    reptChunks.push({
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'stop',
          logprobs: null,
        } as unknown as ChatCompletionChunk['choices'][0],
      ],
    });

    // Prefix with one varied content chunk so the assistant-blocks snapshot
    // has at least one legitimate text emission for the FE to render.
    const leading = chunksOf([
      {
        choices: [
          {
            index: 0,
            delta: { content: 'sure, in rupees it is roughly ' },
            finish_reason: null,
            logprobs: null,
          } as unknown as ChatCompletionChunk['choices'][0],
        ],
      },
      ...reptChunks,
    ]);

    mockStreamChatCompletion.mockResolvedValueOnce(leading);

    const registry = makeRegistry({
      onDispatch: () => ({ assistantString: '', events: [] }),
    });

    const events: ServerEvent[] = [];
    const controller = new AbortController();

    await runAgent({
      sessionId: 'rupee-session',
      history: [{ role: 'user', content: 'in rupees?' }],
      system: 'system prompt',
      registry,
      emit: (e) => {
        events.push(e);
      },
      signal: controller.signal,
      log,
      preferences: {},
    });

    const textDeltas = events.filter(
      (e): e is Extract<ServerEvent, { type: 'text_delta' }> => e.type === 'text_delta',
    );

    // 1. The leading varied chunk got through.
    expect(textDeltas[0]?.text).toBe('sure, in rupees it is roughly ');

    // 2. The detector must have cut the stream before all 50 repeats reached
    //    the FE. We allow up to the detector window (12) of repetitions
    //    through — that's the trip threshold — but never 20+, and certainly
    //    never the full 50.
    const rupeeDeltas = textDeltas.filter((d) => d.text === '≈ ₹ ');
    expect(rupeeDeltas.length).toBeLessThanOrEqual(12);

    // 3. Stream completed cleanly (a `done` event was emitted — the user
    //    never saw an error frame for this defensive path).
    expect(events.some((e) => e.type === 'done')).toBe(true);

    // 4. Every text-completion call to Groq included the mitigation params.
    //    Without these, the model would have been more likely to enter the
    //    trap and would have run to its default token ceiling.
    expect(mockStreamChatCompletion).toHaveBeenCalled();
    const call = mockStreamChatCompletion.mock.calls[0]?.[0];
    expect(call?.max_tokens).toBe(800);
    expect(call?.frequency_penalty).toBe(0.3);

    // 5. The persisted assistant block contains the legitimate prefix and at
    //    most a small bounded suffix — no megablock of `≈ ₹ ` text.
    const [, msgArg] = mockAppendMessage.mock.calls[0]!;
    const blocks = (msgArg as { blocks: Array<{ type: string; text?: string }> }).blocks;
    const textBlock = blocks.find((b) => b.type === 'text');
    expect(textBlock?.text).toMatch(/^sure, in rupees it is roughly /);
    // The detector trips at 12 identical chunks; the text block contains
    // exactly the chunks emitted before the trip (≤12 × '≈ ₹ ' = ≤48 chars
    // of repetition, plus the 30-char prefix → well under 100 chars total).
    expect(textBlock?.text?.length ?? 0).toBeLessThan(100);
  });
});
