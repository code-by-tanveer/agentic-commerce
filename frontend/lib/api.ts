import type {
  Product,
  SavedOutfit,
  ShortlistItem,
  ShortlistLane,
  SummaryBlob,
  ViewMode,
} from '@/types/product';

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
// Cycle 7 chat-history — explicit "start a new session" and "switch to an
// existing session" verbs.
//
// `getOrCreateSession()` above is single-session: once a cookie/local id is
// established, it short-circuits forever. The chat-history menu needs to
// override that — both for the New-chat button (mint a fresh id) and the
// dropdown rows (flip back to a prior id). Both calls re-issue the BE-owned
// `agentic_sid` cookie so subsequent /api/chat writes land in the right row.
// ---------------------------------------------------------------------------

/**
 * Mint a brand-new session row server-side, set the cookie to it, return
 * the new id. The local-storage mirror is updated so `getOrCreateSession()`
 * starts returning the new id on subsequent calls. The previous session row
 * remains intact (the 90d TTL sweep is what eventually drops it).
 */
export async function createNewSession(): Promise<SessionRef> {
  const res = await fetch('/api/session', { method: 'POST' });
  if (!res.ok) {
    const body = await safeJson(res);
    throw new ApiError(res.status, body?.message ?? 'session create failed');
  }
  const json = (await res.json()) as { id: string };
  writeStoredSessionId(json.id);
  return { id: json.id };
}

/**
 * Flip the active session cookie to point at an existing session id. Used
 * by the chat-history dropdown when the user clicks a prior chat. The BE
 * recreates the row if it's been TTL'd, which means the dropdown is
 * forgiving even when the user's cookie list got out of sync with the DB.
 */
