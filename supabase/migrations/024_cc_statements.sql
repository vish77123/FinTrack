-- 024: cc_statements — credit-card statement upload & reconciliation
--
-- A monthly CC statement is uploaded (PDF decrypted + text-extracted in the
-- browser), parsed by LLM into lines, and RECONCILED against transactions
-- that email/SMS auto-processing already imported. Matched lines only link
-- to their existing transaction (no balance effect); unmatched lines can be
-- imported as new transactions.

-- ── 1. Per-card statement PDF password ─────────────────────────────────
-- Saved once, reused for every upload of that card's statements. Protected
-- by the existing accounts RLS policy; only ever sent to the owning user's
-- browser for client-side pdf.js decryption.

alter table public.accounts
  add column if not exists statement_password text;

-- ── 2. Owner tagging on transactions ───────────────────────────────────
-- null = the user themself; otherwise a contact-type account (family member
-- who used the card).

alter table public.transactions
  add column if not exists owner_account_id uuid references public.accounts(id) on delete set null;

-- Allow 'statement' as a transaction source (014 defined manual/email/sms)
alter table public.transactions drop constraint if exists transactions_source_check;
alter table public.transactions
  add constraint transactions_source_check
  check (source in ('manual', 'email', 'sms', 'statement'));

-- ── 3. Statements ───────────────────────────────────────────────────────

create table if not exists public.card_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  statement_date date not null,
  period_start date,
  period_end date,
  due_date date,
  total_due numeric(15, 2),
  min_due numeric(15, 2),
  -- Statement's own summary figures, used as a parse-integrity checksum:
  -- sum(parsed debit lines) must reconcile with total_debits (±1 rupee).
  total_debits numeric(15, 2),
  total_credits numeric(15, 2),
  checksum_ok boolean,
  status text not null default 'review' check (status in ('review', 'reconciled')),
  parsed_by text,
  raw_text text, -- extracted statement text, kept for re-parse/debugging
  created_at timestamptz default now(),
  -- Re-uploading the same statement is idempotent, not a duplicate
  unique (user_id, account_id, statement_date)
);

-- ── 4. Statement lines ──────────────────────────────────────────────────

create table if not exists public.statement_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  statement_id uuid not null references public.card_statements(id) on delete cascade,
  date date not null,
  merchant text,
  amount numeric(15, 2) not null,
  direction text not null check (direction in ('debit', 'credit')),
  raw_text text,
  -- matched   = linked to an existing transaction (no balance effect)
  -- new       = no match found; can be imported
  -- ambiguous = multiple candidates; user must pick (candidates stored below)
  -- ignored   = user chose to skip this line
  -- imported  = a transaction was created from this line
  match_status text not null default 'new'
    check (match_status in ('matched', 'new', 'ambiguous', 'ignored', 'imported')),
  matched_transaction_id uuid references public.transactions(id) on delete set null,
  -- true when the match target is an unapproved pending_transactions row
  -- (no FK possible — pending rows are deleted on approval)
  matched_pending boolean not null default false,
  match_candidates uuid[],
  owner_account_id uuid references public.accounts(id) on delete set null,
  created_at timestamptz default now()
);

-- ── 5. Indexes ──────────────────────────────────────────────────────────

create index if not exists idx_card_statements_user_account
  on public.card_statements (user_id, account_id, statement_date desc);

create index if not exists idx_statement_lines_statement
  on public.statement_lines (statement_id);

create index if not exists idx_statement_lines_matched_txn
  on public.statement_lines (matched_transaction_id)
  where matched_transaction_id is not null;

-- ── 6. RLS ──────────────────────────────────────────────────────────────

alter table public.card_statements enable row level security;
alter table public.statement_lines enable row level security;

create policy "Users can manage own card statements"
on public.card_statements for all using (auth.uid() = user_id);

create policy "Users can manage own statement lines"
on public.statement_lines for all using (auth.uid() = user_id);
