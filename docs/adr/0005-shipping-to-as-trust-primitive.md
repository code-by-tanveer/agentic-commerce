# 0005 — `shipsTo` as a trust primitive in `MerchantInfo`

## Status
Accepted — 2026-05-13. Owner: product owner. Supersedes: none. Related: PRODUCT.md §5 (Move 5), ADR-0003 (tool routing).

## Context

Polish Round 4 surfaced the same finding from four independent reviewers (Priya, Marcus, Aleksey, Ronan): the `merchantInfoSchema` in `@agentic/events` has no `shipsTo` field, so the most load-bearing fact for trans-border shoppers — *can this merchant actually ship to me?* — is invisible across the product. The "Ships to {country}" badge that Move 5 (Merchant transparency cards) promises is rendered nowhere. The reasoning rule that should produce a `ships_to_match` chip cannot fire because the input data does not exist.

For our primary persona Mara (US/UK/DE), and for Sasha (EU values-led, see PRODUCT.md §3), the answer to "ships to my country?" is the single highest-stakes pre-click signal we surface. Returns-policy and carbon notes matter, but they only matter *after* the user knows the package will arrive at all. Shopify Catalog MCP returns merchant-level shipping policy data inconsistently — some merchants publish a country list, some publish "worldwide", some publish nothing. Our previous behaviour was to silently lose this information in `normalize.ts`.

The competitive matrix in `docs/polish-round-4/competitive-analysis-2026-05.md` confirms Move 5 is uncontested across all 6 top competitors. Shipping-to data is the *most load-bearing* sub-fact within that uncontested surface. Fixing the schema is small; the strategic value is large.

There is a related correctness concern (T4.L in the round-4 findings): the `searchCatalog` tool currently trusts the MCP to honour a `ships_to` filter, but the MCP's behaviour on this filter is undocumented and empirically unreliable. Without post-fetch filtering, the user can receive results they cannot actually receive. Any fix to the schema is incomplete unless the tool also post-filters.

Three design questions had to be settled before the backend engineer could land the change:

1. **Shape:** `string[]` of ISO country codes? Or a tagged union (`{type: 'worldwide'} | {type: 'list', countries: string[]} | {type: 'unknown'}`)?
2. **Absence semantics:** What does the UI say when `shipsTo` is missing entirely from the merchant data? Specifically, do we *drop* the product in `searchCatalog` post-filtering, or do we keep it and surface the absence?
3. **Chip ranking:** Where does the new `ships_to_match` chip slot among the existing reasoning chips (size match, fast shipping, ethics, MSRP discount, etc.)?

## Decision

**Schema.** Add `shipsTo: string[]` to `merchantInfoSchema` in `@agentic/events`. ISO 3166-1 alpha-2 codes. Optional — `undefined` is the canonical "merchant didn't publish this" value. `["WORLDWIDE"]` is the literal sentinel string for "no geographic restriction" (avoids a tagged union and matches how some MCP responses already encode it). The frontend treats `["WORLDWIDE"]` as a match for every shopper country.

We rejected the tagged-union shape: it is more correct but it cascades type changes through `normalize.ts`, the reasoning rules, and the React rendering of `MerchantBlock` for marginal expressive gain. `["WORLDWIDE"]` as a sentinel is ugly but local — one place to document, one constant to import.

**Absence semantics.** This is the load-bearing decision.

- **`searchCatalog` post-filter rule (T4.L):** drop a product only on **explicit mismatch** — i.e., `merchantInfo.shipsTo` is defined *and* does not contain the requested country *and* does not contain `"WORLDWIDE"`. **Do not drop on absence.** A merchant who didn't publish shipping data is not the same as a merchant who explicitly excluded the user's country, and treating them the same would silently shrink the candidate set on every cross-border query. The user's recourse on absent data is to click through and check the merchant page; that's the existing escape hatch.
- **`MerchantBlock` UI rule:** when `shipsTo` is absent, render the literal copy `"merchant didn't publish this"` — the same pattern Move 5 already uses for returns/carbon. When present and matching: show "Ships to {country}" with a positive affordance. When present and *not* matching: show the explicit `"doesn't ship to {country}"` line — but in this case the product will normally have been filtered out by `searchCatalog`, so the UI rule applies primarily to the share-page (`/s/[id]`) re-render where the user may have shortlisted earlier.

