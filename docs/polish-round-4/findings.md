# Polish Round 4 — Aggregated findings

13 reports (1 design lead full visual review, 10 user personas, competitive + market analysis). Synthesized into a prioritized backlog. Each item tags originating reviewer(s) so traceability survives later compaction.

## Cross-cutting themes (≥3 reviewers each)

These are the items multiple independent reviewers surfaced from different angles. They warrant priority over single-reviewer finds.

- **T4.A — `MerchantInfo` has no `shipsTo` field.** The merchant-transparency move's most load-bearing fact for trans-border shoppers is missing from the data model. Card surface a "Ships to {country}" badge nowhere. [Priya, Marcus, Aleksey, Ronan]
  → Backend: add `shipsTo: string[]` to `merchantInfoSchema` in `@agentic/events`. `normalize.ts` reads it. `MerchantBlock` renders. New reasoning chip `ships_to_match` slots between `fast_shipping` and `ethics`.
- **T4.B — `ComparisonTable` is still the Cycle-1 shell.** Shipping row is a placeholder em-dash, `axes` parameter dead end-to-end, no `merchantInfo` data in the table, no sort/export/link, no `reviewCount` field anywhere. [Oscar, Ronan, Design Lead]
  → FE rewrite: pull `MerchantInfo` fields into the table; honour `axes` for column selection; small "Copy as text" / link affordance.
- **T4.C — Heart-save discoverability gap.** Hover-only on desktop (`opacity-0 group-hover:opacity-100`); on `CollageView` it's `h-9 w-9` (<44px Apple HIG). [Diane, Cleo, Yuki]
  → FE: heart visible at rest on desktop too (small subtle resting state), tap target ≥44px on collage.
