# 2026-05-14 — Modern color + glass research (Cycle 9 reset)

> Pre-read for the cycle-9 direction change. Cycle 7 elevation (cream `#f7f4ed` + Instrument Serif + custom cut-T mark + five content-serif homes + minimal orange) was REJECTED by the user same-day: "white is too much and feels unfinished, glass effect is less visible on this, research and give a proper modern look to it, also trove T sign looks straight bad." This file is the research before the reset; companion to `2026-05-14-brand-identity.md` (cycle-7 brand survey) and `2026-05-14-visual-reference-survey.md`. The brand-survey insights still hold (one primitive, restraint, punctuation-as-logo) — what's changing is the canvas, not the principles.

---

## 1. What 2026 modern actually IS (not what we read in 2023)

The "modern" goalpost moved twice since 2023. The 2023 mark was Linear-style minimal neutrals + thin borders + one accent. The 2024 mark was warm cream + serif display + editorial restraint (where Cycle 7 landed). **The 2026 mark is layered:** tinted-neutral or deep-ink ground, *ambient* color (large soft glows behind content), and *glass surfaces* that float over those glows. Apple's Liquid Glass (iOS 26 / macOS Tahoe 26, WWDC 2025) made this the platform default; Linear's 2026 refresh inched warmer-gray to lower the contrast of chrome; Vercel held the line on monochrome-plus-one-accent; Framer leans full dark + ambient blob gradients; Stripe still owns the layered gradient signature. The common thread is **color via light, not via fill** — color shows up as a tint or glow on a held surface, not as a Material Design color swatch on a button.

What this means for Trove: the cream canvas reads as 2024 editorial, not 2026 modern. Glass on cream barely registers because the blur has almost nothing to refract. **The 2026 move is a darker, color-tintable ground that lets glass do work.**

---

## 2. References (the five takeaways)

### 2.1 Apple Liquid Glass — iOS 26 / macOS Tahoe 26 ([dev gallery](https://developer.apple.com/design/new-design-gallery-2026/), [docs](https://developer.apple.com/documentation/TechnologyOverviews/liquid-glass))

- (a) Color: lives in the *content underneath* the glass — album art, photography, canvas color. Glass surface itself is near-neutral with a slight environmental tint.
- (b) Glass usage: navigation bars, floating toolbars, context menus, sidebars. NOT used for body content surfaces (cards stay opaque). Functional, not decorative.
- (c) Restraint: Apple's docs explicitly warn against stacking translucent layers ("hierarchies flat and simple") and recommend white text on glass for legibility. Tier system: `thin` for interactive accents, `regular` for sidebars/sections, `thick` for recessed inputs.
- (d) The lift for us: glass is for **header + rail + popovers**, not for every surface. Color sits *behind* the glass, not *on* it.

### 2.2 visionOS materials ([createwithswift](https://www.createwithswift.com/ensuring-interface-legibility-and-contrast-in-visionos/))

- (a) Color: vibrancy modes (primary/secondary/tertiary) pull color through the glass from the background — color is *extracted* and tinted, never painted on.
- (b) Glass usage: every system surface. Five thicknesses (ultraThin → ultraThick).
- (c) Restraint: white text is the default on glass because it adapts; colored text on glass is discouraged. **Stacking glass-on-glass is the cardinal sin** (legibility collapses).
- (d) The lift for us: ONE glass tier in v1 (call it `surface-glass`), positioned over a colored ground. No glass-on-glass.

### 2.3 Spotify color extraction ([Crosley design guide](https://blakecrosley.com/guides/design/spotify))

- (a) Color: extracted from album artwork, tinted as a vertical gradient over the page background. Color is *content-derived*, not brand-fixed.
- (b) Glass usage: minimal — Spotify is gradient + opaque, not glassy. But the *idea* is portable: let the content's hero image tint the page.
- (c) Restraint: extracted color is contrast-checked against `#121212`; if too dark, it shifts to a vibrant variant. **Accessibility filter on the extraction.**
- (d) The lift for us: when a shortlist of items has a dominant hue, the surrounding rail/header could pick up a subtle tint of it. Cycle-9 deferred (too dynamic for v1); cycle-10 candidate.

