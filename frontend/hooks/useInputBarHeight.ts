'use client';

import { useEffect, useRef, type RefObject } from 'react';

// ---------------------------------------------------------------------------
// useInputBarHeight — R2/T2.8 sticky-magic-number fix.
//
// The PreferencesCard sits sticky above the InputBar via `bottom-[Npx]`. The
// number was hard-coded to ~104px (one-row InputBar height + 8px breathing)
// in Cycle 2. Once the textarea auto-grows up to its 160px cap, the
// PreferencesCard overlaps the InputBar.
//
// This hook attaches a `ResizeObserver` to the outermost sticky wrapper of
// the InputBar, then writes the observed `offsetHeight + 8` to the CSS
// variable `--input-bar-height` on `document.documentElement`. Consumers
// (`app/page.tsx`) read it as `bottom-[var(--input-bar-height,100px)]` so:
//
//   - Pre-hydrate / SSR (no JS yet): the `100px` fallback keeps the sticky
//     offset roughly aligned with the one-row InputBar.
//   - Post-hydrate: the variable tracks the real measured height (including
//     iOS safe-area-inset-bottom padding because we observe the outermost
//     wrapper, which already carries the inset padding).
//   - Textarea grows / shrinks: ResizeObserver fires synchronously after
//     layout, so the offset stays glued to the InputBar with no jitter.
//
// Returns a `RefObject<T>` for the consumer to attach to its sticky wrapper.
// The generic `T` defaults to `HTMLDivElement` since the InputBar wrapper is
// a div, but stays generic for future reuse.
// ---------------------------------------------------------------------------

const CSS_VAR = '--input-bar-height';
const BREATHING_PX = 8;

export function useInputBarHeight<T extends HTMLElement = HTMLDivElement>(): RefObject<T> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Set the variable once on mount so the initial paint (which may not
    // fire a ResizeObserver entry until the first layout pass on some
    // browsers) is correct from frame 1.
    const root = document.documentElement;
    const setVar = (px: number) => {
      root.style.setProperty(CSS_VAR, `${px}px`);
    };
    setVar(el.offsetHeight + BREATHING_PX);

    // `ResizeObserver` not present in jsdom test envs — guard so unit tests
    // don't crash if they happen to render the InputBar.
    if (typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        setVar(target.offsetHeight + BREATHING_PX);
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      // Leave the variable in place on unmount — the InputBar only unmounts
      // when the whole tree does, and clearing it here would cause a
      // single-frame layout twitch on hot-reload.
    };
  }, []);

  return ref;
}
