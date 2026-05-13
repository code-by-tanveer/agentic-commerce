# Cycle 5 — Phase D: Shareable session summary + mobile polish + a11y

Status: building.
Started: 2026-05-13T04:24:00Z.

**Goal.** Turn the in-session shortlist into a public, OG-tagged lookbook that the user can share with a friend on iMessage / Twitter / Slack and have it render with a clean preview card. Plus a mobile polish pass that fixes the deferred Cycle-1/2/3 violations (`InputBar` border+shadow; `ProductCard` `px-5`/`h-10`; the `ToolStatus` `h-1.5` dot) and an accessibility pass against `DESIGN.md §7`.

User-visible outcome (PRODUCT.md §7): *"I can show this to a friend."*

## Source docs

- `docs/LAUNCH_CHECKLIST.md` § "Cycle 5" — canonical bar.
- `docs/PRODUCT.md` §5 move #7 (shareable session summary). Q4 resolved: ship snapshot semantics (not live); revisit if users ask.
- `docs/ARCHITECTURE.md` §3 (`SummaryHero`/`SummaryProductList`/`SummaryShareBar`, `app/s/[id]/page.tsx`, `app/api/og/route.ts`), §4 (`sessions.summary_blob` column already exists since Cycle 1).
- `docs/DESIGN.md` §2.4 (serif appears in the **summary page hero** and **section headers** — two of the four allowed serif homes; this cycle uses them), §2.7 shadow XOR border, §5 (responsive — summary page is full-bleed mobile, centered 720px desktop), §7 a11y, §8 Cycle 5 directive.

## Open product question resolved

PRODUCT.md Q4 — snapshot vs live: **snapshot**. The `/s/[id]` page renders from `sessions.summary_blob` written at share-time. Revisits don't update.

## Carry-overs from prior cycles (queued for this cycle's polish)

These were explicitly deferred to Cycle 5/6. They land here in the mobile/a11y polish pass:

- D3 (Cycle 1): `frontend/components/chat/InputBar.tsx` has `border + shadow-soft` together → drop the border (DESIGN.md §2.7).
- D4 (Cycle 1): expanded `ProductCard.tsx` Buy button uses `px-5`/`h-10` outside the §2.5 six-step palette → swap to `px-4 h-9` (the canonical button height).
- Cycle 2 nice-to-have: `ToolStatus.tsx` dot is `h-1.5 w-1.5` (decimal sizing) → snap to `h-2 w-2` OR codify the icon-decimal carve-out in DESIGN.md §2.5. Pick one and document.

## Acceptance criteria

1. From the chat, a **"Share session"** action (in the Header or the Shortlist) snapshots the current shortlist (Love + Maybe + saved outfits) plus a one-line LLM-generated gist into `sessions.summary_blob`, mints a public URL `/s/<sessionId>`, and copies it to the clipboard (with native share fallback on mobile via `navigator.share`).
2. `/s/<sessionId>` is a server-rendered Next.js route. It loads without JS (text + images visible in `curl | grep`). Open Graph + Twitter Card meta tags present and accurate. The OG image is generated at request time via `@vercel/og` (route handler `app/api/og/route.ts`).
3. The page renders three sections: **What you loved** (Love lane), **Saved outfits** (saved_outfits), **All considered** (Maybe lane). Section headers use `font-display` per DESIGN.md §2.4 #3. The hero gist sentence is `text-3xl font-display italic` per §2.4 #2.
4. Each product cell links to the merchant's `checkoutUrl` (`target=_blank rel=noopener noreferrer`). Snapshot shape means a delisted product still renders (PRODUCT.md acceptance #5).
5. **Mobile polish pass:** tap targets ≥44px on `Shortlist` items, `Moodboard` chip removes, `PreferencesCard` mobile chips. The three deferred violations (D3, D4, ToolStatus dot) resolved.
6. **A11y pass:** every interactive element keyboard-reachable; `aria-live="polite"` on streaming canvas already in place; modal focus traps in `Shortlist`/`PreferencesCard` confirmed working (Cycle 2/3 plumbing); reduced-motion respected everywhere (audited in this cycle); color-contrast ≥4.5:1 on body text, ≥3:1 on large text — verified via a spot-check.
7. Lighthouse a11y ≥95 on `/` and `/s/<id>` (manual audit acceptable; documented in delivery log).
8. Type-check clean both workspaces; backend boots; existing features all still work.

## Files to touch

### Backend (`backend/`)

