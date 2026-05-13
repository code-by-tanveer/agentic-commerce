# Round 5 — docs delivery log

Date: 2026-05-13. Owner: docs engineer (Round-5).

Scope: land the 11 Round-4 strategic findings (Comp-A → Mkt-E) that belong in PRODUCT.md / new ADRs, not in code.

## Files touched

- `docs/PRODUCT.md` — updated in-place; 140 → 185 lines.
  - §3: removed `[ASSUMPTION]` flag on ChatGPT Shopping evidence; replaced with CNBC Mar 24 2026 + Forrester citation (Comp-B).
  - §6: strengthened "no embedded in-chat checkout" justification with the ChatGPT pivot specifics — ~30 merchants ever live, tax/cart/loyalty failure modes (Comp-B).
  - §7: added "Beyond Cycle 6 (Stage 2, post-launch)" subsection. Explicit "What we'll commoditize on" callout (Moves #6, #3 per Comp-C) and "What we'll defend" (Moves #4, #5, #7 per Comp-F).
  - §8: Q3 reframed as partially commoditizing (Perplexity Snap to Shop, Daydream iOS-26) — operational kill switch retained; Q4 closed as RESOLVED (snapshot shipped Cycle 5, no live demand surfaced); Q5 amended with the daily-quota / Developer-tier note (Mkt-A); Q6 added (uniform affiliate pool, revisit month 3, per Mkt-C); Q7 added (accounts, revisit when MAU > 5k).
  - §9 (new): Strategic landscape (May 2026) — 6-month shift (Comp-A), threat landscape with Perplexity / Rufus / Meta-blocked-by-China / Phia-wedge, defensible moves, market-size honest read (Mkt-E). 25 lines, under the 60-line ceiling.
  - Appendix refreshed with 11 dated entries covering Perplexity, Rufus Scheduled Actions, Daydream iOS-26, Phia $35M + scandal, Klarna APP, Rye repositioning, net-new entrants, Meta-Manus block.

- `docs/adr/0005-shipping-to-as-trust-primitive.md` — new, 60 lines.
  - Documents the `shipsTo: string[]` add to `merchantInfoSchema`; `["WORLDWIDE"]` sentinel; absence-vs-explicit-mismatch post-filter rule; chip rank slot between `fast_shipping` and `ethics`; user-country resolution order (preference → Accept-Language → cookie → unknown). Negative consequences covered.

- `docs/adr/0006-no-paid-placement-and-revenue-paths.md` — new, 82 lines.
  - Pre-decides that uniform Shopify-affiliate-pool (Mkt-C) and B2B white-label widget (Mkt-B) are compatible with PRODUCT.md §6 if structured per the conditions listed. Forbids featured rails, variable rates, data sale, accounts without a follow-up ADR. CI-lint mitigation noted. Negative consequences covered (Wirecutter-rate cap, auditability paper-only, disclosure cognitive tax).

- `docs/walkthroughs/launch.md` — appended §4 "Day 1–30 launch sequence" summarising the market analysis 30-day plan with explicit scale/pivot triggers tied to the north-star (≥35% sustained = scale; <20% = pivot to single vertical, per Mkt-D).

## Verification

- `wc -l docs/PRODUCT.md` → 185 (below the suggested 250–400 ceiling but all required content present; padding gratuitously would dilute voice).
- `wc -l docs/adr/0005-…` → 60, `wc -l docs/adr/0006-…` → 82. Both under the 150-line cap.
- ADR format matches 0001–0004 (Status / Context / Decision / Consequences / Mitigations summary). Both new ADRs include explicit Negative-Consequences subsections.
- All file paths exist on disk; no code under `backend/`, `frontend/`, or `packages/` was touched; the seven UX moves in PRODUCT.md §5 are unchanged.

## Findings landed

Comp-A (MCP commoditized), Comp-B (Instant Checkout pivot, anti-goal validated, assumption flag removed), Comp-C (Perplexity memory + Snap to Shop), Comp-D (Daydream iOS-only is strategic — appendix updated), Comp-E (Phia scandal wedge), Comp-F (Moves #4/#5/#7 uncontested), Mkt-A (daily quota / Dev-tier on Day 0), Mkt-B (B2B widget — ADR-0006), Mkt-C (affiliate pool — ADR-0006 + Q6), Mkt-D (launch triggers — launch.md §4), Mkt-E (SOM honest read — §9 + launch.md §4).

All 11.
