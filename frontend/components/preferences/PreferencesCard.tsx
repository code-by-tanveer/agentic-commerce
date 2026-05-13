'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Plus, X } from 'lucide-react';
import { ETHICS_VALUES, type EthicsValue } from '@agentic/events';
import { cn } from '@/lib/cn';
import type { PreferenceKey } from '@/lib/api';
import {
  formatPreferenceValue,
  PREFERENCE_LABEL,
  usePreferences,
} from '@/hooks/usePreferences';

// ---------------------------------------------------------------------------
// PreferencesCard — Cycle 5 refactor.
//
// Previously a standalone sticky panel that lived above the InputBar with its
// own desktop/mobile fork and bottom-sheet wrapper. User feedback was that the
// always-on chrome read as intrusive ("About you feels in your face"). The
// card now renders as popover content owned by `ProfileMenu` — a quiet avatar
// affordance in the header. The chip-edit semantics (size/budget/ethics/etc
// with optimistic save and per-key revert) are unchanged; only the framing
// chrome and viewport-specific layout machinery moved out.
//
// What lives here now: a single content block — eyebrow label, chip row,
// inline revert message, transient "Saved" pulse. The popover (desktop) /
// bottom sheet (mobile) container is owned by `ProfileMenu`.
//
// Empty-state copy ("Tell me your size, budget…") lives in `ProfileMenu`
// too — the wrapper knows whether to render this content or the explainer.
//
// Compliance:
//   - DESIGN.md §2.7: shadow-soft on the popover (provided by ProfileMenu).
//   - DESIGN.md §2.5: spacing 1/2/3/4.
//   - DESIGN.md §6/7: motion ≤300ms; `useReducedMotion` collapses to 100ms
//     opacity crossfades on the chip edit-mode swap.
// ---------------------------------------------------------------------------

const KEYS_IN_ORDER: PreferenceKey[] = [
  'size',
  'budget',
  'ships_to',
  'ships_from',
  'shipping_speed',
  'palette',
  'ethics',
];

