import type { PrintableDocumentMeta } from '../../components/print/PrintLayout';
import {
  formatMonthNameOnly,
  isSalaryRecordPaid,
  roundMoney,
  type EmployeeLedgerResult,
} from '../../domain/engine';
import type {
  CompanySettings,
  Employee,
  EmployeeAdvance,
  PaymentMethod,
  SalaryRecord,
} from '../../domain/types';
import { amountInWords, formatDate, formatMoney } from '../../lib/format';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function formatMonthYearLabel(monthIso: string): string {
  if (!monthIso || !monthIso.includes('-')) return monthIso || '—';
  const [y, mStr] = monthIso.split('-');
  const mIdx = Number(mStr) - 1;
  const monthName = MONTH_NAMES[mIdx] || monthIso;
  return `${monthName} ${y}`;
}

export const formatMonthLabel = formatMonthYearLabel;

export function formatPaymentMethodLabel(method?: PaymentMethod | string): string {
  if (!method) return 'Cash';
  switch (method) {
    case 'cash':
      return 'Cash';
    case 'bank':
      return 'Bank transfer';
    case 'cheque':
      return 'Cheque';
    case 'online':
      return 'Online transfer';
    default:
      return String(method);
  }
}

export function buildAdvancePrintMeta(input: {
  advance: EmployeeAdvance;
  employee?: Employee;
  employeeRole?: string;
  remainingBalance?: string;
  settings?: CompanySettings;
  company?: CompanySettings;
}): PrintableDocumentMeta {
  const { advance, employee, employeeRole } = input;
  const settings = input.settings || input.company;
  const companyName = settings?.companyName || 'MK Solutions';
  const companyAddress = [settings?.address, settings?.city].filter(Boolean).join(', ');
  const salaryMonthLabel = formatMonthYearLabel(advance.date.slice(0, 7));
  const roleLabel = employee?.role || employeeRole;

  return {
    title: 'Salary advance voucher',
    docNumber: advance.docNumber,
    date: formatDate(advance.date),
    companyName,
    companyAddress: companyAddress || undefined,
    companyPhone: settings?.phone || undefined,
    companyEmail: settings?.email || undefined,
    partyLabel: 'Employee',
    partyName: advance.employeeName,
    partyAddress: roleLabel ? `Role: ${roleLabel}` : undefined,
    metaRows: [
      { label: 'Salary month reduced', value: salaryMonthLabel },
      { label: 'Voucher status', value: advance.status === 'cancelled' ? 'Cancelled' : 'Active' },
    ],
    columns: [
      { key: 'description', header: 'Description', align: 'left' },
      { key: 'salaryMonth', header: 'Salary month', align: 'left' },
      { key: 'amount', header: 'Advance amount', align: 'right' },
    ],
    rows: [
      {
        description: advance.notes || 'Employee salary advance',
        salaryMonth: salaryMonthLabel,
        amount: formatMoney(advance.amount),
      },
    ],
    totals: [
      {
        label: 'Total advance given',
        value: formatMoney(advance.amount),
        highlight: true,
      },
    ],
    amountInWordsText: amountInWords(advance.amount),
  };
}

export const buildAdvanceVoucherPrintMeta = buildAdvancePrintMeta;

