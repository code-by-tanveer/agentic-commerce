'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { User } from 'lucide-react';
import { cn } from '@/lib/cn';
import { usePreferences } from '@/hooks/usePreferences';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { PreferencesCard } from './PreferencesCard';

// ---------------------------------------------------------------------------
// ProfileMenu — Cycle 5.
//
// Replaces the always-on PreferencesCard chrome with a quiet avatar
// affordance. The card content still lives in `PreferencesCard.tsx`; this
// component owns the trigger button, popover container, and empty-state
// explainer.
//
// Behaviour:
//   - Default: a 36px circular ink-100 button with a ink-900 User glyph,
//     anchored in the header's action row. A small ink-900 dot badge sits at
//     top-right when ≥1 preference is saved, so the affordance signals "you
//     have a profile" without being noisy.
//   - Open: anchored popover (desktop) or bottom sheet (mobile, <640px) with
//     the chip-editing card as content. Empty state replaces the card with a
//     friendly one-liner + "Got it" dismiss.
//   - Dismiss: outside click, Escape, or clicking the avatar again. Focus is
//     trapped while open and returns to the avatar on close.
//
// No new deps. The dialog container is a plain `<div role="dialog">` with
// `aria-modal` + `useFocusTrap` (reused from Cycle 2's bottom-sheet pattern).
// We deliberately don't use the native `<dialog>` element because:
//   1. We need anchored positioning on desktop and bottom-sheet positioning
//      on mobile in the same component — `<dialog>::backdrop` doesn't bend.
//   2. `showModal()` blocks the whole page; this surface is intentionally
//      lightweight and shouldn't compete with the streaming conversation.
// ---------------------------------------------------------------------------

export function ProfileMenu() {
  const { prefs, isLoading } = usePreferences();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const dialogId = useId();

  const hasPrefs = useMemo(
    () => Object.values(prefs).some((r) => r != null),
    [prefs],
  );

  const close = useCallback(() => setOpen(false), []);

  // Focus trap + Escape + restore focus to the avatar on close. The hook also
  // handles cycling Tab/Shift-Tab within the popover.
  useFocusTrap(popoverRef, { enabled: open, onClose: close, initialFocus: 'first' });

  // Outside-click dismissal. We listen on mousedown so the popover closes
  // before any click handler fires inside the conversation canvas — matches
  // the AddPicker behaviour in PreferencesCard.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return; // the avatar toggles itself
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Cycle-7 §2.11 — `NoResultsBlock`'s "Edit your preferences" tertiary CTA
  // fires a `open-profile-menu` CustomEvent on window. Listening here keeps
  // the avatar trigger as the single owner of the popover's open/close state
  // — the empty-state card never reaches across the tree to setState. If the
  // popover is already open this is a no-op (setOpen(true) on `true` is a
  // bailout in React 18). Removed on unmount via the effect cleanup.
  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener('open-profile-menu', onOpen);
    return () => window.removeEventListener('open-profile-menu', onOpen);
  }, []);

  const popoverT = reduced
    ? { duration: 0.1 }
    : { duration: 0.18, ease: 'easeOut' as const };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label={
          hasPrefs ? 'Open your profile (preferences saved)' : 'Open your profile'
        }
        className={cn(
          'relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-ink-900 transition hover:bg-ink-200',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50',
        )}
      >
        <User className="h-4 w-4" aria-hidden />
        {hasPrefs ? (
          <span
            aria-hidden
            className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-ink-900 ring-2 ring-ink-50"
          />
        ) : null}
      </button>

      {/* QA sweep (2026-05-13): the dialog must be portaled to <body> rather
          than rendered as a child of <Header>. Header carries
          `backdrop-blur` (Tailwind backdrop-filter), which creates a
          containing block for `position:fixed` descendants (CSS § 2:
          backdrop-filter establishes a stacking context AND a containing
          block). The popover's `inset-x-2 bottom-2` was therefore relative
          to the header's box, not the viewport — at 360×800 the dialog
          rendered at y≈-103 (above the visible viewport) instead of the
          bottom edge. Portaling to <body> bypasses the header containing-
          block trap. Guarded with `mounted` so SSR doesn't reach for
          `document`. */}
      {open && typeof document !== 'undefined' ? (
        createPortal(<ProfilePopover
          dialogId={dialogId}
          popoverRef={popoverRef}
          close={close}
          reduced={reduced}
          popoverT={popoverT}
          hasPrefs={hasPrefs}
          isLoading={isLoading}
        />, document.body)
      ) : null}
    </>
  );
}

// Renders the scrim + sheet/popover. Extracted so it can be portaled into
// <body> without duplicating the JSX.
function ProfilePopover({
  dialogId,
  popoverRef,
  close,
  reduced,
  popoverT,
  hasPrefs,
  isLoading,
}: {
  dialogId: string;
  popoverRef: React.MutableRefObject<HTMLDivElement | null>;
  close: () => void;
  reduced: boolean | null;
  popoverT: { duration: number; ease?: 'easeOut' };
  hasPrefs: boolean;
  isLoading: boolean;
}) {
  return (
    <>
      {/* Mobile scrim — visible only at <640px so the bottom sheet reads
          as modal. Desktop popover floats over the page without a scrim. */}
      <motion.div
        key="scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={popoverT}
        onClick={close}
        className="fixed inset-0 z-30 bg-ink-900/40 sm:hidden"
        aria-hidden
      />
      <motion.div
        key="popover"
        ref={popoverRef}
        id={dialogId}
        role="dialog"
        aria-modal
        aria-labelledby="profile-menu-title"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }}
        transition={popoverT}
        className={cn(
          'fixed z-40 rounded-2xl bg-white p-4 shadow-soft',
          // Mobile bottom sheet
          'inset-x-2 bottom-2 rounded-2xl',
          // Desktop: anchored to top-right under the header
          'sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-16 sm:w-[22rem] sm:max-w-sm',
        )}
      >
        {/* Mobile grab handle — purely decorative; matches Shortlist
            sheet visual rhythm. */}
        <div
          aria-hidden
          className="mx-auto mb-2 h-1 w-12 rounded-full bg-ink-100 sm:hidden"
        />
        {hasPrefs || isLoading ? (
          <PreferencesCard />
        ) : (
          <EmptyExplainer onDismiss={close} />
        )}
      </motion.div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Empty state — friendly one-liner shown when no preferences exist yet.
// Surfaces the value of the panel ("here's what I'll remember") without
// exposing the edit form chrome before anything is worth editing.
// ---------------------------------------------------------------------------

function EmptyExplainer({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p
        id="profile-menu-title"
        className="text-[11px] uppercase tracking-wider text-ink-400"
      >
        About you
      </p>
      <p className="text-sm leading-snug text-ink-900">
        Tell me your size, budget, or where you’re shipping to and I’ll
        remember.
      </p>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDismiss}
          className={cn(
            'inline-flex h-9 items-center rounded-full bg-ink-900 px-4 text-xs font-medium text-white transition hover:bg-ink-600',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
          )}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
