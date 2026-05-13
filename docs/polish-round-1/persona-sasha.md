# Persona: Sasha

28, Berlin. Values-led. Reads the "About" page before the product page. Has a
mental blocklist of fast-fashion parents. Will pay 40% more for a sweater whose
wool I can trace to a country, not a marketing word.

## Wool sweater search (narrative)

I type: **"a thick wool sweater, ships to Germany, ethical brands only."**

Walking it forward in my head against the code I read:

1. The agent gets the message. The system addendum
   (`backend/src/services/agent.ts:21`) tells it to proactively extract
   `size`/`budget`/`ships_to`/`shipping_speed` but **explicitly not** `ethics` or
   `palette` unless the user "explicitly mentions them." I did mention ethics
   ("ethical brands only") — but it's a vague modifier, not a value. So the
   model has two reasonable interpretations: (a) save `ethics="ethical"` as a
   string, or (b) ignore it because the user didn't name a *specific* value
   like "fair-trade" or "B-corp". Without an eval I'd bet it goes (b) more
   often than not.
2. It *probably* saves `ships_to="DE"` (good) and calls `search_catalog` with
   `filters.ships_to="DE"` (see `searchCatalog.ts:59`). That filter is
   forwarded to MCP. Good — Germany gets honored.
3. The search runs. Results come back. For each product, `computeChips` runs
   (`reasoning.ts:149`). The chips race:
   - size — I never gave one. Skip.
   - discount — fires if `compareAtPrice` ≥15% off. Maybe.
   - price — I gave no budget. Skip.
   - shipping — "ships to DE" if MCP populated `variant.seller.ships_to`. Likely.
   - **ethics — fires ONLY if `prefs.ethics` is set AND a literal
     case-insensitive string from my prefs appears in `product.merchantTags`.**
     So unless the agent stored `ethics="ethical"` AND the merchant published
     a tag literally called `ethical`, this chip never lights up. Most
     sustainable brands tag themselves "organic-cotton", "GOTS", "fair-trade",
     "B-Corp", "carbon-neutral" — none of which substring-match "ethical".
4. The merchant block (`MerchantBlock.tsx:56`) expands on tap. I see seller
   name, 4.6 stars, "14-day returns", "ships in 3–5 days", and *maybe* a quiet
   one-line carbon string in `text-ink-400` (so quiet I'd miss it). No country
   of origin. No "small label vs Inditex subsidiary" signal. No supply chain.

Net effect: the app probably gives me wool sweaters that ship to Germany, but
my actual question — *whose* wool, from *where*, traded *how* — is invisible.

## Provenance / ethics surface — does it exist?

Partially, and load-bearing in places that don't bear load.

**What exists:**
- `MerchantInfo.carbon` field (string). Threaded through `normalize.ts:168`
  from the MCP payload. Rendered in `MerchantBlock.tsx:108` as a tiny grey
  leaf line. It's a free-form string the merchant publishes — no schema, no
  units, no comparability between two products. If three merchants write
  "low carbon", "1.2kg CO2e", "neutral", I can't compare them.
- `merchantTags` array. Surfaced indirectly via the `ethics` chip. Never
  rendered on its own in the merchant block — so a brand tagged
  "fair-trade, B-Corp, GOTS" only surfaces *one* of those, *only* if my
  ethics preference is a literal string match. The merchant's actual
  credential set is invisible.
- `returnsPolicy` badge — solid. 2-day / 14-day / final-sale, color-coded.
  This part I trust.
- `ethics` preference key exists in `PreferencesCard` (free-text input,
  single string). I can type "fair-trade" and it saves. There's no taxonomy,
  no multi-select, no hint of which values actually fire chips.

**What's missing or broken-by-design:**
- **No country-of-origin field** on `MerchantInfo` or `NormalizedProduct`.
  For wool, that's the headline question. ("Merino from Australia via Italian
  mill" vs "wool blend, made in PRC" — same product card today.)
- **Ethics chip is exact-match, not semantic.** `reasoning.ts:139` does
  `tags.includes(w)`. My preference "sustainable" won't match a tag
  "organic-cotton". So the chip silently never fires for 90% of the brands
  who would actually pass my bar. This is the worst kind of broken: it looks
  like it works.
- **Ethics chip is ranked LAST** (`RANK.ethics = 4`). With size + discount +
  price + shipping all firing, ethics gets sliced off by `MAX_CHIPS = 4`. For
  a values-led shopper, ethics being the *first* chip cut is the wrong
  priority order.
- **`search_catalog` doesn't accept an ethics filter** (`searchCatalog.ts:8`
  schema is `{price, available, ships_to}`). Even if I save
  `ethics="fair-trade"` in the preference card, it isn't forwarded to MCP —
  the model has to fold it into the free-text query, where it becomes a
  keyword wish rather than a filter.
