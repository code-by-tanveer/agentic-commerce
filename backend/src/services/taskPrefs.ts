/**
 * Task-tier preference scratchpad.
 *
 * Background. The persistent preferences store (SQLite, ADR-0004) was holding
 * BOTH identity facts the user expects to survive forever (ships_to, palette,
 * ethics) AND task-bound knobs that belong to one shopping intent (budget,
 * shipping_speed, shopping_for). Conflating the two produced the
 * "lamp under $15 → running shoes returns nothing" bug: budget=15 was saved
 * globally and the agent folded it into every subsequent search until the
 * user manually cleared it.
 *
 * The fix is a tier model:
 *
 *   - Identity tier  → SQLite, persists indefinitely.
 *   - Task tier      → THIS module: in-memory, evicts on topic-shift or idle.
 *   - Scoped tier    → deferred to v1.5 (e.g. `size:shoe`, `size:dress`).
 *
 * Scope of this module. Task-tier values live in a module-scoped `Map` keyed
 * by sessionId. Per ADR-0004 the backend is single-machine for Stage 1, so
 * a process-local Map is correct: every request for a given session lands on
 * the same machine. If/when we move to multi-machine (libSQL or Postgres per
 * the ADR's Path-to-Postgres section), this map becomes a small Redis hash
 * keyed by sessionId — same API, swap the storage. The repo pattern from
 * ADR-0004 §"Repository pattern" applies here too.
 *
 * Eviction. Two independent triggers:
 *
 *   1. Idle: any access older than `IDLE_TTL_MS` (30 min) is treated as if
 *      the scratchpad were empty. Lazy — we don't run a cron sweep; old
 *      entries that are never read again sit harmlessly until the process
 *      restarts. The 30-min figure matches a typical shopping session length
 *      and is the same window we'd consider "the user moved on".
 *   2. Topic shift: `setTaskPref` takes a `topicHint` (the search query, in
 *      practice). If the incoming topic differs from the stored `query_topic`
 *      we clear the prior scratchpad and keep ONLY the current call's key.
 *      Comparison is case-insensitive equality of the trimmed string — the
 *      simplest rule that fixes the headline bug without over-firing on
 *      e.g. "lamp" → "desk lamp" (treated as different topics → cleared;
 *      that's fine, the agent re-states budget if it still applies).
 *
 * What this module deliberately does NOT do:
 *
 *   - It doesn't decide which keys are task-tier vs identity-tier. That
 *     policy lives at the call site (savePreferenceTool rejects task-tier
 *     keys; searchCatalogTool writes them here).
 *   - It doesn't touch SQLite. Identity preferences flow through the
 *     repo layer as before.
 *   - It doesn't emit SSE events. The agent reads the snapshot synchronously
 *     when composing the system prompt; FE-facing visibility lives on the
 *     `appliedFilters` field of the `products` event (see
 *     `@agentic/events::productsEventSchema`).
 */

/** Keys we manage at the task tier today. */
export type TaskPrefKey = 'budget' | 'shipping_speed' | 'shopping_for';

export interface TaskBudget {
  min?: number;
  max?: number;
}

export interface TaskPrefsSnapshot {
  budget?: TaskBudget;
  shipping_speed?: string;
  shopping_for?: string;
  /**
   * The topic string that wrote the last entry (lowercased, trimmed). Used as
   * the comparator for topic-shift eviction. Surfaced for debugging /
   * observability; callers shouldn't depend on its exact value.
   */
  query_topic?: string;
  /** ms-since-epoch of the last `setTaskPref`. Idle eviction reads this. */
  updatedAt: number;
}

/**
 * Map type that backs the module-scoped store. Exported as a type so tests
 * can spell it out; the singleton itself is not exported (clearAll is, for
 * test hygiene).
 */
export type TaskPrefsStore = Map<string, TaskPrefsSnapshot>;

/** 30-minute idle TTL. See module doc for rationale. */
export const IDLE_TTL_MS = 30 * 60 * 1000;

const store: TaskPrefsStore = new Map();

/**
 * Module-scoped clock indirection so tests can stub time without faking the
 * global Date object. Production reads Date.now(); tests can override via
 * the `_setClock` helper below.
 */
let now: () => number = () => Date.now();

/** Test-only: override the clock. Pass `null` to reset to Date.now. */
export function _setClock(fn: (() => number) | null): void {
  now = fn ?? (() => Date.now());
}

/** Test-only: nuke the whole store. */
export function _clearAll(): void {
  store.clear();
}

function normaliseTopic(t: string | undefined): string | undefined {
  if (!t) return undefined;
  const v = t.trim().toLowerCase();
  return v.length === 0 ? undefined : v;
}

/**
 * Read the current task-tier snapshot for a session. Returns an empty object
 * (NOT undefined) for unknown sessions or sessions whose last write is
 * older than IDLE_TTL_MS. The empty-object shape lets callers spread the
 * result into an object literal without a guard.
 *
 * Side effect: idle entries are deleted from the map on read (lazy
 * eviction). This bounds memory growth even without a cron sweep.
 */
