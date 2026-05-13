# Polish Round 1 — FE delivery log

Tier-1 FE launch-blockers. BE owns T1.20–T1.26, T1.35 in parallel.

## Mobile / interaction

- **T1.1** Heart "Save" affordance on every `ProductCard` and `CollageView`
  card. Visible at rest on touch (`[@media(hover:none)]`), fade-in on hover
  for fine pointers. Tap calls `addToLane(id, 'love', product)`. Fills
  rose-500 when already in Love. Empty-state copy updated to "Tap the heart
  on any product to save it here." (lucide Heart, no emoji).
- **T1.2** `Header` cluster shrinks under 380px — Shortlist label collapses
  to icon + badge; "New chat" collapses to icon. `aria-label` carries
  semantics.
- **T1.3** `paddingBottom: max(env(safe-area-inset-bottom), …)` on
  `InputBar`, mobile `Shortlist` sheet, `SummaryShareBar`.
- **T1.4** `InputBar` Enter handler now also checks
  `e.nativeEvent.isComposing` — CJK IME candidates no longer auto-submit.
- **T1.5** `aria-live` removed from `ConversationCanvas`. `ToolStatus`
  is the only polite-status region: `role="status" aria-live="polite"
  aria-atomic="false"`.

## Brand / positioning

- **T1.6** Collapsed `ProductCard` Buy chip now says "Buy on {merchant}";
  expanded already did. `CollageView` uses "Open at {merchant}" — image-first
  variant, less transactional read.
- **T1.7** `ToolStatus` verb map covers all 7 tools. Fallback verb
  "Working" (never leaks function names). Arg description surfaces pref key
  / vision description / outfit anchor where available.
- **T1.8** "Pair with…" button in expanded `ProductCard`. Routes via
  `useConversationActions().send(...)` with title + id; the agent prompt
  already routes that phrasing through `recommend_outfit`.
- **T1.9** Header `Sparkles` round emblem replaced with a font-display
  ("Instrument Serif") wordmark — magazine-masthead. Picked wordmark-only
  (no icon) per DESIGN.md §2.4 #2; any icon reintroduces a mascot read.
- **T1.10** Welcome rewritten: drops first-person, surfaces the no-paid-
  placement trust line.
- **T1.11** `STARTERS` rewritten with the PRODUCT.md voice (Ikea cliché,
  someone who already owns everything, ships-from EU, ceramic under $80).
- **T1.13** `MessageRenderer` renders a recovery card on
  `block.products.length === 0` — `bg-ink-50` row with `SearchX` icon and
  "Try fewer constraints, or paste an image" prompt.

## Accessibility

- **T1.14** `ProductCard` restructured. Card itself is
  `<motion.article role="button" tabIndex={0}>` with `onKeyDown` for
  L/M/S + Enter/Space. Collapsed row is a `<div>` (not button); Buy is a
  real sibling `<button>`. Nested-button HTML violation gone.
- **T1.15** Both `ProductCard` and `CollageView` lowercase the key before
  match (`e.key.length === 1 ? toLowerCase() : e.key`). Caps-lock /
  shift no longer required.
- **T1.16** `InputBar` textarea gets a sr-only `<label>` + `aria-label`;
  form is `aria-labelledby` the label id.
- **T1.17** `<h1 className="sr-only">Agentic Commerce</h1>` in
  `app/page.tsx`. Visual wordmark stays a `<p>` so no h1 conflict.
- **T1.18** `ReasoningChips`: chips without `detail` render as
  `motion.span role="listitem"`. Chips with `detail` keep the
  `<button>` + tooltip. No more disabled-button shape.
- **T1.19** `ProductImage` fallback now `role="img"` with
  `aria-label={alt}` plus a sr-only span carrying the alt; the `ImageOff`
  icon is `aria-hidden`.

## Performance

- **T1.27** Split `useConversation` into
  `ConversationStateContext` (messages — churns per text_delta) and
  `ConversationActionsContext` (send/retry/refineMoodboard/reset — stable).
  Hooks `useConversationState` / `useConversationActions` exposed; legacy
  `useConversation()` kept as a merged shim. Pure-action consumers
  migrated: `MessageBubble`, `MessageRenderer`, `ImageDropzone`. `Header`
  uses both halves. Did NOT split `useShortlist` — value churn is not on
  the streaming path and the split would have exceeded ~30 lines without
  changing re-render volume.

## Design tokens

- **T1.28** Expanded `ProductCard` "Total" uses `font-display` (§2.4 #1).
- **T1.29** Expanded Buy CTA carries `focus-visible:shadow-glow`. Pair-with
  + collapsed Buy chip get parity treatment.
- **T1.30** Decimal spacing replaced across `TypingIndicator.tsx` (gap),
  `Header.tsx` (gap / py), `InputBar.tsx` (py), `SuggestionChips.tsx`
  (px / py), `VariantPicker.tsx` (×3: gap, space-y), `ProductCard.tsx` (×2:
  mt-0.5, py-1.5).
- **T1.31** `OutfitBundle` Save button `px-5` → `px-4`.
- **T1.32** Motion under budget: `TypingIndicator` 0.9 → 0.6;
  `ToolStatus` spinners (both branches) → 0.6.

## UX polish

- **T1.33** Inline optimistic-revert affordance, scoped per-control:
  - `usePreferences.lastRevert = {key, message, at}`; auto-clears 3s;
    `PreferencesCard` ChipRow renders `text-rose-700 text-xs` line under
    the row.
  - `useShortlist.lastRevert = {scope, message, at}`; auto-clears 3s;
    `Shortlist` renders the line under both rail and mobile-sheet headers.
  - `ShareButton` renders a rose-700 line under the button while
    `status === 'error'` (uses the existing 2.5s reset).
- **T1.34** `useSession` reads `useSearchParams().get('session')` on first
  mount and prefers it over the local id. `app/page.tsx` wraps
  `SessionProvider` in `<Suspense fallback={null}>` so Next 14's hook
  contract is met. Behaviour: `/?session=abc` lands the chat on `abc`;
  re-visits without the param keep using the locally stored id.

## Verification

- `cd frontend && npx tsc --noEmit` → clean (exit 0).
- `cd backend && npx tsc --noEmit` → clean (exit 0).
- No new deps. Only existing `lucide-react@^0.400` icons added (`Heart`,
  `Wand2`, `SearchX`).

## Call-outs

- T1.9: wordmark-only. Any sibling icon next to "Agentic Commerce"
  reintroduces a mascot read; the serif wordmark already does brand work.
- T1.14: picked option (a) — card-as-button + sibling Buy. Option (b) would
  have hidden Buy behind an expand on every collapsed card, costing two
  taps to commit.
- T1.27: `useShortlist` left intact. Read-heavy consumers, no per-token
  churn, ≤30-line budget didn't justify a refactor for negligible win.
- T1.34: URL param is read once at provider mount. Suspense fallback is
  `null` so there's no flash-of-wrong-session during hydration.
