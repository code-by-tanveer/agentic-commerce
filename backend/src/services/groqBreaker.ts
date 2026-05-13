/**
 * Groq rate-limit circuit-breaker (ARCHITECTURE.md §9, architect-flagged
 * highest residual risk for launch).
 *
 * Problem: `Retry-After` is now honoured per-request, but under a Groq
 * daily-quota exhaustion or sustained 429 event every concurrent SSE stream
 * still spins through its `AGENT_MAX_TURNS` budget on backoff+retry — Fly
 * connections held open, a herd of stuck "thinking..." UIs, and no shared
 * signal that Groq is currently down.
 *
 * Fix: a process-wide three-state circuit-breaker so the SECOND through Nth
 * concurrent caller short-circuits with a fast, clean error.
 *
 *   CLOSED     — normal operation, all calls go through.
 *   OPEN       — every call short-circuits with `RateLimitedError`. Set when
 *                THRESHOLD consecutive 429s land inside WINDOW_MS. Stays OPEN
 *                for `cooldownMs` (doubles on probe failure, capped at 5min).
 *   HALF_OPEN  — after cooldown, ONE probe is allowed. Subsequent concurrent
 *                callers see `half-open-in-flight` and bounce out fast. Probe
 *                success → CLOSED; probe 429 → OPEN with refreshed cooldown.
 *
 * --------------------------------------------------------------------------
 * CONSTRAINT: Module-scoped singleton state. Per ADR-0004 the backend is
 * single-machine, so process-local state is correct today. Clustering will
 * require either Redis-backed shared state (DEL + SET NX for the probe lock)
 * or sticky-by-IP routing so a given user always hits the same machine.
 * --------------------------------------------------------------------------
 */

import { env } from '../config/env.js';

export type BreakerState = 'OPEN' | 'HALF_OPEN' | 'CLOSED';

export type CanCallResult =
  | { allow: true }
  | { allow: false; reason: 'open' | 'half-open-in-flight'; retryAfterMs: number };

/**
 * Thrown by `groqClient` when the breaker is OPEN or HALF_OPEN-with-probe-
 * in-flight. `classifyError` in `agent.ts` maps this to the user-facing
 * "Search is briefly paused due to upstream limits — try again in a few
 * minutes." copy.
 *
 * Distinct from a single-request 429 (which still uses the legacy
 * `rate_limited` branch with "Hitting traffic. Retrying.") because the
 * breaker path is a server-side circuit decision — the request was not even
 * attempted against Groq.
 */
export class RateLimitedError extends Error {
  readonly name = 'RateLimitedError';
  readonly retryAfterMs: number;
  readonly reason: 'open' | 'half-open-in-flight';

  constructor(retryAfterMs: number, reason: 'open' | 'half-open-in-flight') {
    super(`Groq breaker ${reason}; retry in ${retryAfterMs}ms`);
    this.retryAfterMs = retryAfterMs;
    this.reason = reason;
  }
}

const MAX_COOLDOWN_MS = 5 * 60_000; // 5min hard cap on cooldown growth
const HALF_OPEN_IN_FLIGHT_BACKOFF_MS = 250; // small, FE-friendly retry hint

interface BreakerOptions {
  threshold: number;
  windowMs: number;
  baseCooldownMs: number;
  now: () => number;
  log: (event: string, extra: Record<string, unknown>) => void;
}

interface InternalState {
  status: BreakerState;
  /** Monotonic timestamps (ms, from `now()`) of recent 429s within window. */
  failures: number[];
  /** Absolute ms at which OPEN transitions to HALF_OPEN. */
  openUntil: number;
  /** Current cooldown duration — doubles on probe failure, capped. */
  currentCooldownMs: number;
  /** Whether a HALF_OPEN probe is in flight (single-flight). */
  probeInFlight: boolean;
}

function defaultLog(event: string, extra: Record<string, unknown>): void {
  // The breaker module is logger-agnostic so it can be loaded from any
  // entrypoint (tests, scripts, the route layer). `info`-level state
  // transitions are written to stdout in a single JSON line — future
  // Prometheus exposition can either scrape these or call `state()` directly.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ level: 'info', event, ...extra }));
}

