# PO Readiness Re-read — Round 6

## TL;DR — is this shippable?

**Yes, with 6 small PRODUCT.md edits.** Six cycles closed, five polish rounds landed, four reviewers PASS on Cycle 6. Code-wise the launch bar is met (subject to the two human-gated audits the team correctly refused to fabricate: Lighthouse + `/security-review`). What's missing is purely doc reflection: §5 acceptance bullets pre-date `shipsTo`/`reviewCount`/`shopping_for` fields and the `@agentic/events` workspace; §4 doesn't yet codify the launch-trigger thresholds that `walkthroughs/launch.md` §4 now enforces; §8 still lists Q1, Q2, Q3-operational, and Q4 as "open" when in fact they shipped. None of these gate ship; they gate the next agent reading PRODUCT.md cold.

## PRODUCT.md walkthrough — section by section

### §1 One-line description
Decision: **Keep**. "Chat-native shopping agent that helps you *decide what to buy*, not just *find* it — visually, transparently, with memory" survived 13 personas, 5 polish rounds, and a competitive landscape shift. Still 19 words, still accurate.

### §2 Vision
Decision: **Edit — one sentence**. The Nov 2025 / six-month-window framing is now stale: we are *in* month 6. The Catalog MCP commoditized (Comp-A, ADR-0006 context). Vision still reads as if the window is ahead. Add one clause: "...and the six-month window is now closing — the commoditization of Catalog MCP access (Winter '26 Edition) means our moat is what we *do* with the data." This is already in §9; §2 should foreshadow it in one line so a cold reader hits it before §9.

### §3 Target user
Decision: **Keep**. Mara still rings true. The `[ASSUMPTION]` flags that survived Round 4 were correctly removed in Round 5 (Comp-B). Jordan + Sasha as secondaries held up across 13 persona reviews. Cleo / Marcus / Riley are *Mara-shaped* — they did not displace her (see Q3 below).

### §4 North-star metric
Decision: **Edit**. The metric ("≥2 products shortlisted") is right but underspecified vs. what `walkthroughs/launch.md` §4 now operationalises. Two adds:
- Promote the launch triggers (≥35% sustained = scale; <20% = pivot; from Mkt-D / launch.md §4) into §4 as the launch-decision threshold on the north-star. Right now the threshold lives only in the walkthrough.
- Add **chip-tap-rate ≥ 0.3** explicitly as a *guard* metric, not just a supporting metric. After 13 persona reads, reasoning chips are the load-bearing transparency surface (Comp-C: we win on *transparency*, not on memory itself). If the chips aren't tapped, Move #2 isn't earning its space — that's a kill-or-redesign signal, not a "nice to track" one.

Do **not** complicate the headline metric itself (the user asked: should it be "≥2 shortlisted AND ≥1 chip tapped"?). Keep the north-star simple — chip-tap-rate is already supporting, and conjunctive metrics hide failure modes.

### §5 Seven UX moves
For each move (1–7): is the acceptance bullet still accurate vs. what shipped?

1. **Visual-first collage layout — Edit.** Acceptance says "Pinterest-style masonry" — shipped as CSS-columns (`columns-2 sm:columns-3 lg:columns-4`, see `polish-round-5/fix-fe-polish.md` T4.T). T4.T was mis-flagged as a bug; it's actually correct. No code change needed; acceptance bullet is fine *but* clarify the implementation note that CSS-columns counts as masonry per Cycle 3 close.

2. **Reasoning chips — Edit.** Add `ships_to_match` (ADR-0005, shipped Round 5) to the acceptance example list alongside "size 8 match" / "−42% vs MSRP". The chip is real and load-bearing; PRODUCT.md acceptance still lists pre-Round-5 examples.

