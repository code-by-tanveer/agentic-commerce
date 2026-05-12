# DESIGN.md — Agentic Commerce

> Owner: Senior Design Lead. Single source of truth for tokens, principles, and component direction. Engineers building Cycles 1–6 implement directly from this. No design questions should remain unanswered after reading.

---

## 1. Design thesis

Agentic Commerce should feel like flipping through a thoughtful magazine with a quiet, well-read friend — calm, curatorial, confident. Generous whitespace, a single warm accent, restrained type, and motion that explains rather than entertains. It should explicitly *not* feel like a chatbot in a frame (ChatGPT Shopping), nor a marketplace SERP (Amazon), nor a casino of cards (Pinterest). The closest spiritual references: **Granola** (invisible AI, dim tool indicators, content-forward), **Arc Search** (results that look authored, not retrieved), **Claude artifacts** (generative UI inside chat), and **Linear Asks** (input bar treatment, restraint).

---

## 2. Tokens

Everything in this section either matches `tailwind.config.ts` today or is a small, justified addition. No new values introduced just to be cute.

### 2.1 Palette — ink (neutral spine)

| Token | Hex | Use |
|---|---|---|
| `ink-50` | `#f7f7f5` | Page background. Body uses this. |
| `ink-100` | `#ededea` | Hairline dividers, skeleton fills, disabled chip background. |
| `ink-200` | `#d6d6d1` | 1px borders on cards, input, chips. |
| `ink-400` | `#8a8a85` | Secondary text, meta (merchant, timestamps, "Total" label). |
| `ink-600` | `#3a3a37` | Body text on cards, expanded descriptions, hover on `ink-900` buttons. |
| `ink-900` | `#101010` | Primary text, primary button fill. The "anchor" of the page. |

**Gaps to add** (justified): `ink-300` `#bcbcb6` for placeholder image fills and dragged-card scrim; `ink-700` `#2a2a27` for the rare midpoint between body copy and primary text (used in summary page only). Add only when first needed; do not pre-add.

### 2.2 Palette — accent (warm orange, used sparingly)

| Token | Hex | Use |
|---|---|---|
| `accent-50` | `#fff4ec` | Reasoning-chip background for `discount` kind only. Outfit-bundle frame tint. |
| `accent-200` | `#ffd4b8` | Focus ring on the Buy CTA. Selected-state Variant pill border. |
| `accent-500` | `#ff6a13` | The Buy button fill (expanded card). Outfit "save outfit" CTA. The summary-page hero underline. |
| `accent-600` | `#e85806` | Hover on `accent-500`. |

**Rule:** orange appears **only on commerce-intent affordances** (Buy, Save Outfit, "checkout this lookbook"). Never on AI indicators, never on selection, never on chrome. It is the color of *commitment*.

### 2.3 Semantic tokens

Map these names in code (Tailwind plugin or just consistent class usage). They are the names component code should reference; raw `ink-*` is allowed but discouraged outside of leaf elements.

| Semantic | Maps to | Tailwind class |
|---|---|---|
| `surface` | page bg | `bg-ink-50` |
| `surface-raised` | card bg | `bg-white` |
| `surface-sunken` | input/chip bg in raised contexts | `bg-ink-50` |
| `text-primary` | headings, primary copy | `text-ink-900` |
| `text-secondary` | body, descriptions | `text-ink-600` |
| `text-quiet` | meta, tool-status, captions | `text-ink-400` |
| `divider` | 1px hairlines | `border-ink-100` |
| `border` | card/input border | `border-ink-200` |
| `success` | success state (preference saved) | `text-emerald-600` / `bg-emerald-50` |
| `warn` | "low stock", "ships in 2-3 weeks" | `text-amber-700` / `bg-amber-50` |
| `danger` | errors, "out of stock" | `text-rose-700` / `bg-rose-50` |

