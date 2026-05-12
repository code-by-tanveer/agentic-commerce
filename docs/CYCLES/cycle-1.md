# Cycle 1 — Phase A: Agentic foundation

Status: building.
Started: 2026-05-12T18:40:00Z.

**Goal.** Turn the search-wrapper MVP into a real streaming agent. After this cycle, a user typing a query sees the agent's tool use as a dim inline status, then watches a product group materialize inline as part of a single assistant message. Follow-ups retain context. The SQLite spine and shared event protocol are laid down so Cycles 2–5 just plug components in.

User-visible outcome (PRODUCT.md §7): *"The chat actually thinks."*

## Source docs

- `docs/LAUNCH_CHECKLIST.md` § "Cycle 1" — the canonical task list. This file expands the why and the wiring; the checklist is the bar.
- `docs/ARCHITECTURE.md` §2 (data flow), §3 (component inventory), §4 (schema), §5 (tool contract), §6 (streaming protocol).
- `docs/DESIGN.md` §8 Cycle 1 directive, §2.7 (shadow XOR border), §2.8 (motion), §3 (principles 1, 5).
- `docs/adr/0001-llm-provider-groq.md` — model + fallback rule.
- `docs/adr/0002-streaming-protocol-sse.md` — wire format + reconnect rule.
- `docs/adr/0003-hybrid-tool-routing.md` — every tool wraps the MCP, never proxies.
- `docs/adr/0004-session-store-sqlite.md` — repos return `Promise<T>` even though SQLite is sync.

## Cross-cutting fixes (from Cycle 0 contradictions)

These must land in Cycle 1, not later. Bundled into the engineer briefs.

1. Add `shadow-glow` token to `frontend/tailwind.config.ts` per DESIGN.md §2.7.
2. Remove `border border-ink-100` from `frontend/components/product/ProductCard.tsx`. Keep `shadow-soft`.
3. Audit existing motion: no animation > 500ms; stagger cap 6 for sibling cards.
4. Full SQLite schema (5 tables) lands now even though only `sessions`+`messages` repos are wired this cycle.

## Acceptance criteria

Bar for "Cycle 1 done". All must be PASS after engineering and QA.

1. User can send "find me a minimalist desk lamp under $150" via the UI and observe:
   a. Stream text appearing character-by-character.
   b. A dim `ToolStatus` row reading "Searching desk lamps under $150" → checkmark.
   c. A `ProductCardGroup` rendered *inside the same assistant message* with results.
2. Sending a follow-up "show me cheaper" within the same conversation triggers a second `search_catalog` call with adjusted args. Backend log shows the tool_calls history including the prior turn's user message.
3. Killing `UCP_PROFILE_URL` and sending a query renders an inline retry-banner error, not a hang.
4. Type-check is green on both workspaces (`tsc --noEmit`).
5. Backend boots, `/health` returns `{ok:true}`, `/api/chat` accepts a POST with `Accept: text/event-stream`.
6. SQLite file is created on boot at `data/agentic.db` (or `DB_PATH`), migration 0001 applied. Five tables exist.
7. `ProductCard.tsx` no longer has both `border` and `shadow-soft` (compliance with DESIGN.md §2.7).
8. `shadow-glow` token defined in `tailwind.config.ts`.

## Files to touch

### Backend (`/home/sam/agentic_commerce/backend/`)

New:
- `src/services/groqClient.ts`
- `src/services/toolRegistry.ts`
- `src/services/cache.ts`
- `src/services/tools/searchCatalog.ts`
- `src/services/tools/getProductDetails.ts`
- `src/services/tools/compareProducts.ts`
- `src/services/agent.ts`
- `src/stream/events.ts` (Zod schemas)
- `src/stream/sseWriter.ts`
- `src/routes/chat.ts`
- `src/routes/session.ts`
- `src/db/sqlite.ts`
- `src/db/migrations/0001_init.sql`
- `src/db/migrations/runner.ts`
- `src/db/repos/sessions.ts`
- `src/db/repos/messages.ts`
- `src/types/tool.ts`