### 2.4 Linear 2026 UI refresh ([behind the refresh](https://linear.app/now/behind-the-latest-design-refresh), [changelog](https://linear.app/changelog/2026-03-12-ui-refresh))

- (a) Color: shifted from cool-blue gray to warm gray, *less* saturated. Sidebars dimmed; main content brighter. Increased text contrast both ways (darker in light, lighter in dark).
- (b) Glass usage: none — Linear stays flat-fill. The 2026 move for them was *contrast*, not material.
- (c) Restraint: removed colored team-icon backgrounds. Fewer separators. Color comes back only where it carries meaning.
- (d) The lift for us: **direction of travel is warmer + higher contrast + less chrome saturation** — but Trove can take the *color permission* that Linear declined and add it as ambient glow, where Linear stayed flat.

### 2.5 Framer dark + ambient ([2026 trend roundup](https://uistudioz.com/blog/framer-web-design-trends/), [Ambient component](https://www.framer.com/marketplace/components/ambient-background/))

- (a) Color: large soft gradient blobs (magenta, violet, orange) drifting on a near-black canvas. Color is *atmosphere*, not surface.
- (b) Glass usage: glass cards float over the blobs. The blur over the blob IS the visible glass effect.
- (c) Restraint: no light mode. Dark IS the brand. Type is white on near-black; gradient is decoration not chrome.
- (d) The lift for us: ambient gradient blobs on a deep ground make glass *legible as glass*. This is the move.

### 2.6 Supporting beats (one line each)

