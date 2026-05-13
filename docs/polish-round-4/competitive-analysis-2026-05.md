# Competitive Analysis — May 2026 refresh

Owner: Competitive Analyst. Companion to `docs/research/2026-05-12-competitor-scan.md` (Cycle 0 baseline). Re-verifies that scan against public reporting Nov 2025 → May 2026 and benchmarks our seven UX moves.

---

## Headline shift since Nov 2025

The "wars" started for real: OpenAI's Instant Checkout rolled back in late Feb / early Mar 2026 (CNBC, TechCrunch, Forrester) after ~12 Shopify merchants went live and conversion collapsed — vindicating our redirect-to-merchant anti-goal. Meanwhile, **protocols proliferated**: ACP (OpenAI + Stripe), UCP (Google + Shopify + 20-plus retailers, Jan 2026), AP2, MCP, A2A, Visa TAP. And Amazon stopped pretending to be passive: Rufus launched **Scheduled Actions** (auto-buy on a cron, Apr 2026), 365-day price history, and the company is staffing a 40-engineer "Agentic Commerce Experiences" group while simultaneously suing Perplexity for crawling its site (signal: Amazon will fight integration, not embrace it).

For us, the takeaway is that **discovery, not checkout, is the contested layer** — exactly where we positioned. The risk has shifted from "no one cares about transparent agentic shopping" to "this gets crowded fast" — Lemrock, Wildcard, Swap, OneOff, Sitefire are all new entrants since Nov 2025.

---

## Competitor entries (refreshed)

### Perplexity Shopping
- **Current state (May 2026):** Massively expanded since Nov 2025. Shipped persistent shopping memory ("remember my mid-century modern aesthetic"), virtual try-on with user avatars, **Snap to Shop** visual search, PayPal-powered **Instant Buy** (inside-app checkout), and a free Merchant Program that competes directly with Shopify's MCP. The $400M Snap deal that would have embedded them into Snapchat publicly collapsed in early May 2026 — losing a major distribution path. Amazon is suing them over crawling.
- **Strengths:** Memory now works across sessions (this was their biggest 2025 gap and they closed it); citations remain best-in-class trust signal; PayPal in-app checkout is real, not vapor; Snap-to-Shop is a direct hit on our Move 6.
- **Weaknesses:** Catalog still web-crawl-derived where Shopify integration isn't deep — freshness/inventory holes. Avatar try-on is a gimmick outside apparel. Lost Snapchat distribution. Sued by Amazon — legal overhead and brand drag.

### Amazon Rufus
- **Current state (May 2026):** Q1 2026 earnings: 115% MAU growth YoY, ~$12B incremental annualized sales. April 2026: **Scheduled Actions** (recurring auto-buy) rolled out to all US shoppers — Rufus now actively buys on a cron, not just recommends. Price history expanded from 90 → 365 days. New: Custom Shopping Guides, Shop Direct cross-web buying, handwritten list-to-cart. Amazon is hiring a 40-eng team for outside-agent integration but is also blocking and suing crawlers (Perplexity).
- **Strengths:** Catalog depth + Prime logistics + 365-day price history is a serious trust play (mirrors what our reasoning-chip rationale tried to land). In-app placement on every PDP is unbeatable distribution. Scheduled Actions is genuinely new in the market.
- **Weaknesses:** Walled garden hardening — they reward themselves, not the open agentic ecosystem. Sponsored bias remains structural. Still no comparison/shortlist UX. No bundle/outfit. Trust gap persists for "Mara" persona: she actively distrusts Amazon ranking.

### ChatGPT Shopping (Instant Checkout pivot)
- **Current state (May 2026):** Confirmed publicly: Mar 24 2026 CNBC reported OpenAI **revamped** the shopping experience, deprioritising native checkout. Instant Checkout moved into Apps mode (purchase happens in the connected merchant service), focus is now product **discovery**. Reasons per public reporting: low conversion, only ~30 Shopify merchants live, unresolved sales-tax remittance, no multi-item cart, no loyalty integration. Forrester called it "the leader in agentic commerce just pulled back."
- **Strengths:** Discovery query volume is still enormous (~900M weekly users see shopping). ACP is a real protocol with PayPal adoption. Intent capture quality remains top-tier.
- **Weaknesses:** Public pivot is reputational damage; merchants who onboarded are now in limbo. No memory across turns within session (still). No merchant transparency surface. Flat link-list UX. The pivot exactly validates our anti-goal — this is the headline competitive proof point for our positioning.

