-- ============================================================================
-- MK Solutions — Production PostgreSQL Schema, RLS, Triggers, RPCs & Storage
-- File: supabase/schema.sql
-- Safe to run once on a fresh Supabase project and idempotent on re-run.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Extensions
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Core Helper Trigger Function (updated_at maintenance)
-- ----------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Tables (16 tables, all with company_id, audit columns, status CHECK, details jsonb)
-- ----------------------------------------------------------------------------

-- 2.1 companies
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid generated always as (id) stored,
  name text not null check (btrim(name) <> ''),
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  city text not null default 'Lahore',
  logo_url text,
  final_product_name text not null default 'Final product (Powder)',
  prefixes jsonb not null default '{"purchase":"PUR","batch":"BATCH","dispatch":"DSP","receipt":"RCV","expense":"EXP","advance":"ADV","salary":"SAL"}'::jsonb,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2.2 company_members
create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  details jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_company_members_company_user unique (company_id, user_id),
  constraint uq_company_members_user unique (user_id)
);

-- 2.3 document_counters
create table if not exists public.document_counters (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  doc_type text not null check (doc_type in (
    'purchase',
    'batch',
    'dispatch',
    'bill',
    'receipt',
    'supplier_pay',
    'expense',
    'advance',
    'salary'
  )),
  year integer not null check (year >= 2000 and year <= 2100),
  current_value integer not null default 0 check (current_value >= 0),
  details jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_document_counters_company_type_year unique (company_id, doc_type, year)
);

-- 2.4 items (Rock in tons, Chemicals in bags)
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  kind text not null check (kind in ('rock', 'chemical')),
  low_stock_alert numeric(18,3) check (low_stock_alert is null or low_stock_alert >= 0),
  notes text,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  cancel_reason text,
  cancelled_at timestamptz,
  edited_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2.5 suppliers
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  phone text,
  city text,
  address text,
  opening_balance numeric(18,2) not null default 0,
  notes text,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  cancel_reason text,
  cancelled_at timestamptz,
  edited_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2.6 customers
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  phone text,
  city text,
  address text,
  opening_balance numeric(18,2) not null default 0,
  notes text,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  cancel_reason text,
  cancelled_at timestamptz,
  edited_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2.7 purchases
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  doc_no text not null,
  date date not null,
  supplier_id uuid not null references public.suppliers(id),
  supplier_name text not null,
  lines jsonb not null default '[]'::jsonb,
  rock_line jsonb,
  chemical_lines jsonb not null default '[]'::jsonb,
  subtotal numeric(18,2) not null default 0 check (subtotal >= 0),
  other_charges numeric(18,2) not null default 0 check (other_charges >= 0),
  total_amount numeric(18,2) not null default 0 check (total_amount >= 0),
  paid_now numeric(18,2) not null default 0 check (paid_now >= 0),
  payment_method text check (payment_method is null or payment_method in ('cash', 'bank', 'cheque', 'online')),
  notes text,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  cancel_reason text,
  cancelled_at timestamptz,
  edited_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_purchases_company_doc_no unique (company_id, doc_no)
);

-- 2.8 batches (production batches)
create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  doc_no text not null,
  date date not null,
  rock_item_id uuid not null references public.items(id),
  rock_item_name text not null,
  rock_tons numeric(18,3) not null default 0 check (rock_tons >= 0),
  rock_avg_cost_snapshot numeric(24,10) not null default 0 check (rock_avg_cost_snapshot >= 0),
  rock_cost_snapshot numeric(18,2) not null default 0 check (rock_cost_snapshot >= 0),
  chemical_usages jsonb not null default '[]'::jsonb,
  chemicals_cost_snapshot numeric(18,2) not null default 0 check (chemicals_cost_snapshot >= 0),
  final_product_tons numeric(18,3) not null default 0 check (final_product_tons > 0),
  total_cost_snapshot numeric(18,2) not null default 0 check (total_cost_snapshot >= 0),
  cost_per_ton_snapshot numeric(18,2) not null default 0 check (cost_per_ton_snapshot >= 0),
  raw_cost_per_ton_snapshot numeric(24,10) not null default 0 check (raw_cost_per_ton_snapshot >= 0),
  notes text,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  cancel_reason text,
  cancelled_at timestamptz,
  edited_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_batches_company_doc_no unique (company_id, doc_no)
);

-- 2.9 dispatches
create table if not exists public.dispatches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  doc_no text not null,
  date_time timestamptz not null,
  customer_id uuid not null references public.customers(id),
  customer_name text not null,
  vehicle_number text not null,
  bags_count integer not null default 0 check (bags_count >= 0),
  dispatch_state text not null default 'sent' check (dispatch_state in ('sent', 'sold', 'cancelled')),
  received_weight_tons numeric(18,3) check (received_weight_tons is null or received_weight_tons >= 0),
  rate_per_ton numeric(24,10) check (rate_per_ton is null or rate_per_ton >= 0),
  sale_date date,
  avg_cost_per_ton_snapshot numeric(18,2) check (avg_cost_per_ton_snapshot is null or avg_cost_per_ton_snapshot >= 0),
  raw_avg_cost_per_ton_snapshot numeric(24,10) check (raw_avg_cost_per_ton_snapshot is null or raw_avg_cost_per_ton_snapshot >= 0),
  cogs_snapshot numeric(18,2) check (cogs_snapshot is null or cogs_snapshot >= 0),
  cost_of_powder_sold_snapshot numeric(18,2) check (cost_of_powder_sold_snapshot is null or cost_of_powder_sold_snapshot >= 0),
  bill_id uuid,
  bill_doc_no text,
  notes text,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  cancel_reason text,
  cancelled_at timestamptz,
  edited_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_dispatches_company_doc_no unique (company_id, doc_no)
);

-- 2.10 sales (Customer bills / invoices)
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  doc_no text not null,
  date date not null,
  customer_id uuid not null references public.customers(id),
  customer_name text not null,
  dispatch_id uuid not null references public.dispatches(id),
  dispatch_doc_no text not null,
  dispatch_date_time timestamptz not null,
  vehicle_number text not null,
  bags_count integer not null default 0 check (bags_count >= 0),
  received_weight_tons numeric(18,3) not null check (received_weight_tons > 0),
  rate_per_ton numeric(24,10) not null check (rate_per_ton >= 0),
  subtotal numeric(18,2) not null default 0 check (subtotal >= 0),
  discount numeric(18,2) not null default 0 check (discount >= 0),
  total_amount numeric(18,2) not null default 0 check (total_amount >= 0),
  cost_of_powder_sold_snapshot numeric(18,2) not null default 0 check (cost_of_powder_sold_snapshot >= 0),
  notes text,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  cancel_reason text,
  cancelled_at timestamptz,
  edited_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_sales_company_doc_no unique (company_id, doc_no)
);

-- 2.11 payments (Customer receipts and Supplier payments)
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  doc_no text not null,
  party_type text not null check (party_type in ('customer', 'supplier')),
  date date not null,
  customer_id uuid references public.customers(id),
  supplier_id uuid references public.suppliers(id),
  party_name text not null,
  amount numeric(18,2) not null check (amount > 0),
  method text not null default 'cash' check (method in ('cash', 'bank', 'cheque', 'online')),
  notes text,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  cancel_reason text,
  cancelled_at timestamptz,
  edited_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_payments_company_doc_no unique (company_id, doc_no),
  constraint chk_payments_party_ref check (
    (party_type = 'customer' and customer_id is not null and supplier_id is null) or
    (party_type = 'supplier' and supplier_id is not null and customer_id is null)
  )
);

