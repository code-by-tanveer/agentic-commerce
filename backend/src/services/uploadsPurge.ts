import { readdir, stat, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { env } from '../config/env.js';

export interface PurgeOpts {
  /**
   * Override the default TTL cutoff. polish-round-2 T2.4 uses this on the
   * disk-full path to do an emergency 1h purge regardless of the configured
   * `UPLOAD_TTL_HOURS`. Default = `env.UPLOAD_TTL_HOURS * 3600 * 1000`.
   */
  maxAgeMs?: number;
}

/**
 * Sweep `UPLOAD_DIR` and delete anything older than the configured TTL (or
 * `opts.maxAgeMs` when supplied). Safe to call repeatedly; safe when the
 * directory is missing or empty.
 *
 * Wired in `index.ts` as a boot-time sweep plus a 1h `setInterval`.
 * Also invoked synchronously from `routes/upload.ts` on `ENOSPC`/`EDQUOT` with
 * a 1-hour override before retrying the write once.
 *
 * Returns the number of files actually deleted.
 */
export async function purgeStaleUploads(
  log?: FastifyBaseLogger,
  opts: PurgeOpts = {},
): Promise<number> {
  const root = resolve(env.UPLOAD_DIR);
  const maxAgeMs = opts.maxAgeMs ?? env.UPLOAD_TTL_HOURS * 60 * 60 * 1000;
  const cutoffMs = Date.now() - maxAgeMs;

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
    log?.info(
      { purged, maxAgeMs },
      'purgeStaleUploads: deleted stale uploads',
    );
  } else {
    log?.debug({ maxAgeMs }, 'purgeStaleUploads: nothing to purge');
  }
  return purged;
}
