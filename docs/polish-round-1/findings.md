# Polish Round 1 — Aggregated findings

14 reviewers reported. ~50 distinct findings. Grouped by tier; each tagged with originating reviewer.

## Tier 1 — launch-blockers (fix this round)

### Mobile / interaction launch-blockers
- **T1.1** No tap-to-save on mobile. `L`/`M`/`S` is keyboard-only on `ProductCard`/`CollageView`; mobile has no Shortlist path. Empty-state hint literally says "press L on a card." [Riley, QA-Cross-device, PO]
- **T1.2** `Header` right cluster overflows at <380px (iPhone SE). [QA-Cross-device]
- **T1.3** Missing `env(safe-area-inset-bottom)` on `InputBar`, mobile `Shortlist` sheet, `SummaryShareBar`. iOS home indicator clips. [QA-Cross-device]
- **T1.4** IME composition Enter handler — `InputBar.tsx:38-43` doesn't check `event.isComposing`; submits mid-CJK input. [QA-Cross-device]
- **T1.5** `aria-live="polite"` on `ConversationCanvas` is too broad — re-announces on every stream tick. Scope to status text only. [QA-A11y]

### Brand / product positioning
- **T1.6** "Buy now" on collapsed `ProductCard` contradicts "decide, not sell" anti-goal. Expanded card already uses "Buy on [merchant]" — unify. [Mara, PO]
- **T1.7** `ToolStatus` verb map covers only 3 of 7 tools — `save_preference`, `get_preferences`, `recommend_outfit`, `extract_style_from_image` all render as "Working on save_preference" (leaks function name). [PO]
- **T1.8** No UI affordance for `recommend_outfit`. PRODUCT.md move #4: "user can ask … *or tap an affordance*" — only typed phrase works. [PO]
- **T1.9** `Sparkles` icon in `Header` violates "no mascot" anti-goal. Swap for a non-emblematic mark. [Skeptic]
- **T1.10** Welcome message first-person tic ("I'll surface options"). [Skeptic]
- **T1.11** Starter chips don't match the persona voice — all home/fitness/gift, marketer tone. [Mara]
- **T1.12** Trust promise about no paid placement invisible. Surface as one line near MCP disclosure. [Mara]
- **T1.13** Empty product grid (`ProductCardGroup` returns null on 0 results) leaves user in prose-only state with no recovery chip. [PO]

### Accessibility (WCAG AA)
- **T1.14** Invalid nested buttons in `ProductCard` — Buy chip is a nested `role=button` inside the expand button. [QA-A11y]
- **T1.15** `L`/`M`/`S` keyboard fallback requires Shift (`e.key === 'L'`). Bare lowercase does nothing. [QA-A11y]
- **T1.16** `InputBar` textarea unlabeled — placeholder only. [QA-A11y]
- **T1.17** `/` route has no `<h1>`. [QA-A11y]
- **T1.18** `ReasoningChips` renders non-interactive chips as disabled `<button>`s instead of `<span>`s. [QA-A11y]
- **T1.19** `ProductImage` failed-image fallback drops `alt`. [QA-A11y]

### Code correctness
- **T1.20** `classifyError` marks `invalid_api_key` (401/403) as `retryable:false` but copy still says "try again." FE hides Retry while text invites it — mismatch. [QA-Functional]
- **T1.21** `recommendOutfit` computes per-item rationales then **strips them** before emission. FE only renders bundle-level. Decide: render per-item or delete the dead code. [Architect-Code]
- **T1.22** `preference_update.key` is `z.string()` in `@agentic/events` but the valid set is the fixed enum. Narrow to `z.enum([...])` and lift `PREFERENCE_KEYS` into the package. [Architect-Code]
- **T1.23** `uploads.ts` `const key = env.UPLOAD_SIGNING_SECRET ?? env.IP_HASH_SALT` is dead since `config/env.ts` already resolves the fallback. Plus docstring lies about the key source. [Architect-Code]
- **T1.24** `MessageRenderer` `as never` casts mask FE/BE type drift. FE-local `Product` drops `compareAtPrice`/`merchantTags`. Delete FE-local types; re-export from `@agentic/events`. [Architect-Code]

### Performance (hot path)
- **T1.25** `appendMessage` await **before** SseWriter constructed in `chat.ts:77`. Headers don't flush until DB write finishes — first-token latency loss. [QA-Perf]
- **T1.26** Preferences SELECT serializes with the Groq call in `agent.ts:81`. Should race/parallelize. [QA-Perf]
- **T1.27** `useConversation` context value churns on every `text_delta` — every consumer re-renders per token. Split state vs actions contexts; same fix in `useShortlist`. [QA-Perf]

