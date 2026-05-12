# Launch Checklist

Owner: Process Manager (orchestrator). Rolling list. Items move from `[ ]` → `[x]` as cycles complete and reviewers PASS them.

The product is **launchable** when every item below is `[x]` and the four reviewers (PO / Design / Architect / Security) each sign the cycle-N retrospective with PASS.

Cross-references:
- **PRD** items → `docs/PRODUCT.md` (sections: north-star, 7 UX moves, anti-goals)
- **ARCH** items → `docs/ARCHITECTURE.md` + `docs/adr/*`
- **DESIGN** items → `docs/DESIGN.md` (tokens, principles, per-cycle directives)

---

## Cycle 0 — Kickoff ✓

- [x] PRODUCT.md written (vision, persona, north-star, anti-goals, 7 moves as acceptance criteria, cycle goals, open questions)
- [x] Competitor scan written (Perplexity / Rufus / ChatGPT / Klarna / Daydream / Phia / Shop / Mercari)
- [x] ARCHITECTURE.md written (system overview, data flow, components, schema, tool contract, SSE protocol, failure modes, scaling, security, deploy)
- [x] ADR-0001 LLM provider (Groq)
- [x] ADR-0002 Streaming protocol (SSE over POST)
- [x] ADR-0003 Hybrid tool routing (LLM → our tools → MCP)
- [x] ADR-0004 Session store (SQLite via better-sqlite3)
- [x] DESIGN.md written (tokens, semantic colors, type pairing, spacing, radius, shadows, motion, principles, component inventory, breakpoints, motion budget, a11y, per-cycle directives, references)
- [x] LAUNCH_CHECKLIST.md seeded (this file)
- [x] STATE.md → cycle 1, planning

### Contradictions resolved at end of Cycle 0

1. **SQLite scope** — architect flagged that plan defers SQLite to Cycle 2 but `sessions.view_mode` (Cycle 3) and `sessions.summary_blob` (Cycle 5) need persistence earlier. **Resolution:** DB bootstrap + full schema (all five tables) lands in **Cycle 1**. Repos for preferences/shortlists/outfits exist but are only wired by their respective cycle's UI. Migration runner runs on boot from Cycle 1 onward.
2. **`ProductCard` shadow+border violation** — design flagged that the current scaffold has `border border-ink-100 ... shadow-soft` together, violating the DESIGN.md §2.7 rule. **Resolution:** fix in **Cycle 1** as part of the Phase A rewrite, not Cycle 5 polish. Every new component copies the pattern of the existing card; we are not letting a bad precedent compound.
3. **`shadow-glow` token + state colors** — design flagged that `shadow-glow` is referenced but not yet in `tailwind.config.ts`, and `success`/`warn`/`danger` colors are `[ASSUMPTION]` against Tailwind defaults. **Resolution:** add `shadow-glow` to `tailwind.config.ts` in **Cycle 1**. Confirm or replace `success/warn/danger` (Tailwind emerald/amber/rose) at the **start of Cycle 2**, before reasoning chips render any of them.

---

## Cycle 1 — Agentic foundation (Phase A) ✓

Closed 2026-05-12T19:10Z. See `docs/CYCLES/cycle-1.md` for the full delivery log, defects, four reviewer verdicts (all CONDITIONAL-PASS with must-fixes applied in-cycle), and retrospective.

User-visible outcome: "the chat actually thinks". The user types a query, sees the agent's tool use (subtle inline status), then a streamed answer with product cards. Follow-ups work without restating context.

### Acceptance criteria (from PRODUCT.md §5)

- [~] User can send a query and see streamed text appear character-by-character. _(plumbed, code-reviewed; awaits manual walkthrough with real `GROQ_API_KEY`)_
- [~] Tool calls render as a dim, inline `ToolStatus` line. _(plumbed, code-reviewed; awaits walkthrough)_
- [~] At least one `ProductCardGroup` materializes inside an assistant message. _(plumbed, code-reviewed; awaits walkthrough)_
- [~] Follow-up message ("show me cheaper") retains context. _(plumbed; `chat.ts` forwards full `messages[]` and `agent.ts` accumulates each turn)_
- [x] Forced error renders inline error block with retry, not a hung stream.

