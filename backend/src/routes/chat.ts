import type { FastifyInstance } from 'fastify';
import type { ChatCompletionMessageParam } from 'groq-sdk/resources/chat/completions';
import { z } from 'zod';
import { env } from '../config/env.js';
import { runAgent } from '../services/agent.js';
import { sharedCache } from '../services/cache.js';
import { SYSTEM_PROMPT } from '../services/prompts.js';
import { ToolRegistry } from '../services/toolRegistry.js';
import { compareProductsTool } from '../services/tools/compareProducts.js';
import { extractStyleFromImageTool } from '../services/tools/extractStyleFromImage.js';
import { getPreferencesTool } from '../services/tools/getPreferences.js';
import { getProductDetailsTool } from '../services/tools/getProductDetails.js';
import { recommendOutfitTool } from '../services/tools/recommendOutfit.js';
import { savePreferenceTool } from '../services/tools/savePreference.js';
import { searchCatalogTool } from '../services/tools/searchCatalog.js';
import { SseWriter } from '../stream/sseWriter.js';
import { getOrCreateSession } from '../db/repos/sessions.js';
import { appendMessage } from '../db/repos/messages.js';
import { listPreferences } from '../db/repos/preferences.js';
import type { PreferencesSnapshot } from '../types/tool.js';

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
  .register(getPreferencesTool)
  .register(recommendOutfitTool)
  .register(extractStyleFromImageTool);

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

    // Set / refresh cookie. Cycle 6: `Secure` is gated on NODE_ENV so dev over
    // plain HTTP doesn't silently drop the cookie (Security LOW carry-over
    // from Cycle 1). HTTPS-only in production via the env flag.
    reply.setCookie(COOKIE_NAME, session.id, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });

    // Open the SSE channel BEFORE any awaited DB work — `new SseWriter` flushes
    // headers and writes `: open\n\n` synchronously, so the FE sees the socket
    // open immediately. Cycle 7 perf polish (T1.25): prior code awaited
    // `appendMessage` first, which delayed first-token latency by one
    // SQLite round-trip on every user turn.
    const writer = new SseWriter(reply);
    const controller = new AbortController();

    // Persist the latest user turn for context across reloads. Fire-and-forget
    // so it can't gate the first SSE event. Errors are logged but never block
    // the agent loop — the assistant turn still runs without the user message
    // landing in history (the next request's `messages[]` from the FE carries
    // the same text anyway).
    const lastUser = [...parsed.data.messages].reverse().find((m) => m.role === 'user');
    if (lastUser && lastUser.content) {
      const content = lastUser.content;
      void appendMessage(session.id, {
        role: 'user',
        blocks: [{ type: 'text', text: content }],
      }).catch((err) => {
        request.log.warn({ err }, 'failed to persist user message');
      });
    }

    // Cycle 7 perf polish (T1.26): race the preferences SELECT with the rest
    // of the pre-stream prep so the agent loop doesn't serialise on it.
    // `runAgent` awaits this promise only when composing the system prompt;
    // the SSE channel is already open by then.
    const preferencesPromise: Promise<PreferencesSnapshot> = listPreferences(session.id)
      .then((p) => p as PreferencesSnapshot)
      .catch((err) => {
        request.log.warn({ err }, 'failed to load preferences; continuing with empty snapshot');
        return {} as PreferencesSnapshot;
      });

    let abortedAlready = false;
    const onClose = (reason: string) => {
      if (abortedAlready) return;
      abortedAlready = true;
      // Architect carry-over verification (cycle-3.md): logs the FE-disconnect
      // path so we can confirm abort propagation end-to-end. We listen on
      // both `request.raw` and the underlying socket because Node's
      // `IncomingMessage.on('close')` is not reliable for streaming POSTs in
      // every environment (e.g. WSL2 kernels can deliver the FIN to the
      // socket without re-emitting on the request).
      request.log.info(
        { sessionId: session.id, reason },
        'client disconnected; aborting agent loop',
      );
      controller.abort();
      writer.close();
    };
    const onReqClose = () => onClose('req.close');
    const onSocketClose = () => onClose('socket.close');
    request.raw.on('close', onReqClose);
    request.raw.socket?.on('close', onSocketClose);

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
      // Cycle 7 perf polish (T1.26): preferences SELECT was kicked off above
      // in parallel with the SSE header flush, the cookie set, and the history
      // mapping. By the time we hit this `await` the SELECT is typically
      // already resolved on warm caches, and at worst we serialise on a
      // single SQLite read while the FE socket is already open.
      const preferences = await preferencesPromise;
      await runAgent({
        sessionId: session.id,
        history,
        system: SYSTEM_PROMPT,
        registry,
        // T2.6: writer.write is async (awaits drain on backpressure); the
        // agent loop awaits this so backpressure propagates upstream.
        emit: (e) => writer.write(e),
        signal: controller.signal,
        log: request.log,
        cache: sharedCache,
        preferences,
      });
    } catch (err) {
      // Cycle-6 architect catch — never ship raw `err.message` to the SSE
      // error frame (re-opens Cycle-1 Security-LOW sanitization rule).
      // `runAgent` covers ~all error paths via `classifyError`; this is the
      // safety net for everything that escapes it.
      request.log.error({ err }, 'chat route failed');
      try {
        await writer.write({
          type: 'error',
          code: 'internal',
          message: 'Something went wrong on our side. Try again?',
          retryable: true,
        });
      } catch {
        // ignore
      }
    } finally {
      request.raw.off('close', onReqClose);
      request.raw.socket?.off('close', onSocketClose);
      writer.close();
    }
  });
}
