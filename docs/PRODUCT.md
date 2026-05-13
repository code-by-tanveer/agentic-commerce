# PRODUCT — Agentic Commerce

Owner: Product Owner (sub-agent). This is the canonical product brief. Other agents (architect, design lead, engineers, QA, reviewers) read this before every cycle. Do not edit without an ADR.

Last updated: 2026-05-13.

---

## 1. One-line description

A chat-native shopping agent that helps you *decide what to buy*, not just *find* it — visually, transparently, with memory.

(19 words.)

---

## 2. Vision

Agentic Commerce is a conversational shopping companion built on the Shopify Catalog MCP that prioritises **trust-led discovery** over checkout speed. It is for people who shop the way they browse Pinterest or read reviews — exploratory, taste-driven, suspicious of opaque AI picks — and who get burned by Amazon's sponsored sludge, ChatGPT's flat link lists, and Klarna's coupon-bot tone. It has to exist now because Shopify just opened the Catalog MCP to anyone (Nov 2025) and no incumbent has matched conversational UX to *visual, memory-aware, transparent* discovery — there is a six-month window before the next wave of clones ships.

---

## 3. Target user

### Primary persona — "Mara, the taste-led generalist shopper"

- **Age range:** 26–38.
- **Behaviour:** Shops across categories (apparel, home, gifts, occasional electronics). Starts most sessions with a vibe, not a SKU ("something for a beach wedding", "a desk lamp that won't look like an Ikea cliché"). Cross-references Pinterest, Reddit, TikTok before committing. Will abandon a cart to check returns policy. Buys ~2–4×/month online for self, plus gifts.
- **Why incumbents fail her:**
  - **Amazon (incl. Rufus):** sponsored-first ranking she actively distrusts; Rufus answers questions but doesn't help her *decide*; catalog is dominated by Chinese white-label SKUs she can't differentiate. (Evidence: persistent Reddit complaint thread r/Amazon "Rufus is useless for actually picking" + Marketplace Pulse coverage of 70%+ sponsored real-estate on results pages.) [ASSUMPTION — exact thread URLs not re-verified; trend is well-documented]
  - **ChatGPT Shopping:** returns a flat link list with thumbnails, no comparison structure, no memory of her sizing/budget across the session, and in Q1 2026 they walked back Instant Checkout — confirming the product is in flux. (Evidence: CNBC Mar 24 2026 reporting that OpenAI revamped the shopping experience, deprioritising native checkout after only ~30 Shopify merchants ever went live; Forrester framed it as "the leader in agentic commerce just pulled back".)
  - **Klarna AI:** assistant tone is transactional/coupon-led ("save $4 with BNPL"), assumes she already knows what she wants; no visual layout. (Evidence: their public demo videos focus on payment and BNPL prompts, not discovery.)
  - **Daydream (iOS, late 2025):** beautiful visual feed but iOS-only, fashion-only, single-merchant feel, and no transparent reasoning — it picks for you and you don't know why. (Evidence: TechCrunch launch coverage Nov 2025; App Store reviews flag "why this?" as the top question.) [ASSUMPTION — review aggregation paraphrased]

### Secondary personas

- **"Jordan, the gift-giver under deadline" (32, parent, 4 gifts/year on hard deadlines).** Wants *one* good answer fast and a confidence signal it'll arrive in time. Incumbents fail by burying shipping-speed estimates two clicks deep.
- **"Sasha, the values-led shopper" (28, EU, cares about provenance, returns, carbon).** Wants merchant transparency surfaced *before* clicking out. Incumbents fail by treating ethics as a niche filter, not a default chip.
- **"Priya, the Indian English-speaking early tester" (29, Bengaluru/NCR, code-switches Hinglish, ships-to IN).** Added 2026-05-13: friends-of-the-builder cohort skews here, so they are the actual first-test demographic, not US/EU Mara. Reads English fluently but expects INR-aware budget chips, "ships to India" surfaced as a first-class merchant filter, and tolerates 14-day shipping when the merchant is honest about it. Incumbents fail by defaulting to USD price strings and hiding ships-to until checkout. Treat this persona as a launch-blocker for the validation plan in §4 — not an i18n stretch goal.

---

## 4. North-star metric

**% of sessions in which the user shortlists ≥2 distinct products** (drags / taps into Love or Maybe lanes, or explicitly saves).

