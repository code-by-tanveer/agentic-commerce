# Persona: Priya — Mumbai, mobile-first, budget-bounded

## My first session (narrative)

Okay so I open this on my Android Chrome, 6.1" screen, train from Bandra. First thing I'd type — honestly something like `monsoon-friendly slip-ons under 3000` or `kurta sets that don't scream office uniform`. Maybe `white sneakers that aren't basic` because that's an evergreen frustration. Mostly looking under ₹3000 — anything above I'd screenshot and save for Simpl/ZestMoney later.

But before I even type, I look at the starter chips. `"a desk lamp that won't look like an Ikea cliché"`. `"a winter coat that ships from EU"`. `"a chunky vase, ceramic, under $80"`. Yaar. **None** of these are for me. Desk lamp — fine, universal. Winter coat shipping from EU? In Mumbai I want monsoon, not winter. And $80 — `frontend/components/chat/ConversationCanvas.tsx:19` literally has a hardcoded dollar sign in the starter. That tells me everything I need to know about who this is for before I've even started.

I type my actual query anyway. Welcome message says *"Results come from Shopify merchants, ranked by your preferences, not by paid placement."* (`frontend/hooks/useConversation.tsx:140`). Fine, decent. Doesn't feel preachy, sits as one short sentence — not finger-wagging, just a fact. I'll allow it. But the *"Ranking is preference-driven, not paid placement"* footer at `frontend/components/chat/InputBar.tsx:181` reads like a compliance line — true, but who's the audience? Someone like me wouldn't even register it; we assume *everything* is paid until proven otherwise.

I expand a product. Merchant block (`MerchantBlock.tsx`) shows me: name, stars, returns policy, shipping speed, and `Made in IT`. Good signals — but I'm staring at the screen waiting for the one line that matters and **it isn't there**: *does this merchant actually ship to India, and what will the real total be?* No `shipsTo`. No "duties + shipping estimate". No "ships from India" tag. The interface confidently shows me a ₹-equivalent product price, then ghosts on the only number that decides whether I buy. That's the exact "$80 shipping at checkout" trap, **just dressed up nicer**. The 14-day returns badge is almost a cruel joke — return *to where*? Italy? At my cost? Bhai.

Currency. `frontend/lib/format.ts` hardcodes `Intl.NumberFormat('en-US', ...)`. So my ₹3,000 product gets formatted as `₹3,000.00` *with US grouping*, not Indian (which is `₹3,000` for thousands but `₹3,00,000` for lakhs — the lakh comma never appears). For sub-lakh stuff it's mostly fine. But the locale is wrong on principle, and the moment a product hits ₹1,00,000+ it'll render as `₹100,000` which any Indian eye reads as wrong.

I scroll. The PreferencesCard mobile trigger (`PreferencesCard.tsx:101`) is the one-line "About you, tap to add". Tappable, 44px, fine. I open it — the ethics grid pops up: Sustainable, Fair-trade, Organic, B-Corp, Women-owned, Small-batch, Vegan, Recycled. Eight values. For me? **Two relevant** at best (women-owned, small-batch). Missing what I'd actually filter on: *Made in India*, *handloom*, *khadi*, *Ayurvedic/non-toxic*, *cruelty-free*. The grid feels like it was built for a Brooklyn Etsy shopper.

First-scroll-fold at 390px Chrome: I get the Header, the welcome bubble, the four English-only starter chips. No localisation hint, no ₹ visible anywhere, no India-context language. If my data hiccups in the cab tunnel, the stream will probably stall and I'll get the "Hitting traffic" error (`useConversation.tsx:309`) — at least that copy is honest now, which I appreciate.

## What worked for me

- The "Buy on {merchant}" CTA (`ProductCard.tsx:245`) — I like that I'm being told I'll leave to a Shopify checkout. No fake in-app trust theatre. Matches how I already shop (DM → external link).
- Merchant `Made in IT` line + the "Merchant didn't publish ..." italic fallback (`MerchantBlock.tsx:131`). The honesty-when-missing pattern is actually rare and good. I trust this more than a fake 4.8★ stamp.
- Mobile bottom-sheet for preferences with focus-trap + 44px tap target. Standard, works.
- Welcome line is short and not chirpy. No mascot, no "Hi there!". Granola energy. Approved.
- The trust footer is one line, not a banner. Doesn't shout.

## What annoyed me / would make me bounce

