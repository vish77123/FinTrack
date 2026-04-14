# 02 — Bug & Reliability Review

> **Generated:** 2026-04-14
> **Scope:** Logical defects, edge cases, race conditions, resource leaks, error-handling gaps, and incorrect assumptions.
> **Focus:** Runtime and production behavior only — code style is out of scope.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 3     |
| High     | 6     |
| Medium   | 7     |
| Low      | 4     |

---

## Critical Findings

### BUG-01 — Non-Atomic Balance Updates Cause Silent Data Corruption

**File:** `src/app/actions/transactions.ts` — `applyBalanceUpdate`
(also duplicated in `editTransactionAction`, `convertToSplitAction`,
`collapseSplitToSingleAction`, `deleteTransactionAction`,
`deleteAllSplitSiblingsAction`, `approvePendingAction`, `syncGmailAction`)

**Description:** Every balance mutation follows a read-then-write pattern:

```typescript
const { data: account } = await supabase
  .from("accounts").select("balance").eq("id", id).single();
if (account)
  await supabase.from("accounts")
    .update({ balance: Number(account.balance) - amount }).eq("id", id);
```

Between the `SELECT` and the `UPDATE`, there is no lock and no transaction
boundary. Two concurrent operations on the same account will both read the
same stale balance and write to it, causing one operation's effect to be
silently lost.

**Trigger scenario:**
1. User has account balance ₹10,000.
2. User rapidly approves two pending transactions for ₹500 and ₹300 on the same account.
3. Both `approvePendingAction` calls read balance = ₹10,000.
4. First writes ₹10,000 − ₹500 = ₹9,500.
5. Second writes ₹10,000 − ₹300 = ₹9,700 (overwrites the first).
6. Final balance is ₹9,700 instead of correct ₹9,200. ₹500 silently lost.

This affects **every mutation path** in the application.

**Suggested fix:** Replace with a single atomic SQL update via Supabase RPC:

```sql
CREATE OR REPLACE FUNCTION adjust_balance(p_account_id UUID, p_delta NUMERIC)
RETURNS VOID LANGUAGE sql AS $$
  UPDATE accounts SET balance = balance + p_delta WHERE id = p_account_id;
$$;
```

```typescript
await supabase.rpc("adjust_balance", {
  p_account_id: accountId,
  p_delta: type === "expense" ? -amount : amount,
});
```

---

### BUG-02 — `editTransactionAction` Does Not Handle Transfer Reversal

**File:** `src/app/actions/transactions.ts` — `editTransactionAction`

**Description:** When reversing the old balance effect, the function only
reverses the source account. If the original transaction was a **transfer**,
the destination account (`transfer_to_account_id`) balance is never reversed.

```typescript
// Reverse old balance effect
if (existing.account_id) {
  // ... reverses source account only
  const reverseAmount = existing.type === "expense"
    ? Number(oldAcct.balance) + Number(existing.amount)
    : Number(oldAcct.balance) - Number(existing.amount);
  await supabase.from("accounts").update({ balance: reverseAmount }).eq("id", existing.account_id);
}
// ← No code handles existing.transfer_to_account_id reversal
```

Similarly, when applying the new balance, only a simple income/expense check
is done — transfers are not handled:

```typescript
const newBalance = newType === "expense"
  ? Number(newAcct.balance) - newAmount
  : Number(newAcct.balance) + newAmount;
```

**Trigger scenario:**
1. User creates a transfer of ₹5,000 from Account A to Account B.
   A: −₹5,000, B: +₹5,000.
2. User edits the transaction (e.g., changes amount to ₹6,000).
3. Reversal only adds ₹5,000 back to A; B is never decremented by ₹5,000.
4. New balance applies ₹6,000 as income to the new account (since `transfer` ≠ `expense`, it hits the else branch → adds ₹6,000).
5. Account B permanently retains the phantom ₹5,000 credit.

**Suggested fix:** Add a transfer-type branch to both the reversal and
re-application logic, mirroring `deleteTransactionAction` which handles this
correctly.

---

