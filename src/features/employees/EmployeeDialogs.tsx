import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import Decimal from 'decimal.js';
import { AlertTriangle, Banknote, CheckCircle2, Trash2, UserPlus, Wallet } from 'lucide-react';

import { Dialog } from '../../components/shared/Dialog';
import { DatePicker, MoneyInput, TextInput } from '../../components/shared/Inputs';
import { Button } from '../../components/ui/Button';
import {
  calculateEmployeeRunningBalance,
  roundMoney,
} from '../../domain/engine';
import type {
  Employee,
  EmployeeAdvance,
  PaymentMethod,
  SalaryRecord,
} from '../../domain/types';
import { formatMoney, getTodayKarachiIsoDate } from '../../lib/format';
import { notify } from '../../lib/notify';
import { EmployeeService } from '../../services';
import { formatMonthYearLabel } from './employeeHelpers';

// ============================================================================
// 1. ADD / EDIT EMPLOYEE DIALOG (Shared Dialog Layout with More Details)
// ============================================================================

import { MoreDetailsSection } from '../../components/shared/MoreDetailsSection';
import { TextArea } from '../../components/shared/Inputs';

const employeeSchema = z.object({
  name: z.string().trim().min(1, 'Enter the employee name.'),
  phone: z.string().optional(),
  basicSalary: z
    .string()
    .min(1, 'Enter the monthly salary.')
    .refine((val) => {
      const n = Number(val);
      return Number.isFinite(n) && n > 0;
    }, 'Monthly salary must be greater than zero.'),
  role: z.string().trim().optional(),
  joiningDate: z.string().optional(),
  cnic: z.string().trim().optional(),
  address: z.string().trim().optional(),
  emergencyContactName: z.string().trim().optional(),
  emergencyContactPhone: z.string().trim().optional(),
  notes: z.string().optional(),
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;

export interface EmployeeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  employee?: Employee | null;
  onSaved: (employee: Employee) => void;
}

export const EmployeeFormDialog: React.FC<EmployeeFormDialogProps> = ({
  open,
  onOpenChange,
  companyId,
  employee,
  onSaved,
}) => {
  const isEditing = Boolean(employee);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      name: '',
      phone: '',
      basicSalary: '',
      role: '',
      joiningDate: getTodayKarachiIsoDate(),
      cnic: '',
      address: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    if (employee) {
      reset({
        name: employee.name,
        phone: employee.phone || '',
        basicSalary: employee.basicSalary,
        role: employee.role || '',
        joiningDate: employee.joiningDate || getTodayKarachiIsoDate(),
        cnic: employee.cnic || '',
        address: employee.address || '',
        emergencyContactName: employee.emergencyContactName || '',
        emergencyContactPhone: employee.emergencyContactPhone || '',
        notes: employee.notes || '',
      });
    } else {
      reset({
        name: '',
        phone: '',
        basicSalary: '',
        role: '',
        joiningDate: getTodayKarachiIsoDate(),
        cnic: '',
        address: '',
        emergencyContactName: '',
        emergencyContactPhone: '',
        notes: '',
      });
    }
  }, [open, employee, reset]);

  const onSubmit = async (values: EmployeeFormValues) => {
    try {
      if (isEditing && employee) {
        const updated = await EmployeeService.updateEmployee(companyId, employee.id, {
          name: values.name,
          phone: values.phone?.trim() || undefined,
          basicSalary: values.basicSalary,
          role: values.role?.trim() || undefined,
          joiningDate: values.joiningDate || undefined,
          cnic: values.cnic?.trim() || undefined,
          address: values.address?.trim() || undefined,
          emergencyContactName: values.emergencyContactName?.trim() || undefined,
          emergencyContactPhone: values.emergencyContactPhone?.trim() || undefined,
          notes: values.notes?.trim() || undefined,
        });
        notify.success(`Updated ${updated.name}.`);
        onSaved(updated);
      } else {
        const created = await EmployeeService.createEmployee(companyId, {
          name: values.name,
          phone: values.phone?.trim() || undefined,
          basicSalary: values.basicSalary,
          role: values.role?.trim() || 'Worker',
          joiningDate: values.joiningDate || getTodayKarachiIsoDate(),
          cnic: values.cnic?.trim() || undefined,
          address: values.address?.trim() || undefined,
          emergencyContactName: values.emergencyContactName?.trim() || undefined,
          emergencyContactPhone: values.emergencyContactPhone?.trim() || undefined,
          active: true,
          notes: values.notes?.trim() || undefined,
        });
        notify.success(`Added ${created.name} (${formatMoney(created.basicSalary)} / month).`);
        onSaved(created);
      }
      onOpenChange(false);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Could not save employee. Try again.');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={isEditing ? 'Edit employee' : 'Add employee'}
      icon={<UserPlus className="h-4 w-4" />}
      maxWidth="md"
      hasUnsavedChanges={isDirty}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="employee-form"
            variant="primary"
            loading={isSubmitting}
          >
            <UserPlus className="h-4 w-4" />
            <span>{isEditing ? 'Save changes' : 'Add employee'}</span>
          </Button>
        </>
      }
    >
      <form id="employee-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextInput
            label="Employee name"
            placeholder="e.g. Muhammad Asif"
            error={errors.name?.message}
            autoFocus
            {...register('name')}
          />

          <TextInput
            label="Phone number"
            placeholder="e.g. 0300-1234567"
            error={errors.phone?.message}
            {...register('phone')}
          />

          <div className="sm:col-span-2">
            <MoneyInput
              label="Monthly basic salary"
              placeholder="50000"
              error={errors.basicSalary?.message}
              {...register('basicSalary')}
            />
          </div>
        </div>

        <MoreDetailsSection title="More details">
          <TextInput
            label="Role / designation"
            placeholder="e.g. Mill Operator, Supervisor"
            error={errors.role?.message}
            {...register('role')}
          />

          <DatePicker
            label="Joining date"
            error={errors.joiningDate?.message}
            {...register('joiningDate')}
          />

          <TextInput
            label="CNIC"
            placeholder="e.g. 35202-1234567-1"
            error={errors.cnic?.message}
            {...register('cnic')}
          />

          <div className="sm:col-span-2">
            <TextInput
              label="Address"
              placeholder="Residential address"
              error={errors.address?.message}
              {...register('address')}
            />
          </div>

          <TextInput
            label="Emergency contact name"
            placeholder="e.g. Brother, Father"
            error={errors.emergencyContactName?.message}
            {...register('emergencyContactName')}
          />

          <TextInput
            label="Emergency contact phone"
            placeholder="e.g. 0321-7654321"
            error={errors.emergencyContactPhone?.message}
            {...register('emergencyContactPhone')}
          />

          <div className="sm:col-span-2">
            <TextArea
              label="Notes"
              placeholder="Shift, overtime, or allowance notes"
              error={errors.notes?.message}
              rows={2}
              {...register('notes')}
            />
          </div>
        </MoreDetailsSection>
      </form>
    </Dialog>
  );
};

