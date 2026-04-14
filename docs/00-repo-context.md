# 00 — Repository Context

> **Generated:** 2026-04-14  
> **Scope:** Understand & summarize only — no improvements, no bug flags.

---

## 1. Application Purpose

**FinTrack** (branded as "Money Manager") is a personal-finance management web
application. It allows individual users to:

- Maintain multiple **financial accounts** (bank, cash, credit card, investment,
  savings, contact/person).
- Record **income, expense, and transfer transactions** — including split
  transactions with a shared `split_group_id`.
- Define per-category **budgets** (monthly or weekly) and track spending against
  them.
- Set and monitor **savings goals** with target amounts and deadlines.
- **Automatically ingest bank transaction alerts** from Gmail via OAuth 2.0,
  parse them into pending transactions, and allow the user to approve/reject
  before committing.
- Receive **SMS-forwarded bank alerts** through a webhook endpoint
  (`POST /api/sms`) secured by a per-user secret.
- View **reports and charts** (spending breakdowns, trends) powered by Recharts.
- Manage personal **settings** (display name, currency, categories, theme,
  email-sync preferences, CSV export).

The primary target audience appears to be Indian users (default currency `₹`,
regex patterns tuned for HDFC, ICICI, Amex India alerts, date locale `en-IN`).

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
| External API (webhook) | `src/app/api/sms/route.ts` — single REST Route Handler |
| Auth & session | Supabase Auth + edge middleware (`src/middleware.ts` → `src/lib/supabase/middleware.ts`) |
| Client state | Zustand store (`src/store/useUIStore.ts`) — UI-only (modals, theme) |
| Styling | CSS Modules + CSS custom properties (design tokens in `globals.css`) |

In architecture-pattern terms this is closest to a **Feature-Sliced / Vertical-Slice
pattern adapted to Next.js conventions**: each dashboard "feature" (transactions,
accounts, budgets, reports, settings, sms) has its own route page that composes
server-side data fetching and client components, with mutations handled by
co-located server actions.

There is **no formal domain/entity layer** (no models directory, no repository
abstraction). Supabase is called directly from server actions and data-fetch
functions.

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
| **Google Generative AI** (`@google/genai`) | ^1.49.0 | Gemini 2.5 Flash — LLM email parser (Layer 2) |
| **Bytez** (`bytez.js`) | ^3.0.0 | Qwen 2.5-7B-Instruct — LLM email parser (Layer 3 fallback) |
| **Gmail REST API** | v1 | Fetch bank alert emails via `googleapis.com` |
| **CSS Modules** | built-in | Scoped component styling |
| **ESLint** | ^9 | Linting (Next.js core-web-vitals + TypeScript config) |

---

## 4. Project Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout (Inter font, metadata)
│   ├── page.tsx                # "/" → redirect to /dashboard
│   ├── globals.css             # Design tokens (light + dark theme)
│   ├── login/
│   │   ├── page.tsx            # Client component: email/password + Google OAuth
│   │   └── actions.ts          # Server Actions: signIn, signUp, resetPassword, signOut
│   ├── auth/callback/route.ts  # OAuth callback: exchange code, store Gmail tokens, seed categories
│   ├── api/sms/route.ts        # Webhook: receive forwarded bank SMS via Supabase RPC
│   ├── actions/                # ── All Server Actions ──
│   │   ├── transactions.ts     # add, edit, approve/reject pending, bulk operations
│   │   ├── deleteTransaction.ts# delete with balance reversal
│   │   ├── accounts.ts         # add, update accounts
│   │   ├── budgets.ts          # add, delete budgets
│   │   ├── categories.ts       # add, soft-delete categories
│   │   ├── goals.ts            # add savings goals
│   │   ├── settings.ts         # profile, currency, CSV export
│   │   └── gmail.ts            # Gmail sync, pending-txn CRUD, email-sync settings, alert profiles
│   └── (dashboard)/            # ── Route Group (shared layout with sidebar) ──
│       ├── layout.tsx          # Auth guard, user profile fetch, sidebar + Suspense wrapper
│       ├── loading.tsx         # Skeleton loading UI
│       ├── dashboard/page.tsx  # Summary grid, pending tray, accounts, transactions, charts, goals
│       ├── transactions/page.tsx
│       ├── accounts/page.tsx
│       ├── budgets/page.tsx
│       ├── reports/page.tsx
│       ├── settings/page.tsx
│       └── sms/page.tsx
├── components/
│   ├── dashboard/              # Feature-specific view components (server + client)
│   ├── sidebar/                # Navigation sidebar (client component)
│   └── ui/                     # Reusable modals, inputs, pickers, dialogs
├── lib/
│   ├── mockData.ts             # Static fixture data for placeholder/dev mode
│   ├── data/
│   │   ├── dashboard.ts        # getDashboardData(), getReportsData()
│   │   └── budgets.ts          # getBudgetsData()
│   ├── email/
│   │   ├── parser.ts           # Layer 1: Regex bank-alert parser (zero API cost)
│   │   ├── llmParser.ts        # Layer 2: Gemini 2.5 Flash (batched, rate-limited, dual-key)
│   │   └── bytezParser.ts      # Layer 3: Bytez / Qwen fallback
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
  unauthenticated users to `/login`.
