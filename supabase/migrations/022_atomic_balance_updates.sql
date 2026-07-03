-- 022: atomic_balance_updates — race-free account balance adjustments
--
-- Balances were previously updated by reading the current value into JS,
-- adding the delta, and writing the result back. Two concurrent mutations
-- (double-click, bulk approve racing an SMS webhook, two devices) would read
-- the same starting value and one update would be silently lost.
--
-- These functions apply the delta inside a single UPDATE statement, so
-- concurrent callers serialize on the row and no update is lost. Called from
-- src/lib/balance.ts, which replaces the read-modify-write helpers that
-- previously lived in actions/transactions.ts and actions/gmail.ts.
--
-- Both run as SECURITY INVOKER: row-level security on `accounts` still
-- decides which rows the caller may touch.
--
-- IMPORTANT: apply this migration BEFORE deploying the app code that calls
-- these functions. Until it is applied, balance updates fail with a visible
-- error instead of silently drifting.

create or replace function public.increment_account_balance(
  p_account_id uuid,
  p_delta numeric
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update accounts
     set balance = coalesce(balance, 0) + p_delta
   where id = p_account_id;

  if not found then
    raise exception 'account % not found or not accessible', p_account_id;
  end if;
end;
$$;

create or replace function public.increment_cc_outstanding(
  p_account_id uuid,
  p_delta numeric
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- No floor at 0: an overpayment is stored as a negative outstanding
  -- balance (a credit on the card) so that apply and reverse are exact
  -- inverses. The dashboard already clamps negative outstanding to 0 when
  -- computing net worth and total credit-card debt.
  update accounts
     set outstanding_balance = coalesce(outstanding_balance, 0) + p_delta
   where id = p_account_id;

  if not found then
    raise exception 'account % not found or not accessible', p_account_id;
  end if;
end;
$$;