- **Vercel (geist)** — monochrome black/white + exactly one accent. The restraint anchor: even in 2026, all-color-everywhere is a tell. ([Geist colors](https://vercel.com/geist/colors))
- **Mercury** — royal blue (`#4D68EB`) + steel gray + dark canvas. Fintech proof that color-as-identity beats neutral-only when the brand has a story. ([Mercury brand](https://brandfetch.com/mercury.com))
- **Daydream (AI fashion)** — embraced Apple Liquid Glass in their iOS 26 app: "minimal but rich, clean but expressive." Direct competitor signal. ([PR launch](https://www.prnewswire.com/news-releases/daydream-launches-design-forward-iphone-app-to-advance-ai-driven-fashion-search-302618206.html))
- **Notion** — same N mark, same color, same position on every surface; dark mode uses `#2F3438` content + `#373C3F` sidebar (NOT pure black). Restraint pattern. ([Notion colors](https://matthiasfrank.de/en/notion-colors/))
- **Arc** — user paints their own Space color; brand stays out of the way. Color as a *user-controlled* axis, not a brand declaration. ([Arc Spaces](https://resources.arc.net/hc/en-us/articles/19228064149143-Spaces-Distinct-Browsing-Areas))

---

## 3. Pattern synthesis (what we keep from this stack)

Three patterns repeat across the 2026 winners:

1. **Ambient color, not fill color.** Color shows up as a large soft glow *behind* surfaces, not as a paint on top. Spotify's extracted gradient, Framer's blobs, Apple's content-through-glass. The accent button is still a small thing.
2. **Glass is functional and tiered.** Used for navigation/rail/popovers (the things that *float* over content), not for body cards. ONE tier of glass in v1; never glass-on-glass.
3. **Deep ground beats cream ground.** Glass needs something to refract. White-on-cream gives glass nothing to do. Most 2026 references either go warm-gray + ambient color, OR they go deep-near-black + ambient color. Pure-white is a 2018 SaaS tell; pure-cream is a 2024 editorial tell.

Cycle 7's mistake was reading 2024-editorial as 2026-modern. Cream + serif + cut-mark is *Aritzia 2022*, not iOS 26 / Linear 2026.

---

## 4. The proposed direction for Trove (one pick)

**Working name:** "warm slate + ember." A warm-gray canvas (not white, not cream, not black) carrying ONE soft ambient orange glow in the top-right of the chat surface, with glass on the header and the (future) shortlist rail only.

**Palette shift** (concrete, replaces Cycle 7's cream-led decision; keeps `accent-500` orange untouched):

- `ink-50` (page bg): `#f7f4ed` cream → **`#e8e6e1` warm slate**. A muted putty/limestone — still warm-leaning, but a real *tint* instead of paper. Glass on this will visibly blur.
- `ink-100` (dividers): `#ededea` → `#dad7d1` (re-stepped to match).
- `ink-200` (borders): `#d6d6d1` → `#c4c1bb`.
- Cards: stay `bg-white` (the contrast IS the point — even more so against warm slate than cream).
- **NEW token** `glow-ember`: a radial `rgba(255,106,19,0.10)` at ~480px blur, anchored top-right of the chat column. Single instance per page. This is where color *shows up* without becoming chrome paint.
- **NEW token** `surface-glass`: `rgba(255,255,255,0.55) + backdrop-blur(20px) + border 1px rgba(255,255,255,0.4)`. ONE tier. Header only in v1.

**Where glass appears (exhaustively, v1):**

1. The **Header** — `surface-glass`, sticky, sits over the warm-slate ground + the ember glow's edge. This is where the user *sees* glass; it's the proof.
2. *Deferred to v2:* the **Shortlist rail** backdrop (when we have one), and the **CommandBar/popover** surfaces.

Nowhere else in v1. Cards do NOT get glass — they stay opaque white documents. The contrast (glass header floating, opaque cards reading) is the point.

**Where color appears:**

- The **ember glow** behind the header/top-right (ambient, not chrome).
- The **`accent-500` orange** on commerce-intent affordances only (Buy CTA, save outfit) — §2.2 rule survives.
- A **deferred secondary** (cycle-10 candidate): a teal/cyan `#0E7C7B`-ish "save" accent for non-commerce intent (saved-for-later, lookbook header). Not v1; called out so we have a roadmap if the user asks for "more color."

**Wordmark / mark direction** (replaces the cut-T):

- **No custom glyph in v1.** The cut-T is killed. The wordmark becomes the entire brand surface.
- "Trove" set in **Instrument Serif regular** (NOT italic; italic was a Cycle-7 holdover), text-2xl, `text-ink-900`, with a **single trailing dot**: `Trove·` (a centered middle-dot `U+00B7`, sized at 0.85em, sitting at the wordmark's optical center-line). This is the MR PORTER move adapted: punctuation is the signature. The middle-dot reads as "Trove · [continues]" — a comma in a thought, an invitation, not a full-stop conclusion. It's also typographically rare enough to register as deliberate, not as a stray period.
- A **tiny non-letter mark** (cycle-9.5 candidate, NOT v1): a 6×6px filled circle in the bottom-right corner of the page as a brand sign-off — `·` mark echoes the wordmark's dot. NEVER pre-pended to the wordmark. This is the "corner of page" pattern the user opened the door to.

**Motion signature:**

- The ember glow drifts slowly (8s cycle, ~12px translation, opacity steady) — this is the only ambient motion. Sub-perceptual; you'd notice if it stopped, not when it starts.
- Header glass does NOT animate on scroll; the glass effect itself is the motion (refraction shifts as content scrolls under).
- No mount animation on the wordmark. No spinner on the mark. Motion stays at the *one* ambient drift. The user has been frustrated by motion; this stays under the radar.

---

## 5. Honest assessment of the rejected (Cycle 7) direction

**What Cycle 7 got right and we keep:**

- Instrument Serif as the display family. Not the problem. (We just stop using it for the *mark* — wordmark only.)
- Orange `accent-500 #ff6a13` as commerce-intent color. Not the problem. The accent rule survives.
- The serif-content-home cap idea (don't sprinkle serif everywhere). Survives. Goes back to FOUR content homes (drop ProfileMenu eyebrow back to sans — that promotion was reaching).
- Cards as opaque white on a warmer ground. Survives — the *ground* warms further (slate not cream), the white cards stay.
- The shadow/border XOR rule. Survives.
- The masthead-only rule for the brand. Survives — the *form* of the brand changes; the *placement* rule doesn't.

**What Cycle 7 got wrong and we throw out:**

- The cut-T mark. Reads as 2010 e-commerce. The asymmetric serif + finial circle was clever-clever; clever-clever is the *opposite* of a 2026 modern brand. Dead.
- The cream `#f7f4ed` page background. Too 2024-editorial; gives glass nothing to do. Replaced with warm slate `#e8e6e1`.
- The five-content-serif-homes (the ProfileMenu eyebrow promotion). Inflation. Back to four, and the wordmark is a logotype (still carves out).
- "Minimal color is the move." Wrong read of 2026. Minimal *fill* color is the move; ambient color is mandatory. We were minimal on both axes, which read as unfinished, not restrained.
- The italic on the wordmark. Italic is *content voice*, not brand voice. Wordmark goes upright.

The Cycle 7 pass wasn't a bad pass — it was a pass aimed at the wrong year. The polish moves landed; the *target aesthetic* was 18 months behind. The reset is the canvas + the brand, not the principles.

---

## 6. The single first move (cycle-9 implementation seed)

**One change, one PR, prove the direction:**

Shift `ink-50` from `#f7f4ed` to `#e8e6e1` (warm slate), add a `glow-ember` radial gradient as a fixed-position div behind the chat column (top-right anchor, `rgba(255,106,19,0.10)`, ~480px blur, pointer-events none), and convert `Header.tsx`'s background from `bg-ink-50` to `surface-glass` (`bg-white/55 backdrop-blur-xl border-b border-white/40`). Kill the cut-T SVG; change the wordmark to upright `Trove` + middle-dot `·`. Drop ProfileMenu eyebrow back to 11px uppercase sans.

That's six file-touches max:

1. `tailwind.config.ts` — update `ink-50` value, add `glow-ember` keyframe/color tokens, add `surface-glass` utility class.
2. `app/globals.css` or layout — mount the `<div data-glow-ember />` as a fixed background layer.
3. `Header.tsx` — swap bg class, remove the `<svg>` cut-T, replace wordmark string with `Trove·`.
4. `ProfileMenu.tsx` — revert the "About you" eyebrow to 11px uppercase sans.
5. `DESIGN.md` — section 1.1 rewrite (mark → wordmark+dot), §2.1 update (`ink-50` value), §2.4 revert (5 → 4 content homes), §2.x NEW (`surface-glass` material rule, `glow-ember` ambient rule).
6. ADR — `adr/0XXX-warm-slate-and-glass.md` capturing the reset rationale and the rejection log.

**Success test:** after the shift, the user looks at the header and *sees* glass (the blur is visible because the slate ground and the ember glow give it something to refract). The wordmark reads as a 2026 brand, not a 2010 e-commerce launch. Color is present but not painted on. If the user says "this is more like it," we land the cycle-9 PR and the cycle-9.5 candidates (corner-of-page mark, shortlist-rail glass, teal secondary) come into play. If the user says "still not it," we have a deeper question to answer (is it deep-ink instead of warm-slate? is it heavier ambient color? is it a different family entirely?), but at least we've stopped iterating on a cream canvas that can't carry glass.

---

## 7. Decision log entries (for the implementer next turn)

- **Killed:** cut-T mark; cream `ink-50`; italic wordmark; ProfileMenu serif eyebrow.
- **Added:** warm-slate `ink-50 #e8e6e1`; `surface-glass` tier; `glow-ember` ambient gradient; middle-dot wordmark suffix.
- **Kept:** `accent-500` orange + commerce-only rule; Instrument Serif as display family; opaque white cards; four content-serif homes (down from five); shadow-XOR-border rule; masthead-only brand placement.
- **Deferred to cycle-9.5+:** shortlist-rail glass; corner-of-page tiny dot mark; teal/cyan secondary; ambient color drift extracted from content (Spotify-style).
