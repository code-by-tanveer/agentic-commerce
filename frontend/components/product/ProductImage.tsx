'use client';

import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Props {
  src?: string;
  alt: string;
  className?: string;
  priority?: boolean;
}

export function ProductImage({ src, alt, className }: Props) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      // T1.19 — the fallback icon is decorative (aria-hidden) but the alt
      // text is still surfaced to AT via an adjacent visually-hidden span.
      // The container has role="img" + aria-label so screen readers
      // announce the missing image as "<alt>, image" rather than skipping.
      <div
        role="img"
        aria-label={alt}
        className={cn(
          'grid place-items-center bg-ink-100 text-ink-400',
          className,
        )}
      >
        <ImageOff className="h-6 w-6" aria-hidden />
        <span className="sr-only">{alt}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      loading="lazy"
      className={cn('h-full w-full object-cover', className)}
    />
  );
}
