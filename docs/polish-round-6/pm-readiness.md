# PM Readiness Assessment — Round 6

## TL;DR

The project has cleared every code-side bar: 6 cycles + 5 polish rounds closed, all four reviewers PASS on Cycle 6, both workspaces `tsc --noEmit` clean, 73 BE tests green, zero open defects. Two acceptance items remain (Lighthouse on `/` and `/s/<id>`; `/security-review` skill against the Cycle-6 diff) — both are user-triggered by design. **Ship-ready in roughly 1 working day** once Sam runs those two audits and provisions Fly/Vercel. One DEPLOY.md correction (Fly volume `--size 1` → `--size 3`) should land before deploy; everything else is paperwork.

## Project status snapshot

- **Cycles done:** 0 (kickoff) + 1 → 6 (all `_closed_`).
- **Polish rounds done:** 1 (30+ launch-blocker fixes), 2 (ops hardening + ethics taxonomy + tests), 3 (cleanup + Skeptic re-walk), 4 (visual + 10 personas + competitive + market — review-only), 5 (Tier-1/2 review fixes from R4). R6 is this readiness pass, not a code round.
- **Tests passing:** Backend `73 passed` (Round 5 BE log). Frontend `tsc --noEmit` clean both sides (Cycle 6 + R5). No frontend test suite ran in CI — that's a known omission; it was not on the launch bar.
- **File counts (sanity):** 78 `.ts/.tsx` source files across `backend/src` + `frontend/components` + `frontend/app`; 8 BE test files.
- **git status:** clean (`afa0385 polish round 5: Tier-1+2 fixes from the 13-agent review` at HEAD).
- **Open `[~]` items (LAUNCH_CHECKLIST.md):** all sit under the "manual walkthrough with real `GROQ_API_KEY`" caveat — Cycle 1 accept #1–4, Cycle 3 ViewToggle + outfit, Cycle 4 photo→style (3 bullets), Cycle 5 share page (5 bullets), Cycle 6 Lighthouse (2 bullets), Cycle 6 `/security-review` (1 bullet). They are all gated on the same two human-driven actions: the manual UI walkthrough and Lighthouse + `/security-review`. The code paths are reviewed and committed.
- **Open `[ ]` items:** none. Every Cycle-0…6 build-task and acceptance checkbox is either `[x]` or `[~]` (human-gated).

## Residual risk register (Tier 2/3 not-yet-shipped + new)

Round-4 Tier-2/3/Strategic items reviewed against R5 + R6 delivery logs.

