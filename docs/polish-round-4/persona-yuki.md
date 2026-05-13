# Persona: Yuki — Tokyo designer, DESIGN.md strict audit

Walked the build with the spec open. Notes are in the order I noticed them, not the order of severity. Severity at the end.

## Type system audit

- **Inter usage:** correct. `tailwind.config.ts` sets `font-sans: Inter`, body inherits, weights kept to 400/500/600/700 by visual sweep. No tracking tricks. Quiet, as asked.
- **`font-display` occurrences — 5 source sites, 5 render sites:**
  1. `frontend/components/product/ProductCard.tsx:307` — expanded "Total" price. (§2.4 #1)
  2. `frontend/components/summary/SummaryHero.tsx:40` — `text-3xl italic` gist line. (§2.4 #2)
  3. `frontend/components/summary/SummaryProductList.tsx:104` — section headers ("What you loved" etc.). (§2.4 #3)
  4. `frontend/components/product/CollageView.tsx:236` — hover caption price overlay. (§2.4 #4)
  5. `frontend/components/chat/Header.tsx:44` — wordmark "Agentic Commerce", `text-xl`.
- **Verdict on the four-serif rule:** **Violated.** §2.4 enumerates exactly four homes and says *"Nowhere else."* The chat-shell wordmark in `Header.tsx` is a fifth. The comment on line 15 even tries to launder it as "§2.4 #2" — but #2 is the summary hero, not the persistent app chrome. A serif masthead that sits above every conversation turn is exactly the overuse §2.4 warns about ("Overuse kills it"). The serif should re-encounter the reader at moments of authorial voice; pinning it to the top of every screen flattens the gift. Pick one: either drop it to Inter at `font-semibold` (my preference) or codify a fifth slot in DESIGN.md and own it. Currently the doc and the code disagree.

## Spacing palette violations

Grepped every decimal-step and forbidden-integer class against the §2.5 palette `{1,2,3,4,6,8}` + the icon carve-out.

- `frontend/components/chat/MessageRenderer.tsx:141` — `mt-0.5` on the error-alert `AlertCircle`. The element is a 16px icon, but `mt-0.5` is a *layout* offset for vertical alignment, not an icon dimension. Reads at the boundary of the carve-out; I'd replace with `mt-1` or, cleaner, drop the offset entirely and let `items-start` + line-height do the work. The neighbour comment at `ProductCard.tsx:201` already corrected the same pattern; this one was missed.
- Everything else: clean. The T1.30/T1.31 polish pass swept `gap-1.5`, `py-1.5`, `px-3.5`, `space-y-2.5`, `px-5`, `px-7` out. Comments document each fix in-line. Decimals that remain (`h-3.5`, `w-3.5`, `h-1.5`, `w-1.5`) are all on lucide icon dimensions — carve-out honoured.
- Praise: the discipline shows. This is the section that's easiest to backslide on; the corpus held.

## Shadow XOR border violations

Walked every file using `shadow-soft|lift|glow` against every `border-*` on the same element.

- **No true violations.** The §2.7 hard rule is honoured on every shadowed surface (cards, message bubbles, input pill, share button, shortlist sheet/rail, preferences card, outfit frame, moodboard, summary list rows, comparison shell).
- Borders that *exist* are doing different jobs and don't conflict:
  - `Header.tsx:38`, `InputBar.tsx:104`, `SummaryShareBar.tsx:67` — `border-t/-b border-ink-100` on chrome bars with `bg-ink-50/80 backdrop-blur`, no shadow. Legit dividers between stacked planes.
  - `ProductCard.tsx:262, 302`, `MerchantBlock.tsx:82`, `ComparisonTable.tsx:81, 105`, `Shortlist.tsx:139` — `border-t border-ink-100` are hairline *internal* dividers inside a shadowed parent. Spec §2.3 names `divider` as `border-ink-100` — these read as the spec'd dividers, not as the "border around the card" the §2.7 rule prohibits.
  - `SuggestionChips.tsx:24`, `VariantPicker.tsx:45-48, 83-86` — `border` with no shadow. Clean.
- This is the cleanest section. Cycle 1's fix held.

## Orange-is-commitment violations

Every `accent-*` site, against §2.2 + Principle 6 ("the color of commitment").

- `ProductCard.tsx:341` — Buy CTA fill `bg-accent-500 hover:bg-accent-600`. **Correct.**
- `OutfitBundle.tsx:90` — frame tint `bg-accent-50`. **Correct** (§2.2 explicitly lists "Outfit-bundle frame tint").
- `OutfitBundle.tsx:95` — `text-accent-600` on the `Sparkles` lockup icon. **Soft violation.** That icon is brand-decorative, not a commerce affordance. Principle 6 says orange means "the user is about to spend money." The sparkle says "this is a curated bundle." Should be `text-ink-400` or `text-ink-600`.
- `OutfitBundle.tsx:147` — Save-outfit CTA `bg-accent-500`. **Correct** (§2.2 names this).
- `CollageView.tsx:314` — Buy CTA in expanded collage card. **Correct.**
- `Shortlist.tsx:202, 426` — drag-over lane flash `bg-accent-50`. **Soft tension.** §2.8 lists the 100ms `accent-50` flash and §7 confirms it, but Principle 6 reads stricter ("Never on selection, never on chrome"). A drag-over highlight is closer to selection than to commitment. The doc internally argues with itself here; the implementation follows §2.8/§7 verbatim, which is the correct read. Flagging for the spec, not for the code.
- `ImageDropzone.tsx:136` — drag-over dashed border `border-accent-200`. **Soft violation.** §4 names this state, but §2.2's row for `accent-200` is "Focus ring on the Buy CTA. Selected-state Variant pill border." The drop-zone is neither. Same doc-vs-doc tension.
- `ReasoningChips.tsx:57` — `bg-accent-50 text-accent-600` for `discount` chip. **Correct per Cycle 2 directive** (price/discount → accent-50), even though chips are "not commerce affordances." Spec carves this in. Living with it.
- `SummaryProductList.tsx:120` — saved-outfit row `bg-accent-50`. **Correct** (consistent with bundle frame).

**Pattern:** the `accent-200` token is doing too many jobs in the doc (Buy focus ring, variant-selected border, dropzone border). The code uses it once (dropzone). Variant selected-state went `ink-900` in `VariantPicker.tsx:47, 85`, which actually agrees with Principle 6 over §2.2's table. Recommend the doc reconcile: drop `accent-200` from the variant-pill row.

## Motion budget

- All one-shot transitions ≤ 400ms. Spec'd ceilings respected. Sampled: `MessageBubble` 250ms entry, `ProductCard` 300ms entry / 250ms expand / 200ms collapse, `CollageView` 400ms layout, `Shortlist` 300ms sheet, `ImageDropzone` 150ms.
- The two 600ms occurrences (`TypingIndicator.tsx:15`, `ToolStatus.tsx:144`, `:153`) are infinite-loop pulse/spin animations, not one-shot transitions. §6 explicitly allows the `TypingIndicator` dots at 600ms loop. Within spec.
- **Reduced motion: well-honoured.** Every motion-bearing component imports `useReducedMotion` and collapses to a 100ms opacity crossfade or disables layout animation outright (`CollageView.tsx:152`). Sampled `ProductCard`, `CollageView`, `OutfitBundle`, `Shortlist`, `PreferencesCard`, `ImageDropzone`, `MessageBubble`, `ReasoningChips`, `ToolStatus`, `Moodboard` — all branch on `reduced`. This is the strongest section of the build.
- No `spring` with bounce. No idle ambient motion. Clean.

## Tap targets / focus rings

- Focus rings: consistent `ring-2 ring-ink-900 ring-offset-2 ring-offset-{surface}` across components. The Buy CTA uses `focus-visible:shadow-glow` (orange shadow ring) rather than the spec'd `ring-accent-200`. The intent is met — orange focus on the orange CTA — and the `shadow-glow` token reads more refined than a 2px ring. Spec should adopt this; code is right.
- 44px tap targets: `PreferencesCard` triggers and `Shortlist` CTAs use `h-11`. Heart icon is `h-9 w-9` (36px) — a touch under spec for mobile, but it sits on the larger card hit area so a missed tap toggles the card, not nothing. Acceptable, but the heart alone would fail a strict §7 read. `Shortlist.tsx:268` and `SummaryShareBar.tsx:77, 88` use `before:absolute before:inset-[-10px]` to extend invisible hit area — clever, correct.

## Hierarchy

Page reading order is composed, not assembled.

- Collapsed `ProductCard`: 96px image (left anchor) → title `text-sm font-semibold` → reasoning chips → price `text-base font-semibold` → Buy chip. Price and Buy are the visual sinks; the eye lands where money lives. Reads right.
- Expanded card: image strip → description (`text-ink-600` body) → variants → MerchantBlock → "TOTAL" eyebrow + serif price + orange Buy. The serif on price arrives like a held breath. Works.
- Chips are quiet (`text-xs`, `text-ink-600`, no orange except `discount`). They don't compete with the title. Good.

## Typographic rhythm

ProductCard collapsed → expanded → SummaryHero hero, as a sequence:

1. **Collapsed:** Inter semibold title, Inter meta in `ink-400`, Inter price `text-base`. Dense, unornamented, magazine-listicle quiet. The serif is absent — correctly. This is data.
2. **Expanded:** Inter description in `text-ink-600`, then the "TOTAL" eyebrow in `text-[11px] uppercase tracking-wider`, then the serif Total `text-lg`. The eyebrow → serif jump is the moment the card stops being a listing and becomes a tab-being-opened. Composed.
3. **SummaryHero:** all-caps Inter kicker → `text-3xl font-display italic` gist line → `text-sm text-ink-400` meta. The italic does its one job, which is to sound like a friend describing the session out loud. Earned.

But the chat **Header wordmark** in `font-display text-xl` sits *in front of* this whole sequence. It pre-spends the serif before the user reaches step 1. By the time they get to the SummaryHero, the italic gist has to compete with a wordmark they've seen for forty minutes. The hero loses some of its hush. This is the single biggest design tell: the rhythm is *assembled* at the global level because the masthead is doing a thing the spec asks it not to.

Fix the masthead and the rhythm composes itself.

## Top 5 polish moves

1. **Drop `font-display` from `Header.tsx:44`.** Either Inter `font-semibold text-sm tracking-tight`, or — better — lowercase wordmark `text-xs uppercase tracking-[0.2em] text-ink-400`. Reclaim the serif's scarcity. This is the single change that lifts everything else.
2. **`MessageRenderer.tsx:141` — remove `mt-0.5`.** Use `items-start` + the icon's intrinsic baseline. One decimal-spacing class away from a clean §2.5 sweep.
3. **`OutfitBundle.tsx:95` — `text-accent-600` Sparkles → `text-ink-400`.** Orange is for the Save button below, not for the lockup icon. The header "Outfit" wordmark doesn't need to flag itself with the commitment colour.
4. **Reconcile `accent-200` in DESIGN.md §2.2.** Drop the "selected-state Variant pill border" row; the code already moved to `ink-900` and it reads more honest. Keep `accent-200` for the Buy focus ring and the dropzone border, both of which the code uses.
5. **Heart save-button: bump to `h-11 w-11`** at touch breakpoints (or wrap with `before:inset-[-6px]` like Shortlist's pattern). The card-as-hit-area saves it today; an isolated heart in a denser layout would not.

The build is more disciplined than most things I audit. The serif lapse is the only loud miss.
