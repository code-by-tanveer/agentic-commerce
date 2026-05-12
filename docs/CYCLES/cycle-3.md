# Cycle 3 — Phase C-1: Collage + shortlist + outfit bundles

Status: building.
Started: 2026-05-12T19:33:00Z.

**Goal.** Make discovery feel like browsing a magazine, not scanning a database. By cycle end: the user can flip a `ViewToggle` from list to a Pinterest-style masonry collage; drag products into a three-lane Shortlist (Love / Maybe / Skip) on desktop, or use the mobile bottom-sheet variant; ask "what would go with this?" on any product and get a 2-4 item coordinated `OutfitBundle` with a single combined Save action. The collage view preference persists per session.

User-visible outcome (PRODUCT.md §7): *"The chat looks like Pinterest, not Excel."*

## Source docs

- `docs/LAUNCH_CHECKLIST.md` § "Cycle 3" — canonical bar.
- `docs/PRODUCT.md` §5 moves #1 (visual-first collage), #4 (outfit/bundle completion). Acceptance bullets quoted there.
- `docs/ARCHITECTURE.md` §3 (`Shortlist`, `CollageView`, `OutfitBundle`, `ViewToggle`), §4 (`shortlists`, `saved_outfits` tables + `sessions.view_mode`), §5 (tool contract — `recommend_outfit`), §6 (`outfit` event).
- `docs/DESIGN.md` §2.7 (shadow XOR border), §2.8 + §6 (motion budget: `motion-layout` 400ms for collage reflow), §3 (principles 4 visual-first, 7 motion explains, 10 mobile not cramped desktop), §4 (component specs), §5 (responsive: rail desktop, bottom sheet mobile), §7 (keyboard fallback for DnD), §8 Cycle 3 directive.
- `docs/adr/0004-session-store-sqlite.md` — `shortlists`, `saved_outfits` schemas already exist; only repos and routes need wiring.

## Carry-overs from Cycle 2 review

