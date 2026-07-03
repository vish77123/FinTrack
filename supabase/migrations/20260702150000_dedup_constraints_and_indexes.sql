-- Dedup guarantees + lookup indexes (Phase 1 of the stability plan,
-- docs/05-stability-audit.md findings 5 and 9).
--
-- The email/SMS dedup was previously enforced only by application-level
-- SELECT-then-INSERT checks, which race: concurrent webhook deliveries
-- (iPhone Shortcut retries) or overlapping syncs could create duplicate
-- pending transactions. The partial unique indexes below make dedup a
-- database guarantee; application code treats a unique violation (23505)
-- as a clean "already imported" outcome.
--
-- NOTE: apply this migration BEFORE deploying the application code that
-- relies on it (same rule as the atomic-balance migration).

-- ── 1. Clean up any existing duplicates first (unique index creation would
--       fail otherwise). Keeps the lowest-id row per duplicate group; the
--       removed rows are unreviewed pending suggestions, not transactions.

delete from pending_transactions a
 using pending_transactions b
 where a.user_id = b.user_id
   and a.source_email_id is not null
   and a.source_email_id = b.source_email_id
   and a.id > b.id;

delete from pending_transactions a
 using pending_transactions b
 where a.user_id = b.user_id
   and a.raw_sms_id is not null
   and a.raw_sms_id = b.raw_sms_id
   and a.id > b.id;

-- ── 2. Unique dedup guarantees on pending imports

create unique index if not exists uq_pending_txn_user_source_email
  on pending_transactions (user_id, source_email_id)
  where source_email_id is not null;

create unique index if not exists uq_pending_txn_user_raw_sms
  on pending_transactions (user_id, raw_sms_id)
  where raw_sms_id is not null;

-- ── 3. Lookup indexes for hot query paths

-- SMS webhook: profile lookup by secret on every inbound SMS
create index if not exists idx_profiles_webhook_secret
  on profiles (webhook_secret);

-- Dashboard / reports: per-user transaction listing ordered by date
create index if not exists idx_transactions_user_date
  on transactions (user_id, date desc);

-- Gmail sync dedup: .in(source_email_id, [...up to 200 ids])
create index if not exists idx_transactions_user_source_email
  on transactions (user_id, source_email_id)
  where source_email_id is not null;

-- SMS log page: joining raw_sms to its resulting transactions
create index if not exists idx_transactions_user_raw_sms
  on transactions (user_id, raw_sms_id)
  where raw_sms_id is not null;

-- Split operations: fetch/delete all siblings by group
create index if not exists idx_transactions_split_group
  on transactions (split_group_id)
  where split_group_id is not null;

-- Pending tray: per-user pending list + count
create index if not exists idx_pending_txn_user_status
  on pending_transactions (user_id, status);
