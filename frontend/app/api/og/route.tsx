import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';
import type { Product, SummaryBlob, SummaryProduct } from '@/types/product';

// Cycle 5 — Open Graph image for `/s/[id]`.
//
// `@vercel/og` runs on the edge runtime. Returns a 1200×630 PNG with the
// gist + a 3-up product image strip. Falls back to a generic card when the
// id is missing or the summary doesn't exist — link previews on iMessage /
// Twitter / Slack should never render a broken image.
//
// Round 5 — T4.J: fetch Instrument Serif so the gist matches the in-app
// SummaryHero italic moment instead of the Georgia fallback. `@vercel/og`
// won't bundle our `next/font` (Satori needs raw font buffers), so we
// fetch a WOFF from Google Fonts on each cold edge invocation. The
// response itself is cached for an hour (`Cache-Control` below), so the
// real cost is amortized.
//
// Round 6 — Min-Jun's audit: ship Noto Sans JP alongside Instrument
// Serif so Japanese gists (hiragana / katakana / kanji) render as actual
// glyphs instead of Satori's tofu fallback. JP also covers most Latin,
// so we keep it second in the font list — Satori uses the first font
// that has the requested glyph. Hangul still falls back to system —
// adding Noto Sans KR doubles the cold-path payload and analytics
// don't yet justify it. [DEFERRED] Korean / Hindi if non-Latin share
// traffic grows.

export const runtime = 'edge';

const WIDTH = 1200;
const HEIGHT = 630;

// Google Fonts ships a clean Instrument Serif Regular Italic at this URL
// (resolved from their CSS API). Pinning the direct WOFF2-or-TTF avoids the
// extra CSS-fetch roundtrip on every cold invocation. Satori accepts WOFF
// and TTF; we use TTF here because @vercel/og's Satori build doesn't
// decode WOFF2 reliably across runtimes.
const INSTRUMENT_SERIF_ITALIC_URL =
  'https://fonts.gstatic.com/s/instrumentserif/v6/jizDREVItHgc8qDIbSTKq4XIRfevQT08nlTLrSk.ttf';

// Noto Sans JP Regular (TTF). Google Fonts ships a static TTF at this
// path — the variable-font URL Satori can't read. JP covers Latin +
// hiragana + katakana + kanji; Hangul / Devanagari still fall back to
// Satori's default.
const NOTO_SANS_JP_URL =
  'https://fonts.gstatic.com/s/notosansjp/v52/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75s.ttf';

let serifFontCache: ArrayBuffer | null = null;
let cjkFontCache: ArrayBuffer | null = null;

async function loadFont(
  url: string,
  cacheRef: { get: () => ArrayBuffer | null; set: (buf: ArrayBuffer) => void },
  useDataCache: boolean,
): Promise<ArrayBuffer | null> {
  const hit = cacheRef.get();
  if (hit) return hit;
  try {
    // Next's data cache rejects items >2MB. Noto Sans JP is ~7.6MB so we
    // skip the data-cache layer for the CJK font and rely on the
    // module-level cache (warm worker) for amortization. Instrument
    // Serif is ~50KB and benefits from the data-cache layer for cold
    // spins on the same POP.
    const res = await fetch(url, {
      cache: useDataCache ? 'force-cache' : 'no-store',
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    cacheRef.set(buf);
    return buf;
  } catch {
    return null;
  }
}

function loadInstrumentSerif(): Promise<ArrayBuffer | null> {
  return loadFont(
    INSTRUMENT_SERIF_ITALIC_URL,
    {
      get: () => serifFontCache,
      set: (buf) => {
        serifFontCache = buf;
      },
    },
    true,
  );
}

function loadNotoSansJP(): Promise<ArrayBuffer | null> {
  return loadFont(
    NOTO_SANS_JP_URL,
    {
      get: () => cjkFontCache,
      set: (buf) => {
        cjkFontCache = buf;
      },
    },
    false,
  );
}

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
  // Fetch the blob and both fonts in parallel — the font fetches are
  // amortized across requests via the module-level caches, but the first
  // call on a cold worker pays this latency once.
  const [blob, serifData, cjkData] = await Promise.all([
    loadBlob(id),
    loadInstrumentSerif(),
    loadNotoSansJP(),
  ]);

  // Round-6 T4.Z: distinguish "no id at all" (generic brand card) from
  // "id given but BE 404s" (expired card). The latter is what a recipient
  // sees after a 7d-old share link — the message has to read "this is
  // gone" rather than "broken link".
  const expired = Boolean(id) && !blob;

  const gist = expired
    ? 'This collection is no longer available.'
    : (blob?.gist ?? 'A collection from Trove');
  const thumbs = blob ? pickThumbs(blob, 3) : [];
  const meta = expired
    ? 'Shared lookbooks expire after 7 days · agentic.commerce'
    : blob
      ? `${blob.love.length + blob.maybe.length} items · ${blob.merchantCount} merchant${blob.merchantCount === 1 ? '' : 's'}`
      : 'Conversational product discovery';

  // Only quote Instrument Serif when we actually loaded a buffer; otherwise
  // fall back to the prior `Georgia, serif` stack so we still render
  // something the user recognises. Noto Sans JP follows in the stack so
  // Satori reaches for it when a glyph isn't in Instrument Serif's set.
  const serifStack = serifData
    ? cjkData
      ? 'Instrument Serif, Noto Sans JP, Georgia, serif'
      : 'Instrument Serif, Georgia, serif'
    : cjkData
      ? 'Noto Sans JP, Georgia, serif'
      : 'Georgia, serif';

  const sansStack = cjkData
    ? 'Noto Sans JP, system-ui, sans-serif'
    : 'system-ui, sans-serif';

  const fonts: Array<{
    name: string;
    data: ArrayBuffer;
    style?: 'italic' | 'normal';
    weight?: 400;
  }> = [];
  if (serifData) {
    fonts.push({
      name: 'Instrument Serif',
      data: serifData,
      style: 'italic',
      weight: 400,
    });
  }
  if (cjkData) {
    fonts.push({
      name: 'Noto Sans JP',
      data: cjkData,
      style: 'normal',
      weight: 400,
    });
  }

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
          fontFamily: serifStack,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 18,
              color: '#8a8a85',
              letterSpacing: 4,
              textTransform: 'uppercase',
              fontFamily: sansStack,
            }}
          >
            Trove
          </div>
          <div
            style={{
              fontSize: expired ? 60 : 72,
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
              fontFamily: sansStack,
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
      fonts: fonts.length > 0 ? fonts : undefined,
    },
  );

  img.headers.set('Cache-Control', 'public, max-age=3600, immutable');
  return img;
}
