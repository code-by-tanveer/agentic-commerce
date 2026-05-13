# PO Polish — Round 1

Scope: launch-readiness pass against PRODUCT.md §5 (seven moves), §6 (anti-goals),
§8 (open questions Q1/Q3/Q4/Q5). Read PRODUCT.md, walkthroughs/launch.md, the
chat surface, the share page, the system prompt, and the deploy/README docs.

## Anti-goal audit

Clean. None of the eight anti-goals in PRODUCT.md §6 are violated:

- **No embedded checkout** — every Buy / "Open at <merchant>" CTA links out via
  `window.open(checkoutUrl, '_blank', 'noopener,noreferrer')` (ProductCard.tsx:98,
  CollageView.tsx:98, OutfitBundle.tsx:192). No PCI surface, no card form.
- **No auth / accounts** — single `agentic_sid` cookie; no login UI anywhere.
- **No live inventory** — MCP results aren't re-fetched in the share blob.
- **No native app** — purely Next.js + responsive CSS.
- **No walled-garden** — ranking is preference-driven via `reasoning.ts`; no
  affiliate-bias code path or "featured merchant" carve-out.
- **No mascot** — header is `Sparkles` icon + brandmark only; system prompt at
  `backend/src/services/prompts.ts:1` opens "You are Agentic Commerce" not "I'm
  a helpful AI". No name, no emoji.
- **No BNPL / deal alerts / price tracking** — no such surface.
- **No merchant negotiation** — none.

One drift watch: PRODUCT.md vision frames the agent as helping "*decide*, not
*sell*" but the primary CTA on every product card reads **"Buy now"**
(ProductCard.tsx:173). That's the exact verb our positioning rejects. Klarna/
Amazon style. See fix #2.

## Discoverability (can a first-time user find each move?)

Walked through `docs/walkthroughs/launch.md` Steps 1–10 against the live tree:

1. **Streamed text + tool status + product grid** — discoverable from the
   suggestion chips (`ConversationCanvas.tsx:9-14`). Good.
2. **Follow-up "show me cheaper"** — no affordance; relies on the user knowing
   chat keeps context. Acceptable for launch.
3. **Preferences memory** — `PreferencesCard.EmptyPrompt` on desktop tells the
   user "I'll save the basics here as we chat" (PreferencesCard.tsx:147). Good.
   Mobile only shows a one-line "About you · Tap to add" button — fine.
4. **Outfit bundle** — only triggered by typing "what would go with this?" on
   an anchored product. **No on-card affordance.** PRODUCT.md move #4 explicitly
   says "the user can ask … *or tap an affordance*". The affordance is missing;
   discoverability hinges on a single sentence in the welcome copy that doesn't
   even mention outfits. See fix #3.
5. **Merchant transparency** — discoverable via the card chevron + "Expand"
   pattern. `MerchantBlock` renders correctly with the literal "Merchant didn't
   publish …" line (MerchantBlock.tsx:117). Good.
6. **Photo → style** — paperclip icon is present in the input bar
   (InputBar.tsx:109). The dropzone overlay also catches drag. Discoverable.
7. **Shareable summary** — `ShareButton` is gated on `badge > 0`
   (Header.tsx:27). A first-time user with 0 shortlisted items literally can't
   see how to share. That's correct (nothing to share yet) but there's no
   in-canvas hint of where the button will appear once they shortlist. Minor.

**Verdict:** Six of seven moves are reachable cold. Move #4 (outfit/bundle) is
the gap — no tap target, only a typed phrase. See fix #3.

## Q1 / Q3 / Q4 / Q5 status

- **Q1 (three lanes vs binary)** — LAUNCH_CHECKLIST.md shows resolved before
  Cycle 3; three lanes shipped. On track.
- **Q3 (photo→style usage rate)** — instrumentation hook (`usage_log` per
  ADR-0001) is present; LAUNCH_CHECKLIST marks Cycle 6 telemetry done. Kill
  switch is verbal, not coded — fine for launch but document the threshold in
  STATE.md before week 2.
- **Q4 (snapshot vs live share)** — snapshot chosen; `/api/session/:id/summary`
  returns a frozen blob with 7d stale-guard (page.tsx:16 comment). Done.
- **Q5 (Groq fallback)** — LAUNCH_CHECKLIST.md confirms 100-query stress test
  done; `GROQ_FALLBACK_MODEL` env wired. Done.

## Empty states

- **Empty shortlist drawer** — each lane shows "Drag here, or press L on a card"
  (Shortlist.tsx:43-45). Good copy.
- **No preferences yet** — `EmptyPrompt` on desktop says "I'll save the basics
  here as we chat — size, budget, where you ship" (PreferencesCard.tsx:154).
  On point. Mobile collapses to "About you · Tap to add" — fine.
- **Empty product grid (0 results from search)** — **silent fail.**
  `ProductCardGroup.tsx:20` returns `null` on `products.length === 0`. The
  user sees only the agent's prose ("I couldn't find anything…") plus a `done`
  tool status. No "Try broader filters" affordance, no chip to drop a
  preference. See fix #4.
- **Empty share lookbook** — `SummaryProductList.tsx:172-181` handles this with
  a friendly card. Good.
- **Empty moodboard** (vision returns no attributes) — agent system prompt
  instructs it to ask a clarifying question (agent.ts:39); the Moodboard
  component itself doesn't render at all for 0 attributes since the BE
  short-circuits. Acceptable.

## Copy / tone

