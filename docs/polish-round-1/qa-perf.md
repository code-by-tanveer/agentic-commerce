# QA Performance — Round 1

## Latency-on-the-hot-path findings (HIGH first)

- **HIGH — sync DB write blocks before stream opens.** `backend/src/routes/chat.ts:77` does `await appendMessage(...)` BEFORE constructing `SseWriter`. SQLite is fast, but it is still one `MAX(ordinal)` SELECT + one INSERT (`backend/src/db/repos/messages.ts:74,77`) sitting in front of every `event: text_delta`. Worse: the SSE response headers haven't flushed yet, so the FE sees a blank socket the whole time. Move `new SseWriter(reply)` (which calls `flushHeaders` + writes `: open\n\n`, sseWriter.ts:20-29) ABOVE the `appendMessage` await, then `void appendMessage(...).catch(log.warn)`.

- **HIGH — preferences SELECT happens after stream is open but before first Groq token.** `backend/src/services/agent.ts:81` awaits `listPreferences(sessionId)` synchronously before calling `streamChatCompletion`. The query itself is one `SELECT * FROM preferences WHERE session_id = ?` (preferences.ts:44) so it's cheap, but there is zero parallelism with the Groq round-trip. Kick the preferences query off in parallel with the chat-route message persistence and `await` only when composing the system prompt (or even just race it: build the system prompt without prefs and inject them via a second system message if it lands first).

- **HIGH — `appendFile` on usage log piggybacks on every streamed chunk.** `backend/src/services/groqClient.ts:130` calls `void recordUsage(...)` from inside the `for await (const chunk of stream)` tap. `recordUsage` does `mkdir(... { recursive: true })` (always) + `appendFile` on every usage-bearing chunk (groqClient.ts:55-64). Cheap, but it lands on the same event-loop tick as the next SSE write. Cache the dir-creation behind a `let dirReady: Promise<void> | null` and avoid the `mkdir` per call; also gate to only fire when the chunk actually carries `usage` (already does, but the `mkdir` runs ahead of the guard if you re-order).

- **MED — `MAX(ordinal)+1` ordinal lookup is a separate round-trip.** `messages.ts:60-63` does two prepared-statement calls (`SELECT MAX… `, then `INSERT`) per `appendMessage`. Either wrap in a transaction or move to an `INTEGER PRIMARY KEY AUTOINCREMENT` ordinal column. Hits twice per chat turn (user persist + assistant persist in `useConversation.tsx:471`).

- **OK — tool dispatch fan-out is fully parallel.** `backend/src/services/agent.ts:206` wraps `orderedToolCalls` in `Promise.all`, and inside each tool: `compareProducts.ts:60-62` parallel-maps `getProduct` over ids; `recommendOutfit.ts:124-134` parallel-maps `searchCatalog` per category. No sequential awaits to flatten.

- **OK — no preference re-reads inside tools.** `searchCatalog`, `getProductDetails`, `compareProducts`, `recommendOutfit`, `extractStyleFromImage`, `getPreferences` all read `ctx.preferences` only. `savePreference.ts:96` writes via `upsertPreference` but does not re-read the snapshot. The cycle-2.md "load once" rule holds.

- **MED — `extractStyleFromImage` reads file off disk then base64-encodes for every call, no cache.** Vision tool re-runs the full Groq vision call even if the same `signed:` URL has been seen this turn. Add a `ctx.cache` lookup keyed by `stableKey(['vision', verified.filename])` (the upload is content-addressed so the filename is stable). 1 LLM round-trip saved on every re-search of the same image.

## Bundle / asset findings

- **`framer-motion` (~80–120 KB gz) imported in 16 components.** `motion`, `AnimatePresence`, `useReducedMotion` ship the whole runtime. Two mitigations: (1) add `experimental.optimizePackageImports: ['framer-motion', 'lucide-react']` to `frontend/next.config.mjs` — Next 14.2 supports it and ships per-symbol chunks; (2) replace `<motion.div layout>` wrappers used purely for entry fade-in (e.g. `MessageBubble`, `ProductCardGroup`, `ConversationCanvas`) with CSS keyframes or `view-transitions` where reduced-motion already collapses to opacity.

- **`lucide-react` already tree-shakes per icon.** Imports look correct (named: `{ Check, X, … }`). Total icons used ≈ 25. Next 14.2 already handles this well; the `optimizePackageImports` addition will further pin it.

- **`@vercel/og` is fine — only used in `app/api/og/route.tsx` (edge runtime).** Not in the client bundle.

