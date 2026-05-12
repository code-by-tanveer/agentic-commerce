'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, ExternalLink, Store } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import type { Product } from '@/types/product';
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

  const selectedVariant = product.variants?.find((v) => v.id === selectedVariantId);
  const checkoutUrl = selectedVariant?.checkoutUrl || product.checkoutUrl;
  const price = selectedVariant?.price ?? product.price;
  const currency = selectedVariant?.currency ?? product.currency;
  const canBuy = !!checkoutUrl;

  function buy() {
    if (!checkoutUrl) return;
    window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
  }

  const entryInitial = reduce ? { opacity: 0 } : { opacity: 0, y: 12 };
  const entryAnimate = reduce ? { opacity: 1 } : { opacity: 1, y: 0 };
  // Stagger cap of 6 per DESIGN.md §2.8 — items past index 5 snap in. Drop the
  // stagger entirely under reduced motion: a delayed crossfade is exactly the
  // ambient/decorative motion users in this mode are opting out of.
  const entryTransition = reduce
    ? { duration: 0.1 }
    : { duration: 0.3, delay: Math.min(index, 5) * 0.04, ease: 'easeOut' as const };

  return (
    <motion.article
      layout={!reduce}
      initial={entryInitial}
      animate={entryAnimate}
      transition={entryTransition}
      className={cn(
        'group overflow-hidden rounded-2xl bg-white shadow-soft transition hover:shadow-lift',
      )}
    >
      <button
        onClick={() => setExpanded((x) => !x)}
        className="flex w-full items-stretch gap-3 p-3 text-left"
        aria-expanded={expanded}
      >
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-ink-100">
          <ProductImage src={product.images[0]} alt={product.title} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-ink-900">{product.title}</h3>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-400">
                <Store className="h-3 w-3" />
                <span className="truncate">{product.merchant}</span>
              </p>
            </div>
            <ChevronDown
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
              {formatMoney(price, currency)}
            </p>
            <span
              onClick={(e) => {
                e.stopPropagation();
                if (canBuy) buy();
              }}
              role="button"
              tabIndex={canBuy ? 0 : -1}
              onKeyDown={(e) => {
                if (canBuy && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  buy();
                }
              }}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition',
                canBuy
                  ? 'bg-ink-900 text-white hover:bg-ink-600'
                  : 'cursor-not-allowed bg-ink-100 text-ink-400',
              )}
            >
              Buy now
              <ExternalLink className="h-3 w-3" />
            </span>
          </div>
        </div>
      </button>

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
                      className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-ink-100"
                    >
                      <ProductImage src={src} alt={`${product.title} ${i + 1}`} />
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
                  <p className="text-lg font-semibold text-ink-900">
                    {formatMoney(price, currency)}
                  </p>
                </div>
                <button
                  onClick={buy}
                  disabled={!canBuy}
                  className={cn(
                    'inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-medium transition',
                    canBuy
                      ? 'bg-accent-500 text-white hover:bg-accent-600'
                      : 'cursor-not-allowed bg-ink-100 text-ink-400',
                  )}
                >
                  Buy on {product.merchant}
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
