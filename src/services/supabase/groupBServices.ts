import Decimal from 'decimal.js';
import {
  calculateAccountingInventoryInvariant,
  calculateCustomerLedgerAndAllocations,
  calculateEmployeeMonthlySalaryRow,
  calculateMonthlyProfitFromRecords,
  calculateSupplierLedger,
  getInventorySnapshot,
  isSalaryRecordPaid,
  replayInventoryState,
  roundMoney,
} from '../../domain/engine';
import type {
  CompanySettings,
  DocumentNumberType,
  Employee,
  EmployeeAdvance,
  Expense,
  SalaryRecord,
} from '../../domain/types';
import { requireSupabaseClient } from '../../lib/supabase';
import type {
  DashboardSummary,
  ExpenseCategoryOption,
  IEmployeeService,
  IExpenseService,
  IReportService,
  ISettingsService,
} from '../interfaces';
import {
  fetchAllBatchesCached,
  fetchAllDispatchesCached,
  fetchAllGroupACompanyRecords,
  fetchAllItemsCached,
  fetchAllPurchasesCached,
  fetchAllSalesCached,
  fetchCustomFinalProductNameCached,
} from './groupAServices';
import {
  extractLogoStoragePath,
  removeCompanyLogo,
  resolveCompanyLogoSignedUrl,
  uploadCompanyLogo,
} from './logoStorage';
import {
  mapAdvanceFromRow,
  mapAdvanceToRow,
  type AdvanceRow,
} from './mappers/advanceMapper';
import {
  DEFAULT_PREFIXES,
  FIXED_BILL_PREFIX,
  mapCompanyRowToSettings,
  sanitizeDocumentPrefixes,
  type CompanyRow,
} from './mappers/companySettingsMapper';
import {
  mapEmployeeFromRow,
  mapEmployeeToRow,
  type EmployeeRow,
} from './mappers/employeeMapper';
import {
  mapExpenseCategoryFromRow,
  mapExpenseCategoryToInsert,
  type ExpenseCategoryRow,
} from './mappers/expenseCategoryMapper';
import {
  mapExpenseFromRow,
  mapExpenseToRow,
  type ExpenseRow,
} from './mappers/expenseMapper';
import {
  mapSalaryFromRow,
  mapSalaryToRow,
  mapSalaryToRpcRow,
  type SalaryRecordRow,
} from './mappers/salaryMapper';
import {
  assertOnlineForSave,
  canCancel,
  canDelete,
  canEdit,
  fetchAllCompanyRows,
  formatSupabaseServiceError,
  generateUuid,
  groupBQueryKeys,
  invalidateGroupBQueries,
  queryClient,
} from './queryClient';

export { DEFAULT_PREFIXES, FIXED_BILL_PREFIX };

export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategoryOption[] = [
  { value: 'machine_maintenance', label: 'Machine maintenance' },
  { value: 'factory_maintenance', label: 'Factory maintenance' },
  { value: 'electricity', label: 'Electricity and fuel' },
  { value: 'transport', label: 'Transport' },
  { value: 'other', label: 'Other' },
];

export async function fetchAllExpenseCategoriesCached(
  companyId: string
): Promise<ExpenseCategoryOption[]> {
  return queryClient.fetchQuery({
    queryKey: groupBQueryKeys.expenseCategories(companyId),
    queryFn: async () => {
      const rows = await fetchAllCompanyRows<ExpenseCategoryRow>({
        table: 'expense_categories',
        companyId,
        actionDescription: 'load expense categories',
        orderByColumn: 'created_at',
        ascending: true,
      });
      return rows
        .filter((r) => r.status === 'active')
        .map(mapExpenseCategoryFromRow);
    },
  });
}

export async function fetchAllExpensesCached(
  companyId: string
): Promise<Expense[]> {
  return queryClient.fetchQuery({
    queryKey: groupBQueryKeys.expenses(companyId),
    queryFn: async () => {
      const rows = await fetchAllCompanyRows<ExpenseRow>({
        table: 'expenses',
        companyId,
        actionDescription: 'load expenses',
        orderByColumn: 'date',
        ascending: false,
      });
      return rows.map(mapExpenseFromRow);
    },
  });
}

export async function fetchAllEmployeesCached(
  companyId: string
): Promise<Employee[]> {
  return queryClient.fetchQuery({
    queryKey: groupBQueryKeys.employees(companyId),
    queryFn: async () => {
      const rows = await fetchAllCompanyRows<EmployeeRow>({
        table: 'employees',
        companyId,
        actionDescription: 'load employees',
        orderByColumn: 'created_at',
        ascending: true,
      });
      return rows.map(mapEmployeeFromRow);
    },
  });
}

export async function fetchAllAdvancesCached(
  companyId: string
): Promise<EmployeeAdvance[]> {
  return queryClient.fetchQuery({
    queryKey: groupBQueryKeys.advances(companyId),
    queryFn: async () => {
      const rows = await fetchAllCompanyRows<AdvanceRow>({
        table: 'advances',
        companyId,
        actionDescription: 'load employee advances',
        orderByColumn: 'date',
        ascending: false,
      });
      return rows.map(mapAdvanceFromRow);
    },
  });
}

export async function fetchAllSalariesCached(
  companyId: string
): Promise<SalaryRecord[]> {
  return queryClient.fetchQuery({
    queryKey: groupBQueryKeys.salaries(companyId),
    queryFn: async () => {
      const rows = await fetchAllCompanyRows<SalaryRecordRow>({
        table: 'salary_records',
        companyId,
        actionDescription: 'load salary records',
        orderByColumn: 'month',
        ascending: false,
      });
      return rows.map(mapSalaryFromRow);
    },
  });
}

export async function fetchCompanySettingsCached(
  companyId: string
): Promise<CompanySettings> {
  return queryClient.fetchQuery({
    queryKey: groupBQueryKeys.settings(companyId),
    queryFn: async () => {
      const client = requireSupabaseClient();
      const { data, error } = await client
        .from('companies')
        .select(
          'id, name, phone, email, address, city, logo_url, final_product_name, prefixes, details, updated_at'
        )
        .eq('id', companyId)
        .maybeSingle();

      if (error) {
        throw formatSupabaseServiceError(error, 'load company settings');
      }

      if (!data) {
        return {
          id: `settings_${companyId}`,
          companyId,
          companyName: 'MK Melting Solutions',
          phone: '',
          email: '',
          address: '',
          city: 'Lahore',
          prefixes: { ...DEFAULT_PREFIXES },
          updatedAt: new Date().toISOString(),
        };
      }

      const row = data as CompanyRow;
      const resolvedLogoUrl = await resolveCompanyLogoSignedUrl(
        companyId,
        row.logo_url
      );

      return mapCompanyRowToSettings(row, resolvedLogoUrl);
    },
  });
}

