import { readdir, stat, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { env } from '../config/env.js';

/**
 * Sweep `UPLOAD_DIR` and delete anything older than `UPLOAD_TTL_HOURS`.
 * Safe to call repeatedly; safe when the directory is missing or empty.
 *
 * Wired in `index.ts` as a boot-time sweep plus a 1h `setInterval`.
 *
 * Returns the number of files actually deleted.
 */
export async function purgeStaleUploads(log?: FastifyBaseLogger): Promise<number> {
  const root = resolve(env.UPLOAD_DIR);
  const cutoffMs = Date.now() - env.UPLOAD_TTL_HOURS * 60 * 60 * 1000;

  let entries: string[];
  try {
    entries = await readdir(root);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return 0;
    log?.warn({ err }, 'purgeStaleUploads: readdir failed');
    return 0;
  }

  let purged = 0;
  for (const name of entries) {
    const full = join(root, name);
    try {
      const st = await stat(full);
      if (!st.isFile()) continue;
      if (st.mtimeMs < cutoffMs) {
        await unlink(full);
        purged++;
      }
    } catch (err) {
      // Race with another purge or a manual delete — skip.
      log?.debug({ err, file: name }, 'purgeStaleUploads: skip failed entry');
    }
  }

  if (purged > 0) {
    log?.info({ purged, ttlHours: env.UPLOAD_TTL_HOURS }, 'purgeStaleUploads: deleted stale uploads');
  } else {
    log?.debug({ ttlHours: env.UPLOAD_TTL_HOURS }, 'purgeStaleUploads: nothing to purge');
  }
  return purged;
}
