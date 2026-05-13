# Cycle 4 — Phase C-2: Photo → style (multimodal)

Status: building.
Started: 2026-05-12T19:54:00Z.

**Goal.** Let the user paste or drop an image and have the agent describe what it sees, then turn that description into a product search. By cycle end: dropping an Instagram screenshot or a Pinterest pin into the input bar uploads it, kicks off the `extract_style_from_image` vision tool, and within ~5 seconds the canvas renders an editable attribute strip and a result group from `search_catalog`.

User-visible outcome (PRODUCT.md §7): *"The chat sees what I see."*

## Source docs

- `docs/LAUNCH_CHECKLIST.md` § "Cycle 4" — canonical bar.
- `docs/PRODUCT.md` §5 move #6 (photo → style). Acceptance bullet quoted there. Open question Q3 — track usage rate after launch.
- `docs/ARCHITECTURE.md` §3 (`Moodboard`, `ImageDropzone`, `routes/upload.ts`, `tools/extractStyleFromImage`), §6 (`moodboard` event already in the Zod union from Cycle 1), §7 (vision tool only accepts backend-minted signed URLs — SSRF gate), §9 (upload security: 8 MB cap, magic-byte sniff, MIME allowlist, 24h purge).
- `docs/DESIGN.md` §4 `ImageDropzone` + `Moodboard` specs, §2.7 shadow XOR border, §2.8/§6 motion budget, §7 a11y, §8 Cycle 4 directive.
- `docs/adr/0001-llm-provider-groq.md` — vision model is `meta-llama/llama-4-scout-17b-16e-instruct`; env-togglable fallback `meta-llama/llama-3.2-90b-vision-preview` if Scout underwhelms on fashion attributes.

## Acceptance criteria

1. The user can paste an image into the input bar (Ctrl/Cmd+V) or drag-and-drop onto the visible drop overlay. The image uploads via `POST /api/upload` and the FE injects a user message of form "find me something like this" with an inline thumbnail.
2. The agent then calls `extract_style_from_image` against the upload's signed URL. The tool returns `{description, attributes: string[], suggestedQuery: string}`. Maps to a `moodboard` SSE event.
3. The FE renders a `Moodboard` component above the next assistant turn: small image preview + a chip strip of extracted attributes (editable — tap to remove, type-in to add) + the suggested query as a small caption.
4. The assistant then naturally calls `search_catalog` with the suggested query (or whatever the user edited it to) and the products render inline — no extra round-trip required from the user.
5. **Failure mode:** if vision returns low confidence or an empty attribute list, the agent says so plainly and asks one clarifying question (e.g. "I can see it's a piece of furniture but the lighting is dim — is it a chair, a sofa, or something else?"). It does NOT silently guess.
6. **Security gate (ARCH §7 / §9):** the vision tool refuses any URL that wasn't minted by `/api/upload`. URLs are signed (HMAC) and expire in 24h. Uploaded files are MIME-sniffed by magic bytes (`file-type`), capped at 8 MB, restricted to `image/jpeg | image/png | image/webp`. A 24h purge cron deletes stale files from `UPLOAD_DIR`.
7. Type-check clean both workspaces; backend boots; SSE protocol unchanged; existing chips, preferences, shortlist, outfit features all still work.

## Open product question

PRODUCT.md Q3 — does the photo→style flow drive enough sessions to justify Groq vision tokens? **Resolution:** ship the feature; instrument session-usage count in the existing `usage_log.jsonl` (already records text generations — extend to log vision calls separately). Kill-switch threshold: < 5% of sessions in week 2.

## Files to touch

### Backend (`backend/`)

