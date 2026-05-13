'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { TypingIndicator } from './TypingIndicator';
import { MessageRenderer } from './MessageRenderer';
import {
  useConversationActions,
  type Block,
  type Message,
  type TextBlock,
} from '@/hooks/useConversation';

// T4.G — block types that should break out of the bubble. Shadowed cards
// inside a shadowed bubble (the canonical ChatGPT-Shopping silhouette) read
// as ours-by-accident; the structural fix is to render the rich blocks as
// siblings of the text bubble inside the same message wrapper. The chat
// bubble holds prose; the cards live at full canvas width below it. They
// share entry animation but not chrome.
const CARD_BLOCK_TYPES = new Set<Block['type']>([
  'products',
  'comparison',
  'outfit',
  'moodboard',
]);

function isCardBlock(b: Block): boolean {
  return CARD_BLOCK_TYPES.has(b.type);
}

interface Props {
  message: Message;
}

export function MessageBubble({ message }: Props) {
  const { retry } = useConversationActions();
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
            // T4.N — user-attached reference image. The intrinsic dimensions
            // come from the upload endpoint; we don't know aspect ratio
            // ahead of render, but the visual constraint is `max-h-40`. We
            // use a sized 160x160 box with `next/image` `fill` + object-cover
            // — slight crop on tall images is acceptable for a chat-bubble
            // thumbnail, and avoids the `<img>` no-CLS / no-srcset issues.
            <div className="relative h-40 w-40 overflow-hidden rounded-2xl bg-ink-100 shadow-soft">
              <Image
                src={imageUrl}
                alt="Attached reference image"
                fill
                sizes="160px"
                className="object-cover"
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

  // T4.G — split the block stream. Text / tool_status / error blocks stay
  // inside the assistant's `max-w-[80%]` bubble; card-shaped blocks
  // (products / comparison / outfit / moodboard) render as siblings of the
  // bubble at full canvas width. Order within each group is preserved.
  const bubbleBlocks = message.blocks.filter((b) => !isCardBlock(b));
  const cardBlocks = message.blocks.filter(isCardBlock);
  const onRetry =
    message.status === 'error' ? () => void retry(message.id) : undefined;

  return (
    <motion.div
      initial={initial}
      animate={animate}
      transition={transition}
      className="flex w-full flex-col items-start gap-3"
    >
      {bubbleBlocks.length > 0 ? (
        <div
          className={cn(
            'max-w-[80%] rounded-2xl rounded-bl-md bg-white px-4 py-3 text-sm leading-relaxed text-ink-900 shadow-soft',
          )}
        >
          <MessageRenderer
            blocks={bubbleBlocks}
            messageId={message.id}
            onRetry={onRetry}
          />
        </div>
      ) : null}
      {cardBlocks.length > 0 ? (
        <div className="w-full max-w-3xl">
          <MessageRenderer
            blocks={cardBlocks}
            messageId={message.id}
            onRetry={onRetry}
          />
        </div>
      ) : null}
    </motion.div>
  );
}
