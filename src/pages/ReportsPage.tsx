import {
  CheckCircle2,
  ChevronDown,
  Download,
  FileDown,
  Info,
  Printer,
  AlertTriangle,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Decimal from 'decimal.js';
import { SectionLoader } from '../components/loader/SectionLoader';
import {
  PrintLayout,
  downloadDocumentPdf,
  usePrintDocument,
  type PrintableDocumentMeta,
  type PrintableOverviewLayout,
} from '../components/print/PrintLayout';
import {
  CustomerAgeingStackedBarChart,
  ExpensesCategoryDonutChart,
  PurchaseRateTrendLineChart,
  SalesExpensesProfitComboChart,
  StockValueSplitBar,
  TonsSoldAreaChart,
  TopCustomersHorizontalBarChart,
} from '../components/shared/ChartCard';
import { Dialog } from '../components/shared/Dialog';
import { EmptyState } from '../components/shared/EmptyState';
import {
  FilterBar,
  FilterDateRangePill,
  FilterMonthPill,
  FilterSelectPill,
  type FilterChip,
  type FilterControl,
} from '../components/shared/FilterBar';
import { PageHeader } from '../components/shared/PageHeader';
import { StatCard, StatCardGrid } from '../components/shared/StatCard';
import { StatusBadge } from '../components/shared/StatusBadge';
import { Button } from '../components/ui/Button';
import {
  type AllCompanyRecords,
  type ProfitAndLossLine,
  calculateExpensesReport,
  calculateOverviewReport,
  calculatePayablesReport,
  calculateProductionSummaryReport,
  calculateProfitAndLossReport,
  calculatePurchasesReport,
  calculateReceivablesReport,
  calculateSalariesAndAdvancesReport,
  calculateSalesReport,
  calculateStockSummaryReport,
  formatCategoryDisplayName,
  getMonthDateBounds,
  shiftYearMonth,
} from '../domain/engine';
import type { CompanySettings } from '../domain/types';
import { useAuth } from '../features/auth/AuthContext';
import { formatMonthLabel } from '../features/employees/employeeHelpers';
import {
  formatBags,
  formatDate,
  formatMoney,
  formatTon,
  getTodayKarachiIsoDate,
} from '../lib/format';
import { notify } from '../lib/notify';
import { ReportService, SettingsService } from '../services';

export type ReportTabKey =
  | 'overview'
  | 'pnl'
  | 'sales'
  | 'purchases'
  | 'stock'
  | 'production'
  | 'receivables'
  | 'payables'
  | 'expenses'
  | 'salaries';

export type PeriodMode = 'this_month' | 'last_month' | 'custom_range';

const REPORT_TABS: Array<{ key: ReportTabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'pnl', label: 'Profit and loss' },
  { key: 'sales', label: 'Sales' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'stock', label: 'Stock' },
  { key: 'production', label: 'Production' },
  { key: 'receivables', label: 'Customers' },
  { key: 'payables', label: 'Suppliers' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'salaries', label: 'Salaries and advances' },
];

function resolveTabParam(raw: string | null): ReportTabKey {
  if (!raw) return 'overview';
  if (raw === 'customers') return 'receivables';
  if (raw === 'suppliers') return 'payables';
  if (REPORT_TABS.some((t) => t.key === raw)) return raw as ReportTabKey;
  return 'overview';
}

function downloadCsvFile(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number>>
) {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.map(escapeCell).join(','),
    ...rows.map((r) => r.map(escapeCell).join(',')),
  ];
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatChangeWithPercent(
  diff: Decimal,
  pct: Decimal | null
): string {
  const sign = diff.gt(0) ? '+' : '';
  const amtText = `${sign}${formatMoney(diff)}`;
  if (pct === null) return amtText;
  const pctSign = pct.gt(0) ? '+' : '';
  return `${amtText} (${pctSign}${pct.toFixed(1)}%)`;
}

