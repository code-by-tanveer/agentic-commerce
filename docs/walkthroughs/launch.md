# Manual launch walkthrough

Internal QA-style walkthrough. Written for someone who has never seen the app. Follow it top-to-bottom on a fresh clone; every step lists the exact strings to type, exact buttons to click, and exact things to assert visible. This is the literal sequence a tester runs in a browser — it is not aspirational.

This doc was rewritten end-to-end on 2026-05-13 against the live app after the first-boot post-mortem. Previous wording described surfaces that did not exist (e.g. an inline `PreferencesCard` panel — replaced in Cycle 5 by the `ProfileMenu` avatar) and assumed product chips the system never emits. Where a step is now obsolete, that's called out inline.

## 0. Prerequisites

- Node 20+, npm 10+.
- A Groq API key (`gsk_...`).
- A reachable UCP agent profile JSON URL (see `docs/ucp-profile.example.json`). The Shopify Catalog MCP requires `ucp_version`; the example file already has it.

## 1. Clone, install, env, dev

```bash
git clone <repo> && cd agentic_commerce
npm install
cp backend/.env.example backend/.env       # set GROQ_API_KEY + UCP_PROFILE_URL
cp frontend/.env.example frontend/.env     # leave BACKEND_URL=http://localhost:4000
npm run dev:backend     # terminal 1 → http://localhost:4000 (Fastify)
npm run dev:frontend    # terminal 2 → http://localhost:3000 (Next.js)
```

Open `http://localhost:3000` in a desktop Chrome window. You should see:

- A sticky header reading **Trove** (Inter, semibold, no serif).
- A blank chat canvas (no greeting bubble — the assistant only speaks when spoken to).
- A sticky input bar pinned to the bottom with placeholder text **What are you looking for?**.
- Directly below the input bar, two lines of disclosure copy:
  - `Prices and availability come from Shopify merchants.`
  - `Ranking is preference-driven, not paid placement.`
- A 36×36 quiet avatar control in the header's right edge (the `ProfileMenu` trigger).

## 2. Step-by-step

### Step 1 — first query (cold "hi" smoke)

Click the textarea. Type literally `hi` and press Enter.

Expected:

- The user message appears in a right-aligned bubble.
- An assistant bubble streams in below it within ~10s (real Groq, real network).
- The streamed reply is conversational English with NO `<function>` / `<tool_call>` / `jsonrpc` / `MCP 4` / `MCP 5` tokens visible anywhere on screen.
- No tool-status line appears (the system prompt forbids `search_catalog` for greetings).
- The Send button's spinner clears when streaming finishes; the textarea is empty and re-enabled (you can immediately type the next message).

Regression to file if any of: spinner stays spinning forever; the reply contains protocol XML; a "Searching catalog…" tool-status line appears for a bare greeting.

### Step 2 — first product query

Type literally `running shoes under $200` and press Enter.

Expected:

