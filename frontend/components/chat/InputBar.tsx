'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { ArrowUp, Loader2, Paperclip } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  useConversationActions,
  useConversationState,
} from '@/hooks/useConversation';
import { useInputBarHeight } from '@/hooks/useInputBarHeight';
import { useUpload } from '@/hooks/useUpload';

export function InputBar() {
  const { send } = useConversationActions();
  const { isSearching } = useConversationState();
  const { upload, isUploading } = useUpload();
  const labelId = useId();
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // R2/T2.8 — publish the outer wrapper's height to `--input-bar-height` so
  // the PreferencesCard sticky offset in `app/page.tsx` stays glued to the
  // top of the InputBar as the textarea auto-grows (up to 160px). Coordinate:
  // the parallel persona-depth engineer should NOT change the layout of this
  // wrapper — the ResizeObserver assumes `offsetHeight` reflects the real
  // sticky height including the iOS safe-area-inset-bottom padding.
  const stickyRef = useInputBarHeight<HTMLDivElement>();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!value.trim() || isSearching) return;
    const text = value;
    setValue('');
    await send(text);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // T1.4 — IME composition: don't submit mid-CJK input. `nativeEvent.isComposing`
    // is true while a CJK / Korean / Vietnamese IME has uncommitted candidates.
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !e.nativeEvent.isComposing
    ) {
      e.preventDefault();
      void submit();
    }
  }

  async function handleFile(file: File) {
    if (isSearching || isUploading) return;
    if (!file.type.startsWith('image/')) return;
    const res = await upload(file);
    if (!res) return;
    await send('find me something like this', { imageUrl: res.url });
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          void handleFile(file);
          return;
        }
      }
    }
  }

  async function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so picking the same file twice still fires onChange.
    e.target.value = '';
    if (file) await handleFile(file);
  }

  const disabled = isSearching || isUploading;

  return (
    // T1.3 — safe-area-inset-bottom. iOS home indicator clips otherwise.
    // `max()` keeps the existing visual padding floor when the device has no
    // physical inset (desktop / Android with on-screen nav).
    <div
      ref={stickyRef}
      // Cycle 10 (2026-05-15 night) — InputBar surface is now
      // `.surface-glass-input` (24px backdrop-blur, 1.5 saturate, 55%
      // white tint, 1px white top edge). Sits over the bottom edge of
      // the chromatic gradient, so the blur visibly bends the coral
      // terminus into a softer band beneath the textarea. Replaces the
      // prior `bg-ink-50/80 backdrop-blur border-t border-ink-100`
      // treatment — that surface was a near-neutral wash over a
      // near-neutral ground; on the gradient the new glass treatment
      // gives the InputBar real presence as a structural floor surface.
      // See DESIGN.md §2.15.
      className="surface-glass-input sticky bottom-0 z-10"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}
    >
      <form
        onSubmit={submit}
        className="mx-auto flex w-full max-w-3xl items-end gap-2 px-4 py-4"
        aria-labelledby={labelId}
      >
        {/* T1.16 — visible-to-AT label (sr-only). Placeholder alone is not a
            label per WCAG 1.3.1 / 4.1.2. */}
        <label id={labelId} htmlFor={`${labelId}-input`} className="sr-only">
          Message
        </label>
        {/* Cycle 10 — the textarea container becomes a tinted-glass pill
            inside the glass InputBar. The pill is one tier "tighter"
            (higher contrast, lighter blur) than the structural InputBar
            surface so the composing affordance reads as a distinct
            object inside the chrome — Apple's pattern for the iMessage
            compose pill over the Messages glass floor. */}
        <div className="surface-glass-card relative flex w-full items-end rounded-3xl px-3 py-2 transition focus-within:shadow-lift">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={onFileInputChange}
            tabIndex={-1}
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            aria-label="Attach image"
            className={cn(
              'mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-400 transition',
              disabled
                ? 'opacity-50'
                : 'hover:bg-ink-100 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
            )}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </button>
          <textarea
            ref={ref}
            id={`${labelId}-input`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            rows={1}
            placeholder="What are you looking for?"
            aria-label="Message"
            // `py-2` lifts a single-line textarea (text-sm = 20px line-height,
            // 16px symmetric vertical padding) to 36px — matching the adjacent
            // h-9 buttons. With the outer `items-end`, single-line text now
            // visually centers against the send/attach buttons instead of
            // hugging the bottom edge.
            className="w-full resize-none bg-transparent py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!value.trim() || isSearching}
            className={cn(
              'ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-full transition',
              value.trim() && !isSearching
                ? 'bg-ink-900 text-white hover:bg-ink-600'
                : 'bg-ink-100 text-ink-400',
            )}
            aria-label="Send"
          >
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
      </form>
      {/* Trust-promise disclosure — Round 2 polish (Mara). Source-of-truth +
          ranking policy stated where the user composes, so the commitment is
          visible at point-of-action rather than inferred from anti-goal #5 in
          the PM doc. T4.D (Round 5) — bumped from text-[11px] to text-xs (12px)
          so trust-critical copy clears the §7 legibility floor; both lines
          share the treatment so the line break reads as one paragraph. */}
      <p className="pb-3 text-center text-xs text-ink-400">
        Prices and availability come from Shopify merchants.
        <br />
        Ranking is preference-driven, not paid placement.
      </p>
    </div>
  );
}