const PnLInfoTooltip: React.FC<{
  lineKey: string;
  text?: string;
  openKey: string | null;
  setOpenKey: React.Dispatch<React.SetStateAction<string | null>>;
}> = ({ lineKey, text, openKey, setOpenKey }) => {
  if (!text) return null;
  const isOpen = openKey === lineKey;
  return (
    <span className="relative inline-flex items-center ml-1.5 align-middle">
      <button
        type="button"
        aria-label={`Explanation for ${lineKey}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpenKey(isOpen ? null : lineKey);
        }}
        onMouseEnter={() => setOpenKey(lineKey)}
        onMouseLeave={() => setOpenKey((prev) => (prev === lineKey ? null : prev))}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)] focus:outline-none cursor-pointer"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {isOpen && (
        <span
          role="tooltip"
          className="absolute bottom-full left-0 z-30 mb-1.5 w-64 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] p-2.5 text-xs font-normal text-[var(--text)] shadow-md"
        >
          {text}
        </span>
      )}
    </span>
  );
};

export const ReportsPage: React.FC = () => {
  const { session } = useAuth();
  const navigate = useNavigate();
  const companyId = session?.companyId || '';
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<ReportTabKey>(() =>
    resolveTabParam(searchParams.get('tab'))
  );

  const todayIso = useMemo(() => getTodayKarachiIsoDate(), []);
  const currentKarachiMonth = useMemo(() => todayIso.slice(0, 7), [todayIso]);
  const lastKarachiMonth = useMemo(
    () => shiftYearMonth(currentKarachiMonth, -1),
    [currentKarachiMonth]
  );

  const [periodMode, setPeriodMode] = useState<PeriodMode>('this_month');
  const [selectedMonth, setSelectedMonth] = useState<string>(
    () => searchParams.get('month') || currentKarachiMonth
  );
  const [fromDate, setFromDate] = useState<string>(() => {
    const m = searchParams.get('month') || currentKarachiMonth;
    return getMonthDateBounds(m).fromDate;
  });
  const [toDate, setToDate] = useState<string>(() => {
    const m = searchParams.get('month') || currentKarachiMonth;
    return getMonthDateBounds(m).toDate;
  });

  const [customerIdFilter, setCustomerIdFilter] = useState<string>('');
  const [supplierIdFilter, setSupplierIdFilter] = useState<string>('');
  const [itemIdFilter, setItemIdFilter] = useState<string>('');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>('');
  const [stockKindFilter, setStockKindFilter] = useState<
    'all' | 'rock' | 'chemical' | 'final_product'
  >('all');
  const [search, setSearch] = useState<string>('');

  // Grouping / view toggles
  const [salesGrouping, setSalesGrouping] = useState<'by_date' | 'by_customer'>(
    'by_date'
  );
  const [purchasesGrouping, setPurchasesGrouping] = useState<
    'by_item' | 'by_supplier' | 'by_line'
  >('by_item');
  const [expensesGrouping, setExpensesGrouping] = useState<
    'by_category' | 'by_date'
  >('by_category');
  const [customersShowAll, setCustomersShowAll] = useState<boolean>(true);
  const [suppliersShowAll, setSuppliersShowAll] = useState<boolean>(false);

  // Expandable P&L rows & info tooltip state
  const [expandPnlExpenses, setExpandPnlExpenses] = useState<boolean>(false);
  const [expandPnlSalaries, setExpandPnlSalaries] = useState<boolean>(false);
  const [openInfoKey, setOpenInfoKey] = useState<string | null>(null);

  const [records, setRecords] = useState<AllCompanyRecords | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [printOpen, setPrintOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const initializedMonthRef = useRef(false);

  // Sync URL ?tab=... & ?month=...
  useEffect(() => {
    const t = searchParams.get('tab');
    const m = searchParams.get('month');
    if (t) {
      setActiveTab(resolveTabParam(t));
    }
    if (m && /^\d{4}-\d{2}$/.test(m)) {
      setSelectedMonth(m);
      const bounds = getMonthDateBounds(m);
      setFromDate(bounds.fromDate);
      setToDate(bounds.toDate);
    }
  }, [searchParams]);

  const applyMonthSelection = useCallback(
    (nextMonth: string, mode?: PeriodMode) => {
      setSelectedMonth(nextMonth);
      const bounds = getMonthDateBounds(nextMonth);
      setFromDate(bounds.fromDate);
      setToDate(bounds.toDate);
      if (mode) {
        setPeriodMode(mode);
      } else if (nextMonth === currentKarachiMonth) {
        setPeriodMode('this_month');
      } else if (nextMonth === lastKarachiMonth) {
        setPeriodMode('last_month');
      }
    },
    [currentKarachiMonth, lastKarachiMonth]
  );

  const loadData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [allData, settings] = await Promise.all([
        ReportService.getAllCompanyRecords(companyId),
        SettingsService.getSettings(companyId),
      ]);
      setRecords(allData);
      setCompanySettings(settings);

      // Default to latest month with activity if URL did not specify a month
      if (!initializedMonthRef.current) {
        initializedMonthRef.current = true;
        if (!searchParams.get('month')) {
          const currMonth = getTodayKarachiIsoDate().slice(0, 7);
          const hasCurr =
            allData.bills.some(
              (b) => b.status === 'active' && b.date.startsWith(currMonth)
            ) ||
            allData.expenses.some(
              (e) => e.status === 'active' && e.date.startsWith(currMonth)
            ) ||
            allData.salaries.some(
              (s) => s.status === 'active' && s.month === currMonth
            ) ||
            allData.purchases.some(
              (p) => p.status === 'active' && p.date.startsWith(currMonth)
            );
          if (!hasCurr) {
            const months: string[] = [];
            for (const b of allData.bills) {
              if (b.status === 'active') months.push(b.date.slice(0, 7));
            }
            for (const e of allData.expenses) {
              if (e.status === 'active') months.push(e.date.slice(0, 7));
            }
            for (const s of allData.salaries) {
              if (s.status === 'active') months.push(s.month);
            }
            for (const p of allData.purchases) {
              if (p.status === 'active') months.push(p.date.slice(0, 7));
            }
            if (months.length > 0) {
              months.sort();
              const latestM = months[months.length - 1];
              setSelectedMonth(latestM);
              const bounds = getMonthDateBounds(latestM);
              setFromDate(bounds.fromDate);
              setToDate(bounds.toDate);
            }
          }
        }
      }
    } catch (err) {
      notify.error(
        'Could not load reports.',
        err instanceof Error ? err.message : 'Refresh the page to try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [companyId, searchParams]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSelectTab = (key: ReportTabKey) => {
    setActiveTab(key);
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  const handleSelectPeriodMode = (mode: PeriodMode) => {
    setPeriodMode(mode);
    if (mode === 'this_month') {
      const targetMonth = currentKarachiMonth;
      applyMonthSelection(targetMonth, 'this_month');
    } else if (mode === 'last_month') {
      const targetMonth = shiftYearMonth(selectedMonth, -1);
      applyMonthSelection(targetMonth, 'last_month');
    }
  };

  const resetFilters = () => {
    setCustomerIdFilter('');
    setSupplierIdFilter('');
    setItemIdFilter('');
    setExpenseCategoryFilter('');
    setStockKindFilter('all');
    setSearch('');
  };

  // Effective date range used across date-filtered reports
  const effectiveFromDate = fromDate;
  const effectiveToDate = toDate;

  // ============================================================================
  // COMPUTED REPORTS FROM SHARED DOMAIN FUNCTIONS
  // ============================================================================

  const overviewReport = useMemo(() => {
    if (!records) return null;
    return calculateOverviewReport(records, {
      fromDate: effectiveFromDate || undefined,
      toDate: effectiveToDate || undefined,
    });
  }, [records, effectiveFromDate, effectiveToDate]);

  const pnlReport = useMemo(() => {
    if (!records) return null;
    return calculateProfitAndLossReport(records, selectedMonth);
  }, [records, selectedMonth]);

  const salesReport = useMemo(() => {
    if (!records) return null;
    return calculateSalesReport(records, {
      fromDate: effectiveFromDate || undefined,
      toDate: effectiveToDate || undefined,
      customerId: customerIdFilter || undefined,
      search,
    });
  }, [records, effectiveFromDate, effectiveToDate, customerIdFilter, search]);

  const purchasesReport = useMemo(() => {
    if (!records) return null;
    return calculatePurchasesReport(records, {
      fromDate: effectiveFromDate || undefined,
      toDate: effectiveToDate || undefined,
      supplierId: supplierIdFilter || undefined,
      itemId: itemIdFilter || undefined,
      search,
    });
  }, [
    records,
    effectiveFromDate,
    effectiveToDate,
    supplierIdFilter,
    itemIdFilter,
    search,
  ]);

  const stockReport = useMemo(() => {
    if (!records) return null;
    return calculateStockSummaryReport(records, {
      kind: stockKindFilter,
      search,
      asOfDate: effectiveToDate || undefined,
    });
  }, [records, stockKindFilter, search, effectiveToDate]);

  const productionReport = useMemo(() => {
    if (!records) return null;
    return calculateProductionSummaryReport(records, {
      fromDate: effectiveFromDate || undefined,
      toDate: effectiveToDate || undefined,
      search,
    });
  }, [records, effectiveFromDate, effectiveToDate, search]);

  const receivablesReport = useMemo(() => {
    if (!records) return null;
    return calculateReceivablesReport(records, {
      search,
      customerId: customerIdFilter || undefined,
      onlyPositive: !customersShowAll,
      asOfDate: effectiveToDate || todayIso,
    });
  }, [records, search, customerIdFilter, customersShowAll, effectiveToDate, todayIso]);

  const payablesReport = useMemo(() => {
    if (!records) return null;
    return calculatePayablesReport(records, {
      search,
      supplierId: supplierIdFilter || undefined,
      onlyPositive: !suppliersShowAll,
    });
  }, [records, search, supplierIdFilter, suppliersShowAll]);

  const expensesReport = useMemo(() => {
    if (!records) return null;
    return calculateExpensesReport(records, {
      fromDate: effectiveFromDate || undefined,
      toDate: effectiveToDate || undefined,
      category: expenseCategoryFilter || undefined,
      search,
    });
  }, [records, effectiveFromDate, effectiveToDate, expenseCategoryFilter, search]);

  const salariesReport = useMemo(() => {
    if (!records) return null;
    return calculateSalariesAndAdvancesReport(records, {
      month: selectedMonth,
      search,
    });
  }, [records, selectedMonth, search]);

  const periodDisplayLabel = useMemo(() => {
    if (activeTab === 'pnl' || activeTab === 'salaries') {
      return formatMonthLabel(selectedMonth);
    }
    if (effectiveFromDate && effectiveToDate) {
      const mBounds = getMonthDateBounds(selectedMonth);
      if (
        effectiveFromDate === mBounds.fromDate &&
        effectiveToDate === mBounds.toDate
      ) {
        return formatMonthLabel(selectedMonth);
      }
      return `${formatDate(effectiveFromDate)} to ${formatDate(effectiveToDate)}`;
    }
    return 'All dates';
  }, [activeTab, selectedMonth, effectiveFromDate, effectiveToDate]);

  const overviewPeriodLabel = useMemo(() => {
    const formatShortDate = (iso: string) => {
      if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatDate(iso);
      const [y, m, d] = iso.split('-').map(Number);
      const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
      return `${d} ${months[m - 1] || ''} ${y}`;
    };
    if (effectiveFromDate && effectiveToDate) {
      return `${formatShortDate(effectiveFromDate)} to ${formatShortDate(effectiveToDate)}`;
    }
    return 'All dates';
  }, [effectiveFromDate, effectiveToDate]);

  const overviewStructuredLayout = useMemo<PrintableOverviewLayout | null>(() => {
    if (!overviewReport) return null;
    const rm = overviewReport.rawMaterials;
    const pw = overviewReport.powder;
    const pr = overviewReport.profit;
    const mo = overviewReport.moneyInAndOut;
    const chk = overviewReport.consistencyCheck;

    const checkText = `Check: Total purchased ${formatMoney(chk.purchasedTotal)} = Raw materials ${formatMoney(chk.rawMaterialsInStockValue)} + Powder ${formatMoney(chk.powderInStockValue)} + Cost of powder sold ${formatMoney(chk.costOfPowderSoldTotal)}. Difference ${formatMoney(chk.difference)}`;

    return {
      summaryStrip: [
        {
          label: 'Net profit',
          value: formatMoney(pr.netProfit),
        },
        {
          label: 'Sales (powder sold)',
          value: formatMoney(pr.sales),
        },
        {
          label: 'Raw materials in stock',
          sublabel: 'Value at the end',
          value: formatMoney(rm.closingValue),
        },
        {
          label: 'Powder in stock',
          sublabel: 'Value at the end',
          value: formatMoney(pw.closingValue),
        },
      ],
      blocks: [
        {
          title: 'Raw materials',
          caption: 'Rock and chemicals in the godown',
          formula: 'At start + Bought - Used = Left at end',
          columns: [
            { key: 'line', header: '', align: 'left' as const, widthPercent: 37 },
            {
              key: 'rock',
              header: 'Rock (ton)',
              align: 'right' as const,
              widthPercent: 19,
            },
            {
              key: 'chemicals',
              header: 'Chemicals (bags)',
              align: 'right' as const,
              widthPercent: 21,
            },
            {
              key: 'amount',
              header: 'Amount (Rs)',
              align: 'right' as const,
              widthPercent: 23,
            },
          ],
          rows: [
            {
              values: {
                line: 'At start of period',
                rock: formatTon(rm.openingRockTons, { withUnit: false }),
                chemicals: formatBags(rm.openingChemicalBags, { withUnit: false }),
                amount: formatMoney(rm.openingValue),
              },
              variant: 'normal' as const,
            },
            {
              values: {
                line: 'Bought (purchases)',
                rock: formatTon(rm.purchasedRockTons, { withUnit: false }),
                chemicals: formatBags(rm.purchasedChemicalBags, { withUnit: false }),
                amount: formatMoney(rm.purchasesValue),
              },
              variant: 'normal' as const,
            },
            {
              values: {
                line: 'Used in production',
                rock: formatTon(rm.usedRockTons, { withUnit: false }),
                chemicals: formatBags(rm.usedChemicalBags, { withUnit: false }),
                amount: formatMoney(rm.usedInProductionValue),
              },
              variant: 'normal' as const,
            },
            {
              values: {
                line: 'Left at end of period',
                rock: formatTon(rm.closingRockTons, { withUnit: false }),
                chemicals: formatBags(rm.closingChemicalBags, { withUnit: false }),
                amount: formatMoney(rm.closingValue),
              },
              variant: 'highlighted' as const,
            },
          ],
        },
        {
          title: 'Powder',
          caption: 'Finished powder in the godown',
          formula: 'At start + Made - Sold = Left at end',
          columns: [
            { key: 'line', header: '', align: 'left' as const, widthPercent: 46 },
            {
              key: 'powder',
              header: 'Powder (ton)',
              align: 'right' as const,
              widthPercent: 26,
            },
            {
              key: 'amount',
              header: 'Amount (Rs)',
              align: 'right' as const,
              widthPercent: 28,
            },
          ],
          rows: [
            {
              values: {
                line: 'At start of period',
                powder: formatTon(pw.openingTons, { withUnit: false }),
                amount: formatMoney(pw.openingValue),
              },
              variant: 'normal' as const,
            },
            {
              values: {
                line: 'Made in production',
                powder: formatTon(pw.powderMadeTons, { withUnit: false }),
                amount: formatMoney(pw.costOfPowderMade),
              },
              variant: 'normal' as const,
            },
            {
              values: {
                line: 'Sold (cost of powder sold)',
                powder: formatTon(pw.powderSoldTons, { withUnit: false }),
                amount: formatMoney(pw.costOfPowderSold),
              },
              variant: 'normal' as const,
            },
            {
              values: {
                line: 'Left at end of period',
                powder: formatTon(pw.closingTons, { withUnit: false }),
                amount: formatMoney(pw.closingValue),
              },
              variant: 'highlighted' as const,
            },
          ],
        },
        {
          title: 'Profit',
          caption: 'What the business earned in this period',
          columns: [
            { key: 'line', header: '', align: 'left' as const, widthPercent: 46 },
            {
              key: 'detail',
              header: 'Detail',
              align: 'right' as const,
              widthPercent: 26,
            },
            {
              key: 'amount',
              header: 'Amount (Rs)',
              align: 'right' as const,
              widthPercent: 28,
            },
          ],
          rows: [
            {
              values: {
                line: 'Sales (powder sold)',
                detail: formatTon(pw.powderSoldTons),
                amount: formatMoney(pr.sales),
              },
              variant: 'normal' as const,
            },
            {
              values: {
                line: 'Cost of powder sold',
                detail: '',
                amount: formatMoney(pr.costOfPowderSold),
              },
              variant: 'normal' as const,
            },
            {
              values: {
                line: 'Profit on sales',
                detail: '',
                amount: formatMoney(pr.profitOnSales),
              },
              variant: 'subtotal' as const,
            },
            {
              values: {
                line: 'Expenses',
                detail: '',
                amount: formatMoney(pr.expenses),
              },
              variant: 'normal' as const,
            },
            {
              values: {
                line: 'Salaries',
                detail: '',
                amount: formatMoney(pr.salaries),
              },
              variant: 'normal' as const,
            },
            {
              values: {
                line: 'Net profit',
                detail: '',
                amount: formatMoney(pr.netProfit),
              },
              variant: 'highlighted' as const,
            },
          ],
        },
        {
          title: 'Money in and out',
          caption: 'Cash and bank money that actually moved',
          columns: [
            { key: 'line', header: '', align: 'left' as const, widthPercent: 46 },
            {
              key: 'moneyIn',
              header: 'Money in',
              align: 'right' as const,
              widthPercent: 27,
            },
            {
              key: 'moneyOut',
              header: 'Money out',
              align: 'right' as const,
              widthPercent: 27,
            },
          ],
          rows: [
            {
              values: {
                line: 'Received from customers',
                moneyIn: formatMoney(mo.receivedFromCustomers),
                moneyOut: '—',
              },
              variant: 'normal' as const,
            },
            {
              values: {
                line: 'Paid to suppliers',
                moneyIn: '—',
                moneyOut: formatMoney(mo.paidToSuppliers),
              },
              variant: 'normal' as const,
            },
            {
              values: {
                line: 'Expenses paid',
                moneyIn: '—',
                moneyOut: formatMoney(mo.expensesPaid),
              },
              variant: 'normal' as const,
            },
            {
              values: {
                line: 'Salaries paid',
                moneyIn: '—',
                moneyOut: formatMoney(mo.salariesPaid),
              },
              variant: 'normal' as const,
            },
            {
              values: {
                line: 'Advances given to employees',
                moneyIn: '—',
                moneyOut: formatMoney(mo.advancesGiven),
              },
              variant: 'normal' as const,
            },
            {
              values: {
                line: 'Net money movement',
                moneyIn: '',
                moneyOut: formatMoney(mo.netCashMovement),
              },
              variant: 'highlighted' as const,
            },
          ],
        },
      ],
      checkLine: {
        isConsistent: chk.isConsistent,
        text: checkText,
        warningText: chk.isConsistent
          ? undefined
          : 'Warning: Difference is not zero. Review stock and purchase entries.',
      },
    };
  }, [overviewReport]);

  // ============================================================================
  // PRINT / PDF / CSV EXPORT BUILDER FOR ACTIVE REPORT
  // ============================================================================

  const currentExportSpec = useMemo<{
    filename: string;
    meta: PrintableDocumentMeta;
    csvHeaders: string[];
    csvRows: Array<Array<string | number>>;
  } | null>(() => {
    if (!records) return null;
    const companyName = companySettings?.companyName || 'MK Melting Solutions';
    const companyAddress = [companySettings?.address, companySettings?.city]
      .filter(Boolean)
      .join(', ');
    const companyPhone = companySettings?.phone || '';
    const companyEmail = companySettings?.email || '';
    const generatedText = `Generated ${formatDate(todayIso)}`;

    if (activeTab === 'overview' && overviewReport && overviewStructuredLayout) {
      const rm = overviewReport.rawMaterials;
      const pw = overviewReport.powder;
      const pr = overviewReport.profit;
      const mo = overviewReport.moneyInAndOut;

      const csvRows: Array<Array<string | number>> = [
        [
          'Raw materials',
          'At start of period',
          `${formatTon(rm.openingRockTons)} rock · ${formatBags(rm.openingChemicalBags)}`,
          formatMoney(rm.openingValue),
        ],
        [
          'Raw materials',
          'Bought (purchases)',
          `${formatTon(rm.purchasedRockTons)} rock · ${formatBags(rm.purchasedChemicalBags)}`,
          formatMoney(rm.purchasesValue),
        ],
        [
          'Raw materials',
          'Used in production',
          `${formatTon(rm.usedRockTons)} rock · ${formatBags(rm.usedChemicalBags)}`,
          formatMoney(rm.usedInProductionValue),
        ],
        [
          'Raw materials',
          'Left at end of period',
          `${formatTon(rm.closingRockTons)} rock · ${formatBags(rm.closingChemicalBags)}`,
          formatMoney(rm.closingValue),
        ],
        ['Powder', 'At start of period', formatTon(pw.openingTons), formatMoney(pw.openingValue)],
        [
          'Powder',
          'Made in production',
          formatTon(pw.powderMadeTons),
          formatMoney(pw.costOfPowderMade),
        ],
        [
          'Powder',
          'Sold (cost of powder sold)',
          formatTon(pw.powderSoldTons),
          formatMoney(pw.costOfPowderSold),
        ],
        [
          'Powder',
          'Left at end of period',
          formatTon(pw.closingTons),
          formatMoney(pw.closingValue),
        ],
        ['Profit', 'Sales (powder sold)', formatTon(pw.powderSoldTons), formatMoney(pr.sales)],
        ['Profit', 'Cost of powder sold', '', formatMoney(pr.costOfPowderSold)],
        ['Profit', 'Profit on sales', '', formatMoney(pr.profitOnSales)],
        ['Profit', 'Expenses', '', formatMoney(pr.expenses)],
        ['Profit', 'Salaries', '', formatMoney(pr.salaries)],
        ['Profit', 'Net profit', '', formatMoney(pr.netProfit)],
        [
          'Money in and out',
          'Received from customers',
          formatMoney(mo.receivedFromCustomers),
          '—',
        ],
        ['Money in and out', 'Paid to suppliers', '—', formatMoney(mo.paidToSuppliers)],
        ['Money in and out', 'Expenses paid', '—', formatMoney(mo.expensesPaid)],
        ['Money in and out', 'Salaries paid', '—', formatMoney(mo.salariesPaid)],
        [
          'Money in and out',
          'Advances given to employees',
          '—',
          formatMoney(mo.advancesGiven),
        ],
        ['Money in and out', 'Net money movement', '', formatMoney(mo.netCashMovement)],
      ];

      return {
        filename: `Business_Overview_${selectedMonth}.csv`,
        meta: {
          title: 'Business overview',
          docNumber: overviewPeriodLabel,
          date: generatedText,
          companyName,
          companyAddress,
          companyPhone,
          companyEmail,
          columns: [],
          rows: [],
          overviewLayout: overviewStructuredLayout,
        },
        csvHeaders: ['Block', 'Row', 'Details / Money in', 'Amount (Rs) / Money out'],
        csvRows,
      };
    }

    if (activeTab === 'pnl' && pnlReport) {
      const currLabel = formatMonthLabel(pnlReport.month);
      const prevLabel = formatMonthLabel(pnlReport.previousMonth);
      const salesLine = pnlReport.lines.find((l) => l.key === 'sales');
      const cogsLine = pnlReport.lines.find((l) => l.key === 'cogs');
      const grossLine = pnlReport.lines.find((l) => l.key === 'gross_profit');
      const expLine = pnlReport.lines.find((l) => l.key === 'expenses');
      const salLine = pnlReport.lines.find((l) => l.key === 'salaries');
      const netLine = pnlReport.lines.find((l) => l.key === 'net_profit');

      const pnlRows: PrintableOverviewLayout['blocks'][number]['rows'] = [
        {
          values: {
            label: 'Sales (powder sold)',
            curr: formatMoney(pnlReport.sales),
            prev: formatMoney(pnlReport.prevSales),
            diff: salesLine
              ? formatChangeWithPercent(salesLine.difference, salesLine.changePercent)
              : '—',
          },
          variant: 'normal',
        },
        {
          values: {
            label: 'Cost of powder sold',
            curr: formatMoney(pnlReport.cogs),
            prev: formatMoney(pnlReport.prevCogs),
            diff: cogsLine
              ? formatChangeWithPercent(cogsLine.difference, cogsLine.changePercent)
              : '—',
          },
          variant: 'normal',
        },
        {
          values: {
            label: 'Profit on sales',
            curr: formatMoney(pnlReport.grossProfit),
            prev: formatMoney(pnlReport.prevGrossProfit),
            diff: grossLine
              ? formatChangeWithPercent(grossLine.difference, grossLine.changePercent)
              : '—',
          },
          variant: 'subtotal',
        },
        {
          values: {
            label: 'Expenses',
            curr: formatMoney(pnlReport.expenses),
            prev: formatMoney(pnlReport.prevExpenses),
            diff: expLine
              ? formatChangeWithPercent(expLine.difference, expLine.changePercent)
              : '—',
          },
          variant: 'normal',
        },
        ...pnlReport.expenseCategoryLines.map((cat) => ({
          values: {
            label: cat.label,
            curr: formatMoney(cat.currentAmount),
            prev: formatMoney(cat.previousAmount),
            diff: formatChangeWithPercent(cat.difference, cat.changePercent),
          },
          variant: 'detail' as const,
          indent: true,
        })),
        {
          values: {
            label: 'Salaries',
            curr: formatMoney(pnlReport.salaries),
            prev: formatMoney(pnlReport.prevSalaries),
            diff: salLine
              ? formatChangeWithPercent(salLine.difference, salLine.changePercent)
              : '—',
          },
          variant: 'normal',
        },
        ...pnlReport.salaryEmployeeLines.map((emp) => ({
          values: {
            label: emp.label,
            curr: formatMoney(emp.currentAmount),
            prev: formatMoney(emp.previousAmount),
            diff: formatChangeWithPercent(emp.difference, emp.changePercent),
          },
          variant: 'detail' as const,
          indent: true,
        })),
        {
          values: {
            label: 'Net profit',
            curr: formatMoney(pnlReport.netProfit),
            prev: formatMoney(pnlReport.prevNetProfit),
            diff: netLine
              ? formatChangeWithPercent(netLine.difference, netLine.changePercent)
              : '—',
          },
          variant: 'highlighted',
        },
      ];

      const overviewLayout: PrintableOverviewLayout = {
        summaryStrip: [
          {
            label: 'Sales (powder sold)',
            sublabel: formatTon(pnlReport.tonsSold),
            value: formatMoney(pnlReport.sales),
          },
          {
            label: 'Profit on sales',
            sublabel: `${pnlReport.profitMarginPercent.toFixed(1)}% margin`,
            value: formatMoney(pnlReport.grossProfit),
          },
          {
            label: 'Expenses & salaries',
            sublabel: 'Operating costs',
            value: formatMoney(pnlReport.expenses.plus(pnlReport.salaries)),
          },
          {
            label: 'Net profit',
            sublabel: `Compared with ${prevLabel}`,
            value: formatMoney(pnlReport.netProfit),
          },
        ],
        blocks: [
          {
            title: 'Profit and loss',
            caption: `Monthly comparison (${currLabel} vs ${prevLabel}) with category and employee breakdown`,
            formula: 'Sales - Cost of powder sold - Expenses - Salaries = Net profit',
            columns: [
              { key: 'label', header: '', align: 'left', widthPercent: 40 },
              { key: 'curr', header: 'This month', align: 'right', widthPercent: 20 },
              { key: 'prev', header: 'Last month', align: 'right', widthPercent: 20 },
              { key: 'diff', header: 'Change', align: 'right', widthPercent: 20 },
            ],
            rows: pnlRows,
          },
        ],
      };

      return {
        filename: `Profit_and_Loss_${pnlReport.month}.csv`,
        meta: {
          title: 'Profit and loss',
          docNumber: `${currLabel} (compared with ${prevLabel})`,
          date: generatedText,
          companyName,
          companyAddress,
          companyPhone,
          companyEmail,
          columns: [],
          rows: [],
          overviewLayout,
        },
        csvHeaders: ['Particulars', 'This month', 'Last month', 'Change (amount and %)'],
        csvRows: pnlReport.lines.map((l) => [
          l.label,
          l.currentAmount.toFixed(2),
          l.previousAmount.toFixed(2),
          formatChangeWithPercent(l.difference, l.changePercent),
        ]),
      };
    }

    if (activeTab === 'sales' && salesReport) {
      const salesBillsBlock: PrintableOverviewLayout['blocks'][number] = {
        title: 'Sales bills',
        caption: 'One row per sale with received weight, rate per ton, sales amount, cost, and profit',
        columns: [
          { key: 'date', header: 'Date', align: 'left', widthPercent: 11 },
          { key: 'doc', header: 'Bill number', align: 'left', widthPercent: 11 },
          { key: 'customer', header: 'Customer', align: 'left', widthPercent: 18 },
          { key: 'vehicle', header: 'Vehicle', align: 'left', widthPercent: 10 },
          { key: 'tons', header: 'Received tons', align: 'right', widthPercent: 10 },
          { key: 'rate', header: 'Rate per ton', align: 'right', widthPercent: 10 },
          { key: 'amount', header: 'Sales amount', align: 'right', widthPercent: 10 },
          { key: 'cost', header: 'Cost', align: 'right', widthPercent: 10 },
          { key: 'profit', header: 'Profit', align: 'right', widthPercent: 10 },
        ],
        rows: [
          ...(salesReport.billRows.length > 0
            ? salesReport.billRows.map((r) => ({
                values: {
                  date: formatDate(r.date),
                  doc: r.docNumber,
                  customer: r.customerName,
                  vehicle: r.vehicleNumber || '—',
                  tons: formatTon(r.receivedTons),
                  rate: formatMoney(r.ratePerTon),
                  amount: formatMoney(r.amount),
                  cost: formatMoney(r.cost),
                  profit: formatMoney(r.profit),
                },
                variant: 'normal' as const,
              }))
            : [
                {
                  values: {
                    date: '—',
                    doc: '—',
                    customer: 'No sales recorded in this period',
                    vehicle: '—',
                    tons: '0 ton',
                    rate: 'Rs 0',
                    amount: 'Rs 0',
                    cost: 'Rs 0',
                    profit: 'Rs 0',
                  },
                  variant: 'normal' as const,
                },
              ]),
          {
            values: {
              date: 'Total',
              doc: `${salesReport.totals.billsCount} bills`,
              customer: '',
              vehicle: '',
              tons: formatTon(salesReport.totals.receivedTons),
              rate: '',
              amount: formatMoney(salesReport.totals.amount),
              cost: formatMoney(salesReport.totals.cost),
              profit: formatMoney(salesReport.totals.profit),
            },
            variant: 'highlighted',
          },
        ],
      };

      const byCustomerBlock: PrintableOverviewLayout['blocks'][number] = {
        title: 'By customer',
        caption: 'Customer summary for the period',
        columns: [
          { key: 'customer', header: 'Customer', align: 'left', widthPercent: 28 },
          { key: 'bills', header: 'Bills', align: 'right', widthPercent: 10 },
          { key: 'tons', header: 'Received tons', align: 'right', widthPercent: 16 },
          { key: 'amount', header: 'Sales amount', align: 'right', widthPercent: 16 },
          { key: 'cost', header: 'Cost', align: 'right', widthPercent: 15 },
          { key: 'profit', header: 'Profit', align: 'right', widthPercent: 15 },
        ],
        rows: [
          ...(salesReport.customerRows.length > 0
            ? salesReport.customerRows.map((r) => ({
                values: {
                  customer: r.customerName,
                  bills: String(r.billsCount),
                  tons: formatTon(r.receivedTons),
                  amount: formatMoney(r.amount),
                  cost: formatMoney(r.cost),
                  profit: formatMoney(r.profit),
                },
                variant: 'normal' as const,
              }))
            : [
                {
                  values: {
                    customer: 'No customer sales in this period',
                    bills: '0',
                    tons: '0 ton',
                    amount: 'Rs 0',
                    cost: 'Rs 0',
                    profit: 'Rs 0',
                  },
                  variant: 'normal' as const,
                },
              ]),
          {
            values: {
              customer: 'Total by customer',
              bills: String(salesReport.totals.billsCount),
              tons: formatTon(salesReport.totals.receivedTons),
              amount: formatMoney(salesReport.totals.amount),
              cost: formatMoney(salesReport.totals.cost),
              profit: formatMoney(salesReport.totals.profit),
            },
            variant: 'highlighted',
          },
        ],
      };

      const overviewLayout: PrintableOverviewLayout = {
        summaryStrip: [
          {
            label: 'Sales (powder sold)',
            sublabel: `${salesReport.totals.billsCount} bills`,
            value: formatMoney(salesReport.totals.amount),
          },
          {
            label: 'Received weight',
            sublabel: 'Total powder sold',
            value: formatTon(salesReport.totals.receivedTons),
          },
          {
            label: 'Cost of powder sold',
            sublabel: 'Production cost',
            value: formatMoney(salesReport.totals.cost),
          },
          {
            label: 'Profit on sales',
            sublabel: salesReport.totals.amount.gt(0)
              ? `${salesReport.totals.profit.dividedBy(salesReport.totals.amount).times(100).toFixed(1)}% margin`
              : '0.0% margin',
            value: formatMoney(salesReport.totals.profit),
          },
        ],
        blocks:
          salesGrouping === 'by_customer'
            ? [byCustomerBlock, salesBillsBlock]
            : [salesBillsBlock, byCustomerBlock],
      };

      if (salesGrouping === 'by_customer') {
        return {
          filename: `Sales_by_Customer_${todayIso}.csv`,
          meta: {
            title: 'Sales report',
            docNumber: periodDisplayLabel,
            date: generatedText,
            companyName,
            companyAddress,
            companyPhone,
            companyEmail,
            columns: [],
            rows: [],
            overviewLayout,
          },
          csvHeaders: [
            'Customer',
            'City',
            'Bills Count',
            'Received Tons',
            'Sales Amount (PKR)',
            'Cost (PKR)',
            'Profit (PKR)',
            'Paid (PKR)',
            'Balance (PKR)',
          ],
          csvRows: [
            ...salesReport.customerRows.map((r) => [
              r.customerName,
              r.city,
              r.billsCount,
              r.receivedTons.toString(),
              r.amount.toFixed(2),
              r.cost.toFixed(2),
              r.profit.toFixed(2),
              r.paidAmount.toFixed(2),
              r.balance.toFixed(2),
            ]),
            [
              'TOTAL',
              '',
              salesReport.totals.billsCount,
              salesReport.totals.receivedTons.toString(),
              salesReport.totals.amount.toFixed(2),
              salesReport.totals.cost.toFixed(2),
              salesReport.totals.profit.toFixed(2),
              salesReport.totals.paidAmount.toFixed(2),
              salesReport.totals.balance.toFixed(2),
            ],
          ],
        };
      }

      return {
        filename: `Sales_Report_${todayIso}.csv`,
        meta: {
          title: 'Sales report',
          docNumber: periodDisplayLabel,
          date: generatedText,
          companyName,
          companyAddress,
          companyPhone,
          companyEmail,
          columns: [],
          rows: [],
          overviewLayout,
        },
        csvHeaders: [
          'Date',
          'Bill Number',
          'Customer',
          'Vehicle',
          'Received Tons',
          'Rate per Ton (PKR)',
          'Sales Amount (PKR)',
          'Cost (PKR)',
          'Profit (PKR)',
        ],
        csvRows: [
          ...salesReport.billRows.map((r) => [
            r.date,
            r.docNumber,
            r.customerName,
            r.vehicleNumber,
            r.receivedTons.toString(),
            r.ratePerTon.toFixed(2),
            r.amount.toFixed(2),
            r.cost.toFixed(2),
            r.profit.toFixed(2),
          ]),
          [
            'TOTAL',
            '',
            '',
            '',
            salesReport.totals.receivedTons.toString(),
            '',
            salesReport.totals.amount.toFixed(2),
            salesReport.totals.cost.toFixed(2),
            salesReport.totals.profit.toFixed(2),
          ],
        ],
      };
    }

    if (activeTab === 'purchases' && purchasesReport) {
      const sortedItemRows = [...purchasesReport.itemRows].sort((a, b) => {
        if (a.kind === 'rock' && b.kind !== 'rock') return -1;
        if (a.kind !== 'rock' && b.kind === 'rock') return 1;
        return a.itemName.localeCompare(b.itemName);
      });

      const itemBlocks: PrintableOverviewLayout['blocks'] =
        sortedItemRows.length > 0
          ? sortedItemRows.map((itemGroup) => {
              const itemLines = purchasesReport.lineRows.filter(
                (l) => l.itemId === itemGroup.itemId
              );
              return {
                title: itemGroup.itemName,
                caption:
                  itemGroup.kind === 'rock'
                    ? 'Raw rock purchases in tons'
                    : 'Chemical purchases in 25 kg bags',
                columns: [
                  { key: 'date', header: 'Date', align: 'left' as const, widthPercent: 16 },
                  { key: 'doc', header: 'Purchase No', align: 'left' as const, widthPercent: 16 },
                  { key: 'supplier', header: 'Supplier', align: 'left' as const, widthPercent: 26 },
                  { key: 'qty', header: 'Quantity', align: 'right' as const, widthPercent: 14 },
                  { key: 'rate', header: 'Rate', align: 'right' as const, widthPercent: 14 },
                  { key: 'amount', header: 'Total (Rs)', align: 'right' as const, widthPercent: 14 },
                ],
                rows: [
                  ...itemLines.map((line) => ({
                    values: {
                      date: formatDate(line.date),
                      doc: line.docNumber,
                      supplier: line.supplierName,
                      qty:
                        line.unit === 'ton'
                          ? formatTon(line.quantity)
                          : formatBags(line.quantity),
                      rate: formatMoney(line.rate),
                      amount: formatMoney(line.amount),
                    },
                    variant: 'normal' as const,
                  })),
                  {
                    values: {
                      date: `${itemGroup.itemName} subtotal`,
                      doc: `${itemLines.length} ${itemLines.length === 1 ? 'entry' : 'entries'}`,
                      supplier: '',
                      qty:
                        itemGroup.unit === 'ton'
                          ? formatTon(itemGroup.quantity)
                          : formatBags(itemGroup.quantity),
                      rate: `${formatMoney(itemGroup.avgRate)} avg`,
                      amount: formatMoney(itemGroup.amount),
                    },
                    variant: 'subtotal' as const,
                  },
                ],
              };
            })
          : [
              {
                title: 'Purchases by item',
                caption: 'Rock and chemical purchases in the period',
                columns: [
                  { key: 'date', header: 'Date', align: 'left' as const, widthPercent: 16 },
                  { key: 'doc', header: 'Purchase No', align: 'left' as const, widthPercent: 16 },
                  { key: 'supplier', header: 'Supplier', align: 'left' as const, widthPercent: 26 },
                  { key: 'qty', header: 'Quantity', align: 'right' as const, widthPercent: 14 },
                  { key: 'rate', header: 'Rate', align: 'right' as const, widthPercent: 14 },
                  { key: 'amount', header: 'Total (Rs)', align: 'right' as const, widthPercent: 14 },
                ],
                rows: [
                  {
                    values: {
                      date: '—',
                      doc: '—',
                      supplier: 'No purchases recorded in this period',
                      qty: '0',
                      rate: 'Rs 0',
                      amount: 'Rs 0',
                    },
                    variant: 'normal' as const,
                  },
                ],
              },
            ];

      const bySupplierBlock: PrintableOverviewLayout['blocks'][number] = {
        title: 'By supplier',
        caption: 'Summary of purchases grouped by supplier',
        columns: [
          { key: 'supplier', header: 'Supplier', align: 'left', widthPercent: 32 },
          { key: 'count', header: 'Purchases', align: 'right', widthPercent: 14 },
          { key: 'rock', header: 'Rock (ton)', align: 'right', widthPercent: 18 },
          { key: 'bags', header: 'Chemicals (bags)', align: 'right', widthPercent: 18 },
          { key: 'total', header: 'Total (Rs)', align: 'right', widthPercent: 18 },
        ],
        rows: [
          ...(purchasesReport.supplierRows.length > 0
            ? purchasesReport.supplierRows.map((r) => ({
                values: {
                  supplier: r.supplierName,
                  count: String(r.purchasesCount),
                  rock: formatTon(r.rockTons),
                  bags: formatBags(r.chemicalBags),
                  total: formatMoney(r.totalAmount),
                },
                variant: 'normal' as const,
              }))
            : [
                {
                  values: {
                    supplier: 'No supplier purchases in this period',
                    count: '0',
                    rock: '0 ton',
                    bags: '0 bags',
                    total: 'Rs 0',
                  },
                  variant: 'normal' as const,
                },
              ]),
          {
            values: {
              supplier: 'Total purchases',
              count: String(purchasesReport.totals.linesCount),
              rock: formatTon(purchasesReport.totals.rockTons),
              bags: formatBags(purchasesReport.totals.chemicalBags),
              total: formatMoney(purchasesReport.totals.amount),
            },
            variant: 'highlighted',
          },
        ],
      };

      const overviewLayout: PrintableOverviewLayout = {
        summaryStrip: [
          {
            label: 'Total purchases',
            sublabel: `${purchasesReport.totals.linesCount} lines`,
            value: formatMoney(purchasesReport.totals.amount),
          },
          {
            label: 'Rock bought',
            sublabel: 'Raw material in tons',
            value: formatTon(purchasesReport.totals.rockTons),
          },
          {
            label: 'Chemicals bought',
            sublabel: '25 kg bags',
            value: formatBags(purchasesReport.totals.chemicalBags),
          },
          {
            label: 'Suppliers',
            sublabel: 'Active in period',
            value: String(purchasesReport.supplierRows.length),
          },
        ],
        blocks: [...itemBlocks, bySupplierBlock],
      };

      if (purchasesGrouping === 'by_supplier') {
        return {
          filename: `Purchases_by_Supplier_${todayIso}.csv`,
          meta: {
            title: 'Purchases report',
            docNumber: periodDisplayLabel,
            date: generatedText,
            companyName,
            companyAddress,
            companyPhone,
            companyEmail,
            columns: [],
            rows: [],
            overviewLayout,
          },
          csvHeaders: [
            'Supplier',
            'Purchases Count',
            'Rock (Tons)',
            'Chemicals (Bags)',
            'Total (PKR)',
          ],
          csvRows: [
            ...purchasesReport.supplierRows.map((r) => [
              r.supplierName,
              r.purchasesCount,
              r.rockTons.toString(),
              r.chemicalBags.toString(),
              r.totalAmount.toFixed(2),
            ]),
            [
              'TOTAL',
              '',
              purchasesReport.totals.rockTons.toString(),
              purchasesReport.totals.chemicalBags.toString(),
              purchasesReport.totals.amount.toFixed(2),
            ],
          ],
        };
      }

      if (purchasesGrouping === 'by_item') {
        return {
          filename: `Purchases_by_Item_${todayIso}.csv`,
          meta: {
            title: 'Purchases report',
            docNumber: periodDisplayLabel,
            date: generatedText,
            companyName,
            companyAddress,
            companyPhone,
            companyEmail,
            columns: [],
            rows: [],
            overviewLayout,
          },
          csvHeaders: [
            'Item',
            'Type',
            'Quantity',
            'Unit',
            'Average Rate (PKR)',
            'Total (PKR)',
          ],
          csvRows: [
            ...purchasesReport.itemRows.map((r) => [
              r.itemName,
              r.kind,
              r.quantity.toString(),
              r.unit,
              r.avgRate.toFixed(2),
              r.amount.toFixed(2),
            ]),
            ['TOTAL', '', '', '', '', purchasesReport.totals.amount.toFixed(2)],
          ],
        };
      }

      return {
        filename: `Purchases_Lines_${todayIso}.csv`,
        meta: {
          title: 'Purchases report',
          docNumber: periodDisplayLabel,
          date: generatedText,
          companyName,
          companyAddress,
          companyPhone,
          companyEmail,
          columns: [],
          rows: [],
          overviewLayout,
        },
        csvHeaders: [
          'Purchase No',
          'Date',
          'Supplier',
          'Item',
          'Quantity',
          'Unit',
          'Rate (PKR)',
          'Total (PKR)',
        ],
        csvRows: [
          ...purchasesReport.lineRows.map((r) => [
            r.docNumber,
            r.date,
            r.supplierName,
            r.itemName,
            r.quantity.toString(),
            r.unit,
            r.rate.toFixed(2),
            r.amount.toFixed(2),
          ]),
          [
            'TOTAL',
            '',
            '',
            '',
            '',
            '',
            '',
            purchasesReport.totals.amount.toFixed(2),
          ],
        ],
      };
    }

    if (activeTab === 'stock' && stockReport) {
      const rockRows = stockReport.rows.filter((r) => r.kind === 'rock');
      const chemRows = stockReport.rows.filter((r) => r.kind === 'chemical');
      const powderRows = stockReport.rows.filter((r) => r.kind === 'final_product');

      const rockTotalValue = rockRows.reduce(
        (acc, r) => acc.plus(r.totalValue),
        new Decimal(0)
      );
      const chemTotalValue = chemRows.reduce(
        (acc, r) => acc.plus(r.totalValue),
        new Decimal(0)
      );

      const stockColumns: PrintableOverviewLayout['blocks'][number]['columns'] = [
        { key: 'item', header: 'Item', align: 'left', widthPercent: 40 },
        { key: 'stock', header: 'Stock', align: 'right', widthPercent: 20 },
        { key: 'avgCost', header: 'Average cost', align: 'right', widthPercent: 20 },
        { key: 'value', header: 'Value (Rs)', align: 'right', widthPercent: 20 },
      ];

      const overviewLayout: PrintableOverviewLayout = {
        summaryStrip: [
          {
            label: 'Rock in stock',
            sublabel: formatMoney(rockTotalValue),
            value: formatTon(stockReport.rockTons),
          },
          {
            label: 'Chemicals in stock',
            sublabel: formatMoney(chemTotalValue),
            value: formatBags(stockReport.chemicalBags),
          },
          {
            label: 'Powder in stock',
            sublabel: formatMoney(stockReport.powderValue),
            value: formatTon(stockReport.finalProductTons),
          },
          {
            label: 'Total stock value',
            sublabel: `Raw materials: ${formatMoney(stockReport.rawMaterialsValue)}`,
            value: formatMoney(stockReport.totalValue),
          },
        ],
        blocks: [
          {
            title: 'Rock',
            caption: 'Raw rock in the godown (in tons)',
            columns: stockColumns,
            rows: [
              ...(rockRows.length > 0
                ? rockRows.map((r) => ({
                    values: {
                      item: r.itemName,
                      stock: formatTon(r.quantity),
                      avgCost: `${formatMoney(r.avgCost)} / ton`,
                      value: formatMoney(r.totalValue),
                    },
                    variant: 'normal' as const,
                  }))
                : [
                    {
                      values: {
                        item: 'Rock',
                        stock: '0 ton',
                        avgCost: 'Rs 0 / ton',
                        value: 'Rs 0',
                      },
                      variant: 'normal' as const,
                    },
                  ]),
              {
                values: {
                  item: 'Rock subtotal',
                  stock: formatTon(stockReport.rockTons),
                  avgCost: '',
                  value: formatMoney(rockTotalValue),
                },
                variant: 'subtotal',
              },
            ],
          },
          {
            title: 'Chemicals',
            caption: 'Chemicals in the godown (in 25 kg bags)',
            columns: stockColumns,
            rows: [
              ...(chemRows.length > 0
                ? chemRows.map((r) => ({
                    values: {
                      item: r.itemName,
                      stock: formatBags(r.quantity),
                      avgCost: `${formatMoney(r.avgCost)} / bag`,
                      value: formatMoney(r.totalValue),
                    },
                    variant: 'normal' as const,
                  }))
                : [
                    {
                      values: {
                        item: 'No chemicals in stock',
                        stock: '0 bags',
                        avgCost: 'Rs 0 / bag',
                        value: 'Rs 0',
                      },
                      variant: 'normal' as const,
                    },
                  ]),
              {
                values: {
                  item: 'Chemicals subtotal',
                  stock: formatBags(stockReport.chemicalBags),
                  avgCost: '',
                  value: formatMoney(chemTotalValue),
                },
                variant: 'subtotal',
              },
            ],
          },
          {
            title: 'Powder',
            caption: 'Finished powder ready for sale (in tons)',
            columns: stockColumns,
            rows: [
              ...(powderRows.length > 0
                ? powderRows.map((r) => ({
                    values: {
                      item: r.itemName,
                      stock: formatTon(r.quantity),
                      avgCost: `${formatMoney(r.avgCost)} / ton`,
                      value: formatMoney(r.totalValue),
                    },
                    variant: 'normal' as const,
                  }))
                : [
                    {
                      values: {
                        item: 'Final product (Powder)',
                        stock: '0 ton',
                        avgCost: 'Rs 0 / ton',
                        value: 'Rs 0',
                      },
                      variant: 'normal' as const,
                    },
                  ]),
              {
                values: {
                  item: 'Powder subtotal',
                  stock: formatTon(stockReport.finalProductTons),
                  avgCost: '',
                  value: formatMoney(stockReport.powderValue),
                },
                variant: 'subtotal',
              },
            ],
          },
        ],
        grandTotalBar: {
          label: 'Total stock value',
          details: `Raw materials ${formatMoney(stockReport.rawMaterialsValue)} + Powder ${formatMoney(stockReport.powderValue)}`,
          value: formatMoney(stockReport.totalValue),
        },
      };

      return {
        filename: `Stock_Report_${todayIso}.csv`,
        meta: {
          title: 'Stock report',
          docNumber: `As of ${formatDate(effectiveToDate || todayIso)}`,
          date: generatedText,
          companyName,
          companyAddress,
          companyPhone,
          companyEmail,
          columns: [],
          rows: [],
          overviewLayout,
        },
        csvHeaders: [
          'Item',
          'Type',
          'Stock',
          'Unit',
          'Average Cost (PKR)',
          'Value (PKR)',
        ],
        csvRows: [
          ...stockReport.rows.map((r) => [
            r.itemName,
            r.typeLabel,
            r.quantity.toString(),
            r.unit,
            r.avgCost.toFixed(2),
            r.totalValue.toFixed(2),
          ]),
          ['TOTAL', '', '', '', '', stockReport.totalValue.toFixed(2)],
        ],
      };
    }

    if (activeTab === 'production' && productionReport) {
      const overviewLayout: PrintableOverviewLayout = {
        summaryStrip: [
          {
            label: 'Batches run',
            sublabel: periodDisplayLabel,
            value: String(productionReport.totals.batchesCount),
          },
          {
            label: 'Rock used',
            sublabel: `${formatBags(productionReport.totals.chemicalBags)} chemicals`,
            value: formatTon(productionReport.totals.rockTons),
          },
          {
            label: 'Powder made',
            sublabel: 'Finished powder output',
            value: formatTon(productionReport.totals.finalProductTons),
          },
          {
            label: 'Total production cost',
            sublabel: `${formatMoney(productionReport.totals.avgCostPerTon)} / ton`,
            value: formatMoney(productionReport.totals.totalCost),
          },
        ],
        blocks: [
          {
            title: 'Production batches',
            caption: 'One row per batch with rock tons, chemicals used, powder tons, total cost, and cost per ton',
            columns: [
              { key: 'date', header: 'Date', align: 'left', widthPercent: 16 },
              { key: 'rock', header: 'Rock tons', align: 'right', widthPercent: 14 },
              { key: 'chem', header: 'Chemicals used', align: 'left', widthPercent: 26 },
              { key: 'final', header: 'Powder tons', align: 'right', widthPercent: 14 },
              { key: 'totalCost', header: 'Total cost', align: 'right', widthPercent: 15 },
              { key: 'costPerTon', header: 'Cost per ton', align: 'right', widthPercent: 15 },
            ],
            rows: [
              ...(productionReport.rows.length > 0
                ? productionReport.rows.map((r) => ({
                    values: {
                      date: `${formatDate(r.date)} (${r.docNumber})`,
                      rock: formatTon(r.rockTons),
                      chem: r.chemicalsSummary,
                      final: formatTon(r.finalProductTons),
                      totalCost: formatMoney(r.totalCost),
                      costPerTon: formatMoney(r.costPerTon),
                    },
                    variant: 'normal' as const,
                  }))
                : [
                    {
                      values: {
                        date: '—',
                        rock: '0 ton',
                        chem: 'No production batches in this period',
                        final: '0 ton',
                        totalCost: 'Rs 0',
                        costPerTon: 'Rs 0',
                      },
                      variant: 'normal' as const,
                    },
                  ]),
              {
                values: {
                  date: `Total (${productionReport.totals.batchesCount} batches)`,
                  rock: formatTon(productionReport.totals.rockTons),
                  chem: formatBags(productionReport.totals.chemicalBags),
                  final: formatTon(productionReport.totals.finalProductTons),
                  totalCost: formatMoney(productionReport.totals.totalCost),
                  costPerTon: formatMoney(productionReport.totals.avgCostPerTon),
                },
                variant: 'highlighted',
              },
            ],
          },
        ],
      };

      return {
        filename: `Production_Report_${todayIso}.csv`,
        meta: {
          title: 'Production report',
          docNumber: periodDisplayLabel,
          date: generatedText,
          companyName,
          companyAddress,
          companyPhone,
          companyEmail,
          columns: [],
          rows: [],
          overviewLayout,
        },
        csvHeaders: [
          'Date',
          'Batch No',
          'Rock Tons',
          'Chemicals (Bags)',
          'Powder Made (Tons)',
          'Total Cost (PKR)',
          'Cost Per Ton (PKR)',
        ],
        csvRows: [
          ...productionReport.rows.map((r) => [
            r.date,
            r.docNumber,
            r.rockTons.toString(),
            r.chemicalsSummary,
            r.finalProductTons.toString(),
            r.totalCost.toFixed(2),
            r.costPerTon.toFixed(2),
          ]),
          [
            'TOTAL',
            '',
            productionReport.totals.rockTons.toString(),
            productionReport.totals.chemicalBags.toString(),
            productionReport.totals.finalProductTons.toString(),
            productionReport.totals.totalCost.toFixed(2),
            productionReport.totals.avgCostPerTon.toFixed(2),
          ],
        ],
      };
    }

    if (activeTab === 'receivables' && receivablesReport) {
      const overviewLayout: PrintableOverviewLayout = {
        summaryStrip: [
          {
            label: 'Total receivable',
            sublabel: `${receivablesReport.totals.customersCount} customers`,
            value: formatMoney(receivablesReport.totals.balance),
          },
          {
            label: '0-30 days',
            sublabel: 'Recent bills',
            value: formatMoney(receivablesReport.totals.days0To30),
          },
          {
            label: '31-60 days',
            sublabel: '31 to 60 days',
            value: formatMoney(receivablesReport.totals.days31To60),
          },
          {
            label: 'Over 60 days',
            sublabel: 'Older than 60 days',
            value: formatMoney(receivablesReport.totals.days60Plus),
          },
        ],
        blocks: [
          {
            title: 'Customer balances and ageing',
            caption: 'Balance or advance, last payment received, and ageing buckets (0-30, 31-60, over 60 days)',
            columns: [
              { key: 'customer', header: 'Customer', align: 'left', widthPercent: 22 },
              { key: 'lastPay', header: 'Last payment', align: 'left', widthPercent: 22 },
              { key: 'd0_30', header: '0-30 days', align: 'right', widthPercent: 14 },
              { key: 'd31_60', header: '31-60 days', align: 'right', widthPercent: 14 },
              { key: 'd60_plus', header: 'Over 60 days', align: 'right', widthPercent: 14 },
              { key: 'balance', header: 'Balance / advance', align: 'right', widthPercent: 14 },
            ],
            rows: [
              ...(receivablesReport.rows.length > 0
                ? receivablesReport.rows.map((r) => ({
                    values: {
                      customer: r.customerName,
                      lastPay: r.lastPaymentDate
                        ? `${formatDate(r.lastPaymentDate)} (${formatMoney(r.lastPaymentAmount)})`
                        : '—',
                      d0_30: formatMoney(r.days0To30),
                      d31_60: formatMoney(r.days31To60),
                      d60_plus: formatMoney(r.days60Plus),
                      balance: r.advanceAvailable.gt(0)
                        ? `Advance ${formatMoney(r.advanceAvailable)}`
                        : formatMoney(r.balance),
                    },
                    variant: 'normal' as const,
                  }))
                : [
                    {
                      values: {
                        customer: 'No customer balances recorded',
                        lastPay: '—',
                        d0_30: 'Rs 0',
                        d31_60: 'Rs 0',
                        d60_plus: 'Rs 0',
                        balance: 'Rs 0',
                      },
                      variant: 'normal' as const,
                    },
                  ]),
              {
                values: {
                  customer: 'Total receivable',
                  lastPay: receivablesReport.totals.advanceAvailable.gt(0)
                    ? `Customer advances: ${formatMoney(receivablesReport.totals.advanceAvailable)}`
                    : '',
                  d0_30: formatMoney(receivablesReport.totals.days0To30),
                  d31_60: formatMoney(receivablesReport.totals.days31To60),
                  d60_plus: formatMoney(receivablesReport.totals.days60Plus),
                  balance: formatMoney(receivablesReport.totals.balance),
                },
                variant: 'highlighted',
              },
            ],
          },
        ],
        grandTotalBar: {
          label: 'Total receivable',
          details: `0-30 days: ${formatMoney(receivablesReport.totals.days0To30)} · 31-60 days: ${formatMoney(receivablesReport.totals.days31To60)} · Over 60 days: ${formatMoney(receivablesReport.totals.days60Plus)}`,
          value: formatMoney(receivablesReport.totals.balance),
        },
      };

      return {
        filename: `Customers_Report_${todayIso}.csv`,
        meta: {
          title: 'Customers report',
          docNumber: `As of ${formatDate(effectiveToDate || todayIso)}`,
          date: generatedText,
          companyName,
          companyAddress,
          companyPhone,
          companyEmail,
          columns: [],
          rows: [],
          overviewLayout,
        },
        csvHeaders: [
          'Customer',
          'City',
          'Last Payment Date',
          'Last Payment Amount (PKR)',
          '0-30 Days (PKR)',
          '31-60 Days (PKR)',
          'Over 60 Days (PKR)',
          'Advance (PKR)',
          'Receivable Balance (PKR)',
        ],
        csvRows: [
          ...receivablesReport.rows.map((r) => [
            r.customerName,
            r.city,
            r.lastPaymentDate || '',
            r.lastPaymentAmount.toFixed(2),
            r.days0To30.toFixed(2),
            r.days31To60.toFixed(2),
            r.days60Plus.toFixed(2),
            r.advanceAvailable.toFixed(2),
            r.balance.toFixed(2),
          ]),
          [
            'TOTAL',
            '',
            '',
            '',
            receivablesReport.totals.days0To30.toFixed(2),
            receivablesReport.totals.days31To60.toFixed(2),
            receivablesReport.totals.days60Plus.toFixed(2),
            receivablesReport.totals.advanceAvailable.toFixed(2),
            receivablesReport.totals.balance.toFixed(2),
          ],
        ],
      };
    }

    if (activeTab === 'payables' && payablesReport) {
      const overviewLayout: PrintableOverviewLayout = {
        summaryStrip: [
          {
            label: 'Total payable',
            sublabel: `${payablesReport.totals.suppliersCount} suppliers`,
            value: formatMoney(payablesReport.totals.balance),
          },
          {
            label: 'Total purchased',
            sublabel: 'All recorded purchases',
            value: formatMoney(payablesReport.totals.totalPurchased),
          },
          {
            label: 'Total paid',
            sublabel: 'Payments made to suppliers',
            value: formatMoney(payablesReport.totals.totalPaid),
          },
          {
            label: 'Opening balance',
            sublabel: 'Starting supplier balance',
            value: formatMoney(payablesReport.totals.openingBalance),
          },
        ],
        blocks: [
          {
            title: 'Supplier balances',
            caption: 'Balance owed and last payment for each supplier',
            columns: [
              { key: 'supplier', header: 'Supplier', align: 'left', widthPercent: 26 },
              { key: 'purchased', header: 'Total purchased', align: 'right', widthPercent: 18 },
              { key: 'paid', header: 'Total paid', align: 'right', widthPercent: 18 },
              { key: 'lastPay', header: 'Last payment', align: 'left', widthPercent: 20 },
              { key: 'balance', header: 'Balance owed', align: 'right', widthPercent: 18 },
            ],
            rows: [
              ...(payablesReport.rows.length > 0
                ? payablesReport.rows.map((r) => ({
                    values: {
                      supplier: r.supplierName,
                      purchased: formatMoney(r.totalPurchased),
                      paid: formatMoney(r.totalPaid),
                      lastPay: r.lastPaymentDate
                        ? `${formatDate(r.lastPaymentDate)} (${formatMoney(r.lastPaymentAmount)})`
                        : '—',
                      balance: formatMoney(r.balance),
                    },
                    variant: 'normal' as const,
                  }))
                : [
                    {
                      values: {
                        supplier: 'No supplier balances recorded',
                        purchased: 'Rs 0',
                        paid: 'Rs 0',
                        lastPay: '—',
                        balance: 'Rs 0',
                      },
                      variant: 'normal' as const,
                    },
                  ]),
              {
                values: {
                  supplier: 'Total payable',
                  purchased: formatMoney(payablesReport.totals.totalPurchased),
                  paid: formatMoney(payablesReport.totals.totalPaid),
                  lastPay: '',
                  balance: formatMoney(payablesReport.totals.balance),
                },
                variant: 'highlighted',
              },
            ],
          },
        ],
        grandTotalBar: {
          label: 'Total payable',
          details: `Total purchased ${formatMoney(payablesReport.totals.totalPurchased)} - Total paid ${formatMoney(payablesReport.totals.totalPaid)}`,
          value: formatMoney(payablesReport.totals.balance),
        },
      };

      return {
        filename: `Suppliers_Report_${todayIso}.csv`,
        meta: {
          title: 'Suppliers report',
          docNumber: `As of ${formatDate(todayIso)}`,
          date: generatedText,
          companyName,
          companyAddress,
          companyPhone,
          companyEmail,
          columns: [],
          rows: [],
          overviewLayout,
        },
        csvHeaders: [
          'Supplier',
          'Phone',
          'Opening Balance (PKR)',
          'Total Purchased (PKR)',
          'Total Paid (PKR)',
          'Last Payment Date',
          'Last Payment Amount (PKR)',
          'Balance Owed (PKR)',
        ],
        csvRows: [
          ...payablesReport.rows.map((r) => [
            r.supplierName,
            r.phone,
            r.openingBalance.toFixed(2),
            r.totalPurchased.toFixed(2),
            r.totalPaid.toFixed(2),
            r.lastPaymentDate || '',
            r.lastPaymentAmount.toFixed(2),
            r.balance.toFixed(2),
          ]),
          [
            'TOTAL',
            '',
            payablesReport.totals.openingBalance.toFixed(2),
            payablesReport.totals.totalPurchased.toFixed(2),
            payablesReport.totals.totalPaid.toFixed(2),
            '',
            '',
            payablesReport.totals.balance.toFixed(2),
          ],
        ],
      };
    }

    if (activeTab === 'expenses' && expensesReport) {
      const categoryBlocks: PrintableOverviewLayout['blocks'] =
        expensesReport.categoryRows.length > 0
          ? expensesReport.categoryRows.map((cat) => {
              const catEntries = expensesReport.dateRows.filter(
                (r) => r.category === cat.category
              );
              return {
                title: cat.categoryLabel,
                caption: `${cat.expensesCount} ${cat.expensesCount === 1 ? 'entry' : 'entries'} · ${cat.sharePercent.toFixed(1)}% of total expenses`,
                columns: [
                  { key: 'date', header: 'Date', align: 'left' as const, widthPercent: 16 },
                  { key: 'doc', header: 'Voucher No', align: 'left' as const, widthPercent: 16 },
                  { key: 'desc', header: 'Description', align: 'left' as const, widthPercent: 34 },
                  { key: 'paidTo', header: 'Paid to', align: 'left' as const, widthPercent: 16 },
                  { key: 'amount', header: 'Amount (Rs)', align: 'right' as const, widthPercent: 18 },
                ],
                rows: [
                  ...catEntries.map((r) => ({
                    values: {
                      date: formatDate(r.date),
                      doc: r.docNumber,
                      desc: r.description || '—',
                      paidTo: r.paidTo || '—',
                      amount: formatMoney(r.amount),
                    },
                    variant: 'normal' as const,
                  })),
                  {
                    values: {
                      date: `${cat.categoryLabel} subtotal`,
                      doc: `${cat.expensesCount} ${cat.expensesCount === 1 ? 'entry' : 'entries'}`,
                      desc: '',
                      paidTo: `${cat.sharePercent.toFixed(1)}%`,
                      amount: formatMoney(cat.amount),
                    },
                    variant: 'subtotal' as const,
                  },
                ],
              };
            })
          : [
              {
                title: 'Expenses',
                caption: 'Expenses recorded in the selected period',
                columns: [
                  { key: 'date', header: 'Date', align: 'left' as const, widthPercent: 16 },
                  { key: 'doc', header: 'Voucher No', align: 'left' as const, widthPercent: 16 },
                  { key: 'desc', header: 'Description', align: 'left' as const, widthPercent: 34 },
                  { key: 'paidTo', header: 'Paid to', align: 'left' as const, widthPercent: 16 },
                  { key: 'amount', header: 'Amount (Rs)', align: 'right' as const, widthPercent: 18 },
                ],
                rows: [
                  {
                    values: {
                      date: '—',
                      doc: '—',
                      desc: 'No expenses recorded in this period',
                      paidTo: '—',
                      amount: 'Rs 0',
                    },
                    variant: 'normal' as const,
                  },
                ],
              },
            ];

      const overviewLayout: PrintableOverviewLayout = {
        summaryStrip: [
          {
            label: 'Total expenses',
            sublabel: periodDisplayLabel,
            value: formatMoney(expensesReport.totals.amount),
          },
          {
            label: 'Expense entries',
            sublabel: 'Recorded vouchers',
            value: String(expensesReport.totals.expensesCount),
          },
          {
            label: 'Categories',
            sublabel: 'With expenses',
            value: String(expensesReport.categoryRows.length),
          },
          {
            label: 'Top category',
            sublabel: expensesReport.categoryRows[0]
              ? formatMoney(expensesReport.categoryRows[0].amount)
              : 'No expenses',
            value: expensesReport.categoryRows[0]?.categoryLabel || '—',
          },
        ],
        blocks: categoryBlocks,
        grandTotalBar: {
          label: 'Grand total expenses',
          details: `${expensesReport.totals.expensesCount} entries across ${expensesReport.categoryRows.length} categories`,
          value: formatMoney(expensesReport.totals.amount),
        },
      };

      if (expensesGrouping === 'by_category') {
        return {
          filename: `Expenses_by_Category_${todayIso}.csv`,
          meta: {
            title: 'Expenses report',
            docNumber: periodDisplayLabel,
            date: generatedText,
            companyName,
            companyAddress,
            companyPhone,
            companyEmail,
            columns: [],
            rows: [],
            overviewLayout,
          },
          csvHeaders: ['Category', 'Entries Count', 'Share (%)', 'Amount (PKR)'],
          csvRows: [
            ...expensesReport.categoryRows.map((r) => [
              r.categoryLabel,
              r.expensesCount,
              r.sharePercent.toFixed(1),
              r.amount.toFixed(2),
            ]),
            [
              'TOTAL',
              expensesReport.totals.expensesCount,
              '100.0',
              expensesReport.totals.amount.toFixed(2),
            ],
          ],
        };
      }

      return {
        filename: `Expenses_by_Date_${todayIso}.csv`,
        meta: {
          title: 'Expenses report',
          docNumber: periodDisplayLabel,
          date: generatedText,
          companyName,
          companyAddress,
          companyPhone,
          companyEmail,
          columns: [],
          rows: [],
          overviewLayout,
        },
        csvHeaders: [
          'Date',
          'Voucher No',
          'Category',
          'Description',
          'Paid To',
          'Amount (PKR)',
        ],
        csvRows: [
          ...expensesReport.dateRows.map((r) => [
            r.date,
            r.docNumber,
            r.categoryLabel,
            r.description,
            r.paidTo,
            r.amount.toFixed(2),
          ]),
          [
            'TOTAL',
            '',
            '',
            '',
            '',
            expensesReport.totals.amount.toFixed(2),
          ],
        ],
      };
    }

    if (activeTab === 'salaries' && salariesReport) {
      const mLabel = formatMonthLabel(salariesReport.month);
      const overviewLayout: PrintableOverviewLayout = {
        summaryStrip: [
          {
            label: 'Total salary',
            sublabel: `${salariesReport.totals.employeesCount} employees`,
            value: formatMoney(salariesReport.totals.grossSalary),
          },
          {
            label: 'Advances taken',
            sublabel: `Deducted: ${formatMoney(salariesReport.totals.advanceDeduction)}`,
            value: formatMoney(salariesReport.totals.advancesGivenInMonth),
          },
          {
            label: 'Net paid',
            sublabel: `Net payable: ${formatMoney(salariesReport.totals.netPayable)}`,
            value: formatMoney(salariesReport.totals.paidAmount),
          },
          {
            label: 'Open advances',
            sublabel: 'Remaining with employees',
            value: formatMoney(salariesReport.totals.openAdvanceBalance),
          },
        ],
        blocks: [
          {
            title: mLabel,
            caption: 'Employees with monthly salary, advances, and net salary paid',
            columns: [
              { key: 'emp', header: 'Employee', align: 'left', widthPercent: 28 },
              { key: 'salary', header: 'Salary', align: 'right', widthPercent: 18 },
              { key: 'advTaken', header: 'Advances', align: 'right', widthPercent: 18 },
              { key: 'advDed', header: 'Advance deducted', align: 'right', widthPercent: 18 },
              { key: 'paid', header: 'Net paid', align: 'right', widthPercent: 18 },
            ],
            rows: [
              ...(salariesReport.rows.length > 0
                ? salariesReport.rows.map((r) => ({
                    values: {
                      emp: `${r.employeeName} (${r.employeeRole})`,
                      salary: formatMoney(r.grossSalary),
                      advTaken: formatMoney(r.advancesGivenInMonth),
                      advDed: formatMoney(r.advanceDeduction),
                      paid: formatMoney(r.paidAmount),
                    },
                    variant: 'normal' as const,
                  }))
                : [
                    {
                      values: {
                        emp: 'No employees found for this month',
                        salary: 'Rs 0',
                        advTaken: 'Rs 0',
                        advDed: 'Rs 0',
                        paid: 'Rs 0',
                      },
                      variant: 'normal' as const,
                    },
                  ]),
              {
                values: {
                  emp: `${mLabel} subtotal`,
                  salary: formatMoney(salariesReport.totals.grossSalary),
                  advTaken: formatMoney(salariesReport.totals.advancesGivenInMonth),
                  advDed: formatMoney(salariesReport.totals.advanceDeduction),
                  paid: formatMoney(salariesReport.totals.paidAmount),
                },
                variant: 'highlighted',
              },
            ],
          },
        ],
      };

      return {
        filename: `Salaries_and_Advances_${salariesReport.month}.csv`,
        meta: {
          title: 'Salaries and advances',
          docNumber: mLabel,
          date: generatedText,
          companyName,
          companyAddress,
          companyPhone,
          companyEmail,
          columns: [],
          rows: [],
          overviewLayout,
        },
        csvHeaders: [
          'Month',
          'Employee',
          'Role',
          'Salary (PKR)',
          'Advances Taken (PKR)',
          'Advance Deducted (PKR)',
          'Net Payable (PKR)',
          'Paid (PKR)',
          'Open Advance Balance (PKR)',
        ],
        csvRows: [
          ...salariesReport.rows.map((r) => [
            r.month,
            r.employeeName,
            r.employeeRole,
            r.grossSalary.toFixed(2),
            r.advancesGivenInMonth.toFixed(2),
            r.advanceDeduction.toFixed(2),
            r.netPayable.toFixed(2),
            r.paidAmount.toFixed(2),
            r.openAdvanceBalance.toFixed(2),
          ]),
          [
            'TOTAL',
            '',
            '',
            salariesReport.totals.grossSalary.toFixed(2),
            salariesReport.totals.advancesGivenInMonth.toFixed(2),
            salariesReport.totals.advanceDeduction.toFixed(2),
            salariesReport.totals.netPayable.toFixed(2),
            salariesReport.totals.paidAmount.toFixed(2),
            salariesReport.totals.openAdvanceBalance.toFixed(2),
          ],
        ],
      };
    }

    return null;
  }, [
    records,
    companySettings,
    todayIso,
    activeTab,
    overviewReport,
    pnlReport,
    salesReport,
    salesGrouping,
    purchasesReport,
    purchasesGrouping,
    stockReport,
    productionReport,
    receivablesReport,
    payablesReport,
    expensesReport,
    expensesGrouping,
    salariesReport,
    selectedMonth,
    effectiveToDate,
    periodDisplayLabel,
  ]);

  const handleExportCsv = () => {
    if (!currentExportSpec) return;
    downloadCsvFile(
      currentExportSpec.filename,
      currentExportSpec.csvHeaders,
      currentExportSpec.csvRows
    );
    notify.success('CSV exported');
  };

  const { printDocument, isPrinting } = usePrintDocument();

  const handleDirectDownloadPdf = async () => {
    if (!currentExportSpec) return;
    setDownloadingPdf(true);
    try {
      await downloadDocumentPdf(currentExportSpec.meta, companyId);
      notify.success('PDF downloaded');
    } catch (err) {
      notify.error(
        'Could not generate PDF.',
        err instanceof Error ? err.message : 'Try again.'
      );
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handlePrintCurrentReport = () => {
    if (!currentExportSpec) return;
    void printDocument(currentExportSpec.meta, companyId);
  };

  const expenseCategoriesList = useMemo(() => {
    if (!records) return [];
    const seen = new Set<string>([
      'machine_maintenance',
      'factory_maintenance',
      'electricity',
      'transport',
      'other',
    ]);
    for (const e of records.expenses) {
      if (e.category) seen.add(e.category);
    }
    return Array.from(seen).map((cat) => ({
      value: cat,
      label: formatCategoryDisplayName(cat, records.categoryLabels),
    }));
  }, [records]);

  const filterBarControls = useMemo<FilterControl[]>(() => {
    if (!records) return [];
    const ctrls: FilterControl[] = [];

    if (activeTab === 'sales' || activeTab === 'receivables') {
      ctrls.push({
        key: 'customer',
        label: 'Customer',
        node: (
          <FilterSelectPill
            label="Customer"
            value={customerIdFilter}
            onChange={setCustomerIdFilter}
            placeholder="All customers"
            options={[
              { value: '', label: 'All customers' },
              ...records.customers
                .filter((c) => c.status === 'active')
                .map((c) => ({
                  value: c.id,
                  label: c.name,
                })),
            ]}
          />
        ),
      });
    }

    if (activeTab === 'purchases' || activeTab === 'payables') {
      ctrls.push({
        key: 'supplier',
        label: 'Supplier',
        node: (
          <FilterSelectPill
            label="Supplier"
            value={supplierIdFilter}
            onChange={setSupplierIdFilter}
            placeholder="All suppliers"
            options={[
              { value: '', label: 'All suppliers' },
              ...records.suppliers
                .filter((s) => s.status === 'active')
                .map((s) => ({
                  value: s.id,
                  label: s.name,
                })),
            ]}
          />
        ),
      });
    }

    if (activeTab === 'purchases') {
      ctrls.push({
        key: 'item',
        label: 'Item',
        node: (
          <FilterSelectPill
            label="Item"
            value={itemIdFilter}
            onChange={setItemIdFilter}
            placeholder="All items"
            options={[
              { value: '', label: 'All items' },
              ...records.items
                .filter((i) => i.status === 'active')
                .map((i) => ({
                  value: i.id,
                  label: i.name,
                })),
            ]}
          />
        ),
      });
    }

    if (activeTab === 'expenses') {
      ctrls.push({
        key: 'category',
        label: 'Category',
        node: (
          <FilterSelectPill
            label="Category"
            value={expenseCategoryFilter}
            onChange={setExpenseCategoryFilter}
            placeholder="All categories"
            options={[
              { value: '', label: 'All categories' },
              ...expenseCategoriesList.map((cat) => ({
                value: cat.value,
                label: cat.label,
              })),
            ]}
          />
        ),
      });
    }

    return ctrls;
  }, [
    records,
    activeTab,
    customerIdFilter,
    supplierIdFilter,
    itemIdFilter,
    expenseCategoryFilter,
    expenseCategoriesList,
  ]);

  const activeFilterChips = useMemo<FilterChip[]>(() => {
    if (!records) return [];
    const chips: FilterChip[] = [];

    if ((activeTab === 'sales' || activeTab === 'receivables') && customerIdFilter) {
      const cust = records.customers.find((c) => c.id === customerIdFilter);
      if (cust) {
        chips.push({
          key: 'customer',
          label: `Customer: ${cust.name}`,
          onRemove: () => setCustomerIdFilter(''),
        });
      }
    }
    if ((activeTab === 'purchases' || activeTab === 'payables') && supplierIdFilter) {
      const sup = records.suppliers.find((s) => s.id === supplierIdFilter);
      if (sup) {
        chips.push({
          key: 'supplier',
          label: `Supplier: ${sup.name}`,
          onRemove: () => setSupplierIdFilter(''),
        });
      }
    }
    if (activeTab === 'purchases' && itemIdFilter) {
      const item = records.items.find((i) => i.id === itemIdFilter);
      if (item) {
        chips.push({
          key: 'item',
          label: `Item: ${item.name}`,
          onRemove: () => setItemIdFilter(''),
        });
      }
    }
    if (activeTab === 'expenses' && expenseCategoryFilter) {
      chips.push({
        key: 'category',
        label: `Category: ${formatCategoryDisplayName(
          expenseCategoryFilter,
          records.categoryLabels
        )}`,
        onRemove: () => setExpenseCategoryFilter(''),
      });
    }
    if (activeTab === 'stock' && stockKindFilter !== 'all') {
      const kindLabels: Record<string, string> = {
        rock: 'Rock',
        chemical: 'Chemicals',
        final_product: 'Final powder',
      };
      chips.push({
        key: 'stockKind',
        label: `Type: ${kindLabels[stockKindFilter] || stockKindFilter}`,
        onRemove: () => setStockKindFilter('all'),
      });
    }

    return chips;
  }, [
    records,
    activeTab,
    customerIdFilter,
    supplierIdFilter,
    itemIdFilter,
    expenseCategoryFilter,
    stockKindFilter,
  ]);

  if (loading || !records) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" />
        <SectionLoader cards={4} rows={6} />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-12 min-w-0">
      <PageHeader
        title="Reports"
        secondaryActions={
          <>
            <Button type="button" variant="secondary" onClick={handleExportCsv}>
              <Download className="h-4 w-4" />
              <span>Export CSV</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              loading={downloadingPdf}
              disabled={downloadingPdf || isPrinting}
              onClick={handleDirectDownloadPdf}
            >
              <FileDown className="h-4 w-4" />
              <span>Download PDF</span>
            </Button>
          </>
        }
        action={
          <Button
            type="button"
            variant="primary"
            disabled={isPrinting || downloadingPdf}
            onClick={handlePrintCurrentReport}
          >
            <Printer className="h-4 w-4" />
            <span>Print</span>
          </Button>
        }
      />

      {/* 4.1 Top: Period selector (This month, Last month, Custom range) + FilterBar where relevant */}
      <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg)] p-3.5 sm:p-4 space-y-3 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Period Selector Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] p-1">
              {(
                [
                  { id: 'this_month', label: 'This month' },
                  { id: 'last_month', label: 'Last month' },
                  { id: 'custom_range', label: 'Custom range' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPeriodMode(p.id)}
                  className={`min-h-[34px] rounded-[7px] px-3 text-xs font-medium transition-colors cursor-pointer ${
                    periodMode === p.id
                      ? 'bg-[var(--brand)] text-[var(--bg)] font-semibold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {periodMode === 'custom_range' &&
            activeTab !== 'pnl' &&
            activeTab !== 'salaries' ? (
              <FilterDateRangePill
                label="Dates"
                fromDate={fromDate}
                toDate={toDate}
                onChangeFrom={setFromDate}
                onChangeTo={setToDate}
                allowAllDates={false}
              />
            ) : (
              <FilterMonthPill
                value={selectedMonth}
                onChange={(m) => applyMonthSelection(m)}
                ariaLabel="Select report month"
              />
            )}
          </div>

          {/* Tab-specific view controls */}
          {activeTab === 'stock' && (
            <div className="flex flex-wrap items-center gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--surface-subtle)] p-1">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'rock', label: 'Rock' },
                  { id: 'chemical', label: 'Chemicals' },
                  { id: 'final_product', label: 'Final powder' },
                ] as const
              ).map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setStockKindFilter(k.id)}
                  className={`min-h-[34px] rounded-[6px] px-2.5 text-xs font-medium transition-colors cursor-pointer ${
                    stockKindFilter === k.id
                      ? 'bg-[var(--brand)] text-[var(--bg)] font-semibold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          )}

          {activeTab === 'sales' && (
            <div className="flex flex-wrap items-center gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--surface-subtle)] p-1">
              <button
                type="button"
                onClick={() => setSalesGrouping('by_date')}
                className={`min-h-[34px] rounded-[6px] px-2.5 text-xs font-medium cursor-pointer ${
                  salesGrouping === 'by_date'
                    ? 'bg-[var(--brand)] text-[var(--bg)] font-semibold'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                By sale
              </button>
              <button
                type="button"
                onClick={() => setSalesGrouping('by_customer')}
                className={`min-h-[34px] rounded-[6px] px-2.5 text-xs font-medium cursor-pointer ${
                  salesGrouping === 'by_customer'
                    ? 'bg-[var(--brand)] text-[var(--bg)] font-semibold'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                Group by customer
              </button>
            </div>
          )}

          {activeTab === 'purchases' && (
            <div className="flex flex-wrap items-center gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--surface-subtle)] p-1">
              <button
                type="button"
                onClick={() => setPurchasesGrouping('by_item')}
                className={`min-h-[34px] rounded-[6px] px-2.5 text-xs font-medium cursor-pointer ${
                  purchasesGrouping === 'by_item'
                    ? 'bg-[var(--brand)] text-[var(--bg)] font-semibold'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                By item
              </button>
              <button
                type="button"
                onClick={() => setPurchasesGrouping('by_supplier')}
                className={`min-h-[34px] rounded-[6px] px-2.5 text-xs font-medium cursor-pointer ${
                  purchasesGrouping === 'by_supplier'
                    ? 'bg-[var(--brand)] text-[var(--bg)] font-semibold'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                By supplier
              </button>
              <button
                type="button"
                onClick={() => setPurchasesGrouping('by_line')}
                className={`min-h-[34px] rounded-[6px] px-2.5 text-xs font-medium cursor-pointer ${
                  purchasesGrouping === 'by_line'
                    ? 'bg-[var(--brand)] text-[var(--bg)] font-semibold'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                By purchase line
              </button>
            </div>
          )}

          {activeTab === 'expenses' && (
            <div className="flex flex-wrap items-center gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--surface-subtle)] p-1">
              <button
                type="button"
                onClick={() => setExpensesGrouping('by_category')}
                className={`min-h-[34px] rounded-[6px] px-2.5 text-xs font-medium cursor-pointer ${
                  expensesGrouping === 'by_category'
                    ? 'bg-[var(--brand)] text-[var(--bg)] font-semibold'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                By category
              </button>
              <button
                type="button"
                onClick={() => setExpensesGrouping('by_date')}
                className={`min-h-[34px] rounded-[6px] px-2.5 text-xs font-medium cursor-pointer ${
                  expensesGrouping === 'by_date'
                    ? 'bg-[var(--brand)] text-[var(--bg)] font-semibold'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                By date
              </button>
            </div>
          )}

          {activeTab === 'receivables' && (
            <div className="flex flex-wrap items-center gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--surface-subtle)] p-1">
              <button
                type="button"
                onClick={() => setCustomersShowAll(true)}
                className={`min-h-[34px] rounded-[6px] px-2.5 text-xs font-medium cursor-pointer ${
                  customersShowAll
                    ? 'bg-[var(--brand)] text-[var(--bg)] font-semibold'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                All customers
              </button>
              <button
                type="button"
                onClick={() => setCustomersShowAll(false)}
                className={`min-h-[34px] rounded-[6px] px-2.5 text-xs font-medium cursor-pointer ${
                  !customersShowAll
                    ? 'bg-[var(--brand)] text-[var(--bg)] font-semibold'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                Unpaid balance only
              </button>
            </div>
          )}

          {activeTab === 'payables' && (
            <div className="flex flex-wrap items-center gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--surface-subtle)] p-1">
              <button
                type="button"
                onClick={() => setSuppliersShowAll(false)}
                className={`min-h-[34px] rounded-[6px] px-2.5 text-xs font-medium cursor-pointer ${
                  !suppliersShowAll
                    ? 'bg-[var(--brand)] text-[var(--bg)] font-semibold'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                Unpaid balance only
              </button>
              <button
                type="button"
                onClick={() => setSuppliersShowAll(true)}
                className={`min-h-[34px] rounded-[6px] px-2.5 text-xs font-medium cursor-pointer ${
                  suppliersShowAll
                    ? 'bg-[var(--brand)] text-[var(--bg)] font-semibold'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                All suppliers
              </button>
            </div>
          )}
        </div>

        {activeTab !== 'overview' && activeTab !== 'pnl' && (
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search report rows..."
            controls={filterBarControls}
            activeChips={activeFilterChips}
            onClearAll={resetFilters}
          />
        )}
      </div>

      {/* 4.1 Below: Scrollable Report Tabs Bar */}
      <div
        role="tablist"
        aria-label="Report types"
        className="flex w-full overflow-x-auto border-b border-[var(--border)] gap-1 pb-px"
      >
        {REPORT_TABS.map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => handleSelectTab(t.key)}
              className={`min-h-[44px] whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                active
                  ? 'border-[var(--brand)] text-[var(--brand)] font-semibold'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ====================================================================
          TAB 1: OVERVIEW (BUSINESS OVERVIEW)
      ==================================================================== */}
      {activeTab === 'overview' && overviewReport && overviewStructuredLayout && (
        <div className="space-y-4">
          {/* Summary strip (4 small boxes): Net profit, Sales (powder sold), Raw materials in stock, Powder in stock */}
          <StatCardGrid>
            <StatCard
              label="Net profit"
              value={formatMoney(overviewReport.profit.netProfit)}
              numericValue={overviewReport.profit.netProfit.toNumber()}
              formatter={(v) => formatMoney(v)}
              isHero={!overviewReport.profit.netProfit.lt(0)}
              isKeyNumber={overviewReport.profit.netProfit.lt(0)}
            />
            <StatCard
              label="Sales (powder sold)"
              value={formatMoney(overviewReport.profit.sales)}
              numericValue={overviewReport.profit.sales.toNumber()}
              formatter={(v) => formatMoney(v)}
            />
            <StatCard
              label="Raw materials in stock (value at the end)"
              value={formatMoney(overviewReport.rawMaterials.closingValue)}
              numericValue={overviewReport.rawMaterials.closingValue.toNumber()}
              formatter={(v) => formatMoney(v)}
            />
            <StatCard
              label="Powder in stock (value at the end)"
              value={formatMoney(overviewReport.powder.closingValue)}
              numericValue={overviewReport.powder.closingValue.toNumber()}
              formatter={(v) => formatMoney(v)}
            />
          </StatCardGrid>

          {/* Four blocks: 2x2 grid on desktop, single column on mobile */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {overviewStructuredLayout.blocks.map((block) => (
              <div
                key={block.title}
                className="flex flex-col overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--bg)] shadow-soft"
              >
                {/* Heading band: section name appears once + plain caption + optional formula */}
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3">
                  <div>
                    <h3 className="font-heading text-sm font-semibold text-[var(--brand)]">
                      {block.title}
                    </h3>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">{block.caption}</p>
                  </div>
                  {block.formula && (
                    <span className="text-[11px] font-medium text-[var(--text-muted)] tabular-nums">
                      {block.formula}
                    </span>
                  )}
                </div>

                {/* Block table */}
                <div className="flex-1 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--bg)]">
                        {block.columns.map((col) => (
                          <th
                            key={col.key}
                            className={`px-4 py-2.5 text-xs font-semibold text-[var(--text-muted)] ${
                              col.align === 'right' ? 'text-right' : 'text-left'
                            }`}
                          >
                            {col.header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {block.rows.map((row, rIdx) => {
                        const isHighlighted = row.variant === 'highlighted';
                        const isSubtotal = row.variant === 'subtotal';
                        return (
                          <tr
                            key={rIdx}
                            className={
                              isHighlighted
                                ? 'border-t-2 border-[var(--brand)] bg-[var(--brand-soft)] font-heading text-sm font-semibold text-[var(--brand)]'
                                : isSubtotal
                                  ? 'bg-[var(--surface-subtle)] font-semibold text-[var(--text)]'
                                  : 'text-[var(--text)]'
                            }
                          >
                            {block.columns.map((col) => (
                              <td
                                key={col.key}
                                className={`px-4 py-2.5 ${
                                  col.align === 'right'
                                    ? 'text-right tabular-nums font-medium'
                                    : 'text-left'
                                }`}
                              >
                                {row.values[col.key]}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          {/* Check line at the bottom */}
          {overviewStructuredLayout.checkLine && (
            <div
              className={`flex flex-wrap items-center justify-between gap-3 rounded-[12px] border px-4 py-3 text-sm ${
                overviewStructuredLayout.checkLine.isConsistent
                  ? 'border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]'
                  : 'border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]'
              }`}
            >
              <div className="flex items-center gap-2 font-medium tabular-nums">
                {overviewStructuredLayout.checkLine.isConsistent ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                )}
                <span>{overviewStructuredLayout.checkLine.text}</span>
              </div>
              {!overviewStructuredLayout.checkLine.isConsistent &&
                overviewStructuredLayout.checkLine.warningText && (
                  <span className="text-xs font-semibold">
                    {overviewStructuredLayout.checkLine.warningText}
                  </span>
                )}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB 2: PROFIT AND LOSS (MONTHLY)
      ==================================================================== */}
      {activeTab === 'pnl' && pnlReport && (
        <div className="space-y-4">
          {/* 5 Summary cards: Net profit, Sales, Profit on sales, Profit per ton sold, Profit margin % */}
          <StatCardGrid>
            <StatCard
              label="Net profit"
              value={formatMoney(pnlReport.netProfit)}
              numericValue={pnlReport.netProfit.toNumber()}
              formatter={(v) => formatMoney(v)}
              isHero={!pnlReport.netProfit.lt(0)}
              isKeyNumber={pnlReport.netProfit.lt(0)}
              sparklineData={pnlReport.sixMonthTrend.map((p) => p.netProfit)}
            />
            <StatCard
              label="Sales"
              value={formatMoney(pnlReport.sales)}
              numericValue={pnlReport.sales.toNumber()}
              formatter={(v) => formatMoney(v)}
              sparklineData={pnlReport.sixMonthTrend.map((p) => p.sales)}
            />
            <StatCard
              label="Profit on sales"
              value={formatMoney(pnlReport.grossProfit)}
              numericValue={pnlReport.grossProfit.toNumber()}
              formatter={(v) => formatMoney(v)}
            />
            <StatCard
              label="Profit per ton sold"
              value={formatMoney(pnlReport.profitPerTonSold)}
              numericValue={pnlReport.profitPerTonSold.toNumber()}
              formatter={(v) => formatMoney(v)}
            />
            <StatCard
              label="Profit margin %"
              value={`${pnlReport.profitMarginPercent.toFixed(1)}%`}
            />
          </StatCardGrid>

          {/* 6-month combo chart: sales, expenses and net profit */}
          <SalesExpensesProfitComboChart
            data={pnlReport.sixMonthTrend}
            expensesLabel="Expenses + salaries"
          />

          {/* Profit and loss table: This month | Last month | Change (amount and %) */}
          <div className="overflow-x-auto rounded-[10px] border border-[var(--border)] bg-[var(--bg)]">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-xs font-medium text-[var(--text-muted)]">
                  <th className="px-4 py-3.5">Particulars</th>
                  <th className="px-4 py-3.5 text-right">
                    This month ({formatMonthLabel(pnlReport.month)})
                  </th>
                  <th className="px-4 py-3.5 text-right">
                    Last month ({formatMonthLabel(pnlReport.previousMonth)})
                  </th>
                  <th className="px-4 py-3.5 text-right">Change (amount and %)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {pnlReport.lines
                  .filter(
                    (l) =>
                      l.kind !== 'net_profit' && l.kind !== 'expense_category'
                  )
                  .map((line: ProfitAndLossLine) => {
                    const isExpandableExpenses = line.key === 'total_expenses';
                    const isExpandableSalaries = line.key === 'salaries';
                    const isBold =
                      line.kind === 'subtotal' || line.kind === 'revenue';

                    return (
                      <React.Fragment key={line.key}>
                        <tr
                          className={
                            line.kind === 'subtotal'
                              ? 'bg-[var(--surface-subtle)] font-semibold'
                              : 'hover:bg-[var(--surface-subtle)]'
                          }
                        >
                          <td
                            className={`px-4 py-3 ${
                              isBold
                                ? 'font-semibold text-[var(--text)]'
                                : 'text-[var(--text)]'
                            }`}
                          >
                            <div className="inline-flex items-center">
                              {isExpandableExpenses &&
                                pnlReport.expenseCategoryLines.length > 0 && (
                                  <button
                                    type="button"
                                    aria-label="Toggle expense categories"
                                    onClick={() =>
                                      setExpandPnlExpenses((prev) => !prev)
                                    }
                                    className="mr-1.5 inline-flex h-6 w-6 items-center justify-center rounded-[4px] border border-[var(--border)] bg-[var(--bg)] text-[var(--brand)] hover:bg-[var(--brand-soft)] cursor-pointer"
                                  >
                                    <ChevronDown
                                      className={`h-3.5 w-3.5 transition-transform ${
                                        expandPnlExpenses ? 'rotate-180' : ''
                                      }`}
                                    />
                                  </button>
                                )}
                              {isExpandableSalaries &&
                                pnlReport.salaryEmployeeLines.length > 0 && (
                                  <button
                                    type="button"
                                    aria-label="Toggle salary employees"
                                    onClick={() =>
                                      setExpandPnlSalaries((prev) => !prev)
                                    }
                                    className="mr-1.5 inline-flex h-6 w-6 items-center justify-center rounded-[4px] border border-[var(--border)] bg-[var(--bg)] text-[var(--brand)] hover:bg-[var(--brand-soft)] cursor-pointer"
                                  >
                                    <ChevronDown
                                      className={`h-3.5 w-3.5 transition-transform ${
                                        expandPnlSalaries ? 'rotate-180' : ''
                                      }`}
                                    />
                                  </button>
                                )}
                              <span>{line.label}</span>
                              <PnLInfoTooltip
                                lineKey={line.key}
                                text={line.infoText}
                                openKey={openInfoKey}
                                setOpenKey={setOpenInfoKey}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-[var(--text)]">
                            {formatMoney(line.currentAmount)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-[var(--text-muted)]">
                            {formatMoney(line.previousAmount)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-[var(--text-muted)]">
                            {formatChangeWithPercent(
                              line.difference,
                              line.changePercent
                            )}
                          </td>
                        </tr>

                        {/* Expanded Expense Categories */}
                        {isExpandableExpenses &&
                          expandPnlExpenses &&
                          pnlReport.expenseCategoryLines.map((catLine) => (
                            <tr
                              key={catLine.key}
                              className="bg-[var(--surface-subtle)] text-xs text-[var(--text-muted)]"
                            >
                              <td className="pl-11 pr-4 py-2.5">{catLine.label}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums">
                                {formatMoney(catLine.currentAmount)}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums">
                                {formatMoney(catLine.previousAmount)}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums">
                                {formatChangeWithPercent(
                                  catLine.difference,
                                  catLine.changePercent
                                )}
                              </td>
                            </tr>
                          ))}

                        {/* Expanded Salary Employees */}
                        {isExpandableSalaries &&
                          expandPnlSalaries &&
                          pnlReport.salaryEmployeeLines.map((empLine) => (
                            <tr
                              key={empLine.key}
                              className="bg-[var(--surface-subtle)] text-xs text-[var(--text-muted)]"
                            >
                              <td className="pl-11 pr-4 py-2.5">{empLine.label}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums">
                                {formatMoney(empLine.currentAmount)}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums">
                                {formatMoney(empLine.previousAmount)}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums">
                                {formatChangeWithPercent(
                                  empLine.difference,
                                  empLine.changePercent
                                )}
                              </td>
                            </tr>
                          ))}
                      </React.Fragment>
                    );
                  })}
              </tbody>
              <tfoot>
                {(() => {
                  const netLine = pnlReport.lines.find(
                    (l) => l.kind === 'net_profit'
                  )!;
                  const isLoss = pnlReport.netProfit.lt(0);
                  return (
                    <tr
                      className={`border-t-2 font-heading text-sm font-semibold ${
                        isLoss
                          ? 'border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)]'
                          : 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]'
                      }`}
                    >
                      <td className="px-4 py-3.5">
                        <div className="inline-flex items-center">
                          <span>Net profit</span>
                          <PnLInfoTooltip
                            lineKey="net_profit"
                            text={netLine?.infoText}
                            openKey={openInfoKey}
                            setOpenKey={setOpenInfoKey}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        {formatMoney(pnlReport.netProfit)}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        {formatMoney(pnlReport.prevNetProfit)}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        {netLine
                          ? formatChangeWithPercent(
                              netLine.difference,
                              netLine.changePercent
                            )
                          : formatMoney(
                              pnlReport.netProfit.minus(pnlReport.prevNetProfit)
                            )}
                      </td>
                    </tr>
                  );
                })()}
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 3: SALES
      ==================================================================== */}
      {activeTab === 'sales' && salesReport && (
        <div className="space-y-4">
          <StatCardGrid>
            <StatCard
              label="Sales amount"
              value={formatMoney(salesReport.totals.amount)}
              numericValue={salesReport.totals.amount.toNumber()}
              formatter={(v) => formatMoney(v)}
              isKeyNumber={true}
            />
            <StatCard
              label="Received tons"
              value={formatTon(salesReport.totals.receivedTons)}
              sparklineData={salesReport.tonsSoldByMonth.map((p) => p.tons)}
            />
            <StatCard
              label="Cost of powder sold"
              value={formatMoney(salesReport.totals.cost)}
            />
            <StatCard
              label="Profit on sales"
              value={formatMoney(salesReport.totals.profit)}
            />
          </StatCardGrid>

          {/* Charts: Tons sold per month (area) + Top customers (horizontal bar) */}
          {(salesReport.tonsSoldByMonth.length > 0 ||
            salesReport.customerRows.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TonsSoldAreaChart
                title="Tons sold per month"
                data={salesReport.tonsSoldByMonth}
                seriesLabel="Tons sold"
              />
              <TopCustomersHorizontalBarChart
                title="Top customers"
                data={salesReport.customerRows.slice(0, 6).map((c) => ({
                  customerId: c.customerId,
                  customerName: c.customerName,
                  sales: c.amount.toNumber(),
                  tons: c.receivedTons.toNumber(),
                }))}
              />
            </div>
          )}

          {salesReport.billRows.length === 0 ? (
            <EmptyState message="No sales match your filter." />
          ) : salesGrouping === 'by_customer' ? (
            <div className="overflow-x-auto rounded-[10px] border border-[var(--border)] bg-[var(--bg)]">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-xs font-medium text-[var(--text-muted)]">
                    <th className="px-4 py-3.5">Customer</th>
                    <th className="px-4 py-3.5">City</th>
                    <th className="px-4 py-3.5 text-right">Bills</th>
                    <th className="px-4 py-3.5 text-right">Received tons</th>
                    <th className="px-4 py-3.5 text-right">Sales amount</th>
                    <th className="px-4 py-3.5 text-right">Cost</th>
                    <th className="px-4 py-3.5 text-right">Profit</th>
                    <th className="px-4 py-3.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {salesReport.customerRows.map((row) => (
                    <tr key={row.customerId} className="hover:bg-[var(--surface-subtle)]">
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        <button
                          type="button"
                          onClick={() => navigate(`/customers?id=${row.customerId}`)}
                          className="text-[var(--brand)] underline hover:opacity-80 cursor-pointer text-left"
                        >
                          {row.customerName}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{row.city}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.billsCount}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatTon(row.receivedTons)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {formatMoney(row.amount)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--text-muted)]">
                        {formatMoney(row.cost)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-medium tabular-nums ${
                          row.profit.lt(0) ? 'text-[var(--danger)]' : 'text-[var(--success)]'
                        }`}
                      >
                        {formatMoney(row.profit)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--brand)]">
                        {formatMoney(row.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-subtle)] font-heading text-sm font-semibold text-[var(--text)]">
                    <td className="px-4 py-3.5" colSpan={2}>
                      Totals ({salesReport.customerRows.length} customers)
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      {salesReport.totals.billsCount}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      {formatTon(salesReport.totals.receivedTons)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[var(--brand)]">
                      {formatMoney(salesReport.totals.amount)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[var(--text-muted)]">
                      {formatMoney(salesReport.totals.cost)}
                    </td>
                    <td
                      className={`px-4 py-3.5 text-right tabular-nums ${
                        salesReport.totals.profit.lt(0)
                          ? 'text-[var(--danger)]'
                          : 'text-[var(--success)]'
                      }`}
                    >
                      {formatMoney(salesReport.totals.profit)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[var(--brand)]">
                      {formatMoney(salesReport.totals.balance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[10px] border border-[var(--border)] bg-[var(--bg)]">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-xs font-medium text-[var(--text-muted)]">
                    <th className="px-4 py-3.5">Date</th>
                    <th className="px-4 py-3.5">Bill number</th>
                    <th className="px-4 py-3.5">Customer</th>
                    <th className="px-4 py-3.5">Vehicle</th>
                    <th className="px-4 py-3.5 text-right">Received tons</th>
                    <th className="px-4 py-3.5 text-right">Rate per ton</th>
                    <th className="px-4 py-3.5 text-right">Sales amount</th>
                    <th className="px-4 py-3.5 text-right">Cost</th>
                    <th className="px-4 py-3.5 text-right">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {salesReport.billRows.map((row) => (
                    <tr key={row.billId} className="hover:bg-[var(--surface-subtle)]">
                      <td className="px-4 py-3 tabular-nums text-[var(--text-muted)]">
                        {formatDate(row.date)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-medium">
                        <button
                          type="button"
                          onClick={() => navigate(`/bills?billId=${row.billId}`)}
                          className="text-[var(--brand)] underline hover:opacity-80 cursor-pointer"
                        >
                          {row.docNumber}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        <button
                          type="button"
                          onClick={() => navigate(`/customers?id=${row.customerId}`)}
                          className="text-[var(--brand)] underline hover:opacity-80 cursor-pointer text-left"
                        >
                          {row.customerName}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--text-muted)] tabular-nums">
                        {row.vehicleNumber}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatTon(row.receivedTons)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--text-muted)]">
                        {formatMoney(row.ratePerTon)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-[var(--text)]">
                        {formatMoney(row.amount)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--text-muted)]">
                        {formatMoney(row.cost)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold tabular-nums ${
                          row.profit.lt(0) ? 'text-[var(--danger)]' : 'text-[var(--success)]'
                        }`}
                      >
                        {formatMoney(row.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-subtle)] font-heading text-sm font-semibold text-[var(--text)]">
                    <td className="px-4 py-3.5" colSpan={4}>
                      Totals ({salesReport.totals.billsCount} sales)
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      {formatTon(salesReport.totals.receivedTons)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[var(--text-muted)]">
                      —
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[var(--brand)]">
                      {formatMoney(salesReport.totals.amount)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[var(--text-muted)]">
                      {formatMoney(salesReport.totals.cost)}
                    </td>
                    <td
                      className={`px-4 py-3.5 text-right tabular-nums ${
                        salesReport.totals.profit.lt(0)
                          ? 'text-[var(--danger)]'
                          : 'text-[var(--success)]'
                      }`}
                    >
                      {formatMoney(salesReport.totals.profit)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB 4: PURCHASES
      ==================================================================== */}
      {activeTab === 'purchases' && purchasesReport && (
        <div className="space-y-4">
          <StatCardGrid>
            <StatCard
              label="Total purchases"
              value={formatMoney(purchasesReport.totals.amount)}
              numericValue={purchasesReport.totals.amount.toNumber()}
              formatter={(v) => formatMoney(v)}
              isKeyNumber={true}
            />
            <StatCard
              label="Rock purchased"
              value={formatTon(purchasesReport.totals.rockTons)}
            />
            <StatCard
              label="Chemicals purchased"
              value={formatBags(purchasesReport.totals.chemicalBags)}
            />
          </StatCardGrid>

          {/* Chart of rate trend per item (smooth lines with markers) */}
          {purchasesReport.rateTrendByItem.length > 0 && (
            <PurchaseRateTrendLineChart data={purchasesReport.rateTrendByItem} />
          )}

          {purchasesReport.lineRows.length === 0 ? (
            <EmptyState message="No purchases match your filter." />
          ) : purchasesGrouping === 'by_supplier' ? (
            <div className="overflow-x-auto rounded-[10px] border border-[var(--border)] bg-[var(--bg)]">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-xs font-medium text-[var(--text-muted)]">
                    <th className="px-4 py-3.5">Supplier</th>
                    <th className="px-4 py-3.5 text-right">Purchases</th>
                    <th className="px-4 py-3.5 text-right">Rock (ton)</th>
                    <th className="px-4 py-3.5 text-right">Chemicals (bags)</th>
                    <th className="px-4 py-3.5 text-right">Total</th>
                    <th className="px-4 py-3.5 text-right">Paid at purchase</th>
                    <th className="px-4 py-3.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {purchasesReport.supplierRows.map((row) => (
                    <tr key={row.supplierId} className="hover:bg-[var(--surface-subtle)]">
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/purchases?supplierId=${row.supplierId}`)
                          }
                          className="text-[var(--brand)] underline hover:opacity-80 cursor-pointer text-left"
                        >
                          {row.supplierName}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.purchasesCount}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatTon(row.rockTons)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatBags(row.chemicalBags)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {formatMoney(row.totalAmount)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--success)]">
                        {formatMoney(row.paidOnPurchases)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--brand)]">
                        {formatMoney(row.balanceOnPurchases)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-subtle)] font-heading text-sm font-semibold text-[var(--text)]">
                    <td className="px-4 py-3.5" colSpan={2}>
                      Totals ({purchasesReport.supplierRows.length} suppliers)
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      {formatTon(purchasesReport.totals.rockTons)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      {formatBags(purchasesReport.totals.chemicalBags)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[var(--brand)]">
                      {formatMoney(purchasesReport.totals.amount)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[var(--success)]">
                      {formatMoney(purchasesReport.totals.paidOnPurchases)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[var(--brand)]">
                      {formatMoney(purchasesReport.totals.balanceOnPurchases)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : purchasesGrouping === 'by_item' ? (
            <div className="overflow-x-auto rounded-[10px] border border-[var(--border)] bg-[var(--bg)]">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-xs font-medium text-[var(--text-muted)]">
                    <th className="px-4 py-3.5">Item</th>
                    <th className="px-4 py-3.5">Type</th>
                    <th className="px-4 py-3.5 text-right">Quantity</th>
                    <th className="px-4 py-3.5 text-right">Average rate</th>
                    <th className="px-4 py-3.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {purchasesReport.itemRows.map((row) => (
                    <tr key={row.itemId} className="hover:bg-[var(--surface-subtle)]">
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        {row.itemName}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">
                        {row.kind === 'rock' ? 'Rock' : 'Chemical'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.unit === 'ton'
                          ? formatTon(row.quantity)
                          : formatBags(row.quantity)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(row.avgRate)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--brand)]">
                        {formatMoney(row.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-subtle)] font-heading text-sm font-semibold text-[var(--text)]">
                    <td className="px-4 py-3.5" colSpan={4}>
                      Totals ({purchasesReport.itemRows.length} items)
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[var(--brand)]">
                      {formatMoney(purchasesReport.totals.amount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[10px] border border-[var(--border)] bg-[var(--bg)]">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-xs font-medium text-[var(--text-muted)]">
                    <th className="px-4 py-3.5">Purchase No</th>
                    <th className="px-4 py-3.5">Date</th>
                    <th className="px-4 py-3.5">Supplier</th>
                    <th className="px-4 py-3.5">Item</th>
                    <th className="px-4 py-3.5 text-right">Quantity</th>
                    <th className="px-4 py-3.5 text-right">Rate</th>
                    <th className="px-4 py-3.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {purchasesReport.lineRows.map((row) => (
                    <tr key={row.id} className="hover:bg-[var(--surface-subtle)]">
                      <td className="px-4 py-3 font-mono text-xs font-medium">
                        {row.docNumber}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[var(--text-muted)]">
                        {formatDate(row.date)}
                      </td>
                      <td className="px-4 py-3 text-[var(--text)]">
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/purchases?supplierId=${row.supplierId}`)
                          }
                          className="text-[var(--brand)] underline hover:opacity-80 cursor-pointer text-left"
                        >
                          {row.supplierName}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        {row.itemName}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.unit === 'ton'
                          ? formatTon(row.quantity)
                          : formatBags(row.quantity)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(row.rate)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--brand)]">
                        {formatMoney(row.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-subtle)] font-heading text-sm font-semibold text-[var(--text)]">
                    <td className="px-4 py-3.5" colSpan={6}>
                      Totals ({purchasesReport.totals.linesCount} lines)
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[var(--brand)]">
                      {formatMoney(purchasesReport.totals.amount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB 5: STOCK
      ==================================================================== */}
      {activeTab === 'stock' && stockReport && (
        <div className="space-y-4">
          <StatCardGrid>
            <StatCard
              label="Total value"
              value={formatMoney(stockReport.totalValue)}
              numericValue={stockReport.totalValue.toNumber()}
              formatter={(v) => formatMoney(v)}
              isKeyNumber={true}
            />
            <StatCard
              label="Raw materials value"
              value={formatMoney(stockReport.rawMaterialsValue)}
            />
            <StatCard
              label="Powder value"
              value={`${formatMoney(stockReport.powderValue)} (${formatTon(
                stockReport.finalProductTons
              )})`}
            />
          </StatCardGrid>

          <StockValueSplitBar
            rockValue={stockReport.rows
              .filter((r) => r.kind === 'rock')
              .reduce((acc, r) => acc + r.totalValue.toNumber(), 0)}
            chemicalsValue={stockReport.rows
              .filter((r) => r.kind === 'chemical')
              .reduce((acc, r) => acc + r.totalValue.toNumber(), 0)}
            powderValue={stockReport.powderValue.toNumber()}
          />

          <div className="overflow-x-auto rounded-[10px] border border-[var(--border)] bg-[var(--bg)]">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-xs font-medium text-[var(--text-muted)]">
                  <th className="px-4 py-3.5">Item</th>
                  <th className="px-4 py-3.5">Type</th>
                  <th className="px-4 py-3.5 text-right">Stock</th>
                  <th className="px-4 py-3.5 text-right">Average cost</th>
                  <th className="px-4 py-3.5 text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {stockReport.rows.map((row) => (
                  <tr key={row.itemId} className="hover:bg-[var(--surface-subtle)]">
                    <td className="px-4 py-3 font-medium text-[var(--text)]">
                      <div className="flex items-center gap-2">
                        <span>{row.itemName}</span>
                        {row.isLow && (
                          <StatusBadge status="cancelled" label="Low" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{row.typeLabel}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.unit === 'ton'
                        ? formatTon(row.quantity)
                        : formatBags(row.quantity)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoney(row.avgCost)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--brand)]">
                      {formatMoney(row.totalValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-subtle)] font-heading text-sm font-semibold text-[var(--text)]">
                  <td className="px-4 py-3.5" colSpan={4}>
                    Total value ({stockReport.rows.length} items)
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-[var(--brand)]">
                    {formatMoney(stockReport.totalValue)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 6: PRODUCTION
      ==================================================================== */}
      {activeTab === 'production' && productionReport && (
        <div className="space-y-4">
          <StatCardGrid>
            <StatCard
              label="Powder made"
              value={formatTon(productionReport.totals.finalProductTons)}
              isKeyNumber={true}
            />
            <StatCard
              label="Rock tons used"
              value={formatTon(productionReport.totals.rockTons)}
            />
            <StatCard
              label="Total cost"
              value={formatMoney(productionReport.totals.totalCost)}
            />
            <StatCard
              label="Average cost per ton"
              value={formatMoney(productionReport.totals.avgCostPerTon)}
            />
          </StatCardGrid>

          {productionReport.rows.length === 0 ? (
            <EmptyState message="No production batches match your filter." />
          ) : (
            <div className="overflow-x-auto rounded-[10px] border border-[var(--border)] bg-[var(--bg)]">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-xs font-medium text-[var(--text-muted)]">
                    <th className="px-4 py-3.5">Date</th>
                    <th className="px-4 py-3.5">Batch No</th>
                    <th className="px-4 py-3.5 text-right">Rock tons</th>
                    <th className="px-4 py-3.5">Chemicals (bags)</th>
                    <th className="px-4 py-3.5 text-right">Powder made (tons)</th>
                    <th className="px-4 py-3.5 text-right">Total cost</th>
                    <th className="px-4 py-3.5 text-right">Cost per ton</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {productionReport.rows.map((row) => (
                    <tr key={row.batchId} className="hover:bg-[var(--surface-subtle)]">
                      <td className="px-4 py-3 tabular-nums text-[var(--text-muted)]">
                        {formatDate(row.date)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-medium">
                        <button
                          type="button"
                          onClick={() => navigate('/stock?tab=final_product')}
                          className="text-[var(--brand)] underline hover:opacity-80 cursor-pointer"
                        >
                          {row.docNumber}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatTon(row.rockTons)}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--text-muted)]">
                        {row.chemicalsSummary}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {formatTon(row.finalProductTons)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--brand)]">
                        {formatMoney(row.totalCost)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(row.costPerTon)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-subtle)] font-heading text-sm font-semibold text-[var(--text)]">
                    <td className="px-4 py-3.5" colSpan={2}>
                      Totals ({productionReport.totals.batchesCount} batches)
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      {formatTon(productionReport.totals.rockTons)}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[var(--text-muted)]">
                      {formatBags(productionReport.totals.chemicalBags)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      {formatTon(productionReport.totals.finalProductTons)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[var(--brand)]">
                      {formatMoney(productionReport.totals.totalCost)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      {formatMoney(productionReport.totals.avgCostPerTon)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB 7: CUSTOMERS (BALANCE OR ADVANCE, LAST PAYMENT, AGEING 0-30, 31-60, OVER 60)
      ==================================================================== */}
      {activeTab === 'receivables' && receivablesReport && (
        <div className="space-y-4">
          <StatCardGrid>
            <StatCard
              label="Total receivable"
              value={formatMoney(receivablesReport.totals.balance)}
              numericValue={receivablesReport.totals.balance.toNumber()}
              formatter={(v) => formatMoney(v)}
              isKeyNumber={true}
            />
            <StatCard
              label="0–30 days"
              value={formatMoney(receivablesReport.totals.days0To30)}
            />
            <StatCard
              label="31–60 & over 60 days"
              value={formatMoney(
                receivablesReport.totals.days31To60.plus(
                  receivablesReport.totals.days60Plus
                )
              )}
            />
            <StatCard
              label="Customer advances"
              value={formatMoney(receivablesReport.totals.advanceAvailable)}
            />
          </StatCardGrid>

          {receivablesReport.rows.length > 0 && (
            <CustomerAgeingStackedBarChart
              rows={receivablesReport.rows.map((r) => ({
                customerName: r.customerName,
                days0To30: r.days0To30.toNumber(),
                days31To60: r.days31To60.toNumber(),
                days60Plus: r.days60Plus.toNumber(),
              }))}
            />
          )}

          {receivablesReport.rows.length === 0 ? (
            <EmptyState message="No customers match your filter." />
          ) : (
            <div className="overflow-x-auto rounded-[10px] border border-[var(--border)] bg-[var(--bg)]">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-xs font-medium text-[var(--text-muted)]">
                    <th className="px-4 py-3.5">Customer</th>
                    <th className="px-4 py-3.5">Last payment</th>
                    <th className="px-4 py-3.5 text-right">0–30 days</th>
                    <th className="px-4 py-3.5 text-right">31–60 days</th>
                    <th className="px-4 py-3.5 text-right">Over 60 days</th>
                    <th className="px-4 py-3.5 text-right">Balance or advance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {receivablesReport.rows.map((row) => (
                    <tr key={row.customerId} className="hover:bg-[var(--surface-subtle)]">
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        <button
                          type="button"
                          onClick={() => navigate(`/customers?id=${row.customerId}`)}
                          className="text-[var(--brand)] underline hover:opacity-80 cursor-pointer text-left"
                        >
                          {row.customerName}
                        </button>
                        {row.city && row.city !== '—' && (
                          <span className="ml-1.5 text-xs font-normal text-[var(--text-muted)]">
                            ({row.city})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--text-muted)] tabular-nums">
                        {row.lastPaymentDate
                          ? `${formatDate(row.lastPaymentDate)} · ${formatMoney(
                              row.lastPaymentAmount
                            )}`
                          : 'No payments'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(row.days0To30)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(row.days31To60)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--danger)]">
                        {formatMoney(row.days60Plus)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {row.advanceAvailable.gt(0) ? (
                          <span className="inline-flex items-center rounded-[6px] bg-[var(--success-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--success)]">
                            Advance {formatMoney(row.advanceAvailable)}
                          </span>
                        ) : (
                          <span className="text-[var(--brand)]">
                            {formatMoney(row.balance)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-subtle)] font-heading text-sm font-semibold text-[var(--text)]">
                    <td className="px-4 py-3.5" colSpan={2}>
                      Total receivable ({receivablesReport.totals.customersCount}{' '}
                      customers)
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      {formatMoney(receivablesReport.totals.days0To30)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      {formatMoney(receivablesReport.totals.days31To60)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[var(--danger)]">
                      {formatMoney(receivablesReport.totals.days60Plus)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[var(--brand)]">
                      {formatMoney(receivablesReport.totals.balance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB 8: SUPPLIERS (BALANCE OWED, LAST PAYMENT, TOTAL PAYABLE)
      ==================================================================== */}
      {activeTab === 'payables' && payablesReport && (
        <div className="space-y-4">
          <StatCardGrid>
            <StatCard
              label="Total payable"
              value={formatMoney(payablesReport.totals.balance)}
              numericValue={payablesReport.totals.balance.toNumber()}
              formatter={(v) => formatMoney(v)}
              isKeyNumber={true}
            />
            <StatCard
              label="Total purchased"
              value={formatMoney(payablesReport.totals.totalPurchased)}
            />
            <StatCard
              label="Total paid"
              value={formatMoney(payablesReport.totals.totalPaid)}
            />
          </StatCardGrid>

          {payablesReport.rows.length === 0 ? (
            <EmptyState message="No suppliers match your filter." />
          ) : (
            <div className="overflow-x-auto rounded-[10px] border border-[var(--border)] bg-[var(--bg)]">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-xs font-medium text-[var(--text-muted)]">
                    <th className="px-4 py-3.5">Supplier</th>
                    <th className="px-4 py-3.5">Last payment</th>
                    <th className="px-4 py-3.5 text-right">Opening balance</th>
                    <th className="px-4 py-3.5 text-right">Total purchased</th>
                    <th className="px-4 py-3.5 text-right">Total paid</th>
                    <th className="px-4 py-3.5 text-right">Balance owed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {payablesReport.rows.map((row) => (
                    <tr key={row.supplierId} className="hover:bg-[var(--surface-subtle)]">
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/purchases?supplierId=${row.supplierId}`)
                          }
                          className="text-[var(--brand)] underline hover:opacity-80 cursor-pointer text-left"
                        >
                          {row.supplierName}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--text-muted)] tabular-nums">
                        {row.lastPaymentDate
                          ? `${formatDate(row.lastPaymentDate)} · ${formatMoney(
                              row.lastPaymentAmount
                            )}`
                          : 'No payments'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(row.openingBalance)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(row.totalPurchased)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--success)]">
                        {formatMoney(row.totalPaid)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--brand)]">
                        {formatMoney(row.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-subtle)] font-heading text-sm font-semibold text-[var(--text)]">
                    <td className="px-4 py-3.5" colSpan={2}>
                      Total payable ({payablesReport.totals.suppliersCount}{' '}
                      suppliers)
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      {formatMoney(payablesReport.totals.openingBalance)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      {formatMoney(payablesReport.totals.totalPurchased)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[var(--success)]">
                      {formatMoney(payablesReport.totals.totalPaid)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[var(--brand)]">
                      {formatMoney(payablesReport.totals.balance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB 9: EXPENSES (BY CATEGORY AND BY DATE, WITH A CHART)
      ==================================================================== */}
      {activeTab === 'expenses' && expensesReport && (
        <div className="space-y-4">
          <StatCardGrid>
            <StatCard
              label="Total expenses"
              value={formatMoney(expensesReport.totals.amount)}
              numericValue={expensesReport.totals.amount.toNumber()}
              formatter={(v) => formatMoney(v)}
              isKeyNumber={true}
            />
            <StatCard
              label="Expense entries"
              value={String(expensesReport.totals.expensesCount)}
            />
            <StatCard
              label="Top category"
              value={
                expensesReport.categoryRows[0]
                  ? `${expensesReport.categoryRows[0].categoryLabel} (${formatMoney(
                      expensesReport.categoryRows[0].amount
                    )})`
                  : '—'
              }
            />
          </StatCardGrid>

          {expensesReport.categoryRows.length > 0 && (
            <ExpensesCategoryDonutChart
              title="Expenses by category"
              subtitle={`Total: ${formatMoney(expensesReport.totals.amount)}`}
              data={expensesReport.categoryRows.map((c) => ({
                category: c.category,
                label: c.categoryLabel,
                amount: c.amount.toNumber(),
                percent: c.sharePercent.toNumber(),
              }))}
              totalAmount={expensesReport.totals.amount.toNumber()}
              activeCategoryFilter={expenseCategoryFilter}
              onSelectCategory={(cat) =>
                setExpenseCategoryFilter((prev) => (prev === cat ? '' : cat))
              }
            />
          )}

          {expensesReport.dateRows.length === 0 ? (
            <EmptyState message="No expenses match your filter." />
          ) : expensesGrouping === 'by_category' ? (
            <div className="overflow-x-auto rounded-[10px] border border-[var(--border)] bg-[var(--bg)]">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-xs font-medium text-[var(--text-muted)]">
                    <th className="px-4 py-3.5">Category</th>
                    <th className="px-4 py-3.5 text-right">Entries</th>
                    <th className="px-4 py-3.5 text-right">Share</th>
                    <th className="px-4 py-3.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {expensesReport.categoryRows.map((row) => (
                    <tr key={row.category} className="hover:bg-[var(--surface-subtle)]">
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        {row.categoryLabel}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.expensesCount}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--text-muted)]">
                        {row.sharePercent.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--brand)]">
                        {formatMoney(row.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-subtle)] font-heading text-sm font-semibold text-[var(--text)]">
                    <td className="px-4 py-3.5">
                      Totals ({expensesReport.categoryRows.length} categories)
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      {expensesReport.totals.expensesCount}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">100.0%</td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[var(--brand)]">
                      {formatMoney(expensesReport.totals.amount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[10px] border border-[var(--border)] bg-[var(--bg)]">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-xs font-medium text-[var(--text-muted)]">
                    <th className="px-4 py-3.5">Date</th>
                    <th className="px-4 py-3.5">Voucher No</th>
                    <th className="px-4 py-3.5">Category</th>
                    <th className="px-4 py-3.5">Description</th>
                    <th className="px-4 py-3.5">Paid to</th>
                    <th className="px-4 py-3.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {expensesReport.dateRows.map((row) => (
                    <tr key={row.expenseId} className="hover:bg-[var(--surface-subtle)]">
                      <td className="px-4 py-3 tabular-nums text-[var(--text-muted)]">
                        {formatDate(row.date)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-medium">
                        {row.docNumber}
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        {row.categoryLabel}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{row.description}</td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{row.paidTo}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--brand)]">
                        {formatMoney(row.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-subtle)] font-heading text-sm font-semibold text-[var(--text)]">
                    <td className="px-4 py-3.5" colSpan={5}>
                      Totals ({expensesReport.totals.expensesCount} expenses)
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[var(--brand)]">
                      {formatMoney(expensesReport.totals.amount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB 10: SALARIES AND ADVANCES
      ==================================================================== */}
      {activeTab === 'salaries' && salariesReport && (
        <div className="space-y-4">
          <StatCardGrid>
            <StatCard
              label={`Total salary (${formatMonthLabel(salariesReport.month)})`}
              value={formatMoney(salariesReport.totals.grossSalary)}
              numericValue={salariesReport.totals.grossSalary.toNumber()}
              formatter={(v) => formatMoney(v)}
              isKeyNumber={true}
            />
            <StatCard
              label="Advances taken"
              value={formatMoney(salariesReport.totals.advancesGivenInMonth)}
            />
            <StatCard
              label="Paid"
              value={formatMoney(salariesReport.totals.paidAmount)}
            />
            <StatCard
              label="Open advance balance"
              value={formatMoney(salariesReport.totals.openAdvanceBalance)}
            />
          </StatCardGrid>

          {salariesReport.rows.length === 0 ? (
            <EmptyState message="No employee salary or advance records found." />
          ) : (
            <div className="overflow-x-auto rounded-[10px] border border-[var(--border)] bg-[var(--bg)]">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-xs font-medium text-[var(--text-muted)]">
                    <th className="px-4 py-3.5">Month</th>
                    <th className="px-4 py-3.5">Employee</th>
                    <th className="px-4 py-3.5 text-right">Salary</th>
                    <th className="px-4 py-3.5 text-right">Advances taken</th>
                    <th className="px-4 py-3.5 text-right">Advance deducted</th>
                    <th className="px-4 py-3.5 text-right">Net payable</th>
                    <th className="px-4 py-3.5 text-right">Paid</th>
                    <th className="px-4 py-3.5 text-right">Open advance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {salariesReport.rows.map((row) => (
                    <tr key={row.employeeId} className="hover:bg-[var(--surface-subtle)]">
                      <td className="px-4 py-3 text-xs text-[var(--text-muted)] tabular-nums">
                        {formatMonthLabel(row.month)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[var(--text)]">
                          {row.employeeName}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {row.employeeRole} · {row.salaryDocNumber}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(row.grossSalary)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(row.advancesGivenInMonth)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--brand)]">
                        {formatMoney(row.advanceDeduction)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {formatMoney(row.netPayable)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--success)]">
                        {formatMoney(row.paidAmount)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--brand)]">
                        {formatMoney(row.openAdvanceBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-subtle)] font-heading text-sm font-semibold text-[var(--text)]">
                    <td className="px-4 py-3.5" colSpan={2}>
                      Totals ({salariesReport.totals.employeesCount} employees)
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      {formatMoney(salariesReport.totals.grossSalary)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      {formatMoney(salariesReport.totals.advancesGivenInMonth)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[var(--brand)]">
                      {formatMoney(salariesReport.totals.advanceDeduction)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      {formatMoney(salariesReport.totals.netPayable)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[var(--success)]">
                      {formatMoney(salariesReport.totals.paidAmount)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[var(--brand)]">
                      {formatMoney(salariesReport.totals.openAdvanceBalance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Print & Download PDF Dialog */}
      {currentExportSpec && (
        <Dialog
          open={printOpen}
          onClose={() => setPrintOpen(false)}
          title={currentExportSpec.meta.title}
          maxWidth="xl"
        >
          <PrintLayout doc={currentExportSpec.meta} companyId={companyId} />
        </Dialog>
      )}
    </div>
  );
};
