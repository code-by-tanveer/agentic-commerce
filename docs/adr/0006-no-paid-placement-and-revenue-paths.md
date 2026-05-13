# 0006 — No paid placement; pre-cleared revenue paths

## Status
Accepted — 2026-05-13. Owner: product owner. Supersedes: none. Related: PRODUCT.md §6 (anti-goals), PRODUCT.md §8 Q6 (revenue revisit), market-analysis-2026-05.md § "Pricing model".

## Context

PRODUCT.md §6 carries two related anti-goals: **"No walled-garden catalog"** (we don't take affiliate kickbacks that bias ranking) and **"No multi-user accounts / auth"** (sessions are anonymous, cookie-keyed). Both are load-bearing for Mara's trust posture and Sasha's values posture — the first review that catches us doing pay-for-placement burns the brand.

The May 2026 market analysis (`docs/polish-round-4/market-analysis-2026-05.md` § "Pricing model") surfaces two revenue paths that the analyst calls "viable without violating the trust pledge":

- **Option A — Uniform Shopify-affiliate-pool (Wirecutter-style, fully disclosed).** Take Shopify's standard Collabs / Linkpop affiliate commission (typically 5–15% category-dependent), applied uniformly across all merchants whose products clear the same ranking rubric. Disclosed on a public `/how-we-make-money` page. **Month-3 candidate.**
- **Option D — B2B SaaS for white-labeled embedded widget ($299–999/mo per merchant).** Shopify merchants embed a `<script src="agent.js" data-merchant="…">` snippet that turns their search bar + product grid into a conversation. No conflict with the B2C surface. **Month 4–6 candidate.**

Both can be made compatible with §6 — but only if we pre-decide the *exact structure*. The risk is that a future cycle, under revenue pressure, ships a structurally permissive version (boosted placement for paying merchants, ranking weight tied to affiliate rate, "featured merchants" rail) and ratchets the anti-goal away through small steps. This ADR exists to make the boundaries explicit *before* anyone is staring at a P&L.

The competitive analysis (`docs/polish-round-4/competitive-analysis-2026-05.md` § "Phia") sharpens the cost: Phia's Nov 2025 data-overreach scandal damaged their brand trust measurably. The first time a reviewer screencaps us doing pay-for-placement, we are Phia plus the algorithm. Wirecutter has held the equivalent line for a decade and it is *both* their revenue and their moat — that's the precedent we are matching.

## Decision

**Two revenue paths are pre-cleared as compatible with PRODUCT.md §6.** Any deviation requires a follow-up ADR.

### Path 1: Uniform Shopify-affiliate-pool (Wirecutter-style, fully disclosed)

Compatible with the "no walled-garden catalog" anti-goal **if and only if**:

1. **Uniform per-merchant rate.** Every merchant in the affiliate pool is paid at the same percentage rate, determined by Shopify Collabs / Linkpop's standard category schedule. We do not negotiate higher rates with specific merchants; we do not solicit higher rates in exchange for visibility.
2. **Algorithmic ranking is unchanged.** The reasoning rules in `services/reasoning.ts`, the post-filter in `searchCatalog`, and the LLM prompt all remain blind to whether a merchant is in the affiliate pool. There is no `affiliate_weight` field anywhere in the ranking path. The ranking code reviewer's job is to verify this on every PR that touches `services/reasoning.ts` or `tools/searchCatalog.ts`.
3. **Eligibility is automatic and inclusive.** Every Shopify merchant accessible via the Catalog MCP who has opted into Shopify Collabs / Linkpop is in the pool by default. We do not maintain a hand-curated affiliate list. "Curated affiliate list" *is* the walled garden.
4. **User-visible disclosure on every surface that links out.** The existing InputBar disclosure ("Powered by the Shopify Catalog MCP; we may earn a commission when you buy") stays. The share page (`/s/[id]`) footer adds the same line. A `/how-we-make-money` public page explains the model in 300 words — link from About-you card and from the share page footer.
5. **Public ranking rubric.** The ranking rubric (what makes a product a "good match") is documented at `/how-we-make-money` and `/how-we-rank` in plain English. It must not include "affiliate status" as a factor. Reviewers can call us out by reading the page.

**Net effect:** ranking is preference-driven; revenue is a downstream by-product of the user clicking through; the merchant pool is the whole MCP, not a curated subset.

### Path 2: B2B white-labeled embedded widget

Compatible with §6 anti-goals **if and only if**:

1. **The consumer-facing surface is unchanged.** Widget users see the same agent loop, the same reasoning chips, the same merchant-transparency rules. The only differences are theming (colours, logo) and the merchant scope (the widget only searches that one merchant's catalog).
2. **Single-merchant scope is honest in the UI.** When deployed on a merchant site, the widget displays "Helping you decide across {merchant}'s catalog" — not "across the web". Users on a merchant-embedded widget are *not* told they are seeing comparison across competitors when they are not.
3. **The B2B customer pays for embedding, not for ranking.** The price tiers ($299–999/mo by traffic) buy custom theming, the right to remove "powered by", and SLA — not algorithmic favouritism. The merchant cannot pay to surface specific products above others in their own widget; the widget remains preference-driven for the shopper. (If a merchant wants merchandising control, that is a different product we do not build.)
4. **No data sale.** Anonymized aggregate analytics back to the merchant (search queries, drop-off points) are in scope; selling shopper data to the merchant or to anyone else is not. PRODUCT.md §6 implies this; we make it explicit here.
5. **Anti-paid-placement promise is the *pitch*, not a footnote.** Channel 4 in the market analysis is right: merchants buy this because it works for their shopper. The widget's marketing site states the anti-paid-placement promise prominently; if a merchant balks at the promise, they are not the customer.

**Net effect:** the consumer-facing experience is preserved; the B2C app and the B2B widget share the agent loop verbatim; revenue comes from deployment, not from ranking.

### Anything else requires a follow-up ADR

Specifically, the following are **out of scope** without a new ADR re-opening §6:

- "Featured merchant" rails, "spotlight" carousels, sponsored-product cards.
- Boosted placement of any kind for affiliate partners.
- Variable affiliate rates by merchant negotiated outside Shopify's published schedule.
- Selling preferences, search queries, or shortlist data to merchants or third parties.
- Accounts / auth (governed separately by PRODUCT.md §6 "No multi-user accounts" and PRODUCT.md §8 Q7).

## Consequences

### Positive
- Revenue paths exist that respect the trust posture. The product can pay for itself at modest scale without violating its own positioning.
- The boundaries are explicit *before* revenue pressure arrives. A future engineer asking "can we boost merchants that pay more?" has a one-paragraph "no, here's why" instead of a debate.
- The disclosure surfaces (InputBar, share-page footer, `/how-we-make-money`) become marketing — Wirecutter's transparency *is* their brand. We inherit that frame rather than fighting it.
- Channel 4 (the B2B widget) is unblocked: design partners can sign up against pre-known terms instead of waiting on a strategy decision.
- Sharpens the wedge against Phia post-data-overreach: a public ranking rubric and a public revenue model is the structural opposite of an undisclosed Safari extension capturing every page.

### Negative
- **The disclosure copy on every link-out is a cognitive tax for the user.** Even uniform disclosed affiliate income is a "we make money when you buy" mention on every shareable surface, which is a small drag on the quiet-professional voice. *Mitigation:* the disclosure copy stays one short clause, not a paragraph. We A/B the exact wording in Cycle 6 against the share-rate supporting metric (PRODUCT.md §4) — if the disclosure measurably hurts share rate, revise the wording but not the policy.
- **Uniform affiliate rates leave money on the table.** A real Wirecutter-style operator negotiates higher rates with bigger merchants; we explicitly forbid that. Revenue is structurally capped to the standard Shopify Collabs schedule. *Mitigation:* accept the cap. The B2B path (option D) is the higher-ceiling revenue line; affiliate income is the low-friction baseline.
- **Reviewers may not believe us.** "Trust us, ranking is unchanged" is not a verifiable claim from outside the codebase. *Mitigation:* the ranking rubric is public on `/how-we-rank`; the codebase will be open-source-or-shown-on-request to reviewers who ask; the PR-review heuristic in this ADR ("does this PR touch ranking? does it introduce affiliate awareness?") is enforced in the engineer agent brief.
- **The B2B widget creates a merchant-incentive to ask for boosted placement of *their own* products inside their own widget.** Even within a single merchant's catalog, the merchant has reasons to promote certain SKUs. *Mitigation:* the widget's scope is "across {merchant}'s catalog" but the *ranking* within that scope is still preference-driven. A merchant who wants SKU-level merchandising control should buy a merchandising tool; we are not that. This is a pricing-conversation discipline issue, not a code issue; documenting it here gives the sales conversation a fixed posture.
- **Auditability is paper-only until someone audits.** Nothing structurally *prevents* a future engineer from adding an `affiliate_weight` field; the ADR prevents it through discipline and review, not through type-system enforcement. *Mitigation:* a CI lint that fails the build if `services/reasoning.ts` or `tools/searchCatalog.ts` imports any module referencing affiliate state. Defence in depth.
- **The B2B widget could cannibalize the B2C app's traffic if merchants prefer to keep shoppers on-site.** A merchant who embeds the widget may stop sending traffic to the standalone agent. *Mitigation:* this is fine. The widget pays per-month; the B2C app earns affiliate commissions. Both economically sustainable; cannibalization between the two is a customer-segmentation question, not an existential risk.
- **Disclosure on the share page footer is a load-bearing trust surface.** If the share page (Move 7) is the viral loop, the disclosure runs on the surface where new users meet us cold. Wording must read as honest, not corporate. *Mitigation:* the design lead reviews the exact disclosure copy in Cycle 5 polish; passive voice is forbidden.

## Mitigations summary

1. CI lint asserts `services/reasoning.ts` and `tools/searchCatalog.ts` do not import affiliate state.
2. Public `/how-we-make-money` and `/how-we-rank` pages — link from About-you card and share-page footer.
3. PR-review heuristic codified in engineer agent brief: any PR touching ranking explicitly states "this PR does/does not introduce affiliate awareness".
4. Disclosure copy A/B-tested in Cycle 6 against share rate; revise wording but not policy.
5. B2B widget marketing site states the anti-paid-placement promise prominently; sales process is empowered to walk away from prospects who request boosted placement.
6. Any deviation from the structures defined here (featured rails, variable rates, data sale) requires a follow-up ADR re-opening §6, not an inline product decision.
