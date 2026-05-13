'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, Clipboard, Check } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/cn';
import { originCountryDisplay } from '@/lib/country';
import { formatMoney } from '@/lib/format';
import type { NormalizedProduct } from '@/lib/events';

// ---------------------------------------------------------------------------
// ComparisonTable — Round 5 rewrite (T4.B).
//
// Replaces the Cycle-1 shell that hard-coded five rows and a placeholder
// em-dash in the Shipping cell. The new table:
//   1. Honours the `axes` prop from `compareProducts` (the agent populates
//      it from the user's explicit criteria). Each axis maps to a row spec;
//      unknown axes are dropped. Empty/absent `axes` → the default row set.
//   2. Surfaces every published `merchantInfo` field — rating, shipping,
//      returns, country of origin, review count — so the comparison view
//      is the densest surface in the app rather than the sparsest (Oscar
//      R4 audit: "the single product card is denser than the comparison
//      row"). Lenient access (`product.merchantInfo?.rating`) keeps a stray
//      shape from breaking the table once BE lands `shipsTo` / `reviewCount`.
//   3. Sortable rows. Clicking a row label toggles sort direction; the
//      product columns reorder. Sort state is local; default is unsorted
//      (input order from the agent).
//   4. Copy-as-text. A button in the header writes a GitHub-flavoured
//      Markdown table to the clipboard. Useful for analysts pasting into
//      Numbers / Notion (Oscar R4 #5).
//   5. Sticky leftmost label column on horizontal scroll (DESIGN.md §4).
//
// `shadow-soft` only — no border on the card, hairline dividers between
// rows. §2.7 shadow-XOR-border honoured.
// ---------------------------------------------------------------------------

interface Props {
  products: NormalizedProduct[];
  axes?: string[];
}

type RowKey =
  | 'image'
  | 'price'
  | 'merchant'
  | 'shipping'
  | 'returns'
  | 'rating'
  | 'origin'
  | 'why';

// `extract` returns a value used for sorting; `render` returns the visible
// cell. Some rows (image, why) sort on a stable proxy or simply pass through
// unchanged. `sortable` gates whether the label is a clickable button.
interface RowSpec {
  key: RowKey;
  label: string;
  sortable: boolean;
  extract: (p: ProductLike) => number | string | null;
  render: (p: ProductLike) => React.ReactNode;
}

// Lenient product shape — the canonical type is `NormalizedProduct`, but
// the BE engineer is landing `shipsTo` / `reviewCount` and we want to read
// them defensively if they arrive in a payload built against an older
// schema. Optional everywhere; access guarded with `?.`.
interface MerchantInfoLenient {
  name?: string;
  rating?: number;
  returnsPolicy?: string;
  shippingDays?: string;
  carbon?: string;
  originCountry?: string;
  reviewCount?: number;
  shipsTo?: string[];
}

interface ProductLike extends Omit<NormalizedProduct, 'merchantInfo'> {
  merchantInfo?: MerchantInfoLenient;
}

const DEFAULT_AXES: RowKey[] = [
  'image',
  'price',
  'merchant',
  'shipping',
  'returns',
  'rating',
  'origin',
  'why',
];

// Free-form `axes` strings from the agent → our RowKey set. Anything that
// doesn't map drops; if every axis drops we fall back to defaults so the
// table never renders empty.
const AXIS_ALIASES: Record<string, RowKey> = {
  image: 'image',
  images: 'image',
  photo: 'image',
  price: 'price',
  cost: 'price',
  merchant: 'merchant',
  seller: 'merchant',
  store: 'merchant',
  shipping: 'shipping',
  ships: 'shipping',
  delivery: 'shipping',
  returns: 'returns',
  return: 'returns',
  policy: 'returns',
  rating: 'rating',
  reviews: 'rating',
  stars: 'rating',
  origin: 'origin',
  country: 'origin',
  made: 'origin',
  why: 'why',
  description: 'why',
  details: 'why',
};

