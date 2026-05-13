# Persona: Lila — neurodivergent, reduced-motion, sensory-sensitive

I went in expecting to bounce. Calling out where the team did the quiet
thing first, and where I still flinched.

## Calmness audit

Motion-respect verification per component (sample):

- `ProductCard.tsx` — honored. `useReducedMotion()` at line 32 collapses entry
  to a 100ms opacity-only fade, drops the index stagger, AND disables
  `layout` reflow (`layout={!reduce}`). The expand panel also swaps from a
  height+opacity tween to opacity-only. Clean.
- `ToolStatus.tsx` — honored. The single rotating dot becomes an opacity
  pulse under reduced motion (line 139). Done-check shrinks from
  scale+opacity to opacity only.
- `OutfitBundle.tsx` — honored. Section entry collapses to a 100ms fade.
- `ImageDropzone.tsx` — honored. Overlay fade explicitly chooses 100ms when
  `reduced` is true (line 117).
- `Moodboard.tsx` — honored. Card entry and chip-stagger both swap to a
  zero-delay 100ms fade.
- `Shortlist.tsx` — honored. Rail slide-in, mobile sheet slide-up, and scrim
  all branch on `reduce`. The lane drag-over `bg-accent-50` flash is a CSS
  `transition` which UA defaults already suppress.
- `SuggestionChips.tsx` — partial. Uses `framer-motion` with `delay: 0.1`
  and no `useReducedMotion`. The motion itself is opacity-only, so the
  damage is small, but it's the only component that doesn't pass the brief
  literally. Worth a one-line fix: import the hook and zero the delay.
- `TypingIndicator.tsx` — IGNORED. See next bullet.
- `ReasoningChips.tsx` — honored. Entry stagger goes to zero-delay 100ms.
- `MessageBubble.tsx`, `ConversationCanvas.tsx`, `CollageView.tsx` — all
  honored, with CollageView additionally disabling Framer `layout` reflow.

TypingIndicator under reduced-motion: **fails.** The component does not
import `useReducedMotion`. Three dots bounce on a `repeat: Infinity` loop
forever while the model thinks. For an ADHD pattern-locker an infinite
y-translate plus opacity pulse is exactly the attentional hijack to avoid.
This is the single most fixable harm in the audit.

Loops and infinite animations:
- `TypingIndicator` — three infinite loops, NOT gated. Worst offender.
- `ToolStatus` running dot — infinite rotation OR infinite opacity pulse;
  the pulse-under-reduced-motion path is itself still an infinite loop.
  I would prefer a non-animated static dot or a single-cycle "•" → "✓"
  swap when reduced.
- `Shortlist.tsx` and `PreferencesCard.tsx` skeleton `animate-pulse` — both
  explicitly suppress the pulse class under reduced motion. Good.
- `InputBar.tsx` Loader2 `animate-spin` — Lucide CSS spin; no explicit
  `motion-reduce:animate-none` guard in code. Treat as partial until the
  Tailwind config is confirmed to ship the variant.

## Tone audit

- Welcome (`useConversation.tsx` line 140): *"Tell me what you're shopping
  for — a vibe, a need, a specific product. Results come from Shopify
  merchants, ranked by your preferences, not by paid placement."*
  This is the kind of welcome I don't bounce from. No exclamation marks,
  no "Hey there!", no "Let's find your perfect…". Imperative + factual
  source-of-truth + ranking promise. Quietly excellent.
- Suggestion starters (`ConversationCanvas.tsx`): *"a desk lamp that
  won't look like an Ikea cliché"* — funny without trying. Reads like a
  person, not a marketer. The "gift for someone who already owns
  everything" one is the only that risks being twee but it lands.
- Errors (`agent.ts::classifyError`):
  - `mcp_error` → "Couldn't reach the catalog." — perfect.
  - `rate_limited` → "Hitting traffic. Retrying." — fine, no apology
    inflation.
  - `invalid_request` → "Service unavailable. Contact support." — terse
    and accurate; doesn't pretend a user retry will help.
  - `tool_error` → "A tool failed." — slightly clinical; could be
    "Something didn't fetch." But it's not hype-y, just internal-flavored.
  - `internal` → "Something went wrong on our side." vs the duplicate
    final fallback at line 552 "Something went wrong on our side.
    Try again?" — minor inconsistency but the tone holds.
