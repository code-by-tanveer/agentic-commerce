# 0004 — Session store: SQLite via better-sqlite3

## Status
Accepted — 2026-05-12. Owner: architect. Supersedes: none.

## Context

The application has persistent state per anonymous session: preferences (the "About you" card), shortlists (Love/Maybe/Skip lanes), saved outfits, message history, and the eventual lookbook summary for the share page. The state survives reloads, but is keyed only by a cookie — there are no user accounts.

Volume estimates for Stage 1 (the only stage we are building for now):

- ~50–500 sessions/day during the build-out and early demos.
- Per session: ~10–50 KB of preferences + messages + shortlists JSON.
- Read pattern: hot for the duration of an active conversation (every tool call reads preferences), cold thereafter.
- Write pattern: bursty during a conversation (a few writes per turn), then quiescent.
- Concurrency: a handful of concurrent active sessions, all on the same Fly machine.

Options considered:

**Postgres (Neon / Supabase).** Right answer at scale. Wrong answer now: operational overhead for an early build (connection pooling, migrations infra, separate billing). Also forces a network hop for every preference read on the hot path, which is exactly the latency we are trying to minimize for the agent loop.

**Redis (Upstash).** Fast, but JSON-shaped state querying ("give me all preferences for session X") is not Redis's strength. Also volatile by default; we want durable persistence for shortlists and lookbooks.

**LibSQL / Turso embedded.** Genuinely viable. Same `better-sqlite3`-shaped API; adds replication when we want it. But: not needed at Stage 1, and choosing it now forces a Turso account before we have a deploy. The Stage 2 migration to libSQL is a 1-file change (see scaling story).

**SQLite via `better-sqlite3`.** Synchronous in-process driver. No connection pool, no network hop, no separate service. The whole "DB" is a file. Boot time is essentially zero. Atomic writes via WAL mode. The agent loop's preference reads are microseconds instead of milliseconds. The Fly volume mount gives us durability across restarts. For our Stage 1 volume, it is unambiguously the right tool.

The trade-off is well-known: SQLite makes horizontal scaling of *writes* harder. We address that by:

1. Not horizontally scaling writes at Stage 1 (single Fly machine + sticky sessions later).
2. Designing the repository pattern such that the storage backend can change in one file.

## Decision

Use **`better-sqlite3`** with a single database file at `data/agentic.db` (path from `DB_PATH`). WAL mode for read/write concurrency. Schema in `backend/src/db/migrations/`. Repos in `backend/src/db/repos/`.

**Configuration.**
- `journal_mode = WAL`
- `synchronous = NORMAL` (durability via WAL + checkpoint, not per-write fsync)
- `foreign_keys = ON`
- `busy_timeout = 5000` (5s; protects against the rare SQLITE_BUSY during a checkpoint)

**Migration pattern.** Numbered SQL files, applied in order on boot. No reversible-migration framework — that's overkill at this scale and we have a clear "drop and rebuild" escape valve until the first real users. [ASSUMPTION — when the first real users arrive, switch to `umzug` or write a 50-line versioned migrator.]

**Repository pattern.** Each table has a repo file that exports typed CRUD functions. No ORM. The repos are the *only* code that imports `db/sqlite.ts`. The rest of the application imports repos. This is the migration seam — swap `db/sqlite.ts` for `db/libsql.ts` later, regenerate the repos to async, change nothing else.

**Deployment.** On Fly.io, mount a 1 GB volume at `/data`. `DB_PATH=/data/agentic.db`. Fly snapshots the volume nightly; that's our backup. [ASSUMPTION — Fly is the deploy target per ARCHITECTURE.md §10. If we move to Railway, equivalent volume.]

**Path to Postgres.** When the trigger fires (SQLite file > 200 MB, or write contention, or we decide to add accounts), the migration is:

1. `db/sqlite.ts` becomes `db/postgres.ts` (using `postgres.js`).
2. Repos go from sync to async — every call site needs an `await`. This is the painful part of the migration; we can soften it now by making repos return `Promise<T>` from day one, even though SQLite is synchronous. **Decision:** yes, repos return `Promise<T>` from day one. The wrapping is a microsecond cost.
3. Migration SQL files are dialect-mostly-portable; the schema in `0001_init.sql` uses TEXT/INTEGER which Postgres understands. The differences (`AUTOINCREMENT`, `nanoid()` as default) are minor and called out in the file.

That's the whole upgrade path. No application logic changes.

## Consequences

### Positive
- Zero operational surface area at Stage 1. The DB is a file on a volume. No separate service to monitor, no connection pool to tune.
- Preference reads in the agent loop are microseconds — well below any latency budget. The "About you" enrichment is effectively free.
- Atomic transactions across multiple tables (e.g. "save outfit + persist shortlist update") work the way the application expects, via `db.transaction(() => { ... })`.
- Local dev is identical to production — no Docker compose for a DB.
- Backups are file copies. Snapshots are a Fly feature, not something we operate.
- Cost is the cost of a 1 GB volume on Fly: pennies.

### Negative
- **No horizontal scaling of writes.** This is the headline cost. We mitigate by deciding at Stage 1 that we will not horizontally scale writes; one Fly machine handles writes. Stage 2's move to libSQL or Postgres removes the constraint when the constraint actually binds.
- **No real-time replication out of the box.** If the Fly machine fails, the in-flight write may be lost (WAL checkpoint cadence permitting). The volume itself is durable, so the loss window is ≤30 seconds and limited to in-flight conversations. *Mitigation:* nightly Fly snapshots. We accept the small loss window at Stage 1.
- **WAL files grow without checkpoints.** WAL mode keeps writes in a sidecar file until a checkpoint merges them. If checkpoints never run, the WAL file grows and read performance degrades. *Mitigation:* `better-sqlite3` runs checkpoints automatically on commit; in practice this is a non-issue for our workload. We add a daily `PRAGMA wal_checkpoint(TRUNCATE)` cron in Cycle 6 as defence in depth.
- **Synchronous driver blocks the Node event loop.** A pathological query could stall the entire Fastify process — including in-flight SSE streams. *Mitigation:* all queries are point lookups on indexed columns; we do not run aggregates or scans on the hot path. The slowest realistic query is "all messages for a session" which is <1 ms for any session that fits in memory anyway. Add a fast-path test in Cycle 6 that asserts no query exceeds 5 ms p99.
- **Migration to Postgres is a code change, not a config change.** Sync→async is the friction. *Mitigation:* the repo layer returns `Promise<T>` from day one, even though SQLite resolves synchronously. The await cost is microseconds; the day-of-migration friction is removed.
- **No SQL skill matrix advantage.** Engineers reach for an ORM by default; we are forcing them to write SQL directly. *Mitigation:* keep the SQL surface tiny — point lookups, simple inserts, one `JOIN` at most. If we ever want a heavier query layer, add `Kysely` over the same connection without changing the repos' external API.

## Mitigations summary

1. WAL mode + `busy_timeout=5000` + auto-checkpoints handle the realistic concurrency.
2. Repos return `Promise<T>` from day one so the Postgres migration is a backend swap, not a refactor.
3. Daily snapshot via Fly volume snapshots; documented in Cycle 6 hardening checklist.
4. Stage 2 trigger (file >200 MB or contention observed): swap to libSQL; same API, same SQL, gains replication.
5. Stage 3 trigger (write contention even after libSQL, or accounts arrive): swap to Postgres; the repo layer is the only seam that changes.
