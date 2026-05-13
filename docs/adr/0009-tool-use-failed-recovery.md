# 0009 — `tool_use_failed` recovery with fallback-model retry

## Status
Accepted — 2026-05-13. Owner: architect. Supersedes: none. Related: ADR-0001 (Groq provider), ADR-0008 (content sanitizer).

## Context

Groq's chat-completion endpoint returns **HTTP 400 with `error.code = "tool_use_failed"`** when the model produces a malformed tool call that the server-side validator catches *before* it streams to us. Distinct from the XML-leak path (ADR-0008): that one leaks malformed content to `delta.content`; this one trips Groq's own validator and aborts the stream.

Observed triggers, all on `llama-3.3-70b-versatile`:

- Mixed XML/JSON inside the model's intended `tool_calls` (a function-call structure with a non-JSON `arguments` field).
- A tool call to a name that isn't in the `tools[]` array (model hallucinates `repo_browser.open_file` mid-shopping-flow).
- A call attempted on the final turn after we set `tool_choice: 'none'` — the model insists.

Failure surface before this ADR:

1. Stream raises mid-flight. The agent loop's outer try/catch emits `error: internal` to the FE.
2. The user has already seen real product cards from earlier turns. The error block lands beneath them.
3. The conversation is functionally dead — retrying the user's message re-runs from scratch, often hitting the same bug.

The product cost is high precisely because earlier turns *did* succeed. Showing the user "products + error" is strictly worse than showing them "products + nothing" — the cards are good, the closing paragraph was unnecessary anyway. We need a recovery path that preserves the work already done.

## Decision

Two-tier recovery, implemented inside the per-turn try/catch in `services/agent.ts::runAgent`. **All three tiers run inside the same SSE stream — the user never sees the recovery happen.**

### Tier 1 — Primary tools-off retry (CURRENT IMPLEMENTATION RUNS FALLBACK MODEL DIRECTLY)

When `err.status === 400 && err.error?.code === 'tool_use_failed'`:

- Discard all partial state for this turn (`aggregateContent`, `toolCallAccumulator`, `finishReason`, fresh `ContentSanitizer`, `xmlRecoveredSlotBase` reset).
- **Retry the turn on `GROQ_FALLBACK_MODEL` (`llama-3.1-8b-instant`) with `tools: undefined` and `tool_choice: 'none'`.**

We jumped straight to the fallback model rather than retrying the primary tools-off because `openai/gpt-oss-120b` has been observed to ignore `tools: undefined` + `tool_choice: 'none'` and hallucinate tool calls anyway (e.g. `repo_browser.open_file`), producing a second `tool_use_failed` on the retry itself. `llama-3.1-8b-instant` respects the directive and produces clean text-only summaries. The latency cost of skipping a primary retry is a few hundred milliseconds and the success rate jumps from "sometimes works" to "always works".

### Tier 2 — Graceful terminal

If the fallback-model retry **also** throws (any error class, not just `tool_use_failed`):

- Log at `error` with the retry error.
- Set `aggregateContent = ''`, empty the tool-call accumulator, force `finishReason = 'stop'`.
- Fall through to the normal turn-end branch, which emits `done` cleanly.

The user keeps every product card and event already streamed this session. They do not see an error block. The conversation can continue on the next user message.

### Recoverable vs terminal — explicit rules

| Error class | Recoverable? | Path |
| --- | --- | --- |
| HTTP 400, code `tool_use_failed` | Yes | Tier 1 (fallback model, tools off) |
| HTTP 400, other codes (e.g. `invalid_request_error`) | No | Outer catch → `error: invalid_request` (the request shape is our bug) |
| HTTP 401 / 403 | No | Outer catch → `error: internal` (credentials problem, operator-fix) |
| HTTP 429 | No here; handled in `groqClient.ts` retry layer | `Retry-After`-aware retry + model fallback (see ADR-0001) |
| HTTP 5xx | No here; handled in `groqClient.ts` | Retry on transient 5xx; user-visible `error: internal` if persistent |
| Network timeout / abort | No here; handled by `signal.aborted` check | Persist as `truncated`, end stream |
| Tier-1 retry throws *any* error | No → graceful terminal | Tier 2 (drop partial, emit `done`) |
| `tool_use_failed` on `isFinalTurn` (`MAX_TURNS`) | Yes | Same Tier 1 path. The final turn is where `tool_choice: 'none'` is set; the model violating that is the exact symptom Tier 1 cures. |

