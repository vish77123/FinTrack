# 00 — Repository Context

> **Generated:** 2026-04-14  
> **Updated:** 2026-07-02 — reflects Investments (Zerodha), inline SMS parsing, NVIDIA NIM fallback, credit-card accounts, and merchant rules.  
> **Scope:** Understand & summarize only — no improvements, no bug flags.

---

## 1. Application Purpose

**FinTrack** (branded as "Money Manager") is a personal-finance management web
application. It allows individual users to:

- Maintain multiple **financial accounts** (bank, cash, credit card, investment,
  savings, contact/person). Credit-card accounts carry extra fields (credit
  limit, outstanding balance, statement/due day, min-payment %, APR) and a
  **"Pay Bill" flow**.
- Record **income, expense, and transfer transactions** — including split
  transactions with a shared `split_group_id` (convert single ↔ split), and a
  `cc_payment` type at the parsing layer that is stored as a transfer.
- Define per-category **budgets** (monthly or weekly) and track spending against
  them.
- Set and monitor **savings goals** with target amounts and deadlines.
- **Automatically ingest bank transaction alerts** from Gmail via OAuth 2.0,
  parse them into pending transactions, and allow the user to approve/reject
  before committing.
- Receive **SMS-forwarded bank alerts** (e.g. from iPhone Shortcuts) through a
  webhook endpoint (`POST /api/sms`) secured by a per-user secret. SMS are
  parsed inline through the same regex → LLM pipeline and land as pending
  transactions; a dedicated **SMS Parser page** (`/sms`) shows the log with
  retry/delete controls.
- View **investment portfolios** (`/investments`) — equity and mutual-fund
  holdings pulled live from **Zerodha Kite Connect**, with mock data when not
  connected.
- Define **merchant rules** that rename synced merchant names and
  auto-categorize matching transactions.
- View **reports and charts** (spending breakdowns, trends) powered by Recharts.
- Manage personal **settings** (display name, currency, categories, theme,
  email-sync preferences, AI provider/API keys, webhook secret, CSV export,
  full account reset).

The primary target audience appears to be Indian users (default currency `₹`,
regex patterns tuned for HDFC, ICICI, Amex India alerts, date locale `en-IN`,
Zerodha as the brokerage integration).

---

## 2. Architecture Pattern

The project follows the **Next.js App Router "Server-Action-centric"
architecture**. There is no separate API layer for domain operations; instead,
all mutations flow through React Server Actions (`"use server"` functions).

| Concern | Where it lives |
|---|---|
| Routing & SSR | `src/app/` — file-system routes with `page.tsx` server components |
| Mutations | `src/app/actions/*.ts` — Server Actions validated by Zod |
| Data fetching (read) | `src/lib/data/*.ts` — async functions called from server components |
| External API (webhook & OAuth) | `src/app/api/sms/route.ts` (SMS webhook + inline parsing), `src/app/api/zerodha/login/route.ts` + `src/app/api/zerodha/callback/route.ts` (Kite Connect auth) |
| Auth & session | Supabase Auth + edge middleware (`src/middleware.ts` → `src/lib/supabase/middleware.ts`) |
| Client state | Zustand store (`src/store/useUIStore.ts`) — UI-only (modals, theme) |
| Styling | CSS Modules + CSS custom properties (design tokens in `globals.css`) |

In architecture-pattern terms this is closest to a **Feature-Sliced / Vertical-Slice
pattern adapted to Next.js conventions**: each dashboard "feature" (transactions,
accounts, budgets, reports, investments, settings, sms) has its own route page
that composes server-side data fetching and client components, with mutations
handled by co-located server actions.

There is **no formal domain/entity layer** (no models directory, no repository
abstraction). Supabase is called directly from server actions and data-fetch
functions; Zerodha is called through a thin fetch client (`src/lib/zerodha/client.ts`).

---

## 3. Key Technologies & Frameworks

