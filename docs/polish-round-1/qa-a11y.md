# QA Accessibility — Round 1

Audit against WCAG 2.2 AA + DESIGN.md §7. Read-only review; no browser tests.
Paths absolute; line numbers reflect on-disk state.

## HIGH (WCAG AA failures)

- **/frontend/components/product/ProductCard.tsx:115–178** — the entire card
  front is a single `<button>` wrapping title/image/chevron *and* a nested
  `<span role="button">` "Buy now" pill (153–175). Interactive controls
  nested inside `<button>` is invalid HTML and breaks AT; the inner pill
  also has no `:focus-visible` ring. WCAG 4.1.2 + 2.4.7. Fix: hoist Buy
  out of the expand button, make it a real `<button>`/`<a>`, give it
  `focus-visible:ring-2 ring-accent-200` per §7.

- **/frontend/components/product/ProductCard.tsx:82** + **CollageView.tsx:118** —
  L/M/S handler matches capital letters only (`e.key === 'L'`). Capital
  requires Shift; the §7 contract is a bare keypress. Plain `l` does
  nothing. WCAG 2.1.1. Fix: `e.key.toLowerCase() === 'l'`. CollageCard
  also lacks the `target === currentTarget` guard ProductCard has — risk
  of key hijack inside any future nested input.

- **/frontend/components/chat/InputBar.tsx:112–121** — the `<textarea>` has
  no label and no `aria-label` (placeholder only). Placeholders aren't
  labels. WCAG 1.3.1, 3.3.2, 4.1.2. Fix: add `aria-label="Message"` or a
  visually-hidden `<label htmlFor>`.

- **/frontend/components/chat/Shortlist.tsx:311–369** — mobile sheet
  declares `role="tablist"` with `role="tab"` buttons but no `aria-controls`
  or matching `role="tabpanel"` / `aria-labelledby` on the drop region.
  Broken ARIA tabs pattern. WCAG 1.3.1, 4.1.2. Fix: id the panel, link via
  `aria-controls`, set `role="tabpanel" aria-labelledby` on the drop zone.

- **/frontend/components/chat/Header.tsx:30–40** + **app/page.tsx** — `/`
  has no `<h1>`. Header uses `<p>` for the brand mark; SummaryHero `<h1>`
  exists only on `/s/[id]`. WCAG 1.3.1, 2.4.6. Fix: wrap "Agentic Commerce"
  in `<h1>` (visually styled as today, or `sr-only`).

- **/frontend/components/chat/ConversationCanvas.tsx:28–32** — the whole
  message list is `aria-live="polite" aria-atomic="false"`. Each child is
  a complex assistant bubble with text/products/comparison/tool-status.
  Screen readers will re-announce the entire bubble on every streaming
  token. WCAG 4.1.3. Fix: scope the live region to the streaming bubble's
  text run only, or use `aria-busy` while streaming and announce on done.

- **/frontend/components/product/ReasoningChips.tsx:166–197** — chips
  without `detail` render as `<button aria-disabled tabIndex=-1>` with
  no click handler. SR users hear "button, dimmed" with no purpose. WCAG
  4.1.2. Fix: render non-interactive chips as `<span>`; only chips with
  `detail` should be buttons.

- **/frontend/components/product/ProductImage.tsx:14–27** — failed-image
  fallback `<div>` drops the `alt` on the floor (no `aria-label`,
  no `role="img"`). SR hears nothing. WCAG 1.1.1. Fix:
  `<div role="img" aria-label={alt || 'Image unavailable'}>`.

## MEDIUM (DESIGN.md §7 violations)

- **/frontend/components/chat/InputBar.tsx:94–111** — the attach-image
  button's `focus-visible:ring-2` lives inside the non-disabled branch
  only. Keyboard users tabbing to a disabled-but-not-`disabled`-attr
  button get no ring. §7 "Never suppress focus rings globally." Move
  the focus-visible classes out of the conditional.

- **/frontend/components/chat/InputBar.tsx:122–134** — submit button has
  no `focus-visible:ring` at all. §7. Add the canonical
  `focus-visible:ring-2 ring-ink-900 ring-offset-2 ring-offset-ink-50`.

- **/frontend/components/chat/SuggestionChips.tsx:13–28** — `motion.div`
  ignores `useReducedMotion`. Chip buttons also have no `focus-visible`
  ring. §6 + §7. Wire `useReducedMotion`; add focus rings.

- **/frontend/components/chat/TypingIndicator.tsx:6–17** — infinite y-bounce
  ignores `useReducedMotion`. §6 + §7 require collapse to opacity-only
  or no-motion under `prefers-reduced-motion: reduce`.

- **/frontend/components/product/VariantPicker.tsx:39–53, 77–90** — variant
  pill buttons have no `focus-visible:ring` and no arrow-key roving
  tabindex. §7 explicitly: "variant pills are a roving tabindex group
  (arrow keys)". Today: plain `<button>`s, Tab-only.

- **/frontend/components/product/CollageView.tsx:266–283** + **OutfitBundle.tsx:121** —
  Buy CTAs use `focus-visible:shadow-glow` only, no ring. §7 spec is
  `ring-accent-200`. The orange glow shadow on white may not hit 3:1
  indicator contrast against page bg `ink-50`. Fix: add the named ring.

- **/frontend/components/chat/Shortlist.tsx:111–117, 289–296** +
  **PreferencesCard.tsx:485–496** — sheet's close X is `p-2` (~32px),
  no pseudo-element pad. Mobile sheets need ≥44×44 per §7 / WCAG 2.5.5.
  The Done button (`h-11`) is fine; just the X is short.

