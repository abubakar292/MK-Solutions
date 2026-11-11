import { QueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import type { RecordStatus } from '../../domain/types';
import {
  OFFLINE_SAVE_MESSAGE,
  assertOnlineForSave,
  requireSupabaseClient,
} from '../../lib/supabase';

export { OFFLINE_SAVE_MESSAGE, assertOnlineForSave };

export const PAGE_SIZE = 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
});

export const groupAQueryKeys = {
  company: (companyId: string) => ['supabase', 'groupA', companyId] as const,
  items: (companyId: string) => ['supabase', 'groupA', companyId, 'items'] as const,
  suppliers: (companyId: string) => ['supabase', 'groupA', companyId, 'suppliers'] as const,
  customers: (companyId: string) => ['supabase', 'groupA', companyId, 'customers'] as const,
  purchases: (companyId: string) => ['supabase', 'groupA', companyId, 'purchases'] as const,
  batches: (companyId: string) => ['supabase', 'groupA', companyId, 'batches'] as const,
  dispatches: (companyId: string) => ['supabase', 'groupA', companyId, 'dispatches'] as const,
  sales: (companyId: string) => ['supabase', 'groupA', companyId, 'sales'] as const,
  supplierPayments: (companyId: string) =>
    ['supabase', 'groupA', companyId, 'payments', 'supplier'] as const,
  customerPayments: (companyId: string) =>
    ['supabase', 'groupA', companyId, 'payments', 'customer'] as const,
  finalProductName: (companyId: string) =>
    ['supabase', 'groupA', companyId, 'finalProductName'] as const,
};

export const groupBQueryKeys = {
  company: (companyId: string) => ['supabase', 'groupB', companyId] as const,
  expenseCategories: (companyId: string) =>
    ['supabase', 'groupB', companyId, 'expenseCategories'] as const,
  expenses: (companyId: string) => ['supabase', 'groupB', companyId, 'expenses'] as const,
  employees: (companyId: string) => ['supabase', 'groupB', companyId, 'employees'] as const,
  advances: (companyId: string) => ['supabase', 'groupB', companyId, 'advances'] as const,
  salaries: (companyId: string) => ['supabase', 'groupB', companyId, 'salaries'] as const,
  settings: (companyId: string) => ['supabase', 'groupB', companyId, 'settings'] as const,
};

export async function invalidateGroupAQueries(
  companyId: string,
  entities?: Array<
    | 'items'
    | 'suppliers'
    | 'customers'
    | 'purchases'
    | 'batches'
    | 'dispatches'
    | 'sales'
    | 'supplierPayments'
    | 'customerPayments'
    | 'finalProductName'
  >
): Promise<void> {
  if (!entities || entities.length === 0) {
    await queryClient.invalidateQueries({
      queryKey: groupAQueryKeys.company(companyId),
    });
    return;
  }

  await Promise.all(
    entities.map((entity) =>
      queryClient.invalidateQueries({
        queryKey: groupAQueryKeys[entity](companyId),
      })
    )
  );
}

export async function invalidateGroupBQueries(
  companyId: string,
  entities?: Array<
    | 'expenseCategories'
    | 'expenses'
    | 'employees'
    | 'advances'
    | 'salaries'
    | 'settings'
  >
): Promise<void> {
  if (!entities || entities.length === 0) {
    await queryClient.invalidateQueries({
      queryKey: groupBQueryKeys.company(companyId),
    });
    return;
  }

  await Promise.all(
    entities.map((entity) =>
      queryClient.invalidateQueries({
        queryKey: groupBQueryKeys[entity](companyId),
      })
    )
  );
}

export async function invalidateAllCompanyQueries(companyId: string): Promise<void> {
  await Promise.all([
    invalidateGroupAQueries(companyId),
    invalidateGroupBQueries(companyId),
    queryClient.invalidateQueries({ queryKey: ['settings', companyId] }),
  ]);
}

/**
 * Normalizes a numeric database value (string, number, or Decimal) into a clean
 * decimal string with exact precision preserved (never IEEE-754 float math).
 */
export function toDecimalString(
  value: Decimal.Value | null | undefined,
  fallback = '0'
): string {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const str = String(value).trim();
  if (!str) {
    return fallback;
  }
  try {
    return new Decimal(str).toFixed();
  } catch {
    return fallback;
  }
}