- **Starter chips are a NYC dinner party.** Desk lamp, winter coat, ceramic vase under $80. `$` literal in source (`ConversationCanvas.tsx:19`) — this is the first signal I see and it tells me I'm not the customer. Bounce risk: high, on first paint.
- **No "ships to" field on MerchantInfo.** `frontend/types/product.ts:41`. The whole transparency block is undermined: it shows returns + speed + origin but **silently omits the one number that wrecks cross-border carts**. The "$80-at-checkout trap" is left wide open. This is the single biggest issue for me.
- **No duties/total-landed estimate.** A "14-day returns" badge from a US/IT merchant is meaningless if returning costs me ₹4000 in courier + I eat the import duty.
- **`Intl.NumberFormat('en-US')` for everything** (`lib/format.ts:3`). Will mis-group lakhs. Should be `en-IN` when currency is INR, or just locale-detect.
- **Ethics grid maps to ~2/8 of my values.** Missing: Made-in-India, handloom/khadi, Ayurvedic/non-toxic, cruelty-free. Sustainable/Fair-trade/B-Corp are EU/US compliance vocab — I don't shop with those words.
- **No BNPL signal.** I default-route ₹3000+ to Simpl/ZestMoney. PRODUCT.md §6 explicitly anti-goals BNPL ("Klarna/Honey territory") — which is a fair positioning call for the West but it means *I don't have a path to commit on anything over my impulse budget*.
- **Welcome copy doesn't acknowledge regional context.** No "₹" hint, no Hindi affordance, no "we work with merchants who ship to India" line. Compare: anything that says "ships to India confirmed" in the first paint earns a 10-second extension before I bounce.
- **`/s/[id]` lookbook** assumes I'd share with friends who read English. Fine for me personally, but if I'm sending to my mom or didi, they'd want the recap in Hindi. No language toggle, no `lang="en-IN"`, OG image is English-only.

## Hindi/English / India-specific findings

- App is English-only. `<html lang>` isn't set per locale (didn't check layout, but no i18n infrastructure visible from `page.tsx`). I read English fine but for sharing with family I'd want at least `/s/[id]` to support a Devanagari recap.
- Numerals: I'd type "under 3000" — the agent has to handle the bare number without a currency symbol. If the backend reasoning assumes `$` or `USD` by default, my budget will silently mismatch.
- Currency assumption in `formatMoney` defaults to `'USD'` (`lib/format.ts:4`). The first time a card renders with no currency from the BE, it falls back to USD. For me that's a wrong-by-default trust break.
- `originCountryDisplay` (`lib/country.ts`) has 26 entries; `IN` *is* in there, which is nice. So a Made-in-India merchant would actually surface. Small win.
- No Devanagari script anywhere; reasoning chips and merchant tags are Latin-only. A `handloom` or `khadi` tag from an Indian Shopify merchant would render as raw text — fine, but won't fire any reasoning rule (`ETHICS_SYNONYMS` in `packages/events/src/index.ts:82` has no Indian-context synonyms).
- Mid-range Android Chrome at 390px: layout looks like it'd hold (max-w-3xl, px-4, sticky input bar). No obvious horizontal-scroll smell. The grain background + soft shadows should be fine on a mid-tier GPU. Stream-token render could chug on a Snapdragon 6xx but I'd give that a pass until I see it.

## Top 3 changes for users like me

1. **Add `shipsTo` + landed-cost estimate to `MerchantInfo`.** Right now the merchant block is a half-finished trust artifact for anyone shopping cross-border. Show "Ships to IN: yes, ~₹650 shipping, ~7–14 days, duties at delivery" OR "Doesn't ship to IN". The honesty pattern already exists ("Merchant didn't publish this") — extend it to the field that actually decides the sale.
2. **Locale-aware everything: currency formatting (`en-IN` when INR), starter chips, and ethics vocabulary.** Drop the `$80` literal in `ConversationCanvas.tsx`. Rotate 1–2 region-appropriate starters in based on `Accept-Language` or geolocation ("monsoon-friendly slip-ons under 3000"). Add 2–3 India-relevant ethics chips (Made-in-India, handloom, cruelty-free) — or better, let merchants supply their own ethics vocabulary and rank by overlap.
3. **Soften the trust footer's audience.** "Ranking is preference-driven, not paid placement" lands as Western compliance-speak. For a user who's already cynical, lead with the *operational* promise: "We don't take affiliate kickbacks. The merchant ships and returns; we don't touch your money." That's the version I'd believe.
