-- 024: dashboard_aggregates — Phase 2 of the stability plan
-- (docs/05-stability-audit.md finding 8).
--
-- The dashboard previously fetched EVERY transaction the user has ever
-- recorded and computed month/today totals and the category-spending
-- donut in JS. This function pushes those aggregates into SQL so the app
-- can bound the row fetch to a recent window without losing correctness.
-- Uses idx_transactions_user_date from 023.
--
-- Time boundaries are passed in by the caller (server-local midnight /
-- month start), preserving the exact same boundary semantics the JS
-- computation had.
--
-- SECURITY INVOKER: row-level security on `transactions`/`categories`
-- still applies; the explicit auth.uid() predicate lets the planner use
-- the (user_id, date) index directly.
--
-- IMPORTANT: apply this migration BEFORE deploying the app code that
-- calls it (same rule as 022/023). Until it is applied, the app logs an
-- error and falls back to computing aggregates in JS from the bounded
-- 90-day window.

create or replace function public.get_dashboard_aggregates(
  p_month_start timestamptz,
  p_day_start timestamptz,
  p_day_end timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'income', coalesce((
      select sum(amount)
        from transactions
       where user_id = auth.uid()
         and type = 'income'
         and date >= p_month_start
    ), 0),
    'expenses', coalesce((
      select sum(amount)
        from transactions
       where user_id = auth.uid()
         and type = 'expense'
         and date >= p_month_start
    ), 0),
    'today_spent', coalesce((
      select sum(amount)
        from transactions
       where user_id = auth.uid()
         and type = 'expense'
         and date >= p_day_start
         and date < p_day_end
    ), 0),
    -- Month-to-date expense total per category, for the spending donut.
    -- Matches the old JS behavior: only expenses with a category count.
    'spending', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'name', c.name,
                 'value', s.total,
                 'color', coalesce(c.color, '#888')
               )
               order by s.total desc
             )
        from (
          select category_id, sum(amount) as total
            from transactions
           where user_id = auth.uid()
             and type = 'expense'
             and category_id is not null
             and date >= p_month_start
           group by category_id
        ) s
        join categories c on c.id = s.category_id
    ), '[]'::jsonb)
  );
$$;
