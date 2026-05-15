'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  useConversationActions,
  useConversationState,
} from '@/hooks/useConversation';
import { useUpload } from '@/hooks/useUpload';

// ---------------------------------------------------------------------------
// ImageDropzone — Cycle 4.
//
// Idle: invisible (DESIGN.md §4: "no 'drop here' affordance at rest").
// Drag-over: a full-viewport overlay with a dashed `accent-200` inner frame
// fades in; the only copy is "Drop to attach" in `text-quiet text-xs`.
//
// Implementation notes:
//   - Listens on `document` so the user can drop anywhere on the page, not
//     just over the input bar. The cleanup on unmount is non-negotiable.
//   - Drag events bubble; `dragenter`/`dragleave` fire on every nested
//     element. We track a counter to know when the drag has actually left
//     the document, not just moved between children (the classic flicker).
//   - On `drop`: prevent the browser's default (which would navigate to the
//     dropped file), grab the first File, upload, then dispatch a user
//     message of form "find me something like this" with the signed URL
//     attached (via `useConversation.send`'s `imageUrl` option).
//   - We swallow only image-typed drags so non-image drops (e.g. text from
//     another tab) don't trigger the overlay. `e.dataTransfer.types`
//     includes 'Files' when a file is being dragged.
//
// Motion: opacity-only fade for the overlay, 150ms easeOut (DESIGN.md §6).
// `useReducedMotion` collapses to a 100ms crossfade.
// ---------------------------------------------------------------------------

interface Props {
  children?: ReactNode;
}

export function ImageDropzone({ children }: Props) {
  const { send } = useConversationActions();
  const { isStreaming } = useConversationState();
  const { upload, isUploading, error, clearError } = useUpload();
  const reduced = useReducedMotion();
  const [isDragging, setIsDragging] = useState(false);
  // Counter tracks nested-element enter/leave bubbling. Drag actually leaves
  // the document only when the count returns to zero.
  const dragCounter = useRef(0);

  const handleFile = useCallback(
    async (file: File) => {
      if (isStreaming || isUploading) return;
      // Best-effort early guard. Backend's magic-byte sniff is the real check.
      if (!file.type.startsWith('image/')) return;
      const res = await upload(file);
      if (!res) return;
      await send('find me something like this', { imageUrl: res.url });
    },
    [isStreaming, isUploading, send, upload],
  );

  useEffect(() => {
    function hasFiles(e: DragEvent): boolean {
      const types = e.dataTransfer?.types;
      if (!types) return false;
      // `types` is a DOMStringList-like object. Iterate defensively.
      for (let i = 0; i < types.length; i++) {
        if (types[i] === 'Files') return true;
      }
      return false;
    }

    function onDragEnter(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounter.current += 1;
      if (dragCounter.current === 1) setIsDragging(true);
    }
    function onDragOver(e: DragEvent) {
      if (!hasFiles(e)) return;
      // preventDefault is what makes the element a valid drop target.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    }
    function onDragLeave(e: DragEvent) {
      if (!hasFiles(e)) return;
      dragCounter.current = Math.max(0, dragCounter.current - 1);
      if (dragCounter.current === 0) setIsDragging(false);
    }
    function onDrop(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounter.current = 0;
      setIsDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) void handleFile(file);
    }
    function onDragEnd() {
      dragCounter.current = 0;
      setIsDragging(false);
    }

    document.addEventListener('dragenter', onDragEnter);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('drop', onDrop);
    document.addEventListener('dragend', onDragEnd);
    return () => {
      document.removeEventListener('dragenter', onDragEnter);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('dragleave', onDragLeave);
      document.removeEventListener('drop', onDrop);
      document.removeEventListener('dragend', onDragEnd);
    };
  }, [handleFile]);

  const fade = reduced
    ? { duration: 0.1, ease: 'easeOut' as const }
    : { duration: 0.15, ease: 'easeOut' as const };

  return (
    <>
      {children}
      <AnimatePresence>
        {isDragging ? (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
            // z-50 per DESIGN.md §5 z-index palette (dropzone overlay = 50).
            className="pointer-events-auto fixed inset-0 z-50 bg-ink-900/10 backdrop-blur-sm"
            aria-hidden="true"
          >
            <div className="absolute inset-4 grid place-items-center rounded-3xl border-2 border-dashed border-accent-200 bg-card/50">
              <p className="text-xs text-ink-400">Drop to attach</p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Upload error toast (inline, near the input bar bottom). */}
      <AnimatePresence>
        {error ? (
          <motion.div
            key="upload-error"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={fade}
            role="alert"
            className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full bg-rose-50 px-4 py-2 text-xs text-rose-700 shadow-soft"
          >
            <button
              type="button"
              onClick={clearError}
              className="text-rose-700 hover:text-rose-900"
            >
              Upload failed — {error}. Tap to dismiss.
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