### Klarna AI assistant
- **Current state (May 2026):** Launched **Agentic Product Protocol** (open standard, live catalog feed of 100M+ products / 400M+ prices across 12 markets) — competing directly with UCP/ACP at the catalog layer. Klarna is also now embedded inside Google Gemini AI Mode as a BNPL provider. Public framing has shifted from "AI replaced 700 CS agents" (2024 brag) toward "we are the agent infrastructure" — they want to be the rails, not just an app.
- **Strengths:** Genuine price-history depth (their core competence). BNPL distribution in Gemini gives them surprising leverage. Agentic Product Protocol is a real catalog play.
- **Weaknesses:** BNPL-led framing still dominates the consumer UX; payment-product tone alienates exploratory shoppers (Mara). Visual layout still weak. They are now an infrastructure provider AND a consumer app — strategic identity is muddy.

### Daydream
- **Current state (May 2026):** **Did launch iOS-first in Nov 2025**, doubled down rather than rebuilt for Android: in Q1 2026 they rebuilt the iOS app around iOS 26's **Liquid Glass** design language + Apple's visual-intelligence framework. Headline feature: **screenshot-from-anywhere → shoppable matches** (Apple-native, no copy/paste), catalog now 10,000 vetted brands. App Store reviews are warm ("changed the game"). No Android.
- **Strengths:** Best-in-class visual polish; iOS 26 Visual Intelligence integration is a genuinely novel surface (Mara can screenshot anything → shop without opening an app); fashion-AI tuning is real and they've published catalog growth metrics.
- **Weaknesses:** **Still iOS-only — an enormous wedge against them** (Android, web, EU enterprise). Fashion-only; non-apparel still degrades poorly. Opacity persists: reviews praise the magic but ours-truly's "why this?" critique still applies. Single-vertical bet at exactly the moment platforms are going horizontal.

### Phia (browser extension + iOS)
- **Current state (May 2026):** **Closed a $35M round (Notable, Khosla, Kleiner Perkins) Jan 2026** — they are NOT extension-only anymore: now ship a Phia iOS app and Chrome/Safari extensions. 6,200 retail partners; 11x revenue growth since launch. Reported MAU "hundreds of thousands." But **Nov 2025 data-overreach incident**: NowSecure + Fortune flagged that the Safari extension was capturing full HTML of every visited page (not disclosed). They removed the feature; brand trust took a measurable hit.
- **Strengths:** Resale/secondhand is a real differentiator and well-funded; founder narrative (Gates / Kianni) drives organic press; the iOS app reduces extension friction.
- **Weaknesses:** **Trust gap from the data-overreach story** is now their biggest exposure — exactly the surface a transparency-first competitor (us) can attack. Reactive (price-compare) not exploratory. Catalog/category breadth is narrow (fashion + premium).

### Shop app's AI features (Shopify's own)
- **Current state (May 2026):** **Winter '26 Edition** (Jan 2026) was the major shift. Shop now ships **Agentic Storefronts** — merchants flip a switch and syndicate their catalog to ChatGPT, Microsoft Copilot, Perplexity natively. **Sidekick Pulse** acts proactively on the merchant side ("anticipates needs"). On the consumer side, Shop app has Minis (mini-apps in feed) and continues a TikTok-shaped feed. Shopify Catalog (the MCP we are built on) went from "select partners" to all developers in Winter '26 — meaning **our structural moat narrowed**: anyone can get the same data we do.
- **Strengths:** First-party catalog (always); now distributes to every AI platform via UCP; Sidekick is genuinely good for merchants. Universal Commerce Protocol coalition (Walmart, Target, Etsy, Wayfair) is dominant.
- **Weaknesses:** Consumer-facing Shop app still feels generic; feed-shaped, not conversation-shaped; no opinionated POV. They are now a **protocol** competitor more than a UX competitor. **The MCP commoditization is the most important strategic update of this scan.**

### Mercari Merchat AI
- **Current state (May 2026):** No public material updates since 2023 beta launch. Still beta, still web-only, still Mercari-only. Functionally dormant in the competitive landscape.
- **Strengths:** Marketplace intent-capture quality remains decent.
- **Weaknesses:** Stagnant. Not a credible threat in the next 12 months.

