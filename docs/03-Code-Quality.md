# 03 — Code Quality & Refactoring Review

> **Generated:** 2026-04-14
> **Scope:** SOLID principles, separation of concerns, testability, readability,
> API/interface design, and performance anti-patterns.
> **Non-scope:** Stylistic bikeshedding, formatting preferences.

---

## Summary

| Area | Findings |
|------|----------|
| SOLID / Separation of Concerns | 5 |
| Testability | 3 |
| Readability / Maintainability | 4 |
| API & Interface Design | 3 |
| Performance Anti-patterns | 4 |

---

## SOLID & Separation of Concerns

### CQ-01 — Balance Logic Duplicated Across 7+ Functions (DRY / SRP Violation)

**Files:**
- `src/app/actions/transactions.ts` — `applyBalanceUpdate`, `editTransactionAction`, `convertToSplitAction`, `collapseSplitToSingleAction`
- `src/app/actions/deleteTransaction.ts` — `deleteTransactionAction`, `deleteAllSplitSiblingsAction`
- `src/app/actions/gmail.ts` — `approvePendingAction`, `syncGmailAction` (auto-approve path)

**Current issue:** The read-then-write balance adjustment pattern is
copy-pasted with slight variations in at least 8 locations. Each copy
handles the income/expense/transfer branches independently, and several
omit the transfer destination (see BUG-02 in the reliability review).
Changes to balance logic must be made in every copy — a guaranteed source
of drift.

**Recommended refactor:** Extract a single `adjustAccountBalance(supabase,
accountId, delta)` function in a shared module (e.g.,
`src/lib/domain/balance.ts`). Better yet, implement this as a Postgres RPC
(see SEC-02/BUG-01) so it is atomic. Then call it from every mutation that
affects balances.

```typescript
// src/lib/domain/balance.ts
export async function adjustBalance(
  supabase: SupabaseClient, accountId: string, delta: number
) {
  await supabase.rpc("adjust_balance", { p_account_id: accountId, p_delta: delta });
}

export async function reverseBalanceEffect(
  supabase: SupabaseClient, txn: { type: string; amount: number; account_id: string; transfer_to_account_id?: string | null }
) {
  const amt = Number(txn.amount);
  if (txn.type === "expense") await adjustBalance(supabase, txn.account_id, amt);
  else if (txn.type === "income") await adjustBalance(supabase, txn.account_id, -amt);
  else if (txn.type === "transfer") {
    await adjustBalance(supabase, txn.account_id, amt);
    if (txn.transfer_to_account_id) await adjustBalance(supabase, txn.transfer_to_account_id, -amt);
  }
}
```

**Benefit:** Single source of truth for balance math; eliminates the class of
bugs where one copy handles transfers and another does not.

---

### CQ-02 — `transactions.ts` Is a 500-Line God Module

**File:** `src/app/actions/transactions.ts`

**Current issue:** A single file exports 6 public server actions
(`addTransactionAction`, `editTransactionAction`,
`updatePendingTransactionAction`, `convertToSplitAction`,
`collapseSplitToSingleAction`) plus a private `applyBalanceUpdate` helper.
These serve fundamentally different use-cases (create, edit, split
conversion, collapse) but are all entangled in one module.

**Recommended refactor:** Split into focused modules aligned to operation:

```
src/app/actions/
  transactions/
    add.ts               # addTransactionAction
    edit.ts              # editTransactionAction
    updatePending.ts     # updatePendingTransactionAction
    splitConvert.ts      # convertToSplitAction
    splitCollapse.ts     # collapseSplitToSingleAction
    index.ts             # re-export barrel
```

Each module imports shared helpers (balance adjustments, Zod schemas) from a
`src/lib/domain/` layer.

**Benefit:** Smaller files are easier to review, test individually, and
reason about. Each module has a single reason to change.

---

### CQ-03 — `gmail.ts` Mixes I/O, Parsing, Categorization, and Persistence

**File:** `src/app/actions/gmail.ts` — `syncGmailAction` (~250 lines)

**Current issue:** The sync function is responsible for:
1. Gmail API HTTP calls and MIME parsing
2. Dedup queries against two tables
3. Regex parsing orchestration
4. LLM parsing orchestration and provider selection
5. Historical category matching
6. New category creation
7. Alert profile matching
8. Transaction / pending_transaction insertion
9. Balance updates
10. Sync timestamp bookkeeping

