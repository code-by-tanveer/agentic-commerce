'use client';

import { AlertCircle, RotateCcw } from 'lucide-react';
import type { Block } from '@/hooks/useConversation';
import { ProductCardGroup } from '../product/ProductCardGroup';
import { ComparisonTable } from '../product/ComparisonTable';
import { OutfitBundle } from '../product/OutfitBundle';
import { ToolStatus } from './ToolStatus';

// Stateless. Walks blocks in arrival order and dispatches each to its
// rendering component. The block list is what makes assistant messages
// generative UI rather than walls of text (DESIGN.md §3 principle 5).

interface Props {
  blocks: Block[];
  onRetry?: () => void;
}

export function MessageRenderer({ blocks, onRetry }: Props) {
  if (!blocks.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b, i) => (
        <BlockView key={blockKey(b, i)} block={b} onRetry={onRetry} />
      ))}
    </div>
  );
}

function blockKey(b: Block, i: number): string {
  if (
    b.type === 'tool_status' ||
    b.type === 'products' ||
    b.type === 'comparison' ||
    b.type === 'outfit'
  ) {
    return `${b.type}:${b.toolCallId}`;
  }
  return `${b.type}:${i}`;
}

function BlockView({ block, onRetry }: { block: Block; onRetry?: () => void }) {
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
      // ProductCardGroup expects the existing FE Product shape. Backend's
      // NormalizedProduct is structurally compatible (and currently identical)
      // — but typed differently, so we widen via a cast at the boundary.
      return <ProductCardGroup products={block.products as never} />;

    case 'comparison':
      return <ComparisonTable products={block.products} axes={block.axes} />;

    case 'outfit':
      // OutfitBundle expects the existing FE Product shape; NormalizedProduct
      // is structurally compatible (matches Cycle 1's product-block coercion).
      return (
        <OutfitBundle
          anchorProductId={block.anchorProductId}
          items={block.items as never}
          rationale={block.rationale}
        />
      );

    case 'error':
      return (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-soft"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p>{block.message}</p>
            {block.retryable && onRetry ? (
              <button
                onClick={onRetry}
                className="mt-2 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100"
              >
                <RotateCcw className="h-3 w-3" />
                Retry
              </button>
            ) : null}
          </div>
        </div>
      );

    default:
      return null;
  }
}
