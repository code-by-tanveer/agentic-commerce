import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SummaryHero } from '@/components/summary/SummaryHero';
import { SummaryProductList } from '@/components/summary/SummaryProductList';
import { SummaryShareBar } from '@/components/summary/SummaryShareBar';
import type { SummaryBlob } from '@/types/product';

// Cycle 5 — Public lookbook page `/s/[id]`.
//
// Server component (no `'use client'` here, no client hooks). The page works
// with JS disabled per PRODUCT.md move #7 acceptance #2: the hero text and
// product images render from server HTML; only `SummaryShareBar` is a
// client island (it uses `navigator.share` + clipboard).
//
// Snapshot semantics (PRODUCT.md Q4): the BE stale-guards 7d-old blobs to
// 404 so we don't serve fossilised links.

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

// Server-side fetch helper. Uses BACKEND_URL when present (the page can be
// SSR'd outside the Next.js dev server's rewrite proxy — e.g. Vercel preview
// pointing at a Fly backend). Falls back to the rewrite path locally.
async function loadSummary(id: string): Promise<SummaryBlob | null> {
  const backend = process.env.BACKEND_URL;
  const url = backend
    ? `${backend.replace(/\/$/, '')}/api/session/${encodeURIComponent(id)}/summary`
    : `http://localhost:${process.env.PORT ?? 3000}/api/session/${encodeURIComponent(id)}/summary`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return (await res.json()) as SummaryBlob;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const blob = await loadSummary(params.id);
  const gist =
    blob?.gist?.trim() || 'A collection from Agentic Commerce';
  const title = `${gist} — Agentic Commerce`;
  const description = blob
    ? `${blob.love.length + blob.maybe.length} items across ${blob.merchantCount} merchant${blob.merchantCount === 1 ? '' : 's'}.`
    : 'A lookbook from Agentic Commerce.';
  const ogImage = `/api/og?id=${encodeURIComponent(params.id)}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `/s/${params.id}`,
      type: 'website',
      images: [{ url: ogImage, width: 1200, height: 630, alt: gist }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function SharePage({ params }: PageProps) {
  const blob = await loadSummary(params.id);
  if (!blob) notFound();

  return (
    <main className="flex min-h-dvh flex-col bg-ink-50">
      <SummaryHero blob={blob} />
      <div className="flex-1">
        <SummaryProductList blob={blob} />
      </div>
      <SummaryShareBar sessionId={params.id} gist={blob.gist} />
    </main>
  );
}
