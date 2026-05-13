# 0007 — Auto-scroll behaviour: user-intent tracking via gesture-based pin

## Status
Accepted — 2026-05-13. Owner: architect. Supersedes: none. Related: ADR-0002 (SSE protocol), six iterations of polish-round-2..6 auto-scroll bugs.

## Context

The conversation canvas streams typed sub-blocks (`text_delta`, `products`, `comparison`, `outfit`, `moodboard`) into the latest assistant message in real time. Three competing requirements:

1. **Stay glued to the bottom while the reply streams** — the user expects new tokens and new product cards to appear in view without scrolling.
2. **Honour scroll-up as "I want to look at what I just received"** — the user should be able to scroll back to a card mid-reply and *not* be yanked back when the next `text_delta` lands.
3. **Auto-scroll the *next* user turn** — once the user sends a new message, treat that as unambiguous intent to follow the new reply, even if they were pinned away.

Six earlier cycles tried to encode this as "if `distanceFromBottom() <= NEAR_BOTTOM_PX` we are pinned to the bottom; otherwise scroll-up was intentional and we stop auto-scrolling." Every iteration broke. The fundamental issue: **DOM growth and programmatic scrolls both fire the same `scroll` event the browser fires for genuine user gestures.** Distance heuristics cannot tell them apart.

The specific failure modes we cycled through:

- A `products` block arrives, `scrollHeight` grows by 400 px, `distanceFromBottom()` jumps to 380, heuristic flips "user scrolled up", auto-scroll stops, the user sees the products land off-screen.
- Animated `scroll-behavior: smooth` fires intermediate `scroll` events at non-bottom positions, each one tripping the heuristic.
- Programmatic `scrollTo({top, behavior: 'smooth'})` followed by a content burst lands the viewport short of the new bottom; the next event is at a non-zero distance, heuristic flips, broken again.
- Tying the heuristic to a debounce or RAF gate fixed one case and broke another.
- Tracking last scrollY delta and ignoring "decreasing-distance" deltas worked until streaming text deltas pushed the floor down faster than the smooth-scroll could follow.

The root cause is a category error: distance from bottom is *state*, not *intent*. The thing we actually need to know is "did the user gesture upward since the last scroll-pin event?" — which is an event-type question, not a position question.

## Decision

Track user intent via **two refs** on `ConversationCanvas.tsx`:

- `userPinnedAwayRef: boolean` — flipped **only** by user gestures (`wheel`, `touchmove`, `keydown` of PageUp/Down/Home/End/Arrow) or by a `scroll` event whose distance exceeds `NEAR_BOTTOM_PX`. **Never** flipped by DOM growth alone.
- `programmaticScrollLockRef: boolean` — set true around any internally-initiated `window.scrollTo(...)`, cleared after two `requestAnimationFrame` ticks. While set, all scroll handlers ignore the event so the program's own scroll cannot trip the pin.

Rules:

1. The auto-scroll effect runs on every conversation-state fingerprint change. It scrolls only if `!userPinnedAwayRef.current`. The fingerprint includes `messages.length`, the last message id, and the per-block text-length, so streaming tokens and new sub-blocks both tick the effect.
2. Gestures that count as "intent": `wheel`, `touchmove`, `keydown[PageUp|PageDown|Home|End|ArrowUp|ArrowDown]`. These fire `markUserIntent` which reads `distanceFromBottom()` and writes `userPinnedAwayRef.current = (d > NEAR_BOTTOM_PX)`.
3. Scroll handler: also writes `userPinnedAwayRef` — but only when `programmaticScrollLockRef` is false **and** the new distance is `<= NEAR_BOTTOM_PX` (re-pin on user-driven return to bottom). The handler **never** sets `true`; only gestures do.
4. New user turn (detected by the `user`-role message count increasing): force `userPinnedAwayRef.current = false`. Sending a message is unambiguous intent to follow the new reply.
5. Tapping the floating "Latest" jump button: same as #4 — force-clear, then `scrollToBottom(true)`.

Constants kept tight: `NEAR_BOTTOM_PX = 80`, `SHOW_JUMP_PX = 200`. The jump-button visibility uses the wider threshold so the affordance shows up well before we'd consider the user "scrolled away".

## Consequences

### Positive
- Streaming reflows never spuriously stop auto-scroll. The pin only flips on a real gesture; document growth is invisible to the heuristic.
- Programmatic scrolls cannot self-pin via their own scroll events — the lock prevents the recursion.
- The behaviour is now describable in one sentence: "Gestures flip the flag; sends clear the flag; DOM growth does nothing." Future engineers have a rule they can apply rather than a heuristic they have to tune.
- All six prior failure modes are addressed by the same primitive. The fix is small (~30 LOC) and concentrates in one file.

### Negative
- Mobile rubber-band scroll on iOS fires `touchmove` even at the resting bottom position; this can briefly set `userPinnedAwayRef` to false-pin (re-pin), which is a no-op, and never to true if the user did not actually drag away. *Mitigation:* the threshold is `> NEAR_BOTTOM_PX`, so a tiny rubber-band overshoot does not trip pin-away.
- An assistive technology that drives scrolling via synthetic events without the gesture (e.g. screen reader's automatic scroll-to-element) would not flip the pin. *Mitigation:* AT-driven navigation is followed by `focus` events on the target element; for our message structure the target is always near the bottom anyway, and the user can use the jump-button to recover.
- Code reviewers may be tempted to "simplify" the dual-ref pattern back to a single distance check. *Mitigation:* the canvas file carries a top-of-component comment explaining the six failed iterations; the rule "gestures flip the flag, document growth does not" is the load-bearing invariant.

## Alternatives considered

- **Pure CSS `scroll-snap` / `overflow-anchor`.** Anchoring requires a stable anchor element; the chat canvas's anchor moves every time a new block lands. We tried it; the viewport drifted unpredictably as anchors changed.
- **`MutationObserver` to detect content growth and short-circuit auto-scroll.** Inverts the problem: we'd be telling the system *not* to scroll under conditions that should always scroll. The gesture-tracking ref is a cleaner invariant.
- **IntersectionObserver on a sentinel near the end.** Works for "is the bottom visible?" but says nothing about intent. We'd still need the gesture layer underneath.

## Mitigations summary

1. Top-of-component comment on `ConversationCanvas.tsx` documenting the invariant ("gestures flip the flag; DOM growth does not") so future maintainers don't re-introduce a distance-only heuristic.
2. The jump-to-latest button is the always-available escape hatch when the pin's behaviour confuses a user — clicking it clears the pin and scrolls.
3. Any future scroll-related code that mutates `userPinnedAwayRef` must be reviewed against the invariant — adding a new mutation site is a code-smell.