export function toOptionalDecimalString(
  value: Decimal.Value | null | undefined
): string | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const str = String(value).trim();
  if (!str) {
    return undefined;
  }
  try {
    return new Decimal(str).toFixed();
  } catch {
    return undefined;
  }
}

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Formats Supabase / PostgREST / Postgres errors into clear, actionable messages
 * telling the user what failed and how to fix it.
 */
export function formatSupabaseServiceError(
  error: unknown,
  actionDescription: string
): Error {
  if (error instanceof Error && error.message === OFFLINE_SAVE_MESSAGE) {
    return error;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new Error(OFFLINE_SAVE_MESSAGE);
  }
  if (error instanceof Error && !('code' in error)) {
    return error;
  }

  const rawObj = (error ?? {}) as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
  };
  const message = (rawObj.message || '').trim();
  const code = (rawObj.code || '').trim();
  const lower = message.toLowerCase();

  if (message === OFFLINE_SAVE_MESSAGE) {
    return new Error(OFFLINE_SAVE_MESSAGE);
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed')
  ) {
    return new Error(
      `Could not ${actionDescription} because of a network problem. Check your internet connection and try again.`
    );
  }

  if (code === '42501' || lower.includes('row-level security') || lower.includes('not a member')) {
    return new Error(
      `Could not ${actionDescription} because your account does not have permission for this company. Refresh or sign in again.`
    );
  }

  if (code === '23505' || lower.includes('duplicate key value')) {
    return new Error(
      `Could not ${actionDescription} because a record with the same unique details already exists. Refresh and try again.`
    );
  }

  if (code === '23503' || lower.includes('violates foreign key constraint')) {
    return new Error(
      `Could not ${actionDescription} because this record is still linked to other active records. Cancel or remove the linked records first.`
    );
  }

  if (code === '23514' || lower.includes('violates check constraint')) {
    return new Error(
      `Could not ${actionDescription} because one or more values are out of range. Check quantities and amounts and try again.`
    );
  }

  if (message) {
    return new Error(message);
  }

  return new Error(`Could not ${actionDescription}. Check your input and try again.`);
}

/**
 * Loads all rows for a company from a Supabase table using 1,000-row pages
 * until all rows are retrieved.
 */
export async function fetchAllCompanyRows<TRow>(params: {
  table: string;
  companyId: string;
  actionDescription: string;
  extraFilters?: Array<{ column: string; value: string }>;
  orderByColumn?: string;
  ascending?: boolean;
}): Promise<TRow[]> {
  const client = requireSupabaseClient();
  const {
    table,
    companyId,
    actionDescription,
    extraFilters = [],
    orderByColumn = 'created_at',
    ascending = true,
  } = params;

  const allRows: TRow[] = [];
  let offset = 0;

  while (true) {
    let query = client
      .from(table)
      .select('*')
      .eq('company_id', companyId);

    for (const filter of extraFilters) {
      query = query.eq(filter.column, filter.value);
    }

    query = query
      .order(orderByColumn, { ascending })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    const { data, error } = await query;
    if (error) {
      throw formatSupabaseServiceError(error, actionDescription);
    }

    const batch = (data ?? []) as TRow[];
    allRows.push(...batch);

    if (batch.length < PAGE_SIZE) {
      break;
    }
    offset += PAGE_SIZE;
  }

  return allRows;
}

/**
 * Domain guard helpers: verify record existence, status rules (canEdit, canCancel, canDelete)
 * before sending mutations to Supabase.
 */
export function canEdit(
  record: { status: RecordStatus } | undefined,
  entityLabel: string,
  notFoundMessage?: string
): void {
  if (!record) {
    throw new Error(notFoundMessage || `${entityLabel} not found.`);
  }
  if (record.status === 'cancelled') {
    throw new Error(`Cannot edit a cancelled ${entityLabel.toLowerCase()}.`);
  }
}

export function canCancel(
  record: { status: RecordStatus } | undefined,
  entityLabel: string,
  notFoundMessage?: string
): void {
  if (!record) {
    throw new Error(notFoundMessage || `${entityLabel} not found.`);
  }
}

export function canDelete(
  record: { status: RecordStatus } | undefined,
  entityLabel: string,
  options?: {
    requireCancelledFirst?: boolean;
    notCancelledMessage?: string;
    notFoundMessage?: string;
  }
): void {
  if (!record) {
    throw new Error(options?.notFoundMessage || `${entityLabel} not found.`);
  }
  if (options?.requireCancelledFirst && record.status !== 'cancelled') {
    throw new Error(
      options.notCancelledMessage ||
        `Cancel this ${entityLabel.toLowerCase()} first before deleting it.`
    );
  }
}
