'use client';

// NoResultsBlock — Cycle-7 AC #3, DESIGN.md §2.11.
//
// Rendered in place of `ProductCardGroup` when `search_catalog` (after the
// post-fetch price + ships_to filter) lands on zero products. DESIGN.md §2.11
// names the doc-spec component `ZeroResultsBlock`; PRODUCT.md Cycle-7 AC #3
// names the file `NoResultsBlock`. Same component, the file-name follows the
// AC and the doc reference still resolves.
//
// Why this file is here at all. Prior behaviour was a prose paragraph from
// the agent ("I couldn't find anything…") with no visual affordance. The
// inline ink-50 recovery card MessageRenderer used to render was an
// intermediate fix — it had iconography but no escape hatch and no awareness
// of which filter caused the empty payload. This block is the deterministic
// surface for the empty state: it owns the icon, names the active filters,
// and exposes the two recovery affordances (relax + edit prefs).
//
// On how it gets the active filter set. Reading DESIGN.md §2.11 closely the
// "cleanest" path is to extend the `products` SSE event with the
// `appliedFilters` the agent queried with. That requires a wire-schema bump
// in `@agentic/events` AND a churn in `useConversation.tsx`'s products-case
// reducer — and `useConversation.tsx` is on the do-not-touch list for this
// task. The next-cleanest path is already wired: the `tool_status` event
// the agent emits before the `products` event carries the verbatim parsed
// `args` (search_catalog's `{ query, filters, limit }`), and that
// `ToolStatusBlock.args` lands inside the same assistant message's
// `blocks[]`. MessageRenderer reads the sibling tool_status block by
// matching `toolCallId` and forwards `args.filters` as the
// `appliedFilters` prop. No BE schema change, no reducer change, no
// duplicated payload.
//
// On the relax-filter heuristic. DESIGN.md §2.11 hands the "which filter is
// the cheapest to drop" decision to the agent and routes a natural-language
// nudge through `useConversation.send` ("run that again without the $80
// ceiling"). For this component we take a one-step-simpler stance — drop
// price if set (most likely the killer for an "under $1" budget), else
// `ships_to` (the next most restrictive). The relaxed message reads like
// something the user would actually type, so the agent picks it up and
// re-issues `search_catalog` with the looser filter set.

import { useReducedMotion, motion } from 'framer-motion';
import { SearchX } from 'lucide-react';

// `currency` is included because `priceMax`/`priceMin` are unit-less numbers
// on the wire — the active currency code (USD, EUR, …) lives on the same
// `args.filters` payload via the search-catalog query context. We render it
// inline ("under $1") and degrade to a bare number when absent.
export interface NoResultsAppliedFilters {
  priceMax?: number;
  priceMin?: number;
  shipsTo?: string;
  currency?: string;
}

interface Props {
  query: string;
  appliedFilters?: NoResultsAppliedFilters;
  onRelax?: (relaxedQuery: string) => void;
}

// ISO-4217 → glyph for the half-dozen currencies the Shopify-side merchants
// publish today. Anything else falls back to the code as a prefix
// ("CHF 80") which is more honest than picking the wrong glyph.
const CURRENCY_GLYPH: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CAD: 'CA$',
  AUD: 'A$',
};

function formatMoney(amount: number, currency?: string): string {
  if (!currency) return `$${amount}`;
  const glyph = CURRENCY_GLYPH[currency.toUpperCase()];
  return glyph ? `${glyph}${amount}` : `${currency} ${amount}`;
}

// Build the one-line summary of active filters. Renders only the keys that
// are non-null, comma-joined. Examples:
//   ["under $1"] → "under $1"
//   ["over $50", "under $200", "ships to IN"] → "over $50, under $200, ships to IN"
function summariseFilters(f: NoResultsAppliedFilters | undefined): string {
  if (!f) return '';
  const parts: string[] = [];
  if (typeof f.priceMin === 'number') parts.push(`over ${formatMoney(f.priceMin, f.currency)}`);
  if (typeof f.priceMax === 'number') parts.push(`under ${formatMoney(f.priceMax, f.currency)}`);
  if (f.shipsTo) parts.push(`ships to ${f.shipsTo.toUpperCase()}`);
  return parts.join(', ');
}

// Compose the natural-language follow-up for the agent. Mirrors the verb the
// user would have typed, so the system prompt's instruction-following picks
// it up without bespoke routing.
export function composeRelaxedQuery(
  query: string,
  filters: NoResultsAppliedFilters | undefined,
): string {
  if (!filters) return query;
  if (typeof filters.priceMax === 'number') {
    return `${query} (without the ${formatMoney(filters.priceMax, filters.currency)} price cap)`;
  }
  if (typeof filters.priceMin === 'number') {
    return `${query} (without the ${formatMoney(filters.priceMin, filters.currency)} price floor)`;
  }
  if (filters.shipsTo) {
    return `${query} (without the ships-to ${filters.shipsTo.toUpperCase()} requirement)`;
  }
  return query;
}

export function NoResultsBlock({ query, appliedFilters, onRelax }: Props) {
  const reduce = useReducedMotion();
  const summary = summariseFilters(appliedFilters);

  function handleRelax() {
    if (!onRelax) return;
    onRelax(composeRelaxedQuery(query, appliedFilters));
  }

  function handleEditPrefs() {
    // Window-event channel. ProfileMenu owns the open/close state; firing the
    // event lets this component avoid threading the avatar's setter through
    // ConversationCanvas → Header → ProfileMenu (which would require touching
    // files on the do-not-touch list).
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('open-profile-menu'));
  }

  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.1 : 0.25, ease: 'easeOut' }}
      className="flex flex-col items-start gap-3 rounded-2xl bg-card p-6 shadow-soft"
    >
      <SearchX className="h-8 w-8 text-ink-400" aria-hidden />
      <h3 className="text-base font-medium text-ink-900">
        No matches for &ldquo;{query}&rdquo;
      </h3>
      {summary ? (
        <p className="text-sm text-ink-400">{summary}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={handleRelax}
          disabled={!onRelax}
          className="inline-flex h-10 items-center rounded-full bg-ink-900 px-4 text-sm font-medium text-white transition hover:bg-ink-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-50"
        >
          Show me more, relax filters
        </button>
        <button
          type="button"
          onClick={handleEditPrefs}
          className="text-sm text-ink-400 underline-offset-2 transition hover:text-ink-900 hover:underline focus:outline-none focus-visible:underline focus-visible:text-ink-900"
        >
          Edit your preferences
        </button>
      </div>
    </motion.div>
  );
}
