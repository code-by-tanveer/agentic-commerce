'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import {
  useConversationActions,
  useConversationState,
} from '@/hooks/useConversation';
import { MessageBubble } from './MessageBubble';
import { SuggestionChips } from './SuggestionChips';

const STARTERS = [
  "a desk lamp that won't look like an Ikea cliché",
  'a gift for someone who already owns everything',
  'a winter coat that ships from EU',
  'a chunky vase, ceramic, under $80',
];

const SHOW_JUMP_PX = 200;
const NEAR_BOTTOM_PX = 80;

function distanceFromBottom(): number {
  const doc = document.documentElement;
  return doc.scrollHeight - window.innerHeight - window.scrollY;
}

export function ConversationCanvas() {
  const { messages } = useConversationState();
  const { send } = useConversationActions();
  const endRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [showJump, setShowJump] = useState(false);

  // `userPinnedAwayRef` only flips true on an actual user gesture (wheel /
  // touchmove / scroll-key). DOM-growth induced scroll events do NOT flip it,
  // which is the fix for the prior bug where streaming content widened the
  // distance-to-bottom and tripped the "user scrolled up" heuristic mid-reply.
  const userPinnedAwayRef = useRef(false);
  const programmaticScrollLockRef = useRef(false);

  const scrollToBottom = useCallback(
    (smooth: boolean) => {
      programmaticScrollLockRef.current = true;
      const doc = document.documentElement;
      const target = doc.scrollHeight - window.innerHeight;
      window.scrollTo({
        top: Math.max(target, 0),
        behavior: smooth && !reduce ? 'smooth' : 'auto',
      });
      // Release the lock after the browser has had a chance to dispatch the
      // scroll event for this programmatic call. Two RAFs cover both 'auto'
      // (synchronous) and 'smooth' (animated) — for smooth we also re-fire on
      // the next content tick, so the lock just needs to outlive the burst of
      // intermediate scroll events from this single call.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          programmaticScrollLockRef.current = false;
        });
      });
    },
    [reduce],
  );

  useEffect(() => {
    const markUserIntent = () => {
      if (programmaticScrollLockRef.current) return;
      const d = distanceFromBottom();
      userPinnedAwayRef.current = d > NEAR_BOTTOM_PX;
    };

    const onScroll = () => {
      const d = distanceFromBottom();
      setShowJump(d > SHOW_JUMP_PX);
      if (programmaticScrollLockRef.current) return;
      if (d <= NEAR_BOTTOM_PX) userPinnedAwayRef.current = false;
    };

    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === 'PageUp' ||
        e.key === 'PageDown' ||
        e.key === 'Home' ||
        e.key === 'End' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown'
      ) {
        markUserIntent();
      }
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.addEventListener('wheel', markUserIntent, { passive: true });
    window.addEventListener('touchmove', markUserIntent, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('wheel', markUserIntent);
      window.removeEventListener('touchmove', markUserIntent);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const last = messages[messages.length - 1];
  const fingerprint = last
    ? `${messages.length}:${last.id}:${last.blocks.length}:${last.blocks
        .map((b) => (b.type === 'text' ? b.text.length : b.type))
        .join('|')}`
    : '0';

  useEffect(() => {
    if (userPinnedAwayRef.current) return;
    scrollToBottom(true);
  }, [fingerprint, scrollToBottom]);

  const onlyWelcome = messages.length === 1 && messages[0].role === 'assistant';

  return (
    <div
      className="mx-auto w-full max-w-3xl flex-1 px-4 py-6"
      style={{ paddingBottom: 'calc(var(--input-bar-height, 100px) + 24px)' }}
    >
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

        <div ref={endRef} aria-hidden />
      </div>

      <AnimatePresence>
        {showJump ? (
          <motion.button
            type="button"
            onClick={() => {
              userPinnedAwayRef.current = false;
              scrollToBottom(true);
            }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            aria-label="Jump to latest message"
            className="fixed left-1/2 z-20 inline-flex h-10 -translate-x-1/2 items-center gap-1 rounded-full bg-ink-900 px-4 text-sm font-medium text-white shadow-lift transition hover:bg-ink-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50"
            style={{
              bottom: 'calc(var(--input-bar-height, 100px) + 12px)',
            }}
          >
            <ChevronDown className="h-4 w-4" aria-hidden />
            Latest
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
