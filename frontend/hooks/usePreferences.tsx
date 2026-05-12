'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import {
  ApiError,
  deletePreference as apiDeletePreference,
  fetchPreferences,
  putPreference,
  type PreferenceKey,
  type PreferenceMap,
  type PreferenceRecord,
  type PreferenceSource,
} from '@/lib/api';

// ---------------------------------------------------------------------------
// Preferences hook (Cycle 2)
//
// - Loads the full map from `GET /api/session/:id/preferences` once on mount.
// - `set(key, value)` writes optimistically, reverts on PUT failure.
// - `remove(key)` deletes optimistically, reverts on DELETE failure.
// - `applyServerUpdate(...)` is called by `useConversation` whenever a
//   `preference_update` SSE event arrives, so the panel updates while the
//   stream is mid-flight without a refetch round-trip.
// - `lastSaved` is a small {key, at} affordance the PreferencesCard renders
//   as a fade in/out "saved" pill for ≤2s. Mirrors the cycle-2 brief.
//
// The hook is exposed via a context provider so multiple components share
// one state. We deliberately use a reducer + context (not e.g. Zustand) to
// match `useConversation`'s shape and keep dependency surface flat.
// ---------------------------------------------------------------------------

export type PrefStatus = 'idle' | 'loading' | 'error';

export interface SavedAffordance {
  key: PreferenceKey | null;
  at: number; // performance.now()-ish; 0 means "nothing fresh to show"
}

interface State {
  prefs: PreferenceMap;
  status: PrefStatus;
  error: string | null;
  lastSaved: SavedAffordance;
}

type Action =
  | { type: 'load_start' }
  | { type: 'load_success'; prefs: PreferenceMap }
  | { type: 'load_error'; message: string }
  | { type: 'set_local'; key: PreferenceKey; record: PreferenceRecord; markSaved: boolean }
  | { type: 'remove_local'; key: PreferenceKey }
  | { type: 'replace_local'; prefs: PreferenceMap }
  | { type: 'clear_saved' };

const initialState: State = {
  prefs: {},
  status: 'idle',
  error: null,
  lastSaved: { key: null, at: 0 },
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'load_start':
      return { ...state, status: 'loading', error: null };
    case 'load_success':
      return { ...state, status: 'idle', error: null, prefs: action.prefs };
    case 'load_error':
      return { ...state, status: 'error', error: action.message };
    case 'set_local': {
      const next = { ...state.prefs, [action.key]: action.record };
      return {
        ...state,
        prefs: next,
        lastSaved: action.markSaved
          ? { key: action.key, at: Date.now() }
          : state.lastSaved,
      };
    }
    case 'remove_local': {
      const next = { ...state.prefs };
      delete next[action.key];
      return { ...state, prefs: next };
    }
    case 'replace_local':
      return { ...state, prefs: action.prefs };
    case 'clear_saved':
      return { ...state, lastSaved: { key: null, at: 0 } };
    default:
      return state;
  }
}

