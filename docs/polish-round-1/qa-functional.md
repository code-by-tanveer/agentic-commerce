# QA Functional — Round 1

Backend launched on port 4011 with `GROQ_API_KEY=test` (placeholder) and `UCP_PROFILE_URL=https://example.com/profile.json`. Boot logs warn that `IP_HASH_SALT` / `UPLOAD_SIGNING_SECRET` are unset (expected dev behaviour). Migration `0001_init.sql` applied cleanly.

## Smoke pass/fail table

| # | endpoint | result | notes |
|---|---|---|---|
| 1 | `GET /health` | PASS | `200 {"ok":true}` |
| 2 | `GET /api/session/qa1/shortlist` (empty) | PASS | `200 []` — create-on-read fires `getOrCreateSession` |
| 3 | `PUT /api/session/qa1/shortlist/p1` (valid) | PASS | `200` — row echoed with normalised snapshot (description="", images=[]) |
| 4 | `PUT /api/session/qa1/shortlist/p1` (`javascript:` checkoutUrl) | PASS | `400 invalid_request` — `safeUrl` refine rejects scheme |
| 5 | `GET /api/session/qa1/shortlist` (after PUT) | PASS | `200` with the love-lane row |
| 6 | `PUT /api/session/qa1/preferences/size` | PASS | `200 {"key":"size","value":"8","source":"user",...}` |
| 7 | `PUT /api/session/qa1/preferences/banana` | PASS | `400 invalid_key`, returns `validKeys` enum |
| 8 | `POST /api/session/qa1/summary` | PASS | `200 {"url":"/s/qa1"}` |
| 9 | `GET /api/session/qa1/summary` | PASS | `200` — blob contains love=[p1], maybe=[], outfits=[], merchantCount=1, deterministic gist |
| 10 | `GET /api/session/never/summary` | PASS | `404 not_found` (no row → no blob) |
| 11 | `POST /api/upload` fake-PNG text bytes | PASS | `415 unsupported_media_type` — magic-byte sniff rejects (claimedMime=image/png, detected=unknown) |
| 12 | `POST /api/upload` real 1×1 PNG (68 B) | PASS | `200 {"url":"signed:<jwt-like>","expiresAt":"2026-05-14T..."}` — file written to `data/uploads/<nanoid>.png` |
| 13 | `POST /api/chat` SSE upstream-key fail | PARTIAL | Returns SSE: `: open` then `event: error` with `{"code":"invalid_request","message":"Service unavailable. Please try again.","retryable":false}` then closes. Graceful, no hang. **But retryable is `false`, while the QA spec asks for retryable=true.** See HIGH defect below. |

All 13 endpoints respond; no hangs, no 5xx leaks, no raw Groq SDK error text reaches the wire (only the redacted classifier message). The 401 from Groq is logged once with full trace (visible in `/tmp/qa-be.log`), never streamed.

## Defects (sorted HIGH → LOW)

- **[HIGH] backend/src/services/agent.ts:350-360** — `classifyError` marks `401 / 403 / invalid_api_key` as `retryable: false`. The QA spec for round 1 expects an *upstream-key fail* to deliver a **retryable** error frame ("graceful upstream-key fail, not a hang"). With the current behaviour, the FE error panel (`MessageRenderer.tsx:121`) does NOT render the Retry button on an admin-rotation transient. Two reasonable resolutions:
  - (a) Flip `retryable: true` for the auth bucket — the user often can retry once admins rotate. Or
  - (b) Keep `false` and update the FE copy / round-1 acceptance criterion. Currently the user is told "Service unavailable. Please try again." but given no retry affordance — copy contradicts the UI state. Repro: `curl -N -H 'Accept: text/event-stream' -d '{"messages":[{"role":"user","content":"hi"}]}' http://localhost:4011/api/chat`.

