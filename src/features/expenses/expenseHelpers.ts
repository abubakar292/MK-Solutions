import Decimal from 'decimal.js';
import type { PrintableDocumentMeta } from '../../components/print/PrintLayout';
import { roundMoney } from '../../domain/engine';
import type { CompanySettings, Expense } from '../../domain/types';
import {
  formatDate,
  formatMoney,
  getTodayKarachiIsoDate,
} from '../../lib/format';

/**
 * A2 Chart and category palette (burgundy family plus neutrals):
 * Chart tokens: --chart-1 through --chart-6
 * Referenced via CSS variables defined in src/index.css.
 */
export const ACCENT_SHADE_PALETTE = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
];

export function formatExpenseCategory(
  category: string,
  categoryLabels?: Record<string, string>
): string {
  if (categoryLabels && categoryLabels[category]) {
    return categoryLabels[category];
  }
  switch (category) {
    case 'machine_maintenance':
      return 'Machine maintenance';
    case 'factory_maintenance':
      return 'Factory maintenance';
    case 'electricity':
      return 'Electricity and fuel';
    case 'transport':
      return 'Transport';
    case 'other':
      return 'Other';
    default:
      return category
        .replace(/_/g, ' ')
        .replace(/^\w/, (c) => c.toUpperCase());
  }
}

export function formatMonthDisplay(month: string): string {
  const [yStr, mStr] = month.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return month;
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });
}

export function exportExpensesToCsv(
  expenses: Expense[],
  month: string,
  categoryLabels?: Record<string, string>
): void {
  const headers = [
    'Number',
    'Date',
    'Category',
    'Paid to',
    'Notes',
    'Amount (PKR)',
    'Status',
  ];

  const escapeCsv = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = expenses.map((e) => [
    e.docNumber,
    e.date,
    formatExpenseCategory(e.category, categoryLabels),
    e.paidTo || '',
    e.notes || e.description || '',
    roundMoney(e.amount).toFixed(2),
    e.status === 'cancelled' ? 'Cancelled' : 'Active',
  ]);

  const csvContent = [
    headers.map(escapeCsv).join(','),
    ...rows.map((r) => r.map(escapeCsv).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `mk-expenses-${month}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function buildExpensesPrintMeta(
  expenses: Expense[],
  month: string,
  settings?: CompanySettings | null,
  categoryLabels?: Record<string, string>
): PrintableDocumentMeta {
  const companyAddress = [settings?.address, settings?.city]
    .filter(Boolean)
    .join(', ');

  const activeTotal = expenses
    .filter((e) => e.status === 'active')
    .reduce((acc, e) => acc.plus(roundMoney(e.amount)), new Decimal(0));

  return {
    title: `Expenses Report — ${formatMonthDisplay(month)}`,
    docNumber: `EXP-RPT-${month}`,
    date: formatDate(getTodayKarachiIsoDate()),
    companyName: settings?.companyName || 'MK Melting Solutions',
    companyPhone: settings?.phone,
    companyEmail: settings?.email,
    companyAddress: companyAddress || undefined,
    partyLabel: 'Reporting month',
    partyName: formatMonthDisplay(month),
    metaRows: [
      { label: 'Records listed', value: String(expenses.length) },
      { label: 'Active total', value: formatMoney(activeTotal) },
    ],
    columns: [
      { key: 'docNumber', header: 'Number', align: 'left' },
      { key: 'date', header: 'Date', align: 'left' },
      { key: 'category', header: 'Category', align: 'left' },
      { key: 'paidTo', header: 'Paid to', align: 'left' },
      { key: 'notes', header: 'Notes', align: 'left' },
      { key: 'amount', header: 'Amount', align: 'right' },
    ],
    rows: expenses.map((e) => ({
      docNumber: e.docNumber,
      date: formatDate(e.date),
      category: formatExpenseCategory(e.category, categoryLabels),
      paidTo: e.paidTo || '—',
      notes:
        e.status === 'cancelled'
          ? `[Cancelled] ${e.notes || e.description || ''}`
          : e.notes || e.description || '—',
      amount: formatMoney(e.amount),
    })),
    totals: [
      {
        label: 'Total active expenses',
        value: formatMoney(activeTotal),
        highlight: true,
      },
    ],
  };
}
