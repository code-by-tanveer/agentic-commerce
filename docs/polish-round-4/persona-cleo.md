# Persona: Cleo — 19, iPhone mini, screenshots-paste

> ok so. cute concept. let me actually try it the way I'd use it.

## Paste-from-TikTok flow
- **iOS screenshot path:** I screenshot a TikTok of a girl in a buttery yellow baby tee. iOS sometimes copies a JPEG, sometimes a PNG, depending on whether I shared from Photos vs. used the share-sheet "Copy Photo." Either way, `InputBar.onPaste` (`frontend/components/chat/InputBar.tsx:73`) iterates `clipboardData.items`, looks for `item.kind === 'file'` and `item.type.startsWith('image/')`, calls `handleFile`. That path is solid for png/jpeg from screenshots. Cool.
- **HEIC handling: it just dies.** If I AirDrop a pic from my friend's iPhone to mine and paste from Photos, iOS gives me a `image/heic` blob. Frontend lets it through (`file.type.startsWith('image/')` — line 67). Backend `routes/upload.ts:30` only allows `image/jpeg|png|webp`, the magic-byte sniff at line 83 rejects HEIC → **415**, and `useUpload` surfaces "Upload failed — unsupported_media_type" in a tiny rose pill at the bottom. Cleo reads that and immediately blames herself, not the app. No "we couldn't read that — try saving as JPEG" guidance, no client-side conversion. Dead end. iPhone-default format being unsupported is the kind of thing that makes me close the tab.
- **Vision extraction quality (predicted):** Prompt in `backend/src/services/visionPrompt.ts:16` is genuinely careful — it asks for material, color, silhouette, pattern, era, ≤4 words each, lowercased, and *does* have a graceful "image too dim" escape (`attributes: []`). For a bright Pinterest pin of a single garment on a hanger, attributes will be tight and editable. For a dim-lit TikTok still of a girl in a club bathroom mirror? The model will probably surface ["denim", "low-rise", "lace top", "y2k"] — maybe usable, maybe wildly off. The fallback to a clarifying question is the right safety net, but the prompt doesn't tell the model to prefer the *foreground subject* when there's clutter. Background pillowcases will leak into chips.

## Collage vs Pinterest
- **2 columns on phone** (`columns-2 gap-3 sm:columns-3 lg:columns-4` — `CollageView.tsx:54`). On the mini that means ~170px-wide cards. Pinterest gives me 3. So at-rest density feels *less* than Pinterest — more like Tumblr 2014. Want 3 cols on `sm:` *or* tighter `gap-2` on phone.
- **Image-dominant card, no chrome at rest:** chef's kiss. The aspect-[4/5] image with no title showing until interaction is exactly the vibe.
- **Serif price on hover overlay:** beautiful on desktop. On touch, the overlay is permanently visible (the `[@media(hover:hover)]` gate at line 230 — smart). The serif `Instrument Serif` price *over* a gradient scrim *on every card by default* may end up being too much visual noise — the whole grid screams instead of whispers. Consider showing the overlay only on the tapped/expanded card on touch.
- **Tap to expand inline:** good, but the chevron at top-right (line 243) is gated behind hover-only too — touch users get no affordance that this card opens. The image just looks like an image. I'd tap once expecting a product page and get an accordion. Surprising.
- **Heart top-right + chevron top-right** collide on touch (heart at `right-2 top-2` line 193; chevron at `right-2 top-2` line 246). The chevron has `[@media(hover:hover)]:opacity-0` and no touch fallback so it's effectively invisible on my phone — but if it ever shows, they're stacked.

## iMessage share preview
- `app/api/og/route.tsx` produces a 1200x630 with Instrument-Georgia italic gist + 3 thumbs at 160px. Looks editorial. iMessage's link preview will *crop the right edge* in portrait — the 3-thumb strip lives at the bottom-right and may get clipped on the iMessage bubble's centered crop. The gist is the hero, which is correct.
- **Font:** `fontFamily: 'Georgia, serif'` (line 79). `@vercel/og` can't load Instrument Serif without an explicit font fetch — so the OG card is *not* the same serif as the in-app price. Brand inconsistency on the most-shared surface. Fix: bundle the Instrument Serif woff via the og response's `fonts` option.
- **Fallback:** "A collection from Agentic Commerce" + "Conversational product discovery" if backend is missing (line 62-66). Reads like a B2B SaaS landing page, not a moodboard. Cleo would not forward this.
- **No alt-text / no Twitter description with the *items*:** the link preview text underneath the image is fine but it's "11 items · 2 merchants" which sounds like a receipt, not a vibe.

## Heart-save thumb test
- **Tap target: `h-9 w-9` = 36×36px** (`CollageView.tsx:193`). Apple HIG minimum is 44pt. Material is 48dp. On my 5.4" mini with one-handed thumb-reach, 36px is genuinely missable, especially top-right of a 170px-wide card where it sits ~12px from the upper-right corner — exactly the zone where my thumb registers as a swipe instead of a tap.
- **Position top-right:** for a one-handed right-thumb user that's reachable, but left-handed me has to stretch across the screen. Bottom-right would be kinder.
- **Visual feedback:** rose fill + `aria-pressed` is great for screen readers; for me, no haptic/scale bump on tap. The icon just changes color. Pinterest does a tiny pop. Worth a 100ms scale `[1, 1.15, 1]` under non-reduced-motion.
- **The save target shares a corner with the chevron** (both `top-2 right-2`). Even though the chevron is hover-only, defensively that's a bug waiting to happen the next time someone enables it for touch.

## Vibes (the actual verdict)
- Resting state is genuinely pretty. The "no chrome until interaction" principle is doing real work — I wouldn't close the tab on first sight, which is the bar.
- The serif price moment is doing too much when every card shows it on touch. Reserve the serif for the expanded state and the OG card. Less = more.
- The HEIC rejection is the loudest red flag. *The iPhone default image format being a 415* on a product literally pitched as "paste a TikTok screenshot" is functionally broken. The error pill says "upload failed" with no recovery path. Most Gen-Z users will not know to re-save as JPEG.
- The Moodboard editable chips are the most clever piece of the whole flow — actually feels like the app sees what I see. Provided the vision model doesn't pick up the dorm wall behind the outfit.
- The collage density and 36px heart make it feel like a desktop app shrunk down, not a mobile-first thing. Two small numeric tweaks fix most of it.

## Top 3 polish for Gen-Z mobile shoppers
1. **Accept HEIC.** Either add a client-side `heic2any` conversion before upload OR add `image/heic` to the backend allowlist with a server-side sharp transcode to jpeg. The current 415 is a silent funnel-killer — every iPhone screenshot from Photos shared via "Copy" is a paste-and-die. At minimum, when the error fires, say "iPhone photos need to be JPEG — long-press the photo and tap 'Save to Files' as JPEG" with a recovery link.
2. **Tap targets ≥ 44×44.** Bump the heart button to `h-11 w-11` (`CollageView.tsx:193`), move it to bottom-right to free the chevron corner, add a 100ms scale pop on tap, and give touch users a visible chevron/expand affordance — right now the card looks like a dead-end image on mobile.
3. **Bundle Instrument Serif into the OG card and humanize the fallback copy.** `app/api/og/route.tsx:79` defaults to `Georgia` — load the real serif via `@vercel/og`'s `fonts` option so the share matches the app. And rewrite "Conversational product discovery" fallback to something with a pulse, e.g. "stuff worth saving." iMessage previews are the social loop; this is where Gen-Z either forwards or doesn't.
