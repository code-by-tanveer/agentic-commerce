import { db } from '../sqlite.js';

export type PreferenceSource = 'user' | 'inferred' | 'agent';

export type PreferenceKey =
  | 'size'
  | 'budget'
  | 'ships_from'
  | 'ships_to'
  | 'palette'
  | 'ethics'
  | 'shipping_speed';

export const PREFERENCE_KEYS: readonly PreferenceKey[] = [
  'size',
  'budget',
  'ships_from',
  'ships_to',
  'palette',
  'ethics',
  'shipping_speed',
] as const;

export function isPreferenceKey(value: string): value is PreferenceKey {
  return (PREFERENCE_KEYS as readonly string[]).includes(value);
}

export interface PreferenceEntry {
  value: unknown;
  source: PreferenceSource;
  updatedAt: string;
}

export type PreferencesMap = Partial<Record<PreferenceKey, PreferenceEntry>>;

interface PreferenceRow {
  key: string;
  value: string;
  source: string;
  updated_at: string;
}

const listStmt = () =>
  db.prepare<[string]>(
    'SELECT key, value, source, updated_at FROM preferences WHERE session_id = ?',
  );

const upsertStmt = () =>
  db.prepare(
    `INSERT INTO preferences(session_id, key, value, source, updated_at)
     VALUES (@session_id, @key, @value, @source, @updated_at)
     ON CONFLICT(session_id, key) DO UPDATE SET
       value = excluded.value,
       source = excluded.source,
       updated_at = excluded.updated_at`,
  );

const deleteStmt = () =>
  db.prepare<[string, string]>(
    'DELETE FROM preferences WHERE session_id = ? AND key = ?',
  );

function parseValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // legacy / malformed row — surface the raw string so we don't crash.
    return raw;
  }
}

function normalizeSource(s: string): PreferenceSource {
  return s === 'inferred' || s === 'agent' ? s : 'user';
}

export async function listPreferences(sessionId: string): Promise<PreferencesMap> {
  const rows = listStmt().all(sessionId) as PreferenceRow[];
  const out: PreferencesMap = {};
  for (const r of rows) {
    if (!isPreferenceKey(r.key)) continue; // ignore unknown keys defensively
    out[r.key] = {
      value: parseValue(r.value),
      source: normalizeSource(r.source),
      updatedAt: r.updated_at,
    };
  }
  return Promise.resolve(out);
}

export async function upsertPreference(
  sessionId: string,
  key: PreferenceKey,
  value: unknown,
  source: PreferenceSource = 'user',
): Promise<PreferenceEntry> {
  const updatedAt = new Date().toISOString();
  upsertStmt().run({
    session_id: sessionId,
    key,
    value: JSON.stringify(value ?? null),
    source,
    updated_at: updatedAt,
  });
  return Promise.resolve({ value, source, updatedAt });
}

export async function deletePreference(
  sessionId: string,
  key: PreferenceKey,
): Promise<boolean> {
  const info = deleteStmt().run(sessionId, key);
  return Promise.resolve(info.changes > 0);
}
