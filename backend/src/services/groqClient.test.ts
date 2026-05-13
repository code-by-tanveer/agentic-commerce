import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Edge-case hardening (2026-05): `groqClient` must
 *  1. honour `Retry-After` headers on 429 instead of using the fixed 400ms
 *     jittered backoff (Groq's rate-limit responses include the header — the
 *     prior implementation discarded it and burned quota with a short retry).
 *  2. make the retry backoff abort-aware — a user navigating away during the
 *     wait should NOT cause a wasted retry attempt.
 *
 * These tests stub the `groq-sdk` default export at the module level
 * (`vi.mock` before the import) and drive `streamChatCompletion` with a
 * scripted 429 → success / 429 → abort sequence.
 */

const createMock = vi.fn();

vi.mock('groq-sdk', () => {
  class GroqStub {
    chat = {
      completions: { create: (...args: unknown[]) => createMock(...args) },
    };
    constructor(_opts: unknown) {}
  }
  return { default: GroqStub };
});

const { streamChatCompletion } = await import('./groqClient.js');

function rateLimitedError(retryAfter?: string): Error & {
  status: number;
  headers?: Record<string, string>;
} {
  const err = Object.assign(new Error('rate_limit_exceeded'), {
    status: 429,
    headers: retryAfter ? { 'retry-after': retryAfter } : undefined,
  });
  return err as Error & { status: number; headers?: Record<string, string> };
}

async function drain(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const _ of stream) {
    // consume
  }
}

describe('groqClient: Retry-After + abort-aware backoff', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it('honours Retry-After seconds on 429 instead of fixed jitter', async () => {
    let attempt = 0;
    createMock.mockImplementation(async () => {
      attempt++;
      if (attempt === 1) throw rateLimitedError('1');
      async function* gen() {
        yield {
          choices: [
            { index: 0, delta: { content: 'ok' }, finish_reason: 'stop', logprobs: null },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        };
      }
      return gen();
    });

    const startedAt = Date.now();
    const stream = await streamChatCompletion({
      messages: [{ role: 'user', content: 'hi' }],
    });
    await drain(stream);
    const elapsed = Date.now() - startedAt;

    // Two SDK invocations: one 429, one success.
    expect(createMock).toHaveBeenCalledTimes(2);
    // The 1-second Retry-After was honoured. Allow a small floor for
    // OS-scheduler jitter on slow CI but ensure we DID wait roughly that
    // duration rather than the legacy 400-800ms jittered backoff.
    expect(elapsed).toBeGreaterThanOrEqual(900);
    // And we didn't wait dramatically longer (Retry-After + max 200ms jitter).
    expect(elapsed).toBeLessThan(2_500);
  }, 10_000);

  it('skips the retry when the signal aborts during backoff', async () => {
    const controller = new AbortController();
    createMock.mockImplementation(async () => {
      // Always throw 429 with 5s Retry-After. The retry attempt should never
      // happen because we abort during the backoff.
      throw rateLimitedError('5');
    });

    setTimeout(() => controller.abort(), 50).unref?.();

    const startedAt = Date.now();
    await expect(
      streamChatCompletion({
        messages: [{ role: 'user', content: 'hi' }],
        signal: controller.signal,
      }),
    ).rejects.toBeDefined();
    const elapsed = Date.now() - startedAt;

    // Exactly ONE SDK invocation — the retry was skipped due to abort.
    expect(createMock).toHaveBeenCalledTimes(1);
    // Resolved well before the 5s Retry-After would have elapsed.
    expect(elapsed).toBeLessThan(2_000);
  }, 10_000);

  it('falls back to the default jittered backoff when no Retry-After header is set', async () => {
    let attempt = 0;
    createMock.mockImplementation(async () => {
      attempt++;
      if (attempt === 1) throw rateLimitedError(undefined);
      async function* gen() {
        yield {
          choices: [
            { index: 0, delta: { content: 'ok' }, finish_reason: 'stop', logprobs: null },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        };
      }
      return gen();
    });

    const startedAt = Date.now();
    const stream = await streamChatCompletion({
      messages: [{ role: 'user', content: 'hi' }],
    });
    await drain(stream);
    const elapsed = Date.now() - startedAt;

    expect(createMock).toHaveBeenCalledTimes(2);
    // Legacy 400-800ms jittered backoff applies — must be < 1s ceiling.
    expect(elapsed).toBeLessThan(1_000);
  }, 10_000);
});
