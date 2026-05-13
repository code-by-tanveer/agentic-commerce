# Design Interaction — Round 1

Scope: hover/focus, loading/empty/error, motion choreography, affordance discovery, the first-60s feel. Findings cite `frontend/...:line`.

## Hover / focus gaps

- `components/chat/SuggestionChips.tsx:20-26` — no `focus:outline-none focus-visible:ring-*` on the starter pills. Tab through the welcome state and the focus ring is the browser default (or invisible in some themes). Hover is fine; focus is broken on the highest-traffic entrypoint.
- `components/chat/InputBar.tsx:122-134` — Send button has hover (`hover:bg-ink-600`) but no `focus-visible` ring. Same for the textarea wrapper at line 84 (focus-within shadow lift only — no AA-visible focus indicator for keyboard users).
- `components/product/VariantPicker.tsx:39-91` — variant pills (both option groups and plain) have neither `focus-visible:*` ring nor a roving-tabindex group (DESIGN.md §7 explicitly calls for arrow-key navigation). Hover state is the only feedback.
- `components/product/ComparisonTable.tsx` — no hover treatment on rows or product columns; cells are inert. Row labels are spec'd to be `tap → re-sorts` (DESIGN.md §4) but neither the affordance nor the focus state exists.
- `components/product/ProductCard.tsx:153-175` — collapsed "Buy now" chip is a `<span role="button">`. It gets `:hover` styling but has no native `:focus-visible` outline; the `cn(...)` omits any ring class. Worse — it's only reachable via `tabIndex={canBuy ? 0 : -1}` so when disabled it disappears from tab order with no visual cue.
- `components/product/ProductCard.tsx:235-247` — expanded-card primary Buy CTA is missing `focus-visible:shadow-glow` (DESIGN.md §2.7 specifies `shadow-glow` is the Buy CTA's hover/focus state). `OutfitBundle.tsx:123` and `CollageView.tsx:276` set it correctly — ProductCard does not. This is the most visible inconsistency.
- `components/chat/InputBar.tsx:94-111` — paperclip button only gets focus-visible when *not* disabled (`disabled ? 'opacity-50' : '... focus-visible:ring-2 ...'`). The ring class drops off in the disabled branch; semantically fine, but the class chain reads odd.
- `components/preferences/PreferencesCard.tsx:311, 399` — `AddPicker` X and the inline-edit save `Check` button have hover but no focus-visible ring (`rounded-full p-1 text-ink-400 hover:text-ink-900`). These are inside the chip-edit hot path.
- `components/chat/Header.tsx:43` — `<ViewToggle />` segments have `focus-visible:ring-2 ring-ink-900` (good), but the wrapper has `shadow-soft` and the segments are *also* using ring offsets that bite into the shadow on focus — minor visual fuss, acceptable.
- Cards: hover treatment shadow-soft → shadow-lift is correct on `ProductCard:107` and `CollageView:163`. The desktop Shortlist rail items (`Shortlist.tsx:194`) keep `shadow-soft` at rest and don't lift on hover; they're decorative tiles, so probably OK, but the X-button hover on `:210` is the only visible affordance.

## Loading / empty / error states

- **Initial preferences fetch** — `hooks/usePreferences.tsx` exposes `isLoading` and `error`, but `PreferencesCard.tsx:54-64` only reads `isLoading` to keep the card mounted and never reads `error`. On a failed `GET /preferences` (network blip, 500) the panel silently renders empty. No skeleton chips while loading either; the panel just pops.
- **Initial shortlist fetch** — `hooks/useShortlist.tsx:147-170` swallows errors silently (`// Silent — render an empty drawer rather than a broken one.`). A user who saved 12 loves yesterday opens the drawer and sees "Drag here, or press L on a card." — looks identical to a brand-new session. The drawer needs at least a "Couldn't load your saved items" affordance with a retry, separate from the empty-lane copy.
- **Summary hydrate** — `app/s/[id]/page.tsx:31-42` returns null on failure → `notFound()`. The 404 page is the default Next.js one; on a stale-blob 404 the user sees Next's generic copy instead of "this lookbook expired — start a new chat." Worth a custom `not-found.tsx` in `app/s/[id]/`.
- **Image upload while in flight** — `InputBar.tsx:106-110` swaps Paperclip → spinner, but the textarea stays enabled and the user could submit text mid-upload. `useUpload.ts` does cancel prior uploads, but the visual coupling between upload-in-flight and submit is weak: only the paperclip dims (`opacity-50`), the submit button doesn't.
- **search_catalog in flight** — `ToolStatus.tsx` is well-built (Granola-style dot, verb+object). Good. Question: when `search_catalog` returns zero products, there is no "nothing found, try X" empty-message variant. The assistant message ends mid-air with a checkmark and no follow-up — confusing.
- **ImageDropzone error toast** — `ImageDropzone.tsx:140-159` renders an error toast at `bottom-24` fixed. Two issues: (1) the dismiss button is the toast content itself (entire pill is `<button>`), which means tab focus is on a poorly-affordable target — the X icon would be clearer; (2) the toast has no auto-dismiss timer and no `aria-live` reads only because of `role="alert"` — fine, but it overlaps the preferences card on small screens.
- **ShareButton error** — `ShareButton.tsx:55` puts the error message in `title=` (tooltip only). On error the label flips to "Try again" but the actual reason is hidden behind a hover. Should render the message in a small `text-rose-700` line beneath the button, or at least in `aria-describedby`.
- **Preference PUT failure** — `usePreferences.tsx:169-182` reverts silently. No user-facing toast or pulse to say "couldn't save." The optimistic UI lying to the user is the worst kind of polish bug.
- **Shortlist DnD failure** — `useShortlist.tsx:184-194` reverts silently. Same problem.
- **Empty Skip lane** — three lanes are always rendered (`Shortlist.tsx:69-79`) — Skip is shown even when empty. Question: does Skip earn its real estate? Consider hiding Skip lane until first use, or rendering it collapsed.
- **CollageView empty** — `CollageView.tsx:48` returns `null` on empty products; no "nothing here yet" message. Acceptable in chat context (parent message would be empty), but worth confirming with QA.

## Motion choreography

- **The choreography exists and is mostly correct.** Sequence: user sends → user bubble fades+slides (250ms, `MessageBubble:23-28`) → assistant placeholder with `TypingIndicator` (typing dots) → `tool_status` row swaps in (`ToolStatus.tsx:83-127`, Granola dot) → on `done`, dot → check with a scale pulse (200ms) → products fade-up with 40ms stagger, cap 6 (`ProductCard.tsx:54-56`). This reads.
- **Gap: no transition between TypingIndicator and the first tool_status.** When the first `tool_status` block arrives, the indicator simply unmounts and the row appears. Consider: indicator dots transition into the tool spinner dot — even just a coordinated `AnimatePresence mode="wait"` would feel intentional.
- **Layout reflow on collage view toggle is fine** (`CollageView.tsx:142-147` namespaces `layout: {duration: 0.4, ease: [0.2,0,0,1]}`). But `ProductCardGroup.tsx:25` uses `motion.div layout` on the grid wrapper with default Framer timing — should also specify the `motion-layout` budget so the grid→collage swap is consistent.
- **SuggestionChips fade has no stagger** (`SuggestionChips.tsx:13-16` — flat `delay: 0.1`). On the empty welcome state, four pills appear together. A 40ms stagger (matching DESIGN.md §2.8) would feel more "considered." This is the user's first impression — worth the polish.
- **PreferenceCard SavedPulse appears under the card at `-bottom-6`** (`PreferencesCard.tsx:522`). It overlaps the InputBar on tight viewports; on a quick edit it pops, fades — fine timing. The mobile variant (`MobileSavedPulse`) just renders inline text "Preference saved" with no icon — felt less polished than the desktop chip. Make them visually parallel.
- **OutfitBundle Save → Saved flip** (`OutfitBundle.tsx:131-137`) uses a `transition` class on the button background and label swap, but the `aria-live="polite"` is on the button — when the label changes the announcement fires correctly. Visual transition is bg-accent-500 → bg-emerald-50 with no inbetween. Add a brief Check scale-in like `ToolStatus`'s done state for satisfaction.
- **ShareButton's three-state label** (`ShareButton.tsx:59-67`) — text swaps without any transition (`Share` → `Sharing…` → `Link copied`). For something this small, an `AnimatePresence mode="wait"` with a 100ms opacity crossfade would make it feel intentional.
- **ImageDropzone fade-in is 150ms** (per DESIGN.md §6, correct). However the `dragenter` counter (`ImageDropzone.tsx:69-85`) means the overlay sometimes briefly flickers when dragging across nested DOM. Acceptable; common.
- **Stagger conformance:** ProductCard (40ms, cap 5), CollageView (40ms, cap 5), Moodboard (40ms, cap 5), ReasoningChips (40ms, cap 3). All match §2.8. No animation >500ms found in source.

## First-60s experience

What a new visitor sees and feels — pieced together from `app/page.tsx`, the `WELCOME` constant, and `ConversationCanvas`:

1. **0s:** Page paints. Sticky `Header` with "Agentic Commerce / Conversational product discovery" + `ViewToggle` + Shortlist button (badge: 0). `PreferencesCard` desktop shows the `EmptyPrompt` ("I'll save the basics here as we chat…"). Welcome bubble: "Hi — tell me what you're shopping for…" InputBar ready, cursor invitation absent.
2. **2–5s:** User reads. Four starter chips wait under the welcome bubble. They fade in flat at 0.1s — no stagger. The grain texture (`globals.css:18-33`) is subtle but present. No serif anywhere yet — correct (the serif is for the lookbook moment).
3. **The discoverability problem:** the ViewToggle and Shortlist button are in the header *before any products exist*. That's pre-meaningful chrome. ViewToggle with no products to view is a noop; Shortlist with a badge of 0 is a stub. On first paint these read as "look at all these buttons" — exactly the casino-of-cards anti-pattern DESIGN.md §1 warns against.
4. **Tap a starter chip:** the chip submits via `useConversation.send`. Fine. User bubble drops in, assistant placeholder shows `TypingIndicator`. tool_status row appears below the dots. Products fade up. Solid sequence.
5. **The InputBar focus state at rest** is `focus-within:shadow-lift` (good) but the cursor placement is opt-in — the user must click. Consider `autoFocus` on the textarea after mount (with a guard for mobile to avoid unrequested keyboard). Linear Asks-level subtlety would be to focus the textarea after a 600ms delay so the welcome bubble lands first, *then* the cursor invites.
6. **Affordance gap: drag-to-Shortlist** — there is no visual hint that products are draggable. `ProductCard` has `draggable={true}` but no grip dot, no "drag-me" cursor. The keyboard shortcut (L/M/S) is also undiscovered — no hint chip on first hover. After the first product group, a *transient* "press L to love, M for maybe, S to skip" footer chip below the group (auto-dismiss after 8s, persisted-dismissed) would close the loop.
7. **The Share button hides on first paint** (`Header.tsx:27-28`, `canShare = badge > 0 && !!sessionId`) — correct restraint. But the user has to discover that saving items unlocks sharing.

## Top 10 polish moves (ordered)

1. **Add `shadow-glow` to ProductCard's expanded Buy CTA** (`ProductCard.tsx:235-247`). Three Buy CTAs exist; only this one omits it. Inconsistency between OutfitBundle / CollageView / ProductCard is the most visible Hard Rule breach in the codebase.
2. **Add `focus-visible:ring-2 ring-ink-900` to SuggestionChips, InputBar Send, VariantPicker pills, and PreferencesCard inner buttons** (`SuggestionChips.tsx:23`, `InputBar.tsx:124`, `VariantPicker.tsx:43/80`, `PreferencesCard.tsx:311/399`). DESIGN.md §7 is unambiguous; these are tab-stops with no visible focus.
3. **Surface preference / shortlist write failures with a small toast or revert-pulse.** `usePreferences.tsx:169-182` and `useShortlist.tsx:184-194` both revert silently. At minimum, a `lastError: {key, message, at}` mirror of `lastSaved` + a rose pill ("Couldn't save — retry") for 4s.
4. **Render skeleton chips in PreferencesCard while `isLoading`** (`PreferencesCard.tsx:64-85`). Three `bg-ink-100 animate-pulse` chip placeholders honour DESIGN.md §2.8 "show a skeleton, don't slow the animation." Same in Shortlist while hydrating.
5. **First-60s: stagger the SuggestionChips entry** (40ms, cap 4) and **defer textarea autofocus to 600ms after mount**. The welcome bubble should land, then the cursor invites — a Granola-paced opening.
6. **TypingIndicator → ToolStatus handoff.** When the first tool_status arrives, fade out the typing dots in 100ms and slide the tool_status row in (`opacity + y:4→0`). Currently it's a hard swap. Hook in `MessageBubble.tsx:68-81` and `MessageRenderer.tsx:69-77`.
7. **Drag affordance hint.** After the first `products` block in a session, show a one-time `text-xs text-ink-400` line: "Press L / M / S to shortlist · or drag" beneath the group; dismiss on first interaction or after 8s. Solves the affordance-discovery for drag and keyboard fallback in one shot.
8. **Custom `app/s/[id]/not-found.tsx`** so expired/missing lookbook 404 has on-brand copy ("This lookbook expired — they live for 7 days. Start a new chat?") instead of Next's default.
9. **Animate the OutfitBundle and ShareButton state flips.** `AnimatePresence mode="wait"` opacity crossfade (100ms) on label change; a `Check` scale-in (200ms) on success. Both are end-of-funnel moments and currently feel like hard swaps.
10. **Empty-Skip lane and tool-zero-result empty state.** Hide the Skip lane until first use (`Shortlist.tsx:70`); add a `"Nothing matched — try broadening to X"` assistant follow-up when `search_catalog` returns 0 products. Both are quiet "nothing here yet" moments that today feel half-done.

Honourable mentions (not in top 10 but worth noting):
- `SuggestionChips.tsx:23` uses `px-3.5 py-1.5` which violates DESIGN.md §2.5 (forbidden decimals on non-icon sizing). Should be `px-3 py-1`.
- `ImageDropzone.tsx:140-159` upload-error toast: split the dismiss-X out of the message body for affordance clarity, and auto-dismiss after 5s.
- Mobile `SavedPulse` (`PreferencesCard.tsx:533-557`) deserves the same chip treatment as desktop — currently it's plain text.
- Header's grain + backdrop-blur layering reads well; resist the urge to add a scrolled-state hairline since `border-b` already exists at rest.
