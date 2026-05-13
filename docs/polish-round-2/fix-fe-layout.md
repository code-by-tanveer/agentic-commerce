# Round 2 — FE layout polish (T2.8 + T2.9 finish + SavedPulse parity)

Resume run. Round-2 prior work already on disk: `Shortlist.tsx` rail-vs-sheet
switch moved to `lg:` (T2.7), rail `LaneSkeleton` while hydrating (T2.9
partial).

## T2.8 — sticky-magic-number ResizeObserver
- New: `frontend/hooks/useInputBarHeight.ts`. Exposes a generic
  `RefObject<T>`; on mount, writes `offsetHeight + 8` to
  `--input-bar-height` on `<html>`, then keeps it in sync via a
  `ResizeObserver`. `typeof ResizeObserver === 'undefined'` guard so jsdom
  unit tests don't crash. Variable is left in place on unmount (avoids a
  single-frame twitch on HMR).
- `frontend/components/chat/InputBar.tsx`: imported the hook, attached the
  returned ref to the outermost `sticky bottom-0` wrapper. No layout
  change. Added a coordination comment for the persona-depth engineer not
  to swap the wrapper element.
- `frontend/app/page.tsx`: `bottom-[104px]` → `bottom-[var(--input-bar-height,100px)]`.
  100px fallback covers SSR / pre-hydrate / no-JS. Comment updated.

## T2.9 — finish
- `PreferencesCard.tsx`: new `ChipSkeletonRow` (two `bg-ink-100 rounded-full
  h-6 w-20` pulsing pills; `animate-pulse` dropped under `useReducedMotion`).
  Render path: `hydrating = isLoading && count === 0` → skeleton row inside
  the card; else if `count > 0` → real `ChipRow`; else → `EmptyPrompt`.
  Did NOT touch `ChipRow` rendering — left intact for the parallel
  persona-depth engineer working on the ethics multi-select.
- `Shortlist.tsx` mobile sheet: `MobileLanes` now pulls `isLoading` from
  `useShortlist` and `useReducedMotion`, and renders `LaneSkeleton` (the
  same component the rail uses) when `isLoading && items.length === 0` for
  the active lane. Empty-hint branch unchanged.

## Bonus — SavedPulse mobile parity
- `MobileSavedPulse` swapped from a plain `<motion.p>` ("Preference saved")
  to a `<motion.div>` rendering the same chip visual as `SavedPulse`:
  rounded pill, `bg-emerald-50 text-emerald-600 text-[11px]`, `Check` icon,
  identical `opacity + y:-4` motion (suppressed under reduced motion).
  Two components retained — trigger paths and anchoring (absolute under
  card vs inline beneath trigger) still diverge.

## Verification
- `npm --workspace frontend exec -- tsc --noEmit` — clean (exit 0).
- Dry-run: textarea growing past one row updates `--input-bar-height` via
  ResizeObserver → PreferencesCard sticky offset follows. SSR / no-JS keeps
  the 100px fallback. PreferencesCard with `isLoading && count===0`
  renders pulsing skeleton chips; once `isLoading` flips false with zero
  prefs, the EmptyPrompt fades in via the existing render path. Shortlist
  mobile sheet active lane shows `LaneSkeleton` during hydrate.

## Files touched
- `frontend/hooks/useInputBarHeight.ts` (new)
- `frontend/components/chat/InputBar.tsx`
- `frontend/app/page.tsx`
- `frontend/components/preferences/PreferencesCard.tsx`
- `frontend/components/chat/Shortlist.tsx`
