'use client';

// Round-5 coordination note (FE-polish engineer): the only edits here are the
// `error` block — T4.M (Retry button bumped to h-11; scroll the block into
// view on mount under a `useEffect`) and T4.Q (`mt-0.5` → `mt-1`). If the
// FE-structural engineer's edits to this file collide, defer to their
// structure pass and re-apply the polish on a 2nd pass.

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { AlertCircle, RotateCcw, SearchX } from 'lucide-react';
import { useConversationActions, type Block } from '@/hooks/useConversation';
import { ProductCardGroup } from '../product/ProductCardGroup';
import { ComparisonTable } from '../product/ComparisonTable';
import { OutfitBundle } from '../product/OutfitBundle';
import { Moodboard } from '../product/Moodboard';
import { ToolStatus } from './ToolStatus';

// Stateless. Walks blocks in arrival order and dispatches each to its
// rendering component. The block list is what makes assistant messages
// generative UI rather than walls of text (DESIGN.md §3 principle 5).

interface Props {
  blocks: Block[];
  messageId: string;
  onRetry?: () => void;
}

export function MessageRenderer({ blocks, messageId, onRetry }: Props) {
  if (!blocks.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b, i) => (
        <BlockView
          key={blockKey(b, i)}
          block={b}
          messageId={messageId}
          onRetry={onRetry}
        />
      ))}
    </div>
  );
}

function blockKey(b: Block, i: number): string {
  if (
    b.type === 'tool_status' ||
    b.type === 'products' ||
    b.type === 'comparison' ||
    b.type === 'outfit' ||
    b.type === 'moodboard'
  ) {
    return `${b.type}:${b.toolCallId}`;
  }
  return `${b.type}:${i}`;
}

function BlockView({
  block,
  messageId,
  onRetry,
}: {
  block: Block;
  messageId: string;
  onRetry?: () => void;
}) {
  const { refineMoodboard } = useConversationActions();
  switch (block.type) {
    case 'text':
      if (!block.text) return null;
      return (
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-900">
          {block.text}
        </div>
      );

    case 'tool_status':
      return (
        <ToolStatus
          name={block.name}
          args={block.args}
          status={block.status}
          errorMessage={block.errorMessage}
        />
      );

    case 'products':
      // T1.13 — empty result set renders a recovery card instead of vanishing.
      // The prior behaviour (ProductCardGroup → null) left the user in a
      // prose-only state with no next move; the inline card surfaces both
      // the cause and two concrete escapes.
      if (block.products.length === 0) {
        return (
          <div
            role="status"
            className="flex items-start gap-3 rounded-2xl bg-ink-50 px-4 py-3 text-sm leading-relaxed text-ink-600 shadow-soft"
          >
            <SearchX className="mt-1 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
            <p>
              Nothing matched
              {block.query ? <> for <span className="font-medium text-ink-900">{block.query}</span></> : null}
              . Try fewer constraints, or paste an image of what you have in
              mind.
            </p>
          </div>
        );
      }
      // ProductCardGroup expects the existing FE Product shape. Backend's
      // NormalizedProduct is structurally compatible (and currently identical)
      // — but typed differently, so we widen via a cast at the boundary.
      return <ProductCardGroup products={block.products as never} />;

    case 'comparison':
      return <ComparisonTable products={block.products} axes={block.axes} />;

    case 'outfit':
      // OutfitBundle expects the existing FE Product shape; NormalizedProduct
      // is structurally compatible (matches Cycle 1's product-block coercion).
      // Round 2: pass the parallel `rationales` array so OutfitBundle can
      // render per-cell provenance underneath each tile.
      return (
        <OutfitBundle
          anchorProductId={block.anchorProductId}
          items={block.items as never}
          rationales={block.rationales}
          rationale={block.rationale}
        />
      );

    case 'moodboard':
      // Cycle 4 — editable attribute chips drive `refineMoodboard`, which
      // re-issues `search_catalog` with the new query.
      return (
        <Moodboard
          imageUrl={block.imageUrl}
          description={block.description}
          attributes={block.attributes}
          suggestedQuery={block.suggestedQuery}
          onRefine={(next) => void refineMoodboard(messageId, next)}
        />
      );

    case 'error':
      return (
        <ErrorBlock
          message={block.message}
          retryable={!!block.retryable}
          onRetry={onRetry}
        />
      );

    default:
      return null;
  }
}

// T4.M + T4.Q (Round 5) — error block:
//   - Retry button bumped from `h-auto px-3 py-1 text-xs` to
//     `h-11 px-4 text-sm` (44px tap target / Apple HIG). The visual remains
//     subdued (white pill on rose-50) so it doesn't read as a primary CTA.
//   - On mount the block scrolls itself into view (`block: 'nearest'`) so
//     mobile users on flaky connections see the failure rather than thinking
//     the app froze. Honours `prefers-reduced-motion` via `useReducedMotion`.
//   - AlertCircle icon spacing bumped from `mt-0.5` to `mt-1` per the §2.5
//     canonical palette (decimal spacing slipped past the sweep — T4.Q).
function ErrorBlock({
  message,
  retryable,
  onRetry,
}: {
  message: string;
  retryable: boolean;
  onRetry?: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    ref.current?.scrollIntoView({
      behavior: reduce ? 'auto' : 'smooth',
      block: 'nearest',
    });
  }, [reduce]);
  return (
    <div
      ref={ref}
      role="alert"
      className="flex items-start gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-soft"
    >
      <AlertCircle className="mt-1 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <p>{message}</p>
        {retryable && onRetry ? (
          <button
            onClick={onRetry}
            className="mt-2 inline-flex h-11 items-center gap-1 rounded-full bg-white px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-700 focus-visible:ring-offset-2 focus-visible:ring-offset-rose-50"
          >
            <RotateCcw className="h-4 w-4" />
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}
