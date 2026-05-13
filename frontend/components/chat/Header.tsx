'use client';

import { useMemo } from 'react';
import { Layers, RotateCcw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useConversation } from '@/hooks/useConversation';
import { useSession } from '@/hooks/useSession';
import { useShortlist } from '@/hooks/useShortlist';
import { ShareButton } from './ShareButton';
import { ViewToggle } from './ViewToggle';

export function Header() {
  const { reset, messages } = useConversation();
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
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-ink-900 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-ink-900">Agentic Commerce</p>
            <p className="text-[11px] text-ink-400">Conversational product discovery</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ViewToggle />
          {canShare && sessionId && <ShareButton sessionId={sessionId} />}
          <button
            type="button"
            onClick={openDrawer}
            aria-label="Open shortlist"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs text-ink-900 shadow-soft transition hover:bg-ink-50',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50',
            )}
          >
            <Layers className="h-3.5 w-3.5 text-ink-400" aria-hidden />
            <span>Shortlist</span>
            <span
              className={cn(
                'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px]',
                badge > 0 ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-400',
              )}
              aria-label={`${badge} loved or maybe`}
            >
              {badge}
            </span>
          </button>
          {hasHistory && (
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-ink-600 transition hover:bg-ink-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              New chat
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
