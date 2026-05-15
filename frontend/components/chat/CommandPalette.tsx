'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Command } from 'cmdk';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Layers,
  LayoutGrid,
  List,
  MessageSquarePlus,
  Search,
  Share2,
  Sparkles,
  User,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  useConversationActions,
  useConversationState,
} from '@/hooks/useConversation';
import { useShortlist } from '@/hooks/useShortlist';
import {
  readSessionHistory,
  type SessionEntry,
} from '@/lib/sessionHistory';

// ---------------------------------------------------------------------------
// CommandPalette — Cycle 11 (2026-05-15 Radix migration sibling).
//
// User asked for "key shortcuts for pc". The right move is the ⌘K /
// Ctrl+K launcher that has become standard chrome on every prosumer
// SaaS surface in the last two years (Linear, Vercel, GitHub, Notion,
// Raycast). Built with `cmdk` (Pacocoursey's primitive, already an
// indirect dep of `@radix-ui/react-dialog`); zero design system import
// — we paint the surface ourselves to keep the Liquid Dawn glass family
// consistent.
//
// Behaviour:
//   - ⌘K (Mac) / Ctrl+K (Win/Linux) toggles the palette. ESC closes.
//     Arrow keys navigate, Enter selects.
//   - Search filters the action list. cmdk handles fuzzy matching by
//     default; we feed it labeled items.
//   - Static actions: New chat, Open shortlist, Profile/About you,
//     Toggle view list/collage, Search the catalog (focus input),
//     Share this session (when available).
//   - Dynamic actions: switch to one of the recent chats from cookie
//     history.
//
// Surface: centered modal with the same `.surface-glass-card` tier as
// the rest of the app. Backdrop is `backdrop-blur` on the Dialog
// Overlay so the gradient behind reads softer when the palette is
// open. Mounted globally inside `app/page.tsx` so the keyboard
// shortcut is live across all routes.
// ---------------------------------------------------------------------------

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState<SessionEntry[]>([]);

  const { sessionId, isStreaming } = useConversationState();
  const { createNewSession, switchSession } = useConversationActions();
  const { isOpen: shortlistOpen, toggleDrawer, viewMode, setViewMode, shortlist } =
    useShortlist();

  // ⌘K / Ctrl+K global toggle. We listen on `keydown` at the document
  // level (not on the textarea) so the shortcut fires regardless of
  // where focus is. `metaKey` (Mac) and `ctrlKey` (Windows/Linux) are
  // both accepted — matches the pattern Linear / Vercel / GitHub use.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isToggle =
        (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');
      if (!isToggle) return;
      e.preventDefault();
      setOpen((o) => !o);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Re-read the cookie list each time the palette opens. Cheap; same
  // pattern the ChatHistoryMenu uses.
  useEffect(() => {
    if (!open) return;
    setEntries(readSessionHistory());
    // Reset the search box on each open so the user starts fresh.
    setSearch('');
  }, [open]);

  // Other-session entries — drop the current session from the list so
  // the palette doesn't show "Switch to <this chat>" as an option.
  const otherEntries = useMemo(
    () => entries.filter((e) => e.id !== sessionId),
    [entries, sessionId],
  );

  const canShare = shortlist.some((i) => i.lane === 'love' || i.lane === 'maybe') && !!sessionId;

  // Action dispatchers — each one closes the palette and then runs.
  // We defer the action with `requestAnimationFrame` so Radix's focus
  // return on close runs before the action triggers any focus shifts
  // of its own (the InputBar focus action, for instance).
  const run = useCallback((fn: () => void | Promise<void>) => {
    setOpen(false);
    requestAnimationFrame(() => {
      void fn();
    });
  }, []);

  const onNewChat = () => run(() => createNewSession());
  const onOpenShortlist = () =>
    run(() => {
      if (!shortlistOpen) toggleDrawer();
    });
  const onOpenProfile = () =>
    run(() => {
      // Use the existing CustomEvent so the avatar trigger stays the
      // single owner of the popover open state.
      window.dispatchEvent(new CustomEvent('open-profile-menu'));
    });
  const onFocusInput = () =>
    run(() => {
      const el = document.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Message"]',
      );
      el?.focus();
    });
  const onToggleView = () =>
    run(() => setViewMode(viewMode === 'list' ? 'collage' : 'list'));
  const onShare = () =>
    run(() => {
      if (!canShare) return;
      // Same path the header's ShareButton runs — find it in the DOM
      // and click it. The button owns the network round-trip + clipboard.
      const btn = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Share this session as a public lookbook"]',
      );
      btn?.click();
    });
  const onSwitchTo = (id: string) => run(() => switchSession(id));

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay
          // backdrop-blur on the scrim softens the gradient behind the
          // palette so the glass card reads cleanly against a hazier
          // ground. `bg-ink-900/30` is the same scrim weight the mobile
          // sheets use; the blur lifts it from "dark veil" to "out of
          // focus".
          className="fixed inset-0 z-50 bg-ink-900/30 backdrop-blur-sm"
        />
        <Dialog.Content
          aria-label="Command palette"
          // Centered modal. `top-[20vh]` puts the panel a little above
          // dead center so it reads as the command surface (above the
          // fold for laptop screens) without sitting on the InputBar.
          className={cn(
            'surface-glass-card fixed left-1/2 top-[18vh] z-50 -translate-x-1/2 rounded-2xl outline-none',
            'w-[min(640px,calc(100vw-2rem))] p-2',
          )}
          // Radix Dialog by default sets `aria-modal` and traps focus.
          // The `<Command>` root is the cmdk listbox; its own keydown
          // handler swallows Arrow/Enter and forwards Escape.
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Dialog.Description className="sr-only">
            Type to filter actions. Use arrow keys to navigate, Enter to
            select, Escape to close.
          </Dialog.Description>
          <Command
            label="Command palette"
            shouldFilter
            // cmdk pre-filters on item text + value; we set `value` to a
            // canonical phrase per item below so the fuzzy match scores
            // well on natural typed strings.
            className="flex flex-col"
            // Forward ESC to Radix so the palette closes through the
            // Dialog's onOpenChange (which also handles focus return to
            // whatever element opened it).
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
            }}
          >
            <div className="flex items-center gap-2 border-b border-ink-100 px-3 py-2">
              <Search className="h-4 w-4 text-ink-400" aria-hidden />
              <Command.Input
                placeholder="Type a command or search…"
                value={search}
                onValueChange={setSearch}
                className="w-full bg-transparent text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
                autoFocus
              />
              <kbd className="hidden rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 text-[10px] font-medium text-ink-600 sm:inline">
                ESC
              </kbd>
            </div>
            <Command.List className="max-h-[50vh] overflow-y-auto p-1">
              <Command.Empty className="px-3 py-6 text-center text-xs text-ink-400">
                No matches.
              </Command.Empty>

              <Command.Group heading="Actions" className="text-ink-400 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider">
                <PaletteItem
                  value="new chat start fresh"
                  icon={<MessageSquarePlus className="h-4 w-4" aria-hidden />}
                  label="New chat"
                  hint="Start a fresh session"
                  onSelect={onNewChat}
                  disabled={isStreaming}
                />
                <PaletteItem
                  value="open shortlist drawer lanes"
                  icon={<Layers className="h-4 w-4" aria-hidden />}
                  label="Open shortlist"
                  hint={`${shortlist.length} item${shortlist.length === 1 ? '' : 's'}`}
                  onSelect={onOpenShortlist}
                />
                <PaletteItem
                  value="profile about you preferences"
                  icon={<User className="h-4 w-4" aria-hidden />}
                  label="Profile / About you"
                  hint="Size, budget, preferences"
                  onSelect={onOpenProfile}
                />
                <PaletteItem
                  value="search catalog focus input compose"
                  icon={<Search className="h-4 w-4" aria-hidden />}
                  label="Search the catalog"
                  hint="Focus the compose bar"
                  onSelect={onFocusInput}
                />
                <PaletteItem
                  value={`toggle view ${viewMode === 'list' ? 'collage' : 'list'}`}
                  icon={
                    viewMode === 'list' ? (
                      <LayoutGrid className="h-4 w-4" aria-hidden />
                    ) : (
                      <List className="h-4 w-4" aria-hidden />
                    )
                  }
                  label={`Switch to ${viewMode === 'list' ? 'collage' : 'list'} view`}
                  hint="Toggle layout"
                  onSelect={onToggleView}
                />
                {canShare ? (
                  <PaletteItem
                    value="share session lookbook link"
                    icon={<Share2 className="h-4 w-4" aria-hidden />}
                    label="Share this session"
                    hint="Copy a public lookbook link"
                    onSelect={onShare}
                  />
                ) : null}
              </Command.Group>

              {otherEntries.length > 0 ? (
                <Command.Group
                  heading="Switch to chat"
                  className="text-ink-400 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                >
                  {otherEntries.slice(0, 8).map((e) => (
                    <PaletteItem
                      key={e.id}
                      value={`switch to chat ${e.label}`}
                      icon={<Sparkles className="h-4 w-4" aria-hidden />}
                      label={e.label}
                      hint="Switch chat"
                      onSelect={() => onSwitchTo(e.id)}
                    />
                  ))}
                </Command.Group>
              ) : null}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// One palette row. Renders as a cmdk Item with our glass-family
// hover/selected treatment. cmdk drives `data-selected="true"` based
// on keyboard navigation, so we style off that attribute.
function PaletteItem({
  value,
  icon,
  label,
  hint,
  onSelect,
  disabled,
}: {
  value: string;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      disabled={disabled}
      className={cn(
        'flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-900 outline-none transition',
        'data-[selected=true]:bg-ink-100/80 data-[selected=true]:text-ink-900',
        'data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50',
      )}
    >
      <span className="text-ink-600">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {hint ? (
        <span className="text-[11px] text-ink-400">{hint}</span>
      ) : null}
    </Command.Item>
  );
}
