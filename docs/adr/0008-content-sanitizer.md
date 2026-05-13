# 0008 — Content sanitizer for malformed LLM tool calls

## Status
Accepted — 2026-05-13. Owner: architect. Supersedes: none. Related: ADR-0001 (Groq provider, Cycle-7 addendum), ADR-0009 (tool-use-failed recovery).

## Context

The agent loop expects every tool call to arrive on Groq's OpenAI-shape `delta.tool_calls` channel — a typed array of `{ index, id, function: { name, arguments } }` chunks that we accumulate across the stream. The application server then dispatches them in parallel.

During Cycle 7 local-smoke testing, `llama-3.3-70b-versatile` was caught emitting tool calls **as text** in `delta.content` instead — Claude-style XML wrappers around a JSON arguments block. Four observed variants from a single afternoon's runs:

```
<function(save_preference){"key":"budget","value":{...}}</function>
<function=search_catalog{"query":"lamps"}</function>
<function(name="search_catalog") {"query":"lamps"}</function>
<function name="search_catalog">{"query":"lamps"}</function>
```

The bug surface is severe:

1. The XML leaks to the FE as text — the user sees raw `<function...</function>` markup mid-reply.
2. The backend never dispatches the tool, so the conversation hangs (the LLM "thinks" it called a tool and is waiting for results that never come).
3. The next turn's context window contains the XML in the assistant message; the model re-emits it, looping.

The primary mitigation (model swap to `openai/gpt-oss-120b`, see ADR-0001 Cycle-7 addendum) eliminates the bug source — `openai/gpt-oss-*` and `meta-llama/llama-4-*` train against native OpenAI tool-calling and do not regress. But: free-tier model availability is volatile, the fallback model (`llama-3.1-8b-instant`) has not been audited for the same behaviour, and a future model swap (forced by deprecation or quality) might re-introduce the pathology. We need a structural defense.

The defense is non-trivial because **`delta.content` chunks are not aligned to XML tag boundaries.** The open `<function` may arrive in one chunk and the closing `</function>` four chunks later, with `text_delta` events interleaved. Naive regex-on-each-chunk drops the call. Naive "buffer everything and parse at end" defeats streaming — the user sees nothing until the turn finishes.

## Decision

A stateful `ContentSanitizer` class (`backend/src/services/contentSanitizer.ts`) consumes each `delta.content` chunk and returns:

- `safeText: string` — content that is provably *not* the prefix of an open `<function` tag, ready to forward as `text_delta`.
- `foundCalls: RecoveredCall[]` — fully-closed `<function...</function>` segments, parsed into `{ name, argsJson }`.
- `droppedReasons: string[]` — segments that closed but failed to parse (unbalanced JSON, no name, etc.). Logged once each; the user sees a clean recovery, not the broken XML.

End-of-stream calls `flush()` to drain trailing safe text and surface any unclosed `<function` open tag as a dropped reason.

### The prefix-buffer rule

The core invariant: a chunk is safe to emit as `text_delta` only when **no suffix of the buffer is a proper prefix of `<function`**. The drain loop computes the largest `k` such that `buffer.endsWith('<function'.slice(0, k))` and holds those last `k` characters back for the next feed. So:

- Buffer `"hello world"` → emit all (no prefix overlap).
- Buffer `"hello <"` → emit `"hello "`, hold `"<"`.
- Buffer `"hello <fu"` → emit `"hello "`, hold `"<fu"`.
- Buffer `"hello <x"` → emit all (`<x` is not a prefix of `<function`).

This costs at most 9 characters of latency per chunk, which is invisible in practice.

### Integration in `services/agent.ts`

```ts
let sanitizer = new ContentSanitizer();
// per chunk:
const { safeText, foundCalls, droppedReasons } = sanitizer.feed(delta.content);
if (safeText) await emit({ type: 'text_delta', text: safeText });
for (const call of foundCalls) {
  // Synthesize an OpenAI-shape tool_call entry into the accumulator,
  // using a slot index above any natural Groq-issued index (1_000_000+).
  toolCallAccumulator.set(xmlRecoveredSlotBase++, {
    id: `xml_recovered_${slot}`, name: call.name, argsText: call.argsJson,
  });
  finishReason = 'tool_calls'; // treat as if Groq itself terminated on tool_calls
}
// At end of stream:
const tail = sanitizer.flush();
if (tail.safeText) await emit({ type: 'text_delta', text: tail.safeText });
```

