'use client';

import { useId, useState, useRef, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/cn';
import type { ReasoningChip, ReasoningChipKind, ReasoningChipTone } from '@/types/product';

// ---------------------------------------------------------------------------
// ReasoningChips — Cycle 2.
//
// Row of small chips below a ProductCard title. Color mapping per
// DESIGN.md §8 Cycle 2 directive, with the Cycle-2 review fix to honor
// §2.2 "orange = commitment only":
//   size_match  → ink-tint  (bg-ink-100 / text-ink-900)
//   discount    → accent-50 (bg-accent-50 / text-accent-600) — savings news
//   price       → amber     (bg-amber-50 / text-amber-700)   — OVER budget warning, not commitment
//   shipping    → ink       (bg-ink-900  / text-white)
//   ethics      → emerald   (bg-emerald-50 / text-emerald-600)
//   low_stock   → amber     (bg-amber-50 / text-amber-700)
//
// `tone` (positive | neutral | warning) is a visual treatment hint consulted
// only when `kind` is unknown — kind is the primary signal per DESIGN.md §8.
//
// Interaction model:
//   - Desktop (`hover:hover` pointers): tooltip below chip on hover/focus,
//     bound via `aria-describedby` to a hidden-until-hovered tooltip element.
//   - Mobile / touch: tap → expand the detail in-place beneath the row.
//     Both the desktop tooltip and the in-place panel share the same DOM
//     node so `aria-describedby` always resolves.
//
// Motion: stagger entry up to 4 chips, 40ms apart, 200ms easeOut. Total
// under DESIGN.md §2.8's 300ms budget. `useReducedMotion` → 100ms opacity-
// only crossfade with no stagger.
//
// Capping: render at most 4 chips. The agent ranks before sending (BE
// `reasoning.ts`); taking the first 4 preserves ranking.
// ---------------------------------------------------------------------------

interface Props {
  chips?: ReasoningChip[];
  className?: string;
}

const MAX_CHIPS = 4;

const TONE_STYLE: Record<ReasoningChipTone, string> = {
  positive: 'bg-emerald-50 text-emerald-600',
  neutral: 'bg-ink-100 text-ink-900',
  warning: 'bg-amber-50 text-amber-700',
};

function styleForChip(chip: ReasoningChip): string {
  switch (chip.kind as ReasoningChipKind) {
    case 'size_match':
      return 'bg-ink-100 text-ink-900';
    case 'discount':
      return 'bg-accent-50 text-accent-600';
    case 'price':
      // Over-budget warning — must not look like a commitment affordance
      // (DESIGN.md §2.2 "orange means commitment only"). Cycle 2 review fix.
      return 'bg-amber-50 text-amber-700';
    case 'shipping':
      return 'bg-ink-900 text-white';
    case 'ethics':
      return 'bg-emerald-50 text-emerald-600';
    case 'low_stock':
      return 'bg-amber-50 text-amber-700';
    default:
      return TONE_STYLE[chip.tone ?? 'neutral'];
  }
}

export function ReasoningChips({ chips, className }: Props) {
  // Silent degrade — never show a placeholder row (PRODUCT.md acceptance #5).
  if (!chips || chips.length === 0) return null;
  const limited = chips.slice(0, MAX_CHIPS);
  // Track which chip (if any) has its in-place detail expanded. Single-open
  // semantics keep the row from sprawling. `null` = nothing expanded.
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Collapse when interacting outside the chip row.
  useEffect(() => {
    if (openIdx === null) return;
    function onDocClick(e: MouseEvent) {
      const root = containerRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) setOpenIdx(null);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openIdx]);

  const openChip = openIdx !== null ? limited[openIdx] : null;

  return (
    <div ref={containerRef} className={cn('w-full', className)}>
      <div
        className="flex flex-wrap items-center gap-2"
        role="list"
        aria-label="Why this product"
      >
        {limited.map((chip, i) => (
          <Chip
            key={`${chip.kind}-${i}`}
            chip={chip}
            index={i}
            isOpen={openIdx === i}
            onToggle={() => setOpenIdx((cur) => (cur === i ? null : i))}
          />
        ))}
      </div>

      {/* In-place mobile expansion. Hidden on `hover:hover` pointers — those
          users get the per-chip tooltip instead. Rendered as a peer so it
          can grow without nudging chip widths around. */}
      {openChip?.detail ? (
        <div
          role="region"
          aria-label={`${openChip.label} detail`}
          className={cn(
            'mt-2 rounded-md bg-ink-900 px-3 py-2 text-[11px] leading-snug text-white',
            // Coarse-pointer / no-hover devices only. On desktop the per-chip
            // tooltip is the canonical surface.
            '[@media(hover:hover)]:hidden',
          )}
        >
          {openChip.detail}
        </div>
      ) : null}
    </div>
  );
}

interface ChipProps {
  chip: ReasoningChip;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}

function Chip({ chip, index, isOpen, onToggle }: ChipProps) {
  const reduced = useReducedMotion();
  const detailId = useId();
  const hasDetail = !!chip.detail;

  const entryInitial = reduced ? { opacity: 0 } : { opacity: 0, y: 4 };
  const entryAnimate = reduced ? { opacity: 1 } : { opacity: 1, y: 0 };
  const entryTransition = reduced
    ? { duration: 0.1 }
    : {
        duration: 0.2,
        // Cap stagger past index 3. With MAX_CHIPS=4 we're already bounded;
        // defense-in-depth against future growth.
        delay: Math.min(index, 3) * 0.04,
        ease: 'easeOut' as const,
      };

  const style = styleForChip(chip);

  return (
    <span
      className="group relative inline-flex"
      role="listitem"
    >
      <motion.button
        type="button"
        initial={entryInitial}
        animate={entryAnimate}
        transition={entryTransition}
        onClick={(e) => {
          // Prevent the surrounding card's expand toggle.
          e.stopPropagation();
          if (hasDetail) onToggle();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && isOpen) {
            e.stopPropagation();
            onToggle();
          }
        }}
        className={cn(
          'relative inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition',
          // Provide a ≥44px-equivalent hit area on coarse pointers via a
          // transparent pseudo-element extension (DESIGN.md §7 a11y).
          'before:absolute before:inset-x-0 before:-inset-y-3 before:content-[""]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
          style,
          !hasDetail && 'cursor-default',
        )}
        aria-describedby={hasDetail ? detailId : undefined}
        aria-expanded={hasDetail ? isOpen : undefined}
        aria-disabled={!hasDetail || undefined}
        tabIndex={hasDetail ? 0 : -1}
      >
        <span className="relative z-10">{chip.label}</span>
      </motion.button>

      {/* Desktop tooltip — bound by `aria-describedby`. Hidden by default;
          shown on hover/focus-within of the chip wrapper (`group`). On
          coarse pointers this is suppressed so the in-place panel wins. */}
      {hasDetail ? (
        <span
          id={detailId}
          role="tooltip"
          className={cn(
            'pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-max max-w-xs rounded-md bg-ink-900 px-3 py-2 text-[11px] leading-snug text-white shadow-soft',
            '[@media(hover:hover)]:group-hover:block [@media(hover:hover)]:group-focus-within:block',
          )}
        >
          {chip.detail}
        </span>
      ) : null}
    </span>
  );
}