-- 2.12 expense_categories
create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  value text not null check (btrim(value) <> ''),
  label text not null check (btrim(label) <> ''),
  is_default boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_expense_categories_company_value unique (company_id, value)
);

-- 2.13 expenses
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  doc_no text not null,
  date date not null,
  category text not null,
  description text not null default '',
  amount numeric(18,2) not null check (amount > 0),
  paid_to text,
  method text not null default 'cash' check (method in ('cash', 'bank', 'cheque', 'online')),
  notes text,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  cancel_reason text,
  cancelled_at timestamptz,
  edited_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_expenses_company_doc_no unique (company_id, doc_no)
);

-- 2.14 employees
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  role text not null default 'Worker',
  phone text,
  joining_date date not null,
  basic_salary numeric(18,2) not null default 0 check (basic_salary >= 0),
  active boolean not null default true,
  notes text,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  cancel_reason text,
  cancelled_at timestamptz,
  edited_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2.15 advances (Employee advances)
create table if not exists public.advances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  doc_no text not null,
  date date not null,
  employee_id uuid not null references public.employees(id),
  employee_name text not null,
  amount numeric(18,2) not null check (amount > 0),
  notes text,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  cancel_reason text,
  cancelled_at timestamptz,
  edited_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_advances_company_doc_no unique (company_id, doc_no)
);

-- 2.16 salary_records (Monthly employee salary rows)
create table if not exists public.salary_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  doc_no text not null,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  date date not null,
  employee_id uuid not null references public.employees(id),
  employee_name text not null,
  employee_role text not null default 'Worker',
  basic_salary numeric(18,2) not null default 0 check (basic_salary >= 0),
  bonus numeric(18,2) not null default 0 check (bonus >= 0),
  earlier_balance numeric(18,2) not null default 0,
  advance_deduction numeric(18,2) not null default 0 check (advance_deduction >= 0),
  other_deduction numeric(18,2) not null default 0 check (other_deduction >= 0),
  net_payable numeric(18,2) not null default 0,
  paid_amount numeric(18,2) not null default 0 check (paid_amount >= 0),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  paid_date date,
  payment_method text check (payment_method is null or payment_method in ('cash', 'bank', 'cheque', 'online')),
  notes text,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  cancel_reason text,
  cancelled_at timestamptz,
  edited_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_salary_records_company_doc_no unique (company_id, doc_no)
);

-- ----------------------------------------------------------------------------
-- 3. Indexes on company_id, dates, foreign keys, and status
-- ----------------------------------------------------------------------------
create index if not exists idx_company_members_user_id on public.company_members(user_id);
create index if not exists idx_company_members_company_id on public.company_members(company_id);
create index if not exists idx_document_counters_company_id on public.document_counters(company_id);
create index if not exists idx_items_company_status on public.items(company_id, status);
create index if not exists idx_suppliers_company_status on public.suppliers(company_id, status);
create index if not exists idx_customers_company_status on public.customers(company_id, status);
create index if not exists idx_purchases_company_date on public.purchases(company_id, date desc);
create index if not exists idx_purchases_supplier_id on public.purchases(company_id, supplier_id);
create index if not exists idx_batches_company_date on public.batches(company_id, date desc);
create index if not exists idx_dispatches_company_datetime on public.dispatches(company_id, date_time desc);
create index if not exists idx_dispatches_customer_id on public.dispatches(company_id, customer_id);
create index if not exists idx_sales_company_date on public.sales(company_id, date desc);
create index if not exists idx_sales_customer_id on public.sales(company_id, customer_id);
create index if not exists idx_sales_dispatch_id on public.sales(company_id, dispatch_id);
create index if not exists idx_payments_company_party_date on public.payments(company_id, party_type, date desc);
create index if not exists idx_payments_customer_id on public.payments(company_id, customer_id);
create index if not exists idx_payments_supplier_id on public.payments(company_id, supplier_id);
create index if not exists idx_expense_categories_company_id on public.expense_categories(company_id);
create index if not exists idx_expenses_company_date on public.expenses(company_id, date desc);
create index if not exists idx_employees_company_status on public.employees(company_id, status);
create index if not exists idx_advances_company_employee on public.advances(company_id, employee_id, date desc);
create index if not exists idx_salary_records_company_month on public.salary_records(company_id, month desc);
create index if not exists idx_salary_records_company_employee on public.salary_records(company_id, employee_id);

-- ----------------------------------------------------------------------------
-- 4. Security & Multi-Tenancy Helper Functions
-- ----------------------------------------------------------------------------

-- Returns all active company_ids the currently signed-in user belongs to
create or replace function public.current_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select cm.company_id
  from public.company_members cm
  where cm.user_id = auth.uid()
    and cm.status = 'active';
$$;

