-- 025: statement_line_category — editable parsed lines
--
-- Statement lines can now carry a category (picked/edited during review).
-- On import the category is copied to the created transaction; edits after
-- import propagate to the linked transaction in application code.

alter table public.statement_lines
  add column if not exists category_id uuid references public.categories(id) on delete set null;
