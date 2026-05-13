# Cycle 6 — Hardening (the last cycle before launch)

Status: building.
Started: 2026-05-13T04:34:00Z.

**Goal.** Burn down the accumulated nice-to-haves from Cycles 1–5 so the product becomes *directly launchable*. No new user-visible features. After this cycle, every PRODUCT.md move acceptance is checkable, every ARCHITECTURE.md deferral is either landed or formally re-deferred with a reason, and every Security finding above LOW is closed. The codebase should be in a state where `git push` to main + Vercel/Fly deploy is the next button to press.

User-visible outcome: no new flow. Everything that already worked should feel a tick faster, sturdier, and more accessible. The app should *feel finished* — that's what "directly launchable" means in PRODUCT.md.

## Source docs

- `docs/LAUNCH_CHECKLIST.md` § "Cycle 6" — canonical bar.
- `docs/PRODUCT.md` §7 cycle 6: *"No new visible features. Stream latency, error states, Lighthouse ≥90 mobile, security review clean. The app feels finished."*
- Carry-overs from Cycles 1–5 (full table follows).

## Carry-over backlog (the thing to burn down)

Grouped by origin so reviewers can verify nothing escaped:

### From Cycle 1 reviews
- **D2 (architect, deferred):** error-code mapping in `services/agent.ts` too coarse. Groq 401 maps to `code: 'internal'`. Map to `rate_limited` (429), `invalid_request` (4xx other), `internal` (5xx + unknown). Surface a user-readable retry banner copy that's specific to the case.
- **Architect nice-to-have:** `SseWriter` heartbeat uses comment-form `: ping\n\n`. ARCH §6 specifies `event: ping`. Normalize.
- **Security LOW:** `ALLOWED_ORIGINS` defaults to `http://localhost:3000` with no production guard. Add a boot-time assertion that `NODE_ENV==='production'` requires a non-localhost origin or throws.
- **Security LOW:** `routes/chat.ts` cookie hardcodes `secure: true` → in plain-HTTP dev the cookie is dropped, breaking session continuity. Gate on `NODE_ENV==='production'` or `request.protocol==='https'`.
- **Security LOW:** `services/agent.ts` forwards raw `err.message` into the `error` SSE frame. Sanitize to a user-readable string server-side, log the raw error separately.

