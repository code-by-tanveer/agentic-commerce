# QA Cross-device — Round 1

Audit scope: `frontend/app`, `frontend/components/{chat,product,summary,preferences}`,
`frontend/app/api/og/route.tsx`, plus `globals.css`. Severity tags: **[BUG]**
(broken on a real device), **[RISK]** (degraded UX on a subset), **[NIT]**
(polish-only).

## iOS Safari findings

- **[BUG] components/chat/InputBar.tsx:79** — `sticky bottom-0` input bar +
  virtual keyboard. On iOS Safari < 16 the keyboard pushes the layout viewport
  but `position: sticky` resolves against the visual viewport, leaving the
  bar floating mid-screen with the page scrolled behind it. With `dvh` set on
  the parent `<main>` (page.tsx:37) this is mostly mitigated on Safari 16+,
  but the PreferencesCard wrapper at page.tsx:47 uses a hard-coded
  `bottom-[104px]`, which double-stacks the offset once the keyboard pushes
  the InputBar. Fix: drop `bottom-[104px]` to a CSS var keyed off the actual
  InputBar height (use `ResizeObserver`), or use `env(safe-area-inset-bottom)`
  + `position: relative` for PreferencesCard and let normal flow stack it
  above InputBar.
- **[RISK] app/page.tsx:37** — `min-h-dvh` is correct, but `<main>` has no
  `padding-bottom: env(safe-area-inset-bottom)`, so on iPhone 14+ the
  sticky InputBar sits under the home-indicator hit zone. Add
  `pb-[env(safe-area-inset-bottom)]` to the InputBar wrapper.
- **[RISK] components/chat/Shortlist.tsx:65** — `h-dvh` rail is fine for
  modern Safari, but the rail is `fixed right-0 top-0` and has no inner
  scroll-padding for the home indicator on iPhone X+. The footer `Done`
  button in the mobile sheet (line 257-268) is inside the sheet, but the
  sheet's `max-h-[80dvh]` doesn't account for the indicator either — last
  ~30px of the button can be partly obscured. Add
  `pb-[env(safe-area-inset-bottom)]` to the sheet inner.
- **[BUG] components/summary/SummaryShareBar.tsx:62-66** — `sticky bottom-0`
  + `backdrop-blur` is a known iOS Safari momentum-scroll jank source. When
  a long lookbook scrolls under it, the blur flickers. Mitigation: add
  `transform: translateZ(0)` (or `will-change: transform`) to promote the
  bar to its own layer. Also missing `pb-[env(safe-area-inset-bottom)]`.
- **[RISK] components/chat/ImageDropzone.tsx:99-103** — `document.addEventListener('drag*')`
  on iOS Safari: native file drag from the Files app does not reliably emit
  `dragenter`/`dragover` until the user is over a `[data-droptarget]`
  element. The overlay relies on the document-level listener firing
  *before* the overlay is mounted (chicken-and-egg). In practice the
  Paperclip button at InputBar.tsx:94 is the supported path on iOS — that
  works. Document this as "drop-anywhere is desktop-only; mobile uses the
  attach button" so it isn't filed as a bug later.
- **[NIT] app/globals.css:11-15** — `html, body` background is set, but
  no `overscroll-behavior: none` on `<html>`. On iOS, rubber-banding past
  the sticky InputBar exposes the page's background-color (`#f7f7f5`)
  which matches `bg-ink-50` so it's invisible — fine today, but if the
  brand background ever changes this becomes a bug. Suggest
  `overscroll-behavior-y: none` on `<body>`.

## Android findings

- **[BUG] components/chat/InputBar.tsx:38-43** — `onKeyDown` for Enter does
  not check `event.nativeEvent.isComposing` (nor the legacy `e.keyCode === 229`
  guard). Result: Chinese / Japanese / Korean / Vietnamese users on Android
  Chrome + Gboard who press Enter to confirm an IME suggestion will submit a
  half-composed query. Fix:
  ```ts
  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { ... }
  ```
  Same issue would apply on macOS Safari with the Pinyin/Kotoeri IMEs.