- **`@microsoft/fetch-event-source` is necessary** (the standard `EventSource` API can't POST). Single usage in `lib/stream.ts`. Acceptable.

- **`zod` is in the client bundle indirectly** via `@agentic/events` workspace. Verify the FE-side import isn't pulling the full `zod` instead of just the type — if `lib/events.ts` re-exports schemas, that's ~12 KB gz of validation code shipped to render product cards. Switch to `import type` only on the FE.

## Re-render / waterfall findings

- **HIGH — `useConversation` context value churns on every `text_delta`.** `useConversation.tsx:589-609` rebuilds `value` whenever `state.messages` changes (it does, every SSE chunk). Every consumer of `useConversation()` re-renders per token. Consumers include `InputBar` (needs only `send` + `isSearching`), `Header` (needs `reset`, `messages.length`), `MessageBubble` (needs `retry`). Fix: split context into two — `ConversationStateContext` (messages, isStreaming) and `ConversationActionsContext` (send, retry, reset, refineMoodboard) so action-only consumers don't re-render. Or memoize the action bag separately.

- **HIGH — `<AnimatePresence>` + `motion.div layout` on every message** (`ConversationCanvas.tsx:33-39`). Every text_delta triggers a re-render of all `MessageBubble`s because they are not memoized. Wrap `MessageBubble` in `React.memo` with a custom `areEqual` that compares `message.id`, `message.status`, and `message.blocks` length/last-block length. Combined with the context split, that gets the streaming bubble to be the only re-renderer.

- **HIGH — Page-level waterfall: SessionProvider → ShortlistProvider → PreferencesShell → ConversationProvider.** `app/page.tsx:26-58` nests four providers where each depends on the previous. `useShortlist` waits for `sessionId` (useShortlist.tsx:147-170); `usePreferences` waits for `sessionId` (usePreferences.tsx:129-147). On a cold load, the sequence is: (1) `getOrCreateSession` from SessionProvider (`useSession.tsx:42`); after it resolves, (2) ShortlistProvider fires `Promise.all([fetchShortlist, fetchOutfits, getViewMode])` AND PreferencesProvider fires `fetchPreferences`. **In parallel, ConversationProvider ALSO calls `getOrCreateSession`** (`useConversation.tsx:397`) — duplicate request. The session call dedupes inside `getOrCreateSession` (per the comment in `useSession.tsx:23-25`), but the network round-trip still happens twice if module-level cache is empty. Confirm `lib/api.ts` `getOrCreateSession` short-circuits with a module-level cached promise; if not, add one.

- **MED — `MessageBubble` consumes `useConversation()` just for `retry`.** Every token-driven re-render of the parent re-runs the hook in every bubble. After the context split, also pull `retry` from the actions context (rare re-render).

- **MED — `useShortlist` value also churns on every shortlist mutation.** `useShortlist.tsx:283-314` lists 12 dependencies. The drawer, header badge, and ProductCard's drag handler all subscribe. Split into `state` and `actions` contexts as above — actions (`addToLane`, `move`, `remove`, `setViewMode`, `saveOutfit`, `removeOutfit`) are stable enough to live alone.

- **OK — `useEffect` in `ConversationCanvas.tsx:20-22` scrolls on every messages change.** Fine for UX but it does call `scrollIntoView({behavior: 'smooth'})` per token; on slow devices the smooth animation queue can lag. Throttle to `requestAnimationFrame` or only scroll when the last message's last block index changes.

## SSE backpressure & misc

- **MED — `reply.raw.write(...)` return value ignored.** `backend/src/stream/sseWriter.ts:26,37,59,62,69` never inspect the boolean return. A slow client (or a paused TCP window) will buffer indefinitely in Node, growing memory. Track `false` returns and `await once(socket, 'drain')` before the next write. At minimum, add a soft watermark check and short-circuit further writes once buffered ≥ 1 MB.

- **OK — cache eviction policy is correct.** `backend/src/services/cache.ts:42-53` evicts oldest on insert when at capacity; on `get` it touches via delete+set (LRU). `stableKey` is sort-keyed so `{a:1,b:2}` and `{b:2,a:1}` collide as expected. All tool callers pass sorted/stable inputs (`compareProducts.ts:54` sorts ids; `searchCatalog.ts:81-86` includes filters + limit verbatim, fine because filters is a small object the LLM emits deterministically).

- **LOW — `bodySchema.messages` array max 100** (`chat.ts:33`). Long sessions will start dropping turns at the client before they hit this; not urgent.

## Concrete fixes (file:line)

- `backend/src/routes/chat.ts:77` — fire-and-forget the user-message append; construct `SseWriter` first so headers flush before any DB await.
- `backend/src/services/agent.ts:79-85` — kick `listPreferences` in parallel with the chat-route's pre-stream work; or thread it as a promise into `runAgent` instead of `await`-ing inline.
- `backend/src/services/groqClient.ts:48-68` — memoize the `mkdir` (one `Promise<void>` per process), or move usage logging to a debounced batch flush.
- `backend/src/db/repos/messages.ts:60-86` — collapse the two statements into a transaction (or `INSERT ... RETURNING ordinal` with a trigger).
- `backend/src/services/tools/extractStyleFromImage.ts:124-138` — wrap the `chatCompletion` call in `ctx.cache` keyed by `stableKey(['vision', verified.filename])`.
- `backend/src/stream/sseWriter.ts:62` — capture `const ok = this.reply.raw.write(...)`; on `false`, set a `paused` flag and queue subsequent writes until `'drain'`.
- `frontend/next.config.mjs:2` — add `experimental: { optimizePackageImports: ['framer-motion', 'lucide-react'] }`.
- `frontend/hooks/useConversation.tsx:589-609` — split context into state + actions; memoize actions separately so `InputBar`/`Header`/`MessageBubble` don't re-render per token.
- `frontend/hooks/useShortlist.tsx:283-314` — same split (state vs actions).
- `frontend/components/chat/MessageBubble.tsx:17` — wrap default export in `React.memo` with a shallow message-identity comparator.
- `frontend/components/chat/ConversationCanvas.tsx:20-22` — wrap `scrollIntoView` in `requestAnimationFrame` and only fire when `messages.length` changes (not on token deltas) OR when the streaming bubble grows past a threshold.
- `frontend/app/page.tsx:26` + `frontend/hooks/useConversation.tsx:395-407` — drop the duplicate `getOrCreateSession` call in ConversationProvider; read from `useSession()` instead (the provider is already above it on the tree).
- `frontend/components/product/ProductImage.tsx:30-36` — add `decoding="async"` and explicit `width`/`height` (or use aspect-ratio container which is already there — set intrinsic dims to suppress CLS on first paint).
- `frontend/components/product/Moodboard.tsx:133-137` — add `loading="lazy"` and `decoding="async"`; `width={128} height={128}`.
- `frontend/components/chat/MessageBubble.tsx:50-54` — add `loading="lazy"` and `decoding="async"` to the attached-image preview.