- A `ToolStatus` line briefly appears reading **Searching catalog for "running shoes…"** then flips to **done**.
- A grid of product cards materializes below the assistant text in the same assistant turn. Each card has:
  - A product image (or a tasteful skeleton if the merchant didn't ship one).
  - A title and a merchant name (the merchant text is its own tap-target — see Step 4).
  - 1–4 reasoning chips in a row below the title (e.g. `−42% vs MSRP`, `ships free`, `arrives in 3 days`). Cards with no real signal show no chips rather than fake ones.
  - A heart button (`Save to Love`) at top-right with `aria-pressed="false"`.
- The Send button's spinner clears; the textarea is empty and re-enabled.

### Step 3 — preferences via the ProfileMenu (replaces obsolete "inline PreferencesCard" step)

The original walkthrough talked about an "About you" panel that opened inline above the input bar. That surface was removed in Cycle 5 — Mara feedback flagged it as intrusive. The replacement flow:

1. Type literally `I wear size 9 and ship to the EU` and press Enter.
2. Wait for the assistant to acknowledge (one short streamed line, no tool call needed).
3. Click the **avatar** control at the top-right of the header (the `Open your profile` button — when at least one preference is saved, its accessible name becomes `Open your profile (preferences saved)` and a small dot appears on the avatar).
4. The `ProfileMenu` popover (desktop) or bottom sheet (<640px) opens. Inside it the `PreferencesCard` lists two chips: `size 9` and `ships_to EU`, each marked `you` (not `inferred`).
5. Close the menu with Escape.
6. Type `something for the kitchen` and press Enter. On the next product set, where the data supports it, the chips include `size 9 match` or `ships to EU` (these are kind-stamped server-side in `backend/src/services/reasoning.ts`). Cards without that signal simply omit the chip — never a fake one.

### Step 4 — merchant transparency

Click anywhere on a product card (not the heart). The card flips `aria-expanded="true"` and an inline detail panel slides in.

Expected:

- The `MerchantBlock` reveals seller name, returns-policy summary, shipping-days estimate, and a rating line where the merchant published one.
- Absent fields render the literal string **merchant didn't publish this** — never blank, never a fake number.
- The expanded action row carries two buttons: a **Pair with…** pill (Wand2 icon, white) and a **Buy on {merchant}** pill (orange — the only place §2.2 of the design system allows orange).
- The merchant name text in the title row is its own tap-target with `data-testid="merchant-tap"`. Tapping it expands ONLY this card; neighbouring cards stay `aria-expanded="false"`.
- The `Buy on {merchant}` button fits inside its parent card at every viewport — long merchant names like "Commonwealthrunning" truncate within the button rather than overflowing the card frame.

### Step 5 — view toggle (list ↔ collage)

In the header, click the **Collage view** radio button beside the wordmark.

Expected:

- The current product grid reflows into a Pinterest-style CSS multi-column masonry (`columns-2` on small viewports, `sm:columns-3`, `lg:columns-4`).
- The heart button (`Save to Love`) is still reachable on every card.
- Reload the page (Cmd-R). The **Collage view** radio remains checked (`aria-checked="true"`) — view-mode persists per session via `PUT /view-mode`.
- Click **List view** to restore.

Note: prior product turns do NOT rehydrate on reload — only the sessionId, view-mode, shortlist, and saved preferences persist. This is a known gap (see sweep.spec.ts Surface 8); the walkthrough notes it rather than asserting an unimplemented feature.

### Step 6 — shortlist (keyboard fallback is the canonical path)

Focus a product card with Tab. Press the **L** key (uppercase or lowercase). A focus ring is visible throughout.

Expected:

- The card's heart flips to `aria-pressed="true"` and the icon fills.
- The `Shortlist` trigger button in the header gains a "1" badge and its accessible name reads `Open shortlist (1 loved or maybe)`.
- The drawer is closed; the badge is the only visual change.

Repeat with **M** on a second card (sends it to Maybe — same badge increments) and **S** on a third (Skip lane, no badge change because the trigger badge only counts Love+Maybe).

Click the trigger to open the drawer. On desktop (≥1024px) it's a 320px right-side rail with id `shortlist-drawer`. On mobile (<1024px) it's a `role="dialog"` bottom sheet with aria-label **Shortlist**. Press Escape to close. Click outside the drawer to close (the listener fires on `pointerdown`, not `click`).

### Step 7 — outfit bundle via "Pair with"

Click a product card to expand it. In the expanded action row, click the **Pair with…** button (its accessible name reads `Pair with — what would go with {product title}?`).

Expected:

- A new user bubble appears with text along the lines of `What would go with the {product title}? [pair_anchor:{id}]`.
- The assistant turn streams in. After 30–90 seconds (real Groq + 2–4 parallel sub-searches via `recommend_outfit`) an `OutfitBundle` region (`role="region"`, aria-label **Outfit bundle**) renders.
- The bundle header reads **A coordinated set** with a count and total price.
- 2–4 product cells render in a grid. Each cell has an open-in-merchant button and (optionally) a one-line "why this with that" rationale.
- A single orange **Save outfit** button sits at the bottom-right.

Click **Save outfit**.

Expected:

- The button flips to a green **Saved** pill with a checkmark, then back to **Save outfit** after ~2s.
- Every cell is appended to the Love lane; the header trigger badge increments by `cells.length`.

If the agent declines to invoke `recommend_outfit` (rare; usually because the model's tool-routing slipped) the outfit region does not appear. This is a known model-dependent surface — the spec at `tests/e2e/pair-and-trust.spec.ts` skips with reason rather than flakes.

### Step 8 — photo → moodboard → search

Drag a JPEG/PNG/WebP from your file manager onto anywhere in the chat canvas. (Alternative paths: click the paperclip in the input bar, or paste from clipboard.)

Expected:

- A full-viewport overlay reading **Drop to attach** appears under the dragged cursor (z-50 backdrop, dashed accent border).
- On drop, the file uploads to `/api/upload` and a new user bubble appears with text `find me something like this`.
- The assistant turn streams in. A `Moodboard` card renders BEFORE any product grid in the same turn. It contains:
  - A thumbnail (≤128px on the longest edge).
  - A row of editable attribute chips extracted by vision (e.g. `boucle texture`, `sand palette`, `mid-century silhouette`). Each chip has an X to remove and a trailing **+ Add** affordance to append.
  - A short description line.
- A product grid follows in the same assistant turn, populated by an auto-fired `search_catalog` against the suggested query.
- If vision returns low confidence, the assistant says so and asks a clarifying question rather than guessing silently.

This step is not yet covered by an E2E spec — synthesised drag-and-drop with a real File payload under Chromium DevTools Protocol is fragile. Test manually until the dedicated spec lands.

### Step 9 — share

The `ShareButton` only appears once the shortlist has ≥1 Love or Maybe item (the action row is chrome-quiet on a fresh session). Save at least one item first if you haven't.

Click the share button (label includes the count).

Expected:

- A POST to `/api/session/{id}/summary` runs; on success a toast confirms and the URL `https://<host>/s/<id>` is on the clipboard.
- Open the URL in an **incognito** window with JavaScript disabled in DevTools.
- The page renders fully without JS:
  - An `<h1>` headline (server-rendered via Next metadata).
  - The shortlist sections, merchant names, and totals.
  - A sentence-or-two recap.
- View page source — `og:title`, `og:image`, and `og:description` tags are populated.
- An unknown share id (`/s/this-does-not-exist`) returns HTTP 200 (not 404) and renders an "no longer available" `ExpiredSummary` page.

### Step 10 — mobile (360×800 emulation or real device)

Open DevTools, switch to a 360×800 device emulation (or open the URL on your phone over the LAN).

Expected:

- No horizontal page scroll on the chat surface (the action row in the header clips the New-chat button below 380px to avoid overflow).
- Product cards fit within the 360px viewport width.
- The input bar carries `padding-bottom: max(env(safe-area-inset-bottom), 0px)` so iOS home-indicator clipping is avoided.
- Tapping the **Shortlist** trigger opens a bottom sheet (`role="dialog"`, aria-label **Shortlist**), not the desktop rail. The sheet panel's bottom edge sits within ~16px of the viewport bottom.
- Tapping the profile avatar opens the `ProfileMenu` as a bottom-anchored sheet too — `fixed inset-x-2 bottom-2` so it spans the viewport minus an 8px gutter.
- Reasoning chips remain present on every card and remain ≥44px hit targets via the `before:` pseudo-element extension.

## 3. What "pass" looks like

If every step rendered the expected state above, the build is launch-ready against the seven UX moves in PRODUCT.md §5. File any deviation as a defect in the current cycle doc under `## Defects` with a short repro. The QA Evidence Gate in `docs/LAUNCH_CHECKLIST.md` requires `boot.log` + `first-chat.log` + `error-path.log` per cycle — the PM owns those.

## 4. Day 1–30 launch sequence

Once the walkthrough passes end-to-end, the launch plays out over a 30-day window. The full reasoning lives in `docs/polish-round-4/market-analysis-2026-05.md` § "30-day launch sequence"; this is the operational summary.

### Day 0 (the day "pass" above is reached)

Tell exactly five people who can keep a secret and will give brutal feedback in 48h: 2 design-savvy Mara-personas, 1 Shopify merchant, 1 fashion-newsletter writer, 1 ex-Stitch-Fix-or-similar operator. Get explicit permission for screenshots. Wire the Developer-tier Groq credit card *now* (PRODUCT.md §8 Q5 — the daily 14.4k RPD quota is the real abuse risk, not RPM bursts).

### Day 1–7 — Closed beta (~25–40 invited testers)

- **Recruit list:** 10 from Twitter/IG DM (taste-led shoppers we follow); 10 from a single Substack writer's reply thread (offer exclusive walk-through in exchange for amplification); 5 Shopify merchants for the embedded-widget conversation (ADR-0006 path 2); 5–10 HN/PH friends primed to upvote.
- **Instrumentation:** PostHog or Plausible event stream wired Day 1; daily Slack/Linear digest of the north-star (≥2 products shortlisted per session) plus the three supporting metrics (median time-to-first-shortlist, chip-tap-rate, share-rate). Daily 15-min triage on Groq 429 rate and MCP timeouts.
- **Success criterion (window):** north-star ≥ 25% — at least one in four sessions shortlists two distinct products. Below 15%, pause launch and triage the agent loop before broadening the recruit list.

### Day 8–21 — Soft launch

- **Day 10 (Tuesday or Wednesday for max upvote density):** Product Hunt launch + HN Show post simultaneously.
- **Day 12–14:** Substack writer's dedicated section goes live.
- **Day 14–21:** First 3 creator partnerships (gifted access, no cash, week-long content windows).
- **Signal-vs-noise threshold for "this is working":** north-star ≥ 35% sustained over 7 days, plus the supporting metrics at or above PRODUCT.md §4 targets (time-to-first-shortlist < 90s, chip-tap-rate ≥ 0.3, share-rate ≥ 5%). Below 25% on the north-star, treat the launch buzz as decorative and revisit positioning before opening any new channels.
- **Latency floor:** if Groq 429 rate > 2% of turns or MCP timeout > 1% of calls during peak, freeze marketing pushes and harden the fallback before resuming.

### Day 22–30 — Decide: pivot or scale

**Scale triggers (any two):**

- North-star ≥ 40% sustained over 7 days.
- ≥ 3k cumulative sessions.
- ≥ 10% of sessions sharing a `/s/[id]` page externally.
- ≥ 3 unsolicited inbound from Shopify merchants asking for the widget (ADR-0006 path 2).

If two or more fire: open paid B2B widget pilots (5 merchants, $0–299/mo concierge), kick off the creator paid push, scope month-2 SEO build, and write a cycle-7 backlog organised around growth rather than features. Affiliate-pool revenue (ADR-0006 path 1) becomes a candidate for month-3 enable.

**Pivot triggers (any one):**

- North-star < 20% sustained over 7 days.
- > 40% of sessions ending at 0 shortlisted.
- > 2 public reviewer complaints about hallucinated products (T4-pattern: model invents a SKU not in the MCP).

If any one fires: narrow to a single vertical (Segment 4 in the market analysis — home reno or wedding planning), kill the multi-category framing in copy and on the share page, re-validate the north-star inside the narrowed scope before re-broadening.

### What "30 days done" looks like

By Day 30, the team has a defensible read on whether to scale the horizontal proposition or retrench into a single vertical. The output is a Day-30 readout (a short memo, not a meeting) that updates `docs/STATE.md`, opens or closes the relevant PRODUCT.md §8 questions, and authors `docs/POST_LAUNCH.md` with the next 60-day plan against the chosen direction.

## 5. Per-cycle test deltas

The backend unit-test count over time. Numbers measured by running `npm --workspace backend run test` at each commit listed — the figures account for `describe.each` / dynamic `it()` loops that a naive grep undercounts. The visible jump in Cycle 7 was discovery-driven: once the app booted live against real Shopify, surfaces nobody had probed (content sanitisation, vision parsing, upload signing, retry-after handling, session smokes) emerged in a single triage pass.

| Cycle / commit                                                         | Δ tests | Cumulative |
| ---------------------------------------------------------------------- | ------- | ---------- |
| Cycle 1–2 (scaffold + first agent loop)                                | +0      | 0          |
| Cycle 3 (collage, shortlist, outfits)                                  | +0      | 0          |
| Cycle 4 (photo → moodboard search)                                     | +0      | 0          |
| Cycle 5 (share page, mobile/a11y polish)                               | +0      | 0          |
| Cycle 6 (hardening — single events source, env guards, CSP)            | +0      | 0          |
| Polish R1 (30+ launch-blocker fixes, 14-reviewer pass)                 | +0      | 0          |
| Polish R2 (ops hardening, ethics taxonomy, first test push)            | +33     | 33         |
| Polish R3 (cleanup, test expansion, Skeptic re-walk)                   | +16     | 49         |
| Round 4 (visual review, persona walks — no test work)                  | +0      | 49         |
| Polish R5 (Tier-1+2 fixes from 13-agent review)                        | +6      | 55         |
| Round 6 (sub-medium polish + PO/PM readiness)                          | +0      | 55         |
| First-boot fixes (model swap, UX dismissals, scroll, ProfileMenu)      | +14     | 69         |
| Post-mortem fixes (boot/resilience contract, e2e gate landed)          | +4      | 73         |
| Cycle 7 today (live-system audit pass — backend hardening + e2e sweep) | +54     | 127        |

Per-cycle Playwright deltas:

| Cycle                              | Δ E2E specs | Cumulative |
| ---------------------------------- | ----------- | ---------- |
| Through Polish R6                  | 0           | 0          |
| Post-mortem fixes (first e2e gate) | +1 (`firstchat.spec.ts`)                                                                                                                                                                                                                                                            | 1          |
| Cycle 7 today                      | +3 (`productcard.spec.ts`, `sweep.spec.ts`, `pair-and-trust.spec.ts`)                                                                                                                                                                                                               | 4          |