This violates the Single Responsibility Principle and makes the function
untestable without a live database and Gmail API.

**Recommended refactor:** Decompose into a pipeline of pure/testable
functions:

```
fetchEmails(token, query)            → RawEmail[]
dedup(emails, existingIds)           → RawEmail[]
parse(emails, regexEnabled, llmCfg)  → ParsedEmail[]
categorize(parsed, history, cats)    → CategorizedEmail[]
matchAccounts(categorized, profiles) → MatchedEmail[]
persist(matched, supabase, userId)   → SaveResult
```

Each step is a pure function (except `fetchEmails` and `persist`) and can be
unit-tested with fixture data.

**Benefit:** Testability; ability to add integration tests for each pipeline
stage; easier debugging when sync produces unexpected results.

---

### CQ-04 — No Domain Types — `any` Used Pervasively

**Files:** All server actions, `src/lib/data/dashboard.ts`,
`src/lib/email/llmParser.ts`, `src/lib/email/parser.ts`

**Current issue:** Server actions accept `FormData`, then manually extract
and cast with `as string`, passing untyped objects through the system:

```typescript
async function applyBalanceUpdate(supabase: any, payload: any) { ... }
```

Supabase query results are untyped (`data: any`), and dashboard data
transformation maps produce ad-hoc object shapes with no interface
definition. The transaction shape is ad-hoc in every location — each
consumer picks its own set of fields.

**Recommended refactor:**

1. Generate Supabase types with `supabase gen types typescript` and use
   `Database["public"]["Tables"]["transactions"]["Row"]` throughout.
2. Define explicit domain interfaces:

```typescript
// src/lib/types/transaction.ts
export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  account_id: string;
  category_id: string | null;
  date: string;
  note: string | null;
  transfer_to_account_id: string | null;
  split_group_id: string | null;
  source_email_id: string | null;
}

export interface TransactionWithRelations extends Transaction {
  category?: { name: string; icon: string; color: string };
  account?: { name: string; type: string };
  transfer_account?: { name: string; type: string };
}
```

3. Replace `any` in `applyBalanceUpdate` and all helpers with typed
   parameters.

**Benefit:** Compile-time detection of field-name typos, missing fields, and
type mismatches. Eliminates the class of bugs where a field exists in one
ad-hoc shape but not another.

---

### CQ-05 — Data Transformation Mixed Into Data-Fetch Layer

**File:** `src/lib/data/dashboard.ts` — `getDashboardData`

**Current issue:** The ~180-line function performs two unrelated jobs:
1. **Data fetching** — four parallel Supabase queries
2. **Data transformation** — net worth calculation, date grouping,
   spending donut aggregation, goal formatting, etc.

The transformation logic cannot be tested without mocking Supabase, and the
data shapes returned are tightly coupled to UI component expectations.

**Recommended refactor:** Split into:

```typescript
// src/lib/data/dashboard.ts — only fetches
export async function fetchDashboardRaw(supabase, userId) {
  const [accounts, transactions, goals, categories] = await Promise.all([...]);
  return { accounts, transactions, goals, categories };
}

// src/lib/transforms/dashboard.ts — pure, testable
export function transformDashboardData(raw: DashboardRaw): DashboardView {
  // net worth, grouping, spending, etc.
}
```

**Benefit:** The transform functions can be unit-tested with JSON fixtures.
The fetch functions can be integration-tested against a Supabase test
project. Neither depends on the other.

---

## Testability

### CQ-06 — No Test Infrastructure

**Files:** `package.json`, project root

**Current issue:** There are no test files, no test runner configured
(`jest`, `vitest`, `@testing-library/react`), and no test scripts in
`package.json`. The only test-adjacent file is `scratch_test.ts` at the
root.

**Recommended enhancement:**

1. Add `vitest` (fast, native ESM/TS support, integrates with Next.js):
   ```json
   "devDependencies": {
     "vitest": "^3.x",
     "@testing-library/react": "^16.x"
   }
   ```
2. Start with unit tests for pure functions (regex parser, data transforms,
   balance helpers) — these offer the highest value-to-effort ratio.
3. Add a `test` script to `package.json`.

**Benefit:** Regression safety for the most error-prone code paths (balance
math, email parsing, data transformation).

