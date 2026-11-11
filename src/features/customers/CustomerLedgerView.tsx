import { useGSAP } from '@gsap/react';
import Decimal from 'decimal.js';
import gsap from 'gsap';
import {
  ArrowLeft,
  Banknote,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  Phone,
  Printer,
  Receipt,
  Truck,
  Wallet,
  XCircle,
} from 'lucide-react';
import React, { useId, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartCard,
  CustomChartTooltip,
} from '../../components/shared/ChartCard';
import { DataTable } from '../../components/shared/DataTable';
import { EmptyState } from '../../components/shared/EmptyState';
import {
  FilterBar,
  FilterDateRangePill,
  type FilterChip,
} from '../../components/shared/FilterBar';
import { StatCard } from '../../components/shared/StatCard';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { Button } from '../../components/ui/Button';
import {
  roundMoney,
  type AllocatedBillSummary,
  type CustomerLedgerEntry,
  type CustomerLedgerResult,
} from '../../domain/engine';
import { diffDaysBetweenIsoDates } from '../../domain/reports';
import type {
  Bill,
  CompanySettings,
  Customer,
  CustomerPayment,
  Dispatch,
} from '../../domain/types';
import {
  formatBags,
  formatDate,
  formatDateTime,
  formatMoney,
  formatTon,
  getTodayKarachiIsoDate,
} from '../../lib/format';
import {
  MOTION_DURATIONS,
  MOTION_EASING,
  prefersReducedMotion,
  useStaggerIn,
} from '../../lib/motion';
import { cn, getInitials } from '../../lib/utils';
import { formatMonthYearLabel } from '../employees/employeeHelpers';
import { PartyReportsDialog } from '../reports/PartyReportsDialog';
import {
  computePaymentAppliedToBillsMap,
  formatPaymentMethod,
  formatRunningBalanceLabel,
} from './customerHelpers';

export interface CustomerLedgerViewProps {
  customer: Customer;
  ledger: CustomerLedgerResult;
  bills: Bill[];
  dispatches: Dispatch[];
  payments: CustomerPayment[];
  allBillsMap: Map<string, Bill>;
  settings?: CompanySettings | null;
  companyId: string;
  onBack: () => void;
  onReceivePayment: (customer: Customer) => void;
  onNewDispatch: (customer: Customer) => void;
  onPrintStatement: (customer: Customer) => void;
  onViewBill: (bill: Bill) => void;
  onViewReceipt: (payment: CustomerPayment) => void;
  onCancelPayment: (payment: CustomerPayment) => void;
}

type ActiveCustomerTab = 'ledger' | 'bills' | 'dispatches' | 'payments';

interface CustomerMonthGroup {
  monthKey: string;
  monthLabel: string;
  entries: CustomerLedgerEntry[];
  totalDebit: Decimal;
  totalCredit: Decimal;
  closingBalance: Decimal;
}