`success`, `warn`, `danger` use Tailwind's defaults at `*-50` and `*-600/700`. They are state colors — never decorative. **Confirmed (Cycle 2):** `success` = `emerald-50` / `emerald-600`, `warn` = `amber-50` / `amber-700`, `danger` = `rose-50` / `rose-700`. Engineers reference these Tailwind classes directly; no token aliases (no `ok-*` / `warn-*` / `danger-*` in `tailwind.config.ts`). Rationale: Tailwind's defaults already pass AA on `ink-50` for body, the brand has exactly one chromatic accent (`accent-500`) and a second brand-aligned state palette would compete with it. Brand identity stays in `accent-*`; state stays in the Tailwind defaults.

### 2.4 Type scale

Inter, weights `400 / 500 / 600 / 700`. Tracking default; no display-letter-spacing tricks.

| Class | Size | Line-height | Use |
|---|---|---|---|
| `text-[11px]` | 11px | 14px | Meta labels ("TOTAL", merchant attribution footer, the disclaimer under input). Uppercase, tracking-wider, `text-quiet`. |
| `text-xs` | 12px | 16px | Reasoning chips, tool-status line, suggestion chips. |
| `text-sm` | 14px | 20px | **Default body.** Message bubbles, card titles, descriptions, button text. |
| `text-base` | 16px | 24px | Price on collapsed card. The "anchor" weight on a card. |
| `text-lg` | 18px | 26px | Price in expanded card. Section labels on the summary page. |
| `text-xl` | 20px | 28px | Header H1 for the chat (only logged-out / empty state). |
| `text-2xl` | 24px | 32px | Summary page section headers (serif). |
| `text-3xl` | 30px | 36px | Summary page hero title (serif). |

**Type pairing — where Instrument Serif (`font-display`) appears, exhaustively:**

