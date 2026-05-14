// ---------------------------------------------------------------------------
// sessionHistory — Cycle 7 chat-history (PRODUCT §6 AC #1).
//
// Client-side helpers for the `agentic_sessions` cookie. The cookie carries a
// JSON-encoded ordered list of the user's last N session ids (most-recently-
// used first). Pure-functional read/write/upsert; no React deps, no
// side-effects beyond `document.cookie`.
//
// Cookie shape:
//   agentic_sessions = JSON.stringify([
//     { id: 'aBc...', label: 'wool sweater', lastUsedAt: 1715600000000 },
//     ...
//   ])
//
// Constraints (per PO AC #1):
//   - 5 entries max. Oldest pruned when the list grows past 5.
//   - 90-day max-age (mirrors the BE session TTL — once a row is GC'd by the
//     server sweep, the cookie entry is harmless dead weight; the dropdown
//     hides entries whose backing row 404s on hydrate).
//   - SameSite=Lax, NOT HttpOnly (the chat-history menu reads it client-side).
//   - Path=/, so the cookie rides on every request including /api/*.
//
// We deliberately don't use localStorage: the cookie is the one place the
// browser already preserves across `Clear site data` granularity gates, and
// the privacy disclosure in the dropdown ("Stored on this device. Clearing
// cookies clears the list.") is a hard contract with the user.
// ---------------------------------------------------------------------------

export interface SessionEntry {
  id: string;
  label: string;
  lastUsedAt: number;
}

const COOKIE_NAME = 'agentic_sessions';
const MAX_ENTRIES = 5;
const MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90d, mirrors BE TTL

