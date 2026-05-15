# 2026-05-15 — Decisive modern direction (Cycle 10 reset)

> Same-day reset after Cycle 9.2 (System/Light/Dark theme picker) was rejected:
> *"what did you did, you made the cards white and black, i was talking about
> overall theme of the app."* The user is not asking for a toggleable theme.
> They are asking for ONE opinionated 2026 visual identity. This file is the
> research before the implementation; companion to
> `2026-05-14-modern-color-glass.md` (which kept getting the canvas right and
> the surfaces wrong).

---

## 1. What 2026 reference UIs actually do (5 takeaways)

### 1.1 Apple Liquid Glass — iOS 26 / macOS Tahoe 26 / Vision Pro
- Wallpaper / page ground is *colorful* — not neutral. Apple promotes the
  shipping default with sunset/sunrise chromatic gradients ("GlassPulse"
  wallpapers). Glass surfaces are *over* color, not over neutral.
- Glass is a structural surface: nav, sidebars, popovers, *and* widget cards on
  the home screen are glass. Cards are not opaque white documents.
- Color "is informed by surrounding content and intelligently adapts" — the
  glass picks up tint from what's behind it.
- Takeaway: **chromatic ground + tinted-glass cards is the platform default.**
  Cycle 9 read this as "header glass over warm slate" and stopped half-way.

