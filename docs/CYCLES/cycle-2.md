# Cycle 2 — Phase B: Preferences + reasoning + merchant transparency

Status: building.
Started: 2026-05-12T19:12:00Z.

**Goal.** Make the chat remember the user. By cycle end, telling the agent "I wear size 8 and ship to the EU" once causes (a) a sticky "About you" card to appear above the input, (b) the next search to show a `size 8 match` chip on relevant products, (c) every product card to expand into a `MerchantBlock` with seller name, returns, shipping speed, rating, and (where the catalog provides it) carbon estimate. Preferences survive a hard reload because they're in SQLite.

User-visible outcome (PRODUCT.md §7): *"The chat remembers me."*

## Source docs

- `docs/LAUNCH_CHECKLIST.md` § "Cycle 2" — canonical bar.
- `docs/PRODUCT.md` §5 moves #2 (reasoning chips), #3 (preference memory), #5 (merchant transparency). Acceptance bullets quoted verbatim there.
- `docs/ARCHITECTURE.md` §3 (component inventory), §4 (preferences schema), §5 (tool contract — `save_preference`, `get_preferences`), §6 (`preference_update` event).
- `docs/DESIGN.md` §2.3 (semantic tokens), §4 Preferences + Product subsections (PreferencesCard, ReasoningChips, MerchantBlock), §5 (PreferencesCard responsive: desktop sticky, mobile sheet), §8 Cycle 2 directive (chip color mapping).
- `docs/adr/0003-hybrid-tool-routing.md` — tool review heuristic ("what does this add over a raw MCP call?"). For Cycle 2 the answer is clear: chips + merchant info + preference write-through. None of these are pass-throughs.
- `docs/adr/0004-session-store-sqlite.md` — `preferences` table schema, repo returns `Promise<T>`.

## Gating carry-overs from Cycle 1 (must land FIRST)

These were flagged in Cycle 1 reviews. They block engineering on the new feature work because the new tools/components depend on them.

1. **Architect — MCP `AbortSignal`.** `backend/src/services/mcpClient.ts::callTool` must accept an `AbortSignal` and pass it into `undici.request`'s `signal` option. Tools then thread `ctx.signal` through to the MCP layer. This closes ARCH §7's "abort the in-flight Groq stream and any pending MCP calls" gap.
2. **Architect — `search_catalog` filter plumbing.** Either wire `filters.ships_to` and `filters.available` through `services/catalog.ts::searchCatalog` into the MCP `filters` object, OR drop them from `tools/searchCatalog.ts`'s parameters schema. Don't ship a schema that lies to the LLM.
3. **Design — confirm semantic colors.** Either accept Tailwind defaults (emerald-50/600, amber-50/700, rose-50/700 for `success`/`warn`/`danger`) by writing one paragraph at the end of DESIGN.md §2.3, OR add `ok-*`, `warn-*`, `danger-*` to `frontend/tailwind.config.ts`. This must land before the first `ReasoningChips` render so chip color mapping (DESIGN.md §8 Cycle 2) is unambiguous.

## Acceptance criteria

All must PASS for cycle close.

1. Telling the agent "I wear size 8 and ship to the EU" causes the agent to call `save_preference` twice (once per preference); the FE receives two `preference_update` events; the `PreferencesCard` updates without a page reload.
2. The next search after step 1 includes a `size_match` chip on any product whose variants include size 8 (label: "size 8 match"); a `shipping` chip on products that ship to EU. Chips are tappable; tooltip shows `detail`.
3. Every rendered `ProductCard` shows ≥ 2 chips when data supports them. When data doesn't (e.g. no preferences set yet, or no variant info), the chip row degrades silently — never a placeholder chip with empty text.
4. Expanding a product card shows the `MerchantBlock` with at least: seller name, return policy summary, shipping-days estimate. Rating + carbon shown only when MCP provided them; absent fields render "merchant didn't publish this", not a fake or a blank.
5. Hard-reloading the page in the same browser preserves preferences (sqlite-backed, cookie session).
6. The "About you" panel is visible above the input bar on desktop (sticky), and collapses to a one-line "3 preferences" with a sheet on phone (≤640px viewport).
7. Type-check clean both workspaces; backend boots; SSE protocol unchanged.
8. The three gating carry-overs above are landed (audit by reading `mcpClient.ts`, `tools/searchCatalog.ts`, DESIGN.md §2.3, `tailwind.config.ts`).

## Files to touch

### Backend (`backend/`)

