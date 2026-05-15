'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/cn';

// ---------------------------------------------------------------------------
// Moodboard — Cycle 4.
//
// Small card that surfaces the vision tool's extracted style: a thumbnail
// (≤128px) + a wrap-flowing row of editable attribute chips + a caption with
// the suggested query. Renders BEFORE the search-result `products` block
// inside the same assistant message (see MessageRenderer dispatch order).
//
// DESIGN.md §4: "small card, NOT a hero". `shadow-soft` only, no border
// (§2.7 shadow-XOR-border). Thumbnail capped at 128px on the longest edge.
//
// Editing model:
//   - Each chip has a small X-on-hover (always visible on coarse pointers)
//     that removes it from local state.
//   - A trailing "+ Add" affordance toggles to an inline `<input>`; Enter
//     commits, Escape cancels.
//   - When the chip set differs from the props on commit, we call onRefine
//     with the new set. Parent (useConversation) re-issues the search.
//
// Motion (DESIGN.md §6 budget): chip entry stagger ≤200ms total, 40ms apart
// capped at 5 chips. Reduced-motion → instant.
// ---------------------------------------------------------------------------

interface Props {
  imageUrl: string;
  description: string;
  attributes: string[];
  suggestedQuery: string;
  onRefine?: (attributes: string[]) => void;
}

export function Moodboard({
  imageUrl,
  description,
  attributes,
  suggestedQuery,
  onRefine,
}: Props) {
  const reduced = useReducedMotion();
  // Local, optimistic copy of the attribute list. Sync when props change
  // (a fresh moodboard arrives for a new turn).
  const [chips, setChips] = useState<string[]>(attributes);
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  // Snapshot of the last set we reported via onRefine so we don't re-fire
  // for no-op edits (e.g. add-then-remove the same chip).
  const lastReportedRef = useRef<string>(attributes.join('␟'));

  useEffect(() => {
    setChips(attributes);
    lastReportedRef.current = attributes.join('␟');
  }, [attributes]);

  useEffect(() => {
    if (isAdding) inputRef.current?.focus();
  }, [isAdding]);

  const commitChange = useCallback(
    (next: string[]) => {
      setChips(next);
      const key = next.join('␟');
      if (key !== lastReportedRef.current) {
        lastReportedRef.current = key;
        onRefine?.(next);
      }
    },
    [onRefine],
  );

  function removeAt(i: number) {
    commitChange(chips.filter((_, idx) => idx !== i));
  }

  function commitDraft() {
    const v = draft.trim();
    if (!v) {
      setIsAdding(false);
      setDraft('');
      return;
    }
    // Light dedupe — case-insensitive. Vision output is lowercase by
    // convention but users type whatever.
    const exists = chips.some((c) => c.toLowerCase() === v.toLowerCase());
    if (!exists) {
      commitChange([...chips, v]);
    }
    setDraft('');
    setIsAdding(false);
  }

  function onDraftKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitDraft();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft('');
      setIsAdding(false);
    }
  }

  const entryInitial = reduced ? { opacity: 0 } : { opacity: 0, y: 4 };
  const entryAnimate = reduced ? { opacity: 1 } : { opacity: 1, y: 0 };

  // The vision tool returns the inbound `imageUrl` verbatim, which for the
  // production flow is a `signed:<token>...` string minted by /api/upload.
  // That scheme is opaque to the browser — feeding it to <Image> emits a
  // broken-image icon. We only render the thumbnail when the URL is
  // actually loadable (http/https/data/blob); otherwise we drop the image
  // cell and the attribute chips carry the cell on their own. The agent's
  // `extract_style_from_image` description already directs the LLM to ship
  // signed: URLs, so this is the expected production path.
  const isRenderableUrl =
    /^(https?:|data:|blob:)/i.test(imageUrl ?? '');

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0.1 : 0.25, ease: 'easeOut' }}
      className="surface-glass-card flex flex-col gap-2 rounded-2xl p-3"
      aria-label="Image attributes"
    >
      <div className="flex items-start gap-3">
        {isRenderableUrl ? (
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-ink-100 sm:h-32 sm:w-32">
            {/* Sized to DESIGN.md §4 Moodboard spec: max 128px. We keep aspect
                by clamping both axes; vision tool's source image may be any
                ratio so object-cover trims sensibly. T4.N — next/image with
                fill; parent is the sized box. */}
            <Image
              src={imageUrl}
              alt={description || 'Uploaded reference image'}
              fill
              sizes="(max-width: 640px) 96px, 128px"
              className="object-cover"
            />
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div
            className="flex flex-wrap items-center gap-2"
            role="list"
            aria-label="Extracted attributes"
          >
            {chips.map((c, i) => (
              <motion.span
                key={`${c}-${i}`}
                role="listitem"
                initial={entryInitial}
                animate={entryAnimate}
                transition={{
                  duration: reduced ? 0.1 : 0.2,
                  delay: reduced ? 0 : Math.min(i, 5) * 0.04,
                  ease: 'easeOut',
                }}
                className={cn(
                  'group relative inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-1 text-xs font-medium text-ink-900',
                )}
              >
                <span>{c}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAt(i);
                  }}
                  aria-label={`Remove ${c}`}
                  className={cn(
                    'relative grid h-4 w-4 place-items-center rounded-full text-ink-400 transition hover:bg-ink-200 hover:text-ink-900',
                    // 44px touch target via transparent pseudo-element
                    // overlay (DESIGN.md §7 a11y).
                    'before:absolute before:-inset-3 before:content-[""]',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-1',
                    // On hover-capable pointers, fade the X in on chip hover
                    // so the row reads quieter when not being edited.
                    '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100',
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
              </motion.span>
            ))}

            {isAdding ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onDraftKeyDown}
                onBlur={commitDraft}
                placeholder="add attribute"
                aria-label="Add attribute"
                className="inline-flex h-7 min-w-[6rem] rounded-full bg-ink-100 px-3 text-xs text-ink-900 placeholder:text-ink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
              />
            ) : (
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                aria-label="Add attribute"
                className={cn(
                  'relative inline-flex items-center gap-1 rounded-full bg-card px-2 py-1 text-xs font-medium text-ink-600 shadow-soft transition hover:text-ink-900',
                  'before:absolute before:-inset-3 before:content-[""]',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-1',
                )}
              >
                <Plus className="h-3 w-3" />
                <span>Add</span>
              </button>
            )}
          </div>

          {suggestedQuery ? (
            <p className="text-xs text-ink-400">Searching for: {suggestedQuery}</p>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