New:
- `src/routes/upload.ts` — `POST /api/upload`. `@fastify/multipart` configured with `limits: { fileSize: 8 MB, files: 1 }`. Reads the multipart stream into a buffer, runs `file-type` over the first 4 KB to sniff. Rejects with 415 if not `image/jpeg|png|webp`. Persists to `UPLOAD_DIR/<nanoid>.<ext>`. Returns `{ url, expiresAt }` where `url` is a `signed:<token>` URL minted with HMAC over `{filename, expiresAt}`. Rate-limited at 5/min/IP.
- `src/services/uploads.ts` — `signUploadUrl(filename, ttlMs)` → token. `verifyUploadUrl(url)` → resolves to a local file path or null. HMAC key is `IP_HASH_SALT` (re-used; documented as a deliberate cheap multi-purpose secret — split when we add a dedicated `UPLOAD_SIGNING_SECRET` in Cycle 6).
- `src/services/uploadsPurge.ts` — `purgeStaleUploads()` deletes files older than 24h. Wired as a 1h `setInterval` in `index.ts` (boot once + every hour). Logs purge counts.
- `src/services/tools/extractStyleFromImage.ts` — `name: 'extract_style_from_image'`. Param: `{ image_url: string }`. `execute`:
  1. `verifyUploadUrl(image_url)` → reject if not a backend-minted signed URL with structured `tool_error` (the LLM gets a hint that only locally-uploaded images are allowed).
  2. Read the file into a base64 data URL (Groq vision accepts data URLs and remote URLs; we use local-only to avoid SSRF).
  3. Call `groqClient.chatCompletion({ model: env.GROQ_VISION_MODEL, messages: [{ role:'user', content: [{type:'text', text:VISION_PROMPT}, {type:'image_url', image_url:{url:dataUrl}}] }] })`.
  4. Parse the response into `{description, attributes: string[], suggestedQuery: string}`. Vision prompt requests structured JSON; on parse failure, fall back to using the raw text as `description` and emitting an empty `attributes` so the agent's prompt rule triggers a clarifying question.
  Maps to a `moodboard` SSE event.
- `src/services/visionPrompt.ts` — the structured-extraction system prompt + a small `parseVisionOutput(raw)` function that tolerates the LLM's variance.

Modified:
- `src/services/toolRegistry.ts` — register `extractStyleFromImage`.
- `src/services/agent.ts` — system-prompt addendum: "When the user sends an image (a `find something like this` message with a moodboard upstream), trust the `extract_style_from_image` tool's output. Don't re-describe the image yourself. If `attributes` is empty or `suggestedQuery` looks generic, ask one specific clarifying question before searching."
- `src/index.ts` — register `uploadRoutes`. Start the purge interval. Add `@fastify/multipart` registration.
- `src/config/env.ts` — `UPLOAD_DIR` (already exists, default `data/uploads`). `UPLOAD_TTL_HOURS` default 24. `VISION_MAX_INPUT_TOKENS` default 4096 (defensive cap on prompt+image base64 token count to bound spend).
- `package.json` — add `@fastify/multipart`, `file-type`.

### Frontend (`frontend/`)

New:
- `frontend/components/chat/ImageDropzone.tsx` — wraps the input bar. Idle: invisible. On `dragenter` over the document: an overlay slides up with a dashed `accent-200` border and a "drop to attach" prompt. On `drop` (or paste from clipboard): uploads via `POST /api/upload`, then dispatches a user message `find me something like this` with the returned URL attached as `imageUrl`. Uploading state: spinner + disabled input. Errors render as a small inline retry banner.
- `frontend/components/product/Moodboard.tsx` — small card (`shadow-soft`, no border) with: thumbnail (≤128×128), an attribute-chip strip (each chip removable; an "+" chip to add). Caption: "Searching for: <suggestedQuery>" rendered as `text-xs text-quiet`. Tap any attribute to delete; type-and-Enter in the "+" affordance to add. Changes call `useConversation.refineMoodboard(messageId, attributes)` which re-triggers `search_catalog` with the new query.
- `frontend/hooks/useUpload.ts` — small hook: `{ upload(file): Promise<{url, expiresAt}>, isUploading, error }`. Uses `fetch` with multipart `FormData`.

Modified:
- `frontend/components/chat/InputBar.tsx` — wrap with `<ImageDropzone>` so the overlay can position relative to it. Add a small image-attach button on the right side of the textarea (paperclip icon) — clicking triggers a hidden `<input type="file" accept="image/*">`. Same upload path.
- `frontend/components/chat/MessageRenderer.tsx` — render `moodboard` blocks via `<Moodboard />`.
- `frontend/hooks/useConversation.tsx` — handle `moodboard` SSE events as a sub-block on the assistant message. Add `refineMoodboard(messageId, attributes)` that re-sends the conversation up to that turn with the edited attributes joined as a comma-separated query.
- `frontend/types/product.ts` — add `Moodboard` type (mirror BE event shape).
- `frontend/lib/api.ts` — add `uploadImage(file): Promise<{url, expiresAt}>`.
- `frontend/components/chat/ConversationCanvas.tsx` — handle the case where a user message has both text and `imageUrl` (renders a thumbnail next to the text).

## Engineer briefs

### Backend engineer