---

### CQ-07 — Server Actions Are Untestable in Isolation

**Files:** All `src/app/actions/*.ts`

**Current issue:** Every server action creates its own Supabase client
internally:

```typescript
export async function addTransactionAction(formData: FormData) {
  const supabase = await createClient(); // ← hard-wired dependency
```

This makes it impossible to inject a test double, mock database, or test
the business logic without a running Supabase instance.

**Recommended refactor:** Extract the core logic into service functions that
accept a Supabase client as a parameter:

```typescript
// src/lib/services/transactions.ts
export async function addTransaction(supabase: SupabaseClient, userId: string, input: TransactionInput) {
  // validation, insert, balance update — all testable with a mock client
}

// src/app/actions/transactions.ts — thin wrapper
export async function addTransactionAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  return addTransaction(supabase, user.id, parseFormData(formData));
}
```

**Benefit:** Service functions can be tested with a mock Supabase client.
Server actions become thin adapters that only handle auth + FormData parsing.

---

### CQ-08 — Regex Parser Has No Test Suite Despite High Complexity

**File:** `src/lib/email/parser.ts`

**Current issue:** The regex parser (`parseTransactionText`) contains 15+
regex patterns for different Indian bank formats, amount extraction, date
extraction, and merchant extraction. This is the single most logic-dense
pure function in the codebase, yet has zero tests. Any regex change risks
silently breaking parsing for a bank format.

**Recommended enhancement:** Create a test file with fixture emails for
each bank format:

```typescript
// src/lib/email/__tests__/parser.test.ts
describe("parseTransactionText", () => {
  it("parses HDFC debit alert", () => { ... });
  it("parses ICICI credit alert", () => { ... });
  it("parses Amex India alert", () => { ... });
  it("returns null for non-transaction email", () => { ... });
  it("extracts date in DD/MM/YYYY format", () => { ... });
});
```

**Benefit:** Confidence when modifying regex patterns; regression detection.

---

## Readability & Maintainability

### CQ-09 — Repeated Auth Boilerplate in Every Server Action

**Files:** All 8 files in `src/app/actions/`

**Current issue:** Every server action starts with the same 4-line auth
check:

```typescript
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return { error: "Unauthorized" };
```

This is repeated ~20 times across the codebase.

**Recommended refactor:** Create a `withAuth` higher-order function:

```typescript
// src/lib/auth/withAuth.ts
export function withAuth<T>(
  handler: (supabase: SupabaseClient, user: User) => Promise<T>
): () => Promise<T | { error: string }> {
  return async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };
    return handler(supabase, user);
  };
}
```

**Benefit:** Eliminates 60+ lines of duplicated boilerplate; ensures
consistent auth error response format; single place to add future auth
logic (role checks, rate limiting).

---

### CQ-10 — Hardcoded Currency `"₹"` in Multiple Data Functions

**Files:**
- `src/lib/data/dashboard.ts` — `getDashboardData` returns `currency: "₹"`
- `src/lib/data/dashboard.ts` — `getReportsData` returns `currency: "₹"`
- `src/lib/data/budgets.ts` — `getBudgetsData` returns `currency: "₹"`

**Current issue:** The user's `currency_code` is stored in `profiles` but
the data layer ignores it, hardcoding `"₹"` in every return value. When a
non-INR user changes their profile currency, the dashboard, reports, and
budgets pages still show ₹.

**Recommended refactor:** Fetch `currency_code` from the profile in each
data function (or accept it as a parameter) and return it:

```typescript
const { data: profile } = await supabase
  .from("profiles")
  .select("currency_code")
  .eq("id", user.id)
  .single();

return { currency: profile?.currency_code || "INR", ... };
```

Map the code to a symbol in a shared utility:

```typescript
// src/lib/utils/currency.ts
const SYMBOLS: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
export const currencySymbol = (code: string) => SYMBOLS[code] || code;
```

**Benefit:** Correct multi-currency support; single source of truth for
currency display.

---

### CQ-11 — `deleteCategory` Is a Soft-Delete Using Magic Number

**File:** `src/app/actions/categories.ts` — `deleteCategoryAction`

**Current issue:** Categories are "deleted" by setting `sort_order = -9999`.
Consumer code must filter with `.filter(c => c.sort_order !== -9999)`,
which appears in `getDashboardData`, `getBudgetsData`, and likely UI
components.