export async function activateSession(id: string): Promise<SessionRef> {
  const res = await fetch(
    `/api/session/${encodeURIComponent(id)}/activate`,
    { method: 'POST' },
  );
  if (!res.ok) {
    const body = await safeJson(res);
    throw new ApiError(res.status, body?.message ?? 'session activate failed');
  }
  const json = (await res.json()) as { id: string };
  writeStoredSessionId(json.id);
  return { id: json.id };
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
// Generic preference write/delete — same `/preferences/:key` route, but
// untyped key for prefs that aren't in the chip-row's closed enum (e.g.
// `shopping_for`, which the ProfileMenu's "Default filters" section writes
// without participating in the chip-row's `PREFERENCE_LABEL` map).
//
// These exist because the FE chip-row's `PreferenceKey` is intentionally
// narrow — adding `shopping_for` there would force a label entry that the
// chip-row doesn't actually render. Defaults section writes go through here
// instead. The backend route accepts any key in the `PREFERENCE_KEYS` enum
// (events package), so this stays correct even when callers pass strings
// that aren't in the FE's chip subset.
// ---------------------------------------------------------------------------

export async function putGenericPreference(
  sessionId: string,
  key: string,
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

export async function deleteGenericPreference(
  sessionId: string,
  key: string,
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
// Shortlist (Cycle 3) — three-lane (love/maybe/skip) drawer.
//
// The backend stores a `product_snapshot_json` per row so the share page
// survives a merchant delist (ARCH §4); the FE always sends the snapshot
// on PUT.
// ---------------------------------------------------------------------------

export async function fetchShortlist(
  sessionId: string,
  signal?: AbortSignal,
): Promise<ShortlistItem[]> {
  const res = await fetch(
    `/api/session/${encodeURIComponent(sessionId)}/shortlist`,
    { signal },
  );
  if (!res.ok) {
    const body = await safeJson(res);
    throw new ApiError(res.status, body?.message ?? 'shortlist fetch failed');
  }
  const json = (await res.json()) as unknown;
  // Tolerate either `{items: [...]}` or a bare array — small contract drift
  // shouldn't kill the drawer.
  if (Array.isArray(json)) return json as ShortlistItem[];
  if (json && typeof json === 'object' && 'items' in (json as object)) {
    return ((json as { items: ShortlistItem[] }).items) ?? [];
  }
  return [];
}

export async function putShortlistItem(
  sessionId: string,
  productId: string,
  body: { lane: ShortlistLane; snapshot: Product },
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(
    `/api/session/${encodeURIComponent(sessionId)}/shortlist/${encodeURIComponent(productId)}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    },
  );
  if (!res.ok) {
    const errBody = await safeJson(res);
    throw new ApiError(res.status, errBody?.message ?? 'shortlist write failed');
  }
}

export async function deleteShortlistItem(
  sessionId: string,
  productId: string,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(
    `/api/session/${encodeURIComponent(sessionId)}/shortlist/${encodeURIComponent(productId)}`,
    { method: 'DELETE', signal },
  );
  if (!res.ok) {
    const errBody = await safeJson(res);
    throw new ApiError(res.status, errBody?.message ?? 'shortlist delete failed');
  }
}

// ---------------------------------------------------------------------------
// Saved outfits (Cycle 3).
// ---------------------------------------------------------------------------

export async function fetchOutfits(
  sessionId: string,
  signal?: AbortSignal,
): Promise<SavedOutfit[]> {
  const res = await fetch(
    `/api/session/${encodeURIComponent(sessionId)}/outfits`,
    { signal },
  );
  if (!res.ok) {
    const body = await safeJson(res);
    throw new ApiError(res.status, body?.message ?? 'outfits fetch failed');
  }
  const json = (await res.json()) as unknown;
  if (Array.isArray(json)) return json as SavedOutfit[];
  if (json && typeof json === 'object' && 'outfits' in (json as object)) {
    return ((json as { outfits: SavedOutfit[] }).outfits) ?? [];
  }
  return [];
}

export interface PostOutfitBody {
  anchorProductId: string;
  items: Product[];
  rationale?: string;
}

export async function postOutfit(
  sessionId: string,
  body: PostOutfitBody,
  signal?: AbortSignal,
): Promise<SavedOutfit> {
  const res = await fetch(
    `/api/session/${encodeURIComponent(sessionId)}/outfits`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    },
  );
  if (!res.ok) {
    const errBody = await safeJson(res);
    throw new ApiError(res.status, errBody?.message ?? 'outfit save failed');
  }
  const json = (await res.json()) as unknown;
  // Tolerate either `{outfit: {...}}` or a bare object.
  if (json && typeof json === 'object' && 'outfit' in (json as object)) {
    return (json as { outfit: SavedOutfit }).outfit;
  }
  return json as SavedOutfit;
}

export async function deleteOutfit(
  sessionId: string,
  outfitId: string,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(
    `/api/session/${encodeURIComponent(sessionId)}/outfits/${encodeURIComponent(outfitId)}`,
    { method: 'DELETE', signal },
  );
  if (!res.ok) {
    const errBody = await safeJson(res);
    throw new ApiError(res.status, errBody?.message ?? 'outfit delete failed');
  }
}

// ---------------------------------------------------------------------------
// View mode (Cycle 3) — persists across reloads via `sessions.view_mode`.
// ---------------------------------------------------------------------------

export async function getViewMode(
  sessionId: string,
  signal?: AbortSignal,
): Promise<ViewMode> {
  // The backend exposes `viewMode` on the session record; we re-use the same
  // endpoint the conversation panel hits on mount.
  const res = await fetch(
    `/api/session/${encodeURIComponent(sessionId)}`,
    { signal },
  );
  if (!res.ok) {
    // Don't throw — the panel falls back to 'list'. Mode is a UX preference.
    return 'list';
  }
  const json = (await res.json()) as unknown;
  // Tolerate either `{session: {viewMode}}` or `{viewMode}` at root.
  let mode: unknown;
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    if (obj.session && typeof obj.session === 'object') {
      mode = (obj.session as Record<string, unknown>).viewMode;
    } else {
      mode = obj.viewMode;
    }
  }
  return mode === 'collage' ? 'collage' : 'list';
}

export async function putViewMode(
  sessionId: string,
  mode: ViewMode,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(
    `/api/session/${encodeURIComponent(sessionId)}/view-mode`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode }),
      signal,
    },
  );
  if (!res.ok) {
    const errBody = await safeJson(res);
    throw new ApiError(res.status, errBody?.message ?? 'view-mode write failed');
  }
}

// ---------------------------------------------------------------------------
// Image upload (Cycle 4). Backend mints a signed URL valid for 24h; the FE
// only ever sees the opaque `signed:<token>` form, which is what the vision
// tool will accept (SSRF gate per ARCH §7).
// ---------------------------------------------------------------------------

export interface UploadedImage {
  url: string;
  expiresAt: string;
}

/**
 * POST a single image to `/api/upload` as multipart form-data. The backend
 * enforces 8 MB cap, MIME allowlist, and magic-byte sniff; this client
 * surfaces the typed error so the dropzone can render an inline retry banner.
 */
export async function uploadImage(
  file: File,
  signal?: AbortSignal,
): Promise<UploadedImage> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: fd, signal });
  if (!res.ok) {
    const body = await safeJson(res);
    throw new ApiError(res.status, body?.message ?? 'upload failed');
  }
  return (await res.json()) as UploadedImage;
}

// ---------------------------------------------------------------------------
// Summary (Cycle 5) — shareable lookbook. `createSummary` snapshots the
// current shortlist + outfits into `sessions.summary_blob` and returns the
// public URL; `fetchSummary` reads the blob back (server-side from the
// `/s/[id]` page, or client-side as a fallback). 404 → `null` so callers can
// branch on "no such share" without try/catching.
// ---------------------------------------------------------------------------

export async function createSummary(
  sessionId: string,
  signal?: AbortSignal,
): Promise<{ url: string }> {
  const res = await fetch(
    `/api/session/${encodeURIComponent(sessionId)}/summary`,
    { method: 'POST', signal },
  );
  if (!res.ok) {
    const body = await safeJson(res);
    throw new ApiError(res.status, body?.message ?? 'summary create failed');
  }
  return (await res.json()) as { url: string };
}

export async function fetchSummary(
  sessionId: string,
  signal?: AbortSignal,
): Promise<SummaryBlob | null> {
  const res = await fetch(
    `/api/session/${encodeURIComponent(sessionId)}/summary`,
    { signal },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await safeJson(res);
    throw new ApiError(res.status, body?.message ?? 'summary fetch failed');
  }
  return (await res.json()) as SummaryBlob;
}

// R3-cleanup (architect-code MEDIUM): `getProduct(id)` was deleted in
// round 3 — it called `/api/product/:id`, a route the backend has never
// exposed, and no FE caller imported it. Dead export removed.
