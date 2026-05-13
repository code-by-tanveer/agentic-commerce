'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

// Invisible-AI per DESIGN.md §3 principle 1: a tiny verb + object, dim, never
// "Calling tool `search_catalog`". Spinner is a single rotating dot (Granola
// reference), not the chat TypingIndicator.

export type ToolStatusKind = 'running' | 'done' | 'error';

interface Props {
  name: string;
  args?: unknown;
  status: ToolStatusKind;
  errorMessage?: string;
}

const VERBS: Record<string, string> = {
  search_catalog: 'Searching',
  get_product_details: 'Loading details for',
  compare_products: 'Comparing',
};

function verb(name: string): string {
  return VERBS[name] ?? 'Working on';
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function describeArgs(name: string, args: unknown): string {
  if (!args || typeof args !== 'object') return '';
  const a = args as Record<string, unknown>;

  // Prefer obvious freeform strings.
  const query = asString(a.query) ?? asString(a.text) ?? asString(a.q);
  if (query) return query;

  // Compare: report a count of ids.
  if (name === 'compare_products') {
    const ids = Array.isArray(a.productIds)
      ? a.productIds
      : Array.isArray(a.ids)
        ? a.ids
        : null;
    if (ids) return `${ids.length} products`;
  }

  // Single-id lookup.
  const id = asString(a.productId) ?? asString(a.id);
  if (id) return id;

  return '';
}

export function ToolStatus({ name, args, status, errorMessage }: Props) {
  const reduced = useReducedMotion();
  const label = `${verb(name)} ${describeArgs(name, args)}`.trim();

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-xs text-ink-400',
        status === 'error' && 'text-rose-700',
      )}
      role="status"
      aria-live="polite"
    >
      <Indicator status={status} reduced={!!reduced} />
      <span className="truncate">
        {label}
        {status === 'error' && errorMessage ? ` — ${errorMessage}` : null}
      </span>
    </div>
  );
}

function Indicator({ status, reduced }: { status: ToolStatusKind; reduced: boolean }) {
  if (status === 'done') {
    return (
      <motion.span
        key="check"
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
        transition={{ duration: reduced ? 0.1 : 0.2, ease: 'easeOut' }}
        className="inline-flex h-3 w-3 items-center justify-center"
        aria-hidden
      >
        <Check className="h-3 w-3" strokeWidth={2.5} />
      </motion.span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex h-3 w-3 items-center justify-center" aria-hidden>
        <AlertCircle className="h-3 w-3" strokeWidth={2.5} />
      </span>
    );
  }
  // Running — single rotating dot (Granola-style), or opacity pulse when
  // prefers-reduced-motion is set.
  if (reduced) {
    return (
      <motion.span
        className="inline-block h-2 w-2 rounded-full bg-ink-400"
        animate={{ opacity: [0.35, 1, 0.35] }}
        transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden
      />
    );
  }
  return (
    <motion.span
      className="inline-block h-3 w-3"
      animate={{ rotate: 360 }}
      transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
      aria-hidden
    >
      <span className="block h-2 w-2 rounded-full bg-ink-400" />
    </motion.span>
  );
}
