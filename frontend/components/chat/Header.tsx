'use client';

import { useMemo } from 'react';
import { Layers } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useSession } from '@/hooks/useSession';
import { useShortlist } from '@/hooks/useShortlist';
import { ProfileMenu } from '@/components/preferences/ProfileMenu';
import { ChatHistoryMenu } from './ChatHistoryMenu';
import { ShareButton } from './ShareButton';
import { ViewToggle } from './ViewToggle';

// Wordmark renders in Instrument Serif (`font-display`) — upright, no
// italic, no custom glyph. The single signature is a trailing middle-dot
// (`·` / U+00B7), sized at ~0.85em and rendered in `text-ink-400` so it
// reads as deliberate punctuation rather than a stray full-stop. The MR
// PORTER move adapted: a single piece of typographic punctuation converts
// the styled string into a brand mark.
//
// History notes (so the next engineer doesn't re-litigate this):
//   - Cycle 7 (2026-05-14) shipped a custom-cut "T" mark left of the
//     wordmark (drawer-pull serif + finial dot). User rejected same-day:
//     "trove T sign looks straight bad". The SVG was removed.
//   - Cycle 7 also italicised the wordmark. The italic is also dropped:
//     italic is *content voice* (reserved for the SummaryHero gist), not
//     brand voice.
//   - Cycle 9 (2026-05-15) — research direction "warm slate + ember"
//     approved. The middle-dot suffix is the brand mark; no SVG, no
//     custom glyph. See DESIGN.md §1.1 and the research file
//     `docs/research/2026-05-14-modern-color-glass.md`.
//
// The wordmark is a logotype (§2.4 carve-out) — it doesn't count against
// the four content-serif homes. Mobile narrows to `text-xl` below 380px
// so the wordmark stays on one line in the 360px viewport without
// competing with the action row.
//
// CHROME — Cycle 10 (2026-05-15 night). Header surface is now
// `.surface-glass-header` — the strongest glass tier (40px blur, 1.6
// saturate, ~42% white tint, white inner border at 45%). The chromatic
// page gradient (`globals.css :root --page-gradient`: indigo → fuchsia →
// coral) gives the blur something rich to refract; the header reads as a
// hazier, lighter strip across the top of the saturated ground. The
// Liquid Dawn composition uses glass on three surfaces (header, rail,
// InputBar) over the gradient — see DESIGN.md §2.15. Cards are tinted
// glass too (`.surface-glass-card`), so the contrast is glass-tier
// (header, strongest) vs glass-surface (cards, mid) vs glass-chrome
// (rail/input, lightest). Apple's "no glass-on-glass" rule survives — the
// surfaces never stack vertically on each other.
export function Header() {
  const { sessionId } = useSession();
  const { shortlist, isOpen: shortlistOpen, toggleDrawer } = useShortlist();

  // Header trigger badge = Love + Maybe (Skip not counted — DESIGN.md §4
  // Shortlist + Cycle 3 brief).
  const badge = useMemo(
    () => shortlist.filter((i) => i.lane === 'love' || i.lane === 'maybe').length,
    [shortlist],
  );

  // Cycle 5: surface the share button only once there's at least one Love
  // or Maybe item to share — keeps the chrome quiet on a fresh session.
  const canShare = badge > 0 && !!sessionId;

  return (
    <header className="surface-glass-header sticky top-0 z-20">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <div className="leading-tight">
          {/* Wordmark — upright Instrument Serif (`font-display`), no
              italic, no custom mark. The `·` middle-dot suffix (U+00B7)
              is the brand signature — rendered in `text-ink-400` at ~0.85em
              so it reads as deliberate punctuation. `aria-label="Trove"`
              keeps assistive tech on the brand name; the dot is
              `aria-hidden`. See DESIGN.md §1.1. */}
          <p
            aria-label="Trove"
            className="font-display text-xl tracking-tight leading-none whitespace-nowrap text-ink-900 min-[380px]:text-3xl"
          >
            Trove<span className="text-ink-400" aria-hidden>·</span>
          </p>
        </div>

        {/* Action row — DESIGN §5 (2026-05-14): chat-history left the
            header on desktop/tablet. The trailing chrome is now (in order)
            ViewToggle, optional Share, mobile-only chat-history trigger,
            Shortlist trigger, ProfileMenu. `gap-1` at narrow widths keeps
            the row inside a 360px viewport (R2/T2.x narrow-phone fix). */}
        <div className="flex items-center gap-1 min-[380px]:gap-2">
          <ViewToggle />
          {canShare && sessionId && <ShareButton sessionId={sessionId} />}
          {/* DESIGN §5 — phone-only bottom-sheet trigger. `min-[641px]:hidden`
              keeps the pill only on ≤640px (the spec's phone tier). The
              rail's tablet icon strip covers 641–1024 and the desktop rail
              covers >1024. ChatHistoryMenu's existing popover positioning
              at the ≤sm breakpoint renders it as a bottom-sheet, which is
              the surface DESIGN §5 calls for on phone. */}
          <div className="min-[641px]:hidden">
            <ChatHistoryMenu />
          </div>
          <button
            type="button"
            // Stable id so the drawer's outside-click detector can exclude
            // the trigger (avoids "close then immediately re-open" on tap).
            id="shortlist-trigger"
            onClick={toggleDrawer}
            aria-haspopup="dialog"
            aria-expanded={shortlistOpen}
            aria-controls="shortlist-drawer"
            aria-label={
              shortlistOpen
                ? `Close shortlist (${badge} loved or maybe)`
                : `Open shortlist (${badge} loved or maybe)`
            }
            className={cn(
              // T1.30 — gap-2 / py-2 / px-3 (no decimal spacing).
              // T1.2 — sub-380px the label is hidden so the icon + badge are
              // all that survive; the aria-label still carries the count for
              // screen readers.
              'inline-flex items-center gap-2 rounded-full bg-card px-3 py-2 text-xs text-ink-900 shadow-soft transition hover:bg-ink-50',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50',
            )}
          >
            <Layers className="h-3.5 w-3.5 text-ink-400" aria-hidden />
            <span className="hidden min-[380px]:inline">Shortlist</span>
            <span
              className={cn(
                'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px]',
                badge > 0 ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-400',
              )}
              aria-hidden
            >
              {badge}
            </span>
          </button>
          {/* DESIGN §5 (2026-05-14) — the desktop "New chat" button moved
              to the top of <ChatHistoryRail />. The phone surface relies
              on the bottom-sheet's row list (a user tapping the most-recent
              row reuses that session; a brand-new session is one tap on
              the rail's New-chat affordance once we expose it in the
              bottom-sheet — out of scope for this migration; the existing
              ChatHistoryMenu has not yet been extended to include a
              top New-chat row). */}
          {/* ProfileMenu — Cycle 5. Replaces the always-on PreferencesCard
              above the InputBar (read as intrusive). Quiet 36px avatar that
              opens an anchored popover with the same chip-editing card. Dot
              badge appears when ≥1 preference is saved. */}
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
