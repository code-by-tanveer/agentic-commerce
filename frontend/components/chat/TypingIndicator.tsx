'use client';

import { motion, useReducedMotion } from 'framer-motion';

export function TypingIndicator() {
  // T4.E (Lila) — Round-5 polish. The previous `repeat: Infinity` y+opacity
  // loop ran regardless of `prefers-reduced-motion` — the single worst
  // attentional-hijack pattern in the app per Lila's audit. Under reduced
  // motion we drop ALL motion: three static dim dots, opacity 0.6, no
  // animation. The polite-status aria-live region upstream still announces
  // "Thinking…" so the signal that the model is working survives without the
  // infinite loop. T1.30 gap-2 preserved.
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <div className="flex items-center gap-2" style={{ opacity: 0.6 }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block h-1.5 w-1.5 rounded-full bg-ink-400"
            aria-hidden
          />
        ))}
      </div>
    );
  }

  return (
    // T1.30 — gap-2 (no decimal). T1.32 — duration 0.6 (DESIGN.md §6 600ms
    // loop budget). h-1.5/w-1.5 are dot sizes (icon carve-out per §2.5).
    <div className="flex items-center gap-2">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block h-1.5 w-1.5 rounded-full bg-ink-400"
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.12 }}
        />
      ))}
    </div>
  );
}