/**
 * Recalculates all active unpaid monthly salary rows for a given employee using the
 * domain engine and persists them atomically via `rpc_sync_employee_salaries`.
 */
async function recalculateAndSyncUnpaidEmployeeSalaries(
  companyId: string,
  employeeId: string,
  initialWorkingSalaries?: SalaryRecord[],
  preloadedAdvances?: EmployeeAdvance[]
): Promise<void> {
  const client = requireSupabaseClient();
  const [advances, allSalaries] = await Promise.all([
    preloadedAdvances
      ? Promise.resolve(preloadedAdvances)
      : fetchAllAdvancesCached(companyId),
    initialWorkingSalaries
      ? Promise.resolve(initialWorkingSalaries)
      : fetchAllSalariesCached(companyId),
  ]);

  const empSalaries = allSalaries
    .filter((s) => s.status === 'active' && s.employeeId === employeeId)
    .sort((a, b) => a.month.localeCompare(b.month));

  const workingSalaries = [...allSalaries];
  const updatesPayload: Array<Record<string, unknown>> = [];

  for (const sal of empSalaries) {
    if (isSalaryRecordPaid(sal)) continue;

    const calc = calculateEmployeeMonthlySalaryRow({
      advances,
      salaries: workingSalaries,
      employeeId,
      month: sal.month,
      basicSalary: sal.basicSalary,
      bonus: sal.bonus,
      excludeSalaryId: sal.id,
    });

    const updated: SalaryRecord = {
      ...sal,
      earlierBalance: calc.earlierBalance.toFixed(),
      advanceDeduction: calc.advancesThisMonth.toFixed(),
      otherDeduction: '0',
      netPayable: calc.netPayable.toFixed(),
    };

    const idx = workingSalaries.findIndex((w) => w.id === sal.id);
    if (idx >= 0) {
      workingSalaries[idx] = updated;
    }

    updatesPayload.push({
      id: updated.id,
      bonus: updated.bonus,
      earlierBalance: updated.earlierBalance,
      advanceDeduction: updated.advanceDeduction,
      otherDeduction: updated.otherDeduction ?? '0',
      netPayable: updated.netPayable,
      paidAmount: updated.paidAmount,
      paymentStatus: updated.paymentStatus ?? 'unpaid',
      ...(updated.notes !== undefined ? { notes: updated.notes } : {}),
    });
  }

  if (updatesPayload.length > 0) {
    const { error } = await client.rpc('rpc_sync_employee_salaries', {
      p_company: companyId,
      p_salary_updates: updatesPayload,
    });
    if (error) {
      throw formatSupabaseServiceError(error, 'recalculate employee salary sheet');
    }
  }
}

export const SupabaseExpenseService: IExpenseService = {
  async listExpenses(companyId: string): Promise<Expense[]> {
    const list = await fetchAllExpensesCached(companyId);
    return list
      .slice()
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
      );
  },

  async listCategories(companyId: string): Promise<ExpenseCategoryOption[]> {
    const [dbCategories, expenses] = await Promise.all([
      fetchAllExpenseCategoriesCached(companyId),
      fetchAllExpensesCached(companyId),
    ]);

    const map = new Map<string, ExpenseCategoryOption>();
    for (const def of DEFAULT_EXPENSE_CATEGORIES) {
      map.set(def.value, def);
    }
    for (const cat of dbCategories) {
      if (cat.value && cat.label) {
        map.set(cat.value, cat);
      }
    }
    for (const exp of expenses) {
      if (exp.category && !map.has(exp.category)) {
        const label = exp.category
          .replace(/_/g, ' ')
          .replace(/^\w/, (ch) => ch.toUpperCase());
        map.set(exp.category, { value: exp.category, label });
      }
    }

    return Array.from(map.values());
  },

  async createCategoryInline(
    companyId: string,
    label: string
  ): Promise<ExpenseCategoryOption> {
    assertOnlineForSave();
    const trimmed = label.trim();
    if (!trimmed) {
      throw new Error('Enter a category name.');
    }

    const existing = await this.listCategories(companyId);
    const duplicate = existing.find(
      (c) => c.label.toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      return duplicate;
    }

    const value =
      trimmed
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || `cat_${Date.now()}`;

    const client = requireSupabaseClient();
    const rowToInsert = mapExpenseCategoryToInsert({
      id: generateUuid(),
      companyId,
      value,
      label: trimmed,
      isDefault: false,
    });

    const { data, error } = await client
      .from('expense_categories')
      .upsert(rowToInsert, { onConflict: 'company_id,value' })
      .select('*')
      .single();

    if (error || !data) {
      throw formatSupabaseServiceError(error, 'save expense category');
    }

    await invalidateGroupBQueries(companyId, ['expenseCategories']);
    return mapExpenseCategoryFromRow(data as ExpenseCategoryRow);
  },

  async deleteCategory(companyId: string, value: string): Promise<void> {
    assertOnlineForSave();
    const expenses = await fetchAllExpensesCached(companyId);
    if (expenses.some((e) => e.category === value)) {
      throw new Error(
        'Cannot delete category because it is used by existing expenses.'
      );
    }

    const client = requireSupabaseClient();
    const { error } = await client
      .from('expense_categories')
      .delete()
      .eq('company_id', companyId)
      .eq('value', value);

    if (error) {
      throw formatSupabaseServiceError(error, 'delete expense category');
    }

    await invalidateGroupBQueries(companyId, ['expenseCategories']);
  },

  async createExpense(companyId, data): Promise<Expense> {
    assertOnlineForSave();
    if (roundMoney(data.amount).lte(0)) {
      throw new Error('Enter an expense amount greater than zero.');
    }

    const client = requireSupabaseClient();
    const insertPayload = mapExpenseToRow({
      id: generateUuid(),
      companyId,
      docNumber: '', // Trigger assigns doc_no
      date: data.date,
      category: data.category,
      description: data.description,
      amount: roundMoney(data.amount).toFixed(),
      paidTo: data.paidTo,
      method: data.method,
      invoiceNumber: data.invoiceNumber,
      reference: data.reference,
      notes: data.notes,
      status: 'active',
    });

    const { data: savedRow, error } = await client
      .from('expenses')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error || !savedRow) {
      throw formatSupabaseServiceError(error, 'save expense');
    }

    await invalidateGroupBQueries(companyId, ['expenses']);
    return mapExpenseFromRow(savedRow as ExpenseRow);
  },

  async updateExpense(companyId, id, patch): Promise<Expense> {
    assertOnlineForSave();
    const expenses = await fetchAllExpensesCached(companyId);
    const existing = expenses.find((e) => e.id === id);
    canEdit(existing, 'Expense', 'Expense record not found.');

    const nextAmount =
      patch.amount !== undefined ? patch.amount : existing!.amount;
    if (roundMoney(nextAmount).lte(0)) {
      throw new Error('Enter an expense amount greater than zero.');
    }

    const now = new Date().toISOString();
    const merged: Expense = {
      ...existing!,
      ...patch,
      amount: roundMoney(nextAmount).toFixed(),
      editedAt: now,
      updatedAt: now,
    };

    const rowPatch = mapExpenseToRow(merged);
    const client = requireSupabaseClient();
    const { data: updatedRow, error } = await client
      .from('expenses')
      .update({
        date: rowPatch.date,
        category: rowPatch.category,
        description: rowPatch.description,
        amount: rowPatch.amount,
        paid_to: rowPatch.paid_to,
        method: rowPatch.method,
        notes: rowPatch.notes,
        details: rowPatch.details,
        edited_at: now,
      })
      .eq('id', id)
      .eq('company_id', companyId)
      .select('*')
      .single();

    if (error || !updatedRow) {
      throw formatSupabaseServiceError(error, 'update expense');
    }

    await invalidateGroupBQueries(companyId, ['expenses']);
    return mapExpenseFromRow(updatedRow as ExpenseRow);
  },

  async cancelExpense(companyId, id, reason): Promise<void> {
    assertOnlineForSave();
    if (!reason || !reason.trim()) {
      throw new Error('Enter a reason for cancelling this expense.');
    }
    const expenses = await fetchAllExpensesCached(companyId);
    const existing = expenses.find((e) => e.id === id);
    canCancel(existing, 'Expense', 'Expense record not found.');

    const client = requireSupabaseClient();
    const now = new Date().toISOString();
    const { error } = await client
      .from('expenses')
      .update({
        status: 'cancelled',
        cancel_reason: reason.trim(),
        cancelled_at: now,
      })
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) {
      throw formatSupabaseServiceError(error, 'cancel expense');
    }

    await invalidateGroupBQueries(companyId, ['expenses']);
  },

  async deleteExpense(companyId, id): Promise<void> {
    assertOnlineForSave();
    const expenses = await fetchAllExpensesCached(companyId);
    const existing = expenses.find((e) => e.id === id);
    canDelete(existing, 'Expense', {
      notFoundMessage: 'Expense record not found.',
    });

    const client = requireSupabaseClient();
    const { error } = await client
      .from('expenses')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) {
      throw formatSupabaseServiceError(error, 'delete expense');
    }

    await invalidateGroupBQueries(companyId, ['expenses']);
  },
};