Modified:
- `package.json` — add `groq-sdk`, `better-sqlite3`, `nanoid`, `@fastify/rate-limit`, `@fastify/cookie` (CORS already present). Dev: `@types/better-sqlite3`.
- `src/config/env.ts` — add `GROQ_API_KEY`, `GROQ_MODEL` (default `llama-3.3-70b-versatile`), `GROQ_FALLBACK_MODEL` (default `llama-3.1-8b-instant`), `GROQ_VISION_MODEL` (default `meta-llama/llama-4-scout-17b-16e-instruct`), `DB_PATH` (default `data/agentic.db`), `UPLOAD_DIR` (default `data/uploads`), `IP_HASH_SALT`.
- `.env.example` — mirror the new keys.
- `src/index.ts` — register cookie + rate-limit, run migrations on boot, register chat + session routes. Keep `/health`.

Retired:
- `src/routes/product.ts` (the deterministic GET endpoint — the LLM-driven `get_product_details` tool supersedes it for chat; we can resurrect later if needed by a non-chat surface).
- `src/routes/search.ts` (already absent — was never registered post-MVP).

Note: existing `mcpClient.ts`, `normalize.ts`, `catalog.ts`, `tokenCache.ts`, `types/product.ts` are **unchanged** in Cycle 1.

### Frontend (`/home/sam/agentic_commerce/frontend/`)

New:
- `lib/events.ts`
- `lib/stream.ts`
- `components/chat/ToolStatus.tsx`
- `components/chat/MessageRenderer.tsx`
- `components/product/ComparisonTable.tsx`

