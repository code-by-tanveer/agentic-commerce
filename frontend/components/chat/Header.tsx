'use client';

import { useMemo } from 'react';
import { Layers, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  useConversationActions,
  useConversationState,
} from '@/hooks/useConversation';
import { useSession } from '@/hooks/useSession';
import { useShortlist } from '@/hooks/useShortlist';
import { ShareButton } from './ShareButton';
import { ViewToggle } from './ViewToggle';

// T1.9 — replaced the round Sparkles emblem with the wordmark in `font-display`
// (Instrument Serif). DESIGN.md §2.4 #2 designates the page-header wordmark as
// one of the four allowed serif homes; a "magazine masthead" feel keeps the
// Skeptic anti-mascot rule honoured while still signalling brand voice.
export function Header() {
  const { messages } = useConversationState();
  const { reset } = useConversationActions();
  const { sessionId } = useSession();
  const { shortlist, openDrawer } = useShortlist();
  const hasHistory = messages.length > 1;

  // Header trigger badge = Love + Maybe (Skip not counted — DESIGN.md §4
  // Shortlist + Cycle 3 brief).
  const badge = useMemo(
    () => shortlist.filter((i) => i.lane === 'love' || i.lane === 'maybe').length,
    [shortlist],
  );

  // Cycle 5: surface the share button only once there's at least one Love
  // or Maybe item to share — keeps the chrome quiet on a fresh session.
  const canShare = badge > 0 && !!sessionId;

  return (
    <header className="sticky top-0 z-20 border-b border-ink-100 bg-ink-50/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <div className="leading-tight">
          {/* Wordmark — serif, magazine-masthead. DESIGN.md §2.4 #2. */}
          <p className="font-display text-xl leading-none text-ink-900">
            Agentic Commerce
          </p>
          <p className="mt-1 text-[11px] text-ink-400">
            Conversational product discovery
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ViewToggle />
          {canShare && sessionId && <ShareButton sessionId={sessionId} />}
          <button
            type="button"
            onClick={openDrawer}
            aria-label={`Open shortlist (${badge} loved or maybe)`}
            className={cn(
              // T1.30 — gap-2 / py-2 / px-3 (no decimal spacing).
              // T1.2 — sub-380px the label is hidden so the icon + badge are
              // all that survive; the aria-label still carries the count for
              // screen readers.
              'inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs text-ink-900 shadow-soft transition hover:bg-ink-50',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50',
            )}
          >
            <Layers className="h-3.5 w-3.5 text-ink-400" aria-hidden />
            <span className="hidden min-[380px]:inline">Shortlist</span>
            <span
              className={cn(
                'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px]',
                badge > 0 ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-400',
              )}
              aria-hidden
            >
              {badge}
            </span>
          </button>
          {hasHistory && (
            <button
              onClick={reset}
              aria-label="Start a new chat"
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs text-ink-600 transition hover:bg-ink-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              {/* T1.2 — under 380px the label collapses; aria-label carries it. */}
              <span className="hidden min-[380px]:inline">New chat</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