export function buildSalarySlipPrintMeta(input: {
  salary: SalaryRecord;
  employee?: Employee;
  settings?: CompanySettings;
  company?: CompanySettings;
}): PrintableDocumentMeta {
  const { salary } = input;
  const settings = input.settings || input.company;
  const companyName = settings?.companyName || 'MK Solutions';
  const companyAddress = [settings?.address, settings?.city].filter(Boolean).join(', ');
  const paid = isSalaryRecordPaid(salary);
  const gross = roundMoney(salary.basicSalary).plus(roundMoney(salary.bonus));
  const earlierBalance = roundMoney(salary.earlierBalance ?? 0);
  const advanceDed = roundMoney(salary.advanceDeduction);

  const rows: Array<Record<string, string | number>> = [
    {
      component: 'Basic monthly salary',
      type: 'Earning',
      amount: formatMoney(salary.basicSalary),
    },
    {
      component: 'Monthly bonus',
      type: 'Earning',
      amount: formatMoney(salary.bonus),
    },
  ];

  if (!earlierBalance.eq(0)) {
    rows.push({
      component:
        earlierBalance.lt(0)
          ? 'Earlier advance balance carried forward'
          : 'Earlier unpaid balance carried forward',
      type: earlierBalance.lt(0) ? 'Deduction' : 'Carry forward',
      amount:
        earlierBalance.lt(0)
          ? `− ${formatMoney(earlierBalance.abs())}`
          : formatMoney(earlierBalance),
    });
  }

  rows.push({
    component: `Advances taken in ${formatMonthNameOnly(salary.month)}`,
    type: 'Deduction',
    amount: advanceDed.gt(0) ? `− ${formatMoney(advanceDed)}` : formatMoney(0),
  });

  return {
    title: `Salary slip — ${formatMonthYearLabel(salary.month)}`,
    docNumber: salary.docNumber,
    date: formatDate(salary.paidDate || salary.date),
    companyName,
    companyAddress: companyAddress || undefined,
    companyPhone: settings?.phone || undefined,
    companyEmail: settings?.email || undefined,
    partyLabel: 'Employee',
    partyName: salary.employeeName,
    partyAddress: `Role: ${salary.employeeRole}`,
    metaRows: [
      { label: 'Salary month', value: formatMonthYearLabel(salary.month) },
      { label: 'Payment status', value: paid ? 'Paid' : 'Unpaid' },
      ...(paid
        ? [
            { label: 'Paid date', value: formatDate(salary.paidDate || salary.date) },
            { label: 'Payment method', value: formatPaymentMethodLabel(salary.paymentMethod) },
          ]
        : []),
    ],
    columns: [
      { key: 'component', header: 'Salary breakdown', align: 'left' },
      { key: 'type', header: 'Type', align: 'left' },
      { key: 'amount', header: 'Amount', align: 'right' },
    ],
    rows,
    totals: [
      { label: 'Gross salary (basic + bonus)', value: formatMoney(gross) },
      ...(earlierBalance.eq(0)
        ? []
        : [{ label: 'Earlier balance', value: formatMoney(earlierBalance) }]),
      { label: 'Advances this month', value: formatMoney(advanceDed) },
      {
        label: paid ? 'Net salary paid' : 'Net salary payable',
        value: formatMoney(salary.netPayable),
        highlight: true,
      },
    ],
    amountInWordsText: amountInWords(salary.netPayable),
  };
}

export function buildSalarySheetPrintMeta(input: {
  month: string;
  rows: SalaryRecord[];
  settings?: CompanySettings;
  company?: CompanySettings;
}): PrintableDocumentMeta {
  const { month, rows } = input;
  const settings = input.settings || input.company;
  const companyName = settings?.companyName || 'MK Solutions';
  const companyAddress = [settings?.address, settings?.city].filter(Boolean).join(', ');

  let totalBasic = roundMoney(0);
  let totalBonus = roundMoney(0);
  let totalAdvances = roundMoney(0);
  let totalEarlier = roundMoney(0);
  let totalNet = roundMoney(0);

  for (const r of rows) {
    totalBasic = totalBasic.plus(roundMoney(r.basicSalary));
    totalBonus = totalBonus.plus(roundMoney(r.bonus));
    totalAdvances = totalAdvances.plus(roundMoney(r.advanceDeduction));
    totalEarlier = totalEarlier.plus(roundMoney(r.earlierBalance ?? 0));
    totalNet = totalNet.plus(roundMoney(r.netPayable));
  }

  return {
    title: `Monthly salary sheet — ${formatMonthYearLabel(month)}`,
    docNumber: `SHEET-${month}`,
    date: formatDate(new Date().toISOString().slice(0, 10)),
    companyName,
    companyAddress: companyAddress || undefined,
    companyPhone: settings?.phone || undefined,
    companyEmail: settings?.email || undefined,
    metaRows: [
      { label: 'Salary month', value: formatMonthYearLabel(month) },
      { label: 'Employees count', value: String(rows.length) },
    ],
    columns: [
      { key: 'employee', header: 'Employee', align: 'left' },
      { key: 'basic', header: 'Basic salary', align: 'right' },
      { key: 'bonus', header: 'Bonus', align: 'right' },
      { key: 'advances', header: 'Advances', align: 'right' },
      { key: 'earlier', header: 'Earlier balance', align: 'right' },
      { key: 'net', header: 'Net payable', align: 'right' },
      { key: 'status', header: 'Status', align: 'left' },
    ],
    rows: rows.map((r) => ({
      employee: `${r.employeeName} (${r.employeeRole})`,
      basic: formatMoney(r.basicSalary),
      bonus: formatMoney(r.bonus),
      advances: formatMoney(r.advanceDeduction),
      earlier: formatMoney(r.earlierBalance ?? 0),
      net: formatMoney(r.netPayable),
      status: isSalaryRecordPaid(r) ? 'Paid' : 'Unpaid',
    })),
    totals: [
      { label: 'Total basic salary', value: formatMoney(totalBasic) },
      { label: 'Total bonus', value: formatMoney(totalBonus) },
      { label: 'Total advances', value: formatMoney(totalAdvances) },
      { label: 'Total net payable', value: formatMoney(totalNet), highlight: true },
    ],
    amountInWordsText: amountInWords(totalNet),
  };
}

