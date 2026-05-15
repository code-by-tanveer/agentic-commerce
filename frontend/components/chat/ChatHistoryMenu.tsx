'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { MessageSquare, Plus, X } from 'lucide-react';
import { cn } from '@/lib/cn';
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
// 2026-05-15 Radix migration. The previous build (`createPortal` + a
// `useFocusTrap` hook + hand-rolled `mousedown` outside-click + Escape +
// AnimatePresence wrapping the portal — which silently broke open
// animations and required the in-line bug-repro comment) is replaced
// with `@radix-ui/react-popover`. Visual treatment of the trigger pill
// and the popover body is unchanged. See DESIGN §2.16 (Radix decision).
//
// Surface: a small pill trigger in the phone-only header slot
// (`min-[641px]:hidden` wrapper in Header.tsx) that opens an anchored
// popover (Radix renders it as a `role="dialog"`) listing the user's
// last-5 chats. The rail covers ≥641 widths.
// ---------------------------------------------------------------------------

export function ChatHistoryMenu() {
  const { sessionId } = useConversationState();
  const { switchSession, createNewSession } = useConversationActions();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<SessionEntry[]>([]);
  const [creating, setCreating] = useState(false);

  // Re-read the cookie list every time the popover opens. Cheap
  // (one JSON.parse + slice) and avoids stale state from another tab's
  // writes. Cookies don't fire change events so we don't subscribe.
  useEffect(() => {
    if (!open) return;
    setEntries(readSessionHistory());
  }, [open]);

  const handleDelete = useCallback((id: string) => {
    const next = removeEntry(id);
    setEntries(next);
  }, []);

  const handlePick = useCallback(
    async (id: string) => {
      setOpen(false);
      if (id === sessionId) return;
      await switchSession(id);
    },
    [sessionId, switchSession],
  );

  async function onNewChat() {
    if (creating) return;
    setCreating(true);
    try {
      await createNewSession();
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }

  // Other-session rows: drop the active session from the list rendered
  // below the header. The active one is always at the head of the cookie
  // list (the upsert on session_ready / send keeps it pinned).
  const otherEntries = useMemo(
    () => entries.filter((e) => e.id !== sessionId),
    [entries, sessionId],
  );
  const active = sessionId ? entries.find((e) => e.id === sessionId) : null;
  const hasOthers = otherEntries.length > 0;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={
            otherEntries.length > 0
              ? `Open chat history (${otherEntries.length} prior ${
                  otherEntries.length === 1 ? 'chat' : 'chats'
                })`
              : 'Open chat history'
          }
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
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          aria-labelledby="chat-history-title"
          // Aliased SR name kept so the existing e2e (`getByRole('dialog',
          // { name: /recent chats/i })`) continues to match the popover.
          aria-label="Recent chats"
          side="bottom"
          align="end"
          sideOffset={12}
          collisionPadding={8}
          className={cn(
            'surface-glass-card z-40 rounded-2xl p-3 outline-none',
            'w-[calc(100vw-1rem)] max-w-sm',
            'sm:w-[20rem]',
          )}
        >
          <p
            id="chat-history-title"
            className="px-1 pb-2 text-[11px] uppercase tracking-wider text-ink-400"
          >
            Recent chats
          </p>

          {/* New-chat row — primary affordance on phone (the desktop rail's
              top row owns this on ≥1025px). Disabled+spinner while the BE
              creates the row so the tap registers visually. */}
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
                  onPick={handlePick}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          ) : (
            <p className="px-2 py-3 text-xs leading-snug text-ink-600">
              Your chat history shows up here. Send a message to start one.
            </p>
          )}

          {/* Privacy footer — DESIGN §2.11 + PRODUCT §6 Cycle 7. */}
          <p className="mt-2 border-t border-ink-100 px-2 pt-2 text-[11px] text-ink-400">
            Stored on this device. Clearing cookies clears the list.
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ---------------------------------------------------------------------------
// Row — the actionable list item. Two interactions stacked on the same row:
//   1. The whole row is the "switch to this chat" button.
//   2. A small X icon, visible on hover/focus, deletes the entry from the
//      cookie list (the DB row stays for 90d TTL).
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
          e.stopPropagation();
          onDelete(entry.id);
        }}
        aria-label={`Remove "${entry.label}" from history`}
        className={cn(
          'absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-400 transition hover:bg-ink-100 hover:text-ink-900',
          'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
        )}
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </li>
  );
}
