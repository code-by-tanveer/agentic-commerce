'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Plus, X } from 'lucide-react';
import { ETHICS_VALUES, type EthicsValue } from '@agentic/events';
import { cn } from '@/lib/cn';
import {
  ApiError,
  deleteGenericPreference,
  fetchPreferences,
  putGenericPreference,
  type PreferenceKey,
} from '@/lib/api';
import { useSession } from '@/hooks/useSession';
import { useConversationState } from '@/hooks/useConversation';
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
      {/* Cycle 9 (2026-05-15) — reverted to the chrome-label eyebrow. The
          Cycle-7 promotion to `font-display text-xl italic text-ink-900`
          was rolled back as part of the broader direction shift away from
          2024-editorial: the cap returns to FOUR content serif homes, and
          the ProfileMenu reads as utility chrome, not authorial voice.
          See DESIGN.md §2.4. */}
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

// ---------------------------------------------------------------------------
// DefaultFiltersSection — Round 8 polish.
//
// Backend behaviour shifted: `budget`, `shipping_speed`, and `shopping_for`
// no longer auto-persist (per-session scratchpad, evicts on topic-shift). A
// user who wants a hard $50 ceiling across every search needs an explicit
// opt-in. This section is that opt-in — three controls that write through
// the same `/preferences/:key` REST path as the chip-row, but framed as
// "defaults that survive topics" rather than "things I just said".
//
// Renders as a sibling block under the chip-row ("About you" → identity)
// and is visually subordinate: smaller header, helper subcopy, ghost empty
// state. The three controls each manage their own optimistic state.
//
// Persistence keys (backend `PREFERENCE_KEYS` enum):
//   - budget          (existing chip-row key; we reuse the hook's `set`)
//   - shipping_speed  (existing chip-row key; we reuse the hook's `set`)
//   - shopping_for    (FE chip-row doesn't surface this — written via the
//                      generic API helper, hydrated from a parallel fetch
//                      on mount so cross-tab edits land here too.)
// ---------------------------------------------------------------------------

const SHIPPING_OPTIONS: ReadonlyArray<{ value: string | null; label: string }> = [
  { value: null, label: 'Any' },
  { value: 'standard', label: 'Standard' },
  { value: 'express', label: 'Express' },
];

const SHOPPING_FOR_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: '(unset)' },
  { value: 'self', label: 'Myself' },
  { value: 'partner', label: 'A partner' },
  { value: 'kid_4_to_12', label: 'A kid (4–12)' },
  { value: 'kid_13_to_17', label: 'A kid (13–17)' },
  { value: 'adult_friend', label: 'An adult friend' },
  { value: 'parent', label: 'A parent' },
];

// ISO-4217 → glyph for the half-dozen currencies merchants publish today.
// Falls back to `$` for unknowns so the input prefix is never empty (matches
// the lowest-friction behaviour: an unknown CCY rendering a `$` prefix is
// less alarming than a blank box).
const CURRENCY_GLYPH: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CAD: 'CA$',
  AUD: 'A$',
};

function useFirstResultCurrency(): string {
  // Picks the currency off the first product in the most-recent products
  // block. Falls back to `USD` when nothing has streamed yet (initial page
  // load) or when the run had no results. Cheap to compute — messages is
  // already a memo in `useConversationState`.
  const { messages } = useConversationState();
  return useMemo(() => {
    for (const m of messages) {
      for (const b of m.blocks) {
        if (b.type === 'products' && b.products.length > 0) {
          const ccy = b.products[0].currency;
          if (ccy && typeof ccy === 'string') return ccy.toUpperCase();
        }
      }
    }
    return 'USD';
  }, [messages]);
}

function extractBudgetMax(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object') {
    const max = (value as Record<string, unknown>).max;
    if (typeof max === 'number' && Number.isFinite(max)) return max;
  }
  return null;
}

function normalizeShippingSpeed(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const lower = value.toLowerCase();
  if (lower === 'standard' || lower === 'express') return lower;
  return null;
}

function normalizeShoppingFor(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value;
}

