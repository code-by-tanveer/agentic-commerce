'use client';

import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Heart, HelpCircle, Layers, X, XCircle } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { clientLocale, formatMoney } from '@/lib/format';
import type { ShortlistItem, ShortlistLane } from '@/types/product';
import {
  DRAG_MIME,
  decodeDragPayload,
  useShortlist,
} from '@/hooks/useShortlist';
import { ProductImage } from '../product/ProductImage';

// ---------------------------------------------------------------------------
// Shortlist — Cycle 3 (DESIGN.md §4 Shortlist, §5 responsive, §7 keyboard).
// 2026-05-15 Radix migration. The desktop rail's hand-rolled `pointerdown`
// outside-click + Escape + focus-handoff, and the mobile sheet's
// `useFocusTrap` import + scrim + animation orchestration, both collapse
// onto `@radix-ui/react-dialog` with `modal` flipped per viewport:
//
//   - Desktop rail: `modal={false}`. The rail is non-modal so the chat
//     behind stays interactive. Radix handles outside-click via
//     `PointerDownOutside`, Escape via `EscapeKeyDown`, and focus return
//     to the trigger on close.
//   - Mobile sheet: `modal={true}`. Radix renders an `Overlay` (scrim),
//     traps focus inside the sheet, and locks scroll on body. We don't
//     need a `useFocusTrap` import anymore.
//
// Two surfaces, one component, both viewport-gated via Tailwind classes
// on the Content elements. The same `isOpen` state from `useShortlist()`
// controls both — Radix mounts whichever Content is visible at the
// current breakpoint. See DESIGN §2.16 (Radix decision).
// ---------------------------------------------------------------------------

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
    emptyHint: 'Tap the heart to save, or press M when a card is focused.',
  },
  {
    lane: 'skip',
    label: 'Skip',
    Icon: XCircle,
    emptyHint: 'Tap the heart to save, or press S when a card is focused.',
  },
];

export function Shortlist() {
  const { isOpen, closeDrawer, lastRevert } = useShortlist();
  // Mobile bookkeeping — switch the modal flag on viewport. Radix needs
  // `modal` set at mount; we read the media query once on each open.
  // (Re-renders cheap; the resize→reopen edge case is academic — users
  // don't rotate phones mid-shortlist-edit.)
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 1023px)');
    function onChange() {
      setIsMobile(mq.matches);
    }
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Surface revert errors inside the drawer header. Both surfaces render it.
  const revertBanner = lastRevert.scope ? (
    <p role="alert" className="px-3 pb-2 text-xs text-rose-700">
      {lastRevert.message}
    </p>
  ) : null;

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(o) => {
        if (!o) closeDrawer();
      }}
      // Desktop rail (lg+) is non-modal so the chat stays interactive.
      // Mobile (≤lg-1) is modal — the bottom-sheet treatment plus scrim.
      modal={isMobile}
    >
      <Dialog.Portal>
        {isMobile ? (
          // Mobile: scrim + bottom sheet. Radix Overlay handles fade.
          <Dialog.Overlay
            className="fixed inset-0 z-40 bg-ink-900/40 lg:hidden"
          />
        ) : null}
        {/* Desktop rail — only mounted at lg+. Hidden via the Tailwind
            class so the same Dialog.Content slot can be re-keyed by the
            viewport without unmount/remount churn. We deliberately
            forward Escape: Radix-handled. */}
        <Dialog.Content
          id="shortlist-drawer"
          aria-labelledby="shortlist-rail-title"
          // `onInteractOutside` is allowed to bubble — Radix closes on
          // outside click for the desktop non-modal rail; on mobile the
          // overlay covers everything so this path doesn't fire.
          onInteractOutside={(e) => {
            // The header trigger uses `id="shortlist-trigger"`; the
            // outside-click handler must ignore it so toggle-from-trigger
            // doesn't immediately re-open (close-then-reopen flicker).
            const target = e.target as Node | null;
            const trigger = document.getElementById('shortlist-trigger');
            if (trigger && target && trigger.contains(target)) {
              e.preventDefault();
            }
          }}
          className={cn(
            'surface-glass-rail fixed right-0 top-0 z-30 hidden h-dvh w-[320px] flex-col outline-none lg:flex',
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
        </Dialog.Content>
        {/* Mobile bottom sheet — only mounted at ≤lg-1. */}
        <Dialog.Content
          id="shortlist-sheet"
          aria-labelledby="shortlist-sheet-title"
          aria-label="Shortlist"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}
          className={cn(
            'surface-glass-card fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-hidden rounded-t-2xl outline-none lg:hidden',
          )}
        >
          <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-ink-100" aria-hidden />
          <MobileHeader onClose={closeDrawer} />
          {revertBanner}
          <MobileLanes />
          <div className="flex justify-end p-4">
            <button
              type="button"
              onClick={closeDrawer}
              className={cn(
                'inline-flex h-11 items-center rounded-full bg-ink-900 px-4 text-sm font-medium text-white transition hover:bg-ink-600',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
              )}
            >
              Done
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
        <Dialog.Title id="shortlist-rail-title" className="text-sm font-semibold text-ink-900">
          Shortlist
        </Dialog.Title>
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
        className="relative rounded-full p-1 text-ink-400 transition hover:bg-ink-50 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-1 focus-visible:ring-offset-white before:absolute before:inset-[-12px] before:content-['']"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Mobile bottom sheet — Radix Dialog handles focus trap + Escape + scrim
// dismissal. We just paint the sheet body.
// ---------------------------------------------------------------------------

function MobileHeader({ onClose }: { onClose: () => void }) {
  const { shortlist, savedOutfits } = useShortlist();
  const counts = useMemo(() => countByLane(shortlist), [shortlist]);
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <Dialog.Title id="shortlist-sheet-title" className="text-sm font-semibold text-ink-900">
          Shortlist
        </Dialog.Title>
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
