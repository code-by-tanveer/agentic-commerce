# Persona: Oscar — analyst, comparison-table-obsessive

## The sous-vide compare flow (narrative)

I land, ignore the suggestion pills (those are for people who don't
know what they want — I do), and type:

> compare three sous-vide circulators around $200, ranked by reviews and shipping speed to NYC

"Searching" spins. Two card groups, then a third row. I asked to
*compare*, not browse. I scroll, looking for a table. Nothing. Retype:

> compare these three side by side — I want reviews, shipping speed, warranty.

Now a comparison table renders inline. I count the rows: Image, Price,
Merchant, Shipping, "Why this". Five rows. Three columns. That's it.

I open the devtools and confirm what the visual is telling me. The table
is `frontend/components/product/ComparisonTable.tsx`. The "Shipping"
cell is literally a placeholder em-dash with the comment
`// Placeholder — merchant block + shipping info land in Cycle 2.` —
this is the Cycle-1 shell with a TODO that never got finished. Reviews?
Not a row. Warranty? Not a row. Materials? Not a row. The "Why this"
row is the first 140 chars of the product description with no
formatting, no diff between products, no shared-axis comparison.

I am Oscar. I came here to compare. The comparison table doesn't
compare. I close the tab.

## How well does the compare actually compare?

- **Tool: `backend/src/services/tools/compareProducts.ts`** — fans out
  parallel `getProduct` calls for 2–6 ids, returns the full
  `NormalizedProduct` for each plus an `axes` array (defaults: `price`,
  `rating`, `shipping`). The tool *says* it compares on rating and
  shipping, but the `axes` value is never consulted by the renderer —
  see the FE comment "axes prop is reserved for Cycle 2 — for now we
  always render the fixed row set above." So the agent can ask for
  axes all day and nothing downstream listens.

- **Tool output density** — `NormalizedProduct` (see
  `packages/events/src/index.ts:139`) has: id, title, description,
  images, price, compareAtPrice, currency, merchant, checkoutUrl,
  variants, reasoningChips, merchantInfo, merchantTags. The
  `merchantInfo` sub-object has rating, returnsPolicy, shippingDays,
  carbon, originCountry. So **rating** and **shippingDays** *are* on
  the wire — but `ComparisonTable` doesn't render them. There is no
  field for review count, no warranty, no materials, no dimensions.
  Even the data we *do* fetch isn't surfaced.

- **UI: `ComparisonTable.tsx`** — columns I can sort on: zero. Sort is
  not implemented. There is no `<th>` button, no sort icon, no
  `onClick` handler. There is no sticky header (only a sticky leftmost
  *label column*, which is the right choice — but it's the only thing
  about this table that respects how comparison tables actually work).
  Horizontal scroll at 3+ columns, which is fine.

- **Density on the front per product**: `ProductCard.tsx` (collapsed)
  shows image, title, merchant, reasoning chips (up to 4), price, Buy.
  Expanded adds: image strip, 360-char description, variants,
  `MerchantBlock` (rating stars, returns badge, shipping days, origin
  country, optional carbon line). So the *single product card* is
  denser than the *comparison row*. That is inverted: the comparison
  view should be the densest surface in the app, not the sparsest.

- **System prompt** (`backend/src/services/prompts.ts`): one sentence
  mentions "comparing items" alongside searching and details. There's
  no directive that says "when the user says 'compare', call
  `compare_products`," and no hint that the model should populate
  `axes` from the user's actual ask (reviews, shipping, warranty).
  The tool's `description` field is the only routing signal: '"which
  one is better" or "compare X and Y"'. That's thin. In my run the
  agent issued three separate `search_catalog` calls and never called
  `compare_products` until I asked twice.

- **Export**: there is no CSV export, no copy-as-table, no permalink,
  no screenshot affordance, no "save comparison" action. Grep for
  `csv|export|screenshot|copy` in `ComparisonTable.tsx`: zero hits.

## Where the app betrays my mental model

- I asked for ranking by reviews + shipping. The table doesn't show
  reviews and doesn't show shipping. Two of three axes I asked for
  aren't rendered. Headline failure.
- The `axes` field is a Potemkin parameter. Tool accepts it, event
  carries it, FE shows it as a gray caption — then renders the same
  five fixed rows regardless. Source comment: "axes prop is reserved
  for Cycle 2." It is now polish round 4.
- `ReasoningChips` are per-product, not per-axis. I can see "fast
  shipping" on one card but I can't see *which of three ships
  fastest* without reading three separate chip rows. Chips are a
  recommender pattern, not a comparison pattern.
- `MerchantBlock` (rating, shippingDays, origin) lives inside the
  expanded ProductCard and is never rendered in the comparison view.
  The densest component in the app is absent from the surface that
  needs it most.
- "Why this" is editorial copy in a column meant for facts. The
  description string is marketing, not a spec.

## What I'd add (in priority order)

1. **Actually honor `axes`.** The BE already plumbs it. Make
   `ComparisonTable` switch its row set off `axes`: render `rating`
   when the agent asks for rating, `shippingDays` when shipping,
   `originCountry` when origin. Stop hard-coding ROWS. This is a
   ~30-line refactor.
2. **Add a Reviews row (rating + count).** Rating is already on
   `merchantInfo`. Add a `reviewCount` field to `merchantInfo` in
   `packages/events/src/index.ts` and the normalizer; plumb the
   product-level review count through where the source has it
   (Shopify storefront reviews ext / product metafields). Render
   stars + "(1,247)" so I can weigh credibility.
3. **Replace the placeholder Shipping row.** Pull
   `merchantInfo.shippingDays` (already on wire). When the user
   mentions a destination ("to NYC"), surface a per-product
   `shipsToNYC` boolean if we can derive it from
   `variants[].shipsTo`. Stop rendering an em-dash for a field we
   already have data for.
4. **Sortable columns.** Click a row label, sort columns by that
   axis. Sticky sort indicator. Toggle asc/desc. Default sort = the
   first axis in `axes`. This is the single feature that turns this
   from "labeled grid" into "comparison tool."
5. **Export.** Three buttons in the table caption row: Copy as
   Markdown (the most useful for analysts who paste into Numbers /
   Notion), Download CSV, Copy permalink. The permalink should
   round-trip through the chat session id + a stable
   `compare_products` cache key (`stableKey(['compare_products',
   sorted_ids])` already exists in the tool — reuse it).
6. **Tighten the system prompt.** Add: "When the user uses 'compare',
   'side by side', 'which is better', 'rank these', or names ≥2
   products, call `compare_products`. Populate `axes` from the user's
   explicit criteria (e.g. 'ranked by reviews and shipping speed' →
   `axes: ['rating', 'shipping']`)." Today the model has to guess.
7. **A diff/highlight pass.** In each row, bold the winning cell
   (lowest price, highest rating, fastest shipping). This is the
   one ML-y move I'd accept — it's deterministic, transparent, and
   it's what every comparison UI from Wirecutter to Backcountry
   does. The data is already there.
8. **Spec-sheet expansion per column.** Click a column header → that
   column expands to show the full `MerchantBlock` + description +
   variants, the other columns dim. Reuses components already built
   for the expanded ProductCard. No new design surface required.

Until at least 1–4 ship, the comparison table is a label saying
"comparison" on top of three short product cards in a row. That is
not a comparison. Show me your data.
