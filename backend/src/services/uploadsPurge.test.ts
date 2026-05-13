import { mkdir, rm, writeFile, utimes } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import { purgeStaleUploads } from './uploadsPurge.js';

// polish-round-3: filesystem-level coverage for the upload purge cron.
// We override env.UPLOAD_DIR (it's a plain property on the parsed Zod object,
// not a getter) for the duration of the test, lay two files into a real tmp
// dir, backdate one with utimes, and assert the deletion + return value.

const HOUR_MS = 60 * 60 * 1000;
const ORIGINAL_UPLOAD_DIR = env.UPLOAD_DIR;

async function makeFile(dir: string, name: string, ageMs: number): Promise<string> {
  const full = join(dir, name);
  await writeFile(full, 'x', 'utf8');
  const ts = new Date(Date.now() - ageMs);
  await utimes(full, ts, ts);
  return full;
}

async function exists(p: string): Promise<boolean> {
  try {
    await import('node:fs/promises').then((m) => m.stat(p));
    return true;
  } catch {
    return false;
  }
}

describe('purgeStaleUploads', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await import('node:fs/promises').then((m) =>
      m.mkdtemp(resolve(tmpdir(), 'agentic-purge-')),
    );
    (env as { UPLOAD_DIR: string }).UPLOAD_DIR = dir;
  });

  afterEach(async () => {
    (env as { UPLOAD_DIR: string }).UPLOAD_DIR = ORIGINAL_UPLOAD_DIR;
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  });

  it('deletes files older than the default TTL (24h) and leaves recent ones', async () => {
    // Default `UPLOAD_TTL_HOURS=24` per config/env.ts. 25h vs 1h straddles
    // the cutoff cleanly.
    const stale = await makeFile(dir, 'stale.png', 25 * HOUR_MS);
    const fresh = await makeFile(dir, 'fresh.png', 1 * HOUR_MS);

    const purged = await purgeStaleUploads();

    expect(purged).toBe(1);
    expect(await exists(stale)).toBe(false);
    expect(await exists(fresh)).toBe(true);
  });

  it('deletes both files when opts.maxAgeMs forces a 30-minute cutoff', async () => {
    const a = await makeFile(dir, 'a.png', 25 * HOUR_MS);
    const b = await makeFile(dir, 'b.png', 1 * HOUR_MS);

    const purged = await purgeStaleUploads(undefined, {
      maxAgeMs: 30 * 60 * 1000,
    });

    expect(purged).toBe(2);
    expect(await exists(a)).toBe(false);
    expect(await exists(b)).toBe(false);
  });

  it("returns 0 (no throw) when the upload directory doesn't exist", async () => {
    const ghost = resolve(tmpdir(), 'agentic-purge-does-not-exist-' + Date.now());
    (env as { UPLOAD_DIR: string }).UPLOAD_DIR = ghost;
    // Belt-and-braces: ensure the path is gone.
    await rm(ghost, { recursive: true, force: true }).catch(() => undefined);

    await expect(purgeStaleUploads()).resolves.toBe(0);
  });

  it('ignores subdirectories (only deletes files)', async () => {
    // The purge walks readdir + stat; subdirectories must be skipped via
    // the `if (!st.isFile()) continue` guard. Verify by creating a stale
    // subdir alongside a stale file — only the file should disappear.
    const staleFile = await makeFile(dir, 'stale.png', 25 * HOUR_MS);
    const subdir = join(dir, 'old-subdir');
    await mkdir(subdir);
    const ts = new Date(Date.now() - 25 * HOUR_MS);
    await utimes(subdir, ts, ts);

    const purged = await purgeStaleUploads();
    expect(purged).toBe(1);
    expect(await exists(staleFile)).toBe(false);
    expect(await exists(subdir)).toBe(true);
  });
});
