import { createHash } from 'node:crypto';
import { statfs } from 'node:fs/promises';
import { resolve } from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { db } from './db/sqlite.js';
import { runMigrations } from './db/migrations/runner.js';
import { chatRoutes } from './routes/chat.js';
import { preferencesRoutes } from './routes/preferences.js';
import { sessionRoutes } from './routes/session.js';
import { summaryRoutes } from './routes/summary.js';
import { uploadRoutes } from './routes/upload.js';
import { purgeStaleUploads } from './services/uploadsPurge.js';

const COOKIE_NAME = 'agentic_sid';

// polish-round-2 T2.4: log a warning when free space on the upload volume
// drops below this threshold. Stage-1 ops only — Stage-2 should page on it.
const FREE_SPACE_WARN_RATIO = 0.2;

// polish-round-2 T2.5: 90-day window for anonymous session retention. The
// session schema has ON DELETE CASCADE on preferences/messages/shortlists/
// saved_outfits, so deleting the parent collapses all four child tables.
const SESSION_TTL_DAYS = 90;

// polish-round-2 T2.2: SIGTERM drain budget. Fly's default grace_period is
// 30s on rolling deploys; we reserve 5s for the final WAL checkpoint + db
// close so the actual app.close() wait is 25s.
const DRAIN_TIMEOUT_MS = 25_000;

// ARCH §9 — raw IPs must never hit logs. The session DB stores them salted as
// `sessions.ip_hash`; the logger emits the same salted hash so log lines and
// session rows can be cross-referenced without reconstructing the original IP.
function hashIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  return createHash('sha256').update(ip).update(env.IP_HASH_SALT).digest('hex').slice(0, 16);
}

/**
 * polish-round-2 T2.4: probe free space on the UPLOAD_DIR volume and log a
 * warning if it's below the configured ratio. Best-effort — a missing
 * directory or `statfs` failure logs once at debug, never throws.
 */