| Technology | Version | Role |
|---|---|---|
| **Next.js** | 16.2.3 | Full-stack React framework (App Router, Server Actions, Middleware) |
| **React** | 19.2.4 | UI rendering (RSC + client components) |
| **TypeScript** | ^5 | Type safety throughout |
| **Supabase** (`@supabase/ssr`, `@supabase/supabase-js`) | 0.10.2 / 2.103.0 | Postgres DB, Auth (email + Google OAuth), Row-Level Security, RPC |
| **Zod** | ^4.3.6 | Runtime schema validation in server actions |
| **Zustand** | ^5.0.12 | Lightweight client-side state (UI modals, theme toggle) |
| **Recharts** | ^3.8.1 | Charting library for reports / spending donut |
| **Lucide React** | ^1.8.0 | Icon library |
| **Google Generative AI** (`@google/genai`) | ^1.49.0 | Gemini (default `gemini-2.5-flash`, model configurable) — LLM parser for emails & SMS (Layer 2) |
| **NVIDIA NIM** (plain `fetch`, OpenAI-compatible API) | — | `integrate.api.nvidia.com` (default `google/gemma-3n-e4b-it`) — LLM parser fallback (Layer 3), or user-selected primary |
| **Zerodha Kite Connect** (plain `fetch`) | v3 | Equity & mutual-fund holdings for the Investments page |
| **Gmail REST API** | v1 | Fetch bank alert emails via `googleapis.com` |
| **CSS Modules** | built-in | Scoped component styling |
| **ESLint** | ^9 | Linting (Next.js core-web-vitals + TypeScript config) |

> Note: `bytez.js` is still in `package.json` and `src/lib/email/bytezParser.ts`
> / `src/lib/sms/bytezParser.ts` still exist, but they are **no longer imported
> anywhere** — NVIDIA NIM replaced Bytez as the Layer-3 fallback.

---

