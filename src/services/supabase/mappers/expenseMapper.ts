import type { Expense, PaymentMethod, RecordStatus } from '../../../domain/types';
import { toDecimalString } from '../queryClient';

export interface ExpenseDetailsJson {
  invoiceNumber?: string;
  reference?: string;
}

export interface ExpenseRow {
  id: string;
  company_id: string;
  doc_no: string;
  date: string;
  category: string;
  description: string;
  amount: string | number;
  paid_to: string | null;
  method: PaymentMethod;
  notes: string | null;
  details: ExpenseDetailsJson | null;
  status: RecordStatus;
  cancel_reason: string | null;
  cancelled_at: string | null;
  edited_at: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export function mapExpenseFromRow(row: ExpenseRow): Expense {
  const details = row.details ?? {};
  return {
    id: row.id,
    companyId: row.company_id,
    docNumber: row.doc_no,
    date: row.date,
    category: row.category,
    description: row.description ?? '',
    amount: toDecimalString(row.amount, '0'),
    paidTo: row.paid_to ?? undefined,
    method: row.method || 'cash',
    invoiceNumber: details.invoiceNumber || undefined,
    reference: details.reference || undefined,
    notes: row.notes ?? undefined,
    status: row.status,
    cancelReason: row.cancel_reason ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    editedAt: row.edited_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapExpenseToRow(expense: {
  id?: string;
  companyId: string;
  docNumber?: string;
  date: string;
  category: string;
  description: string;
  amount: string;
  paidTo?: string;
  method: PaymentMethod;
  invoiceNumber?: string;
  reference?: string;
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
  category: string;
  description: string;
  amount: string;
  paid_to: string | null;
  method: PaymentMethod;
  notes: string | null;
  details: ExpenseDetailsJson;
  status: RecordStatus;
  cancel_reason: string | null;
  cancelled_at: string | null;
  edited_at: string | null;
} {
  const details: ExpenseDetailsJson = {};
  if (expense.invoiceNumber?.trim()) {
    details.invoiceNumber = expense.invoiceNumber.trim();
  }
  if (expense.reference?.trim()) {
    details.reference = expense.reference.trim();
  }

  return {
    ...(expense.id ? { id: expense.id } : {}),
    company_id: expense.companyId,
    doc_no: expense.docNumber?.trim() || '',
    date: expense.date.slice(0, 10),
    category: expense.category,
    description: expense.description ?? '',
    amount: toDecimalString(expense.amount, '0'),
    paid_to: expense.paidTo?.trim() || null,
    method: expense.method || 'cash',
    notes: expense.notes?.trim() || null,
    details,
    status: expense.status ?? 'active',
    cancel_reason: expense.cancelReason ?? null,
    cancelled_at: expense.cancelledAt ?? null,
    edited_at: expense.editedAt ?? null,
  };
}