// ============================================================================
// 2. DELETE EMPLOYEE CONFIRM DIALOG (5.2 Dustbin Icon + Balance Warning)
// ============================================================================

export interface DeleteEmployeeConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  employee: Employee | null;
  currentBalance: Decimal; // > 0 unpaid salary owed to employee; < 0 unrecovered advance owed by employee
  advancesThisMonth?: Decimal;
  onDeleted: (employeeId: string) => void;
}

export const DeleteEmployeeConfirmDialog: React.FC<DeleteEmployeeConfirmDialogProps> = ({
  open,
  onOpenChange,
  companyId,
  employee,
  currentBalance,
  advancesThisMonth = new Decimal(0),
  onDeleted,
}) => {
  const [submitting, setSubmitting] = useState(false);

  if (!employee) return null;

  const hasNonZeroBalance = !currentBalance.eq(0) || advancesThisMonth.gt(0);

  const handleConfirmDelete = async () => {
    setSubmitting(true);
    try {
      await EmployeeService.deleteEmployee(companyId, employee.id);
      notify.success(`${employee.name} removed from active employees.`);
      onDeleted(employee.id);
      onOpenChange(false);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Could not delete employee.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title="Delete employee"
      maxWidth="sm"
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            loading={submitting}
            onClick={handleConfirmDelete}
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete employee</span>
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3.5">
          <div className="text-sm font-semibold text-[var(--text)]">{employee.name}</div>
          <div className="mt-0.5 text-xs text-[var(--text-muted)]">
            {employee.role} · Salary {formatMoney(employee.basicSalary)} / month
          </div>
        </div>

        {hasNonZeroBalance && (
          <div className="rounded-[10px] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3.5 text-xs text-[var(--danger)]">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
              <div className="space-y-1">
                <div className="font-semibold text-[var(--danger)]">
                  {currentBalance.lt(0)
                    ? `Negative balance: ${formatMoney(currentBalance)}`
                    : currentBalance.gt(0)
                    ? `Unpaid salary balance: ${formatMoney(currentBalance)}`
                    : `Advances taken this month: ${formatMoney(advancesThisMonth)}`}
                </div>
                <p className="leading-relaxed text-[var(--danger)]">
                  {currentBalance.lt(0)
                    ? `${employee.name} has an unrecovered advance balance of ${formatMoney(
                        currentBalance.abs()
                      )}.`
                    : currentBalance.gt(0)
                    ? `${employee.name} has an unpaid salary balance of ${formatMoney(
                        currentBalance
                      )}.`
                    : `${employee.name} has ${formatMoney(
                        advancesThisMonth
                      )} in advances this month.`}
                </p>
              </div>
            </div>
          </div>
        )}

        <p className="text-xs leading-relaxed text-[var(--text-muted)]">
          Are you sure you want to delete <span className="font-semibold text-[var(--text)]">{employee.name}</span>? Deleting hides the employee from every list; previously paid salaries stay in the old months&apos; reports so past profit numbers do not change.
        </p>
      </div>
    </Dialog>
  );
};

// ============================================================================
// 3. GIVE ADVANCE DIALOG (5.3 Simple Advance Rule + Live Preview Line)
// ============================================================================

const giveAdvanceSchema = z.object({
  employeeId: z.string().min(1, 'Select an employee.'),
  date: z.string().min(1, 'Select the advance date.'),
  amount: z
    .string()
    .min(1, 'Enter the advance amount.')
    .refine((val) => {
      const n = Number(val);
      return Number.isFinite(n) && n > 0;
    }, 'Advance amount must be greater than zero.'),
  notes: z.string().optional(),
});

type GiveAdvanceFormValues = z.infer<typeof giveAdvanceSchema>;

export interface GiveAdvanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  employees: Employee[];
  advances: EmployeeAdvance[];
  salaries: SalaryRecord[];
  defaultEmployeeId?: string;
  nextDocNumberPreview?: string;
  onSaved: (advance: EmployeeAdvance) => void;
}

