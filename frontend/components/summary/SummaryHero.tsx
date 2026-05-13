import type { SummaryBlob } from '@/types/product';

// Cycle 5 — SummaryHero.
//
// The serif's hero moment per DESIGN.md §2.4 #2: `text-3xl font-display
// italic` carries the one-line gist (PRODUCT.md move #7). Full-bleed on
// mobile, centered max-w-3xl on desktop (DESIGN.md §5).
//
// Server component — no hooks, no `'use client'`. Pure render so the
// shareable page is readable with JS disabled.

interface Props {
  blob: SummaryBlob;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function SummaryHero({ blob }: Props) {
  const totalItems = blob.love.length + blob.maybe.length;
  const merchantLabel =
    blob.merchantCount === 1 ? '1 merchant' : `${blob.merchantCount} merchants`;
  const itemLabel = totalItems === 1 ? '1 item' : `${totalItems} items`;

  return (
    <header className="px-4 pb-8 pt-12 sm:pt-16">
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-[11px] uppercase tracking-wider text-ink-400">
          A lookbook from Agentic Commerce
        </p>
        <h1 className="mt-3 font-display text-3xl italic leading-tight text-ink-900">
          {blob.gist}
        </h1>
        <p className="mt-4 text-sm text-ink-400">
          <time dateTime={blob.createdAt}>{formatDate(blob.createdAt)}</time>
          <span aria-hidden> · </span>
          <span>{itemLabel}</span>
          <span aria-hidden> · </span>
          <span>{merchantLabel}</span>
        </p>
      </div>
    </header>
  );
}
