import type { PaymentMethod, RecordStatus, SalaryRecord } from '../../../domain/types';
import { toDecimalString } from '../queryClient';

export interface SalaryRecordRow {
  id: string;
  company_id: string;
  doc_no: string;
  month: string;
  date: string;
  employee_id: string;
  employee_name: string;
  employee_role: string;
  basic_salary: string | number;
  bonus: string | number;
  earlier_balance: string | number;
  advance_deduction: string | number;
  other_deduction: string | number;
  net_payable: string | number;
  paid_amount: string | number;
  payment_status: 'unpaid' | 'paid';
  paid_date: string | null;
  payment_method: PaymentMethod | null;
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

export function mapSalaryFromRow(row: SalaryRecordRow): SalaryRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    docNumber: row.doc_no,
    month: row.month,
    date: row.date,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    employeeRole: row.employee_role || 'Worker',
    basicSalary: toDecimalString(row.basic_salary, '0'),
    bonus: toDecimalString(row.bonus, '0'),
    earlierBalance: toDecimalString(row.earlier_balance, '0'),
    advanceDeduction: toDecimalString(row.advance_deduction, '0'),
    otherDeduction: toDecimalString(row.other_deduction, '0'),
    netPayable: toDecimalString(row.net_payable, '0'),
    paidAmount: toDecimalString(row.paid_amount, '0'),
    paymentStatus: row.payment_status || 'unpaid',
    paidDate: row.paid_date ?? undefined,
    paymentMethod: row.payment_method ?? undefined,
    notes: row.notes ?? undefined,
    status: row.status,
    cancelReason: row.cancel_reason ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    editedAt: row.edited_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSalaryToRow(salary: {
  id?: string;
  companyId: string;
  docNumber?: string;
  month: string;
  date: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  basicSalary: string;
  bonus: string;
  earlierBalance?: string;
  advanceDeduction: string;
  otherDeduction?: string;
  netPayable: string;
  paidAmount: string;
  paymentStatus?: 'unpaid' | 'paid';
  paidDate?: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
  status?: RecordStatus;
  cancelReason?: string;
  cancelledAt?: string;
  editedAt?: string;
}): {
  id?: string;
  company_id: string;
  doc_no: string;
  month: string;
  date: string;
  employee_id: string;
  employee_name: string;
  employee_role: string;
  basic_salary: string;
  bonus: string;
  earlier_balance: string;
  advance_deduction: string;
  other_deduction: string;
  net_payable: string;
  paid_amount: string;
  payment_status: 'unpaid' | 'paid';
  paid_date: string | null;
  payment_method: PaymentMethod | null;
  notes: string | null;
  details: Record<string, unknown>;
  status: RecordStatus;
  cancel_reason: string | null;
  cancelled_at: string | null;
  edited_at: string | null;
} {
  return {
    ...(salary.id ? { id: salary.id } : {}),
    company_id: salary.companyId,
    doc_no: salary.docNumber?.trim() || '',
    month: salary.month,
    date: salary.date.slice(0, 10),
    employee_id: salary.employeeId,
    employee_name: salary.employeeName,
    employee_role: salary.employeeRole || 'Worker',
    basic_salary: toDecimalString(salary.basicSalary, '0'),
    bonus: toDecimalString(salary.bonus, '0'),
    earlier_balance: toDecimalString(salary.earlierBalance, '0'),
    advance_deduction: toDecimalString(salary.advanceDeduction, '0'),
    other_deduction: toDecimalString(salary.otherDeduction, '0'),
    net_payable: toDecimalString(salary.netPayable, '0'),
    paid_amount: toDecimalString(salary.paidAmount, '0'),
    payment_status: salary.paymentStatus || 'unpaid',
    paid_date: salary.paidDate ? salary.paidDate.slice(0, 10) : null,
    payment_method: salary.paymentMethod ?? null,
    notes: salary.notes?.trim() || null,
    details: {},
    status: salary.status ?? 'active',
    cancel_reason: salary.cancelReason ?? null,
    cancelled_at: salary.cancelledAt ?? null,
    edited_at: salary.editedAt ?? null,
  };
}

export function mapSalaryToRpcRow(salary: {
  id?: string;
  docNumber?: string;
  date: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  basicSalary: string;
  bonus: string;
  earlierBalance?: string;
  advanceDeduction: string;
  otherDeduction?: string;
  netPayable: string;
  paidAmount?: string;
  paymentStatus?: 'unpaid' | 'paid';
  paidDate?: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
}): Record<string, unknown> {
  return {
    ...(salary.id ? { id: salary.id } : {}),
    docNumber: salary.docNumber?.trim() || '',
    date: salary.date.slice(0, 10),
    employeeId: salary.employeeId,
    employeeName: salary.employeeName,
    employeeRole: salary.employeeRole || 'Worker',
    basicSalary: toDecimalString(salary.basicSalary, '0'),
    bonus: toDecimalString(salary.bonus, '0'),
    earlierBalance: toDecimalString(salary.earlierBalance, '0'),
    advanceDeduction: toDecimalString(salary.advanceDeduction, '0'),
    otherDeduction: toDecimalString(salary.otherDeduction, '0'),
    netPayable: toDecimalString(salary.netPayable, '0'),
    paidAmount: toDecimalString(salary.paidAmount, '0'),
    paymentStatus: salary.paymentStatus || 'unpaid',
    ...(salary.paidDate ? { paidDate: salary.paidDate.slice(0, 10) } : {}),
    ...(salary.paymentMethod ? { paymentMethod: salary.paymentMethod } : {}),
    ...(salary.notes !== undefined ? { notes: salary.notes } : {}),
    details: {},
  };
}