The recovered call enters the normal dispatcher path. The LLM sees the same tool result it would have seen if the protocol had been respected. The user never sees the XML.

### Parser tolerance

`parseFunctionSegment` accepts all four observed variants and any near-miss formatting. Name extraction tries quoted-attribute, parenthesized, equals-prefixed, and bare-identifier forms in that order. JSON args use a brace-balanced scanner that handles nested objects and escaped strings. A `JSON.parse` sanity check rejects garbage — better to drop and log than to dispatch a tool call with broken args.

## Consequences

### Positive
- Cycle 7 launched on Groq within the same day; the primary fix (model swap) and the defense (sanitizer) are independent.
- The XML never reaches the FE, so the visible regression class is closed.
- The sanitizer is provider-agnostic: a future Anthropic or OpenAI fallback can reuse it unchanged. The pattern works for any stream of `(text, possibly-malformed-call)` events.
- Tests in `contentSanitizer.test.ts` lock the four observed variants and the chunk-boundary edge cases (open in chunk N, close in chunk N+M).

### Negative
- **Performance.** Every `delta.content` chunk goes through a string scan plus a `safeTailBoundary` check. The cost is O(content length) per chunk; in practice <50 µs for any realistic chunk. Negligible against Groq's wire latency.
- **Hold-back latency.** Up to 9 characters can be held back per chunk while we wait to disambiguate a `<f` from a `<function`. Imperceptible to the user; perceptible to a token-level streaming benchmark.
- **False positives.** Legitimate text containing `<function` (e.g. a code snippet about JavaScript functions) would be parsed as a call and dropped. *Mitigation:* the parser requires a balanced JSON object inside the segment to succeed; a prose `<function` would fail parse and fall through to `droppedReasons`. The text *between* the open and a future close would still be hidden — accepted trade because no realistic shopping-conversation surface emits the substring `<function`.
- **Migration risk.** Moving to a different provider whose tool-call protocol is also text-channel-based (e.g. an Anthropic XML-tool-use streaming endpoint that we adopt natively) would require a parser variant. *Mitigation:* the `RecoveredCall` interface is provider-agnostic; a `ClaudeNativeSanitizer` would implement the same shape and `agent.ts` would not need to change.

## Alternatives considered

- **Drop all `<function...</function>` content silently with regex on the final aggregated string.** Defeats streaming — user sees nothing until the turn finishes.
- **Refuse the chunk and reset the turn on first XML detection.** Costs a full retry and the user sees the round-trip; sanitizer recovers without retry.
- **Force `tool_choice: 'none'` always and re-parse text channel.** Throws away the protocol that does work most of the time.
- **Server-side prompt engineering to discourage XML emissions.** Tried in pilot; the model still emits XML under load. Unreliable.

## Migration guide — moving to a different model

When swapping `GROQ_MODEL`:

1. Run the existing `contentSanitizer.test.ts` suite. It should still pass — the sanitizer is model-agnostic.
2. Add a manual smoke run that asks the agent for at least three searches and three saves; visually confirm no `<function` text appears in the response.
3. If the new model uses native `tool_calls` cleanly (e.g. `openai/gpt-oss-*`), the sanitizer is a no-op on its output but stays in place as belt-and-braces.
4. If the new model uses a different malformed pattern (e.g. backtick-fenced JSON), extend `parseFunctionSegment` with a new variant **and** extend `OPEN_TAG` detection. Do not remove existing variants — fallback model paths might still hit them.
5. Update ADR-0001's addendum log with the swap and any new failure modes observed.

## Mitigations summary

1. Sanitizer is the structural defense; model selection is the primary fix. Both stay in place; neither is removed when the other works.
2. Every dropped segment is logged at `warn` with the pattern tag `xml-function-call` so dashboards can alert on a model regression.
3. `contentSanitizer.test.ts` is the regression net; any new observed variant becomes a test case before the parser changes.
4. The synthetic tool-call slot index (`1_000_000+`) is documented in `agent.ts` so recovered calls cannot collide with Groq-issued indices.
