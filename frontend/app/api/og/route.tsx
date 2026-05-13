import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';
import type { Product, SummaryBlob, SummaryProduct } from '@/types/product';

// Cycle 5 — Open Graph image for `/s/[id]`.
//
// `@vercel/og` runs on the edge runtime. Returns a 1200×630 PNG with the
// gist + a 3-up product image strip. Falls back to a generic card when the
// id is missing or the summary doesn't exist — link previews on iMessage /
// Twitter / Slack should never render a broken image.

export const runtime = 'edge';

const WIDTH = 1200;
const HEIGHT = 630;

async function loadBlob(id: string | null): Promise<SummaryBlob | null> {
  if (!id) return null;
  const backend = process.env.BACKEND_URL;
  if (!backend) return null;
  try {
    const res = await fetch(
      `${backend.replace(/\/$/, '')}/api/session/${encodeURIComponent(id)}/summary`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    return (await res.json()) as SummaryBlob;
  } catch {
    return null;
  }
}

function isProduct(value: unknown): value is Product {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    Array.isArray(v.images)
  );
}

function pickThumbs(blob: SummaryBlob, n: number): string[] {
  const out: string[] = [];
  const lanes: SummaryProduct[][] = [blob.love, blob.maybe];
  for (const lane of lanes) {
    for (const row of lane) {
      if (out.length >= n) break;
      if (isProduct(row.snapshot)) {
        const img = row.snapshot.images?.[0];
        if (img) out.push(img);
      }
    }
  }
  return out;
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  const blob = await loadBlob(id);

  const gist = blob?.gist ?? 'A collection from Agentic Commerce';
  const thumbs = blob ? pickThumbs(blob, 3) : [];
  const meta = blob
    ? `${blob.love.length + blob.maybe.length} items · ${blob.merchantCount} merchant${blob.merchantCount === 1 ? '' : 's'}`
    : 'Conversational product discovery';

  const img = new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#f7f7f5',
          padding: 64,
          fontFamily: 'Georgia, serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 18,
              color: '#8a8a85',
              letterSpacing: 4,
              textTransform: 'uppercase',
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            Agentic Commerce
          </div>
          <div
            style={{
              fontSize: 72,
              fontStyle: 'italic',
              color: '#101010',
              marginTop: 24,
              lineHeight: 1.1,
              maxWidth: 1000,
            }}
          >
            {gist}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          <div
            style={{
              fontSize: 22,
              color: '#3a3a37',
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            {meta}
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            {thumbs.map((src, i) => (
              <div
                key={`${src}-${i}`}
                style={{
                  display: 'flex',
                  width: 160,
                  height: 160,
                  borderRadius: 16,
                  backgroundColor: '#ededea',
                  overflow: 'hidden',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
                <img
                  src={src}
                  width={160}
                  height={160}
                  style={{ width: 160, height: 160, objectFit: 'cover' }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
    },
  );

  img.headers.set('Cache-Control', 'public, max-age=3600, immutable');
  return img;
}