function resolveAxes(axes: string[] | undefined): RowKey[] {
  if (!axes || axes.length === 0) return DEFAULT_AXES;
  const seen = new Set<RowKey>();
  const out: RowKey[] = [];
  // Image first regardless of `axes` — visual anchor for each column.
  seen.add('image');
  out.push('image');
  for (const raw of axes) {
    const k = AXIS_ALIASES[raw.toLowerCase()];
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  // If nothing mapped (besides the seeded image row), fall back fully.
  if (out.length <= 1) return DEFAULT_AXES;
  // Always include the "why" row at the bottom — short descriptive blurb
  // is load-bearing even when the agent didn't ask for it.
  if (!seen.has('why')) out.push('why');
  return out;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n).trim()}…`;
}

function buildRowSpec(key: RowKey): RowSpec {
  switch (key) {
    case 'image':
      return {
        key,
        label: 'Image',
        sortable: false,
        extract: (p) => p.id,
        render: (p) => {
          const src = p.images?.[0];
          if (!src) {
            return <div className="h-24 w-24 rounded-xl bg-ink-100" aria-hidden />;
          }
          return (
            <div className="relative h-24 w-24 overflow-hidden rounded-xl bg-ink-100">
              <Image
                src={src}
                alt={p.title}
                fill
                sizes="96px"
                className="object-cover"
              />
            </div>
          );
        },
      };
    case 'price':
      return {
        key,
        label: 'Price',
        sortable: true,
        extract: (p) => p.price ?? null,
        render: (p) => (
          <span className="text-sm font-semibold text-ink-900">
            {formatMoney(p.price, p.currency)}
          </span>
        ),
      };
    case 'merchant':
      return {
        key,
        label: 'Merchant',
        sortable: true,
        extract: (p) => (p.merchantInfo?.name || p.merchant || '').toLowerCase(),
        render: (p) => (
          <span className="text-sm text-ink-600">
            {p.merchantInfo?.name || p.merchant}
          </span>
        ),
      };
    case 'shipping':
      return {
        key,
        label: 'Ships in',
        sortable: true,
        // Sort key extracts a numeric day count when the shippingDays string
        // looks like "Ships in 2-3 days" / "3-5 days" / "1 day". Falls back
        // to the raw string for deterministic-but-readable sort.
        extract: (p) => {
          const s = p.merchantInfo?.shippingDays;
          if (!s) return null;
          const match = s.match(/(\d+)/);
          return match ? Number(match[1]) : s.toLowerCase();
        },
        render: (p) => {
          const s = p.merchantInfo?.shippingDays;
          return s ? (
            <span className="text-sm text-ink-600">{s}</span>
          ) : (
            <span className="text-xs italic text-ink-400">Not published</span>
          );
        },
      };
    case 'returns':
      return {
        key,
        label: 'Returns',
        sortable: true,
        extract: (p) => (p.merchantInfo?.returnsPolicy || '').toLowerCase(),
        render: (p) => {
          const r = p.merchantInfo?.returnsPolicy;
          if (!r) return <span className="text-xs italic text-ink-400">Not published</span>;
          const label =
            r === '2-day' ? '2-day returns' :
            r === '14-day' ? '14-day returns' :
            r === 'final-sale' ? 'Final sale' : r;
          const tone =
            r === '2-day' ? 'bg-emerald-50 text-emerald-600' :
            r === 'final-sale' ? 'bg-rose-50 text-rose-700' :
            'bg-ink-100 text-ink-900';
          return (
            <span className={cn('inline-flex rounded-full px-2 py-1 text-xs font-medium', tone)}>
              {label}
            </span>
          );
        },
      };
    case 'rating':
      return {
        key,
        label: 'Rating',
        sortable: true,
        // Sort high-to-low when ascending feels natural for rating, but the
        // generic toggler handles direction; we just emit a numeric key.
        extract: (p) => (typeof p.merchantInfo?.rating === 'number' ? p.merchantInfo.rating : null),
        render: (p) => {
          const r = p.merchantInfo?.rating;
          if (typeof r !== 'number') {
            return <span className="text-xs italic text-ink-400">Not published</span>;
          }
          const count = p.merchantInfo?.reviewCount;
          return (
            <span className="inline-flex items-baseline gap-1 text-sm text-ink-900">
              <span className="font-semibold">{r.toFixed(1)}</span>
              <span className="text-xs text-ink-400">/ 5</span>
              {typeof count === 'number' && count > 0 ? (
                <span className="text-xs text-ink-400">({count.toLocaleString()})</span>
              ) : null}
            </span>
          );
        },
      };
    case 'origin':
      return {
        key,
        label: 'Country',
        sortable: true,
        extract: (p) => (p.merchantInfo?.originCountry || '').toLowerCase(),
        render: (p) => {
          const display = originCountryDisplay(p.merchantInfo?.originCountry);
          return display ? (
            <span className="text-sm text-ink-600">Made in {display}</span>
          ) : (
            <span className="text-xs italic text-ink-400">Not published</span>
          );
        },
      };
    case 'why':
      return {
        key,
        label: 'Why this',
        sortable: false,
        extract: (p) => p.description || '',
        render: (p) => (
          <p className="text-sm leading-relaxed text-ink-600">
            {p.description ? truncate(p.description, 140) : '—'}
          </p>
        ),
      };
  }
}

type SortDir = 'asc' | 'desc';
interface SortState {
  key: RowKey;
  dir: SortDir;
}

function compareValues(
  a: number | string | null,
  b: number | string | null,
  dir: SortDir,
): number {
  // Push nulls to the end regardless of direction — a product with no data
  // for the sort axis shouldn't lead either ordering.
  const aNull = a == null;
  const bNull = b == null;
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  const sign = dir === 'asc' ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * sign;
  return String(a).localeCompare(String(b)) * sign;
}

function buildMarkdown(rows: RowSpec[], products: ProductLike[]): string {
  // GitHub-flavoured: header row + alignment row + one row per RowSpec.
  // The image row would dump raw URLs — useful for analysts pasting into
  // Numbers, but we skip it for a cleaner default. The "why" row is
  // truncated to keep the markdown table within a sane width.
  const renderable = rows.filter((r) => r.key !== 'image');
  const header = ['Attribute', ...products.map((p) => p.title)];
  const align = ['---', ...products.map(() => '---')];
  const body = renderable.map((row) => {
    const cells = products.map((p) => {
      const v = textForCopy(row.key, p);
      return v.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    });
    return [row.label, ...cells];
  });
  return [header, align, ...body].map((r) => `| ${r.join(' | ')} |`).join('\n');
}

function textForCopy(key: RowKey, p: ProductLike): string {
  switch (key) {
    case 'price':
      return formatMoney(p.price, p.currency);
    case 'merchant':
      return p.merchantInfo?.name || p.merchant || '';
    case 'shipping':
      return p.merchantInfo?.shippingDays || '—';
    case 'returns':
      return p.merchantInfo?.returnsPolicy || '—';
    case 'rating': {
      const r = p.merchantInfo?.rating;
      const c = p.merchantInfo?.reviewCount;
      if (typeof r !== 'number') return '—';
      return typeof c === 'number' && c > 0 ? `${r.toFixed(1)} / 5 (${c})` : `${r.toFixed(1)} / 5`;
    }
    case 'origin':
      return originCountryDisplay(p.merchantInfo?.originCountry) || '—';
    case 'why':
      return p.description ? truncate(p.description, 140) : '—';
    default:
      return '';
  }
}

export function ComparisonTable({ products, axes }: Props) {
  const rowKeys = useMemo(() => resolveAxes(axes), [axes]);
  const rows = useMemo(() => rowKeys.map(buildRowSpec), [rowKeys]);
  const [sort, setSort] = useState<SortState | null>(null);
  const [copied, setCopied] = useState(false);

  // Treat the inbound `products` as the lenient shape — the BE-engineer's
  // `shipsTo` / `reviewCount` may or may not be present on each row.
  const leniant = products as unknown as ProductLike[];

  const sortedProducts = useMemo(() => {
    if (!sort) return leniant;
    const spec = rows.find((r) => r.key === sort.key);
    if (!spec) return leniant;
    return [...leniant].sort((a, b) =>
      compareValues(spec.extract(a), spec.extract(b), sort.dir),
    );
  }, [leniant, rows, sort]);

  async function copyMarkdown() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(buildMarkdown(rows, sortedProducts));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard rejected (permissions / non-secure context). Silently
      // degrade — no toast infra at this layer.
    }
  }

  function toggleSort(key: RowKey, sortable: boolean) {
    if (!sortable) return;
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }

  if (!products.length) return null;

  const caption = axes?.length ? axes.join(' · ') : null;

  // Each product column is `w-48` (192px) so 2 fit a 640px text column and
  // 3+ overflow into horizontal scroll. The label column is sticky so the
  // axis name stays visible while scrolling product columns. Per DESIGN.md
  // §4 sticky-leftmost-column.
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-soft">
      <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-2">
        {caption ? (
          <span className="text-xs uppercase tracking-wider text-ink-400">
            {caption}
          </span>
        ) : <span />}
        <button
          type="button"
          onClick={copyMarkdown}
          aria-label="Copy comparison as Markdown"
          className={cn(
            'inline-flex items-center gap-1 rounded-full bg-ink-50 px-2 py-1 text-xs font-medium text-ink-600 transition hover:bg-ink-100 hover:text-ink-900',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
          )}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" aria-hidden /> Copied
            </>
          ) : (
            <>
              <Clipboard className="h-3 w-3" aria-hidden /> Copy as text
            </>
          )}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-32 bg-white px-4 py-3 text-xs uppercase tracking-wider text-ink-400">
                <span className="sr-only">Attribute</span>
              </th>
              {sortedProducts.map((p) => (
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
            {rows.map((row) => {
              const isSorted = sort?.key === row.key;
              const SortIcon = !row.sortable
                ? null
                : isSorted
                ? (sort?.dir === 'asc' ? ChevronUp : ChevronDown)
                : ChevronsUpDown;
              return (
                <tr key={row.key} className="border-t border-ink-100">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 w-32 bg-white px-4 py-3 align-top text-xs uppercase tracking-wider text-ink-400"
                  >
                    {row.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(row.key, row.sortable)}
                        aria-label={`Sort by ${row.label}${isSorted ? `, currently ${sort?.dir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
                        aria-sort={
                          isSorted
                            ? sort?.dir === 'asc' ? 'ascending' : 'descending'
                            : 'none'
                        }
                        className={cn(
                          'inline-flex items-center gap-1 text-left transition hover:text-ink-900',
                          isSorted && 'text-ink-900',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
                        )}
                      >
                        <span>{row.label}</span>
                        {SortIcon ? <SortIcon className="h-3 w-3" aria-hidden /> : null}
                      </button>
                    ) : (
                      <span>{row.label}</span>
                    )}
                  </th>
                  {sortedProducts.map((p) => (
                    <td key={`${row.key}-${p.id}`} className="w-48 min-w-48 px-4 py-3 align-top">
                      {row.render(p)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
