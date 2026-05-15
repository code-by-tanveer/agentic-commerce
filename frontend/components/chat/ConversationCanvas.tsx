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

  // We re-read `messages.length` inside the scroll handler via a ref so the
  // listener doesn't have to be torn down + reattached on every render.
  // (Bug from 2026-05-14 user test: "Latest" button visible on a fresh tab.
  // Root cause: the welcome held-shape's `py-8 sm:py-16` + the canvas's
  // `paddingBottom: calc(input-bar-height + 24px)` make scrollHeight just
  // barely > viewport at some widths, so distanceFromBottom > 200 at rest.
  // Even when it isn't, the button is meaningless with no "latest message"
  // to jump to. Gate showJump on having at least one user-initiated turn.)
  const messageCountRef = useRef(messages.length);
  messageCountRef.current = messages.length;

  useEffect(() => {
    const markUserIntent = () => {
      if (programmaticScrollLockRef.current) return;
      const d = distanceFromBottom();
      userPinnedAwayRef.current = d > NEAR_BOTTOM_PX;
    };

    const onScroll = () => {
      const d = distanceFromBottom();
      // Welcome-only state (messages.length === 1, the seeded assistant
      // welcome) has nothing to jump TO. Suppress the button until at
      // least one real turn has happened.
      setShowJump(d > SHOW_JUMP_PX && messageCountRef.current > 1);
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

  // A user-initiated send is unambiguous intent to see the result — reset the
  // pinned-away flag so the agent's reply auto-scrolls into view even when the
  // user had previously scrolled up (e.g. tapped Pair-with from a card mid-page).
  // Detect "new turn" by watching the user-message count; an assistant streaming
  // delta does NOT change it, so background streaming doesn't yank the viewport
  // back if the user has intentionally scrolled away mid-reply.
  const lastUserCountRef = useRef(0);
  const userCount = messages.filter((m) => m.role === 'user').length;
  if (userCount > lastUserCountRef.current) {
    userPinnedAwayRef.current = false;
    lastUserCountRef.current = userCount;
  }

  useEffect(() => {
    if (userPinnedAwayRef.current) return;
    scrollToBottom(true);
  }, [fingerprint, scrollToBottom]);

  // Re-evaluate the Jump button visibility when the gate input
  // (messages.length > 1) flips. Without this, showJump stays `false` after
  // the first send even if the page is already scrollable, because the
  // scroll handler only fires on actual scroll events.
  useEffect(() => {
    const d = distanceFromBottom();
    setShowJump(d > SHOW_JUMP_PX && messages.length > 1);
  }, [messages.length]);

  const onlyWelcome = messages.length === 1 && messages[0].role === 'assistant';

  return (
    <div
      className="mx-auto w-full max-w-3xl flex-1 px-4 py-6"
      style={{ paddingBottom: 'calc(var(--input-bar-height, 100px) + 24px)' }}
    >
      <div className="flex flex-col gap-4">
        {/* Cycle 7 — welcome held-shape. The previous welcome was a single
            sentence inside the standard assistant bubble: no first-impression
            weight, no held composition, no signal that this is the start of
            a session. DESIGN.md §2.4 names the welcome canvas as authorial
            voice (not data), and §3.9 "the serif is a gift" reserves
            Instrument Serif for moments the app speaks with a voice. This is
            one. A centered serif headline lives ABOVE the suggestion chips;
            the trust-promise sentence drops to a quiet caption beneath. No
            bubble, no chrome — the headline IS the held shape. */}
        {onlyWelcome ? (
          // Cycle 10 (2026-05-15 night) — the welcome held-shape now sits
          // inside a wide tinted-glass cartouche over the Liquid Dawn
          // gradient. Without the glass surface the serif headline would
          // sit directly on the fuchsia region of the gradient (~50%
          // lightness); ink-900 there reads ≈3.5:1 which fails AAA.
          // Wrapping in `.surface-glass-card` lifts the text to the same
          // 72%-white frost the chat bubbles sit on (AAA holds at
          // ≥8.5:1). 2026-05-14's "held shape, no animation" decision
          // survives — the cartouche is still a static composition.
          <div
            className="surface-glass-card flex flex-col items-start gap-6 rounded-3xl p-8 sm:p-12 my-6 sm:my-10"
          >
            <h2 className="font-display text-3xl italic leading-[1.05] tracking-tight text-ink-900 sm:text-4xl md:text-5xl">
              What are you{' '}
              <span className="text-ink-600">looking for</span>
              <span className="text-accent-500">?</span>
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-ink-600">
              Shopify merchants, ranked by your preferences — not paid placement.
            </p>
            <div className="pt-1">
              <SuggestionChips suggestions={STARTERS} onPick={(s) => void send(s)} />
            </div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div key={m.id} layout>
                <MessageBubble message={m} />
              </motion.div>
            ))}
          </AnimatePresence>
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
