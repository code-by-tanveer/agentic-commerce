import {
  PREFERENCE_KEYS,
  isPreferenceKey,
  type PreferenceKey,
} from '@agentic/events';
import { db } from '../sqlite.js';

// Cycle 7 polish (T1.22): `PREFERENCE_KEYS`, `PreferenceKey`, and
// `isPreferenceKey` were lifted into `@agentic/events` so the BE repo, the
// `save_preference` tool, the BE preferences REST routes, and the FE API
// layer share a single source of truth. Re-exported here for backwards
// compatibility with existing `from '../db/repos/preferences.js'` imports.
export { PREFERENCE_KEYS, isPreferenceKey };
export type { PreferenceKey };

export type PreferenceSource = 'user' | 'inferred' | 'agent';

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
