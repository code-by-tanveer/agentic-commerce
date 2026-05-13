# Persona: Aleksey — Berlin dev, intermittent VoiceOver

## The desk-chair hunt (narrative)

It's a Tuesday. My Herman Miller knockoff finally tilted itself into the floor.
I land on the page expecting the usual "Shop Now / Trending / Sponsored" cargo
cult. Instead I get a single text bubble that tells me, in plain language,
that results come from Shopify merchants and aren't pay-to-play. Good. The
chip "a winter coat that ships from EU" tells me the team has at least heard
of Europe — promising — but there is nothing in the suggestion list about
furniture, so I type: *"sturdy desk chair, around €400, ships to Germany."*

Stream opens. Single rotating dot, "Searching desk chair €400 Germany." Cards
slide in with a 40-millisecond stagger — capped at six per `DESIGN.md §2.8`,
so the seventh and eighth snap in. Acceptable. Each card has a merchant name
(not "Sponsored brand partner"), a shipping line, and a "Made in …" tag
where the merchant bothered to publish it. When a field is missing, the card
admits it: *"Merchant didn't publish country of origin."* That admission is
worth more than a fabricated badge. I notice nothing actually surfaces a
*ships-to-Germany* signal — `shippingDays` is a free-form string from the
merchant, no destination filter on the client. So I'm trusting either the
agent's prompt to filter, or the merchant's own copy. Half a star deducted.

I hit Tab. The card is `role="button"`, `tabIndex={0}`. Enter toggles expand,
`l` saves to Love, `m` to Maybe, `s` to Skip — lowercase accepted (T1.15),
which is a touch I respect. The Buy button is correctly a *sibling* button,
not nested inside another button. Someone read the HTML spec.

## Dev-tools observations (predicted from code)

- **Network**: `/api/chat` POST, `text/event-stream`. Events are well-named
  (`text_delta`, `tool_status`, `products`, `comparison`, `outfit`,
  `moodboard`, `preference_update`, `done`, `ping`, `error`). Chrome's
  EventStream panel will render them cleanly — `msg.event` always set,
  `msg.data` is JSON. Heartbeats are `ping` and discarded silently. Zod-
  validated on the client, which means a wire-drift bug surfaces as a
  *typed* `StreamError('parse', …)`, not silent corruption. `openWhenHidden:
  true` so backgrounded tabs don't drop the stream — good for the
  shopper-who-tabs-away. No auto-reconnect, which is correct: half-finished
  agent turns are not resumable.
- **Console noise**: exactly one `console.warn` in the entire frontend —
  `[agentic.stream.unknown_event]` in `lib/stream.ts:112`, fixed prefix,
  greppable, fires only on schema drift. No `console.log` debris elsewhere
  in `components/` or `app/`. Quiet. I approve.
- **Lighthouse expectations**: perf 85-ish (Framer Motion + next/font),
  a11y 95+ (the dialog roles, focus traps, and aria-labels are all there),
  best-practices 100, SEO whatever — chat UIs don't index. The `motion.article`
  on every card is expensive when 12+ products land; under reduced motion
  it correctly collapses to an opacity-only crossfade.
- **Bundle**: `framer-motion`, `lucide-react`, `@vercel/og`, `zod`,
  `@microsoft/fetch-event-source`, `tailwind-merge`, `clsx`. lucide is
  tree-shakeable so individual icon imports are fine. framer-motion is the
  fat one (~50 kB gz) and it's load-bearing — fair trade. No moment, no
  lodash, no styled-components ghosts. Country names hand-rolled to avoid
  pulling CLDR — comment in `lib/country.ts` actually explains why. I respect
  this.

## VoiceOver tab-through

- **Canvas re-announce noise**: `ConversationCanvas` no longer carries
  `aria-live` (T1.5 — comment is explicit). The polite live region is
  scoped to `ToolStatus` with `aria-atomic="false"`, so each tool update
  reads as a delta, not a re-concatenation of the whole history. Streaming
  text deltas do *not* re-announce. This is the correct call. Bravo.
- **Sheet focus traps**: `useFocusTrap` is shared between `PreferencesCard`
  bottom sheet and the mobile `Shortlist` sheet. It moves focus to the last
  focusable on open (sensible on a sheet whose primary action is at the
  bottom), traps Tab/Shift-Tab, handles Escape, and restores focus to the
  previously-focused element on unmount — wrapped in a try/catch in case
  the element was unmounted. Solid. One nit: there's no
  `aria-labelledby` wiring on the dialog roots that I saw in passing —
  screen readers announce "dialog" with no name. Would file as bug.
- **Heart-save announcement**: tapping the heart in `ProductCard` triggers
  `setAriaMsg('Saved to Love')`. There is a *separate* `sr-only`
  `role="status" aria-live="polite"` span per card. So yes, VoiceOver
  announces "Saved to Love" after Tab+Enter on the heart, and "Saved to
  Maybe" / "Saved to Skip" for `m` / `s`. The same string sits in
  `aria-label` and toggles to "Saved to Love" once `isLoved`, plus
  `aria-pressed={isLoved}` — proper toggle button semantics. Good.

## Architectural critique (as a dev who shopped)

- The split `ConversationStateContext` / `ConversationActionsContext` is a
  small but real perf win — InputBar and Moodboard refine don't re-render
  per text delta. This is the kind of detail that separates "vibe coded"
  from "shipped before."
- `streamChat` is a callback-to-async-iterator bridge written by hand
  because `fetchEventSource` is callback-based. Clean. The `FatalError`
  trick to break out of the library's infinite retry loop is the right
  workaround for that library's defaults.
- The shopper's destination country is nowhere in the client request body.
  `ChatRequestBody = { sessionId?, messages }`. The agent presumably picks
  up locale from the prose, which is fragile. A `locale` / `shipTo`
  field would let the BE filter merchants instead of trusting prompt-glue.
- Reasoning chips classification (`shipping`, etc.) is string-typed —
  fine for now, but I'd want a discriminated union once the schema settles.
- Persistence is best-effort post-stream via `appendMessage`. Failure is
  swallowed. Defensible because the next request body is canonical history,
  but I'd at least bump a counter — silent persistence loss is the kind
  of thing you only notice in an incident.

## Top 3 polish moves I'd land in a PR

1. Add `aria-labelledby` (and a visually-hidden `<h2>` if needed) to both
   sheet dialogs in `PreferencesCard.tsx:759` and `Shortlist.tsx:300`.
   VoiceOver currently announces "dialog" with no name.
2. Plumb a `shipTo` field through `ChatRequestBody` in `lib/stream.ts`,
   default from `navigator.language` region or a country picker, and use it
   to gate `search_catalog` results server-side rather than relying on
   prose to encode the destination.
3. Add a destination-shipping affordance to `MerchantBlock` /
   `ReasoningChips` — a green/grey "Ships to DE" pill derived from a real
   structured field, not the merchant's free-form `shippingDays` string.
   Half the value proposition of "EU-friendly shopping" lives or dies on
   this one chip.
