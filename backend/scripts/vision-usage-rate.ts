#!/usr/bin/env tsx
/**
 * Cycle 6 (cycle-6.md / PRODUCT Q3): vision kill-switch instrumentation.
 *
 * Reads `${env.DB_PATH}/../usage_log.jsonl` line-by-line and prints the share
 * of distinct sessions in the last 7 days that hit the vision pipeline at
 * least once. If the share drops below 5% at week 2, the vision feature is
 * a candidate for removal (PRODUCT.md cycle-6 open question Q3).
 *
 * Usage: `npx tsx scripts/vision-usage-rate.ts`
 *
 * Output format:
 *   vision rate: 12.4% (37/298)
 *   vision rate: 0.0% (0/0)              ← no qualifying rows in window
 *   vision rate: 0.0% (no log file)      ← log file doesn't exist yet
 *
 * Implementation notes:
 * - Streams the file (readline) rather than slurping it; usage_log.jsonl can
 *   grow indefinitely.
 * - "vision" record is one with `usageTag === 'vision'` (set by
 *   `tools/extractStyleFromImage.ts` via `groqClient.usageTag`).
 * - Session attribution: records carry a `sessionId` when present; rows
 *   without one are ignored for the rate calc. (Today only the agent loop
 *   writes records and we don't yet thread sessionId through; this script
 *   will pick that up once the producer side adds it. Until then, the
 *   denominator may be 0 → 0.0% by definition.)
 */

import { createReadStream, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { env } from '../src/config/env.js';

interface UsageRecord {
  ts?: string;
  sessionId?: string;
  tag?: string;
  usageTag?: string;
  mode?: string;
  model?: string;
}

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  const logPath = resolve(dirname(resolve(env.DB_PATH)), 'usage_log.jsonl');

  if (!existsSync(logPath)) {
    process.stdout.write('vision rate: 0.0% (no log file)\n');
    process.exit(0);
  }

  const cutoff = Date.now() - WINDOW_MS;
  const allSessions = new Set<string>();
  const visionSessions = new Set<string>();

  const rl = createInterface({
    input: createReadStream(logPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) continue;
    let rec: UsageRecord;
    try {
      rec = JSON.parse(line) as UsageRecord;
    } catch {
      continue;
    }
    if (!rec.ts) continue;
    const t = Date.parse(rec.ts);
    if (Number.isNaN(t) || t < cutoff) continue;
    const sid = rec.sessionId;
    if (!sid) continue;
    allSessions.add(sid);
    // Producer historically used either `usageTag` (cycle-6 brief) or `tag`
    // (cycle-4 producer in groqClient.ts). Accept either.
    const tag = rec.usageTag ?? rec.tag;
    if (tag === 'vision') visionSessions.add(sid);
  }

  const total = allSessions.size;
  const vision = visionSessions.size;
  if (total === 0) {
    process.stdout.write('vision rate: 0.0% (0/0)\n');
    process.exit(0);
  }
  const pct = ((vision / total) * 100).toFixed(1);
  process.stdout.write(`vision rate: ${pct}% (${vision}/${total})\n`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('vision-usage-rate failed:', err);
  process.exit(1);
});
