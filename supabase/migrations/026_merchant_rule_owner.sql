-- 026: merchant_rule_owner — per-merchant owner memory
--
-- When the user assigns an owner (a contact) to a statement line, the choice
-- is remembered on the merchant rule; future statement lines for the same
-- merchant default to that owner ("Netflix is always Sanket's").

alter table public.merchant_rules
  add column if not exists owner_account_id uuid references public.accounts(id) on delete set null;