3. **Persistent preference memory — Edit.** Acceptance lists "size, budget, palette, ethics, shipping prefs". The `PREFERENCE_KEYS` enum now includes `shopping_for` (T4.O, Round 5). Add to the list. Also note that the move's *strategic* value is "transparency-of-memory, not memory itself" (Comp-C) — that framing is in §7 Beyond Cycle 6 but not in §5 acceptance.

4. **Outfit / bundle completion — Keep**. Move #4 acceptance bullet shipped clean: 2–4 items, single coordinated card, per-item rationale, combined save. Architect carry-over (per-item rationales not stripped) closed in Round 1 (T1.21). Uncontested across top-6 competitors (Comp-F) — most defensible surface on the board.

5. **Merchant transparency cards — Edit.** Acceptance lists "seller name, returns, shipping days, rating, carbon". Round 5 added `shipsTo` (ADR-0005) and `reviewCount` (T4.W). Both load-bearing for trans-border + power-user personas. Acceptance bullet must list them; "Ships to {country}" should be the headline example because ADR-0005 explicitly calls it the "most load-bearing sub-fact within an uncontested surface".

6. **Photo → style search — Edit (framing only)**. The acceptance bullet is fine but should add: "**The differentiator is the visible, editable extraction chips — not the vision capability itself**" (Comp-C; already in §7 Beyond Cycle 6 / §8 Q3). Right now §5 reads as if the vision call is the moat; post-Perplexity-Snap-to-Shop, the moat is the editable chip surface.

7. **Shareable session summary — Keep.** Snapshot semantics shipped (Q4 RESOLVED). OG image now uses Instrument Serif (T4.J). Acceptance bullets are accurate. Uncontested across top-6 (Comp-F).

### §6 Anti-goals
Decision: **Edit — add three, relax none**.

Existing anti-goals are correct and one (no embedded checkout) is now publicly validated by the ChatGPT pivot. Three to add (see Q4 below):
- **No CJK OG font fetch on every request** — Round-5 deferred Noto Sans CJK (`fix-fe-structural.md` T4.J): "the bundle math doesn't justify it until share-link analytics show meaningful non-Latin traffic." This is currently buried in a delivery log; promote to anti-goal so a future engineer doesn't quietly add the 1.5MB fetch.
- **No persistent identity until 5k MAU** — currently lives as Q7 in §8 with a clean trigger; promote half of it to an anti-goal ("No accounts pre-5k-MAU") and leave the *when-to-revisit* in §8. The two are different commitments.
- **No silent IP-based geolocation** — ADR-0005 forbids it in the user-country resolution chain. Should be in §6 alongside the other "what we won't do" items because it's a privacy posture, not just an implementation detail.

### §7 Cycle goals
Decision: **Keep cycles 0-6 as-is; edit "Beyond Cycle 6" frame**.

Round 5's "Beyond Cycle 6" subsection is good and uses the right frame (commoditize vs defend). What's missing after 5 polish rounds + the 30-day launch sequence in `walkthroughs/launch.md` §4: the **post-launch cycle 7–12 articulation** the user asked for. Concrete proposal (see Q6 below):

- **Cycle 7 (Day 1–30)**: instrument and observe. Output is the Day-30 readout. No new features — only the launch sequence in launch.md §4.
- **Cycle 8 (Month 2)**: Move #4 deepening (defend) — outfit/bundle is uncontested; double down on rationale quality and category breadth.
- **Cycle 9 (Month 3)**: Move #5 deepening (defend) + `/how-we-make-money` page (ADR-0006 path 1 enable) + uniform affiliate pool live.
- **Cycle 10 (Month 4)**: Move #7 deepening — share-page enrichment, OG-image template variants, Twitter Card x.com fidelity.
- **Cycle 11 (Month 4–6)**: B2B widget pilot (ADR-0006 path 2) — first paying merchants.
- **Cycle 12 (Month 6–12)**: vertical specialisation IF the pivot trigger fired at Day-30 (Mkt-D — single vertical: home reno or wedding).

This isn't a commitment; it's the frame so the next PM doesn't restart from zero.

