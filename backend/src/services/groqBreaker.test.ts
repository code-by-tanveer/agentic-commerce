import { describe, expect, it, vi } from 'vitest';
import { createBreaker, RateLimitedError } from './groqBreaker.js';

/**
 * Breaker unit tests. We instantiate via `createBreaker` (factory) so each
 * test gets isolated state + a fake clock — avoiding the module-singleton's
 * cross-test bleed. Production code uses the singleton (`groqBreaker`).
 *
 * Clock model: a closure-bound `now` we advance manually. No real timers
 * involved → tests run synchronously and deterministically.
 */
function makeClock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
    set: (ms: number) => {
      t = ms;
    },
  };
}

const SILENT_LOG = () => {};

function defaultBreaker(opts: Partial<Parameters<typeof createBreaker>[0]> = {}) {
  const clock = makeClock();
  const breaker = createBreaker({
    threshold: 5,
    windowMs: 60_000,
    baseCooldownMs: 60_000,
    now: clock.now,
    log: SILENT_LOG,
    ...opts,
  });
  return { breaker, clock };
}

describe('groqBreaker', () => {
  describe('CLOSED → OPEN', () => {
    it('opens after 5 consecutive 429s inside the window', () => {
      const { breaker } = defaultBreaker();
      expect(breaker.state()).toBe('CLOSED');
      for (let i = 0; i < 4; i++) {
        breaker.noteRateLimited(null);
        expect(breaker.state()).toBe('CLOSED');
      }
      breaker.noteRateLimited(null);
      expect(breaker.state()).toBe('OPEN');
    });

    it('does NOT open if the 5 429s span longer than windowMs', () => {
      const { breaker, clock } = defaultBreaker();
      // Four 429s, then advance past window, then one more — the first four
      // are evicted so we don't hit threshold.
      for (let i = 0; i < 4; i++) breaker.noteRateLimited(null);
      clock.advance(61_000);
      breaker.noteRateLimited(null);
      expect(breaker.state()).toBe('CLOSED');
    });

    it('non-429 errors do NOT open the breaker', () => {
      const { breaker } = defaultBreaker();
      for (let i = 0; i < 10; i++) {
        breaker.noteError(new Error('boom'));
      }
      expect(breaker.state()).toBe('CLOSED');
      const r = breaker.canCall();
      expect(r).toEqual({ allow: true });
    });
  });

  describe('OPEN behaviour', () => {
    it('short-circuits canCall() with reason=open + retryAfterMs', () => {
      const { breaker, clock } = defaultBreaker();
      for (let i = 0; i < 5; i++) breaker.noteRateLimited(null);
      expect(breaker.state()).toBe('OPEN');

      const r = breaker.canCall();
      expect(r.allow).toBe(false);
      if (!r.allow) {
        expect(r.reason).toBe('open');
        // 60s cooldown, nothing elapsed.
        expect(r.retryAfterMs).toBe(60_000);
      }

      // Even after 30s, still OPEN.
      clock.advance(30_000);
      const r2 = breaker.canCall();
      expect(r2.allow).toBe(false);
      if (!r2.allow) expect(r2.retryAfterMs).toBe(30_000);
    });

    it('honours Retry-After header as initial cooldown when first opening', () => {
      const { breaker } = defaultBreaker();
      // 4 plain 429s, then one with a 120s Retry-After — that should set the
      // cooldown to 120s (> the 60s baseline).
      for (let i = 0; i < 4; i++) breaker.noteRateLimited(null);
      breaker.noteRateLimited(120_000);
      expect(breaker.state()).toBe('OPEN');
      const r = breaker.canCall();
      expect(r.allow).toBe(false);
      if (!r.allow) expect(r.retryAfterMs).toBe(120_000);
    });

    it('Retry-After SMALLER than base cooldown is overridden by base', () => {
      const { breaker } = defaultBreaker();
      for (let i = 0; i < 4; i++) breaker.noteRateLimited(null);
      breaker.noteRateLimited(5_000); // Groq says 5s, we use 60s baseline.
      const r = breaker.canCall();
      expect(r.allow).toBe(false);
      if (!r.allow) expect(r.retryAfterMs).toBe(60_000);
    });
  });

  describe('OPEN → HALF_OPEN → CLOSED (probe success)', () => {
    it('after cooldown elapses, first canCall grants the probe and transitions to HALF_OPEN', () => {
      const { breaker, clock } = defaultBreaker();
      for (let i = 0; i < 5; i++) breaker.noteRateLimited(null);
      expect(breaker.state()).toBe('OPEN');

      clock.advance(60_001);
      const r = breaker.canCall();
      expect(r).toEqual({ allow: true });
      expect(breaker.state()).toBe('HALF_OPEN');

      breaker.noteSuccess();
      expect(breaker.state()).toBe('CLOSED');
      expect(breaker.canCall()).toEqual({ allow: true });
    });
  });

  describe('OPEN → HALF_OPEN → OPEN (probe 429s)', () => {
    it('failed probe re-opens with doubled cooldown (capped at 5min)', () => {
      const { breaker, clock } = defaultBreaker();
      for (let i = 0; i < 5; i++) breaker.noteRateLimited(null);
      expect(breaker.state()).toBe('OPEN');

      clock.advance(60_001);
      const probe = breaker.canCall();
      expect(probe.allow).toBe(true);
      expect(breaker.state()).toBe('HALF_OPEN');

      // Probe gets 429.
      breaker.noteRateLimited(null);
      expect(breaker.state()).toBe('OPEN');
      const r = breaker.canCall();
      expect(r.allow).toBe(false);
      if (!r.allow) {
        // Cooldown should now be 120s (doubled from 60s).
        expect(r.retryAfterMs).toBe(120_000);
      }
    });

    it('cooldown caps at 5 minutes after repeated probe failures', () => {
      const { breaker, clock } = defaultBreaker();
      for (let i = 0; i < 5; i++) breaker.noteRateLimited(null);
      // 60s → 120s → 240s → 480s → cap at 300s (5min).
      const expected = [120_000, 240_000, 300_000, 300_000];
      for (const want of expected) {
        // Advance past whatever the current cooldown is — read it from
        // canCall, advance, probe-and-fail.
        const r = breaker.canCall();
        if (!r.allow) clock.advance(r.retryAfterMs + 1);
        const probe = breaker.canCall();
        expect(probe.allow).toBe(true);
        breaker.noteRateLimited(null);
        const r2 = breaker.canCall();
        if (!r2.allow) expect(r2.retryAfterMs).toBe(want);
      }
    });
  });

  describe('HALF_OPEN single-flight', () => {
    it('only one concurrent caller becomes the probe; others get half-open-in-flight', () => {
      const { breaker, clock } = defaultBreaker();
      for (let i = 0; i < 5; i++) breaker.noteRateLimited(null);
      clock.advance(60_001);

      // Three concurrent canCall() invocations (synchronous sim — no awaits).
      const a = breaker.canCall();
      const b = breaker.canCall();
      const c = breaker.canCall();

      expect(a.allow).toBe(true); // probe
      expect(b.allow).toBe(false);
      expect(c.allow).toBe(false);
      if (!b.allow) {
        expect(b.reason).toBe('half-open-in-flight');
        expect(b.retryAfterMs).toBeLessThanOrEqual(500);
      }
      if (!c.allow) expect(c.reason).toBe('half-open-in-flight');
    });

    it('probe non-429 error releases the slot but keeps breaker OPEN', () => {
      const { breaker, clock } = defaultBreaker();
      for (let i = 0; i < 5; i++) breaker.noteRateLimited(null);
      clock.advance(60_001);
      const r = breaker.canCall();
      expect(r.allow).toBe(true);
      expect(breaker.state()).toBe('HALF_OPEN');

      // Probe errored out (network blip, not 429).
      breaker.noteError(new Error('connection reset'));
      expect(breaker.state()).toBe('OPEN');

      // Next caller is bounced (it's not the probe yet — cooldown reset).
      const r2 = breaker.canCall();
      expect(r2.allow).toBe(false);
      if (!r2.allow) expect(r2.reason).toBe('open');
    });
  });

  describe('observability', () => {
    it('emits info-level state transition logs', () => {
      const log = vi.fn();
      const breaker = createBreaker({
        threshold: 2,
        windowMs: 60_000,
        baseCooldownMs: 60_000,
        now: () => 0,
        log,
      });
      breaker.noteRateLimited(null);
      breaker.noteRateLimited(null);
      expect(log).toHaveBeenCalledWith(
        'breaker:open',
        expect.objectContaining({ from: 'CLOSED', threshold: 2 }),
      );
    });
  });

  describe('RateLimitedError shape', () => {
    it('carries retryAfterMs + reason and has name=RateLimitedError', () => {
      const err = new RateLimitedError(60_000, 'open');
      expect(err.name).toBe('RateLimitedError');
      expect(err.retryAfterMs).toBe(60_000);
      expect(err.reason).toBe('open');
      expect(err.message).toMatch(/60000/);
    });
  });
});
