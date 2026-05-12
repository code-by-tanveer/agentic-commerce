'use client';

import { useEffect, useState } from 'react';
import { ConversationProvider } from '@/hooks/useConversation';
import { PreferencesProvider } from '@/hooks/usePreferences';
import { getOrCreateSession } from '@/lib/api';
import { Header } from '@/components/chat/Header';
import { ConversationCanvas } from '@/components/chat/ConversationCanvas';
import { InputBar } from '@/components/chat/InputBar';
import { PreferencesCard } from '@/components/preferences/PreferencesCard';

// PreferencesProvider is mounted ABOVE ConversationProvider so that
// `useConversation`'s streaming loop can forward `preference_update` SSE
// events into it via `useOptionalPreferences`. We resolve the sessionId
// here (same helper ConversationProvider uses) so both share the id.
export default function Page() {
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getOrCreateSession()
      .then((s) => {
        if (!cancelled) setSessionId(s.id);
      })
      .catch(() => {
        // ignore — Preferences fetch will simply not fire until sessionId resolves.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PreferencesProvider sessionId={sessionId}>
      <ConversationProvider>
        <main className="grain relative flex min-h-dvh flex-col bg-ink-50">
          <Header />
          <div className="flex flex-1 flex-col">
            <ConversationCanvas />
          </div>
          {/* PreferencesCard — sticky above the InputBar on desktop (sm+),
              collapsed one-line trigger on mobile. Both variants live in the
              same component (DESIGN.md §4 PreferencesCard). */}
          {/* Sticks above the InputBar, whose measured height is ~94px (engineer
              estimate confirmed by Cycle 2 design review). 104px gives ~10px of
              breathing room without using a magic number that drifts. */}
          <div className="sticky bottom-[104px] z-10 mx-auto w-full max-w-3xl px-4 pb-2">
            <PreferencesCard />
          </div>
          <InputBar />
        </main>
      </ConversationProvider>
    </PreferencesProvider>
  );
}
