# Competitor scan — 2026-05-12

Owner: Product Owner. Synthesis from public knowledge as of May 2026; some items marked `[ASSUMPTION]` should be re-verified before launch prep (Cycle 5).

Purpose: tell the team what each incumbent does well, what they botch, and which patterns we should steal or refuse. Not encyclopedic.

---

## Perplexity Shopping

Launched Nov 2024 (US first), then EU/UK. Conversational product search wrapped around Perplexity's web-answer engine; "Buy with Pro" feature included free shipping at one point.

- **Strong on:**
  - Citations on every claim — users see *why* a product was named (the review article, the spec sheet). Trust by transparency.
  - Multi-source answers — pulls editorial reviews, Reddit, manufacturer pages into one synthesised response.
  - Fast streaming UI; the answer feels alive.
- **Weak on:**
  - Catalog depth: relies on web crawl, not merchant APIs, so inventory/price freshness is sketchy.
  - Visual layout: image grid is a flat row; no collage, no shortlist.
  - No memory across sessions — every visit starts cold.
  - Checkout is a web link; no merchant-trust surfacing.
- **What we steal:** the "citations as trust" instinct → our reasoning chips are the equivalent for products. The streaming tool-status UX (their "searching the web…" indicator).

---

## Amazon Rufus

Rolled out to all US shoppers 2024; conversational assistant embedded in the Amazon app/site. Trained on Amazon's catalog + reviews + Q&A.

- **Strong on:**
  - Deep catalog grounding — answers questions about specific listings ("does this fit a queen bed?") accurately.
  - Inline contextual placement (right inside the product page) means low cognitive overhead.
- **Weak on:**
  - It answers, doesn't *decide*. No shortlist, no comparison surfacing, no "which of these three should I buy?" support. Reddit threads on r/Amazon and r/ProductivityApps consistently flag this. [ASSUMPTION — paraphrased from common complaints]
  - Sponsored-result bias bleeds into Rufus's recommendations; users notice and distrust.
  - No visual mood/style mode — purely text-driven.
  - No memory of prior sessions beyond very narrow signals.
- **What we steal:** the in-product-page Q&A pattern → we mirror it in the expanded merchant-transparency card ("ask about this product" affordance, future enhancement).
- **What we refuse:** sponsored placement biasing ranking. Ever.

---

## ChatGPT Shopping (incl. 2026 Instant Checkout pivot)

OpenAI's shopping experience inside ChatGPT, with Shopify and Etsy partnerships. Launched Instant Checkout (single-tap purchase inside ChatGPT) mid-2025; *rolled it back from default* in early 2026 — the pivot.

- **Strong on:**
  - Distribution: hundreds of millions of weekly ChatGPT users see shopping suggestions organically.
  - Conversational intent capture is best-in-class; the model is good at translating "vibe" queries into structured searches.
  - Image grid with prices is clean.
- **Weak on:**
  - Flat link-list UI: no shortlist, no comparison view, no "save for later".
  - No persistent memory of sizing/budget *between* shopping turns within the same session — users have to repeat themselves.
  - Instant Checkout pivot signals product-market confusion: they tried to own checkout, the market said no, they pulled back. [ASSUMPTION — paraphrased from public reporting around Feb 2026]
  - No merchant transparency — you can't tell who the seller is until you click.
- **What we steal:** the conversational intent capture quality (model + prompting). Their failure on checkout validates our anti-goal.
- **What we refuse:** burying merchant identity. Trust-first means seller-name-first.

---

## Klarna AI assistant

OpenAI-powered chat assistant inside the Klarna app and web. Klarna leans on it heavily in investor decks as evidence of AI-led cost-savings (replacing CS agents).

- **Strong on:**
  - Tight integration with their BNPL stack — checkout state is in the chat.
  - Good at price-tracking and "alert me when this drops".
- **Weak on:**
  - Tone is transactional/coupon-led; assumes the user is already in buy-mode. No exploratory discovery.
  - No visual layout; results are textual.
  - Tied to merchants in the Klarna network — catalog feels narrow.
  - Frames everything through the BNPL lens, which is alienating outside their core demo (younger US/EU shoppers).
- **What we steal:** the explicit price-drop / price-history chip is honest and useful — our "−42% vs MSRP" reasoning chip lineage.
- **What we refuse:** payment-product framing during discovery. We are not a payments company.

---

## Daydream (iOS, late 2025)

Fashion-first AI shopping app from a well-funded team; launched Nov 2025 to good press (TechCrunch, The Verge). Visual feed of curated outfits driven by stated style preferences.

- **Strong on:**
  - Visual polish: full-bleed imagery, collage layouts, "feel" of a fashion magazine.
  - Onboarding captures style preferences via image selection (Tinder-style swiping on outfits) — fast and fun.
  - Mobile-native interactions; pinch-to-zoom, swipe-to-shortlist.
- **Weak on:**
  - iOS-only; alienates a huge slice of US/EU/Asia. They are now reportedly rebuilding for Android. [ASSUMPTION — paraphrased from public commentary]
  - Opaque reasoning: it picks an outfit for you, you don't know *why*. App-store reviews flag "why this?" as the recurring question. [ASSUMPTION — review aggregation paraphrased]
  - Fashion-only — no graceful degrade to non-style verticals.
  - Single-merchant feel; catalog breadth questionable.
- **What we steal:** the collage layout, the visual-first instinct, the "drag-to-shortlist" gesture. The onboarding swipe pattern as a way to seed initial preferences (Cycle 2 candidate).
- **What we refuse:** opacity. Every recommendation in our app shows its working.

