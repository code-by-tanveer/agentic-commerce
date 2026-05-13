'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, ExternalLink, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import type { Product } from '@/types/product';
import { useOptionalShortlist } from '@/hooks/useShortlist';
import { ProductImage } from './ProductImage';

// ---------------------------------------------------------------------------
// OutfitBundle — Cycle 3 (DESIGN.md §4 OutfitBundle).
//
// ONE composite card framing 2–4 product cells (2x2 or 1+row). The "single
// object" reading is the move per the cycle brief: the bundle is a
// coordinated set, not three random products stacked.
//
// Compliance:
//   - §2.7: shadow XOR border. Outer frame uses `shadow-soft` only; the
//     `accent-50` tint replaces a border as the "this is one object" cue.
//   - §2.5: spacing limited to 1/2/3/4.
//   - §2.2: orange (`accent-500`) reserved for the commerce-intent CTA
//     — "Save outfit" — and nothing else.
//   - §2.4: no serif here. Serif appears only on CollageView hover overlay
//     this cycle.
//   - §6: button entry / saved-state flip ≤300ms easeOut.
// ---------------------------------------------------------------------------

interface Props {
  anchorProductId: string;
  items: Product[];
  rationale?: string;
}

export function OutfitBundle({ anchorProductId, items, rationale }: Props) {
  const shortlist = useOptionalShortlist();
  const reduce = useReducedMotion();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Defensive cap — backend tool max is 4; defense-in-depth in case a future
  // event leaks more.
  const cells = items.slice(0, 4);
  const total = cells.reduce((acc, p) => acc + (p.price || 0), 0);
  const currency = cells[0]?.currency || 'USD';

  async function onSave() {
    if (!shortlist || saving || savedAt) return;
    setSaving(true);
    const result = await shortlist.saveOutfit({
      anchorProductId,
      items: cells,
      rationale,
    });
    setSaving(false);
    if (result) {
      setSavedAt(Date.now());
      // Flip back to "Save outfit" after 2s — matches the brief.
      setTimeout(() => setSavedAt(null), 2000);
    }
  }

  // 2x2 if exactly 4; otherwise 1 hero on top + 1–3 underneath (1+row).
  // For 2 we use a 2-column row; for 3 we use 1 + 2.
  const layoutClass =
    cells.length === 4
      ? 'grid grid-cols-2 gap-2'
      : cells.length === 3
        ? 'grid grid-cols-2 gap-2'
        : 'grid grid-cols-2 gap-2';

  return (
    <motion.section
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0.1 } : { duration: 0.3, ease: 'easeOut' as const }}
      aria-label="Outfit bundle"
      className={cn(
        // `accent-50` tint reads as a single coordinated object. Shadow only
        // (§2.7) — no border to compound the tint.
        'rounded-2xl bg-accent-50 p-4 shadow-soft',
      )}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent-600" aria-hidden />
          <p className="text-sm font-semibold text-ink-900">A coordinated set</p>
        </div>
        <p className="text-[11px] text-ink-400">
          {cells.length} item{cells.length === 1 ? '' : 's'} · {formatMoney(total, currency)}
        </p>
      </header>

      {rationale ? (
        <p className="mb-3 text-xs leading-relaxed text-ink-600">{rationale}</p>
      ) : null}

      <div className={layoutClass}>
        {cells.length === 3 ? (
          // 1 + 2: hero spans both columns, then two below.
          <>
            <BundleCell product={cells[0]} className="col-span-2" />
            <BundleCell product={cells[1]} />
            <BundleCell product={cells[2]} />
          </>
        ) : (
          cells.map((p) => <BundleCell key={p.id} product={p} />)
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[11px] text-ink-400">
          Saves all {cells.length} to your Love lane.
        </p>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving || !!savedAt || !shortlist}
          aria-live="polite"
          className={cn(
            // T1.31 — px-5 → px-4 (canonical §2.5 palette).
            'inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition',
            'focus:outline-none focus-visible:shadow-glow',
            savedAt
              ? 'bg-emerald-50 text-emerald-600'
              : saving
                ? 'cursor-wait bg-ink-100 text-ink-400'
                : 'bg-accent-500 text-white hover:bg-accent-600',
          )}
        >
          {savedAt ? (
            <>
              <Check className="h-4 w-4" aria-hidden /> Saved
            </>
          ) : (
            <>Save outfit</>
          )}
        </button>
      </div>
    </motion.section>
  );
}

// ---------------------------------------------------------------------------
// BundleCell — one tile inside the bundle frame. Thumbnail + title +
// one-line rationale (from the chip-style "why this with that"). Tappable to
// open the merchant page directly — the bundle is about pairings, not deep
// expansion, so we skip the inline-expand affordance the standalone
// ProductCard has.
// ---------------------------------------------------------------------------

function BundleCell({ product, className }: { product: Product; className?: string }) {
  // The bundle-level rationale lives at the parent; per-cell rationale comes
  // from the first reasoning chip's `detail` (or `label` as a fallback).
  const firstChip = product.reasoningChips?.[0];
  const cellRationale = firstChip?.detail || firstChip?.label;

  function open() {
    if (!product.checkoutUrl) return;
    window.open(product.checkoutUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl bg-white p-2 shadow-soft',
        className,
      )}
    >
      <button
        type="button"
        onClick={open}
        aria-label={`Open ${product.title} at ${product.merchant}`}
        className={cn(
          'group block w-full overflow-hidden rounded-lg bg-ink-100',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
        )}
      >
        <div className="aspect-square w-full overflow-hidden">
          <ProductImage src={product.images?.[0]} alt={product.title} />
        </div>
      </button>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-ink-900">{product.title}</p>
          <p className="text-[11px] text-ink-400">
            {formatMoney(product.price, product.currency)}
          </p>
        </div>
        <button
          type="button"
          onClick={open}
          aria-label={`Buy ${product.title}`}
          className="rounded-full p-1 text-ink-400 transition hover:bg-ink-50 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-1 focus-visible:ring-offset-white"
        >
          <ExternalLink className="h-3 w-3" aria-hidden />
        </button>
      </div>
      {cellRationale ? (
        <p className="line-clamp-1 text-[11px] text-ink-400">{cellRationale}</p>
      ) : null}
    </div>
  );
}
