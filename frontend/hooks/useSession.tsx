'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'next/navigation';
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
//
// T1.34 — deep-link `?session=<id>` from the /s/[id] page "Open in chat"
// link. When the URL carries a `session` query param we PREFER it over the
// stored cookie/local id on first mount. This is what makes the lookbook's
// "Open in chat" hop actually land on the conversation that built the
// shortlist. Subsequent mounts (without the param) fall back to the local
// stored id as before — we don't pollute the user's main session.
// ---------------------------------------------------------------------------

interface SessionContextValue {
  sessionId: string | null;
  isLoading: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const searchParams = useSearchParams();

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    // T1.34 — `?session=<id>` deep-link wins over the cookie-stored id. The
    // /s/[id] page's "Open in chat" affordance lands here; we hand the id
    // straight to consumers (Conversation / Shortlist / Preferences) so the
    // landing chat is the one that built the lookbook. If absent, fall
    // through to `getOrCreateSession()` which honours the local mirror.
    const deepLinkId = searchParams?.get('session');
    if (deepLinkId) {
      setSessionId(deepLinkId);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }
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
    // Resolve once on mount; deep-link reads use the initial URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