### BUG-03 — Partial Split Insert Leaves Orphaned Rows and Corrupted Balances

**File:** `src/app/actions/transactions.ts` — `addTransactionAction` (split path),
`convertToSplitAction`, `collapseSplitToSingleAction`

**Description:** Split transactions are inserted in a sequential `for` loop.
If the 3rd of 5 splits fails Zod validation or DB insert, the function
returns `{ error }` immediately. The 2 rows already inserted (and their
balance updates) are **not rolled back**.

```typescript
for (const split of splits) {
  const validated = transactionSchema.safeParse(payload);
  if (!validated.success) return { error: ... }; // ← exits without rolling back prior inserts

  const { error: dbError } = await supabase.from("transactions").insert({ ... });
  if (dbError) return { error: ... }; // ← same issue

  await applyBalanceUpdate(supabase, validated.data); // ← already applied for earlier splits
}
```

**Trigger scenario:**
1. User submits a 4-way split. Splits 1–2 are valid; split 3 has an invalid
   `account_id`.
2. Splits 1–2 are inserted and balances updated. Split 3 fails validation.
3. The function returns an error. The user sees "Failed to save split
   transaction" but splits 1–2 are now orphans sharing a `split_group_id`
   with no sibling.
4. The balance updates for splits 1–2 are permanent.

**Suggested fix:** Collect all validated payloads first, then insert in a
single batch. If the batch fails, no balance updates are applied. Ideally,
wrap all inserts + balance updates in a Postgres transaction via RPC.

---

## High Findings

### BUG-04 — `editTransactionAction` Ignores `transfer_to_account_id` Field

**File:** `src/app/actions/transactions.ts` — `editTransactionAction`

**Description:** The `UPDATE` statement omits `transfer_to_account_id`
entirely:

```typescript
const { error: updateError } = await supabase
  .from("transactions")
  .update({
    amount: newAmount,
    type: newType,
    account_id: newAccountId,
    category_id: newCategoryId,
    date: newDate,
    note: newNote,
    // ← transfer_to_account_id is never set
  })
```

If the user edits a transfer and changes the destination account, the old
destination remains in the database.

**Suggested fix:** Add `transfer_to_account_id` to the update payload and
the FormData extraction.

---

### BUG-05 — Dashboard Returns Mock `pendingTransactions` Even With Live Data

**File:** `src/lib/data/dashboard.ts` — `getDashboardData`

**Description:** The live-data return object includes:

```typescript
return {
  // ...
  pendingTransactions: mockData.pendingTransactions,
  // ...
};
```

This hardcodes the mock pending transactions array into the response even
when the user is on a real Supabase instance with real data. The dashboard
page does call `getPendingTransactionsAction()` separately, so the UI may
work correctly — but any consumer of `getDashboardData().pendingTransactions`
will receive fake data in production.

**Suggested fix:** Remove `pendingTransactions` from `getDashboardData` or
replace with an actual query.

---

### BUG-06 — Rate-Limit State in `llmParser` Resets on Every Serverless Cold Start

**File:** `src/lib/email/llmParser.ts` — module-level `globalApiKeys`, `keysInitialized`

**Description:** The rate-limit counters (`requestsThisMinute`,
`requestsToday`, `lastError429At`) are stored in module-level variables.
In a serverless environment (Vercel), each cold start creates a fresh module
scope, resetting all counters to zero.

```typescript
let globalApiKeys: KeyState[] = [];
let keysInitialized = false;
```

**Trigger scenario:**
1. User triggers Gmail sync. The function exhausts the daily limit (20
   requests) on Key 1.
2. The Vercel function instance is recycled (idle > 5 min, or new deployment).
3. User triggers sync again. A new cold start resets `requestsToday = 0`.
4. The code believes it has 20 fresh daily requests — hitting Gemini's 429
   again immediately.

The counters provide a false sense of rate limiting in production.

**Suggested fix:** For accurate rate limiting in serverless:
- Use a persistent store (Supabase table, Redis, or Vercel KV) to track
  request counts per key per time window.