export function PreferencesCard() {
  const { lastSaved, isLoading, prefs } = usePreferences();
  const reduced = useReducedMotion();
  const count = useMemo(
    () => KEYS_IN_ORDER.filter((k) => prefs[k] != null).length,
    [prefs],
  );
  const hydrating = isLoading && count === 0;

  return (
    <div className="flex flex-col gap-2">
      <Header count={count} />
      {hydrating ? (
        <ChipSkeletonRow reduced={!!reduced} />
      ) : (
        <ChipRow />
      )}
      <SavedPulse lastSaved={lastSaved} reduced={!!reduced} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header — eyebrow inside the popover. Echoes the "About you" framing the
// avatar's aria-label uses so screen-reader users hear the same noun.
// ---------------------------------------------------------------------------

function Header({ count }: { count: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <p
        id="profile-menu-title"
        className="text-[11px] uppercase tracking-wider text-ink-400"
      >
        About you
      </p>
      <p className="text-xs text-ink-400">
        {count === 0
          ? 'Tap to add'
          : 'Tap to edit · ✕ to clear'}
      </p>
    </div>
  );
}

// Two pulsing placeholder chips while `usePreferences().isLoading` is true and
// we don't yet have any prefs to render. Mirrors `Shortlist.LaneSkeleton`:
// `animate-pulse` is suppressed under `prefers-reduced-motion`.
function ChipSkeletonRow({ reduced }: { reduced: boolean }) {
  return (
    <div aria-hidden className="flex flex-wrap items-center gap-2">
      <span
        className={cn(
          'h-6 w-20 rounded-full bg-ink-100',
          reduced ? '' : 'animate-pulse',
        )}
      />
      <span
        className={cn(
          'h-6 w-20 rounded-full bg-ink-100',
          reduced ? '' : 'animate-pulse',
        )}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chip row — the meat of the popover. Unchanged from Cycle 2 modulo the
// removal of the outer card container.
// ---------------------------------------------------------------------------

function ChipRow({ className }: { className?: string }) {
  const { prefs, set, remove, lastRevert } = usePreferences();
  const [editingKey, setEditingKey] = useState<PreferenceKey | null>(null);
  // Locally-staged "new" keys — chips that haven't been saved yet. Adding a
  // key here lets the EditableChip mount with an empty value before any
  // server round-trip. On commit, the value flows through `set(...)` and the
  // chip is owned by `prefs`; on cancel/blur with empty input, the staged
  // entry is dropped.
  const [staged, setStaged] = useState<PreferenceKey[]>([]);
  const [picking, setPicking] = useState(false);

  const persistedKeys = useMemo<PreferenceKey[]>(
    () => KEYS_IN_ORDER.filter((k) => prefs[k] != null),
    [prefs],
  );
  const activeKeys = useMemo<PreferenceKey[]>(() => {
    return [...persistedKeys, ...staged.filter((k) => prefs[k] == null)];
  }, [persistedKeys, staged, prefs]);
  const availableToAdd = KEYS_IN_ORDER.filter(
    (k) => prefs[k] == null && !staged.includes(k),
  );

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
      {activeKeys.map((key) => {
        const isStaged = prefs[key] == null;
        if (key === 'ethics') {
          return (
            <EthicsChip
              key={key}
              value={prefs[key]?.value}
              isEditing={editingKey === key || isStaged}
              onStartEdit={() => setEditingKey(key)}
              onCommitArray={async (next) => {
                setEditingKey(null);
                setStaged((s) => s.filter((x) => x !== key));
                if (next.length === 0) {
                  if (!isStaged) await remove(key);
                  return;
                }
                await set(key, next, 'user');
              }}
              onCancel={() => {
                setEditingKey(null);
                if (isStaged) setStaged((s) => s.filter((x) => x !== key));
              }}
              onRemove={() => {
                if (isStaged) {
                  setStaged((s) => s.filter((x) => x !== key));
                  return;
                }
                void remove(key);
              }}
            />
          );
        }
        return (
          <EditableChip
            key={key}
            k={key}
            value={prefs[key]?.value}
            isEditing={editingKey === key || isStaged}
            onStartEdit={() => setEditingKey(key)}
            onCommit={async (newValue) => {
              setEditingKey(null);
              setStaged((s) => s.filter((x) => x !== key));
              if (newValue.trim().length === 0) {
                if (!isStaged) await remove(key);
                return;
              }
              await set(key, parseValue(key, newValue), 'user');
            }}
            onCancel={() => {
              setEditingKey(null);
              if (isStaged) setStaged((s) => s.filter((x) => x !== key));
            }}
            onRemove={() => {
              if (isStaged) {
                setStaged((s) => s.filter((x) => x !== key));
                return;
              }
              void remove(key);
            }}
          />
        );
      })}

      {availableToAdd.length > 0 ? (
        picking ? (
          <AddPicker
            options={availableToAdd}
            onPick={(k) => {
              setPicking(false);
              setStaged((s) => (s.includes(k) ? s : [...s, k]));
              setEditingKey(k);
            }}
            onCancel={() => setPicking(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full bg-ink-50 px-2 py-1 text-xs text-ink-600 transition hover:bg-ink-100',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
            )}
          >
            <Plus className="h-3 w-3" aria-hidden /> Add
          </button>
        )
      ) : null}
      </div>
      {/* Inline revert affordance — scoped to the failing key, auto-clears
          after 3s. No global toast. */}
      {lastRevert.key ? (
        <p role="alert" className="text-xs text-rose-700">
          <span className="font-medium">{PREFERENCE_LABEL[lastRevert.key]}:</span>{' '}
          {lastRevert.message}
        </p>
      ) : null}
    </div>
  );
}

// Coerce the textarea/input string into the wire shape for each key. Free-
// form for everything except budget (numeric → max).
function parseValue(key: PreferenceKey, raw: string): unknown {
  const trimmed = raw.trim();
  if (key === 'budget') {
    const cleaned = trimmed.replace(/[\$,]/g, '').replace(/^≤/, '');
    const n = Number(cleaned);
    if (Number.isFinite(n)) return { max: n };
    return trimmed;
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Add-picker — collapsed picker that lets the user choose which key to add.
// Keeps the panel from sprouting placeholder chips for keys with nothing yet.
// ---------------------------------------------------------------------------

function AddPicker({
  options,
  onPick,
  onCancel,
}: {
  options: PreferenceKey[];
  onPick: (k: PreferenceKey) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onCancel();
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onCancel]);

  return (
    <div
      ref={ref}
      className="inline-flex items-center gap-1 rounded-full bg-ink-50 px-2 py-1"
    >
      {options.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onPick(k)}
          className={cn(
            'rounded-full px-2 py-1 text-xs text-ink-600 transition hover:bg-white',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50',
          )}
        >
          {PREFERENCE_LABEL[k]}
        </button>
      ))}
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel"
        className="rounded-full p-1 text-ink-400 hover:text-ink-900"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditableChip — either label+value+X or label+input+✓.
// ---------------------------------------------------------------------------

interface EditableChipProps {
  k: PreferenceKey;
  value: unknown;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommit: (next: string) => Promise<void> | void;
  onCancel: () => void;
  onRemove: () => void;
}

function EditableChip({
  k,
  value,
  isEditing,
  onStartEdit,
  onCommit,
  onCancel,
  onRemove,
}: EditableChipProps) {
  const formatted = formatPreferenceValue(k, value);
  const [draft, setDraft] = useState(formatted);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    setDraft(formatted);
  }, [formatted, isEditing]);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const transition = reduced ? { duration: 0.1 } : { duration: 0.15, ease: 'easeOut' as const };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-ink-50 pl-2 pr-1 py-1 text-xs',
      )}
    >
      <span className="text-ink-400">{PREFERENCE_LABEL[k]}</span>

      <AnimatePresence initial={false} mode="wait">
        {isEditing ? (
          <motion.span
            key="edit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            className="inline-flex items-center gap-1"
          >
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void onCommit(draft);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onCancel();
                }
              }}
              aria-label={`${PREFERENCE_LABEL[k]} value`}
              className={cn(
                'w-24 rounded-md bg-white px-1 py-1 text-xs text-ink-900',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
              )}
            />
            <button
              type="button"
              onClick={() => void onCommit(draft)}
              aria-label="Save"
              className="rounded-full p-1 text-ink-600 hover:text-ink-900"
            >
              <Check className="h-3 w-3" aria-hidden />
            </button>
          </motion.span>
        ) : (
          <motion.button
            key="view"
            type="button"
            onClick={onStartEdit}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            className={cn(
              'rounded-md px-1 text-ink-900 transition hover:bg-white',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-1 focus-visible:ring-offset-ink-50',
            )}
            aria-label={`Edit ${PREFERENCE_LABEL[k]}`}
          >
            {formatted || '—'}
          </motion.button>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${PREFERENCE_LABEL[k]}`}
        // Pseudo-element extends the hit area to ≥44px tall on coarse pointers.
        className={cn(
          'relative inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-400 transition hover:bg-white hover:text-ink-900',
          'before:absolute before:inset-x-0 before:-inset-y-3 before:content-[""]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-1 focus-visible:ring-offset-ink-50',
        )}
      >
        <X className="relative z-10 h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// EthicsChip — multi-select against the closed `ETHICS_VALUES` vocabulary.
// VIEW: label + comma-joined values + X. EDIT: 8-chip toggle grid + Save.
// ---------------------------------------------------------------------------

const ETHICS_OPTION_LABEL: Record<EthicsValue, string> = {
  sustainable: 'Sustainable',
  'fair-trade': 'Fair-trade',
  organic: 'Organic',
  'b-corp': 'B-Corp',
  'women-owned': 'Women-owned',
  'small-batch': 'Small-batch',
  vegan: 'Vegan',
  recycled: 'Recycled',
};

interface EthicsChipProps {
  value: unknown;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommitArray: (next: EthicsValue[]) => Promise<void> | void;
  onCancel: () => void;
  onRemove: () => void;
}

function normalizeEthicsValue(value: unknown): EthicsValue[] {
  if (Array.isArray(value)) {
    return value.filter(
      (v): v is EthicsValue =>
        typeof v === 'string' &&
        (ETHICS_VALUES as readonly string[]).includes(v),
    );
  }
  if (typeof value === 'string') {
    return (ETHICS_VALUES as readonly string[]).includes(value)
      ? [value as EthicsValue]
      : [];
  }
  return [];
}

function EthicsChip({
  value,
  isEditing,
  onStartEdit,
  onCommitArray,
  onCancel,
  onRemove,
}: EthicsChipProps) {
  const initial = useMemo(() => normalizeEthicsValue(value), [value]);
  const [draft, setDraft] = useState<EthicsValue[]>(initial);
  const reduced = useReducedMotion();

  useEffect(() => {
    setDraft(initial);
  }, [initial, isEditing]);

  function toggle(v: EthicsValue) {
    setDraft((d) => (d.includes(v) ? d.filter((x) => x !== v) : [...d, v]));
  }

  const transition = reduced
    ? { duration: 0.1 }
    : { duration: 0.15, ease: 'easeOut' as const };

  if (!isEditing) {
    const formatted =
      initial.map((v) => ETHICS_OPTION_LABEL[v]).join(', ') || '—';
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full bg-ink-50 pl-2 pr-1 py-1 text-xs',
        )}
      >
        <span className="text-ink-400">{PREFERENCE_LABEL.ethics}</span>
        <motion.button
          key="view"
          type="button"
          onClick={onStartEdit}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={transition}
          className={cn(
            'rounded-md px-1 text-ink-900 transition hover:bg-white',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-1 focus-visible:ring-offset-ink-50',
          )}
          aria-label={`Edit ${PREFERENCE_LABEL.ethics}`}
        >
          {formatted}
        </motion.button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${PREFERENCE_LABEL.ethics}`}
          className={cn(
            'relative inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-400 transition hover:bg-white hover:text-ink-900',
            'before:absolute before:inset-x-0 before:-inset-y-3 before:content-[""]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-1 focus-visible:ring-offset-ink-50',
          )}
        >
          <X className="relative z-10 h-3 w-3" aria-hidden />
        </button>
      </span>
    );
  }

  return (
    <motion.div
      key="ethics-edit"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={transition}
      role="group"
      aria-label={`${PREFERENCE_LABEL.ethics} values`}
      className={cn(
        'basis-full rounded-2xl bg-ink-50 p-3',
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-ink-400">
          {PREFERENCE_LABEL.ethics}
        </p>
        <p className="text-xs text-ink-400">
          Tap to toggle · Save to commit
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ETHICS_VALUES.map((v) => {
          const active = draft.includes(v);
          return (
            <button
              key={v}
              type="button"
              onClick={() => toggle(v)}
              aria-pressed={active}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50',
                active
                  ? 'bg-emerald-50 text-emerald-600 ring-2 ring-emerald-300'
                  : 'bg-ink-100 text-ink-600 hover:bg-white',
              )}
            >
              {ETHICS_OPTION_LABEL[v]}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            'inline-flex h-8 items-center rounded-full px-3 text-xs text-ink-600 transition hover:bg-white',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50',
          )}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void onCommitArray(draft)}
          className={cn(
            'inline-flex h-8 items-center gap-1 rounded-full bg-ink-900 px-3 text-xs font-medium text-white transition hover:bg-ink-600',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50',
          )}
        >
          <Check className="h-3 w-3" aria-hidden /> Save
        </button>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Saved affordance — small fade in/out pill that lives inline below the chip
// row. `lastSaved.key` is non-null for ≤2s after a commit; the hook auto-
// clears. Inside the popover, we anchor it inline (no absolute offset) so it
// stacks naturally above the popover's bottom edge.
// ---------------------------------------------------------------------------

function SavedPulse({
  lastSaved,
  reduced,
}: {
  lastSaved: { key: string | null; at: number };
  reduced: boolean;
}) {
  return (
    <AnimatePresence>
      {lastSaved.key ? (
        <motion.div
          key={`${lastSaved.key}-${lastSaved.at}`}
          initial={{ opacity: 0, y: reduced ? 0 : -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduced ? 0 : -4 }}
          transition={{ duration: reduced ? 0.1 : 0.2, ease: 'easeOut' }}
          className="inline-flex w-fit items-center gap-1 self-end rounded-full bg-emerald-50 px-2 py-1 text-[11px] text-emerald-600"
          role="status"
        >
          <Check className="h-3 w-3" aria-hidden /> Saved
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
