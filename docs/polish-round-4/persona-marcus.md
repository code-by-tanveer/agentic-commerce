# Persona: Marcus — Lagos, mobile-only, intermittent 4G

41, Lagos. Android, 5.8" screen. Pays for data by the GB. Shops international
audio gear and home-office stuff. Lives with delivery surprises.

## Connectivity story

- **SSE drop mid-stream**: `frontend/lib/stream.ts` does the right thing on the
  wire — `fetch-event-source` is configured so any non-aborted, non-HTTP error
  re-throws as a typed `StreamError('network', ...)` (lines 137–147). Critically
  the `onerror` callback **throws**, which stops fetch-event-source's default
  forever-retry loop. ADR-0002 followed. The catch in
  `frontend/hooks/useConversation.tsx:466–487` then dispatches `fail` with
  `retryable: true` and the copy `"Connection lost. Try again?"`. So far so
  good. **But:** on a half-second 4G blip the request can return HTTP-OK and
  then drop mid-body — fetch-event-source swallows that as a generic error.
  Marcus's screen state at that moment is whatever tokens streamed before the
  drop, plus a red error chip pinned to the **end** of the assistant bubble.
  If he scrolled while reading he won't see the chip without scrolling down.
  No toast, no scroll-into-view, no haptic. He thinks the app froze.

- **Retry affordance**: There is one. `MessageRenderer.tsx:144–152` renders a
  Retry button (RotateCcw icon, `bg-white px-3 py-1 text-xs`) inside the
  rose-50 error block, wired through `MessageBubble.tsx:102 → retry(message.id)`.
  `retry()` in `useConversation.tsx:595–610` reconstructs wire history up to
  but not including the failed turn and re-runs the stream. Correct semantics
  — no half-resumed turns. Visibility is the problem: the chip is `text-xs`
  on a 5.8" screen sitting inside a `max-w-[80%]` left-aligned bubble. Touch
  target is ~24px tall. **Fails the 44px iOS / 48dp Android touch guideline.**
  And the bubble is what Marcus has been *watching*, not the foot of the page
  — if the error appears after a long product results block he has to scroll
  to find it. No top-of-viewport banner, no input-bar inline indicator.

- **Bytes-on-the-wire (rough)**: `next.config.mjs` has `remotePatterns:
  https/**` — fully open, no image proxy or transformation. Product cards
  fetch full-resolution Shopify CDN images straight from origin. Worse,
  `ProductImage.tsx` deliberately uses a plain `<img>` (line 37, eslint-
  disabled) instead of `next/image`, so **no WebP/AVIF transcode, no
  responsive `srcSet`, no width-aware delivery**. A 4-up grid of product
  results on Marcus's phone fetches 4× full-desktop JPEGs. `loading="lazy"`
  is present, but `decoding="async"` is **missing** — the main thread blocks
  during decode on his mid-range Android. `<img>` in `SummaryProductList.tsx`
  has the same problem (lines 44–49, 138–144). A typical 8-product result
  page is realistically 3–8 MB of imagery. At ₦400/GB that's measurable.

## Ships-to-Nigeria trust

- **MerchantBlock when origin/destination mismatch**: This is the biggest gap.
  `frontend/components/product/MerchantBlock.tsx` displays seller name,
  rating, returns badge, `shippingDays` (free-form string), `originCountry`,
  carbon. **There is no ships-to field on `MerchantInfo` at all** (see
  `frontend/types/product.ts:41–53`). The block can tell Marcus "Made in IT"
  and "Ships in 2-3 days" — but those two facts in combination are
  misleading. "2-3 days" is the merchant's *domestic* shipping window. It
  does not mean 2-3 days to Lagos, and the UI doesn't say so. There is no
  destination chip, no "ships to NG: yes/no/unknown" affordance, no warning
  when a merchant's known `ships_to` set excludes NG. If the merchant
  doesn't publish ships-to data at all, the chip silently doesn't fire (the
  `shippingChip` in `backend/src/services/reasoning.ts:143–163` returns
  `null` on no-match) — **Marcus sees nothing**, infers everything is fine,
  clicks Buy, then discovers at checkout that the merchant doesn't ship to
  NG. Classic delivery-surprise scenario the persona was built to avoid.

