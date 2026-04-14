
# 04 — Consolidated Action Plan

> **Generated:** 2026-04-14
> **Inputs:** 01-security-review.md (15 findings), 02-bug-reliability-review.md
> (20 findings), 03-code-quality-review.md (19 findings)

---

## 1. Deduplication Map

Many findings across the three reviews describe the same underlying issue from
different angles (security, reliability, maintainability). The table below
collapses them into **canonical issues** to prevent duplicate work.

| Canonical ID | SEC | BUG | CQ | Core Issue |
|---|---|---|---|---|
| **ISSUE-A** | SEC-02 | BUG-01 | CQ-01 | Non-atomic read-then-write balance updates (race condition + 7× duplication) |
| **ISSUE-B** | — | BUG-02, BUG-04 | CQ-01 | `editTransactionAction` ignores transfer destination in reversal & update |
| **ISSUE-C** | — | BUG-03, BUG-08 | — | Split insert/convert has no atomicity — partial writes leave orphans |
| **ISSUE-D** | — | BUG-09 | CQ-16 | Gmail sync N+1 sequential dedup queries + serial fetches → timeout |
| **ISSUE-E** | — | BUG-13 | CQ-17 | Dashboard monthly totals computed from only 50 rows → wrong numbers |
| **ISSUE-F** | SEC-11 | — | — | Dev-mode auth bypass deployable to production |
| **ISSUE-G** | SEC-01 | — | — | Open redirect in OAuth callback |
| **ISSUE-H** | SEC-03 | — | — | Gmail tokens stored in plain text |
| **ISSUE-I** | SEC-06 | — | — | User API keys stored unencrypted |
| **ISSUE-J** | SEC-04, SEC-07 | — | — | SMS webhook: secret in URL + no rate limit/replay guard |
| **ISSUE-K** | SEC-08 | — | — | `applyBalanceUpdate` lacks account ownership check |
| **ISSUE-L** | — | BUG-05 | — | `getDashboardData` returns mock `pendingTransactions` in prod |
| **ISSUE-M** | — | BUG-11 | — | `approvePendingAction` deletes instead of status-updating |
| **ISSUE-N** | — | BUG-14 | — | `resetUserAccountAction` skips tables + no error checks |
| **ISSUE-O** | SEC-09 | — | — | Unbounded split array → DoS |
| **ISSUE-P** | SEC-10 | — | — | LLM prompt injection via email content |
| **ISSUE-Q** | SEC-12 | — | — | CSV export formula injection |
| **ISSUE-R** | — | BUG-12 | — | `todaySpent` uses server UTC timezone |
| **ISSUE-S** | — | BUG-15 | — | Email sync settings upsert spreads stale row |
| **ISSUE-T** | — | BUG-10 | CQ-13 | `new Date(formData.get("date"))` crashes on empty + no schema layer |
| **ISSUE-U** | — | BUG-06, BUG-07 | — | LLM rate-limit state resets on cold start / never cached for user keys |
| **ISSUE-V** | — | BUG-17 | — | `isBankSender` substring false positives |
| **ISSUE-W** | — | BUG-19 | — | Direct balance edit drifts from transaction log |
| **ISSUE-X** | — | BUG-20 | — | Zustand theme SSR hydration mismatch (FOUC) |
| **ISSUE-Y** | — | — | CQ-02, CQ-03 | God modules: `transactions.ts` (500 LOC), `gmail.ts` sync (250 LOC) |
| **ISSUE-Z** | — | — | CQ-04, CQ-07 | No domain types + server actions untestable (hard-wired Supabase) |
| **ISSUE-AA** | — | — | CQ-05, CQ-14 | Data fetch mixed with transforms; kitchen-sink dashboard return |
| **ISSUE-BB** | — | — | CQ-06, CQ-08 | No test infrastructure; regex parser has zero tests |
| **ISSUE-CC** | — | — | CQ-09 | Auth boilerplate repeated ~20 times |
| **ISSUE-DD** | — | — | CQ-10 | Hardcoded `₹` ignores user currency setting |
| **ISSUE-EE** | — | — | CQ-11 | Soft-delete via magic number `-9999` |
| **ISSUE-FF** | — | — | CQ-12 | Inconsistent return types across server actions |
| **ISSUE-GG** | — | — | CQ-18 | Budgets page fires two overlapping queries |
| **ISSUE-HH** | — | — | CQ-19 | Reports fetches all transactions unbounded |
| **ISSUE-II** | — | — | CQ-15 | Destructive reset has no server-side confirmation |
| **ISSUE-JJ** | SEC-05, SEC-15 | — | — | SMS webhook: anon-key client + no payload size limit |
| **ISSUE-KK** | SEC-13, SEC-14 | BUG-16, BUG-18 | — | Minor: verbose logging, category ownership, NaN handling, date format |