// ---------------------------------------------------------------------------
// Cookie I/O — paranoid about malformed data. The cookie could carry
// anything (an older app version, a hand-edit, a different app on the same
// domain). Every read validates shape; a single bad entry collapses to `[]`
// rather than NaN-poisoning the dropdown.
// ---------------------------------------------------------------------------

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const target = `${name}=`;
  const parts = document.cookie.split(';');
  for (const raw of parts) {
    const trimmed = raw.trim();
    if (trimmed.startsWith(target)) {
      return decodeURIComponent(trimmed.slice(target.length));
    }
  }
  return null;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === 'undefined') return;
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=/`,
    `Max-Age=${maxAgeSeconds}`,
    `SameSite=Lax`,
  ];
  // `Secure` only in production over HTTPS — matches the BE's gating in
  // `routes/chat.ts`. Detect by `location.protocol` rather than NODE_ENV so
  // local dev over plain http still works.
  if (typeof location !== 'undefined' && location.protocol === 'https:') {
    parts.push('Secure');
  }
  document.cookie = parts.join('; ');
}

function isEntry(v: unknown): v is SessionEntry {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    r.id.length > 0 &&
    typeof r.label === 'string' &&
    typeof r.lastUsedAt === 'number' &&
    Number.isFinite(r.lastUsedAt)
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function readSessionHistory(): SessionEntry[] {
  const raw = readCookie(COOKIE_NAME);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Defensively filter — a single malformed entry doesn't poison the list.
    const valid = parsed.filter(isEntry);
    // Cap on read too, in case an older app version wrote >MAX_ENTRIES.
    return valid.slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function writeSessionHistory(entries: SessionEntry[]): void {
  // Re-cap on write so callers can't accidentally persist >MAX_ENTRIES.
  const capped = entries.slice(0, MAX_ENTRIES);
  try {
    writeCookie(COOKIE_NAME, JSON.stringify(capped), MAX_AGE_SECONDS);
  } catch {
    // ignore — cookie size limit, third-party blocking, etc.
  }
}

/**
 * Upsert an entry by id, moving it to the head of the list and stamping
 * `lastUsedAt = now`. Prunes the tail beyond MAX_ENTRIES. Returns the new
 * list (the caller doesn't have to re-read the cookie).
 *
 * Ordering note: the head of the list is "most recently used" by intent, NOT
 * by sorting on `lastUsedAt`. We keep both in sync (the upsert stamps the
 * timestamp on every touch) so the list is always coherent if a later
 * version of this module decides to sort numerically instead.
 */
export function upsertEntry(id: string, label: string): SessionEntry[] {
  const now = Date.now();
  const current = readSessionHistory();
  const filtered = current.filter((e) => e.id !== id);
  const next: SessionEntry[] = [{ id, label, lastUsedAt: now }, ...filtered];
  const capped = next.slice(0, MAX_ENTRIES);
  writeSessionHistory(capped);
  return capped;
}

/**
 * Remove an entry by id from the cookie list. The backing SQLite row stays
 * intact (90d TTL sweep is what eventually deletes it server-side). Returns
 * the new list.
 */
export function removeEntry(id: string): SessionEntry[] {
  const next = readSessionHistory().filter((e) => e.id !== id);
  writeSessionHistory(next);
  return next;
}

// ---------------------------------------------------------------------------
// Label helpers — used by `useConversation` when it computes the dropdown
// label from the first user message. Kept here so the truncation rule is
// applied in exactly one place.
// ---------------------------------------------------------------------------

const LABEL_MAX_CHARS = 40;
export const DEFAULT_LABEL = 'New chat';

export function labelFromText(text: string | null | undefined): string {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return DEFAULT_LABEL;
  if (trimmed.length <= LABEL_MAX_CHARS) return trimmed;
  // 1 char shorter to make room for the ellipsis (the literal `…` character,
  // not three dots — narrower glyph, same intent).
  return trimmed.slice(0, LABEL_MAX_CHARS - 1) + '…';
}

// ---------------------------------------------------------------------------
// Recency grouping — chat-history rail (DESIGN §5, 2026-05-14). The left rail
// presents history under three calendar buckets: TODAY / YESTERDAY / EARLIER.
// Grouping is on local-calendar day boundaries (NOT rolling 24h windows) so
// the labels match how a human reads the chat list — a message at 11:55pm
// last night is "yesterday", not "8h ago".
//
// Within each group, entries sort by `lastUsedAt` DESC (newest first). The
// cookie's stored order is already most-recently-used-first, but we re-sort
// here so a buggy upstream writer (or a future numeric-sort migration) can't
// silently reorder the rail.
// ---------------------------------------------------------------------------

export interface GroupedHistory {
  today: SessionEntry[];
  yesterday: SessionEntry[];
  earlier: SessionEntry[];
}

function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function groupByRecency(
  entries: SessionEntry[],
  now: number = Date.now(),
): GroupedHistory {
  const todayStart = startOfLocalDay(now);
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  const today: SessionEntry[] = [];
  const yesterday: SessionEntry[] = [];
  const earlier: SessionEntry[] = [];
  for (const e of entries) {
    if (e.lastUsedAt >= todayStart) today.push(e);
    else if (e.lastUsedAt >= yesterdayStart) yesterday.push(e);
    else earlier.push(e);
  }
  const byRecency = (a: SessionEntry, b: SessionEntry) => b.lastUsedAt - a.lastUsedAt;
  today.sort(byRecency);
  yesterday.sort(byRecency);
  earlier.sort(byRecency);
  return { today, yesterday, earlier };
}

// ---------------------------------------------------------------------------
// Relative timestamp — kept tiny + dep-free per the task constraint. Returns
// strings like "2h ago", "yesterday", "3 days ago", "just now". Anything
// older than a week falls back to a locale date (so the dropdown doesn't
// silently lie about a row that's 60 days stale).
// ---------------------------------------------------------------------------

export function relativeTime(then: number, now: number = Date.now()): string {
  const delta = Math.max(0, now - then);
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 7) return `${day} days ago`;
  try {
    return new Date(then).toLocaleDateString();
  } catch {
    return `${day} days ago`;
  }
}