export const GiveAdvanceDialog: React.FC<GiveAdvanceDialogProps> = ({
  open,
  onOpenChange,
  companyId,
  employees,
  advances,
  salaries,
  defaultEmployeeId,
  onSaved,
}) => {
  const activeEmployees = useMemo(
    () => employees.filter((e) => e.status === 'active'),
    [employees]
  );

  const {
    register,
    watch,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<GiveAdvanceFormValues>({
    resolver: zodResolver(giveAdvanceSchema),
    defaultValues: {
      employeeId: defaultEmployeeId || '',
      date: getTodayKarachiIsoDate(),
      amount: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      employeeId: defaultEmployeeId || activeEmployees[0]?.id || '',
      date: getTodayKarachiIsoDate(),
      amount: '',
      notes: '',
    });
  }, [open, defaultEmployeeId, activeEmployees, reset]);

  const selectedEmployeeId = watch('employeeId');
  const watchedDate = watch('date');
  const watchedAmount = watch('amount');

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === selectedEmployeeId),
    [employees, selectedEmployeeId]
  );

  // Live preview calculation per 5.3:
  // "Salary Rs 50,000, advances this month Rs 20,000, will receive at month end Rs 30,000"
  const livePreview = useMemo(() => {
    if (!selectedEmployee) return null;
    const targetMonth = (watchedDate || getTodayKarachiIsoDate()).slice(0, 7);
    const salary = roundMoney(selectedEmployee.basicSalary);

    const existingMonthAdvances = advances
      .filter(
        (a) =>
          a.status === 'active' &&
          a.employeeId === selectedEmployee.id &&
          a.date.slice(0, 7) === targetMonth
      )
      .reduce((acc, a) => roundMoney(acc.plus(roundMoney(a.amount))), new Decimal(0));

    const typedNum = Number(watchedAmount);
    const typedAdvance =
      Number.isFinite(typedNum) && typedNum > 0 ? roundMoney(typedNum) : new Decimal(0);

    const advancesThisMonth = roundMoney(existingMonthAdvances.plus(typedAdvance));

    const priorBalance = calculateEmployeeRunningBalance({
      employeeId: selectedEmployee.id,
      advances,
      salaries,
      beforeMonth: targetMonth,
    }).balance;

    const netBeforeClamp = roundMoney(
      salary.plus(priorBalance).minus(advancesThisMonth)
    );
    const willReceiveAtMonthEnd = Decimal.max(new Decimal(0), netBeforeClamp);
    const carryForwardNegative = netBeforeClamp.lt(0)
      ? netBeforeClamp.abs()
      : new Decimal(0);

    return {
      targetMonth,
      salary,
      existingMonthAdvances,
      advancesThisMonth,
      priorBalance,
      willReceiveAtMonthEnd,
      carryForwardNegative,
    };
  }, [selectedEmployee, watchedDate, watchedAmount, advances, salaries]);

  const onSubmit = async (values: GiveAdvanceFormValues) => {
    const emp = employees.find((e) => e.id === values.employeeId);
    if (!emp) {
      notify.error('Please select a valid employee.');
      return;
    }

    try {
      const created = await EmployeeService.createAdvance(companyId, {
        date: values.date,
        employeeId: emp.id,
        employeeName: emp.name,
        amount: values.amount,
        notes: values.notes?.trim() || undefined,
      });
      notify.success(
        `Advance ${created.docNumber} of ${formatMoney(created.amount)} recorded for ${emp.name}.`
      );
      onSaved(created);
      onOpenChange(false);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Could not save advance.');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title="Give advance"
      maxWidth="md"
      hasUnsavedChanges={isDirty}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="give-advance-form"
            variant="primary"
            loading={isSubmitting}
          >
            <Wallet className="h-4 w-4" />
            <span>Save advance</span>
          </Button>
        </>
      }
    >
      <form id="give-advance-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="flex flex-col gap-1.5 min-w-0">
          <label htmlFor="advance-employee-select" className="text-sm font-medium text-[var(--text)]">
            Employee
          </label>
          <select
            id="advance-employee-select"
            className="h-11 sm:h-10 w-full rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] focus:outline-none glow-input-focus"
            {...register('employeeId')}
          >
            <option value="">Select employee</option>
            {activeEmployees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.role}) — {formatMoney(e.basicSalary)}
              </option>
            ))}
          </select>
          {errors.employeeId?.message && (
            <p role="alert" className="text-xs font-medium text-[var(--danger)]">
              {errors.employeeId.message}
            </p>
          )}
        </div>

        <DatePicker
          label="Date"
          error={errors.date?.message}
          {...register('date')}
        />

        <MoneyInput
          label="Amount"
          placeholder="20000"
          error={errors.amount?.message}
          {...register('amount')}
        />

        {livePreview && (
          <div
            data-testid="advance-live-line"
            className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] px-3.5 py-3 text-xs leading-relaxed text-[var(--text)]"
          >
            <p className="font-medium tabular-nums">
              Salary {formatMoney(livePreview.salary)}, advances this month{' '}
              {formatMoney(livePreview.advancesThisMonth)}, will receive at month end{' '}
              <span className="font-bold text-[var(--brand)]">
                {formatMoney(livePreview.willReceiveAtMonthEnd)}
              </span>
            </p>
            {livePreview.carryForwardNegative.gt(0) && (
              <p className="mt-1 text-[11px] font-medium text-[var(--danger)]">
                Advances exceed {formatMonthYearLabel(livePreview.targetMonth)} salary by{' '}
                {formatMoney(livePreview.carryForwardNegative)}. This extra stays as a negative balance and is deducted from next month&apos;s salary.
              </p>
            )}
          </div>
        )}

        <TextInput
          label="Note (optional)"
          placeholder="e.g. Medical expense, personal need"
          error={errors.notes?.message}
          {...register('notes')}
        />
      </form>
    </Dialog>
  );
};

