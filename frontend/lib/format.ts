// T4.K (Priya) — Round-5 polish. `formatMoney` previously hardcoded `en-US`,
// so an INR amount like ₹1,00,000 rendered with US grouping (₹100,000) — wrong
// by default for the lakh notation any Indian user expects. The function now
// accepts an optional `locale`; client-side callers pass `navigator.language`
// (via `clientLocale()` below) so the user's browser locale drives grouping
// and digit shaping. Server-render path keeps `'en-US'` as a safe fallback
// (a cycle-2 follow-up will plumb the request's accept-language through).
export function formatMoney(
  amount: number,
  currency: string,
  locale?: string,
): string {
  try {
    return new Intl.NumberFormat(locale || 'en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

// Tiny helper for `'use client'` callers. Safe under SSR (returns undefined
// when `navigator` is absent) so `formatMoney` falls back to `'en-US'` on
// server-side renders and the client hydration pass picks up the real locale.
export function clientLocale(): string | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.language || undefined;
}
