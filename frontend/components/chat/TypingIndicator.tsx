'use client';

import { motion, useReducedMotion } from 'framer-motion';

// Unified loader vocabulary (2026-05-14): same watch-hand used in
// ToolStatus' running state, used here as the "thinking" indicator while
// the assistant placeholder is empty (pre-first-byte). One rotating-line
// primitive everywhere a loader belongs — no more 3-dot vs. watch-hand
// inconsistency between "waiting for first byte" and "tool running."
//
// Same 12×12 viewBox, 1.5px stroke, 600ms cadence, ink-400 cascade.
export function TypingIndicator() {
  const reduce = useReducedMotion();
  const HAND = (
    <svg viewBox="0 0 12 12" className="h-3 w-3 text-ink-400" aria-hidden fill="none">
      <line
        x1="6"
        y1="6"
        x2="6"
        y2="1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
  if (reduce) {
    return (
      <span className="inline-flex h-3 w-3 items-center justify-center" aria-hidden>
        {HAND}
      </span>
    );
  }
  return (
    <motion.span
      className="inline-flex h-3 w-3 items-center justify-center"
      animate={{ rotate: 360 }}
      transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }}
      style={{ transformOrigin: '50% 50%' }}
      aria-hidden
    >
      {HAND}
    </motion.span>
  );
}
