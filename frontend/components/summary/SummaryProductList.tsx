import Image from 'next/image';
import { ExternalLink, Store } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import type {
  Product,
  SummaryBlob,
  SummaryOutfit,
  SummaryProduct,
} from '@/types/product';

// Cycle 5 — SummaryProductList.
//
// Three sections: What you loved / Saved outfits / All considered. Each
// header uses `text-2xl font-display` per DESIGN.md §2.4 #3 (the serif's
// section-header home). Server component — no client hooks, works with JS
// disabled (PRODUCT.md move #7 acceptance #2).
//
// `snapshot` is `unknown` on the wire because the BE stores whatever the
// merchant returned; we narrow defensively so a stray shape doesn't crash
// the page (PRODUCT.md acceptance #5: a delisted product still renders).

interface Props {
  blob: SummaryBlob;
}

function isProduct(value: unknown): value is Product {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    Array.isArray(v.images) &&
    typeof v.merchant === 'string'
  );
}

function ProductCell({ product }: { product: Product }) {
  const hasCheckout = !!product.checkoutUrl;
  const img = product.images?.[0];
  return (
    <li className="flex gap-4 rounded-2xl bg-white p-4 shadow-soft">
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-ink-100">
        {img ? (
          <Image
            src={img}
            alt={product.title}
            fill
            sizes="96px"
            className="object-cover"
          />
        ) : (
          <div className="h-full w-full bg-ink-100" aria-hidden />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="truncate text-sm font-semibold text-ink-900">
          {product.title}
        </h3>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-400">
          <Store className="h-3 w-3" aria-hidden />
          <span className="truncate">{product.merchant}</span>
        </p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <p className="text-base font-semibold text-ink-900">
            {formatMoney(product.price, product.currency)}
          </p>
          {hasCheckout ? (
            <a
              href={product.checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              // Cycle 6 — visible chip kept compact (px-3 py-2); the
              // `before:` pad extends the touch area to ≥44px without any
              // visual change.
              className="relative inline-flex items-center gap-1 rounded-full bg-ink-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-ink-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50 before:absolute before:inset-[-10px] before:content-['']"
            >
              Open at {product.merchant}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ) : (
            <span className="text-[11px] text-ink-400">
              Merchant link unavailable
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="px-4 py-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-2xl text-ink-900">{title}</h2>
          <span className="text-[11px] uppercase tracking-wider text-ink-400">
            {count === 1 ? '1 item' : `${count} items`}
          </span>
        </div>
        {children}
      </div>
    </section>
  );
}

function OutfitCell({ outfit }: { outfit: SummaryOutfit }) {
  const items = Array.isArray(outfit.items)
    ? outfit.items.filter(isProduct)
    : [];
  return (
    <li className="rounded-2xl bg-accent-50 p-4 shadow-soft">
      {outfit.rationale ? (
        <p className="mb-3 text-sm leading-relaxed text-ink-600">
          {outfit.rationale}
        </p>
      ) : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((p) => (
          <li key={p.id} className="overflow-hidden rounded-xl bg-white">
            <a
              href={p.checkoutUrl || '#'}
              target={p.checkoutUrl ? '_blank' : undefined}
              rel={p.checkoutUrl ? 'noopener noreferrer' : undefined}
              className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-accent-50"
            >
              <div className="relative aspect-square w-full overflow-hidden bg-ink-100">
                {p.images?.[0] ? (
                  <Image
                    src={p.images[0]}
                    alt={p.title}
                    fill
                    sizes="(max-width: 640px) 50vw, 25vw"
                    className="object-cover"
                  />
                ) : null}
              </div>
              <div className="p-2">
                <p className="truncate text-xs text-ink-900">{p.title}</p>
                <p className="text-[11px] text-ink-400">
                  {formatMoney(p.price, p.currency)} · {p.merchant}
                </p>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </li>
  );
}

export function SummaryProductList({ blob }: Props) {
  const loved = blob.love
    .map((r: SummaryProduct) => r.snapshot)
    .filter(isProduct);
  const considered = blob.maybe
    .map((r: SummaryProduct) => r.snapshot)
    .filter(isProduct);
  const outfits = blob.outfits ?? [];

  const isEmpty =
    loved.length === 0 && considered.length === 0 && outfits.length === 0;

  if (isEmpty) {
    return (
      <section className="px-4 py-8">
        <div className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-6 text-sm text-ink-600 shadow-soft">
          This lookbook is empty. Save a product into Love or Maybe back in
          the chat to fill it in.
        </div>
      </section>
    );
  }

  return (
    <div>
      <Section title="What you loved" count={loved.length}>
        <ul className="space-y-3">
          {loved.map((p) => (
            <ProductCell key={p.id} product={p} />
          ))}
        </ul>
      </Section>
      <Section title="Saved outfits" count={outfits.length}>
        <ul className="space-y-4">
          {outfits.map((o) => (
            <OutfitCell key={o.id} outfit={o} />
          ))}
        </ul>
      </Section>
      <Section title="All considered" count={considered.length}>
        <ul className="space-y-3">
          {considered.map((p) => (
            <ProductCell key={p.id} product={p} />
          ))}
        </ul>
      </Section>
    </div>
  );
}
