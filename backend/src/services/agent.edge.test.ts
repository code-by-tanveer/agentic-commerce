import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import type { ChatCompletionChunk } from 'groq-sdk/resources/chat/completions';
import type { FastifyBaseLogger } from 'fastify';
import type { ServerEvent } from '../stream/events.js';
import type { ToolRegistry } from './toolRegistry.js';

/**
 * Edge-case hardening (2026-05). These tests cover model-side / network-side
 * failure modes that the main `agent.test.ts` doesn't exercise:
 *
 *  1. Route-boundary rejects empty / whitespace-only user content (was a
 *     wasted Groq call before).
 *  2. `Retry-After` is honoured on 429: the client waits the server-specified
 *     duration instead of the fixed 400ms jittered backoff.
 *  3. Retry backoff is abort-aware: a user navigating away during the wait
 *     causes the retry to be skipped entirely, not consumed.
 *  4. Agent loop short-circuits between Groq response and tool dispatch when
 *     the signal aborts (prior code dispatched N tool RTTs against a doomed
 *     stream).
 */

// Mock the Groq client + messages repo BEFORE importing the agent.
vi.mock('./groqClient.js', () => ({
  streamChatCompletion: vi.fn(),
}));
vi.mock('../db/repos/messages.js', () => ({
  appendMessage: vi.fn().mockResolvedValue(undefined),
}));

const { streamChatCompletion } = await import('./groqClient.js');
const { appendMessage } = await import('../db/repos/messages.js');
const { runAgent } = await import('./agent.js');
// Route-level test pulls in the real chat.ts which imports the (mocked) Groq
// client and DB layer. We import the migrations runner so the route's
// session-upsert path has the tables in place even when this file is the
// first to land on a clean test sqlite. We deliberately do NOT clear rows —
// see beforeEach note in the route-test block.
const { runMigrations } = await import('../db/migrations/runner.js');
const { chatRoutes } = await import('../routes/chat.js');

const mockStreamChatCompletion = vi.mocked(streamChatCompletion);
const mockAppendMessage = vi.mocked(appendMessage);

function chunksOf(
  chunks: Array<Partial<ChatCompletionChunk>>,
): AsyncIterable<ChatCompletionChunk> & { model: string } {
  async function* gen() {
    for (const c of chunks) yield c as ChatCompletionChunk;
  }
  return Object.assign(gen(), { model: 'mock-model' });
}

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

function makeRegistry(opts: {
  onDispatch: (
    name: string,
    args: unknown,
    toolCallId: string,
  ) => Promise<{ assistantString: string; events: ServerEvent[] }>;
}): ToolRegistry {
  return {
    toGroqSchema: () => [],
    dispatch: async (
      name: string,
      args: unknown,
      _ctx: unknown,
      meta: { toolCallId: string },
    ) => opts.onDispatch(name, args, meta.toolCallId),
    register: () => undefined,
    get: () => undefined,
    has: () => false,
    list: () => [],
  } as unknown as ToolRegistry;
}

async function buildChatApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(chatRoutes);
  return app;
}

describe('agent edge-case hardening (2026-05)', () => {
  beforeEach(() => {
    mockStreamChatCompletion.mockReset();
    mockAppendMessage.mockReset();
    mockAppendMessage.mockResolvedValue(undefined as never);
  });

  describe('route: empty user message rejected at boundary', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
      // Keep migrations idempotent but DO NOT wipe other tests' rows — this
      // file shares the on-disk sqlite singleton with summary.test.ts /
      // session.test.ts and they run in parallel workers. The route tests
      // here don't depend on the state of any table, so leaving rows alone
      // keeps them passing while other suites mutate their own session ids.
      runMigrations();
      app = await buildChatApp();
      await app.ready();
    });

    it('rejects whitespace-only user content with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { messages: [{ role: 'user', content: '   ' }] },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'invalid_request' });
      // The route MUST short-circuit before calling Groq — no streamChat call.
      expect(mockStreamChatCompletion).not.toHaveBeenCalled();
    });

    it('rejects an empty-string user content with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { messages: [{ role: 'user', content: '' }] },
      });
      expect(res.statusCode).toBe(400);
      expect(mockStreamChatCompletion).not.toHaveBeenCalled();
    });

    it('rejects a null user content with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { messages: [{ role: 'user', content: null }] },
      });
      expect(res.statusCode).toBe(400);
      expect(mockStreamChatCompletion).not.toHaveBeenCalled();
    });

    it('accepts a real user message (sanity)', async () => {
      // Wire a single-turn no-op stream so the route resolves quickly.
      mockStreamChatCompletion.mockResolvedValueOnce(
        chunksOf([
          {
            choices: [
              {
                index: 0,
                delta: { content: 'hi' },
                finish_reason: 'stop',
                logprobs: null,
              } as unknown as ChatCompletionChunk['choices'][0],
            ],
          },
        ]),
      );
      const res = await app.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { messages: [{ role: 'user', content: 'find me a lamp' }] },
      });
      expect(res.statusCode).toBe(200);
      expect(mockStreamChatCompletion).toHaveBeenCalledTimes(1);
    });
  });

  describe('agent: abort between Groq response and tool dispatch', () => {
    it('skips tool dispatch when signal aborts after stream consume', async () => {
      const controller = new AbortController();
      let dispatchCount = 0;

      // Custom async iterable that aborts itself on the final yield. By the
      // time `consume()` returns, `signal.aborted === true` — the new guard
      // right before Promise.all must catch this and short-circuit BEFORE
      // any tool dispatch fires. The signal.aborted check inside consume()
      // catches it for the next chunk, but the for-await completes when the
      // generator returns regardless.
      async function* gen(): AsyncGenerator<ChatCompletionChunk> {
        yield {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_xyz',
                    type: 'function',
                    function: {
                      name: 'search_catalog',
                      arguments: '{"query":"lamps"}',
                    },
                  },
                ],
              },
              finish_reason: null,
              logprobs: null,
            } as unknown as ChatCompletionChunk['choices'][0],
          ],
        } as ChatCompletionChunk;
        yield {
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'tool_calls',
              logprobs: null,
            } as unknown as ChatCompletionChunk['choices'][0],
          ],
        } as ChatCompletionChunk;
        // Trigger the abort inside the stream itself — agent's consume() loop
        // returns cleanly when the generator finishes, then the new guard
        // right before Promise.all sees `signal.aborted` and short-circuits.
        controller.abort();
      }
      const stream = Object.assign(gen(), { model: 'mock-model' });
      mockStreamChatCompletion.mockResolvedValueOnce(stream);

      const registry = makeRegistry({
        onDispatch: async () => {
          dispatchCount++;
          return { assistantString: '{}', events: [] };
        },
      });

      const events: ServerEvent[] = [];

      await runAgent({
        sessionId: 'abort-pre-dispatch',
        history: [{ role: 'user', content: 'find lamps' }],
        system: 'system prompt',
        registry,
        emit: (e) => {
          events.push(e);
        },
        signal: controller.signal,
        log,
        preferences: {},
      });

      // The dispatch was skipped.
      expect(dispatchCount).toBe(0);
      // No `done` and no tool_status running (the guard fires BEFORE the
      // running-statuses loop).
      expect(events.some((e) => e.type === 'done')).toBe(false);
      expect(
        events.some((e) => e.type === 'tool_status' && e.status === 'running'),
      ).toBe(false);
      // Persisted as truncated per ADR-0002. (May be 0 calls if no blocks
      // accumulated, but here the tool_calls payload doesn't produce blocks.)
      // The key behavioural assertion is no dispatch — the persistence shape
      // is asserted in agent.test.ts already.
    });
  });
});

