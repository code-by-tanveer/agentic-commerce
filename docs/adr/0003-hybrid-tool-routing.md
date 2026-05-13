# 0003 — Hybrid tool routing: LLM → our tools → Catalog MCP

## Status
Accepted — 2026-05-12. Owner: architect. Supersedes: none.

## Context

Groq Cloud (and most modern LLM providers) supports two ways for an LLM to call external functions:

1. **Native tools.** The LLM gets a `tools[]` array; the *application server* runs each call; results are fed back into the next turn. The LLM never speaks to the external service directly. This is the OpenAI tool-calling pattern.
2. **Remote MCP.** The LLM gets a list of MCP server URLs; the provider's runtime speaks JSON-RPC directly to those servers; results come back as tool-like messages inside the same completion. Groq has this in beta; Anthropic has a closely related "MCP Connector" feature. The application server is bypassed for those calls.

The Shopify Catalog MCP is a public MCP server. Pointing Groq's Remote MCP at it would, in principle, let the LLM search the catalog directly — one fewer hop, less code on our side.

We are choosing not to do that. The reasoning is product, not technical.

The catalog MCP returns raw product data with variant shapes that vary across merchants, no merchant trust signals, no reasoning chips, no preference awareness, and no dedup. The "moat" of this product (see `PRODUCT.md`, the seven UX moves) is precisely the **enrichment** that happens between the raw catalog response and what the user sees:

- **Reasoning chips** ("matches your size 8", "ships from EU", "70% off MSRP") require joining the catalog response against our preferences store and computing comparisons. The LLM cannot do that with a Remote MCP because the LLM has no access to the preferences store as a queryable database — only as text in the system prompt, which doesn't scale.
- **Merchant transparency cards** require normalizing seller fields that the raw MCP returns inconsistently. We already have `normalize.ts` doing this work; bypassing it via Remote MCP throws that work away.
- **Outfit recommendation** is a multi-call workflow (anchor product → category derivation → 2–3 parallel searches → composition). Expressing this as a tool the LLM composes from primitives is possible but loses the chance to apply our own ranking logic across the calls. Expressing it as a single application-owned tool (`recommend_outfit`) is cleaner and faster.
- **Caching** is per-application, not per-LLM-provider. If Groq's runtime calls the MCP directly, we cannot insert our 15-minute LRU cache between them. Free-tier exhaustion gets worse, the catalog gets more load, and we lose latency wins on repeated queries.
- **Rate limiting and abuse mitigation** live on our backend. If the LLM speaks to the MCP directly, an abusive prompt can fan out across catalog calls before we can throttle.
- **The Catalog MCP is public.** Anyone can wire it up. If our agent is just "Groq + Catalog MCP Remote", we have no defensible product surface; we are a thin chat wrapper.

The hybrid model — LLM → *our* tool registry → our enriched implementations — is what lets the product be more than a Shopify-search-with-a-chat-skin. It is also what lets us add tools that don't exist in the Catalog MCP (`compare_products`, `recommend_outfit`, `extract_style_from_image`, `save_preference`).

## Decision

The LLM only ever sees **our** tool registry. It calls `search_catalog`, not Shopify's `search_catalog`. Under the hood:

```
LLM (Groq)
  │  tool_call: search_catalog({query, filters})
  ▼
toolRegistry.dispatch("search_catalog", args, ctx)
  │
  ▼
tools/searchCatalog.execute(args, ctx)
  │  reads ctx.preferences
  │  consults ctx.cache for (query, filters) → hit returns cached result
  │  miss → calls services/catalog.searchCatalog (existing)
  │           which calls services/mcpClient.callTool (existing)
  │             which speaks JSON-RPC to https://catalog.shopify.com/api/ucp/mcp
  │  normalizes via services/normalize
  │  attaches reasoningChips from services/reasoning(product, preferences)
  │  attaches merchantInfo (denormalized from MCP response)
  ▼
returns NormalizedProduct[] + emits 'products' event to the SSE stream
```

**Future hook (kept open, not built).** Groq's Remote MCP path stays available for *ancillary* MCP servers where enrichment is not the point — e.g. Exa for general web search, Firecrawl for page scraping. Those would expose `web_search` and `read_page` tools to the LLM through Groq's runtime, in parallel with our application-side tools. The tool registry abstraction (`Tool<TArgs,TResult>` interface) is agnostic to where execution happens; a future `RemoteMcpTool` variant would declare its provenance and the dispatcher would skip local execution. The decision to keep the hook open costs nothing today.

