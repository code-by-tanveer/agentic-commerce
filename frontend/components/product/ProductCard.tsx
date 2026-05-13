'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, ExternalLink, Heart, Store, Wand2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { clientLocale, formatMoney } from '@/lib/format';
import type { Product } from '@/types/product';
import {
  DRAG_MIME,
  encodeDragPayload,
  useOptionalShortlist,
} from '@/hooks/useShortlist';
import { useConversationActions } from '@/hooks/useConversation';
import { ProductImage } from './ProductImage';
import { VariantPicker } from './VariantPicker';
import { ReasoningChips } from './ReasoningChips';
import { MerchantBlock } from './MerchantBlock';

interface Props {
  product: Product;
  index?: number;
}

export function ProductCard({ product, index = 0 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    product.variants?.[0]?.id ?? '',
  );
  // DESIGN.md §6 / §7 — prefers-reduced-motion collapses all motion to a 100ms
  // opacity-only crossfade. Wired at the ProductCard level per the Cycle 1 brief.
  const reduce = useReducedMotion();
  // Cycle 3 — DnD source + keyboard fallback L/M/S (DESIGN.md §7). Optional
  // because tests / story environments may mount cards without a
  // ShortlistProvider; the keyboard handler simply no-ops in that case.
  const shortlist = useOptionalShortlist();
  const { send } = useConversationActions();
  const [ariaMsg, setAriaMsg] = useState('');

  const selectedVariant = product.variants?.find((v) => v.id === selectedVariantId);
  const checkoutUrl = selectedVariant?.checkoutUrl || product.checkoutUrl;
  const price = selectedVariant?.price ?? product.price;
  const currency = selectedVariant?.currency ?? product.currency;
  const canBuy = !!checkoutUrl;
  // T4.K (Priya) — pull the browser's locale on client so INR / EUR / etc.
  // get correct grouping (lakh comma for en-IN, etc.). Falls back to en-US
  // under SSR via `clientLocale()` returning undefined.
  const locale = clientLocale();
  // T1.1 — track whether this product is already in the Love lane so the heart
  // reflects state. Hides duplicate-tap noise; tapping again moves the lane
  // back to `love` (idempotent server-side) and the heart fills regardless.
  const isLoved = shortlist?.shortlist.some(
    (i) => i.productId === product.id && i.lane === 'love',
  );

  function buy() {
    if (!checkoutUrl) return;
    window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
  }

  // T1.1 — tap-to-save heart. Touch-only at rest; fade-in on hover/focus for
  // fine-pointer users (the L/M/S keyboard fallback below still works there).
  function saveLove(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation();
    if (!shortlist) return;
    void shortlist.addToLane(product.id, 'love', product);
    setAriaMsg('Saved to Love');
  }

  // T1.8 — "Pair with…" — uses the conversation `send` with the title as
  // user-visible context, plus the productId via an inline marker so the
  // backend can route to recommend_outfit. The agent's system prompt already
  // routes "what would go with X" through that tool (PRODUCT.md move #4).
  function pairWith(e: React.MouseEvent) {
    e.stopPropagation();
    void send(
      `what would go with this? (product: ${product.title}, id: ${product.id})`,
    );
  }

  const entryInitial = reduce ? { opacity: 0 } : { opacity: 0, y: 12 };
  const entryAnimate = reduce ? { opacity: 1 } : { opacity: 1, y: 0 };
  // Stagger cap of 6 per DESIGN.md §2.8 — items past index 5 snap in. Drop the
  // stagger entirely under reduced motion: a delayed crossfade is exactly the
  // ambient/decorative motion users in this mode are opting out of.
  const entryTransition = reduce
    ? { duration: 0.1 }
    : { duration: 0.3, delay: Math.min(index, 5) * 0.04, ease: 'easeOut' as const };

  function onNativeDragStart(e: React.DragEvent<HTMLElement>) {
    e.dataTransfer.setData(
      DRAG_MIME,
      encodeDragPayload({ productId: product.id, snapshot: product }),
    );
    e.dataTransfer.effectAllowed = 'copy';
  }
  // Framer Motion overloads `onDragStart` for its own pointer-drag gesture
  // (signature `(event, info) => void`), which trips TS even though we never
  // enable `drag`. Forward the native handler through a spread so framer
  // doesn't see it on the typed prop bag — it still lands on the DOM node
  // because motion forwards unrecognised props.
  const dndProps = {
    draggable: true,
    onDragStart: onNativeDragStart,
  } as unknown as Record<string, unknown>;

  function onCardKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    const target = e.target as HTMLElement | null;
    const isCardSelf = target === e.currentTarget;
    if (!isCardSelf) return;
    // T1.15 — accept lowercase l/m/s in addition to uppercase. Case-insensitive
    // matching prevents the silent-no-op when caps-lock isn't held.
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === 'l' || key === 'm' || key === 's') {
      if (!shortlist) return;
      const lane = key === 'l' ? 'love' : key === 'm' ? 'maybe' : 'skip';
      e.preventDefault();
      void shortlist.addToLane(product.id, lane, product);
      setAriaMsg(
        `Saved to ${lane === 'love' ? 'Love' : lane === 'maybe' ? 'Maybe' : 'Skip'}`,
      );
    }
    // T1.14 — Enter/Space on the card toggles expand (the row containing the
    // expand chevron is a div now, no longer a button — see structural change
    // below).
    if (key === 'Enter' || e.key === ' ') {
      if (
        target instanceof HTMLElement &&
        target.tagName === 'BUTTON'
      ) {
        return;
      }
      e.preventDefault();
      setExpanded((x) => !x);
    }
  }

  return (
    <motion.article
      layout={!reduce}
      initial={entryInitial}
      animate={entryAnimate}
      transition={entryTransition}
      // Cycle 3 — drag source (native HTML5 DnD, no extra dep) + keyboard
      // fallback. `dndProps` are spread via a type-bypass because framer's
      // `onDragStart` is its own gesture (see comment above).
      {...dndProps}
      // T1.14 — card is a focusable role=button so Enter/Space toggles expand.
      // The previous structure had the whole collapsed row as a <button>, with
      // the Buy chip nested as `role="button"` — invalid HTML (button inside
      // button). The chevron-row is now a div with the article handling
      // keyboard activation.
      role="button"
      aria-expanded={expanded}
      tabIndex={0}
      onKeyDown={onCardKeyDown}
      className={cn(
        'group relative overflow-hidden rounded-2xl bg-white shadow-soft transition hover:shadow-lift',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50',
      )}
    >
      {/* aria-live region for the L/M/S fallback (DESIGN.md §7). */}
      <span role="status" aria-live="polite" className="sr-only">
        {ariaMsg}
      </span>

      {/* T1.1 — heart-icon tap-to-save. Visible at rest on touch
          (`[@media(hover:none)]`); on fine pointers it now rests at
          `opacity-60` so the affordance survives keyboard tab-nav and
          slow-eye users (T4.C / Diane, Round 5). Hover / focus / saved
          state confirm at full opacity.
          T4.S — saved heart uses `ink-900` (filled) instead of `rose-500`;
          rose is reserved for danger per the Design Lead's note. The fill
          alone carries the "saved" signal — no colour required. */}
      <button
        type="button"
        onClick={saveLove}
        aria-label={isLoved ? 'Saved to Love' : 'Save to Love'}
        aria-pressed={isLoved}
        className={cn(
          'absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-ink-400 shadow-soft transition',
          'hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
          // Touch (no-hover) devices always see it at full opacity.
          '[@media(hover:none)]:opacity-100',
          // Fine-pointer / hover-capable devices: subtle resting state, full
          // opacity on hover/focus. T4.C — was opacity-0 (invisible to
          // tab-nav users) until Round 5.
          '[@media(hover:hover)]:opacity-60 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100',
          isLoved && 'text-ink-900 [@media(hover:hover)]:opacity-100',
        )}
      >
        <Heart
          className={cn('h-4 w-4', isLoved && 'fill-ink-900')}
          aria-hidden
        />
      </button>

      {/* Collapsed row — div (not button) so the inner Buy is a real
          sibling button (T1.14). Click on this region toggles expand. */}
      <div
        onClick={() => setExpanded((x) => !x)}
        className="flex w-full cursor-pointer items-stretch gap-3 p-3 text-left"
      >
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-ink-100">
          <ProductImage
            src={product.images[0]}
            alt={product.title}
            sizes="96px"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-ink-900">{product.title}</h3>
              {/* T1.30 — mt-0.5 → mt-1 (no decimal spacing). */}
              <p className="mt-1 flex items-center gap-1 text-xs text-ink-400">
                <Store className="h-3 w-3" aria-hidden />
                <span className="truncate">{product.merchant}</span>
              </p>
            </div>
            <ChevronDown
              aria-hidden
              className={cn(
                'h-4 w-4 shrink-0 text-ink-400 transition-transform',
                expanded && 'rotate-180',
              )}
            />
          </div>
          {/* Reasoning chips — below title, above price (DESIGN.md §4
              ProductCard, §8 Cycle 2). Silently absent when no chips. */}
          {product.reasoningChips?.length ? (
            <div className="mt-2">
              <ReasoningChips chips={product.reasoningChips} />
            </div>
          ) : null}
          <div className="mt-auto flex items-end justify-between pt-2">
            <p className="text-base font-semibold text-ink-900">
              {formatMoney(price, currency, locale)}
            </p>
            {/* T1.6 — "Buy now" → "Buy on {merchant}" everywhere. T1.14 —
                now a sibling <button>, no longer a nested role="button"
                inside an outer <button>. T1.30 — py-1.5 → py-2 (no decimal). */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (canBuy) buy();
              }}
              disabled={!canBuy}
              aria-label={canBuy ? `Buy on ${product.merchant}` : 'Unavailable'}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-medium transition',
                'focus:outline-none focus-visible:shadow-glow',
                canBuy
                  ? 'bg-ink-900 text-white hover:bg-ink-600'
                  : 'cursor-not-allowed bg-ink-100 text-ink-400',
              )}
            >
              <span className="truncate">
                Buy on <span className="font-semibold">{product.merchant}</span>
              </span>
              <ExternalLink className="h-3 w-3" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="details"
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0.1 } : { duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden border-t border-ink-100"
          >
            <div className="space-y-4 p-4">
              {product.images.length > 1 && (
                <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                  {product.images.slice(0, 6).map((src, i) => (
                    <div
                      key={src + i}
                      className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-ink-100"
                    >
                      <ProductImage src={src} alt={`${product.title} ${i + 1}`} sizes="80px" />
                    </div>
                  ))}
                </div>
              )}

              {product.description && (
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink-600">
                  {product.description.length > 360
                    ? `${product.description.slice(0, 360).trim()}…`
                    : product.description}
                </p>
              )}

              {product.variants && product.variants.length > 1 && (
                <VariantPicker
                  variants={product.variants}
                  selectedId={selectedVariantId}
                  onSelect={setSelectedVariantId}
                />
              )}

              {/* Merchant transparency — sits before the Buy area per
                  PRODUCT.md move #5 / DESIGN.md §4. Silently absent when
                  the BE has no merchantInfo (graceful degrade per
                  acceptance #5). */}
              {product.merchantInfo ? (
                <MerchantBlock info={product.merchantInfo} />
              ) : null}

              <div className="flex items-center justify-between gap-3 border-t border-ink-100 pt-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-ink-400">Total</p>
                  {/* T1.28 — `font-display` on the expanded Total price. One of
                      the four allowed serif homes per DESIGN.md §2.4 #1. */}
                  <p className="font-display text-lg leading-tight text-ink-900">
                    {formatMoney(price, currency, locale)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {/* T1.8 — Pair-with affordance. Routes through the agent so
                      `recommend_outfit` fires (PRODUCT.md move #4). */}
                  <button
                    type="button"
                    onClick={pairWith}
                    aria-label={`Pair with — what would go with ${product.title}?`}
                    className={cn(
                      'inline-flex h-9 items-center gap-2 rounded-full bg-white px-3 text-sm font-medium text-ink-900 shadow-soft transition hover:bg-ink-50',
                      'focus:outline-none focus-visible:shadow-glow',
                    )}
                  >
                    <Wand2 className="h-3.5 w-3.5 text-ink-400" aria-hidden />
                    Pair with…
                  </button>
                  {/* T1.6 — unified "Buy on {merchant}" wording.
                      T1.29 — focus-visible:shadow-glow on the primary CTA
                      (DESIGN.md §2.7 hard rule). */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      buy();
                    }}
                    disabled={!canBuy}
                    aria-label={canBuy ? `Buy on ${product.merchant}` : 'Unavailable'}
                    className={cn(
                      'inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition',
                      'focus:outline-none focus-visible:shadow-glow',
                      canBuy
                        ? 'bg-accent-500 text-white hover:bg-accent-600'
                        : 'cursor-not-allowed bg-ink-100 text-ink-400',
                    )}
                  >
                    Buy on {product.merchant}
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
