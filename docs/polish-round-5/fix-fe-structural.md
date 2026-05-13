# Round 5 — FE structural fixes

Scope: T4.G, T4.B, T4.J, T4.N, T4.F. Edits confined to `frontend/`.

## T4.G — ProductCardGroup breaks out of the assistant bubble

- `components/chat/MessageBubble.tsx`: split the assistant message render path. Text / `tool_status` / `error` blocks stay inside the `max-w-[80%]` white `shadow-soft` bubble. Card-shaped blocks (`products` / `comparison` / `outfit` / `moodboard`) now render as siblings of the bubble inside the same `motion.div`. Both share entry animation; only the bubble carries chrome.
- Card group spans `max-w-3xl` matching the canvas; bubble keeps its prior constraint.
- `MessageRenderer` unchanged structurally (single dispatch loop) — `MessageBubble` calls it twice with partitioned block lists. The user-message branch is untouched.

## T4.B — ComparisonTable rewrite

- `components/product/ComparisonTable.tsx` replaced wholesale. Cycle-1 shell (5 fixed rows, em-dash Shipping placeholder, dead `axes` parameter) is gone.
- Reads `axes` and maps free-form strings to a `RowKey` set via `AXIS_ALIASES`. Default row set: Image, Price, Merchant, Ships in, Returns, Rating, Country, Why this.
- Pulls every cell from `merchantInfo` via a lenient `ProductLike` shape — `shipsTo` / `reviewCount` are tolerated when present, ignored when absent. Rating row renders `4.6 / 5 (1,247)` when `reviewCount` lands.
- Each sortable row label is a button (lucide `ChevronUp` / `ChevronDown` / `ChevronsUpDown`). Sort state is local, toggles asc → desc → unsorted. Nulls sink in both directions.
- "Copy as text" button writes a GH-flavoured Markdown table to the clipboard; image row is excluded; transient `Copied` confirmation for 1.5s.
- Sticky leftmost label column preserved (DESIGN.md §4). Image row uses `next/image`.

## T4.J — OG image Instrument Serif

- `app/api/og/route.tsx`: fetches the Instrument Serif italic TTF from `fonts.gstatic.com` (Satori doesn't decode WOFF2 reliably), passes the buffer to `ImageResponse.fonts`. Module-level `fontCache` survives across requests on a warm edge worker; `cache: 'force-cache'` covers cold spins on the same POP.
- Falls back to `Georgia, serif` if the fetch fails (preserves prior behaviour). Cache-Control header unchanged.
- CJK fallback marked `[DEFERRED]` — Noto Sans CJK would pull a ~1.5MB buffer; the bundle math doesn't justify it until share-link analytics show meaningful non-Latin traffic.

## T4.N — next/image migration

- `ProductImage.tsx`: switched to `next/image` with `fill`. Default `sizes` tuned for the 640px canvas; callers can override. Fallback (no-src / `onError`) unchanged.
- All `<ProductImage>` call sites' parent containers given `relative` so `fill` resolves: `ProductCard.tsx` (thumbnail + image strip), `OutfitBundle.tsx` (cell), `CollageView.tsx` (tile), `Shortlist.tsx` (rail thumb).
- `SummaryProductList.tsx`: both `<img>` sites → `next/image` `fill` with explicit `sizes`.
- `Moodboard.tsx`: 96/128px reference thumbnail → `next/image` `fill` in a sized box.
- `MessageBubble.tsx`: user-attached reference image normalized to a 160×160 `fill` box (slight crop acceptable for a chat-bubble thumb).
- `next.config.mjs`: `remotePatterns` locked down from `https://**` to `**.shopify.com`, `**.shopifycdn.com`, `cdn.shopify.com`, and `http://localhost` for dev. Note: the OG route's Satori `<img>` is not a browser image and is intentionally left alone.

## T4.F — Drop font-display from Header wordmark

- `components/chat/Header.tsx`: wordmark now `font-sans text-xl font-semibold` (Inter at the existing weight). Comment updated to reflect Yuki's R4 audit — the four serif homes in DESIGN.md §2.4 do not include persistent app chrome; the masthead serif pre-spent the SummaryHero italic.

## Verification

- `npx tsc --noEmit` clean.
- Mental dry-run: assistant text + products → text bubble + grid sibling; ComparisonTable with 3 products renders real merchant data; sortable; copy-as-text writes Markdown; OG route attaches `Instrument Serif` to the ImageResponse when the font fetch succeeds; product images render through `next/image` with `srcset`.

## Coordination

- BE-engineer fields (`shipsTo`, `reviewCount`, `shopping_for`) are accessed via lenient `ProductLike` / `MerchantInfoLenient` shapes in ComparisonTable — no churn needed if they land after this patch.
- FE-polish engineer's files (`TypingIndicator`, `ToolStatus`, `SuggestionChips`, `Retry`, `formatMoney`, heart-save styling) not modified. `MessageRenderer.tsx` was read-only on this pass; their `ErrorBlock` extraction continues to work after the `MessageBubble` split.
