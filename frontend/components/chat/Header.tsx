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
import { ProfileMenu } from '@/components/preferences/ProfileMenu';
import { ChatHistoryMenu } from './ChatHistoryMenu';
import { ShareButton } from './ShareButton';
import { ViewToggle } from './ViewToggle';

// Wordmark renders in Inter `font-sans font-semibold`, not the serif.
// DESIGN.md §2.4 enumerates exactly four serif homes (ProductCard total,
// SummaryHero gist, SummaryProductList section headers, CollageView hover
// caption) and explicitly forbids a fifth — "Nowhere else." Yuki's round-4
// audit caught the masthead as the fifth site: a persistent serif above
// every conversation turn pre-spent the serif scarcity before the user
// reached the SummaryHero italic moment. Inter at the existing weight keeps
// brand presence without flattening the gift downstream.
export function Header() {
  const { messages } = useConversationState();
  const { createNewSession } = useConversationActions();
  const { sessionId } = useSession();
  const { shortlist, isOpen: shortlistOpen, toggleDrawer } = useShortlist();
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
          {/* Wordmark — Inter `font-sans font-semibold`. The four serif
              homes per DESIGN.md §2.4 do NOT include the persistent app
              chrome (Yuki R4 audit). R3 polish: tagline dropped per Skeptic
              re-walk (defensive marketing copy was the strongest remaining
              bot-tell). */}
          <p className="font-sans text-xl font-semibold leading-none text-ink-900">
            Agentic Commerce
          </p>
        </div>

        {/* Action row — `gap-1` at narrow widths so 4–5 trailing controls
            (ViewToggle, ShareButton, Shortlist trigger, optional New chat,
            ProfileMenu) fit within a 360px viewport without horizontal
            overflow. The QA sweep (2026-05-13) caught the actions row
            extending 19px past the viewport once `hasHistory` flipped on
            and added the New-chat button; tightening the gap and clipping
            New-chat below 380px (where the label was already hidden)
            keeps the row inside the page. */}
        <div className="flex items-center gap-1 min-[380px]:gap-2">
          <ViewToggle />
          {canShare && sessionId && <ShareButton sessionId={sessionId} />}
          {/* Cycle 7 chat-history (PRODUCT §6 AC #1) — anchored between the
              ViewToggle and the existing trailing chrome so it lives next
              to the New-chat button (per the task brief). Collapses to
              icon-only at <480px and disappears entirely under 380px to
              match the existing narrow-viewport rule (same as the
              Shortlist label collapse and the New-chat button). */}
          <ChatHistoryMenu />
          <button
            type="button"
            // Stable id so the drawer's outside-click detector can exclude
            // the trigger (avoids "close then immediately re-open" on tap).
            id="shortlist-trigger"
            onClick={toggleDrawer}
            aria-haspopup="dialog"
            aria-expanded={shortlistOpen}
            aria-controls="shortlist-drawer"
            aria-label={
              shortlistOpen
                ? `Close shortlist (${badge} loved or maybe)`
                : `Open shortlist (${badge} loved or maybe)`
            }
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
            // QA sweep (2026-05-13) — the WHOLE button is now `hidden
            // min-[380px]:inline-flex`. Previously only the label collapsed
            // at <380px; the icon-only button still consumed ~38px and
            // pushed the action row past the viewport at 360px (the canonical
            // narrow phone width). The action is recoverable via the
            // ProfileMenu / page reload, so dropping it from the chrome at
            // narrow widths is the lower-cost option than further squeezing.
            //
            // Cycle 7 chat-history — the click handler is now
            // `createNewSession` (mints a fresh BE session row and updates
            // the cookie list), NOT `reset` (which just cleared the in-memory
            // messages but left the user on the same backing row). The
            // previous session stays in the chat-history dropdown so the
            // user can still hop back to it.
            <button
              onClick={() => {
                void createNewSession();
              }}
              aria-label="Start a new chat"
              className="hidden min-[380px]:inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs text-ink-600 transition hover:bg-ink-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              <span>New chat</span>
            </button>
          )}
          {/* ProfileMenu — Cycle 5. Replaces the always-on PreferencesCard
              above the InputBar (read as intrusive). Quiet 36px avatar that
              opens an anchored popover with the same chip-editing card. Dot
              badge appears when ≥1 preference is saved. */}
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
