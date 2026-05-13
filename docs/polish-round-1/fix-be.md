# BE polish-fix delivery log

Scope: T1.20, T1.21, T1.22, T1.23, T1.24, T1.25, T1.26, T1.35. Backend +
`@agentic/events` only. FE engineer owns the FE-side counterpart (deleting
its local `Product`/`PREFERENCE_KEYS` types and re-exporting from
`@agentic/events`; rendering the per-item outfit `rationales`).

## Shipped

### T1.20 — classifyError auth copy match
- `backend/src/services/agent.ts` — kept `retryable: false` for 401/403/
  `invalid_api_key` and updated the user-facing message to
  `"Service unavailable. Contact support."` so it no longer invites a retry
  the FE intentionally hides.

### T1.21 — recommendOutfit per-item rationale (RENDER)
- `packages/events/src/index.ts` — `outfitEventSchema` now carries an optional
  parallel `rationales: (string | null)[]` array alongside `items`. Chose
  parallel array over `{product, rationale}` to keep `items` element shape
  unchanged (no FE prop churn for `OutfitBundle`/`BundleCell`).
- `backend/src/services/tools/recommendOutfit.ts` — stop stripping; emit
  `rationales[i] = items[i].rationale ?? null` on the `outfit` event. The
  130-line confessional comment is gone. `buildItemRationale` output is
  preserved unchanged.

### T1.22 — preference_update enum + PREFERENCE_KEYS lift
- `packages/events/src/index.ts` — exports `PREFERENCE_KEYS` (const tuple),
  `PreferenceKey` (derived type), `isPreferenceKey()` guard, and narrows
  `preferenceUpdateSchema.key` to `z.enum(PREFERENCE_KEYS)`.
- `backend/src/db/repos/preferences.ts` — re-exports the three from
  `@agentic/events` for back-compat with existing import paths.
- `backend/src/services/tools/savePreference.ts` — imports
  `PREFERENCE_KEYS`/`isPreferenceKey`/`PreferenceKey` directly from
  `@agentic/events`.
- FE will swap its local `PREFERENCE_KEYS` for an import from
  `@agentic/events` (FE engineer's task; exports are ready).

### T1.23 — uploads.ts cleanup
- `backend/src/services/uploads.ts` — dropped the dead
  `?? env.IP_HASH_SALT` (the dev fallback is already resolved in
  `config/env.ts`). Docstring now correctly states the HMAC key is
  `env.UPLOAD_SIGNING_SECRET` with the dev-only fallback noted at the env
  layer.

### T1.24 — type-sharing for Product
- `packages/events/src/index.ts` — already exports
  `NormalizedProduct`/`NormalizedVariant`/`ReasoningChip`/`MerchantInfo` (Zod-
  inferred). No new exports needed.
- `backend/src/types/product.ts` — collapsed to a `export type` re-export
  from `@agentic/events` (same pattern as `backend/src/stream/events.ts`).
  Dead `SearchResponse` interface dropped.
- FE side: FE engineer will delete the local `Product`/`Variant`/
  `ReasoningChip`/`MerchantInfo` in `frontend/types/product.ts` and re-export
  from `@agentic/events`. BE exports are ready; no further BE change needed.

### T1.25 — first-token latency: SseWriter before appendMessage
- `backend/src/routes/chat.ts` — `new SseWriter(reply)` now runs BEFORE the
  user-turn `appendMessage`. Headers + `: open\n\n` flush synchronously, then
  `appendMessage` is `void`-fired with `.catch(log.warn)`. First-byte
  latency drops by one SQLite round-trip per turn.

### T1.26 — preferences SELECT raced with prep
- `backend/src/routes/chat.ts` — `listPreferences(session.id)` kicks off
  immediately after the SseWriter open, in parallel with the cookie set,
  history mapping, and close-listener wiring. The agent loop awaits it just
  before `runAgent`; on warm SQLite caches the SELECT resolves before the
  await is reached. Result is threaded through `runAgent({ preferences })`,
  and `agent.ts` keeps the inline `listPreferences` fallback for non-route
  callers.

### T1.35 — fast_shipping chip
- `backend/src/services/reasoning.ts` — new `fastShippingChip` pure function.
  Regex `/(\d+)(?:\s*[-–]\s*(\d+))?\s*(?:business\s+)?days?/i` extracts the
  highest day-count from `product.merchantInfo?.shippingDays`; emits when
  `maxDays ≤ 3`. Chip kind `fast_shipping`, tone `positive`, label
  `Ships in N day(s)`. `RANK` updated so order is
  `size_match > discount > price > fast_shipping > shipping > ethics`.
- `packages/events/src/index.ts` — `reasoningChipSchema.kind` stays
  `z.string()`; updated the kind-list comment to include `fast_shipping`.

## Verification

- `npm --workspace backend run build` — clean (tsc, no warnings).
- Boot smoke (`GROQ_API_KEY=test UCP_PROFILE_URL=https://example.com/profile.json`):
  - `GET /health` → `200 {"ok":true}`
  - `PUT /api/session/smoketest/preferences/size {"value":"M"}` → `200`
    with `{key,value,source,updatedAt}` row echoed
  - `GET /api/session/smoketest/preferences` → `200 {"size":{...}}`
  - `PUT /api/session/smoketest/preferences/banana` → `400 invalid_key`
    with the new `validKeys` enum from `@agentic/events`
  - `POST /api/upload` (real 1x1 PNG) → `200` with a `signed:` URL —
    vision-pipeline gate still operational after the uploads.ts cleanup.

No new deps. Edits confined to `backend/` + `packages/events/`.
