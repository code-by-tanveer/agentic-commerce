# Architect — Code Quality — Round 1

## HIGH (correctness / safety)

- `backend/src/routes/chat.ts:74-84` — only the **user** turn is persisted server-side; the assistant turn is never persisted by the backend on `done` *or* on abort. ADR-0002 explicitly states "the partial assistant message is persisted as `truncated` so the next request's history reflects reality" — this isn't implemented. Today the FE's `appendMessage` after `done` is the only path. Fix: persist assistant turn in `agent.ts` on every `done`/`error`/`abort` exit, with a `status` column on `messages` (truncated/done/error), and remove the FE's `appendMessage` round-trip. Either implement the ADR or amend the ADR.

- `frontend/components/chat/MessageRenderer.tsx:83,94` — `as never` casts on `block.products` and `block.items` to coerce a wire-shape `NormalizedProduct` into FE's `Product`. `as never` is strictly worse than `as any` for diagnosis. The drift is real: FE `Product` drops `compareAtPrice` and `merchantTags`, both of which BE emits. Fix: delete the FE-local `Product`/`Variant`/`ReasoningChip`/`MerchantInfo` and re-export from `@agentic/events` (same pattern `frontend/lib/events.ts` already uses for the wire schema).

- `backend/src/services/uploads.ts:44` — `const key = env.UPLOAD_SIGNING_SECRET ?? env.IP_HASH_SALT;` is dead-and-misleading: `config/env.ts` already resolves the fallback into `UPLOAD_SIGNING_SECRET`, so the right-hand side never fires. Worse, the docstring above says the HMAC key is `HMAC-SHA256(payload, env.IP_HASH_SALT)` — outdated since Cycle 6 split the key. Fix: drop the `??` and rewrite the docstring.

- `packages/events/src/index.ts:128-133` — `preferenceUpdateSchema.key` is typed as `z.string()` but the valid set is the fixed `PREFERENCE_KEYS` enum from `backend/src/db/repos/preferences.ts`. FE then casts `event.key as PreferenceKey` — unsafe. Fix: narrow the schema to `z.enum([...])` and lift the enum into `@agentic/events` so BE and FE share one source.

- `backend/src/services/tools/recommendOutfit.ts:204-218` — Per-item rationale is **computed** (real catalog data: same merchant, shared tags, similar price band, ships-to overlap), then **stripped before emission**. The FE only displays bundle-level rationale (`OutfitBundle.tsx`). Either (a) add `rationale?: string` to the `outfit` event item shape and render it on each cell, or (b) delete `buildItemRationale` and the per-item assignment. The 130-line confessional comment should go either way.

## MEDIUM (cleanliness)

- `frontend/lib/api.ts:471-478` — `getProduct(id)` calls `/api/product/:id`, which does **not** exist on the backend; no FE code calls this. Pure dead export.

- `backend/src/stream/sseWriter.ts:66-73` — `ping()` public method is never invoked (auto-interval covers all heartbeats). Delete or wire to the agent loop's slow-path between turns.

- `backend/src/types/product.ts:58-60` — `SearchResponse` interface unreferenced.

- `backend/src/types/product.ts` vs `packages/events/src/index.ts` — `NormalizedProduct`, `NormalizedVariant`, `ReasoningChip`, `MerchantInfo` are duplicated. The shared package is canonical; BE `types/product.ts` should re-export from `@agentic/events`.

- `packages/events/src/index.ts:122-126` — `reasoningChipEventSchema` is in the discriminated union but **no tool emits it**. The comment on FE says "Cycle 5+ side-channel — ignore." If the side-channel isn't built, drop the schema arm; if it's planned, mark `[DEFERRED]`.

- `backend/src/index.ts:73`, `routes/upload.ts:46,61` — the literal `8 * 1024 * 1024` appears three times. Promote to `env.UPLOAD_MAX_BYTES` or a single exported `const UPLOAD_MAX_BYTES` in `config/env.ts`.

- Rate-limit configs scattered across four spelling styles (`routes/chat.ts`, `routes/upload.ts`, `routes/preferences.ts`, `routes/session.ts`, `routes/summary.ts`). Centralise in `config/env.ts` as `RATE_LIMITS.{chat,upload,session,summary}` so the matrix is auditable in one place.