export const CustomerLedgerView: React.FC<CustomerLedgerViewProps> = ({
  customer,
  ledger,
  bills,
  dispatches,
  payments,
  allBillsMap,
  settings,
  companyId,
  onBack,
  onReceivePayment,
  onNewDispatch,
  onPrintStatement,
  onViewBill,
  onViewReceipt,
  onCancelPayment,
}) => {
  const uid = useId().replace(/:/g, '');
  const containerRef = useRef<HTMLDivElement>(null);
  const tabsBarRef = useRef<HTMLDivElement>(null);
  const tabUnderlineRef = useRef<HTMLDivElement>(null);
  const tabContentRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<ActiveCustomerTab>('ledger');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});
  const [reportsDialogOpen, setReportsDialogOpen] = useState(false);

  // Staggered entrance animation
  useStaggerIn(containerRef, '.cust-ledger-stagger', true);

  // Sliding underline on tab switch
  useGSAP(
    () => {
      const bar = tabsBarRef.current;
      const line = tabUnderlineRef.current;
      const content = tabContentRef.current;
      if (!bar || !line) return;

      const activeBtn = bar.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
      if (activeBtn) {
        const left = activeBtn.offsetLeft;
        const width = activeBtn.offsetWidth;
        if (prefersReducedMotion()) {
          gsap.set(line, { x: left, width });
        } else {
          gsap.to(line, {
            x: left,
            width,
            duration: MOTION_DURATIONS.fast,
            ease: MOTION_EASING.in,
          });
        }
      }

      if (content && !prefersReducedMotion()) {
        gsap.fromTo(
          content,
          { opacity: 0, y: 4 },
          { opacity: 1, y: 0, duration: MOTION_DURATIONS.fast, ease: MOTION_EASING.in }
        );
      }
    },
    { dependencies: [activeTab] }
  );

  const allocationByBillId = useMemo(() => {
    const map = new Map<string, AllocatedBillSummary>();
    for (const a of ledger.billAllocations) {
      map.set(a.billId, a);
    }
    return map;
  }, [ledger.billAllocations]);

  const appliedByPaymentId = useMemo(
    () =>
      computePaymentAppliedToBillsMap({
        openingBalance: customer.openingBalance,
        bills,
        payments,
      }),
    [customer.openingBalance, bills, payments]
  );

  // 1. Summary card metrics: Total billed, Received, Balance or Advance, Last payment, Oldest unpaid (days)
  const summaryMetrics = useMemo(() => {
    const activePayments = payments
      .filter((p) => p.status === 'active')
      .sort((a, b) => b.date.localeCompare(a.date) || b.docNumber.localeCompare(a.docNumber));

    const lastPay = activePayments[0] || null;
    const today = getTodayKarachiIsoDate();

    let oldestUnpaidDays = 0;
    let d0_30 = new Decimal(0);
    let d31_60 = new Decimal(0);
    let d60Plus = new Decimal(0);

    if (ledger.balance.gt(0)) {
      const unpaidOpening = Decimal.max(
        new Decimal(0),
        roundMoney(ledger.openingBalance.minus(ledger.totalPaid))
      );
      if (unpaidOpening.gt(0)) {
        d60Plus = roundMoney(d60Plus.plus(unpaidOpening));
        oldestUnpaidDays = Math.max(oldestUnpaidDays, 65);
      }

      for (const alloc of ledger.billAllocations) {
        if (alloc.remainingAmount.lte(0)) continue;
        const ageDays = diffDaysBetweenIsoDates(alloc.date, today);
        if (ageDays > oldestUnpaidDays) {
          oldestUnpaidDays = ageDays;
        }
        if (ageDays <= 30) {
          d0_30 = roundMoney(d0_30.plus(alloc.remainingAmount));
        } else if (ageDays <= 60) {
          d31_60 = roundMoney(d31_60.plus(alloc.remainingAmount));
        } else {
          d60Plus = roundMoney(d60Plus.plus(alloc.remainingAmount));
        }
      }
    }

    return {
      lastPayment: lastPay,
      oldestUnpaidDays,
      d0_30,
      d31_60,
      d60Plus,
    };
  }, [payments, ledger]);

  // 2. Chart 1: Balance over time (gradient area chart)
  const balanceOverTimeData = useMemo(() => {
    return ledger.entries.map((entry, idx) => ({
      index: idx,
      label: entry.date ? formatDate(entry.date) : 'Opening',
      detail: entry.detail,
      balance: entry.balance.toNumber(),
    }));
  }, [ledger.entries]);

  // 3. Chart 2: Ageing bar (0-30, 31-60, over 60 days)
  const ageingBarData = useMemo(() => {
    return [
      {
        bucket: '0–30 days',
        amount: summaryMetrics.d0_30.toNumber(),
        fill: 'var(--brand)',
      },
      {
        bucket: '31–60 days',
        amount: summaryMetrics.d31_60.toNumber(),
        fill: 'var(--warning)',
      },
      {
        bucket: 'Over 60 days',
        amount: summaryMetrics.d60Plus.toNumber(),
        fill: 'var(--danger)',
      },
    ];
  }, [summaryMetrics]);

  // 4. Filtered Ledger Entries & Month Grouping
  const filteredLedgerEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ledger.entries.filter((e) => {
      if (e.type !== 'opening') {
        const dt = e.date.slice(0, 10);
        if (fromDate && dt < fromDate) return false;
        if (toDate && dt > toDate) return false;
      } else if (fromDate) {
        return false;
      }

      if (q) {
        const matchDetail = e.detail.toLowerCase().includes(q);
        const matchDoc = (e.docNumber || '').toLowerCase().includes(q);
        if (!matchDetail && !matchDoc) return false;
      }
      return true;
    });
  }, [ledger.entries, search, fromDate, toDate]);

  const monthGroups = useMemo<CustomerMonthGroup[]>(() => {
    const map = new Map<string, CustomerLedgerEntry[]>();
    for (const entry of filteredLedgerEntries) {
      const key =
        entry.type === 'opening' || !entry.date
          ? '0000-00'
          : entry.date.slice(0, 7);
      const list = map.get(key) || [];
      list.push(entry);
      map.set(key, list);
    }

    const keys = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));
    return keys.map((key) => {
      const entries = map.get(key) || [];
      let totalDebit = new Decimal(0);
      let totalCredit = new Decimal(0);
      for (const e of entries) {
        totalDebit = roundMoney(totalDebit.plus(e.debit));
        totalCredit = roundMoney(totalCredit.plus(e.credit));
      }
      const closingBalance =
        entries.length > 0 ? entries[entries.length - 1].balance : new Decimal(0);

      return {
        monthKey: key,
        monthLabel:
          key === '0000-00' ? 'Opening balance' : formatMonthYearLabel(key),
        entries,
        totalDebit,
        totalCredit,
        closingBalance,
      };
    });
  }, [filteredLedgerEntries]);

  const activeFilterChips = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = [];
    if (fromDate) {
      chips.push({
        key: 'from',
        label: `From: ${formatDate(fromDate)}`,
        onRemove: () => setFromDate(''),
      });
    }
    if (toDate) {
      chips.push({
        key: 'to',
        label: `To: ${formatDate(toDate)}`,
        onRemove: () => setToDate(''),
      });
    }
    return chips;
  }, [fromDate, toDate]);

  const sortedBills = useMemo(
    () =>
      [...bills].sort(
        (a, b) => b.date.localeCompare(a.date) || b.docNumber.localeCompare(a.docNumber)
      ),
    [bills]
  );

  const sortedDispatches = useMemo(
    () =>
      [...dispatches].sort(
        (a, b) =>
          b.dateTime.localeCompare(a.dateTime) || b.docNumber.localeCompare(a.docNumber)
      ),
    [dispatches]
  );

  const sortedPayments = useMemo(
    () =>
      [...payments].sort(
        (a, b) => b.date.localeCompare(a.date) || b.docNumber.localeCompare(a.docNumber)
      ),
    [payments]
  );

  const isAdvance = ledger.balance.lt(0);
  const owesUs = ledger.balance.gt(0);

  return (
    <div ref={containerRef} className="space-y-5 min-w-0">
      {/* Top Back link */}
      <div className="cust-ledger-stagger">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--brand)] transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to customers</span>
        </button>
      </div>

      {/* Shared D7 Header: Avatar with initials on --grad-brand, name, city & phone, action buttons */}
      <div className="cust-ledger-stagger flex flex-col gap-4 rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] p-4 sm:p-5 shadow-[var(--shadow-xs)] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-brand-gradient font-heading text-base font-bold text-white shadow-[var(--shadow-sm)]">
            {getInitials(customer.name)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-lg sm:text-xl font-bold text-[var(--text)] truncate">
                {customer.name}
              </h1>
              {customer.city && (
                <span className="rounded-[6px] border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
                  {customer.city}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
              {customer.phone && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Phone className="h-3 w-3" />
                  {customer.phone}
                </span>
              )}
              {customer.contactPerson && <span>Attn: {customer.contactPerson}</span>}
              {customer.ntn && <span>NTN: {customer.ntn}</span>}
              {customer.paymentTermsDays && (
                <span>Terms: {customer.paymentTermsDays} days</span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons: Receive payment, New dispatch, Reports, Print statement */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => onReceivePayment(customer)}
          >
            <Banknote className="h-4 w-4" />
            <span>Receive payment</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onNewDispatch(customer)}
          >
            <Truck className="h-4 w-4" />
            <span>New dispatch</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setReportsDialogOpen(true)}
          >
            <FileText className="h-4 w-4" />
            <span>Reports</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onPrintStatement(customer)}
          >
            <Printer className="h-4 w-4" />
            <span>Print statement</span>
          </Button>
        </div>
      </div>

      {/* 5 Compact Summary Cards (D4 / D7) */}
      <div className="cust-ledger-stagger grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 min-w-0">
        <StatCard
          label="Total billed"
          value={formatMoney(ledger.totalSales)}
          numericValue={ledger.totalSales.toNumber()}
          formatter={(v) => formatMoney(v)}
          icon={Receipt}
        />
        <StatCard
          label="Received"
          value={formatMoney(ledger.totalPaid)}
          numericValue={ledger.totalPaid.toNumber()}
          formatter={(v) => formatMoney(v)}
          icon={Banknote}
        />
        <StatCard
          label={isAdvance ? 'Advance' : 'Balance'}
          value={formatMoney(ledger.balance.abs())}
          numericValue={ledger.balance.abs().toNumber()}
          formatter={(v) => formatMoney(v)}
          isKeyNumber={owesUs}
          icon={Wallet}
          changeLabel={
            isAdvance ? 'Advance credit' : owesUs ? 'Receivable' : 'Settled'
          }
          changeTone={isAdvance ? 'positive' : owesUs ? 'negative' : 'neutral'}
        />
        <StatCard
          label="Last payment"
          value={
            summaryMetrics.lastPayment
              ? formatMoney(summaryMetrics.lastPayment.amount)
              : '—'
          }
          numericValue={
            summaryMetrics.lastPayment
              ? Number(summaryMetrics.lastPayment.amount)
              : undefined
          }
          formatter={(v) => formatMoney(v)}
          changeLabel={
            summaryMetrics.lastPayment
              ? formatDate(summaryMetrics.lastPayment.date)
              : 'No payments yet'
          }
          changeTone="neutral"
          icon={Banknote}
        />
        <StatCard
          label="Oldest unpaid (days)"
          value={owesUs ? `${summaryMetrics.oldestUnpaidDays} days` : '0 days'}
          numericValue={owesUs ? summaryMetrics.oldestUnpaidDays : 0}
          formatter={(v) => `${Math.round(v)} days`}
          icon={Clock}
          changeLabel={
            summaryMetrics.oldestUnpaidDays > 60
              ? 'Over 60d'
              : summaryMetrics.oldestUnpaidDays > 30
                ? '31–60d'
                : undefined
          }
          changeTone={
            summaryMetrics.oldestUnpaidDays > 30 ? 'negative' : 'neutral'
          }
        />
      </div>

      {/* Chart Row: 1) Balance over time (gradient area chart) & 2) Ageing bar (0-30, 31-60, over 60 days) */}
      <div className="cust-ledger-stagger grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
        <ChartCard
          title="Balance over time"
          subtitle="Running receivable balance after each bill and payment"
          minHeight={230}
          isEmpty={balanceOverTimeData.length === 0}
          emptyMessage="No ledger movements recorded yet."
        >
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart
              data={balanceOverTimeData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id={`custBalGrad-${uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--brand)" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="4 4"
                stroke="var(--chart-grid)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip
                content={
                  <CustomChartTooltip
                    valueFormatter={(v) => formatRunningBalanceLabel(new Decimal(v))}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="balance"
                name="Running balance"
                stroke="var(--brand)"
                strokeWidth={2.25}
                fill={`url(#custBalGrad-${uid})`}
                dot={{ r: 3, fill: 'var(--brand)' }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Ageing of unpaid bills"
          subtitle="Outstanding receivable split by bill age (0–30, 31–60, over 60 days)"
          minHeight={230}
          isEmpty={!owesUs}
          emptyMessage="Customer has no unpaid balance."
        >
          <ResponsiveContainer width="100%" height={230}>
            <BarChart
              data={ageingBarData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="4 4"
                stroke="var(--chart-grid)"
                vertical={false}
              />
              <XAxis
                dataKey="bucket"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip
                content={
                  <CustomChartTooltip valueFormatter={(v) => formatMoney(v)} />
                }
              />
              <Bar
                dataKey="amount"
                name="Unpaid amount"
                radius={[6, 6, 0, 0]}
                maxBarSize={48}
              >
                {ageingBarData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Tabs with sliding underline: Ledger | Bills | Dispatches | Payments */}
      <div
        ref={tabsBarRef}
        role="tablist"
        aria-label="Customer ledger sections"
        className="cust-ledger-stagger relative flex items-center gap-6 border-b border-[var(--border)] overflow-x-auto no-scrollbar"
      >
        {(
          [
            { id: 'ledger', label: `Ledger (${ledger.entries.length})` },
            { id: 'bills', label: `Bills (${bills.length})` },
            { id: 'dispatches', label: `Dispatches (${dispatches.length})` },
            { id: 'payments', label: `Payments (${payments.length})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-tab={tab.id}
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'pb-3 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap',
              activeTab === tab.id
                ? 'text-[var(--brand)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            )}
          >
            {tab.label}
          </button>
        ))}

        <div
          ref={tabUnderlineRef}
          aria-hidden="true"
          className="absolute bottom-0 left-0 h-[2px] w-20 bg-[var(--brand)]"
        />
      </div>

      <div ref={tabContentRef} className="min-w-0">
        {/* TAB 1: LEDGER (search, date filter, expandable month grouping with totals, running balance) */}
        {activeTab === 'ledger' && (
          <div className="space-y-4 min-w-0">
            <FilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search bill number, receipt or detail..."
              activeChips={activeFilterChips}
              onClearAll={() => {
                setSearch('');
                setFromDate('');
                setToDate('');
              }}
              controls={[
                {
                  key: 'dates',
                  label: 'Dates',
                  node: (
                    <FilterDateRangePill
                      label="Dates"
                      fromDate={fromDate}
                      toDate={toDate}
                      onChangeFrom={setFromDate}
                      onChangeTo={setToDate}
                    />
                  ),
                },
              ]}
            />

            {monthGroups.length === 0 ? (
              <EmptyState message="No ledger entries match your search or date filter." />
            ) : (
              <div className="space-y-3">
                {monthGroups.map((group) => {
                  const isCollapsed = Boolean(collapsedMonths[group.monthKey]);
                  return (
                    <div
                      key={group.monthKey}
                      className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] shadow-[var(--shadow-xs)]"
                    >
                      {/* Expandable Month Header with Totals */}
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedMonths((prev) => ({
                            ...prev,
                            [group.monthKey]: !prev[group.monthKey],
                          }))
                        }
                        className="flex w-full flex-wrap items-center justify-between gap-2 bg-[var(--bg-subtle)] px-4 py-3 text-left transition-colors hover:bg-[var(--brand-soft)]/40 cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isCollapsed ? (
                            <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                          )}
                          <span className="font-heading text-sm font-bold text-[var(--text)]">
                            {group.monthLabel}
                          </span>
                          <span className="rounded-[6px] bg-white border border-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">
                            {group.entries.length}{' '}
                            {group.entries.length === 1 ? 'entry' : 'entries'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs tabular-nums">
                          {group.totalDebit.gt(0) && (
                            <span className="text-[var(--text-muted)]">
                              Billed:{' '}
                              <strong className="text-[var(--text)]">
                                {formatMoney(group.totalDebit)}
                              </strong>
                            </span>
                          )}
                          {group.totalCredit.gt(0) && (
                            <span className="text-[var(--text-muted)]">
                              Received:{' '}
                              <strong className="text-[var(--success)]">
                                {formatMoney(group.totalCredit)}
                              </strong>
                            </span>
                          )}
                          <span className="text-[var(--text-muted)]">
                            Closing:{' '}
                            <strong
                              className={cn(
                                group.closingBalance.lt(0)
                                  ? 'text-[var(--success)]'
                                  : 'text-[var(--brand)]'
                              )}
                            >
                              {formatRunningBalanceLabel(group.closingBalance)}
                            </strong>
                          </span>
                        </div>
                      </button>

                      {!isCollapsed && (
                        <>
                          {/* Desktop Ledger Table */}
                          <div className="hidden md:block overflow-x-auto border-t border-[var(--border)]">
                            <table className="w-full border-collapse text-left text-xs">
                              <thead>
                                <tr className="border-b border-[var(--border)] bg-white text-[11px] font-semibold text-[var(--text-muted)]">
                                  <th className="px-4 py-2.5">Date</th>
                                  <th className="px-4 py-2.5">Detail</th>
                                  <th className="px-4 py-2.5 text-right">Debit (Billed)</th>
                                  <th className="px-4 py-2.5 text-right">Credit (Received)</th>
                                  <th className="px-4 py-2.5 text-right">Running balance</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[var(--border)]">
                                {group.entries.map((entry) => (
                                  <tr
                                    key={entry.id}
                                    className="hover:bg-[var(--surface-subtle)] transition-colors"
                                  >
                                    <td className="px-4 py-3 whitespace-nowrap text-[var(--text-muted)] tabular-nums">
                                      {entry.date ? formatDate(entry.date) : 'Opening'}
                                    </td>
                                    <td className="px-4 py-3 font-medium text-[var(--text)]">
                                      {entry.detail}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums font-medium text-[var(--text)]">
                                      {entry.debit.gt(0) ? formatMoney(entry.debit) : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums font-medium text-[var(--success)]">
                                      {entry.credit.gt(0) ? formatMoney(entry.credit) : '—'}
                                    </td>
                                    <td
                                      className={cn(
                                        'px-4 py-3 text-right font-heading font-bold tabular-nums',
                                        entry.balance.lt(0)
                                          ? 'text-[var(--success)]'
                                          : 'text-[var(--text)]'
                                      )}
                                    >
                                      {formatRunningBalanceLabel(entry.balance)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Mobile Timeline Cards */}
                          <div className="divide-y divide-[var(--border)] border-t border-[var(--border)] md:hidden">
                            {group.entries.map((entry) => (
                              <div key={entry.id} className="p-3.5 space-y-1.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-xs font-semibold text-[var(--text)]">
                                      {entry.detail}
                                    </div>
                                    <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
                                      {entry.date ? formatDate(entry.date) : 'Opening'}
                                    </div>
                                  </div>
                                  <div className="text-right tabular-nums shrink-0">
                                    {entry.debit.gt(0) ? (
                                      <div className="text-xs font-bold text-[var(--text)]">
                                        +{formatMoney(entry.debit)}
                                      </div>
                                    ) : entry.credit.gt(0) ? (
                                      <div className="text-xs font-bold text-[var(--success)]">
                                        −{formatMoney(entry.credit)}
                                      </div>
                                    ) : null}
                                    <div className="text-[11px] text-[var(--text-muted)]">
                                      Bal: {formatRunningBalanceLabel(entry.balance)}
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

        {/* TAB 2: BILLS */}
        {activeTab === 'bills' && (
          <DataTable<Bill>
            tableId="customer-ledger-bills"
            data={sortedBills}
            keyExtractor={(b) => b.id}
            onRowClick={(b) => onViewBill(b)}
            mobileCardTitle={(b) => b.docNumber}
            mobileCardRight={(b) => formatMoney(b.totalAmount)}
            columns={[
              {
                key: 'docNumber',
                header: 'Bill #',
                hideable: false,
                render: (b) => (
                  <span className="font-semibold text-[var(--text)] tabular-nums">
                    {b.docNumber}
                  </span>
                ),
              },
              {
                key: 'date',
                header: 'Date',
                render: (b) => formatDate(b.date),
              },
              {
                key: 'vehicle',
                header: 'Vehicle',
                render: (b) => (
                  <span className="tabular-nums text-[var(--text-secondary)]">
                    {b.vehicleNumber || '—'}
                  </span>
                ),
              },
              {
                key: 'tons',
                header: 'Received tons',
                align: 'right',
                render: (b) => formatTon(b.receivedWeightTons),
              },
              {
                key: 'rate',
                header: 'Rate',
                align: 'right',
                render: (b) => formatMoney(b.ratePerTon),
              },
              {
                key: 'amount',
                header: 'Amount',
                align: 'right',
                render: (b) => (
                  <span className="font-semibold tabular-nums">
                    {formatMoney(b.totalAmount)}
                  </span>
                ),
              },
              {
                key: 'paid',
                header: 'Paid',
                align: 'right',
                render: (b) => {
                  const alloc = allocationByBillId.get(b.id);
                  return (
                    <span className="text-[var(--success)] tabular-nums">
                      {b.status === 'cancelled'
                        ? '—'
                        : formatMoney(alloc?.paidAmount || 0)}
                    </span>
                  );
                },
              },
              {
                key: 'balance',
                header: 'Balance',
                align: 'right',
                render: (b) => {
                  const alloc = allocationByBillId.get(b.id);
                  return (
                    <span className="font-semibold tabular-nums">
                      {b.status === 'cancelled'
                        ? '—'
                        : formatMoney(alloc?.remainingAmount ?? b.totalAmount)}
                    </span>
                  );
                },
              },
              {
                key: 'status',
                header: 'Status',
                render: (b) => {
                  if (b.status === 'cancelled') {
                    return <StatusBadge status="cancelled" />;
                  }
                  const alloc = allocationByBillId.get(b.id);
                  return <StatusBadge status={alloc?.paymentStatus || 'unpaid'} />;
                },
              },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                hideable: false,
                render: (b) => (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewBill(b);
                    }}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>View</span>
                  </Button>
                ),
              },
            ]}
            emptyState={<EmptyState message="No bills recorded for this customer." />}
          />
        )}

        {/* TAB 3: DISPATCHES (Sent dispatches appear as "On the way") */}
        {activeTab === 'dispatches' && (
          <DataTable<Dispatch>
            tableId="customer-ledger-dispatches"
            data={sortedDispatches}
            keyExtractor={(d) => d.id}
            mobileCardTitle={(d) => `${d.docNumber} · ${d.vehicleNumber}`}
            mobileCardRight={(d) =>
              d.receivedWeightTons
                ? formatTon(d.receivedWeightTons)
                : formatBags(d.bagsCount)
            }
            columns={[
              {
                key: 'docNumber',
                header: 'Dispatch #',
                hideable: false,
                render: (d) => (
                  <span className="font-semibold text-[var(--text)] tabular-nums">
                    {d.docNumber}
                  </span>
                ),
              },
              {
                key: 'dateTime',
                header: 'Date & time',
                render: (d) => formatDateTime(d.dateTime),
              },
              {
                key: 'vehicle',
                header: 'Vehicle',
                render: (d) => (
                  <span className="tabular-nums font-medium">{d.vehicleNumber}</span>
                ),
              },
              {
                key: 'driver',
                header: 'Driver',
                render: (d) => d.driverName || '—',
              },
              {
                key: 'dispatched',
                header: 'Sent bags',
                align: 'right',
                render: (d) => formatBags(d.bagsCount),
              },
              {
                key: 'received',
                header: 'Received tons',
                align: 'right',
                render: (d) =>
                  d.receivedWeightTons ? formatTon(d.receivedWeightTons) : '—',
              },
              {
                key: 'status',
                header: 'Status',
                render: (d) => {
                  if (d.status === 'cancelled') {
                    return <StatusBadge status="cancelled" />;
                  }
                  const isCompleted = Boolean(d.billId && d.receivedWeightTons);
                  return (
                    <StatusBadge
                      status={isCompleted ? 'paid' : 'sent'}
                      label={isCompleted ? 'Billed' : 'On the way'}
                    />
                  );
                },
              },
            ]}
            emptyState={
              <EmptyState message="No dispatches recorded for this customer." />
            }
          />
        )}

        {/* TAB 4: PAYMENTS */}
        {activeTab === 'payments' && (
          <DataTable<CustomerPayment>
            tableId="customer-ledger-payments"
            data={sortedPayments}
            keyExtractor={(p) => p.id}
            onRowClick={(p) => onViewReceipt(p)}
            mobileCardTitle={(p) => p.docNumber}
            mobileCardRight={(p) => formatMoney(p.amount)}
            columns={[
              {
                key: 'docNumber',
                header: 'Receipt #',
                hideable: false,
                render: (p) => (
                  <span className="font-semibold text-[var(--text)] tabular-nums">
                    {p.docNumber}
                  </span>
                ),
              },
              {
                key: 'date',
                header: 'Date',
                render: (p) => formatDate(p.date),
              },
              {
                key: 'method',
                header: 'Method',
                render: (p) => formatPaymentMethod(p.method),
              },
              {
                key: 'applied',
                header: 'Applied to bills',
                render: (p) => (
                  <span className="text-xs text-[var(--text-secondary)]">
                    {appliedByPaymentId.get(p.id) || 'Account allocation'}
                  </span>
                ),
              },
              {
                key: 'amount',
                header: 'Amount',
                align: 'right',
                render: (p) => (
                  <span className="font-heading font-semibold text-[var(--success)] tabular-nums">
                    {formatMoney(p.amount)}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (p) => <StatusBadge status={p.status} />,
              },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                hideable: false,
                render: (p) => (
                  <div className="inline-flex items-center justify-end gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewReceipt(p);
                      }}
                    >
                      <Printer className="h-3.5 w-3.5" />
                      <span>Receipt</span>
                    </Button>
                    {p.status === 'active' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCancelPayment(p);
                        }}
                        className="text-[var(--danger)]"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        <span>Cancel</span>
                      </Button>
                    )}
                  </div>
                ),
              },
            ]}
            emptyState={
              <EmptyState message="No payments received from this customer yet." />
            }
          />
        )}
      </div>

      {/* Party Reports Popup */}
      <PartyReportsDialog
        open={reportsDialogOpen}
        onClose={() => setReportsDialogOpen(false)}
        companyId={companyId}
        settings={settings}
        partyType="customer"
        customer={customer}
        bills={bills}
        dispatches={dispatches}
        customerPayments={payments}
      />
    </div>
  );
};