-- Raises an exception if the current user is not an active member of p_company
create or replace function public.assert_company_member(p_company uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required. Sign in and try again.';
  end if;

  if p_company is null or not exists (
    select 1
    from public.company_members cm
    where cm.company_id = p_company
      and cm.user_id = auth.uid()
      and cm.status = 'active'
  ) then
    raise exception 'Access denied: you do not belong to this company.';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Document Numbering Function & Before-Insert Triggers
-- ----------------------------------------------------------------------------

-- Concurrency-safe document number generator (e.g. PUR-2026-0001, INV-2026-0001)
create or replace function public.next_doc_no(
  p_company uuid,
  p_type text,
  p_year integer default extract(year from now())::integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefixes jsonb;
  v_prefix text;
  v_next integer;
  v_year integer := coalesce(p_year, extract(year from now())::integer);
begin
  perform public.assert_company_member(p_company);

  select c.prefixes into v_prefixes
  from public.companies c
  where c.id = p_company;

  if p_type = 'bill' then
    v_prefix := 'INV';
  elsif p_type = 'supplier_pay' then
    v_prefix := 'PAY';
  elsif p_type = 'purchase' then
    v_prefix := coalesce(nullif(btrim(v_prefixes->>'purchase'), ''), 'PUR');
  elsif p_type = 'batch' then
    v_prefix := coalesce(nullif(btrim(v_prefixes->>'batch'), ''), 'BATCH');
  elsif p_type = 'dispatch' then
    v_prefix := coalesce(nullif(btrim(v_prefixes->>'dispatch'), ''), 'DSP');
  elsif p_type = 'receipt' then
    v_prefix := coalesce(nullif(btrim(v_prefixes->>'receipt'), ''), 'RCV');
  elsif p_type = 'expense' then
    v_prefix := coalesce(nullif(btrim(v_prefixes->>'expense'), ''), 'EXP');
  elsif p_type = 'advance' then
    v_prefix := coalesce(nullif(btrim(v_prefixes->>'advance'), ''), 'ADV');
  elsif p_type = 'salary' then
    v_prefix := coalesce(nullif(btrim(v_prefixes->>'salary'), ''), 'SAL');
  else
    raise exception 'Unsupported document type: %', p_type;
  end if;

  insert into public.document_counters (company_id, doc_type, year, current_value)
  values (p_company, p_type, v_year, 1)
  on conflict (company_id, doc_type, year)
  do update set
    current_value = public.document_counters.current_value + 1,
    updated_at = now()
  returning current_value into v_next;

  return v_prefix || '-' || v_year::text || '-' || lpad(v_next::text, 4, '0');
end;
$$;

-- Trigger function to auto-assign doc_no when blank or null on insert
create or replace function public.tg_assign_doc_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := tg_argv[0];
  v_year integer;
begin
  if new.doc_no is null or btrim(new.doc_no) = '' then
    if tg_table_name = 'dispatches' then
      v_year := coalesce(extract(year from new.date_time)::integer, extract(year from now())::integer);
    elsif tg_table_name = 'payments' then
      v_year := coalesce(extract(year from new.date)::integer, extract(year from now())::integer);
      if new.party_type = 'supplier' then
        v_type := 'supplier_pay';
      else
        v_type := 'receipt';
      end if;
    else
      v_year := coalesce(extract(year from new.date)::integer, extract(year from now())::integer);
    end if;

    new.doc_no := public.next_doc_no(new.company_id, v_type, v_year);
  end if;
  return new;
end;
$$;

-- Attach updated_at triggers to all 16 tables
drop trigger if exists trg_companies_updated_at on public.companies;
create trigger trg_companies_updated_at before update on public.companies
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_company_members_updated_at on public.company_members;
create trigger trg_company_members_updated_at before update on public.company_members
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_document_counters_updated_at on public.document_counters;
create trigger trg_document_counters_updated_at before update on public.document_counters
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_items_updated_at on public.items;
create trigger trg_items_updated_at before update on public.items
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_suppliers_updated_at on public.suppliers;
create trigger trg_suppliers_updated_at before update on public.suppliers
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at before update on public.customers
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_purchases_updated_at on public.purchases;
create trigger trg_purchases_updated_at before update on public.purchases
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_batches_updated_at on public.batches;
create trigger trg_batches_updated_at before update on public.batches
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_dispatches_updated_at on public.dispatches;
create trigger trg_dispatches_updated_at before update on public.dispatches
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_sales_updated_at on public.sales;
create trigger trg_sales_updated_at before update on public.sales
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at before update on public.payments
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_expense_categories_updated_at on public.expense_categories;
create trigger trg_expense_categories_updated_at before update on public.expense_categories
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_expenses_updated_at on public.expenses;
create trigger trg_expenses_updated_at before update on public.expenses
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_employees_updated_at on public.employees;
create trigger trg_employees_updated_at before update on public.employees
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_advances_updated_at on public.advances;
create trigger trg_advances_updated_at before update on public.advances
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_salary_records_updated_at on public.salary_records;
create trigger trg_salary_records_updated_at before update on public.salary_records
for each row execute function public.tg_set_updated_at();

-- Attach before-insert doc_no triggers to all numbered document tables
drop trigger if exists trg_purchases_doc_no on public.purchases;
create trigger trg_purchases_doc_no before insert on public.purchases
for each row execute function public.tg_assign_doc_no('purchase');

drop trigger if exists trg_batches_doc_no on public.batches;
create trigger trg_batches_doc_no before insert on public.batches
for each row execute function public.tg_assign_doc_no('batch');

drop trigger if exists trg_dispatches_doc_no on public.dispatches;
create trigger trg_dispatches_doc_no before insert on public.dispatches
for each row execute function public.tg_assign_doc_no('dispatch');

drop trigger if exists trg_sales_doc_no on public.sales;
create trigger trg_sales_doc_no before insert on public.sales
for each row execute function public.tg_assign_doc_no('bill');

drop trigger if exists trg_payments_doc_no on public.payments;
create trigger trg_payments_doc_no before insert on public.payments
for each row execute function public.tg_assign_doc_no('receipt');

drop trigger if exists trg_expenses_doc_no on public.expenses;
create trigger trg_expenses_doc_no before insert on public.expenses
for each row execute function public.tg_assign_doc_no('expense');

drop trigger if exists trg_advances_doc_no on public.advances;
create trigger trg_advances_doc_no before insert on public.advances
for each row execute function public.tg_assign_doc_no('advance');

drop trigger if exists trg_salary_records_doc_no on public.salary_records;
create trigger trg_salary_records_doc_no before insert on public.salary_records
for each row execute function public.tg_assign_doc_no('salary');

-- ----------------------------------------------------------------------------
-- 6. Company Onboarding & Atomic Multi-Row RPCs
-- ----------------------------------------------------------------------------

-- 6.1 create_company(p_name text) -> uuid
-- Creates a new company for the signed-in user (or returns their existing company if already set up),
-- links company_members as owner, seeds the default Rock item and default expense categories.
create or replace function public.create_company(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_company_id uuid;
  v_company_id uuid;
  v_trimmed_name text := btrim(coalesce(p_name, ''));
  v_email text;
begin
  if v_user_id is null then
    raise exception 'Authentication required. Sign in to create a company.';
  end if;

  if v_trimmed_name = '' then
    raise exception 'Company name is required.';
  end if;

  -- Check if user already belongs to a company
  select cm.company_id into v_existing_company_id
  from public.company_members cm
  where cm.user_id = v_user_id
    and cm.status = 'active'
  limit 1;

  if v_existing_company_id is not null then
    update public.companies
    set name = v_trimmed_name,
        updated_at = now()
    where id = v_existing_company_id;
    return v_existing_company_id;
  end if;

  select coalesce(u.email, '') into v_email
  from auth.users u
  where u.id = v_user_id;

  insert into public.companies (
    name,
    email,
    city,
    final_product_name,
    prefixes,
    created_by
  )
  values (
    v_trimmed_name,
    coalesce(v_email, ''),
    'Lahore',
    'Final product (Powder)',
    '{"purchase":"PUR","batch":"BATCH","dispatch":"DSP","receipt":"RCV","expense":"EXP","advance":"ADV","salary":"SAL"}'::jsonb,
    v_user_id
  )
  returning id into v_company_id;

  insert into public.company_members (
    company_id,
    user_id,
    role,
    created_by
  )
  values (
    v_company_id,
    v_user_id,
    'owner',
    v_user_id
  );

  -- Seed default Rock item so Rock purchases/batches work immediately
  insert into public.items (
    company_id,
    name,
    kind,
    notes,
    created_by
  )
  values (
    v_company_id,
    'Rock',
    'rock',
    'Default raw rock item',
    v_user_id
  );

  -- Seed default expense categories matching local service defaults
  insert into public.expense_categories (company_id, value, label, is_default, created_by)
  values
    (v_company_id, 'machine_maintenance', 'Machine maintenance', true, v_user_id),
    (v_company_id, 'factory_maintenance', 'Factory maintenance', true, v_user_id),
    (v_company_id, 'electricity', 'Electricity and fuel', true, v_user_id),
    (v_company_id, 'transport', 'Transport', true, v_user_id),
    (v_company_id, 'other', 'Other', true, v_user_id)
  on conflict (company_id, value) do nothing;

  return v_company_id;
end;
$$;

-- Helper: applies recomputed batch, dispatch, and sale snapshots in one transaction
create or replace function public.apply_recomputed_snapshots(
  p_company uuid,
  p_batches jsonb default '[]'::jsonb,
  p_dispatches jsonb default '[]'::jsonb,
  p_sales jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b jsonb;
  v_d jsonb;
  v_s jsonb;
begin
  perform public.assert_company_member(p_company);

  if p_batches is not null and jsonb_typeof(p_batches) = 'array' then
    for v_b in select * from jsonb_array_elements(p_batches)
    loop
      update public.batches
      set rock_avg_cost_snapshot = coalesce((v_b->>'rockAvgCostSnapshot')::numeric(24,10), rock_avg_cost_snapshot),
          rock_cost_snapshot = coalesce((v_b->>'rockCostSnapshot')::numeric(18,2), rock_cost_snapshot),
          chemical_usages = coalesce(v_b->'chemicalUsages', chemical_usages),
          chemicals_cost_snapshot = coalesce((v_b->>'chemicalsCostSnapshot')::numeric(18,2), chemicals_cost_snapshot),
          total_cost_snapshot = coalesce((v_b->>'totalCostSnapshot')::numeric(18,2), total_cost_snapshot),
          cost_per_ton_snapshot = coalesce((v_b->>'costPerTonSnapshot')::numeric(18,2), cost_per_ton_snapshot),
          raw_cost_per_ton_snapshot = coalesce((v_b->>'rawCostPerTonSnapshot')::numeric(24,10), raw_cost_per_ton_snapshot),
          details = case
            when v_b ? 'details' and jsonb_typeof(v_b->'details') = 'object' then details || (v_b->'details')
            else details
          end,
          updated_at = now()
      where id = (v_b->>'id')::uuid
        and company_id = p_company;
    end loop;
  end if;

  if p_dispatches is not null and jsonb_typeof(p_dispatches) = 'array' then
    for v_d in select * from jsonb_array_elements(p_dispatches)
    loop
      update public.dispatches
      set avg_cost_per_ton_snapshot = case
            when v_d->>'avgCostPerTonSnapshot' is not null then (v_d->>'avgCostPerTonSnapshot')::numeric(18,2)
            else avg_cost_per_ton_snapshot
          end,
          raw_avg_cost_per_ton_snapshot = case
            when v_d->>'rawAvgCostPerTonSnapshot' is not null then (v_d->>'rawAvgCostPerTonSnapshot')::numeric(24,10)
            else raw_avg_cost_per_ton_snapshot
          end,
          cogs_snapshot = case
            when v_d->>'cogsSnapshot' is not null then (v_d->>'cogsSnapshot')::numeric(18,2)
            else cogs_snapshot
          end,
          cost_of_powder_sold_snapshot = case
            when v_d->>'costOfPowderSoldSnapshot' is not null then (v_d->>'costOfPowderSoldSnapshot')::numeric(18,2)
            else cost_of_powder_sold_snapshot
          end,
          updated_at = now()
      where id = (v_d->>'id')::uuid
        and company_id = p_company;
    end loop;
  end if;

  if p_sales is not null and jsonb_typeof(p_sales) = 'array' then
    for v_s in select * from jsonb_array_elements(p_sales)
    loop
      update public.sales
      set cost_of_powder_sold_snapshot = coalesce(
            (v_s->>'costOfPowderSoldSnapshot')::numeric(18,2),
            cost_of_powder_sold_snapshot
          ),
          updated_at = now()
      where id = (v_s->>'id')::uuid
        and company_id = p_company;
    end loop;
  end if;
end;
$$;

-- 6.2 rpc_save_purchase: Atomically inserts or updates a purchase and updates all downstream batch/dispatch/sale snapshots
create or replace function public.rpc_save_purchase(
  p_company uuid,
  p_purchase jsonb,
  p_batches jsonb default '[]'::jsonb,
  p_dispatches jsonb default '[]'::jsonb,
  p_sales jsonb default '[]'::jsonb
)
returns public.purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := coalesce((nullif(p_purchase->>'id', ''))::uuid, gen_random_uuid());
  v_exists boolean;
  v_row public.purchases;
begin
  perform public.assert_company_member(p_company);

  select exists(
    select 1 from public.purchases where id = v_id and company_id = p_company
  ) into v_exists;

  if v_exists then
    update public.purchases
    set date = (p_purchase->>'date')::date,
        supplier_id = (p_purchase->>'supplierId')::uuid,
        supplier_name = p_purchase->>'supplierName',
        lines = coalesce(p_purchase->'lines', '[]'::jsonb),
        rock_line = case
          when p_purchase ? 'rockLine' and jsonb_typeof(p_purchase->'rockLine') = 'object' then p_purchase->'rockLine'
          else null
        end,
        chemical_lines = coalesce(p_purchase->'chemicalLines', '[]'::jsonb),
        subtotal = coalesce((p_purchase->>'subtotal')::numeric(18,2), 0),
        other_charges = coalesce((p_purchase->>'otherCharges')::numeric(18,2), 0),
        total_amount = coalesce((p_purchase->>'totalAmount')::numeric(18,2), 0),
        paid_now = coalesce((p_purchase->>'paidNow')::numeric(18,2), 0),
        payment_method = nullif(p_purchase->>'paymentMethod', ''),
        notes = nullif(p_purchase->>'notes', ''),
        details = coalesce(p_purchase->'details', details),
        edited_at = now(),
        updated_at = now()
    where id = v_id and company_id = p_company
    returning * into v_row;
  else
    insert into public.purchases (
      id,
      company_id,
      doc_no,
      date,
      supplier_id,
      supplier_name,
      lines,
      rock_line,
      chemical_lines,
      subtotal,
      other_charges,
      total_amount,
      paid_now,
      payment_method,
      notes,
      details,
      status
    )
    values (
      v_id,
      p_company,
      nullif(btrim(coalesce(p_purchase->>'docNumber', '')), ''),
      (p_purchase->>'date')::date,
      (p_purchase->>'supplierId')::uuid,
      p_purchase->>'supplierName',
      coalesce(p_purchase->'lines', '[]'::jsonb),
      case
        when p_purchase ? 'rockLine' and jsonb_typeof(p_purchase->'rockLine') = 'object' then p_purchase->'rockLine'
        else null
      end,
      coalesce(p_purchase->'chemicalLines', '[]'::jsonb),
      coalesce((p_purchase->>'subtotal')::numeric(18,2), 0),
      coalesce((p_purchase->>'otherCharges')::numeric(18,2), 0),
      coalesce((p_purchase->>'totalAmount')::numeric(18,2), 0),
      coalesce((p_purchase->>'paidNow')::numeric(18,2), 0),
      nullif(p_purchase->>'paymentMethod', ''),
      nullif(p_purchase->>'notes', ''),
      coalesce(p_purchase->'details', '{}'::jsonb),
      'active'
    )
    returning * into v_row;
  end if;

  perform public.apply_recomputed_snapshots(p_company, p_batches, p_dispatches, p_sales);
  return v_row;
end;
$$;

-- 6.3 rpc_cancel_purchase: Atomically cancels a purchase and updates downstream snapshots
create or replace function public.rpc_cancel_purchase(
  p_company uuid,
  p_purchase_id uuid,
  p_reason text,
  p_batches jsonb default '[]'::jsonb,
  p_dispatches jsonb default '[]'::jsonb,
  p_sales jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_company_member(p_company);

  update public.purchases
  set status = 'cancelled',
      cancel_reason = btrim(coalesce(p_reason, '')),
      cancelled_at = now(),
      updated_at = now()
  where id = p_purchase_id
    and company_id = p_company;

  if not found then
    raise exception 'Purchase not found.';
  end if;

  perform public.apply_recomputed_snapshots(p_company, p_batches, p_dispatches, p_sales);
end;
$$;

-- 6.4 rpc_save_batch: Atomically inserts or updates a production batch and updates downstream snapshots
create or replace function public.rpc_save_batch(
  p_company uuid,
  p_batch jsonb,
  p_batches jsonb default '[]'::jsonb,
  p_dispatches jsonb default '[]'::jsonb,
  p_sales jsonb default '[]'::jsonb
)
returns public.batches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := coalesce((nullif(p_batch->>'id', ''))::uuid, gen_random_uuid());
  v_exists boolean;
  v_row public.batches;
begin
  perform public.assert_company_member(p_company);

  select exists(
    select 1 from public.batches where id = v_id and company_id = p_company
  ) into v_exists;

  if v_exists then
    update public.batches
    set date = (p_batch->>'date')::date,
        rock_item_id = (p_batch->>'rockItemId')::uuid,
        rock_item_name = p_batch->>'rockItemName',
        rock_tons = coalesce((p_batch->>'rockTons')::numeric(18,3), 0),
        rock_avg_cost_snapshot = coalesce((p_batch->>'rockAvgCostSnapshot')::numeric(24,10), 0),
        rock_cost_snapshot = coalesce((p_batch->>'rockCostSnapshot')::numeric(18,2), 0),
        chemical_usages = coalesce(p_batch->'chemicalUsages', '[]'::jsonb),
        chemicals_cost_snapshot = coalesce((p_batch->>'chemicalsCostSnapshot')::numeric(18,2), 0),
        final_product_tons = coalesce((p_batch->>'finalProductTons')::numeric(18,3), 0),
        total_cost_snapshot = coalesce((p_batch->>'totalCostSnapshot')::numeric(18,2), 0),
        cost_per_ton_snapshot = coalesce((p_batch->>'costPerTonSnapshot')::numeric(18,2), 0),
        raw_cost_per_ton_snapshot = coalesce((p_batch->>'rawCostPerTonSnapshot')::numeric(24,10), 0),
        notes = nullif(p_batch->>'notes', ''),
        details = coalesce(p_batch->'details', details),
        edited_at = now(),
        updated_at = now()
    where id = v_id and company_id = p_company
    returning * into v_row;
  else
    insert into public.batches (
      id,
      company_id,
      doc_no,
      date,
      rock_item_id,
      rock_item_name,
      rock_tons,
      rock_avg_cost_snapshot,
      rock_cost_snapshot,
      chemical_usages,
      chemicals_cost_snapshot,
      final_product_tons,
      total_cost_snapshot,
      cost_per_ton_snapshot,
      raw_cost_per_ton_snapshot,
      notes,
      details,
      status
    )
    values (
      v_id,
      p_company,
      nullif(btrim(coalesce(p_batch->>'docNumber', '')), ''),
      (p_batch->>'date')::date,
      (p_batch->>'rockItemId')::uuid,
      p_batch->>'rockItemName',
      coalesce((p_batch->>'rockTons')::numeric(18,3), 0),
      coalesce((p_batch->>'rockAvgCostSnapshot')::numeric(24,10), 0),
      coalesce((p_batch->>'rockCostSnapshot')::numeric(18,2), 0),
      coalesce(p_batch->'chemicalUsages', '[]'::jsonb),
      coalesce((p_batch->>'chemicalsCostSnapshot')::numeric(18,2), 0),
      coalesce((p_batch->>'finalProductTons')::numeric(18,3), 0),
      coalesce((p_batch->>'totalCostSnapshot')::numeric(18,2), 0),
      coalesce((p_batch->>'costPerTonSnapshot')::numeric(18,2), 0),
      coalesce((p_batch->>'rawCostPerTonSnapshot')::numeric(24,10), 0),
      nullif(p_batch->>'notes', ''),
      coalesce(p_batch->'details', '{}'::jsonb),
      'active'
    )
    returning * into v_row;
  end if;

  perform public.apply_recomputed_snapshots(p_company, p_batches, p_dispatches, p_sales);
  select * into v_row from public.batches where id = v_id and company_id = p_company;
  return v_row;
end;
$$;

-- 6.5 rpc_cancel_batch: Atomically cancels a production batch and updates downstream snapshots
create or replace function public.rpc_cancel_batch(
  p_company uuid,
  p_batch_id uuid,
  p_reason text,
  p_batches jsonb default '[]'::jsonb,
  p_dispatches jsonb default '[]'::jsonb,
  p_sales jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_company_member(p_company);

  update public.batches
  set status = 'cancelled',
      cancel_reason = btrim(coalesce(p_reason, '')),
      cancelled_at = now(),
      updated_at = now()
  where id = p_batch_id
    and company_id = p_company;

  if not found then
    raise exception 'Production batch not found.';
  end if;

  perform public.apply_recomputed_snapshots(p_company, p_batches, p_dispatches, p_sales);
end;
$$;

-- 6.6 rpc_edit_dispatch: Atomically edits a dispatch and syncs its linked sale (if sold)
create or replace function public.rpc_edit_dispatch(
  p_company uuid,
  p_dispatch_id uuid,
  p_patch jsonb
)
returns public.dispatches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.dispatches;
begin
  perform public.assert_company_member(p_company);

  update public.dispatches
  set date_time = coalesce((nullif(p_patch->>'dateTime', ''))::timestamptz, date_time),
      customer_id = coalesce((nullif(p_patch->>'customerId', ''))::uuid, customer_id),
      customer_name = coalesce(nullif(p_patch->>'customerName', ''), customer_name),
      vehicle_number = coalesce(nullif(p_patch->>'vehicleNumber', ''), vehicle_number),
      bags_count = coalesce((nullif(p_patch->>'bagsCount', ''))::integer, bags_count),
      notes = case when p_patch ? 'notes' then nullif(p_patch->>'notes', '') else notes end,
      details = case
        when p_patch ? 'details' and jsonb_typeof(p_patch->'details') = 'object' then details || (p_patch->'details')
        else details
      end,
      edited_at = now(),
      updated_at = now()
  where id = p_dispatch_id
    and company_id = p_company
  returning * into v_row;

  if not found then
    raise exception 'Dispatch not found.';
  end if;

  if v_row.bill_id is not null then
    update public.sales
    set customer_id = v_row.customer_id,
        customer_name = v_row.customer_name,
        dispatch_date_time = v_row.date_time,
        vehicle_number = v_row.vehicle_number,
        bags_count = v_row.bags_count,
        details = details || jsonb_build_object(
          'driverName', coalesce(v_row.details->>'driverName', ''),
          'driverPhone', coalesce(v_row.details->>'driverPhone', ''),
          'unloadingAddress', coalesce(v_row.details->>'destinationCity', '')
        ),
        edited_at = now(),
        updated_at = now()
    where id = v_row.bill_id
      and company_id = p_company;
  end if;

  return v_row;
end;
$$;

-- 6.7 rpc_create_sale: Atomically creates a sale (bill), updates the dispatch to 'sold', and optionally creates a customer payment receipt
create or replace function public.rpc_create_sale(
  p_company uuid,
  p_sale jsonb,
  p_dispatch_patch jsonb,
  p_payment jsonb default null,
  p_dispatches jsonb default '[]'::jsonb,
  p_sales jsonb default '[]'::jsonb
)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid := coalesce((nullif(p_sale->>'id', ''))::uuid, gen_random_uuid());
  v_dispatch_id uuid := (p_sale->>'dispatchId')::uuid;
  v_sale_row public.sales;
begin
  perform public.assert_company_member(p_company);

  insert into public.sales (
    id,
    company_id,
    doc_no,
    date,
    customer_id,
    customer_name,
    dispatch_id,
    dispatch_doc_no,
    dispatch_date_time,
    vehicle_number,
    bags_count,
    received_weight_tons,
    rate_per_ton,
    subtotal,
    discount,
    total_amount,
    cost_of_powder_sold_snapshot,
    notes,
    details,
    status
  )
  values (
    v_sale_id,
    p_company,
    nullif(btrim(coalesce(p_sale->>'docNumber', '')), ''),
    (p_sale->>'date')::date,
    (p_sale->>'customerId')::uuid,
    p_sale->>'customerName',
    v_dispatch_id,
    p_sale->>'dispatchDocNumber',
    (p_sale->>'dispatchDateTime')::timestamptz,
    p_sale->>'vehicleNumber',
    coalesce((p_sale->>'bagsCount')::integer, 0),
    (p_sale->>'receivedWeightTons')::numeric(18,3),
    (p_sale->>'ratePerTon')::numeric(24,10),
    coalesce((p_sale->>'subtotal')::numeric(18,2), 0),
    coalesce((p_sale->>'discount')::numeric(18,2), 0),
    coalesce((p_sale->>'totalAmount')::numeric(18,2), 0),
    coalesce((p_sale->>'costOfPowderSoldSnapshot')::numeric(18,2), 0),
    nullif(p_sale->>'notes', ''),
    coalesce(p_sale->'details', '{}'::jsonb),
    'active'
  )
  returning * into v_sale_row;

  update public.dispatches
  set dispatch_state = 'sold',
      received_weight_tons = v_sale_row.received_weight_tons,
      rate_per_ton = v_sale_row.rate_per_ton,
      sale_date = v_sale_row.date,
      avg_cost_per_ton_snapshot = coalesce((p_dispatch_patch->>'avgCostPerTonSnapshot')::numeric(18,2), avg_cost_per_ton_snapshot),
      raw_avg_cost_per_ton_snapshot = coalesce((p_dispatch_patch->>'rawAvgCostPerTonSnapshot')::numeric(24,10), raw_avg_cost_per_ton_snapshot),
      cogs_snapshot = v_sale_row.cost_of_powder_sold_snapshot,
      cost_of_powder_sold_snapshot = v_sale_row.cost_of_powder_sold_snapshot,
      bill_id = v_sale_row.id,
      bill_doc_no = v_sale_row.doc_no,
      updated_at = now()
  where id = v_dispatch_id
    and company_id = p_company;

  if p_payment is not null and coalesce((p_payment->>'amount')::numeric(18,2), 0) > 0 then
    insert into public.payments (
      id,
      company_id,
      doc_no,
      party_type,
      date,
      customer_id,
      party_name,
      amount,
      method,
      notes,
      details,
      status
    )
    values (
      coalesce((nullif(p_payment->>'id', ''))::uuid, gen_random_uuid()),
      p_company,
      nullif(btrim(coalesce(p_payment->>'docNumber', '')), ''),
      'customer',
      coalesce((nullif(p_payment->>'date', ''))::date, v_sale_row.date),
      v_sale_row.customer_id,
      v_sale_row.customer_name,
      (p_payment->>'amount')::numeric(18,2),
      coalesce(nullif(p_payment->>'method', ''), 'cash'),
      coalesce(nullif(p_payment->>'notes', ''), 'Received with bill ' || v_sale_row.doc_no),
      coalesce(p_payment->'details', '{}'::jsonb),
      'active'
    );
  end if;

  perform public.apply_recomputed_snapshots(p_company, '[]'::jsonb, p_dispatches, p_sales);
  select * into v_sale_row from public.sales where id = v_sale_id and company_id = p_company;
  return v_sale_row;
end;
$$;

-- 6.8 rpc_update_sale: Atomically updates a sale (bill), its linked dispatch, and downstream snapshots
create or replace function public.rpc_update_sale(
  p_company uuid,
  p_sale_id uuid,
  p_sale jsonb,
  p_dispatches jsonb default '[]'::jsonb,
  p_sales jsonb default '[]'::jsonb
)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_row public.sales;
begin
  perform public.assert_company_member(p_company);

  update public.sales
  set date = coalesce((nullif(p_sale->>'date', ''))::date, date),
      customer_id = coalesce((nullif(p_sale->>'customerId', ''))::uuid, customer_id),
      customer_name = coalesce(nullif(p_sale->>'customerName', ''), customer_name),
      vehicle_number = coalesce(nullif(p_sale->>'vehicleNumber', ''), vehicle_number),
      bags_count = coalesce((nullif(p_sale->>'bagsCount', ''))::integer, bags_count),
      received_weight_tons = coalesce((nullif(p_sale->>'receivedWeightTons', ''))::numeric(18,3), received_weight_tons),
      rate_per_ton = coalesce((nullif(p_sale->>'ratePerTon', ''))::numeric(24,10), rate_per_ton),
      subtotal = coalesce((nullif(p_sale->>'subtotal', ''))::numeric(18,2), subtotal),
      discount = coalesce((nullif(p_sale->>'discount', ''))::numeric(18,2), discount),
      total_amount = coalesce((nullif(p_sale->>'totalAmount', ''))::numeric(18,2), total_amount),
      cost_of_powder_sold_snapshot = coalesce((nullif(p_sale->>'costOfPowderSoldSnapshot', ''))::numeric(18,2), cost_of_powder_sold_snapshot),
      notes = case when p_sale ? 'notes' then nullif(p_sale->>'notes', '') else notes end,
      details = case
        when p_sale ? 'details' and jsonb_typeof(p_sale->'details') = 'object' then details || (p_sale->'details')
        else details
      end,
      edited_at = now(),
      updated_at = now()
  where id = p_sale_id
    and company_id = p_company
  returning * into v_sale_row;

  if not found then
    raise exception 'Bill not found.';
  end if;

  update public.dispatches
  set customer_id = v_sale_row.customer_id,
      customer_name = v_sale_row.customer_name,
      vehicle_number = v_sale_row.vehicle_number,
      bags_count = v_sale_row.bags_count,
      received_weight_tons = v_sale_row.received_weight_tons,
      rate_per_ton = v_sale_row.rate_per_ton,
      sale_date = v_sale_row.date,
      cogs_snapshot = v_sale_row.cost_of_powder_sold_snapshot,
      cost_of_powder_sold_snapshot = v_sale_row.cost_of_powder_sold_snapshot,
      edited_at = now(),
      updated_at = now()
  where id = v_sale_row.dispatch_id
    and company_id = p_company;

  perform public.apply_recomputed_snapshots(p_company, '[]'::jsonb, p_dispatches, p_sales);
  select * into v_sale_row from public.sales where id = p_sale_id and company_id = p_company;
  return v_sale_row;
end;
$$;

-- 6.9 rpc_cancel_sale: Atomically cancels a sale (bill), reverts its linked dispatch to 'sent', and updates downstream snapshots
create or replace function public.rpc_cancel_sale(
  p_company uuid,
  p_sale_id uuid,
  p_reason text,
  p_dispatches jsonb default '[]'::jsonb,
  p_sales jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispatch_id uuid;
begin
  perform public.assert_company_member(p_company);

  update public.sales
  set status = 'cancelled',
      cancel_reason = btrim(coalesce(p_reason, '')),
      cancelled_at = now(),
      updated_at = now()
  where id = p_sale_id
    and company_id = p_company
  returning dispatch_id into v_dispatch_id;

  if not found then
    raise exception 'Bill not found.';
  end if;

  update public.dispatches
  set dispatch_state = 'sent',
      received_weight_tons = null,
      rate_per_ton = null,
      sale_date = null,
      avg_cost_per_ton_snapshot = null,
      raw_avg_cost_per_ton_snapshot = null,
      cogs_snapshot = null,
      cost_of_powder_sold_snapshot = null,
      bill_id = null,
      bill_doc_no = null,
      updated_at = now()
  where id = v_dispatch_id
    and company_id = p_company;

  perform public.apply_recomputed_snapshots(p_company, '[]'::jsonb, p_dispatches, p_sales);
end;
$$;

-- 6.10 rpc_rename_item: Atomically renames an inventory item and updates embedded item names across purchases and batches
create or replace function public.rpc_rename_item(
  p_company uuid,
  p_item_id uuid,
  p_new_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_new_name, ''));
begin
  perform public.assert_company_member(p_company);

  if v_name = '' then
    raise exception 'Item name cannot be empty.';
  end if;

  update public.items
  set name = v_name,
      edited_at = now(),
      updated_at = now()
  where id = p_item_id
    and company_id = p_company;

  if not found then
    raise exception 'Item not found.';
  end if;

  -- Update purchases rock_line, chemical_lines, and lines jsonb where itemId matches
  update public.purchases p
  set rock_line = case
        when p.rock_line is not null and (p.rock_line->>'itemId') = p_item_id::text
        then jsonb_set(p.rock_line, '{itemName}', to_jsonb(v_name))
        else p.rock_line
      end,
      chemical_lines = coalesce((
        select jsonb_agg(
          case
            when (elem->>'itemId') = p_item_id::text
            then jsonb_set(elem, '{itemName}', to_jsonb(v_name))
            else elem
          end
        )
        from jsonb_array_elements(p.chemical_lines) as elem
      ), '[]'::jsonb),
      lines = coalesce((
        select jsonb_agg(
          case
            when (elem->>'itemId') = p_item_id::text
            then jsonb_set(elem, '{itemName}', to_jsonb(v_name))
            else elem
          end
        )
        from jsonb_array_elements(p.lines) as elem
      ), '[]'::jsonb),
      updated_at = now()
  where p.company_id = p_company;

  -- Update batches rock_item_name and chemical_usages jsonb where itemId matches
  update public.batches b
  set rock_item_name = case
        when b.rock_item_id = p_item_id then v_name
        else b.rock_item_name
      end,
      chemical_usages = coalesce((
        select jsonb_agg(
          case
            when (elem->>'itemId') = p_item_id::text
            then jsonb_set(elem, '{itemName}', to_jsonb(v_name))
            else elem
          end
        )
        from jsonb_array_elements(b.chemical_usages) as elem
      ), '[]'::jsonb),
      updated_at = now()
  where b.company_id = p_company;
end;
$$;

-- 6.11 rpc_update_supplier: Atomically updates a supplier and propagates name changes to purchases and payments
create or replace function public.rpc_update_supplier(
  p_company uuid,
  p_supplier_id uuid,
  p_patch jsonb
)
returns public.suppliers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_name text;
  v_row public.suppliers;
begin
  perform public.assert_company_member(p_company);

  select name into v_old_name
  from public.suppliers
  where id = p_supplier_id and company_id = p_company;

  if not found then
    raise exception 'Supplier not found.';
  end if;

  update public.suppliers
  set name = coalesce(nullif(btrim(p_patch->>'name'), ''), name),
      phone = case when p_patch ? 'phone' then nullif(btrim(p_patch->>'phone'), '') else phone end,
      city = case when p_patch ? 'city' then nullif(btrim(p_patch->>'city'), '') else city end,
      address = case when p_patch ? 'address' then nullif(btrim(p_patch->>'address'), '') else address end,
      opening_balance = coalesce((nullif(p_patch->>'openingBalance', ''))::numeric(18,2), opening_balance),
      notes = case when p_patch ? 'notes' then nullif(p_patch->>'notes', '') else notes end,
      details = case
        when p_patch ? 'details' and jsonb_typeof(p_patch->'details') = 'object' then details || (p_patch->'details')
        else details
      end,
      edited_at = now(),
      updated_at = now()
  where id = p_supplier_id and company_id = p_company
  returning * into v_row;

  if v_row.name <> v_old_name then
    update public.purchases
    set supplier_name = v_row.name,
        updated_at = now()
    where company_id = p_company and supplier_id = p_supplier_id;

    update public.payments
    set party_name = v_row.name,
        updated_at = now()
    where company_id = p_company and party_type = 'supplier' and supplier_id = p_supplier_id;
  end if;

  return v_row;
end;
$$;

-- 6.12 rpc_update_customer: Atomically updates a customer and propagates name changes to dispatches, sales, and payments
create or replace function public.rpc_update_customer(
  p_company uuid,
  p_customer_id uuid,
  p_patch jsonb
)
returns public.customers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_name text;
  v_row public.customers;
begin
  perform public.assert_company_member(p_company);

  select name into v_old_name
  from public.customers
  where id = p_customer_id and company_id = p_company;

  if not found then
    raise exception 'Customer not found.';
  end if;

  update public.customers
  set name = coalesce(nullif(btrim(p_patch->>'name'), ''), name),
      phone = case when p_patch ? 'phone' then nullif(btrim(p_patch->>'phone'), '') else phone end,
      city = case when p_patch ? 'city' then nullif(btrim(p_patch->>'city'), '') else city end,
      address = case when p_patch ? 'address' then nullif(btrim(p_patch->>'address'), '') else address end,
      opening_balance = coalesce((nullif(p_patch->>'openingBalance', ''))::numeric(18,2), opening_balance),
      notes = case when p_patch ? 'notes' then nullif(p_patch->>'notes', '') else notes end,
      details = case
        when p_patch ? 'details' and jsonb_typeof(p_patch->'details') = 'object' then details || (p_patch->'details')
        else details
      end,
      edited_at = now(),
      updated_at = now()
  where id = p_customer_id and company_id = p_company
  returning * into v_row;

  if v_row.name <> v_old_name then
    update public.dispatches
    set customer_name = v_row.name,
        updated_at = now()
    where company_id = p_company and customer_id = p_customer_id;

    update public.sales
    set customer_name = v_row.name,
        updated_at = now()
    where company_id = p_company and customer_id = p_customer_id;

    update public.payments
    set party_name = v_row.name,
        updated_at = now()
    where company_id = p_company and party_type = 'customer' and customer_id = p_customer_id;
  end if;

  return v_row;
end;
$$;

-- 6.13 rpc_generate_salary_sheet: Atomically inserts a full monthly salary sheet for a company
create or replace function public.rpc_generate_salary_sheet(
  p_company uuid,
  p_month text,
  p_rows jsonb
)
returns setof public.salary_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_elem jsonb;
  v_inserted public.salary_records;
begin
  perform public.assert_company_member(p_company);

  if exists (
    select 1
    from public.salary_records sr
    where sr.company_id = p_company
      and sr.month = p_month
      and sr.status = 'active'
  ) then
    raise exception 'Salary sheet for % has already been generated. You cannot generate the same month twice.', p_month;
  end if;

  for v_elem in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    insert into public.salary_records (
      id,
      company_id,
      doc_no,
      month,
      date,
      employee_id,
      employee_name,
      employee_role,
      basic_salary,
      bonus,
      earlier_balance,
      advance_deduction,
      other_deduction,
      net_payable,
      paid_amount,
      payment_status,
      notes,
      details,
      status
    )
    values (
      coalesce((nullif(v_elem->>'id', ''))::uuid, gen_random_uuid()),
      p_company,
      nullif(btrim(coalesce(v_elem->>'docNumber', '')), ''),
      p_month,
      (v_elem->>'date')::date,
      (v_elem->>'employeeId')::uuid,
      v_elem->>'employeeName',
      coalesce(nullif(v_elem->>'employeeRole', ''), 'Worker'),
      coalesce((v_elem->>'basicSalary')::numeric(18,2), 0),
      coalesce((v_elem->>'bonus')::numeric(18,2), 0),
      coalesce((v_elem->>'earlierBalance')::numeric(18,2), 0),
      coalesce((v_elem->>'advanceDeduction')::numeric(18,2), 0),
      coalesce((v_elem->>'otherDeduction')::numeric(18,2), 0),
      coalesce((v_elem->>'netPayable')::numeric(18,2), 0),
      0,
      'unpaid',
      nullif(v_elem->>'notes', ''),
      coalesce(v_elem->'details', '{}'::jsonb),
      'active'
    )
    returning * into v_inserted;

    return next v_inserted;
  end loop;
end;
$$;

-- 6.14 rpc_sync_employee_salaries: Atomically updates recalculated unpaid salary rows for an employee
create or replace function public.rpc_sync_employee_salaries(
  p_company uuid,
  p_salary_updates jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s jsonb;
begin
  perform public.assert_company_member(p_company);

  if p_salary_updates is not null and jsonb_typeof(p_salary_updates) = 'array' then
    for v_s in select * from jsonb_array_elements(p_salary_updates)
    loop
      update public.salary_records
      set bonus = coalesce((v_s->>'bonus')::numeric(18,2), bonus),
          earlier_balance = coalesce((v_s->>'earlierBalance')::numeric(18,2), earlier_balance),
          advance_deduction = coalesce((v_s->>'advanceDeduction')::numeric(18,2), advance_deduction),
          other_deduction = coalesce((v_s->>'otherDeduction')::numeric(18,2), other_deduction),
          net_payable = coalesce((v_s->>'netPayable')::numeric(18,2), net_payable),
          paid_amount = coalesce((v_s->>'paidAmount')::numeric(18,2), paid_amount),
          payment_status = coalesce(nullif(v_s->>'paymentStatus', ''), payment_status),
          paid_date = case
            when v_s ? 'paidDate' and nullif(v_s->>'paidDate', '') is not null then (v_s->>'paidDate')::date
            else paid_date
          end,
          payment_method = case
            when v_s ? 'paymentMethod' then nullif(v_s->>'paymentMethod', '')
            else payment_method
          end,
          notes = case when v_s ? 'notes' then nullif(v_s->>'notes', '') else notes end,
          updated_at = now()
      where id = (v_s->>'id')::uuid
        and company_id = p_company;
    end loop;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Row Level Security (RLS) on All 16 Tables
-- ----------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.document_counters enable row level security;
alter table public.items enable row level security;
alter table public.suppliers enable row level security;
alter table public.customers enable row level security;
alter table public.purchases enable row level security;
alter table public.batches enable row level security;
alter table public.dispatches enable row level security;
alter table public.sales enable row level security;
alter table public.payments enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.employees enable row level security;
alter table public.advances enable row level security;
alter table public.salary_records enable row level security;

-- 7.1 companies policies
drop policy if exists companies_select_member on public.companies;
create policy companies_select_member on public.companies
  for select to authenticated
  using (id in (select public.current_company_ids()));

drop policy if exists companies_insert_authenticated on public.companies;
create policy companies_insert_authenticated on public.companies
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists companies_update_member on public.companies;
create policy companies_update_member on public.companies
  for update to authenticated
  using (id in (select public.current_company_ids()))
  with check (id in (select public.current_company_ids()));

drop policy if exists companies_delete_member on public.companies;
create policy companies_delete_member on public.companies
  for delete to authenticated
  using (id in (select public.current_company_ids()));

-- 7.2 company_members policies
drop policy if exists company_members_select_own on public.company_members;
create policy company_members_select_own on public.company_members
  for select to authenticated
  using (user_id = auth.uid() or company_id in (select public.current_company_ids()));

drop policy if exists company_members_insert_own on public.company_members;
create policy company_members_insert_own on public.company_members
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists company_members_update_own on public.company_members;
create policy company_members_update_own on public.company_members
  for update to authenticated
  using (company_id in (select public.current_company_ids()))
  with check (company_id in (select public.current_company_ids()));

drop policy if exists company_members_delete_own on public.company_members;
create policy company_members_delete_own on public.company_members
  for delete to authenticated
  using (company_id in (select public.current_company_ids()));

-- 7.3 Standard tenant isolation policies for the remaining 14 business tables
do $$
declare
  v_table text;
  v_tables text[] := array[
    'document_counters',
    'items',
    'suppliers',
    'customers',
    'purchases',
    'batches',
    'dispatches',
    'sales',
    'payments',
    'expense_categories',
    'expenses',
    'employees',
    'advances',
    'salary_records'
  ];
begin
  foreach v_table in array v_tables
  loop
    execute format('drop policy if exists %I_select_member on public.%I', v_table, v_table);
    execute format(
      'create policy %I_select_member on public.%I for select to authenticated using (company_id in (select public.current_company_ids()))',
      v_table, v_table
    );

    execute format('drop policy if exists %I_insert_member on public.%I', v_table, v_table);
    execute format(
      'create policy %I_insert_member on public.%I for insert to authenticated with check (company_id in (select public.current_company_ids()))',
      v_table, v_table
    );

    execute format('drop policy if exists %I_update_member on public.%I', v_table, v_table);
    execute format(
      'create policy %I_update_member on public.%I for update to authenticated using (company_id in (select public.current_company_ids())) with check (company_id in (select public.current_company_ids()))',
      v_table, v_table
    );

    execute format('drop policy if exists %I_delete_member on public.%I', v_table, v_table);
    execute format(
      'create policy %I_delete_member on public.%I for delete to authenticated using (company_id in (select public.current_company_ids()))',
      v_table, v_table
    );
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. Storage Bucket (company-assets) & Storage Policies
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-assets',
  'company-assets',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists company_assets_select_policy on storage.objects;
create policy company_assets_select_policy on storage.objects
  for select to public
  using (bucket_id = 'company-assets');

drop policy if exists company_assets_insert_policy on storage.objects;
create policy company_assets_insert_policy on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'company-assets'
    and (storage.foldername(name))[1] in (select (public.current_company_ids())::text)
  );

drop policy if exists company_assets_update_policy on storage.objects;
create policy company_assets_update_policy on storage.objects
  for update to authenticated
  using (
    bucket_id = 'company-assets'
    and (storage.foldername(name))[1] in (select (public.current_company_ids())::text)
  )
  with check (
    bucket_id = 'company-assets'
    and (storage.foldername(name))[1] in (select (public.current_company_ids())::text)
  );

drop policy if exists company_assets_delete_policy on storage.objects;
create policy company_assets_delete_policy on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'company-assets'
    and (storage.foldername(name))[1] in (select (public.current_company_ids())::text)
  );

-- ----------------------------------------------------------------------------
-- 9. Grants to authenticated role
-- ----------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

commit;