- `backend/src/db/repos/preferences.ts:5-22` and `frontend/lib/api.ts:132-139` — `PreferenceKey` enum duplicated verbatim. Promote to `@agentic/events`.

- `frontend/lib/api.ts:60-73` — `clientNanoid()` reimplements nanoid in 14 lines. Acceptable to avoid a 1KB dep, but pin the length assumption in a constant.

- `backend/src/services/groqClient.ts:28-30` — `interface NonStreamChatOpts extends Omit<StreamChatOpts, never> {}` is identity-equivalent to `type NonStreamChatOpts = StreamChatOpts`. Cosmetic.

- `backend/src/services/normalize.ts:190-193` — `parseMoney(raw.price ?? raw.price_range).currency` passes a `{min,max,currency}` object to `parseMoney`, which only inspects `{amount,currency}`. The `.currency` of `price_range` is never honoured; currency falls back to `'USD'`. Either thread `price_range.currency` explicitly or document the ignore.

- `backend/src/services/normalize.ts:205` — `'Untitled product'` magic string; consider a const so share page and ProductCard could render a uniform "this item lost its title" affordance.

- Lying comments: `backend/src/types/product.ts:19`, `frontend/types/product.ts:11-14`, `34-36`, `93-94` all reference `frontend/lib/events.ts::*` — the schemas live in `@agentic/events` now.

- `backend/src/services/agent.ts:112-115` — abort branch emits `error: aborted` then returns, but `chat.ts` already closed the writer. The emit is a no-op. Drop the emit; `return` is enough.

## LOW (nits)

- `backend/src/services/agent.ts:44`, `services/reasoning.ts:15` — `MAX_TURNS=4`, `MAX_CHIPS=4` are file-local; consider grouping in `config/env.ts` for ops tunability.

- `backend/src/services/cache.ts:69-79` — `stableKey` reinvents canonical JSON. Fine; only call out so future devs don't reach for it for cryptographic uses.

- `backend/src/services/mcpClient.ts` — no structured logging on retry/backoff or non-fatal status; the only signal is the thrown McpError. Add an optional `log` parameter.

- `backend/src/services/tools/recommendOutfit.ts:127` — sub-searches bypass the shared LRU cache. Probably intentional (different query than `search_catalog`'s cache key); add a one-line comment.

- `backend/src/services/agent.ts:130` — `finishReason` typed as a union of strings; could be a Zod enum or `const` literal type.

- `backend/src/stream/sseWriter.ts:90-92` — serializer interpolates `JSON.stringify(event)` without checking for SSE-control chars (`\n` only); fine because JSON-stringify escapes them, but worth a one-line assertion in a future hardening pass.

- `frontend/lib/api.ts:23-30` — `safeJson` doesn't constrain the type beyond `{message?: string}`; consider a tagged interface.

- `frontend/lib/stream.ts:109` — `console.warn` for unknown event type; tag with a fixed prefix (`agentic.stream.unknown_event`) for greppability.

- `backend/src/services/groqClient.ts:65-67` — `recordUsage` swallows errors silently. Existing `// best-effort` comment is good; consider extending to "telemetry must not break the request path".

## Tests I'd write (top 5)

1. **`normalize.ts` fixtures.** Empty `{}`, no-variants, `compare_at_price < price`, merchant string vs object. Assert no throws + sensible defaults.
2. **`reasoning.ts` chip ranking.** Pure function, max ROI per line. Cover `RANK` order, cap at 4, `wantedRaw` Array/string branches for `ethics`, `{min,max}` branch for `budget`.
3. **`uploads.ts` signing.** Round-trip + tamper + expiry + traversal + scheme mismatch. SSRF-gate fitness for the vision pipeline.
4. **`stream/events.ts` schema round-trip.** Every `ServerEventType` → minimal payload → `serverEventSchema.parse(...)`. Drift defence.
5. **`agent.ts` turn loop with mock Groq + mock registry.** Scripted stream: turn-1 tool_call, turn-2 final text. Assert event sequence + abort cleanup.