- The **(dashboard) layout** performs a secondary `getUser()` check and
  redirects to `/login` if no user is found.
- **Placeholder/dev-mode bypass**: when `NEXT_PUBLIC_SUPABASE_URL` contains
  `"placeholder"`, auth checks are skipped and mock data is returned.

### 5.2 Transaction Engine

- **Add / Edit / Delete** via `src/app/actions/transactions.ts` and
  `deleteTransaction.ts`.
- Supports **split transactions** (multiple rows sharing a `split_group_id`).
- Every mutation applies **application-level balance updates** to the
  affected account(s) (no reliance on DB triggers for this).
- **Zod validation** gates all inputs before DB writes.
- `revalidatePath()` is called after mutations to bust the Next.js cache.

### 5.3 Gmail Sync Pipeline

The most architecturally complex subsystem, implemented in
`src/app/actions/gmail.ts` with three parsing layers:

1. **Layer 1 — Regex** (`src/lib/email/parser.ts`): zero-cost, on-server regex
   extraction tuned for Indian bank alerts (HDFC, ICICI, Amex, generic UPI).
   Outputs `ParsedTransaction` with a confidence score.
2. **Layer 2 — Gemini LLM** (`src/lib/email/llmParser.ts`): batches all
   unparsed emails into a single Gemini 2.5 Flash API call. Dual-key
   round-robin with per-minute and per-day rate limits; 429-aware cooldown.
3. **Layer 3 — Bytez** (`src/lib/email/bytezParser.ts`): ultimate fallback via
   Qwen 2.5-7B-Instruct through the Bytez SDK. Includes PII stripping before
   sending text.

Parsed results land in a `pending_transactions` table. Users approve or reject
them via the **PendingTray** UI; approved items are inserted as real
transactions.

### 5.4 SMS Webhook

`POST /api/sms?secret=<webhook_secret>` receives SMS payloads (sender, body,
received_at) and delegates to a Supabase RPC function
`insert_sms_via_webhook`. Each user gets a unique `webhook_secret` stored in
their profile row.

### 5.5 Data Fetching Layer

- `getDashboardData()` runs four parallel Supabase queries (accounts,
  transactions, goals, categories), then transforms raw rows into a UI-ready
  shape (net worth, today's spend, date-grouped transactions, spending
  breakdown, etc.).
- `getReportsData()` fetches all transactions (no limit) with
  category/account joins for the reports page.
- `getBudgetsData()` fetches budgets joined with categories and calculates
  monthly/weekly spend per category.
- All data functions return **mock data** when running in placeholder mode.

### 5.6 Client-Side State

A single Zustand store (`useUIStore`) manages:

- Theme toggle (`light` / `dark`) with `localStorage` persistence.
- Modal visibility flags (transaction, goal, account, category manager).
- Currently-editing transaction state (for the edit-in-modal flow).

No application/domain data is cached on the client; all reads go through RSC.

### 5.7 UI Component Layer

| Folder | Purpose |
|---|---|
| `components/dashboard/` | Page-level view components: `DashboardHeader`, `SummaryGrid`, `AccountCards`, `TransactionList`, `SpendingChart`, `SavingsGoals`, `BudgetsView`, `ReportsView`, `SettingsClient`, `SmsClient`, `PendingTransactions`, `PendingTray` |
| `components/sidebar/` | `Sidebar` — collapsible navigation with user avatar, section links, quick-add FAB |
| `components/ui/` | Reusable primitives: `BaseModal`, `AddTransactionModal`, `AddAccountModal`, `AddBudgetModal`, `AddGoalModal`, `EditAccountModal`, `CategoryManagerModal`, `CategoryPicker`, `ConfirmDialog`, `CurrencyInput`, `EmptyState`, `NavigationProgress`, `SegmentedControl` |

### 5.8 Styling System

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
         → Login page renders (client component)
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
      → revalidatePath("/dashboard", "/transactions", "/accounts")
  → UI refetches via RSC
