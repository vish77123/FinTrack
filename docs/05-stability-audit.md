# FinTrack Stability & Scalability Audit

## Context

Read-only audit of the FinTrack codebase (Next.js + Supabase personal-finance app) covering error-handling gaps, concurrency risks, query patterns, silent fallbacks, and test coverage. Findings are ranked by risk. No code changes — this document is the deliverable.

A structural fact that amplifies everything below: **all money movement is application-level read-modify-write with no DB transactions, no atomic SQL, and no row locking**, and **the repo has zero tests** (no framework, no test files, no `test` script).

---

## P0 — Critical: financial-data correctness

### 1. Lost-update race in every balance mutation
`src/app/actions/transactions.ts:22-175` (`applyBalanceUpdate` / `reverseBalanceUpdate`) and its duplicated copy `src/app/actions/gmail.ts:11-67` (`applyPendingBalanceUpdate`).

Every balance change is `SELECT balance` → compute in JS → `UPDATE balance = <computed>`. Two concurrent mutations (double-clicked submit, bulk approve running while an SMS webhook fires, two devices) read the same starting balance and the last write silently wins — one transaction's effect vanishes from the account balance while the transaction row exists. This is the core invariant of the app and it is unprotected. Fix direction (for later): atomic `UPDATE ... SET balance = balance + delta` via RPC, or a Postgres trigger.

### 2. Multi-step mutations with no transactional boundary
Partial failure leaves money state permanently inconsistent; several steps don't even check errors:

- `editTransactionAction` (`transactions.ts:309-350`): reverse old balance → update row → apply new balance. If the row update fails, it returns an error **after** the reversal already ran — balance is now wrong and there's no compensation.
- `approvePendingAction` (`gmail.ts:639-691`): insert transaction → apply balance → delete pending. The balance update and the pending delete are both unchecked. If the delete fails or the user double-clicks (two concurrent invocations both read the pending row), the item is approved twice: duplicate transaction + double balance application. Same pattern in `approvePendingBulkAction`.
- `convertToSplitAction` / `collapseSplitToSingleAction` (`transactions.ts:418-622`): reverse + delete originals, then insert new rows in a loop. A mid-loop validation or insert failure returns early with originals already deleted and only some splits created.
- `deleteTransactionAction` (`deleteTransaction.ts:35-52`): reverses balance first; if the delete then fails, the row survives with its balance effect already removed (the code comments assume the user will "retry", which double-reverses on the retry path only if delete keeps failing — but a retry that succeeds reverses **again**).

### 3. Balance `UPDATE` errors are never checked
None of the `.update({ balance / outstanding_balance })` calls in `applyBalanceUpdate`, `reverseBalanceUpdate`, or `applyPendingBalanceUpdate` inspect the returned `error`. An RLS rejection, constraint failure, or network blip is silently swallowed and the action still returns `{ success: true }`. Silent balance drift with zero observability.

### 4. Credit-card floor-at-0 makes apply/reverse non-inverse
`transactions.ts:38,126,143`: applying an income/cc_payment on a CC floors `outstanding_balance` at 0 (excess discarded), but reversing it adds the **full** amount back. Apply-then-reverse (edit or delete a payment larger than the outstanding) manufactures debt out of nothing. The transfer-in path (line 86) deliberately allows negative outstanding for this reason — the income/cc_payment path is inconsistent with it.

---

## P1 — High: concurrency, silent failure, external APIs

