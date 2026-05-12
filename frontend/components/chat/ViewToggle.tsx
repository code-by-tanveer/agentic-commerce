'use client';

import { LayoutGrid, List } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ViewMode } from '@/types/product';
import { useShortlist } from '@/hooks/useShortlist';

// ---------------------------------------------------------------------------
// ViewToggle — Cycle 3.
//
// Segmented control in the chat header: List | Collage. Selection persists
// per session via `useShortlist().setViewMode` → PUT `/view-mode`.
//
// Compliance (DESIGN.md):
//   - §2.7: `shadow-soft` only — no border alongside it. The inset segments
//     are color-only (no border, no shadow) so the outer shadow remains the
//     single elevation cue.
//   - §2.5: spacing limited to 1/2/3 (`p-1`, `gap-1`, `px-2 py-1`).
//   - §2.8: no internal animation; the canvas's `motion-layout` reflow
//     handles the visible transition when `viewMode` flips.
//   - §3 principle 6: orange is reserved for commerce-intent affordances —
//     the selected segment is `bg-ink-900 text-white`, not orange.
// ---------------------------------------------------------------------------

const SEGMENTS: Array<{ mode: ViewMode; label: string; Icon: typeof List }> = [
  { mode: 'list', label: 'List view', Icon: List },
  { mode: 'collage', label: 'Collage view', Icon: LayoutGrid },
];

export function ViewToggle() {
  const { viewMode, setViewMode } = useShortlist();

  return (
    <div
      role="radiogroup"
      aria-label="Result layout"
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-white p-1 shadow-soft',
      )}
    >
      {SEGMENTS.map(({ mode, label, Icon }) => {
        const selected = viewMode === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            onClick={() => void setViewMode(mode)}
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded-full transition',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
              selected ? 'bg-ink-900 text-white' : 'text-ink-400 hover:text-ink-900',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
