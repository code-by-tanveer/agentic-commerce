'use client';

import { useState } from 'react';
import { Check, Loader2, Share2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { createSummary } from '@/lib/api';

// Cycle 5 — Share session.
//
// On click: POST /api/session/:id/summary → backend snapshots the current
// shortlist + outfits into sessions.summary_blob (idempotent — re-clicking
// overwrites in place) → we copy the public URL to the clipboard and open
// /s/<id> in a new tab.
//
// DESIGN.md §2.4: NO serif on this button. The serif is reserved for the
// /s/<id> hero + section headers; chat surfaces stay sans-only.

interface Props {
  sessionId: string;
}

type Status = 'idle' | 'sharing' | 'shared' | 'error';

export function ShareButton({ sessionId }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (status === 'sharing') return;
    setStatus('sharing');
    setError(null);
    try {
      const { url } = await createSummary(sessionId);
      // Absolute URL for clipboard so the recipient sees a real link, not
      // a path. Fall back gracefully if window is somehow undefined.
      const absolute =
        typeof window !== 'undefined' ? `${window.location.origin}${url}` : url;
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(absolute);
        }
      } catch {
        // Clipboard is best-effort; the new tab open below still gives
        // the user a way to grab the URL.
      }
      if (typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      setStatus('shared');
      // Reset the label after a beat so the button stays useful.
      window.setTimeout(() => setStatus('idle'), 2000);
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'share failed');
      window.setTimeout(() => setStatus('idle'), 2500);
    }
  }

  const label =
    status === 'sharing'
      ? 'Sharing…'
      : status === 'shared'
        ? 'Link copied'
        : status === 'error'
          ? 'Try again'
          : 'Share';

  // T1.33 — inline rose-700 line right under the button when the share
  // round-trip fails. Auto-clears via the `setStatus('idle')` timeout
  // already in place; we render whenever `error` is set AND status is
  // 'error' (after which it flips to 'idle' and the line disappears).
  return (
    <div className="relative inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={status === 'sharing'}
        aria-label="Share this session as a public lookbook"
        title={error ?? undefined}
        className={cn(
          // Cycle 6 — snap to canonical §2.5 spacing (gap-2 / py-2); the
          // §2.5 lucide carve-out covers icon sizes only, not gap/padding.
          'inline-flex items-center gap-2 rounded-full bg-card px-3 py-2 text-xs text-ink-900 shadow-soft transition hover:bg-ink-50',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50',
          status === 'sharing' && 'opacity-70',
        )}
      >
        {status === 'sharing' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-400" aria-hidden />
        ) : status === 'shared' ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
        ) : (
          <Share2 className="h-3.5 w-3.5 text-ink-400" aria-hidden />
        )}
        <span>{label}</span>
      </button>
      {status === 'error' && error ? (
        <p role="alert" className="text-[11px] text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