- System prompt (`prompts.ts:1`) — terse, on-brand, no "helpful AI" tic.
  Cycle-2 addendum (agent.ts:21-42) is operational and well-scoped. **Keep.**
- `MerchantBlock` curly-quote apostrophe in "didn't" (MerchantBlock.tsx:117) —
  intentional, matches the typographic register. Good.
- `EmptyPrompt` uses a curly apostrophe in "I'll" (PreferencesCard.tsx:154) —
  consistent. Good.
- `ToolStatus` only maps verbs for 3 of 7 tools (ToolStatus.tsx:20-24). When
  the agent calls `save_preference`, `get_preferences`, `recommend_outfit`, or
  `extract_style_from_image`, the UI prints **"Working on save_preference"**
  (or similar) — a leaky implementation name. See fix #1.
- `ProductCard` says **"Buy now"** (line 173). Off-brand vs PRODUCT.md §1
  "decide what to buy, not find it". Share page uses "Open at <merchant>"
  (SummaryProductList.tsx:76), which is the right voice. See fix #2.
- Welcome (`useConversation.tsx:135`): "Hi — tell me what you're shopping for.
  A vibe, a need, or a specific product. I'll surface options from Shopify
  merchants." Good — quiet professional, no mascot.
- Suggestion chip "lightweight running shoes for trails" is fine; the four
  starters land taste-led (lamp, gifts, shoes, throw) and match Mara persona.
- No `Lorem`, `TODO`, `FIXME`, or "Coming soon" copy found anywhere in
  `frontend/components` or `backend/src`.

## Pricing display

`lib/format.ts` uses `Intl.NumberFormat('en-US', { currency })` — currency is
respected per-product (good: a EUR product renders €) but **locale is hard-
coded en-US**. A French-shipping user with a USD product sees `$199` not
`199 $US`. Acceptable for launch (we're English-language only at launch), but
worth a follow-up: pass `navigator.language` once the FE is hydrated, or
accept a `lang` query param on the share page. **Not a blocker.**

## Share page polish

`/s/[id]` reads well: serif italic gist (SummaryHero.tsx:40), three labelled
sections (loved / saved outfits / all considered), per-product "Open at
<merchant>" link, sticky `SummaryShareBar` with native-share detection
(SummaryShareBar.tsx:29). OG metadata is complete (page.tsx:54-70). Renders
without JS (no `'use client'` on the page itself; only the ShareBar is a
client island). Empty state is handled.

Two tiny gaps:
- The hero eyebrow "A lookbook from Agentic Commerce" is fine, but `Sparkles`
  icon and brandmark from the main app header don't appear on `/s/[id]` —
  a stranger opening the link has no visual brand anchor beyond the eyebrow
  text. Minor.
- `SummaryProductList` says **"Open at {merchant}"** — correct CTA voice.
  Inconsistent with the in-app "Buy now" on the same product. See fix #2.

## Documentation

- `README.md` — accurate. Every bullet maps to shipped code. Stack, run-locally,
  architecture link, deploy link, walkthrough link. No aspirational claims.
- `docs/DEPLOY.md` — accurate against `backend/fly.toml` conventions and the
  env-var checklist in `config/env.ts`. The smoke procedure (§4) matches the
  user-visible behaviour.
- `docs/walkthroughs/launch.md` — accurate per the audit above; Step 7 (outfit)
  expects only the typed phrase, not an affordance, so it lines up with the
  fix-#3 discoverability gap.

## Recommended fixes (priority order)

1. **Add verbs for the four missing tools in `ToolStatus.tsx:20-24`.** Map
   `save_preference` → "Saving preference", `get_preferences` → "Recalling your
   preferences", `recommend_outfit` → "Finding pieces to pair", and
   `extract_style_from_image` → "Reading the image". Or — cleaner — mark
   `save_preference` / `get_preferences` as silent (skip the
   `ToolStatus` block entirely) since they're memory plumbing, not user-
   visible work. Either way, no more "Working on save_preference". 30-line
   change.
2. **Rename ProductCard / CollageView "Buy now" → "Open at <merchant>"** to
   match the share page voice and PRODUCT.md positioning ("decide, not sell").
   Affects ProductCard.tsx:173, CollageView's hover overlay CTA, and the
   `aria-label` in OutfitBundle.tsx:193 (the latter is screen-reader-only and
   says "Buy <title>" — change to "Open <title> at <merchant>"). ~3 strings.
3. **Add a tap-target outfit affordance on ProductCard.** PRODUCT.md move #4
   explicitly requires "or tap an affordance". A small "Pair this" chip in the
   expanded card that emits `what would go with this?` (or invokes the
   `recommend_outfit` tool flow directly) closes the gap. Without it the move
   is gated behind the user discovering an exact phrase. Probably the
   single biggest "embarrass us at launch" item.
4. **Empty product-grid state.** When `search_catalog` returns 0 results,
   `ProductCardGroup` renders nothing and the user is left with prose only.
   Add a minimal "No matches — try broader filters" card with a chip to drop
   the active preference filters (e.g. unset `ships_to` for one query).
   ~20 lines in ProductCardGroup.tsx, no schema change.
5. **(Nice-to-have, post-launch.)** Localize `Intl.NumberFormat` to
   `navigator.language` so EU users see the comma decimal and the right
   currency placement.
6. **(Nice-to-have.)** Add the brandmark (Sparkles + "Agentic Commerce") to
   the SummaryHero on `/s/[id]` so cold visitors have a visual anchor, not
   just an eyebrow line.

Fixes #1–#4 are the launch blockers from a PO standpoint; #5 and #6 are polish
to schedule for Week 2.
