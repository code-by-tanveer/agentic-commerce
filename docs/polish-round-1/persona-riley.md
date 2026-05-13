# Persona: Riley

24. iPhone 14. Pinterest-brained. I screenshot more than I type.

## The Pinterest-paste flow (narrative)

I'm in bed, doomscrolling. See a green linen midi dress on Pinterest, long
press, share sheet, "Copy". Open agentic-commerce.app in Safari. Tap the
text field at the bottom. Long-press, Paste.

Something happens — the textarea momentarily shows a base64 blob and then
clears. The paperclip icon spins (`Loader2` per `InputBar.tsx:108`). A
message bubble pops in: "find me something like this". The hardcoded
phrase is fine — minimal, the screenshot does the talking — but I'd
maybe prefer it didn't broadcast my non-thoughts. `InputBar.onPaste`
intercepts `kind === 'file' && type.startsWith('image/')` and routes to
`useUpload`. So far so good — the paste worked, no "upload an image"
button stress.

Then the Moodboard card slides in above the products. A 96×96 thumbnail
(`h-24 w-24` on mobile, `Moodboard.tsx:136`), and a row of chips:
`green`, `linen`, `midi`, `relaxed`, `summer`. Below it: "Searching for:
green linen midi dress, relaxed fit". Cute. Honestly the moodboard is the
emotional payoff of the whole flow — it tells me the bot *saw* the image
the way I did.

## Visual feel on iPhone

**Moodboard.** The thumbnail is 96px on mobile, which feels small next to
the chip row. On a 390px viewport with the chat gutter (`px-4`) and the
serif-free chrome, the image reads like an avatar more than a "mood".
On `sm:` it bumps to 128px. I'd want 112px or so at mobile — the chips
have room to breathe but the image is the proof.

**Chips.** Soft `bg-ink-100`, 12px text, rounded-full. The X is a tiny
12px icon (`h-3 w-3`) inside a 16px button, and on coarse pointers
(`[@media(hover:hover)]:opacity-0` only fires on hover-capable devices —
so on iOS the X *is* always visible — confirmed via the inverted query
gate in `Moodboard.tsx:177`). The touch target is padded out to ~44px
via `before:-inset-3` pseudo halo, so a fat-finger tap deletes cleanly.
But *visually* the X looks like a decorative bullet, not an action. The
first time I tapped a chip I thought I was selecting it. I was deleting
it. Slightly destructive. Could the X get a 1px darker stroke on touch,
or wait for a confirm shimmy?

**Collage view.** Toggle in the Header (I assume — `ViewToggle.tsx`).
At 390px: `columns-2 gap-3` → roughly two 175-ish-px-wide cards with 12px
between. With `aspect-[4/5]` that's a 175×219 image. It feels *right*,
Pinterest-grid right. The masonry uses CSS columns so heights stagger
naturally if titles wrap (they don't, because the title overlay is
absolute). Cards are pure image at rest. On touch the overlay (`title` +
serif `font-display` price) is permanently visible because
`[@media(hover:hover)]` only fades it on hoverable devices — so touch
users see the scrim always (`CollageView.tsx:191`). Good call. The
serif `$148.00` over a green dress is the prettiest moment in the app.

## Where I got stuck (especially: how do I save without keyboard?)

Three loved dresses. I tap a card — it expands inline. Cool. I want to
save. I look for a heart icon. **There isn't one on the card.** The
Shortlist drawer (`Shortlist.tsx`) tells me, in the empty lane:

> "Drag here, or press L on a card."

I'm on iPhone. There is no L. There's no keyboard surface until I focus
a text input. And the drawer's empty-lane copy is the *only* place the
save affordance is documented. I tried:

1. Long-press the card. Nothing. (Native HTML5 DnD on iOS Safari
   requires a long-press + drag gesture, but the article is `draggable`
   via `dndProps` and there's no `touch-action` opt-in. It just doesn't
   work reliably.)
2. Tap the expand chevron. Inline panel opens, with a `Buy` button but
   *no* save-to-shortlist button.
3. Stare at the heart icon in the header (assumed; this opens the
   drawer, doesn't save anything).

I gave up and used `Buy` for the one I wanted most. Lost the other two.

**This is the bug.** `ProductCard.tsx` and `CollageView.tsx` both wire
`shortlist.addToLane(...)` behind `onKeyDown` for L/M/S only. There is
no `onClick`/`onTap` save path. The keyboard fallback is the *only*
fallback. On mobile that's not a fallback, that's a wall.

**Fix shape:** in the expanded panel (and ideally as a quiet heart
overlay top-right of the resting card), add three pill buttons or a
single heart that defaults to `love` with a long-press menu for
maybe/skip. The drag drawer can stay for desktop power users.

## Aesthetic gripes

- The Moodboard thumbnail is too small on mobile — 96px reads like a
  Slack avatar. Bump to 112-128 even on phone.
- Chips are all `bg-ink-100`. They're indistinguishable from each other
  and from the "+ Add" button (which is `bg-white` shadow-soft — a
  reasonable inversion but the contrast is subtle). I'd love the
  *color* chips (e.g. "green") to actually be that color, even as a
  4px swatch dot. Right now the bot saw color but doesn't show it.
- The Collage hover overlay's scrim (`from-ink-900/70`) is heavy on
  small phone thumbnails. The serif price is gorgeous but the gradient
  eats 40% of the image at 175px wide. Try `from-ink-900/55`.
- The expanded panel's `Buy` pill is `bg-accent-500` — fine — but it's
  the *only* call to action in the panel. Add `Love`/`Maybe` siblings.
- "Searching for: green linen midi dress, relaxed fit" is small ink-400
  caption text. Make this 13px / ink-600 — it's the receipt for the
  paste action, it deserves dignity.
- Share button: tapped it after I (sadly) only loved one dress. It
  spun, then a new tab opened with the lookbook. The OG image at
  `/api/og?id=...` is wired (`app/s/[id]/page.tsx:52`) with width 1200,
  height 630 — iMessage will render a `summary_large_image` card via
  the twitter meta. The lookbook hero with the gist line should preview
  nicely in iMessage, *if* `/api/og` actually generates a real image
  (didn't poke that endpoint here). Title format
  `${gist} — Agentic Commerce` is fine but the em dash gets eaten in
  some preview chips. Consider an interpunct.
- Loading state for paste→moodboard is just a spinning paperclip. No
  skeleton card. For ~2-4s I'm staring at my own message bubble
  wondering if the paste landed. A ghost moodboard card (gray
  thumbnail + 5 chip skeletons) at the assistant slot would close that
  gap.

## TL;DR

The Pinterest-paste-to-Moodboard arc is the most delightful 4 seconds in
the product — when it works it feels like the bot *sees*. Then the
collage looks gorgeous. Then I hit a wall trying to save anything
without a keyboard. Ship a tap-to-save heart before you ship anything
else.