```typescript
await supabase.from("categories").update({ sort_order: -9999 }).eq("id", id)...;
```

This is a fragile soft-delete mechanism — the magic number is not
centralized, and any new query that forgets the filter will surface
"deleted" categories.

**Recommended refactor:** Use a proper `is_deleted` or `deleted_at` column:

```sql
ALTER TABLE categories ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
```

Add a Postgres view or RLS policy that filters deleted categories
automatically, so consumer code cannot accidentally include them.

At minimum, centralize the filter logic:

```typescript
// src/lib/data/queries.ts
export function activeCategories(query: any) {
  return query.is("deleted_at", null); // or .neq("sort_order", -9999)
}
```

**Benefit:** Eliminates scattered magic-number checks; prevents data leaks
from forgotten filters.

---

### CQ-12 — Inconsistent Return Types Across Server Actions

**Files:** All `src/app/actions/*.ts`

**Current issue:** Server actions return different shapes:

```typescript
// Some return { success: true }
return { success: true };

// Some return { success: true, csv: string }
return { success: true, csv: csvContent };

// Some return { success: true, categoryId: string }
return { success: true, categoryId: data.id };

// Error case: always { error: string }
return { error: "msg" };

// getGmailStatusAction returns a completely different shape:
return { connected: false, pendingCount: 0 };
```

Consumers must individually type-check each response, and there is no
shared result type.

**Recommended refactor:** Define a discriminated union result type:

```typescript
// src/lib/types/action.ts
export type ActionResult<T = void> =
  | { success: true; data?: T }
  | { error: string };
```

Then:

```typescript
export async function addTransactionAction(formData: FormData): Promise<ActionResult> {
  // ...
  return { success: true };
}

export async function exportAllTransactionsAction(): Promise<ActionResult<{ csv: string }>> {
  // ...
  return { success: true, data: { csv: csvContent } };
}
```

**Benefit:** Type-safe consumption on the client; impossible to forget
error-checking; consistent contract.

---

## API & Interface Design

### CQ-13 — Server Actions Accept Raw `FormData` Without Schema Layer

**Files:** All `src/app/actions/*.ts`

**Current issue:** Every action manually extracts fields from `FormData`
with `formData.get("field") as string`, then parses numbers with
`parseFloat()`, constructs dates with `new Date()`, and passes the result
to Zod. Several actions skip Zod entirely (budgets, settings). The
extraction code is repeated per-action with slight variations.

```typescript
const rawAmount = formData.get("amount") as string;
const rawData = {
  amount: rawAmount ? parseFloat(rawAmount) : 0,
  type: formData.get("type") as string,
  account_id: formData.get("account_id") as string,
  // ...
};
```

**Recommended refactor:** Create a generic `parseFormData` utility that uses
Zod's `.transform()` and `.coerce` to handle the conversion in a single
declaration:

```typescript
// src/lib/validation/formData.ts
import { z } from "zod";

export function parseFormDataWithSchema<T extends z.ZodType>(
  schema: T,
  formData: FormData
): z.infer<T> | { error: string } {
  const raw = Object.fromEntries(formData.entries());
  const result = schema.safeParse(raw);
  if (!result.success) return { error: result.error.issues[0].message };
  return result.data;
}

// Usage with coercion:
const transactionSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than zero."),
  type: z.enum(["income", "expense", "transfer"]),
  account_id: z.string().uuid(),
  date: z.coerce.date().transform(d => d.toISOString()),
  // ...
});
```

**Benefit:** Eliminates 5–10 lines of boilerplate per action; ensures
consistent parsing; leverages Zod's coercion instead of manual `parseFloat`
calls that fail silently.

---

### CQ-14 — `getDashboardData` Returns Kitchen-Sink Object

**File:** `src/lib/data/dashboard.ts` — `getDashboardData`

**Current issue:** The function returns a single monolithic object with 11
fields consumed by 6+ different components:

```typescript
return {
  currency, netWorth, todaySpent, income, expenses, savings,
  pendingTransactions, accounts, categories, recentTransactions,
  savingsGoals, spendingData
};
```

Every component receives the entire blob and destructures what it needs.
A change to any field potentially affects all consumers. The dashboard
page is the only consumer — it fans the data out to child components.

