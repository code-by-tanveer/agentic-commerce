# Persona: Ronan — Dublin dad, 20-minute window, reluctant AI user

47, Dublin, software PM. Gift for the 13-year-old (drawing + skateboards),
€40–60, until the 16:00 call. Friend told me to try this thing.

## The kid-gift hunt (narrative with timestamps)

**14:42** — Tab open. No tour, no "let me show you around." Grand. I type:
"gift for 13-year-old, drawing and skateboards, under €60, ships to Ireland."

**14:42** — Reading the tool spec in my head while it spins: `search_catalog`
takes `query`, optional `filters.price.max`, `available`, and `ships_to`. The
agent has to actually *pass* `ships_to: "IE"` for the filter to apply — if it
just drops "ships to Ireland" into the free-text query, the catalog doesn't
hard-filter on it. So whether I get Ireland-shippable results depends on
whether the model bothered. Cards stream back; honestly faster than I
expected. Four products, two of which are sketchbooks and one is a deck.

**14:43** — Expand the deck. MerchantBlock sits above the Buy area: seller
name, 4.5 stars, "14-day returns" pill, shipping speed line. No country of
origin on this one — italic line at the bottom: *"Merchant didn't publish
country of origin."* I appreciate that they don't fake it. Ships to Ireland —
the merchant block doesn't explicitly say "Ireland: yes." It says "Ships in
3–5 days" but that's days, not geography. The `ships_to` filter is what
gates inclusion; the card itself doesn't reassure me. I'm guessing yes
because the result came back, but I'd like the card to *say* it.

**14:45** — Star/save the deck (the price chip's hovering at €52, in budget).

**14:46** — Second option needed. Spouse will ask "did you compare?" I type:
"something more art-leaning under €50, same kid." Cards refresh. A
hardback A4 sketchbook with paint markers, €38. Save.

**14:48** — Affordance: "Compare these two." I tap it. ComparisonTable opens.
Rows: Image, Price, Merchant, Shipping, Why this. The **Shipping** row
literally renders an em-dash. Reading the source confirms: it's a Cycle 1
placeholder; the merchant block is only on the expanded card, not in the
table. So the comparison table is *less* informative than two expanded cards
side-by-side. As a tired dad I'm not going to scroll-compare two cards
mentally — but I'm also not impressed by a table with a hyphen where the
delivery info should be. Verdict: comparison table is for someone with more
time than me. I close it and just trust the chips.

**14:51** — Right. Share with the wife. There's a share bar with "Open in
chat" linking to `/?session=<my-id>`. I check: yes, `useSession` reads the
`?session=` query param on first mount and prefers it over her local
cookie. So when she opens the link on her phone she lands in *my*
conversation, sees my two saved products, can ask the agent follow-ups
against the same shortlist. That's genuinely good. The one wrinkle: it
silently hijacks her session for that tab. If she's already chatting with
the agent about something else, my link nukes her context until she closes
the tab. The code comment acknowledges this ("we don't pollute the user's
main session" — only true because the deep-link path doesn't persist).
WhatsApp it to her. She replies "the markers one." Done.

**14:56** — Tap **Buy on {merchant}** on the sketchbook. New tab,
`noopener,noreferrer`, lands on the merchant's Shopify checkout — recognisable
Shopify chrome, merchant's domain, padlock. Reads as legit, not a phishing
funnel. The label "Buy on {merchant}" (not "Buy now") is the right call —
tells me whose card form I'm about to land on. Pay, ship to Dublin, out.

**15:02** — Twenty minutes flat. With a baby in the next room.

## What helped (Be specific.)

- The streaming cards. No "thinking…" spinner for 8 seconds — first card
  appeared inside a second or two and the rest filled in. Tired-dad-friendly.
- `MerchantBlock` italic *"Merchant didn't publish X"* line beats a fake
  badge. I trust it more *because* it admits gaps.
- "Buy on {merchant}" wording on the checkout button. Tells me where I'm
  about to land before I tap. The new-tab + `noopener,noreferrer` is the
  table-stakes safe handoff.
- `?session=<id>` deep-link actually works. The wife opens my link, sees the
  same two saved items, can poke the agent. Co-decision in two messages.
- Save/star is one tap and survives the second search. I didn't lose option 1
  when I refined for option 2.

## What wasted my time

- The **ComparisonTable's Shipping row is an em-dash** — a placeholder from
  Cycle 1 still shipping. For a 20-minute shopper this is the single thing
  the table should tell me, and it doesn't.
- Card itself never says "Ships to Ireland: yes." It relies on me believing
  that the result-set was filtered. Show me a green tick or the country code.
- `ships_to` is *only* applied if the model decides to pass it. If I type
  "ships to Ireland" and the model treats it as keyword soup, I'm getting
  unfiltered results without knowing. Should be a sticky pref or a visible
  filter chip I can see is active.
- No price-range chip on the cards — I'm reading €52, €38, €44 and doing the
  budget math myself. Fine, but a "within budget" tint would save the
  glance.

## Share-with-spouse flow

- The link is `/?session=<id>`. `useSession` honours it on first mount and
  hands the same `sessionId` to ShortlistProvider, so she sees my saved
  items. Genuinely works — I didn't expect that to be wired end-to-end.
- Caveat: if she's already mid-chat in that tab, my link replaces her
  context. Fine for me (anonymous gift, she doesn't have her own session
  here) but worth a "you're viewing Ronan's shortlist" banner so she knows.
- The shortlist is read/write shared, not read-only. She could in theory
  unsave one of mine. Probably fine for a couple; would be a footgun if I
  shared with a group chat.

## Final purchase confidence

- High enough. The Shopify hand-off is the part I already trust — known
  domain, known checkout chrome, my card details never touch this app.
- The merchant transparency block did most of the work before I tapped Buy:
  4.5★, 14-day returns, 3–5 day shipping. That's the trust trifecta for a
  gift you can't return easily because it's a surprise.
- One bruise: no order confirmation comes back into the chat. Once I'm on
  Shopify I'm gone. Fine for a one-shot gift; gap for repeat use.

## Top 3 fixes for time-boxed shoppers

1. **Fix ComparisonTable's Shipping row.** Pull the merchant block's
   `shippingDays` and `returnsPolicy` into the table. An em-dash where the
   delivery info should be is the single biggest "this app is half-finished"
   tell I hit. Two-minute fix in `frontend/components/product/ComparisonTable.tsx`.
2. **Show the `ships_to` filter on the card.** A tiny "Ships to IE" chip
   (green when confirmed, amber "check at checkout" when the merchant data
   is silent). Right now the user has to *trust* the agent passed the
   filter; make it visible.
3. **Budget chip on each card.** A subtle "within €40–60" pill when I've
   stated a budget. Saves the mental math when I'm scanning four cards in
   ten seconds.

— Ronan. Off to the call. The app was faster than I deserved.