export function DefaultFiltersSection() {
  const { prefs, set, remove } = usePreferences();
  const { sessionId } = useSession();
  const currency = useFirstResultCurrency();
  const currencyGlyph = CURRENCY_GLYPH[currency] ?? '$';

  // `shopping_for` isn't in the FE `PreferenceKey` enum (chip-row doesn't
  // render it), so we maintain a parallel local mirror. Seeded from a
  // dedicated GET on mount + when sessionId flips; written via the generic
  // helper. Hook's optimistic-revert isn't reused here — a single string
  // value with a dropdown is simple enough that a try/catch + manual revert
  // covers the failure shape.
  const [shoppingFor, setShoppingFor] = useState<string>('');
  const [shoppingForError, setShoppingForError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    fetchPreferences(sessionId)
      .then((p) => {
        if (cancelled) return;
        const raw = (p as Record<string, { value: unknown } | undefined>)[
          'shopping_for'
        ];
        setShoppingFor(normalizeShoppingFor(raw?.value));
      })
      .catch(() => {
        // Non-fatal — defaults section degrades to an empty `shopping_for`.
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const budgetMax = extractBudgetMax(prefs.budget?.value);
  const shippingSpeed = normalizeShippingSpeed(prefs.shipping_speed?.value);
  const anySet = budgetMax != null || shippingSpeed != null || shoppingFor !== '';

  // Budget input — local draft so the user can type "≤$50" or "50" without
  // every keystroke firing a PUT. Commits on blur / Enter; clears on empty.
  const [budgetDraft, setBudgetDraft] = useState<string>(
    budgetMax != null ? String(budgetMax) : '',
  );
  useEffect(() => {
    setBudgetDraft(budgetMax != null ? String(budgetMax) : '');
  }, [budgetMax]);

  const budgetHelperId = useId();

  const commitBudget = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim().replace(/[\$,≤\s]/g, '');
      if (trimmed.length === 0) {
        if (budgetMax != null) await remove('budget');
        return;
      }
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n <= 0) {
        // Bad input → restore the prior committed value as the visible draft.
        setBudgetDraft(budgetMax != null ? String(budgetMax) : '');
        return;
      }
      if (n === budgetMax) return; // no-op
      await set('budget', { max: n }, 'user');
    },
    [budgetMax, remove, set],
  );

  const commitShipping = useCallback(
    async (next: string | null) => {
      if (next === null) {
        if (shippingSpeed != null) await remove('shipping_speed');
        return;
      }
      if (next === shippingSpeed) return;
      await set('shipping_speed', next, 'user');
    },
    [remove, set, shippingSpeed],
  );

  const commitShoppingFor = useCallback(
    async (next: string) => {
      if (!sessionId) return;
      const prior = shoppingFor;
      setShoppingFor(next);
      setShoppingForError(null);
      try {
        if (next === '') {
          await deleteGenericPreference(sessionId, 'shopping_for');
        } else {
          await putGenericPreference(sessionId, 'shopping_for', next, 'user');
        }
      } catch (err) {
        setShoppingFor(prior);
        setShoppingForError(
          err instanceof ApiError ? err.message : 'Could not save — try again',
        );
      }
    },
    [sessionId, shoppingFor],
  );

  const clearAll = useCallback(async () => {
    const ops: Promise<unknown>[] = [];
    if (budgetMax != null) ops.push(remove('budget'));
    if (shippingSpeed != null) ops.push(remove('shipping_speed'));
    if (shoppingFor !== '') ops.push(commitShoppingFor(''));
    await Promise.all(ops);
  }, [budgetMax, shippingSpeed, shoppingFor, remove, commitShoppingFor]);

  return (
    <section
      aria-label="Default filters (optional)"
      className="mt-3 flex flex-col gap-3 border-t border-ink-100 pt-3"
    >
      <div className="flex flex-col gap-1">
        <p className="text-[11px] uppercase tracking-wider text-ink-400">
          Default filters (optional)
        </p>
        <h3 className="text-sm font-medium text-ink-900">Your defaults</h3>
        <p className="text-xs leading-snug text-ink-400">
          Optional. Set values that apply to every search across topics. Leave
          blank to let me ask each time.
        </p>
        {!anySet ? (
          <p className="text-xs italic text-ink-400">No defaults set</p>
        ) : null}
      </div>

      {/* Budget */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${budgetHelperId}-input`}
          className="text-xs font-medium text-ink-600"
        >
          Default budget
        </label>
        <div className="relative">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-ink-400"
          >
            {currencyGlyph}
          </span>
          <input
            id={`${budgetHelperId}-input`}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={budgetDraft}
            onChange={(e) => setBudgetDraft(e.target.value)}
            onBlur={(e) => void commitBudget(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setBudgetDraft(budgetMax != null ? String(budgetMax) : '');
                (e.target as HTMLInputElement).blur();
              }
            }}
            aria-label="Default budget cap"
            aria-describedby={budgetHelperId}
            placeholder="No default"
            className={cn(
              'h-9 w-full rounded-2xl border border-ink-100 bg-white py-2 pl-7 pr-3 text-sm text-ink-900 placeholder:text-ink-400',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
            )}
          />
        </div>
        <p id={budgetHelperId} className="text-[11px] text-ink-400">
          Applied to every search until you change it.
        </p>
      </div>

      {/* Shipping speed — segmented pills */}
      <div
        role="radiogroup"
        aria-label="Default shipping speed"
        className="flex flex-col gap-1"
      >
        <p className="text-xs font-medium text-ink-600">Default shipping speed</p>
        <div className="inline-flex w-full items-center gap-1 rounded-full bg-ink-50 p-1">
          {SHIPPING_OPTIONS.map((opt) => {
            const active = (opt.value ?? null) === shippingSpeed;
            return (
              <button
                key={opt.label}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => void commitShipping(opt.value)}
                className={cn(
                  'flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50',
                  active
                    ? 'bg-white text-ink-900 shadow-soft'
                    : 'text-ink-600 hover:bg-white/60',
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Shopping for — dropdown */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${budgetHelperId}-shopping-for`}
          className="text-xs font-medium text-ink-600"
        >
          Default shopping for
        </label>
        <select
          id={`${budgetHelperId}-shopping-for`}
          value={shoppingFor}
          onChange={(e) => void commitShoppingFor(e.target.value)}
          aria-label="Default shopping for"
          className={cn(
            'h-9 w-full rounded-2xl border border-ink-100 bg-white px-3 text-sm text-ink-900',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
          )}
        >
          {SHOPPING_FOR_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {shoppingForError ? (
          <p role="alert" className="text-xs text-rose-700">
            {shoppingForError}
          </p>
        ) : null}
      </div>

      {anySet ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void clearAll()}
            className={cn(
              'text-xs text-ink-400 transition hover:text-ink-900 hover:underline',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white rounded-sm',
            )}
          >
            Clear all defaults
          </button>
        </div>
      ) : null}
    </section>
  );
}
