'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { MessageSquare, Plus, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import {
  useConversationActions,
  useConversationState,
} from '@/hooks/useConversation';
import {
  readSessionHistory,
  removeEntry,
  type SessionEntry,
  relativeTime,
} from '@/lib/sessionHistory';

// ---------------------------------------------------------------------------
// ChatHistoryMenu — Cycle 7 chat-history (PRODUCT §6 AC #1).
//
// A small pill trigger in the header that opens an anchored popover listing
// the user's last-5 chats (most-recently-used first). Mirrors the
// ProfileMenu pattern (portaled to <body>, framer-motion AnimatePresence,
// focus-trap, outside-click + Escape to close) but doesn't share its data
// model — we keep them as siblings rather than threading both through a
// generic popover hook, because the two surfaces have different content
// shapes (PreferencesCard vs. row-list) and a 30-line extract would have
// been bigger than the savings.
//
// Behaviour:
//   - Trigger label: a count chip ("3") matching the existing Shortlist
//     trigger's typography; collapses to icon-only at <380px (matches the
//     header's existing narrow-viewport rule).
//   - Rows: label + relative timestamp + hover-revealed delete X (the delete
//     drops the entry from the cookie ONLY — the DB row stays for the 90d
//     TTL, so a row reappearing on the next visit is not a bug).
//   - Click row → useConversationActions.switchSession(id). The currently
//     active row is highlighted (subtle bg-ink-50 + ring-1) and is
//     non-clickable (clicking it would no-op anyway, but the affordance
//     should match).
//   - Empty state: the user has only one session (the current one). Show
//     the explainer line, not the row.
//   - Privacy footer (DESIGN §2.11 + PRODUCT §6 Cycle 7): one-line ink-400
//     disclosure about cookie storage.
// ---------------------------------------------------------------------------

