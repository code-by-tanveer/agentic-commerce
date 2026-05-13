# Polish Round 3 — Architect-Code cleanup

Scope: deferred MEDIUMs/LOWs from `docs/polish-round-1/architect-code.md` plus
small correctness wins. Every edit carries an `R3-cleanup:` comment.

## Changes

### Dead code
- `frontend/lib/api.ts` — removed `getProduct(id)`; no backend route, no FE caller.
- `backend/src/stream/sseWriter.ts` — removed unused public `ping()`; auto-interval covers heartbeats.
- `backend/src/types/product.ts` — `SearchResponse` already gone post-Round 2 (file is now a thin re-export).
- `packages/events/src/index.ts` — `reasoningChipEventSchema` arm kept (FE switch, test fixtures depend on it) but tagged `[DEFERRED]`.

### Magic numbers → config
- `backend/src/config/env.ts` gained:
  - `UPLOAD_MAX_BYTES` (default `8 * 1024 * 1024`) — wired into `index.ts` multipart limit and `routes/upload.ts` 413 responses.
  - `AGENT_MAX_TURNS` (default 4) — wired into `services/agent.ts::MAX_TURNS`.
  - `REASONING_MAX_CHIPS` (default 4) — wired into `services/reasoning.ts::MAX_CHIPS`.
  - `RATE_LIMITS` matrix (`chat`/`upload`/`session`/`summary`/`preferences`) — every route now imports its entry instead of inline `{ max, timeWindow }` literals.

### Correctness
- `backend/src/services/normalize.ts::normalizeProduct` — currency resolution now reads `price_range.currency` explicitly when present, before falling back to `'USD'`. Prior code passed the `{min,max,currency}` wrapper into `parseMoney`, which only inspects `{amount,currency}` and silently fell through to USD for non-USD merchants.
- `backend/src/services/agent.ts` abort branch — dropped the `emit({...message:'aborted'...})` no-op (writer is closed by `chat.ts::onClose` before this fires). `persistAssistant('truncated')` + bare `return` remain.

### Lying comments
- `frontend/types/product.ts` — two stale `frontend/lib/events.ts::*Schema` references rewritten to point at the canonical `@agentic/events` schemas.

### LOW polish
- `frontend/lib/stream.ts` — unknown-event `console.warn` now prefixed `[agentic.stream.unknown_event]` for greppability.
- `backend/src/services/mcpClient.ts::callTool` — accepts optional `log?: FastifyBaseLogger`; emits `log.debug({tool, retryAttempt, status, durationMs}, 'mcp retry')` on each retry (both HTTP-5xx/429 branch and transport-error branch). Threaded through `services/catalog.ts` and into the four tool callers (`searchCatalog`, `getProductDetails`, `compareProducts`, `recommendOutfit`).
- `backend/src/services/groqClient.ts::recordUsage` — extended `// best-effort` to a full sentence: "usage telemetry must not break the request path".
- `backend/src/services/cache.ts::stableKey` — added `NOTE:` warning that the output is canonical JSON, not cryptographically secure.

## Verification
- `npm --workspace backend run build` — clean.
- `npm --workspace frontend exec -- tsc --noEmit` — clean.
- `npm --workspace backend run test` — 67/67 passing (51 baseline + Round 2 additions; no regressions, the file count grew because Round 2 landed `summary.test.ts`, `uploadsPurge.test.ts`, `session.test.ts`).
- Boot smoke (PORT=4099): `/health` → `{ok:true}`; prefs PUT/GET/DELETE round-trip clean; migrations + graceful SIGTERM shutdown all logged green.

## Not done
- The `recommendOutfit.ts` sub-search cache-bypass comment (architect-code LOW): the cache-key shape for outfit sub-searches is different from `search_catalog`, so bypass is intentional, but the comment was already added in a prior round — verified present.
- HIGH items (T1.*) were already addressed in Rounds 1+2; this round only touched the deferred MEDIUMs/LOWs.
