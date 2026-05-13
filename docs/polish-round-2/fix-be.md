# Polish round 2 — backend delivery log

Resumed from the round-1 cutoff. The migration `0002_message_status.sql` and the
`messages` repo accepting `status` were already in place; the rest of Tier-2 was
unshipped.

## What landed

### T2.1 — BE-side assistant persistence (ADR-0002)

`agent.ts` wraps `emit` so every SSE event also appends to an
`assistantBlocks: AssistantBlock[]` ledger (text deltas coalesced, tool-status
frames replaced on running→done, products/comparison/moodboard/outfit recorded
as-is). Every exit path calls `appendMessage(sessionId, { role:'assistant',
blocks, status })` — `done` → `done`, abort → `truncated`, caught error →
`error`. The FE's `appendMessage` round-trip in `useConversation` is left
alone (defence-in-depth — see inline comment).

### T2.2 — SIGTERM/SIGINT drain

`backend/src/index.ts` registers handlers that log `shutdown begin`,
`Promise.race` between `app.close()` and a 25 s timeout, then `exit 0` on
clean drain / `exit 1` on timeout. The existing `onClose` hook gets a
final `PRAGMA wal_checkpoint(TRUNCATE)` and `db.close()` so the WAL is
folded back into the main DB before the process leaves. Smoke-tested
locally: SIGTERM produces `shutdown begin → wal checkpoint ok → db closed
→ shutdown complete` within a few ms (no in-flight SSE).

### T2.3 — `/health` doc reconciliation

Code stays `{ ok: true }`. `docs/ARCHITECTURE.md` §3 backend-routes entry
and `docs/DEPLOY.md` §2 healthcheck now state liveness-only and flag the
richer `/ready` (Groq + MCP, 1 s timeouts, 10 s cache) as a Stage-2 add.

### T2.4 — `UPLOAD_DIR` disk-full fail-safe

`services/uploadsPurge.ts` now accepts `opts.maxAgeMs` (default unchanged).
`routes/upload.ts` catches `ENOSPC`/`EDQUOT` from `writeFile`, runs an
emergency 1 h purge, retries once; second failure returns **503**
`storage_unavailable` (was 500). `index.ts` runs a `statfs(UPLOAD_DIR)`
free-space check at boot and on the existing hourly purge cron — warns at
`< 20 %` free with `freeBytes`/`totalBytes`/`freePct`/`path` fields.

### T2.5 — 90-day session TTL cron

Daily `setInterval` in `index.ts` runs
`DELETE FROM sessions WHERE updated_at < datetime('now', '-90 days')` and
logs `{ deleted, ttlDays }`. `unref()`d like the existing cadences.
Confirmed `0001_init.sql` already has `ON DELETE CASCADE` on the four
child FKs so the delete collapses preferences/messages/shortlists/
saved_outfits in one go. Documented in `ARCHITECTURE.md` §9.

### T2.6 — SSE backpressure

`sseWriter.ts::write/ping` are now `async`; on `reply.raw.write() === false`
they `await once(reply.raw, 'drain')`. `agent.ts` awaits every `emit(...)`
so backpressure propagates upstream into the Groq stream. `ctx.emit`
(no current callers) keeps its `void` signature via a small wrapper.

### T2.12 — Symmetric Groq `usageTag`

`agent.ts::streamChatCompletion` call now passes `usageTag: 'text'`;
`extractStyleFromImage.ts` already passed `'vision'`. Every Groq call is
tagged in `usage_log.jsonl`.

### T2.13 — CGNAT-aware rate-limit key

`index.ts::rateLimit.keyGenerator` is now
`req.cookies?.agentic_sid ?? req.ip` so shared-NAT users land in
per-session buckets. IP is the fallback for the very first request.

### T2.14 — Tool latency + Groq duration log lines

`toolRegistry.ts::dispatch` brackets every dispatch with
`performance.now()` and emits one `tool dispatch` log
(`{ tool, durationMs, ok, sessionId }`). `groqClient.ts::streamChatCompletion`
+ `chatCompletion` emit one `groq chat ok` log
(`{ model, durationMs, promptTokens, completionTokens, usageTag }`).
The agent and the vision tool both pass `log` through; absence is a no-op.

### T2.15 — Daily-quota narrative

`ARCHITECTURE.md` §7 Failure-modes row for "Groq 429" rewritten with the
honest version (fallback rescues per-minute bursts only; daily exhaust
surfaces `rate_limited` until midnight UTC; banner SSE arm flagged as
Stage-2).

### T2.16 — Idempotent `POST /api/session/:id/outfits`

`db/repos/outfits.ts::saveOutfit` accepts `opts.id`; if `(sessionId, id)`
already exists, returns the existing row id without re-inserting and
without counting toward the row cap. `routes/session.ts` adds an optional
nanoid-shaped `id` to the body schema; response shape is unchanged
(`{ id }`). Smoke-tested locally: two POSTs with the same id → same id
returned, list shows one row.

### T2.17 — `trustProxy: 1`

`Fastify({ trustProxy: 1, ... })` — trusts only the immediate hop.

### T2.18 — Fly backups subsection

`DEPLOY.md` "Backups & disaster recovery" subsection added: automatic
5-day snapshot is the floor; manual snapshot before risky migration;
restore via `fly volumes create --snapshot-id ...`; litestream → S3 as
the Stage-2 escape hatch.

## Verification

- `npm --workspace backend run build` clean.
- `npm --workspace frontend run build` clean (FE not edited, sanity-checked).
- Boot smoke: `/health` returns `{ok:true}`; idempotent outfit POST round-tripped
  (same `id` body → same row); SIGTERM produces the four expected log lines.

## Out of scope (left for next round / FE engineer)

T2.7–T2.11 are UX / FE surface (tablet shortlist breakpoint, sticky
magic-number, skeletons, ethics taxonomy, country-of-origin) — owned by
the parallel FE worker.