- **T4.D — Pervasive `text-[11px] text-ink-400` in 14+ sites.** DESIGN.md §7 allows only at ≥12px; trust-critical copy (Mara's source-of-truth line) is the least readable. [Diane, Yuki]
  → Either bump the violating sites to `text-xs` (12px) OR codify the carve-out in DESIGN.md §7. Pick once.
- **T4.E — Reduced-motion misses on three components.** `TypingIndicator.tsx` has no `useReducedMotion` import (infinite loop runs regardless); `ToolStatus.tsx` swaps infinite rotation for infinite opacity pulse under reduced motion (misses the spirit); `SuggestionChips.tsx` has a 100ms delay not gated. [Lila]
  → Wire `useReducedMotion` in all three; replace loops with static markers.
- **T4.F — Header wordmark uses `font-display` — fifth serif site.** DESIGN.md §2.4 explicitly allows four. Yuki's read: pre-spends the gift before the user reaches the SummaryHero italic moment. [Yuki, Design Lead]
  → Drop `font-display` from the Header wordmark; keep Inter at the existing weight.
- **T4.G — `ProductCardGroup` rendered inside the assistant bubble** (`max-w-[80%]` white bubble + `shadow-soft`) — shadowed cards inside a shadowed bubble. The canonical ChatGPT-Shopping silhouette the app is trying to escape. [Design Lead]
  → Render `ProductCardGroup` as a sibling to the bubble, not a child. Bubble holds the text; product group breaks out to grid width.

## High-severity single-reviewer findings

- **T4.H — HEIC rejection bug (iOS critical).** Backend `routes/upload.ts` allowlist is `jpeg|png|webp`. iPhone Photos paste is HEIC by default → every iOS user's paste fails with a generic "unsupported_media_type" error. [Cleo]
  → Add `image/heic` + `image/heif` to the magic-byte allowlist, OR convert HEIC → JPEG server-side before storage. Convert is cleaner — Sharp can do it; or document the HEIC limitation in the upload-error copy.
- **T4.I — Agent has no language guard.** Korean / Hindi queries pass through to the English-tokenized MCP and likely return 0 results. [Min-jun, Priya]
  → System prompt addendum: if user query isn't English, agent should silently translate-and-retry, OR ask the user to confirm an English equivalent. Don't fail silently.
- **T4.J — OG image font is Georgia, not Instrument Serif.** Brand drift on every shared link preview; non-Latin gist text (Korean, Hindi) falls back further. [Cleo, Min-jun, Design Lead]
  → `app/api/og/route.tsx`: fetch Instrument Serif WOFF (or self-host) and pass to `ImageResponse({ fonts: [...] })`. Stretch: add a CJK-capable Noto Sans fallback.
- **T4.K — Currency is `en-US` locale-locked.** INR amounts get US grouping (no lakhs comma); fallback currency is USD. [Priya]
  → `lib/format.ts` accepts an optional locale param; pull from `navigator.language` when on client; server-render passes the request's accept-language.
- **T4.L — `searchCatalog` doesn't post-filter `ships_to`.** Trusts MCP to honour the filter; if the MCP ignores it, the user gets results they can't actually receive. [Marcus]
  → Add a post-fetch filter that drops products where `merchantInfo.shipsTo` doesn't include the requested country.
- **T4.M — Retry affordance below 44px tap target + no scroll-into-view.** Mobile users on flaky connections think the app froze. [Marcus]
  → Bump the Retry button to `h-11 px-4`; on `error` event arrival, scroll the error block into view; surface a small reconnection chip near the input bar as a secondary affordance.
- **T4.N — Raw `<img>` everywhere instead of `next/image`.** No responsive `srcset`, no width/height (CLS), full-desktop JPEGs on mobile. [Marcus, Cleo]
  → Migrate `ProductImage` + summary thumbnails to `next/image` with `remotePatterns` allowlist tightened in `next.config.mjs`.
- **T4.O — Gift use case absent.** No "shopping for" preference key; ethics vocabulary is adult-lifestyle, not grandparent-gift (no non-toxic / BPA-free / kid-safety). [Diane]
  → Add `shopping_for` preference key (recipient type + age band). Optional gift-specific reasoning rules.

## Medium severity

- **T4.P — `aria-labelledby` missing on the two `role="dialog"` sheets.** [Aleksey]
- **T4.Q — `mt-0.5` in `MessageRenderer.tsx:141`** slipped past the spacing sweep. [Yuki]
- **T4.R — `text-accent-600` on decorative Sparkles icon in `OutfitBundle.tsx:95`** — soft commitment-rule violation. [Yuki]
- **T4.S — `rose-500` heart violates danger-only rule.** [Design Lead]
- **T4.T — CollageView is grid-pretending-to-be-masonry.** Cards align to fixed columns; Pinterest masonry uses `column-count` CSS or JS measurement. [Design Lead, Cleo]
- **T4.U — Empty-lane copy in `Shortlist.tsx` still says "Drag a card here"** for Maybe/Skip on mobile (no touch path). Lead with the keyboard / tap affordance. [Lila]
- **T4.V — Trust-footer text reads as compliance vs operational.** Priya: lands flat for a user who's cynical about kickbacks. [Priya]
- **T4.W — No `reviewCount` field anywhere in the schema.** Power users want it on cards + comparisons. [Oscar]
- **T4.X — `dynamic = 'force-dynamic'` + `cache: 'no-store'` on `/s/[id]`** defeats CDN edge caching for repeat group views. [Marcus]
- **T4.Y — Auto-scroll uses `behavior: 'smooth'` unconditionally** — browsers auto-substitute under reduced-motion, but should be explicit. [Lila]
- **T4.Z — OG image fallback** when summary doesn't exist renders a generic card. Trust gap for a recipient who got the URL but the summary expired. [Design Lead]

## Strategic findings (not code — write into ADRs / planning)

- **Comp-A — Catalog MCP commoditized in Winter '26.** Shopify opened it to all developers; structural data moat narrowed. Differentiation now lives entirely in UX. [Competitive analysis]
- **Comp-B — ChatGPT Instant Checkout pivot now public** (CNBC Mar 24 2026) — validates our redirect-to-merchant anti-goal; only ~30 Shopify merchants ever went live. The Cycle-0 `[ASSUMPTION]` flag can come off. [Competitive analysis]
- **Comp-C — Perplexity shipped persistent memory + Snap to Shop.** Moves #6 (photo→style) and partial #3 (memory) are commoditizing. We win on *transparency-of-memory* (the visible PreferencesCard), not memory itself. [Competitive analysis]
- **Comp-D — Daydream did NOT rebuild for Android.** They doubled down on iOS 26's Liquid Glass + Apple Visual Intelligence. The Cycle-0 `[ASSUMPTION]` was wrong; iOS-only is their strategic stance, not temporary. [Competitive analysis]
- **Comp-E — Phia data-overreach scandal (Nov 2025).** Their Safari extension captured full HTML of every visited page. We can sharpen the transparency-first positioning as a wedge. [Competitive analysis]
- **Comp-F — Uncontested moves in the top-6**: Bundle/outfit completion (#4), Merchant transparency (#5), Shareable lookbook (#7). These are the highest-defensibility surfaces and should be the priority for further investment. [Competitive analysis]
- **Mkt-A — Daily Groq quota (14.4k RPD) is the actual abuse risk**, not RPM bursts. PRODUCT.md Q5 only scopes RPM stress. Add a Developer-tier credit card on Day 0 as the cheapest insurance. [Market analysis]
- **Mkt-B — Embedded Shopify-merchant widget is the unblocked monetization path** — B2B SaaS without violating the no-paid-placement anti-goal. Month-4 candidate. [Market analysis]
- **Mkt-C — Uniform Shopify-affiliate-pool (Wirecutter-style, fully disclosed) is the cleanest D2C revenue model** without breaking the anti-paid-placement promise. Month-3 candidate. [Market analysis]
- **Mkt-D — Launch triggers**: ≥35% sustained "shortlists-≥2-products" over 7 days = scale, <20% = pivot to a single vertical (home or wedding). [Market analysis]
- **Mkt-E — SOM honest read**: 3k–8k cumulative sessions in months 1–3, 15k–40k cumulative / 2k–6k MAU at month 12. Daydream's $50M raise + no public DAU = useful upper bound. [Market analysis]

## Recommended Round 5 fix-scope

If you want to ship another round, the priority order I'd attack is:

**Tier 1 (defensible-against-Perplexity polish):**
- T4.A (`shipsTo` field in `MerchantInfo` + new chip + post-filter)
- T4.G (`ProductCardGroup` breaks out of the bubble)
- T4.B (`ComparisonTable` real fields, not Cycle-1 shell)
- T4.J (OG image Instrument Serif fetch)

**Tier 2 (international users):**
- T4.H (HEIC support)
- T4.I (language guard in system prompt)
- T4.K (locale-aware currency)
- T4.L (post-filter `ships_to`)

**Tier 3 (a11y + design polish):**
- T4.E (reduced-motion fixes — TypingIndicator + ToolStatus + SuggestionChips)
- T4.D (pervasive `text-[11px]` decision)
- T4.F (drop `font-display` from Header wordmark)
- T4.C (heart-save visibility + tap target)
- T4.M (Retry affordance + scroll-into-view)
- T4.N (next/image migration)

**Tier 4 (everything else):**
- T4.O (gift use case)
- T4.P–Z (single-reviewer mediums)

The strategic findings (Comp-A through Mkt-E) belong in PRODUCT.md updates / new ADRs, not in code. Recommend a small product-doc refresh after the Tier-1 fixes land.
