import type { Metadata } from 'next';
import Link from 'next/link';
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
//
// Round-6 T4.X (Marcus): summaries are immutable on the server, so we drop
// `force-dynamic` + `no-store`. A 24h `revalidate` lets the Vercel/Next
// edge cache serve repeat WhatsApp / iMessage group views without hitting
// the backend, and Next sets `Cache-Control: s-maxage=86400,
// stale-while-revalidate` automatically.
//
// Round-6 T4.Z (Design Lead): when the BE 404s (blob expired or never
// existed) we render an `<ExpiredSummary />` brand-positive landing instead
// of `notFound()`, and the OG card mirrors the same "no longer available"
// copy so the link preview itself stays on-brand.

const SUMMARY_REVALIDATE_SECONDS = 60 * 60 * 24;

interface PageProps {
  params: { id: string };
}

// Server-side fetch helper. Uses BACKEND_URL when present (the page can be
// SSR'd outside the Next.js dev server's rewrite proxy — e.g. Vercel preview
// pointing at a Fly backend). Cycle 6: BACKEND_URL is required in prod (the
// env guard documented in `frontend/.env.example`); the localhost:4000
// fallback exists only for local `next dev` against a local backend. The
// previous fallback pointed at the FE port (`process.env.PORT ?? 3000`)
// which 404'd whenever the rewrite proxy wasn't involved.
async function loadSummary(id: string): Promise<SummaryBlob | null> {
  const backend = (process.env.BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '');
  const url = `${backend}/api/session/${encodeURIComponent(id)}/summary`;
  try {
    const res = await fetch(url, {
      // Snapshot is immutable — let the Next data cache hold it for 24h.
      // The BE stale-guards >7d blobs to 404, which is what triggers the
      // expired fallback below.
      next: { revalidate: SUMMARY_REVALIDATE_SECONDS },
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return (await res.json()) as SummaryBlob;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const blob = await loadSummary(params.id);
  const expired = !blob;
  const gist = expired
    ? 'This collection is no longer available'
    : blob?.gist?.trim() || 'A collection from Agentic Commerce';
  const title = expired
    ? 'Collection unavailable — Agentic Commerce'
    : `${gist} — Agentic Commerce`;
  const description = expired
    ? 'This shared collection has expired or was never created. Start a new one at Agentic Commerce.'
    : `${blob!.love.length + blob!.maybe.length} items across ${blob!.merchantCount} merchant${blob!.merchantCount === 1 ? '' : 's'}.`;
  // The OG route uses the same `id`, hits the same BE, and renders the
  // expired-fallback card on its own when the blob is gone — so the link
  // preview matches whatever the page renders below.
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

// Round-6 T4.Z: brand-positive landing for expired / missing summaries.
// Server-only — no client hooks. We keep the visual language minimal so
// it reads as "this collection is gone" rather than "this link is broken".
function ExpiredSummary() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-ink-50 px-6 text-center">
      <div className="text-[10px] uppercase tracking-[0.32em] text-ink-400">
        Agentic Commerce
      </div>
      <h1 className="mt-6 font-display text-3xl italic leading-tight text-ink-900 sm:text-4xl">
        This collection is no longer available.
      </h1>
      <p className="mt-4 max-w-md text-sm text-ink-600">
        Shared lookbooks expire after seven days. Start a fresh conversation
        and we&rsquo;ll build a new one for you.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center gap-2 rounded-full border border-ink-900 px-5 py-2 text-sm text-ink-900 transition hover:bg-ink-900 hover:text-ink-50"
      >
        Start a new collection
        <span aria-hidden="true">→</span>
      </Link>
    </main>
  );
}

export default async function SharePage({ params }: PageProps) {
  const blob = await loadSummary(params.id);
  if (!blob) return <ExpiredSummary />;

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