- **Carbon string isn't comparable or contextual.** No "shipping to DE adds
  ~X kg CO2e" calculation. No origin-country → distance heuristic. It's
  whatever the merchant typed in their Shopify metafield.
- **No "small label vs fast-fashion parent" signal anywhere.** No brand-size
  field, no parent-company tag, no first-listed-date heuristic.

## What I'd need to trust this app

- A **country-of-origin** field on `MerchantInfo` (or product-level), surfaced
  in the merchant block with a flag/glyph. "Made in: IT · Wool from: AU" — two
  short lines. Absence stays as "merchant didn't publish this" per the spec.
- **Ethics chip uses a synonym/credential map**, not raw string includes.
  Preference "sustainable" should match tags like `organic-cotton`,
  `recycled`, `gots-certified`, `b-corp`. Owned in code, transparent. Show me
  *which* credential matched in the chip detail.
- **Promote `ethics` to a top-3 chip** when the preference is set. It's a
  user-declared value — outranking shipping/discount is correct for the user
  who set it. Demote it for users who didn't.
- **Multi-select ethics preference**, not free text. Five to seven canonical
  values (`fair-trade`, `organic`, `recycled`, `b-corp`, `small-batch`,
  `carbon-neutral`, `local-eu`). Each one a togglable chip in the panel.
  This also gives the chip rule something to match against.
- **Comparable carbon line**: "~2.3 kg CO2e shipping to DE" computed from
  origin + destination, not whatever the merchant chose to write. If the
  origin isn't published, say so plainly — don't render a vague string.
- **Brand-scale signal**: a one-word tag (`independent` / `mid-size` /
  `parent: <group>`) on the merchant block. Even an MVP heuristic
  ("merchant has <50 SKUs in catalog → independent") is better than the zero
  signal today.
- **Forward `ethics` to `search_catalog` filters** so the MCP can pre-filter,
  not just the chip rule post-decorate.

## Top 3 polish moves for values-led shoppers

1. **Make the ethics chip work like the user expects.** Map preference values
   to a credential synonym set (`reasoning.ts` ethicsChip), forward the
   preference to `search_catalog.filters`, and re-rank ethics above shipping
   when the user has explicitly set it. Without this, the chip is decorative
   and slightly dishonest. Touches: `backend/src/services/reasoning.ts:128`,
   `backend/src/services/tools/searchCatalog.ts:8`, and the system prompt in
   `agent.ts:21` (the "don't proactively save ethics" rule is overcautious —
   if the user says "ethical brands only" in the *first* message, save it).
2. **Add country-of-origin to MerchantInfo** and render it in `MerchantBlock`
   above the carbon line. Even as a stringly-typed "Made in: …" pass-through
   from MCP metafields, it changes the merchant card from "marketing words" to
   "facts I can verify." Touches: `backend/src/types/product.ts:28`,
   `backend/src/services/normalize.ts:144`,
   `frontend/components/product/MerchantBlock.tsx:71`.
3. **Replace the free-text ethics preference with a multi-select of 6–8
   canonical credentials.** Today the user has to guess which magic words will
   light a chip. A chip-grid in `PreferencesCard` (visually consistent with the
   add-picker pattern already there) removes guessing, gives the chip rule a
   stable vocabulary, and makes the app's values-stance legible. Touches:
   `frontend/components/preferences/PreferencesCard.tsx:253`,
   `frontend/hooks/usePreferences.tsx:267`, and the wire shape in
   `frontend/lib/api.ts`.

None of these are visual polish. They're trust polish — and for the persona,
that *is* the product.
