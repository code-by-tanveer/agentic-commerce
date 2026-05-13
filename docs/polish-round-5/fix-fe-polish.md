# Round-5 FE polish — delivery log

Scope: T4.C, T4.D, T4.E, T4.K, T4.M, T4.P, T4.Q, T4.R, T4.S, T4.T, T4.U, T4.Y.
Coordinated with FE-structural (skipped: MessageBubble, ComparisonTable,
ProductImage, SummaryProductList, Header, app/api/og/route.tsx). For
MessageRenderer.tsx — the only touched structural-owned file — left a
coordination comment at the top of the file and limited edits to the `error`
block (T4.M + T4.Q).

## What landed

- **T4.E (Lila — reduced motion).**
  - `TypingIndicator.tsx`: imports `useReducedMotion`. Under reduce, returns
    three static dim dots at `opacity: 0.6`, no animation.
  - `ToolStatus.tsx`: dropped the infinite opacity pulse under reduce; now a
    static lucide `Loader2` icon at `text-ink-400`, no rotation. The
    aria-live "Searching desk lamps" announcement carries the "alive" signal.
  - `SuggestionChips.tsx`: imports `useReducedMotion`; the 100ms initial
    delay drops to `0` under reduce.
- **T4.D (text-[11px] → text-xs).** Swept every `text-[11px] text-ink-400`
  occurrence in: ProductCard, OutfitBundle (4 sites), CollageView,
  MerchantBlock (2), Shortlist (5), InputBar (trust footer), PreferencesCard.
  Left untouched (out of scope — eyebrow `uppercase tracking-wider` pattern,
  badge variants, or non-`ink-400` colours): the small handful of `text-[11px]`
  sites in PreferencesCard headers, VariantPicker, SummaryHero,
  ReasoningChips dark tooltip. SummaryProductList belongs to structural eng.
- **T4.C (heart visibility + tap target).** ProductCard heart resting state
  → `opacity-60` on fine pointers; full opacity on hover/focus/saved.
  CollageView heart same resting-state change PLUS bumped from `h-9 w-9`
  (36px) to `h-11 w-11` (44px / Apple HIG).
- **T4.K (locale-aware currency).** `lib/format.ts::formatMoney` now accepts
  an optional `locale`; added `clientLocale()` helper. Wired into client
  components: `ProductCard`, `CollageView`, `OutfitBundle` (with cell
  prop-drilling), `Shortlist.LaneItem`. SSR path still uses `'en-US'` —
  follow-up to plumb the request's accept-language is a cycle-2 item per the
  brief.
- **T4.M (Retry ≥44px + scroll-into-view).** Extracted the error block in
  `MessageRenderer.tsx` into an `ErrorBlock` sub-component with a `useRef`
  and a `useEffect` that calls `scrollIntoView({ behavior: reduce ? 'auto' :
  'smooth', block: 'nearest' })` on mount. Retry button bumped to
  `h-11 px-4 text-sm` with rose focus-ring.
- **T4.P (aria-labelledby on dialogs).** PreferencesCard.BottomSheet:
  `aria-labelledby="prefs-sheet-title"` + Header gains optional `titleId`
  prop. Shortlist.MobileSheet: `aria-labelledby="shortlist-sheet-title"` +
  MobileHeader title `<p>` gets the id.
- **T4.Q (mt-0.5 → mt-1).** Fixed in the relocated `AlertCircle` icon in
  `MessageRenderer.tsx`'s new `ErrorBlock`.
- **T4.R (Sparkles decorative colour).** `OutfitBundle.tsx` Sparkles
  `text-accent-600` → `text-ink-400`. The `accent-50` frame already signals
  the coordinated-set reading.
- **T4.S (rose-500 heart → ink-900).** Both ProductCard and CollageView heart
  active state uses `text-ink-900` + `fill-ink-900`. Rose is danger-only.
- **T4.T (CollageView masonry).** Re-read the file: line 54 is
  `columns-2 gap-3 sm:columns-3 lg:columns-4` — CSS columns, actually correct
  masonry. Mis-flagged finding; no change needed.
- **T4.U (empty-lane copy).** `Shortlist.tsx::LANE_META` for `maybe`/`skip`
  now reads "Tap the heart to save, or press M/S when a card is focused."
  The lucide `Heart` icon is already referenced via the lane meta upstream.
- **T4.Y (auto-scroll reduce-motion).** `ConversationCanvas.tsx` imports
  `useReducedMotion`; `scrollIntoView` now uses `behavior: reduce ? 'auto' :
  'smooth'`.

## Skipped per brief

- **T4.F.** Header wordmark — FE-structural's scope.
- SummaryProductList `text-[11px]` sweep — structural's file; they'll handle
  in the same pass.

## Verification

- `tsc --noEmit` clean (exit 0).
- Reduced-motion mental dry-run: TypingIndicator three static dots, ToolStatus
  static Loader2, SuggestionChips zero-delay one-shot fade, ConversationCanvas
  auto-scroll, MessageRenderer ErrorBlock auto-scroll, framer-motion
  components elsewhere unchanged (already gated).
- No new deps.
