# Round-5 BE delivery log

Scope: T4.A, T4.H, T4.I, T4.L, T4.O, T4.W. All edits in `backend/` + `packages/events/`. All new fields optional → non-breaking for the parallel FE engineer.

## T4.A + T4.W — schema additions
`packages/events/src/index.ts`:
- `merchantInfoSchema` gained `shipsTo?: string[]` (ISO alpha-2 codes, upper-cased upstream).
- `merchantInfoSchema` gained `reviewCount?: number` (non-negative int). Unblocks the FE ComparisonTable rewrite — they render it as a column.

## T4.A — normalize ingestion
`backend/src/services/normalize.ts::pickMerchantInfo`:
- New `normaliseShipsTo()` reads `ships_to` / `shipsTo` from BOTH the raw product and the merchant blob (product-level wins), wraps singletons to `[string]`, upper-cases, dedupes.
- New `pickReviewCount()` reads `review_count` / `reviewCount` / `n_reviews` from product + merchant; coerces to `Math.floor(n)`; drops NaN / negative.
- `RawMerchant` and `RawProduct` interfaces extended for the new spellings.

## T4.A — new reasoning chip
`backend/src/services/reasoning.ts`:
- New `shipsToMatchChip()` — fires when `prefs.ships_to` is set AND `product.merchantInfo.shipsTo` includes it (case-insensitive). Label `'Ships to {CODE}'`, tone `positive`.
- RANK reordered to `size_match > discount > price > fast_shipping > ships_to_match > ethics > shipping`. Legacy `shipping` (variant-level) stays at the tail for back-compat.

## T4.L — post-filter in searchCatalog
`backend/src/services/catalog.ts::searchCatalog`:
- After MCP returns and `normalizeProduct` runs, if `opts.filters.ships_to` is set we drop products where `merchantInfo.shipsTo` is present AND explicitly excludes the requested country. Products without `shipsTo` are kept (graceful-degrade — "merchant didn't publish this", per persona-marcus's note).

## T4.H — HEIC support (preferred path)
`backend/src/routes/upload.ts`:
- Added `sharp@^0.34.5` dep (loads cleanly on this host). Allowlist now accepts `image/heic` / `image/heif` on the *input* side. HEIC bytes are transcoded server-side via `sharp(buf).rotate().jpeg({quality: 85}).toBuffer()` — `rotate()` applies EXIF orientation before encode, which iPhone-source HEICs reliably carry. Output is always one of jpeg/png/webp; downstream consumers (vision tool, signed-URL handler) keep their existing contract. Transcode failure returns 415 with copy asking the user to save-as-JPEG. Log line now includes `inMime` / `outMime` / `transcoded`.
- `docs/ARCHITECTURE.md` §9 updated with the input/output split + the libvips/HEIF failure branch.

## T4.I — language guard
`backend/src/services/prompts.ts`: SYSTEM_PROMPT now ends with a Language paragraph — "silently translate the user's message to English when calling `search_catalog`'s `query` parameter; reply in the user's input language; don't surface the translation step." Keeps the BE-side fix tight; no agent-loop changes needed.

## T4.O — gift use case
`packages/events/src/index.ts`: `PREFERENCE_KEYS` gains `'shopping_for'` (free-text; the FE can wrap a select around it later).
`backend/src/services/agent.ts::PREFERENCE_SYSTEM_ADDENDUM`: added to the explicit-only list alongside palette/ethics; new paragraph maps recipient phrases ("a gift for my niece") to the suggested vocabulary (self / partner / kid_4_to_12 / kid_13_to_17 / adult_friend / parent) or falls back to free-text. The optional `gift_safe` chip wasn't shipped this round — budget went to ships_to_match.

## Tests + verification
- New tests: 4 in `reasoning.test.ts` (ships_to_match emit / case-fold / absent-graceful / explicit-mismatch), 2 in `normalize.test.ts` (shipsTo snake+camel+single + reviewCount three-spelling). Existing top-4 ranking test re-verified: fixture doesn't carry `merchantInfo.shipsTo`, so the chip doesn't fire and the expected top-4 stays `[size_match, discount, price, fast_shipping]`.
- `npm --workspace backend run build` clean.
- `npm --workspace backend run test` → **73 passed** (was 67; +6 net).
- `frontend` `tsc --noEmit` clean — non-breaking confirmed.
- Smoke: raw `{ merchant: { name, ships_to: ['us','GB','de'], review_count: 42 } }` → `normalize` → `merchantInfo = { name, reviewCount: 42, shipsTo: ['US','GB','DE'] }`, schema-valid, `computeChips` with `prefs.ships_to = 'GB'` emits `{ kind: 'ships_to_match', label: 'Ships to GB', tone: 'positive', detail: 'Merchant ships to GB' }`.