**After deduplication: 54 raw findings → 33 canonical issues.**

---

## 2. Prioritization Matrix

Each issue is scored on three axes:

| Axis | Scale | Meaning |
|---|---|---|
| **Risk** | 1–5 | Likelihood × impact of production incident or exploit |
| **Effort** | S / M / L | Approximate implementation + review time |
| **Business impact** | 1–5 | Direct effect on user trust, data correctness, revenue |

### Tier: P0 — Immediate Fixes (This Sprint / Hotfix)

Issues that cause **data corruption in normal use** or are **actively exploitable**.

| # | Issue | Risk | Effort | Biz | Rationale |
|---|---|---|---|---|---|
| 1 | **ISSUE-A** — Atomic balance updates | 5 | M | 5 | Every balance mutation in the app is vulnerable to race conditions. Double-click approval silently corrupts balances. Financial app — balance accuracy is non-negotiable. |
| 2 | **ISSUE-B** — Transfer reversal in edit | 5 | S | 5 | Editing any transfer permanently inflates the destination account balance. Already occurs in normal use. |
| 3 | **ISSUE-C** — Atomic split transactions | 5 | M | 5 | Partial split failure leaves orphan rows + incorrect balances. No user recovery path. |
| 4 | **ISSUE-G** — Open redirect in callback | 5 | S | 4 | Two-line fix. Exploitable today via crafted phishing link. |
| 5 | **ISSUE-F** — Dev auth bypass | 4 | S | 5 | One misconfigured env var disables all auth in production. |
| 6 | **ISSUE-E** — Monthly totals from 50 rows | 4 | S | 5 | Dashboard shows wrong income/expenses for any user with >50 monthly transactions. Core trust metric. |
| 7 | **ISSUE-L** — Mock pending txns in prod | 4 | S | 4 | Fake data returned in production response. One-line fix. |

### Tier: P1 — High Priority (Next 1–2 Sprints)

Issues that cause **incorrect behavior under edge conditions** or represent
**significant security risk** requiring moderate effort.

| # | Issue | Risk | Effort | Biz | Rationale |
|---|---|---|---|---|---|
| 8 | **ISSUE-K** — Account ownership in balance update | 4 | S | 4 | Defense-in-depth; exploitable only if RLS is misconfigured, but the fix is trivial. |
| 9 | **ISSUE-D** — Gmail sync N+1 → timeout | 4 | M | 4 | Users with 30+ bank emails hit serverless timeout. Core feature broken at scale. |
| 10 | **ISSUE-H** — Encrypt Gmail tokens at rest | 4 | M | 4 | DB compromise exposes every user's Gmail inbox. High impact, moderate implementation. |
| 11 | **ISSUE-J** — SMS webhook hardening | 4 | S | 3 | Secret-in-URL logged everywhere; no rate limit. Move to header + add rate limiting. |
| 12 | **ISSUE-O** — Bound split array size | 3 | S | 3 | One-line guard prevents DoS via massive split payload. |
| 13 | **ISSUE-M** — Approve sets status, not delete | 3 | S | 4 | Delete-failure causes duplicate pending transactions on next sync. |
| 14 | **ISSUE-T** — Date validation / crash on empty | 3 | S | 3 | Server action throws unhandled `RangeError` on empty date. |
| 15 | **ISSUE-N** — Fix `resetUserAccountAction` | 3 | S | 3 | Reset leaves orphan rows in 5+ tables; no error checking. |
| 16 | **ISSUE-Q** — CSV formula injection | 3 | S | 2 | Standard hygiene; one helper function. |
| 17 | **ISSUE-II** — Server-side reset confirm | 3 | S | 3 | Destructive action callable without confirmation. |
| 18 | **ISSUE-I** — Encrypt user API keys | 3 | M | 3 | Same pattern as ISSUE-H; can share encryption utility. |

