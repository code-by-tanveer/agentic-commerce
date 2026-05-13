'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  useConversationActions,
  useConversationState,
} from '@/hooks/useConversation';
import { MessageBubble } from './MessageBubble';
import { SuggestionChips } from './SuggestionChips';

// T1.11 — voice + breadth. The previous chips were marketer-flat
// (home / gift / fitness / soft-goods). PRODUCT.md vision: the agent talks
// like a friend who reads the catalogue. These prompts model that.
const STARTERS = [
  "a desk lamp that won't look like an Ikea cliché",
  'a gift for someone who already owns everything',
  'a winter coat that ships from EU',
  'a chunky vase, ceramic, under $80',
];

export function ConversationCanvas() {
  const { messages } = useConversationState();
  const { send } = useConversationActions();
  const endRef = useRef<HTMLDivElement>(null);
  // T4.Y (Lila, Round 5) — auto-scroll was hardcoded to `behavior: 'smooth'`.
  // Browsers honour `prefers-reduced-motion` and substitute `auto` in
  // practice, but explicit is better than implicit (Lila's note). Gate via
  // `useReducedMotion()`.
  const reduce = useReducedMotion();

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: reduce ? 'auto' : 'smooth',
      block: 'end',
    });
  }, [messages, reduce]);

  const onlyWelcome = messages.length === 1 && messages[0].role === 'assistant';

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      {/* T1.5 — `aria-live` removed from the canvas. Re-announcing every
          token / product card on every text_delta caused screen-reader spam.
          The narrow polite-status surface now lives on ToolStatus
          (role="status" aria-live="polite"). Streamed prose updates without
          announcing each delta — assistive tech still reads it on focus /
          virtual-cursor traversal. */}
      <div className="flex flex-col gap-4">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div key={m.id} layout>
              <MessageBubble message={m} />
            </motion.div>
          ))}
        </AnimatePresence>

        {onlyWelcome && (
          <div className="pt-1">
            <SuggestionChips suggestions={STARTERS} onPick={(s) => void send(s)} />
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  );
}
