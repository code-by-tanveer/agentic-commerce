# 2026-05-14 — Brand identity research (Cycle 7 elevation, "Trove still feels bland")

> Pre-read for the Trove identity-system decision. Question being answered: what gives 2026 premium chat + premium commerce apps actual IDENTITY — not just polish? The Cycle 7 elevation pass landed seven moves that all read as "polish" (serif wordmark, longer card entry, retuned shadows). None of them gave the app a *mark*. This file is the survey before we pick one.

## Methodology

For each brand: (a) what specifically gives it identity, beyond polish; (b) what restraint they chose (what they could have done but did NOT do). 2 lines each. Sources are the brands' own homepages (WebFetched 2026-05-14) plus public brand-pattern memory where the fetch was thin (Linear, Hermès — both 403'd; MR PORTER timed out; Notion redirect collapsed).

---

## Granola (granola.ai)

(a) The rotating-dim-dot in `ToolStatus`-position is the identity — a single calm primitive repeated everywhere the assistant is doing work. Lowercase wordmark in a neutral grotesque, no mark, no decoration; the brand IS the dot motion plus the typographic restraint.
(b) **No** drop shadows, gradients, illustrations, or animated bells. The product's visual story is carried by negative space and the dot. They could have shipped a mark; they shipped a *gesture*.

## Linear (linear.app)

(a) The thin L-glyph is a wordmark-mark hybrid: a single stroke that reads as both the letter and a one-line drawing. The accompanying gradient meta-mark (purple-to-orange, very narrow band) is reserved for hero moments and packaging — never in product chrome.
(b) The product UI is monochrome and uses the L only in app-chrome corners. They could have lit every header in gradient; they kept gradient as a *signing moment*, not a backdrop.

## Arc (arc.net)

(a) Color flexibility IS the identity — the user picks the Space color and Arc adapts every chrome surface around it. The mark itself is restrained (a tilted "A"); the *system* of letting the user co-author the palette is the brand move.
(b) No gradients in core product chrome, no signature animation on load. Restraint: the brand stays out of the user's way; the user paints the room.

## Goyard (goyard.com)

(a) The chevron-Y "Goyardine canvas" pattern IS the identity — a tessellation that reads as both ornament and proof-of-Goyard from across a room. The wordmark sits quietly underneath; the pattern carries the brand.
(b) No prominent logo placement on the homepage. They could have led with the wordmark like every other luxury house; instead they led with the *pattern* and let the wordmark whisper.

## Hermès (hermes.com — 403'd; from public brand memory)

(a) The triumvirate works because each element has a strict job: the H is structural (favicon, secondary chrome), the orange is moment-scoped (boxes, dust bags, never the wordmark), the *Duc-attelé* carriage is heritage-only (storefront windows, brand films). The wordmark itself is set in Memphis-cut Roman — sober, no flourish.
(b) The orange does not appear on the website's primary navigation. They could have made it brand-wide; they keep it as a *box-opening* signal — physical-product-tied.

## Aritzia (aritzia.com — 403'd; from public brand memory)

(a) The wordmark is a custom-cut all-caps slab-serif at low contrast, paired exclusively with full-bleed editorial photography of the clothes. The identity comes from the *pairing* — the wordmark is content-quiet so the photography can speak.
(b) No mark, no glyph, no monogram. Restraint: they trust typography + photography to do all the brand work. No animation on the wordmark.

## MR PORTER (mrporter.com — timed out; from public brand memory)

(a) The full-stop after "MR PORTER." is the signature — a tiny piece of punctuation that converts a name into a *statement*. Set in a confident Didone-adjacent serif, all-caps, no italic.
(b) The full-stop is the entire flourish. They could have added a monogram or an ornament; they let one period carry the brand. Punctuation as logo is the move.

## Mucca (mucca.com)

(a) The studio's own brand is pure typographic logotype — clean, white-on-dark, no mark. The identity is *the refusal of a mark*: a design studio confident enough to brand itself in type only.
(b) No supporting glyph, no color signature beyond the dark/light pairing. The move: trust the letterforms; if the type is right, the mark is overhead.

## Phia (phia.com — thin fetch)

(a) The 2025 launch positioned around "Your Personal Shopping Assistant" copy; brand details were too thin in the fetch to confirm a distinctive identity move. Likely a wordmark-only treatment from the marketing surfaces visible.
(b) The thinness *itself* is signal: a fresh AI shopping app didn't lead with a mark either. The category default is the wordmark.

## Daydream (daydream.ai — 404'd)

