'use client';

import { useCallback, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// useTheme — Cycle 9.2 (2026-05-15)
//
// 3-state theme system: `system` (follow OS), `light` (cool slate-blue),
// `dark` (deep charcoal). Persists to `localStorage` under `trove-theme`.
// The applied attribute on `<html>` is always one of `light` | `dark` —
// `system` resolves to one of those at read time and re-resolves on OS
// preference changes.
//
// Hydration-flash strategy: the inline script in `app/layout.tsx` writes
// `data-theme` synchronously before React boots, using the same key + the
// same `prefers-color-scheme` lookup as this hook. By the time the hook
// runs on the client, the document already carries the correct attribute,
// so the only thing left to do is wire the runtime listener for OS pref
// changes (when mode === 'system').
//
// No new deps — rolled in-house per the constraint that we don't add
// `next-themes` or `tailwindcss-themer` for a 3-state toggle. See
// DESIGN.md §2.14.
// ---------------------------------------------------------------------------

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'trove-theme';

function readStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    /* localStorage blocked (private mode / locked-down browser) — fall through */
  }
  return 'system';
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveMode(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return mode;
}

function applyResolved(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', resolved);
}

export interface UseThemeReturn {
  /** The user's selected mode — what the segmented control reflects. */
  mode: ThemeMode;
  /** The actually-applied theme — `light` | `dark` (system resolved). */
  resolved: ResolvedTheme;
  /** Set the mode + persist + apply. */
  setMode: (next: ThemeMode) => void;
}

export function useTheme(): UseThemeReturn {
  // We initialise from `system` to keep the SSR markup deterministic — the
  // inline script in `layout.tsx` has already applied the real attribute to
  // <html> before React hydrates, so the visible UI is correct; the React
  // state catches up in the first effect tick. Initialising from
  // `readStoredMode()` directly would diverge between server (always
  // `system`) and client (whatever the user picked previously), tripping
  // hydration mismatch warnings on the segmented control's `aria-checked`.
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [resolved, setResolved] = useState<ResolvedTheme>('light');

  // First-mount hydration: read storage, resolve, apply. Runs once.
  useEffect(() => {
    const stored = readStoredMode();
    const r = resolveMode(stored);
    setModeState(stored);
    setResolved(r);
    applyResolved(r);
  }, []);

  // OS preference change listener — only relevant when mode === 'system'.
  // When the user has explicitly picked light or dark, we ignore OS flips.
  useEffect(() => {
    if (mode !== 'system') return;
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const r: ResolvedTheme = mq.matches ? 'dark' : 'light';
      setResolved(r);
      applyResolved(r);
    };
    // `addEventListener` is the modern API; `addListener` is the Safari <14
    // fallback. Both exist concurrently on the MediaQueryList; we attach
    // the standard one and trust that the deployment target is evergreen
    // (Next.js 14 already requires modern Chromium/Firefox/Safari).
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    const r = resolveMode(next);
    setResolved(r);
    applyResolved(r);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* localStorage blocked — the in-memory state still works for the
         session, the choice just won't survive a reload. */
    }
  }, []);

  return { mode, resolved, setMode };
}

// Inline-script source — copied verbatim into a <script> in `layout.tsx`
// via `dangerouslySetInnerHTML`. Kept as an exported string so a future
// engineer changing the storage key / attribute name has ONE place to
// update. Must be IIFE-safe and standalone (no module references).
//
// What it does: reads `localStorage['trove-theme']`, resolves `system` →
// `prefers-color-scheme`, writes `data-theme` on `<html>` BEFORE React
// hydrates. The whole point is to avoid the white flash that happens
// when React paints the light-mode default and then swaps to dark.
export const THEME_BOOT_SCRIPT = `
(function () {
  try {
    var stored = null;
    try { stored = localStorage.getItem('${THEME_STORAGE_KEY}'); } catch (e) {}
    var mode = (stored === 'light' || stored === 'dark' || stored === 'system') ? stored : 'system';
    var resolved;
    if (mode === 'system') {
      resolved = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    } else {
      resolved = mode;
    }
    document.documentElement.setAttribute('data-theme', resolved);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;
