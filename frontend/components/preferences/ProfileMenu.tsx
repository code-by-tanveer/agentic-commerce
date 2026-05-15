'use client';

import { useEffect, useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { User } from 'lucide-react';
import { cn } from '@/lib/cn';
import { usePreferences } from '@/hooks/usePreferences';
import { DefaultFiltersSection, PreferencesCard } from './PreferencesCard';

// ---------------------------------------------------------------------------
// ProfileMenu — Cycle 5 (2026-05-15 Radix migration).
//
// Cycle 5 originally hand-rolled this surface from `createPortal` +
// `useFocusTrap` + a manual `mousedown` outside-click listener + an
// `onKey` Escape handler + an `open-profile-menu` window event for the
// cross-tree open trigger. That stack added up to ~80 lines of dismissal
// + focus-trap + Tab-cycling code that has been re-implemented inside
// every popover-shaped surface the app ships.
//
// 2026-05-15 Radix migration. User asked for "shadcn or something" with
// "key shortcuts for pc". The right move is **selective** Radix adoption
// — replace the three hand-rolled popovers (ProfileMenu, ChatHistoryMenu,
// Shortlist) with `@radix-ui/react-popover` + `@radix-ui/react-dialog`
// and add `cmdk` for a ⌘K palette. We keep the existing visual
// treatment (the popover *body* still uses `.surface-glass-card` and
// renders the same `PreferencesCard` content); only the scaffolding
// changes. See DESIGN.md §2.15 + the new §2.16 (Radix decision).
//
// What Radix gives us for free (was hand-rolled):
//   - Outside-click dismissal (PointerDownOutside).
//   - Escape-to-close (EscapeKeyDown).
//   - Focus trap + Tab cycling inside the panel.
//   - Focus return to the trigger on close.
//   - `aria-haspopup` / `aria-expanded` / `aria-controls` wiring.
//   - `role="dialog"` on the surfaced content (the Popover Content
//     surfaces as a dialog per WAI-ARIA — the Playwright tests rely on
//     this exact role).
//   - Portaling so the panel escapes the header's `backdrop-filter`
//     containing-block trap (CSS §2; the prior `createPortal` comment).
//
// Behaviour preserved:
//   - 36px avatar trigger with a saved-prefs dot badge.
//   - Anchored popover on desktop, bottom-sheet-shaped on mobile via
//     the same responsive className rules used before.
//   - The `open-profile-menu` CustomEvent (fired by NoResultsBlock's
//     tertiary CTA) still opens the popover.
// ---------------------------------------------------------------------------

export function ProfileMenu() {
  const { prefs, isLoading } = usePreferences();
  const [open, setOpen] = useState(false);

  const hasPrefs = useMemo(
    () => Object.values(prefs).some((r) => r != null),
    [prefs],
  );

  // Cycle-7 §2.11 — `NoResultsBlock`'s "Edit your preferences" tertiary
  // CTA fires a `open-profile-menu` CustomEvent on window. Radix's
  // controlled state means we just `setOpen(true)` and the Popover's
  // own machinery handles the rest (focus, dismissal, etc.).
  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener('open-profile-menu', onOpen);
    return () => window.removeEventListener('open-profile-menu', onOpen);
  }, []);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
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
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          // Radix surfaces Content as `role="dialog"` automatically; the
          // historical aria-labelledby still points at the title inside
          // the empty state for SR continuity.
          aria-labelledby="profile-menu-title"
          // `side="bottom" align="end" sideOffset={12}` anchors the
          // desktop popover under the avatar with a small visual gap so
          // the inner-white specular edge of the glass card reads.
          side="bottom"
          align="end"
          sideOffset={12}
          collisionPadding={8}
          // Avoid auto-focus stealing on open — the popover's first
          // focusable (the chip "+" button) gets focus naturally via
          // the focus trap once the user Tabs in.
          className={cn(
            'surface-glass-card z-40 rounded-2xl p-4 outline-none',
            // Mobile bottom-sheet shape via the same width/inset rules
            // the prior hand-rolled version used.
            'w-[calc(100vw-1rem)] max-w-sm',
            'sm:w-[22rem]',
          )}
        >
          {hasPrefs || isLoading ? (
            <PreferencesCard />
          ) : (
            <EmptyExplainer onDismiss={() => setOpen(false)} />
          )}
          <DefaultFiltersSection />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ---------------------------------------------------------------------------
// Empty state — unchanged from Cycle 5. Friendly one-liner shown when no
// preferences exist yet; surfaces the value of the panel without exposing
// the edit form chrome before anything is worth editing.
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
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-card',
          )}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
