-- ============================================================================
-- MK Solutions — Database & Storage Reset Script (TEST PROJECTS ONLY)
-- File: supabase/reset.sql
-- WARNING: This script permanently drops all MK Solutions tables, functions,
-- policies, and storage objects created by supabase/schema.sql.
-- ============================================================================

begin;

-- 1. Drop storage policies and objects for 'company-assets'
drop policy if exists company_assets_select_policy on storage.objects;
drop policy if exists company_assets_insert_policy on storage.objects;
drop policy if exists company_assets_update_policy on storage.objects;
drop policy if exists company_assets_delete_policy on storage.objects;

delete from storage.objects where bucket_id = 'company-assets';
delete from storage.buckets where id = 'company-assets';

-- 2. Drop all business tables in reverse dependency order (cascade drops policies, triggers, and indexes)
drop table if exists public.salary_records cascade;
drop table if exists public.advances cascade;
drop table if exists public.employees cascade;
drop table if exists public.expenses cascade;
drop table if exists public.expense_categories cascade;
drop table if exists public.payments cascade;
drop table if exists public.sales cascade;
drop table if exists public.dispatches cascade;
drop table if exists public.batches cascade;
drop table if exists public.purchases cascade;
drop table if exists public.customers cascade;
drop table if exists public.suppliers cascade;
drop table if exists public.items cascade;
drop table if exists public.document_counters cascade;
drop table if exists public.company_members cascade;
drop table if exists public.companies cascade;

-- 3. Drop all RPCs and helper/trigger functions
drop function if exists public.rpc_sync_employee_salaries(uuid, jsonb) cascade;
drop function if exists public.rpc_generate_salary_sheet(uuid, text, jsonb) cascade;
drop function if exists public.rpc_update_customer(uuid, uuid, jsonb) cascade;
drop function if exists public.rpc_update_supplier(uuid, uuid, jsonb) cascade;
drop function if exists public.rpc_rename_item(uuid, uuid, text) cascade;
drop function if exists public.rpc_cancel_sale(uuid, uuid, text, jsonb, jsonb) cascade;
drop function if exists public.rpc_update_sale(uuid, uuid, jsonb, jsonb, jsonb) cascade;
drop function if exists public.rpc_create_sale(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) cascade;
drop function if exists public.rpc_edit_dispatch(uuid, uuid, jsonb) cascade;
drop function if exists public.rpc_cancel_batch(uuid, uuid, text, jsonb, jsonb, jsonb) cascade;
drop function if exists public.rpc_save_batch(uuid, jsonb, jsonb, jsonb, jsonb) cascade;
drop function if exists public.rpc_cancel_purchase(uuid, uuid, text, jsonb, jsonb, jsonb) cascade;
drop function if exists public.rpc_save_purchase(uuid, jsonb, jsonb, jsonb, jsonb) cascade;
drop function if exists public.apply_recomputed_snapshots(uuid, jsonb, jsonb, jsonb) cascade;
drop function if exists public.create_company(text) cascade;
drop function if exists public.tg_assign_doc_no() cascade;
drop function if exists public.next_doc_no(uuid, text, integer) cascade;
drop function if exists public.assert_company_member(uuid) cascade;
drop function if exists public.current_company_ids() cascade;
drop function if exists public.tg_set_updated_at() cascade;

commit;