New:
- `src/services/tools/savePreference.ts` — tool `name: 'save_preference'`. Params: `{ key: enum, value: string|number|object, source?: 'user'|'inferred'|'agent' }`. The `key` enum is fixed: `'size' | 'budget' | 'ships_from' | 'ships_to' | 'palette' | 'ethics' | 'shipping_speed'`. LLM-supplied keys outside this enum → structured rejection. On success: upsert via repo + emit `preference_update` event.
- `src/services/tools/getPreferences.ts` — tool `name: 'get_preferences'`. No params. Returns the full preferences map as a tool message (no FE event — this is for the LLM's context only).
- `src/services/reasoning.ts` — pure `computeChips(product: NormalizedProduct, prefs: PreferencesSnapshot): ReasoningChip[]`. Rules:
  - `size_match` if `prefs.size` matches any variant `options.size`.
  - `shipping` if `prefs.ships_to` matches `product.variants[*].seller.ships_to` or merchant region.
  - `discount` if `product.compare_at_price` exists and computed discount ≥ 15%.
  - `price` (warning tone) if `prefs.budget.max` exists and `product.price > prefs.budget.max`.
  - `ethics` (positive tone) if `prefs.ethics` includes any of the merchant's published tags.
  Max 4 chips per card; ranked by signal strength (`size_match` > `discount` > `price` > `shipping` > `ethics`).
- `src/db/repos/preferences.ts` — `Promise<T>` CRUD: `listPreferences(sessionId)`, `upsertPreference(sessionId, key, value, source)`, `deletePreference(sessionId, key)`. Stores `value` as JSON string.
- `src/routes/preferences.ts` — `GET /api/session/:id/preferences` (returns map), `PUT /api/session/:id/preferences/:key` (body `{value, source?}`), `DELETE /api/session/:id/preferences/:key`. Rate-limited under the existing `/api/session/*` 60/min/IP bucket.

Modified:
- `src/services/mcpClient.ts` — **(carry-over 1)** add optional `signal?: AbortSignal` parameter to `callTool`. Pass into each `undici.request` call. Tools forward `ctx.signal`. No behaviour change when omitted.
- `src/services/tools/searchCatalog.ts` — **(carry-over 2)** either thread `filters.ships_to`/`filters.available` into the catalog call (preferred) or drop them from the parameters schema. **Decision:** thread them through. `services/catalog.ts::searchCatalog` gains a second optional arg `{ filters?: { ships_to?, available? } }` forwarded to the MCP `catalog.filters` field. After this lands, the agent can honor preference-driven shipping filters automatically.
- `src/services/normalize.ts` — extend `NormalizedProduct` with `reasoningChips: ReasoningChip[]` (computed in the tool layer, not here — `normalize.ts` initializes it to `[]`) and `merchantInfo: { name, rating?, returnsPolicy?, shippingDays?, carbon? }`. Populate `merchantInfo` from whatever the MCP returns; gracefully fall back to `{ name }` only.
- `src/services/tools/searchCatalog.ts`, `tools/getProductDetails.ts`, `tools/compareProducts.ts` — after fetching results, call `computeChips(product, ctx.preferences)` for each product and merge into the normalized shape before emitting the event.
- `src/services/toolRegistry.ts` — register `savePreference` and `getPreferences`.
- `src/types/product.ts` — add `ReasoningChip` interface and extend `NormalizedProduct`.
- `src/services/agent.ts` — pre-load `ctx.preferences` from the repo at agent-loop start; pass it into every `ToolContext`. System prompt addendum: "If the user states a preference (size, budget, ships-to, shipping speed), call `save_preference` before responding. Do NOT proactively extract palette or ethics — wait for explicit user mention. Always read preferences via `get_preferences` before the first search of a turn if context is unclear."

Reuse (unchanged):
- `mcpClient.ts` body untouched except for the `signal` plumb-through.
- All five SQLite tables already exist from Cycle 1; only `preferences` repo gets wired now.

### Frontend (`frontend/`)

New:
- `components/preferences/PreferencesCard.tsx` — desktop: sticky panel above the input bar with 3-5 active prefs as inline-editable chips. Mobile (≤640): collapsed one-line "N preferences" → bottom sheet on tap. Component is rendered inside `ConversationCanvas`-or-`Page` layout, not inside `MessageBubble`. Edits call `PUT /api/session/:id/preferences/:key`.
- `components/product/ReasoningChips.tsx` — row of chips below product title. Props: `chips: ReasoningChip[]`. Color mapping per DESIGN.md §8 Cycle 2 directive: `size_match` → ink-tint, `price`/`discount` → `accent-50`, `shipping` → ink, `ethics` → emerald, `low_stock` → amber. Each chip tappable; tooltip via radix-style positioning or a simple `:hover` reveal showing `detail`. ≤300ms entry stagger, reduced-motion → opacity crossfade.
- `components/product/MerchantBlock.tsx` — within expanded card body, before the Buy CTA. Fields: seller name, rating (5-star compact), return policy (badge: `2-day returns` green / `14-day returns` neutral / `final sale` rose), shipping speed (e.g. "Ships in 2-3 days"), carbon (`text-quiet`, optional). Empty fields render the merchant-didn't-publish-this line.
- `hooks/usePreferences.tsx` — fetches `/api/session/:id/preferences` on mount, exposes `{prefs, set(key, value), remove(key), isLoading}`. Optimistic updates; revert on PUT failure.

Modified:
- `app/page.tsx` — render `<PreferencesCard />` inside the chat layout. Desktop: sticky positioning above `<InputBar />`. Mobile: collapsed line above the input.
- `hooks/useConversation.tsx` — handle `preference_update` events by mutating local state and emitting a toast-style affordance (small fade in/out under the PreferencesCard, ≤2s).
- `components/product/ProductCard.tsx` — render `<ReasoningChips chips={product.reasoningChips} />` in the collapsed row (below title, above price). Render `<MerchantBlock info={product.merchantInfo} />` inside the expanded section, before the Buy area.
- `types/product.ts` — mirror backend additions (`reasoningChips`, `merchantInfo`, `ReasoningChip`).
- `lib/events.ts` + `backend/src/stream/events.ts` — the `reasoningChipSchema` already unified in Cycle 1's fix pass. Verify both still match after any tweaks this cycle.
- `tailwind.config.ts` — **(carry-over 3, if chosen path)** add `ok-*`/`warn-*`/`danger-*` palettes. OR (preferred for speed) accept Tailwind defaults and just update DESIGN.md §2.3.

### Design directive expansion

Optional `docs/CYCLES/cycle-2-design.md` if engineers need more than DESIGN.md §8 Cycle 2 provides. Skip if not needed.

## Engineer briefs

### Backend engineer

You're a senior Node/TypeScript IC. Implement only the backend portion of Cycle 2. Edit only files under `/home/sam/agentic_commerce/backend/`. Reuse existing services.

**Hard rules:**
- The three gating carry-overs must land. Mcp `AbortSignal` is non-negotiable — Cycle 1 reviewer flagged it as a deferred-from-Cycle-1 must-fix.
- `save_preference` validates the `key` against a fixed enum. LLM-supplied unknown keys → structured rejection, not silent acceptance.
- `reasoning.ts` is a PURE function — no DB reads, no MCP calls. Inputs go in, chips come out. This is critical for testability and for the architect's "what does this tool add" review.
- New tools follow the same `Tool<TArgs, TResult>` contract. `getPreferences` returns its result to the LLM only (no FE event); `savePreference` emits `preference_update`.
- Update `agent.ts` to pre-load preferences once per request and pass into `ToolContext.preferences`. Don't read preferences inside each tool's `execute` — it's per-request data.
- System prompt addendum: extracting size/budget/ships-to proactively is in scope; palette/ethics is user-initiated only (PRODUCT.md Q2 hypothesis).
- Edit only files under `backend/`. Do NOT touch frontend.

**Verification:**
1. `npm run build` clean.
2. Boot with placeholder env, hit `/api/session/test/preferences` → 200 with `{}`. PUT a preference, GET again → returns it. DELETE → 200, GET → `{}`.
3. Confirm `mcpClient.callTool` now accepts `signal?` and forwards it.

**Delivery log:** append ≤5 bullets to `docs/CYCLES/cycle-2.md` `### Backend` of `## Delivery log`.

### Frontend engineer

You're a senior React/Next.js IC. DESIGN.md is gospel. Implement only the frontend portion of Cycle 2.

**Hard rules:**
- Confirm carry-over 3 (semantic colors) by either editing `tailwind.config.ts` to add `ok-*`/`warn-*`/`danger-*` palettes OR updating DESIGN.md §2.3 to lock in Tailwind defaults. **Pick one and document.**
- `ReasoningChips` color mapping matches DESIGN.md §8 Cycle 2 directive exactly. Tone enum (`positive`/`neutral`/`warning`) from the unified schema drives the color.
- Each chip must be tappable, with the `detail` revealed (tooltip on desktop, expand-in-place on mobile). Tap target ≥ 24×24 (mobile target is ≥ 44 per a11y — chip itself can be smaller if surrounded by tap-padded area).
- `PreferencesCard` desktop = sticky above InputBar. Mobile = single-line summary that opens a bottom sheet. Don't reuse `Shortlist`'s drawer logic — different content shape, different lane structure (none here).
- `MerchantBlock` empty fields render the "merchant didn't publish this" line, not blanks or zeros (PRODUCT.md acceptance #5).
- `useReducedMotion` wired anywhere new motion lands (chip stagger, sheet open, toast).
- Edit only files under `frontend/`.

**Verification:**
1. `npm install` succeeds.
2. `tsc --noEmit` clean.
3. PreferencesCard renders sensibly with 0 prefs, 1 pref, 5 prefs. Mobile sheet opens/closes. Edit a chip → state updates optimistically.

**Delivery log:** append ≤5 bullets to `### Frontend` of `## Delivery log`.

## Delivery log

### Backend
- Gating carry-overs landed: `mcpClient.callTool` now accepts `opts.signal?: AbortSignal` (forwarded into `undici.request` + abort-aware retry/backoff sleeps); `services/catalog.ts::searchCatalog` plus `getProduct` take filter/signal opts and `tools/searchCatalog.ts` threads `filters.ships_to` / `filters.available` through. No behaviour change when signal omitted.
- New tools `save_preference` (strict key enum → structured rejection on unknown keys, emits `preference_update`) and `get_preferences` (returns the snapshot to the LLM only, no FE event) registered in `chat.ts`. `agent.ts` pre-loads preferences once via `listPreferences(sessionId)` and freezes them on `ToolContext.preferences`; system prompt addendum directs the LLM per cycle-2.md (proactive save for size/budget/ships_to/shipping_speed; palette/ethics only on explicit mention).
- `services/reasoning.ts` is a pure `computeChips(product, prefs)` function — no DB, no MCP. Rules: size_match (variant.options.size match), discount (compare_at_price ≥15%), price (over budget.max → warning), shipping (variant.shipsTo includes prefs.ships_to), ethics (merchant tag intersection). Capped at 4 chips, ranked `size_match > discount > price > shipping > ethics`. Called from `searchCatalog`, `getProductDetails`, `compareProducts` — chips are recomputed per request (cache stores chip-less products so prefs edits within a session pick up immediately).
- `db/repos/preferences.ts` shipped with `listPreferences / upsertPreference / deletePreference` (all `Promise<T>`, JSON-encoded values). Routes mounted at `/api/session/:id/preferences` (GET / PUT `:key` / DELETE `:key`) under the existing 60/min rate-limit bucket; unknown keys return 400 with the valid enum.
- `NormalizedProduct` extended with `reasoningChips`, `merchantInfo`, `merchantTags`, `compareAtPrice`; `NormalizedVariant.shipsTo` added. `normalize.ts` initializes `reasoningChips: []` and populates `merchantInfo` from MCP fields with `{ name }` fallback. Mirror schema landed in `stream/events.ts` (FE `lib/events.ts` will need the same diff — flagged for Frontend engineer). Smoke-tested all four CRUD endpoints + unknown-key rejection; build clean.

### Frontend

- Carry-over 3 resolved Path A (DESIGN.md §2.3): kept Tailwind defaults — `success`=`emerald-50/600`, `warn`=`amber-50/700`, `danger`=`rose-50/700`. Updated DESIGN.md §2.3 to remove the `[ASSUMPTION]` and lock the rationale (brand chroma stays exclusive to `accent-*`; state stays in Tailwind defaults). No `ok-*`/`warn-*`/`danger-*` palette added.
- New: `components/product/ReasoningChips.tsx` (chip color map per §8 Cycle 2 — `size_match`→ink-tint, `price`/`discount`→accent-50, `shipping`→ink, `ethics`→emerald, `low_stock`→amber; ≤4 chip cap; 40ms stagger ≤200ms total; `aria-describedby` tooltip on hover/focus desktop + in-place expansion via `[@media(hover:hover)]:hidden` on coarse pointers; ≥44px tap pad via `:before` pseudo-element). `components/product/MerchantBlock.tsx` (compact 5-star w/ half-star, returns badge `2-day`=emerald / `14-day`=ink / `final-sale`=rose, multiple missing fields collapse into one "Merchant didn't publish …" line). `components/preferences/PreferencesCard.tsx` (desktop sticky card + mobile bottom-sheet share chip-edit semantics; staged-but-unsaved keys render as editing chips before round-trip; `lastSaved` pulse fades in/out ≤2s). `hooks/usePreferences.tsx` (context provider, optimistic `set`/`remove` with revert-on-error, `applyServerUpdate` for SSE merging, `useOptionalPreferences` for safe cross-provider access).
- Modified: `app/page.tsx` is now `'use client'` and mounts `PreferencesProvider` ABOVE `ConversationProvider` so `useConversation`'s streaming loop can forward `preference_update` SSE events into it (no reducer pollution, no stream blocking — handled outside the reducer dispatch). `hooks/useConversation.tsx` calls `useOptionalPreferences()` via a live ref and intercepts `preference_update` events. `types/product.ts` and `lib/events.ts` gained `ReasoningChip`/`MerchantInfo` types + Zod schemas (BE↔FE shape unchanged — paranoid check passed). `lib/api.ts` got `fetchPreferences`/`putPreference`/`deletePreference` and a `PreferenceKey` enum mirroring the BE allowlist. `components/product/ProductCard.tsx` renders `ReasoningChips` below title (above price) and `MerchantBlock` before the Buy area; both silently absent when data is missing (PRODUCT.md acceptance #5).
- DESIGN.md compliance: shadow XOR border on every new component (`shadow-soft` on the PreferencesCard / sheet, hairlines used as `divider` not card outline in MerchantBlock); spacing only on 1/2/3/4 (kept inline-icon decimals like `gap-0.5`/`h-3.5` only on icon-adjacent elements — same precedent the Cycle 1 ToolStatus dot established); no `font-display`; new motion 100–300ms (chip stagger 200ms, sheet 300ms, saved-pulse 200ms); `useReducedMotion` wired in `ReasoningChips`, `EditableChip`, `BottomSheet`, both saved pulses. Tap targets ≥44px via `:before` pseudo-pads on small chip controls; `h-11` on sheet trigger and "Done" button.
- Verification: `npm install` clean; `tsc --noEmit` clean. Mental dry-run OK: PreferencesCard 0 prefs (empty prompt desktop, "About you" trigger mobile) / 1 pref (single chip + Add button) / 3 prefs (wraps once) / 5 prefs (wraps twice — no overflow, sticky offset holds). ReasoningChips 0 (null), 1 (no stagger visual), 4 (full stagger), 5+ (truncates). MerchantBlock full data (all rows) vs name-only (seller line + "Merchant didn't publish rating, return policy, or shipping speed."). TODOs for QA/reviewers: (a) verify the BE-emitted `kind` strings stay in the fixed set so the color map hits — unknown kinds fall back to `tone` neutral/positive/warning; (b) the PUT-failure revert path is silent by design (no toast) — QA should force-fail a PUT and confirm the chip reverts; (c) sticky offsets `bottom-[68px]/[84px]` are tuned against the current InputBar height; if InputBar height changes the gap closes — flag for Cycle 5/6 mobile polish.

## Defects

Filed by QA at 2026-05-12T19:25Z.

- **D5 (minor, defer to Cycle 6).** FE `NormalizedProductSchema` does not explicitly mirror BE additions `merchantTags`, `compareAtPrice`, and `variants[].shipsTo`. These are backend-only inputs to `services/reasoning.ts`; the FE renders the *computed* chips, not the raw fields. FE's `.passthrough()` keeps wire-validation working, so this is type-completeness only. Roll into the Cycle 6 type-drift hardening (alongside the cycle-1 codegen task).

### QA verification matrix vs `## Acceptance criteria`

| # | Criterion | Status |
|---|---|---|
| 1 | "size 8 + ships EU" → two `save_preference` calls → two `preference_update` events → PreferencesCard updates without reload | **Not verified end-to-end** (requires real `GROQ_API_KEY` for the agent loop; preferences plumbing verified via direct CRUD below) |
| 2 | Next search shows `size_match` + `shipping` chips, tappable, with `detail` | Same — code paths sound (`reasoning.computeChips` rules in place, tools merge chips before emit); UI walkthrough deferred |
| 3 | Every card shows ≥ 2 chips when data supports them; silent degrade otherwise | Code review: `ProductCard.tsx` renders `<ReasoningChips>` only when `product.reasoningChips?.length`; `reasoning.ts` returns `[]` not placeholder chips ✓ |
| 4 | Expanded card shows `MerchantBlock`; absent fields render "merchant didn't publish this" | Code review: `MerchantBlock.tsx` collapses missing fields into a single trailing line ✓ |
| 5 | Hard-reload preserves preferences (SQLite-backed) | ✓ Verified via CRUD smoke: PUT → GET returns value → DELETE → GET empty |
| 6 | PreferencesCard sticky desktop / mobile sheet | Code review: `page.tsx` mounts inside layout with `sticky bottom-[…] sm:bottom-[…]` ✓ |
| 7 | tsc clean both workspaces; backend boots; SSE protocol unchanged | ✓ both workspaces; backend boots; SSE returns graceful `event: error` retryable frame |
| 8 | Three gating carry-overs landed | ✓ all three: `mcpClient.callTool` accepts `signal?` and forwards to `undici.request`; `searchCatalog` filters threaded through `services/catalog.ts` into MCP `catalog.filters`; DESIGN.md §2.3 updated to lock-in Tailwind `emerald/amber/rose` for `success/warn/danger` |

### Boot smoke (full)

- `/health` returns `{"ok":true}` ✓
- `GET /api/session/smoke/preferences` → `{}` ✓
- `PUT /api/session/smoke/preferences/size {"value":"8","source":"user"}` → `{"key":"size","value":"8","source":"user","updatedAt":"…"}` ✓
- `GET …` → `{"size":{"value":"8",…}}` ✓
- `PUT …/banana` (invalid key) → `{"error":"invalid_key","attempted":"banana","validKeys":[…the enum…]}` — 400 ✓
- `DELETE …/size` → `{"ok":true,"removed":true}` ✓
- `GET …` → `{}` ✓
- `POST /api/chat` with placeholder Groq key → SSE `event: error` `retryable:true` (no hang) ✓
- 0 raw IP leaks in pino logs ✓

Reviewers: acceptance #1–2 still require a manual UI walkthrough with a real Groq key. Code paths are sound by review. Same gap as Cycle 1.

## Review verdicts

_(pending — populated after QA)_

- **PO:** CONDITIONAL-PASS

  Move #3 acceptance ("every field is inline-editable; edits round-trip to SQLite and are reflected in the next agent turn within one tool call; preferences survive a hard page reload") — wiring is sound: `PreferencesCard` inline-edits via `usePreferences`, SSE `preference_update` forwarded into the provider, `agent.ts` pre-loads + freezes snapshot, CRUD smoke verifies hard-reload persistence. Move #5 ("absent fields show 'merchant didn't publish this' rather than a blank") — `MerchantBlock` collapses missing fields into one trailing line. Move #2 ("chips degrade silently when data is missing") — `ReasoningChips` returns `null` on empty; `reasoning.ts` returns `[]`. PRODUCT.md Q2 hypothesis honoured in system prompt (size/budget/ships_to proactive; palette/ethics user-initiated). Anti-goals clean (no auth, no checkout, no mascot copy). D5 (FE schema mirror) acceptable to defer — `.passthrough()` keeps wire validation working. The CONDITIONAL is on the same gap as Cycle 1: acceptance #1–2 require a real-Groq UI walkthrough that QA could not run; code paths reviewed sound.

  Must-fix:
  - Manual end-to-end walkthrough with a real `GROQ_API_KEY`: tell the agent "size 8, ship to EU" → confirm two `save_preference` calls, two `preference_update` SSE frames, `PreferencesCard` updates without reload, and the next `search_catalog` result-set renders a `size 8 match` chip + `ships to EU` chip on at least one product. Fold the result into the Cycle 2 retrospective before Cycle 3 kicks off.
- **Design:** CONDITIONAL-PASS

  New components broadly comply with §2.3 (locked semantic tokens), §2.5 (1/2/3/4 + icon-adjacent decimals — same Cycle 1 ToolStatus precedent), §2.7 (shadow XOR border — all new surfaces are shadow-only; MerchantBlock uses a hairline as `divider` per §2.3), §2.8/§6 (all new motion ≤300ms, `useReducedMotion` wired in chips/sheet/pulses), and §4 (chip color map matches §8 directive; MerchantBlock collapses missing fields into one "didn't publish" line per acceptance #4). No serif misuse (§2.4).

  Must-fix:
  - `frontend/app/page.tsx:44` — sticky offsets `bottom-[68px] sm:bottom-[84px]` undershoot the actual `InputBar` height (form `py-4` + wrapper `py-2.5` + disclaimer ≈ 92–100px), so the `PreferencesCard` will visually overlap the top of the InputBar. Either measure InputBar height (ref + `ResizeObserver`) or pin the card inside the InputBar's sticky container so they share a layout context. Brittle as-is (§5 desktop layout: card sits *above* InputBar, not on top of it).
  - `frontend/components/preferences/PreferencesCard.tsx:466` — mobile `BottomSheet` declares `role="dialog" aria-modal` but has no focus trap and no focus return to the trigger on close. Violates §7 "Modal focus trap. Edit modals trap focus and return it to the trigger on close."
  - `frontend/components/product/ReasoningChips.tsx:55` — `price` chip mapped to `accent-50` follows §8 Cycle 2 directive but contradicts §2.2 ("`accent-50` … for `discount` kind only") and §3 Principle 6 ("orange = commitment … a reasoning chip is not orange"). Semantically wrong too: `price` fires when the product is *over budget* (warning), so showing it in commitment-orange invites a misread. Map `price` → `bg-amber-50 text-amber-700` (warning tone). Keep `discount` → accent-50. Update DESIGN.md §8 in the same PR to resolve the internal contradiction.

  Nits (non-blocking): `usePreferences` silently reverts on PUT failure (delivery log calls this out) — user gets no signal the save failed; consider a subtle danger-tone affordance in Cycle 5 mobile polish. `EditableChip` value button renders `'—'` for empty value but `ChipRow` only mounts chips for `prefs[key] != null` or staged keys, so this branch is dead — fine for now, just dead code.
- **Architect:** PASS

  Four ADRs and ARCH §5–§9 all upheld. ADR-0003: every Cycle-2 product tool enriches (pure `reasoning.computeChips`, `merchantInfo`, preference-aware filters) — no thin pass-throughs. ADR-0004: `repos/preferences.ts` returns `Promise<T>` (Postgres-migration seam intact). ARCH §7: `mcpClient.callTool` accepts `signal?`, forwards to `undici.request`, and aborts backoff sleeps via `addEventListener('abort')`; `catalog.ts`, `searchCatalog`, `getProductDetails`, `compareProducts` all thread `ctx.signal`. ARCH §5: `ToolContext.preferences` is preloaded once in `agent.ts` and frozen; tools read, never re-load. ARCH §6: `preference_update` event + `merchantInfo`/`reasoningChips`/`compareAtPrice` on `normalizedProductSchema`. Security: `save_preference` rejects unknown keys via `isPreferenceKey` + structured rejection; the LLM cannot write outside the enum. `get_preferences` correctly emits no FE event.

  Must-fix (this cycle):
  - _none_

  Carry-over to next cycle:
  - **D5 type-drift.** FE `NormalizedProductSchema` omits `merchantTags`, `compareAtPrice`, `variants[].shipsTo`. `.passthrough()` keeps wire-validation green but the FE TS types lie about wire shape. Pair with the Cycle-1 BE↔FE codegen task in Cycle 6.
  - **ARCH §7 fast-path.** Confirm in Cycle 3 that `request.raw.on('close')` in `routes/chat.ts` triggers the AbortController that now feeds `ctx.signal` end-to-end (plumbing is ready; needs an integration smoke test).
- **Security:** PASS

  Audit covered ARCH §9 plus this cycle's new attack surface: preferences CRUD, `save_preference` LLM tool, `MerchantBlock` rendering.

  No HIGH findings.

  - SQL: `preferences.ts` repo uses prepared statements with named/positional bind params throughout (`@session_id`, `@key`, …) — zero string concat. Pass.
  - LLM key enum: `savePreference.execute` re-validates via `isPreferenceKey` after Zod (defense in depth), and the route layer rejects unknown keys with a structured 400 listing valid keys. The Tool's JSONSchema also pins `key` to `enum: [...PREFERENCE_KEYS]`. Bypass-resistant.
  - Cross-session access: per-route preferences use the path `:id` (no cookie check). This is consistent with the documented anonymous-session model (ARCH §9 — "Sessions are anonymous; the cookie is the identity"). Session IDs are nanoid-21 (~122 bits entropy) so enumeration is computationally infeasible. Confirmed.
  - Cookie scope on chat route: `httpOnly`, `secure`, `sameSite: 'lax'` — correct (`index.ts` chat route).
  - XSS via merchant strings: `MerchantBlock.tsx`, `ProductCard.tsx`, `PreferencesCard.tsx` render every dynamic string (`info.name`, `info.shippingDays`, `info.carbon`, pref values) as React text children — auto-escaped. Zero `dangerouslySetInnerHTML` in the FE tree. The returns-policy badge whitelists `2-day` / `14-day` / `final-sale` and falls back to neutral styling for anything else — the string itself is still rendered as text, not HTML.
  - Rate limit: `preferencesRoutes` registers `{ max: 60, timeWindow: '1 minute' }` on all three verbs under the per-IP `keyGenerator` set globally in `index.ts`. Matches ARCH §9 budget.
  - Secrets in FE bundle: grep for `GROQ_API_KEY` / `SHOPIFY_CLIENT_SECRET` / `process.env` in `frontend/` returns only `next.config.mjs`'s `BACKEND_URL`. Clean.
  - Raw-IP-in-logs (Cycle 1 regression check): `index.ts` Pino `serializers.req` strips raw `ip`/`port` and emits `ipHash` (sha256+salt, 16-char prefix). No regression. The 0 raw IP leaks claim in cycle-2.md boot smoke holds under code review.
  - PUT body `value` is `z.unknown()` (intentional — budget can be `{min,max}`), but Fastify's 1 MB default `bodyLimit` plus the per-IP rate cap plus the composite PK `(session_id, key)` (max 7 rows per session, overwritten on conflict) bounds storage abuse. Acceptable.

  Should-fix (MEDIUM):
  - None blocking. (Optional defensive nit, LOW: cap pref `value` size at, e.g., 4 KB in the Zod schema — would tighten the abuse envelope further. Defer to Cycle 6 hardening.)

  Note on Cycle 4 dependency: vision tool's signed-image-URL gate (ARCH §7 SSRF mitigation) is not yet implemented — out of scope this cycle, flagged for Cycle 4 review.

## Fixes applied (post-review)

Applied 2026-05-12T19:32Z. Three Design must-fixes landed in-cycle; no second build round needed.

| Fix | File(s) | Verified |
|---|---|---|
| `ReasoningChips` `price` chip → amber/warning (was `accent-50` — violated §2.2 commitment-only rule and semantically wrong for over-budget warning) | `frontend/components/product/ReasoningChips.tsx` | tsc ✓ |
| `PreferencesCard` `BottomSheet` gains focus trap + focus restoration on close (§7) | `frontend/components/preferences/PreferencesCard.tsx` | tsc ✓ |
| Sticky offset on PreferencesCard wrapper raised from `bottom-[68px] sm:bottom-[84px]` to `bottom-[104px]` so the panel no longer overlaps the ~94px InputBar | `frontend/app/page.tsx` | tsc ✓; manual visual confirmation pending real-browser run |

DESIGN.md §8 has an internal contradiction with §2.2 about the `price` chip color (the §8 directive maps `price` → accent-50 but §2.2 reserves orange for commitment). Resolved in this cycle by the code change above; folding the DESIGN.md text update into Cycle 6 polish so this file is the source of truth for the discrepancy.

## Retrospective

Cycle 2 turned the streaming agent from Cycle 1 into one that *remembers*. The hybrid tool registry gained `save_preference` (strict key enum, structured rejection on unknowns) and `get_preferences`; preferences are pre-loaded once per request and frozen on `ToolContext`. The new pure `reasoning.computeChips(product, prefs)` ranks five rules into ≤4 chips per card. `normalize.ts` now surfaces `merchantInfo` (with graceful fallback to `{name}` only) and `merchantTags`. The MCP `AbortSignal` carry-over from Cycle 1 landed end-to-end through `mcpClient` → `catalog.ts` → all three Cycle-1 tools; the `search_catalog` filter plumbing for `ships_to`/`available` is wired through; DESIGN.md §2.3 locked `success/warn/danger` to Tailwind defaults before the first chip rendered. Frontend gained a `PreferencesProvider` (mounted above `ConversationProvider` so SSE events forward into it), an inline-editable `PreferencesCard` with desktop sticky + mobile bottom-sheet variants, `ReasoningChips` with chip-kind color mapping and accessible tooltip/expand behaviour, and a `MerchantBlock` that renders "merchant didn't publish this" for missing fields rather than fake values. QA: both workspaces type-check clean; preferences CRUD round-trips through SQLite (enum-rejection on `banana` returns 400 with the valid set); Pino still emits `ipHash` only. All four reviewers signed off (Architect + Security PASS; PO + Design CONDITIONAL → fixes landed). Same single open gap as Cycle 1: end-to-end UI walkthrough with a real `GROQ_API_KEY` (acceptance #1–2) — code paths verified by review.

Cycle status: **closed.** Cycle 3 (collage view + shortlist + outfit bundles) may begin.