- **[MEDIUM] backend/src/routes/summary.ts:35-46** — `POST /api/session/:id/summary` runs `composeSessionSummary` and writes the blob *only after* `getSession(id)` returns truthy. But the GET handler on the same path 404s when there's no row, while *PUT shortlist* uses `getOrCreateSession`. Net effect: a brand-new session ID that has *never* hit a write endpoint will 404 on POST summary. The QA flow happens to PUT a shortlist row first so the session exists; a client that calls POST summary on a fresh ID gets a confusing 404. Fix: use `getOrCreateSession` in the summary POST (matching shortlist/preferences/view-mode semantics) or document the dependency.

- **[MEDIUM] backend/src/routes/upload.ts:39-50** — When `request.file()` rejects with a non-multipart parsing failure, `400 invalid_multipart` returns. Good. But the route does NOT call `part.toBuffer()` inside a try with a streaming-size guard *during* read — if the multipart cap fires mid-stream `toBuffer()` re-throws and we map to 413. Acceptable today, but a malicious client that streams >8 MB will already have consumed bandwidth — the parser cap is correct, no action needed; just calling out the close-to-edge behaviour. **No-op fix unless we get an abuse report.**

- **[LOW] backend/src/stream/sseWriter.ts:31-43** — `pingTimer.unref?.()` plus `closed = true` short-circuit prevent a ping racing with `close()`. Verified by manual SSE test (single error frame, then clean close, no trailing ping). Note: if `reply.raw.write` throws after `closed=false` (e.g. ECONNRESET) the catch swallows it but the timer keeps ticking until next interval fires — acceptable, just noting.

- **[LOW] backend/src/routes/session.ts:166-172** — Defensive `isShortlistLane` check is unreachable: the zod schema at line 68 already constrains `lane: z.enum(['love','maybe','skip'])`, so `parsed.success` implies valid lane. Dead branch — safe but misleading.

- **[LOW] frontend/components/product/ProductCard.tsx:44-47** — `window.open(checkoutUrl, '_blank', 'noopener,noreferrer')` does NOT re-validate the URL scheme. Defence-in-depth says re-check `^https?:\/\//`. Backend already enforces this on PUT (session.ts:34-40), so the only way a bad URL reaches the FE is if (a) the catalog MCP returns one (untrusted) or (b) an attacker tampers with persisted state. Low risk; high-value cheap hardening.

- **[LOW] backend/src/index.ts:88** — `GET /health` is **not** rate-limited (`global: false` and no `config.rateLimit`). Public health probes can hammer it; usually fine, but worth a tiny limit (e.g. 600/min) so it can't be used as an oracle for restart timing.

## Suggested fixes

1. **Decide retry semantics for invalid_api_key**: either change `agent.ts:358` to `retryable: true` (the user can legitimately retry post-rotation) or update FE copy in `MessageRenderer.tsx` so the message no longer says "try again" when the button is absent.
2. **`summary.ts` POST**: replace `getSession` with `getOrCreateSession` to match the rest of the session surfaces.
3. **`session.ts:166`**: drop the unreachable `isShortlistLane` defensive branch (zod enum already enforces it).
4. **`ProductCard.tsx`**: add a quick `if (!/^https?:\/\//i.test(checkoutUrl)) return;` guard before `window.open`.
5. **`index.ts:88`**: gentle rate limit on `/health` (`{ max: 600, timeWindow: '1 minute' }`).
6. (Optional, cosmetic) Bound the `pingTimer` more tightly on socket errors by hooking `reply.raw.on('error', () => this.close())` in `SseWriter`.

---

**Files touched / referenced**:
- `/home/sam/agentic_commerce/backend/src/index.ts`
- `/home/sam/agentic_commerce/backend/src/routes/{chat,session,preferences,summary,upload}.ts`
- `/home/sam/agentic_commerce/backend/src/services/agent.ts` (classifyError)
- `/home/sam/agentic_commerce/backend/src/stream/sseWriter.ts`
- `/home/sam/agentic_commerce/frontend/components/product/ProductCard.tsx`
- `/home/sam/agentic_commerce/frontend/components/chat/MessageRenderer.tsx`
- `/home/sam/agentic_commerce/frontend/hooks/useConversation.tsx`

Server log archive: `/tmp/qa-be.log` (preserved for follow-up).
