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

// Wordmark renders in Instrument Serif (`font-display`) — Cycle 7 Move 2.
// The cycle-4 revert to `font-sans` over a "fifth serif home" concern was a
// misread of DESIGN.md §2.4: the four enumerated homes are *content* serif
// sites (ProductCard total, SummaryHero gist, SummaryProductList headers,
// CollageView hover). A wordmark is a LOGOTYPE — a brand mark, not body
// content — and the §2.4 amendment in Cycle 7 carves logotype out as a
// separate category. The serif masthead is the single biggest reason the
// app reads "magazine" instead of "app", per the 2026-05-14 elevation pass.
// No italic: italic is reserved for the SummaryHero gist. Mobile narrows
// to `text-xl` below the 380px breakpoint so the wordmark stays on one
// line in the 360px viewport without competing with the action row.
//
// §1.1 BRAND IDENTITY (2026-05-14) — the wordmark gained a *mark*. A
// custom-cut "T" sits LEFT of the wordmark, drawn from the Instrument
// Serif italic skeleton but with a deliberate identity alteration: the
// TOP-LEFT serif extends past the vertical stroke as a drawer-pull /
// tag-handle terminal, and the tip carries a tiny circular finial — the
// "trove" signature (a held thing, a thing you pull open, a clasp on a
// box of valuables). This is the MR PORTER full-stop equivalent: one
// piece of typographic punctuation that converts a styled string into
// a brand mark. The mark is rendered inline as an SVG (no asset file,
// no FOUT risk — it ships with the JS bundle) and is sized in `em` so
// it tracks the wordmark's responsive `text-xl` / `text-3xl` shift
// without a second media query. The mark is masthead-only — never in
// body content, never in the summary page hero, never as a favicon
// stand-in. See DESIGN.md §1.1 for the full identity rule.
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
    <header className="sticky top-0 z-20 border-b border-ink-100 bg-ink-50/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <div className="leading-tight">
          {/* Wordmark + identity mark — Instrument Serif (`font-display`),
              per Cycle 7 Move 2 / §2.4 logotype carve-out and §1.1 brand
              identity. The mark (inline SVG, `aria-hidden`) sits LEFT of
              the wordmark and is sized in `em` so it tracks the responsive
              `text-xl` ↔ `text-3xl` shift; `flex items-baseline` aligns the
              mark's optical baseline to the wordmark's. The mark is a
              custom-cut "T" with a drawer-pull terminal serif extending
              left past the vertical stroke, and a finial dot on the tip —
              the "trove" signature (held thing / clasp on a box). The
              <p> reads "Trove" as text so screen readers and search engines
              see the brand name (the mark is decorative chrome). */}
          <p
            aria-label="Trove"
            className="flex items-baseline gap-[0.18em] font-display text-xl tracking-tight leading-none whitespace-nowrap text-ink-900 min-[380px]:text-3xl"
          >
            {/* The identity mark. Geometry:
                - viewBox 24×32 (4:3 portrait, matches a tall serif T's
                  optical bounds at display size).
                - Vertical stroke from (11.4, 5) to (13.6, 27) — slight
                  italic skew via the x-delta, ~5° (Instrument Serif
                  italic angle).
                - Top serif: a horizontal bar from x=3 to x=20 at y=5,
                  asymmetric — the LEFT side extends 5 units past the
                  stem (the drawer-pull) and the right side extends ~4
                  (a traditional Didone top serif). The asymmetry is the
                  identity move.
                - Tiny circular finial at the LEFT tip of the top serif
                  (cx=3, cy=5, r=1) — the "clasp / pull / signature dot".
                - Bottom-of-stem serif: traditional but compact — a thin
                  horizontal bracket at y=27. Keeps the T grounded.
                The mark is filled in `currentColor` so it inherits the
                wordmark's `text-ink-900` (and any future theme shift)
                with zero JS plumbing. `1em` height makes it scale with
                the `<p>` font-size at the responsive breakpoint without
                a second media query. `relative -top-[0.08em]` is the
                optical lift — the serif T's visual center sits a touch
                below the wordmark cap line, so we nudge it up. */}
            <svg
              aria-hidden
              focusable="false"
              viewBox="0 0 24 32"
              height="1em"
              className="relative -top-[0.06em] inline-block w-auto shrink-0"
              style={{ fill: 'currentColor' }}
            >
              {/* Top serif — asymmetric, the LEFT extension is the
                  drawer-pull. Drawn as a single path so the join with
                  the finial circle and the stem read as one mark. */}
              <path d="M3 4.4 H20 V6.2 H3 Z" />
              {/* Finial — the "trove" signature dot on the LEFT tip. */}
              <circle cx="3" cy="5.3" r="1.15" />
              {/* Vertical stem — slight italic skew (top-x 11.4 →
                  bottom-x 13.2 across 22 units of height ≈ 4.7°,
                  matching Instrument Serif italic). Drawn as a
                  parallelogram path. */}
              <path d="M11.4 6.2 L13.0 6.2 L14.4 27 L12.8 27 Z" />
              {/* Bottom serif — compact, symmetric, traditional. */}
              <path d="M9 26.4 H17 V28.0 H9 Z" />
            </svg>
            <span>Trove</span>
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
              'inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs text-ink-900 shadow-soft transition hover:bg-ink-50',
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
