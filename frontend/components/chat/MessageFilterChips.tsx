'use client';

import { X } from 'lucide-react';
import type { AppliedFilters } from '@/lib/events';

// ---------------------------------------------------------------------------
// MessageFilterChips (2026-05-13)
//
// Right-aligned chip strip that sits directly under a user message bubble when
// the assistant's resulting product search applied filters that the user did
// NOT literally type in their message. The chips attribute *inherited* filter
// state (identity prefs, task-tier scratchpad carryover) so the user can see
// "ah, the under-$15 budget from my previous turn followed me here" and undo
// it for this turn only by tapping the X.
//
// Tap X behavior: re-run the SAME query without that filter for this turn
// only. Prefs are NOT mutated — the chip removal is one-shot. The natural-
// language directive nudges the agent to suppress the filter; the task-tier
// scratchpad's next-turn snapshot picks up the override.
//
// Design grammar (DESIGN.md §2.5 + §2.9):
//   - 6px gap to the bubble above (handled by the wrapper in MessageBubble).
//   - h-6 pill, px-2.5, rounded-full, bg-ink-50 + border-ink-100 hairline.
//   - text-xs label in text-ink-400 with value in text-ink-600.
//   - X glyph 8px right-padded, text-ink-300 → text-ink-600 on hover.
//   - 2px accent-500 focus ring.
//   - gap-1.5, single horizontal line, wraps only past 3 chips.
//   - Order: budget → size (shoppingFor proxy) → ships-to (cost → fit →
//     logistics, the decision hierarchy).
// ---------------------------------------------------------------------------

export type FilterKey = 'budget' | 'shoppingFor' | 'shippingSpeed' | 'shipsTo';

interface Props {
  userMessageText: string;
  appliedFilters: AppliedFilters | undefined;
  onRemove: (filter: FilterKey) => void;
}

// ---------------------------------------------------------------------------
// Redundancy heuristic — `wasExplicitlyTyped(key, value, text)`.
// False-negatives (chip rendered when shouldn't) are louder than false-
// positives (chip suppressed when should-render). When in doubt, suppress.
// ---------------------------------------------------------------------------

interface BudgetValue {
  min?: number;
  max?: number;
}

function budgetMentioned(text: string, value: BudgetValue): boolean {
  const lower = text.toLowerCase();
  // Bare currency hints — when any of these appear in the user's text we
  // assume budget was explicitly typed. This is intentionally liberal.
  if (/\$\s?\d/.test(lower)) return true;
  if (/\d+\s*(dollars?|usd|bucks|eur|euros?|£|gbp|inr|rupees?)/.test(lower)) return true;
  if (/(under|below|less than|cheaper than|no more than|max(?:imum)?|up to)\s+\$?\d/.test(lower)) {
    return true;
  }
  if (/(over|above|more than|at least|min(?:imum)?)\s+\$?\d/.test(lower)) return true;
  if (/budget/.test(lower)) return true;
  // Specific min/max value lookup — if the literal number is in the text and
  // it's a typical currency-shaped position, treat it as user-typed.
  const nums = [value.min, value.max].filter((n): n is number => typeof n === 'number');
  for (const n of nums) {
    const pat = new RegExp(`\\b${n}(?:\\.0+)?\\b`);
    if (pat.test(lower)) return true;
  }
  return false;
}

// Small country-name lookup. Liberal: any alias OR the raw code shows up
// suppresses the chip. The map is the long tail of "common" names a user
// types in chat; not exhaustive (Greenland, etc.) but covers the markets
// most identity-pref users select.
const COUNTRY_ALIASES: Record<string, string[]> = {
  US: ['us', 'usa', 'u.s.', 'u.s.a.', 'united states', 'america', 'stateside'],
  GB: ['gb', 'uk', 'u.k.', 'united kingdom', 'britain', 'england', 'great britain'],
  CA: ['ca', 'canada'],
  AU: ['au', 'australia', 'aus', 'oz'],
  IN: ['in', 'india', 'bharat'],
  DE: ['de', 'germany', 'deutschland'],
  FR: ['fr', 'france'],
  JP: ['jp', 'japan'],
  CN: ['cn', 'china'],
  MX: ['mx', 'mexico'],
  BR: ['br', 'brazil'],
  IT: ['it', 'italy'],
  ES: ['es', 'spain'],
  NL: ['nl', 'netherlands', 'holland'],
  SG: ['sg', 'singapore'],
  AE: ['ae', 'uae', 'emirates'],
};

