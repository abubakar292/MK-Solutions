import type { Employee, RecordStatus } from '../../../domain/types';
import { toDecimalString } from '../queryClient';

export interface EmployeeDetailsJson {
  cnic?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

export interface EmployeeRow {
  id: string;
  company_id: string;
  name: string;
  role: string;
  phone: string | null;
  joining_date: string;
  basic_salary: string | number;
  active: boolean;
  notes: string | null;
  details: EmployeeDetailsJson | null;
  status: RecordStatus;
  cancel_reason: string | null;
  cancelled_at: string | null;
  edited_at: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export function mapEmployeeFromRow(row: EmployeeRow): Employee {
  const details = row.details ?? {};
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    role: row.role || 'Worker',
    phone: row.phone ?? undefined,
    joiningDate: row.joining_date,
    basicSalary: toDecimalString(row.basic_salary, '0'),
    cnic: details.cnic || undefined,
    address: details.address || undefined,
    emergencyContactName: details.emergencyContactName || undefined,
    emergencyContactPhone: details.emergencyContactPhone || undefined,
    active: Boolean(row.active),
    notes: row.notes ?? undefined,
    status: row.status,
    cancelReason: row.cancel_reason ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    editedAt: row.edited_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapEmployeeToRow(employee: {
  id?: string;
  companyId: string;
  name: string;
  role?: string;
  phone?: string;
  joiningDate: string;
  basicSalary: string;
  cnic?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  active?: boolean;
  notes?: string;
  status?: RecordStatus;
  cancelReason?: string;
  cancelledAt?: string;
  editedAt?: string;
}): {
  id?: string;
  company_id: string;
  name: string;
  role: string;
  phone: string | null;
  joining_date: string;
  basic_salary: string;
  active: boolean;
  notes: string | null;
  details: EmployeeDetailsJson;
  status: RecordStatus;
  cancel_reason: string | null;
  cancelled_at: string | null;
  edited_at: string | null;
} {
  const details: EmployeeDetailsJson = {};
  if (employee.cnic?.trim()) {
    details.cnic = employee.cnic.trim();
  }
  if (employee.address?.trim()) {
    details.address = employee.address.trim();
  }
  if (employee.emergencyContactName?.trim()) {
    details.emergencyContactName = employee.emergencyContactName.trim();
  }
  if (employee.emergencyContactPhone?.trim()) {
    details.emergencyContactPhone = employee.emergencyContactPhone.trim();
  }

  return {
    ...(employee.id ? { id: employee.id } : {}),
    company_id: employee.companyId,
    name: employee.name.trim(),
    role: (employee.role || 'Worker').trim() || 'Worker',
    phone: employee.phone?.trim() || null,
    joining_date: employee.joiningDate.slice(0, 10),
    basic_salary: toDecimalString(employee.basicSalary, '0'),
    active: employee.active ?? true,
    notes: employee.notes?.trim() || null,
    details,
    status: employee.status ?? 'active',
    cancel_reason: employee.cancelReason ?? null,
    cancelled_at: employee.cancelledAt ?? null,
    edited_at: employee.editedAt ?? null,
  };
}
