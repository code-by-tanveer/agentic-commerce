# 0001 — LLM provider: Groq Cloud

## Status
Accepted — 2026-05-12. Owner: architect. Supersedes: none.

## Context

Agentic Commerce is built around an interactive agent loop: the LLM sees the user's message plus a tool registry, decides which tools to call, the backend dispatches them in parallel, the results stream back, and the LLM continues until it has an answer. The product's "feel" — fast, reactive, conversational — is bottlenecked by **time-to-first-token** and **tokens-per-second** more than by raw model quality. The user perceives latency as the gap between sending a message and the first product card materializing on screen.

We evaluated four serious options:

**OpenAI (`gpt-4o-mini`, `gpt-4o`).** Best tool-use ergonomics. Mature SDK. Latency is fine (~30–50 tok/s) but not exceptional. Cost on `gpt-4o-mini` is workable; on `gpt-4o` it gets expensive quickly. There is no free tier suitable for a side-project ramp.

**Anthropic (`claude-3.5-sonnet`).** Best raw reasoning. Tool use is excellent. Streaming works well. The cost per million tokens is the highest of the four, and tokens-per-second sits around 50–80. No free tier. We use Claude for *building* the product (this very orchestrator); we are not obligated to ship on it.

**Cerebras Inference (`llama-3.3-70b`, `llama-3.1-8b`).** Throughput is monstrous (~1800 tok/s on 8B, ~450 tok/s on 70B). Free tier exists but is tighter than Groq's, the SDK is newer, and Remote MCP is not on the roadmap. Tool-calling support is present but less battle-tested across the ecosystem.

**Groq Cloud (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `llama-4-scout-17b-16e-instruct` vision).** Throughput is excellent (~315 tok/s on 70B). Free tier: 14.4K requests/day on 70B, 30 RPM, separately metered for vision. Native parallel tool calls. Native Remote MCP in beta — a future-hook for letting Groq call ancillary MCP servers directly (web search, etc.) without us proxying. OpenAI-shape SDK so swapping providers later is a `groqClient.ts` change, nothing structural.

The decision is dominated by one product fact: **the perceived quality of the agent loop is "did the products appear quickly?", not "did the model write deeply".** Groq's ~315 tok/s on a frontier-class 70B open model is the single most impactful lever. The free tier covers the entire build-out and an early-user phase. The OpenAI-shape SDK means the choice is not a one-way door — we can move to OpenAI or Anthropic in a single file if the product's character shifts toward reasoning depth over speed.

## Decision

Use **Groq Cloud** as the primary LLM provider.

- Primary text model: `llama-3.3-70b-versatile`.
- Fast fallback (used on 429 or transient errors mid-turn): `llama-3.1-8b-instant`. The agent prompt is identical; the 8B model handles tool-routing for simple follow-ups acceptably and we accept the quality drop for the rare retry.
- Vision model: `meta-llama/llama-4-scout-17b-16e-instruct` for the image → style-attributes flow.
- Wrap behind `services/groqClient.ts` so the rest of the codebase imports `streamChatCompletion` and `chatCompletion`, not the SDK directly.
- Configure via env: `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_FALLBACK_MODEL`, `GROQ_VISION_MODEL`. Never expose to the frontend.

**The free-tier math.**
- 14.4K req/day / 24h ≈ 600 req/h. At ~3 turns per user message (initial + tool result + finish), that is ~200 user messages per hour at full saturation. A demo or pilot fits inside this comfortably.
- 30 RPM cap is the more likely first wall during a live demo with multiple users. Mitigation: in-process cache on `search_catalog` results (15 min TTL) absorbs duplicate queries; the `llama-3.1-8b-instant` fallback bypasses the 70B-specific quota in a pinch.

**Path to paid.** Groq's developer tier is metered pay-as-you-go on the same models. We move when we exceed the free quota on a normal day for a week running — no architectural change, just a billing change. ADR-0002 reuses the same client.

## Consequences

### Positive
- Time-to-first-token is short enough that "search a Shopify catalog with an LLM in the loop" feels instant — the differentiator against Perplexity Shopping's text-heavy UX.
- The free tier removes a procurement step from Cycle 0. We do not have to estimate spend before having a working product.
- Parallel tool calls let `compareProducts` and `recommendOutfit` fan out without manual orchestration in the agent loop.
- The OpenAI-shape SDK means our `groqClient.ts` is mechanically translatable to `openaiClient.ts` or `anthropicClient.ts` should we need to swap providers. The structural commitment is to OpenAI-shape tool-calling, not to Groq specifically.
- Groq's Remote MCP beta is a free option, not a dependency. If we later want to expose an Exa or Firecrawl MCP to the agent, we can attach it via Groq without our backend mediating — ADR-0003 calls out exactly when this would and would not be appropriate.

### Negative
- **Quality ceiling.** `llama-3.3-70b` is excellent for tool-routing and short conversational summaries; it is meaningfully behind `gpt-4o` and `claude-3.5-sonnet` on multi-step reasoning, instruction nuance, and prose voice. The product is designed around generative UI, not generative prose, so this hurts less than it would in a different shape — but it does hurt. *Mitigation:* keep the system prompt tight and rubric-driven; let UI components carry the polish that the model's prose would otherwise carry; A/B against `gpt-4o-mini` in Cycle 6 hardening if we observe quality complaints.
- **Free-tier volatility.** Groq has changed limits before. A demo that worked yesterday could 429 today. *Mitigation:* the model-fallback path (70B → 8B); the cache absorbs repeats; a Cycle 6 task to harden the 429-handling user-facing copy ("traffic surge, retry in a few seconds — your conversation is saved").
- **Single-vendor lock-in for the vision flow.** Llama 4 Scout vision quality on *fashion* attribute extraction is unproven by us. If it underwhelms in Cycle 4, the fallback path is Groq's own `llama-3.2-90b-vision` — still inside the same provider. *Mitigation:* ship Cycle 4 with both vision models behind an env flag; choose at runtime based on a small offline eval set.
- **Token usage opacity at scale.** Groq does not surface as rich per-request token accounting as OpenAI. *Mitigation:* `groqClient.ts` records `usage` from each response into a `usage_log` JSONL file in Stage 1, into a Postgres table at Stage 3.
- **Geography.** Groq's regions are US-only at time of decision. EU users see ~80–120 ms additional latency. *Mitigation:* tokens-per-second is high enough that the total response time still wins on perception. Revisit if we localize.

## Mitigations summary

1. Model fallback rule baked into `groqClient.ts`: on 429 for the primary, retry the same turn against the fallback within the same agent run.
2. Per-query 15-minute LRU cache at the `search_catalog` tool level absorbs duplicates that would otherwise count against Groq quota.
3. Daily-quota approaching banner in the FE: when usage exceeds 80% of estimated daily budget (tracked in `usage_log`), show a non-blocking "we're seeing high traffic — replies may be slower" pill in the header.
4. `groqClient.ts` is the only file that imports `groq-sdk`. The rest of the codebase imports its shape. Swap provider in one file.
