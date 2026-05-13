# Deploy guide

Frontend → Vercel. Backend → Fly.io. Rationale in `ARCHITECTURE.md` §10.

This guide assumes a fresh clone, an empty Vercel account, and an empty Fly.io account. It walks both halves in the order that lets you smoke-test end-to-end.

---

## 1. Frontend on Vercel

### Connect the repo

1. In the Vercel dashboard, **Add New → Project** and import the GitHub repo.
2. On the **Configure Project** screen, set:
   - **Framework preset:** Next.js (auto-detected).
   - **Root directory:** `frontend/`.
   - **Build command:** *leave default* (`next build`).
   - **Output directory:** *leave default* (`.next`).
   - **Install command:** *leave default* (`npm install`). Vercel runs it from the project root, which honours the npm workspaces config — both `backend/` and `frontend/` resolve.
3. Click **Deploy**. The first deploy will fail or render a blank UI because `BACKEND_URL` isn't set yet — that's expected.

### Env vars

In **Project Settings → Environment Variables**, add for the `Production` (and optionally `Preview`) scope:

| Name          | Value                              | Notes                                                                |
|---------------|------------------------------------|----------------------------------------------------------------------|
| `BACKEND_URL` | `https://<your-app>.fly.dev`       | Required. Used by `next.config.mjs` rewrites and the `/s/[id]` SSR fetch. No trailing slash. |

After setting it, **Redeploy** from the Deployments tab to pick up the new env.

### Custom domain

In **Project Settings → Domains**, add your apex/subdomain and follow Vercel's DNS instructions (either nameserver delegation or a single `CNAME` to `cname.vercel-dns.com`). Once the cert is issued, copy the final HTTPS origin — you'll need it for `ALLOWED_ORIGINS` on the backend.

---

## 2. Backend on Fly.io