async function checkUploadVolumeFreeSpace(
  log: { warn: (...a: unknown[]) => void; debug: (...a: unknown[]) => void; info: (...a: unknown[]) => void },
): Promise<void> {
  try {
    const stats = await statfs(resolve(env.UPLOAD_DIR));
    const free = stats.bfree * stats.bsize;
    const total = stats.blocks * stats.bsize;
    if (total === 0) return;
    const freeRatio = free / total;
    if (freeRatio < FREE_SPACE_WARN_RATIO) {
      log.warn(
        {
          freeBytes: free,
          totalBytes: total,
          freePct: Math.round(freeRatio * 1000) / 10,
          path: env.UPLOAD_DIR,
        },
        'upload volume free space below 20%',
      );
    } else {
      log.debug(
        { freePct: Math.round(freeRatio * 1000) / 10, path: env.UPLOAD_DIR },
        'upload volume free space check ok',
      );
    }
  } catch (err) {
    log.debug({ err, path: env.UPLOAD_DIR }, 'statfs failed; skipping free-space check');
  }
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
    // polish-round-2 T2.17: trust ONLY the immediate hop (Fly's proxy). Prior
    // `trustProxy: true` allowed arbitrary upstream X-Forwarded-For chains —
    // not exploitable in the current Fly-only ingress, but would silently
    // break rate-limit keying the moment someone exposed the backend port
    // directly for a smoke test.
    trustProxy: 1,
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
  // R3-cleanup (architect-code MEDIUM): cap promoted to `env.UPLOAD_MAX_BYTES`.
  await app.register(multipart, {
    limits: {
      fileSize: env.UPLOAD_MAX_BYTES,
      files: 1,
      fields: 0,
    },
  });

  await app.register(rateLimit, {
    global: false,
    // Per-route overrides set via { config: { rateLimit: ... } }.
    // polish-round-2 T2.13: key by the session cookie first, then by IP as a
    // fallback. Shared-NAT users (mobile carrier CGNAT, office NAT) used to
    // share a single 10/min bucket across thousands of people; the
    // `agentic_sid` cookie is set on the first /api/chat write so subsequent
    // requests bucket per-session instead. First-ever request (no cookie
    // yet) still falls back to IP, which is the correct ceiling.
    keyGenerator: (req) => req.cookies?.[COOKIE_NAME] ?? req.ip,
  });

  // Run DB migrations BEFORE any route that touches the DB.
  runMigrations(app.log);

  // polish-round-2 T2.3: /health is **liveness-only**. The previous doc claim
  // about a "Groq reachable boolean" was reconciled away — this endpoint
  // returns `{ ok: true }` unconditionally so Fly's healthcheck reports the
  // backend process being up. A richer `/ready` probe (Groq + MCP reachability
  // with 1s timeouts, 10s cache) is a Stage-2 add. See docs/ARCHITECTURE.md §10
  // and docs/DEPLOY.md §2 healthcheck.
  app.get('/health', async () => ({ ok: true }));

  await app.register(chatRoutes);
  await app.register(sessionRoutes);
  await app.register(summaryRoutes);
  await app.register(preferencesRoutes);
  await app.register(uploadRoutes);

  // Upload retention (cycle-4.md / ARCH §9): boot-time sweep + hourly cron.
  // Best-effort — never blocks boot.
  void purgeStaleUploads(app.log).catch((err) => {
    app.log.warn({ err }, 'initial purgeStaleUploads failed');
  });
  // polish-round-2 T2.4: boot-time + hourly free-space check on the upload
  // volume. Runs alongside the existing purge cron — both share the 1h cadence.
  void checkUploadVolumeFreeSpace(app.log);
  const purgeInterval = setInterval(
    () => {
      void purgeStaleUploads(app.log).catch((err) => {
        app.log.warn({ err }, 'scheduled purgeStaleUploads failed');
      });
      void checkUploadVolumeFreeSpace(app.log);
    },
    60 * 60 * 1000,
  );
  // Don't keep the event loop alive on the timer alone.
  if (typeof purgeInterval.unref === 'function') purgeInterval.unref();

  // Cycle 6 carry-over (architect): daily WAL checkpoint to bound the
  // -wal file's growth so the SQLite volume on Fly stays sane. TRUNCATE
  // mode rewrites pages back into the main DB file and shrinks -wal back
  // to zero. Best-effort — a busy writer just means we retry tomorrow.
  const walCheckpointInterval = setInterval(
    () => {
      try {
        db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        app.log.info('wal checkpoint ok');
      } catch (e) {
        app.log.warn({ err: e }, 'wal checkpoint failed');
      }
    },
    24 * 60 * 60 * 1000,
  );
  if (typeof walCheckpointInterval.unref === 'function') {
    walCheckpointInterval.unref();
  }

  // polish-round-2 T2.5: daily session TTL sweep. Sessions older than 90 days
  // are deleted; foreign-key CASCADE on preferences/messages/shortlists/
  // saved_outfits collapses every child row in the same transaction. The
  // 90-day window is documented in docs/ARCHITECTURE.md §9 — the PRODUCT.md
  // anti-account stance means casual visitors WILL leave session rows behind,
  // and without TTL the volume grows unbounded.
  const sessionTtlStmt = db.prepare(
    `DELETE FROM sessions WHERE updated_at < datetime('now', '-${SESSION_TTL_DAYS} days')`,
  );
  const sessionTtlInterval = setInterval(
    () => {
      try {
        const info = sessionTtlStmt.run();
        app.log.info(
          { deleted: info.changes, ttlDays: SESSION_TTL_DAYS },
          'session ttl sweep complete',
        );
      } catch (e) {
        app.log.warn({ err: e }, 'session ttl sweep failed');
      }
    },
    24 * 60 * 60 * 1000,
  );
  if (typeof sessionTtlInterval.unref === 'function') {
    sessionTtlInterval.unref();
  }

  app.addHook('onClose', async () => {
    clearInterval(purgeInterval);
    clearInterval(walCheckpointInterval);
    clearInterval(sessionTtlInterval);
    // polish-round-2 T2.2: final WAL checkpoint on graceful shutdown so the
    // -wal file is folded back into the main DB before the process exits.
    // Without this, the next boot does the work — fine on a clean exit,
    // but a Fly machine restart on the volume mid-flight could leave a
    // partial WAL the next reader has to recover.
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      app.log.info('shutdown: wal checkpoint ok');
    } catch (e) {
      app.log.warn({ err: e }, 'shutdown: wal checkpoint failed');
    }
    try {
      db.close();
      app.log.info('shutdown: db closed');
    } catch (e) {
      app.log.warn({ err: e }, 'shutdown: db close failed');
    }
  });

  // polish-round-2 T2.2: SIGTERM/SIGINT drain. Every `fly deploy` rolls the
  // machine with SIGTERM; the prior process exited immediately, mid-truncating
  // every in-flight SSE. We now:
  //   1. log `shutdown begin`
  //   2. stop accepting new connections via `app.close()` (Fastify drains
  //      onClose hooks, which runs the WAL checkpoint + db.close above)
  //   3. cap the wait at DRAIN_TIMEOUT_MS via Promise.race
  //   4. exit 0 on clean drain, 1 on timeout
  // The agent loop's existing AbortController is wired off the request socket
  // — when Fastify closes connections, each SSE stream's `request.raw.on('close')`
  // fires and aborts the in-flight Groq stream, so this drain finishes within
  // the budget for any reasonable turn.
  let shuttingDown = false;
  const drain = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutdown begin');

    const timeout = new Promise<'timeout'>((res) =>
      setTimeout(() => res('timeout'), DRAIN_TIMEOUT_MS).unref(),
    );
    const closing = app.close().then(() => 'closed' as const);
    try {
      const result = await Promise.race([closing, timeout]);
      if (result === 'timeout') {
        app.log.warn({ signal, timeoutMs: DRAIN_TIMEOUT_MS }, 'shutdown timeout — exiting 1');
        process.exit(1);
      }
      app.log.info({ signal }, 'shutdown complete');
      process.exit(0);
    } catch (err) {
      app.log.error({ err, signal }, 'shutdown failed — exiting 1');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void drain('SIGTERM'));
  process.on('SIGINT', () => void drain('SIGINT'));

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
