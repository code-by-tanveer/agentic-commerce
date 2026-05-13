# Persona: Diane — 58, desktop, reading glasses, gift-shops for grandkids

## My first session (narrative)

I land on the page. A nice serif wordmark — "Agentic Commerce" — top left.
Quiet. No popup, no chatbot bubble winking at me. Already better than the
home-improvement site I closed yesterday.

The middle is mostly empty, which gives me pause. Four little gray pills
near the bottom: "a desk lamp that won't look like an Ikea cliché", "a
gift for someone who already owns everything", "a winter coat that ships
from EU", "a chunky vase, ceramic, under $80". Above the input box: "What
are you looking for?" OK, this is a chat. The gift one catches my eye —
I'm here for my grandson Wyatt's birthday. But the pills are *small*. At
125% Safari zoom with Increase Contrast on, the text reads only just; I
lean in. No welcome sentence telling me this is a shopping assistant.
"Agentic" — what does that mean? I'm a retired teacher, I know "agent",
but "agentic" is jargon. I'm 80% guessing.

Underneath the input, tiny gray text: "Prices and availability come from
Shopify merchants. Ranking is preference-driven, not paid placement." I
appreciate that. But `text-[11px]` and `text-ink-400` — the lightest gray
on the page — with reading glasses on Safari I had to lean my whole head
in. That's the *trust copy*. It should be the most readable line on the
screen, not the least.

I type: "a small backpack for a 7-year-old boy who loves dinosaurs". Send.
A line appears: "Searching", with a little rotating dot. Products come in
as cards. They look nice — image, title, store, price, Buy button. There's
a heart at the top-right of each image, but it didn't appear until I
moused over (took a second to learn where to save things). I click a
heart. It turns pink. Comforting. Below the title are chips: "Under $30",
"Made in Portugal", "Free shipping". I click "Made in Portugal" — a small
black tooltip pops up. Fine.

I expand a card. Description, more pictures, "Pair with…", and the
merchant block — seller name, stars, "14-day returns", shipping speed,
country of origin. This is the *good stuff*. This is what Amazon hides
three clicks deep. I read it twice.

Then I notice the "About you" panel above the input bar — almost missed
it because the header text is gray-on-white and the chips are also gray.
I click Add → ethics. A grid: Sustainable, Fair-trade, Organic, B-Corp,
Women-owned, Small-batch, Vegan, Recycled. Hm. I'm buying for a 7-year-old.
None of these are "made for kids" or "non-toxic dyes" — what I'd actually
care about. I tap Sustainable and Fair-trade. A little green "Saved"
pulses. Nice. But nothing in this whole flow asks me *who I'm buying for*.
The preferences are all about me. Wyatt is invisible to the app.

I share the lookbook with my daughter. The share page opens. The hero,
big italic serif: "*A small backpack for a 7-year-old boy who loves
dinosaurs*". Slanty and pretty. It feels like a magazine spread. I
actually smile. My daughter will get it. That's a win.

## Readability / contrast / zoom

- `text-[11px]` is everywhere — trust line under the input, merchant
  store-row, chip tooltips, "Saved" pulse, shortlist lane counts, "About
  you" header, share-page section meta. At 125% zoom that's ~13.75px —
  borderline. DESIGN.md §7 says `text-ink-400` on `bg-ink-50` is OK only
  at ≥12px. Roughly half of these instances are 11px. **The rule is
  being violated by the rule's author.**
- `text-ink-400` on white is the worst offender. I can read it, but I
  have to *want* to. macOS Increase Contrast bumps it slightly, but the
  hierarchy still feels like the design is whispering at me.
- Wordmark, message text, price, Buy button — comfortable. The chrome
  layer (labels, hints, secondary info) is what's straining.
- One real win: `focus-visible:ring-2 ring-ink-900` with a 2px offset.
  When I tab through, I can *see* where I am. Rare. Buy has the orange
  `shadow-glow` on focus — even more obvious.
