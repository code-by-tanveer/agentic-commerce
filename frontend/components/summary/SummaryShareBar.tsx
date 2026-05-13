'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, MessageCircle, Share2 } from 'lucide-react';
import { cn } from '@/lib/cn';

// Cycle 5 — SummaryShareBar.
//
// Client island on an otherwise server-rendered page. Sticky bottom on
// mobile, inline-centered on desktop (DESIGN.md §5). DESIGN.md §2.4: NO
// serif here — this is chrome, not voice.
//
// `navigator.share` is feature-detected at mount so SSR doesn't try to
// dereference it and the button only appears where it'll work.

interface Props {
  sessionId: string;
  gist: string;
}

export function SummaryShareBar({ sessionId, gist }: Props) {
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setShareUrl(`${window.location.origin}/s/${sessionId}`);
    setCanNativeShare(
      typeof navigator !== 'undefined' &&
        'share' in navigator &&
        typeof (navigator as Navigator & { share?: unknown }).share === 'function',
    );
  }, [sessionId]);

  async function onCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard denied — fall back to selecting the URL in an alert-y way.
      window.prompt('Copy this link:', shareUrl);
    }
  }

  async function onNativeShare() {
    if (!shareUrl) return;
    try {
      await navigator.share({
        title: 'A lookbook from Agentic Commerce',
        text: gist,
        url: shareUrl,
      });
    } catch {
      // User cancelled or denied; no-op.
    }
  }

  return (
    <div
      className={cn(
        'sticky bottom-0 z-20 w-full border-t border-ink-100 bg-ink-50/90 backdrop-blur',
        'px-4 py-3',
      )}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2">
        <a
          href={`/?session=${encodeURIComponent(sessionId)}`}
          // Cycle 6 — visible chip stays at py-2/px-3, but the `before:`
          // pseudo-element extends the touchable area to ≥44px (WCAG 2.5.5
          // Target Size AAA). The pad is purely interactive, no visual.
          className="relative inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs text-ink-600 transition hover:bg-ink-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50 before:absolute before:inset-[-10px] before:content-['']"
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden />
          Open in chat
        </a>
        <div className="flex items-center gap-2">
          {canNativeShare && (
            <button
              type="button"
              onClick={onNativeShare}
              aria-label="Share via your device"
              className="relative inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs text-ink-900 shadow-soft transition hover:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50 before:absolute before:inset-[-10px] before:content-['']"
            >
              <Share2 className="h-3.5 w-3.5 text-ink-400" aria-hidden />
              Share
            </button>
          )}
          <button
            type="button"
            onClick={onCopy}
            aria-label={copied ? 'Link copied' : 'Copy link'}
            className={cn(
              'relative inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50',
              "before:absolute before:inset-[-10px] before:content-['']",
              copied
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-ink-900 text-white hover:bg-ink-600',
            )}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden />
            )}
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      </div>
    </div>
  );
}
