'use client';

import { MapPin, Star, Store, Truck, Leaf, RefreshCcw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { originCountryDisplay } from '@/lib/country';
import type { MerchantInfo } from '@/types/product';

// ---------------------------------------------------------------------------
// MerchantBlock — Cycle 2.
//
// Rendered inside the expanded ProductCard, before the Buy area. Surfaces
// merchant transparency per PRODUCT.md move #5:
//
//   - seller name (always)
//   - rating (compact 5-star)
//   - return policy badge:
//       '2-day'      → emerald  (success)
//       '14-day'     → ink-tint (neutral)
//       'final-sale' → rose     (danger)
//   - shipping speed string
//   - carbon line in `text-quiet` (optional)
//
// Empty fields → "merchant didn't publish this" line per acceptance #4.
// Multiple missing fields collapse to a single trailing line listing them
// together rather than per-field placeholders.
//
// DESIGN.md §2.7 — uses dividers (`border-t border-ink-100`) which are
// hairlines, not card borders. The whole block sits inside the ProductCard's
// shadow scope; no shadow of its own.
// ---------------------------------------------------------------------------

interface Props {
  info?: MerchantInfo;
  className?: string;
}

interface ReturnsBadge {
  text: string;
  className: string;
}

function returnsBadge(policy: string | undefined): ReturnsBadge | null {
  if (!policy) return null;
  switch (policy) {
    case '2-day':
      return { text: '2-day returns', className: 'bg-emerald-50 text-emerald-600' };
    case '14-day':
      return { text: '14-day returns', className: 'bg-ink-100 text-ink-900' };
    case 'final-sale':
      return { text: 'Final sale', className: 'bg-rose-50 text-rose-700' };
    default:
      // Trust an arbitrary string — render in the neutral treatment.
      return { text: policy, className: 'bg-ink-100 text-ink-900' };
  }
}

export function MerchantBlock({ info, className }: Props) {
  // Silent degrade — PRODUCT.md acceptance #5: never show a fake block.
  if (!info || !info.name) return null;

  const badge = returnsBadge(info.returnsPolicy);

  // Track which optional fields are missing so we can render a single
  // "merchant didn't publish this" line at the bottom instead of a placeholder
  // per row.
  const missing: string[] = [];
  if (info.rating == null) missing.push('rating');
  if (!info.returnsPolicy) missing.push('return policy');
  if (!info.shippingDays) missing.push('shipping speed');
  // Round 2 polish (T2.11, persona-sasha): country-of-origin is a load-bearing
  // signal for values-led shoppers (Sasha: "Made in: IT vs Made in PRC — same
  // product card today"). When absent, we list it alongside the other missing
  // fields rather than render a placeholder — same "merchant didn't publish
  // this" trust pattern (PRODUCT.md acceptance #5) the rest of the block uses.
  if (!info.originCountry) missing.push('country of origin');
  // carbon is "optional" per spec — absence isn't worth flagging.
  const originDisplay = originCountryDisplay(info.originCountry);

  return (
    <div
      className={cn(
        'flex flex-col gap-2 border-t border-ink-100 pt-3',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1 text-sm font-medium text-ink-900">
          <Store className="h-3.5 w-3.5 text-ink-400" aria-hidden />
          <span className="truncate">{info.name}</span>
        </span>

        {typeof info.rating === 'number' ? (
          <StarRating value={info.rating} />
        ) : null}

        {badge ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
              badge.className,
            )}
          >
            <RefreshCcw className="h-3 w-3" aria-hidden />
            {badge.text}
          </span>
        ) : null}
      </div>

      {info.shippingDays ? (
        <p className="inline-flex items-center gap-1 text-xs text-ink-600">
          <Truck className="h-3 w-3 text-ink-400" aria-hidden />
          {info.shippingDays}
        </p>
      ) : null}

      {originDisplay ? (
        <p className="inline-flex items-center gap-1 text-xs text-ink-600">
          <MapPin className="h-3 w-3 text-ink-400" aria-hidden />
          Made in {originDisplay}
        </p>
      ) : null}

      {info.carbon ? (
        <p className="inline-flex items-center gap-1 text-[11px] text-ink-400">
          <Leaf className="h-3 w-3" aria-hidden />
          {info.carbon}
        </p>
      ) : null}

      {missing.length > 0 ? (
        <p className="text-[11px] italic text-ink-400">
          Merchant didn’t publish {formatList(missing)}.
        </p>
      ) : null}
    </div>
  );
}

function formatList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`;
}

function StarRating({ value }: { value: number }) {
  // Compact 5-star — fill count = floor(value); a half-star is rendered when
  // the fractional part ≥ 0.25 (rough visual round-up to nearest half).
  const clamped = Math.max(0, Math.min(5, value));
  const full = Math.floor(clamped);
  const remainder = clamped - full;
  const half = remainder >= 0.25 && remainder < 0.75;
  const empty = 5 - full - (half ? 1 : 0);

  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs text-ink-600"
      aria-label={`Rated ${clamped.toFixed(1)} out of 5`}
    >
      {[...Array(full)].map((_, i) => (
        <Star
          key={`full-${i}`}
          className="h-3 w-3 fill-ink-900 text-ink-900"
          aria-hidden
        />
      ))}
      {half ? (
        <span className="relative inline-block h-3 w-3" aria-hidden>
          <Star className="absolute inset-0 h-3 w-3 text-ink-900" />
          <span className="absolute inset-y-0 left-0 w-1/2 overflow-hidden">
            <Star className="h-3 w-3 fill-ink-900 text-ink-900" />
          </span>
        </span>
      ) : null}
      {[...Array(empty)].map((_, i) => (
        <Star
          key={`empty-${i}`}
          className="h-3 w-3 text-ink-200"
          aria-hidden
        />
      ))}
      <span className="ml-1 text-[11px] text-ink-400">
        {clamped.toFixed(1)}
      </span>
    </span>
  );
}