| Item | Tier | Status | Severity | Plan |
|---|---|---|---|---|
| T4.A `shipsTo` field | T1 | Shipped R5 BE | — | done |
| T4.B `ComparisonTable` rewrite | T1 | Shipped R5 FE-structural | — | done |
| T4.G ProductCardGroup breakout | T1 | Shipped R5 FE-structural | — | done |
| T4.J OG Instrument Serif | T1 | Shipped R5 FE-structural (CJK fallback DEFERRED) | post-launch-watch | Watch non-Latin share-link analytics; add Noto Sans CJK if traffic warrants (~1.5MB cost). |
| T4.H HEIC support | T2 | Shipped R5 BE (sharp transcode) | — | done |
| T4.I language guard | T2 | Shipped R5 BE (prompt addendum) | post-launch-watch | Validate Korean/Hindi queries during beta; tighten to translate-and-retry tool call if silent failure surfaces. |
| T4.K locale-aware currency | T2 | Shipped R5 FE-polish (client only) | post-launch-watch | SSR path still `'en-US'`; plumb Accept-Language on the server. Cycle-2-of-post-launch item per R5 log. |
| T4.L post-filter ships_to | T2 | Shipped R5 BE | — | done |
| T4.E reduced-motion (3 components) | T3 | Shipped R5 FE-polish | — | done |
| T4.D pervasive `text-[11px]` | T3 | Shipped R5 FE-polish (sweep) | — | done |
| T4.F drop `font-display` from Header | T3 | Shipped R5 FE-structural | — | done |
| T4.C heart visibility + tap target | T3 | Shipped R5 FE-polish | — | done |
| T4.M Retry ≥44px + scroll-into-view | T3 | Shipped R5 FE-polish | — | done |
| T4.N `next/image` migration | T3 | Shipped R5 FE-structural | — | done |
| T4.O gift use case (`shopping_for`) | T4 | Shipped R5 BE (key only; chip not shipped) | post-launch-watch | Optional `gift_safe` chip dropped this round. Stage-2 if gift traffic emerges from Day 1–7 beta. |
| T4.P aria-labelledby on dialogs | T4 | Shipped R5 FE-polish | — | done |
| T4.Q `mt-0.5` ErrorBlock | T4 | Shipped R5 FE-polish | — | done |
| T4.R Sparkles colour | T4 | Shipped R5 FE-polish | — | done |
| T4.S rose-500 heart → ink-900 | T4 | Shipped R5 FE-polish | — | done |
| T4.T CollageView masonry | T4 | Mis-flagged (R5 verified `columns-2`) | — | done |
| T4.U empty-lane copy | T4 | Shipped R5 FE-polish | — | done |
| T4.V Trust-footer tone | T4 | Not shipped | post-launch-watch | Persona-level cosmetic; revisit if Mara-cohort feedback in beta surfaces it. |
| T4.W `reviewCount` field | T4 | Shipped R5 BE | — | done |
| T4.X `/s/[id]` cache-no-store | T4 | Not shipped | post-launch-watch | CDN-edge defeat is a perf-of-virality cost, not a blocker. Stage-2 if share traffic justifies. |
| T4.Y auto-scroll reduced-motion | T4 | Shipped R5 FE-polish | — | done |
| T4.Z OG fallback for expired summaries | T4 | Not shipped | post-launch-watch | Generic card is acceptable for v1; revisit if expired-share complaints appear. |
| Comp-A MCP commoditized | Strategic | Landed in PRODUCT.md §9 + appendix | — | done |
| Comp-B Instant Checkout pivot | Strategic | Landed in PRODUCT.md §3, §6 | — | done |
| Comp-C Perplexity memory/photo | Strategic | Landed in PRODUCT.md §7 "Beyond Cycle 6" | — | done |
| Comp-D Daydream iOS-only | Strategic | PRODUCT.md appendix updated | — | done |
| Comp-E Phia scandal wedge | Strategic | PRODUCT.md §9 | — | done |
| Comp-F Moves #4/#5/#7 uncontested | Strategic | PRODUCT.md §7 + ADR-0006 | — | done |
| Mkt-A Daily-tier credit card Day 0 | Strategic | walkthroughs/launch.md §4 Day 0 | gating | **Sam must wire Developer-tier card before traffic.** |
| Mkt-B B2B widget | Strategic | ADR-0006 path 2 | stage-2-only | Month-4 candidate. |
| Mkt-C Affiliate pool | Strategic | ADR-0006 path 1 + PRODUCT.md Q6 | stage-2-only | Month-3 candidate. |
| Mkt-D Launch triggers | Strategic | walkthroughs/launch.md §4 | — | done |
| Mkt-E SOM honest read | Strategic | PRODUCT.md §9 | — | done |

**New risks the polish rounds surfaced but were never registered:**

- **Fly volume `--size 1` in DEPLOY.md** despite architect-ops Round-1 explicit recommendation of ≥3 GB given DB + 24h uploads + disk-full fail-safe. R5/R6 deploy doc didn't update — `docs/DEPLOY.md:62` and `:88` still show `--size 1`. **Gating** — should fix DEPLOY.md before Sam runs `fly volumes create`. One-line patch.
- **`IP_HASH_SALT` rotation procedure** is not documented in DEPLOY.md (architect-ops Round-1 LOW). Only the architectural note in ARCH §9 about upload-signing-secret separation exists. **Post-launch-watch** — rotation is destructive to forensics, not a launch-day issue, but should be in the runbook before any operator other than Sam handles deploys.
- **No `/ready` probe** (only liveness `/health`). Documented as Stage-2 in DEPLOY.md §2 healthcheck. **Post-launch-watch** — Fly will report green when Groq creds are revoked. Accept for launch.
- **FE rate-limit / quota copy** still anthropomorphic per polish-round-3 Skeptic re-walk ("Hitting traffic", "Try again?" rhetoricals across 6 sites). Skeptic rated 8/10. **Post-launch-watch** — voice-polish, not a blocker; close in a cycle-7-style polish if you want a 9.
- **`routes/chat.ts:146` outer catch** still re-emits raw `err.message` if `runAgent` throws *outside* its own try (unreachable in practice per Cycle 6 Security review). **Post-launch-watch** — LOW.
- **No FE test suite.** All FE confidence comes from `tsc --noEmit` + four reviewer eyes. Not on the launch bar but worth noting.

## Ops-side launch readiness checklist

