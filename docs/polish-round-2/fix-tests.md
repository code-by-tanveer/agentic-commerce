# Round-2 Test Engineer — Delivery Log

Scope: architect's top-5 high-ROI tests (see `polish-round-1/architect-code.md`
§ "Tests I'd write (top 5)"). Resume run — no tests existed prior.

## Vitest setup

- `backend/package.json` — added `vitest@^1.6.1` + `@vitest/coverage-v8@^1.6.1`
  to `devDependencies`; added `test`, `test:watch`, `test:coverage` scripts.
- Root `package.json` — added `"test": "npm --workspace backend run test"`.
- `backend/vitest.config.ts` — node env, `src/**/*.test.ts`, no globals.
  Setup file at `backend/test/setup-env.ts` seeds the env vars
  (`GROQ_API_KEY`, `UCP_PROFILE_URL`, `UPLOAD_SIGNING_SECRET`, `DB_PATH`)
  required by `config/env.ts`'s Zod parse at module load.
- `backend/tsconfig.json` — added `"exclude": ["src/**/*.test.ts","test/**/*"]`
  so `tsc` doesn't emit test files into `dist/`.

## Test files (all next to source, vitest API only)

1. `src/services/normalize.test.ts` — 7 cases. Empty `{}`, no-variants,
   `media:[]`/`images:undefined`, `compareAtPrice`, merchant string vs object,
   ships_to string/array, ragged-payload no-throw.
2. `src/services/reasoning.test.ts` — 14 cases. Empty prefs, size_match
   (with case-insensitive), discount (15% floor on/off), price (budget
   warning), shipping, fast_shipping (`2-3 days` on / `7-10 days` off), ethics
   under the Round-2 closed-vocabulary + synonym taxonomy (`ETHICS_VALUES` /
   `ETHICS_SYNONYMS`), RANK ordering + MAX_CHIPS=4 cap. Note: the on-disk
   `reasoning.ts` already has the Round-2 ethics polish landed, so the test
   covers the synonym/substring path the architect anticipated.
3. `src/services/uploads.test.ts` — 7 cases. Round-trip, MAC tamper, expiry
   (1ms TTL + setTimeout), traversal (`../etc/passwd`, `foo/bar.png`,
   `..\\evil.png` — `signUploadUrl` throws on each), scheme mismatch, empty
   URL, null URL.
4. `src/stream/events.test.ts` — 22 cases. Iterates every key of
   `eventSchemas`; minimal-valid round-trip + minimal-invalid rejection per
   arm. Plus an explicit `preference_update.key: 'banana'` rejection covering
   the Round-1 enum lift.
5. `src/services/agent.test.ts` — 2 cases (1 todo). `vi.mock('./groqClient.js')`
   feeds a scripted 2-turn stream (turn 1 tool_call to `search_catalog`,
   turn 2 final text). A duck-typed `ToolRegistry` returns a `products` event
   from `dispatch`. Asserts: tool_status `running` → `products` →
   tool_status `done` → `done` with `turnsUsed === 2`. The abort-path case is
   `it.todo` — the loop's mid-stream abort can't be scripted without an
   integration runner; the architect explicitly authorized this fallback.

## Verification

- `npm install` (root) — clean.
- `npm --workspace backend run test` — **51 passed | 1 todo** across 5 files.
- `npm --workspace backend run build` — clean (test files excluded from `dist`).
- `npm test` (root) — proxies to backend, also green.

## Production-code touches (minimal)

None. No exports added or moved, no behaviour changes. All tests are pure
fixture / mock-driven.
