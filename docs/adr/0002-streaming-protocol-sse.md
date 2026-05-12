# 0002 — Streaming protocol: Server-Sent Events over POST

## Status
Accepted — 2026-05-12. Owner: architect. Supersedes: none.

## Context

The product's interaction model is "the assistant's message materializes incrementally — text streams in, then a product card appears mid-message, then another card, then a comparison table." We need a transport that:

1. Pushes typed events from server to client during a single user turn (10–60 s).
2. Carries a meaningful request body (the conversation history can be a few KB).
3. Works through Vercel's rewrite proxy and Fly.io's HTTP router without buffering.
4. Survives the realities of mobile networks at café-grade reliability.
5. Adds minimal client-side dependency weight.

We evaluated three options.

**WebSockets.** Bidirectional, low overhead per frame, well-understood. But: bidirectional is overkill — the user input is a one-shot POST, and after that everything flows server→client. WebSockets require a separate path through any HTTP proxy, more careful CORS, and more careful reconnection logic. They also resist Vercel's request-rewriting model: you cannot easily proxy a WS upgrade through Next.js, you have to point the FE directly at the backend, complicating the security posture (FE knows the BE URL; CORS gets stricter). Operationally heavier than needed.

**Vercel AI SDK protocol (`useChat`).** A nice abstraction but couples us to a specific event shape and version, and the SDK assumes the LLM call lives on a Next.js API route (i.e., on Vercel). Our backend is on Fly.io for reasons documented in ARCHITECTURE.md §10. Adopting `useChat`'s protocol means either lifting the LLM call to Vercel (no — SSE on serverless is a 60–120s footgun) or reimplementing the protocol shape on Fastify. Reimplementing means we own the spec anyway, so the "use a library" benefit evaporates.

**Server-Sent Events.** One-way server→client. Built on plain HTTP. Survives proxies that respect `text/event-stream` (Vercel, Fly, Cloudflare all do, with `x-accel-buffering: no` for safety). Standard browser API is `EventSource`, but it is GET-only and we need to POST the conversation history. The fix is a small library: `@microsoft/fetch-event-source`, ~8 KB, maintained, lets us POST and stream the response. The server side is trivially Fastify-friendly (`reply.raw.write(...)` with the right headers).

The deciding factor is that our traffic is genuinely one-way during a turn. The next user message is a separate POST. There is no value in a persistent bidirectional channel. Everything else — proxy-friendliness, simpler ops, smaller client surface — falls out from that.

## Decision

Use **Server-Sent Events over POST** for `/api/chat`. Other endpoints stay JSON REST.

Wire format:

```
POST /api/chat HTTP/1.1
Content-Type: application/json
Accept: text/event-stream

{ "sessionId": "...", "messages": [...] }

────────── response ──────────
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no

event: text_delta
data: {"text":"Looking for "}

event: tool_status
data: {"toolCallId":"call_1","name":"search_catalog","status":"running","args":{"query":"minimalist desk lamp"}}

event: products
data: {"toolCallId":"call_1","query":"minimalist desk lamp","products":[...]}

event: done
data: {"turnsUsed":2}

```

Client uses **`@microsoft/fetch-event-source`**, not the native `EventSource`.

**Typed events.** Server-side, every emitted event is validated against a Zod schema in `stream/events.ts`. Client-side, the same shape is re-declared in TypeScript and the parser asserts on receive. Drift between the two is the obvious risk — see consequences.

**Heartbeat.** `event: ping` every 15 s server-side to keep intermediate proxies from idle-closing the connection. Client ignores `ping`.

**Reconnection strategy: explicit, not automatic.**

`EventSource` auto-reconnects with `Last-Event-ID`. We do **not** use that protocol because resuming a half-finished agent turn is incorrect: the LLM has already partly responded, tools have already partly run, and replaying from a checkpoint would either duplicate side effects (saved preferences) or render an internally inconsistent message. Instead:

- If the connection drops before `event: done`, the FE marks the assistant message as `truncated` and surfaces a single "connection lost — retry?" affordance. The user clicks; a brand-new POST runs.
- Server-side: a `request.raw.on('close')` handler aborts the Groq stream and all in-flight tool calls (`AbortController` propagated through `ToolContext.signal`). The partial assistant message is persisted as `truncated` so the next request's history reflects reality.

## Consequences

### Positive
- Smallest possible client surface for the streaming transport: one library (~8 KB), one async iterator. Fits the "invisible AI" principle from `DESIGN.md`.
- No proxy gymnastics. SSE works through the Next.js `rewrites` config on Vercel and the Fly router without special headers beyond `X-Accel-Buffering: no`.
- The protocol is observable in the browser DevTools Network tab — each event is a visible line. Onboarding new engineers is faster.
- Backpressure is implicit: HTTP's TCP window does the right thing if the client is slow.
- Server-side, the agent loop owns its own stream; it doesn't need a message broker. The whole transport is `reply.raw.write` on a Fastify response.
- The typed-event protocol is the same shape we would build over WebSockets anyway. Migration cost is one file (`stream/sseWriter.ts`) if we ever change minds.

### Negative
- **GET-only browsers and tools.** Tools like curl, Postman, and `EventSource` snippets in tutorials assume SSE is GET. We are using POST. Anyone debugging the endpoint with `curl -N` needs the `-X POST -H 'Accept: text/event-stream' --data ...` incantation. *Mitigation:* document the curl one-liner in `README.md` and pin it in `docs/CYCLES/cycle-1.md`. The actual frontend is unaffected.
- **No native browser reconnection.** Choosing not to use `Last-Event-ID` means a flaky connection visibly fails. *Mitigation:* the failure surface is a single, clearly-worded retry affordance; the failure is the *correct* behaviour for a half-finished agent turn, so we are paying a UX cost in exchange for correctness. We accept the trade.
- **One-way only.** If we ever need real-time client→server during a turn (e.g. user cancels a tool call mid-flight), SSE cannot carry that. *Mitigation:* a sibling REST endpoint `POST /api/chat/:turnId/cancel` would handle it; we sketch the path but do not build it. [DEFERRED.]
- **Type drift risk between FE and BE event schemas.** The FE redeclares the event types. *Mitigation:* shared source of truth in a `packages/events` workspace package, **or** generate the FE types from the BE Zod schemas via `zod-to-ts` at build time. Cycle 1 spike to pick one. The cheap interim: a CI check that diffs the two type files on PR. [ASSUMPTION — Cycle 1 picks the codegen path.]
- **Proxies that strip `text/event-stream`.** Some corporate proxies still buffer the stream. *Mitigation:* the `X-Accel-Buffering: no` header handles most cases; we document this as a known limitation and accept that ~1% of users in restrictive networks see batched output. They still get the right answer, just not the trickling animation.
- **HTTP/1.1 connection limit on browsers (6 per origin).** With our same-origin proxy model, an active chat plus a few image loads can compete for slots. *Mitigation:* HTTP/2 from Fly's router (enabled by default) raises the limit dramatically; on dev (HTTP/1.1) it's not a real problem with a single in-flight chat at a time.

## Mitigations summary

1. README and Cycle 1 docs include a working `curl -N -X POST -H 'Accept: text/event-stream' ...` example so the endpoint is debuggable without the FE.
2. Heartbeat `event: ping` every 15 s + `X-Accel-Buffering: no` cover the proxy footguns.
3. FE retry affordance is a UI primitive (`<RetryBanner>`) reused for any `error: retryable=true` event, not just disconnects.
4. Shared event-schema package decided in Cycle 1; until then, a CI lint asserts identical type names and union arms between `backend/src/stream/events.ts` and `frontend/lib/events.ts`.
5. `request.raw.on('close')` wired in `chat.ts` aborts every downstream resource (Groq stream, MCP calls) the moment the user navigates away. No orphaned spend.