/**
 * Build a fresh breaker. Exposed as a factory primarily for tests
 * (fake-clock injection, isolated state). Production code uses the
 * module-level singleton at the bottom of the file.
 */
export function createBreaker(overrides: Partial<BreakerOptions> = {}) {
  const opts: BreakerOptions = {
    threshold: overrides.threshold ?? env.GROQ_BREAKER_THRESHOLD,
    windowMs: overrides.windowMs ?? env.GROQ_BREAKER_WINDOW_MS,
    baseCooldownMs: overrides.baseCooldownMs ?? env.GROQ_BREAKER_COOLDOWN_MS,
    now: overrides.now ?? Date.now,
    log: overrides.log ?? defaultLog,
  };

  const s: InternalState = {
    status: 'CLOSED',
    failures: [],
    openUntil: 0,
    currentCooldownMs: opts.baseCooldownMs,
    probeInFlight: false,
  };

  function transition(next: BreakerState, extra: Record<string, unknown> = {}): void {
    if (s.status === next) return;
    const prev = s.status;
    s.status = next;
    opts.log(`breaker:${next.toLowerCase()}`, {
      from: prev,
      threshold: opts.threshold,
      windowMs: opts.windowMs,
      cooldownMs: s.currentCooldownMs,
      ...extra,
    });
  }

  function pruneFailures(nowMs: number): void {
    const cutoff = nowMs - opts.windowMs;
    while (s.failures.length > 0 && s.failures[0] < cutoff) {
      s.failures.shift();
    }
  }

  return {
    /**
     * Gate every Groq call. Returns `{allow: true}` if the call should
     * proceed (CLOSED, or the first caller during HALF_OPEN — the probe).
     * Otherwise returns a typed bounce reason + a retry hint in ms.
     *
     * Side-effects:
     *   - if OPEN cooldown has elapsed, this is the call that transitions
     *     to HALF_OPEN and is granted the probe slot.
     *   - if HALF_OPEN and no probe in-flight, this caller becomes the probe.
     */
    canCall(): CanCallResult {
      const nowMs = opts.now();
      if (s.status === 'CLOSED') return { allow: true };

      if (s.status === 'OPEN') {
        if (nowMs >= s.openUntil) {
          // Cooldown elapsed — transition to HALF_OPEN and grant the probe.
          transition('HALF_OPEN');
          s.probeInFlight = true;
          return { allow: true };
        }
        return { allow: false, reason: 'open', retryAfterMs: Math.max(s.openUntil - nowMs, 0) };
      }

      // HALF_OPEN.
      if (!s.probeInFlight) {
        s.probeInFlight = true;
        return { allow: true };
      }
      return {
        allow: false,
        reason: 'half-open-in-flight',
        retryAfterMs: HALF_OPEN_IN_FLIGHT_BACKOFF_MS,
      };
    },

    /**
     * Record a successful Groq response. Resets failure window. If we were
     * HALF_OPEN, the probe succeeded → close the breaker and reset cooldown
     * to the base value (so the next outage doesn't inherit doubled state).
     */
    noteSuccess(): void {
      s.failures = [];
      if (s.status === 'HALF_OPEN') {
        s.probeInFlight = false;
        s.currentCooldownMs = opts.baseCooldownMs;
        transition('CLOSED', { reason: 'probe_succeeded' });
      } else if (s.status === 'OPEN') {
        // Defensive: a success while OPEN shouldn't happen (we short-circuit
        // before calling Groq), but if a probe slipped through somehow,
        // treat it like a HALF_OPEN success.
        s.probeInFlight = false;
        s.currentCooldownMs = opts.baseCooldownMs;
        transition('CLOSED', { reason: 'unexpected_success' });
      }
    },

    /**
     * Record a 429 from Groq. `retryAfterMs` (from `Retry-After`) feeds the
     * initial cooldown when the breaker first opens — Groq's hint about
     * when quota recovers is the best estimate we have. Falls back to the
     * configured baseline.
     *
     * Transitions:
     *   - HALF_OPEN: probe failed → OPEN with doubled cooldown (capped).
     *   - CLOSED: append to failure log. If we now have `threshold` failures
     *     inside `windowMs`, → OPEN. Cooldown = max(retryAfterMs, base).
     *   - OPEN: ignored (we shouldn't be calling Groq in this state, but if
     *     a leftover request lands its 429 here, no-op).
     */
    noteRateLimited(retryAfterMs: number | null): void {
      const nowMs = opts.now();

      if (s.status === 'HALF_OPEN') {
        // Probe failed. Re-open with extended cooldown (doubled, capped).
        s.probeInFlight = false;
        s.currentCooldownMs = Math.min(s.currentCooldownMs * 2, MAX_COOLDOWN_MS);
        // If Groq sent a Retry-After larger than our doubled cooldown,
        // honour the larger value (capped). Otherwise stick with doubled.
        const cooldown = Math.max(
          s.currentCooldownMs,
          Math.min(retryAfterMs ?? 0, MAX_COOLDOWN_MS),
        );
        s.currentCooldownMs = cooldown;
        s.openUntil = nowMs + cooldown;
        transition('OPEN', { reason: 'probe_failed' });
        return;
      }

      if (s.status === 'OPEN') {
        // Stray 429 from an in-flight request that lapped the breaker open.
        // Don't extend the window — we're already counting down.
        return;
      }

      // CLOSED: accumulate. Drop old entries outside the window.
      s.failures.push(nowMs);
      pruneFailures(nowMs);

      if (s.failures.length >= opts.threshold) {
        const hint = retryAfterMs ?? 0;
        // First open uses max(baseline, server hint) — capped.
        s.currentCooldownMs = Math.min(
          Math.max(opts.baseCooldownMs, hint),
          MAX_COOLDOWN_MS,
        );
        s.openUntil = nowMs + s.currentCooldownMs;
        s.failures = []; // reset so the next open requires a fresh streak
        transition('OPEN', { reason: 'threshold_exceeded', retryAfterMs });
      }
    },

    /**
     * Non-429 errors. We don't open the breaker on these — a single 500 or
     * network blip shouldn't trip a rate-limit circuit. But if we're
     * HALF_OPEN with the probe in flight, we need to release the probe slot
     * so the next caller can try; we keep the breaker OPEN to be safe (a
     * 500 during a probe could mean Groq is still in trouble).
     */
    noteError(err: unknown): void {
      if (s.status === 'HALF_OPEN' && s.probeInFlight) {
        s.probeInFlight = false;
        // Re-open with current cooldown (no doubling — the probe didn't
        // confirm a 429, it just didn't confirm recovery).
        const nowMs = opts.now();
        s.openUntil = nowMs + s.currentCooldownMs;
        transition('OPEN', { reason: 'probe_errored', err: errSummary(err) });
      }
      // CLOSED + non-429: silently ignored. The route layer logs the raw err.
    },

    /** Current state — for tests + observability. */
    state(): BreakerState {
      // Lazy transition: if OPEN cooldown has elapsed we don't move state
      // here (canCall is the only mover) so a stale `state()` read won't
      // mask a still-active circuit. Callers that need probe-readiness
      // should call canCall.
      return s.status;
    },

    /**
     * Test-only escape hatch: reset internal state. Production code should
     * never call this (use noteSuccess instead).
     */
    _reset(): void {
      s.status = 'CLOSED';
      s.failures = [];
      s.openUntil = 0;
      s.currentCooldownMs = opts.baseCooldownMs;
      s.probeInFlight = false;
    },
  };
}

function errSummary(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err);
  const e = err as { name?: string; status?: number; message?: string };
  return `${e.name ?? 'Error'}${e.status ? `(${e.status})` : ''}: ${e.message ?? '?'}`;
}

/**
 * Module-scoped singleton — the one breaker shared by every Groq call in the
 * process. Production code imports this; tests should prefer `createBreaker`
 * for isolation.
 */
export const groqBreaker = createBreaker();
