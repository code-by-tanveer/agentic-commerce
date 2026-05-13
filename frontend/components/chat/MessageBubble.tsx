'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { TypingIndicator } from './TypingIndicator';
import { MessageRenderer } from './MessageRenderer';
import {
  useConversation,
  type Message,
  type TextBlock,
} from '@/hooks/useConversation';

interface Props {
  message: Message;
}

export function MessageBubble({ message }: Props) {
  const { retry } = useConversation();
  const reduced = useReducedMotion();
  const isUser = message.role === 'user';

  // Entry motion: 250ms easeOut for new bubbles; 100ms opacity-only for
  // reduced-motion (DESIGN.md §2.8 / §7).
  const initial = reduced ? { opacity: 0 } : { opacity: 0, y: 8 };
  const animate = reduced ? { opacity: 1 } : { opacity: 1, y: 0 };
  const transition = reduced
    ? { duration: 0.1, ease: 'easeOut' as const }
    : { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const };

  // User messages always carry a single text block (optionally with an
  // attached image URL — Cycle 4).
  if (isUser) {
    const textBlocks = message.blocks.filter(
      (b): b is TextBlock => b.type === 'text',
    );
    const text = textBlocks.map((b) => b.text).join('');
    const imageUrl = textBlocks.find((b) => b.imageUrl)?.imageUrl;
    if (!text && !imageUrl) return null;
    return (
      <motion.div
        initial={initial}
        animate={animate}
        transition={transition}
        className="flex w-full justify-end"
      >
        <div className="flex max-w-[80%] flex-col items-end gap-2">
          {imageUrl ? (
            <div className="overflow-hidden rounded-2xl bg-ink-100 shadow-soft">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="Attached reference image"
                className="block max-h-40 w-auto object-cover"
              />
            </div>
          ) : null}
          {text ? (
            <div className="rounded-2xl rounded-br-md bg-ink-900 px-4 py-3 text-sm leading-relaxed text-white">
              {text}
            </div>
          ) : null}
        </div>
      </motion.div>
    );
  }

  // Pending assistant — no blocks yet, mid-stream.
  if (message.status === 'streaming' && message.blocks.length === 0) {
    return (
      <motion.div
        initial={initial}
        animate={animate}
        transition={transition}
        className="flex w-full justify-start"
      >
        <div className="rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-soft">
          <TypingIndicator />
        </div>
      </motion.div>
    );
  }

  // Empty done/error with nothing to show — render nothing rather than an
  // empty bubble.
  if (!message.blocks.length) return null;

  return (
    <motion.div
      initial={initial}
      animate={animate}
      transition={transition}
      className={cn('flex w-full justify-start')}
    >
      <div
        className={cn(
          'w-full max-w-[80%] rounded-2xl rounded-bl-md bg-white px-4 py-3 text-sm leading-relaxed text-ink-900 shadow-soft',
        )}
      >
        <MessageRenderer
          blocks={message.blocks}
          messageId={message.id}
          onRetry={message.status === 'error' ? () => void retry(message.id) : undefined}
        />
      </div>
    </motion.div>
  );
}