### Rye (commerce infrastructure)
- **Current state (May 2026):** Repositioned as **the universal checkout API for AI agents**. 15,000+ merchants, claims 99.9% reliability and sub-10s checkout latency on Amazon/Shopify, sub-35s offer resolution everywhere else. Member of the Agentic Commerce Consortium (Henry Labs, Firmly, others). Direct beneficiary of OpenAI's Instant Checkout retreat — when OpenAI gave up, Rye's pitch ("you handle checkout, we handle inventory of merchants") got stronger.
- **Strengths:** Infrastructure positioning means they're not a UX competitor; they're a potential **partner** for our future cycles if we ever ship purchase. Universal API spans Amazon + Shopify + indie.
- **Weaknesses:** Not customer-facing — no consumer brand. Their relevance to us is "build vs. buy" for a future checkout cycle, not a competitor for Mara's attention.

---

## Net-new entrants (post-Nov 2025)

- **Lemrock** (Paris, Mar 2026, €6M) — middleware that lets brands (Darty, Leroy Merlin, Lidl, Rakuten) sell *inside* ChatGPT and Claude. EU-flavoured ACP/UCP integration shop. They are not a Mara-facing UX competitor; they're a merchant-side enablement layer competing with Shopify's own pipes for European retail. Threat to us: indirect.
- **Wildcard** (YC, late 2025) — SKU-level visibility inside ChatGPT (GEO for products). Helps merchants get *their* SKU named when ChatGPT recommends. They are an SEO/distribution play, not a discovery-UX competitor. Threat: indirect.
- **Swap Commerce** (Sept 2025) — lets brands embed their own AI shopping agents on their own sites. Brand-owned-agent play. Threat: structural — if every brand has its own competent agent, the case for a horizontal agent like us weakens slightly. Watch closely.
- **OneOff** (2025) — celebrity / creator look-alike recommendations ("dress like Hailey Bieber"). Adjacent to our photo→style move but with a specific intent angle (celebrity-anchored). Niche but interesting; a possible vertical we never enter.
- **Sitefire** (YC) — generative engine optimization (GEO) for merchants in the agent layer. Not a Mara-facing competitor.
- **Meta agentic shopping** (Q1 2026 rollout) — Zuckerberg announced on the Jan 29 earnings call. Tried to acquire Manus (Dec 2025) — **China blocked the acquisition in Apr 2026**. Meta's path is now slower than expected. Threat: latent but real — Meta has the catalog (Instagram/FB Shops) and distribution. We should watch what they ship by Q4 2026.
- **Walmart Sparky** — Walmart's in-app conversational assistant; Walmart-only, walled-garden, not a Mara surface.
- **Ulta + Google Gemini** (Apr 2026) — vertical case study in beauty. Pattern to watch: vertical retailers building their own Gemini integrations.

---

## Benchmark matrix — our seven moves vs them

| Move | Perplexity | Rufus | ChatGPT | Klarna | Daydream | Shop App |
|------|-----------|-------|---------|--------|----------|----------|
| 1. Visual collage layout | ~ (image grid) | ✗ | ~ (image grid) | ✗ | ✓ (best-in-class) | ~ (feed) |
| 2. Reasoning chips on every product | ✓ (citations) | ~ (price-history chip) | ✗ | ~ (price history) | ✗ (opaque) | ✗ |
| 3. Persistent preference memory | ✓ (shipped 2026) | ~ (narrow signals) | ~ (within-session only) | ~ | ~ (style profile) | ~ |
| 4. Outfit / bundle completion | ✗ | ✗ | ✗ | ✗ | ~ (single outfits) | ✗ |
| 5. Merchant transparency (returns/shipping/origin/carbon) | ~ (citations not policies) | ~ (returns visible, no carbon) | ✗ | ✗ | ✗ | ✗ |
| 6. Photo → style search | ✓ (Snap to Shop) | ✗ | ~ (image input exists) | ✗ | ✓ (iOS 26 screenshot-anywhere) | ✗ |
| 7. Shareable session summary (lookbook) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

**One-sentence defensibility note per row:**
1. Visual collage — defensible against text-first incumbents (Rufus, ChatGPT, Klarna); contested by Daydream — we win on cross-platform (web, non-fashion).
2. Reasoning chips — Perplexity's citations are the closest analog, but they cite *articles* not *product attributes*; our move is structurally distinct. Defensible.
3. Persistent memory — **Perplexity closed this gap in 2026**; no longer a unique moat. We must compete on transparency-of-memory ("here's what I remember, edit it"), not memory-itself.
4. Outfit/bundle — wide open. **Strongest white space on the board.** Defensible if we ship it well.
5. Merchant transparency — **completely uncontested across the matrix.** Highest-leverage move per unit of work. Defensible.
6. Photo → style — **Perplexity AND Daydream both shipped this in 2026.** Move is commoditizing fast. Defensible only as table-stakes, not differentiator.
7. Shareable lookbook — **uncontested.** No competitor ships a server-rendered, OG-tagged shareable session page. Defensible and viral-loop relevant.

