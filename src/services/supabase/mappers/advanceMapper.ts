import type { EmployeeAdvance, RecordStatus } from '../../../domain/types';
import { toDecimalString } from '../queryClient';

export interface AdvanceRow {
  id: string;
  company_id: string;
  doc_no: string;
  date: string;
  employee_id: string;
  employee_name: string;
  amount: string | number;
  notes: string | null;
  details: Record<string, unknown> | null;
  status: RecordStatus;
  cancel_reason: string | null;
  cancelled_at: string | null;
  edited_at: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export function mapAdvanceFromRow(row: AdvanceRow): EmployeeAdvance {
  return {
    id: row.id,
    companyId: row.company_id,
    docNumber: row.doc_no,
    date: row.date,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    amount: toDecimalString(row.amount, '0'),
    notes: row.notes ?? undefined,
    status: row.status,
    cancelReason: row.cancel_reason ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    editedAt: row.edited_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAdvanceToRow(advance: {
  id?: string;
  companyId: string;
  docNumber?: string;
  date: string;
  employeeId: string;
  employeeName: string;
  amount: string;
  notes?: string;
  status?: RecordStatus;
  cancelReason?: string;
  cancelledAt?: string;
  editedAt?: string;
}): {
  id?: string;
  company_id: string;
  doc_no: string;
  date: string;
  employee_id: string;
  employee_name: string;
  amount: string;
  notes: string | null;
  details: Record<string, unknown>;
  status: RecordStatus;
  cancel_reason: string | null;
  cancelled_at: string | null;
  edited_at: string | null;
} {
  return {
    ...(advance.id ? { id: advance.id } : {}),
    company_id: advance.companyId,
    doc_no: advance.docNumber?.trim() || '',
    date: advance.date.slice(0, 10),
    employee_id: advance.employeeId,
    employee_name: advance.employeeName,
    amount: toDecimalString(advance.amount, '0'),
    notes: advance.notes?.trim() || null,
    details: {},
    status: advance.status ?? 'active',
    cancel_reason: advance.cancelReason ?? null,
    cancelled_at: advance.cancelledAt ?? null,
    edited_at: advance.editedAt ?? null,
  };
}