```

### 6.4 Gmail Sync

```
User triggers sync from PendingTray / Settings
  → Server Action syncGmailAction():
      → Fetch Gmail token from DB
      → Query Gmail API (last 3 days, bank-alert senders)
      → For each email:
          1. Dedup against pending_transactions + transactions
          2. Layer 1: regex parse → if confidence ≥ threshold → create pending
          3. Layer 2: batch remaining through Gemini LLM → create pending
          4. Layer 3: batch remaining through Bytez → create pending
      → Return counts (new, skipped)
  → User reviews pending items → approve/reject
  → Approved → INSERT as transaction + balance update
```

---

## 7. Supabase Tables (Inferred from Code)

The schema is not checked into the repo. Based on Supabase calls, the following
tables are used:

| Table | Key columns (inferred) |
|---|---|
| `profiles` | `id` (= auth.uid), `display_name`, `avatar_url`, `currency_code`, `webhook_secret` |
| `accounts` | `id`, `user_id`, `name`, `type`, `balance`, `icon`, `color`, `is_archived`, `created_at` |
| `transactions` | `id`, `user_id`, `amount`, `type`, `account_id`, `category_id`, `date`, `note`, `transfer_to_account_id`, `split_group_id`, `source_email_id` |
| `categories` | `id`, `user_id`, `name`, `icon`, `color`, `type`, `sort_order` |
| `budgets` | `id`, `user_id`, `category_id`, `amount_limit`, `period`, `start_date`, `created_at` |
| `savings_goals` | `id`, `user_id`, `name`, `target_amount`, `current_amount`, `target_date`, `color`, `icon` |
| `pending_transactions` | `id`, `user_id`, `amount`, `type`, `merchant`, `category_id`, `account_id`, `source_email_id`, `status`, `parsed_date`, `account_last4`, `confidence`, `raw_snippet`, `parser_used`, `suggested_category_name`, `new_category_*` |
| `gmail_tokens` | `user_id`, `access_token`, `refresh_token`, `expires_at`, `email` |
| `email_sync_settings` | `id`, `user_id`, `approval_required`, `regex_enabled`, `llm_enabled`, `sync_interval_minutes`, `gemini_api_key_1`, `gemini_api_key_2`, `bytez_key`, `bytez_model` |
| `account_alert_profiles` | `id`, `user_id`, `account_id`, `email_sender_filter`, `accounts(id, name)` |
| `raw_sms` | `id`, `user_id`, `sender`, `body`, `received_at` |

RPC: `insert_sms_via_webhook(secret, p_sender, p_body, p_received_at)`.

---

## 8. Assumptions & Open Questions

### Assumptions

1. **Supabase Row-Level Security (RLS)** is configured on all tables to enforce
   `user_id = auth.uid()`. The application code always includes `.eq("user_id",
   user.id)` filters, but RLS would be the authoritative enforcement layer.
2. The **database schema and migrations** are managed outside this repository
   (likely via Supabase Dashboard or a separate `supabase/` CLI project). No
   SQL migrations or `supabase/config.toml` are present.
3. **Gmail token refresh** is handled at the OAuth re-authentication level (the
   app detects 401 and tells the user to re-sign-in) rather than via a
   programmatic refresh-token flow.
4. The application is designed as a **single-tenant, multi-user SaaS** — each
   user sees only their own data; there are no team or shared-account features.
5. Currency is stored per-profile (`currency_code`) but the display symbol is
   currently hardcoded to `"₹"` in data-fetch functions.

### Open Questions

1. **Where are the Supabase migrations / schema definitions?** No
   `supabase/migrations/` or SQL files are present. Are they in a separate
   repo or managed via the Supabase Dashboard?
2. **Is there a Gmail token refresh mechanism?** The `auth/callback/route.ts`
   stores `provider_refresh_token`, but no code appears to use it for silent
   renewal.
3. **How is the `raw_sms` table processed after webhook insertion?** The
   webhook inserts via RPC, but no server action or background job reads from
   `raw_sms` to create transactions. Is this handled by a Supabase
   Edge Function or DB trigger?
4. **Are there Supabase DB triggers** (e.g., for auto-creating profile rows on
   sign-up, balance recalculation, or `raw_sms` processing)?
5. **Is the `pending_transactions` status set checked exhaustively?** The code
   references statuses `pending`, `approved`, `rejected` — are there others?
6. **What is the deployment target?** The default README suggests Vercel, but
   this is unconfirmed.
7. **Are there any environment-variable contracts beyond what's inferred?**
   Known env vars: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`,
   `GEMINI_API_KEY[_1|_2]`, `BYTEZ_API_KEY`.