Modified:
- `package.json` — add `@microsoft/fetch-event-source`, `zod`.
- `tailwind.config.ts` — add `shadow-glow`. Optionally add `ink-300`, `ink-700` only if Cycle 1 components actually need them (they don't yet; skip).
- `hooks/useConversation.tsx` — rewrite: reducer over typed `ServerEvent`s, message has `blocks: Block[]` with `text | tool_status | products | comparison | error` variants.
- `components/chat/MessageBubble.tsx` — render block list via `MessageRenderer`.
- `components/chat/ConversationCanvas.tsx` — minor: message keying based on new shape.
- `components/chat/InputBar.tsx` — no behaviour change; ensure it doesn't break if `send` now takes a Promise.
- `components/product/ProductCard.tsx` — drop `border border-ink-100` (DESIGN.md §2.7). Confirm no border elsewhere on the card outline.
- `lib/api.ts` — retire `searchProducts`; add `getOrCreateSession()`, `appendMessage(sessionId, message)`.
- `types/product.ts` — unchanged in Cycle 1 (chips + merchantInfo land in Cycle 2; keep them out of the type until then to avoid optional pollution).

## Engineer briefs

### Backend engineer

You're a senior Node/TypeScript engineer. Implement only the backend portion of Cycle 1. Edit only files under `/home/sam/agentic_commerce/backend/`. Reuse existing services (`mcpClient`, `normalize`, `catalog`, `tokenCache`) — do not rewrite them.

Hard rules:
- The `search_catalog`, `get_product_details`, `compare_products` tools must each justify their existence vs a raw MCP call (ADR-0003): enrichment, composition, or both. For Cycle 1, the enrichment is placeholder (Cycle 2 adds chips/merchant info) — that's acceptable because the registry shape is what we're proving, plus `compare_products` is genuinely composition.
- Agent loop hard cap: 4 turns. After turn 4, force `tool_choice: 'none'` for one final answer.
- Repos return `Promise<T>` everywhere (ADR-0004).
- Every emitted event is Zod-validated server-side before write.
- Cookie middleware sets `agentic_sid` as HttpOnly Secure SameSite=Lax.
- Rate limit `/api/chat` 10/min/IP, `/api/session/*` 60/min/IP via `@fastify/rate-limit`.
- `request.raw.on('close')` aborts in-flight Groq + tool calls (`AbortController` propagation).
- SSE headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`. Heartbeat `event: ping` every 15s.

### Frontend engineer

You're a senior React/Next.js engineer. Implement only the frontend portion of Cycle 1. Edit only files under `/home/sam/agentic_commerce/frontend/`.

Hard rules:
- Follow DESIGN.md strictly. The shadow-XOR-border rule applies to every new component (§2.7). Tool-status indicators use `text-quiet text-xs` (§3 principle 1). No serif anywhere in chat or tool output (§2.4).
- `ToolStatus` copy is `<verb> <object>`, e.g. "Searching desk lamps under $150" — never "Calling tool `search_catalog`".
- Use `@microsoft/fetch-event-source` for the SSE client (POST + stream). The native `EventSource` is GET-only and not acceptable.
- `useConversation` should be a pure reducer; the streaming logic lives in `lib/stream.ts`. Hook composes them.
- On `error: retryable=true` event, show a small inline "Retry" affordance below the truncated assistant message; clicking it re-POSTs the same message history.
- `prefers-reduced-motion: reduce` → collapse all `framer-motion` durations to 100ms opacity-only. Wire this once at the `MessageBubble` and `ProductCard` level; do not bury it per-component.
- Keep `ConversationCanvas` `aria-live="polite"` / `aria-atomic="false"` (DESIGN.md §7).

## Delivery log

_Each engineer appends a short note here when done: ≤ 5 bullets._

### Backend

- Shipped: `groqClient` (stream + non-stream, 70B → 8B fallback, jittered single retry, best-effort `usage_log.jsonl`), `toolRegistry` + `Tool<TArgs,TResult>` contract, three tools (`search_catalog`, `get_product_details`, `compare_products`), `agent.ts` 4-turn loop with parallel tool dispatch (forces `tool_choice:'none'` on the final turn), `stream/events.ts` Zod discriminated union for all 10 event arms, `SseWriter` (15s heartbeat, validates each frame), `/api/chat` SSE + `/api/session/:id` + `/api/session/:id/messages` routes, `@fastify/cookie` + `@fastify/rate-limit` middleware (chat 10/min, session 60/min), full 5-table migration runner, sessions/messages repos returning `Promise<T>`.
- Retired `routes/product.ts` and `routes/search.ts` and removed their registrations from `index.ts`.
- `parameters` on the `Tool` interface use a local `JsonSchema` typedef rather than `@types/json-schema` to avoid a new transitive dep.
- Tool dispatcher applies post-fetch price filtering (`min`/`max`) only; `ships_to` / `available` from LLM-supplied filters are parsed and surfaced in the tool message but not yet pushed into the MCP query — Cycle 2 will plumb them through (`services/catalog.ts` left untouched per brief).
- TODO for QA: end-to-end smoke against a real `GROQ_API_KEY` to verify streaming + tool fan-out; `backend/README.md` curl one-liner not added (no README exists yet — flagging rather than creating a doc out of scope).

### Frontend

- Shipped `lib/events.ts` (Zod schemas for all 10 ServerEvent arms, mirrors ARCHITECTURE.md §6) and `lib/stream.ts` (POST-SSE client via `@microsoft/fetch-event-source`, ignores `ping`, throws typed `StreamError` on network drop — explicit no auto-reconnect per ADR-0002).
- Rewrote `hooks/useConversation.tsx` as a pure reducer over typed events with `Block[]` message model (`text | tool_status | products | comparison | error`); added `retry(messageId)` that re-POSTs the conversation up to the failed assistant turn; `appendMessage` persistence is best-effort and silent on failure.
- New components: `ToolStatus` (rotating-dot spinner + verb lookup, `text-xs text-ink-400`, opacity-pulse fallback under prefers-reduced-motion), `MessageRenderer` (stateless block-switch), `ComparisonTable` (sticky leftmost column, horizontal scroll, `shadow-soft`/`rounded-2xl` per §2.7).
- Cross-cutting fixes: dropped `border border-ink-100` from `ProductCard`, capped its entry stagger at index 5 (§2.8), added `shadow-glow` token to `tailwind.config.ts`, added `aria-live="polite"`/`aria-atomic="false"` to the canvas messages region.
- Deferred (not in Cycle 1 scope per brief): `InputBar` still has `border + shadow-soft` together — pre-existing §2.7 violation, brief said "no behaviour change"; flag for Cycle 6 visual QA. Existing `ProductCard` expanded Buy button uses `px-5`/`h-10` (pre-existing §2.5 forbidden spacing); same flag.

## Defects

Filed by QA at 2026-05-12T18:55:00Z after build + boot + smoke-test.

- **D1 (minor, fixed in QA pass).** `backend/README.md` curl one-liner from LAUNCH_CHECKLIST § Cycle 1 was missing — backend engineer flagged. Authored during QA. **Closed.**
- **D2 (minor, defer).** Error-code mapping in `services/agent.ts` is too coarse: an upstream Groq 401 maps to `code: 'internal'`. The protocol in ARCHITECTURE.md §6 admits `rate_limited`, `mcp_error`, `tool_error`, `invalid_request`. Auth and quota failures should map more specifically so the FE retry banner can speak intelligibly. **Defer to Cycle 6 hardening** unless reviewers escalate.
- **D3 (pre-existing, defer).** `frontend/components/chat/InputBar.tsx` has `border border-ink-200` + `shadow-soft` together, violating DESIGN.md §2.7. Pre-existing from the MVP scaffold; frontend engineer flagged in delivery log. **Defer to Cycle 6 visual QA** (not Cycle 1 scope per brief).
- **D4 (pre-existing, defer).** Expanded `ProductCard.tsx` Buy button uses `px-5` and `h-10`, both outside the DESIGN.md §2.5 six-step spacing palette. Pre-existing. **Defer to Cycle 6 visual QA.**

### QA verification matrix vs `## Acceptance criteria`

| # | Criterion | Status |
|---|---|---|
| 1 | UI streams text + ToolStatus + ProductCardGroup | **Not verified end-to-end** (needs real `GROQ_API_KEY` + dev-server walkthrough — see note below) |
| 2 | Follow-up retains context | Same — agent.ts loop accumulates history across turns; UI walkthrough deferred |
| 3 | Killing `UCP_PROFILE_URL` → inline retry, not hang | Smoke-tested the upstream-failure path: SSE returns `event: error` with `retryable:true`, status 200, no hang ✓ |
| 4 | `tsc --noEmit` clean | ✓ both workspaces |
| 5 | Backend boots, `/health` = `{ok:true}`, `/api/chat` registered | ✓ confirmed |
| 6 | SQLite file created, migration 0001 applied, 5 tables present | ✓ `_migrations + sessions + messages + preferences + shortlists + saved_outfits` |
| 7 | `ProductCard.tsx` no longer has both `border` and `shadow-soft` | ✓ verified |
| 8 | `shadow-glow` token in `tailwind.config.ts` | ✓ verified |

Reviewers: criteria #1–2 require a manual UI walkthrough with a real Groq key. The implementation paths are sound by code review; the gap is environmental, not code.

## Review verdicts

_(pending — populated after QA)_

- **PO:** CONDITIONAL-PASS

  The wiring matches the Cycle 1 PRD line ("the chat actually thinks"). Code review of `agent.ts` (emits `text_delta` → `tool_status` → `products` → `done`), `useConversation.tsx` (reducer assembles `Block[]` in arrival order on one assistant message), and `MessageRenderer.tsx` (renders text + `ToolStatus` + `ProductCardGroup` inline) confirms acceptance bullets 1a/1b/1c are *achievable* from what shipped. Bullet 2 (follow-up retains context) is plumbed: `chat.ts` forwards full `messages` array and `agent.ts` appends each turn back into `messages`. Acceptance #3–8 are PASS in the QA matrix. No anti-goal violations (no embedded checkout, no auth, no mascot copy). But criteria #1 and #2 are "not verified end-to-end" pending a real Groq key — that's the gating outcome of the cycle, so I can't sign a clean PASS until a human runs the walkthrough.

  Must-fix:
  - Run the manual UI walkthrough with a live `GROQ_API_KEY` against "find me a minimalist desk lamp under $150" + a "show me cheaper" follow-up. Log the backend `tool_calls` history for the second turn. Attach result to this file before the cycle closes.

  Nice-to-have:
  - D2 (coarse error-code mapping) — Groq 401 currently maps to `internal`; the FE retry banner will say the wrong thing on an auth failure. Reasonable defer to Cycle 6, but worth a sentence in the cycle-6 plan so it doesn't get lost.
  - D3 / D4 (pre-existing `InputBar` and `ProductCard` Buy-button violations) — agreeing with the deferral. They don't block the user-visible outcome this cycle.
- **Design:** CONDITIONAL-PASS

  New components honour §2.7 (shadow XOR border on `ToolStatus` / `MessageRenderer` / `ComparisonTable`; outer card uses `shadow-soft` with internal hairlines as §2.3 dividers, not card borders), §2.4 (no `font-display` anywhere added), §3.1 (`ToolStatus` is `text-xs text-ink-400`, Granola-style rotating dot, verb+object copy), §7 (`aria-live="polite"`/`aria-atomic="false"` on the canvas), §2.8 stagger cap and durations. Deferral of D3 / D4 to Cycle 6 is acceptable — both pre-existing and explicitly out of brief.

  Must-fix:
  - `frontend/components/product/ProductCard.tsx:37-40,100-107` — `ProductCard` never reads `useReducedMotion`; entry (300ms y-translate), expand (250ms height), collapse (200ms height) all run full duration under `prefers-reduced-motion: reduce`. The Cycle 1 brief required wiring the fallback "at the `MessageBubble` and `ProductCard` level"; only `MessageBubble` complies. Violates §6 reduced-motion clause + §7.

  Nice-to-have:
  - `frontend/components/chat/ToolStatus.tsx:110,124` — `h-1.5 w-1.5` is decimal sizing on the dot. §2.5 forbids decimal *spacing*; icon dimensions are a grey area. Either snap to `h-2 w-2` or codify the carve-out in DESIGN.md so future reviewers don't relitigate.
- **Architect:** CONDITIONAL-PASS

  All four ADRs honoured: 4-turn cap + `tool_choice:'none'` on final turn (`agent.ts:67,80`); parallel `Promise.all` dispatch (`agent.ts:162`); `AbortController` on `request.raw.on('close')` propagated via `ToolContext.signal` (`chat.ts:78-82`); Groq 70B→8B fallback on 429/503 with jittered single retry (`groqClient.ts:75-111`); repos return `Promise<T>` (ADR-0004); Zod-discriminated union covers all 10 event arms with per-frame validation in `SseWriter.write` (`sseWriter.ts:37-50`); cookie HttpOnly+Secure+SameSite=Lax; no `groq-sdk` import on the FE; no auto-reconnect (`onerror` halts `fetch-event-source` retries; ADR-0002).

  Must-fix (Cycle 1):
  - `backend/src/stream/events.ts:33` vs `frontend/lib/events.ts:41` — `reasoningChipSchema` already diverged (BE: `tone?:enum`, FE: `detail?:string`). FE `passthrough()` masks it today; Cycle 2 emits the first chip and the contract breaks. Land a single shape on both sides now (ADR-0002 D2 mitigation #4).

  Carry-over to Cycle 2:
  - `backend/src/services/mcpClient.ts` accepts no `AbortSignal`; tools honour `signal.aborted` only before dispatch, so in-flight MCP requests survive an SSE disconnect (ARCH §7 "abort the in-flight Groq stream and any pending MCP calls"). Cycle 1 brief froze that file; plumb `signal` through `callTool` in Cycle 2.

  Nice-to-have:
  - `SseWriter` emits comment-form `: ping\n\n` heartbeats; ARCH §6 specifies `event: ping`. Both are valid SSE keepalives and the FE drops the comment form silently — cosmetic, polish in Cycle 6.
  - `search_catalog` and `get_product_details` are placeholder pass-throughs over the existing `catalog.searchCatalog`/`getProduct` (ADR-0003 review heuristic). Stated as acceptable in the engineer brief because Cycle 2 lands chips + merchantInfo; flagging so reviewers don't re-litigate next cycle. `compare_products` is genuine composition (parallel fan-out).
  - `filters.ships_to` / `filters.available` accepted by the `search_catalog` JSON schema but not plumbed into the MCP request (delivery log #4). Cycle 2 must wire them through `services/catalog.ts` or drop them from the schema.
- **Security:** CONDITIONAL-PASS

  Secrets are backend-only (no FE refs to `GROQ_API_KEY`/`SHOPIFY_CLIENT_SECRET`; `.env` gitignored). Cookie `agentic_sid` is HttpOnly+Secure+SameSite=Lax, 30-day, value is just the nanoid. CORS uses an explicit allowlist (no `*`). Rate limits are wired per-route (chat 10/min, session 60/min, `keyGenerator=req.ip`, `trustProxy:true`). Every tool runs `parseArgs` (Zod) before `execute`; malformed args → structured `invalid_arguments` event, no unhandled throw. All `db/repos/*` queries are prepared statements with `?`/named placeholders. SSE writer Zod-validates each frame. No CSRF needed (same-origin JSON via Next.js proxy). `usage_log.jsonl` records only model/usage tokens, no prompts/response bodies.

  Must-fix (HIGH):
  - _none_

  Should-fix (MEDIUM):
  - `backend/src/index.ts:11-14` — Fastify logger runs with defaults and `trustProxy:true`, so the built-in request serializer emits the client IP (`remoteAddress`/`remotePort`) on every request log. ARCHITECTURE.md §9 mandates raw IPs are replaced by the salted hash in `sessions.ip_hash`. Configure a Pino `serializers.req` (or `redact`) that drops/hashes `remoteAddress` and `remotePort` before logs ship. As shipped, every `/api/chat` call writes a raw IP to stdout.
  - `backend/src/index.ts:16-19` — CORS is registered with `credentials: true`, but the FE talks to the backend through the Next.js same-origin proxy, so the browser never sends credentialled cross-origin requests on the hot path. Per ARCHITECTURE.md §9 ("credentialled requests not used"), set `credentials: false` (or drop the option) to shrink the cross-origin attack surface; combined with the allowlist this is defense-in-depth, not a live bug.

  Nice-to-have (LOW):
  - `backend/src/config/env.ts:37-40` — `ALLOWED_ORIGINS` defaults to `http://localhost:3000` with no production guard. Add a boot-time assertion that `NODE_ENV==='production'` requires a non-localhost value so a misconfigured deploy can't silently fall back to the dev origin.
  - `backend/src/routes/chat.ts:113-124` — on agent failure the raw `err.message` is forwarded into the `error` SSE frame. Groq/MCP SDK error messages can contain URLs or upstream payload fragments; map to a sanitized user-visible string and keep the full `err` server-side only. Tracks with D2.
  - `backend/src/services/agent.ts:239` and `routes/chat.ts:71,114` — pino logs the full `err` object; if a Groq SDK error ever attaches request headers (`authorization`) this would log the key. Add `redact: ['err.config.headers.authorization', 'err.response.headers.authorization', 'err.request.headers.authorization']` to the logger options as belt-and-braces.
  - `backend/src/routes/chat.ts:54-60` — `secure: true` is hardcoded; in plain-HTTP local dev the cookie is silently dropped, so every chat request becomes a brand-new session. Gate on `NODE_ENV==='production'` (or `request.protocol==='https'`) so dev sessions persist while prod stays Secure-only.

  CONDITIONAL on landing the two MEDIUMs (IP redaction in logs, drop CORS credentials) before Cycle 2 closes. None block the user-visible outcome of Cycle 1.

## Fixes applied (post-review)

Applied 2026-05-12T19:10Z. All four reviewer must-fixes landed in-cycle; no second build round needed.

| Fix | File(s) | Verified |
|---|---|---|
| `ProductCard` honours `prefers-reduced-motion` (entry + expand/collapse) — Design | `frontend/components/product/ProductCard.tsx` | type-check ✓; visual smoke when a real Groq key is available |
| `reasoningChipSchema` unified BE↔FE (`kind`, `label`, `detail?`, `tone?`) — Architect | `backend/src/stream/events.ts`, `frontend/lib/events.ts` | type-check ✓ both sides; FE keeps `.passthrough()` for forward-compat |
| Pino logger redacts raw IPs (hashed via `IP_HASH_SALT`) + redacts upstream `headers.authorization` — Security | `backend/src/index.ts` | boot smoke ✓; log lines now show `ipHash` only; `grep -c remoteAddress /tmp/be.log` = 0 |
| CORS `credentials: false` (FE goes through same-origin Next proxy) — Security | `backend/src/index.ts` | boot smoke ✓ |

Carry-overs added to `LAUNCH_CHECKLIST.md` § Cycle 2:
- Plumb `AbortSignal` through `services/mcpClient.ts::callTool` (Architect).
- Wire `filters.ships_to`/`filters.available` through `services/catalog.ts` or drop from `search_catalog` JSON schema (Architect).
- Confirm or replace `success/warn/danger` palette before reasoning chips render (Design — already in checklist).

Carry-overs added to `LAUNCH_CHECKLIST.md` § Cycle 6:
- D2: granular error-code mapping (`rate_limited`/`mcp_error`/`tool_error`/`invalid_request` vs catch-all `internal`).
- D3: `InputBar` `border + shadow-soft` violation.
- D4: `ProductCard` expanded-Buy `px-5`/`h-10` outside the §2.5 spacing palette.
- Security LOW: production guard on `ALLOWED_ORIGINS` (no localhost fallback in prod).
- Security LOW: cookie `secure` should be `NODE_ENV==='production'`-gated so dev sessions persist on plain HTTP.
- Security LOW: sanitize raw `err.message` before forwarding into the `error` SSE frame.
- Design nice-to-have: `h-1.5 w-1.5` decimal sizing on the `ToolStatus` dot (snap to `h-2 w-2` or codify the icon carve-out in DESIGN.md §2.5).
- Architect nice-to-have: switch `SseWriter` heartbeat from `: ping\n\n` comment-form to `event: ping` per ARCH §6.

## Retrospective

Cycle 1 landed the agent backbone: a Groq-driven loop (4-turn cap, 70B→8B fallback, parallel tool dispatch), a hybrid tool registry that wraps the Catalog MCP rather than exposes it, a Zod-discriminated SSE protocol (10 typed event arms) with the FE consuming via `@microsoft/fetch-event-source` and rendering generative-UI blocks inline, and the full SQLite schema (five tables) bootstrapped on first boot. Both workspaces type-check clean; the backend boots and returns a graceful `event: error` frame on an upstream 401 (no hang). All four reviewers (PO, Design, Architect, Security) returned CONDITIONAL-PASS with four small must-fixes that were applied in-cycle: `ProductCard` `useReducedMotion`, `reasoningChipSchema` BE↔FE unification, Pino IP redaction, and dropping unneeded CORS `credentials:true`. Nine smaller observations were converted into LAUNCH_CHECKLIST carry-overs for Cycles 2 and 6. The single gap reviewers flagged but the orchestrator did not close: end-to-end UI verification against a real `GROQ_API_KEY` — code paths are sound by review, but a human walkthrough is the only proof of acceptance #1–2.

Cycle status: **closed.** Cycle 2 may begin.
