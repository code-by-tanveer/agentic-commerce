/**
 * Minimal LRU cache keyed by string. Capacity 500, default TTL 15 minutes.
 * Pure JS — relies on `Map`'s insertion-order iteration for eviction.
 *
 * Used by tools to memoize MCP responses across LLM turns (ADR-0001 §
 * "free-tier math"). Bypassed by passing a unique key (or by deleting before
 * read) — there is no explicit `Cache-Control: no-store` plumbing yet.
 */

export interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 15 * 60 * 1000;
const DEFAULT_CAPACITY = 500;

export class Cache {
  private readonly store = new Map<string, CacheEntry>();
  private readonly capacity: number;
  private readonly defaultTtlMs: number;

  constructor(opts: { capacity?: number; ttlMs?: number } = {}) {
    this.capacity = opts.capacity ?? DEFAULT_CAPACITY;
    this.defaultTtlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  }

  get<T = unknown>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    // LRU touch: move to most-recent by re-inserting.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value as T;
  }

  set(key: string, value: unknown, ttlMs?: number): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.capacity) {
      // Evict oldest.
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

/** Stable JSON stringify for cache key construction (sorts object keys). */
export function stableKey(parts: unknown[]): string {
  return parts.map(stableStringify).join('|');
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** Shared process-wide cache (used by tools that don't carry one in their ctx). */
export const sharedCache = new Cache();