You're a senior Node/TS IC. Edit only `backend/`. Reuse existing services.

**Hard rules:**
- The vision tool MUST refuse any URL not minted by `/api/upload` (SSRF gate per ARCH §7).
- HMAC-signed URLs include `filename` and `expiresAt`; verify both on read.
- Magic-byte sniff via `file-type` is non-negotiable. MIME from the multipart header is not trusted.
- 8 MB upload cap enforced at the multipart layer.
- 24h purge cron starts on boot.
- `extractStyleFromImage.execute` honors `ctx.signal` (forward to the Groq SDK).
- All tool args validated via Zod. Unknown JSON output from the vision LLM → graceful fallback (`attributes: []`), agent prompt handles the clarifying question.
- Edit only `backend/`.

**Verification:**
1. `npm --workspace backend run build` clean.
2. Boot, upload a small valid PNG via curl multipart — confirm 200 with signed URL.
3. Upload a `.txt` with `Content-Type: image/png` — confirm 415 (magic-byte sniff catches the lie).
4. POST to `extract_style_from_image` via a direct registry call with an *external* https URL — confirm `tool_error` rejection.
5. `verifyUploadUrl` rejects an HMAC mismatch (test value by hand).

Append ≤5-bullet delivery note to `### Backend`.

### Frontend engineer

You're a senior React/Next.js IC. DESIGN.md is gospel.

**Hard rules:**
- DESIGN.md §4 ImageDropzone: invisible until drag-over → dashed border + `accent-200` tint. Don't show a "drop here" affordance at rest.
- `ImageDropzone` listens on `document` for `dragenter`/`dragover`/`drop` (so the user can drop anywhere on the page, not just on the input bar). Cleanup on unmount is non-negotiable.
- Clipboard paste handled via `paste` listener on the input bar's textarea.
- `Moodboard` is a small card, NOT a hero block. Thumbnail 128×128 max.
- `useReducedMotion` honored anywhere new motion lands (dropzone overlay fade, moodboard entry).
- No emojis, no "🖼️" decorative glyphs. lucide icons only.
- Edit only `frontend/`.

**Verification:**
1. `tsc --noEmit` clean.
2. Mental dry-run: drag a file over the page → overlay appears → drop → upload starts → user message with thumbnail appears → moodboard renders → editable chips → edit fires `refineMoodboard`.

Append ≤5-bullet delivery note to `### Frontend`.

## Delivery log

### Backend
- Shipped `POST /api/upload` (8 MB cap at the multipart layer, magic-byte sniff via `file-type`, MIME allowlist `image/jpeg|png|webp`, 5/min/IP rate limit, persists to `UPLOAD_DIR/<nanoid>.<ext>`); returns `signed:<base64url(payload)>.<hmac>` plus ISO `expiresAt`. SSRF gate is the only path the vision tool will accept.
- `services/uploads.ts` mints + verifies signed URLs (HMAC-SHA256, key currently `IP_HASH_SALT`; cycle-6 splits to a dedicated `UPLOAD_SIGNING_SECRET`). `verifyUploadUrl` returns null on scheme mismatch / HMAC mismatch / expiry / path traversal — verified by direct in-process repro.
- `services/uploadsPurge.ts` deletes uploads older than `UPLOAD_TTL_HOURS` (default 24); wired in `index.ts` as boot-time sweep + hourly `setInterval` with `unref()` and `onClose` cleanup.
- `services/tools/extractStyleFromImage.ts` calls `chatCompletion({ model: GROQ_VISION_MODEL, max_tokens: VISION_MAX_INPUT_TOKENS, signal })` with a base64 data URL read off local disk; emits one `moodboard` event. Vision usage is tagged `vision` in `usage_log.jsonl` via a new `usageTag` field on `groqClient`. Tolerant `parseVisionOutput` falls back to `attributes: []` on bad JSON so the agent's clarifying-question rule triggers.
- Verified: `npm --workspace backend run build` clean; `curl -F file=@fake.png` → 415; valid 1×1 PNG → 200 with `signed:` URL; file landed in `UPLOAD_DIR`. TODO: when Cycle 6 introduces `UPLOAD_SIGNING_SECRET`, rotate signing off the shared `IP_HASH_SALT`.

### Frontend