### Tier: P2 — Short-Term Improvements (Next 2–4 Sprints)

Performance, correctness edge cases, and foundational quality work.

| # | Issue | Risk | Effort | Biz | Rationale |
|---|---|---|---|---|---|
| 19 | **ISSUE-R** — Timezone-aware `todaySpent` | 2 | S | 3 | Wrong for non-UTC users near midnight. |
| 20 | **ISSUE-S** — Fix settings upsert spread | 2 | S | 2 | Stale-data overwrite on concurrent settings save. |
| 21 | **ISSUE-U** — Fix LLM rate-limit state | 2 | M | 2 | Rate counters are meaningless in serverless; simplify to 429-only. |
| 22 | **ISSUE-P** — LLM prompt injection defense | 3 | M | 3 | Mitigate with amount caps + schema validation; not fully solvable. |
| 23 | **ISSUE-V** — Fix `isBankSender` matching | 2 | S | 2 | Phishing sender could pass filter via substring. |
| 24 | **ISSUE-DD** — Use profile currency_code | 2 | S | 3 | Hardcoded ₹ breaks non-INR users. Feature correctness. |
| 25 | **ISSUE-GG** — Deduplicate budget queries | 1 | S | 2 | Unnecessary DB round-trip. Quick win. |
| 26 | **ISSUE-HH** — Bound reports query | 2 | S | 3 | Unbounded fetch causes slow loads / OOM for long-time users. |
| 27 | **ISSUE-X** — Fix Zustand hydration mismatch | 1 | S | 2 | Dark-mode FOUC. User-visible but cosmetic. |
| 28 | **ISSUE-W** — Balance-edit creates adjustment txn | 2 | M | 3 | Balance drift from transaction log over time. |
| 29 | **ISSUE-JJ** — SMS webhook client + size limit | 2 | S | 2 | Anon-key singleton + no size guard. |

### Tier: P3 — Long-Term Refactors (Backlog)

Architectural improvements that reduce tech debt and enable future velocity.

| # | Issue | Risk | Effort | Biz | Rationale |
|---|---|---|---|---|---|
| 30 | **ISSUE-Z** — Domain types + Supabase codegen | 1 | L | 3 | Foundation for type safety across entire codebase. |
| 31 | **ISSUE-Y** — Split god modules | 1 | M | 2 | `transactions.ts` and `gmail.ts` decomposition. |
| 32 | **ISSUE-BB** — Test infrastructure + parser tests | 1 | L | 4 | Vitest + initial test suite for parsers, balance, transforms. |
| 33 | **ISSUE-AA** — Separate fetch/transform + split dashboard data | 1 | M | 3 | Enables per-component Suspense streaming. |
| 34 | **ISSUE-CC** — `withAuth` higher-order function | 1 | S | 2 | Dedup ~20 auth blocks. Quick win, backlog because not broken. |
| 35 | **ISSUE-FF** — Unified `ActionResult<T>` type | 1 | M | 2 | Consistent return contract for all server actions. |
| 36 | **ISSUE-EE** — Replace magic `-9999` soft-delete | 1 | M | 2 | `deleted_at` column or Postgres view. Requires migration. |
| 37 | **ISSUE-KK** — Minor hygiene items | 1 | S | 1 | Verbose logging, category ownership check, NaN messages, date ambiguity. |

---