export function getTaskPrefs(sessionId: string): TaskPrefsSnapshot | Record<string, never> {
  const entry = store.get(sessionId);
  if (!entry) return {};
  if (now() - entry.updatedAt > IDLE_TTL_MS) {
    store.delete(sessionId);
    return {};
  }
  return entry;
}

/**
 * Write a single task-tier preference. The `topicHint` MUST be the noun
 * phrase / query string that drove this write — typically the
 * `search_catalog` query verbatim. If the hint differs from the stored
 * `query_topic` the prior scratchpad is cleared first and only the
 * current write survives.
 *
 * Pass `undefined` for `value` to clear that one key without affecting the
 * rest (rare; the agent doesn't drive this today, but it keeps the API
 * symmetric for v1.5).
 */
export function setTaskPref<K extends TaskPrefKey>(
  sessionId: string,
  key: K,
  value: TaskPrefsSnapshot[K],
  topicHint: string | undefined,
): TaskPrefsSnapshot {
  const incomingTopic = normaliseTopic(topicHint);
  const existing = store.get(sessionId);
  const ts = now();

  // Idle-evict before considering the topic. An entry old enough to be
  // evicted shouldn't have its `query_topic` consulted — the user has come
  // back fresh.
  const isStale = existing && ts - existing.updatedAt > IDLE_TTL_MS;

  let base: TaskPrefsSnapshot;
  if (!existing || isStale) {
    base = { updatedAt: ts, query_topic: incomingTopic };
  } else if (
    incomingTopic !== undefined &&
    existing.query_topic !== undefined &&
    incomingTopic !== existing.query_topic
  ) {
    // Topic shift: drop everything, keep only this call's contribution.
    base = { updatedAt: ts, query_topic: incomingTopic };
  } else {
    base = { ...existing, updatedAt: ts };
    if (incomingTopic !== undefined) base.query_topic = incomingTopic;
  }

  base[key] = value;
  store.set(sessionId, base);
  return base;
}

/**
 * Explicit clear (e.g. session end, or a future "start over" affordance).
 * The `reason` is logged on the call site, not here — this module stays
 * dependency-free.
 */
export function clearTaskPrefs(sessionId: string, _reason: string): void {
  store.delete(sessionId);
}

/**
 * Topic-shift signal without a value write. Call this on EVERY shopping
 * tool entry (typically `search_catalog`) so the scratchpad can evict
 * stale entries when the user moves to a new topic — even if the current
 * turn doesn't itself set a budget / shipping_speed.
 *
 * Without this hook the eviction only fires inside `setTaskPref`, which
 * means turn 1 "lamp under $15" (writes budget) → turn 2 "running shoes"
 * (no budget filter) would leave budget=15 in the scratchpad indefinitely,
 * and the merged-filter view fed to the FE / agent would silently keep
 * applying it. That's the bug this whole module exists to fix.
 *
 * Returns the post-eviction snapshot for callers that want to read it
 * immediately (the searchCatalog tool uses it for `appliedFilters`).
 */
export function noteTopic(
  sessionId: string,
  topicHint: string | undefined,
): TaskPrefsSnapshot | Record<string, never> {
  const incoming = normaliseTopic(topicHint);
  const existing = store.get(sessionId);
  if (!existing) return {};

  const isStale = now() - existing.updatedAt > IDLE_TTL_MS;
  if (isStale) {
    store.delete(sessionId);
    return {};
  }

  if (
    incoming !== undefined &&
    existing.query_topic !== undefined &&
    incoming !== existing.query_topic
  ) {
    // Topic shifted; drop everything. Don't write a placeholder entry —
    // the next setTaskPref will bring the topic in with its value.
    store.delete(sessionId);
    return {};
  }

  return existing;
}

/**
 * Render the task snapshot as a short human-readable string for the system
 * prompt. Mirrors `summarisePreferences` in agent.ts so the LLM sees both
 * tiers in the same shape. Returns empty string when nothing's set.
 */
export function summariseTaskPrefs(snap: TaskPrefsSnapshot | Record<string, never>): string {
  const parts: string[] = [];
  if ('budget' in snap && snap.budget) {
    const b = snap.budget;
    if (typeof b.min === 'number' && typeof b.max === 'number') {
      parts.push(`budget=$${b.min}-$${b.max}`);
    } else if (typeof b.max === 'number') {
      parts.push(`budget<=$${b.max}`);
    } else if (typeof b.min === 'number') {
      parts.push(`budget>=$${b.min}`);
    }
  }
  if ('shipping_speed' in snap && snap.shipping_speed) {
    parts.push(`shipping_speed=${snap.shipping_speed}`);
  }
  if ('shopping_for' in snap && snap.shopping_for) {
    parts.push(`shopping_for=${snap.shopping_for}`);
  }
  return parts.join(', ');
}
