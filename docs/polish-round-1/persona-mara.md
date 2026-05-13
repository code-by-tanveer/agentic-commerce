# Persona: Mara

## My first session (narrative)

I land on the page expecting to be told what this thing is. Instead I get a little black sparkle avatar, "Agentic Commerce — Conversational product discovery," and one assistant bubble: *"Hi — tell me what you're shopping for. A vibe, a need, or a specific product. I'll surface options from Shopify merchants."* OK. Quiet, no mascot, no "Hi I'm Aria!" energy. Good. The line "Prices and availability come from Shopify merchants via the Catalog MCP" at the bottom — I notice it. I don't really know what MCP is but the fact that they're flagging the source feels honest. I'll allow it.

Then I see four starter chips: *a minimalist desk lamp under $150*, *gifts for a coffee obsessive*, *lightweight running shoes for trails*, *a chunky knit throw in neutral tones*. Two of these (the throw, the lamp) feel like mine. The running shoes feel like a different demo persona. The coffee one is fine but boring. I'm not going to click any of them — they feel like the developer's idea of what a "Mara" would type. I want my own thing.

What I'd actually type first: **"a vase for my hallway, ceramic, nothing too precious"**. Hallway because I bought a console table last month and it's sitting empty. "Nothing too precious" because I've been burned buying delicate things that get knocked by coats.