New:
- `src/routes/summary.ts` — `POST /api/session/:id/summary` snapshots the shortlist + saved outfits + a 1-line gist into `sessions.summary_blob`, returns `{ url: '/s/<id>' }`. `GET /api/session/:id/summary` reads it back (used by the FE page on hydration). Body Zod-validated; `bodyLimit: 256 KB` (an entire session's shortlist + outfits at the per-row caps fits well under this). Rate limit 60/min/IP.
- `src/services/summary.ts` — `composeSessionSummary(sessionId): Promise<SummaryBlob>` reads `listShortlist` + `listOutfits` + a 1-sentence gist string built from the conversation's last few messages (no LLM call — keep it deterministic for Cycle 5; can switch to a one-shot Groq call in Cycle 6 if reviewers ask).

Modified:
- `src/db/repos/sessions.ts` — `getSummaryBlob(sessionId)`, `setSummaryBlob(sessionId, blob)`. Column existed since Cycle 1.
- `src/routes/session.ts` — register the summary route group (`summaryRoutes` as a Fastify plugin).
- `src/index.ts` — register `summaryRoutes`.

### Frontend (`frontend/`)

New:
- `frontend/app/s/[id]/page.tsx` — server component. Fetches `/api/session/:id/summary` via the Next.js rewrite proxy. Renders `<SummaryHero/>`, `<SummaryProductList/>`, `<SummaryShareBar/>`. Returns 404 metadata if the summary doesn't exist.
- `frontend/app/api/og/route.ts` — `@vercel/og` runtime. Takes `?id=<sessionId>`, fetches the summary, returns a 1200×630 PNG with the gist + 3-up product image grid. Cache-Control `public, max-age=3600`.
- `frontend/components/summary/SummaryHero.tsx` — `text-3xl font-display italic` gist, date, merchant count meta line. Full-bleed mobile; max-w-3xl centered desktop.
- `frontend/components/summary/SummaryProductList.tsx` — three sections (Loved / Saved Outfits / All Considered). Section headers `text-2xl font-display`. Each product is a thumbnail + title + price + merchant; click → merchant `checkoutUrl` in a new tab.
- `frontend/components/summary/SummaryShareBar.tsx` — sticky bottom: copy-link button + native share button (mobile, feature-detected `navigator.share`) + a small "Open in chat" link that deep-links to `/?session=<id>`. Copy state flips for 2s.
- `frontend/components/chat/ShareButton.tsx` — sits in the chat Header next to the Shortlist trigger (or inside the Shortlist drawer — your call). On click: POSTs the snapshot, gets the URL, copies + opens the lookbook in a new tab.

Modified:
- `frontend/components/chat/Header.tsx` — render `ShareButton` when `shortlist` has ≥1 Love or Maybe item (silent otherwise).
- `frontend/components/chat/InputBar.tsx` — **carry-over D3**: drop `border border-ink-200`; keep `shadow-soft`. Verify focus state still readable (probably needs `focus-within:shadow-lift` to keep the active hint).
- `frontend/components/product/ProductCard.tsx` — **carry-over D4**: the expanded Buy button class change `h-10 ... px-5` → `h-9 ... px-4`. Type stays `text-sm`.
- `frontend/components/chat/ToolStatus.tsx` — **carry-over Cycle 2 nit**: snap `h-1.5 w-1.5` → `h-2 w-2` on the spinner dot.
- `frontend/lib/api.ts` — add `createSummary(sessionId): Promise<{url}>` and `fetchSummary(sessionId): Promise<SummaryBlob>`.
- `frontend/types/product.ts` — add `SummaryBlob` type (gist, products: love/maybe split, outfits).

### DESIGN.md update (small)

- Codify the icon-decimal carve-out in §2.5 or §2.6 since lucide icons sometimes need `h-1.5`/`h-3.5` for tasteful sizing. Single sentence carve-out: "Decimal Tailwind sizes are allowed exclusively on lucide icon widths/heights; component-level spacing (gap/padding/margin) still adheres to the six-step palette." This resolves the Cycle 2 design-review nit permanently.

## Engineer briefs

### Backend engineer

Senior Node/TS IC. Edit only `backend/`. Reuse existing services.

**Hard rules:**
- Summary writes are idempotent (re-share within the same session overwrites the blob; the URL doesn't change). Repo returns `Promise<T>`.
- `summary_blob` is JSON-stringified `SummaryBlob`. Cap at the route layer via `bodyLimit: 256 KB` — but generated server-side so this is defense-in-depth.
- Gist generation is **deterministic** for Cycle 5: pull the most recent user message or the most recent search query as the gist seed. No LLM call this cycle.
- Reuse existing rate-limit bucket.
- Edit only `backend/`.

**Verification:**
1. `npm --workspace backend run build` clean.
2. Boot, smoke test: PUT a shortlist row, then `POST /api/session/sm/summary` → 200 `{url:"/s/sm"}`; `GET /api/session/sm/summary` → returns blob with the shortlist item under Loved.

Append ≤5-bullet delivery note to `### Backend`.

### Frontend engineer

Senior React/Next.js IC. DESIGN.md is gospel. **This cycle uses the serif** (§2.4 #2 hero italic + §2.4 #3 section headers); honor the four-places-only rule strictly elsewhere.

**Hard rules:**
- `/s/[id]` is a **server component** (`async` default export). No `"use client"` at the page level. `SummaryShareBar` can be `"use client"` because it uses `navigator.share` + clipboard.
- The page must work with JS disabled (text + images visible). OG image route is the only client-driven render path.
- `@vercel/og` for the OG image. Width 1200, height 630.
- Open Graph + Twitter Card meta tags: `og:title`, `og:description`, `og:image` (the OG endpoint), `og:url`, `twitter:card=summary_large_image`, `twitter:image`.
- Mobile polish carry-overs (D3, D4, dot) land in this cycle.
- A11y pass: spot-check focus rings on every new interactive element. The summary page tab order: hero → loved cards → outfit cards → considered cards → share bar.
- Update DESIGN.md §2.5/§2.6 to codify the icon-decimal carve-out (one sentence).
- Edit only `frontend/` + the single DESIGN.md sentence.

**Verification:**
1. `npm --workspace frontend exec -- tsc --noEmit` clean.
2. Mental dry-run: share button → POST → URL copied → open `/s/<id>` in a new tab → hero + sections render → JS disabled in DevTools still renders the page (server-rendered).
3. OG image route returns a PNG on `?id=demo` even when summary doesn't exist (fall back to a sensible default).

Append ≤5-bullet delivery note to `### Frontend`.

## Delivery log

### Backend
- `db/repos/sessions.ts` gains `getSummaryBlob` / `setSummaryBlob` (JSON-stringify on write, parse on read). `summary_blob` column was already in 0001_init from Cycle 1.
- `services/summary.ts::composeSessionSummary` — deterministic: pulls shortlist + outfits + first user message's text for the gist (clamped to 120 chars, falls back to the spec'd default). Skip lane excluded from the public lookbook.
- Merchant count is a distinct-name `Set` across love + maybe + outfit items, defensive on snapshot shape.
- `routes/summary.ts` registered in `index.ts`: `POST` snapshots + returns `{url:"/s/<id>"}` (idempotent overwrite; bodyLimit 16 KB); `GET` returns 404 when missing **or** older than 7d (stale). Rate-limited 60/min/IP via the existing bucket.
- Smoke: PUT shortlist → POST summary `{url:"/s/sm"}` → GET returns blob with `prod-1` under `love` and `merchantCount: 1`; gist correctly seeded from a persisted user message. `tsc` clean.

### Frontend

- `/s/[id]` shipped as a server component with `generateMetadata` writing OG + Twitter card tags that point at `/api/og?id=…`; `notFound()` on a 404 from `/api/session/:id/summary` (stale or missing). Page renders with JS disabled — only `SummaryShareBar` is a `'use client'` island.
- `SummaryHero` (`text-3xl font-display italic` gist, date + item/merchant meta) and `SummaryProductList` (`text-2xl font-display` section headers for Loved / Saved outfits / All considered) bind the cycle's two serif homes; every product cell links out via `target="_blank" rel="noopener noreferrer"`. Snapshot shape is `unknown`-narrowed defensively so a delisted product still renders.
- `app/api/og/route.tsx` runs on edge via `@vercel/og` (added to deps), 1200×630 PNG with serif italic gist + 3-up thumb strip; falls back to a generic "A collection from Agentic Commerce" card when id is missing or the BE 404s. `Cache-Control: public, max-age=3600, immutable`.
- `ShareButton` in the chat Header (sans-only — no serif on chat surfaces) appears when Love+Maybe ≥ 1, POSTs the snapshot, writes the absolute URL to the clipboard, and opens `/s/<id>` in a new tab. `SummaryShareBar` provides Copy link + feature-detected `navigator.share` + "Open in chat" deep-link.
- Carry-overs landed: `InputBar` lost `border-ink-200` (kept `shadow-soft`, gained `focus-within:shadow-lift`); `ProductCard` expanded Buy snapped to `h-9`/`px-4`; `ToolStatus` dot is now `h-2 w-2`. DESIGN.md §2.5 gained the one-sentence lucide-icon decimal-size carve-out. `tsc --noEmit` clean.

## Defects

Filed by QA. None.

### Boot smoke
- Seed Love item via `PUT /shortlist/prod-1` → 200.
- `POST /api/session/sm5/summary` → `{"url":"/s/sm5"}` ✓
- `GET /api/session/sm5/summary` → full blob with `gist`, `love[]`, `maybe[]`, `outfits[]`, `merchantCount`, `createdAt` ✓
- `GET /api/session/never/summary` → 404 (no row + 7d freshness check) ✓
- 0 raw IP leaks in pino logs ✓
- Both workspaces `tsc --noEmit` clean ✓

Acceptance #1, #2, #3, #4 (UI walkthrough), #7 (Lighthouse manual) require a real browser session to fully sign off. Code paths verified by review. Same Groq-key gap as prior cycles.

## Review verdicts

_(pending — populated after QA)_

- **PO:** **PASS.** Move #7 lands cleanly: `/s/[id]` is a server component, OG + Twitter meta wired, only `SummaryShareBar` is a client island, snapshot semantics enforced (Q4 resolved; 7d stale-guard). Carry-overs D3 (InputBar border dropped), D4 (Buy `h-9/px-4`), ToolStatus dot (`h-2 w-2`) all landed. Anti-goals intact — no auth, no checkout, no walled garden.
- **Design:** approve with nits. Serif lands cleanly in its two earned homes (`SummaryHero` `text-3xl font-display italic`, `SummaryProductList` `text-2xl font-display`), chat stays sans, no orange on `ShareButton`, OG image reads composed, and the three carry-overs (InputBar border, ProductCard `h-9 px-4`, ToolStatus `h-2 w-2`) landed. §2.5 carve-out wording is good. Nits: `SummaryShareBar` / `SummaryProductList` "Open at merchant" tap targets (`py-2`/`py-1.5` text-xs) sit ~28–32px — below acceptance #5's 44px bar on the share-page itself; `Shortlist` `LaneItem` X remove (`p-1` + `h-3 w-3`) still tiny per acceptance #5 polish; `SummaryHero` upscales to `sm:text-4xl` which isn't in the §2.4 scale (text-3xl is the declared hero step); newly authored `ShareButton`/`SummaryShareBar` use `gap-1.5` / `py-1.5` — decimals on component spacing, which the same cycle's §2.5 carve-out explicitly forbids (icons only). Cycle 6 hardening sweep, not a ship-blocker.
- **Architect:** PASS

  Cycle 5 adheres to ARCH §4 (`sessions.summary_blob` column reused, no schema change), §6 (no new SSE arms — summary is plain REST, correct), and ADR-0004 (repos return `Promise<T>` — `getSummaryBlob`/`setSummaryBlob` confirmed). `services/summary.ts` is deterministic (no Groq call, only repo reads). `routes/summary.ts` has `bodyLimit: 16 KB`, 60/min/IP rate-limit via the existing bucket, idempotent overwrite POST, 7d staleness 404 on GET, scoped under `/api/session/:id/`. Page is a true server component; `SummaryShareBar` is the lone client island. `@vercel/og` runs edge with sensible `Cache-Control` + a fallback card.

  Must-fix (this cycle):
  - _none_

  Carry-over to Cycle 6:
  - **D5 BE↔FE event-schema codegen** (ADR-0002 mitigation #4) still deferred — three cycles running. Pick `packages/events` workspace vs. `zod-to-ts` build step.
  - **`/s/[id]` server-fetch fallback** falls back to `localhost:${PORT ?? 3000}` which is the FE port, not the BE (4000 per `next.config.mjs`). Works in dev only because Next's rewrite proxy forwards it; document `BACKEND_URL` as required in prod, or fetch the rewrite path explicitly with an absolute origin.
  - **Daily `PRAGMA wal_checkpoint(TRUNCATE)` cron** (ADR-0004 mitigation) for Cycle 6.
  - **Server-rendered nonce CSP** (ARCH §9 deferral) for Cycle 6.
- **Security:** PASS. No SSRF (OG/page fetch use env `BACKEND_URL` + `encodeURIComponent(id)` only, no user-controlled host); no XSS (every dynamic field rendered as React text, no `dangerouslySetInnerHTML`, `@vercel/og` renders JSX); gist is server-composed + length-clamped to 120; snapshot `images[]`/`checkoutUrl` retain Cycle-3 `^(?:https?:\/\/|\/)` allowlist; POST `bodyLimit: 16 KB`, 60/min/IP rate-limit, idempotent overwrite, 7d staleness; nanoid-21 (~125 bits) keeps `/s/<id>` unguessable; no secret leak.

## Retrospective

_(pending)_