### §8 Open product questions
Each: keep open / promote to decision / drop.

- **Q1 (3-lane vs binary):** **Promote to decision**. Three lanes shipped in Cycle 3; survived 13 persona reviews including Diane/Cleo/Riley (UX-shaped users); no review flagged decision fatigue. Move to a one-line resolution under §5 Move #1 or close as "RESOLVED 2026-05-12: 3 lanes shipped; no friction surfaced in Round 1–4."
- **Q2 (proactive extraction):** **Promote to decision**. The Cycle 2 system prompt hypothesis (extract size + budget proactively; ethics/palette explicit-only) shipped and held through 5 polish rounds. Round 5 added `shopping_for` to the explicit-only list. Codify as "RESOLVED 2026-05-13: hypothesis confirmed; extraction policy lives in `PREFERENCE_SYSTEM_ADDENDUM`."
- **Q3 (photo→style kill-switch):** **Keep open but split**. The *operational* threshold (<5% session-share at week 2) is correctly kept; the *strategic* reframe (commoditizing, differentiate on chips) is now a §7 statement, not a question. Round 5 already reframed it in-place; the open-question status is correct because the operational decision can't be made until launch data exists.
- **Q4 (snapshot vs live):** Already **RESOLVED 2026-05-13**. Keep.
- **Q5 (Groq reliability):** **Promote to partial decision**. The 100-query stress test ran in Cycle 6 acceptance #9 (LAUNCH_CHECKLIST). The Developer-tier credit-card-Day-0 mitigation (Mkt-A) is now in `launch.md` §4. Restate Q5 as "RESOLVED 2026-05-13: stress test PASS; daily-quota covered by Developer-tier on Day 0."
- **Q6 (affiliate pool):** **Keep open**. Correctly month-3 trigger. ADR-0006 pre-decided the *structure*; the *when* still needs revenue data.
- **Q7 (accounts):** **Keep open**. 5k MAU trigger is correct. But split off the anti-goal half (see §6 above).

### §9 Strategic landscape
Decision: **Keep — refreshed enough**. Round 5 wrote this section three weeks ago (May 2026). Validated against 13 personas + competitive analysis. One stale-ness check: §9 says "no protocol decision sits on our critical path" — that's still true. Single edit candidate: the "highest probability (6 months)" Perplexity threat is dated from Round 4; if Perplexity ships a collage layout or a shareable lookbook between now and launch+30, two of our defensible moves narrow. Add a one-line Day-30 watch item: "If Perplexity ships a `/share/<id>`-equivalent or a masonry view, escalate to ADR."

## Direct answers to the six questions above

1. **Seven moves still right?** **Yes, still seven.** `shipsTo` is correctly a sub-feature of Move #5, not a new move — ADR-0005 makes it the most load-bearing sub-fact *within* Move 5, but it remains one of five merchant-transparency fields (returns, shipping days, rating, ships-to, carbon). Promoting it to "Move #8" would imply moves are weighted equally, which they aren't — Comp-F shows #4/#5/#7 carry the load. Better to leave the surface count at seven and emphasize within Move #5 acceptance.

2. **North-star still right?** **Yes, but underspecified.** Keep "≥2 products shortlisted per session" as the headline; reject the conjunctive ("AND ≥1 chip tapped") — it hides failure modes. Promote chip-tap-rate from supporting → guard metric (≥0.3 floor, below which redesign chips). Add the launch-decision thresholds (≥35% scale / <20% pivot) into §4 itself, not just into `launch.md` §4.

3. **Primary persona still Mara?** **Yes, unambiguously.** Riley, Cleo, Marcus were each *one* persona shaping *one* feature surface (photo→style flow / collage view / heart-save tap target) — they are Mara-shaped users, and the features they shaped all live inside Moves Mara already cares about. None of them *displace* Mara; they each strengthen her surface. The 13-persona Round 4 reviews don't argue for a primary swap; they argue for surface polish, which is what landed in Round 5.

