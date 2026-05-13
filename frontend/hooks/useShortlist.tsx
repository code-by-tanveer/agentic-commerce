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
  deleteOutfit as apiDeleteOutfit,
  deleteShortlistItem,
  fetchOutfits,
  fetchShortlist,
  getViewMode,
  postOutfit,
  putShortlistItem,
  putViewMode,
  type PostOutfitBody,
} from '@/lib/api';
import type {
  Product,
  SavedOutfit,
  ShortlistItem,
  ShortlistLane,
  ViewMode,
} from '@/types/product';
import { useSession } from './useSession';

// ---------------------------------------------------------------------------
// useShortlist (Cycle 3).
//
// Three-lane (love/maybe/skip) shortlist + saved outfits + view-mode.
// Hydrates from the BE once when sessionId is available, then mutates
// optimistically. Revert is silent on failure (matches the Cycle 2 pattern in
// `usePreferences`). View-mode persists to `sessions.view_mode` via PUT.
//
// `saveOutfit` is a composite: POST `/outfits`, then write every item into
// the Love lane via PUT-per-item. We deliberately call addToLane in sequence
// (not in parallel) so the UI counter ticks once per item and the BE rate
// limiter (60/min/IP) is comfortable.
// ---------------------------------------------------------------------------

// T1.33 — last optimistic-revert. `scope` lets the UI scope the visible line
// to the offending control (a lane / a product / an outfit).
export interface ShortlistRevertError {
  scope: string | null; // productId, outfitId, or null for generic
  message: string;
  at: number;
}

interface State {
  shortlist: ShortlistItem[];
  viewMode: ViewMode;
  isOpen: boolean;
  savedOutfits: SavedOutfit[];
  isLoading: boolean;
  lastRevert: ShortlistRevertError;
}

type Action =
  | { type: 'hydrate'; shortlist: ShortlistItem[]; outfits: SavedOutfit[]; viewMode: ViewMode }
  | { type: 'set_view_mode'; mode: ViewMode }
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'upsert_item'; item: ShortlistItem }
  | { type: 'remove_item'; productId: string }
  | { type: 'replace_shortlist'; items: ShortlistItem[] }
  | { type: 'add_outfit'; outfit: SavedOutfit }
  | { type: 'remove_outfit'; outfitId: string }
  | { type: 'replace_outfits'; outfits: SavedOutfit[] }
  | { type: 'revert'; scope: string | null; message: string }
  | { type: 'clear_revert' };

const initialState: State = {
  shortlist: [],
  viewMode: 'list',
  isOpen: false,
  savedOutfits: [],
  isLoading: true,
  lastRevert: { scope: null, message: '', at: 0 },
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'hydrate':
      return {
        ...state,
        isLoading: false,
        shortlist: action.shortlist,
        savedOutfits: action.outfits,
        viewMode: action.viewMode,
      };
    case 'set_view_mode':
      return { ...state, viewMode: action.mode };
    case 'open':
      return { ...state, isOpen: true };
    case 'close':
      return { ...state, isOpen: false };
    case 'upsert_item': {
      const idx = state.shortlist.findIndex((i) => i.productId === action.item.productId);
      if (idx === -1) return { ...state, shortlist: [...state.shortlist, action.item] };
      const next = state.shortlist.slice();
      next[idx] = action.item;
      return { ...state, shortlist: next };
    }
    case 'remove_item':
      return {
        ...state,
        shortlist: state.shortlist.filter((i) => i.productId !== action.productId),
      };
    case 'replace_shortlist':
      return { ...state, shortlist: action.items };
    case 'add_outfit':
      return { ...state, savedOutfits: [...state.savedOutfits, action.outfit] };
    case 'remove_outfit':
      return {
        ...state,
        savedOutfits: state.savedOutfits.filter((o) => o.id !== action.outfitId),
      };
    case 'replace_outfits':
      return { ...state, savedOutfits: action.outfits };
    case 'revert':
      return {
        ...state,
        lastRevert: { scope: action.scope, message: action.message, at: Date.now() },
      };
    case 'clear_revert':
      return { ...state, lastRevert: { scope: null, message: '', at: 0 } };
    default:
      return state;
  }
}

