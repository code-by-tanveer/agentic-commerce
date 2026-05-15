'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Loader2, MessageSquare, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  useConversationActions,
  useConversationState,
} from '@/hooks/useConversation';
import {
  groupByRecency,
  readSessionHistory,
  removeEntry,
  type GroupedHistory,
  type SessionEntry,
} from '@/lib/sessionHistory';

// ---------------------------------------------------------------------------
// ChatHistoryRail — DESIGN §5 (2026-05-14). Replaces the header pill at lg+,
// becomes a collapsible icon strip on tablet, and hides on phone (the phone
// surface keeps `ChatHistoryMenu` as a header-triggered bottom-sheet).
//
// Three responsive shapes inside one component so the parent layout doesn't
// have to juggle three siblings + their `display` toggles:
//
//   - Desktop (lg+, >1024): full 260px rail, flex sibling of <main>. Top
//     row = New chat. Below = grouped list (TODAY / YESTERDAY / EARLIER).
//   - Tablet (641–1024): 56px icon strip. The MessageSquare button toggles a
//     fixed-positioned overlay rendering the same full panel + a scrim.
//   - Phone (≤640): hidden entirely. Header renders the bottom-sheet trigger.
//
// Data: reads SessionEntry[] from the cookie via `readSessionHistory()`. We
// re-read on a `cookieKick` tick that bumps on every action (new chat,
// switch, delete, send) so the rail rebuilds without a context provider.
// Cross-tab updates are caught via the `visibilitychange` listener — when
// the user returns to a tab the rail re-reads.
// ---------------------------------------------------------------------------