## 3. Suggested Pull-Request Breakdown

### Sprint 1 — Data Integrity Hotfixes (P0)

| PR | Scope | Issues | Est. |
|---|---|---|---|
| **PR-1: Atomic balance RPC** | Create `adjust_balance` Postgres function. Extract `adjustBalance()` and `reverseBalanceEffect()` into `src/lib/domain/balance.ts`. Replace all 8 call sites in transactions, deleteTransaction, gmail. | ISSUE-A, ISSUE-K, CQ-01 | 1–2 days |
| **PR-2: Fix edit-transaction transfer handling** | Add transfer reversal + `transfer_to_account_id` to update payload in `editTransactionAction`. | ISSUE-B | 0.5 day |
| **PR-3: Atomic split transactions** | Validate all splits upfront → batch insert via RPC or single multi-row INSERT → then apply balance deltas. Fix `convertToSplitAction` to validate before deleting. | ISSUE-C | 1 day |
| **PR-4: Auth & redirect hardening** | Fix open redirect (2 lines). Add `NODE_ENV` guard to placeholder bypass. | ISSUE-G, ISSUE-F | 0.5 day |
| **PR-5: Dashboard data correctness** | Add server-side monthly aggregate query (RPC or inline). Remove mock `pendingTransactions` from live return. | ISSUE-E, ISSUE-L | 1 day |

**Sprint 1 total: ~5 days dev + review.**

### Sprint 2 — Security & Edge Cases (P1)

| PR | Scope | Issues | Est. |
|---|---|---|---|
| **PR-6: Gmail sync performance** | Batch dedup into 2 upfront queries. Parallelize message fetches with concurrency limit. | ISSUE-D | 1 day |
| **PR-7: Token/key encryption** | Add `src/lib/crypto.ts` (AES-256-GCM encrypt/decrypt). Encrypt Gmail tokens on OAuth callback. Encrypt user API keys in settings. Decrypt on use. | ISSUE-H, ISSUE-I | 1.5 days |
| **PR-8: SMS webhook hardening** | Move secret to `X-Webhook-Secret` header. Add per-secret rate limiting in middleware. Content-length check. | ISSUE-J, ISSUE-JJ | 1 day |
| **PR-9: Input validation sweep** | Bound splits array (max 20). Validate date before `new Date()`. CSV cell sanitization. Server-side reset confirmation phrase. | ISSUE-O, ISSUE-T, ISSUE-Q, ISSUE-II | 1 day |
| **PR-10: Pending-transaction lifecycle** | Change `approvePendingAction` to set `status = "approved"` instead of deleting. Fix `resetUserAccountAction` to delete all user tables + check results. | ISSUE-M, ISSUE-N | 0.5 day |

**Sprint 2 total: ~5 days dev + review.**

### Sprint 3–4 — Short-Term Improvements (P2)

| PR | Scope | Issues | Est. |
|---|---|---|---|
| **PR-11: Timezone + currency correctness** | Accept user timezone (profile or header) for `todaySpent`. Replace hardcoded `₹` with `currency_code` from profile. | ISSUE-R, ISSUE-DD | 1 day |
| **PR-12: Settings & sync fixes** | Fix upsert spread. Simplify LLM rate limiting (remove counters, keep 429 handler). Fix `isBankSender` matching. | ISSUE-S, ISSUE-U, ISSUE-V | 1 day |
| **PR-13: LLM safety net** | Add amount cap per pending transaction. Ensure Bytez path validates against response schema. Add delimiters in prompt. | ISSUE-P | 1 day |
| **PR-14: Query optimization** | Deduplicate budget queries. Add date-range bound to reports. Balance-edit creates adjustment transaction. | ISSUE-GG, ISSUE-HH, ISSUE-W | 1 day |
| **PR-15: Hydration fix** | Move theme init to `useEffect` or cookie. | ISSUE-X | 0.5 day |

**Sprints 3–4 total: ~4.5 days dev + review.**

### Backlog — Architectural (P3)

