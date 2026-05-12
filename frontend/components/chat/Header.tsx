'use client';

import { Sparkles, RotateCcw } from 'lucide-react';
import { useConversation } from '@/hooks/useConversation';

export function Header() {
  const { reset, messages } = useConversation();
  const hasHistory = messages.length > 1;

  return (
    <header className="sticky top-0 z-20 border-b border-ink-100 bg-ink-50/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-ink-900 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-ink-900">Agentic Commerce</p>
            <p className="text-[11px] text-ink-400">Conversational product discovery</p>
          </div>
        </div>
        {hasHistory && (
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-ink-600 transition hover:bg-ink-100"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            New chat
          </button>
        )}
      </div>
    </header>
  );
}
