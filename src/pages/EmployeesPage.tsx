import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Decimal from 'decimal.js';
import {
  ArrowLeft,
  Banknote,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Edit3,
  FileSpreadsheet,
  FileText,
  Phone,
  Plus,
  Printer,
  Search,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';

import { SectionLoader } from '../components/loader/SectionLoader';
import {
  PrintLayout,
  downloadDocumentPdf,
  usePrintDocument,
  type PrintableDocumentMeta,
} from '../components/print/PrintLayout';
import { ConfirmDialog, Dialog } from '../components/shared/Dialog';
import { EmptyState } from '../components/shared/EmptyState';
import {
  FilterBar,
  FilterMonthPill,
  FilterSelectPill,
} from '../components/shared/FilterBar';
import { PageHeader } from '../components/shared/PageHeader';
import { StatCard, StatCardGrid } from '../components/shared/StatCard';
import { StatusBadge } from '../components/shared/StatusBadge';
import { Button } from '../components/ui/Button';
import {
  calculateEmployeeLedger,
  calculateEmployeeMonthlySalaryRow,
  calculateEmployeeRunningBalance,
  isSalaryRecordPaid,
  roundMoney,
} from '../domain/engine';
import type {
  CompanySettings,
  Employee,
  EmployeeAdvance,
  SalaryRecord,
} from '../domain/types';
import { useAuth } from '../features/auth/AuthContext';
import {
  DeleteEmployeeConfirmDialog,
  EmployeeFormDialog,
  GiveAdvanceDialog,
  MarkSalaryPaidDialog,
} from '../features/employees/EmployeeDialogs';
import {
  buildAdvancePrintMeta,
  buildEmployeeLedgerPrintMeta,
  buildSalarySheetPrintMeta,
  buildSalarySlipPrintMeta,
  formatMonthYearLabel,
} from '../features/employees/employeeHelpers';
import { PartyReportsDialog } from '../features/reports/PartyReportsDialog';
import {
  formatDate,
  formatMoney,
  getTodayKarachiIsoDate,
} from '../lib/format';
import { notify } from '../lib/notify';
import { cn } from '../lib/utils';
import { EmployeeService, SettingsService } from '../services';

type EmployeesTab = 'employees' | 'salaries' | 'advances';
type EmployeeSortField = 'name' | 'salary' | 'advances';
type EmployeeLedgerSubTab = 'ledger' | 'advances' | 'salaries';

function getCurrentKarachiYearMonth(): string {
  return getTodayKarachiIsoDate().slice(0, 7);
}

function exportToCsv(filename: string, headers: string[], rows: Array<Array<string | number>>): void {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvContent = [
    headers.map(escapeCell).join(','),
    ...rows.map((r) => r.map(escapeCell).join(',')),
  ].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'EM';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const EmployeesPage: React.FC = () => {
  const { session } = useAuth();
  const companyId = session?.companyId || '';
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<EmployeesTab>(
    initialTabParam === 'salaries' || initialTabParam === 'advances'
      ? initialTabParam
      : 'employees'
  );

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'employees' || t === 'salaries' || t === 'advances') {
      setActiveTab(t);
    }
  }, [searchParams]);

  const handleTabChange = (tab: EmployeesTab) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  // Data state
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [advances, setAdvances] = useState<EmployeeAdvance[]>([]);
  const [salaries, setSalaries] = useState<SalaryRecord[]>([]);
  const [settings, setSettings] = useState<CompanySettings | undefined>(undefined);

  // Main Employees list filters & sort (5.6)
  const [empSearch, setEmpSearch] = useState('');
  const [empSortBy, setEmpSortBy] = useState<EmployeeSortField>('name');

  // Selected Employee for full-page Employee Ledger view (5.5 / D7)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [ledgerSubTab, setLedgerSubTab] = useState<EmployeeLedgerSubTab>('ledger');
  const [ledgerSearch, setLedgerSearch] = useState<string>('');
  const [ledgerYearFilter, setLedgerYearFilter] = useState<string>('all');
  const [ledgerMonthFilter, setLedgerMonthFilter] = useState<string>('all');
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});
  const [employeeReportsOpen, setEmployeeReportsOpen] = useState(false);

  // Salary Sheet filters & inline bonus drafts (5.4)
  const currentMonth = useMemo(() => getCurrentKarachiYearMonth(), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  const [salarySearch, setSalarySearch] = useState('');
  const [salaryStatusFilter, setSalaryStatusFilter] = useState<string>('all');
  const [generatingSheet, setGeneratingSheet] = useState(false);
  const [bonusDrafts, setBonusDrafts] = useState<Record<string, string>>({});
  const [savingRowId, setSavingRowId] = useState<string | null>(null);

  // Advances tab filters
  const [advSearch, setAdvSearch] = useState('');
  const [advEmployeeFilter, setAdvEmployeeFilter] = useState<string>('all');

  // Dialog states
  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deleteDialogEmployee, setDeleteDialogEmployee] = useState<Employee | null>(null);

  const [giveAdvanceDialogOpen, setGiveAdvanceDialogOpen] = useState(false);
  const [defaultAdvanceEmployeeId, setDefaultAdvanceEmployeeId] = useState<string | undefined>(
    undefined
  );

  const [payDialogState, setPayDialogState] = useState<{
    open: boolean;
    mode: 'single' | 'all';
    salaryRow?: SalaryRecord | null;
  }>({
    open: false,
    mode: 'single',
    salaryRow: null,
  });

  const [cancelTarget, setCancelTarget] = useState<{
    type: 'advance' | 'salary';
    id: string;
    docNumber: string;
  } | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const [printPreviewDoc, setPrintPreviewDoc] = useState<PrintableDocumentMeta | null>(null);
  const { printDocument: triggerPrintPdf } = usePrintDocument();
  const printDocument = useCallback(
    (doc: PrintableDocumentMeta) => {
      void triggerPrintPdf(doc, companyId);
    },
    [triggerPrintPdf, companyId]
  );

  const loadAll = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [empList, advList, salList, companySettings] = await Promise.all([
        EmployeeService.listEmployees(companyId),
        EmployeeService.listAdvances(companyId),
        EmployeeService.listSalaries(companyId),
        SettingsService.getSettings(companyId),
      ]);
      setEmployees(empList);
      setAdvances(advList);
      setSalaries(salList);
      setSettings(companySettings);

      const drafts: Record<string, string> = {};
      for (const s of salList) {
        if (s.status === 'active' && !isSalaryRecordPaid(s)) {
          drafts[s.id] = s.bonus;
        }
      }
      setBonusDrafts(drafts);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to load employee records.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Per-employee computed stats for currentMonth (5.6 & 5.5)
  const employeeCardMetricsMap = useMemo(() => {
    const map = new Map<
      string,
      {
        salary: Decimal;
        advancesThisMonth: Decimal;
        payableThisMonth: Decimal;
        runningBalance: Decimal;
        unpaidSalaryRowThisMonth?: SalaryRecord;
      }
    >();

    for (const emp of employees) {
      const monthSal = salaries.find(
        (s) => s.status === 'active' && s.employeeId === emp.id && s.month === currentMonth
      );
      const rowCalc = calculateEmployeeMonthlySalaryRow({
        advances,
        salaries,
        employeeId: emp.id,
        month: currentMonth,
        basicSalary: monthSal ? monthSal.basicSalary : emp.basicSalary,
        bonus: monthSal ? monthSal.bonus : 0,
        excludeSalaryId: monthSal?.id,
      });

      const running = calculateEmployeeRunningBalance({
        employeeId: emp.id,
        advances,
        salaries,
      });

      const isAlreadyPaidThisMonth = monthSal ? isSalaryRecordPaid(monthSal) : false;

      map.set(emp.id, {
        salary: roundMoney(emp.basicSalary),
        advancesThisMonth: rowCalc.advancesThisMonth,
        payableThisMonth: isAlreadyPaidThisMonth ? new Decimal(0) : rowCalc.netPayable,
        runningBalance: running.balance,
        unpaidSalaryRowThisMonth:
          monthSal && !isSalaryRecordPaid(monthSal) ? monthSal : undefined,
      });
    }

    return map;
  }, [employees, advances, salaries, currentMonth]);

  // 5.6 Summary strip: Employees, Total monthly salary, Total advances this month, Total payable this month
  const summaryStrip = useMemo(() => {
    let totalMonthlySalary = new Decimal(0);
    let totalAdvancesThisMonth = new Decimal(0);
    let totalPayableThisMonth = new Decimal(0);

    for (const emp of employees) {
      const m = employeeCardMetricsMap.get(emp.id);
      if (!m) continue;
      totalMonthlySalary = roundMoney(totalMonthlySalary.plus(m.salary));
      totalAdvancesThisMonth = roundMoney(totalAdvancesThisMonth.plus(m.advancesThisMonth));
      totalPayableThisMonth = roundMoney(totalPayableThisMonth.plus(m.payableThisMonth));
    }

    return {
      employeesCount: employees.length,
      totalMonthlySalary,
      totalAdvancesThisMonth,
      totalPayableThisMonth,
    };
  }, [employees, employeeCardMetricsMap]);

  // Filtered and sorted employees for 5.6 cards
  const filteredAndSortedEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    const filtered = employees.filter((emp) => {
      if (!q) return true;
      return (
        emp.name.toLowerCase().includes(q) ||
        emp.role.toLowerCase().includes(q) ||
        (emp.phone || '').toLowerCase().includes(q)
      );
    });

    return filtered.slice().sort((a, b) => {
      if (empSortBy === 'salary') {
        const diff = roundMoney(b.basicSalary).comparedTo(roundMoney(a.basicSalary));
        if (diff !== 0) return diff;
      } else if (empSortBy === 'advances') {
        const advA = employeeCardMetricsMap.get(a.id)?.advancesThisMonth || new Decimal(0);
        const advB = employeeCardMetricsMap.get(b.id)?.advancesThisMonth || new Decimal(0);
        const diff = advB.comparedTo(advA);
        if (diff !== 0) return diff;
      }
      return a.name.localeCompare(b.name);
    });
  }, [employees, empSearch, empSortBy, employeeCardMetricsMap]);

  // Selected Employee Ledger (5.5)
  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === selectedEmployeeId) || null,
    [employees, selectedEmployeeId]
  );

  const selectedEmployeeLedger = useMemo(() => {
    if (!selectedEmployee) return null;
    return calculateEmployeeLedger({
      employee: selectedEmployee,
      advances,
      salaries,
      currentMonth,
      currentYear: currentMonth.slice(0, 4),
    });
  }, [selectedEmployee, advances, salaries, currentMonth]);

  // Available years & months for the selected employee ledger filters
  const ledgerFilterOptions = useMemo(() => {
    const years = new Set<string>([currentMonth.slice(0, 4)]);
    const months = new Set<string>([currentMonth]);
    if (selectedEmployeeLedger) {
      for (const g of selectedEmployeeLedger.monthGroups) {
        years.add(g.month.slice(0, 4));
        months.add(g.month);
      }
    }
    return {
      years: Array.from(years).sort((a, b) => b.localeCompare(a)),
      months: Array.from(months).sort((a, b) => b.localeCompare(a)),
    };
  }, [selectedEmployeeLedger, currentMonth]);

  // Filtered month groups in the Employee Ledger tab
  const filteredLedgerMonthGroups = useMemo(() => {
    if (!selectedEmployeeLedger) return [];
    const q = ledgerSearch.trim().toLowerCase();
    return selectedEmployeeLedger.monthGroups
      .filter((g) => {
        if (ledgerYearFilter !== 'all' && !g.month.startsWith(ledgerYearFilter))
          return false;
        if (ledgerMonthFilter !== 'all' && g.month !== ledgerMonthFilter)
          return false;
        return true;
      })
      .map((g) => {
        if (!q) return g;
        const matchingEntries = g.entries.filter(
          (e) =>
            e.detail.toLowerCase().includes(q) ||
            e.docNumber.toLowerCase().includes(q) ||
            (e.note && e.note.toLowerCase().includes(q))
        );
        return {
          ...g,
          entries: matchingEntries,
        };
      })
      .filter((g) => g.entries.length > 0);
  }, [selectedEmployeeLedger, ledgerYearFilter, ledgerMonthFilter, ledgerSearch]);

  // Selected employee's advances & salaries for sub-tabs
  const selectedEmployeeAdvances = useMemo(() => {
    if (!selectedEmployee) return [];
    return advances
      .filter((a) => a.status === 'active' && a.employeeId === selectedEmployee.id)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [advances, selectedEmployee]);

  const selectedEmployeeSalaries = useMemo(() => {
    if (!selectedEmployee) return [];
    return salaries
      .filter((s) => s.status === 'active' && s.employeeId === selectedEmployee.id)
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [salaries, selectedEmployee]);

  // 5.4 Salary Sheet rows for selectedMonth
  const monthSalaryRows = useMemo(() => {
    return salaries
      .filter((s) => s.status === 'active' && s.month === selectedMonth)
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [salaries, selectedMonth]);

  const filteredMonthSalaryRows = useMemo(() => {
    const q = salarySearch.trim().toLowerCase();
    return monthSalaryRows.filter((row) => {
      const paid = isSalaryRecordPaid(row);
      if (salaryStatusFilter === 'paid' && !paid) return false;
      if (salaryStatusFilter === 'unpaid' && paid) return false;
      if (q) {
        const match =
          row.employeeName.toLowerCase().includes(q) ||
          row.employeeRole.toLowerCase().includes(q) ||
          row.docNumber.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [monthSalaryRows, salarySearch, salaryStatusFilter]);

  const salarySheetTotals = useMemo(() => {
    let basic = new Decimal(0);
    let bonus = new Decimal(0);
    let advancesDed = new Decimal(0);
    let earlierBalance = new Decimal(0);
    let netPayable = new Decimal(0);
    let unpaidNetPayable = new Decimal(0);
    let unpaidCount = 0;

    for (const row of filteredMonthSalaryRows) {
      const paid = isSalaryRecordPaid(row);
      const draftBonus = !paid && bonusDrafts[row.id] !== undefined ? bonusDrafts[row.id] : row.bonus;
      const calc = calculateEmployeeMonthlySalaryRow({
        advances,
        salaries,
        employeeId: row.employeeId,
        month: row.month,
        basicSalary: row.basicSalary,
        bonus: draftBonus || 0,
        excludeSalaryId: row.id,
      });

      const rBasic = roundMoney(row.basicSalary);
      const rBonus = paid ? roundMoney(row.bonus) : calc.bonus;
      const rAdv = paid ? roundMoney(row.advanceDeduction) : calc.advancesThisMonth;
      const rEarlier = paid ? roundMoney(row.earlierBalance ?? 0) : calc.earlierBalance;
      const rNet = paid ? roundMoney(row.netPayable) : calc.netPayable;

      basic = roundMoney(basic.plus(rBasic));
      bonus = roundMoney(bonus.plus(rBonus));
      advancesDed = roundMoney(advancesDed.plus(rAdv));
      earlierBalance = roundMoney(earlierBalance.plus(rEarlier));
      netPayable = roundMoney(netPayable.plus(rNet));

      if (!paid) {
        unpaidCount += 1;
        unpaidNetPayable = roundMoney(unpaidNetPayable.plus(rNet));
      }
    }

    return {
      basic,
      bonus,
      advancesDed,
      earlierBalance,
      netPayable,
      unpaidNetPayable,
      unpaidCount,
    };
  }, [filteredMonthSalaryRows, bonusDrafts, advances, salaries]);

  // Advances tab filtered list
  const filteredAdvancesList = useMemo(() => {
    const q = advSearch.trim().toLowerCase();
    return advances
      .filter((a) => a.status === 'active')
      .filter((a) => {
        if (advEmployeeFilter !== 'all' && a.employeeId !== advEmployeeFilter) return false;
        if (q) {
          const match =
            a.employeeName.toLowerCase().includes(q) ||
            a.docNumber.toLowerCase().includes(q) ||
            (a.notes || '').toLowerCase().includes(q);
          if (!match) return false;
        }
        return true;
      });
  }, [advances, advSearch, advEmployeeFilter]);

  // Handlers
  const handleGenerateSalarySheet = async () => {
    setGeneratingSheet(true);
    try {
      const created = await EmployeeService.generateSalarySheet(companyId, selectedMonth);
      notify.success(
        `Generated salary sheet for ${formatMonthYearLabel(selectedMonth)} (${created.length} employees).`
      );
      await loadAll();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Could not generate salary sheet.');
    } finally {
      setGeneratingSheet(false);
    }
  };

  const handleBonusBlur = async (row: SalaryRecord) => {
    if (isSalaryRecordPaid(row)) return;
    const draftVal = bonusDrafts[row.id];
    if (draftVal === undefined) return;

    const cleanBonus =
      Number.isFinite(Number(draftVal)) && Number(draftVal) >= 0 ? String(Number(draftVal)) : '0';
    if (roundMoney(cleanBonus).eq(roundMoney(row.bonus))) {
      return;
    }

    setSavingRowId(row.id);
    try {
      await EmployeeService.updateSalaryRow(companyId, row.id, {
        bonus: cleanBonus,
      });
      await loadAll();
      notify.success(`Updated bonus for ${row.employeeName}.`);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Could not update bonus.');
      setBonusDrafts((prev) => ({ ...prev, [row.id]: row.bonus }));
    } finally {
      setSavingRowId(null);
    }
  };

  const handleConfirmCancelDoc = async (reason: string) => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      if (cancelTarget.type === 'advance') {
        await EmployeeService.cancelAdvance(companyId, cancelTarget.id, reason);
        notify.success(`Cancelled advance ${cancelTarget.docNumber}.`);
      } else {
        await EmployeeService.cancelSalary(companyId, cancelTarget.id, reason);
        notify.success(`Cancelled salary record ${cancelTarget.docNumber}.`);
      }
      setCancelTarget(null);
      await loadAll();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Could not cancel record.');
    } finally {
      setCancelling(false);
    }
  };

  const handlePayEmployeeFromLedger = async (emp: Employee) => {
    const existingRow = salaries.find(
      (s) => s.status === 'active' && s.employeeId === emp.id && s.month === currentMonth
    );
    if (existingRow) {
      if (isSalaryRecordPaid(existingRow)) {
        notify.info(`${emp.name}'s salary for ${formatMonthYearLabel(currentMonth)} is already paid.`);
        return;
      }
      setPayDialogState({
        open: true,
        mode: 'single',
        salaryRow: existingRow,
      });
      return;
    }

    const anyForMonth = salaries.some((s) => s.status === 'active' && s.month === currentMonth);
    if (!anyForMonth) {
      try {
        const created = await EmployeeService.generateSalarySheet(companyId, currentMonth);
        await loadAll();
        const empRow = created.find((r) => r.employeeId === emp.id);
        if (empRow) {
          setPayDialogState({
            open: true,
            mode: 'single',
            salaryRow: empRow,
          });
        }
      } catch (err) {
        notify.error(err instanceof Error ? err.message : 'Could not prepare salary row.');
      }
    } else {
      handleTabChange('salaries');
      setSelectedEmployeeId(null);
    }
  };

  // Export CSV for Employee Ledger (5.5)
  const handleExportEmployeeLedgerCsv = () => {
    if (!selectedEmployee || !selectedEmployeeLedger) return;
    const headers = [
      'Date',
      'Month',
      'Voucher',
      'Detail',
      'Note',
      'Amount In (PKR)',
      'Amount Out (PKR)',
      'Running Balance (PKR)',
    ];
    const rows = selectedEmployeeLedger.entries
      .filter((e) => {
        if (ledgerYearFilter !== 'all' && !e.month.startsWith(ledgerYearFilter)) return false;
        if (ledgerMonthFilter !== 'all' && e.month !== ledgerMonthFilter) return false;
        return true;
      })
      .map((e) => [
        e.date,
        e.month,
        e.docNumber,
        e.detail,
        e.note || '',
        e.amountIn.toFixed(2),
        e.amountOut.toFixed(2),
        e.runningBalance.toFixed(2),
      ]);

    exportToCsv(
      `Employee_Ledger_${selectedEmployee.name.replace(/\s+/g, '_')}_${getTodayKarachiIsoDate()}.csv`,
      headers,
      rows
    );
  };

  // Export CSV for Salary Sheet (5.4)
  const handleExportSalarySheetCsv = () => {
    const headers = [
      'Month',
      'Salary Slip No',
      'Employee',
      'Role',
      'Basic Salary (PKR)',
      'Bonus (PKR)',
      'Advances (PKR)',
      'Earlier Balance (PKR)',
      'Net Payable (PKR)',
      'Status',
      'Paid Date',
    ];
    const rows = filteredMonthSalaryRows.map((r) => [
      r.month,
      r.docNumber,
      r.employeeName,
      r.employeeRole,
      roundMoney(r.basicSalary).toFixed(2),
      roundMoney(r.bonus).toFixed(2),
      roundMoney(r.advanceDeduction).toFixed(2),
      roundMoney(r.earlierBalance ?? 0).toFixed(2),
      roundMoney(r.netPayable).toFixed(2),
      isSalaryRecordPaid(r) ? 'Paid' : 'Unpaid',
      r.paidDate || '',
    ]);
    exportToCsv(`Salary_Sheet_${selectedMonth}.csv`, headers, rows);
  };

  // ============================================================================
  // RENDER 5.5 / D7: DEDICATED EMPLOYEE LEDGER VIEW (WHEN AN EMPLOYEE IS OPENED)
  // ============================================================================
  if (selectedEmployee && selectedEmployeeLedger) {
    const thisMonthInfo = selectedEmployeeLedger.thisMonth;
    const progressPct = Math.min(100, Math.max(0, thisMonthInfo.advancePercentOfSalary.toNumber()));
    const isWarningOver80 = thisMonthInfo.isOver80Percent;

    return (
      <div className="space-y-5 pb-12 min-w-0">
        {/* Top Back Navigation */}
        <div>
          <button
            type="button"
            onClick={() => setSelectedEmployeeId(null)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--brand)] transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to employees</span>
          </button>
        </div>

        {/* Shared D7 Header: avatar with initials on --grad-brand, name, city/address & phone, and buttons: Give advance, Pay salary, Reports, Print statement */}
        <div className="rounded-[14px] border border-[var(--border)] bg-white p-4 sm:p-5 shadow-[var(--shadow-xs)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3.5 sm:items-center min-w-0">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-brand-gradient font-heading text-base font-bold text-white shadow-[var(--shadow-sm)]">
                {getInitials(selectedEmployee.name)}
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-heading text-lg font-bold tracking-tight text-[var(--text)] sm:text-xl truncate">
                    {selectedEmployee.name}
                  </h1>
                  <span className="inline-flex items-center rounded-[6px] bg-[var(--brand-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--brand)] border border-[var(--border)]">
                    {selectedEmployee.role}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                  {selectedEmployee.phone && (
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Phone className="h-3.5 w-3.5" />
                      {selectedEmployee.phone}
                    </span>
                  )}
                  {selectedEmployee.address && (
                    <span className="truncate">{selectedEmployee.address}</span>
                  )}
                  {selectedEmployee.cnic && (
                    <span>CNIC: {selectedEmployee.cnic}</span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Joined {formatDate(selectedEmployee.joiningDate)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setDefaultAdvanceEmployeeId(selectedEmployee.id);
                  setGiveAdvanceDialogOpen(true);
                }}
              >
                <Wallet className="h-4 w-4" />
                <span>Give advance</span>
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => void handlePayEmployeeFromLedger(selectedEmployee)}
              >
                <Banknote className="h-4 w-4" />
                <span>Pay salary</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setEmployeeReportsOpen(true)}
              >
                <FileText className="h-4 w-4" />
                <span>Reports</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  printDocument(
                    buildEmployeeLedgerPrintMeta({
                      employee: selectedEmployee,
                      ledger: selectedEmployeeLedger,
                      settings,
                      filterYear: ledgerYearFilter,
                      filterMonth: ledgerMonthFilter,
                    })
                  )
                }
              >
                <Printer className="h-4 w-4" />
                <span>Print statement</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditingEmployee(selectedEmployee);
                  setEmployeeDialogOpen(true);
                }}
              >
                <Edit3 className="h-4 w-4" />
                <span>Edit</span>
              </Button>
              <button
                type="button"
                onClick={() => setDeleteDialogEmployee(selectedEmployee)}
                aria-label="Delete employee"
                title="Delete employee"
                className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[var(--border)] bg-white text-[var(--text-muted)] transition-colors hover:border-[var(--danger-border)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)] cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* D7 Employee Ledger 6 Compact Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 min-w-0">
          {/* 1. This month (salary) */}
          <div className="flex min-h-[76px] min-w-0 flex-col justify-between rounded-[12px] border border-[var(--border)] bg-white px-3.5 py-2.5 shadow-[var(--shadow-xs)]">
            <span className="truncate text-[11px] font-medium text-[var(--text-muted)]">
              This month (salary)
            </span>
            <span className="break-words font-heading text-base sm:text-[17px] font-bold leading-tight tabular-nums text-[var(--text)]">
              {formatMoney(thisMonthInfo.salary)}
            </span>
          </div>

          {/* 2. Advances this month */}
          <div className="flex min-h-[76px] min-w-0 flex-col justify-between rounded-[12px] border border-[var(--border)] bg-white px-3.5 py-2.5 shadow-[var(--shadow-xs)]">
            <span className="truncate text-[11px] font-medium text-[var(--text-muted)]">
              Advances this month
            </span>
            <span
              className={cn(
                'break-words font-heading text-base sm:text-[17px] font-bold leading-tight tabular-nums',
                isWarningOver80 ? 'text-[var(--danger)]' : 'text-[var(--brand)]'
              )}
            >
              {formatMoney(thisMonthInfo.advancesSoFar)}
            </span>
          </div>

          {/* 3. Payable at month end */}
          <div className="flex min-h-[76px] min-w-0 flex-col justify-between rounded-[12px] border border-[var(--border)] bg-white px-3.5 py-2.5 shadow-[var(--shadow-xs)]">
            <span className="truncate text-[11px] font-medium text-[var(--text-muted)]">
              Payable at month end
            </span>
            <span className="break-words font-heading text-base sm:text-[17px] font-bold leading-tight tabular-nums text-[var(--text)]">
              {formatMoney(thisMonthInfo.payableAtMonthEnd)}
            </span>
          </div>

          {/* 4. Current balance */}
          <div className="flex min-h-[76px] min-w-0 flex-col justify-between rounded-[12px] border border-[var(--border)] bg-[var(--brand-soft)]/35 px-3.5 py-2.5 shadow-[var(--shadow-xs)]">
            <span className="truncate text-[11px] font-medium text-[var(--text-muted)]">
              Current balance
            </span>
            <span className="break-words font-heading text-base sm:text-[17px] font-bold leading-tight tabular-nums text-[var(--brand)]">
              {formatMoney(selectedEmployeeLedger.currentBalance)}
            </span>
          </div>

          {/* 5. Advances this year */}
          <div className="flex min-h-[76px] min-w-0 flex-col justify-between rounded-[12px] border border-[var(--border)] bg-white px-3.5 py-2.5 shadow-[var(--shadow-xs)]">
            <span className="truncate text-[11px] font-medium text-[var(--text-muted)]">
              Advances this year
            </span>
            <span className="break-words font-heading text-base sm:text-[17px] font-bold leading-tight tabular-nums text-[var(--text)]">
              {formatMoney(selectedEmployeeLedger.advancesThisYear)}
            </span>
          </div>

          {/* 6. Salary paid this year */}
          <div className="flex min-h-[76px] min-w-0 flex-col justify-between rounded-[12px] border border-[var(--border)] bg-white px-3.5 py-2.5 shadow-[var(--shadow-xs)]">
            <span className="truncate text-[11px] font-medium text-[var(--text-muted)]">
              Salary paid this year
            </span>
            <span className="break-words font-heading text-base sm:text-[17px] font-bold leading-tight tabular-nums text-[var(--success)]">
              {formatMoney(selectedEmployeeLedger.salaryPaidThisYear)}
            </span>
          </div>
        </div>

        {/* Thin progress bar showing how much of the salary is already taken as advances (soft red above 80%), with the numbers beside it */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[12px] border border-[var(--border)] bg-white px-4 py-2.5 shadow-[var(--shadow-xs)]">
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] shrink-0">
            <span className="font-semibold text-[var(--text)]">
              Monthly advance usage ({formatMonthYearLabel(thisMonthInfo.month)})
            </span>
            <span
              className={cn(
                'rounded-[6px] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                isWarningOver80
                  ? 'bg-[var(--danger-bg)] text-[var(--danger)] border border-[var(--danger-border)]'
                  : 'bg-[var(--brand-soft)] text-[var(--brand)]'
              )}
            >
              {thisMonthInfo.advancePercentOfSalary.toFixed(0)}%
            </span>
          </div>

          <div className="flex flex-1 items-center gap-3 min-w-0">
            <div
              className={cn(
                'h-2 flex-1 overflow-hidden rounded-full',
                isWarningOver80 ? 'bg-[var(--danger-bg)]' : 'bg-[var(--brand-soft)]'
              )}
            >
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300',
                  isWarningOver80 ? 'bg-[var(--danger)]' : 'bg-[var(--brand)]'
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs font-medium tabular-nums text-[var(--text-muted)] shrink-0">
              <strong
                className={cn(
                  isWarningOver80 ? 'text-[var(--danger)]' : 'text-[var(--brand)]'
                )}
              >
                {formatMoney(thisMonthInfo.advancesSoFar)}
              </strong>{' '}
              of {formatMoney(thisMonthInfo.salary)}
            </span>
          </div>
        </div>

        {/* 5.5 Sub-tabs: Ledger | Advances | Salaries */}
        <div className="flex items-center gap-2 border-b border-[var(--border)] overflow-x-auto no-scrollbar">
          {(
            [
              { id: 'ledger', label: 'Ledger', count: selectedEmployeeLedger.entries.length },
              { id: 'advances', label: 'Advances', count: selectedEmployeeAdvances.length },
              { id: 'salaries', label: 'Salaries', count: selectedEmployeeSalaries.length },
            ] as const
          ).map((tab) => {
            const active = ledgerSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLedgerSubTab(tab.id)}
                className={cn(
                  'inline-flex min-h-[42px] items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap',
                  active
                    ? 'border-[var(--brand)] text-[var(--brand)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    'rounded-[6px] px-1.5 py-0.5 text-[11px] tabular-nums',
                    active ? 'bg-[var(--brand-soft)] text-[var(--brand)]' : 'bg-[var(--surface-subtle)] text-[var(--text-muted)]'
                  )}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* SUB-TAB 1: LEDGER (Grouped by month, expandable month header, desktop table & mobile timeline cards) */}
        {ledgerSubTab === 'ledger' && (
          <div className="space-y-4">
            <FilterBar
              searchValue={ledgerSearch}
              onSearchChange={setLedgerSearch}
              searchPlaceholder="Search voucher number, advance or salary detail..."
              onClearAll={() => {
                setLedgerSearch('');
                setLedgerYearFilter('all');
                setLedgerMonthFilter('all');
              }}
              controls={[
                {
                  key: 'year',
                  label: 'Year',
                  node: (
                    <FilterSelectPill
                      label="Year"
                      value={ledgerYearFilter}
                      onChange={(val) => {
                        setLedgerYearFilter(val || 'all');
                        setLedgerMonthFilter('all');
                      }}
                      placeholder="All years"
                      options={[
                        { value: 'all', label: 'All years' },
                        ...ledgerFilterOptions.years.map((y) => ({
                          value: y,
                          label: y,
                        })),
                      ]}
                    />
                  ),
                },
                {
                  key: 'month',
                  label: 'Month',
                  node: (
                    <FilterSelectPill
                      label="Month"
                      value={ledgerMonthFilter}
                      onChange={(val) => setLedgerMonthFilter(val || 'all')}
                      placeholder="All months"
                      options={[
                        { value: 'all', label: 'All months' },
                        ...ledgerFilterOptions.months
                          .filter(
                            (m) =>
                              ledgerYearFilter === 'all' ||
                              m.startsWith(ledgerYearFilter)
                          )
                          .map((m) => ({
                            value: m,
                            label: formatMonthYearLabel(m),
                          })),
                      ]}
                    />
                  ),
                },
              ]}
            />

            {filteredLedgerMonthGroups.length === 0 ? (
              <EmptyState message="No ledger entries yet. Give an advance or generate a monthly salary sheet to see entries here." />
            ) : (
              <div className="space-y-3">
                {filteredLedgerMonthGroups.map((group) => {
                  const isCollapsed = Boolean(collapsedMonths[group.month]);
                  return (
                    <div
                      key={group.month}
                      className="overflow-hidden rounded-[10px] border border-[var(--border)] bg-white"
                    >
                      {/* Expandable Month Header */}
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedMonths((prev) => ({
                            ...prev,
                            [group.month]: !prev[group.month],
                          }))
                        }
                        className="flex w-full flex-wrap items-center justify-between gap-2 bg-[var(--surface-subtle)] px-4 py-3 text-left transition-colors hover:bg-[var(--brand-soft)] cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          {isCollapsed ? (
                            <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                          )}
                          <span className="font-heading text-sm font-bold text-[var(--text)]">
                            {formatMonthYearLabel(group.month)}
                          </span>
                          <span className="rounded-[6px] bg-white px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)] border border-[var(--border)]">
                            {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs tabular-nums">
                          <span className="text-[var(--text-muted)]">
                            In:{' '}
                            <strong className="text-[var(--text)]">{formatMoney(group.totalIn)}</strong>
                          </span>
                          <span className="text-[var(--text-muted)]">
                            Out:{' '}
                            <strong className="text-[var(--text)]">{formatMoney(group.totalOut)}</strong>
                          </span>
                          <span className="text-[var(--text-muted)]">
                            Balance:{' '}
                            <strong
                              className={cn(
                                group.closingBalance.lt(0) ? 'text-[var(--danger)]' : 'text-[var(--brand)]'
                              )}
                            >
                              {formatMoney(group.closingBalance)}
                            </strong>
                          </span>
                        </div>
                      </button>

                      {!isCollapsed && (
                        <>
                          {/* Desktop Table */}
                          <div className="hidden md:block overflow-x-auto border-t border-[var(--border)]">
                            <table className="w-full border-collapse text-left text-xs">
                              <thead>
                                <tr className="border-b border-[var(--border)] bg-white text-[11px] font-semibold text-[var(--text-muted)]">
                                  <th className="px-4 py-2.5">Date</th>
                                  <th className="px-4 py-2.5">Detail</th>
                                  <th className="px-4 py-2.5 text-right">Amount in</th>
                                  <th className="px-4 py-2.5 text-right">Amount out</th>
                                  <th className="px-4 py-2.5 text-right">Running balance</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[var(--border)]">
                                {group.entries.map((entry) => (
                                  <tr key={entry.id} className="hover:bg-[var(--surface-subtle)]">
                                    <td className="px-4 py-3 whitespace-nowrap text-[var(--text-muted)] tabular-nums">
                                      {formatDate(entry.date)}
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="font-semibold text-[var(--text)]">
                                        {entry.detail}
                                      </div>
                                      <div className="text-[11px] text-[var(--text-muted)]">
                                        {entry.docNumber}
                                        {entry.note ? ` · ${entry.note}` : ''}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-right font-medium tabular-nums text-[var(--success)]">
                                      {entry.amountIn.gt(0) ? formatMoney(entry.amountIn) : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right font-medium tabular-nums text-[var(--brand)]">
                                      {entry.amountOut.gt(0) ? formatMoney(entry.amountOut) : '—'}
                                    </td>
                                    <td
                                      className={cn(
                                        'px-4 py-3 text-right font-heading font-bold tabular-nums',
                                        entry.runningBalance.lt(0)
                                          ? 'text-[var(--danger)]'
                                          : 'text-[var(--text)]'
                                      )}
                                    >
                                      {formatMoney(entry.runningBalance)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Mobile Timeline of Cards */}
                          <div className="divide-y divide-[var(--border)] border-t border-[var(--border)] md:hidden">
                            {group.entries.map((entry) => (
                              <div key={entry.id} className="p-3.5 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="text-xs font-semibold text-[var(--text)]">
                                      {entry.detail}
                                    </div>
                                    <div className="text-[11px] text-[var(--text-muted)]">
                                      {formatDate(entry.date)} · {entry.docNumber}
                                    </div>
                                    {entry.note && (
                                      <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                                        {entry.note}
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-right">
                                    {entry.amountIn.gt(0) ? (
                                      <div className="text-xs font-bold tabular-nums text-[var(--success)]">
                                        + {formatMoney(entry.amountIn)}
                                      </div>
                                    ) : (
                                      <div className="text-xs font-bold tabular-nums text-[var(--brand)]">
                                        − {formatMoney(entry.amountOut)}
                                      </div>
                                    )}
                                    <div className="mt-0.5 text-[11px] text-[var(--text-muted)] tabular-nums">
                                      Balance: {formatMoney(entry.runningBalance)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SUB-TAB 2: ADVANCES (date, amount, and the salary month it reduced) */}
        {ledgerSubTab === 'advances' && (
          <div className="overflow-hidden rounded-[10px] border border-[var(--border)] bg-white">
            {selectedEmployeeAdvances.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  message={`No salary advances have been given to ${selectedEmployee.name}.`}
                />
              </div>
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-[11px] font-semibold text-[var(--text-muted)]">
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Advance voucher</th>
                        <th className="px-4 py-3">Salary month reduced</th>
                        <th className="px-4 py-3">Note</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {selectedEmployeeAdvances.map((adv) => (
                        <tr key={adv.id} className="hover:bg-[var(--surface-subtle)]">
                          <td className="px-4 py-3 tabular-nums text-[var(--text)]">
                            {formatDate(adv.date)}
                          </td>
                          <td className="px-4 py-3 font-medium text-[var(--text)]">{adv.docNumber}</td>
                          <td className="px-4 py-3 text-[var(--text-muted)]">
                            {formatMonthYearLabel(adv.date.slice(0, 7))}
                          </td>
                          <td className="px-4 py-3 text-[var(--text-muted)]">{adv.notes || '—'}</td>
                          <td className="px-4 py-3 text-right font-heading font-bold tabular-nums text-[var(--text)]">
                            {formatMoney(adv.amount)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  printDocument(
                                    buildAdvancePrintMeta({
                                      advance: adv,
                                      employee: selectedEmployee,
                                      settings,
                                    })
                                  )
                                }
                                className="rounded-[6px] p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text)] cursor-pointer"
                                title="Print voucher"
                                aria-label="Print advance voucher"
                              >
                                <Printer className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void downloadDocumentPdf(
                                    buildAdvancePrintMeta({
                                      advance: adv,
                                      employee: selectedEmployee,
                                      settings,
                                    }),
                                    companyId
                                  )
                                }
                                className="rounded-[6px] p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text)] cursor-pointer"
                                title="Download PDF"
                                aria-label="Download advance voucher PDF"
                              >
                                <Download className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setCancelTarget({
                                    type: 'advance',
                                    id: adv.id,
                                    docNumber: adv.docNumber,
                                  })
                                }
                                className="rounded-[6px] p-1.5 text-[var(--text-muted)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)] cursor-pointer"
                                title="Cancel advance"
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="divide-y divide-[var(--border)] md:hidden">
                  {selectedEmployeeAdvances.map((adv) => (
                    <div key={adv.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-[var(--text)]">
                            {formatDate(adv.date)} · {adv.docNumber}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)]">
                            Reduced salary of {formatMonthYearLabel(adv.date.slice(0, 7))}
                          </div>
                          {adv.notes && (
                            <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{adv.notes}</div>
                          )}
                        </div>
                        <div className="font-heading text-sm font-bold tabular-nums text-[var(--text)]">
                          {formatMoney(adv.amount)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* SUB-TAB 3: SALARIES (one row per month: basic, bonus, advances, earlier balance, net, paid date) */}
        {ledgerSubTab === 'salaries' && (
          <div className="overflow-hidden rounded-[10px] border border-[var(--border)] bg-white">
            {selectedEmployeeSalaries.length === 0 ? (
              <div className="p-6">
                <EmptyState message="No salary records yet. Generate a monthly salary sheet to view monthly salary breakdowns." />
              </div>
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-[11px] font-semibold text-[var(--text-muted)]">
                        <th className="px-4 py-3">Month</th>
                        <th className="px-4 py-3 text-right">Basic</th>
                        <th className="px-4 py-3 text-right">Bonus</th>
                        <th className="px-4 py-3 text-right">Advances</th>
                        <th className="px-4 py-3 text-right">Earlier balance</th>
                        <th className="px-4 py-3 text-right">Net</th>
                        <th className="px-4 py-3">Paid date</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {selectedEmployeeSalaries.map((sal) => {
                        const paid = isSalaryRecordPaid(sal);
                        return (
                          <tr key={sal.id} className="hover:bg-[var(--surface-subtle)]">
                            <td className="px-4 py-3 font-semibold text-[var(--text)]">
                              {formatMonthYearLabel(sal.month)}
                              <div className="text-[11px] font-normal text-[var(--text-muted)]">
                                {sal.docNumber}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-[var(--text)]">
                              {formatMoney(sal.basicSalary)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-[var(--text)]">
                              {formatMoney(sal.bonus)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-[var(--brand)]">
                              {formatMoney(sal.advanceDeduction)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-[var(--text-muted)]">
                              {formatMoney(sal.earlierBalance ?? 0)}
                            </td>
                            <td className="px-4 py-3 text-right font-heading font-bold tabular-nums text-[var(--brand)]">
                              {formatMoney(sal.netPayable)}
                            </td>
                            <td className="px-4 py-3">
                              {paid ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--success)]">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {formatDate(sal.paidDate || sal.date)}
                                </span>
                              ) : (
                                <Button
                                  type="button"
                                  variant="primary"
                                  size="sm"
                                  onClick={() =>
                                    setPayDialogState({
                                      open: true,
                                      mode: 'single',
                                      salaryRow: sal,
                                    })
                                  }
                                >
                                  Pay
                                </Button>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    printDocument(
                                      buildSalarySlipPrintMeta({
                                        salary: sal,
                                        employee: selectedEmployee,
                                        settings,
                                      })
                                    )
                                  }
                                  className="rounded-[6px] p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text)] cursor-pointer"
                                  title="Print salary slip"
                                  aria-label="Print salary slip"
                                >
                                  <Printer className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void downloadDocumentPdf(
                                      buildSalarySlipPrintMeta({
                                        salary: sal,
                                        employee: selectedEmployee,
                                        settings,
                                      }),
                                      companyId
                                    )
                                  }
                                  className="rounded-[6px] p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text)] cursor-pointer"
                                  title="Download salary slip PDF"
                                  aria-label="Download salary slip PDF"
                                >
                                  <Download className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile salary cards */}
                <div className="divide-y divide-[var(--border)] md:hidden">
                  {selectedEmployeeSalaries.map((sal) => {
                    const paid = isSalaryRecordPaid(sal);
                    return (
                      <div key={sal.id} className="p-4 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs font-bold text-[var(--text)]">
                              {formatMonthYearLabel(sal.month)}
                            </div>
                            <div className="text-[11px] text-[var(--text-muted)]">{sal.docNumber}</div>
                          </div>
                          {paid ? (
                            <StatusBadge
                              status="paid"
                              label={`Paid ${formatDate(sal.paidDate || sal.date)}`}
                            />
                          ) : (
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              onClick={() =>
                                setPayDialogState({
                                  open: true,
                                  mode: 'single',
                                  salaryRow: sal,
                                })
                              }
                            >
                              Pay
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-[var(--text-muted)]">Basic + bonus: </span>
                            <span className="font-semibold tabular-nums text-[var(--text)]">
                              {formatMoney(
                                roundMoney(sal.basicSalary).plus(roundMoney(sal.bonus))
                              )}
                            </span>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">Advances: </span>
                            <span className="font-semibold tabular-nums text-[var(--brand)]">
                              {formatMoney(sal.advanceDeduction)}
                            </span>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">Earlier balance: </span>
                            <span className="font-semibold tabular-nums text-[var(--text)]">
                              {formatMoney(sal.earlierBalance ?? 0)}
                            </span>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">Net payable: </span>
                            <span className="font-bold tabular-nums text-[var(--brand)]">
                              {formatMoney(sal.netPayable)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Shared Dialogs */}
        <EmployeeFormDialog
          open={employeeDialogOpen}
          onOpenChange={setEmployeeDialogOpen}
          companyId={companyId}
          employee={editingEmployee}
          onSaved={() => void loadAll()}
        />

        <DeleteEmployeeConfirmDialog
          open={Boolean(deleteDialogEmployee)}
          onOpenChange={(open) => {
            if (!open) setDeleteDialogEmployee(null);
          }}
          companyId={companyId}
          employee={deleteDialogEmployee}
          currentBalance={selectedEmployeeLedger.currentBalance}
          advancesThisMonth={selectedEmployeeLedger.thisMonth.advancesSoFar}
          onDeleted={() => {
            setDeleteDialogEmployee(null);
            setSelectedEmployeeId(null);
            void loadAll();
          }}
        />

        <GiveAdvanceDialog
          open={giveAdvanceDialogOpen}
          onOpenChange={setGiveAdvanceDialogOpen}
          companyId={companyId}
          employees={employees}
          advances={advances}
          salaries={salaries}
          defaultEmployeeId={defaultAdvanceEmployeeId}
          onSaved={() => void loadAll()}
        />

        <MarkSalaryPaidDialog
          open={payDialogState.open}
          onOpenChange={(open) => setPayDialogState((prev) => ({ ...prev, open }))}
          companyId={companyId}
          mode={payDialogState.mode}
          month={payDialogState.salaryRow?.month || currentMonth}
          salaryRow={payDialogState.salaryRow}
          onPaid={() => void loadAll()}
        />

        <ConfirmDialog
          open={Boolean(cancelTarget)}
          onClose={() => setCancelTarget(null)}
          title={`Cancel ${cancelTarget?.docNumber || 'record'}`}
          description="Enter a reason for cancelling this record. Past ledger balances will update automatically."
          confirmLabel="Confirm cancel"
          requireReason
          onConfirm={handleConfirmCancelDoc}
          loading={cancelling}
        />

        <PartyReportsDialog
          open={employeeReportsOpen}
          onClose={() => setEmployeeReportsOpen(false)}
          companyId={companyId}
          settings={settings}
          partyType="employee"
          employee={selectedEmployee}
          advances={advances}
          salaries={salaries}
        />

        <Dialog
          open={Boolean(printPreviewDoc)}
          onClose={() => setPrintPreviewDoc(null)}
          title={printPreviewDoc?.title || 'Print document'}
          maxWidth="xl"
        >
          {printPreviewDoc && <PrintLayout doc={printPreviewDoc} companyId={companyId} />}
        </Dialog>
      </div>
    );
  }

  // ============================================================================
  // RENDER 5.6 & 5.4: MAIN EMPLOYEES PAGE
  // ============================================================================
  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        title="Employees"
        secondaryActions={
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setDefaultAdvanceEmployeeId(employees[0]?.id);
              setGiveAdvanceDialogOpen(true);
            }}
          >
            <Wallet className="h-4 w-4" />
            <span>Give advance</span>
          </Button>
        }
        action={
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setEditingEmployee(null);
              setEmployeeDialogOpen(true);
            }}
          >
            <UserPlus className="h-4 w-4" />
            <span>Add employee</span>
          </Button>
        }
      />

      {/* 5.6 Summary Strip: Employees, Total monthly salary, Total advances this month, Total payable this month */}
      <StatCardGrid>
        <StatCard
          label="Employees"
          value={String(summaryStrip.employeesCount)}
        />
        <StatCard
          label="Total monthly salary"
          value={formatMoney(summaryStrip.totalMonthlySalary)}
        />
        <StatCard
          label="Total advances this month"
          value={formatMoney(summaryStrip.totalAdvancesThisMonth)}
        />
        <StatCard
          label="Total payable this month"
          value={formatMoney(summaryStrip.totalPayableThisMonth)}
          isKeyNumber
        />
      </StatCardGrid>

      {/* Main Section Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--border)]">
        {(
          [
            { id: 'employees', label: 'Employees', count: employees.length },
            { id: 'salaries', label: 'Salary sheet', count: monthSalaryRows.length },
            {
              id: 'advances',
              label: 'Advances',
              count: advances.filter((a) => a.status === 'active').length,
            },
          ] as const
        ).map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                'inline-flex min-h-[44px] shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors cursor-pointer',
                active
                  ? 'border-[var(--brand)] text-[var(--brand)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
              )}
            >
              <span>{tab.label}</span>
              <span
                className={cn(
                  'rounded-[6px] px-1.5 py-0.5 text-[11px] tabular-nums',
                  active ? 'bg-[var(--brand-soft)] text-[var(--brand)]' : 'bg-[var(--surface-subtle)] text-[var(--text-muted)]'
                )}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ========================================================================
          TAB 1: EMPLOYEES (5.6 Search, Sort, Cards with Dustbin Icon)
         ======================================================================== */}
      {activeTab === 'employees' && (
        <div className="space-y-4">
          <FilterBar
            searchValue={empSearch}
            onSearchChange={setEmpSearch}
            searchPlaceholder="Search employee by name, role, or phone..."
            onClearAll={() => {
              setEmpSearch('');
              setEmpSortBy('name');
            }}
            controls={[
              {
                key: 'sort',
                label: 'Sort by',
                node: (
                  <FilterSelectPill
                    label="Sort by"
                    value={empSortBy}
                    onChange={(val) =>
                      setEmpSortBy((val || 'name') as EmployeeSortField)
                    }
                    placeholder="Name"
                    options={[
                      { value: 'name', label: 'Name' },
                      { value: 'salary', label: 'Salary' },
                      { value: 'advances', label: 'Advances this month' },
                    ]}
                  />
                ),
              },
            ]}
          />

          {loading ? (
            <SectionLoader />
          ) : filteredAndSortedEmployees.length === 0 ? (
            <EmptyState
              message={
                empSearch
                  ? 'No matching employees. Try another search term.'
                  : 'No employees added yet. Add your first employee to track monthly salaries and advances.'
              }
              actionLabel={!empSearch ? 'Add employee' : undefined}
              onAction={
                !empSearch
                  ? () => {
                      setEditingEmployee(null);
                      setEmployeeDialogOpen(true);
                    }
                  : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredAndSortedEmployees.map((emp) => {
                const metrics = employeeCardMetricsMap.get(emp.id) || {
                  salary: roundMoney(emp.basicSalary),
                  advancesThisMonth: new Decimal(0),
                  payableThisMonth: roundMoney(emp.basicSalary),
                  runningBalance: new Decimal(0),
                };

                return (
                  <div
                    key={emp.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedEmployeeId(emp.id);
                      setLedgerSubTab('ledger');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedEmployeeId(emp.id);
                        setLedgerSubTab('ledger');
                      }
                    }}
                    className="group relative flex flex-col justify-between rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition-all hover:border-[var(--brand-mid)] shadow-soft focus:outline-none cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-soft)] font-heading text-xs font-bold text-[var(--brand)] border border-[var(--border)]">
                          {getInitials(emp.name)}
                        </div>
                        <div className="min-w-0">
                          <div
                            title={emp.name}
                            className="truncate font-heading text-sm font-bold text-[var(--text)] group-hover:text-[var(--brand)]"
                          >
                            {emp.name}
                          </div>
                          <div
                            title={emp.role}
                            className="truncate text-xs text-[var(--text-muted)]"
                          >
                            {emp.role}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <StatusBadge status={emp.status} />
                        <button
                          type="button"
                          aria-label={`Delete ${emp.name}`}
                          title="Delete employee"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteDialogEmployee(emp);
                          }}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-muted)] transition-colors hover:bg-[var(--danger-bg)] hover:text-[var(--danger)] cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2.5 border-t border-[var(--border)] pt-3 text-xs">
                      <div className="min-w-0">
                        <div
                          title="Salary"
                          className="truncate text-[11px] text-[var(--text-muted)]"
                        >
                          Salary
                        </div>
                        <div className="mt-0.5 break-words font-heading font-bold tabular-nums text-[var(--text)]">
                          {formatMoney(metrics.salary)}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div
                          title="Advances this month"
                          className="truncate text-[11px] text-[var(--text-muted)]"
                        >
                          Advances this month
                        </div>
                        <div className="mt-0.5 break-words font-heading font-bold tabular-nums text-[var(--brand)]">
                          {formatMoney(metrics.advancesThisMonth)}
                        </div>
                      </div>
                      <div className="min-w-0 text-right">
                        <div
                          title="Payable this month"
                          className="truncate text-[11px] text-[var(--text-muted)]"
                        >
                          Payable this month
                        </div>
                        <div className="mt-0.5 break-words font-heading font-bold tabular-nums text-[var(--success)]">
                          {formatMoney(metrics.payableThisMonth)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================
          TAB 2: SALARY SHEET PER MONTH (5.4)
          Columns: employee, basic salary, bonus, advances (auto), earlier balance (auto), net payable, status
         ======================================================================== */}
      {activeTab === 'salaries' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-[12px] border border-[var(--border)] bg-white p-3.5 shadow-soft lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2.5 flex-1">
              <FilterMonthPill
                value={selectedMonth}
                onChange={setSelectedMonth}
                ariaLabel="Select salary month"
              />

              <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="search"
                  value={salarySearch}
                  onChange={(e) => setSalarySearch(e.target.value)}
                  placeholder="Search employee..."
                  className="h-11 sm:h-10 w-full rounded-[10px] border border-[var(--border)] bg-white pl-9 pr-3 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none glow-input-focus"
                />
              </div>

              <FilterSelectPill
                label="Status"
                value={salaryStatusFilter}
                onChange={(val) => setSalaryStatusFilter(val || 'all')}
                placeholder="All statuses"
                options={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'unpaid', label: 'Unpaid' },
                  { value: 'paid', label: 'Paid' },
                ]}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {monthSalaryRows.length === 0 ? (
                <Button
                  type="button"
                  variant="primary"
                  loading={generatingSheet}
                  onClick={handleGenerateSalarySheet}
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Generate salary sheet for {formatMonthYearLabel(selectedMonth)}</span>
                </Button>
              ) : (
                <>
                  {salarySheetTotals.unpaidCount > 0 && (
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() =>
                        setPayDialogState({
                          open: true,
                          mode: 'all',
                          salaryRow: null,
                        })
                      }
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Pay all ({formatMoney(salarySheetTotals.unpaidNetPayable)})</span>
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      printDocument(
                        buildSalarySheetPrintMeta({
                          month: selectedMonth,
                          rows: filteredMonthSalaryRows,
                          settings,
                        })
                      )
                    }
                  >
                    <Printer className="h-4 w-4" />
                    <span>Print</span>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      void downloadDocumentPdf(
                        buildSalarySheetPrintMeta({
                          month: selectedMonth,
                          rows: filteredMonthSalaryRows,
                          settings,
                        }),
                        companyId
                      )
                    }
                  >
                    <Download className="h-4 w-4" />
                    <span>PDF</span>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleExportSalarySheetCsv}
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    <span>CSV</span>
                  </Button>
                </>
              )}
            </div>
          </div>

          {monthSalaryRows.length === 0 ? (
            <EmptyState
              message={`No salary sheet generated for ${formatMonthYearLabel(selectedMonth)}.`}
              actionLabel={`Generate ${formatMonthYearLabel(selectedMonth)} salary sheet`}
              onAction={handleGenerateSalarySheet}
            />
          ) : (
            <div className="overflow-hidden rounded-[10px] border border-[var(--border)] bg-white">
              {/* Desktop Salary Sheet Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-[11px] font-semibold text-[var(--text-muted)]">
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3 text-right">Basic salary</th>
                      <th className="px-4 py-3 text-right">Bonus</th>
                      <th className="px-4 py-3 text-right">Advances</th>
                      <th className="px-4 py-3 text-right">Earlier balance</th>
                      <th className="px-4 py-3 text-right">Net payable</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {filteredMonthSalaryRows.map((row) => {
                      const paid = isSalaryRecordPaid(row);
                      const draftBonus =
                        !paid && bonusDrafts[row.id] !== undefined
                          ? bonusDrafts[row.id]
                          : row.bonus;
                      const liveCalc = calculateEmployeeMonthlySalaryRow({
                        advances,
                        salaries,
                        employeeId: row.employeeId,
                        month: row.month,
                        basicSalary: row.basicSalary,
                        bonus: draftBonus || 0,
                        excludeSalaryId: row.id,
                      });

                      const displayAdvances = paid
                        ? roundMoney(row.advanceDeduction)
                        : liveCalc.advancesThisMonth;
                      const displayEarlier = paid
                        ? roundMoney(row.earlierBalance ?? 0)
                        : liveCalc.earlierBalance;
                      const displayNet = paid
                        ? roundMoney(row.netPayable)
                        : liveCalc.netPayable;

                      return (
                        <tr key={row.id} className="hover:bg-[var(--surface-subtle)]">
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => {
                                const empExists = employees.some((e) => e.id === row.employeeId);
                                if (empExists) {
                                  setSelectedEmployeeId(row.employeeId);
                                  setLedgerSubTab('ledger');
                                }
                              }}
                              className="font-semibold text-[var(--brand)] underline underline-offset-2 cursor-pointer"
                            >
                              {row.employeeName}
                            </button>
                            <div className="text-[11px] text-[var(--text-muted)]">{row.employeeRole}</div>
                          </td>

                          <td className="px-4 py-3 text-right font-medium tabular-nums text-[var(--text)]">
                            {formatMoney(row.basicSalary)}
                          </td>

                          <td className="px-4 py-3 text-right">
                            {paid ? (
                              <span className="font-medium tabular-nums text-[var(--text)]">
                                {formatMoney(row.bonus)}
                              </span>
                            ) : (
                              <input
                                type="number"
                                min="0"
                                step="100"
                                aria-label={`Bonus for ${row.employeeName}`}
                                disabled={savingRowId === row.id}
                                value={bonusDrafts[row.id] ?? row.bonus}
                                onChange={(e) =>
                                  setBonusDrafts((prev) => ({
                                    ...prev,
                                    [row.id]: e.target.value,
                                  }))
                                }
                                onBlur={() => void handleBonusBlur(row)}
                                className="h-8 w-28 rounded-[6px] border border-[var(--border)] bg-white px-2.5 text-right text-xs font-medium tabular-nums text-[var(--text)] focus:outline-none glow-input-focus"
                              />
                            )}
                          </td>

                          <td className="px-4 py-3 text-right font-medium tabular-nums text-[var(--brand)]">
                            {formatMoney(displayAdvances)}
                          </td>

                          <td
                            className={cn(
                              'px-4 py-3 text-right font-medium tabular-nums',
                              displayEarlier.lt(0) ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'
                            )}
                          >
                            {formatMoney(displayEarlier)}
                          </td>

                          <td className="px-4 py-3 text-right font-heading font-bold tabular-nums text-[var(--text)]">
                            {formatMoney(displayNet)}
                          </td>

                          <td className="px-4 py-3">
                            <StatusBadge status={paid ? 'paid' : 'unpaid'} />
                          </td>

                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              {!paid && (
                                <Button
                                  type="button"
                                  variant="primary"
                                  size="sm"
                                  onClick={() =>
                                    setPayDialogState({
                                      open: true,
                                      mode: 'single',
                                      salaryRow: row,
                                    })
                                  }
                                >
                                  Pay
                                </Button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  printDocument(
                                    buildSalarySlipPrintMeta({
                                      salary: row,
                                      employee: employees.find((e) => e.id === row.employeeId),
                                      settings,
                                    })
                                  )
                                }
                                className="rounded-[6px] p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text)] cursor-pointer"
                                title="Print salary slip"
                                aria-label="Print salary slip"
                              >
                                <Printer className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void downloadDocumentPdf(
                                    buildSalarySlipPrintMeta({
                                      salary: row,
                                      employee: employees.find((e) => e.id === row.employeeId),
                                      settings,
                                    }),
                                    companyId
                                  )
                                }
                                className="rounded-[6px] p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text)] cursor-pointer"
                                title="Download salary slip PDF"
                                aria-label="Download salary slip PDF"
                              >
                                <Download className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-subtle)] font-heading text-xs font-bold text-[var(--text)]">
                      <td className="px-4 py-3">Total ({filteredMonthSalaryRows.length})</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(salarySheetTotals.basic)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(salarySheetTotals.bonus)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--brand)]">
                        {formatMoney(salarySheetTotals.advancesDed)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(salarySheetTotals.earlierBalance)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--brand)]">
                        {formatMoney(salarySheetTotals.netPayable)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Mobile Stacked Cards for Salary Sheet */}
              <div className="divide-y divide-[var(--border)] md:hidden">
                {filteredMonthSalaryRows.map((row) => {
                  const paid = isSalaryRecordPaid(row);
                  const draftBonus =
                    !paid && bonusDrafts[row.id] !== undefined
                      ? bonusDrafts[row.id]
                      : row.bonus;
                  const liveCalc = calculateEmployeeMonthlySalaryRow({
                    advances,
                    salaries,
                    employeeId: row.employeeId,
                    month: row.month,
                    basicSalary: row.basicSalary,
                    bonus: draftBonus || 0,
                    excludeSalaryId: row.id,
                  });

                  const displayAdvances = paid
                    ? roundMoney(row.advanceDeduction)
                    : liveCalc.advancesThisMonth;
                  const displayEarlier = paid
                    ? roundMoney(row.earlierBalance ?? 0)
                    : liveCalc.earlierBalance;
                  const displayNet = paid
                    ? roundMoney(row.netPayable)
                    : liveCalc.netPayable;

                  return (
                    <div key={row.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedEmployeeId(row.employeeId);
                              setLedgerSubTab('ledger');
                            }}
                            className="font-heading text-sm font-bold text-[var(--brand)] underline cursor-pointer"
                          >
                            {row.employeeName}
                          </button>
                          <div className="text-xs text-[var(--text-muted)]">{row.employeeRole}</div>
                        </div>
                        <StatusBadge status={paid ? 'paid' : 'unpaid'} />
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 text-xs">
                        <div>
                          <div className="text-[11px] text-[var(--text-muted)]">Basic salary</div>
                          <div className="font-semibold tabular-nums text-[var(--text)]">
                            {formatMoney(row.basicSalary)}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] text-[var(--text-muted)]">Bonus</div>
                          {paid ? (
                            <div className="font-semibold tabular-nums text-[var(--text)]">
                              {formatMoney(row.bonus)}
                            </div>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              step="100"
                              value={bonusDrafts[row.id] ?? row.bonus}
                              onChange={(e) =>
                                setBonusDrafts((prev) => ({
                                  ...prev,
                                  [row.id]: e.target.value,
                                }))
                              }
                              onBlur={() => void handleBonusBlur(row)}
                              className="mt-0.5 h-8 w-full rounded-[6px] border border-[var(--border)] bg-white px-2 text-xs font-medium tabular-nums text-[var(--text)]"
                            />
                          )}
                        </div>

                        <div>
                          <div className="text-[11px] text-[var(--text-muted)]">Advances (automatic)</div>
                          <div className="font-semibold tabular-nums text-[var(--brand)]">
                            {formatMoney(displayAdvances)}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] text-[var(--text-muted)]">Earlier balance</div>
                          <div className="font-semibold tabular-nums text-[var(--text-muted)]">
                            {formatMoney(displayEarlier)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-[var(--border)] pt-2.5">
                        <div>
                          <div className="text-[11px] text-[var(--text-muted)]">Net payable</div>
                          <div className="font-heading text-sm font-bold tabular-nums text-[var(--brand)]">
                            {formatMoney(displayNet)}
                          </div>
                        </div>
                        {!paid && (
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() =>
                              setPayDialogState({
                                open: true,
                                mode: 'single',
                                salaryRow: row,
                              })
                            }
                          >
                            Pay
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================
          TAB 3: ADVANCES LIST
         ======================================================================== */}
      {activeTab === 'advances' && (
        <div className="space-y-4">
          <FilterBar
            searchValue={advSearch}
            onSearchChange={setAdvSearch}
            searchPlaceholder="Search advance voucher, employee, or note..."
            onClearAll={() => {
              setAdvSearch('');
              setAdvEmployeeFilter('all');
            }}
            controls={[
              {
                key: 'employee',
                label: 'Employee',
                node: (
                  <FilterSelectPill
                    label="Employee"
                    value={advEmployeeFilter}
                    onChange={(val) => setAdvEmployeeFilter(val || 'all')}
                    placeholder="All employees"
                    options={[
                      { value: 'all', label: 'All employees' },
                      ...employees.map((e) => ({
                        value: e.id,
                        label: e.name,
                      })),
                    ]}
                  />
                ),
              },
            ]}
          />

          {filteredAdvancesList.length === 0 ? (
            <EmptyState
              message="No advances found. Give an advance to an employee and it will automatically reduce the salary of its month."
              actionLabel="Give advance"
              onAction={() => {
                setDefaultAdvanceEmployeeId(employees[0]?.id);
                setGiveAdvanceDialogOpen(true);
              }}
            />
          ) : (
            <div className="overflow-hidden rounded-[10px] border border-[var(--border)] bg-white">
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-[11px] font-semibold text-[var(--text-muted)]">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Voucher</th>
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Salary month reduced</th>
                      <th className="px-4 py-3">Note</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {filteredAdvancesList.map((adv) => (
                      <tr key={adv.id} className="hover:bg-[var(--surface-subtle)]">
                        <td className="px-4 py-3 tabular-nums text-[var(--text)]">
                          {formatDate(adv.date)}
                        </td>
                        <td className="px-4 py-3 font-medium text-[var(--text)]">{adv.docNumber}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedEmployeeId(adv.employeeId);
                              setLedgerSubTab('advances');
                            }}
                            className="font-semibold text-[var(--brand)] underline underline-offset-2 cursor-pointer"
                          >
                            {adv.employeeName}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">
                          {formatMonthYearLabel(adv.date.slice(0, 7))}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">{adv.notes || '—'}</td>
                        <td className="px-4 py-3 text-right font-heading font-bold tabular-nums text-[var(--text)]">
                          {formatMoney(adv.amount)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                printDocument(
                                  buildAdvancePrintMeta({
                                    advance: adv,
                                    employee: employees.find((e) => e.id === adv.employeeId),
                                    settings,
                                  })
                                )
                              }
                              className="rounded-[6px] p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text)] cursor-pointer"
                              title="Print advance voucher"
                              aria-label="Print advance voucher"
                            >
                              <Printer className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void downloadDocumentPdf(
                                  buildAdvancePrintMeta({
                                    advance: adv,
                                    employee: employees.find((e) => e.id === adv.employeeId),
                                    settings,
                                  }),
                                  companyId
                                )
                              }
                              className="rounded-[6px] p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text)] cursor-pointer"
                              title="Download advance voucher PDF"
                              aria-label="Download advance voucher PDF"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setCancelTarget({
                                  type: 'advance',
                                  id: adv.id,
                                  docNumber: adv.docNumber,
                                })
                              }
                              className="rounded-[6px] p-1.5 text-[var(--text-muted)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)] cursor-pointer"
                              title="Cancel advance"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="divide-y divide-[var(--border)] md:hidden">
                {filteredAdvancesList.map((adv) => (
                  <div key={adv.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEmployeeId(adv.employeeId);
                            setLedgerSubTab('advances');
                          }}
                          className="font-heading text-sm font-bold text-[var(--brand)] underline cursor-pointer"
                        >
                          {adv.employeeName}
                        </button>
                        <div className="text-xs text-[var(--text-muted)]">
                          {formatDate(adv.date)} · {adv.docNumber}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          Salary month: {formatMonthYearLabel(adv.date.slice(0, 7))}
                        </div>
                      </div>
                      <div className="font-heading text-sm font-bold tabular-nums text-[var(--text)]">
                        {formatMoney(adv.amount)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Shared Dialogs */}
      <EmployeeFormDialog
        open={employeeDialogOpen}
        onOpenChange={setEmployeeDialogOpen}
        companyId={companyId}
        employee={editingEmployee}
        onSaved={() => void loadAll()}
      />

      <DeleteEmployeeConfirmDialog
        open={Boolean(deleteDialogEmployee)}
        onOpenChange={(open) => {
          if (!open) setDeleteDialogEmployee(null);
        }}
        companyId={companyId}
        employee={deleteDialogEmployee}
        currentBalance={
          deleteDialogEmployee
            ? employeeCardMetricsMap.get(deleteDialogEmployee.id)?.runningBalance || new Decimal(0)
            : new Decimal(0)
        }
        advancesThisMonth={
          deleteDialogEmployee
            ? employeeCardMetricsMap.get(deleteDialogEmployee.id)?.advancesThisMonth ||
              new Decimal(0)
            : new Decimal(0)
        }
        onDeleted={() => {
          setDeleteDialogEmployee(null);
          void loadAll();
        }}
      />

      <GiveAdvanceDialog
        open={giveAdvanceDialogOpen}
        onOpenChange={setGiveAdvanceDialogOpen}
        companyId={companyId}
        employees={employees}
        advances={advances}
        salaries={salaries}
        defaultEmployeeId={defaultAdvanceEmployeeId}
        onSaved={() => void loadAll()}
      />

      <MarkSalaryPaidDialog
        open={payDialogState.open}
        onOpenChange={(open) => setPayDialogState((prev) => ({ ...prev, open }))}
        companyId={companyId}
        mode={payDialogState.mode}
        month={selectedMonth}
        salaryRow={payDialogState.salaryRow}
        unpaidRowsCount={salarySheetTotals.unpaidCount}
        totalNetPayable={salarySheetTotals.unpaidNetPayable}
        onPaid={() => void loadAll()}
      />

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title={`Cancel ${cancelTarget?.docNumber || 'record'}`}
        description="Enter a reason for cancelling this record."
        confirmLabel="Confirm cancel"
        requireReason
        onConfirm={handleConfirmCancelDoc}
        loading={cancelling}
      />

      <Dialog
        open={Boolean(printPreviewDoc)}
        onClose={() => setPrintPreviewDoc(null)}
        title={printPreviewDoc?.title || 'Print document'}
        maxWidth="xl"
      >
        {printPreviewDoc && <PrintLayout doc={printPreviewDoc} companyId={companyId} />}
      </Dialog>
    </div>
  );
};
