'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/cn';

// T4.N — next/image migration. We use the `fill` variant because the
// callers size the surrounding container (`h-24 w-24`, `aspect-[4/5]`,
// CollageView masonry tiles, etc.) and the image just needs to fill it.
// The parent containers are already `overflow-hidden` with explicit
// dimensions/aspect ratios, so `fill` doesn't cause CLS — `next/image`
// reserves the parent's box for us.
//
// `sizes` is a reasonable default for product cards on the 640px-wide
// conversation canvas. CollageView tiles are smaller (2/3/4 columns) so
// we widen the breakpoints to let next-image pick the right srcset entry.
//
// Cycle 7 Move #3 — optional `onAspect` callback exposes the source's
// intrinsic aspect ratio (`naturalWidth / naturalHeight`) once the image
// has decoded. Callers that want to reshape the container (e.g. the
// ProductCard collapsed-row hero shifting from square → 4:5 on portrait
// sources) opt in by passing the callback; everyone else (CollageView,
// Shortlist thumbs, the expanded-card gallery) ignores it and the parent
// keeps its fixed aspect. SSR-safe — the callback only fires post-mount
// inside next/image's `onLoadingComplete`.

interface Props {
  src?: string;
  alt: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
  onAspect?: (ratio: { w: number; h: number }) => void;
}

const DEFAULT_SIZES = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px';

export function ProductImage({ src, alt, className, priority, sizes, onAspect }: Props) {
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
          'grid h-full w-full place-items-center bg-ink-100 text-ink-400',
          className,
        )}
      >
        <ImageOff className="h-6 w-6" aria-hidden />
        <span className="sr-only">{alt}</span>
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes ?? DEFAULT_SIZES}
      priority={priority}
      onError={() => setFailed(true)}
      onLoadingComplete={
        onAspect
          ? (img) => {
              const w = img.naturalWidth || 0;
              const h = img.naturalHeight || 0;
              if (w > 0 && h > 0) onAspect({ w, h });
            }
          : undefined
      }
      className={cn('object-cover', className)}
    />
  );
}
