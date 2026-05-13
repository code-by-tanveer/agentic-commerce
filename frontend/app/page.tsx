'use client';

import { Suspense } from 'react';
import { ConversationProvider } from '@/hooks/useConversation';
import { PreferencesProvider } from '@/hooks/usePreferences';
import { SessionProvider, useSession } from '@/hooks/useSession';
import { ShortlistProvider } from '@/hooks/useShortlist';
import { Header } from '@/components/chat/Header';
import { ConversationCanvas } from '@/components/chat/ConversationCanvas';
import { ImageDropzone } from '@/components/chat/ImageDropzone';
import { InputBar } from '@/components/chat/InputBar';
import { Shortlist } from '@/components/chat/Shortlist';
import { PreferencesCard } from '@/components/preferences/PreferencesCard';

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
            <main className="grain relative flex min-h-dvh flex-col bg-ink-50">
              {/* T1.17 — single page-level <h1> for screen readers. The visual
                  wordmark in <Header> is styled prose (a <p> for layout). */}
              <h1 className="sr-only">Agentic Commerce</h1>
              <Header />
              <div className="flex flex-1 flex-col">
                <ConversationCanvas />
              </div>
              {/* PreferencesCard — sticky above the InputBar on desktop
                  (sm+), collapsed one-line trigger on mobile. Both
                  variants live in the same component (DESIGN.md §4
                  PreferencesCard). 104px = ~InputBar height + breathing
                  room (Cycle 2 design review). */}
              <div className="sticky bottom-[104px] z-10 mx-auto w-full max-w-3xl px-4 pb-2">
                <PreferencesCard />
              </div>
              <InputBar />
              {/* Shortlist — positions itself as a 320px desktop rail or a
                  mobile bottom-sheet based on viewport (DESIGN.md §5). */}
              <Shortlist />
            </main>
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