| PR | Scope | Issues | Est. |
|---|---|---|---|
| **PR-16: Supabase type generation** | `supabase gen types typescript` → `src/lib/types/database.ts`. Replace `any` usage in actions + data layer. | ISSUE-Z (partial) | 2 days |
| **PR-17: Test infrastructure** | Add Vitest. Write tests for regex parser (10+ fixtures), `transformDashboardData`, `adjustBalance`. | ISSUE-BB | 2 days |
| **PR-18: `withAuth` + `ActionResult` patterns** | Create `withAuth` HOF. Define `ActionResult<T>` union. Migrate all server actions. | ISSUE-CC, ISSUE-FF | 1.5 days |
| **PR-19: Decompose god modules** | Split `transactions.ts` into add/edit/split/collapse. Extract `syncGmailAction` pipeline stages. | ISSUE-Y | 2 days |
| **PR-20: Separate fetch/transform** | Split `getDashboardData` into fetch + pure transform. Enable per-component Suspense. | ISSUE-AA | 1.5 days |
| **PR-21: Soft-delete migration** | Add `deleted_at` column to categories. Update queries. Drop `-9999` convention. | ISSUE-EE | 1 day |
| **PR-22: Minor hygiene sweep** | Gate verbose logging behind `NODE_ENV`. Add `category_id` ownership check. User-friendly NaN message. | ISSUE-KK | 0.5 day |

**Backlog total: ~10.5 days dev + review.**

---

## 4. Sprint vs Backlog Summary

```
┌─────────────────────────────────────────────────────────────┐
│  SPRINT 1 (P0)  │  5 PRs  │  ~5 days  │ Data integrity    │
│  SPRINT 2 (P1)  │  5 PRs  │  ~5 days  │ Security + edges  │
│  SPRINT 3-4 (P2)│  5 PRs  │ ~4.5 days │ Correctness + perf│
│  BACKLOG  (P3)  │  7 PRs  │ ~10.5 days│ Architecture/test  │
└─────────────────────────────────────────────────────────────┘
  Total: 22 PRs │ ~25 days engineering effort
```

### What Goes in the Sprint

| Sprint | Theme | PR Numbers |
|---|---|---|
| **Sprint 1** | "Stop the bleeding" — balance corruption, auth bypass, wrong dashboard numbers | PR-1 through PR-5 |
| **Sprint 2** | "Harden the perimeter" — token encryption, webhook security, input validation | PR-6 through PR-10 |
| **Sprints 3–4** | "Polish correctness" — timezone, currency, query efficiency, hydration | PR-11 through PR-15 |

### What Goes in the Backlog

PR-16 through PR-22. These provide long-term maintainability value but do not
fix user-facing bugs or exploitable vulnerabilities. Prioritize based on team
velocity and feature roadmap.

**Recommended sequencing for backlog PRs:**
1. PR-16 (types) → enables safer work on everything else
2. PR-17 (tests) → prevents regressions in future PRs
3. PR-18 (withAuth + ActionResult) → simplifies all future action work
4. PR-19 (decompose modules) → easier with types + tests in place
5. PR-20, PR-21, PR-22 → independent, order by convenience

---

## 5. Dependency Graph

```
PR-1 (atomic balance)
 ├── PR-2 (transfer fix) — uses new adjustBalance()
 ├── PR-3 (atomic splits) — uses new adjustBalance()
 └── PR-5 (dashboard aggregates) — independent, but confirms balance correctness

PR-4 (auth hardening) — independent

PR-6 (sync perf) — independent
PR-7 (encryption) — independent, but shares utility with PR-8
PR-8 (webhook) — independent
PR-9 (validation sweep) — independent
PR-10 (pending lifecycle) — independent

PR-16 (types) → PR-17 (tests) → PR-18 (withAuth) → PR-19 (decompose)
                                                   → PR-20 (fetch/transform)
```

**Critical path:** PR-1 must land first. PR-2 and PR-3 depend on the
`adjustBalance` function it introduces. Everything else is parallelizable
across team members.