Why this and not GMV / click-through / time-on-site:
- It measures *deciding*, not browsing or buying. Browsing is cheap; buying is downstream and noisy (we don't own checkout).
- It penalises both "user got nothing useful" (0 shortlisted) and "user got one obvious answer they'd have found anyway" (1 shortlisted).
- It rewards the moat: visual collage + reasoning chips + memory should make shortlisting *feel earned*, not random.

The PO considered making this conjunctive ("shortlist ≥2 AND tap ≥1 chip detail" — rewards deciding-with-reasoning). Rejected: a single clean metric is easier to react to than a compound one; chip-tap rate is captured below as a guard.

### Launch thresholds (from the market-analysis 30-day sequence)

- **≥ 35%** sustained over a 7-day rolling window → **scale signal**: the moat works for the wedge persona; double down on distribution.
- **20–34%** sustained → **iterate signal**: the product works for *some* users; focus polish + segment narrowing before more distribution.
- **< 20%** sustained → **pivot signal**: the seven-move bundle isn't landing for the generalist Mara wedge; narrow to a single vertical (home or wedding per market-analysis-2026-05.md § "Target segments").

### Supporting / guard metrics

- **Median time-to-first-shortlist** (seconds from session start). Target: < 90s. Reflects whether the agent gets to "good enough to consider" fast.
- **Reasoning-chip tap rate** (taps per product card shown). **Guard, not north-star.** Target: ≥ 0.3. If users never tap the chips, the transparency move isn't earning its space — kill or redesign.
- **Session share rate** (`/s/[id]` opens per session). Target: ≥ 5%. Distribution loop health.

### Pre-launch validation plan (added 2026-05-13)

The north-star above is a *post-launch* signal; the gate for *whether to launch* is qualitative. Before public launch we will run the live app past **at least 3 real friends-of-the-builder** (primary cohort: Priya-shaped, see §3) and capture their unmoderated first-five-minutes session.

What to ask each tester (no script beyond these five prompts, in order):
1. "Open the URL on your phone. Type something you'd actually shop for. Don't ask me anything for 5 minutes."
2. "What did you think the app was, before you typed?"
3. "Walk me through what you saw. Anything confusing, broken, or boring?"
4. "Would you share this session with a friend right now? Why or why not?"
5. "Would you come back tomorrow if a friend texted you this link?"

What to measure (recorded by the observer, not the tester):
- **Time-to-first-shortlist** in seconds (manual stopwatch). Target: < 120s on mobile.
- **Tool-call visibility complaint** (yes/no): did the tester ask "what is it doing?" while it streamed.
- **Stuck/abandon points**: every moment the tester paused > 10s without typing or tapping.
- **Share-attempt** (yes/no): did they spontaneously hit Share or screenshot.
- **Comeback-intent** (yes/no/maybe): verbal answer to prompt 5.

Green-light threshold for launch: **≥ 2 of 3 testers shortlist ≥ 2 products in their first 5 minutes, AND ≥ 2 of 3 answer "yes" to comeback-intent, AND zero testers hit a stream-state error that requires reload.** Anything weaker is iterate-not-launch.

---

## 5.0 Move zero — boot & resilience (the prerequisite)

Added 2026-05-13 after the first real local boot revealed eight cascade bugs that six polish cycles never caught. Every cycle PASS gate must run §5.0 BEFORE §5.1–§5.7. A green §5.1–§5.7 with a failing §5.0 is a FAIL.

The seven UX moves describe what the app *does in the happy path*. They never describe what makes it *a working app*. §5.0 closes that gap with acceptance criteria the cycle process can mechanically verify:

(a) **Cold boot.** A fresh clone, `cp backend/.env.example backend/.env`, `npm install`, `npm run dev:backend && npm run dev:frontend` — both servers reach steady state and accept a chat turn, **zero manual edits to source or .env**. `.env.example` values must pass the same Zod validation as production (empty strings fail at write time, not boot time — e.g. `SHOPIFY_TOKEN_URL=` is forbidden; comment the line out instead).

(b) **Greeting guard.** The agent responds to `hi`, `hello`, `thanks`, and `what can you do?` *without* invoking any tool. Tool dispatch fires only for shopping-shaped queries (named product type, vibe, occasion, budget, recipient, or "find/recommend/show me" framing).

(c) **Tool-call contract.** The active model's tool-call format is asserted against our dispatcher. Any `<function>`-style XML or raw protocol token that reaches the user-visible content stream is a failed turn. Switching models (env `GROQ_MODEL`) requires re-running the contract.

(d) **Stream-state invariant.** After any error (network drop, 429, parser failure, abort), the FE state machine returns to idle within one event-loop tick: the input is re-enabled and the Retry button is clickable and effectful.

(e) **Visual chrome contract.** Interactive primitives in a horizontal row share a single height token (per `DESIGN.md §2.9`). The empty-chat shell renders correctly at 360 / 768 / 1280 widths.

(f) **Auto-scroll.** The viewport follows the latest assistant turn unless the user has scrolled away *via a real gesture* (wheel, touchmove, page keys). Document-growth during streaming must never be misread as user intent.

(g) **Deploy artifacts exist.** `Dockerfile`, `fly.toml` (or chosen equivalent), and an end-to-end smoke test (`npm run e2e` against fresh servers) are committed and green. DEPLOY.md describing them is not sufficient.

The post-mortem from 2026-05-13 (see `docs/CYCLES/post-mortem-first-boot.md` once written) identified the meta-failure: the polish-cycle process rewarded artifacts that prove **code exists** (tsc clean, tests green, ADRs filed) over artifacts that prove **the product runs**. §5.0 is the correction.

---

## 5. The seven UX moves — restated as acceptance criteria

These are the moat. Every cycle review checks the relevant subset against PASS/FAIL — **after** §5.0 passes.

1. **Visual-first collage layout.**
   *Acceptance:* The same product result set can be toggled between list view and a Pinterest-style masonry collage; the toggle persists for the session; products in collage retain their reasoning chips and merchant info on hover/tap.

2. **Reasoning chips on every product.**
   *Acceptance:* Every rendered product card shows ≥2 chips computed from current preferences + product metadata. The chip vocabulary is closed: `size_match`, `discount`, `price` (over-budget warning), `fast_shipping` (merchant ships in ≤3 days), `ships_to_match` (merchant ships to the user's preferred country — see ADR-0005), `ethics` (closed taxonomy: sustainable, fair-trade, organic, b-corp, women-owned, small-batch, vegan, recycled), `shipping`, `low_stock`. Each chip is tappable and reveals a one-sentence `detail`; chips degrade silently when data is missing (never show a chip with no backing data). Ranking honors `RANK` in `reasoning.ts`.

3. **Persistent preference memory card — with explicit tiers.**
   *Acceptance:* A visible "About you" panel shows the agent's current understanding of the user's **identity-tier** preferences only. Task-tier knobs (budget, shipping speed) are bound to the current shopping topic and surface as per-message filter chips (via the `appliedFilters` field on `products` events), not in the "About you" panel. Identity edits round-trip to SQLite and survive page reload; task-tier values evict on topic-shift OR 30-minute idle and never leak into a new shopping topic. The closed vocabulary now partitions as:

   | Tier        | Keys                                       | Storage                     | Lifetime                                          |
   |-------------|--------------------------------------------|-----------------------------|---------------------------------------------------|
   | Identity    | `ships_to`, `palette`, `ethics`, `size`*   | SQLite `preferences` table  | Survives across topics + reloads                  |
   | Task        | `budget`, `shipping_speed`, `shopping_for` | In-memory scratchpad        | Evicts on topic-shift OR 30-min idle              |
   | Scoped (v1.5) | `size:<category>` (e.g. `size:shoe`)     | SQLite with a category key  | Identity-like; **deferred** — *see future ADR*    |

   *`size` stays in the identity tier today for back-compat; v1.5 will move it to the scoped tier so `size:shoe=8` and `size:dress=M` can coexist. Future ADRs may formalise (a) the tier partition itself and (b) the scoped-tier migration; not written yet.

4. **Outfit / bundle completion.**
   *Acceptance:* On any product, the user can ask "what would go with this?" or tap the Pair-with affordance and receive a 2–4 item bundle rendered as a single coordinated card with a combined "save outfit" action. Bundles are not just three random products — each item carries a one-line "why this with that" rationale derived from real catalog data (shared merchant / matching tag / similar price band / shared shipsTo region); rationales are omitted, not invented, when no signal exists.

5. **Merchant transparency cards.**
   *Acceptance:* Expanding any product card surfaces seller name, returns policy badge, shipping-days estimate, customer rating + review count, country-of-origin ("Made in {x}"), the markets the merchant ships to (per ADR-0005), and (where available) a carbon-shipping note. Absent fields show "merchant didn't publish this" rather than a blank or a fake number. The merchant block reads as a single trust-instrument, not a data dump.

6. **Photo → style search.**
   *Acceptance:* The user can paste/drop an image into the input bar; within 5s the agent shows the extracted attributes (as editable chips) and a result set; if vision extraction fails or returns low confidence, the agent says so and asks a clarifying question rather than guessing.

7. **Shareable session summary.**
   *Acceptance:* At session end (explicit "share" action or a 5-minute idle), a server-rendered `/s/[id]` page shows the user's shortlist, merchants, totals, and a sentence-or-two recap; the page is OG-tagged, loads without JS, and is viewable in an incognito window.

---

## 6. Anti-goals (what we will NOT build)

Be ruthless. If a feature isn't on this list and isn't in the seven moves, we don't build it this cycle.

- **No embedded in-chat checkout.** Redirect to the merchant's Shopify-hosted checkout. **Strongly validated by ChatGPT's Instant Checkout pivot (CNBC Mar 24 2026):** the best-funded incumbent in the space onboarded only ~30 Shopify merchants in six months before pulling back to a discovery-first posture. Embedded checkout cost them sales-tax remittance complexity, no multi-item carts, no loyalty integration, and merchant onboarding friction — all on top of the PCI scope, refund disputes, and integration overhead we already wanted to avoid.
- **No multi-user accounts / auth.** Sessions are anonymous, identified by cookie. Auth doubles the surface area and isn't needed to prove the discovery moat. Revisit only if shareable sessions need owner-only edit.
- **No live inventory beyond what the MCP returns at query time.** We're a discovery layer, not a stock-management layer. If a product sold out between query and click-through, that's on the merchant page.
- **No native mobile app.** Mobile web (PWA-grade) is in scope; native is a year of work for marginal lift over a polished responsive site. Daydream went iOS-first and is now stuck rebuilding for Android — we don't repeat that.
- **No walled-garden catalog.** We don't curate a "preferred merchant list" or take affiliate kickbacks that bias ranking. The MCP is the source of truth; ranking is preference-driven. Trust dies the first time a reviewer notices we're pay-for-placement.
- **No "AI personality" / mascot.** Granola's "invisible AI" principle. The agent is a quiet professional, not a chirpy assistant with a name and emoji.
- **No price-tracking, deal-alert, or BNPL features.** That's Klarna/Honey territory. Stepping into it dilutes positioning. Revisit only post-launch.
- **No multi-turn negotiation with merchants.** No "ask the seller for a discount" loop. Out of scope; legally and operationally messy.
- **No CJK / non-Latin font fetch on every request.** The OG image route fetches Instrument Serif + Noto Sans JP at module-cache time (cold spin only). Pan-CJK + Devanagari + Arabic are out of scope until Y2 i18n bundles justify the bandwidth — confirmed in `frontend/app/api/og/route.tsx`. We accept that the OG card for Hangul / Devanagari gist text falls back to system serif until then; the page itself renders fine (browser fonts).
- **No persistent accounts before sustained 5k MAU.** The anti-account stance in §6 is correct at our reach. Trigger to revisit (Q7): month-12 MAU > 5k sustained. Until then, anonymous sessions + cookie are the identity; an opt-in Pro tier with cross-device sync waits behind an ADR re-opening this stance.
- **No silent IP-geo inference.** We never use `request.ip` to set `prefs.ships_to`. The user's shipping country comes from explicit preference, the request's `Accept-Language` header, or the cookie state — in that order. Per ADR-0005 + Aleksey's R4 audit: silent geolocation is the kind of "AI assumes" the trust-led wedge actively distrusts.

### Cycle 7 anti-goals (added 2026-05-13)

Even though the core now runs, the launch-prep cycle still says no to a long list. Spelling out the boundary so a reviewer can reject a PR by pointing at this section:

- **No accounts, no login, no email capture.** Chat history (the Cycle-7 AC) lives in the existing anonymous cookie. We do not add a sign-up flow, magic links, OAuth, or any "save your shortlist to your account" affordance.
- **No payment, no checkout UI, no card form.** The Buy button is and remains a redirect to the merchant's Shopify-hosted page. Trust copy clarifies currency/country (Cycle-7 AC) but we never collect a payment method or render a price-confirm step.
- **No per-card client analytics tracking.** No Segment, no Mixpanel events per chip-tap, no third-party pixel on the share page. The north-star is computed server-side from session events we already log; granular product-level click telemetry is out of scope and out of line with the transparency wedge.
- **No push notifications, no email digests, no "we found new things for you".** One-shot pull-only sessions. Re-engagement is a Stage-2 question.
- **No multi-device sync.** Cookie is the identity (§6). A user opening the app on a second device sees a fresh session by design.
- **No new MCP integrations beyond Shopify Catalog.** No Etsy, no eBay, no Faire — even if a friend-of-the-builder asks. The wedge is "Shopify merchants done right", not "every store on the internet".
- **No new languages, no RTL, no i18n bundles.** Priya (§3) reads English fluently; that is enough to validate. Localised UI strings are Stage-2.
- **No A/B testing infrastructure.** With <100 testers planned in the validation window, A/B is noise. Decisions are made by reading transcripts, not p-values.

---

## 7. Cycle goals — what the user will *experience*

One line per cycle, framed as user-visible outcomes. Implementation tasks belong in `docs/CYCLES/cycle-N.md`.

- **Cycle 0 (now):** No user-visible change. Foundations: vision, architecture, design tokens, ADRs are in place so cycles 1–6 don't rediscover decisions.
- **Cycle 1 — Phase A:** "The chat actually thinks." User types a query, sees the agent's tool use (subtle inline status), then a streamed answer with product cards. Follow-ups ("show me cheaper") work without restating context.
- **Cycle 2 — Phase B:** "The chat remembers me." User mentions a size or shipping pref once; an "About you" card appears; the next search shows a `size 8 match` chip on relevant products. Every card now expands to show merchant info.
- **Cycle 3 — Phase C-1:** "The chat looks like Pinterest, not Excel." User flips to collage view, drags products into Love/Maybe/Skip lanes, and asks for a coordinated outfit/bundle on any anchor product.
- **Cycle 4 — Phase C-2:** "The chat sees what I see." User pastes a screenshot from Instagram or Pinterest; within seconds, similar products land in the canvas with the extracted style attributes visible and editable.
- **Cycle 5 — Phase D:** "I can show this to a friend." User hits "share session"; a polished public lookbook page opens with their shortlist, merchants, and recap, OG-tagged for clean previews on iMessage / Twitter / Slack. Mobile polish + a11y done.
- **Cycle 6 — Hardening:** No new visible features. Stream latency, error states, Lighthouse ≥90 mobile, security review clean. The app feels *finished*.
- **Cycle 7 — Pre-launch sharpening (added 2026-05-13):** "The chat remembers our last conversations, tells me where I'm buying from, and never goes blank on me." Five user-visible outcomes, each a PASS/FAIL acceptance criterion:

  1. **Chat history (last 5 chats).** On the same device/cookie, the user can open a left-rail menu listing their **last 5 chat sessions** (title = first user message truncated to 60 chars, plus relative timestamp), pick any one, and see the prior turns restored — messages, shortlist, view-mode, preferences — within 500ms of click; sessions older than 90 days are dropped server-side; switching sessions clears in-flight streams cleanly. (Confirms the gap at `frontend/hooks/useConversation.tsx:144-149` where only sessionId + view-mode + shortlist + preferences round-trip — not messages.)
  2. **Pair-with feedback signal end-to-end.** When the user accepts or rejects a bundle item from a Pair-with card, the choice is written to the session preference store as `outfit_signal: {product_id, decision, anchor_id, ts}`, surfaces as a "you said no to leather belts here" hint on the next Pair-with for the same anchor category, and is visible/clearable from the About-you panel; the heuristic in `outfitCategories.ts` is not changed in Cycle 7 — only the feedback channel is wired.
  3. **Empty-state "no results" component.** When the catalog query returns zero products (after filtering by the user's prefs), the chat renders a single dedicated `<NoResults>` component with three actionable affordances ("relax a filter", "broaden the query", "show me anyway without ships-to") rather than letting the model improvise prose; the affordances dispatch real follow-up turns; the component is rendered iff `products.length === 0` in the final tool call, never on partial results.
  4. **Buy-button trust copy (currency + country).** Every product card's CTA reads `Buy on {merchantName} ({currency}, ships to {country})` where currency is taken from the catalog payload and country is the merchant's primary ships-to (or "ships worldwide" if the array contains 5+ countries); when either field is absent the CTA degrades to `Buy on {merchantName}` with a tooltip "merchant didn't publish this", never a guess; copy is visible on hover *and* on mobile tap.
  5. **Moodboard image visible to the user.** When a user uploads an image, the input bar and the resulting assistant turn both show a small thumbnail of *their own* image (rendered from a same-origin `/api/uploads/[token]` proxy, not the raw `signed:<token>` URL) so they can confirm which photo drove the search; thumbnail is removable; if the proxy fails the chip-attribute UI still works and the failure is acknowledged inline.

### Beyond Cycle 6 — observe → defend → monetize → specialise

The seven UX moves are committed through Cycle 6; cycle-by-cycle planning for post-launch lives in a future `docs/POST_LAUNCH.md` to be authored after the Day-30 readout. The arc we expect:

**1. Observe (Days 1–30 post-launch).** No new cycles. Run the launch sequence in `docs/walkthroughs/launch.md` §4. Watch the north-star (≥35% / 20–34% / <20% triggers in §4). Resist the temptation to ship.

**2. Defend the uncontested moves (Cycles 7–9).** Per the competitive matrix in `docs/polish-round-4/competitive-analysis-2026-05.md`, three of the seven moves are uncontested across the top six competitors:
- **Move #4, outfit / bundle completion** — deepen with multi-anchor bundles, save-and-name, "what's missing from this look".
- **Move #5, merchant transparency cards** — extend with merchant-history (returns rate, average ship time, dispute resolution score) where the MCP surfaces it.
- **Move #7, shareable lookbook** — gift-mode share that hides the recipient's identity, multi-person sessions, "remix this lookbook" affordance.

**3. Monetize the trust-safe paths (Cycles 10–11).** Per ADR-0006, two pre-cleared paths: uniform Shopify-affiliate-pool (Wirecutter-style, fully disclosed) and B2B embedded widget. Both ship with a `/how-we-make-money` page linked from the trust footer. Order is data-driven: revenue need vs. trust cost from the disclosure.

**4. Specialise (Cycles 12+).** If the north-star pivots us into a single vertical (home or wedding per the market analysis), the next cycles deepen the vertical's vocabulary (kitchen-renovation-mode, registry-share-with-co-host). Don't generalize back from a successful narrow.

**Commoditize, don't defend:** Move #6 (photo→style) and Move #3 (persistent memory) — Perplexity caught up in 2026. Continue to ship them well; stop investing them as moats.

Stage-2 fodder lives in `docs/polish-round-4/competitive-analysis-2026-05.md` § "Opportunity windows" — six concrete cycles' worth of work all defended by the matrix above.

---

## 8. Open product questions

Three open, four resolved. Resolved items kept (briefly) for traceability.

**Open:**

- **Q3 (partially commoditizing — Stage-2 follow-up):** The photo→style capability is no longer a differentiator (Perplexity Snap to Shop + Daydream iOS-26 screenshot-anywhere, both 2026). The kill-switch threshold still holds operationally — if <5% of sessions use it at week 2 post-Cycle-4, we stop spending Groq vision tokens. The strategic frame: **we differentiate on transparency-of-extraction (visible, editable chips) — not on the vision capability itself.** Cycle 4 verified the chips are user-editable; Stage-2 review will confirm the moat held.
- **Q6 (revisit at month 3 post-launch):** Should we relax the "no walled-garden catalog" anti-goal (§6) to allow a uniform Shopify-affiliate-pool revenue model (Wirecutter-style, fully disclosed)? ADR-0006 pre-decides that a uniform per-merchant rate with algorithmic ranking unchanged does *not* violate the anti-goal — rankings remain preference-driven, not paid. Decision driver at month 3: revenue need vs. trust-cost from the disclosure. Don't ship without month-3 usage data.
- **Q7 (revisit when month-12 MAU > 5k):** When do we open accounts (Pro tier with cross-device memory + shareable shortlist sync)? Current anti-account stance (§6) is correct at our reach. Trigger: sustained MAU > 5k for 4 weeks; resolution: an ADR re-opening the anti-account stance.

**Resolved (kept for traceability):**

- ~~Q1 (resolved Cycle 3):~~ Three-lane Love/Maybe/Skip shortlist shipped. Round-4 personas confirmed the lane vocabulary lands; no one asked for binary Save/Pass.
- ~~Q2 (resolved Cycle 2):~~ Proactive extraction of size + budget + ships_to + shipping_speed shipped; palette + ethics + shopping_for stay user-initiated. The closed ethics taxonomy (R5) + agent-prompt rules make this concrete.
- ~~Q4 (resolved Cycle 5):~~ Snapshot-vs-live share semantics: snapshot shipped (immutable, server-rendered, JS-optional). Round 4 surfaced zero user demand for live collaboration. Stage-2 may revisit as an opt-in mode but it is not an open question.
- ~~Q5 (resolved Cycle 6 + Round 4):~~ Groq reliability stress test deferred; the daily-quota narrative is honestly documented in ARCH §7 and DEPLOY.md. Real abuse risk is account-level RPD exhaustion, not RPM bursts — cheapest insurance is a Developer-tier credit-card-on-file on Day 0 (10× the limit baseline).

---

## 9. Strategic landscape (May 2026)

A 1-page addendum capturing the shifts since Cycle-0 positioning was set in Nov 2025. Detail in `docs/polish-round-4/competitive-analysis-2026-05.md` and `docs/polish-round-4/market-analysis-2026-05.md`; this section is the load-bearing summary.

**The 6-month shift.** Shopify opened the Catalog MCP to *all* developers in the Winter '26 Edition (Dec 2025). The structural data moat we relied on at Cycle 0 narrowed sharply: anyone can now get the same catalog access we have. Differentiation now lives entirely in UX — what we *do* with the data, not what data we can see. The competitive analysis (§ "Commoditizing moves") makes this concrete: MCP catalog access, persistent memory, and photo→style search have all commoditized. Reasoning chips, merchant transparency, outfit bundles, and the shareable lookbook have not. Protocols have proliferated in parallel — ACP (OpenAI + Stripe), UCP (Google + Shopify + 20+ retailers, Jan 2026), AP2, A2A, Visa TAP, plus Klarna's Agentic Product Protocol — but no protocol decision sits on our critical path: we are a consumer-side trust brand sitting *on top* of whichever pipes win.

**Threat landscape.**
- **Highest probability (6 months):** Perplexity Shopping. They closed the memory gap, shipped Snap to Shop visual search, added in-app PayPal Instant Buy, and run a free Merchant Program competing with Shopify MCP for catalog mindshare. The $400M Snapchat distribution deal collapsed in May 2026 and Amazon is suing them over crawling — both small wins for us — but they remain the most aggressive product team in the space. If they ship a collage layout or a shareable lookbook, two of our moves are gone. Watch their roadmap monthly.
- **Second-highest probability (6 months):** Amazon Rufus. Q1 2026 earnings: 115% MAU growth YoY, ~$12B incremental annualized sales. April 2026: Scheduled Actions (auto-buy on a cron) rolled out to all US shoppers; price history expanded from 90 → 365 days. Amazon is staffing a 40-engineer "Agentic Commerce Experiences" group and simultaneously blocking/suing crawlers (Perplexity). Rufus does not threaten Mara's trust positioning — she actively distrusts Amazon ranking — but it raises the ambient expectation for "an AI agent helps me shop", which lifts our category awareness for free.
- **Highest impact, lower probability (6 months):** Meta agentic shopping. Their Manus acquisition was blocked by China (Apr 2026), so the timeline slipped — but Instagram visual graph + WhatsApp distribution + FB Shops catalog is a structural visual-first wedge if they ever assemble it. 6-month probability: low. 18-month probability: high. We don't architect against them today; we monitor.
- **Validated anti-goal:** ChatGPT Instant Checkout pivot (CNBC Mar 24 2026) is the proof point. Only ~30 Shopify merchants ever went live; OpenAI moved checkout into Apps mode and refocused on discovery. Forrester called it "the leader in agentic commerce just pulled back". The redirect-to-merchant stance in §6 is now publicly defended by the largest player in the space pulling back from the alternative.
- **Wedge against the funded incumbents:** Phia's Nov 2025 data-overreach scandal (Safari extension capturing full HTML of visited pages, undisclosed) sharpens our transparency-first positioning. A "what we won't do" page linked from the About-you card is a marketing-shaped product surface (Stage-2 fodder, ~0.25 cycle of work).
- **Net-new entrants since Nov 2025** (Lemrock, Wildcard, Swap Commerce, OneOff, Sitefire) are all merchant-side enablement plays, not Mara-facing UX competitors. Swap Commerce (brand-owned-agent embeds) is the structural watch-item: if every brand ships a competent first-party agent, the case for a horizontal agent like us weakens at the margin. Their existence accelerates the case for our own B2B widget play (ADR-0006).

**Defensible moves (where we should invest deeper).** Per the competitive matrix in `competitive-analysis-2026-05.md` § "Benchmark matrix":
- **Move #4 (outfit / bundle completion):** uncontested across all 6 top competitors. **Highest white-space on the board.**
- **Move #5 (merchant transparency cards):** uncontested across all 6. Highest leverage per unit of work — and the load-bearing fact (ships-to) is now an explicit ADR (ADR-0005).
- **Move #7 (shareable lookbook):** uncontested across all 6. Viral-loop relevant; distribution moat compounds.

**Market-size honest read.** Per the May 2026 market analysis: realistic Y1 floor is **3k–8k cumulative sessions** in months 1–3 (closed beta + Product Hunt + creator seeding), **15k–40k cumulative / 2k–6k MAU** at month 12 if the north-star holds. Daydream raised $50M, launched in June 2025, has no public DAU figure — useful upper bound on what a well-funded peer can do in 18 months. We are explicitly *not* aiming for Rufus-scale; the wedge is the 26–38yo taste-led shopper who already has Pinterest, Substack, and a Reddit habit.

**What this means for cycle planning.** Cycles 1–6 remain as committed. Stage-2 prioritisation, when authored, should weight investment toward Moves #4, #5, #7 and away from deeper builds on #3 and #6 (where competitors have caught up and any further investment is parity-spend, not moat-spend). See § 7 "Beyond Cycle 6" for the framing.

---

## Appendix — evidence & sources

Quick-reference list of public signals informing the positioning above. Full detail in `docs/research/2026-05-12-competitor-scan.md` and the May 2026 refresh in `docs/polish-round-4/competitive-analysis-2026-05.md`.

- ChatGPT Shopping rolled back default Instant Checkout, Q1 2026 — validates "redirect-to-merchant" anti-goal. (CNBC Mar 24 2026; Forrester commentary; TechCrunch noting only ~30 merchants ever went live.)
- Shopify opened the Catalog MCP from gated-partner pilot to all developers in the Winter '26 Edition (Dec 2025) — the structural data moat narrowed; differentiation now lives in UX.
- Shopify Agentic Storefronts (Winter '26): merchants syndicate catalogs to ChatGPT, Microsoft Copilot, Perplexity natively. Universal Commerce Protocol coalition (Walmart, Target, Etsy, Wayfair).
- Daydream launched iOS Nov 2025; Q1 2026 doubled down with iOS-26 Liquid Glass + Apple Visual Intelligence integration (screenshot-anywhere → shop). Still iOS-only, still fashion-only. The Cycle-0 assumption that they were *temporarily* iOS was wrong; iOS is the strategic stance.
- Perplexity Shopping (2026): shipped persistent memory, Snap to Shop, virtual try-on, PayPal Instant Buy, free Merchant Program. $400M Snap distribution deal collapsed May 2026; Amazon suing them over crawling.
- Amazon Rufus (Apr 2026): Scheduled Actions (auto-buy on a cron) rolled out to all US shoppers; 365-day price history; 40-engineer agentic-commerce team staffing up. Walled garden hardening.
- Phia raised $35M (Notable, Khosla, Kleiner Perkins) Jan 2026 — but Nov 2025 data-overreach incident (Safari extension capturing full HTML of every visited page, undisclosed) is their open trust wound. Transparency-first positioning is the wedge.
- Klarna Agentic Product Protocol (live: 100M+ products / 400M+ prices across 12 markets) and Klarna-in-Gemini BNPL embed — they want to be infrastructure as much as a consumer app. Identity is muddy.
- Rye repositioned as the universal checkout API for AI agents (15k+ merchants, sub-10s Amazon/Shopify checkout). Direct beneficiary of OpenAI's Instant Checkout retreat. Potential partner if we ever ship purchase (we won't, per §6).
- Net-new entrants since Nov 2025: Lemrock (€6M, Paris), Wildcard (YC), Swap Commerce, OneOff, Sitefire. All merchant-side enablement, not Mara-facing UX competitors.
- Meta agentic shopping: Manus acquisition blocked by China Apr 2026 — slowed but not stopped. 18-month watch item.

Anything marked `[ASSUMPTION]` should be re-verified before Cycle 5 (launch prep). If a fact in this doc turns out wrong, file an ADR in `docs/adr/` documenting the correction and the downstream impact.