- [x] All required env vars documented in `backend/.env.example` (GROQ_API_KEY, UCP_PROFILE_URL, IP_HASH_SALT, UPLOAD_SIGNING_SECRET, BACKEND_URL, ALLOWED_ORIGINS, NODE_ENV, DB_PATH, UPLOAD_DIR, PORT — verified).
- [x] Backend boots with all guards (prod refuses `localhost` in ALLOWED_ORIGINS, refuses missing UPLOAD_SIGNING_SECRET / BACKEND_URL — Cycle 6 boot smoke).
- [x] SIGTERM/SIGINT drain handler wired (`backend/src/index.ts:291-292`, 25 s grace, WAL checkpoint + db.close on exit — verified in polish-round-2 T2.2).
- [x] Cookie `Secure` env-gated (works in plain-HTTP dev now).
- [x] Daily `PRAGMA wal_checkpoint(TRUNCATE)` cron wired (Cycle 6 BE).
- [x] 90-day session TTL cron wired (polish-round-2 T2.5).
- [x] CGNAT-aware rate-limit keyed by `agentic_sid ?? req.ip` (polish-round-2 T2.13).
- [x] `trustProxy: 1` (immediate-hop only — polish-round-2 T2.17).
- [x] Idempotent `POST /api/session/:id/outfits` (polish-round-2 T2.16).
- [x] Backup posture documented (Fly auto-snapshot 5d + manual snapshot pre-migration — DEPLOY.md "Backups & disaster recovery").
- [x] `usage_log.jsonl` tagging symmetric (`text` vs `vision`) — polish-round-2 T2.12.
- [x] `scripts/vision-usage-rate.ts` exists and runs against synthetic data.
- [x] CSP nonce middleware in prod, `unsafe-eval` dev-only (Cycle 6 FE).
- [x] SSRF gate on vision tool via `verifyUploadUrl` (Cycle 6 Security PASS).
- [x] HEIC iOS-paste support (R5 BE, sharp transcode).
- [x] Disk-full ENOSPC handler with emergency purge + 503 (polish-round-2 T2.4).
- [x] Magic-byte sniff + signed-URL HMAC validated (Cycle 4).
- [x] `/health` doc reconciled (liveness-only; `/ready` is Stage-2).
- [x] PRODUCT.md updated with strategic findings (R5 docs round).
- [~] **Fly volume `--size 3` (not `--size 1`)** — DEPLOY.md still says 1 GB despite architect-ops ≥3 GB recommendation. **Needs one-line edit before deploy.**
- [~] **`IP_HASH_SALT` rotation paragraph** — not in DEPLOY.md secrets section. Architect-ops Round-1 flagged. Nice-to-have for runbook completeness.
- [~] **Lighthouse audit** on `/` and `/s/<id>` — `≥95 a11y / ≥90 perf mobile`. Not scripted; manual via Chrome DevTools. **Sam.**
- [~] **`/security-review` (or `/ultrareview`) skill** against full Cycle-6 diff. **Sam.**
- [~] **Manual UI walkthrough** per `docs/walkthroughs/launch.md` steps 1-10. Needs a real `GROQ_API_KEY`. **Sam.**
- [~] **Vision usage cron** — `scripts/vision-usage-rate.ts` exists, but no scheduled execution. Recommend a Fly machine cron or a manual weekly check at Day 14 (PRODUCT.md Q3 kill-switch at <5% session-share). **Sam picks: cron vs manual.**
- [~] **Developer-tier Groq credit card wired** (Mkt-A / PRODUCT.md Q5). Day-0 prereq. **Sam.**
- [~] **ALLOWED_ORIGINS prod guard tested** end-to-end against the actual Vercel custom-domain origin (not just the boot refuse-localhost smoke).
- [~] **Custom domain → ALLOWED_ORIGINS** wired correctly post Vercel cert issuance.
- [ ] No runbook for "Groq daily quota exhausted at 14:00 UTC mid-launch-day". ARCH §7 describes the failure mode honestly, but there's no operator playbook (e.g. "upgrade tier", "post status", "expected recovery time"). **Recommend a 1-paragraph runbook in DEPLOY.md before deploy.**
- [ ] No `/ready` probe documented as a known Stage-2 gap (already in DEPLOY.md, just calling it out — accept).

## Human-dependent next steps (ranked + sequenced)

