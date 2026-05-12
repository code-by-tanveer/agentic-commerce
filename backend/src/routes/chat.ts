import type { FastifyInstance } from 'fastify';
import type { ChatCompletionMessageParam } from 'groq-sdk/resources/chat/completions';
import { z } from 'zod';
import { runAgent } from '../services/agent.js';
import { sharedCache } from '../services/cache.js';
import { SYSTEM_PROMPT } from '../services/prompts.js';
import { ToolRegistry } from '../services/toolRegistry.js';
import { compareProductsTool } from '../services/tools/compareProducts.js';
import { getPreferencesTool } from '../services/tools/getPreferences.js';
import { getProductDetailsTool } from '../services/tools/getProductDetails.js';
import { savePreferenceTool } from '../services/tools/savePreference.js';
import { searchCatalogTool } from '../services/tools/searchCatalog.js';
import { SseWriter } from '../stream/sseWriter.js';
import { getOrCreateSession } from '../db/repos/sessions.js';
import { appendMessage } from '../db/repos/messages.js';

const COOKIE_NAME = 'agentic_sid';

const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().nullable().optional(),
  // We accept richer assistant/tool payloads as a passthrough; the agent
  // is responsible for shaping them into Groq message params.
  tool_call_id: z.string().optional(),
  name: z.string().optional(),
});

const bodySchema = z.object({
  sessionId: z.string().optional(),
  messages: z.array(messageSchema).min(1).max(100),
});

const registry = new ToolRegistry()
  .register(searchCatalogTool)
  .register(getProductDetailsTool)
  .register(compareProductsTool)
  .register(savePreferenceTool)
  .register(getPreferencesTool);

export async function chatRoutes(app: FastifyInstance) {
  app.post('/api/chat', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_request', details: parsed.error.flatten() });
    }

    const cookieSid = request.cookies?.[COOKIE_NAME];
    const sessionId = parsed.data.sessionId || cookieSid || undefined;

    const session = await getOrCreateSession(sessionId, {
      userAgent: request.headers['user-agent'] ?? null,
      ip: request.ip,
    });

    // Set / refresh cookie.
    reply.setCookie(COOKIE_NAME, session.id, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });

    // Persist the latest user turn for context across reloads.
    const lastUser = [...parsed.data.messages].reverse().find((m) => m.role === 'user');
    if (lastUser && lastUser.content) {
      try {
        await appendMessage(session.id, {
          role: 'user',
          blocks: [{ type: 'text', text: lastUser.content }],
        });
      } catch (err) {
        request.log.warn({ err }, 'failed to persist user message');
      }
    }

    const writer = new SseWriter(reply);
    const controller = new AbortController();

    const onClose = () => {
      controller.abort();
      writer.close();
    };
    request.raw.on('close', onClose);

    // Shape the FE-supplied messages into Groq's ChatCompletionMessageParam.
    // Cycle 1 only sends user + assistant text; richer shapes land later.
    const history: ChatCompletionMessageParam[] = parsed.data.messages
      .map((m): ChatCompletionMessageParam | null => {
        if (m.role === 'system') return null; // we own the system prompt
        if (m.role === 'user') return { role: 'user', content: m.content ?? '' };
        if (m.role === 'assistant')
          return { role: 'assistant', content: m.content ?? '' };
        if (m.role === 'tool' && m.tool_call_id)
          return {
            role: 'tool',
            tool_call_id: m.tool_call_id,
            content: m.content ?? '',
          };
        return null;
      })
      .filter((m): m is ChatCompletionMessageParam => m !== null);

    try {
      await runAgent({
        sessionId: session.id,
        history,
        system: SYSTEM_PROMPT,
        registry,
        emit: (e) => writer.write(e),
        signal: controller.signal,
        log: request.log,
        cache: sharedCache,
      });
    } catch (err) {
      request.log.error({ err }, 'chat route failed');
      try {
        writer.write({
          type: 'error',
          code: 'internal',
          message: err instanceof Error ? err.message : 'internal_error',
          retryable: true,
        });
      } catch {
        // ignore
      }
    } finally {
      request.raw.off('close', onClose);
      writer.close();
    }
  });
}
