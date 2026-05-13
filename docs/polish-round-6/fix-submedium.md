# Round-6 sub-medium polish — delivery log

Scope: clear the four "diminishing returns" items Round-5 deferred.
Touched only the three files the brief allowed.

## Items landed

### T4.X — `/s/[id]` cache headers  (Marcus)
`frontend/app/s/[id]/page.tsx`
- Dropped `export const dynamic = 'force-dynamic'`.
- Replaced `fetch(..., { cache: 'no-store' })` with
  `fetch(..., { next: { revalidate: 86400 } })` so Next sets
  `Cache-Control: s-maxage=86400, stale-while-revalidate` automatically.
- Snapshot is immutable on the BE; 7d stale-guard returns 404 which
  drives the expired path below.

### T4.Z — expired/missing OG + page  (Design Lead)
`frontend/app/s/[id]/page.tsx`
- Replaced `notFound()` with a server `<ExpiredSummary />` component:
  wordmark, italic display-serif headline "This collection is no longer
  available.", and a "Start a new collection →" link to `/`.
- `generateMetadata` now branches on `blob == null` and emits expired
  copy + the same `/api/og?id=…` (the OG route handles the fallback).

`frontend/app/api/og/route.tsx`
- New `expired = Boolean(id) && !blob` branch renders the same
  "no longer available" headline in the same Instrument-Serif card so
  the iMessage / Slack preview matches the page.
- Generic (no id) card unchanged.

### Noto Sans JP — Min-Jun
`frontend/app/api/og/route.tsx`
- Added module-level `cjkFontCache` + `loadNotoSansJP()`, fetched in
  parallel with Instrument Serif.
- Stack: `Instrument Serif → Noto Sans JP → Georgia → serif` (Satori
  falls through per glyph). Hangul / Devanagari still fall back; left
  as `[DEFERRED]` follow-up.
- Skipped Next data-cache for the 7.6MB JP TTF (>2MB ceiling); module
  cache still amortizes warm requests.

### Vision-prompt foreground bias — Cleo
`backend/src/services/visionPrompt.ts`
- Added the "foreground vs background" sentence as the first rule.

## Verification
- `npm --workspace backend run build` clean.
- `npm --workspace frontend exec -- tsc --noEmit` clean.
- `npm --workspace backend run test` → 73 passed, 0 failed.
- Boot smoke: `GET /api/og?id=nonexistent` → 200, `image/png`,
  1200×630, ~29KB. `GET /s/nonexistent` → 200 with expired UI.
