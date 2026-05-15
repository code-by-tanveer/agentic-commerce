'use client';

import { Suspense } from 'react';
import { ConversationProvider } from '@/hooks/useConversation';
import { PreferencesProvider } from '@/hooks/usePreferences';
import { SessionProvider, useSession } from '@/hooks/useSession';
import { ShortlistProvider } from '@/hooks/useShortlist';
import { ChatHistoryRail } from '@/components/chat/ChatHistoryRail';
import { CommandPalette } from '@/components/chat/CommandPalette';
import { Header } from '@/components/chat/Header';
import { ConversationCanvas } from '@/components/chat/ConversationCanvas';
import { ImageDropzone } from '@/components/chat/ImageDropzone';
import { InputBar } from '@/components/chat/InputBar';
import { Shortlist } from '@/components/chat/Shortlist';

// Provider stack:
//   SessionProvider     — resolves the sessionId once (was inlined here in
//                         Cycle 2; Cycle 3 collapses both Shortlist and
//                         Preferences onto one source).
//   ShortlistProvider   — hydrates the three-lane drawer + view-mode +
//                         saved outfits. Above ConversationProvider so the
//                         SSE loop can forward future events here without
//                         re-rendering the tree.
//   PreferencesProvider — Cycle 2; unchanged shape, but now reads sessionId
//                         from `useSession()` rather than a prop drilled
//                         from page state.
//   ConversationProvider — wraps the streaming/SSE pump.
export default function Page() {
  // T1.34 — `SessionProvider` calls `useSearchParams` (deep-link support).
  // Next.js 14 requires that read to be wrapped in a Suspense boundary so it
  // can render the empty-params fallback during prerender. The Suspense
  // wraps the whole provider tree because the id ripples through every
  // downstream provider.
  return (
    <Suspense fallback={null}>
      <SessionProvider>
        <ShortlistProvider>
        <PreferencesShell>
          <ConversationProvider>
            {/* ImageDropzone — sibling to <main> so it can listen at the
                document level for drag/drop anywhere on the page (DESIGN.md
                §4: paste-or-drop anywhere, idle invisible). Overlay renders
                full-viewport via fixed positioning when dragging starts. */}
            <ImageDropzone />
            {/* DESIGN §5 (2026-05-14) — chat-history moved from a header
                pill to a left rail. The rail is a flex sibling of the
                canvas column; on lg+ it's a fixed 260px panel, on tablet
                a 56px icon strip (expand to overlay), on phone it's
                hidden and the bottom-sheet trigger lives in <Header />.
                <main> remains the grain/min-h-dvh scaffold but now also
                owns `flex-1` so the canvas + InputBar take the remaining
                width to the right of the rail. */}
            {/* Cycle 10 (2026-05-15 night) — `bg-ink-50` removed from the
                outer flex wrapper. The body now paints the chromatic
                Liquid Dawn gradient (`globals.css :root --page-gradient`);
                a solid-color background here would block the gradient
                from showing through under the rail / canvas / InputBar.
                The `grain` utility (subtle dot texture overlay) stays —
                it adds a faint optical-grain to the entire shell that
                grounds the gradient against pure-CSS banding. */}
            <div className="grain flex min-h-dvh">
              {/* T1.17 — single page-level <h1> for screen readers. The visual
                  wordmark in <Header> is styled prose (a <p> for layout). */}
              <h1 className="sr-only">Trove</h1>
              <ChatHistoryRail />
              <main className="relative flex min-h-dvh flex-1 flex-col">
                <Header />
                <div className="flex flex-1 flex-col">
                  <ConversationCanvas />
                </div>
                {/* Cycle 5: the PreferencesCard no longer renders here.
                    User feedback ("About you feels in your face") moved the
                    surface behind a quiet avatar affordance in the Header
                    (`ProfileMenu`). The PreferencesProvider mounting above is
                    unchanged so the chip-editing state still hydrates on the
                    first SSE preference_update. */}
                <InputBar />
                {/* Shortlist — positions itself as a 320px desktop rail or a
                    mobile bottom-sheet based on viewport (DESIGN.md §5). */}
                <Shortlist />
              </main>
            </div>
            {/* CommandPalette — Cycle 11 (2026-05-15). Global ⌘K / Ctrl+K
                launcher; mounted outside the flex shell so its centered
                modal positions against the viewport, not the canvas. The
                palette is a Radix Dialog so it portals to <body> on open
                and traps focus inside the cmdk listbox. See DESIGN §2.16. */}
            <CommandPalette />
          </ConversationProvider>
        </PreferencesShell>
      </ShortlistProvider>
    </SessionProvider>
    </Suspense>
  );
}

// Tiny shell so `PreferencesProvider` gets the sessionId from the same
// SessionProvider every other hook now uses. Kept as a function component so
// `useSession()` runs inside the provider it depends on.
function PreferencesShell({ children }: { children: React.ReactNode }) {
  const { sessionId } = useSession();
  return <PreferencesProvider sessionId={sessionId}>{children}</PreferencesProvider>;
}
