import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { fileTypeFromBuffer } from 'file-type';
import { nanoid } from 'nanoid';
import { env } from '../config/env.js';
import { signUploadUrl } from '../services/uploads.js';
import { purgeStaleUploads } from '../services/uploadsPurge.js';

const DISK_FULL_CODES = new Set(['ENOSPC', 'EDQUOT']);
const EMERGENCY_PURGE_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * POST /api/upload — multimodal entry point (cycle-4.md / ARCH §7, §9).
 *
 * Defense in depth:
 *   1. `@fastify/multipart` enforces the 8 MB cap at the parser layer
 *      (registered in index.ts).
 *   2. We re-sniff the bytes via `file-type`. The MIME header from the
 *      multipart part is NEVER trusted (ARCH §9 / cycle-4.md hard rule).
 *   3. Only jpeg/png/webp survive. Everything else → 415.
 *   4. Files land in `UPLOAD_DIR/<nanoid>.<ext>` with a 24h purge.
 *   5. We return an opaque `signed:<token>` URL — the vision tool's SSRF
 *      gate refuses anything else.
 *
 * Rate-limited at 5/min/IP (ARCH §9, cycle-4.md acceptance criterion #6).
 */

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp']);
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function uploadRoutes(app: FastifyInstance) {
  app.post(
    '/api/upload',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      // Multipart parser is registered at app level (index.ts). If a caller
      // hits this route without a multipart body, `isMultipart()` is false.
      if (!request.isMultipart()) {
        return reply.code(400).send({ error: 'multipart_required' });
      }

      let part;
      try {
        part = await request.file();
      } catch (err) {
        // RequestFileTooLargeError when content exceeds the 8 MB cap.
        const e = err as { code?: string; statusCode?: number };
        if (e?.code === 'FST_REQ_FILE_TOO_LARGE' || e?.statusCode === 413) {
          return reply.code(413).send({ error: 'file_too_large', maxBytes: 8 * 1024 * 1024 });
        }
        request.log.warn({ err }, 'upload: multipart parse failed');
        return reply.code(400).send({ error: 'invalid_multipart' });
      }
      if (!part) {
        return reply.code(400).send({ error: 'no_file' });
      }

      let buf: Buffer;
      try {
        buf = await part.toBuffer();
      } catch (err) {
        const e = err as { code?: string };
        if (e?.code === 'FST_REQ_FILE_TOO_LARGE') {
          return reply.code(413).send({ error: 'file_too_large', maxBytes: 8 * 1024 * 1024 });
        }
        request.log.warn({ err }, 'upload: buffer read failed');
        return reply.code(400).send({ error: 'read_failed' });
      }

      if (buf.length === 0) {
        return reply.code(400).send({ error: 'empty_file' });
      }

      // Magic-byte sniff. The multipart header `mimetype` is attacker-controlled
      // and never used for the allowlist decision.
      const sniff = await fileTypeFromBuffer(buf);
      if (!sniff || !ALLOWED_EXT.has(sniff.ext) || !ALLOWED_MIME.has(sniff.mime)) {
        request.log.info(
          { claimedMime: part.mimetype, detected: sniff?.mime ?? 'unknown' },
          'upload: rejected by magic-byte sniff',
        );
        return reply.code(415).send({
          error: 'unsupported_media_type',
          detail: 'Only image/jpeg, image/png, image/webp are accepted (magic-byte sniff).',
        });
      }

      // Persist. `nanoid` gives us a non-guessable filename; ext is the
      // sniffed extension (NOT whatever was in the upload filename).
      const ext = sniff.ext === 'jpg' ? 'jpeg' : sniff.ext;
      const filename = `${nanoid()}.${ext}`;
      const root = resolve(env.UPLOAD_DIR);
      try {
        await mkdir(root, { recursive: true });
      } catch (err) {
        request.log.error({ err }, 'upload: mkdir failed');
        return reply.code(500).send({ error: 'storage_unavailable' });
      }

      const target = join(root, filename);
      try {
        await writeFile(target, buf, { flag: 'wx' });
      } catch (err) {
        const e = err as NodeJS.ErrnoException;
        // polish-round-2 T2.4: disk-full fail-safe. On ENOSPC/EDQUOT, run an
        // emergency 1h purge (regardless of UPLOAD_TTL_HOURS) and retry the
        // write once before surfacing 503. 1h is short enough that the worst
        // case is one user's just-uploaded image getting wiped — preferable
        // to a wedged volume.
        if (e?.code && DISK_FULL_CODES.has(e.code)) {
          request.log.warn(
            { err, target, code: e.code },
            'upload: disk full — running emergency purge and retrying write',
          );
          try {
            const purged = await purgeStaleUploads(request.log, {
              maxAgeMs: EMERGENCY_PURGE_MAX_AGE_MS,
            });
            request.log.info(
              { purged, code: e.code },
              'upload: emergency purge complete; retrying write',
            );
          } catch (purgeErr) {
            request.log.warn({ err: purgeErr }, 'upload: emergency purge failed');
          }
          try {
            await writeFile(target, buf, { flag: 'wx' });
          } catch (retryErr) {
            request.log.error(
              { err: retryErr, target },
              'upload: write failed after emergency purge — returning 503',
            );
            try {
              await unlink(target);
            } catch {
              /* best-effort */
            }
            return reply.code(503).send({ error: 'storage_unavailable' });
          }
        } else {
          // wx (exclusive) → near-impossible collision on a nanoid; if it
          // happens, surface a clean 500 and we'll re-roll on retry.
          request.log.error({ err, target }, 'upload: write failed');
          try {
            await unlink(target);
          } catch {
            /* best-effort */
          }
          return reply.code(500).send({ error: 'storage_unavailable' });
        }
      }

      const ttlMs = env.UPLOAD_TTL_HOURS * 60 * 60 * 1000;
      const url = signUploadUrl(filename, ttlMs);
      const expiresAt = new Date(Date.now() + ttlMs).toISOString();

      request.log.info(
        { filename, bytes: buf.length, mime: sniff.mime },
        'upload: accepted',
      );
      return reply.code(200).send({ url, expiresAt });
    },
  );
}
