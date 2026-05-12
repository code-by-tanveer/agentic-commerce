import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../sqlite.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface MigrationLogger {
  info: (msg: string) => void;
}

const noopLog: MigrationLogger = { info: () => {} };

export function runMigrations(log: MigrationLogger = noopLog): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TEXT NOT NULL
    );
  `);

  const applied = new Set<string>(
    db
      .prepare('SELECT name FROM _migrations')
      .all()
      .map((r) => (r as { name: string }).name),
  );

  // Resolve migrations from the same directory this file lives in. Works both
  // when running under tsx (src/) and after build (dist/) provided the .sql
  // files are present at the same relative path.
  const dir = resolve(__dirname);
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.sql'));
  } catch {
    files = [];
  }

  // Fallback: also look at the source `src/db/migrations` if we're running
  // compiled JS that didn't ship the .sql alongside it.
  if (files.length === 0) {
    const srcDir = resolve(process.cwd(), 'src/db/migrations');
    try {
      files = readdirSync(srcDir)
        .filter((f) => f.endsWith('.sql'))
        .map((f) => f);
      if (files.length > 0) {
        return applyAll(files, srcDir, applied, log);
      }
    } catch {
      // ignore
    }
  }

  applyAll(files, dir, applied, log);
}

function applyAll(
  files: string[],
  dir: string,
  applied: Set<string>,
  log: MigrationLogger,
): void {
  files.sort();
  for (const name of files) {
    if (applied.has(name)) continue;
    const sql = readFileSync(resolve(dir, name), 'utf8');
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare(
        'INSERT INTO _migrations(name, applied_at) VALUES (?, ?)',
      ).run(name, new Date().toISOString());
    });
    tx();
    log.info(`applied migration: ${name}`);
  }
}