**Recommended refactor:** Either:
- (A) Split into smaller data functions called in parallel at the page
  level: `getAccountsSummary()`, `getMonthlyTotals()`,
  `getRecentTransactions()`, `getSpendingBreakdown()`, `getGoals()`.
- (B) Return a typed interface and have the page explicitly destructure
  only what each child component needs (acceptable short-term).

Option (A) enables each component to be wrapped in its own `<Suspense>`
boundary with independent loading states.

**Benefit:** Smaller, focused data functions; enables per-component
streaming; reduces coupling between unrelated dashboard sections.

---

### CQ-15 — `resetUserAccountAction` Is an Irreversible Destructive Action With No Confirmation Contract

**File:** `src/app/actions/settings.ts` — `resetUserAccountAction`

**Current issue:** The function deletes all user data across 5 tables with
no server-side confirmation gate:

```typescript
await supabase.from("transactions").delete().eq("user_id", user.id);
await supabase.from("accounts").delete().eq("user_id", user.id);
// ... etc.
```

The only safety check is client-side (a `ConfirmDialog`). If the server
action is called directly (e.g., via curl or a CSRF attack), the user's
entire financial history is permanently deleted.

**Recommended refactor:** Require a confirmation token:

```typescript
export async function resetUserAccountAction(formData: FormData) {
  const confirm = formData.get("confirm_phrase") as string;
  if (confirm !== "DELETE ALL MY DATA") {
    return { error: "Confirmation phrase does not match." };
  }
  // proceed with deletion
}
```

Or require re-authentication (password entry) before executing.

**Benefit:** Server-side guard against accidental or malicious invocation.

---

## Performance Anti-patterns

### CQ-16 — N+1 Dedup Queries in Gmail Sync

**File:** `src/app/actions/gmail.ts` — `syncGmailAction`

**Current issue:** For each of up to 50 emails, the sync function runs 2
sequential database queries for dedup — one against `pending_transactions`
and one against `transactions`:

```typescript
for (const msg of messages) {
  const { data: existingPending } = await supabase
    .from("pending_transactions").select("id").eq("source_email_id", msg.id)...;

  const { data: existingTxns } = await supabase
    .from("transactions").select("id").eq("source_email_id", msg.id)...;
  // ...
}
```

This produces 100 sequential queries + 50 Gmail API fetches = ~150
sequential I/O calls in a single request.

**Recommended refactor:** Batch dedup into two upfront queries:

```typescript
const allMsgIds = messages.map(m => m.id);

const { data: existingPending } = await supabase
  .from("pending_transactions")
  .select("source_email_id")
  .eq("user_id", user.id)
  .in("source_email_id", allMsgIds);

const { data: existingTxns } = await supabase
  .from("transactions")
  .select("source_email_id")
  .eq("user_id", user.id)
  .in("source_email_id", allMsgIds);

const existingSet = new Set([
  ...(existingPending || []).map(p => p.source_email_id),
  ...(existingTxns || []).map(t => t.source_email_id),
]);

// Then filter in-memory
const newMsgs = messages.filter(m => !existingSet.has(m.id));
```

Also parallelize Gmail message fetches with `Promise.allSettled` (with a
concurrency limit of ~5).

**Benefit:** Reduces ~100 DB queries to 2; reduces wall-clock time from
~30s to ~3s for 50 emails.

---

### CQ-17 — Dashboard Monthly Aggregates Computed From Only 50 Rows

**File:** `src/lib/data/dashboard.ts` — `getDashboardData`

**Current issue:** Transactions are fetched with `.limit(50)`, but the
monthly income/expense/savings calculations iterate over this limited set:

```typescript
(transactionsRaw || []).forEach(txn => {
  const txnDate = new Date(txn.date);
  if (txnDate >= monthStart) {
    if (txn.type === 'income') totalIncome += Number(txn.amount);
    if (txn.type === 'expense') totalExpenses += Number(txn.amount);
  }
});
```

For active users with more than 50 transactions/month, the summary grid
shows incorrect numbers.

**Recommended refactor:** Run a server-side aggregate for monthly totals:

```sql
-- Postgres function
CREATE OR REPLACE FUNCTION get_monthly_summary(p_user_id UUID, p_month_start DATE)
RETURNS TABLE(total_income NUMERIC, total_expenses NUMERIC) AS $$
  SELECT
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount END), 0),
    COALESCE(SUM(CASE WHEN type = 'expense' THEN amount END), 0)
  FROM transactions
  WHERE user_id = p_user_id AND date >= p_month_start;
$$ LANGUAGE sql STABLE;
```

Call this via `supabase.rpc()` in `getDashboardData` alongside the
`.limit(50)` query that feeds the recent-transactions list.

**Benefit:** Correct aggregates regardless of transaction volume; reduces
data transfer (aggregate instead of fetching all rows).

---

### CQ-18 — `getBudgetsData` Fires Two Overlapping Transaction Queries

**File:** `src/lib/data/budgets.ts` — `getBudgetsData`

**Current issue:** The function runs two separate queries — one for monthly
expenses and one for weekly expenses:

```typescript
const { data: transactions } = await supabase
  .from("transactions")
  .select("amount, type, category_id, date")
  .eq("user_id", user.id).eq("type", "expense").gte("date", monthStart);

const { data: weeklyTransactions } = await supabase
  .from("transactions")
  .select("amount, type, category_id, date")
  .eq("user_id", user.id).eq("type", "expense").gte("date", weekStart.toISOString());
```

Every weekly transaction is a subset of monthly transactions, so the second
query is entirely redundant — the data already exists in the first result
set.

**Recommended refactor:** Fetch monthly transactions once, then filter
in-memory for the weekly window:

```typescript
const { data: monthlyTxns } = await supabase
  .from("transactions")
  .select("amount, category_id, date")
  .eq("user_id", user.id)
  .eq("type", "expense")
  .gte("date", monthStart);

const weeklyTxns = (monthlyTxns || []).filter(
  t => new Date(t.date) >= weekStart
);
```

**Benefit:** Eliminates one DB round-trip; halves the query load on the
budgets page.

---

### CQ-19 — `getReportsData` Fetches All Transactions Without Pagination

**File:** `src/lib/data/dashboard.ts` — `getReportsData`

**Current issue:** The reports data function fetches every transaction the
user has ever created with no limit:

```typescript
const { data: txns } = await supabase
  .from("transactions")
  .select(`id, amount, type, date, note, account_id, category_id, ...`)
  .eq("user_id", user.id)
  .order("date", { ascending: false });
```

For a user with 10,000+ transactions over years of use, this returns a
multi-megabyte JSON payload in a single server component render. The full
payload is serialized into the RSC stream and sent to the client.

**Recommended refactor:**

1. **Short-term:** Add a date-range parameter (default: last 12 months):
   ```typescript
   export async function getReportsData(months = 12) {
     const since = new Date();
     since.setMonth(since.getMonth() - months);
     // .gte("date", since.toISOString())
   }
   ```

2. **Long-term:** Push aggregation to the database — return pre-computed
   summaries (spending by category per month, trends) instead of raw
   transaction rows. Let the client request drill-down data on demand.

**Benefit:** Bounded response size; faster page loads; lower memory
pressure on serverless functions.

---

## Findings-by-File Index

| File | Findings |
|---|---|
| `src/app/actions/transactions.ts` | CQ-01, CQ-02, CQ-04, CQ-07, CQ-09, CQ-12, CQ-13 |
| `src/app/actions/deleteTransaction.ts` | CQ-01, CQ-09 |
| `src/app/actions/gmail.ts` | CQ-01, CQ-03, CQ-09, CQ-16 |
| `src/app/actions/accounts.ts` | CQ-09, CQ-13 |
| `src/app/actions/budgets.ts` | CQ-09, CQ-13 |
| `src/app/actions/categories.ts` | CQ-09, CQ-11 |
| `src/app/actions/goals.ts` | CQ-09, CQ-13 |
| `src/app/actions/settings.ts` | CQ-09, CQ-15 |
| `src/lib/data/dashboard.ts` | CQ-05, CQ-10, CQ-14, CQ-17, CQ-19 |
| `src/lib/data/budgets.ts` | CQ-10, CQ-18 |
| `src/lib/email/parser.ts` | CQ-08 |
| `src/lib/email/llmParser.ts` | CQ-04 |
| All `src/app/actions/*.ts` | CQ-04, CQ-06, CQ-07, CQ-09, CQ-12, CQ-13 |
| `package.json` | CQ-06 |