export interface PreferencesContextValue {
  prefs: PreferenceMap;
  isLoading: boolean;
  error: string | null;
  set: (key: PreferenceKey, value: unknown, source?: PreferenceSource) => Promise<void>;
  remove: (key: PreferenceKey) => Promise<void>;
  // Called by `useConversation` when a `preference_update` SSE arrives.
  applyServerUpdate: (key: PreferenceKey, value: unknown, source: PreferenceSource) => void;
  lastSaved: SavedAffordance;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

interface ProviderProps {
  children: ReactNode;
  sessionId: string | null;
}

export function PreferencesProvider({ children, sessionId }: ProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  // Keep the last server-confirmed snapshot per key so we can revert optimistic
  // writes on failure. Refs (not state) — we don't need to render on snapshot
  // changes, only on commit/revert.
  const snapshots = useRef<Map<PreferenceKey, PreferenceRecord | undefined>>(new Map());

  // Load on session change.
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    dispatch({ type: 'load_start' });
    fetchPreferences(sessionId)
      .then((prefs) => {
        if (cancelled) return;
        dispatch({ type: 'load_success', prefs });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError ? err.message : 'Could not load preferences';
        dispatch({ type: 'load_error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Auto-clear the "saved" affordance after ≤2s.
  useEffect(() => {
    if (!state.lastSaved.key) return;
    const t = setTimeout(() => dispatch({ type: 'clear_saved' }), 2000);
    return () => clearTimeout(t);
  }, [state.lastSaved]);

  const set = useCallback<PreferencesContextValue['set']>(
    async (key, value, source = 'user') => {
      if (!sessionId) return;
      const prior = state.prefs[key];
      snapshots.current.set(key, prior);
      dispatch({
        type: 'set_local',
        key,
        record: { value, source },
        markSaved: true,
      });
      try {
        await putPreference(sessionId, key, value, source);
      } catch {
        // Revert.
        const prevPrior = snapshots.current.get(key);
        if (prevPrior === undefined) {
          dispatch({ type: 'remove_local', key });
        } else {
          dispatch({
            type: 'set_local',
            key,
            record: prevPrior,
            markSaved: false,
          });
        }
      }
    },
    [sessionId, state.prefs],
  );

  const remove = useCallback<PreferencesContextValue['remove']>(
    async (key) => {
      if (!sessionId) return;
      const prior = state.prefs[key];
      snapshots.current.set(key, prior);
      dispatch({ type: 'remove_local', key });
      try {
        await apiDeletePreference(sessionId, key);
      } catch {
        // Revert if we had something there.
        const prevPrior = snapshots.current.get(key);
        if (prevPrior !== undefined) {
          dispatch({
            type: 'set_local',
            key,
            record: prevPrior,
            markSaved: false,
          });
        }
      }
    },
    [sessionId, state.prefs],
  );

  const applyServerUpdate = useCallback<PreferencesContextValue['applyServerUpdate']>(
    (key, value, source) => {
      // Empty value = delete (mirrors backend `save_preference` with empty
      // value per PRODUCT.md move #3 acceptance).
      if (value === null || value === undefined || value === '') {
        dispatch({ type: 'remove_local', key });
        return;
      }
      dispatch({
        type: 'set_local',
        key,
        record: { value, source },
        markSaved: true,
      });
    },
    [],
  );

  const value = useMemo<PreferencesContextValue>(
    () => ({
      prefs: state.prefs,
      isLoading: state.status === 'loading',
      error: state.error,
      set,
      remove,
      applyServerUpdate,
      lastSaved: state.lastSaved,
    }),
    [state.prefs, state.status, state.error, state.lastSaved, set, remove, applyServerUpdate],
  );

  return (
    <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error('usePreferences must be used inside <PreferencesProvider>');
  }
  return ctx;
}

// Safe variant: returns `null` outside the provider rather than throwing. Used
// by `useConversation` so we can call `applyServerUpdate` without enforcing
// provider ordering (in tests the provider may not be mounted).
export function useOptionalPreferences(): PreferencesContextValue | null {
  return useContext(PreferencesContext);
}

// ---------------------------------------------------------------------------
// Helpers — format a preference value into a chip-ready string. Kept here so
// the `PreferencesCard` and any other consumer agree on display.
// ---------------------------------------------------------------------------

export const PREFERENCE_LABEL: Record<PreferenceKey, string> = {
  size: 'Size',
  budget: 'Budget',
  ships_from: 'Ships from',
  ships_to: 'Ships to',
  palette: 'Palette',
  ethics: 'Ethics',
  shipping_speed: 'Shipping',
};

export function formatPreferenceValue(key: PreferenceKey, value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (key === 'budget') return `≤$${value}`;
    return String(value);
  }
  if (typeof value === 'object') {
    // Budget might be {min?: number, max?: number}.
    const obj = value as Record<string, unknown>;
    if (key === 'budget') {
      const min = typeof obj.min === 'number' ? obj.min : null;
      const max = typeof obj.max === 'number' ? obj.max : null;
      if (min != null && max != null) return `$${min}–$${max}`;
      if (max != null) return `≤$${max}`;
      if (min != null) return `≥$${min}`;
    }
    if (key === 'ethics' && Array.isArray(value)) {
      return value.map(String).join(', ');
    }
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
}