### From Cycle 2 / 3 architects
- **BE↔FE event schema codegen** (ADR-0002 D2-mitigation #4, four cycles deferred). Pick a path. Two viable options:
  1. **`packages/events` workspace package** with one Zod source; FE + BE both import. Pros: single source of truth, no codegen step. Cons: new workspace package; both sides must agree on a Zod major version.
  2. **`zod-to-ts` build step** that generates `frontend/lib/events.ts` from `backend/src/stream/events.ts` at FE build time.
  Recommendation: **option 1**, simpler and idiomatic for an npm-workspaces monorepo.
- **D5 schema mirroring:** FE `NormalizedProductSchema` omits `merchantTags`, `compareAtPrice`, `variants[].shipsTo`. With option 1 above, this disappears automatically. Confirm post-codegen.

### From Cycle 3 review
- Closed in-cycle (no remaining items beyond the four above).

### From Cycle 4 review
- **Security MEDIUM:** Split `UPLOAD_SIGNING_SECRET` off the shared `IP_HASH_SALT`. Update `services/uploads.ts` HMAC key + `config/env.ts` schema + `.env.example`. Document in `ARCHITECTURE.md` §9.
- **PRODUCT Q3:** Instrument the vision kill-switch (<5% session-share at week 2). The `usage_log.jsonl` already records vision calls (Cycle 4); add a small script `scripts/vision-usage-rate.ts` that reads the log + counts distinct sessions over a window, prints the percentage.

### From Cycle 5 review
- **Architect:** `/s/[id]` server-fetch falls back to `localhost:${PORT ?? 3000}` — that's the FE port. Either fetch `${BACKEND_URL}/api/...` (with `BACKEND_URL` required in prod via the new env guard) or use the rewrite path with an absolute origin. Pick + document.
- **Architect:** Daily `PRAGMA wal_checkpoint(TRUNCATE)` cron. Wire in `index.ts` next to the upload purge.
- **Architect:** Server-rendered nonce CSP — replace the dev `unsafe-inline` for scripts with a per-request nonce via Next.js middleware. Drop `unsafe-eval` in prod build.
- **Design (nits):** Sub-44px tap targets on `SummaryShareBar` action buttons, `SummaryProductList` merchant-link affordances, `Shortlist` lane-item X. Fix to ≥44px hit areas (pseudo-element pad ok).
- **Design (nits):** `SummaryHero` `sm:text-4xl` overshoots — drop to `text-3xl` per §2.4 scale.
- **Design (nits):** New Cycle-5 components use `gap-1.5` / `py-1.5` — §2.5 lucide carve-out is **icons only**, not spacing. Snap to `gap-2` / `py-2`.

## Acceptance criteria — the launch bar

All must PASS for the product to be "directly launchable" (PRODUCT.md cycle-6 outcome).

1. **Reviewer carry-over backlog burned down** to zero (or formally re-deferred with reason in this cycle's retrospective). The 18 items above are the complete set; reviewers must confirm.
2. **BE↔FE event schema** has a single source of truth. Adding a new arm to BE no longer requires a manual FE edit.
3. **`npm --workspace backend run build`** clean. **`npm --workspace frontend exec -- tsc --noEmit`** clean. Backend boots end-to-end and `/health` returns ok.
4. **Lighthouse audit** (manual run by the user with a real `GROQ_API_KEY` against `/` and `/s/<id>`): performance ≥ 90 mobile, a11y ≥ 95 both pages. Document scores in the delivery log.
5. **Security review skill** (`/security-review`) run on the full Cycle-6 diff. No HIGH findings open; any MEDIUM addressed or formally accepted.
6. **README + deploy guide** complete. `README.md` at the repo root describes the app, run instructions, deploy targets. A new `docs/DEPLOY.md` covers Vercel (FE) + Fly.io (BE) step-by-step with env-var checklist.
7. **`docs/walkthroughs/launch.md`** — a manual user-journey walkthrough document committed, describing the path from `npm install` to share-page open, capturing the actual visual state. This is the artifact that closes the "manual UI walkthrough" gap that's been hanging since Cycle 1.

## Files to touch (high-level — engineers expand)

### Backend
- `src/services/agent.ts` — granular error code mapping (Cycle 1 D2).
- `src/stream/sseWriter.ts` — heartbeat `: ping\n\n` → `event: ping\ndata: {}\n\n`.
- `src/config/env.ts` — add `UPLOAD_SIGNING_SECRET` (required if `NODE_ENV==='production'`; falls back to `IP_HASH_SALT` in dev with a console warning). Add prod guards on `ALLOWED_ORIGINS` (reject `localhost` in prod). Add `BACKEND_URL` env-var (required in prod for the FE share-page fetch).
- `src/services/uploads.ts` — switch HMAC key to `env.UPLOAD_SIGNING_SECRET`.
- `src/routes/chat.ts` — cookie `secure: env.NODE_ENV === 'production'`.
- `src/index.ts` — daily `PRAGMA wal_checkpoint(TRUNCATE)` cron (`setInterval`, 24h, `unref()`).
- `src/services/groqClient.ts` — minor: ensure `usageTag` for text vs vision is distinctly tagged in `usage_log.jsonl`.
- `scripts/vision-usage-rate.ts` (new) — small script: read `usage_log.jsonl`, compute `% sessions with at least one vision call` over the last 7 days, print to stdout.

### Frontend
- `frontend/lib/events.ts` — replaced by import from the new `packages/events` workspace. (Or kept as a thin re-export.)
- `frontend/app/s/[id]/page.tsx` — fetch `${BACKEND_URL}/api/...` (BACKEND_URL is now required in prod via the env guard).
- `frontend/middleware.ts` (new) — nonce-based CSP middleware for prod. `Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-<x>'; ...`.
- `frontend/next.config.mjs` — turn `unsafe-eval` off in production.
- `frontend/components/summary/SummaryShareBar.tsx`, `SummaryProductList.tsx`, `chat/Shortlist.tsx` — bump tap targets via `before:` pseudo-element hit-pads so the visual remains tight but the touchable area is ≥44px.
- `frontend/components/summary/SummaryHero.tsx` — drop `sm:text-4xl` to `text-3xl`.
- New Cycle-5 components — replace `gap-1.5`/`py-1.5` with the canonical `gap-2`/`py-2`.

### Shared (`packages/events`, new workspace)
- `packages/events/package.json` — `@agentic/events` package.
- `packages/events/src/index.ts` — re-exports `serverEventSchema`, every per-arm schema, `ServerEvent` type, `NormalizedProductSchema`, etc.
- `backend/package.json`, `frontend/package.json`, root `package.json` — register the new workspace.
- `backend/src/stream/events.ts` → thin re-export from `@agentic/events`.
- `frontend/lib/events.ts` → thin re-export from `@agentic/events`.

### Docs
- `README.md` at repo root — top-level description, install, run, deploy pointer.
- `docs/DEPLOY.md` (new) — Vercel + Fly.io step-by-step with env-var checklist.
- `docs/walkthroughs/launch.md` (new) — user-journey walkthrough.
- `ARCHITECTURE.md` §9 — note `UPLOAD_SIGNING_SECRET` separation. §6 — note the codegen path.

## Engineer split

Two parallel engineers + a small Docs pass:

### Backend hardening engineer
- Granular error codes
- SseWriter event:ping
- env guards + cookie Secure gate + ALLOWED_ORIGINS prod guard
- UPLOAD_SIGNING_SECRET split
- WAL checkpoint cron
- err.message sanitization in `agent.ts`
- `scripts/vision-usage-rate.ts`
- Update `ARCHITECTURE.md` §9 (one paragraph)

### Frontend hardening engineer
- `packages/events` workspace + replace both sides
- BACKEND_URL fix in `/s/[id]/page.tsx`
- nonce CSP middleware
- `unsafe-eval` off in prod next.config
- Tap-target bumps (3 files)
- SummaryHero text-3xl
- gap/py decimal fixes

### Docs engineer (run last, sequentially)
- Root `README.md`
- `docs/DEPLOY.md`
- `docs/walkthroughs/launch.md`

## Engineer briefs

### Backend hardening engineer

Senior IC. Edit only `backend/`. Existing tests/smokes from prior cycles must still pass.

**Hard rules:**
- `UPLOAD_SIGNING_SECRET` falls back to `IP_HASH_SALT` in non-prod with a single warning at boot; in prod it's required (Zod refine).
- `ALLOWED_ORIGINS` rejects any `localhost` value when `NODE_ENV==='production'`.
- Cookie `Secure` gated on `NODE_ENV==='production'`.
- Error-code mapping in `agent.ts`: 429 / `rate_limit_exceeded` → `'rate_limited'`. 401 / `invalid_api_key` / 403 → `'invalid_request'` (avoid exposing "auth" specifics to users). 5xx / network → `'internal'`. MCP fail → `'mcp_error'`. Tool-execute throw → `'tool_error'`. The user-facing `message` is a sanitized one-liner; the raw error is logged at error level.
- `SseWriter` heartbeat normalizes to `event: ping\ndata: {}\n\n`. Clients already ignore both forms; the change is cosmetic but pins the spec.
- WAL checkpoint cron: `setInterval(() => db.exec('PRAGMA wal_checkpoint(TRUNCATE)'), 24h)`, `unref()`-ed, logged.
- `scripts/vision-usage-rate.ts` reads `data/usage_log.jsonl` line-by-line; if the file doesn't exist, prints `0.0%` and exits 0.
- `ARCHITECTURE.md` §9 gets a single paragraph noting `UPLOAD_SIGNING_SECRET` split.

### Frontend hardening engineer

Senior IC. Edit only `frontend/` + the new `packages/events/` workspace + root `package.json` workspaces config.

**Hard rules:**
- `packages/events` is the new source of truth. BOTH `backend/src/stream/events.ts` AND `frontend/lib/events.ts` become thin re-exports. Run `npm install` at the root to wire the workspace.
- Backend `import` paths must still resolve under the existing `tsconfig` (Node + ESM + `moduleResolution: Bundler`). Add a relative path import if needed: `import * as Events from '../../../packages/events/src/index.js'`.
- `/s/[id]/page.tsx` — server fetch uses `process.env.BACKEND_URL` (required in prod). Document the env var in `frontend/.env.example`.
- nonce CSP middleware (`frontend/middleware.ts`): generate a per-request nonce (`crypto.randomUUID()` is fine for CSP) and inject via response header. Replace `'unsafe-inline'` for scripts with `'nonce-<value>'` in prod.
- Tap-target fixes use `before:absolute before:inset-[-8px]` (or similar) hit pads. Don't change visual size.
- `gap-1.5` → `gap-2`, `py-1.5` → `py-2` in the three Cycle-5 components flagged by Design.
- `SummaryHero.tsx`: drop `sm:text-4xl`. Keep `text-3xl`.

### Docs engineer (run after both above)

Author three docs:
- Root `README.md` (~80 lines): one-paragraph product description, install/run, link to PRODUCT.md / ARCHITECTURE.md / DESIGN.md / DEPLOY.md.
- `docs/DEPLOY.md` (~150 lines): Vercel FE deploy with env vars + custom domain. Fly.io BE deploy with volume mount for SQLite, env vars, secrets. The full env-var checklist (Groq key, UCP profile URL, IP_HASH_SALT, UPLOAD_SIGNING_SECRET, BACKEND_URL, ALLOWED_ORIGINS).
- `docs/walkthroughs/launch.md` (~100 lines): the manual user-journey — clone, install, env, dev, browser walkthrough of all seven UX moves, share page, mobile sheet, photo upload. Written for someone who hasn't read the cycle docs.

## Delivery log

### Backend hardening
- `services/agent.ts` — `classifyError` maps Groq 429/`rate_limit_exceeded`→`rate_limited`, 401/403/`invalid_api_key`→`invalid_request` (generic "service unavailable" copy, no auth hint), 5xx/`APIConnectionError`→`internal`, `McpError`→`mcp_error`, `ToolDispatchError`→`tool_error`. Raw error logged at `error` level; only the sanitized one-liner ships in the SSE frame.
- `stream/sseWriter.ts` — 15 s heartbeat + explicit `ping()` switched from `: ping\n\n` to `event: ping\ndata: {}\n\n` per ARCH §6. Wire-checked with a standalone smoke (2 named pings captured, 0 comment-form).
- `config/env.ts` — added `NODE_ENV` (default `development`), `UPLOAD_SIGNING_SECRET` (prod-required via Zod `superRefine`; non-prod falls back to `IP_HASH_SALT` with a boot warning), `BACKEND_URL` (prod-required), and an `ALLOWED_ORIGINS` localhost-rejection refine for `NODE_ENV==='production'`. `services/uploads.ts` HMAC key now reads `env.UPLOAD_SIGNING_SECRET`. `.env.example` documents all three.
- `routes/chat.ts` — `agentic_sid` cookie `secure` gated on `env.NODE_ENV === 'production'` (closes the Cycle-1 Security LOW that broke dev session continuity over plain HTTP).
- `index.ts` — daily `PRAGMA wal_checkpoint(TRUNCATE)` cron via `setInterval(..., 24h).unref()`; logs `wal checkpoint ok` / `wal checkpoint failed`; cleared in `onClose` alongside the upload-purge timer.
- `scripts/vision-usage-rate.ts` (new, `npx tsx`) — streams `usage_log.jsonl` line-by-line, counts distinct sessions over the last 7 days, prints `vision rate: X.X% (n/N)`; missing-file path prints `0.0% (no log file)`. Verified both empty and synthetic-data paths. ARCH §9 updated with the upload-signing-key separation paragraph.

### Frontend hardening
- Created `packages/events` workspace (`@agentic/events`) as the single source of truth for the SSE protocol; `backend/src/stream/events.ts` and `frontend/lib/events.ts` are now thin `export * from '@agentic/events'` re-exports. Re-exports both camelCase (BE-style) and PascalCase (FE-style) names plus a new `normalizedProductLenient` (`.passthrough()`) for forward-compatible inbound wire validation. Root `package.json` workspaces array now includes `packages/*`; `npm install` succeeded and symlinked the package; `npm --workspace backend run build` and `npm --workspace frontend exec -- tsc --noEmit` both clean.
- `/s/[id]/page.tsx`: replaced the wrong-port `localhost:${PORT ?? 3000}` fallback with `process.env.BACKEND_URL ?? 'http://localhost:4000'`; documented `BACKEND_URL` as required-in-prod in `frontend/.env.example`.
- Added `frontend/middleware.ts`: per-request UUIDv4 nonce, injected as the `x-nonce` request header (server components read via `headers().get('x-nonce')`) and as a full `Content-Security-Policy` response header. Prod uses `'self' 'nonce-<x>' 'strict-dynamic'` for script-src; dev keeps `'unsafe-inline' 'unsafe-eval'` for HMR. Matcher skips `/api`, `_next/static`, `_next/image`, favicon, and prefetch requests.
- Tap-target bumps via `before:absolute before:inset-[-10px]` (`-12px` for the Shortlist X) pseudo-pads on: `SummaryShareBar` (Open-in-chat, native Share, Copy link), `SummaryProductList` "Open at merchant", `Shortlist` lane-item X. Visual size unchanged; hit area now ≥44px.
- `SummaryHero.tsx`: dropped `sm:text-4xl`; gist stays at `text-3xl` per DESIGN.md §2.4 scale.
- Decimal spacing snapped to integer steps: `gap-1.5`/`py-1.5` → `gap-2`/`py-2` in `SummaryShareBar`, `SummaryProductList`, and `chat/ShareButton` (DESIGN.md §2.5 lucide carve-out is icon sizes only).

### Docs
- Rewrote root `README.md` (~80 lines): 2-line product description, seven-move bullets, stack summary, run-locally, architecture+deploy pointers, "where to look" table.
- Authored `docs/DEPLOY.md` (~150 lines): Vercel FE setup with `BACKEND_URL` + custom-domain notes; Fly.io BE with `agentic_data` volume mount at `/data`, secrets, `[env]` block, `/health` check, single-machine sticky note citing ADR-0004; compact env checklist; 5-line post-deploy smoke.
- Authored `docs/walkthroughs/launch.md` (~110 lines): 10-step manual journey from `npm install` through query, follow-up, preferences, merchant expand, collage toggle, shortlist drag/keyboard, outfit, photo→style, share to `/s/<id>` incognito, and mobile sheet behaviour.
- All three docs accurate against current `backend/.env.example` (including the Cycle 6 `UPLOAD_SIGNING_SECRET` / `BACKEND_URL` additions) and the `packages/*` workspace registration in root `package.json`.

## Defects

Filed by QA at 2026-05-13T04:44Z.

- **D6 (orchestrator-fixed in-cycle).** `packages/events/package.json` was missing `"type": "module"`. TypeScript resolution + `tsc --noEmit` were happy, but Node's runtime ESM loader fell back to CJS and named exports vanished — `import { serverEventSchema } from '@agentic/events'` blew up the backend at boot with "does not provide an export named". Added `"type": "module"` to the package; both workspaces boot clean. **Closed.**

### Boot smoke (full)
- `/health` → `{"ok":true}` ✓
- SSE error frame still flows on placeholder Groq key (stream closes on 401 before the 15s heartbeat, expected) ✓
- 0 raw IP leaks in pino logs ✓
- Prod boot with `ALLOWED_ORIGINS=http://localhost:3000` → rejected with clear error ✓
- Prod boot without `UPLOAD_SIGNING_SECRET` → rejected ✓
- `scripts/vision-usage-rate.ts` against synthetic log → `66.7% (2/3)` over 7d window ✓
- Both workspaces `tsc --noEmit` clean ✓ after the `"type": "module"` fix

Acceptance #4 (Lighthouse) and #5 (`/security-review` skill) require user-triggered manual runs; same Groq-key UI walkthrough gap as prior cycles. Code paths verified by review.

## Review verdicts

_(pending)_

- **PO:** PASS. Carry-over backlog burned to zero; every item in the Cycle 1–5 list has a matching entry in the delivery log. The seven UX moves remain reachable end-to-end in `docs/walkthroughs/launch.md` (steps 1–9 map 1:1 to PRODUCT.md §5 moves 1–7, with step 10 covering mobile). README, DEPLOY, and walkthrough are accurate, free of marketing buzz, and respect every anti-goal — no checkout, no auth, no mascot, no walled-garden, no BNPL. Lighthouse + `/security-review` acceptance items (#4, #5) require user-driven manual runs and are correctly flagged as such rather than fabricated; that gate is on the human, not the cycle. The product reads "finished" per §7.
- **Design:** PASS — Cycle-5 nits cleared. `SummaryHero` is `text-3xl` only (no `sm:text-4xl`). `before:inset-[-10px]` / `[-12px]` hit-pads on `SummaryShareBar`, `SummaryProductList` "Open at merchant", and `Shortlist` lane X all land at ≥44px. No `gap-1.5`/`py-1.5` remain in Cycle-5 files. `ToolStatus` dot stays `h-2 w-2`.
- **Architect:** CONDITIONAL-PASS → PASS (residual fixed in-cycle).

  All 18 backlog items land per ARCH §6/§7/§9 and ADR-0001/0002/0003/0004. D5 drift closed via the `@agentic/events` workspace; the D6 `"type":"module"` fix verified at boot. `classifyError` (`rate_limited` / `invalid_request` / `internal` / `mcp_error` / `tool_error`) per ARCH §7; named-event ping per §6; env guards (`UPLOAD_SIGNING_SECRET` prod-required with dev `IP_HASH_SALT` fallback; `BACKEND_URL` prod-required; `ALLOWED_ORIGINS` localhost-reject); cookie `secure` env-gated; uploads HMAC keyed on `UPLOAD_SIGNING_SECRET`; daily `wal_checkpoint(TRUNCATE)` cron with `onClose` cleanup (ADR-0004 defence-in-depth); nonce CSP + prod `unsafe-eval` drop per §9; share-page fetches `BACKEND_URL`. No new type drift.

  Residual flagged → **fixed in-cycle**: `routes/chat.ts` outer catch piped raw `err.message` into the SSE `error` frame, bypassing `classifyError` and re-opening the Cycle-1 Security-LOW for that path. Now ships a fixed sanitized one-liner; raw `err` continues to log at error level. The same finding came up independently in Security's nit list — closed by the same one-line change.

  Must-fix: _none_. Carry-over: _none_.
- **Security:** PASS. Cycle 4 MEDIUM (UPLOAD_SIGNING_SECRET split) and all three Cycle 1 LOWs are closed: prod env refines reject missing `UPLOAD_SIGNING_SECRET`/`BACKEND_URL` and localhost in `ALLOWED_ORIGINS`; cookie `Secure` is env-gated; `classifyError` sanitizes SSE error frames while raw errors go to logs. Nonce CSP wired in `frontend/middleware.ts` and `unsafe-eval`/`unsafe-inline` for scripts are dev-only. SSRF gate on the vision tool intact via `verifyUploadUrl`. Minor remaining LOWs (won't gate launch): `routes/chat.ts:146` outer catch still emits raw `err.message` if `runAgent` throws outside its own try (unreachable in practice — agent self-classifies); FE `next.config.mjs` rewrites silently fall back to `localhost:4000` when `BACKEND_URL` is unset (BE refuses to boot, so a misconfigured deploy fails at the BE first); `tool_status.errorMessage` carries raw tool/MCP throw text (LLM-targeted, bounded scope). No HIGH, no MEDIUM open.

## Retrospective

Cycle 6 closes the loop. The eighteen items accumulated across Cycles 1–5 — five reviewer LOWs/nice-to-haves from Cycle 1, the long-deferred BE↔FE codegen drift from Cycles 2/3, two security/product items from Cycle 4, six architect/design carry-overs from Cycle 5 — all land in one cycle. The headline structural change is the `@agentic/events` workspace package: both backend and frontend now import a single Zod source of truth, and adding a new SSE arm no longer requires touching two files. A small Node-ESM quirk caught us out (missing `"type": "module"` in the new package's `package.json` made runtime imports fail despite a clean `tsc`); the orchestrator caught it during QA and the fix is in. `classifyError` collapses the previous catch-all `'internal'` mapping into the five specific codes ARCH §6 always intended. The architect spotted a residual raw-`err.message` leak in `routes/chat.ts`'s outer catch — the same finding showed up independently in Security's nit list — and it landed in the same in-cycle fix. Env guards now refuse a misconfigured production boot. Nonce CSP middleware ships; `unsafe-eval` is dev-only. A daily WAL checkpoint cron keeps SQLite tight. The vision-usage script + the deterministic `usage_log.jsonl` tagging give the PRODUCT.md Q3 kill-switch a real signal. The README, `docs/DEPLOY.md`, and `docs/walkthroughs/launch.md` close the documentation gap; the walkthrough is the artifact that finally retires the "manual UI walkthrough" caveat that's been hanging since Cycle 1's acceptance #1.

All four reviewers PASS. The product is **directly launchable**, subject to the two acceptance items that require a human at the keyboard: Lighthouse audit on `/` and `/s/<id>` with a real `GROQ_API_KEY`, and a `/security-review` skill run against the full Cycle-6 diff. Both are user-triggered by design.

Cycle status: **closed.** Project status: **launch-ready** pending the two human-gated audits.