export function ChatHistoryMenu() {
  const { sessionId } = useConversationState();
  const { switchSession } = useConversationActions();
  const [open, setOpen] = useState(false);
  // Snapshot of the cookie list. We re-read on every open rather than
  // subscribing — cookies don't have a change event, and the menu is
  // intentionally lightweight. The re-read also catches the case where
  // another tab updated the cookie (concurrent-tab race; the most-recently
  // opened menu wins).
  const [entries, setEntries] = useState<SessionEntry[]>([]);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const dialogId = useId();

  const close = useCallback(() => setOpen(false), []);

  // Re-read the cookie list on every open. Cheap (one JSON.parse + slice)
  // and avoids stale state from another tab's writes.
  useEffect(() => {
    if (!open) return;
    setEntries(readSessionHistory());
  }, [open]);

  useFocusTrap(popoverRef, { enabled: open, onClose: close, initialFocus: 'first' });

  // Outside-click dismissal — matches ProfileMenu's `mousedown` semantics.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const popoverT = reduced
    ? { duration: 0.1 }
    : { duration: 0.18, ease: 'easeOut' as const };

  const handleDelete = useCallback((id: string) => {
    const next = removeEntry(id);
    setEntries(next);
  }, []);

  const handlePick = useCallback(
    async (id: string) => {
      if (id === sessionId) {
        setOpen(false);
        return;
      }
      setOpen(false);
      await switchSession(id);
    },
    [sessionId, switchSession],
  );

  // Other-session rows: drop the active session from the list rendered
  // below the header. The active one is always at the head of the cookie
  // list (the upsert on session_ready / send keeps it pinned), so this is
  // also the rule that hides the "click yourself" no-op row from the menu.
  const otherEntries = useMemo(
    () => entries.filter((e) => e.id !== sessionId),
    [entries, sessionId],
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label={
          otherEntries.length > 0
            ? `Open chat history (${otherEntries.length} prior ${
                otherEntries.length === 1 ? 'chat' : 'chats'
              })`
            : 'Open chat history'
        }
        // T1.30 / Header.tsx — matches the Shortlist trigger's pill shape so
        // the action row reads as one rhythm. DESIGN §5 (2026-05-14) — on
        // phone (≤640) this is the *only* way into chat history (the rail
        // sits at ≥641), so we keep it visible across all narrow widths.
        // The parent in Header.tsx gates the wrapper with `min-[641px]:hidden`
        // so the trigger only renders on phone.
        className={cn(
          'inline-flex items-center gap-2 rounded-full bg-card px-3 py-2 text-xs text-ink-900 shadow-soft transition hover:bg-ink-50',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50',
        )}
      >
        <MessageSquare className="h-3.5 w-3.5 text-ink-400" aria-hidden />
        <span className="hidden min-[480px]:inline">Chats</span>
        {otherEntries.length > 0 ? (
          <span
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ink-100 px-1 text-[11px] text-ink-900"
            aria-hidden
          >
            {otherEntries.length}
          </span>
        ) : null}
      </button>

      {/* Bug-repro fix (2026-05-14): the previous build wrapped the portal in
          <AnimatePresence>. AnimatePresence's child analysis traverses the
          ReactNode tree it receives, and a `createPortal(...)` return value is
          a ReactPortal — not a `motion.*` element. AnimatePresence saw a
          non-motion direct child and silently skipped the enter mount, so
          aria-expanded flipped to "true" but no [role=dialog] ever appeared
          in the body. ProfileMenu (the working reference) renders the portal
          unconditionally without AnimatePresence; we match that pattern. The
          motion.* elements inside still animate enter — exit animation is the
          only thing we lose, and it's worth the trade for reliable open. */}
      {open && typeof document !== 'undefined'
        ? createPortal(
            <HistoryPopover
              dialogId={dialogId}
              popoverRef={popoverRef}
              close={close}
              reduced={reduced}
              popoverT={popoverT}
              entries={entries}
              otherEntries={otherEntries}
              activeId={sessionId}
              onPick={handlePick}
              onDelete={handleDelete}
            />,
            document.body,
          )
        : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Popover — extracted so it can be portaled into <body>. The header carries
// backdrop-blur which would otherwise establish a containing block for
// `position: fixed` descendants (CSS §2: backdrop-filter creates a stacking
// + containing block); ProfileMenu hit the same trap (its inline doc).
// ---------------------------------------------------------------------------

function HistoryPopover({
  dialogId,
  popoverRef,
  close,
  reduced,
  popoverT,
  entries,
  otherEntries,
  activeId,
  onPick,
  onDelete,
}: {
  dialogId: string;
  popoverRef: React.MutableRefObject<HTMLDivElement | null>;
  close: () => void;
  reduced: boolean | null;
  popoverT: { duration: number; ease?: 'easeOut' };
  entries: SessionEntry[];
  otherEntries: SessionEntry[];
  activeId: string | null;
  onPick: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { createNewSession } = useConversationActions();
  const [creating, setCreating] = useState(false);
  const hasOthers = otherEntries.length > 0;
  async function onNewChat() {
    if (creating) return;
    setCreating(true);
    try {
      await createNewSession();
      close();
    } finally {
      setCreating(false);
    }
  }
  // The current session is part of the list visually so the user understands
  // which row they're "on". Pull it out for the active-row rendering above
  // the other rows.
  const active = activeId ? entries.find((e) => e.id === activeId) : null;

  return (
    <>
      {/* Mobile scrim — same treatment as ProfileMenu. */}
      <motion.div
        key="chat-history-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={popoverT}
        onClick={close}
        className="fixed inset-0 z-30 bg-ink-900/40 sm:hidden"
        aria-hidden
      />
      <motion.div
        key="chat-history-popover"
        ref={popoverRef}
        id={dialogId}
        role="dialog"
        aria-modal
        aria-labelledby="chat-history-title"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }}
        transition={popoverT}
        className={cn(
          'fixed z-40 rounded-2xl bg-card p-3 shadow-soft',
          'inset-x-2 bottom-2',
          'sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-16 sm:w-[20rem] sm:max-w-sm',
        )}
      >
        <div
          aria-hidden
          className="mx-auto mb-2 h-1 w-12 rounded-full bg-ink-100 sm:hidden"
        />
        <p
          id="chat-history-title"
          className="px-1 pb-2 text-[11px] uppercase tracking-wider text-ink-400"
        >
          Recent chats
        </p>

        {/* New-chat row — only meaningful affordance to mint a fresh session
            on phone (the desktop rail's top row owns this on ≥1025px; this
            mobile sheet is the parity surface). Disabled+spinner while the
            BE creates the row so the tap registers visually. */}
        <button
          type="button"
          onClick={onNewChat}
          disabled={creating}
          aria-busy={creating}
          aria-label="Start a new chat"
          className={cn(
            'mb-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
            creating
              ? 'bg-ink-900 text-white opacity-80'
              : 'bg-ink-900 text-white hover:bg-ink-600',
          )}
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
          <span>{creating ? 'Starting…' : 'New chat'}</span>
        </button>

        {hasOthers ? (
          <ul className="flex flex-col gap-0.5" role="list">
            {/* Active row — visible but non-actionable, so the user
                understands which one is "now". */}
            {active ? (
              <li className="px-1">
                <div
                  className="flex items-center gap-2 rounded-xl bg-ink-50 px-2 py-2"
                  aria-current="true"
                >
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-ink-900"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink-900">{active.label}</p>
                    <p className="text-[11px] text-ink-400">Current chat</p>
                  </div>
                </div>
              </li>
            ) : null}
            {otherEntries.map((e) => (
              <HistoryRow
                key={e.id}
                entry={e}
                onPick={onPick}
                onDelete={onDelete}
              />
            ))}
          </ul>
        ) : (
          // Empty state — matches the §2.11 quiet recovery surface treatment
          // (ink-50 bg, no card chrome). Single line, no CTA: the value
          // surfaces on its own once the user sends a second chat.
          <p className="px-2 py-3 text-xs leading-snug text-ink-600">
            Your chat history shows up here. Send a message to start one.
          </p>
        )}

        {/* Privacy footer — required by DESIGN §2.11 + PRODUCT §6 Cycle 7
            anti-goals (no accounts). The text-[11px] / text-ink-400 weight
            matches the existing "Edit your preferences" tertiary copy
            elsewhere; it reads as documentation, not as an action. */}
        <p className="mt-2 border-t border-ink-100 px-2 pt-2 text-[11px] text-ink-400">
          Stored on this device. Clearing cookies clears the list.
        </p>
      </motion.div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Row — the actionable list item. Two interactions stacked on the same row:
//   1. The whole row is the "switch to this chat" button.
//   2. A small X icon, visible on hover/focus, deletes the entry from the
//      cookie list (the DB row stays for 90d TTL).
//
// We model these as TWO buttons rather than a button-with-a-nested-button
// (invalid HTML, breaks screen readers). The outer is `<button>` for the
// switch; the X is an absolutely-positioned `<button>` with its own
// onClick + stopPropagation. The container is `relative` so the X anchors
// without affecting the row's flow. Tab order: row → X.
// ---------------------------------------------------------------------------

function HistoryRow({
  entry,
  onPick,
  onDelete,
}: {
  entry: SessionEntry;
  onPick: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => onPick(entry.id)}
        className={cn(
          'flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition hover:bg-ink-50',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate pr-7 text-sm text-ink-900">{entry.label}</p>
          <p className="text-[11px] text-ink-400">
            {relativeTime(entry.lastUsedAt)}
          </p>
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => {
          // Stop propagation so the row's onPick doesn't fire underneath
          // the delete. The row uses `onClick` (not pointerdown) so this is
          // synchronous and reliable.
          e.stopPropagation();
          onDelete(entry.id);
        }}
        aria-label={`Remove "${entry.label}" from history`}
        className={cn(
          'absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-400 transition hover:bg-ink-100 hover:text-ink-900',
          // Reveal on hover OR focus. The focus reveal is required for
          // keyboard users — the row is the primary affordance, but Tab
          // should still land on the delete.
          'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
        )}
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </li>
  );
}