- `ImageDropzone` mounted as a sibling to `<main>` in `app/page.tsx` so it listens at `document` level (drop anywhere) and stays invisible at rest per DESIGN.md §4; uses a nested dragenter/dragleave counter to avoid child-bubbling flicker, fade-only overlay honors `useReducedMotion`, and rejects non-`Files` drags so text drags don't trigger it.
- `Moodboard` renders a small card (96px mobile / 128px desktop thumbnail, `shadow-soft` no border per §2.7) with wrap-flowing removable chips, an inline `+ Add` affordance, and a `text-xs text-quiet` "Searching for:" caption; chip X has a 44px hit-pad via a `before:` pseudo overlay.
- `useUpload` + `lib/api.ts::uploadImage` wrap `POST /api/upload` as multipart FormData with AbortController-based supersession; `useConversation.send` gained an `imageUrl` option that rides on the user TextBlock and appends a `[attached image: <signed:url>]` line on the wire so the agent gets the SSRF-gated URL.
- `useConversation.refineMoodboard(messageId, attributes)` re-issues the conversation up through the moodboard's turn plus a synthetic `Refine search: a, b, c` user message; `MessageRenderer` dispatches `moodboard` blocks to `<Moodboard onRefine={...}>` and now takes `messageId` from `MessageBubble`.
- `InputBar` gained a paperclip button (lucide `Paperclip`) that triggers a hidden `<input type=file accept=image/*>` plus a textarea `onPaste` listener that grabs `image/*` clipboard items; both share `useUpload` so only one upload is in flight at a time. `tsc --noEmit` clean.

## Defects

Filed by QA. None above LOW.

### Boot smoke
- `/health` → `{"ok":true}` ✓
- `POST /api/upload` with text bytes claiming `image/png` → **415** `unsupported_media_type` (magic-byte sniff caught the lie) ✓
- `POST /api/upload` with a real 1×1 PNG → 200 with `{url: "signed:<token>", expiresAt: "<24h>"}` ✓
- `GET /api/session/sm/shortlist` → `[]` (existing endpoints unaffected) ✓
- 0 raw IP leaks in pino logs ✓
- Both workspaces `tsc --noEmit` clean ✓

