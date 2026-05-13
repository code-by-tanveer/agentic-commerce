# Persona: Jordan

32, parent, four gifts a year, hard deadlines. Wants ONE good answer and a
confidence signal it'll land by Friday. 8 minutes, max.

## The gift hunt (narrative)

T+0:00. I type: *"a thoughtful birthday gift for a friend who loves pottery,
ships by Friday, under $80."*

The agent fires `search_catalog`. Reading `backend/src/services/agent.ts`
PREFERENCE_SYSTEM_ADDENDUM, the model is told to call `save_preference` for
budget and ships_to and to pass `filters.ships_to` to search. So in theory,
"$80" should land as `budget.max=80` and my region (US, say) should be inferred
or asked. But: `searchCatalog` only honours `filters.price.max` AFTER the MCP
returns (line 112) — fine. And the system prompt does NOT tell the model to
extract "ships by Friday" as a date — there's no `arrives_by` slot in the
preferences shape, no chip kind in `reasoning.ts` for delivery deadline. So
"ships by Friday" becomes prose context the model may or may not use.

T+0:20. Cards stream in. Pottery mugs, a hand-thrown bowl, some studio
prints. ProductCard.tsx shows title, merchant, reasoning chips, price, Buy.
Chips come from `computeChips()` — ranking is size_match > discount > price >
shipping > ethics. With budget=80 saved, I'd see an `over budget` warning chip
on any >$80 item (good). With `ships_to=US`, I'd see a `ships to US` neutral
chip if the variant lists it. **There is no chip that says "arrives Thu" or
"likely by Fri".** The closest data — `shippingDays` like "3-5 days" — sits
inside MerchantBlock.tsx, which only renders when I EXPAND the card.

T+1:00. I tap a $62 stoneware mug to expand it. MerchantBlock shows "3-5 day
shipping," 14-day returns, 4.6 stars. I do the math: today is Wed May 13.
3 days = Sat. 5 days = Mon. *That misses Friday.* No card-surface signal told
me before I clicked. I expand two more — same dance, same math, same anxiety.

T+3:00. I find a $54 pour-over set with "2-day shipping" in MerchantBlock.
The chip on the card said "ships to US" — neutral grey. That's the WIN signal,
but it looks identical to all the other shipping chips. Nothing on the card
front said *fast*.

T+4:00. Save it. I press `L` on the focused card — `useShortlist.addToLane`
fires, aria-live confirms "Saved to Love." Good keyboard fallback. The
Shortlist drawer (right rail on desktop) is correct UI for this — three lanes
(Love / Maybe / Skip), drag or L/M/S. For four gifts a year I only need Love;
Maybe and Skip add cognitive weight I don't have time for.

T+5:00. Share it with the recipient's spouse to confirm taste. Hit
ShareButton → `/s/[id]`. Read `SummaryHero.tsx`: it says "A lookbook from
Agentic Commerce" + the gist sentence + item/merchant count. **No name, no
"from Jordan," no cookie or session leak in the visible HTML or OG tags.**
Anonymous gift safe. Good. BUT — `SummaryShareBar.tsx` line 70 renders an
"Open in chat" link to `/?session=<MY sessionId>`. I read `useSession.tsx`:
the home page only calls `getOrCreateSession()` which uses cookies, so the
spouse clicking that link does NOT actually resume my session. Fine for
privacy — but the affordance is dead chrome. It promises continuity it
can't deliver.

T+6:30. Spouse texts back: "Looks great, get it." I click Buy on
ProductCard → opens merchant checkout in a new tab. Done by T+7:30.
Under budget. Under deadline (assuming the "2-day" string isn't a lie —
nothing here verifies it).

## Did the app help me?

Mostly yes, with a load-bearing caveat. The agent did the search, the chips
flagged budget, the shortlist + share flow is clean and anonymous. I finished
inside 8 minutes. But the single thing I came for — *confidence this arrives
by Friday* — the UI made me earn by expanding three cards and doing weekday
arithmetic. The data is there (`shippingDays` on MerchantInfo), it just
isn't surfaced where I'm scanning.

## Friction points

- **No "arrives by" chip.** `reasoning.ts` has shipping_to (region match,
  neutral) but no delivery-window chip. For a deadline persona this is the
  whole game. A green "likely by Fri" / amber "tight — Mon" / red "won't make
  it" chip on the card front would have saved me four expand-collapse cycles.
- **`shippingDays` is a free-form string.** "3-5 days," "ships in 1 week,"
  "fast" — `normalize.ts` doesn't parse it. So even if we wanted a chip we'd
  need a parser + a today-relative compare. Worth doing.
- **No way to tell the agent "by Friday" structurally.** No `arrives_by` in
  `PreferenceEntrySnapshot`, no slot the system addendum tells the model to
  extract. The deadline lives in prose only.
- **"Open in chat" link on `/s/[id]` is dead.** Reads like a CTA, does
  nothing useful for a recipient/spouse (they get their own cookie session,
  not mine). Either make it resume-the-shared-session or remove it.
- **Three-lane Shortlist is overkill for me.** Love is what I need. Maybe
  and Skip read as "more decisions you have to make" — exactly the friction
  a 8-minute hunt can't afford. PRODUCT.md Q1 already flags this; for Jordan
  the answer is clearly "binary."
- **Buy CTA on a third-party shop opens in a new tab without telling me the
  delivery estimate I most cared about.** Once I leave the merchant page is
  the source of truth, but the handoff feels blind.

## What would have saved me 2 minutes

- A `delivery` chip computed from `shippingDays` + today's date + a deadline
  hint pulled from my query ("by Friday"). Three tones: positive (arrives in
  time), warning (cutting it close), danger (won't make it). Sort it above
  size_match for any session where a deadline phrase is detected.
- A "deadline" field in the About-you panel — pre-extract "by Friday" the
  way budget gets pre-extracted today.
- Collapse Maybe/Skip into a single "Pass" pile (or hide them entirely)
  when the session looks like a one-shot gift hunt (e.g. query contains
  "gift for" + a date phrase).
- Either wire `?session=` on the home page to actually resume the shared
  shortlist, or drop the "Open in chat" affordance from `SummaryShareBar`.

## Confidence rating out of 10

6/10. I got there. Under budget, under time, anonymous share worked. But the
app made me do the delivery-date math three times when the data was already
in the response. For my use case that's the moat — and it's the missing chip.
