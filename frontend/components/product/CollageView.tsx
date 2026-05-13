'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, ExternalLink, Heart, Store } from 'lucide-react';
import { cn } from '@/lib/cn';
import { clientLocale, formatMoney } from '@/lib/format';
import { originCountryDisplay } from '@/lib/country';
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
  // T4.K (Priya) — locale-aware currency formatting.
  const locale = clientLocale();
  // T1.1 — heart fill state.
  const isLoved = shortlist?.shortlist.some(
    (i) => i.productId === product.id && i.lane === 'love',
  );

  // T7.4 (Priya) — currency + origin trust signals. Mirrors the ProductCard
  // treatment (see that file for the full rationale): non-USD currencies get
  // a parenthetical badge inline with the price, the Open-at-merchant CTA
  // grows a small dim subtext underneath, and the native `title` tooltip
  // surfaces the full trust copy (currency / origin / ships-to list).
  const displayCurrency = (currency || 'USD').toUpperCase();
  const showCurrencyBadge = displayCurrency !== 'USD';
  const originDisplay = originCountryDisplay(product.merchantInfo?.originCountry);
  const trustParts: string[] = [];
  if (displayCurrency) trustParts.push(`Prices in ${displayCurrency}`);
  if (originDisplay) trustParts.push(`Ships from ${originDisplay}`);
  const trustLine = trustParts.join(' · ');
  const shipsTo = product.merchantInfo?.shipsTo;
  const tooltipLines: string[] = [`Open at ${product.merchant}`];
  if (displayCurrency) tooltipLines.push(`Prices in ${displayCurrency}`);
  if (originDisplay) tooltipLines.push(`Ships from ${originDisplay}`);
  if (shipsTo && shipsTo.length > 0) {
    tooltipLines.push(`Ships to: ${shipsTo.join(', ')}`);
  }
  const buyTooltip = tooltipLines.join('\n');

  function buy() {
    if (!checkoutUrl) return;
    window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
  }

  // T1.1 — tap-to-save. Heart sits over the image. Second tap on a loved
  // card un-saves it; earlier the handler always called `addToLane('love')`
  // so the heart was a one-way switch (matches the ProductCard fix).
  function saveLove(e: React.MouseEvent) {
    e.stopPropagation();
    if (!shortlist) return;
    if (isLoved) {
      void shortlist.remove(product.id);
      setAriaMsg('Removed from Love');
      return;
    }
    void shortlist.addToLane(product.id, 'love', product);
    setAriaMsg('Saved to Love');
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
    // T1.15 — case-insensitive lane keys. Lowercase l/m/s now work as well
    // as uppercase; caps-lock no longer required.
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === 'l' || key === 'm' || key === 's') {
      if (!shortlist) return;
      const lane = key === 'l' ? 'love' : key === 'm' ? 'maybe' : 'skip';
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
      aria-label={`${product.title}, ${formatMoney(price, currency, locale)} from ${product.merchant}`}
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

      {/* T1.1 — heart-icon tap-to-save. Round-5 polish:
          T4.C — bumped to h-11 w-11 (44px / Apple HIG) for the tap target,
            and rest state is `opacity-60` on fine pointers so tab-nav and
            slow-eye users can see the affordance without hovering.
          T4.S — saved heart uses `ink-900` filled; `rose-500` is danger-only
            per the Design Lead's note. */}
      <button
        type="button"
        onClick={saveLove}
        aria-label={isLoved ? 'Saved to Love' : 'Save to Love'}
        aria-pressed={isLoved}
        className={cn(
          'absolute right-2 top-2 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/90 text-ink-400 shadow-soft transition',
          'hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
          '[@media(hover:none)]:opacity-100',
          '[@media(hover:hover)]:opacity-60 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100',
          isLoved && 'text-ink-900 [@media(hover:hover)]:opacity-100',
        )}
      >
        <Heart
          className={cn('h-4 w-4', isLoved && 'fill-ink-900')}
          aria-hidden
        />
      </button>

      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        aria-expanded={expanded}
        className="block w-full"
        // Don't snare the drag — the article handles it.
        draggable={false}
      >
        <div className="relative">
          <div className="relative aspect-[4/5] w-full overflow-hidden bg-ink-100">
            <ProductImage
              src={product.images[0]}
              alt={product.title}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
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
              {formatMoney(price, currency, locale)}
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
                <p className="mt-1 flex items-center gap-1 text-xs text-ink-400">
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
                  {formatMoney(price, currency, locale)}
                  {/* T7.4 (Priya) — currency badge on non-USD prices. */}
                  {showCurrencyBadge ? (
                    <span
                      className="ml-1 align-middle text-[11px] font-medium text-ink-400"
                      aria-label={`Currency ${displayCurrency}`}
                    >
                      ({displayCurrency})
                    </span>
                  ) : null}
                </p>
                {/* T1.6 — Collage variant uses "Open at {merchant}" wording
                    (the card is image-first; "Buy" felt transactional).
                    T1.29 — focus-visible:shadow-glow on the primary CTA.
                    T7.4 (Priya) — trust subtext + tooltip, same treatment
                    as ProductCard. */}
                <div className="flex flex-col items-end">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (canBuy) buy();
                    }}
                    disabled={!canBuy}
                    aria-label={canBuy ? `Open at ${product.merchant}` : 'Unavailable'}
                    title={canBuy ? buyTooltip : undefined}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition',
                      'focus:outline-none focus-visible:shadow-glow',
                      canBuy
                        ? 'bg-accent-500 text-white hover:bg-accent-600'
                        : 'cursor-not-allowed bg-ink-100 text-ink-400',
                    )}
                  >
                    Open at {product.merchant}
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </button>
                  {trustLine ? (
                    <p className="mt-1 text-right text-[11px] text-ink-400">
                      {trustLine}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

    </motion.article>
  );
}