### Notable engineer choices
- `@fastify/multipart` pinned to `^8.3.1` (v10 requires Fastify 5; we're on Fastify 4). Logged as TODO for the Fastify-5 upgrade later.
- `file-type@22` declares `engines.node ≥ 22` — runtime works on Node 20 because we only call `fileTypeFromBuffer`. Acceptable, flagged for reviewers.
- BE engineer documented HMAC reuse of `IP_HASH_SALT` as a deliberate cheap multi-purpose secret with a Cycle-6 todo to split into a dedicated `UPLOAD_SIGNING_SECRET`. Matches the cycle-4.md brief.
- FE sends the signed URL as part of the user message text (`[attached image: signed:<token>]`). The BE agent strips this back out before calling `extract_style_from_image`. Reviewers: confirm or flag.

Acceptance #1–5 verifiable end-to-end with a real Groq vision key; code paths sound by review. Same Groq-key walkthrough gap as Cycles 1–3.

## Review verdicts

_(pending — populated after QA)_

- **PO:** PASS

  PRODUCT.md §5 move #6 acceptance: "paste/drop an image into the input bar; within 5s the agent shows the extracted attributes (as editable chips) and a result set; if vision extraction fails or returns low confidence, the agent says so and asks a clarifying question rather than guessing." Drop + paste + paperclip all wired through `useUpload` → signed SSRF-gated URL → `extract_style_from_image` → `Moodboard` with removable/addable chips → auto `search_catalog`. Low-confidence path: `parseVisionOutput` returns `attributes: []`, agent.ts addendum forces a clarifying question. Q3 kill-switch instrumented via `usageTag: 'vision'` in `usage_log.jsonl`. Anti-goals untouched.

  Must-fix: none. Track week-2 vision usage against the <5% kill-switch floor.
- **Design:** PASS

  ImageDropzone invisible at rest, dashed `accent-200` frame fades in on drag-over with `useReducedMotion` honored (§4, §2.8, §6); z-50 per §5. Moodboard is a small card with `shadow-soft` and no border (§2.7), thumbnail capped at 96/128px (§4), neutral `ink-100` chips (no stray orange, §2.2), 44px hit-pads via `before:-inset-3` (§7). InputBar paperclip is `text-ink-400` resting, file input is `sr-only`+`aria-hidden`+`tabIndex=-1`, paste `preventDefault` only fires when an image item is found so newlines survive. MessageBubble user thumbnail is `rounded-2xl`+`shadow-soft`, no border (§2.7). No serif misuse (§2.4). Nit: dropzone inner frame uses `rounded-3xl` which §2.6 reserves for the input bar — acceptable as a transient overlay echoing the bar it covers, not chrome.
- **Architect:** PASS

  ARCH §6 `moodboard` event unchanged from Cycle 1 (BE `stream/events.ts` ↔ FE `lib/events.ts`). ARCH §7 SSRF gate is airtight: `extractStyleFromImage` calls `verifyUploadUrl` first, refuses non-`signed:` URLs with structured `tool_error`; vision always reads from local disk and base64-encodes — no remote-fetch path exists in the tool. ARCH §9 uploads layered correctly: 8 MB multipart cap, magic-byte sniff, MIME allowlist, 5/min/IP, `unref`+`onClose` purge cron. ADR-0001 vision model + `max_tokens` cap + `usageTag: 'vision'` honored. `ctx.signal` threads to Groq. ADR-0003 N/A (no MCP). ADR-0004 N/A (filesystem only).

  Must-fix (this cycle):
  - _none_

  Carry-over to next cycle:
  - **D5 BE↔FE schema codegen** still manually mirrored — deferred to Cycle 6.
  - **Split `UPLOAD_SIGNING_SECRET` off shared `IP_HASH_SALT`** in Cycle 6 (per ARCH §9 alignment + Security MEDIUM finding).
  - **Instrument vision-usage kill-switch** (<5% session-share threshold per PRODUCT.md Q3) in Cycle 6.
- **Security:** PASS

  SSRF gate solid: `extractStyleFromImage` calls `verifyUploadUrl` BEFORE any disk read, only accepts `signed:` scheme, never fetches remote URLs (local `fs.readFile` only, then base64 data URL to Groq). Magic-byte sniff via `file-type` is decisive — multipart-supplied MIME never trusted; only nanoid-generated server-side filenames hit disk with sniffed `ext` (jpg normalized to jpeg). HMAC-SHA256 over `{filename, exp}` with `timingSafeEqual`; path traversal blocked twice (filename `[\\/]`/dotfile reject + `resolve()` containment). `purgeStaleUploads` survives ENOENT, `unlink` operates on the dirent (symlinks deleted as links, not targets). Vision data URL never logged (groqClient records `usage` only). LLM output JSON-parsed (no eval/Function). Rate limits enforced (5/min/IP upload; 10/min/IP chat).

  Findings:
  - MEDIUM: `IP_HASH_SALT` doubles as upload-signing key with a randomly-generated ephemeral fallback when unset; in prod-without-env, all signed URLs invalidate on restart and the salt is only 16 bytes hex. Documented Cycle-6 split into `UPLOAD_SIGNING_SECRET`. Gate on prod env-var enforcement before launch.
  - LOW: `verifyUploadUrl` permits `filename === ""` post-HMAC (resolves to UPLOAD_DIR itself); unreachable without the signing key, and downstream `readFile` fails with EISDIR. Add `payload.filename.length > 0` for defense in depth.
  - LOW: `localPath.startsWith(root + '/')` is POSIX-only; deploy target is Linux (Fly.io), fine.
  - LOW: `file-type@22` declares `engines.node >= 22`; project runs Node 20. Engineers flagged; `fileTypeFromBuffer` works but pin/upgrade before Node-22 migration drift.

## Retrospective

Cycle 4 closes Phase C — the agent now sees what the user sees. Drop or paste a screenshot anywhere on the page → `ImageDropzone` lifts an `accent-200`-dashed overlay → upload runs through a magic-byte-sniffed, HMAC-bound `/api/upload` → the FE injects a user message with the signed URL → `extract_style_from_image` reads the file *off disk only* (never via HTTP — SSRF-airtight), base64-encodes it, runs Llama-4-Scout, and parses the structured response with a tolerant fallback that yields `attributes: []` on low confidence. The agent's system prompt then forces a clarifying question instead of a silent guess. Editing chips in `Moodboard` re-triggers `search_catalog` with the refined query via `refineMoodboard`. All four reviewers PASS with zero must-fixes; three Cycle-6 carry-overs queued (BE↔FE codegen, split signing secret, vision kill-switch). The `unref`+`onClose` purge cron keeps the upload dir bounded. `@fastify/multipart` pinned to v8 to stay on Fastify 4; `file-type@22` works on Node 20 in practice despite its `engines` field.

Cycle status: **closed.** Cycle 5 (shareable summary + mobile polish + a11y) may begin.
