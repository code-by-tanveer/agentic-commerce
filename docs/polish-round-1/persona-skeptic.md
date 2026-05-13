# Persona: The Skeptic

I'm 45. I work in tech. I've used Perplexity Shopping, I've yelled at Rufus, I tried Daydream once and uninstalled it. A coworker — someone whose taste I trust — said this one was different. I'm here to find the moment it gives itself away. Every shopping bot does eventually. The tell is usually in the first 90 seconds: a smiley emoji, an "I think you'll love this," a fake percent-off chip with no math behind it, a share page that reads like a horoscope. I'm watching for those.

My query: **"good kitchen knives, German or Japanese, around $200."**

## Where I caught the bot (specific moments)

- **The Sparkles icon in the header.** `frontend/components/chat/Header.tsx:34` — a `Sparkles` lucide icon in a black pill is the *exact* visual shorthand every AI product has used since 2023. PRODUCT.md §6 says "No 'AI personality' / mascot. Granola's 'invisible AI' principle." Then they put a sparkle on the header. A monochrome wordmark, a chef's-hat glyph for the knives use case, or literally nothing would've been more on-brand than the universal-AI-bot sigil. This is the cheapest tell in the app and they paid it voluntarily.
- **The header subtitle: "Conversational product discovery."** It's not chirpy, but it's marketing copy. Real tools don't subtitle themselves. Granola doesn't say "AI meeting notes that actually work" under its name. It just says "Granola." This subtitle reads as if it's reassuring *me* that it's not a chatbot — which means it's a chatbot.
- **The welcome message says "I'll surface options from Shopify merchants."** First-person `I'll`. `frontend/hooks/useConversation.tsx:135`. Compare to a quiet professional, who would write `Tell me what you're shopping for — a vibe, a need, or a specific product. Results come from Shopify merchants.` Drop the "I" and the agent is suddenly less of a persona. The current line is one preposition away from "Hi I'm Aria 👋".
- **The error-state copy in `agent.ts`.** "Hitting traffic — retrying in a few seconds." (line 342). "Couldn't reach the catalog. Retry?" (line 332). The em dashes, the rhetorical question marks — this is conversational-bot voice. A quiet professional would say `Rate limit. Retrying.` and `Catalog unreachable.` These read like a TurboTax mascot apologizing.
- **The `Working on` fallback verb in ToolStatus.tsx:27.** When a tool isn't in the `VERBS` map, the loader says "Working on …". That's a chirpy placeholder. If a new tool ships without a verb entry, the user sees the personality leak through. Either statically enumerate verbs at compile time (no fallback) or fall back to nothing (just the spinner).

## Where the app did NOT feel like a bot (good signs)

- **The system prompt is genuinely quiet.** `backend/src/services/prompts.ts` — one sentence, no name, no "you are helpful and harmless," no "always end with a follow-up question." It tells the model "Prefer running a tool over speculating," "be brief in prose — the UI renders product cards inline; do not describe what the user can already see," and "Never invent prices, merchants, or shipping times." That's a *constraint* prompt, not a personality prompt. I have seen exactly two of these in the wild. This is the single biggest reason I might trust this app.
- **The chips are computed, not generated.** I went looking for the moment they hallucinate "70% off MSRP" and there is no such moment. `backend/src/services/reasoning.ts` is a pure rules engine: `discountChip` reads `product.compareAtPrice`, computes `Math.round(((compare - price) / compare) * 100)`, and refuses to show anything under 15%. The label is `"${pct}% off"`. The tooltip is `"Reduced from ${currency} ${compare}."` — the actual MSRP number. No LLM in the chip path. No marketing-adjective slop. This is the chip moat earned.
- **The over-budget chip is a warning, not a sell.** Most bots would hide "over budget" or rephrase it as "an investment piece." This one shows `over budget` in amber and tooltips `$X above your $Y cap.` That is a *user-side* chip, not a merchant-side chip. It's the first time a shopping AI has surfaced friction *against* a purchase to me. I noticed.
- **`recommend_outfit` rationale is data-grounded.** I dug into `backend/src/services/tools/recommendOutfit.ts:287` (`buildItemRationale`) — the rationale literally enumerates `same merchant (Yamasaki)`, `shared tag "carbon-steel"`, `similar price band`, `ships to the same region (DE)`. It returns `undefined` when none of those facts apply. So when I see a rationale, I know it came from the catalog. When I don't see one, I know they didn't have one. That's honest.
- **The "merchant didn't publish this" pattern.** I haven't tapped expand yet but the MerchantBlock plumbing degrades to a literal "merchant didn't publish [field]" string instead of fabricating a 4.5 stars or a ships-in-3-days. PRODUCT.md acceptance #5 holds. This is the inverse of every Amazon listing.
- **The ToolStatus verbs are verb+object, dim, no progress percentages.** "Searching German kitchen knives around $200" sits in `text-ink-400` with a rotating dot. It is not "Thinking 🤔" or "Generating your perfect picks ✨". `ToolStatus.tsx:20-24` maps three tools to three verbs and stops. I'll allow it.
- **The grep came up clean.** I ran `grep -rinE "love this|you'll love|i think|happy to|amazing|fantastic|here you go|here's"` across `frontend/components/` and `backend/src/services/` and found nothing in user-facing copy. Only matches were the word `assistant` in code identifiers (`ChatCompletionAssistantMessageParam`) and a single `here's` in a code comment. The discipline holds at the lexical level.
- **The TypingIndicator is three dots, not "Thinking…".** No verb-noun chirp during the stream. Just animation.
- **The reset button says "New chat," not "Start over with your shopping helper 🛍️".** Tiny but real.