## Consequences

### Positive
- Every product card the user sees is enriched, dedup'd, and reasoning-chip'd before it ships. The differentiation surface is structurally present.
- Caching, rate limiting, and abuse mitigation all sit on the path between the LLM and the catalog. We retain full control over cost and behaviour.
- New tools are composable in TypeScript. `recommend_outfit` is a function that calls `search_catalog` 2–3 times in parallel and ranks. Writing that as an LLM-composed chain of primitives is slower and less reliable.
- The MCP can change shape (it has, it will) and the LLM doesn't notice — `normalize.ts` absorbs the variance.
- The product's value proposition is implementable. Without this decision, the moat moves listed in `PRODUCT.md` are not achievable.

### Negative
- **More code we own.** We are not delegating to Groq's MCP runtime; we are writing the dispatcher, the caching, the normalization, the enrichment. *Mitigation:* most of this already exists (`mcpClient.ts`, `normalize.ts`, `catalog.ts`). The new work is the registry and per-tool wrappers, ~50–150 lines each.
- **The LLM cannot exploit MCP server-side enhancements automatically.** If Shopify adds a feature to `search_catalog` on the MCP side, we have to expose it through our tool's JSON schema before the LLM can use it. *Mitigation:* the tool's parameters schema is a single file, easy to update. The trade-off is intentional: the LLM should not be calling experimental MCP parameters without us knowing.
- **Higher per-turn latency in the absolute best case.** If our tool were a literal pass-through with no enrichment, Remote MCP would shave ~50 ms by skipping our hop. With enrichment, our hop costs are real but the user gets a better card, so the latency is not "wasted". *Mitigation:* per-tool latency budget logged via Pino; if any tool exceeds 1500 ms p95 we move it to a streaming sub-result. (Phase A tools are well under this.)
- **Doesn't share Groq's "the LLM made the call itself" guarantees** — e.g. some compliance regimes prefer the LLM provider to mediate external calls because it gives the provider an audit log. We log everything ourselves. *Mitigation:* `usage_log` plus Pino structured logs cover this, plus we control the data so we can produce the audit ourselves on demand.
- **Engineers may be tempted to add tools that are thin wrappers over a single MCP call with no enrichment.** That defeats the point. *Mitigation:* PR review heuristic: every new tool must answer "what does this tool do that the raw MCP call doesn't?" If the answer is "nothing", do not add the tool — let the LLM call the existing primitive with different args. The bar is enrichment, composition, or both.

## Mitigations summary

1. Reuse existing `mcpClient.ts`, `normalize.ts`, `catalog.ts` from the scaffold. The new code is the registry plus thin tool wrappers.
2. Tool review heuristic ("what does this add over a raw MCP call?") codified in the engineer agent brief.
3. Remote MCP hook left intact — the tool interface admits remote variants without rework. Revisit when we want to add web search or page scraping ancillary tools.
4. Per-tool p95 latency dashboards from Pino logs (Cycle 6).

## Addendum — 2026-05-13: Shopify Catalog MCP tool inventory

Audit of `tools/list` against `https://catalog.shopify.com/api/ucp/mcp` (UCP 2026-04-08). Shopify advertises **three** tools:

| Tool | Capability | Shape | Our usage |
| --- | --- | --- | --- |
| `search_catalog` | `dev.ucp.shopping.catalog.search` | `{catalog:{query, filters, pagination:{cursor?, limit}}}` → `structuredContent.products[]` | `searchCatalog` (✓) |
| `get_product` | `dev.ucp.shopping.catalog.lookup` | `{catalog:{id}}` → `structuredContent.product` | `getProductDetails`, `recommendOutfit` anchor (✓) |
| `lookup_catalog` | `dev.ucp.shopping.catalog.lookup` | `{catalog:{ids[≤10]}}` → `structuredContent.products[]` + `messages[]` for not-found | `compareProducts` (✓, switched 2026-05-13 from N×`get_product`) |

Verified shape quirks:

- Product IDs MUST be in `gid://shopify/p/{id}` form. Bare IDs error with `{code:'not_found'}`. Search results already use this form, so our extractor passes them through verbatim.
- `lookup_catalog` returns partial success on bad IDs — `ucp.status:'success'`, missing IDs appear in `structuredContent.messages[{type:'info', code:'not_found'}]`. Our `compare_products` logs these via `ctx.log.warn` and still ships whatever resolved.
- `search_catalog` does NOT currently surface a `next_cursor` / pagination cursor in responses, despite the input schema accepting one. We do not propagate cursors to the LLM/FE today. Track for re-check if the spec moves past `2026-04-08`.
- `filters.ships_to` errors with `-32603` on any value — we belt-and-braces filter in JS (see `catalog.ts` head comment).

Tools we are NOT integrating (deliberate-no list):

- **`recommend_products` / `complementary_products`** — *does not exist server-side.* Our `recommend_outfit` fan-out is the only path; documented inline in `recommendOutfit.ts` so the question doesn't get re-asked.
- **Server-side cart / checkout tools** — the catalog MCP doesn't expose them; checkout still flows through per-variant `checkoutUrl` strings on the normalized product. Out of scope for this app.

If a future `tools/list` adds a `recommend_products` (or similar composition tool), revisit ADR-0003 — but only if it accepts our preferences-vector input. Without that, our composition layer is still the differentiation surface and the new server tool is a candidate primitive, not a replacement.

## Addendum — 2026-05-13: UCP 2026-04-08 wire-shape audit

Spec-conformance audit of `mcpClient.ts` against the [UCP catalog/mcp binding](https://ucp.dev/2026-04-08/specification/catalog/mcp/) and live Shopify deployment. Three material findings, all fixed in `mcpClient.ts` / `agent.ts`:

1. **`search_catalog.limit` was being silently ignored.** Spec puts `limit` inside `catalog.pagination.limit`; we were sending it at `catalog.limit`. Shopify accepts both shapes without error but only honours the nested one — top-level `limit` falls back to the default page size of 10. Empirically: `catalog.limit=3` → 10 products; `catalog.pagination.limit=3` → 3. Every `searchCatalog(query, 8)` call was over-fetching by ~25% and the post-filter slice + LLM-side ranking masked it. `mcpClient.callTool` now rewrites `catalog.limit` / `catalog.cursor` into `catalog.pagination.{limit,cursor}` transparently for `search_catalog` — `catalog.ts` keeps its ergonomic `{limit}` surface, the wire shape is corrected centrally. Complements the tool inventory note above (`search_catalog` shape column) which already documents the spec-correct nesting.

2. **UCP-specific JSON-RPC error codes were collapsed to one retryable bucket.** UCP defines `-32001` (discovery / negotiation: bad profile URL, profile unreachable, profile malformed, version unsupported — see `error.data.code`), `-32000` (transport: auth/rate-limit/unavailable, with optional `error.data.retry_after`), `-32602` (invalid params), `-32603` (server error). Our `classifyError` mapped every `McpError` to `mcp_error` / `retryable: true`. A bad `UCP_PROFILE_URL` would burn `AGENT_MAX_TURNS=4` of retries before surfacing as a user-visible failure. `McpError` now carries `ucpCode` (from `error.data.code`) and `retryAfter`; `classifyError` distinguishes `-32001` (operator-fix, `retryable: false`) and `-32602` (client-shape bug, `retryable: false`) from the retryable transport class.

3. **`meta.ucp-agent` placement applies to every JSON-RPC method.** Spec wording is `params.arguments.meta.ucp-agent`. Probed: `params.meta` and `params._meta` both error with `-32001 invalid_profile_url`; only `params.arguments.meta` works. Even `tools/list` and `initialize` require the profile — Shopify's MCP discovery is profile-gated end-to-end. We were already correct for `tools/call` (where every call goes today); the comment in `mcpClient.callTool` now documents the rule so future `tools/list` / `resources/list` / `prompts/list` callers don't drop the meta.

Non-findings (confirmed compliant): `initialize` handshake is optional — Shopify treats every request as standalone; `Mcp-Protocol-Version` header is unused; auth is anonymous (the `tokenCache.ts` JWT path is dead code under current `.env`, harmless and ready for the day Shopify gates the endpoint); profile capability declarations are sufficient — `dev.ucp.shopping.catalog.search` + `.lookup` plus the Shopify-namespaced extension are echoed unchanged in responses.