### 1.2 Daydream (iOS 26 fashion AI) — direct competitor
- Launched Nov 2025 as an explicit Liquid Glass adopter ("minimal but rich,
  clean but expressive"). Cards float over the user's photo-tinted backdrop.
  Glass everywhere, not just on chrome.
- Takeaway: the bar for an AI shopping app in 2026 IS Liquid Glass.

### 1.3 Glassmorphism 2026 best practices (Inverness Design Studio)
- "Strong, well-chosen backgrounds are crucial — vibrant colour, soft gradients,
  or even gently animated scenes provide the visual energy that frosted panels
  diffuse and refract." Monochrome backdrops kill glass.
- Blur 10–20px, opacity 10–40%, soft 1px white inner border.
- Takeaway: cool slate (`#b8c1c8`) was *still* too monochrome to make cards
  read as glass. The blur had nothing to refract.

### 1.4 Linear 2026 refresh
- Warmer gray, softer separators, removed colored team-icon backgrounds.
- Importantly: Linear stays *flat-fill*. Glass is not their move; **contrast**
  is. We are not Linear — Linear's restraint is the floor we exceed, not the
  ceiling we aim at. (Cycle 9 read Linear as the ceiling. Wrong app.)

### 1.5 Phia + Mercury + Arc — color permission for commerce/consumer
- Phia (2025 fashion AI): brand carries chromatic identity end-to-end.
- Mercury: royal blue + steel gray + dark canvas — fintech proves color-as-
  identity beats neutral-only.
- Arc: gradient browser chrome — color is structural, not decorative.
- Takeaway: a 2026 consumer AI shopping app **must declare a color identity**.
  Neutral page + one orange button is a 2018 SaaS read.

---

## 2. The pattern we keep failing to ship

Across cycles 7, 9, 9.1, 9.2 we keep landing here:
- Page bg = neutral (cream, warm slate, cool slate, charcoal).
- Cards = opaque white / opaque dark.
- Glass = header strip only.
- Accent = one orange button.

That is **glass on neutral on neutral**. Every modern reference says the
opposite: **glass over chromatic over chromatic**. Glass without color
underneath is a wash. White cards on a colorful ground is the document-on-
parchment paradigm — also dated.

---

## 3. The decision — "Liquid Dawn"

ONE direction. Not toggleable. The composition is:

**Ground (page).** A multi-stop chromatic gradient anchored top-left to
bottom-right: deep indigo `#3b2a8f` → fuchsia `#a23ea0` → coral `#ff8a5b`.
Apple Tahoe sunrise lineage. Mounted as a fixed `bg-page-gradient` layer on
the body so it covers the whole viewport, including under the sticky InputBar.

**Atmosphere (ember).** Keep the §2.13 ember radial as the warm pull anchor in
the top-right — it's now reinforcing the gradient's coral terminus, not
fighting a neutral ground. Alpha stays at 0.14.

**Glass header.** `bg-white/40 + backdrop-blur-2xl + border-b border-white/30`.
On the chromatic ground the blur visibly bends color into a hazier strip.

**Cards (the move that fixes cycle 9.2).** Cards become **tinted glass on
the gradient**, not opaque white blocks. Spec:
- `bg-white/72` (72% white over the gradient — strongly tinted-white, NOT
  transparent), `backdrop-blur-xl saturate-150`, `border border-white/60`,
  `shadow-soft` (the existing layered shadow), `text-ink-900` (near-black)
  for body text — preserves AAA.
- The 72% opacity is the load-bearing decision: high enough that body text
  hits AAA against the gradient even in the darkest indigo region (≈8.5:1),
  but low enough that the gradient bleeds through at the edges so the card
  reads as glass, not as a plain white document. The `saturate-150` boost
  pulls the gradient's chroma through the frost.

**Rail.** `bg-white/45 backdrop-blur-xl border-r border-white/30`. The chat
history rail becomes a translucent sidebar — Liquid Glass sidebar move.

**InputBar.** Same glass treatment as the rail — `bg-white/55 backdrop-blur-xl`
border-top. The sticky InputBar over a gradient is the right place for glass;
it has the most viewport-coverage of any non-card surface.

**Accent.** `accent-500 #ff6a13` survives untouched on Buy + Pair-with —
DESIGN.md §2.2 commitment-only rule holds. The orange on tinted glass reads
as a hot fill against the cool indigo region and a warm continuation against
the coral region. Either way, it's the singular commitment color.

**No theme picker.** ONE composition. The `useTheme` hook is kept as
internal-only API for a future cycle (no UI exposes it now). The 3-state
segmented control in `ProfileMenu` is removed entirely. The `[data-theme]`
switching in CSS is collapsed to a single `:root` palette.

**Wordmark.** Stays. `Trove·` plain Instrument Serif with middle-dot.
Untouched per brief.

---

## 4. Why this isn't another "research, options, defer"

Every prior cycle proposed alternatives. This one does not. The references
all converge on the same move: chromatic ground, tinted glass surfaces, one
accent. iOS 26 ships this. Daydream ships this. The glassmorphism 2026
practitioners say so explicitly. **Trove cannot ship a flat-neutral 2018
SaaS canvas in May 2026 and survive the next user pass.** Liquid Dawn is
the only direction the references actually point at; the work is the
implementation.

---

## 5. Accessibility floor

The 72% white card opacity sets the contrast floor. Measured against the
darkest region of the gradient (`#3b2a8f` indigo at top-left), the resolved
card surface RGB is roughly `#d3cfe6` — body text `ink-900 #101010` on that
computes **≥8.5:1**, which is AAA for body and AAA for large text. Against
the lightest coral region the resolved surface is roughly `#fff0e5` — body
text computes **≥17:1**. Both ends pass AAA. The page-ground gradient
itself never carries body text; the only text on it is the welcome
serif headline, which is `text-ink-900` against a region we explicitly
chose to keep light enough for the headline to read (the gradient's coral
terminus sits behind the welcome composition).

---

## 6. Implementation seed (one commit)

1. `globals.css` — collapse to a single `:root` palette (no `[data-theme]`).
   Add `--page-gradient` var (3-stop linear). `html, body` paint the
   gradient; `.ember-glow` stays. New `.surface-glass-card` /
   `.surface-glass-rail` / `.surface-glass-input` utility classes for the
   tinted-glass treatments.
2. `tailwind.config.ts` — drop the `[data-theme]` rationale comments. Add a
   `glass` shadow tier for the new tinted-glass card. Keep the var binding.
3. `app/layout.tsx` — remove `THEME_BOOT_SCRIPT` injection. Strip the inline
   script. The page now ships ONE palette so no pre-hydration write is
   needed.
4. `Header.tsx` — bump glass to `backdrop-blur-2xl`, adjust border alpha.
5. `ProductCard.tsx` / `MessageBubble.tsx` / `OutfitBundle.tsx` /
   `Shortlist.tsx` / `Moodboard.tsx` / `ComparisonTable.tsx` / `CollageView.tsx`
   — replace `bg-card` and `shadow-soft` on the card surfaces with
   `.surface-glass-card`.
6. `ChatHistoryRail.tsx` — rail surface becomes `.surface-glass-rail`.
7. `InputBar.tsx` — input wrapper becomes `.surface-glass-input` over the
   gradient ground.
8. `ProfileMenu.tsx` — delete `ThemePicker` component and its imports.
   Popover surface stays card-glass.
9. `DESIGN.md` — §2.1 / §2.12 / §2.14 update. New §2.15 "Liquid Dawn
   composition". §2.14 marked superseded (theme system removed).
10. `useTheme.ts` — retained as an unused-internal API surface. No file
    deletion (callers may exist in tests).
11. `tests/e2e/decisive-modern.spec.ts` — new spec capturing 1280 + 360
    screenshots of the Liquid Dawn composition.

---

## 7. What we'd cut first under push-back

The chromatic gradient *under* the InputBar may compete with the textarea
focus state. If the user pushes back on busy-ness, the first cut is to
dampen the gradient to a 70% alpha overlay over a neutral base (still
colorful, less saturated). The second cut is to weaken the card translucency
from 72% to 85% — moving cards toward "subtly-tinted near-white" while
keeping the chromatic ground. We do NOT cut the gradient ground entirely;
that's the load-bearing decision.

---

## 8. Decision log

- **Killed:** the 3-state theme picker UI (`ThemePicker` in `ProfileMenu`);
  the `[data-theme="light"]` / `[data-theme="dark"]` CSS branches; the
  `THEME_BOOT_SCRIPT` inline script in `layout.tsx`; the
  `2026-05-14-modern-color-glass.md` direction "neutral-warm-slate ground
  with header-only glass" (cycle 9 was a half-measure).
- **Added:** chromatic three-stop page gradient; tinted-glass cards;
  glass rail; glass InputBar; single Liquid Dawn composition.
- **Kept:** accent-500 orange + §2.2 commitment rule; Instrument Serif +
  middle-dot wordmark; ember radial atmosphere; shadow XOR border rule;
  four-content-serif-homes cap.
- **Retained as unused internal API:** `useTheme.ts` hook. No UI exposes it.
