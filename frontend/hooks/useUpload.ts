'use client';

import { useCallback, useRef, useState } from 'react';
import { ApiError, uploadImage, type UploadedImage } from '@/lib/api';

// ---------------------------------------------------------------------------
// useUpload — thin wrapper over `lib/api.ts::uploadImage` that tracks
// in-flight state for the dropzone overlay + paperclip button + paste
// listener (all three share this hook so only one upload at a time can be
// in flight per mount).
//
// Errors are surfaced as strings so the caller can render an inline retry
// banner without re-throwing across the React boundary. The underlying
// `ApiError` is preserved on `.error` only as a message string — callers
// don't need the status today.
// ---------------------------------------------------------------------------

export interface UseUpload {
  upload: (file: File) => Promise<UploadedImage | null>;
  isUploading: boolean;
  error: string | null;
  clearError: () => void;
}

export function useUpload(): UseUpload {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Latest abort controller so unmount / quick re-trigger cancels prior work.
  const abortRef = useRef<AbortController | null>(null);

  const upload = useCallback(async (file: File): Promise<UploadedImage | null> => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setError(null);
    setIsUploading(true);
    try {
      const res = await uploadImage(file, ctl.signal);
      return res;
    } catch (err) {
      // AbortError shouldn't surface as a user-visible failure — it means
      // the caller superseded this upload with a newer one.
      if (
        (err as { name?: string })?.name === 'AbortError' ||
        ctl.signal.aborted
      ) {
        return null;
      }
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'upload failed';
      setError(message);
      return null;
    } finally {
      if (abortRef.current === ctl) abortRef.current = null;
      setIsUploading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { upload, isUploading, error, clearError };
}
