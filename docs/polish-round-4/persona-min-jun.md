# Persona: Min-jun — Seoul, Korean IME, K-fashion

> 27, 서울. 29CM / MUSINSA refugee, slumming it on Western Shopify storefronts because
> the indie Aussie / Danish labels in my Pinterest never restock the KR proxies in time.
> I type Hangul on iOS, dual-2-set on macOS. I have *opinions* about every chat input
> on the internet, because nine out of ten of them ship a partial "ㅇㅗ" or "오" when I
> press Space mid-composition.

## IME composition: does the fix hold?

- File: `frontend/components/chat/InputBar.tsx` (lines 52–63)
- Verdict: **fix is correct.** The Enter handler reads `e.nativeEvent.isComposing` and
  short-circuits when true. That is the modern, spec-correct gate — `keyCode === 229`
  is the legacy/Safari-ish fallback and not needed in 2026-era React on
  desktop Chromium / Firefox / WebKit. React's synthetic event exposes the underlying
  `KeyboardEvent.isComposing` flag faithfully.
- What composition actually does on me: I type `ㅇ ㅗ ㅂ ㅓ ㅁ` and the IME stacks them
  into `오버핏` jamo-by-jamo. Each jamo press fires `keydown` with `isComposing=true`.
  When I hit Space, the IME *commits* — the next `keydown` (Enter) has `isComposing=false`
  and submits correctly. Without the gate, the **last jamo press inside the
  composition** can synthesise an Enter (Mac 2-set IME's "confirm" behaviour, and some
  Android Gboard variants) and ship `"오버핏 코듀로이 셔"` while I'm still typing the
  final 츠. That bug is the universal canary for "did anyone in this codebase ship from
  a non-Latin keyboard before?". Y'all passed.
- Minor nit: the `onKeyDown` doesn't also defend the `Enter` path that hits the form's
  implicit submit. It's a `textarea`, not an `input`, so Enter doesn't natively submit
  the form — `e.preventDefault()` + manual `submit()` is the only path. Safe.
- Untested but worth a thought: Mac Safari's `keyCode === 229` lingers in some
  edge cases when the IME is *between* composition sessions. If you ever see a
  "submitted blank" report from a Korean / Japanese / Chinese user on Safari, add
  `e.keyCode !== 229` as a belt-and-braces guard. Two lines, no real cost.

## Currency display (KRW)

- File: `frontend/lib/format.ts`
- Code: `new Intl.NumberFormat('en-US', { style: 'currency', currency })`.
- Try `formatMoney(45000, 'KRW')` mentally: `Intl` knows KRW is a zero-decimal currency
  (CLDR `minorUnits=0`) and `en-US` knows the `₩` symbol with a space-less prefix.
  Output: **`"₩45,000"`** — correct symbol, correct grouping, no `.00` tail.
- The `maximumFractionDigits: amount % 1 === 0 ? 0 : 2` line is defensive against
  USD `$45.00` ugliness but also handles KRW gracefully because the integer branch is
  always taken for Won. If a malformed feed ever returned `45000.5` for KRW the spec
  says `Intl` will format with at most 2 fraction digits, which would render
  `"₩45,000.50"` — wrong per CLDR but a rounding-feed problem, not a formatter bug.
- The actual KRW miss is upstream: the catalog tool doesn't filter or sort by
  `ships_to: KR`, so I'll see a bunch of USD-priced Shopify stores that don't ship to
  Seoul. The renderer is fine; the search is the bottleneck.
- Locale: hardcoded `'en-US'`. KRW renders correctly but `JPY 1,500,000` or
  `EUR 45,00` are formatted with US digit conventions. Fine for our anglophone target
  surface, surprising for the diaspora that opens this on `:lang=ko`. Mild but real.

## Korean search query — does the agent path it correctly?

- Files: `backend/src/services/prompts.ts`, `backend/src/services/tools/searchCatalog.ts`,
  `backend/src/services/catalog.ts`.
- The system prompt is English-only and doesn't instruct the model to translate before
  calling `search_catalog`. The tool description says `query: Natural-language
  description of what the user is looking for.` — no language constraint.