The asymmetry is intentional: **anything that happens during streaming is recoverable; anything that happens before the stream opens is terminal.** Once we've started emitting events the user sees a real product result; cushioning the close is worth a fallback hop. Before any events ship, the user has nothing yet — a clean error is honest.

## Consequences

### Positive
- The two most painful failure mode classes (`tool_use_failed` mid-final-turn, `tool_use_failed` on a non-shopping conversational turn) both resolve invisibly. The user sees their products and a clean closing line, or their products and nothing — never "products + Something went wrong".
- The recovery is a localized try/catch in one function. No cross-cutting changes to the SSE protocol, the FE, or the tool registry.
- Reuses the existing `ContentSanitizer` reset path, so XML-emission from the fallback model is still defended.
- Composes cleanly with the abort-on-disconnect contract: if `signal.aborted` becomes true during Tier 1, the retry honours it and the `persistAssistant('truncated')` path runs.

### Negative
- **Latency cost on the recovery path.** Tier 1 adds one extra Groq round-trip (~400–800 ms on the 8B fallback). Tier 2 adds nothing because it's a same-process state mutation. *Mitigation:* the recovery only fires on the failure path; happy-path latency is unchanged. We accept the extra second on the rare failure.
- **Quality drop on the fallback model.** The 8B model writes a thinner closing paragraph than the 120B primary. Acceptable in the recovery context: the alternative is no closing paragraph at all.
- **The fallback model could itself emit XML or trigger `tool_use_failed`.** Tier 2's graceful terminal catches this — we do not retry a third time. The bound is "two tiers, then accept loss of closing prose."
- **No metric for "how often does recovery fire?"** Currently surfaced only via `log.warn` lines. Operators eyeball logs. *Mitigation:* Stage-2 observability work (ARCHITECTURE.md §8/§9 add) includes a `groq_recovery_total{tier=1|2}` counter.
- **Risk of papering over a model regression.** If the primary starts to emit `tool_use_failed` constantly, the recovery hides it from users but also hides it from us. *Mitigation:* the warn-log includes the model name; if the rate climbs above 5% of turns we treat that as an operational incident and either swap primary or pin the previous build.

## Alternatives considered

- **Retry the primary with tools off (skipping the fallback model swap).** Tried in early Cycle 7; the primary ignored `tool_choice: 'none'` ~30% of the time. Net failure rate too high.
- **Single-tier: retry the same turn unchanged.** Doesn't address the root cause — the model will emit the same malformed call again. Wastes a turn budget.
- **Surface the error to the FE and let the user retry.** The user has products on screen; surfacing an error after a successful tool dispatch is a UX regression. We chose hide-and-recover.
- **Add a `tool_use_failed` retry counter and exponential backoff.** Overkill for a deterministic-feeling failure mode; the binary "primary fails → fallback model" is enough at our scale.

## Mitigations summary

1. Tier-1 retry is gated on the exact `(status, error.code)` pair to avoid masking unrelated 400s.
2. Tier-2 graceful terminal is the bound — no third retry, no infinite recovery loop.
3. `log.warn` on Tier 1 entry, `log.error` on Tier 2 entry; both include `finalTurn`, `err`, and the model name.
4. Stage-2 observability adds a `groq_recovery_total` counter (see ARCHITECTURE.md §9) so an operator can spot a model regression before it becomes a user-visible quality drop.
5. When swapping `GROQ_MODEL` or `GROQ_FALLBACK_MODEL`, re-validate the directive-respecting assumption: the fallback **must** honour `tools: undefined` + `tool_choice: 'none'`. Document the result in ADR-0001's addendum log.
