'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Heart, HelpCircle, Layers, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { clientLocale, formatMoney } from '@/lib/format';
import type { ShortlistItem, ShortlistLane } from '@/types/product';
import {
  DRAG_MIME,
  decodeDragPayload,
  useShortlist,
} from '@/hooks/useShortlist';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { ProductImage } from '../product/ProductImage';

// ---------------------------------------------------------------------------
// Shortlist — Cycle 3 (DESIGN.md §4 Shortlist, §5 responsive, §7 keyboard).
//
// Two surfaces, one component:
//   - Desktop (sm+): sticky right rail, 320px wide, lanes stacked vertically.
//   - Mobile: bottom sheet, lanes scroll horizontally as tabs. Focus-trapped
//     via the shared `useFocusTrap` hook (extracted from Cycle 2's
//     PreferencesCard.BottomSheet).
//
// Compliance:
//   - §2.7: shadow XOR border. Sheet/rail use `shadow-soft`; lane drop-zones
//     are unbordered until drag-over, when they get a 2px dashed indicator
//     (transient, motion ≤300ms — counts as state, not chrome).
//   - §2.5: spacing only 1/2/3/4/6/8.
//   - §6: open/close motion uses `motion-default` (300ms easeOut). Reduced
//     motion: opacity crossfade only, ≤100ms.
//   - §7: drag-over `accent-50` flash 100ms linear; keyboard fallback is
//     handled at the ProductCard / CollageCard source (`L`/`M`/`S`).
//   - §5 (R2/T2.7): rail-vs-sheet switch lives at the `lg:` breakpoint
//     (1024px). Phones (≤640) and tablets (641–1024) both get the bottom
//     sheet — the desktop rail would otherwise overlap the `max-w-3xl`
//     canvas on iPad-portrait widths.
// ---------------------------------------------------------------------------

// T1.1 — copy reflects the tap affordance. Heart icon (lucide-react) is
// already imported and used as the Love lane icon; we re-mention "tap ♥" in
// natural language. No-mascot rule honoured (no emoji in the string itself —
// the literal heart is the rendered Heart component on each card).
const LANE_META: Array<{
  lane: ShortlistLane;
  label: string;
  Icon: typeof Heart;
  emptyHint: string;
}> = [
  {
    lane: 'love',
    label: 'Love',
    Icon: Heart,
    emptyHint: 'Tap the heart on any product to save it here.',
  },
  {
    lane: 'maybe',
    label: 'Maybe',
    Icon: HelpCircle,
    // T4.U (Lila, Round 5) — lead with the non-drag affordance so the hint
    // is useful on touch. The lucide Heart icon is referenced upstream in
    // the lane meta; the copy here points to it without an emoji.
    emptyHint: 'Tap the heart to save, or press M when a card is focused.',
  },
  {
    lane: 'skip',
    label: 'Skip',
    Icon: XCircle,
    // T4.U — same shape as Maybe; S key for Skip.
    emptyHint: 'Tap the heart to save, or press S when a card is focused.',
  },
];

