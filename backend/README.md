# Backend — Trove

Fastify + TypeScript service. Hosts the agent loop, the typed SSE stream, the Shopify Catalog MCP client, and the SQLite session/preference store. See `../docs/ARCHITECTURE.md` for design rationale.

## Run locally

```bash
cd /home/sam/agentic_commerce
npm install
cp backend/.env.example backend/.env   # then set GROQ_API_KEY + UCP_PROFILE_URL
npm --workspace backend run dev
```

The server listens on `PORT` (default 4000). SQLite migrations apply automatically on boot; the DB file lands at `DB_PATH` (default `backend/data/agentic.db`, gitignored).

## Hitting `/api/chat` without the frontend

Because the stream is **POST + SSE** (ADR-0002), `EventSource` and the curl `-N` you usually see in tutorials don't fit. The working one-liner:

```bash
curl -N -X POST http://localhost:4000/api/chat \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"sessionId":"demo","messages":[{"role":"user","content":"find me a minimalist desk lamp under $150"}]}'
```

You'll see frames like:

```
event: text_delta
data: {"type":"text_delta","text":"Looking for "}

event: tool_status
data: {"type":"tool_status","toolCallId":"call_1","name":"search_catalog","args":{"query":"minimalist desk lamp"},"status":"running"}

event: products
data: {"type":"products","toolCallId":"call_1","query":"...","products":[...]}

event: done
data: {"type":"done","turnsUsed":2}
```

`event: ping` frames arrive every 15 s and should be ignored.

## Other endpoints

- `GET /health` — liveness; returns `{ ok: true }`.
- `GET /api/session/:id` — returns the session row if it exists.
- `POST /api/session/:id/messages` — frontend checkpoint after a stream completes; persists the finalized assistant message.

## Env vars

See `.env.example`. The only required ones for a working dev boot are `GROQ_API_KEY` and `UCP_PROFILE_URL`; everything else has a sensible default.
