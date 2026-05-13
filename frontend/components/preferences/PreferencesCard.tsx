'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Pencil, Plus, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { PreferenceKey } from '@/lib/api';
import {
  formatPreferenceValue,
  PREFERENCE_LABEL,
  usePreferences,
} from '@/hooks/usePreferences';
import { useFocusTrap } from '@/hooks/useFocusTrap';

// ---------------------------------------------------------------------------
// PreferencesCard — Cycle 2.
//
// Desktop (>640): a sticky card above the InputBar showing 3–5 active prefs
// as inline-editable chips. Each chip: label + value + X to remove. Click
// the value → inline edit. Click + (when there's an unset key) → adds an
// editable empty chip.
//
// Mobile (≤640): collapses to a one-line "N preferences" affordance that
// opens a bottom sheet with the same chip-edit semantics.
//
// Both variants share `usePreferences` (the hook). The hook supplies the
// optimistic-update logic; this component is presentational + edit-UI only.
//
// Compliance:
//   - DESIGN.md §2.7: `shadow-soft` on the card; no border.
//   - DESIGN.md §2.5: spacing limited to 1/2/3/4.
//   - DESIGN.md §6/7: motion ≤300ms; `useReducedMotion` swaps to 100ms
//     opacity crossfades; the chip-edit swap stays under §2.8's `motion-quick`
//     budget (200ms easeOut).
//   - DESIGN.md §7: mobile tap targets ≥44px (the sheet trigger gets `h-11`;
//     individual remove-buttons use a pseudo-element hit pad).
//
// Saved affordance: `usePreferences().lastSaved` is a small {key,at} pulse
// that fades in/out for ≤2s after any commit. We render it below the card
// (desktop) or inside the trigger (mobile).
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
  const { prefs, isLoading, lastSaved } = usePreferences();
  const [sheetOpen, setSheetOpen] = useState(false);
  const reduced = useReducedMotion();

  // Stable ordering — pin to KEYS_IN_ORDER so chips don't jitter on edit.
  const activeKeys = useMemo<PreferenceKey[]>(() => {
    return KEYS_IN_ORDER.filter((k) => prefs[k] != null);
  }, [prefs]);

  const count = activeKeys.length;
  const showCard = count > 0 || isLoading;

  // Quiet on empty state on phone; on desktop we still show the placeholder
  // line so the panel's purpose is discoverable.
  return (
    <>
      {/* DESKTOP variant — sticky panel above the input bar. Hidden on
          mobile (sm:block). */}
      <section
        aria-label="About you"
        className="hidden w-full sm:block"
      >
        {showCard ? (
          <div className="relative w-full rounded-2xl bg-white p-3 shadow-soft">
            <Header count={count} />
            <ChipRow className="mt-2" />
            <SavedPulse lastSaved={lastSaved} reduced={!!reduced} />
          </div>
        ) : (
          <EmptyPrompt />
        )}
      </section>

      {/* MOBILE variant — single-line trigger that opens a bottom sheet. */}
      <section
        aria-label="About you"
        className="block w-full sm:hidden"
      >
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className={cn(
            'flex h-11 w-full items-center justify-between rounded-2xl bg-white px-4 text-sm text-ink-900 shadow-soft transition active:bg-ink-50',
          )}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
        >
          <span className="flex items-center gap-2">
            <Pencil className="h-3.5 w-3.5 text-ink-400" aria-hidden />
            <span>
              {count === 0
                ? 'About you'
                : `${count} preference${count === 1 ? '' : 's'}`}
            </span>
          </span>
          <span className="text-[11px] text-ink-400">
            {count === 0 ? 'Tap to add' : 'Edit'}
          </span>
        </button>
        <MobileSavedPulse lastSaved={lastSaved} reduced={!!reduced} />
      </section>

      <AnimatePresence>
        {sheetOpen ? (
          <BottomSheet onClose={() => setSheetOpen(false)} reduced={!!reduced}>
            <Header count={count} />
            <ChipRow className="mt-3" />
          </BottomSheet>
        ) : null}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-[11px] uppercase tracking-wider text-ink-400">
        About you
      </p>
      <p className="text-[11px] text-ink-400">
        {count === 0
          ? 'Tell me your size, budget, where you ship to'
          : 'Tap to edit · ✕ to clear'}
      </p>
    </div>
  );
}

function EmptyPrompt() {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-soft">
      <p className="text-[11px] uppercase tracking-wider text-ink-400">
        About you
      </p>
      <p className="mt-1 text-xs text-ink-400">
        I’ll save the basics here as we chat — size, budget, where you ship.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chip row — the meat of both variants.
// ---------------------------------------------------------------------------

function ChipRow({ className }: { className?: string }) {
  const { prefs, set, remove, lastRevert } = usePreferences();
  // Tracks which key is currently being edited; null = none.
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
  // Render order = persisted first, then any staged-but-unsaved.
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
      {/* T1.33 — inline revert affordance. Renders directly under the chip
          row, scoped to the failing key, auto-clears after 3s. No global
          toast. */}
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
    // Strip $ and commas, parse a number → store as {max}.
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
// Bottom sheet (mobile)
// ---------------------------------------------------------------------------

function BottomSheet({
  children,
  onClose,
  reduced,
}: {
  children: React.ReactNode;
  onClose: () => void;
  reduced: boolean;
}) {
  const sheetRef = useRef<HTMLDivElement | null>(null);

  // Modal a11y per DESIGN.md §7: focus trap + Escape to close + restore focus
  // to the previously-focused element on unmount. Cycle 2 landed this inline;
  // Cycle 3 refactor extracts the pattern into `useFocusTrap` so the
  // Shortlist mobile sheet can reuse it verbatim.
  useFocusTrap(sheetRef, { enabled: true, onClose, initialFocus: 'last' });

  const scrimT = reduced ? { duration: 0.1 } : { duration: 0.2, ease: 'easeOut' as const };
  const sheetT = reduced ? { duration: 0.1 } : { duration: 0.3, ease: 'easeOut' as const };

  return (
    <div ref={sheetRef} className="fixed inset-0 z-40 sm:hidden" role="dialog" aria-modal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={scrimT}
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/40"
        aria-hidden
      />
      <motion.div
        initial={reduced ? { opacity: 0 } : { y: '100%' }}
        animate={reduced ? { opacity: 1 } : { y: 0 }}
        exit={reduced ? { opacity: 0 } : { y: '100%' }}
        transition={sheetT}
        className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 shadow-soft"
      >
        <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-ink-100" aria-hidden />
        {children}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'inline-flex h-11 items-center rounded-full bg-ink-900 px-4 text-sm font-medium text-white transition hover:bg-ink-600',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
            )}
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saved affordance — small fade in/out pill anchored under the card.
// `lastSaved.key` is non-null for ≤2s after a commit; the hook auto-clears.
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
          className="pointer-events-none absolute -bottom-6 right-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] text-emerald-600"
          role="status"
        >
          <Check className="h-3 w-3" aria-hidden /> Saved
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function MobileSavedPulse({
  lastSaved,
  reduced,
}: {
  lastSaved: { key: string | null; at: number };
  reduced: boolean;
}) {
  return (
    <AnimatePresence>
      {lastSaved.key ? (
        <motion.p
          key={`${lastSaved.key}-${lastSaved.at}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0.1 : 0.2, ease: 'easeOut' }}
          className="mt-1 text-[11px] text-emerald-600"
          role="status"
        >
          Preference saved
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}