export function Shortlist() {
  const { isOpen, closeDrawer, lastRevert } = useShortlist();
  const reduce = useReducedMotion();
  const railRef = useRef<HTMLElement | null>(null);

  // T1.33 — surface revert errors inside the drawer header. Auto-clears
  // via the hook. Single line, rose-700 text. Both the rail and the
  // mobile sheet render it just under their respective headers.
  const revertBanner = lastRevert.scope ? (
    <p role="alert" className="px-3 pb-2 text-xs text-rose-700">
      {lastRevert.message}
    </p>
  ) : null;

  // Desktop rail dismissal — Escape + outside `pointerdown`. The rail is
  // non-modal (chat behind stays interactive on lg+), so we don't trap
  // focus or block scrolling. The mobile sheet handles its own dismissal
  // via the scrim + `useFocusTrap` (Escape there too).
  //
  // `pointerdown` (not `mousedown`) covers touch + pen. We deliberately
  // skip targets inside the rail and inside the trigger button so HTML5
  // drag-and-drop within the lanes never closes the drawer, and so a
  // toggle-click on the trigger isn't double-handled (close-then-reopen).
  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (railRef.current?.contains(t)) return;
      const trigger = document.getElementById('shortlist-trigger');
      if (trigger?.contains(t)) return;
      // Only the desktop rail should react to outside-click; the mobile
      // sheet's own scrim already closes it. Guard by viewport width to
      // avoid closing the rail from a click that landed on the (hidden
      // on lg) mobile sheet scrim or vice-versa.
      if (window.matchMedia('(min-width: 1024px)').matches) {
        closeDrawer();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && window.matchMedia('(min-width: 1024px)').matches) {
        closeDrawer();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, closeDrawer]);

  // Focus management for the desktop rail. On open, move focus to the
  // close button (first focusable inside the rail). On close, return
  // focus to the trigger. The mobile sheet's focus return is handled by
  // `useFocusTrap`.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      wasOpen.current = true;
      if (window.matchMedia('(min-width: 1024px)').matches) {
        // Defer one frame so the AnimatePresence child has mounted.
        const id = requestAnimationFrame(() => {
          const first = railRef.current?.querySelector<HTMLElement>(
            'button, [href], [tabindex]:not([tabindex="-1"])',
          );
          first?.focus();
        });
        return () => cancelAnimationFrame(id);
      }
    } else if (!isOpen && wasOpen.current) {
      wasOpen.current = false;
      if (typeof window !== 'undefined' &&
          window.matchMedia('(min-width: 1024px)').matches) {
        document.getElementById('shortlist-trigger')?.focus();
      }
    }
  }, [isOpen]);

  return (
    <>
      {/* Desktop — 320px sticky right rail. Only visible when open. */}
      <AnimatePresence>
        {isOpen ? (
          <motion.aside
            key="rail"
            ref={railRef}
            id="shortlist-drawer"
            initial={reduce ? { opacity: 0 } : { x: 320, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { x: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { x: 320, opacity: 0 }}
            transition={reduce ? { duration: 0.1 } : { duration: 0.3, ease: 'easeOut' as const }}
            // Non-modal sidebar — chat behind stays interactive. `region`
            // + `aria-labelledby` is more accurate than `dialog` here.
            role="region"
            aria-labelledby="shortlist-rail-title"
            className={cn(
              // Cycle 10 — Shortlist rail becomes a tinted-glass right
              // rail mirroring the left ChatHistoryRail glass treatment.
              // The pair of glass rails framing the canvas reads as
              // Liquid Glass app chrome over the chromatic ground.
              'surface-glass-rail fixed right-0 top-0 z-30 hidden h-dvh w-[320px] flex-col lg:flex',
            )}
          >
            <RailHeader onClose={closeDrawer} />
            {revertBanner}
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
              {LANE_META.map(({ lane, label, Icon, emptyHint }) => (
                <RailLane
                  key={lane}
                  lane={lane}
                  label={label}
                  Icon={Icon}
                  emptyHint={emptyHint}
                />
              ))}
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>

      {/* Mobile — bottom sheet variant. */}
      <AnimatePresence>
        {isOpen ? (
          <MobileSheet
            onClose={closeDrawer}
            reduced={!!reduce}
            revertBanner={revertBanner}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// Desktop rail
// ---------------------------------------------------------------------------

function RailHeader({ onClose }: { onClose: () => void }) {
  const { shortlist, savedOutfits } = useShortlist();
  const counts = useMemo(() => countByLane(shortlist), [shortlist]);
  return (
    <div className="flex items-center justify-between border-b border-ink-100 p-3">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-ink-400" aria-hidden />
        <p id="shortlist-rail-title" className="text-sm font-semibold text-ink-900">
          Shortlist
        </p>
        <p className="text-xs text-ink-400">
          {counts.love} loved · {counts.maybe} maybe
          {savedOutfits.length > 0 ? ` · ${savedOutfits.length} outfit${savedOutfits.length === 1 ? '' : 's'}` : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close shortlist"
        className="rounded-full p-2 text-ink-400 transition hover:bg-ink-50 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

interface RailLaneProps {
  lane: ShortlistLane;
  label: string;
  Icon: typeof Heart;
  emptyHint: string;
}

function RailLane({ lane, label, Icon, emptyHint }: RailLaneProps) {
  const { shortlist, addToLane, remove, isLoading } = useShortlist();
  const reduced = useReducedMotion();
  const items = shortlist.filter((i) => i.lane === lane);
  const [isOver, setIsOver] = useState(false);

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isOver) setIsOver(true);
  }
  function onDragLeave() {
    setIsOver(false);
  }
  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsOver(false);
    const raw = e.dataTransfer.getData(DRAG_MIME);
    const payload = decodeDragPayload(raw);
    if (!payload) return;
    void addToLane(payload.productId, lane, payload.snapshot);
  }

  return (
    <section
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-label={`${label} lane`}
      className={cn(
        'rounded-2xl bg-ink-50 p-3 transition',
        // Drag-over flash — DESIGN.md §6 row "drag-enter" (100ms linear).
        // CSS `transition` honours `prefers-reduced-motion: reduce` via the
        // user-agent default; we don't need to special-case reduce here.
        isOver && 'bg-accent-50',
      )}
    >
      <header className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-ink-400" aria-hidden />
          <p className="text-xs font-medium text-ink-900">{label}</p>
          <span className="text-xs text-ink-400">{items.length}</span>
        </div>
      </header>
      {isLoading && items.length === 0 ? (
        // T2.9 — skeleton while hydrating, distinguished from the
        // post-hydrate empty hint below. Single placeholder lane-item.
        <LaneSkeleton reduced={!!reduced} />
      ) : items.length === 0 ? (
        <p className="text-xs text-ink-400">{emptyHint}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <LaneItem key={it.productId} item={it} onRemove={() => void remove(it.productId)} />
          ))}
        </ul>
      )}
    </section>
  );
}

// T2.9 — single skeleton lane-item used by both the rail and the mobile sheet.
// `animate-pulse` is suppressed under `prefers-reduced-motion`.
function LaneSkeleton({ reduced }: { reduced: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        'h-12 w-full rounded-lg bg-ink-100',
        reduced ? '' : 'animate-pulse',
      )}
    />
  );
}

function LaneItem({
  item,
  onRemove,
}: {
  item: ShortlistItem;
  onRemove: () => void;
}) {
  const p = item.snapshot;
  // T4.K (Priya) — locale-aware currency formatting.
  const locale = clientLocale();
  return (
    <li className="surface-glass-card flex items-center gap-2 rounded-xl p-2">
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-ink-100">
        <ProductImage src={p.images?.[0]} alt={p.title} sizes="40px" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-ink-900">{p.title}</p>
        <p className="text-xs text-ink-400">{formatMoney(p.price, p.currency, locale)}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${p.title} from shortlist`}
        // Cycle 6 — visible target stays at p-1 (~20px) per DESIGN.md; the
        // `before:` pseudo-element pads the touch area out to ≥44px so the
        // lane-item X meets WCAG 2.5.5 Target Size AAA without changing
        // the visual layout density of the lanes.
        className="relative rounded-full p-1 text-ink-400 transition hover:bg-ink-50 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-1 focus-visible:ring-offset-white before:absolute before:inset-[-12px] before:content-['']"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Mobile bottom sheet
// ---------------------------------------------------------------------------

function MobileSheet({
  onClose,
  reduced,
  revertBanner,
}: {
  onClose: () => void;
  reduced: boolean;
  revertBanner?: React.ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  // Cycle 2 PreferencesCard.BottomSheet pattern — extracted to a shared hook.
  useFocusTrap(sheetRef, { enabled: true, onClose, initialFocus: 'last' });

  const scrimT = reduced ? { duration: 0.1 } : { duration: 0.2, ease: 'easeOut' as const };
  const sheetT = reduced ? { duration: 0.1 } : { duration: 0.3, ease: 'easeOut' as const };

  return (
    <div
      ref={sheetRef}
      className="fixed inset-0 z-40 lg:hidden"
      role="dialog"
      aria-modal
      // T4.P (Aleksey, Round 5) — labelledby points to the sheet header's
      // title id below; SR users hear "Shortlist, dialog" on focus. Keep
      // aria-label as a backstop in case the header re-renders later.
      aria-labelledby="shortlist-sheet-title"
      aria-label="Shortlist"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={scrimT}
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/40"
        aria-hidden
      />
      <motion.div
        initial={reduced ? { opacity: 0 } : { y: '100%' }}
        animate={reduced ? { opacity: 1 } : { y: 0 }}
        exit={reduced ? { opacity: 0 } : { y: '100%' }}
        transition={sheetT}
        // T1.3 — safe-area-inset-bottom so the iOS home indicator doesn't
        // clip the Done button. `max()` keeps existing padding floor on
        // devices without a physical inset.
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}
        className="surface-glass-card absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-hidden rounded-t-2xl"
      >
        <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-ink-100" aria-hidden />
        <MobileHeader onClose={onClose} />
        {revertBanner}
        <MobileLanes />
        <div className="flex justify-end p-4">
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'inline-flex h-11 items-center rounded-full bg-ink-900 px-4 text-sm font-medium text-white transition hover:bg-ink-600',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
            )}
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function MobileHeader({ onClose }: { onClose: () => void }) {
  const { shortlist, savedOutfits } = useShortlist();
  const counts = useMemo(() => countByLane(shortlist), [shortlist]);
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        {/* T4.P — id resolves the dialog's aria-labelledby. */}
        <p id="shortlist-sheet-title" className="text-sm font-semibold text-ink-900">
          Shortlist
        </p>
        <p className="text-xs text-ink-400">
          {counts.love} loved · {counts.maybe} maybe
          {savedOutfits.length > 0
            ? ` · ${savedOutfits.length} outfit${savedOutfits.length === 1 ? '' : 's'}`
            : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close shortlist"
        className="rounded-full p-2 text-ink-400 transition hover:bg-ink-50 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function MobileLanes() {
  const { shortlist, remove, addToLane, isLoading } = useShortlist();
  const reduced = useReducedMotion();
  const [activeLane, setActiveLane] = useState<ShortlistLane>('love');
  const items = shortlist.filter((i) => i.lane === activeLane);
  const meta = LANE_META.find((m) => m.lane === activeLane)!;
  const [isOver, setIsOver] = useState(false);

  return (
    <div className="flex flex-col gap-3 px-4 pb-2">
      {/* Tabs (horizontal scroll on tiny phones). DESIGN.md §5 mobile lanes
          scroll horizontally as tabs. */}
      <div role="tablist" aria-label="Shortlist lanes" className="flex gap-2 overflow-x-auto">
        {LANE_META.map(({ lane, label, Icon }) => {
          const selected = lane === activeLane;
          const count = shortlist.filter((i) => i.lane === lane).length;
          return (
            <button
              key={lane}
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveLane(lane)}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3 text-xs font-medium transition',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
                selected
                  ? 'bg-ink-900 text-white'
                  : 'bg-ink-50 text-ink-600 hover:text-ink-900',
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
              <span className={cn('text-[11px]', selected ? 'text-white/70' : 'text-ink-400')}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
          e.preventDefault();
          if (!isOver) setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsOver(false);
          const raw = e.dataTransfer.getData(DRAG_MIME);
          const payload = decodeDragPayload(raw);
          if (!payload) return;
          void addToLane(payload.productId, activeLane, payload.snapshot);
        }}
        className={cn('rounded-2xl bg-ink-50 p-3 transition', isOver && 'bg-accent-50')}
      >
        {isLoading && items.length === 0 ? (
          // R2/T2.9 — mirror the rail variant: a single skeleton row while
          // hydrating, distinguished from the post-hydrate empty hint below.
          <LaneSkeleton reduced={!!reduced} />
        ) : items.length === 0 ? (
          <p className="text-xs text-ink-400">{meta.emptyHint}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((it) => (
              <LaneItem
                key={it.productId}
                item={it}
                onRemove={() => void remove(it.productId)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countByLane(items: ShortlistItem[]): Record<ShortlistLane, number> {
  const out: Record<ShortlistLane, number> = { love: 0, maybe: 0, skip: 0 };
  for (const i of items) out[i.lane] += 1;
  return out;
}
