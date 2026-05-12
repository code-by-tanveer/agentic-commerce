# Agentic Commerce

Conversational commerce app on top of the Shopify Catalog MCP server.

A user types a natural-language product query, the backend calls the Shopify Catalog MCP (`https://catalog.shopify.com/api/ucp/mcp`), and the frontend renders inline product cards. Clicking **Buy Now** redirects to the merchant's Shopify checkout URL.

## Layout

```
backend/    Fastify + TypeScript. JSON-RPC client for Catalog MCP. Normalizes responses.
frontend/   Next.js 14 (App Router) + Tailwind + Framer Motion. Conversational Product Canvas.
```

## Getting started

```bash
npm install
cp backend/.env.example backend/.env     # fill in UCP_PROFILE_URL + optional JWT creds
cp frontend/.env.example frontend/.env   # optional — defaults to localhost:4000

# Two terminals:
npm run dev:backend     # http://localhost:4000
npm run dev:frontend    # http://localhost:3000
```

### Required configuration

| Variable | Required | Notes |
|---|---|---|
| `UCP_PROFILE_URL` | yes | Public URL where your UCP agent profile JSON is hosted. Sent on every MCP request. |
| `CATALOG_MCP_URL` | no | Defaults to `https://catalog.shopify.com/api/ucp/mcp`. |
| `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` / `SHOPIFY_TOKEN_URL` | optional | If your deployment requires JWT auth via client credentials, set all three. The backend will cache the token until ~1 min before expiry and refresh transparently. |
| `ALLOWED_ORIGINS` | no | Comma-separated list. Defaults to `http://localhost:3000`. |

## API

### `POST /api/search`
Request: `{ "query": "minimalist desk lamp" }`
Response: `{ "products": NormalizedProduct[] }`

### `GET /api/product/:id`
Response: `NormalizedProduct`

`NormalizedProduct` shape lives in `backend/src/types/product.ts` and is mirrored on the frontend in `frontend/types/product.ts`.

## Architecture

```
Browser ──▶ Next.js frontend ──▶ /api/search, /api/product/:id ──▶ Fastify backend ──▶ Shopify Catalog MCP
                                                                                              │
                                                                  variant.checkout_url ◀──────┘
Browser opens checkout_url directly (Shopify-hosted redirect checkout).
```

The frontend never talks to Shopify directly — credentials and the UCP agent profile live on the backend only.

- Backend speaks JSON-RPC 2.0 to the Catalog MCP server. Tools used: `search_catalog`, `get_product`.
- Each request injects `meta.ucp-agent.profile` from `UCP_PROFILE_URL`, as required by the UCP spec.
- Token caching layer (`tokenCache.ts`) is a no-op unless `SHOPIFY_CLIENT_ID/SECRET/TOKEN_URL` are all set.
- `normalize.ts` flattens the variable MCP response shapes (variants/media nested under different keys) into a stable `NormalizedProduct` for the frontend.

## Where to extend

- **Smarter assistant copy**: today the assistant reply is templated in `frontend/hooks/useConversation.tsx:summarize`. Drop in a Claude API call there to phrase results, ask clarifying questions, or rank.
- **Comparison view**: the spec mentions a `ComparisonTable` — easy to add as a new message type beside `products` on `Message`.
- **Persistence**: conversation state is in-memory only. Add a `localStorage` effect in `useConversation` if you want it to survive reloads.