## The reasoning-chip moment of truth

This is where I usually catch them. The chip is the AI's ad copy — short, punchy, and almost always generated.

I imagine the result for "kitchen knives around $200" returns a Wüsthof Classic 8" chef's at $169 and a Tojiro DP at $99. The chips I'd expect to see, based on `reasoning.ts`:

- **`32% off`** (if `compareAtPrice` is $249). Tap it → `Reduced from USD 249.00.` This is a number I can verify by clicking out to the merchant. It is not "Best deal we've seen this year!" It is not "Limited time only." It is `compareAtPrice − price`, rounded, suppressed under 15%. **I trust this chip.**
- **`ships to US`** (if I'd told it I'm in the US, which I haven't yet). Tap it → `Merchant ships this product to US.` Sourced from `variant.shipsTo`. **I trust this chip.**
- **`over budget`** if I'd said $200 and the Wüsthof Classic Ikon is $249. Tap → `USD 49.00 above your USD 200.00 cap.` Honest. **I trust this chip.**

What I do *not* see anywhere in `reasoning.ts`: a chip like `"editor's pick"`, `"trending"`, `"customer favorite"`, `"matches your vibe"`. Those are the chips that would have killed it for me. They aren't there because there's no code path that could generate them — the rules engine has six chip kinds and they all reduce to catalog facts. The trick of this app is that the chips look like AI flair and are actually deterministic. The LLM never sees them; it produces the prose around them and the prose is bounded by the system prompt's "do not describe what the user can already see."

If I tap a `15% off` chip and the tooltip just says `"15% off"` with no MSRP underneath — I'm out. But the code attaches `Reduced from ${currency} ${compare.toFixed(2)}` to every discount chip. So I won't have that moment.

The one risk: the agent's prose between chips. If the streamed text says "These are some great German and Japanese options around your budget!" — that's the chirpy moment. The system prompt instructs brevity but doesn't *forbid* enthusiasm. I'd want to see one more line in `prompts.ts`: `Do not use evaluative adjectives ("great", "perfect", "amazing"). Describe what the result set contains, not whether it's good.`

## The share-page gist moment

This is the other classic tell. AI-summary pages always read like fortune cookies: *"A curated selection celebrating modern craftsmanship and timeless design."* I clicked through `services/summary.ts` expecting the worst.

It's not generated. The gist is **literally the user's first message**, normalized and truncated to 120 chars. `extractFirstUserText(messages)` → `clampGist(seed)`. If I typed "good kitchen knives, German or Japanese, around $200," the lookbook hero in italic display serif reads:

> *good kitchen knives, German or Japanese, around $200.*

That's me talking back to me. That's the opposite of a fortune cookie. The fallback when there's no seed is `"A small collection of things worth a second look."` — that one *does* sound a touch fortune-cookie, but it only fires when the session has no user messages, which means nobody's reading the page anyway.

Cycle 6 left a comment saying a Groq one-shot might replace this. **Do not.** This is the most trust-earning sentence on the share page precisely because it's mine. The minute that gist becomes generated, the lookbook becomes another AI summary and I won't share it.

## Verdict: would I tell a friend?

Yes — with two asterisks.

The product has actually internalized the anti-goal in PRODUCT.md §6. I went hunting for chirp and the lexical surface is mostly clean. The chips are real math on real catalog fields. The merchant card admits when data is missing. The share-page gist is the user's own words. The system prompt is short and prohibitive, not personable. These are the four places every other shopping bot fails and this one passes.

The asterisks:

1. **The Sparkles icon has to go.** It's two minutes of work and it undoes the most-cited principle in the product brief. Replace with the wordmark, a knife glyph for the brand, or nothing. If you keep it, write an ADR explaining why and own the contradiction.
2. **Tighten the agent's voice on three lines.** The welcome message ("I'll surface options…"), the error strings ("Hitting traffic — retrying in a few seconds"), and the ToolStatus fallback ("Working on …") all leak first-person assistant tone. The fix is small: `Tell me what you're shopping for. Results come from Shopify merchants.` / `Rate limit. Retrying.` / `Couldn't reach the catalog.` / a static verb map with no fallback.

Do those two things and I tell a friend. Don't do them and I tell a friend with a caveat: *"It's the least chatbot-y shopping AI out there, but it still has the sparkle."* That caveat is small but it's the kind of thing people quote when they're explaining why they didn't switch.

One more thing. The fact that I can find these two specific complaints and nothing else is the actual signal. In Rufus I could write this list and still have eleven more items. Here I have two. That's the difference my coworker was talking about. I'll come back tomorrow and run "a hallway runner for an oak floor, under €300, ships to Berlin" and see whether the chips light up the way I think they will.
