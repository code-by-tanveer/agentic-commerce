# Trove

A chat-native shopping agent that helps you *decide what to buy*, not just *find* it — visually, transparently, with memory. Built on the Shopify Catalog MCP.

## What it does

- **Streams an agent that thinks out loud.** Type a query and watch the tool-use status, then the streamed text and product grid arrive inline as a single assistant turn.
- **Remembers you across the session.** Mention a size, budget, palette, or shipping preference once; an inline "About you" card appears and every subsequent result carries the matching reasoning chips.
- **Lays results out like Pinterest.** Toggle between list and a masonry collage; the choice persists for the session.
- **Shortlists into Love / Maybe / Skip lanes** via drag-and-drop or keyboard. Snapshots survive a hard reload.
- **Builds outfits and bundles.** Ask "what would go with this?" on any product and get a 2–4 item bundle with a one-line rationale per item.
- **Searches from a photo.** Paste or drop an image; the agent extracts editable style attributes and fires a search within seconds.
- **Renders a shareable lookbook** at `/s/<id>` — server-rendered, OG-tagged, viewable without JavaScript.

## Stack

Next.js 14 (App Router) + Tailwind on the frontend. Fastify + TypeScript + `better-sqlite3` on the backend. Groq Cloud for LLM (text + vision) and the Shopify Catalog MCP for catalog access.

## Run locally

```bash
git clone <repo>
cd agentic_commerce
npm install

cp backend/.env.example backend/.env       # set GROQ_API_KEY + UCP_PROFILE_URL
cp frontend/.env.example frontend/.env     # defaults to BACKEND_URL=http://localhost:4000

# Two terminals:
npm run dev:backend     # http://localhost:4000
npm run dev:frontend    # http://localhost:3000
```

The backend listens on `PORT` (default `4000`); SQLite migrations run automatically on boot. The frontend proxies `/api/*` to `BACKEND_URL`. Only `GROQ_API_KEY` and `UCP_PROFILE_URL` are strictly required for a working dev boot; everything else has a sensible default.

For a full manual walkthrough — typing a query, dropping an image, sharing a session — see [`docs/walkthroughs/launch.md`](docs/walkthroughs/launch.md).

## Architecture

The frontend is a thin streaming UI: it POSTs to `/api/chat`, receives a typed SSE stream, and renders each event as a structured sub-block in the conversation. The backend runs the agent loop (Groq + Catalog MCP) inside the Fastify process, persists sessions and preferences to SQLite, and serves `/api/session/*` and `/api/upload`. The agent loop is bounded (≤4 turns/turn) and deterministic in its event protocol. Full design and rationale in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Deployment

Frontend deploys to Vercel; backend deploys to a single Fly.io machine with a persistent volume for the SQLite file. Sticky-machine routing keeps an in-flight SSE on the host that started it. Step-by-step instructions, env-var checklist, and a post-deploy smoke procedure live in [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Where to look

| Need                                  | File                              |
|---------------------------------------|-----------------------------------|
| Product vision, personas, anti-goals  | `docs/PRODUCT.md`                 |
| System design, schema, streaming spec | `docs/ARCHITECTURE.md`            |
| Visual language, tokens, principles   | `docs/DESIGN.md`                  |
| Decision history                      | `docs/adr/`                       |
| Per-cycle build log                   | `docs/CYCLES/`                    |
| Deploy guide                          | `docs/DEPLOY.md`                  |
| Manual UI walkthrough                 | `docs/walkthroughs/launch.md`     |
| Backend-specific dev notes            | `backend/README.md`               |