You need the [`flyctl`](https://fly.io/docs/flyctl/install/) CLI installed and authenticated (`fly auth login`).

### First-time launch

From the repo root:

```bash
cd backend
fly launch --no-deploy
```

Answer the prompts:
- **App name:** anything unique (e.g. `agentic-commerce-be`).
- **Region:** pick one close to your users *and* to Groq's nearest edge (e.g. `iad`, `lhr`, `fra`).
- **Postgres / Redis / Tigris:** decline all — we run on SQLite over a Fly volume.
- **Deploy now?** No (we still need a volume and secrets).

`fly launch` writes `backend/fly.toml` and a `Dockerfile` if one doesn't exist. Inspect both before deploying.

### Persistent volume for SQLite

```bash
fly volumes create agentic_data --size 3 --region <same-region-as-app>
```

Then in `backend/fly.toml` add a mount stanza (Fly may have prefilled most of this):

```toml
[[mounts]]
  source = "agentic_data"
  destination = "/data"
```

The destination `/data` matches the `DB_PATH` and `UPLOAD_DIR` env values below. Migrations run automatically on boot; the SQLite file lands at `/data/agentic.db` and uploads at `/data/uploads`.

**Sizing rationale.** 3 GB is the floor per the architect-ops Round-1 audit: the SQLite file at the 90-day TTL ceiling plus 24 hours of peak uploads (8 MB × 5 req/min/IP × N IPs) fits well under 3 GB but blows past 1 GB on a bad-actor day. Cheap on Fly; would rather over-provision once than fight a runtime `ENOSPC` while the emergency-purge path is firing.

### Backups & disaster recovery

Stage 1 leans on Fly's built-in volume snapshots. polish-round-2 T2.18 makes the posture explicit:

- **Automatic.** Fly takes a daily snapshot of every volume and retains the last 5 days. No action required for Stage-1 DR — a region-level mistake is recoverable from yesterday's snapshot.
- **Before any risky migration.** Take a manual snapshot first and record the id so you can roll forward or back deterministically:
  ```bash
  fly volumes list                                   # find agentic_data's id
  fly volumes snapshots create <volume-id>           # prints the snapshot id
  ```
- **Restore.** Create a new volume from the snapshot id, then swap the app's mount:
  ```bash
  fly volumes create agentic_data_restore \
    --snapshot-id <snapshot-id> --size 3 --region <region>
  ```
  Update `fly.toml`'s `[[mounts]] source` to the restored volume name and `fly deploy`.
- **Stage-2 trigger.** If RPO/RTO requirements tighten (sub-day recovery, off-region durability), add `litestream` replication of `/data/agentic.db` to S3. Cheap enough at Stage 2; overkill today.

### Secrets

Set the sensitive values via `fly secrets` so they never appear in `fly.toml`:

```bash
fly secrets set \
  GROQ_API_KEY=gsk_... \
  IP_HASH_SALT=$(openssl rand -hex 32) \
  UPLOAD_SIGNING_SECRET=$(openssl rand -hex 32) \
  SHOPIFY_CLIENT_SECRET=...     # only if your MCP deployment requires JWT auth
```

`IP_HASH_SALT` and `UPLOAD_SIGNING_SECRET` are independent (see ADR / ARCHITECTURE §9). Do not reuse the same value across both.

**Secret rotation procedure.**

- **`UPLOAD_SIGNING_SECRET`** can be rotated freely. The only side effect: every signed-image URL minted before the rotation will fail verification (24h TTL on every URL anyway, so impact is bounded to the next 24h of pasted-image sessions, which will see a single "image expired, paste again" error). Rotate with: `fly secrets set UPLOAD_SIGNING_SECRET=$(openssl rand -hex 32) && fly deploy`.
- **`IP_HASH_SALT`** is a **one-way break**. Rotating it severs the correspondence between historical `sessions.ip_hash` values and post-rotation log lines — abuse forensics across the rotation boundary becomes impossible. Plan rotation only at user-data-purge boundaries (e.g. when a Stage-2 ADR re-opens the 90-day TTL). A two-salt window with `salt_epoch INTEGER` on `sessions` is the long-term answer; not required at Stage 1.
- **`GROQ_API_KEY`** rotates instantly via `fly secrets set` — no DB-side coupling, no restart-loop concern beyond a single graceful-restart cycle.

### Non-secret env

The rest belong in `fly.toml` under `[env]`:

```toml
[env]
  NODE_ENV = "production"
  UCP_PROFILE_URL = "https://<your-domain>/.well-known/ucp-profile.json"
  DB_PATH = "/data/agentic.db"
  UPLOAD_DIR = "/data/uploads"
  ALLOWED_ORIGINS = "https://<your-frontend-domain>"
  PORT = "8080"
```

Use port `8080` (or whatever Fly's `[[services]] internal_port` is set to) to match Fly's default. The backend reads `PORT` from env.

### Healthcheck

Fly's default `[[services.http_checks]]` should hit `/health`. If `fly launch` didn't write one, add:

```toml
[[services.http_checks]]
  interval = "15s"
  timeout = "2s"
  method = "get"
  path = "/health"
```

The backend exposes `GET /health` returning `{ ok: true }`. This is **liveness-only** — it confirms the Fastify process is up, nothing more. A richer `/ready` probe (Groq + MCP reachability with 1s timeouts, 10s cache) is a Stage-2 add.

### Runbook — Groq daily quota exhausted

Symptoms: every `POST /api/chat` returns the sanitized "Something went wrong on our side. Try again?" error block; backend logs show repeated `429 Too Many Requests` from Groq with a `retry-after` pointing to the next UTC reset (typically 09:10 UTC). The healthcheck stays green because `/health` doesn't touch Groq — only chat traffic fails.

Operator playbook (in order):
1. **Confirm it's quota, not a key issue.** `fly logs | grep "groq"` — look for `429` with `retry-after`. If it's `401`, rotate `GROQ_API_KEY` (`fly secrets set GROQ_API_KEY=…`) instead.
2. **Status page banner.** Set `STATUS_BANNER="Search is briefly rate-limited — back shortly."` via `fly secrets set` so the frontend renders it inline above the InputBar; clear it once traffic recovers.
3. **Bridge with the 8B fallback.** `fly secrets set GROQ_MODEL=llama-3.1-8b-instant` to swap the primary off the 70B quota; reverse once the 70B quota resets. Quality drops noticeably for `style` intents; acceptable for a quota window, not a steady state.
4. **If we keep hitting this in a single week**, file a Groq paid-tier upgrade ticket — Stage-2 trigger per `ARCHITECTURE.md` §7. Don't normalize the fallback model as the primary; the 8B path is a relief valve, not a destination.

### Auto-scaling — keep it single-machine for now

Stage 1 runs on **one** Fly machine. `ADR-0004` (session store on SQLite) treats the local DB as the source of truth for active sessions; horizontal scaling without sticky routing would split sessions across hosts.

In `fly.toml` keep `auto_stop_machines = false` and `min_machines_running = 1`. When you outgrow this (see ARCHITECTURE.md §8 Stage 2 triggers), enable Fly's `fly-replay` sticky-routing first, *then* scale out.

### Deploy

```bash
fly deploy
```

`fly deploy` builds the Docker image, runs migrations on boot, and starts the Fastify process on the volume-backed machine. Tail logs with `fly logs`. Once the healthcheck flips green, the backend is reachable at `https://<your-app>.fly.dev`.

Verify quickly:

```bash
curl https://<your-app>.fly.dev/health
# → {"ok":true,...}
```

---

## 3. Env-var checklist

Compact reference. Required-in-prod means the backend will refuse to boot without it.

| Variable                 | Where      | Required (prod)            | Purpose                                                  |
|--------------------------|------------|----------------------------|----------------------------------------------------------|
| `GROQ_API_KEY`           | Fly secret | yes                        | LLM provider key. Text + vision.                         |
| `UCP_PROFILE_URL`        | Fly env    | yes                        | Public URL of your UCP agent profile JSON.               |
| `IP_HASH_SALT`           | Fly secret | yes                        | Salt for `sessions.ip_hash`.                             |
| `UPLOAD_SIGNING_SECRET`  | Fly secret | yes                        | HMAC key for signed upload URLs. Separate from above.    |
| `DB_PATH`                | Fly env    | yes                        | `/data/agentic.db` (must be on the mounted volume).      |
| `UPLOAD_DIR`             | Fly env    | yes                        | `/data/uploads` (also on the volume).                    |
| `ALLOWED_ORIGINS`        | Fly env    | yes (non-`localhost` only) | CORS allowlist. Comma-separated.                         |
| `NODE_ENV`               | Fly env    | yes (`production`)         | Triggers cookie `Secure`, CSP nonce, prod env guards.    |
| `PORT`                   | Fly env    | recommended                | Match Fly's `internal_port` (default 8080).              |
| `BACKEND_URL`            | Vercel env | yes                        | Origin the FE proxies to and SSR-fetches against.        |
| `CATALOG_MCP_URL`        | Fly env    | no                         | Override only for staging mirrors.                       |
| `SHOPIFY_CLIENT_ID/SECRET/TOKEN_URL` | Fly env/secret | no    | Set all three only if your MCP requires JWT client creds.|
| `GROQ_MODEL` / `GROQ_FALLBACK_MODEL` / `GROQ_VISION_MODEL` | Fly env | no | Override defaults if Groq rotates model IDs. |
| `UPLOAD_TTL_HOURS`       | Fly env    | no                         | Defaults to 24.                                          |
| `VISION_MAX_INPUT_TOKENS`| Fly env    | no                         | Defaults to 4096.                                        |

---

## 4. Post-deploy smoke

Five-minute walkthrough to confirm the end-to-end is alive:

1. Open `https://<your-frontend-domain>/` — the chat shell loads, no console errors.
2. Type `find me a minimalist desk lamp under $150`; confirm streamed text, a `ToolStatus` line, and a product grid render.
3. Drag any product into the **Love** lane; confirm the Shortlist count updates.
4. Click **Share** in the header; confirm the URL copies, and that `/s/<id>` opens with the hero + sections in a fresh incognito window (no JS, no cookies).
5. `fly logs` shows the request id plus a `usage_tag=text` line in `usage_log.jsonl` — vision will only appear after you exercise the image flow.
