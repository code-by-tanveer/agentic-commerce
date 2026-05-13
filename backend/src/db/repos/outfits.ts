import { nanoid } from 'nanoid';
import { db } from '../sqlite.js';

export interface SavedOutfit {
  id: string;
  sessionId: string;
  anchorProductId: string;
  items: unknown;
  savedAt: string;
}

interface RawRow {
  id: string;
  session_id: string;
  anchor_product_id: string;
  items_json: string;
  saved_at: string;
}

function rowToOutfit(r: RawRow): SavedOutfit {
  let items: unknown;
  try {
    items = JSON.parse(r.items_json);
  } catch {
    items = [];
  }
  return {
    id: r.id,
    sessionId: r.session_id,
    anchorProductId: r.anchor_product_id,
    items,
    savedAt: r.saved_at,
  };
}

const listStmt = () =>
  db.prepare<[string]>(
    'SELECT id, session_id, anchor_product_id, items_json, saved_at ' +
      'FROM saved_outfits WHERE session_id = ? ORDER BY saved_at ASC',
  );

const insertStmt = () =>
  db.prepare(
    `INSERT INTO saved_outfits(id, session_id, anchor_product_id, items_json, saved_at)
     VALUES (@id, @session_id, @anchor_product_id, @items_json, @saved_at)`,
  );

const findByIdStmt = () =>
  db.prepare<[string, string]>(
    'SELECT id, session_id, anchor_product_id, items_json, saved_at ' +
      'FROM saved_outfits WHERE session_id = ? AND id = ?',
  );

const deleteStmt = () =>
  db.prepare<[string, string]>(
    'DELETE FROM saved_outfits WHERE session_id = ? AND id = ?',
  );

export async function listOutfits(sessionId: string): Promise<SavedOutfit[]> {
  const rows = listStmt().all(sessionId) as RawRow[];
  return Promise.resolve(rows.map(rowToOutfit));
}

// Cycle 3 security review (MEDIUM): per-session row cap.
const countStmt = () =>
  db.prepare<[string]>(
    'SELECT COUNT(*) AS n FROM saved_outfits WHERE session_id = ?',
  );

/**
 * polish-round-2 T2.16: accepts an optional caller-supplied `id` so retries on
 * a transient 502 don't duplicate the saved outfit. If a row with this id +
 * session already exists we return its id unchanged. Without `opts.id` the
 * prior nanoid behaviour is preserved.
 */
export async function saveOutfit(
  sessionId: string,
  anchorProductId: string,
  items: unknown,
  opts: { maxRows?: number; id?: string } = {},
): Promise<{ id: string; idempotent: boolean }> {
  if (opts.id) {
    const existing = findByIdStmt().get(sessionId, opts.id) as RawRow | undefined;
    if (existing) {
      // Same id, same session → caller is retrying. Return the existing row
      // id without re-inserting and without counting toward the row cap.
      return Promise.resolve({ id: existing.id, idempotent: true });
    }
  }
  if (opts.maxRows !== undefined) {
    const row = countStmt().get(sessionId) as { n: number } | undefined;
    if ((row?.n ?? 0) >= opts.maxRows) {
      throw new Error('row_cap_exceeded');
    }
  }
  const id = opts.id ?? nanoid();
  const savedAt = new Date().toISOString();
  insertStmt().run({
    id,
    session_id: sessionId,
    anchor_product_id: anchorProductId,
    items_json: JSON.stringify(items ?? []),
    saved_at: savedAt,
  });
  return Promise.resolve({ id, idempotent: false });
}

export async function deleteOutfit(
  sessionId: string,
  outfitId: string,
): Promise<boolean> {
  const info = deleteStmt().run(sessionId, outfitId);
  return Promise.resolve(info.changes > 0);
}