- **search_catalog filter behaviour**: End-to-end the wiring is correct.
  `backend/src/services/tools/searchCatalog.ts:17` accepts `ships_to` in
  `filterSchema`, line 104 forwards it to `catalog.ts:29–31` which threads it
  through to the MCP `search_catalog` call. The agent system prompt
  (`agent.ts:96–106`) tells the model to extract ships-to from user turns and
  pass it as a filter. **However:** ships-to filtering happens at the MCP/
  upstream layer (`callTool('search_catalog', ...)` is a black box from our
  side), with **no post-fetch verification**. Contrast with the price filter,
  which `searchCatalog.ts:111–116` explicitly re-applies in our code because
  "MCP `filters.price` not guaranteed honoured". The same skepticism is not
  applied to `ships_to`. If the MCP ignores it, we don't notice. There's no
  post-fetch filter against `variant.shipsTo` to enforce it. A `ships_to: NG`
  request that the MCP silently drops returns the full result set; Marcus
  sees products he can't actually receive.

## Share-page on 3G

- `frontend/app/s/[id]/page.tsx` is a real server component — no `'use
  client'` (line 12 comment confirms), no client hooks. `SummaryHero` and
  `SummaryProductList` render from server HTML. Only `SummaryShareBar` is a
  client island. Works with JS disabled, as advertised. **Good.**
- `dynamic = 'force-dynamic'` (line 18) means **no static cache, no CDN
  edge**. Every share-link view re-fetches the BE summary blob through the
  backend `fetch` (line 35, `cache: 'no-store'`). On 3G that's an extra
  round-trip to the origin on every load. A `revalidate` window (even 60s)
  would let Vercel's edge cache absorb repeat views from the same WhatsApp
  group — a realistic share-pattern for Marcus's network. Snapshot semantics
  don't require force-dynamic; the BE already 404s 7-day-old blobs.
- Same image weight issue as the chat: `SummaryProductList.tsx` uses raw
  `<img>` tags, full-resolution Shopify URLs, no width hints. The
  `OutfitCell` grid renders 4 thumbnails per outfit at `aspect-square` but
  pulls the same full-size source. On a flaky 3G the page **HTML** arrives
  fast (server-rendered, good) but the images dribble in over 15–30s.
- OG image (`/api/og?id=...`, line 52) — fine for crawler/preview, doesn't
  affect Marcus's page load.

## Top 3 fixes for emerging-market mobile users

1. **Add `ships_to` to `MerchantInfo` and surface it as a positive/warning
   chip in `MerchantBlock`, with a hard pre-checkout gate.** Source from
   `variant.shipsTo[]` (already normalized in `normalize.ts:119`). Three
   states: ships-to-NG confirmed (emerald), explicitly excluded (rose
   warning + Buy disabled or confirm modal), unpublished (ink italic
   "Merchant didn't publish — check at checkout"). And: add a post-fetch
   `ships_to` filter in `searchCatalog.ts` analogous to the price filter,
   so we stop trusting the MCP to honour it.

2. **Replace `<img>` with `next/image` (or a thin width-aware proxy) across
   `ProductImage`, `SummaryProductList`, `MessageBubble`'s attachment
   thumbnail.** Add `decoding="async"`, `sizes="(max-width:640px) 50vw, 25vw"`,
   and explicit `width`/`height` to stop layout thrash. Tighten
   `next.config.mjs:images.remotePatterns` to the actual merchant CDN
   allowlist — `https/**` is a perf footgun (no Next-side caching/transform)
   *and* a small SSRF surface. Expected savings: 60–80% on image bytes for
   Marcus.

3. **Make the retry affordance visible on mobile.** Three changes: scroll
   the error block into view on `fail` dispatch; bump the Retry button to
   a 44px touch target; show a persistent reconnection chip in the input
   bar (or above it) when the most recent assistant turn is in `error`
   state, so a partially-scrolled Marcus knows the stream died without
   hunting. Bonus: surface a "Tap to reconnect" inline placeholder in the
   bubble itself where the typing indicator was, since that's where his
   eyes are.