- **/frontend/components/chat/Header.tsx:45–65** + **ViewToggle.tsx:50–60** —
  Shortlist trigger is `py-1.5` (~28px tall); ViewToggle segments are
  `h-7 w-7` (28px). Below 44px tap target on mobile. §7.

- **/frontend/components/product/OutfitBundle.tsx:116–138** —
  `aria-live="polite"` on the Save-outfit button itself; live semantics on
  an interactive element causes label re-reads on every state flip. Move
  to a sibling `<span role="status" aria-live="polite">`.

- **/frontend/components/chat/MessageBubble.tsx:50** + **Moodboard.tsx:133–137** —
  `alt="Attached reference image"` / `alt={description || 'Uploaded reference image'}`
  carry no actual content reference. WCAG 1.1.1: at minimum prepend
  "Reference image:" so AT users connect it to the attribute chips
  rendered alongside.

- **/frontend/components/chat/Shortlist.tsx:130, 354** — drop-zone hover
  state conveyed by `bg-accent-50` color shift only; no ARIA signal. The
  L/M/S fallback covers AT users so it's not blocking, but consider an
  `aria-dropeffect` or status announcement for parity.

- **/frontend/components/chat/Shortlist.tsx:235, 466** +
  **PreferencesCard.tsx:466** — `aria-modal` (boolean) serializes as
  `aria-modal=""`; most AT treats as true but spec wants
  `aria-modal="true"`. Low risk; explicit string preferred.

## LOW / nits

- **§7 size-rule violations (ink-400 below 12px):** `text-[11px] text-ink-400`
  appears at Header.tsx:38; ProductCard.tsx:130; OutfitBundle.tsx:90;
  MerchantBlock.tsx:109; Shortlist.tsx:104, 200; PreferencesCard.tsx:135,
  138; InputBar.tsx:137; CollageView.tsx:234; ReasoningChips.tsx:200;
  Moodboard.tsx:214; SummaryHero.tsx:37, 43; SummaryProductList.tsx:80, 105,
  148. §7 caps `ink-400` body at ≥12px. Bump to `text-xs` or use ink-600.
  WCAG 1.4.3 still passes (4.16:1) but the DESIGN.md rule fails.

- **/frontend/components/product/ProductCard.tsx:170** — disabled Buy uses
  `text-ink-400` on `bg-ink-100` (~2.7:1). WCAG 1.4.3 disabled-state
  exception covers it; §7 spec aims for 4.5:1.

- **/frontend/components/chat/ConversationCanvas.tsx:20–22** — `scrollIntoView`
  uses `behavior: 'smooth'` unconditionally; switch to `'auto'` under
  `useReducedMotion` to honor §6.

- **/frontend/components/chat/MessageBubble.tsx:50–55** — `<img>` with no
  width/height → layout shift while loading. Not a WCAG issue but worth
  fixing for stability.

- **/frontend/components/product/OutfitBundle.tsx:170–197** — image button +
  external-link button both invoke `open()`; two tabstops for one action.
  Collapse to one tabstop for keyboard parity.

- **/frontend/components/preferences/PreferencesCard.tsx:357–438** — the
  visible label `<span>{PREFERENCE_LABEL[k]}</span>` is not associated
  with the input via `aria-labelledby`; the input's `aria-label` overrides
  it (acceptable, but `aria-labelledby` would expose the visible label
  text verbatim to AT). Low impact.

- **/frontend/components/product/ReasoningChips.tsx:130–131** — in-place
  expansion panel is `text-[11px]` white-on-`ink-900` — extreme contrast,
  fine.

- **/frontend/components/product/Moodboard.tsx:185–195** — Enter and onBlur
  both call `commitDraft`; risk of double-fire when committing then
  clicking elsewhere. Not a WCAG issue, just focus-management hygiene.

- **/frontend/components/chat/Header.tsx:67–74** — "New chat" button has no
  `type="button"`. No surrounding `<form>` so harmless, but explicit type
  is the safer default.

- **/frontend/components/chat/ImageDropzone.tsx:131** — overlay is
  `aria-hidden`; OS-drag isn't a keyboard flow. InputBar paperclip
  (InputBar.tsx:94) supplies the keyboard-accessible alternative. OK.

- **/frontend/app/s/[id]/page.tsx:77–86** + **SummaryHero.tsx:40** +
  **SummaryProductList.tsx:104** — heading hierarchy `<h1>` → `<h2>` →
  `<h3>` (per-card) is correct.

- **`useReducedMotion` audit summary:** wired in MessageBubble:19,
  ProductCard:31, CollageView:87, OutfitBundle:38, Shortlist:50,
  PreferencesCard:56, ToolStatus:62, ReasoningChips:143, ImageDropzone:40,
  Moodboard:52. **Missing:** SuggestionChips, TypingIndicator (covered in
  MEDIUM). Exempt (no motion): ViewToggle, SummaryShareBar, SummaryHero.

- **Modal focus traps:** Shortlist mobile sheet (Shortlist.tsx:225) and
  PreferencesCard BottomSheet (PreferencesCard.tsx:460) both call
  `useFocusTrap(..., { enabled: true, onClose, initialFocus: 'last' })`.
  Hook (useFocusTrap.tsx:39–93) handles Tab/Shift-Tab cycle, Escape, and
  focus restoration on cleanup. Confirmed working as spec'd.

- **Link vs button styling:** `<a>` tags appear at SummaryShareBar.tsx:69
  (text + icon, no underline) and SummaryProductList.tsx:67, 129 (card
  surfaces). All carry `focus-visible:ring-2`. DESIGN.md doesn't mandate
  underlines on these chips/cards; affordance is via shape + hover. OK.