- **[RISK] components/chat/Shortlist.tsx:340-353** — Mobile sheet exposes
  HTML5 drop targets (`onDragOver`/`onDrop`). Android Chrome's HTML5 DnD
  does not fire on touch — drops simply never happen. The keyboard L/M/S
  fallback in ProductCard.tsx:75-91 / CollageView.tsx:114 works on a
  physical keyboard but not from a phone. **Net effect:** the
  lane-emptiness hint "Drag here, or press L on a card" is misleading on
  phone since neither path works. Suggest replacing the mobile drop-zone
  with a long-press → action-sheet pattern, or at minimum a
  tap-to-assign chip on each card visible on mobile. (Not blocking
  launch — but worth a follow-up.)
- **[RISK] components/chat/InputBar.tsx:23-28** — Auto-grow textarea uses
  `el.scrollHeight`, capped at 160px. On Android Chrome the visual
  viewport collapses when the keyboard appears; the cap is fine, but
  there's no `inputMode` or `enterkeyhint` attribute on the `<textarea>`.
  Adding `enterkeyhint="send"` improves Gboard's affordance ("Send"
  rather than "Return").
- **[NIT] components/chat/Shortlist.tsx:311** — Tabs row uses
  `overflow-x-auto` without `-webkit-overflow-scrolling: touch` (Tailwind
  3.x defaults to `auto` which is fine on iOS 13+, but older Androids
  show a stutter). Low priority.

## Responsive layout findings

- **[BUG] page.tsx:47 + DESIGN.md §5** — DESIGN.md defines three logical
  breakpoints (≤640, 641–1024, >1024) but the codebase only uses Tailwind
  `sm:` (640) — there is no `md:`/`lg:` switch for the tablet vs desktop
  split. The PreferencesCard mobile sheet trigger (PreferencesCard.tsx:90
  `block w-full sm:hidden`) and Shortlist mobile sheet
  (Shortlist.tsx:233 `sm:hidden`) flip at 640, which means **tablets
  (768–1024px) get the desktop sticky rail + desktop chip row**, not the
  bottom sheet DESIGN.md §5 calls for ("Tablet — Shortlist remains a
  bottom sheet"). Either widen the breakpoint to `lg:hidden` /
  `lg:flex`, or document that the code intentionally diverges from
  DESIGN.md §5.
- **[BUG] components/chat/Shortlist.tsx:65** — Desktop rail is
  `fixed right-0 top-0 w-[320px]` and main canvas is `max-w-3xl`
  (`mx-auto`). At viewport widths between 1024 and ~1408px (1088px
  canvas + 320px rail) the rail overlays the canvas; the Shortlist
  obscures the right-edge of `CollageView`'s last column. Fix: when
  the rail is open, push the `<main>` content left with
  `lg:mr-[320px]` (or shift the canvas to `max-w-2xl`).
- **[RISK] components/product/CollageView.tsx:54** — `columns-2 sm:columns-3 lg:columns-4`
  switches at 640 / 1024. Between 640–767 (large phones rotated, small
  tablets), 3 columns of `aspect-[4/5]` images produce ~200px-wide
  cards — the hover overlay (price in serif) is fine, but the
  Reasoning chips line wraps awkwardly. Not broken, but tablet-portrait
  is the weakest cell.
- **[BUG] page.tsx:47** — `sticky bottom-[104px]` for PreferencesCard
  assumes a fixed InputBar height. When the user types and the textarea
  grows to ~160px (InputBar.tsx:27), the InputBar reaches ~200px tall
  and the PreferencesCard overlaps it. Fix as called out in iOS section.
- **[NIT] components/summary/SummaryProductList.tsx:126** —
  `grid-cols-2 sm:grid-cols-4` — at 641–768 (small tablets) 4 cols of
  `aspect-square` thumbnails crowd to ~160px each which is borderline
  legible. `md:grid-cols-4` (768+) would be safer.
- **[BUG] components/chat/Header.tsx:42-66** — Header right-side cluster
  is `ViewToggle + ShareButton + Shortlist + New chat`. At viewport
  <380px (iPhone SE width) and once a session has history + can-share,
  the cluster overflows; nothing wraps because the parent is
  `justify-between`. Visible truncation: "New chat" label collides
  with the Shortlist badge. Fix: hide the textual labels on
  `max-sm:` and keep the icon, or wrap the cluster.

## Browser-API portability

- **[OK] components/summary/SummaryShareBar.tsx:26-34** — `navigator.share`
  is feature-detected on mount with `typeof` and only renders the Share
  button when the function exists. Correct.
- **[OK] components/summary/SummaryShareBar.tsx:36-46** — Clipboard
  `writeText` is wrapped in `try`/`catch` and falls back to
  `window.prompt('Copy this link:', shareUrl)`. Solid.
- **[RISK] components/chat/ShareButton.tsx:39-45** — Clipboard fallback
  swallows the error and silently opens the new tab. The user has no
  signal the copy failed. Fix: surface a "Copy link?" prompt-fallback
  identical to SummaryShareBar.tsx:44 when `navigator.clipboard` is
  absent (older Safari over http, Firefox without permission). Also,
  `navigator.clipboard` is gated on a secure context — on the production
  domain that's fine, but the localhost over `http://0.0.0.0` (Cycle 6
  dev path) it will throw `NotAllowedError`, hence the fallback matters.
