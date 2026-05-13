import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RATE_LIMITS } from '../config/env.js';
import {
  deletePreference,
  isPreferenceKey,
  listPreferences,
  PREFERENCE_KEYS,
  upsertPreference,
} from '../db/repos/preferences.js';
import { getOrCreateSession } from '../db/repos/sessions.js';

// R3-cleanup (architect-code MEDIUM): same bucket as the rest of /api/session/*
// (cycle-2.md: "Reuse the existing /api/session/* rate-limit bucket
// (60/min/IP)"). Values sourced from the centralised `RATE_LIMITS` matrix; the
// per-key keying is set globally in `index.ts`.
const RATE_LIMIT = RATE_LIMITS.preferences;

const putBodySchema = z
  .object({
    value: z.unknown(),
    source: z.enum(['user', 'inferred', 'agent']).optional(),
  })
  .strict();

export async function preferencesRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    '/api/session/:id/preferences',
    { config: { rateLimit: RATE_LIMIT } },
    async (request) => {
      const { id } = request.params;
      // Create-on-read keeps the FE / cookie session flow simple: the FE
      // can fetch prefs before the first chat message lands.
      await getOrCreateSession(id, {
        userAgent: request.headers['user-agent'] ?? null,
        ip: request.ip,
      });
      const prefs = await listPreferences(id);
      return prefs;
    },
  );

  app.put<{ Params: { id: string; key: string } }>(
    '/api/session/:id/preferences/:key',
    { config: { rateLimit: RATE_LIMIT } },
    async (request, reply) => {
      const { id, key } = request.params;

      if (!isPreferenceKey(key)) {
        return reply.code(400).send({
          error: 'invalid_key',
          attempted: key,
          validKeys: PREFERENCE_KEYS,
        });
      }

      const parsed = putBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: 'invalid_request', details: parsed.error.flatten() });
      }

      await getOrCreateSession(id, {
        userAgent: request.headers['user-agent'] ?? null,
        ip: request.ip,
      });

      const entry = await upsertPreference(
        id,
        key,
        parsed.data.value,
        parsed.data.source ?? 'user',
      );
      return { key, ...entry };
    },
  );

  app.delete<{ Params: { id: string; key: string } }>(
    '/api/session/:id/preferences/:key',
    { config: { rateLimit: RATE_LIMIT } },
    async (request, reply) => {
      const { id, key } = request.params;
      if (!isPreferenceKey(key)) {
        return reply.code(400).send({
          error: 'invalid_key',
          attempted: key,
          validKeys: PREFERENCE_KEYS,
        });
      }
      const removed = await deletePreference(id, key);
      return reply.code(200).send({ ok: true, removed });
    },
  );
}