// ============================================================================
// 4. MARK SALARY PAID DIALOG ("Pay" single row or "Pay all" for month)
// ============================================================================

export interface MarkSalaryPaidDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  mode: 'single' | 'all';
  month: string;
  salaryRow?: SalaryRecord | null;
  unpaidRowsCount?: number;
  totalNetPayable?: Decimal.Value;
  onPaid: () => void;
}

export const MarkSalaryPaidDialog: React.FC<MarkSalaryPaidDialogProps> = ({
  open,
  onOpenChange,
  companyId,
  mode,
  month,
  salaryRow,
  unpaidRowsCount = 0,
  totalNetPayable = 0,
  onPaid,
}) => {
  const [paidDate, setPaidDate] = useState(getTodayKarachiIsoDate());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setPaidDate(getTodayKarachiIsoDate());
      setPaymentMethod('cash');
    }
  }, [open]);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paidDate) {
      notify.error('Select the payment date.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'single' && salaryRow) {
        const updated = await EmployeeService.markSalaryPaid(companyId, salaryRow.id, {
          paidDate,
          paymentMethod,
        });
        notify.success(
          `Paid ${formatMoney(updated.netPayable)} to ${updated.employeeName} for ${formatMonthYearLabel(
            updated.month
          )}.`
        );
      } else {
        await EmployeeService.markAllSalariesPaid(companyId, month, {
          paidDate,
          paymentMethod,
        });
        notify.success(
          `Marked all ${unpaidRowsCount} salary rows for ${formatMonthYearLabel(month)} as paid.`
        );
      }
      onPaid();
      onOpenChange(false);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Could not mark salary as paid.');
    } finally {
      setSubmitting(false);
    }
  };

  const amountDisplay =
    mode === 'single' && salaryRow
      ? formatMoney(salaryRow.netPayable)
      : formatMoney(totalNetPayable);

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={
        mode === 'single' && salaryRow
          ? `Pay salary — ${salaryRow.employeeName}`
          : `Pay all salaries — ${formatMonthYearLabel(month)}`
      }
      maxWidth="sm"
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="mark-salary-paid-form"
            variant="primary"
            loading={submitting}
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>
              {mode === 'single' ? `Pay ${amountDisplay}` : `Pay all (${amountDisplay})`}
            </span>
          </Button>
        </>
      }
    >
      <form id="mark-salary-paid-form" onSubmit={handleConfirm} className="space-y-4">
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3.5">
          {mode === 'single' && salaryRow ? (
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Employee</span>
                <span className="font-semibold text-[var(--text)]">{salaryRow.employeeName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Basic + bonus</span>
                <span className="tabular-nums text-[var(--text)]">
                  {formatMoney(
                    roundMoney(salaryRow.basicSalary).plus(roundMoney(salaryRow.bonus))
                  )}
                </span>
              </div>
              {!roundMoney(salaryRow.earlierBalance ?? 0).eq(0) && (
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-muted)]">Earlier balance</span>
                  <span className="tabular-nums text-[var(--text)]">
                    {formatMoney(salaryRow.earlierBalance ?? 0)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Advances this month</span>
                <span className="tabular-nums text-[var(--brand)]">
                  − {formatMoney(salaryRow.advanceDeduction)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--border)] pt-2 text-sm">
                <span className="font-semibold text-[var(--text)]">Net payable</span>
                <span className="font-heading font-bold tabular-nums text-[var(--brand)]">
                  {formatMoney(salaryRow.netPayable)}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
                  <Banknote className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-[var(--text)]">
                    {unpaidRowsCount} unpaid employee{unpaidRowsCount === 1 ? '' : 's'}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">{formatMonthYearLabel(month)}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-[var(--text-muted)]">Total payout</div>
                <div className="font-heading text-base font-bold tabular-nums text-[var(--brand)]">
                  {amountDisplay}
                </div>
              </div>
            </div>
          )}
        </div>

        <DatePicker
          label="Payment date"
          required
          value={paidDate}
          onChange={(e) => setPaidDate(e.target.value)}
        />

        <div className="flex flex-col gap-1.5 min-w-0">
          <label htmlFor="salary-pay-method" className="text-sm font-medium text-[var(--text)]">
            Payment method
          </label>
          <select
            id="salary-pay-method"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            className="h-11 sm:h-10 w-full rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] focus:outline-none glow-input-focus"
          >
            <option value="cash">Cash</option>
            <option value="bank">Bank transfer</option>
            <option value="cheque">Cheque</option>
            <option value="online">Online transfer</option>
          </select>
        </div>
      </form>
    </Dialog>
  );
};