(a) Daydream™ — the trademark glyph appears in the H1 itself (the page returns "Daydream™" as the only visible content). The TM superscript is the identity hook: a young iOS-first brand using legal-mark glyph as a *style* element, not just protection.
(b) No supporting mark visible. The restraint is the trademark-as-flourish — a tiny ™ does the work a custom glyph would do for an older brand.

## Notion (notion.com)

(a) The geometric N — three vertical strokes inside a square — appears at top-left of every product surface and every marketing page. Same scale, same position, same color. The *consistency of placement* is identity, not the mark's shape.
(b) Notion uses no gradient, no animation on the mark, no second color treatment. They could have flexed; they kept the N a fixed compass needle. Position as identity.

---

## Synthesis — what every successful one shares

Three patterns across the ten:

1. **One distinctive *primitive*, not a kit.** Granola's dot, Goyard's chevron, MR PORTER's full-stop, Linear's L-stroke, Hermès's orange-on-boxes. Each brand has *one* thing they own — not a logo-plus-mark-plus-icon-set.
2. **Punctuation is a logo.** MR PORTER's period, Daydream's ™, Linear's gradient-band. A glyph smaller than the wordmark, sitting beside or above it, does more brand work than a custom mark of equivalent size.
3. **Restraint is the move.** Mucca uses no mark; Aritzia uses no mark; Notion uses one mark in one position. Every brand on this list earned identity by *subtracting*, not by adding a coat-of-arms.

## What Trove can borrow

- **From MR PORTER:** punctuation-as-signature. "Trove" is a single short word — a terminal mark (a period, a star, a dot) converts it from a styled string into a statement.
- **From Granola:** the primitive is the identity, not the mark shape. Whatever we pick must read as *Trove's primitive* across surfaces.
- **From Goyard:** the wordmark whispers; the signature speaks. The signature should be the conspicuous element.
- **From Linear:** colour is moment-scoped, not chrome-scoped. If we introduce a new identity color, it appears *once per masthead*, not as a background tint.

## What Trove must NOT do

- No coat-of-arms / monogram / gem icon next to the wordmark. The category-default for AI shopping apps is wordmark-only; a heraldic glyph would read as 2010-era e-commerce, not 2026 editorial.
- No animation that runs longer than 500ms. The motion budget (DESIGN §2.8) caps brand motion at the same `motion-never` line as everything else.
- No new gradient. Gradients date faster than serifs; the existing one-warm-accent rule (§2.2) is the move.
- No second wordmark size in the app. The header wordmark is the *only* place the brand mark renders. The summary page hero is content (the gist sentence), not a brand restatement.

## The four candidate moves for Trove

| Option | Inspiration | What it ships | Risk |
|---|---|---|---|
| A. Typographic mark (terminal-cut "T") | MR PORTER's full-stop | A small custom-cut "T" or punctuation glyph beside the wordmark | Hard to land in <500 lines without an SVG asset; FOUT risk if the glyph is a webfont char |
| B. Monogram / leading ornament | Goyard pattern-as-identity | A gem/key/drawer-pull glyph leading the wordmark | Risks reading as 2010-era e-commerce coat-of-arms |
| C. Dual-color identity rule | Linear's gradient meta-mark | A second brand color (moss/ink-blue) used ONLY at signature moments (wordmark dot, loader success line, chevron trim) | Requires a tailwind token, justified — and creates a system-level rule for the dual color |
| D. Motion signature | Arc/Daydream-style | A signature mount animation (settle, shimmer, terminal-stretch) | One-shot motion is invisible to anyone who arrived via a deep-link refresh; identity that depends on arrival timing is fragile |

## Decision (see DESIGN.md §1.1 for the full justification)

**Pick A.** Specifically: a custom-cut **terminal serif "T"** rendered as an inline SVG, sitting to the LEFT of the wordmark — drawn from the Instrument Serif italic skeleton but with a deliberate alteration: the top serif extends LEFT past the vertical stroke, like a drawer-pull or a tag-handle. This is the *trove* semantic — a held thing, a thing you pull open. The terminal-pull serif gives Trove the MR PORTER full-stop equivalent: one piece of typographic punctuation that turns a styled string into a brand mark.

Rejected at v1, deferable to v2:
- **B** (monogram) — risks the coat-of-arms read; the terminal-pull T from option A already does the "gem" work without ornament.
- **C** (dual color) — strong long-term idea, but the orange-as-commitment rule (§2.2) is finally landing; adding a second color *this turn* would compete with that rule before it's fully earned.
- **D** (motion signature) — defer; invisible to deep-linked users; reach for it once the static mark is loved.
