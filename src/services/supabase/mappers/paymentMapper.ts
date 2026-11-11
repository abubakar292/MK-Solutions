import type {
  CustomerPayment,
  PaymentMethod,
  RecordStatus,
  SupplierPayment,
} from '../../../domain/types';
import { toDecimalString } from '../queryClient';

export interface DbPaymentRow {
  id: string;
  company_id: string;
  doc_no: string;
  party_type: 'customer' | 'supplier';
  date: string;
  customer_id: string | null;
  supplier_id: string | null;
  party_name: string;
  amount: string | number;
  method: PaymentMethod;
  notes: string | null;
  details: Record<string, unknown> | null;
  status: RecordStatus;
  cancel_reason: string | null;
  cancelled_at: string | null;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
}

export function mapDbPaymentToCustomerPayment(row: DbPaymentRow): CustomerPayment {
  const details =
    row.details && typeof row.details === 'object' ? row.details : {};

  return {
    id: row.id,
    companyId: row.company_id,
    docNumber: row.doc_no,
    date: row.date,
    customerId: row.customer_id ?? '',
    customerName: row.party_name,
    amount: toDecimalString(row.amount, '0'),
    method: row.method,
    reference:
      typeof details.reference === 'string' && details.reference.trim()
        ? details.reference.trim()
        : undefined,
    bankName:
      typeof details.bankName === 'string' && details.bankName.trim()
        ? details.bankName.trim()
        : undefined,
    notes: row.notes ?? undefined,
    status: row.status,
    cancelReason: row.cancel_reason ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    editedAt: row.edited_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapDbPaymentToSupplierPayment(row: DbPaymentRow): SupplierPayment {
  const details =
    row.details && typeof row.details === 'object' ? row.details : {};

  return {
    id: row.id,
    companyId: row.company_id,
    docNumber: row.doc_no,
    date: row.date,
    supplierId: row.supplier_id ?? '',
    supplierName: row.party_name,
    amount: toDecimalString(row.amount, '0'),
    method: row.method,
    reference:
      typeof details.reference === 'string' && details.reference.trim()
        ? details.reference.trim()
        : undefined,
    bankName:
      typeof details.bankName === 'string' && details.bankName.trim()
        ? details.bankName.trim()
        : undefined,
    notes: row.notes ?? undefined,
    status: row.status,
    cancelReason: row.cancel_reason ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    editedAt: row.edited_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapDomainCustomerPaymentToDbInsert(params: {
  id?: string;
  companyId: string;
  date: string;
  customerId: string;
  customerName: string;
  amount: string;
  method: PaymentMethod;
  reference?: string;
  bankName?: string;
  notes?: string;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    company_id: params.companyId,
    doc_no: null,
    party_type: 'customer',
    date: params.date,
    customer_id: params.customerId,
    supplier_id: null,
    party_name: params.customerName.trim(),
    amount: toDecimalString(params.amount, '0'),
    method: params.method,
    notes: params.notes?.trim() || null,
    details: {
      reference: params.reference?.trim() || null,
      bankName: params.bankName?.trim() || null,
    },
    status: 'active',
  };

  if (params.id) {
    payload.id = params.id;
  }

  return payload;
}

export function mapDomainSupplierPaymentToDbInsert(params: {
  id?: string;
  companyId: string;
  date: string;
  supplierId: string;
  supplierName: string;
  amount: string;
  method: PaymentMethod;
  reference?: string;
  bankName?: string;
  notes?: string;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    company_id: params.companyId,
    doc_no: null,
    party_type: 'supplier',
    date: params.date,
    customer_id: null,
    supplier_id: params.supplierId,
    party_name: params.supplierName.trim(),
    amount: toDecimalString(params.amount, '0'),
    method: params.method,
    notes: params.notes?.trim() || null,
    details: {
      reference: params.reference?.trim() || null,
      bankName: params.bankName?.trim() || null,
    },
    status: 'active',
  };

  if (params.id) {
    payload.id = params.id;
  }

  return payload;
}