---

## Threat assessment

- **Highest probability threat (next 6 months):** **Perplexity Shopping.** They closed the memory gap, shipped Snap to Shop, added in-app checkout via PayPal, and run a free Merchant Program that directly competes with Shopify MCP for catalog mindshare. They are the most aggressive product team in the space and have the user base. If they ship a collage layout or a shareable lookbook, two of our moves are gone.
- **Lowest probability but highest impact:** **Meta agentic shopping** — Manus acquisition fell through (China blocked Apr 2026), so they're slower than feared, but if they marry Instagram visual graph + WhatsApp distribution + Shop catalog, they own the visual-first wedge structurally. 6-month probability: low. 18-month probability: high. We should not architect against Meta today but should monitor.
- **Our moat (defensible 6 months):**
  1. **Merchant transparency** as a default UX surface (Move 5) — uncontested.
  2. **Shareable lookbook** as a viral loop (Move 7) — uncontested.
  3. **Bundle/outfit completion** as a first-class action (Move 4) — uncontested.
  4. **Velocity + opinionated UX** against Shop app's institutional caution.
- **Commoditizing moves (don't rely on these as differentiators):**
  - **Photo → style search (Move 6)** — Perplexity and Daydream both shipped in 2026. Table stakes now, not moat.
  - **Persistent memory (Move 3)** — Perplexity closed the gap. We win on *transparency of memory*, not memory itself.
  - **MCP catalog access** — opened to all developers in Winter '26. Structural advantage is gone; we now compete on what we *do* with the data.

---

## Opportunity windows (Stage-2 fodder)

Specific, not aspirational. Each is a thing no competitor in this scan does, that we could realistically ship in a Stage-2 cycle (post-launch hardening).

1. **"Why this, not that" comparison overlay on shortlist.** When the user has ≥2 items in Love lane, an inline diff view that *names the trade-off* ("A is $40 cheaper but ships from China; B is EU-warehoused and has free returns"). Perplexity, Daydream, ChatGPT none do this. Builds on Moves 2 + 5. ~1 cycle of work.
2. **Provenance-as-default chip set.** Move 5 already promises returns/shipping/carbon. Add **country-of-origin** and **secondhand availability** (Phia-style, but native) as first-class chips. This attacks the values-led shopper segment (Sasha persona) and there's a brand-safety moat against Phia (data-overreach scandal). Builds on Move 5. ~0.5 cycle.
3. **Shareable lookbook → live collaboration mode (opt-in).** Q4 PRODUCT.md flagged snapshot vs live as an open question. After launch, ship live mode behind a toggle: a partner can comment on items in your shortlist. No competitor in this matrix does collaborative shopping. Builds on Move 7. ~1 cycle.
4. **"Outfit math" — total-cost-of-completion banner on bundles.** Move 4 is uncontested. Stage 2: surface "total $X, ships from 2 merchants, arrives by [latest of dates], combined carbon $Y." Real decision support, not just visual coherence. ~0.5 cycle.
5. **Merchant-transparency leaderboard surfaced in About-you card.** Aggregate which merchants the user has shortlisted from across sessions, with their average returns-policy-quality. Turns Move 5 into a personalised meta-signal ("you keep buying from EU brands with free returns — should we filter to those by default?"). ~0.5 cycle.
6. **Public "what we won't do" page linked from About-you.** Anti-goals page (no sponsored ranking, no affiliate kickbacks, no live HTML capture). After Phia's data-overreach story, transparency-about-data-policy is a wedge against the funded incumbents. Marketing-shaped, but reads as product. ~0.25 cycle.

---

## Sources

- [Perplexity Shopping that puts you first](https://www.perplexity.ai/hub/blog/shopping-that-puts-you-first) — official roundup of memory, Snap to Shop, virtual try-on, PayPal Instant Buy, Merchant Program.
- [Snap–Perplexity $400M deal ended, TechCrunch May 2026](https://techcrunch.com/2026/05/06/snap-says-its-400m-deal-with-perplexity-amicably-ended/) — distribution loss for Perplexity.
- [Amazon agentic commerce edge, PYMNTS 2026](https://www.pymnts.com/amazon/2026/amazon-says-rufus-gives-it-an-edge-in-agentic-commerce-race/) — 115% MAU growth, $12B incremental.
- [Rufus 365-day price history, PPC Land](https://ppc.land/amazons-rufus-now-shows-a-full-year-of-price-history-to-50m-shoppers/) — confirmed update.
- [Rufus Scheduled Actions, Paz.ai](https://www.paz.ai/blog/amazon-rufus-scheduled-actions-sellers-walled-garden) — auto-buy rollout Apr 2026.
- [Amazon agentic commerce hiring, TechBriefly May 2026](https://techbriefly.com/2026/05/11/amazon-launches-agentic-commerce-team-ai-integrations/) — 40-engineer team.
- [OpenAI revamps shopping, CNBC Mar 24 2026](https://www.cnbc.com/2026/03/24/openai-revamps-shopping-experience-in-chatgpt-after-instant-checkout.html) — Instant Checkout pivot details.
- [Forrester on OpenAI pullback](https://www.forrester.com/blogs/what-it-means-that-the-leader-in-agentic-commerce-just-pulled-back/) — strategic framing.
- [TechCrunch on OpenAI shopping struggles](https://techcrunch.com/2026/03/24/openais-plans-to-make-chatgpt-more-like-amazon-arent-going-so-well/) — only ~30 merchants live.
- [Klarna Agentic Product Protocol, Financial Technology Report](https://thefinancialtechnologyreport.com/klarna-expands-ai-powered-shopping-experience-with-new-features/) — 100M+ products feed.
- [Klarna in Google Gemini, PYMNTS](https://www.pymnts.com/buy-now-pay-later/2026/google-embeds-klarna-bnpl-into-gemini-ai-conversations/) — BNPL embed.
- [Daydream iOS 26 Liquid Glass app, PR Newswire Nov 2025](https://www.prnewswire.com/news-releases/daydream-launches-design-forward-iphone-app-to-advance-ai-driven-fashion-search-302618206.html) — visual-intelligence screenshot feature.
- [Daydream App Store reviews](https://apps.apple.com/us/app/daydream-ai-for-fashion/id6692634357?see-all=reviews&platform=iphone) — user reactions.
- [Phia $35M raise Jan 2026, TechCrunch](https://techcrunch.com/2026/01/27/phoebe-gates-and-sophia-kiannis-phia-raises-35m-to-make-shopping-fun-again/) — fundraise + product status.
- [Phia data overreach, Fortune Nov 2025](https://fortune.com/2025/11/15/phia-ai-shopping-agent-bill-gates-phoebe-gates-sophia-kianni-collecting-user-data/) — Safari extension HTML capture story.
- [Phia data analysis, NowSecure Nov 2025](https://www.nowsecure.com/blog/2025/11/19/inside-a-mobile-apps-data-overreach-what-our-phia-safari-extension-analysis-reveals/) — technical breakdown.
- [Shopify Winter '26 Edition merchant news](https://www.shopify.com/news/winter-26-edition-merchant) — Sidekick Pulse, Agentic Storefronts.
- [Shopify Catalog rollout to all devs, Revize](https://www.revize.app/blog/shopify-ai-toolkit-guide) — MCP commoditization confirmed.
- [Rye agentic commerce landscape](https://rye.com/blog/agentic-commerce-startups) — startup taxonomy (Lemrock, Wildcard, Swap, Sitefire, etc.).
- [Modern Retail AI shopping agent wars](https://www.modernretail.co/technology/why-the-ai-shopping-agent-wars-will-heat-up-in-2026/) — Amazon-Perplexity lawsuit, OneOff, Swap, Daydream context.
- [Lemrock €6M raise, EU-Startups Mar 2026](https://www.eu-startups.com/2026/03/paris-based-lemrock-raises-e6-million-to-help-brands-sell-within-ai-agents-like-chatgpt-and-claude/) — Paris middleware play.
- [China blocks Meta–Manus, NPR Apr 2026](https://www.npr.org/2026/04/27/g-s1-118892/china-blocks-meta-from-buying-ai-startup-manus) — slowdown signal for Meta agentic shopping.
- [Google AI Mode shopping features, Search Engine Land](https://searchengineland.com/google-shares-whats-next-in-digital-advertising-and-commerce-in-2026-468995) — UCP coalition details.
- [Ulta + Google Gemini, Google press Apr 2026](https://www.googlecloudpresscorner.com/2026-04-22-Ulta-Beauty-and-Google-Introduce-Gemini-Enabled-Shopping-Experiences-That-Streamline-Beauty-Discovery-and-Purchase) — vertical retailer pattern.
