# MK Solutions — Supabase SQL Setup

This directory contains the single-file PostgreSQL schema (`schema.sql`) and test reset script (`reset.sql`) for MK Solutions.

## 1. How to apply the schema (`supabase/schema.sql`)

1. Open your Supabase project dashboard and go to **SQL Editor**.
2. Click **New query**.
3. Copy the entire contents of `supabase/schema.sql` and paste it into the editor.
4. Click **Run** (or press `Ctrl+Enter` / `Cmd+Enter`).
5. The script runs inside a single `begin; ... commit;` transaction and is idempotent—running it a second time will succeed without errors.

## 2. How to verify the installation

After running `supabase/schema.sql`, run these two verification queries in the Supabase SQL Editor:

### Query A: Count tables and verify Row Level Security (RLS) is enabled on all 16 tables
```sql
select
  count(*) over () as total_tables,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;
```

### Query B: List all custom functions and RPCs created in `public`
```sql
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end as security_mode
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;
```

## 3. How to reset a test project (`supabase/reset.sql`)

> **Warning:** Only run `reset.sql` on a development or test project. It permanently deletes all business tables, functions, triggers, RLS policies, and files in the `company-assets` storage bucket.

1. Open **SQL Editor** in your test Supabase project.
2. Copy and paste the contents of `supabase/reset.sql` and click **Run**.
3. You can then re-run `supabase/schema.sql` to start from a clean database.
