import { describe, expect, it, beforeEach } from 'vitest';
import {
  IDLE_TTL_MS,
  _clearAll,
  _setClock,
  clearTaskPrefs,
  getTaskPrefs,
  setTaskPref,
  summariseTaskPrefs,
} from './taskPrefs.js';

// Regression suite for the preference-tier model (2026-05-13). The bug under
// test: `save_preference("budget", 15)` was persisted globally, so searching
// "lamp under $15" then "running shoes" returned nothing because the agent
// folded budget=15 into every later search. The fix moves task-tier keys
// (budget, shipping_speed, shopping_for) into this in-memory scratchpad with
// topic-shift and idle eviction.

// `_setClock` lets us drive Date.now without messing with vi.useFakeTimers
// (the rest of the agent loop uses `performance.now` for log timing and we
// don't want to perturb that).

let clock = 1_700_000_000_000;
function tick(ms: number): void {
  clock += ms;
}

beforeEach(() => {
  clock = 1_700_000_000_000;
  _setClock(() => clock);
  _clearAll();
});

describe('taskPrefs', () => {
  it('writes and reads back a single task-tier value within one session', () => {
    setTaskPref('sess-a', 'budget', { max: 15 }, 'lamp');
    const snap = getTaskPrefs('sess-a') as { budget?: { max?: number } };
    expect(snap.budget).toEqual({ max: 15 });
  });

  it('returns an empty object for an unknown session (NOT undefined)', () => {
    expect(getTaskPrefs('nobody')).toEqual({});
  });

  it('clears prior task-tier prefs when the topic shifts', () => {
    // Headline regression: "lamp under $15" → "running shoes" must NOT carry
    // budget=15 through to the shoe search.
    setTaskPref('sess-a', 'budget', { max: 15 }, 'lamp');
    expect((getTaskPrefs('sess-a') as { budget?: unknown }).budget).toBeDefined();

    setTaskPref('sess-a', 'shipping_speed', 'fast', 'running shoes');
    const snap = getTaskPrefs('sess-a') as {
      budget?: { max?: number };
      shipping_speed?: string;
      query_topic?: string;
    };
    expect(snap.budget).toBeUndefined();
    expect(snap.shipping_speed).toBe('fast');
    expect(snap.query_topic).toBe('running shoes');
  });

  it('keeps task-tier prefs intact when the same topic is restated', () => {
    setTaskPref('sess-a', 'budget', { max: 15 }, 'lamp');
    setTaskPref('sess-a', 'shipping_speed', 'fast', 'lamp');
    const snap = getTaskPrefs('sess-a') as {
      budget?: { max?: number };
      shipping_speed?: string;
    };
    expect(snap.budget).toEqual({ max: 15 });
    expect(snap.shipping_speed).toBe('fast');
  });

  it('topic comparison is case-insensitive and whitespace-tolerant', () => {
    setTaskPref('sess-a', 'budget', { max: 15 }, 'Lamp');
    // Same topic, different case + trailing space → keep.
    setTaskPref('sess-a', 'shipping_speed', 'fast', '  lamp  ');
    const snap = getTaskPrefs('sess-a') as {
      budget?: { max?: number };
      shipping_speed?: string;
    };
    expect(snap.budget).toEqual({ max: 15 });
    expect(snap.shipping_speed).toBe('fast');
  });

  it('evicts the snapshot lazily after IDLE_TTL_MS', () => {
    setTaskPref('sess-a', 'budget', { max: 15 }, 'lamp');
    // Just before the boundary — still present.
    tick(IDLE_TTL_MS - 1);
    expect((getTaskPrefs('sess-a') as { budget?: unknown }).budget).toBeDefined();

    // One ms past the boundary — empty object.
    tick(2);
    expect(getTaskPrefs('sess-a')).toEqual({});
  });

  it('treats a stale entry as a fresh start on the next write', () => {
    setTaskPref('sess-a', 'budget', { max: 15 }, 'lamp');
    tick(IDLE_TTL_MS + 1);
    // The stale snapshot's `query_topic` must not stop the new write from
    // landing — even if the new topic matches the OLD topic, an idle-evicted
    // entry is logically gone.
    setTaskPref('sess-a', 'shipping_speed', 'fast', 'lamp');
    const snap = getTaskPrefs('sess-a') as {
      budget?: unknown;
      shipping_speed?: string;
    };
    expect(snap.budget).toBeUndefined();
    expect(snap.shipping_speed).toBe('fast');
  });

  it('keeps separate sessions fully isolated', () => {
    setTaskPref('sess-a', 'budget', { max: 15 }, 'lamp');
    setTaskPref('sess-b', 'budget', { max: 200 }, 'sofa');

    expect((getTaskPrefs('sess-a') as { budget?: { max?: number } }).budget).toEqual({ max: 15 });
    expect((getTaskPrefs('sess-b') as { budget?: { max?: number } }).budget).toEqual({ max: 200 });

    // Topic shift in A must not touch B.
    setTaskPref('sess-a', 'shipping_speed', 'fast', 'running shoes');
    expect((getTaskPrefs('sess-b') as { budget?: { max?: number } }).budget).toEqual({ max: 200 });
  });

  it('clearTaskPrefs nukes a single session without affecting others', () => {
    setTaskPref('sess-a', 'budget', { max: 15 }, 'lamp');
    setTaskPref('sess-b', 'budget', { max: 200 }, 'sofa');
    clearTaskPrefs('sess-a', 'test-explicit-clear');
    expect(getTaskPrefs('sess-a')).toEqual({});
    expect((getTaskPrefs('sess-b') as { budget?: unknown }).budget).toBeDefined();
  });

  it('summariseTaskPrefs renders a compact human string', () => {
    expect(summariseTaskPrefs({})).toBe('');
    expect(
      summariseTaskPrefs({
        budget: { max: 15 },
        shipping_speed: 'fast',
        updatedAt: clock,
      }),
    ).toBe('budget<=$15, shipping_speed=fast');
    expect(
      summariseTaskPrefs({
        budget: { min: 50, max: 200 },
        shopping_for: 'self',
        updatedAt: clock,
      }),
    ).toBe('budget=$50-$200, shopping_for=self');
  });

  // Identity-tier sanity check: this module deliberately doesn't accept
  // identity keys like `ships_to`, `palette`, `ethics`. The TypeScript signature
  // (`TaskPrefKey = 'budget' | 'shipping_speed' | 'shopping_for'`) is what
  // enforces this at the call site; at runtime, attempting to read an
  // identity key off the snapshot just returns undefined. That's the contract:
  // identity prefs flow through the SQLite repo, not here.
  it('does not store identity-tier keys (typed-out at the API boundary)', () => {
    setTaskPref('sess-a', 'budget', { max: 15 }, 'lamp');
    const snap = getTaskPrefs('sess-a') as Record<string, unknown>;
    expect(snap['ships_to']).toBeUndefined();
    expect(snap['palette']).toBeUndefined();
    expect(snap['ethics']).toBeUndefined();
  });
});