1. **Sam — Fix DEPLOY.md** (5 min): change `fly volumes create agentic_data --size 1` to `--size 3` in two places (lines 62 and 88) and add the `IP_HASH_SALT` rotation caveat to the secrets subsection. One commit.
2. **Sam — Add Groq-daily-quota-exhaustion runbook paragraph** to DEPLOY.md (10 min): 4 lines — "if usage_log shows daily exhaustion, options are (a) wait until midnight UTC, (b) upgrade to Developer tier in Groq dashboard, (c) post status banner via Stage-2 SSE arm if implemented". Same commit as #1.
3. **Sam — Wire Developer-tier Groq credit card** in the Groq Cloud dashboard (PRODUCT.md Q5 / Mkt-A). Day-0 prereq. ~5 min.
4. **Sam — Run `/security-review` (or `/ultrareview`) skill** against the full Cycle-6 diff. ~10 min plus addressing any HIGH. Cycle 6's internal Security review found none; expecting clean.
5. **Sam — Provision Fly app + 3 GB volume + secrets** per DEPLOY.md §2. ~15 min.
6. **Sam — Provision Vercel project** + set `BACKEND_URL` env + custom domain + cert. ~10-30 min (DNS-dependent).
7. **Sam — Set `ALLOWED_ORIGINS` on Fly** to the production frontend origin once Vercel cert issues. ~2 min.
8. **Sam — Run manual UI walkthrough** per `docs/walkthroughs/launch.md` against the deployed stack with the real Groq key. ~20 min.
9. **Sam — Run Lighthouse mobile audit** on `/` and `/s/<id>`. Target ≥95 a11y, ≥90 perf. ~10 min. Any miss → triage + a small fix cycle.
10. **Sam — Take an initial Fly volume snapshot** post-deploy as the DR floor. `fly volumes snapshots create <id>`. ~1 min.
11. **Sam — Tell exactly five people** (Day-0 closed-beta list per walkthroughs/launch.md §4). Then the Day 1–30 sequence begins.

**Time-sensitive:** Groq daily quota (14.4k RPD) resets at **midnight UTC**. If launching close to that boundary, prefer to launch *after* the reset rolls over so you have a full 24 h of quota. For Sam (timezone unspecified), assume UTC and pick a launch hour where 00:00 UTC is ≥8 h away.

**Order of operations dependencies:**

- DEPLOY.md fixes (#1, #2) before Fly provisioning (#5).
- Fly provision (#5) before Vercel `BACKEND_URL` (#6).
- Vercel cert (#6) before `ALLOWED_ORIGINS` set (#7).
- Full stack live (#5–7) before manual walkthrough (#8).
- Walkthrough (#8) before Lighthouse (#9) before Sam telling the five (#11).
- `/security-review` (#4) is parallelizable with #5–7 since it runs against the diff, not the deploy.

## Time to ship

- **If everything green-checks today:** ship in **1 working day** (≈4-6 contact hours of Sam's time, mostly waiting on DNS + cert issuance). The critical path is DEPLOY.md fix → Fly + Vercel provision → cert → walkthrough → Lighthouse → tell-five.
- **If `/security-review` finds a HIGH:** add 0.5-1 day for a fix cycle + re-review. Cycle 6 internal Security PASS suggests none; that's the most likely no-op.
- **If Lighthouse < target (a11y 95 / perf 90 mobile):** add 0.5-2 days depending on what's red. Perf is the more likely miss (image weights, hydration cost on `/`). Mitigations are well-understood (`next/image` is already migrated R5 T4.N; biggest remaining lever is bundle splitting and font preloads).
- **If Groq Developer-tier card not in place by Day 1 of beta:** at 25-40 invited testers, you can probably ride the free-tier 14.4k RPD; but the first viral share-link spike *will* exhaust it. Not a launch-day blocker; a Day-7 blocker.

## Recommended deploy day

**Tuesday May 19 2026 or Wednesday May 20 2026.** Reasoning:

- **Tue/Wed maximises Product Hunt + HN upvote density** (walkthroughs/launch.md §4 Day-10). Even though that's Day-10, the Day-0 timing sets the cadence.
- **Avoid Friday** — soft-launch issues land on a Saturday triage window.
- **Avoid Monday** — Fly/Vercel/Groq support teams are catching up from the weekend; if anything breaks at provision time, response is slower.
- **Avoid the 23:00-01:00 UTC window** (the Groq daily-quota reset boundary). Launching just before midnight UTC means a tester hitting the app at minute 5 could see a quota-exhausted error; launching just after midnight UTC gives 24 h of cushion.
- **One week from today (2026-05-13)** lands on **Tue 2026-05-20** which threads all three constraints. Wed 2026-05-21 is the backup. If Sam wants to compress (no Lighthouse miss, no `/security-review` finding), Thu 2026-05-15 is feasible but tight.

The team has earned this. The codebase is in the cleanest state it's been since Cycle 0, every reviewer signed PASS on Cycle 6, and the eighteen-item carry-over backlog from Cycles 1-5 is at zero. The two remaining gates are exactly the gates that *should* require a human at the keyboard: a real-Groq-key UI walk and an outside-eye security pass. The DEPLOY.md `--size 1` typo and the Groq-quota runbook are the only paperwork left.
