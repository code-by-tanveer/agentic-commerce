'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getOrCreateSession } from '@/lib/api';

// ---------------------------------------------------------------------------
// useSession — Cycle 3.
//
// Wraps `getOrCreateSession()` so the id-resolution lives in exactly one
// place. Cycles 1–2 inlined the resolution in both `page.tsx` and
// `useConversation`, which meant Cycle 3's `ShortlistProvider` and
// `ViewToggle` would have been the third place. We collapse them all into a
// single provider mounted at the layout level.
//
// `useConversation` keeps its own internal resolution for now (tests mount
// `<ConversationProvider>` without a `<SessionProvider>`); the hook in
// `useConversation` is benign because `getOrCreateSession()` short-circuits
// to the cached id on subsequent calls.
// ---------------------------------------------------------------------------

interface SessionContextValue {
  sessionId: string | null;
  isLoading: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void getOrCreateSession()
      .then((s) => {
        if (cancelled) return;
        setSessionId(s.id);
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Non-fatal — downstream providers gracefully no-op without a
        // sessionId. The user can still chat (the backend will mint one
        // from the cookie on the first request).
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ sessionId, isLoading }),
    [sessionId, isLoading],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used inside <SessionProvider>');
  }
  return ctx;
}
