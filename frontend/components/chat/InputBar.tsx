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
      className="sticky bottom-0 z-10 border-t border-ink-100 bg-ink-50/80 backdrop-blur"
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
        <div className="relative flex w-full items-end rounded-3xl bg-white px-3 py-2 shadow-soft transition focus-within:shadow-lift">
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
            className="w-full resize-none bg-transparent text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
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
          the PM doc. Both lines share the existing `text-[11px] text-ink-400`
          treatment so the line break reads as one paragraph, not a bolted-on
          notice. */}
      <p className="pb-3 text-center text-[11px] text-ink-400">
        Prices and availability come from Shopify merchants.
        <br />
        Ranking is preference-driven, not paid placement.
      </p>
    </div>
  );
}