- **[OK] app/api/og/route.tsx:1-12** — `runtime = 'edge'` + `@vercel/og`.
  No Node-only API: only `fetch`, `URL`, `req.nextUrl.searchParams`,
  `process.env` (read-only, allowed in edge). The remote thumbnail
  `<img src>` works on `@vercel/og` since it fetches at render time.
  However, **no timeout** on the upstream fetch (loadBlob at line
  21-31) — a slow BE will block the edge function up to the platform
  cap (~25s on Vercel edge). Fix: `AbortSignal.timeout(2500)`.
- **[RISK] components/product/ProductImage.tsx:30-36** — `<img>` has
  `loading="lazy"` but **no `width`/`height`** attributes. Cards force
  the image into a fixed wrapper (`h-24 w-24` / `aspect-square`), so
  CLS is bounded — but in CollageView the wrapper is `aspect-[4/5]`
  which only resolves once CSS loads. On a cold cache + slow 3G
  Android Chrome will flash 0-height before painting. Adding
  `width="800" height="1000"` (or equivalent intrinsic ratio attrs)
  removes the flash. Low risk because the aspect-ratio CSS handles
  it, but worth adding.
- **[BUG] components/summary/SummaryProductList.tsx:44 / 138** — Raw
  `<img loading="lazy">` thumbnails on the public lookbook with no
  dimensions and no `decoding="async"`. These render server-side (no
  JS) so they hit the network in document order — on a 16-product
  lookbook this is ~16 sequential image fetches before the page can
  paint stably. Add explicit `width`/`height` + `decoding="async"`.
- **[OK] components/chat/Shortlist.tsx + ImageDropzone.tsx** — HTML5
  DnD `dataTransfer.types.includes(DRAG_MIME)` works in Safari,
  Firefox, Chrome. (Note: Safari < 14 returned types as a DOMStringList
  without `.includes`, but support is fine across our target matrix.)
- **[RISK] `min-h-dvh` usage** (page.tsx:37, s/[id]/page.tsx:78,
  Shortlist.tsx:65, Shortlist.tsx:252) — `dvh` shipped in Safari 15.4,
  Chrome 108, Firefox 101. Android Chrome on devices stuck on the
  WebView from before Nov 2022 (~5% of installed base) gets `0`
  collapsed height because the CSS property is invalid. Tailwind
  doesn't emit a fallback. Mitigation: add a `min-h-screen` fallback
  class first, then override with `min-h-dvh`:
  `<main className="min-h-screen min-h-dvh ...">`. Same for `h-dvh`
  and `max-h-[80dvh]`.
- **[OK] components/chat/ImageDropzone.tsx:129** — Drag overlay has
  `pointer-events-auto` but is only rendered when `isDragging` is
  true (line 121), so it never captures touch when invisible.
  Correct.
- **[NIT] app/globals.css:18-33** — `.grain` uses `mix-blend-mode:
  multiply`. Safari < 15 with hardware acceleration sometimes
  rasterises blend modes against a transparent backdrop, producing a
  visible seam at the page-fold. Modern Safari is fine. Not worth
  fixing.