1. The **price** on an *expanded* product card (`text-lg font-display`). The collapsed-card price stays sans for density.
2. The **summary page hero** (`text-3xl font-display italic` for the session's one-line gist, e.g. *"A quiet desk for a slow morning."*).
3. The **section headers in the lookbook** (`text-2xl font-display` — "What you loved", "What you saved", "Merchants").
4. The **CollageView caption overlay** when an item is hovered — the price floats in serif over the image's lower-left.

Nowhere else. No serif in the chat stream. No serif on the buy button. No serif in the preferences panel. The serif is *earned* by moments of authorial voice.

### 2.5 Spacing scale

Tailwind ships dozens. Restrict to **six steps** for in-component spacing. Layout-level (gaps between sections) may use `8` and `12`.

| Token | px | Use |
|---|---|---|
| `1` | 4 | Icon-to-text inside a chip. |
| `2` | 8 | Inline gaps (chip↔chip, icon↔label). |
| `3` | 12 | Card internal padding (collapsed), tight stack gaps. |
| `4` | 16 | Card internal padding (expanded), message-to-message gap. |
| `6` | 24 | Section gap inside a message group, modal padding. |
| `8` | 32 | Page-level vertical rhythm. |

**Forbidden in component code:** `5`, `7`, `9`, `10`, `11`, anything decimal. If you reach for one, you're solving the wrong problem.

### 2.6 Radius scale

| Token | px | Use |
|---|---|---|
| `rounded-sm` | 2 | Image thumbnail in dense lists (rare). |
| `rounded-md` | 6 | Variant pills, message-bubble inner badges. |
| `rounded-lg` | 8 | Inline thumbnails on the expanded card's image strip. |
| `rounded-xl` | 12 | Product-card image area (collapsed). |
| `rounded-2xl` | 16 | **Default card radius.** Product cards, message bubbles, preference card, modals. |
| `rounded-3xl` | 24 | The input bar. Nothing else uses this. |
| `rounded-full` | 9999 | Chips, primary action buttons, send icon. |

### 2.7 Shadows

| Token | Value | Use |
|---|---|---|
| `shadow-soft` | (already defined) | Resting elevation on cards, message bubbles, input bar. |
| `shadow-lift` | (already defined) | Hover state on product cards only. Apply only to cursor-interactive cards, not message bubbles. |
| `shadow-glow` | **new:** `0 0 0 6px rgba(255,106,19,0.12), 0 8px 24px -8px rgba(255,106,19,0.45)` | The Buy CTA on hover/focus, and *only* there. |

**Hard rule:** soft shadows **OR** 1px border, never both. Today's `ProductCard.tsx` violates this with `border border-ink-100 ... shadow-soft`. Cycle 1 design directive includes the fix: drop the border, keep the shadow. (See §8 Cycle 1.)

### 2.8 Motion

Library: Framer Motion (already a dep).

| Class | Duration | Easing | Use |
|---|---|---|---|
| `motion-micro` | 100ms | `easeOut` | Hover state changes, pressed state, icon rotates (chevron). |
| `motion-quick` | 200ms | `easeOut` (entry) / `easeIn` (exit) | Chip flips, suggestion appearance, tool-status check. |
| `motion-default` | 300ms | `easeOut` | Message bubble entry, card entry, expansion, modal. |
| `motion-layout` | 400ms | `[0.2, 0, 0, 1]` (custom — sharp entry, smooth settle) | **Layout-only.** Collage masonry reflow, shortlist lane reorder, view-toggle switch. |
| `motion-never` | >500ms | — | Forbidden. If you need more time, the user is waiting for content; show a skeleton, don't slow the animation. |

**Easings (in code as Framer constants):** entry `[0.16, 1, 0.3, 1]` (overshoot-free easeOutCubic-ish), exit `[0.7, 0, 0.84, 0]`. No `spring` with bounce; no overshoot. Stagger between sibling cards: 40ms, capped at 6 items (no stagger past index 5 — the rest snap in together).

---

## 3. Principles

1. **Invisible AI.** Tool-call indicators are `text-quiet`, `text-xs`, no emoji robots, no "I am an AI" preamble. A spinner dot, the verb ("searching"), the object ("desk lamps under $150"), a checkmark on completion. That's it. Inspired by Granola's transcript-side indicators.
2. **Content over chrome.** A product card is an image and a title with a price. Borders, shadows, and labels are subtracted until further subtraction breaks the layout — then we stop.
3. **Reasoning is part of the product.** Every product card surfaces *why* it was chosen — reasoning chips below the title — not just *what* it is. A card without at least one reasoning chip is a bug after Phase B.
4. **Visual-first by default.** For `style` and `gift` query intents, the canonical layout is the masonry collage. The list view is the fallback for `utility` and `compare` intents. The agent's intent classification chooses; the user can override via the view toggle.
5. **No lonely text walls.** If an assistant message contains >2 sentences of prose without a product, comparison, or component, the agent prompt is wrong. Fix the prompt; do not style around it.
6. **One warm accent, used as commitment.** Orange means "the user is about to spend money." Nothing else is orange. A reasoning chip is not orange. A loading state is not orange. Buy is orange.
7. **Motion explains, never decorates.** Every animation is the answer to "what changed?" — a card appeared, a collage reflowed, a chip flipped to confirm. No idle ambient motion.
8. **Density is earned.** Collapsed product cards are dense (96px image, 12px padding). Expanded cards are spacious (`p-4`, `gap-4`). The user opts into detail; we don't push it.
9. **The serif is a gift.** Instrument Serif appears in four places and four places only (§2.4). Each is a moment where the app speaks with a voice instead of presenting data. Overuse kills it.
10. **Mobile is not "desktop, but cramped."** Shortlist is a right rail on desktop and a swipe-up bottom sheet on phone — different component composition, not a media query on the same layout.

---

## 4. Component inventory

Format: `Name` — purpose. **States:** ... **Interaction:** ...

### Chat shell (`components/chat/`)

- **`Header`** — minimal app chrome: wordmark left, view-toggle + shortlist-trigger right. **States:** default, scrolled (gain hairline). **Interaction:** sticky top; collapses to wordmark-only on scroll past 80px.
- **`ConversationCanvas`** — the scrollable thread. Max-width 640px text column, 960px when product groups appear inline. **States:** empty (welcome + starters), populated, streaming. **Interaction:** auto-scroll on new content, paused if user scrolls up >120px.
- **`MessageBubble`** — renders one message. After Cycle 1, it composes sub-blocks. **States:** user, assistant, pending (typing dots), error. **Interaction:** none; pure render.
- **`TypingIndicator`** — 3-dot pulse inside an assistant bubble before the first token arrives. **States:** visible/hidden. **Interaction:** `aria-live="polite"`, announces "thinking".
- **`ToolStatus`** *(new, Cycle 1)* — inline `text-xs text-quiet` row: spinner → verb → object → checkmark on done. Lives *inside* the assistant bubble, above any rendered output. **States:** running, done, error. **Interaction:** none; collapses to single line after completion (truncate with `...`).
- **`MessageRenderer`** *(new, Cycle 1)* — switch on sub-block type → `text` / `ProductCardGroup` / `ComparisonTable` / `OutfitBundle` / `MoodBoard`. **States:** none (stateless). **Interaction:** none.
- **`SuggestionChips`** — pill row, shown only on empty state and after the first turn completes. **States:** default, hover, pressed. **Interaction:** tap → fills input and submits.
- **`InputBar`** — sticky bottom, `rounded-3xl`, auto-resizing textarea up to 160px tall. **States:** empty, typing, submitting, disabled (during stream). **Interaction:** Enter → submit; Shift+Enter → newline; paste image → `ImageDropzone` takes over.
- **`ViewToggle`** *(new, Cycle 3)* — segmented control: List | Collage. Persists per session. **States:** list-active, collage-active. **Interaction:** tap a segment; `motion-layout` reflows the canvas's `ProductCardGroup`s.
- **`Shortlist`** *(new, Cycle 3)* — three lanes: Love / Maybe / Skip. Right rail (desktop) or bottom sheet (mobile). **States:** closed, open, drag-over (lane highlights). **Interaction:** drag a card from the canvas into a lane; tap a card in a lane to scroll the canvas back to its origin message.
- **`ImageDropzone`** *(new, Cycle 4)* — drop/paste target overlaying the input bar. **States:** idle (invisible), drag-over (dashed border, `accent-200` tint), uploading (spinner). **Interaction:** drop → upload → inject "find me something like this" message with thumbnail.

### Product (`components/product/`)

- **`ProductCardGroup`** — a row/grid of `ProductCard`s scoped to one assistant message. **States:** list (default), collage. **Interaction:** none direct; `ViewToggle` mutates state.
- **`ProductCard`** — collapsed (96px image + title + meta + price + Buy chip) or expanded (full description, variants, merchant block, accent Buy CTA). **States:** collapsed, expanded, hovered, dragging (Shortlist), loading-variant. **Interaction:** tap card → expand; tap Buy chip → open checkout in new tab. **Fix in Cycle 1:** remove the `border` to comply with §2.7.
- **`VariantPicker`** — pill row of size/color options. **States:** option-selected, option-unavailable (struck through), out-of-stock-row (entire row disabled with caption). **Interaction:** tap → updates `selectedVariantId`, recomputes price and `checkoutUrl`.
- **`ReasoningChips`** *(new, Cycle 2)* — row of small chips below product title. Each chip: leading dot in semantic color + label. **States:** default, hovered (reveals `detail` in a tooltip below). **Interaction:** tap (mobile) or hover (desktop) shows detail.
- **`MerchantBlock`** *(new, Cycle 2)* — within expanded card: seller name, rating, return policy badge, shipping speed, carbon estimate. **States:** full (all fields present), partial (degraded gracefully). **Interaction:** tap merchant name → "more from this merchant" follow-up (Cycle 2+).
- **`CollageView`** *(new, Cycle 3)* — masonry (CSS columns, 2/3/4 cols by breakpoint) of the same product list. Card chrome shrinks to image + serif-price overlay on hover. **States:** loading, populated, empty. **Interaction:** tap an image → expands inline like `ProductCard`; long-press / hold → starts drag toward `Shortlist`.
- **`OutfitBundle`** *(new, Cycle 3)* — 2x2 or 3-card composite with a shared "Save outfit" button at the bottom. Frame uses `accent-50` tint to read as a single object. **States:** default, saved (button flips to "Saved ✓"). **Interaction:** tap individual product → opens that card; tap Save → persists to Shortlist as a bundle.
- **`ComparisonTable`** *(new, Cycle 1, polish Cycle 2)* — horizontal scroller of 2–4 products with aligned attribute rows (price, shipping, rating, "why this one"). **States:** default. **Interaction:** sticky leftmost column on scroll; tap a row label → re-sorts.

### Preferences (`components/preferences/`)

- **`PreferencesCard`** *(new, Cycle 2)* — desktop: sticky panel above the input bar showing 3–5 active prefs as inline-editable chips ("size 8", "≤$200", "ships from EU"). Mobile: a single collapsed line ("3 preferences") expanding to a sheet. **States:** collapsed, expanded, editing-field. **Interaction:** tap a chip → inline edit; X → remove (calls `save_preference` with empty value).

### Summary page (`app/s/[id]/`)

- **`SummaryHero`** *(new, Cycle 5)* — server-rendered hero: serif italic gist sentence, date, merchant count. Full-bleed on mobile, centered 720px on desktop. **States:** static. **Interaction:** none.
- **`SummaryProductList`** *(new, Cycle 5)* — sectioned: Loved / Saved Outfits / All Considered. Each section header is `text-2xl font-display`. **States:** static. **Interaction:** tap card → opens merchant checkout in new tab; tap "open in chat" → deep-links back to `/?session=<id>`.
- **`SummaryShareBar`** *(new, Cycle 5)* — sticky bottom: copy-link, native share (mobile), download as PDF (stretch). **States:** idle, copied (label flips for 2s). **Interaction:** standard.

---

## 5. Layout & responsive

Three breakpoints. Tailwind defaults: `sm` (640), `md` (768), `lg` (1024), `xl` (1280). We use **three logical breakpoints**:

- **Phone** (≤640): full-width canvas, `px-4`. Shortlist is a bottom sheet, summoned from a floating button on the right edge of the input bar. Header collapses to wordmark only. `ProductCardGroup` is a single column.
- **Tablet** (641–1024): canvas centers at `max-w-3xl` (768px). Shortlist remains a bottom sheet (avoids cramping). `ProductCardGroup` is 2 columns in list mode, 2 in collage.
- **Desktop** (>1024): canvas: **text column 640px** for messages and `text-only` blocks, **grid column 960px** for `ProductCardGroup`, `ComparisonTable`, `CollageView`. The text column is centered; the grid column extends `-mx-40` (40px outdent) on each side to break out. Shortlist is a 320px right rail, optionally pinned. `PreferencesCard` sits above the input bar inside the same 640px column.

**Z-index palette:** input bar `z-10`, sticky header `z-20`, shortlist rail `z-30`, modal/sheet `z-40`, dropzone overlay `z-50`. Toasts (none planned) would be `z-60`.

---

## 6. Motion budget (table)

| Component | Property | Duration | Easing | Trigger |
|---|---|---|---|---|
| `MessageBubble` (entry) | `opacity` + `translateY 8→0` | 250ms | `easeOut` `[0.16,1,0.3,1]` | message added |
| `TypingIndicator` dots | `opacity 0.3↔1` (staggered) | 600ms loop | `easeInOut` | bubble pending |
| `ToolStatus` (spinner→check) | swap icon + 1.05 scale pulse | 200ms | `easeOut` | tool completion |
| `ProductCard` (entry) | `opacity` + `translateY 12→0` | 300ms | `easeOut` | mount; stagger 40ms, cap idx 5 |
| `ProductCard` (hover) | `box-shadow` soft→lift | 150ms | `easeOut` | pointer-enter |
| `ProductCard` (expand) | `height auto`, content fade | 250ms | `easeOut` | tap |
| `ProductCard` (collapse) | `height 0`, content fade | 200ms | `easeIn` | tap |
| Buy CTA (hover) | shadow soft→glow, bg 500→600 | 150ms | `easeOut` | pointer-enter |
| `CollageView` (reflow) | masonry `layout` | 400ms | `[0.2,0,0,1]` | view toggle / shortlist remove |
| `Shortlist` (open) | `translateX` (rail) / `translateY` (sheet) | 300ms | `easeOut` | toggle |
| `Shortlist` lane (drag-over) | bg flash `accent-50` | 100ms | linear | drag-enter |
| `ViewToggle` (switch) | indicator slide | 250ms | `easeOut` | tap |
| `PreferencesCard` (chip edit) | swap label↔input | 150ms | `easeOut` | tap |
| `ImageDropzone` (drag-over) | dashed border + tint fade in | 150ms | `easeOut` | dragenter |
| Modal/sheet (open) | scrim fade + sheet rise | 300ms | `easeOut` | trigger |

**No animation longer than 500ms.** If `prefers-reduced-motion: reduce`, *all* of the above collapse to `opacity` crossfades at 100ms; the layout motion budget becomes instant.

---

## 7. Accessibility

- **Focus rings.** Every interactive element gets a visible focus ring on `:focus-visible` only. Default ring: `ring-2 ring-ink-900 ring-offset-2 ring-offset-ink-50`. The Buy CTA uses `accent-200` ring instead. Never suppress focus rings globally.
- **`aria-live` on the SSE stream.** The `ConversationCanvas` wraps streamed assistant content in a region with `aria-live="polite"`, `aria-atomic="false"`. `ToolStatus` updates announce as "Searching for desk lamps under 150 dollars" → "Done."
- **Keyboard nav for product cards.** Each `ProductCard` is a single tabstop; `Enter`/`Space` toggles expansion. Inside an expanded card: variant pills are a roving tabindex group (arrow keys), Buy is the last tabstop.
- **Shortlist drag alternative.** Drag-and-drop has a keyboard fallback: focus a card, press `L`/`M`/`S` to assign to Love/Maybe/Skip. Announce via `aria-live` ("Saved to Love").
- **Reduced motion.** Respect `prefers-reduced-motion: reduce` — see §6.
- **Color contrast.** All text on `ink-50` background must be ≥`ink-600` for ≥4.5:1 (body) or ≥3:1 (large 18px+). `ink-400` (`#8a8a85`) hits 4.16:1 on `ink-50` — acceptable for `text-quiet` *only at ≥12px*, never as primary body copy. Orange `accent-500` on white hits 3.69:1 — acceptable for large text and icons, **not** for body. Always pair orange CTAs with white text for AA compliance.
- **Form labels.** Every input in `PreferencesCard` has a visible label or a clearly associated `aria-label`.
- **Modal focus trap.** Edit modals trap focus and return it to the trigger on close.

---

## 8. Per-cycle design directives

The orchestrator's `cycle-N-design.md` will expand each of these into a checklist. This is the high-level direction.

- **Cycle 1 — Phase A (agent foundation).**
  - Refactor `MessageBubble` to render an ordered list of sub-blocks (`text`, `tool_status`, `products`, `comparison`). Implement `MessageRenderer` and the new `ToolStatus` per §4. Tool status copy template: `<verb> <object>` ("Searching desk lamps under $150"), never "Calling tool `search_catalog`".
  - Fix `ProductCard` border/shadow violation (§2.7).
  - Audit motion: stagger cap of 6, no animation >500ms.

- **Cycle 2 — Phase B (preferences + reasoning + transparency).**
  - Build `ReasoningChips` and `MerchantBlock` per §4. Chip color mapping: `size_match`→ink-tint, `price`/`discount`→`accent-50`, `shipping`→ink, `ethics`→emerald, `low_stock`→amber.
  - Build `PreferencesCard` desktop (sticky above input) and mobile (collapsed-line → sheet).
  - Decide and codify `success`/`warn` colors before chips ship (resolves §2.3 [ASSUMPTION]).

- **Cycle 3 — Phase C-1 (collage + shortlist + bundles).**
  - Build `CollageView` (CSS columns masonry), `ViewToggle`, `Shortlist` (rail + sheet variants), `OutfitBundle`.
  - Implement layout motion budget (`motion-layout`, 400ms) for collage reflow and lane reordering.
  - Wire `prefers-reduced-motion` fallback at this cycle; it's where motion debt becomes visible.

- **Cycle 4 — Phase C-2 (photo → style).**
  - Build `ImageDropzone` as an input-bar overlay (not a separate page). Drag-over and uploading states from §4.
  - On a successful extraction, the assistant message renders an inline "I see: [attributes]" chip row followed by the product results. Attributes use the chip style from `ReasoningChips`.

- **Cycle 5 — Phase D (summary + mobile + a11y).**
  - Build `SummaryHero` (serif italic), `SummaryProductList`, `SummaryShareBar`. This is where the serif gets its hero moment — the only full-page serif treatment in the app.
  - Mobile polish pass: tap targets ≥44px, Shortlist bottom-sheet review, `PreferencesCard` mobile sheet review.
  - Accessibility pass against §7 as a checklist.

- **Cycle 6 — Hardening.**
  - Visual QA: scan every screen for §2.7 (shadow + border violations), §2.5 (forbidden spacing), §2.4 (serif misuse). Fix.
  - Lighthouse a11y ≥95 on chat page and summary page.
  - Reduced-motion smoke test.

---

## 9. References (specifically what to borrow)

- **Granola** — dim tool-status indicators ("Listening...", "Summarizing...") set the standard for §3.1 "Invisible AI". Borrow: typography weight and color (`text-xs text-quiet`), the use of a tiny spinning dot rather than a bar.
- **Arc Search** — content-first results that feel authored, not retrieved. Borrow: the way Arc presents a synthesized answer with sources as inline citations — our `MessageRenderer` should feel similarly composed (text → product group → text → comparison), not "here is a list".
- **Linear Asks** — the input bar treatment. Borrow: the `rounded-3xl` pill, the calm send button (ours is `ink-900` filled circle), the subtlety of focus state (we shift border `ink-200`→`ink-400`, no glow).
- **Claude artifacts** — generative UI inside a chat stream is *the* unlock. Borrow: the convention that components are first-class peers of text in the conversation, with the same entry motion and the same spatial logic.
- **Daydream (iOS)** — the visual-first commerce vocabulary. Borrow: how Daydream uses generous image sizing and minimal chrome on product cards; informs our `CollageView` and the collapsed-card image at 96px (which is large for a list, deliberately).
- **Instrument Serif on apple.com / Vercel marketing** — the italic display moment. Borrow: italic for *feeling* lines (the summary hero gist), upright for headers (section labels on the lookbook). Never italic in UI body text.

---

## Appendix — open items / tensions flagged for the orchestrator

1. **Existing `ProductCard.tsx` violates §2.7** (`border border-ink-100 ... shadow-soft`). Cycle 1 must fix as part of the Phase A rewrite, not deferred to Phase D as the plan implies ("visually refreshed in Phase D"). The violation is small but compounding — every future component will copy the pattern if not fixed first.
2. **Plan §"Design language" says "Soft shadows + 1px borders, never both"** — agrees with this doc. Plan also says "shadow-glow" implied for buy CTA but no token exists yet. This doc adds `shadow-glow` in §2.7; `tailwind.config.ts` will need to be extended in Cycle 1.
3. **`success`/`warn`/`danger` semantic colors** — this doc uses Tailwind defaults (emerald/amber/rose) as `[ASSUMPTION]`. Cycle 2 design directive must confirm before reasoning chips ship.
4. **`ink-300` and `ink-700`** are not in `tailwind.config.ts` today. This doc lists them as additions but does not require them yet; add only when first needed (likely Cycle 3 for the dragged-card scrim and Cycle 5 for summary-page typography).
5. **Plan calls for Framer Motion `layout` props for collage reflow** (correct) but doesn't specify a budget. This doc sets it at 400ms — `motion-layout` in §2.8. Engineers in Cycle 3 must use this constant, not roll their own.