---

## Phia (browser extension)

Launched 2024 by Sara Foster & Phoebe Gates. Browser extension that overlays comparison shopping on whatever site you're on; finds the same/similar product cheaper elsewhere, including secondhand.

- **Strong on:**
  - Meets users *where they shop* (on the merchant page itself).
  - Resale/secondhand integration is differentiated and ethically resonant.
  - Inline overlay UX is unobtrusive.
- **Weak on:**
  - Extension friction — installs are a hard ask in 2026.
  - Doesn't drive *new* discovery; reactive, not exploratory.
  - Limited mobile presence.
- **What we steal:** the comparison overlay pattern (lightweight, contextual). The secondhand/resale chip as a future reasoning-chip kind (`condition: resale`, `condition: refurbished`).

---

## Shop app's AI features (Shopify's own)

Shop is Shopify's first-party consumer app. AI features include conversational product search, personalised feeds, and order tracking. They have first-party catalog access — a structural advantage we don't.

- **Strong on:**
  - Catalog freshness and breadth (they *are* Shopify).
  - Order-tracking and post-purchase integration is unmatched.
  - Clean mobile UI.
- **Weak on:**
  - "Generic AI commerce" framing — no strong voice or POV.
  - Discovery feed is algorithmic-feed-shaped (TikTok-style), not conversation-shaped.
  - Memory across sessions is shallow.
  - Doesn't surface merchant transparency well — assumes Shopify-on-Shopify trust.
- **Strategic note:** Shop is our biggest *structural* competitor. They can ship anything we ship and have the catalog. Our defence is **velocity + opinionated UX**: ship the moves they're institutionally too cautious to ship (collage + drag-shortlist + photo→style + share page). Their AI team is large and slow; ours is small and fast.
- **What we steal:** nothing UX-wise; they're benchmark for "competent but boring". What to monitor: any move they make toward conversation-first discovery — that's our cue to accelerate.

---

## Mercari Merchat AI

Japanese C2C marketplace's conversational shopping agent, launched ~2023 inside Mercari's app.

- **Strong on:**
  - Intent capture for marketplace context ("I'm looking for a vintage Y2K Sony Walkman, working condition") — handles fuzzy queries well.
  - Tight integration with Mercari's secondhand catalog.
- **Weak on:**
  - Marketplace-only; doesn't compose across retailers.
  - Visual layout is the standard Mercari grid.
  - Limited memory; each conversation is largely fresh.
- **What we steal:** the fuzzy-intent-capture quality is a system-prompt benchmark for our agent ("vintage Y2K working" should produce sensible MCP queries).

---

## Stealable moves (concrete patterns to borrow)

1. **Perplexity's "searching…" tool-status indicator** — small, dim, resolves to a checkmark. Earns trust without being noisy.
2. **Perplexity's citation-as-trust pattern** — applied to products = our reasoning chips with `detail` tooltips.
3. **Daydream's drag-to-shortlist gesture** — direct-manipulation feels better than a "Save" button on every card.
4. **Daydream's onboarding swipe-to-seed-preferences** — fast, fun, gives the preference card real data in <60s.
5. **Klarna's explicit price-history chip** — "−42% vs MSRP" or "lower than 30-day average" is concrete and verifiable.
6. **Phia's inline comparison overlay** — a future enhancement; on any product, "show me cheaper/similar" returns a side-by-side without leaving the canvas.
7. **Phia's resale/refurbished chip** — adds an ethics dimension we can layer cheaply.
8. **ChatGPT's intent-capture system prompting** — our Groq system prompt should aim for the same quality on "vibe" queries; classify intent (style/utility/gift/compare) and pick a layout.

---

## Patterns to avoid

1. **Sponsored placement biasing ranking (Amazon).** Once users notice, trust collapses. We will not take affiliate kickbacks that influence order.
2. **Opaque "AI picked this" with no rationale (Daydream).** Every recommendation must show its working. No exceptions.
3. **Embedded checkout (ChatGPT 2025 → 2026 pivot).** Validated externally as a losing bet at this stage of the market. Redirect to merchant.
4. **Payment-product framing during discovery (Klarna).** BNPL prompts mid-browse alienate non-target users.
5. **iOS-only / native-app-first (Daydream).** Mobile web (PWA-grade) gives 90% of the value for 10% of the cost.
6. **Algorithmic-feed shape (Shop app).** We are conversation-shaped, not feed-shaped. Resist drift toward "infinite scroll of recommended products".
7. **Mascot / persona AI (general industry trend).** Granola's "invisible AI" wins. Our agent is a quiet professional.
8. **Multi-turn merchant negotiation.** Not our problem; legally and operationally fraught.

---

## Re-verification list (before Cycle 5)

These claims are paraphrased from public reporting and should be re-confirmed against primary sources before we cite them in launch materials.

- [ ] ChatGPT Shopping Instant Checkout rollback date and exact framing (OpenAI changelog or blog post).
- [ ] Daydream's reported Android rebuild status.
- [ ] Shopify Catalog MCP public-availability date (Nov 2025) and any subsequent ToS changes.
- [ ] Klarna AI assistant's current scope (it expanded in 2025; verify it still focuses on BNPL framing).
- [ ] Amazon Rufus public-availability scope (US-only? EU rollout?) as of May 2026.
- [ ] Phia's current user-base and any pivot away from extension-only.
