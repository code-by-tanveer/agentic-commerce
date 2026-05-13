// Cycle 5 (Phase D) — shareable session summary routes.
//
// POST /api/session/:id/summary  → snapshot the current shortlist + outfits
//                                  into sessions.summary_blob, return the
//                                  public URL.
// GET  /api/session/:id/summary  → read the persisted blob. 404 if missing
//                                  or older than 7 days (stale).
//
// Idempotent: re-POSTing overwrites the blob in place; the URL never
// changes. No LLM call this cycle — composeSessionSummary is deterministic.

import type { FastifyInstance } from 'fastify';
import { RATE_LIMITS } from '../config/env.js';
import {
  getSession,
  getSummaryBlob,
  setSummaryBlob,
} from '../db/repos/sessions.js';
import {
  composeSessionSummary,
  type SummaryBlob,
} from '../services/summary.js';

// No client body — just metadata. Keep the cap tight (defense-in-depth
// against accidental large posts).
const POST_BODY_LIMIT = 16 * 1024;

// Stale-after window. Matches the "snapshot semantics" choice in
// PRODUCT.md Q4: revisits don't update, but past a week we'd rather force
// the user to re-share than serve a fossil.
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export async function summaryRoutes(app: FastifyInstance) {
  // R3-cleanup (architect-code MEDIUM): rate-limit values sourced from the
  // centralised `RATE_LIMITS` matrix in `config/env.ts`.
  const rateLimit = RATE_LIMITS.summary;

  app.post<{ Params: { id: string } }>(
    '/api/session/:id/summary',
    { config: { rateLimit }, bodyLimit: POST_BODY_LIMIT },
    async (request, reply) => {
      const { id } = request.params;
      const session = await getSession(id);
      if (!session) return reply.code(404).send({ error: 'not_found' });

      const blob = await composeSessionSummary(id);
      await setSummaryBlob(id, blob);
      return reply.code(200).send({ url: `/s/${id}` });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/session/:id/summary',
    { config: { rateLimit } },
    async (request, reply) => {
      const { id } = request.params;
      const blob = await getSummaryBlob<SummaryBlob>(id);
      if (!blob) return reply.code(404).send({ error: 'not_found' });

      const createdAtMs = Date.parse(blob.createdAt);
      if (
        Number.isFinite(createdAtMs) &&
        Date.now() - createdAtMs > STALE_AFTER_MS
      ) {
        return reply.code(404).send({ error: 'stale' });
      }

      return reply.code(200).send(blob);
    },
  );
}
