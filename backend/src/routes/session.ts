import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { env, RATE_LIMITS } from '../config/env.js';
import { appendMessage, listMessages, listMessagesPage } from '../db/repos/messages.js';
import {
  deleteOutfit,
  listOutfits,
  saveOutfit,
} from '../db/repos/outfits.js';
import {
  getOrCreateSession,
  getSession,
  getViewMode,
  setViewMode,
} from '../db/repos/sessions.js';
import {
  isShortlistLane,
  listShortlist,
  removeShortlist,
  SHORTLIST_LANES,
  upsertShortlist,
} from '../db/repos/shortlists.js';

const messageBodySchema = z.object({
  role: z.enum(['user', 'assistant', 'tool']),
  blocks: z.unknown(),
  toolName: z.string().optional(),
  toolCallId: z.string().optional(),
});

// Cycle 3 security review (MEDIUM): bound storage abuse and reject hostile
// URL schemes inside FE-supplied snapshots. checkoutUrl is later fed to
// window.open(); images[0] is rendered in <img src>. Allow only http(s)://
// and same-origin relative paths.
const SAFE_URL = /^(?:https?:\/\/|\/)/i;
const safeUrl = z
  .string()
  .max(2048)
  .refine((s) => s === '' || SAFE_URL.test(s), {
    message: 'url must be http(s):// or a relative path',
  });

// Minimal product snapshot — every field the FE renders back out of the
// shortlist or lookbook surfaces. Anything else is dropped via .strict() on
// the outer wrapper; the snapshot itself keeps .passthrough() so unknown
// catalog metadata round-trips for future surfaces (Cycle 5 share page).
const productSnapshotSchema = z
  .object({
    id: z.string().min(1).max(256),
    upid: z.string().max(256).optional(),
    title: z.string().max(512),
    description: z.string().max(8192).optional().default(''),
    images: z.array(safeUrl).max(20).optional().default([]),
    price: z.number().nonnegative().max(1_000_000),
    compareAtPrice: z.number().nonnegative().max(1_000_000).optional(),
    currency: z.string().max(8),
    merchant: z.string().max(256),
    url: safeUrl.optional(),
    checkoutUrl: safeUrl,
    variants: z.array(z.unknown()).max(50).optional(),
    reasoningChips: z.array(z.unknown()).max(8).optional(),
    merchantInfo: z.unknown().optional(),
    merchantTags: z.array(z.string().max(64)).max(20).optional(),
  })
  .passthrough();

const shortlistPutBodySchema = z
  .object({
    lane: z.enum(['love', 'maybe', 'skip']),
    snapshot: productSnapshotSchema,
  })
  .strict();

// polish-round-2 T2.16: optional client-generated id makes POST idempotent.
// Shaped like the FE's `clientNanoid()` output (URL-safe alphabet, 21 chars).
const NANOID_SHAPE = /^[A-Za-z0-9_-]{16,32}$/;
const outfitsPostBodySchema = z
  .object({
    id: z
      .string()
      .regex(NANOID_SHAPE, 'id must be a nanoid-shaped string')
      .optional(),
    anchorProductId: z.string().trim().min(1).max(256),
    items: z.array(productSnapshotSchema).min(1).max(4),
  })
  .strict();

// Per-route body cap (Fastify default is 1 MB; this is the storage-abuse
// MEDIUM mitigation from Cycle 3 review). 32 KB comfortably fits a single
// product snapshot; outfits cap at 128 KB to hold up to 4 items.
const SNAPSHOT_BODY_LIMIT = 32 * 1024;
const OUTFITS_BODY_LIMIT = 128 * 1024;

// Per-session row caps (Cycle 3 review MEDIUM). Generous for real use,
// bound storage abuse from a runaway client.
const SHORTLIST_MAX_ROWS = 200;
const OUTFITS_MAX_ROWS = 50;

const viewModePutBodySchema = z
  .object({
    mode: z.enum(['list', 'collage']),
  })
  .strict();

// Cycle 8 history-restore (ARCH §8). `cursor` is the next `ordinal` to fetch
// (non-opaque, non-negative int). `limit` defaults to 50, hard-capped at 200.
const MESSAGES_DEFAULT_LIMIT = 50;
const MESSAGES_MAX_LIMIT = 200;
const messagesQuerySchema = z.object({
  cursor: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(MESSAGES_MAX_LIMIT).optional(),
});

const HISTORY_COOKIE_NAME = 'agentic_sid';