- Or rely solely on 429-response handling (which the code already does as a
  fallback) and remove the client-side counter pretense.

---

### BUG-07 — `getRequestKeys` Creates Fresh State for User Keys on Every Call

**File:** `src/lib/email/llmParser.ts` — `getRequestKeys`

**Description:** When user-supplied keys are present, the function creates
brand-new `KeyState` objects with all counters at zero — every single time
it is called:

```typescript
function getRequestKeys(userKeys?: string[] | null): KeyState[] {
  initGlobalKeys();
  if (!userKeys || userKeys.length === 0) {
    return globalApiKeys;
  }
  const now = Date.now();
  return userKeys.map(key => ({
    key,
    client: new GoogleGenAI({ apiKey: key }),
    requestsThisMinute: 0,  // ← always zero
    requestsToday: 0,        // ← always zero
    ...
  }));
}
```

Even within a single warm function instance, per-user keys never accumulate
state. The rate limiting for user-supplied keys is effectively disabled.

**Suggested fix:** Cache user key states in a `Map<string, KeyState>` keyed
by the API key string, similar to how `globalApiKeys` works.

---

### BUG-08 — `convertToSplitAction` Deletes Before Validating New Splits

**File:** `src/app/actions/transactions.ts` — `convertToSplitAction`

**Description:** The function reverses balances and deletes the original
transaction(s) **before** parsing or validating the new split data:

```typescript
// Delete original
const { error: deleteError } = await supabase
  .from("transactions").delete().eq("id", idOrGroupId)...;

// Then parse new splits
let splits: any[] = [];
try {
  splits = JSON.parse(formData.get("splits") as string);
} catch {
  return { error: "Invalid split data." }; // ← original is already deleted!
}
```

If the split JSON is malformed, or the first split fails validation, the
original transaction is already permanently deleted and its balance effect
reversed. The user has lost their data.

**Suggested fix:** Parse, validate, and prepare all new split payloads
**before** deleting the original.

---

### BUG-09 — Gmail Sync Sequential N+1 Queries Per Email

**File:** `src/app/actions/gmail.ts` — `syncGmailAction`

**Description:** For each email message, the function executes:
1. One query to `pending_transactions` for dedup
2. One query to `transactions` for dedup
3. One `fetch` to Gmail API for full message

With up to 50 messages (`maxResults=50`), this produces up to **150
sequential database/network calls** in a single request. On Vercel with a
10-second serverless function timeout (or 60s on Pro), this can easily
time out for users with many bank alerts.

**Trigger scenario:** User has 50 unprocessed emails from the last 3 days.
Each dedup check + Gmail fetch takes ~200ms. Total: min 30 seconds of
sequential I/O, exceeding the default serverless timeout.

**Suggested fix:**
1. Batch dedup: fetch all `source_email_id` values from `pending_transactions`
   and `transactions` in two bulk queries, then filter in-memory.
2. Parallelize Gmail message fetches with `Promise.all` (with concurrency
   limit).

---

## Medium Findings

### BUG-10 — `new Date(formData.get("date"))` Produces Invalid Date on Empty Input

**File:** `src/app/actions/transactions.ts` — `addTransactionAction`,
`editTransactionAction`, `convertToSplitAction`, `collapseSplitToSingleAction`

**Description:** If the `date` field is empty or null in the FormData:

```typescript
date: new Date(formData.get("date") as string).toISOString(),
```

`new Date(null)` → `new Date(0)` → `"1970-01-01T00:00:00.000Z"`.
`new Date("")` → `Invalid Date` → `.toISOString()` throws `RangeError`.

The Zod schema validates `z.string().datetime()` which would catch this,
but only in the single-transaction path. In the split path, the parent date
is constructed outside Zod and used directly:

```typescript
const date = new Date(formData.get("date") as string).toISOString();
```

**Trigger scenario:** Client sends a form submission with an empty or
missing `date` field → the server action crashes with an unhandled
`RangeError`.

**Suggested fix:** Validate the date string before constructing:

```typescript
const rawDate = formData.get("date") as string;
if (!rawDate) return { error: "Date is required." };
const dateObj = new Date(rawDate);
if (isNaN(dateObj.getTime())) return { error: "Invalid date." };
const date = dateObj.toISOString();
```

---

### BUG-11 — `approvePendingAction` Does Not Mark Pending as Approved

**File:** `src/app/actions/gmail.ts` — `approvePendingAction`

**Description:** After inserting the real transaction and updating the
balance, the pending row is deleted:

```typescript
await supabase
  .from("pending_transactions")
  .delete()
  .eq("id", pendingId);
```

But the code never updates the `status` column to `"approved"`. If the
delete fails silently (no error check on the delete result), the pending
row stays with `status = "pending"` and will be shown to the user again.

More importantly, Gmail sync dedup checks for `status IN ("pending",
"approved")`. Since the row is deleted rather than status-updated, the dedup
fence depends entirely on the `transactions.source_email_id` check. If the
transaction insert succeeds but the pending delete fails, the next sync will
see no pending row and re-create a duplicate pending transaction.

**Suggested fix:** Update status to `"approved"` instead of deleting, or
at minimum check the delete result:

```typescript
const { error: delError } = await supabase
  .from("pending_transactions")
  .delete()
  .eq("id", pendingId);
if (delError) console.error("Failed to delete pending row:", delError);
```

---

### BUG-12 — Dashboard `todaySpent` Uses Local Server Timezone

**File:** `src/lib/data/dashboard.ts` — `getDashboardData`

**Description:** "Today" is computed on the server:

```typescript
const today = new Date();
today.setHours(0, 0, 0, 0);
```

This uses the Node.js process timezone (UTC on Vercel). A user in IST
(UTC+5:30) making an expense at 1:00 AM IST (7:30 PM UTC previous day) will
see the expense counted as "yesterday" on the dashboard because the server
timestamp falls on the prior UTC day.

**Trigger scenario:** Any user outside UTC whose transactions fall near
midnight local time will see incorrect "Today's Spent" values.

**Suggested fix:** Pass the user's timezone (from profile or client) and
use it for the day boundary calculation, or use the transaction's date
(which is a calendar date from the client).

---

### BUG-13 — `getDashboardData` Spending/Income Calculations Based on Only 50 Transactions

**File:** `src/lib/data/dashboard.ts` — `getDashboardData`

**Description:** The transactions query has `.limit(50)`:

```typescript
supabase.from("transactions")
  .select(...)
  .eq("user_id", user.id)
  .order("date", { ascending: false })
  .limit(50),
```

The monthly income/expense/savings totals and the spending donut chart are
then calculated from this limited result set:

```typescript
(transactionsRaw || []).forEach(txn => {
  const txnDate = new Date(txn.date);
  if (txnDate >= monthStart) {
    if (txn.type === 'income') totalIncome += Number(txn.amount);
    if (txn.type === 'expense') totalExpenses += Number(txn.amount);
  }
});
```

If a user has more than 50 transactions in the current month, the dashboard
will undercount both income and expenses. The summary grid shows incorrect
"Income", "Expenses", and "Savings" numbers.

**Trigger scenario:** Active user with 80+ transactions this month. Only the
most recent 50 are considered; the oldest 30+ are invisible to the
dashboard summary.

**Suggested fix:** Run a separate aggregate query for monthly totals:

```typescript
const { data: monthlyAgg } = await supabase.rpc("get_monthly_totals", {
  p_user_id: user.id,
  p_month_start: monthStart.toISOString(),
});
```

Or add a second unbounded query with `.select("amount, type, date")` (no
joins) for the current month.

---

### BUG-14 — `resetUserAccountAction` Deletes in Wrong Order (FK Violation Risk)

**File:** `src/app/actions/settings.ts` — `resetUserAccountAction`

**Description:** The function deletes tables in this order:

```typescript
await supabase.from("transactions").delete().eq("user_id", user.id);
await supabase.from("accounts").delete().eq("user_id", user.id);
await supabase.from("budgets").delete().eq("user_id", user.id);
await supabase.from("categories").delete().eq("user_id", user.id);
await supabase.from("savings_goals").delete().eq("user_id", user.id);
```