export const SupabaseEmployeeService: IEmployeeService = {
  async listEmployees(companyId: string): Promise<Employee[]> {
    const list = await fetchAllEmployeesCached(companyId);
    return list
      .filter((e) => e.status === 'active')
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name)
      );
  },

  async createEmployee(companyId, data): Promise<Employee> {
    assertOnlineForSave();
    const trimmedName = data.name.trim();
    if (!trimmedName) {
      throw new Error('Enter the employee name.');
    }
    if (roundMoney(data.basicSalary).lte(0)) {
      throw new Error('Monthly salary must be greater than zero.');
    }

    const nowIso = new Date().toISOString();
    const rowToInsert = mapEmployeeToRow({
      id: generateUuid(),
      companyId,
      name: trimmedName,
      role: (data.role || 'Worker').trim() || 'Worker',
      phone: data.phone?.trim() || undefined,
      joiningDate: data.joiningDate?.trim() || nowIso.slice(0, 10),
      basicSalary: roundMoney(data.basicSalary).toFixed(),
      cnic: data.cnic?.trim() || undefined,
      address: data.address?.trim() || undefined,
      emergencyContactName: data.emergencyContactName?.trim() || undefined,
      emergencyContactPhone: data.emergencyContactPhone?.trim() || undefined,
      active: true,
      notes: data.notes?.trim() || undefined,
      status: 'active',
    });

    const client = requireSupabaseClient();
    const { data: savedRow, error } = await client
      .from('employees')
      .insert(rowToInsert)
      .select('*')
      .single();

    if (error || !savedRow) {
      throw formatSupabaseServiceError(error, 'add employee');
    }

    await invalidateGroupBQueries(companyId, ['employees']);
    return mapEmployeeFromRow(savedRow as EmployeeRow);
  },

  async updateEmployee(companyId, id, patch): Promise<Employee> {
    assertOnlineForSave();
    const employees = await fetchAllEmployeesCached(companyId);
    const existing = employees.find((e) => e.id === id);
    canEdit(existing, 'Employee', 'Employee not found.');

    const nextName =
      patch.name !== undefined ? patch.name.trim() : existing!.name;
    if (!nextName) {
      throw new Error('Enter the employee name.');
    }

    const nextSalary =
      patch.basicSalary !== undefined
        ? roundMoney(patch.basicSalary).toFixed()
        : existing!.basicSalary;
    if (roundMoney(nextSalary).lte(0)) {
      throw new Error('Monthly salary must be greater than zero.');
    }

    const nextRole =
      patch.role !== undefined
        ? patch.role.trim() || 'Worker'
        : existing!.role;

    const now = new Date().toISOString();
    const merged: Employee = {
      ...existing!,
      ...patch,
      name: nextName,
      role: nextRole,
      phone:
        patch.phone !== undefined
          ? patch.phone.trim() || undefined
          : existing!.phone,
      basicSalary: nextSalary,
      cnic:
        patch.cnic !== undefined
          ? patch.cnic.trim() || undefined
          : existing!.cnic,
      address:
        patch.address !== undefined
          ? patch.address.trim() || undefined
          : existing!.address,
      emergencyContactName:
        patch.emergencyContactName !== undefined
          ? patch.emergencyContactName.trim() || undefined
          : existing!.emergencyContactName,
      emergencyContactPhone:
        patch.emergencyContactPhone !== undefined
          ? patch.emergencyContactPhone.trim() || undefined
          : existing!.emergencyContactPhone,
      joiningDate:
        patch.joiningDate !== undefined
          ? patch.joiningDate.trim() || existing!.joiningDate
          : existing!.joiningDate,
      notes: patch.notes !== undefined ? patch.notes : existing!.notes,
      editedAt: now,
      updatedAt: now,
    };

    const rowPayload = mapEmployeeToRow(merged);
    const client = requireSupabaseClient();
    const { data: updatedRow, error } = await client
      .from('employees')
      .update({
        name: rowPayload.name,
        role: rowPayload.role,
        phone: rowPayload.phone,
        joining_date: rowPayload.joining_date,
        basic_salary: rowPayload.basic_salary,
        active: rowPayload.active,
        notes: rowPayload.notes,
        details: rowPayload.details,
        edited_at: now,
      })
      .eq('id', id)
      .eq('company_id', companyId)
      .select('*')
      .single();

    if (error || !updatedRow) {
      throw formatSupabaseServiceError(error, 'update employee');
    }

    if (nextName !== existing!.name || nextRole !== existing!.role) {
      if (nextName !== existing!.name) {
        await client
          .from('advances')
          .update({ employee_name: nextName })
          .eq('company_id', companyId)
          .eq('employee_id', id);
      }
      await client
        .from('salary_records')
        .update({
          employee_name: nextName,
          employee_role: nextRole,
        })
        .eq('company_id', companyId)
        .eq('employee_id', id);
    }

    await invalidateGroupBQueries(companyId, [
      'employees',
      'advances',
      'salaries',
    ]);
    return mapEmployeeFromRow(updatedRow as EmployeeRow);
  },

  async deleteEmployee(companyId, id): Promise<void> {
    assertOnlineForSave();
    const employees = await fetchAllEmployeesCached(companyId);
    const existing = employees.find((e) => e.id === id);
    canDelete(existing, 'Employee', {
      notFoundMessage: 'Employee not found.',
    });

    const client = requireSupabaseClient();
    const now = new Date().toISOString();
    // Soft delete: hides employee from active lists while preserving historical salary records in reports
    const { error } = await client
      .from('employees')
      .update({
        status: 'cancelled',
        active: false,
        cancelled_at: now,
      })
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) {
      throw formatSupabaseServiceError(error, 'delete employee');
    }

    await invalidateGroupBQueries(companyId, ['employees']);
  },

  async listAdvances(
    companyId: string,
    employeeId?: string
  ): Promise<EmployeeAdvance[]> {
    let list = await fetchAllAdvancesCached(companyId);
    if (employeeId) {
      list = list.filter((a) => a.employeeId === employeeId);
    }
    return list
      .slice()
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
      );
  },

  async createAdvance(companyId, data): Promise<EmployeeAdvance> {
    assertOnlineForSave();
    if (roundMoney(data.amount).lte(0)) {
      throw new Error('Advance amount must be greater than zero.');
    }

    const client = requireSupabaseClient();
    const insertPayload = mapAdvanceToRow({
      id: generateUuid(),
      companyId,
      docNumber: '', // Trigger assigns ADV-YYYY-NNNN
      date: data.date,
      employeeId: data.employeeId,
      employeeName: data.employeeName,
      amount: roundMoney(data.amount).toFixed(),
      notes: data.notes,
      status: 'active',
    });

    const { data: savedRow, error } = await client
      .from('advances')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error || !savedRow) {
      throw formatSupabaseServiceError(error, 'save employee advance');
    }

    const createdAdvance = mapAdvanceFromRow(savedRow as AdvanceRow);
    const existingAdvances = await fetchAllAdvancesCached(companyId);
    const updatedAdvances = [
      createdAdvance,
      ...existingAdvances.filter((a) => a.id !== createdAdvance.id),
    ];

    await recalculateAndSyncUnpaidEmployeeSalaries(
      companyId,
      createdAdvance.employeeId,
      undefined,
      updatedAdvances
    );

    await invalidateGroupBQueries(companyId, ['advances', 'salaries']);
    return createdAdvance;
  },

  async updateAdvance(companyId, id, patch): Promise<EmployeeAdvance> {
    assertOnlineForSave();
    const advances = await fetchAllAdvancesCached(companyId);
    const existing = advances.find((a) => a.id === id);
    canEdit(existing, 'Advance', 'Advance record not found.');

    const nextAmount =
      patch.amount !== undefined
        ? roundMoney(patch.amount).toFixed()
        : existing!.amount;
    if (roundMoney(nextAmount).lte(0)) {
      throw new Error('Advance amount must be greater than zero.');
    }

    const now = new Date().toISOString();
    const client = requireSupabaseClient();
    const { data: updatedRow, error } = await client
      .from('advances')
      .update({
        date: (patch.date !== undefined ? patch.date : existing!.date).slice(
          0,
          10
        ),
        amount: nextAmount,
        notes:
          patch.notes !== undefined
            ? patch.notes.trim() || null
            : existing!.notes ?? null,
        edited_at: now,
      })
      .eq('id', id)
      .eq('company_id', companyId)
      .select('*')
      .single();

    if (error || !updatedRow) {
      throw formatSupabaseServiceError(error, 'update employee advance');
    }

    const updatedAdvance = mapAdvanceFromRow(updatedRow as AdvanceRow);
    const updatedAdvances = advances.map((a) =>
      a.id === id ? updatedAdvance : a
    );

    await recalculateAndSyncUnpaidEmployeeSalaries(
      companyId,
      existing!.employeeId,
      undefined,
      updatedAdvances
    );

    await invalidateGroupBQueries(companyId, ['advances', 'salaries']);
    return updatedAdvance;
  },

  async cancelAdvance(companyId, id, reason): Promise<void> {
    assertOnlineForSave();
    if (!reason || !reason.trim()) {
      throw new Error('Enter a reason for cancelling this advance.');
    }
    const advances = await fetchAllAdvancesCached(companyId);
    const existing = advances.find((a) => a.id === id);
    canCancel(existing, 'Advance', 'Advance record not found.');

    const now = new Date().toISOString();
    const client = requireSupabaseClient();
    const { error } = await client
      .from('advances')
      .update({
        status: 'cancelled',
        cancel_reason: reason.trim(),
        cancelled_at: now,
      })
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) {
      throw formatSupabaseServiceError(error, 'cancel employee advance');
    }

    const updatedAdvances = advances.map((a) =>
      a.id === id
        ? {
            ...a,
            status: 'cancelled' as const,
            cancelReason: reason.trim(),
            cancelledAt: now,
          }
        : a
    );

    await recalculateAndSyncUnpaidEmployeeSalaries(
      companyId,
      existing!.employeeId,
      undefined,
      updatedAdvances
    );

    await invalidateGroupBQueries(companyId, ['advances', 'salaries']);
  },

  async deleteAdvance(companyId, id): Promise<void> {
    assertOnlineForSave();
    const advances = await fetchAllAdvancesCached(companyId);
    const existing = advances.find((a) => a.id === id);
    canDelete(existing, 'Advance', {
      requireCancelledFirst: true,
      notFoundMessage: 'Advance record not found.',
      notCancelledMessage: 'Cancel this advance first before deleting it.',
    });

    const client = requireSupabaseClient();
    const { error } = await client
      .from('advances')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) {
      throw formatSupabaseServiceError(error, 'delete employee advance');
    }

    await invalidateGroupBQueries(companyId, ['advances']);
  },

  async listSalaries(
    companyId: string,
    month?: string
  ): Promise<SalaryRecord[]> {
    let list = await fetchAllSalariesCached(companyId);
    if (month) {
      list = list.filter((s) => s.month === month);
    }
    return list
      .slice()
      .sort(
        (a, b) =>
          b.month.localeCompare(a.month) ||
          a.createdAt.localeCompare(b.createdAt) ||
          a.employeeName.localeCompare(b.employeeName)
      );
  },

  async createSalary(companyId, data): Promise<SalaryRecord> {
    assertOnlineForSave();
    const client = requireSupabaseClient();
    const rowPayload = mapSalaryToRow({
      id: generateUuid(),
      companyId,
      docNumber: '', // Trigger assigns SAL-YYYY-NNNN
      month: data.month,
      date: data.date,
      employeeId: data.employeeId,
      employeeName: data.employeeName,
      employeeRole: data.employeeRole,
      basicSalary: data.basicSalary,
      bonus: data.bonus,
      earlierBalance: data.earlierBalance,
      advanceDeduction: data.advanceDeduction,
      otherDeduction: data.otherDeduction,
      netPayable: data.netPayable,
      paidAmount: data.paidAmount,
      paymentStatus: data.paymentStatus,
      paidDate: data.paidDate,
      paymentMethod: data.paymentMethod,
      notes: data.notes,
      status: 'active',
    });

    const { data: savedRow, error } = await client
      .from('salary_records')
      .insert(rowPayload)
      .select('*')
      .single();

    if (error || !savedRow) {
      throw formatSupabaseServiceError(error, 'create salary record');
    }

    await invalidateGroupBQueries(companyId, ['salaries']);
    return mapSalaryFromRow(savedRow as SalaryRecordRow);
  },

  async generateSalarySheet(
    companyId: string,
    month: string
  ): Promise<SalaryRecord[]> {
    assertOnlineForSave();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new Error('Invalid month format. Expected YYYY-MM.');
    }

    const [employees, advances, allSalaries] = await Promise.all([
      fetchAllEmployeesCached(companyId),
      fetchAllAdvancesCached(companyId),
      fetchAllSalariesCached(companyId),
    ]);

    const existingActiveForMonth = allSalaries.filter(
      (s) => s.status === 'active' && s.month === month
    );
    if (existingActiveForMonth.length > 0) {
      throw new Error(
        `Salary sheet for ${month} has already been generated. You cannot generate the same month twice.`
      );
    }

    const activeEmployees = employees
      .filter((e) => e.status === 'active')
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name)
      );

    if (activeEmployees.length === 0) {
      throw new Error('No employees found to generate a salary sheet.');
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const defaultDate = todayIso.startsWith(month) ? todayIso : `${month}-28`;

    const rpcRows = activeEmployees.map((emp) => {
      const calc = calculateEmployeeMonthlySalaryRow({
        advances,
        salaries: allSalaries,
        employeeId: emp.id,
        month,
        basicSalary: emp.basicSalary,
        bonus: 0,
      });

      return mapSalaryToRpcRow({
        id: generateUuid(),
        docNumber: '', // Trigger assigns SAL-YYYY-NNNN
        date: defaultDate,
        employeeId: emp.id,
        employeeName: emp.name,
        employeeRole: emp.role,
        basicSalary: calc.basicSalary.toFixed(),
        bonus: calc.bonus.toFixed(),
        earlierBalance: calc.earlierBalance.toFixed(),
        advanceDeduction: calc.advancesThisMonth.toFixed(),
        otherDeduction: '0',
        netPayable: calc.netPayable.toFixed(),
        paidAmount: '0',
        paymentStatus: 'unpaid',
      });
    });

    const client = requireSupabaseClient();
    const { data: insertedRows, error } = await client.rpc(
      'rpc_generate_salary_sheet',
      {
        p_company: companyId,
        p_month: month,
        p_rows: rpcRows,
      }
    );

    if (error) {
      throw formatSupabaseServiceError(error, 'generate salary sheet');
    }

    await invalidateGroupBQueries(companyId, ['salaries']);
    return ((insertedRows ?? []) as SalaryRecordRow[]).map(mapSalaryFromRow);
  },

  async updateSalaryRow(companyId, id, patch): Promise<SalaryRecord> {
    assertOnlineForSave();
    const [advances, allSalaries] = await Promise.all([
      fetchAllAdvancesCached(companyId),
      fetchAllSalariesCached(companyId),
    ]);

    const existing = allSalaries.find((s) => s.id === id);
    if (!existing || existing.companyId !== companyId || existing.status !== 'active') {
      throw new Error('Salary row not found.');
    }
    if (isSalaryRecordPaid(existing)) {
      throw new Error('Paid salary rows are locked and cannot be edited.');
    }

    const nextBonus = patch.bonus !== undefined ? patch.bonus : existing.bonus;
    if (roundMoney(nextBonus).lt(0)) {
      throw new Error('Bonus cannot be negative.');
    }

    const calc = calculateEmployeeMonthlySalaryRow({
      advances,
      salaries: allSalaries,
      employeeId: existing.employeeId,
      month: existing.month,
      basicSalary: existing.basicSalary,
      bonus: nextBonus,
      excludeSalaryId: existing.id,
    });

    const now = new Date().toISOString();
    const updatedTarget: SalaryRecord = {
      ...existing,
      bonus: calc.bonus.toFixed(),
      earlierBalance: calc.earlierBalance.toFixed(),
      advanceDeduction: calc.advancesThisMonth.toFixed(),
      otherDeduction: '0',
      netPayable: calc.netPayable.toFixed(),
      notes: patch.notes !== undefined ? patch.notes : existing.notes,
      updatedAt: now,
    };

    const workingSalaries = allSalaries.map((s) =>
      s.id === id ? updatedTarget : s
    );

    await recalculateAndSyncUnpaidEmployeeSalaries(
      companyId,
      existing.employeeId,
      workingSalaries,
      advances
    );

    await invalidateGroupBQueries(companyId, ['salaries']);
    const refreshed = await fetchAllSalariesCached(companyId);
    return refreshed.find((s) => s.id === id) || updatedTarget;
  },

  async markSalaryPaid(companyId, id, input): Promise<SalaryRecord> {
    assertOnlineForSave();
    const [advances, allSalaries] = await Promise.all([
      fetchAllAdvancesCached(companyId),
      fetchAllSalariesCached(companyId),
    ]);

    const existing = allSalaries.find((s) => s.id === id);
    if (!existing || existing.companyId !== companyId || existing.status !== 'active') {
      throw new Error('Salary row not found.');
    }
    if (isSalaryRecordPaid(existing)) {
      return existing;
    }

    const now = new Date().toISOString();
    const paidRow: SalaryRecord = {
      ...existing,
      paidAmount: existing.netPayable,
      paymentStatus: 'paid',
      paidDate: input.paidDate,
      paymentMethod: input.paymentMethod,
      updatedAt: now,
    };

    const workingSalaries = allSalaries.map((s) =>
      s.id === id ? paidRow : s
    );

    const empSalaries = workingSalaries
      .filter(
        (s) => s.status === 'active' && s.employeeId === existing.employeeId
      )
      .sort((a, b) => a.month.localeCompare(b.month));

    const salaryUpdates: Array<Record<string, unknown>> = [
      {
        id: paidRow.id,
        bonus: paidRow.bonus,
        earlierBalance: paidRow.earlierBalance ?? '0',
        advanceDeduction: paidRow.advanceDeduction,
        otherDeduction: paidRow.otherDeduction ?? '0',
        netPayable: paidRow.netPayable,
        paidAmount: paidRow.paidAmount,
        paymentStatus: 'paid',
        paidDate: paidRow.paidDate,
        paymentMethod: paidRow.paymentMethod,
        ...(paidRow.notes !== undefined ? { notes: paidRow.notes } : {}),
      },
    ];

    for (const sal of empSalaries) {
      if (sal.id === paidRow.id || isSalaryRecordPaid(sal)) continue;

      const calc = calculateEmployeeMonthlySalaryRow({
        advances,
        salaries: workingSalaries,
        employeeId: existing.employeeId,
        month: sal.month,
        basicSalary: sal.basicSalary,
        bonus: sal.bonus,
        excludeSalaryId: sal.id,
      });

      const recalcRow: SalaryRecord = {
        ...sal,
        earlierBalance: calc.earlierBalance.toFixed(),
        advanceDeduction: calc.advancesThisMonth.toFixed(),
        otherDeduction: '0',
        netPayable: calc.netPayable.toFixed(),
      };

      const idx = workingSalaries.findIndex((w) => w.id === sal.id);
      if (idx >= 0) {
        workingSalaries[idx] = recalcRow;
      }

      salaryUpdates.push({
        id: recalcRow.id,
        bonus: recalcRow.bonus,
        earlierBalance: recalcRow.earlierBalance,
        advanceDeduction: recalcRow.advanceDeduction,
        otherDeduction: recalcRow.otherDeduction ?? '0',
        netPayable: recalcRow.netPayable,
        paidAmount: recalcRow.paidAmount,
        paymentStatus: recalcRow.paymentStatus ?? 'unpaid',
      });
    }

    const client = requireSupabaseClient();
    const { error } = await client.rpc('rpc_sync_employee_salaries', {
      p_company: companyId,
      p_salary_updates: salaryUpdates,
    });

    if (error) {
      throw formatSupabaseServiceError(error, 'mark salary as paid');
    }

    await invalidateGroupBQueries(companyId, ['salaries']);
    const refreshed = await fetchAllSalariesCached(companyId);
    return refreshed.find((s) => s.id === id) || paidRow;
  },

  async markAllSalariesPaid(companyId, month, input): Promise<SalaryRecord[]> {
    assertOnlineForSave();
    const [advances, allSalaries] = await Promise.all([
      fetchAllAdvancesCached(companyId),
      fetchAllSalariesCached(companyId),
    ]);

    const allForMonth = allSalaries.filter(
      (s) => s.status === 'active' && s.month === month
    );

    if (allForMonth.length === 0) {
      throw new Error('No salary rows found for this month.');
    }

    const now = new Date().toISOString();
    const workingSalaries = [...allSalaries];
    const salaryUpdates: Array<Record<string, unknown>> = [];
    const affectedEmployeeIds = new Set<string>();

    for (const row of allForMonth) {
      if (isSalaryRecordPaid(row)) {
        continue;
      }

      const paidRow: SalaryRecord = {
        ...row,
        paidAmount: row.netPayable,
        paymentStatus: 'paid',
        paidDate: input.paidDate,
        paymentMethod: input.paymentMethod,
        updatedAt: now,
      };

      const idx = workingSalaries.findIndex((w) => w.id === row.id);
      if (idx >= 0) {
        workingSalaries[idx] = paidRow;
      }

      affectedEmployeeIds.add(row.employeeId);
      salaryUpdates.push({
        id: paidRow.id,
        bonus: paidRow.bonus,
        earlierBalance: paidRow.earlierBalance ?? '0',
        advanceDeduction: paidRow.advanceDeduction,
        otherDeduction: paidRow.otherDeduction ?? '0',
        netPayable: paidRow.netPayable,
        paidAmount: paidRow.paidAmount,
        paymentStatus: 'paid',
        paidDate: paidRow.paidDate,
        paymentMethod: paidRow.paymentMethod,
        ...(paidRow.notes !== undefined ? { notes: paidRow.notes } : {}),
      });
    }

    for (const empId of affectedEmployeeIds) {
      const empSalaries = workingSalaries
        .filter((s) => s.status === 'active' && s.employeeId === empId)
        .sort((a, b) => a.month.localeCompare(b.month));

      for (const sal of empSalaries) {
        if (isSalaryRecordPaid(sal)) continue;

        const calc = calculateEmployeeMonthlySalaryRow({
          advances,
          salaries: workingSalaries,
          employeeId: empId,
          month: sal.month,
          basicSalary: sal.basicSalary,
          bonus: sal.bonus,
          excludeSalaryId: sal.id,
        });

        const recalcRow: SalaryRecord = {
          ...sal,
          earlierBalance: calc.earlierBalance.toFixed(),
          advanceDeduction: calc.advancesThisMonth.toFixed(),
          otherDeduction: '0',
          netPayable: calc.netPayable.toFixed(),
        };

        const idx = workingSalaries.findIndex((w) => w.id === sal.id);
        if (idx >= 0) {
          workingSalaries[idx] = recalcRow;
        }

        salaryUpdates.push({
          id: recalcRow.id,
          bonus: recalcRow.bonus,
          earlierBalance: recalcRow.earlierBalance,
          advanceDeduction: recalcRow.advanceDeduction,
          otherDeduction: recalcRow.otherDeduction ?? '0',
          netPayable: recalcRow.netPayable,
          paidAmount: recalcRow.paidAmount,
          paymentStatus: recalcRow.paymentStatus ?? 'unpaid',
        });
      }
    }

    if (salaryUpdates.length > 0) {
      const client = requireSupabaseClient();
      const { error } = await client.rpc('rpc_sync_employee_salaries', {
        p_company: companyId,
        p_salary_updates: salaryUpdates,
      });

      if (error) {
        throw formatSupabaseServiceError(error, 'mark all salaries as paid');
      }
    }

    await invalidateGroupBQueries(companyId, ['salaries']);
    return this.listSalaries(companyId, month);
  },

  async cancelSalary(companyId, id, reason): Promise<void> {
    assertOnlineForSave();
    if (!reason || !reason.trim()) {
      throw new Error('Enter a reason for cancelling this salary record.');
    }
    const [advances, allSalaries] = await Promise.all([
      fetchAllAdvancesCached(companyId),
      fetchAllSalariesCached(companyId),
    ]);
    const existing = allSalaries.find((s) => s.id === id);
    canCancel(existing, 'Salary record', 'Salary record not found.');

    const now = new Date().toISOString();
    const client = requireSupabaseClient();
    const { error } = await client
      .from('salary_records')
      .update({
        status: 'cancelled',
        cancel_reason: reason.trim(),
        cancelled_at: now,
      })
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) {
      throw formatSupabaseServiceError(error, 'cancel salary record');
    }

    const updatedSalaries = allSalaries.map((s) =>
      s.id === id
        ? {
            ...s,
            status: 'cancelled' as const,
            cancelReason: reason.trim(),
            cancelledAt: now,
          }
        : s
    );

    await recalculateAndSyncUnpaidEmployeeSalaries(
      companyId,
      existing!.employeeId,
      updatedSalaries,
      advances
    );

    await invalidateGroupBQueries(companyId, ['salaries']);
  },

  async deleteSalary(companyId, id): Promise<void> {
    assertOnlineForSave();
    const allSalaries = await fetchAllSalariesCached(companyId);
    const existing = allSalaries.find((s) => s.id === id);
    canDelete(existing, 'Salary record', {
      requireCancelledFirst: true,
      notFoundMessage: 'Salary record not found.',
      notCancelledMessage:
        'Cancel this salary record first before deleting it.',
    });

    const client = requireSupabaseClient();
    const { error } = await client
      .from('salary_records')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) {
      throw formatSupabaseServiceError(error, 'delete salary record');
    }

    await invalidateGroupBQueries(companyId, ['salaries']);
  },
};