export const buildMonthlySalarySheetPrintMeta = buildSalarySheetPrintMeta;

export function buildEmployeeLedgerPrintMeta(input: {
  employee: Employee;
  ledger: EmployeeLedgerResult;
  settings?: CompanySettings;
  filterYear?: string;
  filterMonth?: string;
}): PrintableDocumentMeta {
  const { employee, ledger, settings, filterYear, filterMonth } = input;
  const companyName = settings?.companyName || 'MK Solutions';
  const companyAddress = [settings?.address, settings?.city].filter(Boolean).join(', ');

  const filteredEntries = ledger.entries.filter((e) => {
    if (filterMonth && filterMonth !== 'all' && e.month !== filterMonth) return false;
    if (filterYear && filterYear !== 'all' && !e.month.startsWith(filterYear)) return false;
    return true;
  });

  const periodLabel =
    filterMonth && filterMonth !== 'all'
      ? formatMonthYearLabel(filterMonth)
      : filterYear && filterYear !== 'all'
      ? `Year ${filterYear}`
      : 'All entries';

  return {
    title: 'Employee Statement',
    docNumber: employee.name,
    date: formatDate(new Date().toISOString().slice(0, 10)),
    companyName,
    companyAddress: companyAddress || undefined,
    companyPhone: settings?.phone || undefined,
    companyEmail: settings?.email || undefined,
    partyLabel: 'Employee',
    partyName: employee.name,
    partyAddress: `Role: ${employee.role} · Joined: ${formatDate(employee.joiningDate)}`,
    metaRows: [
      { label: 'Monthly salary', value: formatMoney(employee.basicSalary) },
      { label: 'Statement period', value: periodLabel },
      { label: 'Current balance', value: formatMoney(ledger.currentBalance) },
    ],
    columns: [
      { key: 'date', header: 'Date', align: 'left' },
      { key: 'detail', header: 'Detail', align: 'left' },
      { key: 'amountIn', header: 'Amount in', align: 'right' },
      { key: 'amountOut', header: 'Amount out', align: 'right' },
      { key: 'balance', header: 'Running balance', align: 'right' },
    ],
    rows: filteredEntries.map((e) => ({
      date: formatDate(e.date),
      detail: e.note ? `${e.detail} (${e.note})` : e.detail,
      amountIn: e.amountIn.gt(0) ? formatMoney(e.amountIn) : '—',
      amountOut: e.amountOut.gt(0) ? formatMoney(e.amountOut) : '—',
      balance: formatMoney(e.runningBalance),
    })),
    totals: [
      { label: 'Total salaries earned', value: formatMoney(ledger.totalSalariesEarned) },
      { label: 'Total advances taken', value: formatMoney(ledger.totalAdvances) },
      { label: 'Total salary paid', value: formatMoney(ledger.totalSalaryPaid) },
      {
        label: 'Current balance',
        value: formatMoney(ledger.currentBalance),
        highlight: true,
      },
    ],
    amountInWordsText: amountInWords(ledger.currentBalance),
  };
}
