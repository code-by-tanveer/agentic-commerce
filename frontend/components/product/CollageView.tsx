'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, ExternalLink, Store } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import type { Product } from '@/types/product';
import {
  DRAG_MIME,
  encodeDragPayload,
  useOptionalShortlist,
} from '@/hooks/useShortlist';
import { ProductImage } from './ProductImage';
import { ReasoningChips } from './ReasoningChips';
import { MerchantBlock } from './MerchantBlock';
import { VariantPicker } from './VariantPicker';

// ---------------------------------------------------------------------------
// CollageView — Cycle 3 (DESIGN.md §4 CollageView, §8 Cycle 3).
//
// Pinterest-style masonry via CSS columns (no library — `columns-N` ships in
// every browser). Each item is a `CollageCard`:
//   - Image-dominant, no chrome below by default (DESIGN.md §3 principle 2:
//     "content over chrome").
//   - On hover/focus, an overlay floats over the lower-left with title +
//     price; the price is rendered in `font-display` (Instrument Serif).
//     This is the ONE serif moment this cycle (DESIGN.md §2.4 #4).
//   - Tap expands inline below the image. Reasoning chips appear in the
//     expanded panel (DESIGN.md §4 CollageView).
//   - Draggable to the Shortlist drawer (native HTML5 DnD) and keyboard-
//     accessible (`L`/`M`/`S`) per DESIGN.md §7.
//
// Motion:
//   - The container uses Framer Motion `layout` on each item so removals (and
//     view-mode flips at the parent level) reflow via `motion-layout`
//     (400ms, custom `[0.2,0,0,1]` easing — DESIGN.md §2.8). Under
//     `prefers-reduced-motion`, layout animation is disabled and an opacity
//     crossfade replaces it (≤100ms).
//   - The hover overlay slides up 8px / fades in at 200ms (`motion-quick`).
// ---------------------------------------------------------------------------

interface Props {
  products: Product[];
}