- The serif italic on the share-page hero is large and black. Crisp.
  No contrast issue there.

## What I trusted

- The expanded merchant block. Seller, stars, return policy, shipping
  days, country of origin. And when something's missing: "Merchant didn't
  publish country of origin." That candor is the single most trust-
  building thing on the page.
- "Buy on {merchant}" rather than just "Buy". I know where the click is
  going. Amazon-trained me distrusts mystery checkouts.
- The trust line under the input — once I found it. Bury that any
  deeper and you've lost it.
- ToolStatus says "Searching", not "Calling tool search_catalog". The
  verb-only phrasing feels like a person, not a robot.
- "Saved" green pulse — small, fast, doesn't steal focus. Good manners.

## What I didn't trust

- "Agentic" with no explanation. I'm guessing at meaning. A one-line
  welcome would help.
- Starter chips read as inside jokes. "Won't look like an Ikea cliché"
  — my daughter would read that as snarky. I'd swap one for something a
  grandmother-of-five would tap on sight.
- Heart-to-save hover-only on desktop. Missed it on the first three
  cards. A faint outline-heart at rest would tell me the affordance is
  there.
- "Shortlist (0)" in the header reads as a noun, not a verb, when empty.
  After I save my first heart and the badge fills, I finally get it.
  Discoverability is delayed.

## The grandkid-gift gap

- Every preference key is about me. Size = my size. Palette = mine.
  Ethics = mine. Ships to = my address (fair). There is *no* "who's this
  for?" anywhere. When I'm gift-shopping (half my shopping life now)
  the prefs panel is misleading. If I've saved my own size as L and then
  ask for "a sweater for a 7-year-old", does the agent honor kid-context
  or saved-size? The UI doesn't tell me.
- The starter chip "a gift for someone who already owns everything"
  reads cynical, not warm. Three of four starters assume I'm shopping
  for myself. Gift-shopping is huge for older shoppers — likely a
  majority of my cohort's volume.
- The ethics grid is admirable but Brooklyn-30s-coded (Vegan? B-Corp?
  Women-owned?). For a 7-year-old's birthday I want "non-toxic",
  "BPA-free", "lead-free paint", "safety-tested". The vocabulary isn't
  a grandparent vocabulary.
- The share page is lovely but frames the lookbook as "yours". If I'm
  sharing with my daughter as "things I'm considering for Wyatt — pick
  one", the hero italic should reflect the gift moment, not just echo
  my search string.

## Top 3 fixes for older / accessibility-needing users

1. **Bump `text-[11px]` to `text-xs` (12px) wherever it carries real
   information.** Trust copy under the input, merchant rows, lane counts,
   saved-pulse, section meta, "About you" header. Reserve 11px for
   truly decorative numerals (badge counts inside a chip). DESIGN.md §7
   says `text-ink-400` on `bg-ink-50` needs ≥12px; the codebase isn't
   honoring its own floor. Or darken the color to `text-ink-500` at the
   11px sites — one or the other. ~14 distinct violation sites across
   the files I read.
2. **Add a one-line welcome above the starter chips.** "Tell me what
   you're looking for — for yourself or someone else — and I'll search
   small Shopify shops." That sentence: (a) explains "agentic", (b)
   signals gift-shopping is OK, (c) sets source-universe expectations,
   (d) gives screen-reader users a landing anchor. And swap one starter
   for a warm gift prompt: "a birthday gift for an 8-year-old". Gift-
   shoppers see themselves at minute one.
3. **Add a "shopping for" preference key OR make the heart always
   visible at low opacity on desktop.** A "shopping for" key (self /
   kid / partner / parent) lets the agent weight constraints correctly
   and could swap the ethics vocabulary contextually (kid → non-toxic,
   BPA-free; self → the current adult vocab). The always-visible heart
   at ~40% opacity is the cheaper fix and rescues discoverability for
   everyone whose eyesight makes hover-reveal feel like a guessing game.
