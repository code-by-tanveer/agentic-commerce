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

export async function saveOutfit(
  sessionId: string,
  anchorProductId: string,
  items: unknown,
  opts: { maxRows?: number } = {},
): Promise<{ id: string }> {
  if (opts.maxRows !== undefined) {
    const row = countStmt().get(sessionId) as { n: number } | undefined;
    if ((row?.n ?? 0) >= opts.maxRows) {
      throw new Error('row_cap_exceeded');
    }
  }
  const id = nanoid();
  const savedAt = new Date().toISOString();
  insertStmt().run({
    id,
    session_id: sessionId,
    anchor_product_id: anchorProductId,
    items_json: JSON.stringify(items ?? []),
    saved_at: savedAt,
  });
  return Promise.resolve({ id });
}

export async function deleteOutfit(
  sessionId: string,
  outfitId: string,
): Promise<boolean> {
  const info = deleteStmt().run(sessionId, outfitId);
  return Promise.resolve(info.changes > 0);
}