export interface ShortlistContextValue {
  shortlist: ShortlistItem[];
  viewMode: ViewMode;
  isOpen: boolean;
  isLoading: boolean;
  savedOutfits: SavedOutfit[];
  addToLane: (productId: string, lane: ShortlistLane, snapshot: Product) => Promise<void>;
  move: (productId: string, lane: ShortlistLane) => Promise<void>;
  remove: (productId: string) => Promise<void>;
  openDrawer: () => void;
  closeDrawer: () => void;
  setViewMode: (mode: ViewMode) => Promise<void>;
  saveOutfit: (body: PostOutfitBody) => Promise<SavedOutfit | null>;
  removeOutfit: (outfitId: string) => Promise<void>;
  // T1.33 — inline revert error (auto-clears after 3s).
  lastRevert: ShortlistRevertError;
}

const ShortlistContext = createContext<ShortlistContextValue | null>(null);

export function ShortlistProvider({ children }: { children: ReactNode }) {
  const { sessionId } = useSession();
  const [state, dispatch] = useReducer(reducer, initialState);
  // Snapshot ref for optimistic revert. Per-key map so concurrent edits to
  // different products don't overwrite each other's revert snapshot.
  const itemSnapshots = useRef<Map<string, ShortlistItem | undefined>>(new Map());
  const viewModeSnapshot = useRef<ViewMode>('list');
  const hydrated = useRef(false);

  // T1.33 — auto-clear the inline revert affordance after 3s.
  useEffect(() => {
    if (!state.lastRevert.at) return;
    const t = setTimeout(() => dispatch({ type: 'clear_revert' }), 3000);
    return () => clearTimeout(t);
  }, [state.lastRevert.at]);

  // Hydrate from the BE once.
  useEffect(() => {
    if (!sessionId || hydrated.current) return;
    hydrated.current = true;
    let cancelled = false;
    (async () => {
      try {
        const [shortlist, outfits, viewMode] = await Promise.all([
          fetchShortlist(sessionId),
          fetchOutfits(sessionId),
          getViewMode(sessionId),
        ]);
        if (cancelled) return;
        viewModeSnapshot.current = viewMode;
        dispatch({ type: 'hydrate', shortlist, outfits, viewMode });
      } catch {
        if (cancelled) return;
        // Silent — render an empty drawer rather than a broken one.
        dispatch({ type: 'hydrate', shortlist: [], outfits: [], viewMode: 'list' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const addToLane = useCallback<ShortlistContextValue['addToLane']>(
    async (productId, lane, snapshot) => {
      if (!sessionId) return;
      const prior = state.shortlist.find((i) => i.productId === productId);
      itemSnapshots.current.set(productId, prior);
      const next: ShortlistItem = {
        productId,
        lane,
        snapshot,
        addedAt: prior?.addedAt ?? new Date().toISOString(),
      };
      dispatch({ type: 'upsert_item', item: next });
      try {
        await putShortlistItem(sessionId, productId, { lane, snapshot });
      } catch {
        // Revert + inline error (T1.33).
        const revert = itemSnapshots.current.get(productId);
        if (revert === undefined) {
          dispatch({ type: 'remove_item', productId });
        } else {
          dispatch({ type: 'upsert_item', item: revert });
        }
        dispatch({
          type: 'revert',
          scope: productId,
          message: "Could not save — we'll keep trying",
        });
      }
    },
    [sessionId, state.shortlist],
  );

  const move = useCallback<ShortlistContextValue['move']>(
    async (productId, lane) => {
      const existing = state.shortlist.find((i) => i.productId === productId);
      if (!existing) return;
      await addToLane(productId, lane, existing.snapshot);
    },
    [addToLane, state.shortlist],
  );

  const remove = useCallback<ShortlistContextValue['remove']>(
    async (productId) => {
      if (!sessionId) return;
      const prior = state.shortlist.find((i) => i.productId === productId);
      itemSnapshots.current.set(productId, prior);
      dispatch({ type: 'remove_item', productId });
      try {
        await deleteShortlistItem(sessionId, productId);
      } catch {
        // Revert if we had something there.
        const revert = itemSnapshots.current.get(productId);
        if (revert) {
          dispatch({ type: 'upsert_item', item: revert });
        }
        dispatch({
          type: 'revert',
          scope: productId,
          message: 'Could not remove — try again',
        });
      }
    },
    [sessionId, state.shortlist],
  );

  const openDrawer = useCallback(() => dispatch({ type: 'open' }), []);
  const closeDrawer = useCallback(() => dispatch({ type: 'close' }), []);

  const setViewMode = useCallback<ShortlistContextValue['setViewMode']>(
    async (mode) => {
      if (mode === state.viewMode) return;
      const prior = viewModeSnapshot.current;
      viewModeSnapshot.current = mode;
      dispatch({ type: 'set_view_mode', mode });
      if (!sessionId) return;
      try {
        await putViewMode(sessionId, mode);
      } catch {
        viewModeSnapshot.current = prior;
        dispatch({ type: 'set_view_mode', mode: prior });
      }
    },
    [sessionId, state.viewMode],
  );

  const saveOutfit = useCallback<ShortlistContextValue['saveOutfit']>(
    async (body) => {
      if (!sessionId) return null;
      try {
        const outfit = await postOutfit(sessionId, body);
        dispatch({ type: 'add_outfit', outfit });
        // Add each item to the Love lane. Sequential — see hook header comment.
        for (const item of body.items) {
          try {
            await addToLane(item.id, 'love', item);
          } catch {
            // ignore — addToLane already self-reverts on failure
          }
        }
        return outfit;
      } catch {
        return null;
      }
    },
    [sessionId, addToLane],
  );

  const removeOutfit = useCallback<ShortlistContextValue['removeOutfit']>(
    async (outfitId) => {
      if (!sessionId) return;
      const prior = state.savedOutfits.find((o) => o.id === outfitId);
      dispatch({ type: 'remove_outfit', outfitId });
      try {
        await apiDeleteOutfit(sessionId, outfitId);
      } catch {
        if (prior) dispatch({ type: 'add_outfit', outfit: prior });
        dispatch({
          type: 'revert',
          scope: outfitId,
          message: 'Could not remove outfit — try again',
        });
      }
    },
    [sessionId, state.savedOutfits],
  );

  const value = useMemo<ShortlistContextValue>(
    () => ({
      shortlist: state.shortlist,
      viewMode: state.viewMode,
      isOpen: state.isOpen,
      isLoading: state.isLoading,
      savedOutfits: state.savedOutfits,
      addToLane,
      move,
      remove,
      openDrawer,
      closeDrawer,
      setViewMode,
      saveOutfit,
      removeOutfit,
      lastRevert: state.lastRevert,
    }),
    [
      state.shortlist,
      state.viewMode,
      state.isOpen,
      state.isLoading,
      state.savedOutfits,
      state.lastRevert,
      addToLane,
      move,
      remove,
      openDrawer,
      closeDrawer,
      setViewMode,
      saveOutfit,
      removeOutfit,
    ],
  );

  return (
    <ShortlistContext.Provider value={value}>{children}</ShortlistContext.Provider>
  );
}

export function useShortlist(): ShortlistContextValue {
  const ctx = useContext(ShortlistContext);
  if (!ctx) {
    throw new Error('useShortlist must be used inside <ShortlistProvider>');
  }
  return ctx;
}

// Safe variant — returns null outside the provider. Used by ProductCard so
// tests / story environments without the provider don't crash.
export function useOptionalShortlist(): ShortlistContextValue | null {
  return useContext(ShortlistContext);
}

// Small drag payload helper, kept in the hook so both the drag source
// (ProductCard) and the drop target (Shortlist lane) reference one shape.
export interface DragPayload {
  productId: string;
  snapshot: Product;
}

export const DRAG_MIME = 'application/json';

export function encodeDragPayload(p: DragPayload): string {
  return JSON.stringify(p);
}

export function decodeDragPayload(raw: string): DragPayload | null {
  try {
    const obj = JSON.parse(raw) as unknown;
    if (
      obj &&
      typeof obj === 'object' &&
      'productId' in obj &&
      'snapshot' in obj &&
      typeof (obj as { productId: unknown }).productId === 'string'
    ) {
      return obj as DragPayload;
    }
    return null;
  } catch {
    return null;
  }
}