4. **New anti-goals?** **Three to add, none to relax:**
   - "No CJK OG font fetch on every request" (cost discipline, ties out Round 5 T4.J deferral).
   - "No accounts pre-5k-MAU" (split out of §8 Q7; codifies the half that's already decided).
   - "No silent IP-based geolocation" (ADR-0005 forbids it; should be in §6 not buried in an ADR).

5. **Open questions to promote?** Q1 → decision. Q2 → decision. Q5 → decision (partial). Q3 stays open (operational threshold). Q4 already resolved. Q6, Q7 stay open with correct triggers. Net: §8 shrinks from 7 to 3 open questions, which is a healthy signal.

6. **Beyond Cycle 6 articulation?** Yes. The clean frame is **observe → defend → monetize → specialise**: Cycle 7 observes (Day-30 readout from `launch.md` §4); Cycles 8–10 deepen the three defensible moves (#4, #5, #7 per Comp-F); Cycle 11 unblocks B2B revenue (ADR-0006 path 2); Cycle 12 either specializes vertically (if Mkt-D pivot fires) or scales horizontally. Lives best in PRODUCT.md §7 as a 6-bullet frame, not a commitment.

## Adds / edits the PO would make to PRODUCT.md

Ranked by importance. Each is small.

1. **§5 Move #5 acceptance** — add `shipsTo` + `reviewCount` to the listed merchant fields; lead with "Ships to {country}" per ADR-0005.
2. **§8 housekeeping** — close Q1, Q2, Q5 as RESOLVED; this brings the open-question count to 3.
3. **§4 north-star** — add the ≥35%/<20% launch-decision thresholds; promote chip-tap-rate to guard metric.
4. **§6 anti-goals** — add the three new items (CJK font, no-accounts-pre-5k, no-IP-geo).
5. **§5 Move #2 acceptance** — add `ships_to_match` to the chip examples.
6. **§5 Move #3 acceptance** — add `shopping_for` to the listed preference keys.
7. **§5 Move #6 acceptance** — add the "moat is the editable chips, not the vision call" framing line.
8. **§7 Beyond Cycle 6** — expand into the 6-bullet cycle-7-to-12 frame above.
9. **§2 Vision** — one clause acknowledging the six-month window is now closing (foreshadows §9).
10. **§9** — add the Day-30 Perplexity watch item.

## What's missing that NO doc covers yet

1. **A `docs/POST_LAUNCH.md`** — referenced from PRODUCT.md §7 ("authored after the Day-30 readout") but doesn't exist yet. That's correct (Day 30 hasn't happened) — but the *template* should be sketched now so the readout has a place to land. One page, three sections: north-star read, open-question resolutions, next-60-day plan.

2. **A `/how-we-make-money` and `/how-we-rank` page** — ADR-0006 commits to them ("public ranking rubric") as a precondition for affiliate-pool revenue. They are not yet written. Not launch-blocking (no affiliate revenue at launch); month-3-blocking.

3. **A CI lint enforcing ADR-0006 path 1** — the mitigation summary says "CI lint asserts `services/reasoning.ts` and `tools/searchCatalog.ts` do not import affiliate state." The lint is not yet written. Not launch-blocking (no affiliate code exists yet); month-3-blocking.

4. **The "kill-switch instrumentation read"** — `scripts/vision-usage-rate.ts` exists (Cycle 6), but no doc says *who runs it weekly* and *what threshold triggers the kill*. The threshold is in PRODUCT.md §8 Q3 (<5% at week 2). The operational owner isn't named.

5. **A Day-30 readout template** — Mkt-D's scale/pivot/single-vertical thresholds (`launch.md` §4) need a one-page readout template so the Day-30 memo can be filled in rather than freshly authored under time pressure. Two columns: metric, action.

None of the five gate launch. All five are post-launch hygiene that the team has earned the right to defer.
