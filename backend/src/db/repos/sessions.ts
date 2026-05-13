import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { env } from '../../config/env.js';
import { db } from '../sqlite.js';

export interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  userAgent: string | null;
  ipHash: string | null;
  viewMode: 'list' | 'collage';
  summaryBlob: string | null;
}

interface SessionRow {
  id: string;
  created_at: string;
  updated_at: string;
  user_agent: string | null;
  ip_hash: string | null;
  view_mode: string;
  summary_blob: string | null;
}

function rowToSession(r: SessionRow): Session {
  return {
    id: r.id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    userAgent: r.user_agent,
    ipHash: r.ip_hash,
    viewMode: (r.view_mode === 'collage' ? 'collage' : 'list') as Session['viewMode'],
    summaryBlob: r.summary_blob,
  };
}

export interface CreateSessionOpts {
  userAgent?: string | null;
  ip?: string | null;
}

function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash('sha256').update(ip + env.IP_HASH_SALT).digest('hex');
}

const selectStmt = () => db.prepare<[string]>('SELECT * FROM sessions WHERE id = ?');
const insertStmt = () =>
  db.prepare(
    `INSERT INTO sessions(id, created_at, updated_at, user_agent, ip_hash, view_mode, summary_blob)
     VALUES (@id, @created_at, @updated_at, @user_agent, @ip_hash, 'list', NULL)`,
  );
const touchStmt = () =>
  db.prepare<[string, string]>('UPDATE sessions SET updated_at = ? WHERE id = ?');

export async function getSession(id: string): Promise<Session | null> {
  const row = selectStmt().get(id) as SessionRow | undefined;
  return Promise.resolve(row ? rowToSession(row) : null);
}

export async function getOrCreateSession(
  id?: string | null,
  opts: CreateSessionOpts = {},
): Promise<Session> {
  if (id) {
    const existing = selectStmt().get(id) as SessionRow | undefined;
    if (existing) {
      const now = new Date().toISOString();
      touchStmt().run(now, id);
      return Promise.resolve(rowToSession({ ...existing, updated_at: now }));
    }
  }

  const newId = id || nanoid();
  const now = new Date().toISOString();
  insertStmt().run({
    id: newId,
    created_at: now,
    updated_at: now,
    user_agent: opts.userAgent ?? null,
    ip_hash: hashIp(opts.ip),
  });
  const row = selectStmt().get(newId) as SessionRow;
  return Promise.resolve(rowToSession(row));
}

export async function touchSession(id: string): Promise<void> {
  touchStmt().run(new Date().toISOString(), id);
  return Promise.resolve();
}

const selectViewModeStmt = () =>
  db.prepare<[string]>('SELECT view_mode FROM sessions WHERE id = ?');
const updateViewModeStmt = () =>
  db.prepare<[string, string, string]>(
    'UPDATE sessions SET view_mode = ?, updated_at = ? WHERE id = ?',
  );

export async function getViewMode(sessionId: string): Promise<'list' | 'collage'> {
  const row = selectViewModeStmt().get(sessionId) as { view_mode: string } | undefined;
  if (!row) return Promise.resolve('list');
  return Promise.resolve(row.view_mode === 'collage' ? 'collage' : 'list');
}

export async function setViewMode(
  sessionId: string,
  mode: 'list' | 'collage',
): Promise<void> {
  updateViewModeStmt().run(mode, new Date().toISOString(), sessionId);
  return Promise.resolve();
}

// Cycle 5 (Phase D): summary blob is a JSON-stringified SummaryBlob written
// by POST /api/session/:id/summary; read back by GET. Column has existed
// since Cycle 1's migration 0001 (ARCH §4).
const selectSummaryStmt = () =>
  db.prepare<[string]>('SELECT summary_blob FROM sessions WHERE id = ?');
const updateSummaryStmt = () =>
  db.prepare<[string, string, string]>(
    'UPDATE sessions SET summary_blob = ?, updated_at = ? WHERE id = ?',
  );

export async function getSummaryBlob<T = unknown>(
  sessionId: string,
): Promise<T | null> {
  const row = selectSummaryStmt().get(sessionId) as
    | { summary_blob: string | null }
    | undefined;
  if (!row || !row.summary_blob) return Promise.resolve(null);
  try {
    return Promise.resolve(JSON.parse(row.summary_blob) as T);
  } catch {
    return Promise.resolve(null);
  }
}

export async function setSummaryBlob(
  sessionId: string,
  blob: unknown,
): Promise<void> {
  updateSummaryStmt().run(
    JSON.stringify(blob),
    new Date().toISOString(),
    sessionId,
  );
  return Promise.resolve();
}