function shipsToMentioned(text: string, value: string): boolean {
  const lower = text.toLowerCase();
  if (/(ship|deliver|sent|send)\b/.test(lower)) return true;
  const code = value.trim().toUpperCase();
  const aliases = COUNTRY_ALIASES[code] ?? [code.toLowerCase()];
  for (const alias of aliases) {
    // Word-boundary match on multi-word aliases is awkward with \b for
    // "u.s.a." etc., so we substring-match on bare presence. False-positives
    // ("us" inside "use") are acceptable because suppression-on-doubt is the
    // spec: a chip that fails to render is louder than one that doesn't.
    if (lower.includes(alias)) return true;
  }
  return false;
}

function shippingSpeedMentioned(text: string, value: string): boolean {
  const lower = text.toLowerCase();
  if (/(fast|quick|rush|express|overnight|next[-\s]?day|same[-\s]?day|standard|slow|economy)/.test(lower)) {
    return true;
  }
  if (/\b\d+\s*(?:-|to)?\s*\d*\s*(day|week|hour)s?\b/.test(lower)) return true;
  // The raw value (e.g. "express", "standard") might also appear verbatim.
  const v = value.trim().toLowerCase();
  if (v.length > 0 && lower.includes(v)) return true;
  return false;
}

function shoppingForMentioned(text: string, value: string): boolean {
  const lower = text.toLowerCase();
  // Strong gift / recipient signals.
  if (/(for myself|for me\b|i need|i want|my own|self)/.test(lower)) return true;
  if (/(gift|present)\b/.test(lower)) return true;
  if (/(for my|for a|for the)\s+(partner|spouse|wife|husband|mom|dad|mother|father|sister|brother|kid|kids|child|children|son|daughter|friend|boss|coworker|colleague)/.test(lower)) {
    return true;
  }
  // Liberal token-match — if the recipient word itself (e.g. "partner",
  // "kids") appears anywhere in the user's text, suppress.
  const v = value.trim().toLowerCase();
  if (v.length > 0) {
    const tokens = v.split(/\s+/).filter((t) => t.length >= 3);
    for (const t of tokens) {
      const pat = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (pat.test(lower)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Chip-content formatters — humanise the AppliedFilters value into the label
// + value pair the chip displays. The label is muted (ink-400); the value
// is the emphasised half (ink-600).
// ---------------------------------------------------------------------------

interface ChipPayload {
  key: FilterKey;
  label: string;
  value: string;
  removeAriaLabel: string;
}

function formatBudget(b: BudgetValue): ChipPayload | null {
  if (typeof b.max === 'number' && typeof b.min === 'number') {
    const v = `$${b.min}-$${b.max}`;
    return {
      key: 'budget',
      label: 'budget',
      value: v,
      removeAriaLabel: `Remove budget ${v} filter and search again`,
    };
  }
  if (typeof b.max === 'number') {
    const v = `under $${b.max}`;
    return {
      key: 'budget',
      label: '',
      value: v,
      removeAriaLabel: `Remove budget ${v} filter and search again`,
    };
  }
  if (typeof b.min === 'number') {
    const v = `over $${b.min}`;
    return {
      key: 'budget',
      label: '',
      value: v,
      removeAriaLabel: `Remove budget ${v} filter and search again`,
    };
  }
  return null;
}

function formatShoppingFor(value: string): ChipPayload {
  return {
    key: 'shoppingFor',
    label: 'for',
    value,
    removeAriaLabel: `Remove "for ${value}" filter and search again`,
  };
}

function formatShipsTo(value: string): ChipPayload {
  return {
    key: 'shipsTo',
    label: 'ships to',
    value,
    removeAriaLabel: `Remove "ships to ${value}" filter and search again`,
  };
}

function formatShippingSpeed(value: string): ChipPayload {
  return {
    key: 'shippingSpeed',
    label: 'speed',
    value,
    removeAriaLabel: `Remove "${value} shipping" filter and search again`,
  };
}

// ---------------------------------------------------------------------------
// Top-level filter detector. Returns the chips that should render, in the
// canonical decision-hierarchy order (budget → shoppingFor → shippingSpeed →
// shipsTo).
// ---------------------------------------------------------------------------

function buildChips(
  applied: AppliedFilters | undefined,
  userText: string,
): ChipPayload[] {
  if (!applied) return [];
  const chips: ChipPayload[] = [];

  if (applied.budget && (typeof applied.budget.min === 'number' || typeof applied.budget.max === 'number')) {
    if (!budgetMentioned(userText, applied.budget)) {
      const c = formatBudget(applied.budget);
      if (c) chips.push(c);
    }
  }

  if (typeof applied.shoppingFor === 'string' && applied.shoppingFor.trim().length > 0) {
    if (!shoppingForMentioned(userText, applied.shoppingFor)) {
      chips.push(formatShoppingFor(applied.shoppingFor.trim()));
    }
  }

  if (typeof applied.shippingSpeed === 'string' && applied.shippingSpeed.trim().length > 0) {
    if (!shippingSpeedMentioned(userText, applied.shippingSpeed)) {
      chips.push(formatShippingSpeed(applied.shippingSpeed.trim()));
    }
  }

  if (typeof applied.shipsTo === 'string' && applied.shipsTo.trim().length > 0) {
    if (!shipsToMentioned(userText, applied.shipsTo)) {
      chips.push(formatShipsTo(applied.shipsTo.trim()));
    }
  }

  return chips;
}

export function MessageFilterChips({ userMessageText, appliedFilters, onRemove }: Props) {
  const chips = buildChips(appliedFilters, userMessageText);
  if (chips.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="Filters applied to this search"
      // §2.9 row-alignment grammar — single horizontal line, gap-1.5, wraps
      // only past 3 chips. The wrapper in MessageBubble owns the right-edge
      // alignment (justify-end) and the 6px gap to the bubble above.
      className="flex flex-wrap items-center justify-end gap-1.5"
    >
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onRemove(chip.key)}
          aria-label={chip.removeAriaLabel}
          title="Remove for this search — manage in Profile."
          className={[
            // Hit target is the whole pill; X is decorative only.
            'group inline-flex h-6 items-center gap-1 rounded-full',
            'border border-ink-100 bg-ink-50 pl-2.5 pr-2 text-xs text-ink-400',
            'transition-colors duration-150',
            'hover:bg-ink-100 hover:text-ink-600',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
            'focus-visible:ring-offset-1 focus-visible:ring-offset-white',
          ].join(' ')}
        >
          {chip.label ? <span>{chip.label}</span> : null}
          <span className="font-medium text-ink-600">{chip.value}</span>
          <X
            aria-hidden="true"
            // 8px right-padding via the parent pr-2 (the X sits inside that
            // padding). Ink-300 isn't a token; ink-200 is the closest hairline-
            // adjacent muted value, and the hover lift to ink-600 keeps the
            // affordance legible.
            className="ml-0.5 h-3 w-3 text-ink-200 transition-colors duration-150 group-hover:text-ink-600"
            strokeWidth={2.5}
          />
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Test-surface exports — kept named to avoid polluting the public surface.
// Used by unit tests to verify the redundancy heuristic in isolation.
// ---------------------------------------------------------------------------

export const __test__ = {
  budgetMentioned,
  shipsToMentioned,
  shippingSpeedMentioned,
  shoppingForMentioned,
  buildChips,
};
