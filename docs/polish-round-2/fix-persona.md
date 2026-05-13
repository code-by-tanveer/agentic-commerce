# polish-round-2 — persona-depth delivery (Mara / Sasha / Jordan)

Domain: ethics taxonomy, country-of-origin, quota copy, trust-promise visibility,
outfit per-item rationale rendering. BE-engineer, FE-layout, test files avoided
per scope split.

## 1. Ethics taxonomy (T2.10, Sasha)
- `packages/events/src/index.ts`: added `ETHICS_VALUES` (8 canonical values),
  `ETHICS_SYNONYMS` (per-value synonym list, owned in code, transparent),
  `EthicsValue` type, and `isEthicsValue` type guard.
- `backend/src/services/reasoning.ts`: rewrote `ethicsChip` to walk the synonym
  map with case-insensitive substring match against `merchantTags`. Chip detail
  now names BOTH the matched tag and the user's preference value
  (`"Tag 'GOTS-certified-organic' matches your 'organic' preference"`).
  Promoted ethics from RANK=5 (last) to RANK=4, between `fast_shipping` and
  `shipping`, so the chip survives the `MAX_CHIPS=4` slice for users who set it.
- `backend/src/services/agent.ts`: appended a 6-line addendum to the system
  prompt instructing the model to map vague ethics statements to the closed
  vocabulary, save multiple values as a single `save_preference` array, and ask
  one clarifying question if the user is vague.
- `frontend/components/preferences/PreferencesCard.tsx`: added `EthicsChip`
  component. View mode mirrors `EditableChip`. Edit mode renders an 8-chip
  2x4 / 4x2-responsive toggle grid (active = `bg-emerald-50 text-emerald-600
  ring-2 ring-emerald-300`; inactive = `bg-ink-100 text-ink-600`). Persists via
  `usePreferences().set('ethics', EthicsValue[], 'user')`. Defensive
  `normalizeEthicsValue` accepts legacy string rows.
- `services/tools/savePreference.ts` already accepts `array` in its value union;
  no change needed.

## 2. Country-of-origin (T2.11, Sasha)
- `packages/events/src/index.ts`: added `originCountry?: string` to
  `merchantInfoSchema`.
- `backend/src/services/normalize.ts`: added `pickOriginCountry` reading
  `country_of_origin` / `origin_country` / `country` / `made_in` at product OR
  merchant level (product-level preferred). Uppercases 2-letter inputs that
  look like alpha-2 codes; passes through everything else verbatim.
- `frontend/types/product.ts`: mirrored `originCountry?: string` on FE
  `MerchantInfo` type.
- `frontend/lib/country.ts` (NEW): `originCountryDisplay` helper with a
  26-entry alpha-2 → display-name map (US, GB, DE, FR, IT, ES, JP, etc.). Falls
  through to the raw string for unknown codes / free-form strings.
- `frontend/components/product/MerchantBlock.tsx`: renders "Made in {country}"
  with `MapPin` icon between shipping-days and carbon lines. Absent →
  joins the existing "merchant didn't publish this" trailing line.

## 3. Daily-quota copy (FE)
- `frontend/hooks/useConversation.tsx`: when `error.code === 'rate_limited'`,
  the inline error block message is overridden to:
  *"Hitting traffic — try again in a moment. If this keeps happening, daily
  quota may be exhausted."* Retry affordance unchanged.

## 4. Trust-promise disclosure (Mara)
- `frontend/components/chat/InputBar.tsx`: extended the existing
  source-of-truth disclosure with a second line:
  *"Ranking is preference-driven, not paid placement."* Both lines share
  the existing `text-[11px] text-ink-400` treatment.

## 5. Outfit per-item rationale rendering
- `frontend/hooks/useConversation.tsx`: `OutfitBlock` carries `rationales?:
  (string | null)[]`; forwarded from the `outfit` SSE event.
- `frontend/components/chat/MessageRenderer.tsx`: passes `rationales` to
  `OutfitBundle`.
- `frontend/components/product/OutfitBundle.tsx`: `BundleCell` accepts a
  `rationale: string | null` prop. When non-null → renders the explicit
  rationale at `text-[11px] text-ink-400` (one-line clamped). When null →
  skipped cleanly. When `undefined` (legacy event without parallel array) →
  falls back to first reasoning chip's detail/label (prior behaviour preserved).

## Verification
- `cd backend && npx tsc --noEmit` → clean.
- `cd frontend && npx tsc --noEmit` → clean.
- Boot smoke (PUT preferences with array value) not run in this run — env not
  configured. Schema-level confirmed: route body is `value: z.unknown()`; the
  repo layer JSON-stringifies; `listPreferences` round-trips JSON. Existing
  reasoning unit tests (test-engineer-authored) still pass per RANK trace
  (top-4 unchanged after ethics promotion).
