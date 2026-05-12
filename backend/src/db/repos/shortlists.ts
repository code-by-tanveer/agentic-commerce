import { db } from '../sqlite.js';

export type ShortlistLane = 'love' | 'maybe' | 'skip';

export const SHORTLIST_LANES: readonly ShortlistLane[] = ['love', 'maybe', 'skip'] as const;

export function isShortlistLane(value: string): value is ShortlistLane {
  return (SHORTLIST_LANES as readonly string[]).includes(value);
}

export interface ShortlistRow {
  sessionId: string;
  productId: string;
  lane: ShortlistLane;
  snapshot: unknown;
  addedAt: string;
}

interface RawRow {
  session_id: string;
  product_id: string;
  lane: string;
  product_snapshot_json: string;
  added_at: string;
}

function rowToShortlist(r: RawRow): ShortlistRow {
  let snapshot: unknown;
  try {
    snapshot = JSON.parse(r.product_snapshot_json);
  } catch {
    snapshot = null;
  }
  return {
    sessionId: r.session_id,
    productId: r.product_id,
    lane: (isShortlistLane(r.lane) ? r.lane : 'maybe') as ShortlistLane,
    snapshot,
    addedAt: r.added_at,
  };
}

const listStmt = () =>
  db.prepare<[string]>(
    'SELECT session_id, product_id, lane, product_snapshot_json, added_at ' +
      'FROM shortlists WHERE session_id = ? ORDER BY added_at ASC',
  );

const upsertStmt = () =>
  db.prepare(
    `INSERT INTO shortlists(session_id, product_id, lane, product_snapshot_json, added_at)
     VALUES (@session_id, @product_id, @lane, @product_snapshot_json, @added_at)
     ON CONFLICT(session_id, product_id) DO UPDATE SET
       lane = excluded.lane,
       product_snapshot_json = excluded.product_snapshot_json,
       added_at = excluded.added_at`,
  );

const deleteStmt = () =>
  db.prepare<[string, string]>(
    'DELETE FROM shortlists WHERE session_id = ? AND product_id = ?',
  );

export async function listShortlist(sessionId: string): Promise<ShortlistRow[]> {
  const rows = listStmt().all(sessionId) as RawRow[];
  return Promise.resolve(rows.map(rowToShortlist));
}

// Cycle 3 security review (MEDIUM): per-session row cap to bound storage
// abuse. Counted on insert only (not on lane move of an existing row).
const countStmt = () =>
  db.prepare<[string]>(
    'SELECT COUNT(*) AS n FROM shortlists WHERE session_id = ?',
  );

const existsStmt = () =>
  db.prepare<[string, string]>(
    'SELECT 1 AS one FROM shortlists WHERE session_id = ? AND product_id = ? LIMIT 1',
  );

export async function upsertShortlist(
  sessionId: string,
  productId: string,
  lane: ShortlistLane,
  snapshot: unknown,
  opts: { maxRows?: number } = {},
): Promise<ShortlistRow> {
  if (!isShortlistLane(lane)) {
    throw new Error(`invalid_lane: ${lane}`);
  }
  if (opts.maxRows !== undefined) {
    const isUpdate = !!existsStmt().get(sessionId, productId);
    if (!isUpdate) {
      const row = countStmt().get(sessionId) as { n: number } | undefined;
      if ((row?.n ?? 0) >= opts.maxRows) {
        throw new Error('row_cap_exceeded');
      }
    }
  }
  const addedAt = new Date().toISOString();
  upsertStmt().run({
    session_id: sessionId,
    product_id: productId,
    lane,
    product_snapshot_json: JSON.stringify(snapshot ?? null),
    added_at: addedAt,
  });
  return Promise.resolve({ sessionId, productId, lane, snapshot, addedAt });
}

export async function removeShortlist(
  sessionId: string,
  productId: string,
): Promise<boolean> {
  const info = deleteStmt().run(sessionId, productId);
  return Promise.resolve(info.changes > 0);
}