export const SupabaseSettingsService: ISettingsService = {
  async getSettings(companyId: string): Promise<CompanySettings> {
    if (!companyId) {
      return {
        id: 'settings_default',
        companyId: '',
        companyName: 'MK Melting Solutions',
        phone: '',
        email: '',
        address: '',
        city: 'Lahore',
        prefixes: { ...DEFAULT_PREFIXES },
        updatedAt: new Date().toISOString(),
      };
    }
    return fetchCompanySettingsCached(companyId);
  },

  async updateSettings(
    companyId: string,
    patch: Partial<CompanySettings>
  ): Promise<CompanySettings> {
    assertOnlineForSave();
    const client = requireSupabaseClient();

    const { data: currentRowData, error: fetchError } = await client
      .from('companies')
      .select(
        'id, name, phone, email, address, city, logo_url, final_product_name, prefixes, details, updated_at'
      )
      .eq('id', companyId)
      .single();

    if (fetchError || !currentRowData) {
      throw formatSupabaseServiceError(fetchError, 'load company profile');
    }

    const currentRow = currentRowData as CompanyRow;
    const mergedPrefixes = sanitizeDocumentPrefixes({
      ...(currentRow.prefixes ?? {}),
      ...(patch.prefixes ?? {}),
    });

    let nextLogoStoragePath: string | null = currentRow.logo_url;
    let resolvedSignedLogoUrl: string | undefined;

    if (patch.logoDataUrl !== undefined) {
      const trimmedLogo = patch.logoDataUrl.trim();
      if (!trimmedLogo) {
        // User removed the logo -> delete from company-assets and fall back to MK logo
        await removeCompanyLogo(companyId, currentRow.logo_url);
        nextLogoStoragePath = null;
        resolvedSignedLogoUrl = undefined;
      } else if (trimmedLogo.startsWith('data:image/')) {
        // User uploaded a new logo -> upload to company-assets/{company_id}/logo.<ext>
        const uploaded = await uploadCompanyLogo(companyId, trimmedLogo);
        nextLogoStoragePath = uploaded.storagePath;
        resolvedSignedLogoUrl = uploaded.signedUrl;
      } else {
        // Unchanged signed URL or existing storage path
        nextLogoStoragePath =
          extractLogoStoragePath(companyId, trimmedLogo) ?? currentRow.logo_url;
        resolvedSignedLogoUrl = await resolveCompanyLogoSignedUrl(
          companyId,
          nextLogoStoragePath
        );
      }
    } else {
      resolvedSignedLogoUrl = await resolveCompanyLogoSignedUrl(
        companyId,
        currentRow.logo_url
      );
    }

    const nextCompanyName =
      (patch.companyName !== undefined
        ? patch.companyName.trim()
        : currentRow.name) || 'MK Melting Solutions';

    const { data: updatedRowData, error: updateError } = await client
      .from('companies')
      .update({
        name: nextCompanyName,
        phone:
          patch.phone !== undefined
            ? patch.phone.trim()
            : currentRow.phone ?? '',
        email:
          patch.email !== undefined
            ? patch.email.trim()
            : currentRow.email ?? '',
        address:
          patch.address !== undefined
            ? patch.address.trim()
            : currentRow.address ?? '',
        city:
          patch.city !== undefined
            ? patch.city.trim() || 'Lahore'
            : currentRow.city || 'Lahore',
        logo_url: nextLogoStoragePath,
        prefixes: mergedPrefixes,
      })
      .eq('id', companyId)
      .select(
        'id, name, phone, email, address, city, logo_url, final_product_name, prefixes, details, updated_at'
      )
      .single();

    if (updateError || !updatedRowData) {
      throw formatSupabaseServiceError(updateError, 'save company settings');
    }

    await invalidateGroupBQueries(companyId, ['settings']);
    await queryClient.invalidateQueries({ queryKey: ['settings', companyId] });

    return mapCompanyRowToSettings(
      updatedRowData as CompanyRow,
      resolvedSignedLogoUrl
    );
  },

  async nextDocumentNumber(
    companyId: string,
    docType: DocumentNumberType,
    year = new Date().getFullYear()
  ): Promise<string> {
    assertOnlineForSave();
    const client = requireSupabaseClient();
    const { data, error } = await client.rpc('next_doc_no', {
      p_company: companyId,
      p_type: docType,
      p_year: year,
    });

    if (error || !data) {
      throw formatSupabaseServiceError(error, 'generate document number');
    }

    return String(data);
  },
};

