import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/sqlite.js';
import { runMigrations } from '../db/migrations/runner.js';
import { appendMessage } from '../db/repos/messages.js';
import { saveOutfit } from '../db/repos/outfits.js';
import { getOrCreateSession } from '../db/repos/sessions.js';
import { upsertShortlist } from '../db/repos/shortlists.js';
import { composeSessionSummary } from './summary.js';

// polish-round-3: deterministic, no-LLM coverage for `composeSessionSummary`.
// Uses the real repos against the test SQLite DB (setup-env.ts seeds DB_PATH
// to a tmpfs path). Per-test scope is enforced by deleting every child table
// in `beforeEach`, which is faster than tearing down the DB.

const SID = 'summary-test-session';

function resetTables() {
  // Order matters only because SQLite's foreign keys are ON; deleting the
  // parent CASCADEs every child, but we DELETE explicitly so a fresh-DB
  // test run with leftover rows from a prior crash is also clean.
  db.exec('DELETE FROM shortlists');
  db.exec('DELETE FROM saved_outfits');
  db.exec('DELETE FROM messages');
  db.exec('DELETE FROM preferences');
  db.exec('DELETE FROM sessions');
}

describe('composeSessionSummary', () => {
  beforeEach(async () => {
    runMigrations();
    resetTables();
    await getOrCreateSession(SID);
  });

  afterAll(() => {
    try {
      resetTables();
    } catch {
      // ignore — test teardown
    }
  });

  it('falls back to the spec-default gist on an empty session', async () => {
    const summary = await composeSessionSummary(SID);
    expect(summary.gist).toBe('A small collection of things worth a second look.');
    expect(summary.love).toEqual([]);
    expect(summary.maybe).toEqual([]);
    expect(summary.outfits).toEqual([]);
    expect(summary.merchantCount).toBe(0);
  });

  it("excludes 'skip' lane from love/maybe surfaces", async () => {
    await upsertShortlist(SID, 'p1', 'love', {
      id: 'p1',
      title: 'Lamp 1',
      merchant: 'Acme',
    });
    await upsertShortlist(SID, 'p2', 'love', {
      id: 'p2',
      title: 'Lamp 2',
      merchant: 'Acme',
    });
    await upsertShortlist(SID, 'p3', 'maybe', {
      id: 'p3',
      title: 'Lamp 3',
      merchant: 'Beta',
    });
    await upsertShortlist(SID, 'p4', 'skip', {
      id: 'p4',
      title: 'Lamp 4',
      merchant: 'Gamma',
    });

    const summary = await composeSessionSummary(SID);
    expect(summary.love.map((r) => r.productId).sort()).toEqual(['p1', 'p2']);
    expect(summary.maybe.map((r) => r.productId)).toEqual(['p3']);
    // skip is excluded from BOTH surfaces — defensive assertion.
    const surfaced = [...summary.love, ...summary.maybe].map((r) => r.productId);
    expect(surfaced).not.toContain('p4');
  });

  it('counts distinct merchants across love+maybe (skip lane excluded)', async () => {
    // 3 products from 2 unique merchants in surfaced lanes; a 3rd merchant
    // only appears on the skip lane and must NOT contribute to the count.
    await upsertShortlist(SID, 'p1', 'love', { id: 'p1', title: 't', merchant: 'M1' });
    await upsertShortlist(SID, 'p2', 'love', { id: 'p2', title: 't', merchant: 'M2' });
    await upsertShortlist(SID, 'p3', 'maybe', { id: 'p3', title: 't', merchant: 'M1' });
    await upsertShortlist(SID, 'p4', 'skip', { id: 'p4', title: 't', merchant: 'M3' });

    const summary = await composeSessionSummary(SID);
    expect(summary.merchantCount).toBe(2);
  });

  it("extracts the first user message as the gist seed (clamped to 120 chars)", async () => {
    const seed = 'find me a wool sweater for cold weather under 200';
    await appendMessage(SID, {
      role: 'user',
      blocks: [{ type: 'text', text: seed }],
    });

    const summary = await composeSessionSummary(SID);
    expect(summary.gist).toBe(seed);
    expect(summary.gist.length).toBeLessThanOrEqual(120);
  });

  it('truncates a long first user message to exactly 120 chars (with trailing ellipsis)', async () => {
    const long = 'a'.repeat(300);
    await appendMessage(SID, {
      role: 'user',
      blocks: [{ type: 'text', text: long }],
    });

    const summary = await composeSessionSummary(SID);
    // GIST_MAX = 120; clampGist slices `MAX-1` then appends '…'.
    expect(summary.gist.length).toBe(120);
    expect(summary.gist.endsWith('…')).toBe(true);
  });

  it('counts outfit merchants in addition to shortlist merchants', async () => {
    await upsertShortlist(SID, 'p1', 'love', { id: 'p1', title: 't', merchant: 'M1' });
    await saveOutfit(SID, 'p1', [
      { id: 'p2', title: 't', merchant: 'M2' },
      { id: 'p3', title: 't', merchant: 'M3' },
    ]);

    const summary = await composeSessionSummary(SID);
    expect(summary.merchantCount).toBe(3);
    expect(summary.outfits.length).toBe(1);
  });
});