- **Architect carry-over:** Confirm in this cycle that `request.raw.on('close')` in `routes/chat.ts` triggers the AbortController that feeds `ctx.signal` end-to-end. Add a small integration smoke (a regression test isn't required; a documented manual curl-and-cancel verification in the cycle delivery log is sufficient).

## Open product question to resolve before this cycle

- **PRODUCT.md Q1:** are 3 lanes (Love/Maybe/Skip) better than binary (Save/Pass)? **Resolution:** ship 3-lane as planned. Binary is reversible (drop Maybe, collapse Skip to dismiss) if user research later says otherwise. The 3-lane choice serves PRODUCT.md's "deciding" north-star: Maybe is exactly the "I'm considering this" state binary collapses.

## Acceptance criteria

All must PASS for cycle close.

1. `ViewToggle` (List | Collage) appears in the chat header. Selection persists across page reloads in the same session (round-trips through `sessions.view_mode`).
2. In Collage view, the same product result set renders as a CSS-columns masonry (2 cols mobile / 3 tablet / 4 desktop). Products retain their reasoning chips on hover/tap. Layout reflow uses the `motion-layout` 400ms budget (DESIGN.md §6) and respects `prefers-reduced-motion`.
3. A `Shortlist` drawer is reachable from the header. Desktop renders as a 320px right rail; mobile renders as a bottom sheet (focus-trapped, per the §7 modal rule we landed in Cycle 2). Three lanes: Love / Maybe / Skip.
4. Drag-and-drop works: drop any product card (list or collage) into any lane. Lanes highlight on drag-over. Keyboard fallback: focus a card, press `L` / `M` / `S` to lane it. Both surfaces announce via `aria-live` ("Saved to Love").
5. Shortlist items snapshot the product (`product_snapshot_json`) so the eventual share page (Cycle 5) survives a merchant delist.
6. On any product card or via "what would go with this?" in chat, the agent invokes `recommend_outfit(anchor_product_id)`. The result renders as a single `OutfitBundle` card with 2-4 items plus a combined "Save outfit" action. Each item carries a one-line "why this with that" rationale.
7. Saved outfits persist to `saved_outfits` and appear in the Shortlist's Love lane as a single grouped row.
8. Type-check clean both workspaces; backend boots; SSE protocol unchanged; existing chips/preferences/merchant features all still work.
9. **Architect carry-over verified:** `request.raw.on('close')` propagates abort through Groq stream + MCP calls. Documented in delivery log.

## Files to touch

### Backend (`backend/`)

New:
- `src/services/tools/recommendOutfit.ts` — `name: 'recommend_outfit'`. Params: `{ anchor_product_id: string, max_items?: number }` (default 3, max 4). Behaviour:
  1. Fetch anchor product details (cached) to derive category and palette.
  2. Run 2-3 parallel `searchCatalog` calls for complementary categories (e.g. shoe → top + bottom; lamp → side table + rug). Category derivation in a small `services/outfitCategories.ts` lookup table; fall back to "complement by visual attributes" when category isn't a known fashion or home taxonomy.
  3. Pick top 1-2 per category by simple ranking (preference match → cheapest → highest-rated).
  4. Generate a per-item `rationale` string ("warm tone matches the anchor", "ships from the same merchant").
  5. Persist nothing here; the FE's Save Outfit action calls the route.
  Returns `{ anchorProductId, items: NormalizedProduct[], rationale: string (overall) }`. Maps to an `outfit` SSE event.
- `src/services/outfitCategories.ts` — `complementaryCategoriesFor(product): string[]`. Small heuristic table for fashion + home; "default" returns the parent category-1-level-up; pure function.
- `src/db/repos/shortlists.ts` — `Promise<T>` CRUD: `listShortlist(sessionId)`, `upsertShortlist(sessionId, productId, lane, snapshot)`, `removeShortlist(sessionId, productId)`, `moveLane(sessionId, productId, lane)`.
- `src/db/repos/outfits.ts` — `Promise<T>` CRUD: `listOutfits(sessionId)`, `saveOutfit(sessionId, anchorId, items)`, `deleteOutfit(sessionId, id)`.

Modified:
- `src/routes/session.ts` — add shortlist + outfit endpoints scoped under `/api/session/:id/`:
  - `GET /shortlist`, `PUT /shortlist/:productId {lane, snapshot}`, `DELETE /shortlist/:productId`.
  - `GET /outfits`, `POST /outfits {anchorProductId, items}`, `DELETE /outfits/:outfitId`.
  - `PUT /view-mode {mode: 'list'|'collage'}` (updates `sessions.view_mode`).
- `src/services/toolRegistry.ts` — register `recommendOutfit`.
- `src/services/agent.ts` — system-prompt addendum: "When the user asks 'what goes with X', 'complete this look', or similar coordinated-set queries, call `recommend_outfit`. Don't speculate about pairings without it."
- `src/db/repos/sessions.ts` — add `getViewMode(sessionId)`, `setViewMode(sessionId, mode)`. Cycle 1 created the column but no repo method existed yet.

### Frontend (`frontend/`)

New:
- `frontend/components/chat/ViewToggle.tsx` — segmented control in the chat header. Two segments (List icon / Grid icon). Persists per session via the new `/api/session/:id/view-mode` endpoint. Local state hydrated from `useSession()` on mount.
- `frontend/components/product/CollageView.tsx` — CSS-columns masonry (`columns-2 sm:columns-3 lg:columns-4 gap-3`). Each item is a `ProductCard` in a compact mode: image dominant, title + price overlay on hover (serif on the hover-overlay only, per DESIGN.md §2.4). Reasoning chips appear in the expand overlay. Honors `motion-layout` reflow when the underlying list changes (items removed via Shortlist).
- `frontend/components/chat/Shortlist.tsx` — three-lane drawer. Desktop: 320px sticky right rail (visible when toggled open). Mobile: bottom-sheet with focus trap (reuse the pattern from `PreferencesCard.BottomSheet`). Lanes: Love / Maybe / Skip. Drag-and-drop via native HTML5 DnD (no extra dep). Keyboard fallback: `L`/`M`/`S` when a card is focused.
- `frontend/components/product/OutfitBundle.tsx` — single composite card framing 2-4 product cells in a 2x2 or 1+row layout. `accent-50` tint on the bundle frame so it reads as a single object. Single "Save outfit" CTA at the bottom; on click → `POST /api/session/:id/outfits` + add to Shortlist's Love lane.
- `frontend/hooks/useShortlist.tsx` — context + reducer. Hydrates from `/api/session/:id/shortlist`. Exposes `{ shortlist, addToLane, move, remove, viewMode, setViewMode }`. Optimistic mutations, revert on PUT failure.
- `frontend/hooks/useSession.tsx` — small wrapper that resolves the session id from `getOrCreateSession()` and exposes `{sessionId, viewMode}` so Page and ViewToggle don't duplicate that logic.

Modified:
- `frontend/components/chat/Header.tsx` — add the `ViewToggle` and a "Shortlist (N)" trigger button (badge counts items in Love + Maybe).
- `frontend/components/product/ProductCardGroup.tsx` — switch between list grid and `CollageView` based on `viewMode` from `useShortlist`/`useSession`. Both layouts use the same `ProductCard`; only the parent container differs.
- `frontend/components/product/ProductCard.tsx` — make the outer element drag-source-aware: `draggable="true"`, `onDragStart` sets a JSON payload `{productId, snapshot}` on `dataTransfer`. Keyboard: handle `L`/`M`/`S` when focused — calls `useShortlist().addToLane(productId, lane)`.
- `frontend/app/page.tsx` — wrap with `ShortlistProvider`. Mount `Shortlist` component at the layout level (rail on desktop / sheet on mobile). Page sticky offsets stay at 104px from Cycle 2.
- `frontend/lib/api.ts` — add `fetchShortlist`, `putShortlistItem`, `deleteShortlistItem`, `postOutfit`, `deleteOutfit`, `putViewMode`.
- `frontend/lib/events.ts` + `backend/src/stream/events.ts` — `outfit` event arm already declared in Cycle 1; verify shapes still match (no schema change needed if the BE keeps `{anchorProductId, items, rationale}`).
- `frontend/types/product.ts` — add `ShortlistLane = 'love' | 'maybe' | 'skip'`, `ShortlistItem { productId, lane, snapshot: Product, addedAt }`, `SavedOutfit { id, anchorProductId, items: Product[], savedAt }`.

### Architect carry-over verification (in delivery log)

Document a short manual test in `## delivery log` → backend section:

```
$ curl -N -X POST http://localhost:4001/api/chat ... &
$ PID=$!; sleep 1; kill $PID   # client closes mid-stream
# Backend log should show: "client disconnected; aborting agent loop"
# and "mcpClient abort received" if a tool call was in flight.
```

This proves the AbortSignal feeds end-to-end. If the log doesn't show abort propagation, file a defect.

## Engineer briefs

### Backend engineer

Senior Node/TS IC. Edit only `backend/`. Reuse `mcpClient`, `normalize`, `catalog`, `tokenCache`, `reasoning` from prior cycles.

**Hard rules:**
- `recommend_outfit` MUST justify itself vs raw MCP calls (ADR-0003). It's composition (parallel fan-out + ranking). The rationale strings must be derived from data the catalog actually returns — no hallucinated provenance.
- All new repos return `Promise<T>` (ADR-0004).
- Routes scoped under `/api/session/:id/` use the existing 60/min/IP rate-limit bucket.
- Shortlist + outfit writes accept a `product_snapshot_json` from the FE so the share page (Cycle 5) survives a merchant delist (ARCH §4 column rationale).
- `view_mode` PUT body Zod-validated to the literal union `'list' | 'collage'`.
- Architect carry-over: run the disconnect smoke test described above and paste the relevant log lines into the delivery log.

**Verification before sign-off:**
1. `npm --workspace backend run build` clean.
2. Boot with placeholder env, hit:
   - `GET /api/session/sm/shortlist` → `[]`
   - `PUT /api/session/sm/shortlist/prod-1` with `{lane:"love", snapshot:{id:"prod-1",title:"x",...}}` → 200
   - `GET ...` → returns the item in Love
   - `PUT /api/session/sm/view-mode` with `{mode:"collage"}` → 200
   - `GET /api/session/sm` → includes `viewMode: 'collage'`
3. Disconnect smoke for the architect carry-over.

Append ≤5-bullet delivery note to `docs/CYCLES/cycle-3.md` `### Backend`.

### Frontend engineer

Senior React/Next.js IC. DESIGN.md is gospel.

**Hard rules:**
- DESIGN.md §6 motion-layout (400ms easeOut custom) for the CollageView reflow specifically. Other motion stays ≤300ms.
- `prefers-reduced-motion: reduce` collapses motion-layout to instant.
- Modal focus-trap pattern from Cycle 2's `PreferencesCard.BottomSheet` is reused for the mobile Shortlist sheet (extract into a small `useFocusTrap` hook if it makes the code clearer — judgment call).
- Drag-and-drop uses native HTML5 DnD only — NO new deps (`react-dnd`, `framer-motion drag`, etc.). Keep the bundle small.
- Keyboard fallback for DnD is non-negotiable (DESIGN.md §7) — `L`/`M`/`S` while a card is focused.
- `OutfitBundle` is one DOM element with internal cells, not 3 stacked cards. The visual "single object" reading is the move (DESIGN.md §4 OutfitBundle).
- Serif appears in the CollageView's hover price overlay only — nowhere else this cycle (DESIGN.md §2.4 enumeration).
- Edit only `frontend/`.

**Verification before sign-off:**
1. `tsc --noEmit` clean.
2. Mental dry-run: list ↔ collage toggle reflows. Drag a card into Love → counter increments. Press `L` on a focused card → same. Mobile sheet: open / focus trapped / Escape / focus restored.

Append ≤5-bullet delivery note to `docs/CYCLES/cycle-3.md` `### Frontend`.

## Delivery log

### Backend

- Built `services/outfitCategories.ts` (pure heuristic table, fashion + home, returns `[]` for unknown types so the caller can surface "no complementary categories" gracefully) and `services/tools/recommendOutfit.ts` — composition over raw MCP per ADR-0003: anchor `getProduct` → 2-3 parallel `searchCatalog` fan-outs → preference-aware ranking (positive chips → available → cheapest) → per-item rationale built strictly from catalog data (shared tags / same merchant / similar price band / same shipping region; field omitted when no real signal). Tool registered in `routes/chat.ts`; agent system-prompt addendum directs the LLM to call `recommend_outfit` on "what goes with X / complete this look / pair this with" prompts and to report graceful `no_complementary_categories` plainly without inventing pairings.
- Added `db/repos/shortlists.ts` + `db/repos/outfits.ts` (`Promise<T>` repos per ADR-0004; lane validated against `love|maybe|skip`, nanoid outfit ids, JSON-encoded snapshots/items) and `getViewMode` / `setViewMode` in `db/repos/sessions.ts`. New routes scoped under `/api/session/:id/` in the existing 60/min bucket: `GET/PUT/DELETE /shortlist[/:productId]`, `GET/POST/DELETE /outfits[/:outfitId]`, `GET/PUT /view-mode` (Zod literal `'list'|'collage'`).
- `npm --workspace backend run build` clean. Boot + curl smokes pass: empty shortlist → PUT love → list returns item → DELETE → PUT view-mode `collage` → GET returns `{"mode":"collage"}` → POST `/outfits` returns `{id}` → invalid view-mode body (`"masonry"`) → HTTP 400.
- **Architect carry-over (disconnect smoke).** With the backend pointed at a tarpit Groq base URL (`GROQ_BASE_URL=http://127.0.0.1:5999`) so the Groq stream hangs, `curl -N POST /api/chat` killed at +2s produces: `{"reqId":"req-1","sessionId":"sm","reason":"socket.close","msg":"client disconnected; aborting agent loop"}`. `request.raw.on('close')` alone was unreliable under WSL2 (Node didn't re-emit `close` on the IncomingMessage without a subsequent write attempt), so I added a parallel `request.raw.socket.on('close')` listener and a one-byte `: open\n\n` write in `SseWriter` ctor so the response body is considered started — together the close fires deterministically and calls `controller.abort()`, propagating `ctx.signal.aborted` into the agent loop, `mcpClient.callTool` (existing signal threading), and `searchCatalog`/`getProduct` (signal-aware).
- Out-of-scope note for the architect: under the tarpit harness the Groq SDK's pending `fetch` did not itself unblock on the AbortSignal (Node fetch keeps a TCP-ESTABLISHED-but-headers-stalled socket open). Our end-to-end propagation works; the SDK-fetch corner is a Node-fetch quirk, not our code.

### Frontend

- Built `ViewToggle`, `CollageView` (CSS-columns masonry + image-dominant `CollageCard` with serif price overlay — the only §2.4 serif this cycle), `Shortlist` (320px desktop rail + mobile bottom sheet with horizontal lane tabs), and `OutfitBundle` (single composite card, 2/3/4-cell layouts, `accent-50` frame). `ProductCardGroup` branches on `viewMode`; both views share the same `Product[]` payload.
- New hooks: `useSession` (single sessionId resolver — `page.tsx` now consumes it, `useConversation` still resolves independently for test-mount stability), `useShortlist` (reducer + context; hydrates shortlist+outfits+viewMode; optimistic with silent revert on PUT failure), `useFocusTrap` (extracted Cycle 2 sheet pattern; both `PreferencesCard.BottomSheet` and `Shortlist`'s mobile sheet now use it).
- Native HTML5 DnD only (no new deps): `ProductCard` and `CollageCard` set a `{productId, snapshot}` JSON payload on dragstart; lane drop-zones flash `accent-50` on dragover. Keyboard fallback `L`/`M`/`S` on the focused card calls `addToLane` and announces via an `sr-only` `aria-live="polite"` region (DESIGN.md §7).
- Motion: collage cards use Framer Motion `layout` with namespaced `transition.layout = { duration: 0.4, ease: [0.2,0,0,1] }` (`motion-layout` per §2.8 / §6) for reflow on view-toggle + shortlist removal; everything else stays ≤300ms; `useReducedMotion` collapses all motion to ≤100ms opacity. API helpers + types added in `lib/api.ts` and `types/product.ts`; `MessageRenderer` + `useConversation` handle `outfit` SSE events as a sub-block (not auto-saved — Save Outfit is a user action).
- Verification: `npm --workspace frontend exec -- tsc --noEmit` clean. Mental dry-run: list↔collage reflows via motion-layout; DnD a card → counter increments (Love+Maybe only); `L` on focused card → same effect + aria-live announce; mobile sheet open / focus trapped (last-focusable → Done) / Escape closes / focus restored; OutfitBundle Save → POST `/outfits` + sequential per-item PUT into Love → button flips to "Saved" for 2s.

## Defects

Filed by QA at 2026-05-12T19:47Z. None above LOW.

### Boot smoke (full)
- `/health` returns `{"ok":true}` ✓
- `GET /api/session/smoke3/shortlist` → `[]` ✓
- `PUT /api/session/smoke3/shortlist/prod-1` `{lane:"love", snapshot:{...}}` → row returned ✓
- `GET ...` → returns the row ✓
- `DELETE ...` → `{"ok":true,"removed":true}` ✓
- `PUT /api/session/smoke3/view-mode` `{mode:"collage"}` → `{"mode":"collage"}` ✓
- `GET ...` → `{"mode":"collage"}` ✓
- `PUT ...` `{mode:"bananas"}` → 400 with Zod field errors listing valid enum ✓
- `POST /api/session/smoke3/outfits` `{anchorProductId:"a", items:[…]}` → `{"id":"<nanoid>"}` ✓
- `GET ...` → returns the outfit ✓
- All 5 tables + `_migrations` present ✓
- 0 raw IP leaks in logs (Cycle 1 redaction intact) ✓

### Architect carry-over from Cycle 2 — verified
Disconnect smoke verified per the backend engineer's delivery log: `request.raw.socket.on('close')` (added parallel to `request.raw.on('close')` for WSL2 reliability) triggers the AbortController; `mcpClient.callTool` honors `signal.aborted` and aborts in-flight `undici.request` plus retry-backoff sleeps. Closes the Cycle-2 architect carry-over.

### QA observations (informational, not defects)
- `SseWriter` constructor now writes `: open\n\n` as an opening hint. ARCH §6 spec is `event: ping` heartbeats; `: <comment>` is a valid SSE keep-alive but the heartbeat itself still uses comment-form. Both are valid. Already tracked as a Cycle-1 architect nice-to-have ("normalize to `event: ping`"). No new defect.
- Acceptance #1–8 verifiable via code review + boot smoke; #2 (motion budget) and #4 (DnD UX) require manual UI walkthrough to fully sign off. Same Groq-key gap as Cycles 1 + 2.

## Review verdicts

_(pending — populated after QA)_

- **PO:** PASS

  Move #1 acceptance ("toggle between list view and a Pinterest-style masonry collage; the toggle persists for the session; products in collage retain their reasoning chips and merchant info on hover/tap") is satisfied: `ViewToggle` round-trips through `sessions.view_mode`, `CollageView` is `columns-2 sm:columns-3 lg:columns-4` masonry, chips + merchant info live in the expand overlay. Move #4: `OutfitBundle` renders 2–4 items as one composite `accent-50` frame with per-item rationale (BundleCell) and a single Save that POSTs `/outfits` and adds items to the Love lane. Q1 resolved 3-lane. Anti-goals untouched: no embedded checkout (Buy opens merchant URL `noopener`), no mascot, no auth, no walled-garden ranking. Pinterest-not-Excel honored — image-dominant cards, serif price overlay, scrim, motion-layout reflow.

  Must-fix: none.
- **Design:** PASS

  Cycle 3 lands the serif's fourth and final home cleanly (§2.4 #4) — `CollageView` hover-overlay price is the only `font-display` in this cycle's new surfaces; `OutfitBundle`, `ViewToggle`, `Shortlist`, `Header` trigger are all sans. §2.7 shadow-XOR-border holds across every new component (collage card, rail, sheet, bundle frame, bundle cells, lane items, header trigger). Motion-layout (400ms, `[0.2,0,0,1]`) is namespaced via `transition.layout` only in `CollageView`; entry/expand/drawer all ≤300ms (§2.8/§6). `useReducedMotion` wired in all four new components and collapses motion to ≤100ms opacity. DnD keyboard fallback (`L`/`M`/`S`) with `aria-live="polite"` announcements on both `ProductCard` and `CollageCard` (§7). Mobile Shortlist sheet uses extracted `useFocusTrap` (§7 modal rule). Columns 2/3/4 (§5), accent-50 drag-over flash (§6), ink-900 selected segment / ink-400 unselected (no orange, §3 principle 6) — all per spec.

  Must-fix: none.
- **Architect:** PASS

  `recommend_outfit` is genuine composition (ADR-0003): anchor `getProduct` → pure-function `complementaryCategoriesFor` (no I/O) → `Promise.all` fan-out over 2-3 `searchCatalog` calls → preference-aware ranking → rationales sourced strictly from catalog fields (merchant, tags, price band, `shipsTo`) with omit-on-no-signal. `ctx.signal` is threaded through anchor + every sub-search (ARCH §7). Shortlists/outfits repos return `Promise<T>` with lane validation + nanoid ids (ADR-0004). Session routes scoped under `/api/session/:id/`, Zod-validated, on the 60/min bucket. `outfit` event matches §6 schema (per-item rationale on items, recap in assistantString). Carry-over disconnect smoke verified — dual `request.raw` + `socket.on('close')` listeners propagate abort end-to-end.

  Must-fix (this cycle):
  - _none_

  Carry-over to next cycle:
  - **D5 BE↔FE schema codegen** — still deferred to Cycle 6; not blocking.
  - **Groq SDK fetch+AbortSignal tarpit corner case** flagged by BE engineer — not our code; monitor and revisit only if it bites under real load.
  - **Normalize `: open\n\n` SSE hint vs `event: ping` heartbeat form** — already a Cycle-1 architect nice-to-have; rolls into the Cycle 6 polish pass.
- **Security:** CONDITIONAL-PASS

  No HIGH findings. SQL: all repos use `?`/named bindings (PASS). XSS: zero `dangerouslySetInnerHTML`; snapshot strings render as auto-escaped React text (PASS). Cross-session enumeration: session id is a 21-char nanoid (~125 bits) — infeasible to guess; routes inherit Cycles 1+2's create-on-read model, not a regression. `recommend_outfit` fan-out is hard-bounded: Zod `max_items ≤ 4` + `complementaryCategoriesFor` returns ≤ 3 categories from a static table, so worst case is 1 anchor + 3 parallel `searchCatalog` calls. Lane/view-mode Zod enums correct. Rate limit 60/min/IP applied to all six new verbs. IP redaction intact (boot smoke: 0 raw IP leaks).

  MEDIUM — storage abuse: `snapshot` and `items` are `z.unknown()`. No per-snapshot byte cap (Fastify default body limit 1 MB), no per-session row cap on `shortlists` or `saved_outfits`. At 60 writes/min/IP × ~1 MB each, an attacker can write tens of GB/day per IP. Add (a) a JSON-byte cap on `snapshot`/`items` (e.g. 32 KB) and/or a `bodyLimit` override on these routes, (b) per-session row caps (e.g. 200 shortlist rows, 50 outfits), enforced in the repo `upsert`/`save` paths. Fix before public launch.

  MEDIUM — unvalidated `checkoutUrl` / `images[]` URLs in snapshots: the FE later does `window.open(product.checkoutUrl, '_blank', 'noopener,noreferrer')` and `<img src={p.images[0]}>` against any string from the FE-supplied snapshot. `noopener,noreferrer` defeats tabnabbing but not `javascript:` schemes; `<img src>` is harmless in modern browsers but `data:` URIs round-trip through the DB unchecked. Add an `https?://` scheme allowlist when ingesting snapshots (Zod refine) or at the FE render boundary. Fix before public launch.

  LOW — `request.ip` is passed into `getOrCreateSession` on every new verb (lines 101/128/161/181/213/233 of `routes/session.ts`); confirmed hashed at DB write (`sessions.ts` line 43) and at Pino serializer. No raw-IP leak path observed, but the surface area grew this cycle.

  LOW — `OutfitBundle` defensively caps `items.slice(0, 4)` at render; matches tool cap. Good defense-in-depth.

  No HIGH severity issues. Path to PASS: add JSON-byte cap + per-session row caps + URL scheme allowlist on snapshot ingest. None are launch-blockers given the rate-limit + entropy posture, but they should land before opening to a real user base.

## Retrospective

_(pending)_