- What happens with `오버핏 코듀로이 셔츠 미디엄`:
  - Claude / Llama-class models will **usually** translate inline before calling the
    tool, because the few-shot of "shopping queries are short English noun phrases" is
    so dominant in pretraining that English emerges by default. But there's no
    guarantee. A weaker model (or a Groq-routed instance — see `groqClient.ts`) may
    pass the Korean through verbatim.
  - `searchCatalog` ships the literal `query` string to the Shopify Catalog MCP.
    Shopify Catalog uses Search & Discovery indexing which is **English-tokenized by
    default for the storefronts on this network**. So a passthrough Korean query
    against a US/UK Shopify catalog will hit ~0 results. Cache key is computed from
    `args.query.trim().toLowerCase()` (line 83) — `.toLowerCase()` on Hangul is a
    no-op (Hangul has no case), so caching works but the cache is full of empty
    result sets.
- Fix: add a single sentence to `SYSTEM_PROMPT`: "If the user's message is not in
  English, translate the shopping intent to a concise English query before calling
  `search_catalog`; reply to the user in their language." One sentence, no extra
  tool. Costs ~20 tokens per turn and removes the language failure mode entirely.
- Bonus: `ships_to` is never auto-derived from the user's stated locale. I'd have to
  *say* "ships to Korea" for the filter to fire. The preferences card could capture
  this passively from `Accept-Language` or a one-time "where do you ship to?" prompt.

## Share via KakaoTalk

- File: `frontend/components/summary/SummaryShareBar.tsx` + `frontend/app/api/og/route.tsx`
  + `frontend/app/s/[id]/page.tsx`.
- KakaoTalk on the link-share path consumes standard OpenGraph: `og:title`,
  `og:description`, `og:image`. The page sets all three (lines 57–63). Good.
- The `gist` text flows straight from the backend summary blob — if the model wrote it
  in Korean, **the OG card will render Hangul in italic Georgia serif** (the
  `fontFamily: 'Georgia, serif'` on line 79 of `route.tsx`). Georgia has no Hangul
  glyphs. `@vercel/og` will fall back to its bundled default (Noto-ish) and the
  fallback usually works for Hangul, but the *style* I designed for — italic editorial
  serif — collapses to a flat sans. Visually inconsistent with the Latin variant of
  the same card.
- KakaoTalk specifically: it does a server-side fetch of the OG image with a `Kakaotalk-Scrap`
  UA. The image URL on line 52 of `s/[id]/page.tsx` is a path: `/api/og?id=...` — not an
  absolute URL. Next.js's `metadata` API resolves this against `metadataBase`, which is
  **not configured anywhere I can see**. KakaoTalk's scraper will resolve it relative to
  the share URL host, which works in prod but breaks on preview deploys and on
  WebView-embedded share dialogs that don't pass a `Host` header. Set
  `metadataBase: new URL(process.env.SITE_URL ?? 'http://localhost:3000')` in the root
  layout's metadata to be safe.
- `navigator.share` on KakaoTalk-in-Chrome-on-Android pulls the URL only (not the
  title/text) into the share sheet. That's fine — Kakao re-scrapes OG on send.
- iOS Safari: `navigator.share` exists and triggers the share sheet, but the Kakao
  iOS extension reads `og:image` from the *page* not the share sheet payload. So again,
  the OG card is doing the heavy lifting.

## Top 3 fixes for CJK / non-Latin users

1. **Prompt-level translation guard.** Add one line to `SYSTEM_PROMPT`: translate
   non-English queries to English before `search_catalog`, reply in the user's
   language. ~20 tokens, removes the entire Korean/Japanese/Chinese empty-result
   failure mode. Without this, the IME fix in T1.4 is polishing a doorknob on a
   locked door.
2. **Set `metadataBase` and pick a font that has Hangul/Kana/Hanzi glyphs in
   `/api/og/route.tsx`.** Either load Noto Serif KR via the Edge runtime
   `fonts` option, or fall back to a sans that has CJK coverage (`Inter` doesn't,
   `Noto Sans` does). Right now my italic-editorial gist becomes a flat
   system-fallback paragraph the moment I share a Korean session.
3. **Default `ships_to` from request locale.** Read `Accept-Language` server-side
   and pre-fill the preferences card's region. Pair with a KRW-aware sort: if
   `ships_to === 'KR'` and a result is USD, surface the converted KRW estimate in
   the chip layer (`computeChips`). 80% of my "this app doesn't get me" moment is
   "you showed me a Brooklyn brand that doesn't ship past Hawaii."

> Side note for the engineer who shipped T1.4: 잘 했어요. Most Western teams ship
> the IME bug, hear about it twice, and close the ticket as "Won't Fix — works on my
> machine." You read the spec. Respect.
