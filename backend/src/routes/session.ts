import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendMessage, listMessages } from '../db/repos/messages.js';
import { getSession } from '../db/repos/sessions.js';

const messageBodySchema = z.object({
  role: z.enum(['user', 'assistant', 'tool']),
  blocks: z.unknown(),
  toolName: z.string().optional(),
  toolCallId: z.string().optional(),
});

export async function sessionRoutes(app: FastifyInstance) {
  const rateLimit = { max: 60, timeWindow: '1 minute' };

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
}