**Reasoning chip.** New chip `ships_to_match` with the `kind: 'shipping'` family. Slot order in the rank (top to bottom of card): `size_match` → `price_signal` → `fast_shipping` → `ships_to_match` → `ethics`. Rationale: `ships_to_match` is more existentially important than `fast_shipping` but less personally identifying than `size_match` and less attention-grabbing than a price signal. The chip degrades silently if `shipsTo` is absent (consistent with Move 2 acceptance criteria, PRODUCT.md §5).

**User country source.** Read in priority order: (1) the explicit `ships_to` preference in `PreferencesCard`; (2) the `Accept-Language` country hint from the request; (3) the cookie-stored last-seen country from a previous session. Never infer silently from IP — that's a privacy footgun and we have a PRODUCT.md anti-pattern around opaque inference. If none of (1)–(3) resolves, treat as "unknown" and suppress the chip + skip the post-filter rather than guess.

## Consequences

### Positive
- Move 5 (Merchant transparency) gets its most load-bearing sub-fact, closing the four-reviewer finding from Round 4.
- Trans-border failure mode ("merchant doesn't ship to me, but I didn't find out until I tried to check out") is structurally prevented for any merchant that publishes the field — a measurable trust lift for Mara (US/UK/DE) and Sasha (EU) personas.
- The `ships_to_match` chip is one more piece of card-level evidence the agent computed *something* about the user, supporting the "transparent reasoning" wedge against Perplexity (citations on articles, not product attributes).
- The post-filter-on-explicit-mismatch rule is implementable in <20 lines in `tools/searchCatalog.ts`. Cycle cost is low.
- Future-proofs the share page (`/s/[id]`): a shortlist re-rendered weeks later can correctly say "this merchant doesn't ship to your country anymore" if the data updates.

### Negative
- **The "absence" case is now a load-bearing UX surface, and it's a soft signal.** A merchant who simply didn't publish their shipping countries gets the same UI treatment as the absence of any data. Trust-wise, "merchant didn't publish this" reads as honest; but it also means the chip never fires for those merchants and the user has to click through. *Mitigation:* over time, instrument the rate at which `shipsTo` is absent across MCP responses. If absence is >40% of merchants, escalate to Shopify dev-rel for a normative push to publish.
- **`["WORLDWIDE"]` is a sentinel, not a type.** TypeScript can't enforce that consumers handle the sentinel — it looks like a country code. *Mitigation:* one helper function `matchesShipsTo(shipsTo: string[] | undefined, country: string): 'match' | 'mismatch' | 'unknown'` is the only legitimate way to read the field. Lint-rule documented in the repo `README` for future contributors.
- **The reasoning-rank position is opinion-based, not measured.** We slotted `ships_to_match` between `fast_shipping` and `ethics` by judgment. Reasoning-chip tap rate (PRODUCT.md §4 supporting metric) is the read-out: if the chip's tap rate diverges sharply from neighbours, re-rank. *Mitigation:* the rank order is a constant in `services/reasoning.ts`, easy to revise.
- **Cross-border shopping is fundamentally messier than `country IN list` suggests** — taxes, duties, customs, brand-specific country exclusions (EU GDPR-related), returns infeasibility. Surfacing one boolean ("ships?") can read as a more complete trust signal than it is. *Mitigation:* the chip copy is explicit and narrow — "Ships to {country}" — not "you can buy this". Returns and taxes remain separate fields. We avoid implying we've solved the entire trans-border problem.
- **Post-filter on the client of explicit mismatch could surprise a user** who expected to see a known merchant in a result set and finds them missing because their listed `shipsTo` is stale. *Mitigation:* the filter is server-side in `searchCatalog`, not client-side; a future debug-mode could expose the filter reason in dev. We do not surface "we hid 3 results because they don't ship to you" in the UI — that introduces a UI surface for something the user explicitly didn't ask about and adds noise. Accept this quietly.
- **No reverse mapping yet from `Accept-Language` to ISO country.** "en-GB" → "GB" is trivial; "en-US" → "US" trivial; "en" → ambiguous. *Mitigation:* document the fallback chain in `lib/locale.ts`; ambiguous Accept-Language defaults to "unknown" and we suppress the chip rather than guess.

## Mitigations summary

1. Add a single helper `matchesShipsTo(...)` in `@agentic/events`; all consumers route through it.
2. Post-filter rule encoded in `tools/searchCatalog.ts`: drop on **explicit** mismatch, not on absence.
3. Reasoning-rank position revisable in `services/reasoning.ts` based on chip-tap-rate metric.
4. Instrument the rate of absent `shipsTo` data; threshold for dev-rel escalation at >40%.
5. User-country resolution is explicit (preference → header → cookie → unknown) — never silent IP inference.
