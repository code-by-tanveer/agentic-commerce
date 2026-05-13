# Design Tokens & Systems — Round 1

Audit scope: `/home/sam/agentic_commerce/frontend/**` against `docs/DESIGN.md`. Decimal-class carve-out (§2.5) interpreted strictly: only lucide icon `h-*`/`w-*` may use decimals; `gap/padding/margin/space-*` must be in `{1,2,3,4,6,8}`.

## Serif §2.4 violations

The serif has four allowed homes: (1) expanded `ProductCard` price, (2) summary hero, (3) summary section headers, (4) `CollageView` hover-price overlay. Grep `font-display`:

- `frontend/components/summary/SummaryProductList.tsx:104` — section header (allowed #3)
- `frontend/components/product/CollageView.tsx:203` — hover-price overlay (allowed #4)
- `frontend/components/summary/SummaryHero.tsx:40` — hero italic (allowed #2)

**Missing serif (regression, must fix):**
- `frontend/components/product/ProductCard.tsx:231` — the *expanded* card's "Total" price is `text-lg font-semibold text-ink-900`. DESIGN.md §2.4 #1 explicitly requires `text-lg font-display` here. This is the serif's anchor moment on the product surface and it is currently sans. The collapsed card (line 150 `text-base font-semibold`) is correctly sans. Fix: change `text-lg font-semibold` → `text-lg font-display` on line 231.

No serif misuse elsewhere — chat stream, buttons, preferences, comparison table, moodboard all sans, as required.

## Spacing §2.5 violations (non-icon decimals + out-of-palette integers)

Decimals applied to gap/padding/margin (forbidden — carve-out is icons only):

- `frontend/components/chat/TypingIndicator.tsx:7` — `gap-1.5` on the three-dot row. Use `gap-2`.
- `frontend/components/chat/Header.tsx:50` — Shortlist button `gap-1.5 ... py-1.5`. Use `gap-2 ... py-1` or `py-2`.
- `frontend/components/chat/Header.tsx:69` — "New chat" button `gap-1.5 ... py-1.5`. Same fix.
- `frontend/components/chat/InputBar.tsx:84` — input bar inner shell `py-2.5`. Use `py-2` or `py-3`.
- `frontend/components/chat/SuggestionChips.tsx:23` — chip `px-3.5 py-1.5`. Use `px-3 py-1` (already matches the variant pills in `VariantPicker`).
- `frontend/components/product/VariantPicker.tsx:37` — `gap-1.5` between pills. Use `gap-2`.
- `frontend/components/product/VariantPicker.tsx:69` — `space-y-2.5` between groups. Use `space-y-2` or `space-y-3`.
- `frontend/components/product/VariantPicker.tsx:73` — `gap-1.5` between option values. Use `gap-2`.
- `frontend/components/product/ProductCard.tsx:167` — collapsed-card Buy chip `py-1.5`. Use `py-1` (chip is `text-xs`; `py-1` = 4px is the §2.5 token).

Out-of-palette integers (`5` is not in `{1,2,3,4,6,8}`):

- `frontend/components/product/OutfitBundle.tsx:122` — "Save outfit" button `px-5`. Use `px-4` or `px-6`. (Height is `h-10`, also outside the palette — `h-9` or `h-10` is acceptable per §2.5 since `h-*` here is button height, but the canonical Buy button at `ProductCard.tsx:239` uses `h-9`; align for consistency.)

Note: `mt-0.5` at `ProductCard.tsx:130` (`mt-0.5 flex items-center gap-1`) is also a decimal-margin violation; drop the `mt-0.5` (the flex column already gives natural rhythm) or promote to `mt-1`.

## Shadow XOR border §2.7

Grep for any component using both an outer `border-ink-*` AND `shadow-*`. None found at the container level — the original `ProductCard` violation was already fixed (line 107 is `bg-white shadow-soft` only). Border usage in the codebase falls into three legitimate buckets:

1. **Chrome dividers** (`border-b`/`border-t` only on shells with no shadow): `Header.tsx:30`, `InputBar.tsx:79`, `SummaryShareBar.tsx:64`, `Shortlist.tsx:100`. Compliant.
2. **Internal dividers** inside a shadowed card (`border-t` between sections of the same card): `ProductCard.tsx:188,228`, `MerchantBlock.tsx:74`, `ComparisonTable.tsx:81,105`. Per `MerchantBlock` inline comment ("dividers ... are different from a containing `border`"), this is the accepted reading of §2.7. Compliant — but if the design lead wants strict no-border-anywhere-inside-a-shadowed-card, these need swapping for a `bg-ink-100 h-px` hairline.
3. **Pill borders** (1px outline on an unshadowed background): `SuggestionChips.tsx:23`, `VariantPicker.tsx:46-47,83-84`. No shadow on the same element. Compliant.

No violations.

## Orange-is-commitment §2.2

Grep `accent-*` across `frontend/`:

Allowed commerce-intent affordances:
- `ProductCard.tsx:241` — expanded-card Buy CTA `bg-accent-500 hover:bg-accent-600`. Correct.
- `OutfitBundle.tsx:82,87,128` — outfit frame tint `bg-accent-50`, sparkle icon `text-accent-600`, "Save outfit" CTA `bg-accent-500 hover:bg-accent-600`. Correct (§2.2 lists "outfit-bundle frame tint" and "Save Outfit" explicitly).
- `CollageView.tsx:276` — collage card's "Buy" CTA `bg-accent-500 hover:bg-accent-600 focus-visible:shadow-glow`. Correct (it is a commerce-intent affordance).

Allowed by §2.2 carve-outs:
- `ReasoningChips.tsx:57` — `discount` chip `bg-accent-50 text-accent-600`. §2.2 explicitly lists "reasoning-chip background for `discount` kind only" as the one non-CTA use of `accent-50`.
- `SummaryProductList.tsx:120,133` — `OutfitCell` frame tint `bg-accent-50` (and matching focus-ring offset). This is the lookbook-saved outfit; consistent with §2.2 outfit-bundle treatment.
- `ImageDropzone.tsx:132` — drag-over inner frame `border-accent-200`. §4 `ImageDropzone` spec explicitly defines drag-over as `accent-200` tint. Borderline (this is *commitment to attach*, not commerce), but is design-spec'd.

No violations. Orange discipline is tight.

## Radius / motion / palette

**Radius §2.6** — grep `rounded-\[`: no arbitrary radius values found. All usage is the named scale (`sm/md/lg/xl/2xl/3xl/full`). Clean.

**Motion §2.8** — durations sweep:
- All entry/exit/layout/hover animations are ≤ 0.4s. Compliant.
- `frontend/components/chat/TypingIndicator.tsx:13` — typing dots `duration: 0.9, repeat: Infinity`. This is an idle loop, not a transition. §2.8 motion budget table allows the typing indicator as "600ms loop" (`opacity 0.3↔1` staggered). 900ms is over the documented 600ms loop budget; lower to `duration: 0.6`.
- `frontend/components/chat/ToolStatus.tsx:112,121` — spinner has two repeating loops at `duration: 1` and `duration: 0.9` (both `repeat: Infinity`). §2.8 has no carve-out for repeating animations; the table says "If you need more time, the user is waiting for content; show a skeleton, don't slow the animation." Both are over 500ms. Tighten to ≤ 0.5s (typical CSS spinner is 700–800ms; if the design lead intends to treat spinners as a category exception, document it in §2.8). Recommend `duration: 0.5` for both.

No `framer` spring with bounce; no `motion-never` usage detected. Stagger cap is honored (`Math.min(index, 5) * 0.04` at `ProductCard.tsx:56` and `CollageView.tsx:145`).

**Palette §2.1** — `ink-300`/`ink-700` are documented as add-when-needed. Grep returns zero usage in `.tsx`/`.ts`; neither is in `tailwind.config.ts`. Consistent with §2.1 ("Add only when first needed; do not pre-add").

**Semantic tokens §2.3** — `surface` / `surface-raised` / `text-primary` / `text-secondary` / `text-quiet` / `divider` are *not* implemented as Tailwind aliases and not used in component code. Every component references leaf-level `bg-ink-50`, `text-ink-900`, `text-ink-600`, `text-ink-400`, `border-ink-100`, `border-ink-200` directly. §2.3 says "They are the names component code should reference; raw `ink-*` is allowed but discouraged outside of leaf elements" — so this is permitted but not preferred. Given the codebase is consistent (every file uses the same leaf-level pattern), this is fine for launch. Recommendation for a post-launch cycle: add a Tailwind plugin or CSS variables (`--surface-raised: theme(colors.ink.50)`) so future component churn doesn't drift.

## Summary

Total findings: 1 serif regression (P0), 10 spacing-decimal violations (P1, mechanical fixes), 1 out-of-palette integer (P1), 3 over-budget motion loops (P2), 0 shadow/border violations, 0 radius violations, 0 accent violations.

Highest-impact fix: `ProductCard.tsx:231` — the expanded-price serif. This is one of the four moments in the entire product where the serif is supposed to land, and it is currently sans. Single-line change.