If `budgets` has a FK to `categories`, the budget delete must happen before
category delete. The current order does this correctly for budgets →
categories. However, pending_transactions, gmail_tokens, email_sync_settings,
account_alert_profiles, and raw_sms are **never deleted**. After a "reset",
the user still has:
- Pending transactions referencing deleted accounts/categories
- Alert profiles referencing deleted accounts
- Orphaned sync settings

Additionally, none of the delete results are checked — any silent failure
causes a partial reset.

**Suggested fix:** Delete all user tables (including pending_transactions,
account_alert_profiles, etc.) and check each result.

---

### BUG-15 — `updateEmailSyncSettingsAction` Spread of `existing` Overwrites New Values

**File:** `src/app/actions/gmail.ts` — `updateEmailSyncSettingsAction`

**Description:** The upsert merges `existing` (DB row) with `updates`
(form input):

```typescript
await supabase
  .from("email_sync_settings")
  .upsert({ ...existing, ...updates }, { onConflict: "user_id" });
```

If `existing` is `null` (first-time user), `{ ...null, ...updates }`
works fine — spread of null is a no-op. But when `existing` is a full DB
row, its `id` column is included in the spread. Supabase will attempt an
`INSERT ... ON CONFLICT (user_id) UPDATE` with the explicit `id` from the
old row. If the underlying PK strategy is `DEFAULT gen_random_uuid()`, this
may silently pass. But more critically, the `existing` row may contain stale
values for fields not present in `updates`, potentially reverting a
concurrent change.

Also, `existing` includes metadata columns like `created_at` which
shouldn't be written back.

**Suggested fix:** Only spread the columns that belong to settings updates:

```typescript
const base = existing
  ? { id: existing.id, user_id: existing.user_id }
  : { user_id: user.id };
await supabase
  .from("email_sync_settings")
  .upsert({ ...base, ...updates }, { onConflict: "user_id" });
```

---

### BUG-16 — `accountSchema` Allows Negative Balances for Credit Card Accounts

**File:** `src/app/actions/accounts.ts` — `accountSchema`

**Description:** The balance field defaults to 0 but has no minimum
constraint:

```typescript
const accountSchema = z.object({
  // ...
  balance: z.number().default(0),
});
```

This means `parseFloat("")` → `NaN`, which Zod will reject, but
`parseFloat("-50000")` → `-50000` passes validation. For account types
like "bank" and "savings", a negative initial balance is likely a data
entry mistake. But this is a very minor issue since credit cards legitimately
have negative balances.

However, the real bug is: if `rawBalance` is `"abc"`, `parseFloat("abc")`
returns `NaN`. Zod's `z.number()` rejects `NaN`, but the error message
is the default Zod message — not a user-friendly one.

**Suggested fix:** Add a pre-parse guard:

```typescript
const rawBalance = formData.get("balance") as string;
const balance = rawBalance ? parseFloat(rawBalance) : 0;
if (isNaN(balance)) return { error: "Please enter a valid balance." };
```

---

## Low Findings

### BUG-17 — `isBankSender` Uses `.includes()` — Substring False Positives

**File:** `src/lib/email/parser.ts` — `isBankSender`

**Description:**

```typescript
export function isBankSender(sender: string): boolean {
  const email = sender.toLowerCase().replace(/.*</, "").replace(/>.*/, "").trim();
  return KNOWN_BANK_SENDERS.some(known => email.includes(known));
}
```

The sender list includes bare domains like `"welcome.americanexpress.com"`.
Any email from a subdomain like `not-actually-welcome.americanexpress.com`
would match. More concerning, the check does `email.includes(known)` — if
a sender string is `"fakealerts@hdfcbank.com.malicious.com"`, it would
match `"alerts@hdfcbank.com"` because the substring is contained.

**Trigger scenario:** An email from `alerts@hdfcbank.com.phishing.com`
passes the bank sender check and its body is parsed for financial data.

**Suggested fix:** Use exact match or match the domain separately:

```typescript
return KNOWN_BANK_SENDERS.some(known => email === known || email.endsWith(`@${known}`));
```

---

### BUG-18 — Regex Date Parser Assumes DD-MM-YY Format Universally

**File:** `src/lib/email/parser.ts` — `extractDate`

**Description:**

```typescript
const dateMatch = text.match(
  /(?:on|dated|date[: ])\s*(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/i
);
if (dateMatch) {
  const day = parseInt(dateMatch[1]);
  const month = parseInt(dateMatch[2]) - 1;
```

The parser assumes `DD-MM-YY` format. Some Indian banks (and all US bank
alerts) use `MM-DD-YY`. For dates like `04-03-2026`, the parser produces
April 3 when the bank meant March 4 (or vice versa).

**Trigger scenario:** A bank alert reads "on 01/12/2026". The parser
interprets this as January 12 (DD=01, MM=12) → December 1 vs. January 12
ambiguity when day ≤ 12.

**Suggested fix:** This is inherently ambiguous without locale knowledge.
When `day ≤ 12 && month ≤ 12`, flag the date as low-confidence or
prefer the email's `Date:` header.

---

### BUG-19 — `updateAccountAction` Overwrites Balance — Bypasses Transaction History

**File:** `src/app/actions/accounts.ts` — `updateAccountAction`

**Description:** The update action allows direct balance modification:

```typescript
const { error: dbError } = await supabase
  .from("accounts")
  .update({
    name: payload.name,
    type: payload.type,
    balance: payload.balance, // ← user-supplied, replaces computed balance
  })
  .eq("id", accountId)
  .eq("user_id", user.id);
```

The balance field is the system-of-record that is maintained by every
transaction insert/delete. Allowing direct user edits without creating a
compensating "adjustment" transaction means the balance will drift from
the transaction log. Future operations (edit, delete) that reverse
transactions will produce further drift.

**Trigger scenario:**
1. User has 10 expense transactions totaling ₹5,000, balance is ₹5,000.
2. User edits account and sets balance to ₹10,000 (to "correct" it).
3. User deletes one ₹500 expense → balance becomes ₹10,500.
4. True balance should be ₹5,500. Delta widens with every subsequent
   operation.

**Suggested fix:** Either create a "Balance Adjustment" transaction when
the user manually changes the balance, or remove the ability to directly
edit the balance field.

---

### BUG-20 — Zustand `localStorage` Read During SSR Can Cause Hydration Mismatch

**File:** `src/store/useUIStore.ts`

**Description:**

```typescript
theme: (typeof window !== "undefined"
  ? (localStorage.getItem("theme") as "light" | "dark")
  : null) || "light",
```

During SSR, `typeof window` is `undefined`, so the theme defaults to
`"light"`. On the client, it reads from localStorage (which may be
`"dark"`). This causes a React hydration mismatch on the very first
render: the server sends markup for "light" theme but the client
immediately resolves to "dark".

**Trigger scenario:** User sets dark mode, navigates away, and returns.
First paint flashes light theme before switching to dark (FOUC).

**Suggested fix:** Initialize to `null`/`undefined` and apply the
persisted theme in a `useEffect` on mount, or use a matching cookie to
read the preference server-side.

---

## Findings-by-File Index

| File | Findings |
|---|---|
| `src/app/actions/transactions.ts` | BUG-01, BUG-02, BUG-03, BUG-04, BUG-08, BUG-10 |
| `src/app/actions/deleteTransaction.ts` | BUG-01 |
| `src/app/actions/gmail.ts` | BUG-01, BUG-09, BUG-11, BUG-15 |
| `src/app/actions/accounts.ts` | BUG-16, BUG-19 |
| `src/app/actions/settings.ts` | BUG-14 |
| `src/lib/data/dashboard.ts` | BUG-05, BUG-12, BUG-13 |
| `src/lib/email/llmParser.ts` | BUG-06, BUG-07 |
| `src/lib/email/parser.ts` | BUG-17, BUG-18 |
| `src/store/useUIStore.ts` | BUG-20 |
