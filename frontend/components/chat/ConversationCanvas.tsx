'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useConversation } from '@/hooks/useConversation';
import { MessageBubble } from './MessageBubble';
import { SuggestionChips } from './SuggestionChips';

const STARTERS = [
  'a minimalist desk lamp under $150',
  'gifts for a coffee obsessive',
  'lightweight running shoes for trails',
  'a chunky knit throw in neutral tones',
];

export function ConversationCanvas() {
  const { messages, send } = useConversation();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const onlyWelcome = messages.length === 1 && messages[0].role === 'assistant';

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <div
        className="flex flex-col gap-4"
        aria-live="polite"
        aria-atomic="false"
      >
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
