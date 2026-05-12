'use client';

import { formatMoney } from '@/lib/format';
import type { NormalizedProduct } from '@/lib/events';
import { ProductImage } from './ProductImage';

// Cycle 1 shell — horizontal scroll, sticky leftmost label column, no border
// (shadow-soft only, per DESIGN.md §2.7). Polish lands in Cycle 2.

interface Props {
  products: NormalizedProduct[];
  axes?: string[];
}

type RowKey = 'image' | 'price' | 'merchant' | 'shipping' | 'why';

interface Row {
  key: RowKey;
  label: string;
  render: (product: NormalizedProduct) => React.ReactNode;
}

const ROWS: Row[] = [
  {
    key: 'image',
    label: 'Image',
    render: (p) => (
      <div className="h-24 w-24 overflow-hidden rounded-xl bg-ink-100">
        <ProductImage src={p.images[0]} alt={p.title} />
      </div>
    ),
  },
  {
    key: 'price',
    label: 'Price',
    render: (p) => (
      <span className="text-sm font-semibold text-ink-900">
        {formatMoney(p.price, p.currency)}
      </span>
    ),
  },
  {
    key: 'merchant',
    label: 'Merchant',
    render: (p) => <span className="text-sm text-ink-600">{p.merchant}</span>,
  },
  {
    key: 'shipping',
    label: 'Shipping',
    // Placeholder — merchant block + shipping info land in Cycle 2.
    render: () => <span className="text-sm text-ink-400">—</span>,
  },
  {
    key: 'why',
    label: 'Why this',
    render: (p) => (
      <p className="text-sm leading-relaxed text-ink-600">
        {p.description ? truncate(p.description, 140) : '—'}
      </p>
    ),
  },
];

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n).trim()}…`;
}

export function ComparisonTable({ products, axes }: Props) {
  if (!products.length) return null;

  // axes prop is reserved for Cycle 2 — for now we always render the fixed
  // row set above. We surface it as the table caption so the agent's intent
  // is visible to QA without affecting layout.
  const caption = axes?.length ? axes.join(' · ') : null;

  // Column width chosen so 2 columns fit a 640px text column and 3+ overflow
  // into a horizontal scroller. Each column is 192px (w-48).
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-soft">
      {caption ? (
        <div className="border-b border-ink-100 px-4 py-2 text-[11px] uppercase tracking-wider text-ink-400">
          {caption}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-32 bg-white px-4 py-3 text-[11px] uppercase tracking-wider text-ink-400">
                <span className="sr-only">Attribute</span>
              </th>
              {products.map((p) => (
                <th
                  key={p.id}
                  className="w-48 min-w-48 px-4 py-3 align-bottom"
                  scope="col"
                >
                  <p className="text-sm font-semibold text-ink-900">{p.title}</p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key} className="border-t border-ink-100">
                <th
                  scope="row"
                  className="sticky left-0 z-10 w-32 bg-white px-4 py-3 text-[11px] uppercase tracking-wider text-ink-400 align-top"
                >
                  {row.label}
                </th>
                {products.map((p) => (
                  <td key={`${row.key}-${p.id}`} className="w-48 min-w-48 px-4 py-3 align-top">
                    {row.render(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
