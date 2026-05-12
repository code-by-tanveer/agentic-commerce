'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useConversation } from '@/hooks/useConversation';

export function InputBar() {
  const { send, isSearching } = useConversation();
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="sticky bottom-0 z-10 border-t border-ink-100 bg-ink-50/80 backdrop-blur">
      <form
        onSubmit={submit}
        className="mx-auto flex w-full max-w-3xl items-end gap-2 px-4 py-4"
      >
        <div className="relative flex w-full items-end rounded-3xl border border-ink-200 bg-white px-4 py-2.5 shadow-soft transition focus-within:border-ink-400">
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="What are you looking for?"
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
      <p className="pb-3 text-center text-[11px] text-ink-400">
        Prices and availability come from Shopify merchants via the Catalog MCP.
      </p>
    </div>
  );
}
