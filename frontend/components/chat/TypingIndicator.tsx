'use client';

import { motion } from 'framer-motion';

export function TypingIndicator() {
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