export function ChatHistoryRail() {
  const { sessionId, messages } = useConversationState();
  const { createNewSession, switchSession } = useConversationActions();
  const reduced = useReducedMotion();

  const [entries, setEntries] = useState<SessionEntry[]>([]);
  const [creating, setCreating] = useState(false);
  // Tablet overlay open state. Default closed (icon strip visible).
  const [tabletOpen, setTabletOpen] = useState(false);
  // A monotonic counter we bump to force a re-read of the cookie list.
  const [cookieKick, setCookieKick] = useState(0);

  // Re-read the cookie list whenever:
  //   - The component mounts.
  //   - The active session id changes (new chat / switch session).
  //   - A new user message is sent (the first send relabels the cookie row,
  //     and reading on every message-change is cheap relative to the SSE
  //     deltas the canvas already handles).
  //   - The cookieKick increments (delete X, etc.).
  //   - The tab regains visibility (covers cross-tab writes).
  useEffect(() => {
    setEntries(readSessionHistory());
  }, [sessionId, messages.length, cookieKick]);

  useEffect(() => {
    function onVis() {
      if (document.visibilityState === 'visible') {
        setEntries(readSessionHistory());
      }
    }
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const grouped: GroupedHistory = useMemo(
    () => groupByRecency(entries),
    [entries],
  );

  const handleNewChat = useCallback(() => {
    if (creating) return;
    setCreating(true);
    void createNewSession().finally(() => setCreating(false));
    // Close the tablet overlay after action so the user sees the fresh chat.
    setTabletOpen(false);
  }, [creating, createNewSession]);

  const handlePick = useCallback(
    async (id: string) => {
      if (id === sessionId) {
        setTabletOpen(false);
        return;
      }
      setTabletOpen(false);
      await switchSession(id);
    },
    [sessionId, switchSession],
  );

  const handleDelete = useCallback((id: string) => {
    removeEntry(id);
    setCookieKick((k) => k + 1);
  }, []);

  // Close tablet overlay on Escape.
  useEffect(() => {
    if (!tabletOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setTabletOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [tabletOpen]);

  const overlayT = reduced
    ? { duration: 0.1 }
    : { duration: 0.2, ease: 'easeOut' as const };

  return (
    <>
      {/* Desktop rail — flex sibling of <main>. The canvas inside <main>
          keeps its `max-w-3xl` centering; the rail just steals 260px of
          page width from the left. DESIGN §5 puts the desktop tier at
          >1024px; we use `min-[1025px]:flex` instead of `lg:flex`
          (1024) to keep the 1024 boundary in tablet exactly as spec'd.
          `sticky top-0 h-dvh` locks the rail to the viewport regardless of
          page scroll; the inner `RailPanel` owns its own `overflow-y-auto`
          so long lists scroll inside the rail, not on the page. Both
          rail and page share `bg-ink-50`, so the `border-r-ink-200`
          hairline is the only panel-break signal — bumped from `ink-100`
          (too subtle on cream) per the 2026-05-14 user-test pass. */}
      {/* Cycle 10 (2026-05-15 night) — rail surface is now
          `.surface-glass-rail` (translucent over the page gradient + 20px
          blur + 1.4 saturate + 1px white right-edge). The opaque
          `bg-surface-rail` + ink-200 border combo was a 2024-editorial
          read; the glass treatment is the Liquid Dawn sidebar move
          (see DESIGN.md §2.15). The right-edge border is the rail's
          glass edge — no separate `border-r` needed. */}
      <nav
        aria-label="Chat history"
        className="surface-glass-rail hidden min-[1025px]:flex sticky top-0 h-dvh w-[260px] flex-shrink-0 flex-col"
      >
        <RailPanel
          activeId={sessionId}
          grouped={grouped}
          creating={creating}
          onNewChat={handleNewChat}
          onPick={handlePick}
          onDelete={handleDelete}
        />
      </nav>

      {/* Tablet icon strip — 56px wide, visible at 641–1024. On phone
          (≤640) the whole thing is `hidden`; the bottom-sheet trigger
          lives in <Header /> instead. Sticky + `h-dvh` same as desktop. */}
      <nav
        aria-label="Chat history"
        className="surface-glass-rail hidden min-[641px]:flex min-[1025px]:hidden sticky top-0 h-dvh w-14 flex-shrink-0 flex-col items-center gap-2 py-3"
      >
        <button
          type="button"
          disabled={creating}
          onClick={handleNewChat}
          aria-label="Start a new chat"
          aria-busy={creating}
          className={cn(
            'grid h-10 w-10 place-items-center rounded-full bg-ink-900 text-white transition hover:bg-ink-600',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RotateCcw className="h-4 w-4" aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={() => setTabletOpen((v) => !v)}
          aria-label={tabletOpen ? 'Close chat history' : 'Open chat history'}
          aria-expanded={tabletOpen}
          aria-controls="chat-history-rail-overlay"
          className={cn(
            'grid h-10 w-10 place-items-center rounded-full text-ink-600 transition hover:bg-ink-100',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50',
            tabletOpen && 'bg-ink-100 text-ink-900',
          )}
        >
          <MessageSquare className="h-4 w-4" aria-hidden />
        </button>
      </nav>

      {/* Tablet overlay — fixed left-side panel + scrim. Only mounted in the
          641–1024 range; the desktop rail handles >1024, and the bottom-sheet
          (in Header) handles ≤640. Wrapped in AnimatePresence so the slide-in
          on first open is smooth; reduced-motion users get an opacity fade. */}
      <AnimatePresence>
        {tabletOpen ? (
          <motion.div
            key="rail-overlay-shell"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={overlayT}
            className="hidden min-[641px]:block min-[1025px]:hidden"
          >
            <div
              role="button"
              tabIndex={-1}
              aria-label="Close chat history"
              onClick={() => setTabletOpen(false)}
              className="fixed inset-0 z-20 bg-black/20"
            />
            <motion.aside
              key="rail-overlay-panel"
              id="chat-history-rail-overlay"
              role="dialog"
              aria-label="Chat history"
              initial={reduced ? { opacity: 0 } : { x: -16, opacity: 0 }}
              animate={reduced ? { opacity: 1 } : { x: 0, opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { x: -16, opacity: 0 }}
              transition={overlayT}
              className="surface-glass-rail fixed left-0 top-0 z-30 h-screen w-[260px] shadow-lift"
            >
              <RailPanel
                activeId={sessionId}
                grouped={grouped}
                creating={creating}
                onNewChat={handleNewChat}
                onPick={handlePick}
                onDelete={handleDelete}
              />
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// RailPanel — the shared body rendered by both the desktop rail and the
// tablet overlay. Lifting it out keeps the row + group rendering in a single
// place (so a future style tweak doesn't drift between the two surfaces).
// ---------------------------------------------------------------------------

function RailPanel({
  activeId,
  grouped,
  creating,
  onNewChat,
  onPick,
  onDelete,
}: {
  activeId: string | null;
  grouped: GroupedHistory;
  creating: boolean;
  onNewChat: () => void;
  onPick: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex h-full flex-col gap-1 overflow-y-auto px-3 py-4">
      <button
        type="button"
        disabled={creating}
        onClick={onNewChat}
        aria-label="Start a new chat"
        aria-busy={creating}
        className={cn(
          'inline-flex h-9 items-center justify-center gap-2 self-stretch rounded-full bg-ink-900 px-4 text-sm font-medium text-white transition hover:bg-ink-600',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        {creating ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        )}
        <span>New chat</span>
      </button>

      <RailGroup
        label="Today"
        entries={grouped.today}
        activeId={activeId}
        onPick={onPick}
        onDelete={onDelete}
      />
      <RailGroup
        label="Yesterday"
        entries={grouped.yesterday}
        activeId={activeId}
        onPick={onPick}
        onDelete={onDelete}
      />
      <RailGroup
        label="Earlier"
        entries={grouped.earlier}
        activeId={activeId}
        onPick={onPick}
        onDelete={onDelete}
      />

      {grouped.today.length === 0 &&
      grouped.yesterday.length === 0 &&
      grouped.earlier.length === 0 ? (
        <p className="px-3 pt-4 text-xs leading-snug text-ink-400">
          Your chat history shows up here. Send a message to start one.
        </p>
      ) : null}
    </div>
  );
}

function RailGroup({
  label,
  entries,
  activeId,
  onPick,
  onDelete,
}: {
  label: string;
  entries: SessionEntry[];
  activeId: string | null;
  onPick: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col">
      <p className="mt-3 px-3 text-[11px] uppercase tracking-wider text-ink-400">
        {label}
      </p>
      <ul className="flex flex-col gap-0.5" role="list">
        {entries.map((e) => (
          <RailRow
            key={e.id}
            entry={e}
            isActive={e.id === activeId}
            onPick={onPick}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </div>
  );
}

function RailRow({
  entry,
  isActive,
  onPick,
  onDelete,
}: {
  entry: SessionEntry;
  isActive: boolean;
  onPick: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => onPick(entry.id)}
        title={entry.label}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'flex h-10 w-full items-center rounded-xl px-3 text-left text-sm transition',
          isActive
            ? 'bg-ink-100 font-medium text-ink-900'
            : 'text-ink-600 hover:bg-ink-50',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50',
        )}
      >
        <span className="truncate pr-6">{entry.label}</span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          // Stop propagation so the row's onPick doesn't fire underneath.
          e.stopPropagation();
          onDelete(entry.id);
        }}
        aria-label={`Remove "${entry.label}" from history`}
        className={cn(
          'absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-400 transition hover:bg-ink-100 hover:text-ink-900',
          'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
        )}
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </li>
  );
}
