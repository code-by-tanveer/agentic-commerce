import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import { db } from '../db/sqlite.js';
import { runMigrations } from '../db/migrations/runner.js';
import { sessionRoutes } from './session.js';
import { preferencesRoutes } from './preferences.js';

// polish-round-3: light Fastify `inject` integration. No port binding, no
// network. Asserts the validation/idempotency/safe-URL surface area without
// reaching for the agent loop or any external dependency.

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  // Per-route configs need the rate-limit plugin registered first.
  await app.register(rateLimit, { global: false });
  await app.register(sessionRoutes);
  await app.register(preferencesRoutes);
  return app;
}

function resetTables() {
  db.exec('DELETE FROM shortlists');
  db.exec('DELETE FROM saved_outfits');
  db.exec('DELETE FROM messages');
  db.exec('DELETE FROM preferences');
  db.exec('DELETE FROM sessions');
}

describe('routes/session — smoke via fastify.inject', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    runMigrations();
    resetTables();
    app = await buildApp();
    await app.ready();
  });

  afterAll(() => {
    try {
      resetTables();
    } catch {
      // ignore
    }
  });

  it('GET /api/session/:id returns 404 for an unknown session', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/session/does-not-exist',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it('PUT then GET preferences round-trips a value', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/api/session/sess-prefs/preferences/size',
      payload: { value: '8' },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ key: 'size', value: '8' });

    const get = await app.inject({
      method: 'GET',
      url: '/api/session/sess-prefs/preferences',
    });
    expect(get.statusCode).toBe(200);
    const body = get.json() as Record<string, { value: unknown }>;
    expect(body.size?.value).toBe('8');
  });

  it('PUT an unknown preference key returns 400 invalid_key + the enum', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/session/sess-bad-key/preferences/banana',
      payload: { value: 'x' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string; attempted: string; validKeys: string[] };
    expect(body.error).toBe('invalid_key');
    expect(body.attempted).toBe('banana');
    expect(Array.isArray(body.validKeys)).toBe(true);
    expect(body.validKeys).toContain('size');
  });

  it("PUT shortlist with a hostile checkoutUrl ('javascript:…') is rejected 400 with the URL-scheme validator message", async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/session/sess-shortlist/shortlist/p1',
      payload: {
        lane: 'love',
        snapshot: {
          id: 'p1',
          title: 'Pwn',
          price: 1,
          currency: 'USD',
          merchant: 'Bad',
          checkoutUrl: 'javascript:alert(1)',
        },
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string; details: { fieldErrors: Record<string, string[]> } };
    expect(body.error).toBe('invalid_request');
    // The flattened Zod error surfaces under either `fieldErrors` or
    // `formErrors`; the safeUrl refinement message includes the scheme hint.
    const flat = JSON.stringify(body.details);
    expect(flat).toContain('http(s)://');
  });

  // ---------------------------------------------------------------------------
  // Cycle 8 history-restore (ARCH §8).
  // GET /api/session/:id/messages — cursor-paginated read of persisted turns.
  // ---------------------------------------------------------------------------

  it('GET /api/session/:id/messages returns an empty page + null cursor for a fresh session', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/session/sess-empty/messages',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.json() as {
      messages: unknown[];
      nextCursor: number | null;
      totalCount: number;
    };
    expect(body).toEqual({ messages: [], nextCursor: null, totalCount: 0 });
  });

  it('GET /api/session/:id/messages paginates across two pages by ordinal', async () => {
    const sid = 'sess-paginate';
    // Seed: ensure the session row exists for FK, then write 3 messages.
    const { getOrCreateSession } = await import('../db/repos/sessions.js');
    const { appendMessage } = await import('../db/repos/messages.js');
    await getOrCreateSession(sid);
    await appendMessage(sid, { role: 'user', blocks: [{ type: 'text', text: 'one' }] });
    await appendMessage(sid, {
      role: 'assistant',
      blocks: [{ type: 'text', text: 'two' }],
    });
    await appendMessage(sid, { role: 'user', blocks: [{ type: 'text', text: 'three' }] });

    // Page 1: limit=2 → first two ordinals, nextCursor = 3.
    const page1 = await app.inject({
      method: 'GET',
      url: `/api/session/${sid}/messages?limit=2`,
    });
    expect(page1.statusCode).toBe(200);
    const body1 = page1.json() as {
      messages: Array<{ role: string; blocks: unknown; status: string }>;
      nextCursor: number | null;
      totalCount: number;
    };
    expect(body1.messages.length).toBe(2);
    expect(body1.messages[0].role).toBe('user');
    expect(body1.messages[1].role).toBe('assistant');
    expect(body1.totalCount).toBe(3);
    expect(body1.nextCursor).toBe(3);
    // blocks_json round-trips parsed (not a raw string).
    expect(Array.isArray(body1.messages[0].blocks)).toBe(true);

    // Page 2: cursor=3 picks up the last row, nextCursor null.
    const page2 = await app.inject({
      method: 'GET',
      url: `/api/session/${sid}/messages?cursor=3&limit=2`,
    });
    expect(page2.statusCode).toBe(200);
    const body2 = page2.json() as {
      messages: Array<{ role: string }>;
      nextCursor: number | null;
      totalCount: number;
    };
    expect(body2.messages.length).toBe(1);
    expect(body2.messages[0].role).toBe('user');
    expect(body2.nextCursor).toBeNull();
    expect(body2.totalCount).toBe(3);
  });

  it('GET /api/session/:id/messages returns 403 when the cookie session id does not match the path', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/session/sess-victim/messages',
      cookies: { agentic_sid: 'sess-attacker' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'forbidden' });
  });

  it.each([
    ['cursor=-1', '/api/session/sess-bad/messages?cursor=-1'],
    ['cursor=abc', '/api/session/sess-bad/messages?cursor=abc'],
    ['limit=0', '/api/session/sess-bad/messages?limit=0'],
    ['limit=201', '/api/session/sess-bad/messages?limit=201'],
    ['limit=abc', '/api/session/sess-bad/messages?limit=abc'],
  ])('GET messages rejects %s with 400', async (_label, url) => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe('invalid_request');
  });

  it('outfits POST with the same id is idempotent (two calls → one row)', async () => {
    const sid = 'sess-outfit-idem';
    const outfitId = 'abcdefgh12345678ijkl';
    const payload = {
      id: outfitId,
      anchorProductId: 'p-anchor',
      items: [
        {
          id: 'p1',
          title: 'Item 1',
          price: 10,
          currency: 'USD',
          merchant: 'M',
          checkoutUrl: 'https://example.com/x',
        },
      ],
    };

    const first = await app.inject({
      method: 'POST',
      url: `/api/session/${sid}/outfits`,
      payload,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ id: outfitId });

    const second = await app.inject({
      method: 'POST',
      url: `/api/session/${sid}/outfits`,
      payload,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ id: outfitId });

    const list = await app.inject({
      method: 'GET',
      url: `/api/session/${sid}/outfits`,
    });
    expect(list.statusCode).toBe(200);
    const rows = list.json() as Array<{ id: string }>;
    expect(rows.length).toBe(1);
    expect(rows[0]?.id).toBe(outfitId);
  });
});
