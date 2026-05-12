# PRODUCT — Agentic Commerce

Owner: Product Owner (sub-agent). This is the canonical product brief. Other agents (architect, design lead, engineers, QA, reviewers) read this before every cycle. Do not edit without an ADR.

Last updated: 2026-05-12.

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
  - **ChatGPT Shopping:** returns a flat link list with thumbnails, no comparison structure, no memory of her sizing/budget across the session, and as of early 2026 they walked back Instant Checkout — confirming the product is in flux. (Evidence: OpenAI's own Feb 2026 changelog removing Instant Checkout default; Stratechery commentary.) [ASSUMPTION — paraphrased from public reporting]
  - **Klarna AI:** assistant tone is transactional/coupon-led ("save $4 with BNPL"), assumes she already knows what she wants; no visual layout. (Evidence: their public demo videos focus on payment and BNPL prompts, not discovery.)
  - **Daydream (iOS, late 2025):** beautiful visual feed but iOS-only, fashion-only, single-merchant feel, and no transparent reasoning — it picks for you and you don't know why. (Evidence: TechCrunch launch coverage Nov 2025; App Store reviews flag "why this?" as the top question.) [ASSUMPTION — review aggregation paraphrased]

### Secondary personas

- **"Jordan, the gift-giver under deadline" (32, parent, 4 gifts/year on hard deadlines).** Wants *one* good answer fast and a confidence signal it'll arrive in time. Incumbents fail by burying shipping-speed estimates two clicks deep.
- **"Sasha, the values-led shopper" (28, EU, cares about provenance, returns, carbon).** Wants merchant transparency surfaced *before* clicking out. Incumbents fail by treating ethics as a niche filter, not a default chip.

---

## 4. North-star metric

**% of sessions in which the user shortlists ≥2 distinct products** (drags into Love/Maybe lanes, or explicitly saves).

Why this and not GMV / click-through / time-on-site:
- It measures *deciding*, not browsing or buying. Browsing is cheap; buying is downstream and noisy (we don't own checkout).
- It penalises both "user got nothing useful" (0 shortlisted) and "user got one obvious answer they'd have found anyway" (1 shortlisted).
- It rewards the moat: visual collage + reasoning chips + memory should make shortlisting *feel earned*, not random.

### Supporting metrics

- **Median time-to-first-shortlist** (seconds from session start). Target: < 90s. Reflects whether the agent gets to "good enough to consider" fast.
- **Reasoning-chip tap rate** (taps per product card shown). Target: ≥ 0.3. If users never tap the chips, the transparency move isn't earning its space — kill or redesign.
- **Session share rate** (`/s/[id]` opens per session). Target: ≥ 5%. Distribution loop health.

---

## 5. The seven UX moves — restated as acceptance criteria

These are the moat. Every cycle review checks the relevant subset against PASS/FAIL.

1. **Visual-first collage layout.**
   *Acceptance:* The same product result set can be toggled between list view and a Pinterest-style masonry collage; the toggle persists for the session; products in collage retain their reasoning chips and merchant info on hover/tap.

2. **Reasoning chips on every product.**
   *Acceptance:* Every rendered product card shows ≥2 chips computed from current preferences + product metadata (e.g. "size 8 match", "ships from EU", "−42% vs MSRP"); each chip is tappable and reveals a one-sentence `detail`; chips degrade silently when data is missing (never show a chip with no backing data).

3. **Persistent preference memory card.**
   *Acceptance:* A visible "About you" panel shows the agent's current understanding (size, budget, palette, ethics, shipping prefs); every field is inline-editable; edits round-trip to SQLite and are reflected in the next agent turn within one tool call; preferences survive a hard page reload in the same session.

4. **Outfit / bundle completion.**
   *Acceptance:* On any product, the user can ask "what would go with this?" (or tap an affordance) and receive a 2–4 item bundle rendered as a single coordinated card with a combined "save outfit" action; bundles are not just three random products — each item carries a one-line "why this with that" rationale.

5. **Merchant transparency cards.**
   *Acceptance:* Expanding any product card surfaces seller name, returns policy summary, shipping-days estimate, customer rating, and (where available) a carbon-shipping note; absent fields show "merchant didn't publish this" rather than a blank or a fake number.

6. **Photo → style search.**
   *Acceptance:* The user can paste/drop an image into the input bar; within 5s the agent shows the extracted attributes (as editable chips) and a result set; if vision extraction fails or returns low confidence, the agent says so and asks a clarifying question rather than guessing.

7. **Shareable session summary.**
   *Acceptance:* At session end (explicit "share" action or a 5-minute idle), a server-rendered `/s/[id]` page shows the user's shortlist, merchants, totals, and a sentence-or-two recap; the page is OG-tagged, loads without JS, and is viewable in an incognito window.

---

## 6. Anti-goals (what we will NOT build)

Be ruthless. If a feature isn't on this list and isn't in the seven moves, we don't build it this cycle.

- **No embedded in-chat checkout.** Redirect to the merchant's Shopify-hosted checkout. ChatGPT Shopping's 2026 pivot away from Instant Checkout validates this. We don't want PCI scope, refund disputes, or merchant integration overhead.
- **No multi-user accounts / auth.** Sessions are anonymous, identified by cookie. Auth doubles the surface area and isn't needed to prove the discovery moat. Revisit only if shareable sessions need owner-only edit.
- **No live inventory beyond what the MCP returns at query time.** We're a discovery layer, not a stock-management layer. If a product sold out between query and click-through, that's on the merchant page.
- **No native mobile app.** Mobile web (PWA-grade) is in scope; native is a year of work for marginal lift over a polished responsive site. Daydream went iOS-first and is now stuck rebuilding for Android — we don't repeat that.
- **No walled-garden catalog.** We don't curate a "preferred merchant list" or take affiliate kickbacks that bias ranking. The MCP is the source of truth; ranking is preference-driven. Trust dies the first time a reviewer notices we're pay-for-placement.
- **No "AI personality" / mascot.** Granola's "invisible AI" principle. The agent is a quiet professional, not a chirpy assistant with a name and emoji.
- **No price-tracking, deal-alert, or BNPL features.** That's Klarna/Honey territory. Stepping into it dilutes positioning. Revisit only post-launch.
- **No multi-turn negotiation with merchants.** No "ask the seller for a discount" loop. Out of scope; legally and operationally messy.

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

---

## 8. Open product questions

Things a real PM would take to 5 user interviews. Future cycles or a post-launch research pass should resolve them.

- **Q1 (resolve before Cycle 3):** Do users actually want a *three-lane* shortlist (Love/Maybe/Skip), or is the binary "Save / Pass" simpler? Daydream uses binary. We should test with 3 users whether the third lane reduces decision fatigue or adds it. [ASSUMPTION — Daydream pattern paraphrased from public screenshots]
- **Q2 (resolve before Cycle 2):** Which preferences should the agent *proactively* extract vs. wait to be told? Aggressive extraction reads as creepy ("I noticed you said size 8 last week"); passive extraction means the chips never light up. Hypothesis: extract sizing + budget proactively, keep ethics/palette user-initiated. Validate with 3 users in week 2.
- **Q3 (resolve before Cycle 4):** Does the photo→style flow drive more sessions than it costs in Groq vision tokens? If <5% of sessions use it, we're paying for a demo feature. Track from Cycle 4 launch; kill switch if usage is below floor at 2 weeks.
- **Q4 (resolve before Cycle 5):** What's the right share-link experience — a snapshot (immutable) or live (updates as the original session continues)? Snapshot is safer (no leaking later edits to a stranger); live is more useful for collaborative shopping. Lean snapshot; revisit if users ask.
- **Q5 (resolve before Cycle 6):** What's the floor on Groq free-tier reliability during a demo? Need a 100-query stress test against `llama-3.3-70b-versatile` to know how often we'll hit 429. If failure rate >2%, the fallback to 3.1-8B must be wired *before* launch, not after.

---

## Appendix — evidence & sources

Quick-reference list of public signals informing the positioning above. Full detail in `docs/research/2026-05-12-competitor-scan.md`.

- ChatGPT Shopping rolled back default Instant Checkout, early 2026 — validates "redirect-to-merchant" anti-goal. [ASSUMPTION — paraphrased from public reporting]
- Shopify opened the Catalog MCP for public agent access, Nov 2025.
- Daydream launched iOS, late 2025 — fashion-first, beautiful, opaque reasoning.
- Phia (Sara Foster / Phoebe Gates) browser-extension launched 2024 — comparison-shopping plugin; UX pattern of inline overlay is worth studying.
- Mercari Merchat AI — Japanese marketplace's conversational agent; strong on intent capture, weak on visual layout.
- Amazon Rufus rolled out to all US shoppers 2024; Reddit + Marketplace Pulse coverage shows persistent "not useful for deciding" complaints.
- Klarna AI assistant — covered in their 2024–2025 investor decks as a savings/BNPL prompt surface, not a discovery surface.
- Shop app's AI features (Shopify's own) — first-party offering; important to monitor since they have catalog-side advantages we don't.

Anything marked `[ASSUMPTION]` should be re-verified before Cycle 5 (launch prep). If a fact in this doc turns out wrong, file an ADR in `docs/adr/` documenting the correction and the downstream impact.
