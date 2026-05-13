import { createHash } from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { runMigrations } from './db/migrations/runner.js';
import { chatRoutes } from './routes/chat.js';
import { preferencesRoutes } from './routes/preferences.js';
import { sessionRoutes } from './routes/session.js';
import { uploadRoutes } from './routes/upload.js';
import { purgeStaleUploads } from './services/uploadsPurge.js';

// ARCH §9 — raw IPs must never hit logs. The session DB stores them salted as
// `sessions.ip_hash`; the logger emits the same salted hash so log lines and
// session rows can be cross-referenced without reconstructing the original IP.
function hashIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  return createHash('sha256').update(ip).update(env.IP_HASH_SALT).digest('hex').slice(0, 16);
}

async function main() {
  const app = Fastify({
    logger: {
      level: 'info',
      serializers: {
        req(request) {
          // Default Pino-Fastify req serializer minus raw IP / port; adds a
          // hashed identifier so abuse forensics still work.
          const raw = request as unknown as { ip?: string };
          return {
            method: request.method,
            url: request.url,
            hostname: request.hostname,
            reqId: request.id,
            ipHash: hashIp(raw.ip),
          };
        },
      },
      redact: {
        // Belt-and-braces: if a Groq/MCP SDK error ever attaches request
        // headers, the auth token never gets to stdout.
        paths: [
          'err.config.headers.authorization',
          'err.response.headers.authorization',
          'err.request.headers.authorization',
          '*.headers.authorization',
        ],
        censor: '[redacted]',
      },
    },
    trustProxy: true,
  });

  // CORS: FE talks to the backend through the Next.js same-origin proxy, so the
  // browser never sends credentialled cross-origin requests on the hot path
  // (ARCH §9). Explicit allowlist + `credentials: false` shrinks the surface.
  await app.register(cors, {
    origin: env.ALLOWED_ORIGINS,
    credentials: false,
  });

  await app.register(cookie);

  // ARCH §9 / cycle-4.md hard rule: 8 MB cap is enforced at the multipart
  // parser, NOT in application logic. We also bound to a single file per
  // upload — the route shape is `POST /api/upload` with one part.
  await app.register(multipart, {
    limits: {
      fileSize: 8 * 1024 * 1024,
      files: 1,
      fields: 0,
    },
  });

  await app.register(rateLimit, {
    global: false,
    // Per-route overrides set via { config: { rateLimit: ... } }.
    keyGenerator: (req) => req.ip,
  });

  // Run DB migrations BEFORE any route that touches the DB.
  runMigrations(app.log);

  app.get('/health', async () => ({ ok: true }));

  await app.register(chatRoutes);
  await app.register(sessionRoutes);
  await app.register(preferencesRoutes);
  await app.register(uploadRoutes);

  // Upload retention (cycle-4.md / ARCH §9): boot-time sweep + hourly cron.
  // Best-effort — never blocks boot.
  void purgeStaleUploads(app.log).catch((err) => {
    app.log.warn({ err }, 'initial purgeStaleUploads failed');
  });
  const purgeInterval = setInterval(
    () => {
      void purgeStaleUploads(app.log).catch((err) => {
        app.log.warn({ err }, 'scheduled purgeStaleUploads failed');
      });
    },
    60 * 60 * 1000,
  );
  // Don't keep the event loop alive on the timer alone.
  if (typeof purgeInterval.unref === 'function') purgeInterval.unref();
  app.addHook('onClose', async () => {
    clearInterval(purgeInterval);
  });

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