export function CollageView({ products }: Props) {
  if (!products.length) return null;
  return (
    <div
      className={cn(
        // CSS columns — masonry without a library. Breakpoints match the
        // Cycle 3 design directive: 2 / 3 / 4 across phone / tablet / desktop.
        'columns-2 gap-3 sm:columns-3 lg:columns-4',
      )}
    >
      {products.map((p, i) => (
        // `break-inside-avoid` keeps each card from splitting across columns.
        // `inline-block` is required for the column layout to track height.
        <div key={p.id || i} className="mb-3 inline-block w-full break-inside-avoid">
          <CollageCard product={p} index={i} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CollageCard — image-dominant card variant. Distinct from `ProductCard`
// because:
//   1. The chrome is the image; there's no title row by default.
//   2. The price overlays the image in serif on hover/focus.
//   3. Reasoning chips live in the expanded panel, not next to the title.
// ---------------------------------------------------------------------------

interface CardProps {
  product: Product;
  index: number;
}

function CollageCard({ product, index }: CardProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    product.variants?.[0]?.id ?? '',
  );
  const [ariaMsg, setAriaMsg] = useState('');
  const reduce = useReducedMotion();
  const shortlist = useOptionalShortlist();

  const selectedVariant = product.variants?.find((v) => v.id === selectedVariantId);
  const checkoutUrl = selectedVariant?.checkoutUrl || product.checkoutUrl;
  const price = selectedVariant?.price ?? product.price;
  const currency = selectedVariant?.currency ?? product.currency;
  const canBuy = !!checkoutUrl;

  function buy() {
    if (!checkoutUrl) return;
    window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
  }

  function onNativeDragStart(e: React.DragEvent<HTMLElement>) {
    e.dataTransfer.setData(DRAG_MIME, encodeDragPayload({
      productId: product.id,
      snapshot: product,
    }));
    e.dataTransfer.effectAllowed = 'copy';
  }
  // See ProductCard for rationale — framer overloads `onDragStart`.
  const dndProps = {
    draggable: true,
    onDragStart: onNativeDragStart,
  } as unknown as Record<string, unknown>;

  function onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    // `L`/`M`/`S` — uppercase only (DESIGN.md §7 keyboard fallback) so we
    // don't fight with lowercase letters the user might be typing into a
    // nested input (there are none in collapsed state, but defense-in-depth).
    if (e.key === 'L' || e.key === 'M' || e.key === 'S') {
      if (!shortlist) return;
      const lane = e.key === 'L' ? 'love' : e.key === 'M' ? 'maybe' : 'skip';
      e.preventDefault();
      void shortlist.addToLane(product.id, lane, product);
      setAriaMsg(`Saved to ${lane === 'love' ? 'Love' : lane === 'maybe' ? 'Maybe' : 'Skip'}`);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setExpanded((x) => !x);
    }
  }

  // Entry motion — opacity-only under reduced motion. Stagger cap of 6
  // (DESIGN.md §2.8).
  const entryInitial = reduce ? { opacity: 0 } : { opacity: 0, y: 12 };
  const entryAnimate = reduce ? { opacity: 1 } : { opacity: 1, y: 0 };
  // The `transition` prop applies to BOTH entry animation and layout reflow.
  // For collage reflow we want DESIGN.md §6's `motion-layout` budget: 400ms,
  // custom `[0.2, 0, 0, 1]` easing. Framer lets us namespace by animation
  // type — `layout: {...}` for reflow, `default: {...}` for everything else.
  // Under `prefers-reduced-motion`, layout animation is disabled outright
  // (motion-layout collapses to instant per DESIGN.md §6 footnote).
  const transition = reduce
    ? { duration: 0.1 }
    : {
        default: { duration: 0.3, delay: Math.min(index, 5) * 0.04, ease: 'easeOut' as const },
        layout: { duration: 0.4, ease: [0.2, 0, 0, 1] as const },
      };

  return (
    <motion.article
      layout={!reduce}
      initial={entryInitial}
      animate={entryAnimate}
      transition={transition}
      // Native HTML5 DnD — no extra dep (Cycle 3 hard rule). See ProductCard
      // for the `dndProps` cast rationale.
      {...dndProps}
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label={`${product.title}, ${formatMoney(price, currency)} from ${product.merchant}`}
      className={cn(
        // §2.7: shadow XOR border. Shadow alone here.
        'group relative overflow-hidden rounded-2xl bg-white shadow-soft transition hover:shadow-lift',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50',
      )}
    >
      {/* aria-live region — announces lane assignment for keyboard users
          (DESIGN.md §7). `sr-only` keeps it visually absent. */}
      <span role="status" aria-live="polite" className="sr-only">
        {ariaMsg}
      </span>

      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        aria-expanded={expanded}
        className="block w-full"
        // Don't snare the drag — the article handles it.
        draggable={false}
      >
        <div className="relative">
          <div className="aspect-[4/5] w-full overflow-hidden bg-ink-100">
            <ProductImage src={product.images[0]} alt={product.title} />
          </div>

          {/* Hover/focus overlay — title + serif price, lower-left. CSS
              `@media (hover: hover)` gates visibility: fine pointers see it
              only on hover/focus; touch devices always see it (touch users
              can't hover). Animation is opacity-only, ≤200ms (DESIGN.md §6
              `motion-quick`). */}
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 p-3 text-left',
              // Scrim improves contrast over photography.
              'bg-gradient-to-t from-ink-900/70 via-ink-900/30 to-transparent',
              // Desktop hover/focus only — touch devices always see the overlay.
              '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:transition-opacity [@media(hover:hover)]:duration-200',
              '[@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100',
            )}
          >
            <p className="truncate text-xs font-medium text-white">{product.title}</p>
            {/* THE serif moment this cycle (DESIGN.md §2.4 #4). */}
            <p className="font-display text-lg leading-none text-white">
              {formatMoney(price, currency)}
            </p>
          </div>

          {/* Chevron — soft indicator that this expands. Only visible on
              hover/focus to keep the resting state pure image. */}
          <ChevronDown
            aria-hidden
            className={cn(
              'absolute right-2 top-2 h-4 w-4 text-white drop-shadow transition-transform',
              expanded && 'rotate-180',
              '[@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
            )}
          />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="details"
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0.1 } : { duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-3 p-3">
              <div>
                <h3 className="text-sm font-semibold text-ink-900">{product.title}</h3>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-400">
                  <Store className="h-3 w-3" aria-hidden />
                  <span className="truncate">{product.merchant}</span>
                </p>
              </div>

              {product.reasoningChips?.length ? (
                <ReasoningChips chips={product.reasoningChips} />
              ) : null}

              {product.description ? (
                <p className="line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-ink-600">
                  {product.description}
                </p>
              ) : null}

              {product.variants && product.variants.length > 1 ? (
                <VariantPicker
                  variants={product.variants}
                  selectedId={selectedVariantId}
                  onSelect={setSelectedVariantId}
                />
              ) : null}

              {product.merchantInfo ? (
                <MerchantBlock info={product.merchantInfo} />
              ) : null}

              <div className="flex items-center justify-between gap-2 pt-1">
                <p className="text-base font-semibold text-ink-900">
                  {formatMoney(price, currency)}
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canBuy) buy();
                  }}
                  disabled={!canBuy}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition',
                    canBuy
                      ? 'bg-accent-500 text-white hover:bg-accent-600 focus:outline-none focus-visible:shadow-glow'
                      : 'cursor-not-allowed bg-ink-100 text-ink-400',
                  )}
                >
                  Buy
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

    </motion.article>
  );
}