I expect: a brief streamed acknowledgement, a tool-status line that says it's searching, then a grid of vases. I'd want to see budget guesses, materials, maybe an EU-shipping hint because I live in Berlin (it doesn't know that yet, fine).

Mid-stream, the **"About you"** card is sitting above the input bar saying *"I'll save the basics here as we chat — size, budget, where you ship."* That's polite. Not pushy. I don't have to fill out a form. I trust it more than a signup wall.

Once the products land — I assume four to six cards with chips like `under $X`, `−Y% vs MSRP`, maybe `ceramic` — I'd tap one to expand and look for the **merchant block**. This is the make-or-break moment for me. If it tells me the seller's name, returns policy, shipping speed, and *says "merchant didn't publish this"* for the missing fields instead of fudging — I'm in. If it just shows a fake 4.5 stars and a "ships in 3-5 days" with no source, I'm out.

I'd then type **"something a bit warmer, terracotta or oat"** as a follow-up. I expect it to remember "vase" and "hallway" and not re-ask. Then I'd flip to **collage view** because honestly a list of cards is the most boring possible way to show me objects I'm choosing for a *hallway*. The collage promise — image-dominant, serif price on hover — that's the bit I'd come back for.

If by minute four I've dragged one into Love and one into Maybe and the share button has appeared in the header, I'd probably try the share link just to see what it looks like, then close the tab and decide whether to come back tomorrow.

## What worked

- **The empty state is quiet.** No "Hi I'm Aria your shopping assistant 👋🤖✨". One sentence, one input, four chips. The persona doc says "quiet professional, not a chirpy assistant" and the welcome message holds that line. Approve.
- **The "About you" card is opt-in, not a form.** It only shows up populated as I chat. The empty-state copy ("I'll save the basics here as we chat") is the right tone. It's not asking me to commit before I've gotten value.
- **Source-of-truth disclosure at the bottom of the input.** "Prices and availability come from Shopify merchants via the Catalog MCP." I don't fully know what that means but the *gesture* of telling me where the data comes from earns trust. Klarna would never.
- **MerchantBlock has the "merchant didn't publish this" copy baked in.** I checked the component — `Merchant didn't publish rating, return policy, or shipping speed.` That single decision is more trust-building than any badge would be. If I see a card with a fake 5-star rating I bounce; if I see "this seller didn't publish a returns policy" I respect it and probably skip *that product*, not the app.
- **Collage view has a real serif moment on hover.** Image-dominant, price overlays in Instrument Serif. That's the Pinterest-y bit. Most shopping AI's are spreadsheets dressed up — this looks like it actually wants to be looked at.
- **The Shortlist is hidden until I open it.** I was expecting a permanent right rail that crowds the canvas. It's a button in the header with a count badge, opens on click. Good restraint.
- **Outfit bundle has a single "Save outfit" CTA in orange (the only orange in the UI for commitment).** I like that the bundle reads as one object — the `accent-50` tint and the "Saves all 4 to your Love lane" copy is clear. It doesn't pretend each item is independent.
- **L / M / S keyboard shortcuts on focused cards.** I'd actually use these. Most apps make you drag with a mouse and there's no keyboard path.

## What annoyed me

- **The starter chips don't fit me.** *Lightweight running shoes for trails* is a bro-y bullet. *Gifts for a coffee obsessive* is a Father's Day cliché. The throw and the lamp are OK but they're all under-$150 ish and skew "decorative tasteful millennial." Where's "a beach wedding outfit," "a desk lamp that won't look like an Ikea cliché" (literally Mara's example in PRODUCT.md), "linen curtains," "a birthday gift for my mom who has everything"? The starters should reflect the breadth Mara actually shops — apparel + home + gifts + occasional electronics. Right now it's all home + one fitness + one gift.
- **No category breadth signal in the empty state.** I don't know if this thing can help me with a wedding outfit or only with home accents. The welcome line says "a vibe, a need, or a specific product" but doesn't suggest categories. Daydream's iOS competitor leans hard on fashion; this could differentiate by showing breadth in the starter chips. It doesn't.
- **The "About you" card is *above* the input bar.** I'd glance at it on first load and think it's a settings panel I have to configure. Sticky position above the input means it competes with the input for attention every time I'm composing. I'd want it tucked into a corner or only revealed when a preference is captured.
- **There's no obvious "how does this work" or "who's behind this" affordance.** I distrust opaque AI picks (it's literally in my persona) and there's no link to a "why we surface what we surface" page. The MCP line at the bottom is one sentence. I'd want one more sentence of "ranking is preference-driven, not paid placement." Otherwise I assume sponsored ranking until proven otherwise.
- **The Buy button is labeled "Buy now."** That's a Klarna word. I'm not buying *now* — I'm deciding. On the *collapsed* card it should say "View at [merchant]" or just "Open." "Buy now" promises a checkout flow that doesn't exist here (it opens the merchant site in a new tab, which is correct — but the label oversells it). The expanded card says "Buy on [merchant]" which is way better. Make both consistent and prefer the latter.
- **No price filter / sort affordance visible.** If the first result set is $40-$400 and I want $40-$120, I have to type "show me cheaper" as a new message. That works once. It's annoying by the fourth time. A budget chip on the prefs card that's *actually wired into the next query* is fine, but I'd want a visible "under $X" pill on the result set itself.
- **The starter chip pills have a hairline border (`border-ink-200`).** Every other surface in the app uses shadow-XOR-border (it's literally in the design doc). The starters break that rule on first impression. Minor, but it's the first thing I see.
- **`SuggestionChips` only appears when `messages.length === 1`.** Once I've typed anything they vanish forever. I'd want "ask for an outfit," "show merchant info," "compare these two" as ambient suggestions *after* the first result lands — that's where the discoverability gap is.

## Would I come back?

Yeah, probably. If the first result on "vase for my hallway" is decent — meaning at least 4 of 6 products are things I'd actually consider, the merchant block tells me the truth, and the collage view doesn't fall apart with skinny product images — I'd come back tomorrow to try a harder query (gift for my brother-in-law who is impossible to shop for). The make-or-break is the *quality of the product set*, which I can't judge from the code. What I can judge is whether the surrounding UX gives the products a fair shot. It does. The chrome doesn't apologize for itself or scream at me, the transparency moves are there, and the share page (serif headline, OG-tagged, JS-optional) is something I'd actually paste into a group chat.

What would keep me from coming back: a coupon-bot moment ("save $5 with code MARA10!"), a sponsored chip pretending to be organic, or a result set where half the products are Chinese white-label things with no merchant info. None of those are *currently in the code*, but they're the failure modes I'd watch for in cycle 2 of using the app.

## Top 3 things I'd change

1. **Replace the starter chips with category-spanning, voice-matched prompts** — and drop the under-$150 ceiling on all of them. Try: *"a vase that won't look like Anthropologie"*, *"a wedding-guest dress in linen"*, *"a birthday gift for someone who already has everything"*, *"a desk lamp that doesn't scream Ikea"*. Match Mara's actual breadth (home + apparel + gifts + occasional electronics) and her actual voice (negation, specificity, distrust of clichés). The current starters read like a marketer wrote them; Mara's are how she talks to her group chat.

2. **Rename "Buy now" to "View at [merchant]" on the collapsed card.** "Buy now" is a Klarna/Amazon-Prime word and it sets up the wrong expectation for a discovery-first agent. The product brief explicitly says "no embedded checkout" — the button label should reflect that. The expanded-card "Buy on [merchant]" is the right pattern; just unify on it.

3. **Add a one-line "how ranking works" affordance** — a small "?" or "About this" link near the source-of-truth line at the bottom of the input bar. One sentence: *"Results are ranked by your preferences, not paid placement."* That single line buys the trust the entire product is built around. Right now I have to infer it from anti-goal #5 in the PM doc, which Mara is never going to read. Surface the promise where the user is.
