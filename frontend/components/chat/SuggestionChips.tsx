'use client';

import { motion, useReducedMotion } from 'framer-motion';

interface Props {
  suggestions: string[];
  onPick: (s: string) => void;
}

export function SuggestionChips({ suggestions, onPick }: Props) {
  // T4.E (Lila) — Round-5 polish. The 100ms initial delay wasn't gated, so
  // under `prefers-reduced-motion` users still got a one-shot delayed fade.
  // The motion is opacity-only and one-shot (not infinite), so it can stay,
  // but the delay drops to 0 under reduced motion per Lila's "completes the
  // brief" note.
  const reduce = useReducedMotion();
  if (!suggestions.length) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: reduce ? 0 : 0.1 }}
      className="flex flex-wrap gap-2"
    >
      {suggestions.map((s) => (
        <button
          key={s}
          onClick={() => onPick(s)}
          // T1.30 — drop decimal spacing (px-3.5/py-1.5 → px-3/py-2).
          className="rounded-full border border-ink-200 bg-white px-3 py-2 text-xs text-ink-600 transition hover:border-ink-400 hover:text-ink-900"
        >
          {s}
        </button>
      ))}
    </motion.div>
  );
}
