'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import type { Variant } from '@/types/product';

interface Props {
  variants: Variant[];
  selectedId: string;
  onSelect: (id: string) => void;
}

interface OptionGroup {
  name: string;
  values: string[];
}

function buildGroups(variants: Variant[]): OptionGroup[] {
  const map = new Map<string, Set<string>>();
  for (const v of variants) {
    if (!v.options) continue;
    for (const [name, value] of Object.entries(v.options)) {
      if (!map.has(name)) map.set(name, new Set());
      map.get(name)!.add(value);
    }
  }
  return Array.from(map.entries()).map(([name, values]) => ({ name, values: Array.from(values) }));
}

export function VariantPicker({ variants, selectedId, onSelect }: Props) {
  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];
  const groups = useMemo(() => buildGroups(variants), [variants]);

  if (!groups.length) {
    // Plain variant list when there are no structured options.
    // T1.30 — gap-1.5 → gap-2 (no decimal spacing).
    // Cycle 7 polish — focus-visible ring per DESIGN.md §7 ("Every
    // interactive element gets a visible focus ring"); strikethrough on
    // unavailable variants per DESIGN.md §4 VariantPicker ("option-
    // unavailable (struck through)"). The previous opacity-only treatment
    // missed the spec and read as "loading", not "unavailable".
    return (
      <div className="flex flex-wrap gap-2">
        {variants.map((v) => {
          const active = v.id === selected?.id;
          return (
            <button
              key={v.id}
              type="button"
              data-testid="variant-chip"
              data-active={active}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(v.id);
              }}
              disabled={!v.available}
              aria-disabled={!v.available}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
                active
                  ? 'border-ink-900 bg-ink-900 text-white'
                  : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400',
                !v.available && 'cursor-not-allowed text-ink-400 line-through opacity-60',
              )}
            >
              {v.title}
            </button>
          );
        })}
      </div>
    );
  }

  function chooseValue(name: string, value: string) {
    // Prefer an exact match across all current option dimensions; fall back to
    // a partial match on just the changed axis so the picker still switches
    // for products whose variants don't enumerate every option combination
    // (real Shopify catalogs sometimes have sparse option matrices — this
    // was the silent-no-op the user hit).
    const target = { ...(selected?.options ?? {}), [name]: value };
    const exact = variants.find(
      (v) =>
        v.options &&
        Object.entries(target).every(([k, val]) => v.options?.[k] === val),
    );
    if (exact) {
      onSelect(exact.id);
      return;
    }
    const partial = variants.find((v) => v.options?.[name] === value);
    if (partial) onSelect(partial.id);
  }

  return (
    // T1.30 — space-y-2.5 → space-y-2 / gap-1.5 → gap-2 (no decimal spacing).
    <div className="space-y-2">
      {groups.map((group) => (
        <div key={group.name}>
          <p className="mb-1 text-[11px] uppercase tracking-wider text-ink-400">{group.name}</p>
          <div className="flex flex-wrap gap-2">
            {group.values.map((value) => {
              const active = selected?.options?.[group.name] === value;
              // Cycle 7 — surface unavailable value-combos (no matching variant
              // is available across the current selection). Struck-through per
              // DESIGN.md §4 VariantPicker. The button still selects so users
              // can pivot to that value and see other axes update.
              const matched = variants.find(
                (v) => v.options?.[group.name] === value,
              );
              const isUnavailable = matched ? !matched.available : false;
              return (
                <button
                  key={value}
                  type="button"
                  data-testid="variant-chip"
                  data-active={active}
                  onClick={(e) => {
                    e.stopPropagation();
                    chooseValue(group.name, value);
                  }}
                  aria-pressed={active}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition',
                    // DESIGN.md §7 — visible focus ring on `:focus-visible`.
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
                    active
                      ? 'border-ink-900 bg-ink-900 text-white'
                      : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400',
                    isUnavailable && 'text-ink-400 line-through',
                  )}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
