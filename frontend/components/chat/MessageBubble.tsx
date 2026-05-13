'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { TypingIndicator } from './TypingIndicator';
import { MessageRenderer } from './MessageRenderer';
import { MessageFilterChips, type FilterKey } from './MessageFilterChips';
import {
  useConversationActions,
  useConversationState,
  type Block,
  type Message,
  type ProductsBlock,
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

// Natural-language hint appended to the re-run query. Phrased as a parenthetical
// directive so it reads as a one-shot override (the agent's system prompt
// treats trailing-parenthetical directives as ad-hoc overrides to the merged
// filter view) rather than a profile-level edit.
function filterDirective(filter: FilterKey): string {
  switch (filter) {
    case 'budget':
      return 'without the budget filter';
    case 'shipsTo':
      return 'without the ships-to filter';
    case 'shippingSpeed':
      return 'without the shipping speed filter';
    case 'shoppingFor':
      return 'without the recipient filter';
  }
}

// Pull the first `products` block off the assistant message that immediately
// follows the given user message id, if any. The "first products block" is
// the canonical attribution surface — when the assistant runs `search_catalog`
// more than once in a turn (a relax cycle, say), the FIRST run is the one
// whose `appliedFilters` reflects the inherited state we want to surface
// under the user's bubble.
function findNextAssistantProductsBlock(
  messages: Message[],
  userMessageId: string,
): ProductsBlock | undefined {
  const idx = messages.findIndex((m) => m.id === userMessageId);
  if (idx === -1) return undefined;
  const next = messages[idx + 1];
  if (!next || next.role !== 'assistant') return undefined;
  for (const b of next.blocks) {
    if (b.type === 'products') return b;
  }
  return undefined;
}

export function MessageBubble({ message }: Props) {
  const { retry, send } = useConversationActions();
  const { messages } = useConversationState();
  const reduced = useReducedMotion();
  const isUser = message.role === 'user';

  // Cycle 9 §2.5/§2.9 — chip strip attribution. Compute the user-bubble's
  // matched products block (next assistant turn, first products event). We
  // do this here (vs. in MessageFilterChips) to keep the chip component
  // pure / context-free and to avoid pulling the whole `messages` array
  // into a render that doesn't need it. The lookup is O(n) where n is the
  // conversation length — cheap; no memoisation needed for typical chat
  // lengths but `useMemo`-fenced behind the parent message id + length to
  // dodge re-running on every text-delta tick.
  const userText = useMemo(() => {
    if (!isUser) return '';
    return message.blocks
      .filter((b): b is TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
  }, [isUser, message.blocks]);

  const productsBlock = useMemo(() => {
    if (!isUser) return undefined;
    return findNextAssistantProductsBlock(messages, message.id);
  }, [isUser, messages, message.id]);

  const handleRemoveFilter = (filter: FilterKey) => {
    // PO/UX contract — re-run the SAME query without that filter for this
    // turn only. The natural-language directive nudges the agent; the
    // task-tier scratchpad's next-turn snapshot will omit the override.
    // We DO NOT call any preference-mutation endpoint here.
    const text = userText.trim();
    if (!text) return;
    const hint = filterDirective(filter);
    void send(`${text} (${hint})`);
  };

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
        className="flex w-full flex-col items-end"
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
        {/*
          Cycle 9 §2.5 — filter chip attribution strip. Sits OUTSIDE the
          bubble's max-width container but still inside the right-aligned
          column wrapper, so it hugs the trailing edge of the canvas while
          being free to wrap past the bubble's 80% column constraint when
          all 4 chips render at once. `mt-1.5` is the spec's 6px tight gap
          to the bubble above. Renders null when no filters were inherited,
          which keeps the empty case true zero-height (no reserved space).
        */}
        {productsBlock ? (
          <div className="mt-1.5">
            <MessageFilterChips
              userMessageText={userText}
              appliedFilters={productsBlock.appliedFilters}
              onRemove={handleRemoveFilter}
            />
          </div>
        ) : null}
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
