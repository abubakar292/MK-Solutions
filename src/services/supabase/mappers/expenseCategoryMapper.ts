import type { RecordStatus } from '../../../domain/types';
import type { ExpenseCategoryOption } from '../../interfaces';

export interface ExpenseCategoryRow {
  id: string;
  company_id: string;
  value: string;
  label: string;
  is_default: boolean;
  details: Record<string, unknown> | null;
  status: RecordStatus;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export function mapExpenseCategoryFromRow(
  row: ExpenseCategoryRow
): ExpenseCategoryOption {
  return {
    value: row.value,
    label: row.label,
  };
}

export function mapExpenseCategoryToInsert(params: {
  id?: string;
  companyId: string;
  value: string;
  label: string;
  isDefault?: boolean;
}): {
  id?: string;
  company_id: string;
  value: string;
  label: string;
  is_default: boolean;
  details: Record<string, unknown>;
  status: RecordStatus;
} {
  return {
    ...(params.id ? { id: params.id } : {}),
    company_id: params.companyId,
    value: params.value.trim(),
    label: params.label.trim(),
    is_default: Boolean(params.isDefault),
    details: {},
    status: 'active',
  };
}