### Build tasks

**Backend (`/home/sam/agentic_commerce/backend/`)**
- [x] Add deps: `groq-sdk`, `better-sqlite3`, `eventsource-parser`, `nanoid`.
- [x] Extend `config/env.ts` with `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_FALLBACK_MODEL`, `GROQ_VISION_MODEL`, `DB_PATH`, `UPLOAD_DIR`, `IP_HASH_SALT`.
- [x] Create `services/groqClient.ts` — streaming + non-streaming, retry-on-429 with 70B → 8B fallback (ADR-0001).
- [x] Create `types/tool.ts` with `Tool<TArgs, TResult>` + `ToolContext` interfaces (ARCH §5).
- [x] Create `services/cache.ts` — LRU keyed by `(toolName, stable JSON args)`, 15-min TTL, 500-entry cap.
- [x] Create `services/toolRegistry.ts` — `toGroqSchema()`, `dispatch(name, args, ctx)`.
- [x] Create `services/tools/searchCatalog.ts` wrapping existing `services/catalog.ts::searchCatalog`. Add reasoning-chip / merchant-info placeholders (filled in Cycle 2).
- [x] Create `services/tools/getProductDetails.ts`.
- [x] Create `services/tools/compareProducts.ts`.
- [x] Create `services/agent.ts` — turn loop, max 4 turns, parallel tool dispatch, event emission, `AbortController` propagation.
- [x] Create `stream/events.ts` — Zod schemas for every event type listed in ARCH §6.
- [x] Create `stream/sseWriter.ts` — `write(event)` with `event: <type>\ndata: <json>\n\n`, 15s ping.
- [x] Create `routes/chat.ts` — `POST /api/chat` SSE.
- [x] Create `db/sqlite.ts` (WAL, foreign keys, busy_timeout 5000).
- [x] Create `db/migrations/0001_init.sql` with **all five tables** (sessions, preferences, messages, shortlists, saved_outfits) per ARCH §4.
- [x] Create `db/migrations/runner.ts` — boot-time application of numbered files.
- [x] Create `db/repos/sessions.ts` and `db/repos/messages.ts` (other repos exist but stay unused until their cycles). All return `Promise<T>` per ADR-0004.
- [x] Create `routes/session.ts` — `GET /api/session/:id`, `POST /api/session/:id/messages`. Cookie middleware for `agentic_sid`.
- [x] Retire `routes/search.ts` (Phase A's LLM drives search via the tool).
- [x] Add `@fastify/rate-limit` with `/api/chat` 10/min/IP, `/api/session/*` 60/min/IP.
- [x] `index.ts` wires migrations on boot, registers all routes.
- [x] curl one-liner documented in `backend/README.md` for `curl -N -X POST -H 'Accept: text/event-stream' ...`.

**Frontend (`/home/sam/agentic_commerce/frontend/`)**
- [x] Add deps: `@microsoft/fetch-event-source`, `zod` (for event re-validation).
- [x] Create `lib/events.ts` — TS types matching `backend/stream/events.ts`. CI lint check that names + arms match (Cycle 1 spike: pick codegen path; until then, manual + CI diff).
- [x] Create `lib/stream.ts` — `streamChat(body)` async iterator.
- [x] Rewrite `hooks/useConversation.tsx` — reducer over typed events; message contains ordered sub-blocks.
- [x] Create `components/chat/ToolStatus.tsx` — dim, `text-xs text-quiet`, spinner→verb→object→check.
- [x] Create `components/chat/MessageRenderer.tsx` — switch on sub-block type.
- [x] Rewrite `components/chat/MessageBubble.tsx` — composes sub-blocks via `MessageRenderer`.
- [x] Create `components/product/ComparisonTable.tsx` (basic shell — polish Cycle 2).
- [x] Update `lib/api.ts` — retire `searchProducts`; add session helpers (get/create, append messages).

### Cross-cutting fixes (from Cycle 0 contradictions)

- [x] Add `shadow-glow` to `tailwind.config.ts` per DESIGN.md §2.7 (`0 0 0 6px rgba(255,106,19,0.12), 0 8px 24px -8px rgba(255,106,19,0.45)`).
- [x] Remove `border border-ink-100` from `ProductCard.tsx`; keep `shadow-soft` (DESIGN.md §2.7, "shadow XOR border").
- [x] Audit motion: confirm no animation > 500ms in any existing or new component. Stagger cap of 6 for sibling cards.

### Verification

- [x] Backend boots; `/health` returns `{ok:true}`.
- [x] curl one-liner against `/api/chat` returns SSE events (verified: returns a graceful `event: error` retryable frame on a placeholder Groq key).
- [~] Browser walkthrough: send "find me a minimalist desk lamp under $150" → text streams → tool_status visible → products appear inline → follow-up "cheaper?" works. _(awaits human walkthrough with real `GROQ_API_KEY`)_
- [~] Backend log shows `tool_calls` in history for follow-up turn. _(awaits same walkthrough)_
- [x] Kill `UCP_PROFILE_URL` → graceful inline error, not a hang. _(smoke-tested via the placeholder-key path that also fails upstream)_
- [x] `tsc --noEmit` clean on both workspaces.

### Reviewers

- [x] **PO** — CONDITIONAL-PASS. Wiring sound; manual walkthrough gating clean PASS.
- [x] **Design** — CONDITIONAL-PASS → fixes landed (ProductCard `useReducedMotion`).
- [x] **Architect** — CONDITIONAL-PASS → fixes landed (`reasoningChipSchema` BE↔FE unified). MCP `AbortSignal` carried to Cycle 2.
- [x] **Security** — CONDITIONAL-PASS → fixes landed (Pino IP redaction; CORS `credentials:false`).

---

## Cycle 2 — Preferences + reasoning + merchant transparency (Phase B) ✓

User-visible outcome: "the chat remembers me". Tell it "I wear size 8 and prefer EU shipping" once; the About-you panel appears; next search shows `size 8 match` chips.

### Carry-overs from Cycle 1 reviews

- [x] **Architect must-fix.** Plumb `AbortSignal` through `backend/src/services/mcpClient.ts::callTool` so in-flight MCP requests get cancelled when the FE drops the SSE connection (ARCH §7).
- [x] **Architect must-fix.** Wire `filters.ships_to` / `filters.available` through `services/catalog.ts` into the MCP request, OR drop them from the `search_catalog` JSON schema. Today they're accepted by the LLM and silently ignored downstream.
- [x] **Design pre-req.** Confirm or replace `success` / `warn` / `danger` semantic colors (Tailwind emerald/amber/rose are the `[ASSUMPTION]` in DESIGN.md §2.3) **before** the first reasoning chip ships. Chip color mapping per DESIGN.md §8 Cycle 2 directive.

### Acceptance criteria (PRODUCT.md §5 moves #2, #3, #5)

- [x] Persistent preference card visible above input on desktop, collapsed line on mobile.
- [x] User tells agent a preference once → `save_preference` is invoked → card updates without a full reload.
- [x] Every product card after Cycle 2 shows ≥2 reasoning chips when data supports them; chips are tappable for detail; gracefully absent otherwise.
- [x] Expanded product card shows `MerchantBlock` (seller name, returns, shipping speed, rating, optional carbon).
- [x] Preferences survive hard reload in the same session (SQLite-backed).

### Build tasks (high-level — expanded in `docs/CYCLES/cycle-2.md` at cycle plan time)

- [x] Confirm or replace `success/warn/danger` colors (DESIGN.md §2.3) **before** chips ship.
- [x] Backend: `services/tools/savePreference.ts`, `services/tools/getPreferences.ts`, `services/reasoning.ts` (pure function returning chips), extend `normalize.ts` with `reasoningChips` + `merchantInfo` fields.
- [x] Backend: wire `db/repos/preferences.ts`. Route `routes/preferences.ts` (GET/PUT).
- [x] Frontend: `components/preferences/PreferencesCard.tsx` (desktop sticky + mobile sheet).
- [x] Frontend: `components/product/ReasoningChips.tsx`, `components/product/MerchantBlock.tsx`.
- [x] System prompt update: agent proactively extracts size + budget; asks before extracting palette / ethics (PRODUCT.md Q2 hypothesis).

### Reviewers

- [x] PO — moves #2, #3, #5 acceptance bullets all checked.
- [x] Design — chip color mapping per DESIGN.md §8 Cycle 2; preferences card respects breakpoints.
- [x] Architect — preference reads on hot path are microseconds (SQLite synchronous); `reasoning.ts` is pure; tools added pass the "what does this add over raw MCP?" heuristic.
- [x] Security — `save_preference` validates key against allowlist; no arbitrary key writes from LLM input.

---

## Cycle 3 — Collage + shortlist + outfit bundles (Phase C-1)

User-visible outcome: "the chat looks like Pinterest, not Excel". Toggle to collage; drag products into Love/Maybe/Skip; ask for a coordinated outfit on any anchor.

### Acceptance criteria (PRODUCT.md §5 moves #1, #4)

- [ ] `ViewToggle` (List | Collage) appears in header; selection persists for the session (`sessions.view_mode`).
- [ ] Collage layout is a CSS-columns masonry; products keep reasoning chips on hover/tap.
- [ ] Shortlist drawer (right rail desktop, bottom sheet mobile) has three lanes; drag-and-drop works; keyboard fallback (`L`/`M`/`S`) per DESIGN.md §7.
- [ ] On any product, "what would go with this?" triggers `recommend_outfit`; returns a 2-4 item bundle as a single card with combined Save Outfit action.
- [ ] Bundle items each carry a one-line "why this with that" rationale.

### Open question to resolve before this cycle (PRODUCT.md Q1)

- [ ] Are 3 lanes (Love/Maybe/Skip) better than binary (Save/Pass)? Quick test with 3 users or default to 3-lane if no time.

### Build tasks (high-level)

- [ ] Backend: `services/tools/recommendOutfit.ts` (fans out 2-3 parallel searches).
- [ ] Backend: `db/repos/shortlists.ts`, `db/repos/outfits.ts` wired. Route `routes/session.ts` extended.
- [ ] Frontend: `ViewToggle`, `CollageView` (masonry), `Shortlist` (rail + sheet), `OutfitBundle`.
- [ ] Frontend: layout-motion budget enforced (`motion-layout` 400ms easeOut custom) on collage reflow.
- [ ] Frontend: `prefers-reduced-motion` fallback wired (collapses all motion to 100ms opacity crossfades).

### Reviewers

- [ ] PO — moves #1, #4 acceptance bullets checked.
- [ ] Design — collage reflow uses `motion-layout`; no animation > 500ms; DnD has keyboard alternative.
- [ ] Architect — shortlist persistence model (sessionStorage L1 + SQLite L2) is consistent on reload; `recommend_outfit` ranks across its sub-searches.
- [ ] Security — `recommend_outfit` arg validation; shortlist writes are scoped to the session id, not user-supplied.

---

## Cycle 4 — Photo → style (Phase C-2)

User-visible outcome: "the chat sees what I see". Paste a screenshot; products land within seconds.

### Acceptance criteria (PRODUCT.md §5 move #6)

- [ ] Paste/drop image into input bar → upload → vision extraction → results within 5s.
- [ ] Extracted attributes render as editable chips above the result set.
- [ ] Low-confidence extraction → agent asks a clarifying question instead of guessing.

### Open question (PRODUCT.md Q3)

- [ ] Track session-usage rate of photo-search from launch; kill switch at < 5% usage 2 weeks in.

### Build tasks (high-level)

- [ ] Backend: `routes/upload.ts` with `@fastify/multipart`, 8 MB cap, magic-byte sniff, signed-URL response.
- [ ] Backend: `services/tools/extractStyleFromImage.ts` (Groq `llama-4-scout` vision; fallback `llama-3.2-90b-vision` env-toggle).
- [ ] Backend: 24h upload purge cron.
- [ ] Frontend: `components/chat/ImageDropzone.tsx` overlaying input bar (drag-over / uploading states).
- [ ] Frontend: `components/product/Moodboard.tsx` (image + extracted attributes + suggested query).

### Reviewers

- [ ] PO — move #6 acceptance checked; clarifying-question fallback works on a deliberately blurry image.
- [ ] Design — `ImageDropzone` is invisible until drag-over (DESIGN.md §4).
- [ ] Architect — vision tool refuses non-backend URLs (SSRF gate per ARCH §7); upload retention has a purge.
- [ ] Security — magic-byte sniff working; signed URL HMAC validated; rate-limit on `/api/upload` (5/min/IP).

---

## Cycle 5 — Shareable summary + mobile + a11y (Phase D)

User-visible outcome: "I can show this to a friend". Hit share; a polished public lookbook page renders.

### Acceptance criteria (PRODUCT.md §5 move #7)

- [ ] `/s/[id]` server-rendered, OG-tagged (Twitter + Open Graph cards), readable without JS.
- [ ] Section structure: hero (serif italic gist), Loved / Saved Outfits / All Considered, merchants, totals.
- [ ] Copy-link + native share (mobile) buttons in sticky bottom bar.
- [ ] Mobile polish: tap targets ≥44px, Shortlist bottom sheet review, PreferencesCard mobile sheet review.
- [ ] Accessibility checklist (DESIGN.md §7) all green.

### Open question (PRODUCT.md Q4)

- [ ] Snapshot vs live share — default to snapshot; revisit if users ask.

### Build tasks (high-level)

- [ ] Backend: `routes/summary.ts` → `GET /api/session/:id/summary`. Persists final list into `sessions.summary_blob`.
- [ ] Frontend: `app/s/[id]/page.tsx` server component.
- [ ] Frontend: `app/api/og/route.ts` via `@vercel/og` for share-card images.
- [ ] Frontend: components — `SummaryHero`, `SummaryProductList`, `SummaryShareBar`.
- [ ] Accessibility pass: `aria-live` on stream, keyboard nav for cards, reduced-motion respect, color-contrast verified.

### Reviewers

- [ ] PO — move #7 acceptance checked; share rate target (≥5%) instrumented.
- [ ] Design — serif moments correct (§2.4 four-places-only rule).
- [ ] Architect — share page is incremental-static-regenerated; survives a backend restart.
- [ ] Security — public summary contains no PII; merchant data is whatever the user already saw.

---

## Cycle 6 — Hardening (no new user-visible features)

### Acceptance criteria

- [ ] Lighthouse a11y ≥95 on chat page; ≥95 on summary page.
- [ ] Lighthouse performance ≥90 mobile both pages.
- [ ] SSE stream load test: 50 concurrent connections for 10 min, no leaks.
- [ ] Per-tool p95 latency dashboards (Pino logs) — every tool < 1500ms.
- [ ] `/security-review` skill run on full diff; no high-severity findings open.
- [ ] README + deploy guide complete (Vercel + Fly.io); env-var checklist.
- [ ] `usage_log` JSONL emitting per Groq call (ADR-0001 mitigation).
- [ ] Daily `PRAGMA wal_checkpoint(TRUNCATE)` cron (ADR-0004 defence).
- [ ] Open product question Q5 resolved (Groq 100-query stress test, fallback confirmed).

### Reviewers

- [ ] All four PASS.
- [ ] QA: zero open defects from cycle-5 retrospective.

---

## Launch-ready definition

The product is **directly launchable** when, in a single cycle (Cycle 6 or a polish cycle), all four reviewers sign PASS and:

1. Every checkbox above is `[x]`.
2. `docs/walkthroughs/launch.md` — a full manual user-journey walkthrough document — is committed and reflects current behaviour.
3. The orchestrator triggers `/ultrareview` (user-initiated, billed) for an outside-eye review; any high/critical findings are addressed before declaring launch.
4. The user explicitly says "ship it."

The orchestrator stops the autonomous loop on launch-ready and posts a final readiness summary.