## 4. Project Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout (Inter font, metadata)
│   ├── page.tsx                # "/" → redirect to /dashboard
│   ├── globals.css             # Design tokens (light + dark theme)
│   ├── login/
│   │   ├── page.tsx            # Server wrapper: forwards Zerodha request_token, else renders LoginClient
│   │   ├── LoginClient.tsx     # Client component: email/password + Google OAuth
│   │   └── actions.ts          # Server Actions: signIn, signUp, resetPassword, signOut
│   ├── auth/callback/route.ts  # OAuth callback: exchange code, store Gmail tokens, seed categories
│   ├── api/
│   │   ├── sms/route.ts        # Webhook: store SMS via RPC, then parse inline (regex → LLM) into pending txn
│   │   └── zerodha/
│   │       ├── login/route.ts  # Redirect to Kite Connect login page
│   │       └── callback/route.ts # Exchange request_token → access_token, save zerodha_credentials
│   ├── actions/                # ── All Server Actions ──
│   │   ├── transactions.ts     # add, edit, split convert/collapse, pending edit, balance updates
│   │   ├── deleteTransaction.ts# delete with balance reversal, delete split siblings
│   │   ├── accounts.ts         # add, update, archive accounts (incl. credit-card fields)
│   │   ├── budgets.ts          # add, delete budgets
│   │   ├── categories.ts       # add, soft-delete categories
│   │   ├── goals.ts            # add savings goals
│   │   ├── settings.ts         # profile, currency, CSV export, full account reset
│   │   ├── gmail.ts            # Gmail sync, pending-txn approve/discard (single + bulk), email-sync settings, alert profiles
│   │   ├── sms.ts              # SMS logs, webhook-secret get/regenerate, retry parse, delete SMS
│   │   └── merchantRulesActions.ts # CRUD for merchant rename/auto-categorize rules
│   └── (dashboard)/            # ── Route Group (shared layout with sidebar) ──
│       ├── layout.tsx          # Auth guard, user profile fetch, sidebar + Suspense wrapper
│       ├── loading.tsx         # Skeleton loading UI
│       ├── dashboard/page.tsx  # Summary grid, pending tray, accounts, transactions, charts, goals
│       ├── transactions/page.tsx
│       ├── accounts/page.tsx
│       ├── budgets/page.tsx
│       ├── investments/page.tsx# Zerodha portfolio (equity + MF)
│       ├── reports/page.tsx
│       ├── settings/page.tsx
│       └── sms/page.tsx        # SMS Parser log (SmsClient)
├── components/
│   ├── dashboard/              # Feature-specific view components (server + client)
│   ├── sidebar/                # Navigation sidebar (client component)
│   └── ui/                     # Reusable modals, inputs, pickers, dialogs
├── lib/
│   ├── mockData.ts             # Static fixture data for placeholder/dev mode
│   ├── data/
│   │   ├── dashboard.ts        # getDashboardData(), getReportsData()
│   │   ├── budgets.ts          # getBudgetsData()
│   │   └── investments.ts      # getInvestmentsData() — Zerodha holdings + P&L summaries, mock fallback
│   ├── email/
│   │   ├── parser.ts           # Layer 1: Regex bank-alert parser (zero API cost)
│   │   ├── llmParser.ts        # Layer 2: Gemini (batched, rate-limited, multi-key round-robin)
│   │   ├── nvidiaParser.ts     # Layer 3: NVIDIA NIM fallback (OpenAI-compatible, PII stripping)
│   │   └── bytezParser.ts      # LEGACY — no longer imported (replaced by nvidiaParser)
│   ├── sms/
│   │   ├── orchestrator.ts     # parseSmsToTransaction(): regex → Gemini → NVIDIA pipeline
│   │   ├── llmParser.ts        # SMS-tuned Gemini parser (same rate-limit logic as email)
│   │   ├── nvidiaParser.ts     # SMS-tuned NVIDIA NIM parser
│   │   └── bytezParser.ts      # LEGACY — no longer imported
│   ├── zerodha/
│   │   ├── client.ts           # Kite Connect REST client (holdings endpoints, auth header)
│   │   ├── types.ts            # EquityHolding, MutualFundHolding, PortfolioSummary, InvestmentsData
│   │   └── mockData.ts         # Mock holdings when Zerodha not connected
│   └── supabase/
│       ├── server.ts           # Server-side Supabase client (cookie-based)
│       ├── client.ts           # Browser-side Supabase client
│       └── middleware.ts       # Session refresh + route protection
└── store/
    └── useUIStore.ts           # Zustand: theme, modal open/close, editing state