// Cycle 7 chat-history (PRODUCT §6 AC #1). The FE keeps the most recent N
// session ids in a client-readable cookie; flipping the active session here
// updates the BE-owned `agentic_sid` cookie so subsequent /api/chat writes
// land in the correct row. 30d max-age mirrors the cookie writes in
// `routes/chat.ts`. Re-issuing the cookie is the only side-effect; the DB
// row(s) are untouched.
function setSessionCookie(reply: FastifyReply, id: string): void {
  reply.setCookie(HISTORY_COOKIE_NAME, id, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function sessionRoutes(app: FastifyInstance) {
  // R3-cleanup (architect-code MEDIUM): rate-limit values sourced from the
  // centralised `RATE_LIMITS` matrix in `config/env.ts`.
  const rateLimit = RATE_LIMITS.session;

  // ---------------------------------------------------------------------------
  // Cycle 7 chat-history (PRODUCT §6 AC #1).
  // POST /api/session — mint a brand-new session row, set the cookie to it,
  // and return the new id. The previous session row stays intact in SQLite
  // (the 90d TTL sweep is what eventually drops it). The FE uses this when
  // the user hits the New-chat button; pairs with the client-side cookie
  // list (`agentic_sessions`) that tracks the user's last-5 chats.
  // ---------------------------------------------------------------------------
  app.post(
    '/api/session',
    { config: { rateLimit } },
    async (request, reply) => {
      const session = await getOrCreateSession(null, {
        userAgent: request.headers['user-agent'] ?? null,
        ip: request.ip,
      });
      setSessionCookie(reply, session.id);
      return { id: session.id };
    },
  );

  // POST /api/session/:id/activate — flip the `agentic_sid` cookie to point at
  // an existing session row. Used by the chat-history menu when the user
  // clicks a prior chat. We do NOT 404 on an unknown id here: the FE may be
  // resurrecting a row that's already been TTL'd, in which case
  // getOrCreateSession recreates it. That keeps the dropdown forgiving even
  // when the user's cookie list got out of sync with the DB.
  app.post<{ Params: { id: string } }>(
    '/api/session/:id/activate',
    { config: { rateLimit } },
    async (request, reply) => {
      const { id } = request.params;
      const session = await getOrCreateSession(id, {
        userAgent: request.headers['user-agent'] ?? null,
        ip: request.ip,
      });
      setSessionCookie(reply, session.id);
      return { id: session.id };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/session/:id',
    { config: { rateLimit } },
    async (request, reply) => {
      const { id } = request.params;
      const session = await getSession(id);
      if (!session) return reply.code(404).send({ error: 'not_found' });
      const messages = await listMessages(id);
      return { session, messages };
    },
  );

  // ---------------------------------------------------------------------------
  // History restore (Cycle 8, ARCH §8). Cursor-paginated read of the persisted
  // message timeline so a page reload can rehydrate the chat. The FE calls
  // this once per session-mount when a sessionId is present.
  //
  // - `cursor` is the next `ordinal` to fetch (NOT opaque). Default 0.
  // - `limit` defaults to 50, hard-capped at 200.
  // - `Cache-Control: no-store` — the timeline is per-user, mutable, and the
  //   FE always wants the freshest copy on reload.
  // - 403 when the path :id doesn't match the cookie session id. This
  //   prevents one tab from peeking at another session's history if a
  //   `sessionId` somehow leaks into a URL.
  // ---------------------------------------------------------------------------
  app.get<{ Params: { id: string }; Querystring: { cursor?: string; limit?: string } }>(
    '/api/session/:id/messages',
    { config: { rateLimit } },
    async (request, reply) => {
      const { id } = request.params;
      const cookieSid = request.cookies?.[HISTORY_COOKIE_NAME];
      // Only enforce when a cookie is actually present. Tests + the very
      // first request after cookie-clear have no cookie; in those cases we
      // fall back to no auth check (the session table is the gate — an
      // unknown :id returns an empty list, never another user's history).
      if (cookieSid && cookieSid !== id) {
        return reply.code(403).send({ error: 'forbidden' });
      }

      const parsedQuery = messagesQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply
          .code(400)
          .send({ error: 'invalid_request', details: parsedQuery.error.flatten() });
      }
      const cursor = parsedQuery.data.cursor ?? 0;
      const limit = parsedQuery.data.limit ?? MESSAGES_DEFAULT_LIMIT;

      const page = await listMessagesPage(id, cursor, limit);
      reply.header('Cache-Control', 'no-store');
      return {
        messages: page.rows.map((m) => ({
          id: m.id,
          role: m.role,
          status: m.status,
          blocks: m.blocks,
        })),
        nextCursor: page.nextCursor,
        totalCount: page.totalCount,
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/session/:id/messages',
    { config: { rateLimit } },
    async (request, reply) => {
      const { id } = request.params;
      const session = await getSession(id);
      if (!session) return reply.code(404).send({ error: 'not_found' });

      const parsed = messageBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: 'invalid_request', details: parsed.error.flatten() });
      }
      const message = await appendMessage(id, {
        role: parsed.data.role,
        blocks: parsed.data.blocks,
        toolName: parsed.data.toolName ?? null,
        toolCallId: parsed.data.toolCallId ?? null,
      });
      return { message };
    },
  );

  // -------------------------------------------------------------------------
  // Shortlist
  // -------------------------------------------------------------------------

  app.get<{ Params: { id: string } }>(
    '/api/session/:id/shortlist',
    { config: { rateLimit } },
    async (request) => {
      const { id } = request.params;
      // Create-on-read: FE can hydrate shortlist before the first chat lands.
      await getOrCreateSession(id, {
        userAgent: request.headers['user-agent'] ?? null,
        ip: request.ip,
      });
      const rows = await listShortlist(id);
      return rows;
    },
  );

  app.put<{ Params: { id: string; productId: string } }>(
    '/api/session/:id/shortlist/:productId',
    { config: { rateLimit }, bodyLimit: SNAPSHOT_BODY_LIMIT },
    async (request, reply) => {
      const { id, productId } = request.params;
      const parsed = shortlistPutBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: 'invalid_request', details: parsed.error.flatten() });
      }
      if (!isShortlistLane(parsed.data.lane)) {
        return reply.code(400).send({
          error: 'invalid_lane',
          attempted: parsed.data.lane,
          validLanes: SHORTLIST_LANES,
        });
      }
      await getOrCreateSession(id, {
        userAgent: request.headers['user-agent'] ?? null,
        ip: request.ip,
      });
      try {
        const row = await upsertShortlist(
          id,
          productId,
          parsed.data.lane,
          parsed.data.snapshot,
          { maxRows: SHORTLIST_MAX_ROWS },
        );
        return row;
      } catch (err) {
        if (err instanceof Error && err.message === 'row_cap_exceeded') {
          return reply.code(409).send({
            error: 'row_cap_exceeded',
            limit: SHORTLIST_MAX_ROWS,
            message: 'Shortlist row cap reached for this session.',
          });
        }
        throw err;
      }
    },
  );

  app.delete<{ Params: { id: string; productId: string } }>(
    '/api/session/:id/shortlist/:productId',
    { config: { rateLimit } },
    async (request, reply) => {
      const { id, productId } = request.params;
      const removed = await removeShortlist(id, productId);
      return reply.code(200).send({ ok: true, removed });
    },
  );

  // -------------------------------------------------------------------------
  // Saved outfits
  // -------------------------------------------------------------------------

  app.get<{ Params: { id: string } }>(
    '/api/session/:id/outfits',
    { config: { rateLimit } },
    async (request) => {
      const { id } = request.params;
      await getOrCreateSession(id, {
        userAgent: request.headers['user-agent'] ?? null,
        ip: request.ip,
      });
      const rows = await listOutfits(id);
      return rows;
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/session/:id/outfits',
    { config: { rateLimit }, bodyLimit: OUTFITS_BODY_LIMIT },
    async (request, reply) => {
      const { id } = request.params;
      const parsed = outfitsPostBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: 'invalid_request', details: parsed.error.flatten() });
      }
      await getOrCreateSession(id, {
        userAgent: request.headers['user-agent'] ?? null,
        ip: request.ip,
      });
      try {
        const saved = await saveOutfit(
          id,
          parsed.data.anchorProductId,
          parsed.data.items,
          { maxRows: OUTFITS_MAX_ROWS, id: parsed.data.id },
        );
        // T2.16: same shape on first-write vs retry; FE doesn't need to
        // distinguish (idempotent flag is informational for logs only).
        return reply.code(200).send({ id: saved.id });
      } catch (err) {
        if (err instanceof Error && err.message === 'row_cap_exceeded') {
          return reply.code(409).send({
            error: 'row_cap_exceeded',
            limit: OUTFITS_MAX_ROWS,
            message: 'Saved outfit cap reached for this session.',
          });
        }
        throw err;
      }
    },
  );

  app.delete<{ Params: { id: string; outfitId: string } }>(
    '/api/session/:id/outfits/:outfitId',
    { config: { rateLimit } },
    async (request, reply) => {
      const { id, outfitId } = request.params;
      const removed = await deleteOutfit(id, outfitId);
      return reply.code(200).send({ ok: true, removed });
    },
  );

  // -------------------------------------------------------------------------
  // View mode (collage toggle persistence)
  // -------------------------------------------------------------------------

  app.get<{ Params: { id: string } }>(
    '/api/session/:id/view-mode',
    { config: { rateLimit } },
    async (request) => {
      const { id } = request.params;
      await getOrCreateSession(id, {
        userAgent: request.headers['user-agent'] ?? null,
        ip: request.ip,
      });
      const mode = await getViewMode(id);
      return { mode };
    },
  );

  app.put<{ Params: { id: string } }>(
    '/api/session/:id/view-mode',
    { config: { rateLimit } },
    async (request, reply) => {
      const { id } = request.params;
      const parsed = viewModePutBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: 'invalid_request', details: parsed.error.flatten() });
      }
      await getOrCreateSession(id, {
        userAgent: request.headers['user-agent'] ?? null,
        ip: request.ip,
      });
      await setViewMode(id, parsed.data.mode);
      return { mode: parsed.data.mode };
    },
  );
}