export const SupabaseReportService: IReportService = {
  async getInventorySnapshot(companyId: string, asOfDate?: string) {
    const [items, purchases, batches, dispatches, customFinalName] =
      await Promise.all([
        fetchAllItemsCached(companyId),
        fetchAllPurchasesCached(companyId),
        fetchAllBatchesCached(companyId),
        fetchAllDispatchesCached(companyId),
        fetchCustomFinalProductNameCached(companyId),
      ]);

    const snapshot = getInventorySnapshot({
      catalogItems: items,
      purchases,
      batches,
      dispatches,
      asOfDate,
    });

    if (customFinalName) {
      snapshot.powder.itemName = customFinalName;
    }

    return snapshot;
  },

  async checkNumbersConsistency(companyId: string) {
    const [items, purchases, batches, dispatches, bills] = await Promise.all([
      fetchAllItemsCached(companyId),
      fetchAllPurchasesCached(companyId),
      fetchAllBatchesCached(companyId),
      fetchAllDispatchesCached(companyId),
      fetchAllSalesCached(companyId),
    ]);

    return calculateAccountingInventoryInvariant({
      purchases,
      items,
      batches,
      dispatches,
      bills,
    });
  },

  async getStockSnapshot(companyId: string) {
    const snapshot = await this.getInventorySnapshot(companyId);

    return {
      items: snapshot.rockItems.concat(snapshot.chemicalItems).map((i) => ({
        itemId: i.itemId,
        itemName: i.itemName,
        kind: i.kind,
        unit: i.unit,
        quantity: i.stock,
        avgCost: i.avgCost,
        rawAvgCost: i.rawAvgCost,
        totalValue: i.totalValue,
      })),
      finalProduct: {
        itemId: snapshot.powder.itemId,
        itemName: snapshot.powder.itemName,
        kind: snapshot.powder.kind,
        unit: snapshot.powder.unit,
        quantity: snapshot.powder.stock,
        avgCost: snapshot.powder.avgCost,
        rawAvgCost: snapshot.powder.rawAvgCost,
        totalValue: snapshot.powder.totalValue,
      },
    };
  },

  async getDashboardSummary(
    companyId: string,
    month: string
  ): Promise<DashboardSummary> {
    const [groupA, expenses, salaries] = await Promise.all([
      fetchAllGroupACompanyRecords(companyId),
      fetchAllExpensesCached(companyId),
      fetchAllSalariesCached(companyId),
    ]);

    const {
      items,
      suppliers,
      purchases,
      supplierPayments,
      batches,
      dispatches,
      customers,
      bills,
      customerPayments,
    } = groupA;

    const profit = calculateMonthlyProfitFromRecords({
      month,
      bills,
      dispatches,
      expenses,
      salaries,
    });

    const stock = replayInventoryState({
      catalogItems: items,
      purchases,
      batches,
      dispatches,
    });

    let rockStockTons = new Decimal(0);
    for (const st of stock.items.values()) {
      if (st.kind === 'rock') {
        rockStockTons = rockStockTons.plus(st.quantity);
      }
    }

    let totalReceivables = new Decimal(0);
    for (const cust of customers.filter((c) => c.status === 'active')) {
      const ledger = calculateCustomerLedgerAndAllocations({
        openingBalance: cust.openingBalance,
        bills: bills.filter((b) => b.customerId === cust.id),
        payments: customerPayments.filter((p) => p.customerId === cust.id),
      });
      if (ledger.balance.gt(0)) {
        totalReceivables = totalReceivables.plus(ledger.balance);
      }
    }

    let totalPayables = new Decimal(0);
    for (const sup of suppliers.filter((s) => s.status === 'active')) {
      const ledger = calculateSupplierLedger({
        openingBalance: sup.openingBalance,
        purchases: purchases.filter((p) => p.supplierId === sup.id),
        payments: supplierPayments.filter((p) => p.supplierId === sup.id),
      });
      if (ledger.balance.gt(0)) {
        totalPayables = totalPayables.plus(ledger.balance);
      }
    }

    return {
      month,
      sales: profit.sales.toString(),
      cogs: profit.cogs.toString(),
      grossProfit: profit.grossProfit.toString(),
      expenses: profit.expenses.toString(),
      salaries: profit.salaries.toString(),
      netProfit: profit.netProfit.toString(),
      rockStockTons: rockStockTons.toString(),
      finalProductStockTons: stock.finalProduct.quantity.toString(),
      totalReceivables: totalReceivables.toString(),
      totalPayables: totalPayables.toString(),
      activePurchasesCount: purchases.filter((p) => p.status === 'active')
        .length,
      activeBatchesCount: batches.filter((b) => b.status === 'active').length,
      activeDispatchesCount: dispatches.filter((d) => d.status === 'active')
        .length,
      activeBillsCount: bills.filter((b) => b.status === 'active').length,
    };
  },

  async getAllCompanyRecords(companyId: string) {
    const [groupA, expenses, employees, advances, salaries, categories] =
      await Promise.all([
        fetchAllGroupACompanyRecords(companyId),
        fetchAllExpensesCached(companyId),
        fetchAllEmployeesCached(companyId),
        fetchAllAdvancesCached(companyId),
        fetchAllSalariesCached(companyId),
        SupabaseExpenseService.listCategories(companyId),
      ]);

    const categoryLabels: Record<string, string> = {};
    for (const c of categories) {
      categoryLabels[c.value] = c.label;
    }

    return {
      items: groupA.items,
      suppliers: groupA.suppliers,
      purchases: groupA.purchases,
      supplierPayments: groupA.supplierPayments,
      batches: groupA.batches,
      dispatches: groupA.dispatches,
      customers: groupA.customers,
      bills: groupA.bills,
      customerPayments: groupA.customerPayments,
      expenses,
      employees,
      advances,
      salaries,
      categoryLabels,
      customFinalProductName: groupA.customFinalProductName,
    };
  },
};