```

---

## 5. Key Modules & Responsibilities

### 5.1 Authentication & Authorization

- **Supabase Auth** handles email/password sign-up, Google OAuth (with Gmail
  `readonly` scope), and password reset.
- **Edge Middleware** (`src/middleware.ts` → `src/lib/supabase/middleware.ts`)
  runs on every non-static request: refreshes the session cookie and redirects
  unauthenticated users to `/login`. The matcher **excludes `/api/sms`** — the
  webhook is public and authenticated by its `?secret=` query param instead.
- The **(dashboard) layout** performs a secondary `getUser()` check and
  redirects to `/login` if no user is found.
- **Placeholder/dev-mode bypass**: when `NEXT_PUBLIC_SUPABASE_URL` contains
  `"placeholder"`, auth checks are skipped and mock data is returned.
- `/login/page.tsx` doubles as a **Zerodha redirect shim**: if Kite sends a
  `request_token` there, it forwards to `/api/zerodha/callback`.

### 5.2 Transaction Engine

- **Add / Edit / Delete** via `src/app/actions/transactions.ts` and
  `deleteTransaction.ts`.
- Supports **split transactions** (multiple rows sharing a `split_group_id`),
  including converting a single transaction to a split
  (`convertToSplitAction`), collapsing a split back to one row
  (`collapseSplitToSingleAction`), and deleting all split siblings.
- A **`cc_payment` type** exists at the parsing/pending layer; it is stored as
  a `transfer` in the main `transactions` table.
- Every mutation applies **application-level balance updates** to the
  affected account(s) (no reliance on DB triggers for this). Credit-card
  accounts update `outstanding_balance` (expense = more debt, income /
  cc_payment / transfer-in = less debt, floored at 0) instead of `balance`.
- **Zod validation** gates all inputs before DB writes.
- `revalidatePath()` is called after mutations to bust the Next.js cache.

### 5.3 Gmail Sync Pipeline

The most architecturally complex subsystem, implemented in
`src/app/actions/gmail.ts` with three parsing layers:

1. **Layer 1 — Regex** (`src/lib/email/parser.ts`): zero-cost, on-server regex
   extraction tuned for Indian bank alerts (HDFC, ICICI, Amex, generic UPI).
   Outputs `ParsedTransaction` with a confidence score.
2. **Layer 2 — Gemini LLM** (`src/lib/email/llmParser.ts`): batches all
   unparsed emails into a single Gemini API call. Multi-key round-robin with
   per-minute and per-day rate limits; 429-aware cooldown. Keys and model are
   user-configurable (`gemini_api_keys`, `gemini_model_id` in
   `email_sync_settings`), falling back to env vars.
3. **Layer 3 — NVIDIA NIM** (`src/lib/email/nvidiaParser.ts`): fallback via
   the OpenAI-compatible `integrate.api.nvidia.com` API (default
   `google/gemma-3n-e4b-it`). Includes PII stripping before sending text.
   Users can also select NVIDIA as the **primary** provider
   (`selected_llm_provider = "nvidia"`), skipping Gemini entirely.

Post-parse enrichment before saving a pending transaction:

- **Date-hallucination guard**: if the parsed date is >14 days from the email's
  receipt date, fall back to the email date.
- **Merchant rules** (`merchant_rules` table): exact-match rename + optional
  category override; the raw name is kept in `original_synced_name`.
- **Historical category matching**: previous transactions with the same note
  seed the category when no rule matched.
- **New-category creation** from LLM suggestions is capped per sync run and
  deduplicated against existing category names.

Parsed results land in the `pending_transactions` table. Users approve or
reject them (single or **bulk**) via the **PendingTray** UI; approved items are
inserted as real transactions (carrying `source_email_id` / `raw_sms_id`)
with balance updates applied.

### 5.4 SMS Pipeline

`POST /api/sms?secret=<webhook_secret>` receives SMS payloads (sender, body,
received_at) — e.g. forwarded by an iPhone Shortcut — and now **processes them
inline**:

1. Insert into `raw_sms` via the `insert_sms_via_webhook` Supabase RPC
   (SECURITY DEFINER; validates the per-user `webhook_secret`).
2. Look up the user by secret (requires `SUPABASE_SERVICE_ROLE_KEY` to bypass
   RLS on `profiles`).
3. Run `parseSmsToTransaction()` (`src/lib/sms/orchestrator.ts`): regex
   (reusing the email parser) → Gemini → NVIDIA NIM, honoring the user's
   `email_sync_settings` toggles and provider choice.
4. Apply account matching (alert profiles by `account_last4`), merchant rules,
   and the same date-hallucination guard, then insert a
   `pending_transactions` row with `source = "sms"` and `raw_sms_id`.

Parsing errors never block the HTTP response — the raw SMS is always stored.
The **`/sms` page** (`SmsClient` + `src/app/actions/sms.ts`) lists the last 50
SMS with their parse status (parsed / pending / failed), and offers retry
(re-runs the full pipeline), delete, and webhook-secret view/regenerate.

### 5.5 Investments (Zerodha Kite Connect)

- **Auth flow**: `/api/zerodha/login` redirects to the Kite login page; Kite
  redirects back to `/api/zerodha/callback?request_token=…`, which computes
  `SHA-256(api_key + request_token + api_secret)`, exchanges it for an
  `access_token` at `api.kite.trade/session/token`, and upserts it into the
  per-user `zerodha_credentials` table. Kite access tokens **expire daily at
  6 AM IST**; a 403 from the API surfaces as a "token expired" mock fallback.
- **Data**: `getInvestmentsData()` (`src/lib/data/investments.ts`) fetches
  equity and mutual-fund holdings in parallel via
  `src/lib/zerodha/client.ts`, computes invested/current/P&L/day-change
  summaries, and falls back to mock holdings when not connected or on API
  error.
- **UI**: `/investments` renders `InvestmentsView` (portfolio summary cards,
  holdings tables).
- Requires `ZERODHA_API_KEY` and `ZERODHA_API_SECRET` env vars (server-only).

### 5.6 Merchant Rules

`src/app/actions/merchantRulesActions.ts` provides CRUD over the
`merchant_rules` table (unique per user + `synced_name`). Rules rename a
synced merchant (`synced_name` → `renamed_to`) and optionally force a
category. Applied in the Gmail sync, the SMS webhook, and the SMS retry path;
managed from Settings.

### 5.7 Data Fetching Layer

- `getDashboardData()` runs parallel Supabase queries (accounts,
  transactions, goals, categories), then transforms raw rows into a UI-ready
  shape (net worth, today's spend, date-grouped transactions, spending
  breakdown, etc.).
- `getReportsData()` fetches all transactions (no limit) with
  category/account joins for the reports page.
- `getBudgetsData()` fetches budgets joined with categories and calculates
  monthly/weekly spend per category.
- `getInvestmentsData()` fetches Zerodha holdings (see 5.5).
- All data functions return **mock data** when running in placeholder mode
  (or, for investments, when Zerodha is not connected).

### 5.8 Client-Side State

A single Zustand store (`useUIStore`) manages:

- Theme toggle (`light` / `dark`) with `localStorage` persistence.
- Modal visibility flags (transaction, goal, account, category manager).
- Currently-editing transaction state (for the edit-in-modal flow), including
  transfer target, split-group metadata, and the original synced merchant name
  for pending items.

No application/domain data is cached on the client; all reads go through RSC.

### 5.9 UI Component Layer

| Folder | Purpose |
|---|---|
| `components/dashboard/` | Page-level view components: `DashboardHeader`, `SummaryGrid`, `AccountCards`, `AccountCardsWithPayBill`, `AccountsView`, `TransactionList`, `TransactionsView`, `SpendingChart`, `SavingsGoals`, `BudgetsView`, `InvestmentsView`, `ReportsView`, `SettingsClient`, `SmsClient`, `PendingTray`, `DashboardModals` |
| `components/sidebar/` | `Sidebar` — collapsible navigation with user avatar, section links (incl. Investments, SMS Parser), quick-add FAB |
| `components/ui/` | Reusable primitives: `BaseModal`, `AddTransactionModal`, `AddAccountModal`, `AddBudgetModal`, `AddGoalModal`, `EditAccountModal`, `CategoryManagerModal`, `CategoryPicker`, `ConfirmDialog`, `CurrencyInput`, `EmptyState`, `NavigationProgress`, `SegmentedControl` |

### 5.10 Styling System

- **CSS custom properties** in `globals.css` define a full design-token system
  (colors, shadows, radii) with light and dark theme variants via
  `[data-theme="dark"]`.
- **CSS Modules** (`.module.css`) scope styles per component — no utility-class
  framework (no Tailwind).
- **Inter** (Google Fonts) as the primary typeface.

---

## 6. Critical Execution Paths

### 6.1 First Visit (Unauthenticated)

```
Browser → GET / → page.tsx redirect("/dashboard")
         → Middleware intercepts → no session → redirect("/login")
         → Login page renders (LoginClient client component)