### Design tokens
- **T1.28** Expanded `ProductCard` "Total" price missing `font-display` — **one of the four allowed serif homes** (§2.4 #1). [Design-Tokens]
- **T1.29** `ProductCard` expanded Buy CTA missing `focus-visible:shadow-glow` — DESIGN.md §2.7 hard rule. [Design-Interaction]
- **T1.30** Spacing decimals outside the icon carve-out: `gap-1.5`, `py-1.5`, `px-3.5`, `space-y-2.5`, `py-2.5`, `mt-0.5` across `TypingIndicator`, `Header` buttons, `InputBar`, `SuggestionChips`, `VariantPicker`, `ProductCard`. [Design-Tokens]
- **T1.31** `OutfitBundle` Save button `px-5` (out of palette). [Design-Tokens]
- **T1.32** Three motion durations exceed budget: `TypingIndicator` 0.9s, `ToolStatus` spinners 1.0s / 0.9s. [Design-Tokens]

### UX polish
- **T1.33** Silent revert on optimistic failure in `usePreferences`/`useShortlist`/`ShareButton`. No user-visible signal. [Design-Interaction]
- **T1.34** "Open in chat" deep-link on `/s/[id]` is dead — `useSession` doesn't read `searchParams.session`. Either wire it or drop the link. [Jordan]
- **T1.35** Confidence-by-shipping chip missing on collapsed cards (gift-deadline persona-defining signal). Parse `shippingDays` for "N day(s)" pattern. [Jordan]

## Tier 2 — important, defer-able

- **T2.1** BE never persists assistant turn (contradicts ADR-0002). Move persistence into `agent.ts`. [Architect-Code]
- **T2.2** SIGTERM drain handler — every `fly deploy` mid-truncates live SSEs. [Architect-Ops]
- **T2.3** `/health` doc-vs-code mismatch. Either implement Groq check or trim the doc claim. [Architect-Ops]
- **T2.4** `UPLOAD_DIR` no disk-full fail-safe. 3 IPs fill 1GB volume in 10 min. [Architect-Ops]
- **T2.5** No session TTL — unbounded SQLite growth. [Architect-Ops]
- **T2.6** SSE backpressure unhandled — `reply.raw.write` return values ignored. [QA-Perf]
- **T2.7** Tablet breakpoint mismatch — `Shortlist` shows desktop rail at 768px; DESIGN.md §5 wants sheet. [QA-Cross-device]
- **T2.8** `sticky bottom-[104px]` magic number breaks when textarea grows past one row. [QA-Cross-device]
- **T2.9** No skeletons during async hydrate (PreferencesCard, Shortlist). [Design-Interaction]
- **T2.10** Ethics chip mostly decorative — exact-string match, last in ranking, no MCP filter, no taxonomy in `PreferencesCard`. [Sasha]
- **T2.11** No country-of-origin in `MerchantInfo`. [Sasha]
- **T2.12** Asymmetric Groq usage tagging — `text` calls untagged. [Architect-Ops]
- **T2.13** CGNAT-aware rate limit: key by `cookies.agentic_sid ?? req.ip`. [Architect-Ops]
- **T2.14** Tool-latency + Groq-duration log lines (Cycle 6 acceptance bar wasn't met). [Architect-Ops]
- **T2.15** Daily-quota fallback doesn't actually rescue daily-account 429s — doc claim vs reality. [Architect-Ops]
- **T2.16** `POST /api/session/:id/outfits` non-idempotent. [Architect-Ops]
- **T2.17** `trustProxy: true` unconditional — spoof risk if BE port ever exposed directly. [Architect-Ops]
- **T2.18** Fly volume backup posture undocumented. [Architect-Ops]

## Tier 3 — deferred

- Test suite (5 high-ROI tests recommended) [Architect-Code]
- BE↔FE remaining type unification (FE `types/product.ts` re-export) [Architect-Code]
- `getProduct` dead FE export, `SearchResponse` dead BE type, `ping()` dead method [Architect-Code]
- Magic numbers in `mcpClient`, `cache`, `agent` → `config/env.ts` [Architect-Code]
- HTML5 DnD touch polyfill (subsumed by T1.1 tap-to-save) [QA-Cross-device]
- Semantic-token CSS-vars/Tailwind-plugin layer [Design-Tokens]

---

## Dispatch plan

- **FE engineer** owns T1.1–T1.13, T1.14–T1.19 (a11y), T1.27 (context split), T1.28–T1.32, T1.33, T1.34. The whole launch-blocker UX/a11y/design surface.
- **BE engineer** owns T1.20 (classifyError), T1.21 (outfit per-item rationale), T1.22 (preference_update enum), T1.23 (uploads cleanup), T1.24 (type-sharing decision touches both sides), T1.25–T1.26 (perf), T1.35 (shipping-by-date chip).

Tier 2 and Tier 3 surface to user as "want another round?" question.
