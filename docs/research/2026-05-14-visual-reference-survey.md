# 2026-05-14 — Visual reference survey

**Brief.** Direction-setting feedback on the live app: *"feels too basic and bland — modern sleek premium without over-complication."* This note surveys the 2026 reference cohort named in DESIGN.md and adjacent premium products, names the shared moves, and proposes where each one lands on our chat-shaped commerce surfaces. Pure research — no code edits, no DESIGN.md changes. The Senior Design Lead is walking the live app in parallel.

**Constraint reminder.** Our token stack is Inter + Instrument Serif + ink palette + `accent-500` warm orange. Recommendations work *with* that stack. Chat-app conventions win where they conflict with commerce conventions.

---

## 1. Reference table

For each reference: **one move** that reads as premium-without-over-complication, and **one act of restraint**.

### Premium chat / AI / productivity

| Reference | One move | One restraint |
|---|---|---|
| **Granola** ([granola.ai](https://www.granola.ai)) | AI-enhanced notes appear as structured sections inside the same neutral card as the raw transcript — no color-coding, no badge, no "✨ AI" sparkle. The hierarchy is purely typographic: heavier headers + grouped paragraphs. The AI is *invisible*; only the result is visible. | No gradients anywhere. Customer logos are grayscaled. The product screenshot in the hero is the hero — no glowing border, no tilted device mock, no parallax. |
| **Claude.ai** chat + Artifacts ([anthropic.com/news/claude-design-anthropic-labs](https://www.anthropic.com/news/claude-design-anthropic-labs)) | Two-pane split: left rail is conversational, right rail is the generative surface. The chat side stays text-only, monochrome, no avatar bubbles — just author label + serif-leaning body. Generated UI is the only place chromatic detail enters the page. | No user avatar. No timestamps in the stream. No "AI is typing" dots — only a quiet cursor pulse. Refuses the conventional bubble metaphor. |
| **Perplexity Pro** ([perplexity.ai](https://www.perplexity.ai), [standards.site/perplexity](https://live.standards.site/perplexity)) | Near-black surface (`#1C1C1C`) + a single teal-cyan accent (`~#20B2AA`) used *only* on citations, focus rings, and logo. Answer text dominates; the accent is reserved for verifiability moments. | Sans-only system stack. No serif display moments. No decorative imagery. Citations are numerals in line with text, not pill badges. |
| **Arc / Arc Search** ([arc.net](https://arc.net)) | Static product screenshots used as hero. The site reads "calm browser" because the marketing site itself is calm — same calmness it's selling. | No autoplay video, no 3D renders, no chromatic-aberration motion. No gradient overlays. Hover micro-interactions are absent on marketing chrome. |
| **Linear** ([linear.app](https://linear.app), [linear.app/now/how-we-redesigned-the-linear-ui](https://linear.app/now/how-we-redesigned-the-linear-ui)) | Massive display headline (single bold sans, generous tracking) sits on a near-white field with no accent color in view. The product screenshot does the colorwork. | No section background variation — entire page is one continuous surface. No color in marketing chrome. Headings refuse italic, refuse serif. |
| **Things 3** ([culturedcode.com/things](https://culturedcode.com/things)) | Hero is *literally* a logo + one sentence + a play button. The restraint itself is the premium signal — implicit confidence that needs no badge. | No metric callouts ("100M downloads!"), no urgency copy, no carousel. Apple Design Awards are shown as quiet glyphs, not gold-foil seals. |
| **Raycast** ([raycast.com](https://www.raycast.com)) | "Keyboard First" — they put a literal static keyboard illustration as the hero. The product's input method becomes the visual. | No lifestyle photography. No testimonial videos. Buttons have no gradient, no glow. Community proof is a name list, not face grid. |

### Premium commerce / discovery

| Reference | One move | One restraint |
|---|---|---|
| **SSENSE** ([ssense.com](https://www.ssense.com), [ecomm.design/site/ssense-2](https://ecomm.design/site/ssense-2/), [siiimple.com/ssense](https://siiimple.com/ssense/)) | The homepage is editorial, not products — a single editorial story leads, products lurk one nav-click deep. Bold display sans, lowercase, no italic, near-no chromatic accent. The grid is asymmetric — 1-up, 2-up, 4-up sections vary. | No category mega-nav. No promotional badges on product tiles. No price-discount red. Hover doesn't zoom — it just swaps to a second product photo at the same crop. |
| **MR PORTER** ([mrporter.com](https://www.mrporter.com), [underware.nl/custom_type/mr_porter](https://www.underware.nl/custom_type/mr_porter/)) | Custom commissioned typeface ("Mr Porter") used as the *editorial* voice — appears only in the magazine ("The Journal"), never on commerce chrome. Serif feels earned, not decorative. | No serif on the buy button. No serif in product names. The custom face is reserved for *authorial* moments, like a magazine masthead. |
| **Aritzia** ([aritzia.com](https://www.aritzia.com), [ecomm.design/site/aritzia-2](https://ecomm.design/site/aritzia-2/)) | Editorial product photography (lifestyle, not packshot) is the dominant visual; UI chrome around it is reduced to thin sans labels. "Elevated without costume-y" — the chrome is *practical-luxe*, photography carries the brand. | No gold/black "luxury" cues. No score badges. No "trending" labels. Chrome stays Inter-scale clean even when the photography goes maximal. |
| **Apple iPhone product page** ([apple.com/iphone-16-pro](https://www.apple.com/iphone-16-pro/)) | Scroll-driven sections with one idea per viewport; product photography is the section, copy is supplementary. SF Pro Display with notably generous tracking on subheads — that tracking *alone* signals premium. | No social proof. No reviews. No testimonials. No price compare. CTA is solid-fill dark, never gradient. |
| **Hermès** ([hermes.com](https://www.hermes.com/us/en/)) | **The brand orange is nearly invisible on the homepage.** Black type, white field, gray accents. The signature color appears only on the logo and packaging — never as decorative chrome. | No mega-nav (hamburger only). No urgency. No "best seller" badge. Product names + prices, period. Section copy is poetic ("Treasure is on the horizon") — never promotional. |
| **Studio Neat** ([studioneat.com](https://www.studioneat.com)) | Product photography on plain near-white, "floating" with consistent shadowless lighting. Each product's page is a single column with generous gaps — reads like a small magazine spread. | Terse copy ("A minimal, durable, retractable pen"). No urgency, no countdown, no scarcity. The only conversion ask is a quiet 10% newsletter chip. |
| **Goyard** ([goyard.com](https://www.goyard.com)) | Aggressive negative space — products float inside white-out fields the size of a screen. The site is closer to a 1990s catalog than a 2026 store. Anachronism *becomes* the luxury signal. | No hover states. No animation. No "shop now" overlay. The site refuses to perform digital-ness. |
| **Graphpaper / Japanese editorial commerce** ([eng.graphpaper-tokyo.com](https://eng.graphpaper-tokyo.com/pages/concept), context [popfashioninfo.com](https://www.popfashioninfo.com/details/report/t_report-id_16730-col_34/)) | Monochrome top to bottom — black, white, one gray. Type is small and consistent (one weight, one size for body), the imagery does the speaking. Grid is a strict 12-col but populated unevenly so it reads composed, not gridded. | No second accent color. No marketing copy. Product pages are spec + photo, no story-telling. |

---

## 2. Shared moves across the cohort

Seven moves recur. I'll number them so the Design Lead can pick by index.

### Move 1 — Reserved accent: chromatic color appears only at moments of commitment or verification

**Where:** Hermès reserves brand orange to logo/packaging only. Perplexity reserves teal to citations + focus rings. Granola has effectively no accent at all. The pattern: **one** chromatic note, applied to one semantic class of element, never to chrome.

**Translate to our app:** This is already DESIGN.md §2.2 ("orange = color of *commitment*, only on commerce-intent affordances"). The token rule exists; the question is whether the live app is honoring it. Likely audit: any orange currently on hover-states, focus-rings-of-non-commerce-elements, badges, or AI indicators is a leak.

**Surface to apply:** Buy CTA, "save outfit," summary-page hero underline — all already correct per spec. Audit Header, suggestion chips, reasoning chips.

**Over-application risk:** Adding orange to "secondary commerce" surfaces (price tags, wishlist heart) dilutes the commitment signal until it reads decorative.

---

### Move 2 — Earned serif: display type appears only on authorial moments, never on chrome

**Where:** MR PORTER's custom serif lives in The Journal, never on buy buttons. Claude's chat side uses serif-leaning body but never on CTAs. SSENSE keeps serif out of the buy flow entirely.

**Translate to our app:** DESIGN.md §2.4 already enumerates exactly four serif homes (expanded card price, summary hero, lookbook section headers, CollageView caption). The cohort says: keep that list short, and *add italic where the moment is genuinely authorial* (gist line, lookbook header). The current spec only italicizes the summary hero — consider extending italic to the CollageView caption price when hovered, because that's the most authorial moment in the stream.

**Surface to apply:** ProductCard expanded price (already serif — consider very subtle italic for in-stock items only, as a quiet luxury cue). Welcome / empty state — there may be an opportunity for one serif sentence as the empty-state hero, mirroring Things 3's "logo + one sentence + nothing else" hero.

**Over-application risk:** Serif on system labels (tool-status, timestamps) reads as costume. Italic on buy buttons reads as wedding invitation.

---

### Move 3 — Type tracking as the premium signal

**Where:** Apple's iPhone page uses notably generous tracking on subheads — that tracking *alone* reads as premium because no other site does it. Linear's massive hero gets +tracking. SSENSE's display lowercase + neutral tracking reads cool because it refuses the tightness of trend-tracking.

**Translate to our app:** Our spec is silent on tracking. The Inter default works for body, but display moments (summary hero, lookbook headers) could earn `tracking-tight` (for the serif italic — already reads premium in display sizes) or `tracking-wider` for the 11px uppercase meta labels (`TOTAL`, merchant attribution) which DESIGN.md §2.4 already calls out as uppercase. Confirm `tracking-wider` is on those.

**Surface to apply:** All `text-[11px]` uppercase moments (per spec). One-time check on the summary-page section headers — generous tracking would make them feel like magazine column heads instead of UI labels.

**Over-application risk:** Tracking applied to body text becomes unreadable. Applied to mid-scale (14–18px) sans, it reads dated (1990s).

---

### Move 4 — Asymmetric grid / editorial rhythm over uniform card grid

**Where:** SSENSE varies 1-up, 2-up, 4-up sections. Aritzia's homepage breaks rhythm with full-bleed images between rows. Apple's product page is scroll-driven sections at one-idea-per-viewport. Graphpaper populates a strict grid *unevenly* so it reads composed.

**Translate to our app:** Our app is a chat stream — uniform card width is the default. But our CollageView (the lookbook surface, per DESIGN.md §8) is exactly the place this move belongs. Vary card sizes by user signal (saved > liked > viewed), not just by inventory order. Mason-style layout with intentional 2-up / 1-up breaks reads editorial; a uniform 3-col reads inventory.

**Surface to apply:** CollageView (lookbook). Possibly the "suggestions" rail after a search query — the first suggestion can be 2x size, the rest standard.

**Over-application risk:** Asymmetry in the chat stream itself breaks scanning. Cards in the stream should stay uniform; *grouped* surfaces (lookbook, suggestions) earn variation.

---

### Move 5 — One-idea-per-viewport / generous vertical rhythm

**Where:** Apple's product page. Hermès' homepage. Things 3's site. Studio Neat's product pages. All of them give each idea a screen of its own and pad it with whitespace. The pattern is *slow scroll*.

**Translate to our app:** Our app's vertical rhythm is governed by §2.5 (spacing scale, six steps; layout-level `8`, `12`). Cohort says: when the surface is *narrative* (welcome, summary, lookbook), use the `12` step liberally between section groups. Don't try to fit two ideas in one viewport on those surfaces. The chat stream is exempt — density is desirable there.

**Surface to apply:** Welcome / empty state (one centered idea per viewport, big top padding). Summary page. Lookbook intro.

**Over-application risk:** Vertical generosity in the chat stream itself feels broken — users want continuity. Reserve breathing for *destination* surfaces.

---

### Move 6 — Static-first motion: animate on commit, not on hover

**Where:** Arc, Linear, Granola, Apple all refuse hover animation on marketing chrome. Hermès has effectively no motion. Things 3, Studio Neat: no autoplay anything. Where motion appears, it's on *commit* — a card opens, a price reveals, a save lands.

**Translate to our app:** DESIGN.md §2.8 already restricts motion durations (>500ms forbidden, no spring bounce). The cohort's additional learning: **hover-state should be near-invisible** (shadow softens by 1 step, that's it). Reserve visible motion for commit moments — adding a saved item to the lookbook, the buy-button focus glow, the card expansion.

**Surface to apply:** ProductCard hover — check that hover is *only* `shadow-lift`, no scale, no translate, no border bloom. Buy button — keep `shadow-glow` reserved for hover/focus there exclusively (already in spec).

**Over-application risk:** "No motion on hover" applied to the input bar makes it feel dead. Input bar must show *some* responsiveness on focus (focus ring, subtle border tonal shift) — but no bounce, no scale.

---

### Move 7 — Photography (or content) is the hero; chrome shrinks around it

**Where:** Aritzia's editorial product photos. Hermès' poetic captions over large imagery. Apple's hands-and-environment phone shots. Graphpaper's monochrome product photos with empty fields. SSENSE's editorial-first homepage. Even Granola: the *generated note* is the visual, not the chrome.

**Translate to our app:** Two implications. (a) On `ProductCard`, the image area should be the visual mass — currently `rounded-xl` on the image, `rounded-2xl` on the card. The image should feel like the gravity center, not the chrome. Consider full-bleed image to card edge on at least one variant (a "featured" expanded state). (b) On the `Welcome` / empty surface, there may be opportunity for one quiet editorial image — even a generated one — to anchor the screen instead of pure text.

**Surface to apply:** ProductCard expanded view (image dominates). Welcome state (consider a single quiet image or generated illustration). CollageView (already image-led by definition).

**Over-application risk:** If the chat stream itself gets photo-heavy, it stops feeling like a *conversation* and starts feeling like Pinterest. Chat-shape means: chat stream is text-and-card-led; *destination* views can be photo-led.

---

## 3. Highest-leverage moves for our specific app shape

For a chat-shaped commerce product with the bland-feedback specifically:

- **Move 1 (Reserved accent)** is the audit — the rule exists, enforcement may not.
- **Move 3 (Tracking as premium signal)** is the cheapest visual win — applied to existing serif moments and uppercase meta, it does work no other change can do without new tokens.
- **Move 7 (Photography is the hero)** is the structural answer to "bland" — the product surfaces likely shrink imagery in favor of chrome; restoring image dominance on expanded cards and CollageView is the largest perceived-quality lift available.

The other moves are real but secondary for *this* feedback. "Bland" reads to me as *the chrome is competing with the content*. Moves 1, 3, and 7 all attack that.

---

## 4. The tension I noticed across the cohort

**Premium chat is minimalist (Claude, Granola, Linear, Things). Premium commerce is photographic (SSENSE, Aritzia, MR PORTER, Apple, Hermès).**

These two grammars conflict at the moment when a product card sits inside a chat message bubble. A chat-app instinct says: shrink the card, keep the text-stream calm, use the card as a *citation* (Perplexity-style). A commerce-app instinct says: blow up the image, let it carry the brand, the chrome is invisible.

Our app has to pick a *primary*. I'd argue **chat conventions win in the stream; commerce conventions win at the destinations** (expanded card, lookbook, summary, buy moment). The handoff between them is the moment a user taps to expand a card — that tap should feel like a *room change* (Granola → SSENSE), not a panel slide.

This is the one tension worth a small directive in DESIGN.md, possibly as a new §3.x: *"Chat-stream surfaces follow chat-app grammar (text-led, calm, citation-like cards). Destination surfaces (expanded card, lookbook, summary) follow commerce grammar (image-led, editorial, photographic). The transition between them is the most authorial moment in the product."*

---

## 5. Notes & sources

Cohort references cited inline above. Search queries failed for SSENSE, MR PORTER, Aritzia, and Claude.ai's direct chat shell (403s) — substitute analyses from search results and standards-site material were used where direct fetch was blocked. Perplexity's color/type were captured from [perplexity.ai](https://www.perplexity.ai) summary + the standards.site index ([color](https://live.standards.site/perplexity/color), [type](https://live.standards.site/perplexity/type)) although those pages returned title-only on direct fetch. Where direct visual capture wasn't possible, descriptions rely on cohort consensus reporting from 2026 design coverage (Siiimple, ecomm.design, Underware foundry documentation).

The Senior Design Lead's live-app audit should pair with this note: the cohort says *what premium looks like in 2026*; the live audit says *which of those moves the app already attempts and where it falls short*.
