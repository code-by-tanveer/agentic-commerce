'use client';

import { motion, useReducedMotion } from 'framer-motion';

interface Props {
  suggestions: string[];
  onPick: (s: string) => void;
}

// ---------------------------------------------------------------------------
// SuggestionChips — Cycle 8 Move #2 (depth pass, 2026-05-14).
//
// Before: four identical `rounded-full border` pills, flex-wrap, gap-2 —
// the same tag-row shape every commerce app ships. From the post-Cycle-7
// design walk (welcome-1280 screenshot) this was the single typographic
// moment on the welcome state that wasn't expressing identity.
//
// After: a left-aligned editorial cluster. Each suggestion is a row of
// `Try —` (font-display italic, ink-400) + the suggestion (font-display,
// ink-900, hover lights to accent-600). No borders, no pills. The cluster
// rhymes with the welcome headline ("What are you *looking for*?") —
// same family, ~50% the size. Reads as a table-of-contents, not a tag row.
//
// Motion is unchanged (opacity-fade, one-shot, gated under reduce-motion
// per the prior Lila note). Focus uses the canonical ink-900 ring with
// ink-50 offset — matches the rest of the app. The hit area is generous
// (`py-1.5 -mx-1 px-1`) so keyboard tab + touch both land cleanly.
//
// DESIGN.md §2.4: suggestion text in serif is NOT a content serif home —
// the suggestions are pre-canned starter prompts, not authorial voice. The
// cap remains five (six pending Move 1 — product card title). The "Try —"
// prefix is the same shape as the welcome subtitle (trust copy), just
// repeated per row.
// ---------------------------------------------------------------------------

export function SuggestionChips({ suggestions, onPick }: Props) {
  const reduce = useReducedMotion();
  if (!suggestions.length) return null;
  return (
    <motion.ul
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: reduce ? 0 : 0.1 }}
      className="flex flex-col gap-y-2"
      aria-label="Suggested searches"
    >
      {suggestions.map((s) => (
        <li key={s}>
          <button
            type="button"
            onClick={() => onPick(s)}
            className="group inline-flex max-w-full items-baseline gap-2 -mx-1 px-1 py-1.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50 rounded-sm"
          >
            <span
              aria-hidden
              className="shrink-0 font-display italic text-sm text-ink-400 leading-snug"
            >
              Try —
            </span>
            <span className="font-display text-base leading-snug text-ink-900 transition-colors group-hover:text-accent-600">
              {s}
            </span>
          </button>
        </li>
      ))}
    </motion.ul>
  );
}
