'use client';

import { ConversationProvider } from '@/hooks/useConversation';
import { PreferencesProvider } from '@/hooks/usePreferences';
import { SessionProvider, useSession } from '@/hooks/useSession';
import { ShortlistProvider } from '@/hooks/useShortlist';
import { Header } from '@/components/chat/Header';
import { ConversationCanvas } from '@/components/chat/ConversationCanvas';
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
  return (
    <SessionProvider>
      <ShortlistProvider>
        <PreferencesShell>
          <ConversationProvider>
            <main className="grain relative flex min-h-dvh flex-col bg-ink-50">
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
  );
}

// Tiny shell so `PreferencesProvider` gets the sessionId from the same
// SessionProvider every other hook now uses. Kept as a function component so
// `useSession()` runs inside the provider it depends on.
function PreferencesShell({ children }: { children: React.ReactNode }) {
  const { sessionId } = useSession();
  return <PreferencesProvider sessionId={sessionId}>{children}</PreferencesProvider>;
}