### 5. SMS webhook: check-then-insert dedup race + no abuse protection
`src/app/api/sms/route.ts`:
- Dedup (lines 132-143) is SELECT-then-INSERT with no unique constraint on `(user_id, raw_sms_id)` — iPhone Shortcut retries or concurrent deliveries create duplicate pending transactions. Same TOCTOU pattern in `retrySmsParseAction` (`actions/sms.ts:170-180`).
- The endpoint is public (middleware matcher excludes it) and runs **inline LLM calls** per request with no rate limiting. A leaked secret or misfiring shortcut burns the user's/env Gemini+NVIDIA quota and racks up latency; secrets are guessable-by-brute-force UUIDs with no lockout.
- Profile lookup is `profiles WHERE webhook_secret = ?` — needs an index (see #9) or every SMS scans `profiles`.
- All parse failures return HTTP 200 `{parsed: false}` — the sender can never distinguish success from silent failure (acceptable by design for storage, but there is no alerting/metric at all).

### 6. Gemini rate-limit state is wrong in both directions
`src/lib/email/llmParser.ts:45-96` + a diverging duplicate in `src/lib/sms/llmParser.ts`:
- Env-key `KeyState` is **module-global**: shared across all users on one server instance (one user's sync exhausts the RPD=20 budget for everyone) yet reset on every cold start/instance (serverless), so the daily cap isn't actually enforced either.
- User-supplied keys get a **fresh KeyState per request** (`getRequestKeys`), so RPM/RPD counters and 429 cooldowns are meaningless across requests.
- Two copies of the same rate-limit/parsing logic (email vs SMS) have already drifted (different RPD constants risk, different prompt handling) — bugs get fixed in one and not the other.

### 7. Fallback logic that fails silently or misfires
- `getCredentials` in `src/lib/data/investments.ts:27-49`: bare `catch {}` swallows **every** error (RLS, network, schema) and reports "not connected" → user sees mock portfolio data with reason `not_connected` even when the real cause is an outage. Non-403 API errors surface only as `console.warn` + mock data.
- Gemini→NVIDIA failover (`gmail.ts:423-426`, `sms/orchestrator.ts:101-109`) triggers on `resultMap.size === 0`, which conflates "provider down" with "these emails contain no transactions" — wasted NVIDIA calls on clean inboxes; and when NVIDIA has no API key configured, `parseBatchWithNvidia` returns an empty map with only a console.warn → the whole Layer 2/3 silently no-ops and items land as "failed" with no user-visible cause.
- `api/zerodha/callback/route.ts:44-74`: `redirect()` calls inside `try` — Next.js `redirect()` throws `NEXT_REDIRECT`, so the inner error-path redirects (lines 61-68) are caught by the outer `catch`, which re-redirects with `zerodha_error=NEXT_REDIRECT` instead of the real message. Error reporting for the token exchange is effectively broken.
- Gmail per-message fetch (`gmail.ts:336-349`): failures return `null` and are dropped; a sync where half the fetches fail still reports `success: true` with no partial-failure signal.

### 8. Unbounded queries on hot paths — the main scalability ceiling
- `getDashboardData` (`src/lib/data/dashboard.ts:162-171`): fetches **every transaction the user has ever recorded**, with 3 embedded joins, on every dashboard render, then computes month/today aggregates in JS. With email+SMS auto-ingest this degrades within months and is the single biggest scaling risk. Aggravator: `/investments/page.tsx` calls `getDashboardData()` **only to read the currency symbol**.
- `getReportsData` (`dashboard.ts:364+`): all transactions, no limit, by design — same growth problem.
- `syncGmailAction` (`gmail.ts:247-253`): loads all categorized transactions (`historicalMappings`) per sync, then does per-email linear scans with substring matching → O(emails × full history).
- Gmail body fetch (`gmail.ts:336`): up to 200 parallel `fetch`es in one unbounded `Promise.all` — spiky, invites Gmail 429s (which are then silently dropped per the point above).
- `approvePendingBulkAction` (`gmail.ts:708-767`): sequential per-item insert + 2-4 balance queries → 50 approvals ≈ 200+ DB round trips in one server action; timeout risk on serverless, and items that fail are silently left behind (`success: true` regardless).

### 9. Missing indexes / unique constraints (inferred — schema not in repo)
Query patterns that need verification against the actual schema:
- Indexes: `profiles(webhook_secret)`, `transactions(user_id, date)`, `transactions(source_email_id)`, `pending_transactions(source_email_id)`, `pending_transactions(raw_sms_id)`, `transactions(raw_sms_id)`, `transactions(split_group_id)`, `pending_transactions(user_id, status)`.
- **Unique constraints that would close the race conditions in #2/#5 at the DB layer**: `pending_transactions(user_id, source_email_id)`, `pending_transactions(user_id, raw_sms_id)`, and ideally `transactions(user_id, source_email_id)` — today dedup is purely application-level check-then-insert.

---

## P2 — Medium

### 10. `resetUserAccountAction` is a partial, error-blind wipe
`src/app/actions/settings.ts:124-160`: five sequential deletes whose errors are ignored (results not destructured), and it skips `pending_transactions`, `merchant_rules`, `raw_sms`, `gmail_tokens`, `email_sync_settings`, `zerodha_credentials`, `account_alert_profiles`. Deleting `categories` while `pending_transactions`/`merchant_rules` reference them will FK-fail **silently** unless cascades exist — user believes the reset succeeded.

### 11. Gmail token refresh race
`gmail.ts:193-222`: two concurrent syncs both refresh; Google occasionally rotates the refresh token, and the second (stale) writer can clobber the rotated token stored by the first — permanently breaking sync until re-auth. Update isn't conditional on the token it read.

### 12. `deleteSmsAction` orphan risk
`actions/sms.ts:300-313`: deletes `raw_sms` without touching the `pending_transactions` row referencing it via `raw_sms_id`; behavior depends on unverified FK config (cascade would silently delete a pending txn; restrict would make delete fail silently since the error isn't checked).

### 13. Zero test coverage across all of the above
No test framework exists. Highest-value targets if tests are added (all pure or easily isolated):
1. Balance apply/reverse matrix — type × account-type × add/edit/delete/split/approve (protects #1-#4).
2. `src/lib/email/parser.ts` regex suite against real bank-alert fixtures (silent mis-parses create wrong money records).
3. LLM response JSON parsing fallbacks (`llmParser.ts:325-360`) and the date-hallucination guard (duplicated in 3 places: gmail.ts, sms route, sms retry).
4. Webhook secret validation / dedup path in `api/sms/route.ts`.

---

## Summary ranking

| # | Risk | Area | Why this rank |
|---|------|------|---------------|
| 1 | P0 | Lost-update races on balances | Corrupts the app's core invariant under normal concurrent use |
| 2 | P0 | Non-transactional multi-step mutations | Partial failures permanently desync balances vs rows |
| 3 | P0 | Unchecked balance UPDATE errors | Failures are invisible; success reported anyway |
| 4 | P0 | CC floor-at-0 asymmetry | Deterministic drift on edit/delete of large CC payments |
| 5 | P1 | Webhook dedup race + no rate limit | Duplicates + quota burn on a public endpoint |
| 6 | P1 | Broken LLM rate-limit state model | Cross-user contention, unenforced quotas, drifting duplicate code |
| 7 | P1 | Silent fallbacks (investments, LLM failover, Zerodha NEXT_REDIRECT) | Failures masked as "not connected"/mock/empty |
| 8 | P1 | Unbounded transaction fetch on dashboard/reports/sync | The scaling ceiling; degrades linearly with history |
| 9 | P1 | Missing indexes + unique constraints | Slow lookups now; constraints are also the real fix for #2/#5 |
| 10 | P2 | Error-blind partial account reset | Destructive op that can half-complete silently |
| 11 | P2 | Token-refresh race | Can permanently break Gmail sync |
| 12 | P2 | raw_sms delete orphans | Depends on unverified FK config |
| 13 | P2 | Zero tests | Multiplies the blast radius of every item above |

## Verification (if/when fixes are undertaken)

- #1-#4: add a balance-invariant integration test (seed account → concurrent adds via `Promise.all` on the server action → assert `balance == Σ transactions`); currently fails.
- #5: fire the same SMS payload twice concurrently at `/api/sms` → assert one pending row.
- #7: disconnect network / revoke Zerodha token → assert the UI shows the true cause, and callback error redirects carry the real message.
- #8: seed ~50k transactions → measure dashboard TTFB before/after adding limits/aggregate queries.
- #9: confirm actual schema (Supabase dashboard) before assuming — schema is not in this repo.

---

## Remediation Status & Phase Roadmap

> Updated 2026-07-03. Migration files use this repo's numbered convention
> (`NNN_name.sql`); Phase 0's migration was originally shipped with a
> timestamp filename and later renamed to `022_...` to match.

### Phase 0 — P0 financial-correctness fixes ✅ DONE
Merged into `uat` via PR #1:
- Atomic balance updates via Postgres RPCs (`increment_account_balance`,
  `increment_cc_outstanding`) — new shared helper `src/lib/balance.ts`.
- Row-update-before-balance ordering; payload validation before destructive
  split conversions; compensation on partial failure.
- All balance-update errors checked and surfaced; bulk approve reports
  partial failures.
- delete/approve flows claim rows via `delete().select()` — double-click /
  concurrent duplicates are impossible.
- CC `outstanding_balance` no longer floored at 0 (apply/reverse now exact
  inverses; dashboard clamps negatives for display).

**Deploy gate:** apply `supabase/migrations/022_atomic_balance_updates.sql`
to the Supabase project BEFORE deploying this code, then smoke-test one
add / edit / delete / pending-approval on a bank account and a credit card.

### Phase 1 — DB-level integrity + silent-failure fixes ✅ DONE
1. Migration `023_dedup_constraints_and_indexes.sql`: partial unique indexes
   on `pending_transactions(user_id, source_email_id)` and
   `(user_id, raw_sms_id)` — dedup is now a database guarantee (findings
   5/9); webhook, retry, and sync treat a unique violation (23505) as a
   clean "already imported". Plus lookup indexes on
   `profiles(webhook_secret)`, `transactions(user_id, date)`,
   `source_email_id`, `raw_sms_id`, `split_group_id`, and
   `pending_transactions(user_id, status)`.
2. Zerodha callback rewritten: `redirect()` calls moved out of try/catch
   (they work by throwing `NEXT_REDIRECT`, which the old catch swallowed);
   lost-session and failed credential saves now surface real errors.
3. Fallback honesty: all four LLM parsers return
   `{ results, providerFailed, failureReason }` — failover happens only on
   actual provider failure (not on "no transactions found"); a missing
   NVIDIA key is an explicit failure; the sync result carries a `warning`
   shown in Settings; `getCredentials` distinguishes "not connected" from a
   real lookup failure and the Investments banner shows the true cause.

**Deploy gate:** apply `023_dedup_constraints_and_indexes.sql` BEFORE
deploying, same rule as Phase 0.

### Phase 2 — Scalability (finding 8) (NEXT)
4. Bound the dashboard transaction fetch; push aggregates into SQL; stop
   `/investments` calling `getDashboardData()` for a currency symbol.
5. Tame Gmail sync: cap historical-mappings query, chunk parallel body
   fetches (~10 at a time), report partial-fetch failures.

### Phase 3 — Structural (findings 6, 13)
6. Rate-limiter redesign; merge duplicated email/SMS Gemini parsers.
7. First test suite: balance apply/reverse matrix + regex parser fixtures.
