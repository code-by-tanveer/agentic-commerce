# Project state

This file is the resume key for the multi-agent build loop. Both the in-session orchestrator and any cross-session scheduled agents read it first to know what to do next.

## Next 7 days — recommendation (Process Manager, 2026-05-13)

**Verdict: not ready to text the URL to friends.** Today the app boots, 127 backend tests are green, two Playwright specs pass, Shopify Catalog MCP returns real products, and Groq streams real tokens — all on `localhost`. There is no public origin, no Dockerfile, no Fly app, no Cloudflare Tunnel; nothing a tester can open from their phone. The recently-added QA Evidence Gate is now real (this cycle is the first to actually commit `boot.log` + `error-path.log` under `docs/CYCLES/cycle-N/qa-evidence/`), which proves the gate works for future cycles but does not by itself make us launch-ready. The `firstchat.spec.ts` Send-button completion signal is still known-unsound and is intentionally **not** being chased in Cycle 7 — process role, and it would slip the soft launch.

**Land before any external user touches the app:** (1) the seven Cycle 7 checkboxes in `LAUNCH_CHECKLIST.md` — chiefly: a Cloudflare Tunnel from WSL with verified SSE survival, lowered rate-limits for stranger traffic, a real support-contact line in the UI, a `soft-launch.log` aggregation script against `usage_log.jsonl`, and a tunnel-down runbook in `DEPLOY.md` §5; (2) a Groq daily-quota dry-run against the live tunnel before sending any links out, walking the `DEPLOY.md` §147 runbook end-to-end. The single biggest gap is item #1 — without a public URL whose SSE actually survives the tunnel, every other readiness question is moot. Stage-1 deploy on Fly.io per `ARCHITECTURE.md` §7 + `DEPLOY.md` §2 remains the documented destination; Cloudflare Tunnel is the explicit free, no-card soft-launch substrate (user preference), **not** a Stage-1 replacement.

## Resume key

| field | value |
|---|---|
| `cycle` | 7 |
| `step` | planning |
| `ready_at` | 2026-05-13T19:30:00Z |
| `last_updated` | 2026-05-13T19:30:00Z |
| `last_actor` | process-manager |
| `next_action` | Cycle 7 plan committed to `LAUNCH_CHECKLIST.md`; QA Evidence Gate executed for the first time (boot.log + error-path.log under `docs/CYCLES/cycle-7/qa-evidence/`). Next: dispatch ops engineer to set up Cloudflare Tunnel per acceptance criteria C1–C2; on return, tighten rate-limits + support footer + observability roll-up, then four reviewers, then retrospective. |
| `pacer` | manual — Cycle 7 is operator-driven (tunnel setup, real-world testing); the recurring cron should remain paused until `step: ready_for_next_cycle`. |

## Cycle history (latest first)

- **Cycle 7** — Soft-launch substrate — _open_ ◻ (opened 2026-05-13T19:30Z)
  - Plan + acceptance criteria committed to `LAUNCH_CHECKLIST.md`.
  - QA Evidence Gate executed for the first time: `boot.log` + `error-path.log` captured from real running servers (backend pid up 1h26m, frontend pid up 4h39m at capture time; bad-GROQ-key test instance spun on port 4042, sanitized SSE error frame confirmed).
  - Risk register opened at end of `LAUNCH_CHECKLIST.md` (R1–R5).
- **Cycle 6** — Hardening — _closed_ ✓ (2026-05-13T04:48Z)
  - All four reviewers PASS, zero open defects from Cycle 5.
  - QA Evidence Gate added to `LAUNCH_CHECKLIST.md` after the today-session post-mortem; documented but not executed until Cycle 7.
  - Daily WAL checkpoint + 90-day session TTL cron landed (ADR-0004 mitigation).
  - Groq daily-quota runbook landed in `DEPLOY.md`.
- **Cycle 5** — Shareable summary + mobile + a11y — _closed_ ✓
- **Cycle 4** — Photo → style — _closed_ ✓
- **Cycle 3** — Collage + shortlist + outfit bundles — _closed_ ✓
- **Cycle 2** — Preferences + reasoning + merchant transparency — _closed_ ✓ (2026-05-12T19:35Z)
- **Cycle 1** — Phase A: agentic foundation — _closed_ ✓ (2026-05-12T19:10Z)
- **Cycle 0** — Kickoff — _closed_ ✓ (2026-05-12T18:10Z)
