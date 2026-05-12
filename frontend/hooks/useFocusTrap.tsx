'use client';

import { useEffect, type RefObject } from 'react';

// ---------------------------------------------------------------------------
// useFocusTrap — modal a11y per DESIGN.md §7.
//
// Extracted from `PreferencesCard.BottomSheet` (Cycle 2) so Cycle 3's
// Shortlist mobile sheet can reuse the exact same semantics:
//   - Move focus into the dialog on open (last focusable — usually a Done /
//     primary-action button on the bottom of the sheet — is a useful start on
//     mobile keyboards).
//   - Trap Tab / Shift-Tab inside the dialog.
//   - Escape calls `onClose`.
//   - Return focus to the element that was focused immediately before the
//     dialog opened on unmount.
//
// `containerRef` must point at the root element of the modal/sheet. `enabled`
// lets callers gate the trap (e.g. only when the sheet is `open`), avoiding
// the need to mount/unmount the dialog on every open.
//
// `initialFocus`:
//   - 'last' (default): focuses the last focusable element. Matches the
//     Cycle 2 behaviour (the "Done" button at the bottom of the preferences
//     sheet).
//   - 'first': focuses the first focusable element. Useful for sheets whose
//     primary action is at the top.
// ---------------------------------------------------------------------------

interface Options {
  enabled: boolean;
  onClose: () => void;
  initialFocus?: 'first' | 'last';
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  { enabled, onClose, initialFocus = 'last' }: Options,
): void {
  useEffect(() => {
    if (!enabled) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    function focusables(): HTMLElement[] {
      if (!containerRef.current) return [];
      return Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
    }

    const items = focusables();
    if (items.length > 0) {
      const target = initialFocus === 'first' ? items[0] : items[items.length - 1];
      target?.focus();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const fs = focusables();
      if (fs.length === 0) {
        e.preventDefault();
        return;
      }
      const first = fs[0];
      const last = fs[fs.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // Restore focus to the previously-focused element. Guard against the
      // element having been removed from the DOM by then.
      try {
        previouslyFocused?.focus?.();
      } catch {
        // ignore
      }
    };
  }, [enabled, onClose, containerRef, initialFocus]);
}
