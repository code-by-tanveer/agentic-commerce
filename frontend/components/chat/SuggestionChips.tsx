'use client';

import { motion } from 'framer-motion';

interface Props {
  suggestions: string[];
  onPick: (s: string) => void;
}

export function SuggestionChips({ suggestions, onPick }: Props) {
  if (!suggestions.length) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.1 }}
      className="flex flex-wrap gap-2"
    >
      {suggestions.map((s) => (
        <button
          key={s}
          onClick={() => onPick(s)}
          className="rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-xs text-ink-600 transition hover:border-ink-400 hover:text-ink-900"
        >
          {s}
        </button>
      ))}
    </motion.div>
  );
}
