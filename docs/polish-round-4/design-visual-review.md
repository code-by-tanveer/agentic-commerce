# Design Lead — Full Visual Review (Round 4)

**Setup notes.** Backend booted at `:4020`, frontend at `:3030` (npm script hardcodes `-p 3000`, so I invoked `npx next dev -p 3030` directly with `BACKEND_URL=http://localhost:4020`). Curled `/` (returned a 13.7 KB SSR'd HTML with full chrome present), `/s/test` (correctly 404'd because no session exists — but the rendered head still emits the OG meta tags and points at `/api/og?id=test`), and `/api/og?id=test` (returned a valid PNG, 1200×630, ~28 KB — falls back to the generic "A collection from Agentic Commerce" gist because the BE has no blob). I cannot pixel-measure at runtime; everything below is reasoned from DOM, Tailwind classes, and the tokens in `docs/DESIGN.md`. Files saved to `/tmp/r4-views/{home.html, lookbook-test.html, og.png, og-empty.png}`.

## View-by-view audit

### 1. `/` empty state
**What I see.** A 56px-tall sticky header with the serif wordmark "Agentic Commerce" left-aligned, the segmented List/Collage view toggle + a quiet "Shortlist 0" pill on the right (the New chat button is gated behind `hasHistory`, so it's absent on a fresh load — `Header.tsx:77`). The canvas (`max-w-3xl`, `px-4 py-6`) holds one white assistant bubble with a single sentence ("Tell me what you're shopping for — …"). Below it, four sans rounded-full starter chips wrap on phone widths. The "About you" empty-prompt card sits sticky just above the InputBar; below the input pill itself, the two-line trust disclosure ("Prices and availability come from Shopify merchants. / Ranking is preference-driven, not paid placement.") in `text-[11px] text-ink-400`.

At **desktop** the column is centered at 768px; at **tablet** identical (same `max-w-3xl`); at **phone** the chips wrap into 2–3 rows, the empty PreferencesCard collapses to the single-line "About you · Tap to add" trigger (`PreferencesCard.tsx:96-123`).

**What works.** The wordmark + the welcome sentence + chips form a clean three-step rhythm. The serif appears exactly once (Header wordmark), the orange appears zero times — perfect restraint. Trust copy in muted 11px reads as fine print, not marketing. The chip prompts have voice ("a desk lamp that won't look like an Ikea cliché") — these are the strongest tell that this isn't a chatbot.

**What's off.**
- `SuggestionChips.tsx:24` keeps `border border-ink-200` on chips with `bg-white` — but they sit on `bg-ink-50` and look fine *visually*; the issue is they violate the shadow-XOR-border rule less directly (no shadow), so they're technically clean. The real friction is **density vs hierarchy**: the welcome sentence is the same size, weight, color, and bubble shape as a future assistant reply. There's no visual moment of arrival — no "the app speaks" gesture. Compare to Granola's first screen, which uses a beat of typographic difference to mark the empty state.
- The empty PreferencesCard sticky panel (`page.tsx:61`) is rendered above the input on desktop even with zero prefs; the EmptyPrompt ("I'll save the basics here as we chat…") is essentially a second piece of "welcome" copy stacked under the bubble's welcome copy. Two welcome moments compete (`PreferencesCard.tsx:156-167`).
- The starter chips animate `opacity: 0 → 1` via Framer (no `y` offset, `delay: 0.1`, `SuggestionChips.tsx:13-17`). The bubble has `y: 8 → 0` entry. The visual hierarchy reads as: bubble lands, chips appear *under* it almost simultaneously. A 200ms stagger (chips after bubble settles) would let the bubble "speak" first and the chips arrive as the response to it.
- Trust disclosure (`InputBar.tsx:178`) is permanent regardless of state. On the empty state it's actually load-bearing (it's the user's first read of the value prop); on subsequent turns it becomes chrome noise. Worth A/B'ing.

**What I'd change.**
- `ConversationCanvas.tsx:31` and `MessageBubble.tsx:96` — render the welcome sentence in `text-base font-display italic` inside an unstyled "voice" container, not the same white bubble shape as everything else. The serif's hero moment is the lookbook gist; the empty state earns a quieter italic touch (one line, no bubble).
- `PreferencesCard.tsx:91-93` — on desktop empty-state, suppress `EmptyPrompt` entirely (it's discoverable through the InputBar disclosure plus the eventual chip appearance). Only render the sticky panel when `count > 0` OR `hydrating`. Saves a ~64px vertical band on first load.
- `SuggestionChips.tsx:14-16` — add a `delay: 0.4` and reduce-motion guard so the chips materialize *after* the bubble settles.

### 2. `/` populated
**What I see.** After a query, the user's `ink-900` filled bubble sits right (rounded-2xl, `rounded-br-md` corner), then an assistant bubble that contains, in order: a `ToolStatus` row ("Searching desk lamps under $150" with a rotating dot → flips to a check at done, `ToolStatus.tsx:96-110`), then a short text block, then a `ProductCardGroup`. With 4 products at desktop, `ProductCardGroup.tsx:25-29` renders `grid-cols-2 gap-3` — so a 2×2 grid inside the assistant bubble. At phone widths, it collapses to one column (4 stacked cards), each ~360px tall collapsed.

**What works.** ToolStatus is genuinely Granola-shaped: tiny rotating dot, sentence-cased verb + object, then a check. No emoji. No "I called search_catalog". The principle 1 ("invisible AI") goal lands. The product grid is densely-sized (96×96 image, 14px title) so 4 cards fit on a laptop without scrolling away from the conversation thread.

**What's off.**
- The product grid is **inside** the assistant bubble's white `rounded-2xl bg-white shadow-soft` (`MessageBubble.tsx:94-97`), so a 2×2 grid of *individually* shadowed product cards sits inside another shadowed surface. Shadow-on-shadow nested elevation is the visual sibling of "border + shadow" — DESIGN.md §2.7's spirit is one elevation cue per layer. The cards visually fight the bubble.
- The assistant bubble has `max-w-[80%]` (`MessageBubble.tsx:96`) — at desktop that caps the cards at ~614px, so each card is ~300px wide. The DESIGN.md §5 calls for a 960px grid column that outdents from the 640px text column. Today the grid is glued inside the text column's bubble, so it never breaks out. The 2x2 looks cramped on a 14" laptop.
- The `ProductCardGroup` motion: `motion.div layout` parent + per-card stagger + framer's automatic layout reflow. With 4 cards landing simultaneously, the cascade is correct (40ms cap of 6 — `ProductCard.tsx:84`), but combined with the bubble's `y:8` entry on the wrapping `MessageBubble` (`MessageBubble.tsx:24,28`), the whole stack lurches twice.
- Streaming text rendering uses `whitespace-pre-wrap` plus `text-ink-900` (`MessageRenderer.tsx:64`). Mid-stream, the text appears character-by-character with no cursor and no breathing. Granola/Arc both inject a subtle caret. Without one, the text just appears, which can read as "frozen" if a token batches.

**What I'd change.**
- `MessageBubble.tsx:94-104` — when `message.blocks` contains a `products`, `comparison`, or `outfit` sub-block, drop the surrounding bubble's white shadow/padding for those blocks and render them edge-to-edge in a 960px outdent (use `-mx-40` per DESIGN.md §5 desktop spec). Keep the bubble for pure-text content.
- `MessageRenderer.tsx:63-67` — append a streaming caret (`▍` or a 2px-wide pulsing div) at the tail of an in-flight text block. ≤500ms loop.
- `ProductCardGroup.tsx:25` — at `lg:` go to 3 columns when the grid breaks out, not 2.

### 3. ProductCard expanded
**What I see.** Tap a collapsed card → the `AnimatePresence` body grows from 0 to auto height, 250ms easeOut (`ProductCard.tsx:256-262`). Inside the expanded body, top-to-bottom: a horizontal thumbnail strip (max 6 images, each 80×80 `rounded-lg`, `gap-2`, `-mx-1` to bleed the row), description (truncated at 360 chars with a soft ellipsis), VariantPicker if >1 variant, MerchantBlock if `merchantInfo` exists, then a divider, then the Total label (`uppercase tracking-wider 11px text-ink-400`) with the price in `font-display text-lg` serif (`ProductCard.tsx:304-308`), and right-aligned the Pair-with chip ("Pair with…", `bg-white shadow-soft`) + the orange Buy CTA ("Buy on {merchant}", `bg-accent-500 → accent-600 hover`, `focus-visible:shadow-glow`).

**What works.** The serif-on-the-Total-price is the most earned of the four serif moments — it's the exact "the price is the verdict" beat the type-pairing spec calls for. The orange Buy CTA, the only orange on this whole screen *except* if a discount chip is present, holds its weight. MerchantBlock with its stars + return-policy pill + "Made in" line + "merchant didn't publish X" disclosure is the strongest trust beat in the app.

**What's off.**
- Inside the expanded body, the thumbnail strip's `pb-1 scrollbar-thin` (`ProductCard.tsx:266`) leaves a subtle 8px scrollbar gutter under the row. With only 1–2 extra images (common), there's no scroll, and the gutter is just visual debt.
- The "Pair with…" button (`ProductCard.tsx:314-325`) and the Buy CTA share a row with `gap-2`. On phone, with a long merchant name, "Buy on {Hawthorne Bros. & Co.}" can push the Pair-with onto its own line, breaking the visual rhythm. The Pair-with button is also `bg-white shadow-soft` — another shadow-on-shadow with the surrounding card.
- The expanded body is wrapped in `border-t border-ink-100` (`ProductCard.tsx:262`) as a divider. This is fine as a hairline divider per §2.7, but combined with the inner `border-t border-ink-100 pt-3` on the Total block (`ProductCard.tsx:302`), the expanded body has two parallel hairlines stacked ~24px apart. Visual stutter.
- VariantPicker (`VariantPicker.tsx:46-50, 84-88`) still uses `border border-ink-200` on inactive pills. On a `bg-white` card with `shadow-soft`, that's a 1px border on a shadowed surface (the inner pill itself), so by §2.7 the pill should be border-only or shadow-only. It's border-only (no shadow on the pill), so it's actually compliant — but the *visual* of bordered pills inside a shadowed card with no border feels inconsistent with how the SuggestionChips look on `bg-ink-50` outside any card.

**What I'd change.**
- `ProductCard.tsx:266` — hide the scrollbar (`-mb-1` on the strip wrapper or `scrollbar-thin` only when overflow exists) so 2-image rows don't show the gutter.
- `ProductCard.tsx:302` — drop the inner `border-t` on the Total block. The 24px space-y-4 between the merchant block and the Total is plenty of separation; one divider per expansion is enough.
- `ProductCard.tsx:314-325` — collapse "Pair with…" to a 36×36 wand icon on phone widths so the row doesn't wrap when merchant names are long.

### 4. CollageView (8 cards across breakpoints)
**What I see.** CSS columns masonry: `columns-2 gap-3 sm:columns-3 lg:columns-4` (`CollageView.tsx:54`). Each card is `aspect-[4/5]` (`CollageView.tsx:215`) so all tiles have the same shape, not true masonry; this is "grid pretending to be masonry". With 8 products: phone = 4 rows of 2, tablet = ~3 rows (some columns get 3 cards, some 2), desktop = 2 rows of 4. Hover/focus reveals the serif price overlay over a `from-ink-900/70` gradient (`CollageView.tsx:228-238`).

**What works.** The hover overlay's serif price over a dark scrim is the magazine moment — exactly the §2.4 #4 spec. The card chrome is image-only at rest, so a desktop 4-up reads as a contact sheet. This is the view that most differentiates the app from ChatGPT Shopping.

**What's off.**
- All cards are `aspect-[4/5]` — *uniform aspect ratio breaks the masonry premise*. CSS columns work because heights vary, creating the staggered Pinterest look. With every card at 4:5, the columns line up in horizontal rows. It's a grid, not a masonry. Either commit to real masonry (let product images dictate aspect within sensible bounds) or rename to `Grid`.
- The hover overlay only appears on `[@media(hover:hover)]` (`CollageView.tsx:230-231`). On touch devices, the overlay is *always visible* (`@media(hover:none):opacity-100` via the absence of the hover gate). That means on iPad, every image has a permanent dark scrim with the title + price burned in — the magazine cleanness is gone. The fix is to use `:focus-within` plus a tap-once-to-reveal for touch, not always-on.
- `aspect-[4/5]` is a non-canonical Tailwind ratio — DESIGN.md §2.5 forbids decimals but allows `aspect-[…]` arbitrary values; this is a carve-out worth flagging in the spec.
- The chevron in `CollageView.tsx:244-250` sits over the image with `text-white drop-shadow`. With a light-image product (white background), the chevron is invisible until hover. Fine, but worth noting for the "always-on for touch" issue above.
- Inside the expanded panel (`CollageView.tsx:265-322`), the layout repeats most of ProductCard's expanded body (title, merchant, chips, description, variants, merchant block, Buy CTA) but with `space-y-3` instead of `space-y-4`. Two near-identical expanded experiences with subtle spacing drift.

**What I'd change.**
- `CollageView.tsx:215` — drop the `aspect-[4/5]` constraint; let `<img>` self-size with `w-full h-auto` and add a `min-h-[200px]` floor to avoid spaghetti when an image is missing. That's the actual masonry the spec calls for.
- `CollageView.tsx:228-238` — gate the hover overlay on `:focus-within` and add a `data-touched` state for the touch-once-reveal. Stop forcing it on touch devices.
- Extract a shared `ExpandedProductBody` between `ProductCard.tsx:264-350` and `CollageView.tsx:264-322`. Two implementations will drift.

### 5. Shortlist drawer
**What I see.** Desktop ≥1024: a 320px right rail (`fixed right-0 top-0 h-dvh`, `Shortlist.tsx:96-98`), slides in from the right at 300ms easeOut. Header row with "Shortlist · `0 loved · 0 maybe`" + close X. Three lane sections stacked vertically: Love (heart icon), Maybe (HelpCircle), Skip (XCircle). Each lane is `rounded-2xl bg-ink-50 p-3` and flashes `bg-accent-50` on drag-over (`Shortlist.tsx:202`). Empty lanes show a single-line hint ("Tap the heart on any product to save it here."). Mobile <1024: a bottom sheet with a drag-affordance bar, focus-trapped, tabs (Love/Maybe/Skip) horizontally, single-lane visible at a time.

**What works.** The desktop rail's three-lane vertical stack is one of the strongest layout moves in the app — three jobs, three columns of work to do, all visible. The new heart-icon save flow is a real upgrade over drag-only: `aria-pressed` + `fill-rose-500` when loved (`ProductCard.tsx:179, 183`), with a sr-only `aria-live` announcement ("Saved to Love"). The L/M/S keyboard fallback works case-insensitive (`ProductCard.tsx:109`).

**What's off.**
- The heart uses `text-rose-500 fill-rose-500` for the loved state. **Rose** is the only red in the design system, and DESIGN.md §2.3 reserves it for `danger`. The Love-state heart isn't a danger state — it's an affection state. This is a small but real palette violation. The fix is to use `accent-500` (orange = commitment), but §2.2 explicitly says orange is "commerce-intent affordances" only. So neither rose nor orange is right; the heart should likely be `ink-900` filled (the same anchor color as the wordmark) when loved. Right now there's a third color introduced (rose) that doesn't show up anywhere else for "love."
- The rail's `shadow-soft bg-white` (`Shortlist.tsx:97`) sits on a `bg-ink-50` page with no border. Compliant. But it lacks any breathing element at the top edge — the rail starts at `top-0` flush with the header, which itself has `bg-ink-50/80 backdrop-blur`. On scroll, the rail and the header bottom-border (`border-b border-ink-100`) abut. There's no visual where the rail "joins" the chrome.
- The mobile sheet header has the same `Shortlist` title and counts as the rail (`Shortlist.tsx:346-358`), but the rail uses a `<Layers>` icon and the sheet doesn't. Inconsistent.
- The LaneItem remove button (`Shortlist.tsx:260-272`) uses `p-1` visible + `before:-inset-3` for the tap pad. That's compliant. But the close `X` icon on it is only `h-3 w-3` — very small to spot among lane items.
- The drag affordance: the rail accepts drops, but there's no on-screen affordance that a card *can* be dragged from the canvas. Native HTML5 DnD doesn't give an "I can be picked up" cursor by default; the cards look static at rest. The new heart-icon saves are the easier path; the drag flow is essentially undiscoverable.

**What I'd change.**
- `ProductCard.tsx:178-185` and `CollageView.tsx:197-204` — switch the loved-heart color to `text-ink-900` with `fill-ink-900`, removing rose-500 from the palette except for errors.
- `Shortlist.tsx:97` — add a hairline `border-l border-ink-100` on the rail's left edge (the only legitimate "border" use in this surface, since the rail and the canvas need a seam; alternatively, `bg-white` on a `bg-ink-50` page already creates the seam if the rail sits flush — but the shadow is on the wrong axis for left-edge separation).
- `Shortlist.tsx:140-146` — add `<Layers>` icon to MobileHeader for visual parity.

### 6. PreferencesCard
**What I see.** Desktop sticky panel above the InputBar (mounted at `page.tsx:61` with `sticky bottom-[var(--input-bar-height,100px)]`). Hydrating state: two `bg-ink-100 animate-pulse` skeleton chip pills (`PreferencesCard.tsx:172-198`). Hydrated empty state: the "About you" EmptyPrompt card with a single sentence. Populated state: a chip row of inline-editable pills, each `bg-ink-50 pl-2 pr-1 py-1 text-xs` with `text-ink-400` label + `text-ink-900` value + tiny X. The new ethics multi-select chip grid expands to `basis-full rounded-2xl bg-ink-50 p-3` with a 2/4-column grid of toggle pills using emerald (selected) / ink (default) — `PreferencesCard.tsx:686-707`. Mobile: collapsed one-line button "About you · Tap to add" (`PreferencesCard.tsx:101-121`), opens a focus-trapped bottom sheet.

**What works.** The chip row reads as preferences with personality — "Budget: ≤$200", "Ethics: Sustainable, Fair-trade" — rather than a settings form. The ethics multi-select correctly uses emerald (the success state) for selected, avoiding orange (commitment), preserving the §2.2 rule. The SavedPulse (`PreferencesCard.tsx:800-823`) gives a satisfying micro-receipt without a toast.

**What's off.**
- The chip row is `flex flex-wrap items-center gap-2` (`PreferencesCard.tsx:230`). When the user opens the ethics grid, it adds `basis-full` to its outer container, but the surrounding wrapper isn't a flex with `flex-wrap: wrap` — it's `flex flex-col gap-2` (`PreferencesCard.tsx:228-229`). The `basis-full` works only because the inner `flex flex-wrap` (line 230) does wrap. But it means the ethics grid sits *inside the inline chip row*, not as a separate panel. The visual is: chip, chip, chip, chip, [a big rounded-2xl box that spans the row], chip. It's a layout shock.
- Skeleton chips during hydration use `h-6 w-20` — `h-6` corresponds to 24px, but real chips are `text-xs` with `py-1` (≈22-24px) — fine. The width-20 (80px) is roughly two of the three chips' average. Acceptable, but a true skeleton matches the average chip width including the X.
- The desktop "Edit · ✕ to clear" hint (`PreferencesCard.tsx:147-150`) uses a bullet • encoded literally; in 11px text on a sticky surface, the `·` middle-dot at this size on Inter looks like a dropped pixel. Use a thinner separator or just `Edit · ✕ to clear` with whitespace.
- The chip row's `Pencil` mobile-trigger icon (`PreferencesCard.tsx:111`) is at `h-3.5 w-3.5` — fine. But the parent button at `h-11` plus `text-sm` is the only `text-sm` "above input" affordance on mobile, larger than the chips it would expand to. Visually heavier than its desktop equivalent.

**What I'd change.**
- `PreferencesCard.tsx:228-229` — when `editingKey === 'ethics'`, render the grid as a *separate panel below* the chip row (use a conditional render at the outer `flex flex-col gap-2` level) instead of letting it bask in the wrap.
- `PreferencesCard.tsx:147-150` — drop the right-side hint entirely on desktop. It's "self-evident affordance" copy ("Tap to edit") — magazine-not-chatbot says: if affordances need labels, redesign the affordance.
- `PreferencesCard.tsx:185-186` — make skeleton width vary (`w-16` and `w-24`) so the placeholder doesn't look like a stencil.

### 7. OutfitBundle
**What I see.** `rounded-2xl bg-accent-50 p-4 shadow-soft` outer frame — the only large-area orange-tint surface in the app (`OutfitBundle.tsx:90`). Header has a Sparkles icon in `text-accent-600` + "A coordinated set" title left, "N items · $TOTAL" meta right. Optional bundle-level rationale paragraph in `text-xs text-ink-600`. Grid of 2–4 product cells (`grid-cols-2 gap-2` for all counts; 3-card uses a hero `col-span-2` + 2 below — `OutfitBundle.tsx:108-118`). Each cell is `bg-white rounded-xl shadow-soft p-2` with thumbnail + title + price + external-link icon + per-cell rationale line. Bottom row: "Saves all N to your Love lane" hint + the orange Buy/Save CTA (`bg-accent-500 → accent-600 hover`).

**What works.** The accent-50 frame is the only legitimate place in the app where a large surface is tinted with the brand color — and the "this is one composed object" reading lands. Per-item rationale strings (Round 2's addition) are the move that elevates this from "three random products" to "the agent paired these for a reason." The Save outfit → Saved (emerald-50) flip is correctly the success-state, not commitment-state, color.

**What's off.**
- `accent-50` on the outer + `bg-accent-500` on the CTA + `text-accent-600` on the Sparkles icon means **three accent-family colors** in one composite. DESIGN.md §2.2 lists accent-50 (background only, discount-chip or outfit-frame), accent-200 (Buy focus ring / variant selected), accent-500 (CTA fill), accent-600 (CTA hover). The Sparkles icon at `accent-600` is using the *hover variant* of the CTA color for a non-hover, non-CTA element. It's the wrong rung of the ladder.
- The 3-card layout (`OutfitBundle.tsx:108-118`) uses a hero `col-span-2` on top + 2 below. But the hero cell visually weighs more than the row below; with the 4-card 2×2 case, all cells are equal weight. The 3-card hero treatment isn't justified by the data — there's no "anchor product" pinned to top. The anchor is `anchorProductId`, but the component doesn't render anchor differently *within* the bundle, just orders it first.
- `BundleCell` (`OutfitBundle.tsx:199-240`) gives every cell its own `shadow-soft`. So you have an outer accent-50 card with `shadow-soft`, containing N white cards each with `shadow-soft`. Three+ shadows stacked.
- The Save CTA disabled state during save (`OutfitBundle.tsx:146`) is `cursor-wait bg-ink-100 text-ink-400` — but the user can't see the wait cursor if they've moved their pointer away. No spinner.

**What I'd change.**
- `OutfitBundle.tsx:95` — Sparkles icon should be `text-ink-400` or `text-accent-500` (one of the canonical rungs), not `accent-600`.
- `OutfitBundle.tsx:202` — drop `shadow-soft` from the inner BundleCell; let the white-on-accent-50 contrast be the cue. One shadow per bundle.
- `OutfitBundle.tsx:108-118` — flatten the 3-card layout to `grid-cols-3 gap-2` (equal-weight). Reserve the hero treatment for an explicit "anchor" emphasis variant.
- `OutfitBundle.tsx:144-148` — add a `Loader2 animate-spin` inside the saving state.

### 8. Moodboard
**What I see.** `rounded-2xl bg-white p-3 shadow-soft` (`Moodboard.tsx:124`) — small card. 96×96 (phone) / 128×128 (desktop) thumbnail + flex-wrapping editable attribute chip row + a `text-xs text-ink-400` "Searching for: …" caption below. Chips are `bg-ink-100 px-2 py-1 text-xs font-medium` with a fade-in X on hover (`Moodboard.tsx:177`).

**What works.** Card is small (~`h-32`-ish), correctly subordinate to the products it precedes. Editable chips with the inline `+ Add` button + Enter-to-commit feel native. The pseudo-element 44px tap pad on each chip's X is the right pattern.

**What's off.**
- The chip palette is *only* `bg-ink-100` here, while `ReasoningChips` uses 6 distinct kinds + tones. A Moodboard chip and a "size_match" reasoning chip look identical, which makes them feel like the same "type of thing." They're not — one is *editable input*, the other is *the agent's verdict*. Need visual differentiation.
- "Searching for: …" caption (`Moodboard.tsx:213-215`) reads like a status, not a verdict. After the search has completed, the line should change tense or hide. Right now it's a permanent label.

**What I'd change.**
- `Moodboard.tsx:158` — make the moodboard chip a subtly different shape — `bg-white border border-ink-200` (border, no shadow, compliant) or `bg-ink-50` with the dotted-border treatment of an "input affordance." Distinct from reasoning chips.

### 9. ImageDropzone overlay
**What I see.** At rest: invisible (DOM is empty until drag). On drag-enter: a `fixed inset-0 z-50 bg-ink-900/10 backdrop-blur-sm` scrim with an inset `border-2 border-dashed border-accent-200 bg-white/50` frame in the center, with a `text-xs text-ink-400` "Drop to attach" line (`ImageDropzone.tsx:131-138`). 150ms easeOut fade.

**What works.** Idle-invisible is the right call — no permanent "drop here" affordance polluting the resting canvas. The dashed accent-200 frame is the *one* place accent-200 appears as a chrome color (its other use is in DESIGN.md spec as a Buy-focus-ring, which today is replaced by shadow-glow). The copy ("Drop to attach") is restrained.

**What's off.**
- "Drop to attach" at `text-xs text-ink-400` is **whispered** at the moment when the user is in mid-gesture and needs confirmation. The text is too quiet on the white/50 frame.
- accent-200 dashed border is the only accent-200 use in the app — fine — but feels disconnected from the orange Buy CTA semantic. Drag-to-search is not a commerce-intent moment; using the commerce color for it muddies the rule.
- The error toast in `ImageDropzone.tsx:144-163` is at `fixed bottom-24 left-1/2 z-40` — hardcoded `bottom-24` doesn't track the InputBar height variable (`--input-bar-height`) the PreferencesCard does. On a multi-line input expand, this toast will land *inside* the input bar.

**What I'd change.**
- `ImageDropzone.tsx:137` — bump to `text-sm text-ink-600` and add a 16×16 icon (e.g. `<ImagePlus>`); the moment of drag deserves visible reassurance.
- `ImageDropzone.tsx:136` — switch the dashed border to `border-ink-400` (or a desaturated `ink-200`); reserve accent-200 for either Buy focus or drop entirely (it's currently the orphan).
- `ImageDropzone.tsx:153` — make the toast offset reference `var(--input-bar-height)` like the PreferencesCard.

### 10. `/s/[id]` lookbook
**What I see.** Server-rendered. Top: 48–64px top padding then a 720px-centered header with an 11px uppercase "A LOOKBOOK FROM AGENTIC COMMERCE" eyebrow, a `text-3xl font-display italic` gist sentence ("A quiet desk for a slow morning."), then a meta line ("May 13, 2026 · 7 items · 4 merchants"). Body: three sections ("What you loved", "Saved outfits", "All considered"), each header `text-2xl font-display` (upright) + a per-section item-count eyebrow. Loved/considered items are `flex gap-4 rounded-2xl bg-white p-4 shadow-soft` rows. Outfit cells use the `rounded-2xl bg-accent-50 p-4 shadow-soft` frame plus a 2/4-column inner grid of white tiles. Sticky bottom: `SummaryShareBar` with "Open in chat" (text link) + optional Share (when `navigator.share`) + Copy link (ink-900 fill → emerald-50 flip on copy).

**What works.** The serif gist is *the* moment of voice in the entire app — three of the four serif homes are on this one page (hero + section headers + the outfit-bundle implicit). Italic for the hero, upright for the section headers, exactly per §2.4. The fact that the entire page works with JS disabled (server component) is a quiet quality flex. The "Open in chat" link with `?session=<id>` deep-link is the right re-entry pattern.

**What's off.**
- I 404'd because there's no real summary in the DB. But the head still emits the OG meta tags pointing at `/api/og?id=test`, which itself fallback-renders to a generic gist. That means a malformed share link emits a *valid* 1200×630 image card on iMessage/Twitter that says "A collection from Agentic Commerce" — and the recipient clicks through to a Next.js 404 page. The OG image and the page disagree about whether the share exists. This is a moderate trust issue: links should fail visibly or work — never half-work.
- "All considered" copy (`SummaryProductList.tsx:199`) for the "maybe" lane is a euphemism. Most users won't connect "maybe" → "all considered." Either keep the lane name ("Maybe") for continuity with the in-app shortlist, or drop the section header to "Also considered" / "On the fence."
- Section spacing: each `<Section>` is `px-4 py-6` (`SummaryProductList.tsx:101`). Between the SummaryHero (`pb-8 pt-12`) and the first Section, there's a 24+32 = 56px gap. Between Section A and Section B, only 24+24 = 48px. The hero-to-body gap should be larger than section-to-section, but it's barely larger.
- `SummaryShareBar.tsx:62-69` — sticky bottom with `bg-ink-50/90 backdrop-blur` and a `border-t`. On a long lookbook, this floats at all times. Some links are at the bottom of the page and get permanently scrim'd by the bar. Acceptable but worth knowing.

**What I'd change.**
- `app/api/og/route.tsx:60-66` — when `loadBlob(id)` returns `null`, return a 404 from the OG route too (or at minimum, render a "Not found" image, not a generic share card). Match the page's truth.
- `SummaryProductList.tsx:199` — rename to "Maybe" or "Also considered" for continuity.
- `SummaryProductList.tsx:101` — bump first `<Section>` to `pt-8` (or have SummaryHero own a `pb-12` instead) so the eye registers "hero ends, body begins."

### 11. OG image route
**What I see.** `/api/og?id=test` returns a valid PNG, **1200×630**, ~28 KB, 8-bit RGBA, non-interlaced. The route renders an `ImageResponse` with `backgroundColor: #f7f7f5` (ink-50), an 18px tracking-4 uppercase "AGENTIC COMMERCE" eyebrow in system sans, a 72px italic Georgia-serif gist (`fontFamily: 'Georgia, serif'`), a 22px sans meta line, and a right-aligned 3-up product thumbnail strip at 160×160 rounded-16. Both `?id=test` (404 in DB) and the no-id case return the *same* generic image (the fallback gist + no thumbs).

**What works.** Correct dimensions for Twitter / iMessage / Slack. Serif on the gist matches the in-app hero. ink-50 background matches the page. Honors the design tokens.

**What's off.**
- Uses `Georgia, serif` as a fallback for Instrument Serif — at edge runtime, `Instrument Serif` isn't loaded via Google Fonts (no `<link>` available in `ImageResponse`). So the deployed OG image renders in **Georgia**, not Instrument Serif. Most viewers won't notice, but the brand wordmark inside the app will look different from the share preview. Worth either loading Instrument Serif via `fetch` + `fonts: [{ name, data }]` in the ImageResponse options, or accepting the divergence and noting it.
- Empty-state image (no thumbs) leaves a large amount of empty right-side space. A no-thumb fallback could render a 480×480 wordmark in the right slot instead.

**What I'd change.**
- `app/api/og/route.tsx:79` — load Instrument Serif buffer once at module top and pass via `fonts:` to ImageResponse. Brand consistency.

## Cross-cutting checks

- **Type rhythm.** Inter throughout body/UI, Instrument Serif at 6 callsites (`Header.tsx:44`, `SummaryHero.tsx:40`, `SummaryProductList.tsx:104`, `ProductCard.tsx:307`, `CollageView.tsx:236`, `OutfitBundle` does NOT use serif — correct per spec). That's serif in 5 distinct *visual* locations: chat header wordmark, expanded card Total, collage hover price, lookbook hero, lookbook section headers. DESIGN.md §2.4 lists 4 homes (expanded-card price, summary hero, lookbook section headers, collage hover). The header wordmark is the *fifth* — spec'd in §2.4 itself ("the page-header wordmark as one of the four allowed serif homes" — `Header.tsx:15` cites it). So the comment "4 places" in §2.4 is actually 5, and the code is consistent with the spec but the spec contradicts itself.
- **Orange-usage count.** Distinct orange surfaces in the app: `accent-500` Buy CTA (ProductCard collapsed has `bg-ink-900`, ProductCard expanded uses `bg-accent-500`, CollageView expanded uses `bg-accent-500`, OutfitBundle Save uses `bg-accent-500`) = **3 callsites**. `accent-50` backgrounds: discount reasoning chip, outfit-bundle frame, shortlist lane drag-over flash, summary outfit-cell frame = **4 callsites**. `accent-200` border: ImageDropzone dashed frame = **1 callsite**. `accent-600`: OutfitBundle Sparkles icon (spec violation — see §7) + hover states of all `accent-500` fills. Total chromatic accent presence is restrained as designed; the one spec creep is the Sparkles icon at `accent-600`.
- **Motion durations.** Greppable durations: `0.1` (×15 — reduce-motion fallback), `0.15` (×3 — chip swaps, dropzone fade), `0.2` (×3 — scrim fade), `0.25` (×3 — bubble entry, expand), `0.3` (×6 — card entry, sheet open, sticky), `0.4` (×1 — `CollageView.tsx:158` layout reflow), `0.6` (×3 — typing indicator + tool spinner loops). **Zero violations of the 500ms cap.** Layout-motion at 400ms is correctly used once. The 600ms loops are infinite, not finite durations — compliant with the §6 typing-indicator row.
- **Focus rings.** 43 `focus-visible:` declarations across components. Every interactive element I sampled (`InputBar` send button, `Header` shortlist/new-chat, `ProductCard` heart, Buy CTAs use `shadow-glow` instead of ring), `Shortlist` close/remove, `PreferencesCard` chips and grid options, `SummaryShareBar` buttons) has a visible focus ring. The Buy CTAs swap ring→shadow-glow correctly per §2.7 last paragraph. Compliant.
- **Empty / loading / error states.**
  - Empty conversation: present (`ConversationCanvas.tsx:50-54`).
  - Loading conversation (typing dots): present (`MessageBubble.tsx:68-81`).
  - Loading prefs (skeleton chips): present (`PreferencesCard.tsx:84-87`).
  - Loading shortlist (skeleton lane): present (`Shortlist.tsx:212-217`).
  - Empty shortlist lanes (hint text): present.
  - Empty product search ("Nothing matched"): present (`MessageRenderer.tsx:84-99`).
  - Error message blocks (rose-50 alert + retry): present (`MessageRenderer.tsx:135-156`).
  - Upload error toast: present (`ImageDropzone.tsx:144-163`).
  - Share error inline: present (`ShareButton.tsx:96-101`).
  - Preference revert error: present (`PreferencesCard.tsx:327-332`).
  - **Gap:** the home view has no skeleton for the initial assistant welcome message. With JS turned off, the welcome bubble still renders (it's part of the initial reducer state). With JS on but slow, there's a flash of nothing before the bubble appears. Minor.
- **First 60 seconds.** A new visitor lands, reads the wordmark (serif registers "this is curated"), reads the welcome sentence ("a vibe, a need, a specific product"), reads the 4 prompt chips (one of which speaks to a real need they have), taps one. The InputBar fills with the chip text, submits, the typing dots appear, then the ToolStatus row ("Searching ___"), then text + product grid. The first thing they see *post-query* is a 2×2 grid of products inside a chat bubble — and that's where the magazine feel slightly slips into "chat with product cards." See §2 "What's off" — the bubble-around-products is the largest single visual issue in the app right now.

## Top 10 polish moves (ordered, impact-first)

1. **Break product groups out of the chat bubble.** `MessageBubble.tsx:94-104` + `MessageRenderer.tsx:79-103` — when the message contains a `products`/`comparison`/`outfit` block, render those blocks edge-to-edge (use the 960px outdent from DESIGN.md §5), not inside a `max-w-[80%] bg-white rounded-2xl shadow-soft`. This is the single biggest "magazine, not chatbot" lever.
2. **Drop the empty-state PreferencesCard on desktop.** `PreferencesCard.tsx:91-93` and `page.tsx:61` — render the sticky panel only when `count > 0 || hydrating`. Cuts ~64px of double-welcome cruft.
3. **Switch the "loved heart" color from rose-500 to ink-900.** `ProductCard.tsx:179,183` and `CollageView.tsx:197,201` — rose is reserved for danger. Use the anchor color for "this is mine now."
4. **Make CollageView actually masonry.** `CollageView.tsx:215` — drop the `aspect-[4/5]` constraint so heights vary and the columns stagger. Today it's a 4-up grid in masonry's clothing.
5. **OG image lifecycle parity with the page.** `app/api/og/route.tsx:60-66` — when the blob is missing, return a 404 from the OG route. Don't render a generic share card for a broken link.
6. **Fix the Sparkles icon color in OutfitBundle.** `OutfitBundle.tsx:95` — `text-accent-600` is the *hover* rung of the CTA; use `text-ink-400` or `text-accent-500` to stay on the canonical ladder.
7. **Move the ethics edit grid out of the inline chip row.** `PreferencesCard.tsx:230-323` — render the grid as a panel *below* the chip row when `editingKey === 'ethics'`, not basking in `flex-wrap`. The current behavior is a layout shock.
8. **Hide collage hover overlay on touch by default; reveal on tap-once.** `CollageView.tsx:228-238` — the "always visible on touch" branch defeats the magazine cleanness on iPad.
9. **Streaming caret in the assistant text.** `MessageRenderer.tsx:62-67` — add a 2px-wide pulsing caret at the tail of an in-flight `text` block. Communicates "I'm still writing."
10. **Stagger SuggestionChips after the welcome bubble settles.** `SuggestionChips.tsx:14-16` — bump `delay` to `0.4` so the chips arrive as the response, not in lock-step with the bubble.

## Verdict

**Mostly** "magazine, not chatbot" today — closer than it has any right to be after six cycles, but with one structural issue (#1 above) holding the empty-state vision back. The lookbook (`/s/[id]`), OutfitBundle, and CollageView resting state are all genuinely magazine-grade — they could be in a Daydream or Arc screenshot and not look out of place. The chat surface, where the product grid lives inside the bubble, is the place where the "chatbot frame" leaks back in: bubbles around grids of cards is the canonical ChatGPT-Shopping silhouette, and the app's strongest move (visual-first results) is currently inside the silhouette it's trying to escape. Fix #1 and the verdict tips to "yes." The serif discipline, the orange restraint, the motion budget, the focus rings, the empty/loading/error coverage, and the per-cell rationale in OutfitBundle are all unambiguous wins. This is a launch-ready surface; this review is the polish.