```

### 6.2 Login → Dashboard

```
User submits credentials or clicks Google OAuth
  → Server Action signInWithEmail() | Supabase OAuth flow
  → auth/callback/route.ts (for OAuth): exchange code, store Gmail tokens, seed categories
  → redirect("/dashboard")
  → Middleware refreshes session cookie
  → (dashboard)/layout.tsx: getUser(), fetch profile
  → (dashboard)/dashboard/page.tsx:
      → getDashboardData() [parallel: accounts, transactions, goals, categories]
      → getPendingTransactionsAction()
      → Render: Header, SummaryGrid, PendingTray, AccountCards, TransactionList, SpendingChart, SavingsGoals, Modals
```

### 6.3 Add Transaction

```
User clicks "+" FAB → Zustand opens AddTransactionModal
  → User fills form → submits FormData
  → Server Action addTransactionAction():
      → Zod validates → INSERT into transactions → applyBalanceUpdate()
        (credit cards: outstanding_balance instead of balance)
      → revalidatePath("/dashboard", "/transactions", "/accounts")
  → UI refetches via RSC
```

### 6.4 Gmail Sync

```
User triggers sync from PendingTray / Settings
  → Server Action syncGmailAction():
      → Fetch Gmail token from DB
      → Query Gmail API (lookback window from settings, bank-alert senders)
      → Dedup against pending_transactions + transactions (source_email_id)
      → Layer 1: regex parse each email → high confidence → pending
      → Layers 2/3: batch remaining through Gemini → NVIDIA NIM failover
        (or NVIDIA primary if selected_llm_provider = "nvidia")
      → Per result: date guard, merchant rules, historical category match,
        alert-profile account match, capped new-category creation
      → INSERT pending_transactions → return counts (new, skipped)
  → User reviews pending items → approve/reject (single or bulk)
  → Approved → INSERT as transaction + balance update
