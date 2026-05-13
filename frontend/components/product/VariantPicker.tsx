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
    return (
      <div className="flex flex-wrap gap-2">
        {variants.map((v) => (
          <button
            key={v.id}
            onClick={() => onSelect(v.id)}
            disabled={!v.available}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition',
              v.id === selected?.id
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400',
              !v.available && 'opacity-40',
            )}
          >
            {v.title}
          </button>
        ))}
      </div>
    );
  }

  function chooseValue(name: string, value: string) {
    const target = { ...(selected?.options ?? {}), [name]: value };
    const match = variants.find(
      (v) =>
        v.options &&
        Object.entries(target).every(([k, val]) => v.options?.[k] === val),
    );
    if (match) onSelect(match.id);
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
              return (
                <button
                  key={value}
                  onClick={() => chooseValue(group.name, value)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition',
                    active
                      ? 'border-ink-900 bg-ink-900 text-white'
                      : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400',
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
