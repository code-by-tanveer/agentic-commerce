import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendMessage, listMessages } from '../db/repos/messages.js';
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

const outfitsPostBodySchema = z
  .object({
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

export async function sessionRoutes(app: FastifyInstance) {
  const rateLimit = { max: 60, timeWindow: '1 minute' as const };

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
          { maxRows: OUTFITS_MAX_ROWS },
        );
        return reply.code(200).send(saved);
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