```

### 6.5 SMS Webhook

```
iPhone Shortcut → POST /api/sms?secret=<webhook_secret> {sender, body, received_at}
  → RPC insert_sms_via_webhook (validates secret) → raw_sms row
  → Service-role client: look up user by secret, fetch settings + categories
  → parseSmsToTransaction(): regex → Gemini → NVIDIA
  → Dedup, alert-profile account match, merchant rules, date guard
  → INSERT pending_transactions (source = "sms", raw_sms_id)
  → Always respond 200 with {success, smsId, parsed, saved}
```

### 6.6 Zerodha Connect → Investments

```
User clicks Connect on /investments → GET /api/zerodha/login
  → redirect to kite.zerodha.com/connect/login
  → Kite redirects to /api/zerodha/callback?request_token=…
      → checksum = SHA-256(api_key + request_token + api_secret)
      → POST api.kite.trade/session/token → access_token
      → UPSERT zerodha_credentials → redirect /investments?zerodha_connected=1
  → investments/page.tsx → getInvestmentsData()
      → parallel: /portfolio/holdings + /mf/holdings
      → P&L summaries → InvestmentsView (mock fallback if disconnected/expired)
```

---

## 7. Supabase Tables (Inferred from Code)

The schema is not checked into the repo. Based on Supabase calls, the following
tables are used:

| Table | Key columns (inferred) |
|---|---|
| `profiles` | `id` (= auth.uid), `display_name`, `avatar_url`, `currency_code`, `webhook_secret` |
| `accounts` | `id`, `user_id`, `name`, `type`, `balance`, `icon`, `color`, `is_archived`, `created_at`; credit-card only: `credit_limit`, `outstanding_balance`, `statement_day`, `due_day`, `min_payment_pct`, `interest_rate_apr` |
| `transactions` | `id`, `user_id`, `amount`, `type`, `account_id`, `category_id`, `date`, `note`, `transfer_to_account_id`, `split_group_id`, `source_email_id`, `raw_sms_id` |
| `categories` | `id`, `user_id`, `name`, `icon`, `color`, `type`, `sort_order` |
| `budgets` | `id`, `user_id`, `category_id`, `amount_limit`, `period`, `start_date`, `created_at` |
| `savings_goals` | `id`, `user_id`, `name`, `target_amount`, `current_amount`, `target_date`, `color`, `icon` |
| `pending_transactions` | `id`, `user_id`, `account_id`, `category_id`, `type`, `amount`, `date`, `note`, `original_synced_name`, `confidence`, `status`, `raw_snippet`, `parsed_by`, `source` (`email`/`sms`), `source_email_id`, `raw_sms_id` |
| `gmail_tokens` | `user_id`, `access_token`, `refresh_token`, `expires_at`, `email` |
| `email_sync_settings` | `id`, `user_id`, `approval_required`, `regex_enabled`, `llm_enabled`, `sync_interval_minutes`, `sync_lookback_days`, `selected_llm_provider` (`gemini`/`nvidia`), `gemini_api_keys` (array), `gemini_model_id`, `nvidia_api_key`, `nvidia_model_id` |
| `account_alert_profiles` | `id`, `user_id`, `account_id`, `email_sender_filter`, `account_last4`, `auto_import`, `require_confirmation` (unique `user_id,account_id`) |
| `merchant_rules` | `id`, `user_id`, `synced_name` (unique per user), `renamed_to`, `category_id`, `created_at` |
| `zerodha_credentials` | `user_id` (unique), `api_key`, `access_token`, `token_date`, `updated_at` |
| `raw_sms` | `id`, `user_id`, `sender`, `body`, `received_at`, `created_at` |

RPCs: `insert_sms_via_webhook(secret, p_sender, p_body, p_received_at)` →
returns the new `raw_sms` id; `gen_random_uuid()` (webhook-secret rotation,
with a JS `crypto.randomUUID()` fallback).

---

## 8. Assumptions & Open Questions

### Assumptions

1. **Supabase Row-Level Security (RLS)** is configured on all tables to enforce
   `user_id = auth.uid()`. The application code always includes `.eq("user_id",
   user.id)` filters, but RLS would be the authoritative enforcement layer.
   The SMS webhook additionally relies on the **service-role key** to look up
   profiles by `webhook_secret`, and on `insert_sms_via_webhook` being a
   SECURITY DEFINER function.
2. The **database schema and migrations** are managed outside this repository
   (likely via Supabase Dashboard or a separate `supabase/` CLI project). No
   SQL migrations or `supabase/config.toml` are present.
3. **Gmail token refresh** is handled at the OAuth re-authentication level (the
   app detects 401 and tells the user to re-sign-in) rather than via a
   programmatic refresh-token flow. Similarly, **Zerodha access tokens expire
   daily** and require a manual re-login through `/api/zerodha/login`.
4. The application is designed as a **single-tenant, multi-user SaaS** — each
   user sees only their own data; there are no team or shared-account features.
5. Currency is stored per-profile (`currency_code`) but the display symbol is
   currently hardcoded to `"₹"` in data-fetch functions.
6. The **Bytez parsers are dead code**: `bytez.js` remains a dependency and
   both `bytezParser.ts` files still exist, but nothing imports them since the
   NVIDIA NIM fallback was introduced.

### Open Questions

1. **Where are the Supabase migrations / schema definitions?** No
   `supabase/migrations/` or SQL files are present. Are they in a separate
   repo or managed via the Supabase Dashboard?
2. **Is there a Gmail token refresh mechanism?** The `auth/callback/route.ts`
   stores `provider_refresh_token`, but no code appears to use it for silent
   renewal.
3. **Are there Supabase DB triggers** (e.g., for auto-creating profile rows on
   sign-up, generating `webhook_secret`, or balance recalculation)?
4. **Is the `pending_transactions` status set checked exhaustively?** The code
   references statuses `pending`, `approved`, `rejected` — are there others?
5. **What is the deployment target?** The default README suggests Vercel, but
   this is unconfirmed.
6. **Are there any environment-variable contracts beyond what's inferred?**
   Known env vars: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `NEXT_PUBLIC_SITE_URL`, `GEMINI_API_KEY[_1|_2]`, `NVIDIA_API_KEY`,
   `ZERODHA_API_KEY`, `ZERODHA_API_SECRET` (legacy: `BYTEZ_API_KEY`,
   `ZERODHA_ACCESS_TOKEN` — referenced only in comments/dead code).