- Reasoning chip details (`reasoning.ts`): *"Available in your saved
  size (M)."*, *"Reduced from USD 89.00."*, *"USD 12.00 above your
  USD 80.00 cap."*, *"Tag 'fair-trade' matches your 'fair-trade'
  preference"*. All declarative, all citing the source. No "Great
  match!" no "Perfect for you!" — this is the part I would have
  expected to be the worst and it's the best.
- Disclosure under the input (`InputBar.tsx` line 178): *"Prices and
  availability come from Shopify merchants. / Ranking is preference-driven,
  not paid placement."* — exactly the disclosure I want, in
  `text-[11px] text-ink-400`, not shouted. Trust earned.

Nothing in the audited surfaces is hype-y. The "Sparkles" icon in
`OutfitBundle.tsx` is the closest brush with cute, but it's monochrome
and 16px. Tolerable.

## Layout-shift moments

- ProductCard expand — Framer `AnimatePresence` with `layout` does a
  proper height tween (250ms easeOut), collapses to a 100ms opacity-only
  swap under reduced motion. Predictable: the chevron rotates so I know
  what just happened.
- CollageView reflow — Framer `layout` on each card with a 400ms
  `[0.2, 0, 0, 1]` curve. Under reduced motion, layout is disabled
  outright; items snap. This is the right tradeoff.
- Moodboard appearing inline — appears BEFORE the products block in the
  same assistant message. Order is fixed in `MessageRenderer`, which means
  if a moodboard arrives, the products don't appear above it and then get
  shoved down. That's the predictable shape.
- ConversationCanvas auto-scroll uses `behavior: 'smooth'` unconditionally.
  Under `prefers-reduced-motion`, browsers honor this and substitute
  `auto`, so it's fine in practice, but explicit is better than implicit
  here — worth gating in code.

One jarring case: the desktop Shortlist rail (`fixed right-0`, 320px)
overlaps content between 1024 and ~1400px where the `max-w-3xl` canvas
margin doesn't fully clear it. Layout issue, not motion.

## DnD vs heart-save

The heart-save was added Round 1 and IS the canonical mobile path.
Verified in `ProductCard.tsx` (lines 167–186) and `CollageView.tsx`
(lines 187–204): the heart button is `[@media(hover:none)]:opacity-100`
so it sits visible at rest on touch devices, and `aria-pressed` reflects
state. There's also a keyboard fallback `L`/`M`/`S` on the focused card
with a live-region announcement.

For me — drag-and-drop is physically taxing AND attention-shredding.
Native HTML5 DnD without a visible drop-target hint at rest is also
discoverability-hostile. The heart-save plus keyboard L/M/S means I never
need to touch DnD. The "Drag a card here, or press M on a focused card"
empty-hint copy in the Maybe/Skip lanes is good — it names the
non-drag affordance explicitly. But the Love lane's empty hint *only*
names the heart — meaning Maybe and Skip are still drag-forward by
default copy. Consider: *"Press M on a focused card to save here. Drag
also works."*

## Top 3 polish moves for sensory-sensitive users

1. **Gate `TypingIndicator` on `useReducedMotion`.** Three infinite dot
   loops are the worst pattern in the app for ADHD/autistic users. Swap
   to a single static "•" or a one-shot fade-in dot when `reduced` is
   true. (`frontend/components/chat/TypingIndicator.tsx` line 11 onward.)
2. **Stop the `ToolStatus` indicator from looping under reduced motion.**
   Replacing one infinite loop (rotation) with another (opacity pulse)
   misses the spirit of the preference. A static dim dot during `running`
   plus the existing check/error transitions on completion is enough —
   the live-region text is already announcing "Searching desk lamps"
   etc., so the dot doesn't have to carry the "alive" signal.
3. **Mention the keyboard/heart paths in all empty-lane hints, not just
   Love.** Make `M` and `S` discoverable without DnD by leading with the
   non-drag affordance. Pair with a one-time, dismissible "Tip: press
   L / M / S on any card to sort" line in the Shortlist header — visible
   once, not nagging.

Honorable mention: `SuggestionChips.tsx` should import `useReducedMotion`
and zero the 100ms delay. Tiny fix, completes the brief.
