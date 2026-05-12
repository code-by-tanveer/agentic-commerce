import type { Product } from '@/types/product';

// ---------------------------------------------------------------------------
// REST helpers around the Fastify backend. The streaming `/api/chat` endpoint
// has its own client in `lib/stream.ts`.
//
// `searchProducts` was retired in Cycle 1 — the agent now drives search via
// the `search_catalog` tool, surfaced as a `products` event over SSE.
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function safeJson(res: Response): Promise<{ message?: string } | null> {
  try {
    return (await res.json()) as { message?: string };
  } catch {
    return null;
  }
}

export interface SessionRef {
  id: string;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'agentic.sessionId';

function readStoredSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredSessionId(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore quota / private mode
  }
}

function clientNanoid(): string {
  // 21-char URL-safe random id; matches backend's nanoid default length.
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const bytes = new Uint8Array(21);
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/**
 * Returns a session id, creating one if needed. The backend cookie is the
 * canonical identity; this helper keeps a local mirror so that follow-up
 * requests can include a `sessionId` body field even on the first turn (the
 * cookie isn't set until the first response).
 */
export async function getOrCreateSession(): Promise<SessionRef> {
  const existing = readStoredSessionId();
  if (existing) return { id: existing };
  const id = clientNanoid();
  writeStoredSessionId(id);
  return { id };
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface PersistMessage {
  id: string;
  role: 'user' | 'assistant';
  blocks: unknown[];
  status?: 'streaming' | 'done' | 'error';
}

/**
 * Persist a finalized message. Used as a graceful checkpoint after `done`.
 * Failures are non-fatal — the canonical history is the next request's body.
 */
export async function appendMessage(
  sessionId: string,
  message: PersistMessage,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(
    `/api/session/${encodeURIComponent(sessionId)}/messages`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(message),
      signal,
    },
  );
  if (!res.ok) {
    const body = await safeJson(res);
    throw new ApiError(res.status, body?.message ?? 'persist failed');
  }
}

// ---------------------------------------------------------------------------
// Preferences (Cycle 2) — REST under `/api/session/:id/preferences`.
//
// The backend stores values as JSON; we treat `value` as `unknown` on the
// wire and let callers narrow as needed. `key` is enforced as one of the
// fixed-enum strings the backend allows.
// ---------------------------------------------------------------------------

export type PreferenceKey =
  | 'size'
  | 'budget'
  | 'ships_from'
  | 'ships_to'
  | 'palette'
  | 'ethics'
  | 'shipping_speed';

export type PreferenceSource = 'user' | 'inferred' | 'agent';

export interface PreferenceRecord {
  value: unknown;
  source?: PreferenceSource;
}

export type PreferenceMap = Partial<Record<PreferenceKey, PreferenceRecord>>;

export async function fetchPreferences(
  sessionId: string,
  signal?: AbortSignal,
): Promise<PreferenceMap> {
  const res = await fetch(
    `/api/session/${encodeURIComponent(sessionId)}/preferences`,
    { signal },
  );
  if (!res.ok) {
    const body = await safeJson(res);
    throw new ApiError(res.status, body?.message ?? 'preferences fetch failed');
  }
  const json = (await res.json()) as unknown;
  // Tolerate either `{prefs: {...}}` or a bare map. Backend returns a map per
  // the cycle-2 brief; we widen here so a small contract drift doesn't kill
  // the panel.
  if (json && typeof json === 'object' && 'prefs' in (json as object)) {
    return ((json as { prefs: PreferenceMap }).prefs) ?? {};
  }
  return (json as PreferenceMap) ?? {};
}

export async function putPreference(
  sessionId: string,
  key: PreferenceKey,
  value: unknown,
  source: PreferenceSource = 'user',
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(
    `/api/session/${encodeURIComponent(sessionId)}/preferences/${encodeURIComponent(key)}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value, source }),
      signal,
    },
  );
  if (!res.ok) {
    const body = await safeJson(res);
    throw new ApiError(res.status, body?.message ?? 'preference write failed');
  }
}

export async function deletePreference(
  sessionId: string,
  key: PreferenceKey,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(
    `/api/session/${encodeURIComponent(sessionId)}/preferences/${encodeURIComponent(key)}`,
    { method: 'DELETE', signal },
  );
  if (!res.ok) {
    const body = await safeJson(res);
    throw new ApiError(res.status, body?.message ?? 'preference delete failed');
  }
}

// ---------------------------------------------------------------------------
// Product detail — kept for future non-chat surfaces (not called in Cycle 1).
// ---------------------------------------------------------------------------

export async function getProduct(id: string, signal?: AbortSignal): Promise<Product> {
  const res = await fetch(`/api/product/${encodeURIComponent(id)}`, { signal });
  if (!res.ok) {
    const body = await safeJson(res);
    throw new ApiError(res.status, body?.message ?? 'Product lookup failed');
  }
  return (await res.json()) as Product;
}
