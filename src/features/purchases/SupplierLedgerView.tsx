import { useGSAP } from '@gsap/react';
import Decimal from 'decimal.js';
import gsap from 'gsap';
import {
  ArrowLeft,
  Banknote,
  Calendar,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Phone,
  Printer,
  ShoppingCart,
  Wallet,
} from 'lucide-react';
import React, { useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartCard,
  CustomChartTooltip,
  PurchaseRateTrendLineChart,
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
  roundWeight,
  type SupplierLedgerDetailResult,
  type SupplierLedgerEntry,
} from '../../domain/engine';
import {
  extractNormalizedPurchaseLines,
  formatShortMonthLabel,
  type PurchaseRateTrendPoint,
} from '../../domain/reports';
import type {
  CompanySettings,
  Purchase,
  Supplier,
  SupplierPayment,
} from '../../domain/types';
import {
  formatBags,
  formatDate,
  formatMoney,
  formatTon,
} from '../../lib/format';
import {
  MOTION_DURATIONS,
  MOTION_EASING,
  prefersReducedMotion,
  useStaggerIn,
} from '../../lib/motion';
import { cn, getInitials } from '../../lib/utils';
import { formatPaymentMethod } from '../customers/customerHelpers';
import { formatMonthYearLabel } from '../employees/employeeHelpers';
import { PartyReportsDialog } from '../reports/PartyReportsDialog';
import { Ban, ReceiptText } from 'lucide-react';
import {
  formatSupplierRunningBalanceLabel,
  getPurchaseBalance,
  getPurchaseLines,
} from './purchaseHelpers';

export interface SupplierLedgerViewProps {
  supplier: Supplier;
  ledger: SupplierLedgerDetailResult;
  purchases: Purchase[];
  supplierPayments: SupplierPayment[];
  settings?: CompanySettings | null;
  companyId: string;
  onBack: () => void;
  onPaySupplier: (supplierId: string) => void;
  onNewPurchase: (supplierId: string) => void;
  onPrintStatement: (supplier: Supplier) => void;
  onViewPurchase?: (purchase: Purchase) => void;
  onViewPaymentReceipt?: (payment: SupplierPayment) => void;
  onCancelPayment?: (payment: SupplierPayment) => void;
}

type ActiveSupplierTab = 'ledger' | 'purchases' | 'payments' | 'items';

interface SupplierMonthGroup {
  monthKey: string;
  monthLabel: string;
  entries: SupplierLedgerEntry[];
  totalDebit: Decimal;
  totalCredit: Decimal;
  closingBalance: Decimal;
}

interface SupplierPaymentViewRow {
  id: string;
  date: string;
  docNumber: string;
  method: string;
  notes: string;
  amount: Decimal;
  status: 'active' | 'cancelled';
  rawPayment?: SupplierPayment;
}

interface SupplierItemBoughtRow {
  itemId: string;
  itemName: string;
  kind: 'rock' | 'chemical';
  unit: 'ton' | 'bag';
  totalQuantity: Decimal;
  avgRate: Decimal;
  totalAmount: Decimal;
}

export const SupplierLedgerView: React.FC<SupplierLedgerViewProps> = ({
  supplier,
  ledger,
  purchases,
  supplierPayments,
  settings,
  companyId,
  onBack,
  onPaySupplier,
  onNewPurchase,
  onPrintStatement,
  onViewPurchase,
  onViewPaymentReceipt,
  onCancelPayment,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabsBarRef = useRef<HTMLDivElement>(null);
  const tabUnderlineRef = useRef<HTMLDivElement>(null);
  const tabContentRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<ActiveSupplierTab>('ledger');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});
  const [reportsDialogOpen, setReportsDialogOpen] = useState(false);

  const purchaseAllocMap = useMemo(() => {
    const map = new Map<
      string,
      SupplierLedgerDetailResult['purchaseAllocations'][number]
    >();
    for (const alloc of ledger.purchaseAllocations || []) {
      map.set(alloc.purchaseId, alloc);
    }
    return map;
  }, [ledger.purchaseAllocations]);

  // Staggered entrance animation
  useStaggerIn(containerRef, '.sup-ledger-stagger', true);

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

  const activePurchases = useMemo(
    () =>
      purchases
        .filter((p) => p.status === 'active')
        .sort(
          (a, b) => b.date.localeCompare(a.date) || b.docNumber.localeCompare(a.docNumber)
        ),
    [purchases]
  );

  // Combined payments list (standalone supplierPayments + paidNow on purchases)
  const allPaymentRows = useMemo<SupplierPaymentViewRow[]>(() => {
    const out: SupplierPaymentViewRow[] = [];

    for (const p of purchases) {
      const paidNow = roundMoney(p.paidNow || 0);
      if (paidNow.gt(0)) {
        out.push({
          id: `${p.id}_paidNow`,
          date: p.date.slice(0, 10),
          docNumber: p.docNumber,
          method: 'Paid on purchase',
          notes: `Paid at time of purchase ${p.docNumber}`,
          amount: paidNow,
          status: p.status,
        });
      }
    }

    for (const sp of supplierPayments) {
      out.push({
        id: sp.id,
        date: sp.date.slice(0, 10),
        docNumber: sp.docNumber,
        method: formatPaymentMethod(sp.method),
        notes: sp.notes || 'Supplier payment',
        amount: roundMoney(sp.amount),
        status: sp.status,
        rawPayment: sp,
      });
    }

    return out.sort(
      (a, b) => b.date.localeCompare(a.date) || b.docNumber.localeCompare(a.docNumber)
    );
  }, [purchases, supplierPayments]);

  const lastPurchase = activePurchases[0] || null;
  const lastPayment = useMemo(
    () => allPaymentRows.find((p) => p.status === 'active') || null,
    [allPaymentRows]
  );

  // Chart 1: Purchases per month (bar chart)
  const purchasesPerMonthData = useMemo(() => {
    const monthMap = new Map<string, Decimal>();
    for (const p of activePurchases) {
      const m = p.date.slice(0, 7);
      const prev = monthMap.get(m) || new Decimal(0);
      monthMap.set(m, roundMoney(prev.plus(p.totalAmount)));
    }
    return Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, amount]) => ({
        month,
        label: formatShortMonthLabel(month),
        amount: amount.toNumber(),
      }));
  }, [activePurchases]);

  // Chart 2: Rate trend per item & Items bought summary
  const { rateTrendPoints, itemsBoughtRows } = useMemo(() => {
    const points: PurchaseRateTrendPoint[] = [];
    const byItemMap = new Map<
      string,
      {
        itemId: string;
        itemName: string;
        kind: 'rock' | 'chemical';
        unit: 'ton' | 'bag';
        totalQuantity: Decimal;
        totalAmount: Decimal;
      }
    >();

    const chronologicalPurchases = [...activePurchases].sort(
      (a, b) => a.date.localeCompare(b.date) || a.docNumber.localeCompare(b.docNumber)
    );

    for (const p of chronologicalPurchases) {
      const lines = extractNormalizedPurchaseLines(p);
      for (const l of lines) {
        points.push({
          date: p.date.slice(0, 10),
          label: `${l.itemName} (${p.date.slice(5, 10)})`,
          docNumber: p.docNumber,
          itemId: l.itemId,
          itemName: l.itemName,
          unit: l.unit,
          rate: l.rate.toNumber(),
          quantity: l.quantity.toNumber(),
        });

        const existing = byItemMap.get(l.itemId);
        if (existing) {
          existing.totalQuantity = roundWeight(existing.totalQuantity.plus(l.quantity));
          existing.totalAmount = roundMoney(existing.totalAmount.plus(l.amount));
        } else {
          byItemMap.set(l.itemId, {
            itemId: l.itemId,
            itemName: l.itemName,
            kind: l.kind,
            unit: l.unit,
            totalQuantity: l.quantity,
            totalAmount: l.amount,
          });
        }
      }
    }

    const itemRows: SupplierItemBoughtRow[] = Array.from(byItemMap.values())
      .map((item) => ({
        ...item,
        avgRate: item.totalQuantity.gt(0)
          ? roundMoney(item.totalAmount.dividedBy(item.totalQuantity))
          : new Decimal(0),
      }))
      .sort((a, b) => b.totalAmount.comparedTo(a.totalAmount));

    return { rateTrendPoints: points, itemsBoughtRows: itemRows };
  }, [activePurchases]);

  // Filtered Ledger Entries & Month Grouping
  const filteredLedgerEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ledger.entries.filter((e) => {
      if (e.id !== 'opening' && e.date !== '—') {
        const dt = e.date.slice(0, 10);
        if (fromDate && dt < fromDate) return false;
        if (toDate && dt > toDate) return false;
      } else if (fromDate) {
        return false;
      }

      if (q) {
        if (!e.detail.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [ledger.entries, search, fromDate, toDate]);

  const monthGroups = useMemo<SupplierMonthGroup[]>(() => {
    const map = new Map<string, SupplierLedgerEntry[]>();
    for (const entry of filteredLedgerEntries) {
      const key =
        entry.id === 'opening' || entry.date === '—'
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

  const sortedPurchases = useMemo(
    () =>
      [...purchases].sort(
        (a, b) => b.date.localeCompare(a.date) || b.docNumber.localeCompare(a.docNumber)
      ),
    [purchases]
  );

  return (
    <div ref={containerRef} className="space-y-5 min-w-0">
      {/* Top Back link */}
      <div className="sup-ledger-stagger">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--brand)] transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to suppliers</span>
        </button>
      </div>

      {/* Shared D7 Header: Avatar with initials on --grad-brand, name, city & phone, action buttons */}
      <div className="sup-ledger-stagger flex flex-col gap-4 rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] p-4 sm:p-5 shadow-[var(--shadow-xs)] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-brand-gradient font-heading text-base font-bold text-white shadow-[var(--shadow-sm)]">
            {getInitials(supplier.name)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-lg sm:text-xl font-bold text-[var(--text)] truncate">
                {supplier.name}
              </h1>
              {supplier.city && (
                <span className="rounded-[6px] border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
                  {supplier.city}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
              {supplier.phone && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Phone className="h-3 w-3" />
                  {supplier.phone}
                </span>
              )}
              {supplier.contactPerson && <span>Attn: {supplier.contactPerson}</span>}
              {supplier.ntnOrCnic && <span>NTN/CNIC: {supplier.ntnOrCnic}</span>}
              {supplier.paymentTermsDays && (
                <span>Terms: {supplier.paymentTermsDays} days</span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons: Pay supplier, New purchase, Reports, Print statement */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => onPaySupplier(supplier.id)}
          >
            <Banknote className="h-4 w-4" />
            <span>Pay supplier</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onNewPurchase(supplier.id)}
          >
            <ShoppingCart className="h-4 w-4" />
            <span>New purchase</span>
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
            onClick={() => onPrintStatement(supplier)}
          >
            <Printer className="h-4 w-4" />
            <span>Print statement</span>
          </Button>
        </div>
      </div>

      {/* 5 Compact Summary Cards: Total purchased, Paid, Balance owed, Last purchase, Last payment */}
      <div className="sup-ledger-stagger grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 min-w-0">
        <StatCard
          label="Total purchased"
          value={formatMoney(ledger.totalPurchased)}
          numericValue={ledger.totalPurchased.toNumber()}
          formatter={(v) => formatMoney(v)}
          icon={ShoppingCart}
        />
        <StatCard
          label="Paid"
          value={formatMoney(ledger.totalPaid)}
          numericValue={ledger.totalPaid.toNumber()}
          formatter={(v) => formatMoney(v)}
          icon={Banknote}
        />
        <StatCard
          label={ledger.balance.lt(0) ? 'Advance' : 'Balance owed'}
          value={formatMoney(ledger.balance.abs())}
          numericValue={ledger.balance.abs().toNumber()}
          formatter={(v) => formatMoney(v)}
          isKeyNumber={ledger.balance.gt(0)}
          icon={Wallet}
          changeLabel={
            ledger.balance.gt(0)
              ? 'We owe'
              : ledger.balance.lt(0)
                ? 'In our favor'
                : 'Settled'
          }
          changeTone={
            ledger.balance.gt(0)
              ? 'negative'
              : ledger.balance.lt(0)
                ? 'positive'
                : 'neutral'
          }
        />
        <StatCard
          label="Last purchase"
          value={lastPurchase ? formatMoney(lastPurchase.totalAmount) : '—'}
          numericValue={lastPurchase ? Number(lastPurchase.totalAmount) : undefined}
          formatter={(v) => formatMoney(v)}
          changeLabel={lastPurchase ? formatDate(lastPurchase.date) : 'No purchases yet'}
          changeTone="neutral"
          icon={Calendar}
        />
        <StatCard
          label="Last payment"
          value={lastPayment ? formatMoney(lastPayment.amount) : '—'}
          numericValue={lastPayment ? lastPayment.amount.toNumber() : undefined}
          formatter={(v) => formatMoney(v)}
          changeLabel={lastPayment ? formatDate(lastPayment.date) : 'No payments yet'}
          changeTone="neutral"
          icon={Banknote}
        />
      </div>

      {/* Chart Row: 1) Purchases per month & 2) Rate trend per item */}
      <div className="sup-ledger-stagger grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
        <ChartCard
          title="Purchases per month"
          subtitle="Monthly purchase volume from this supplier"
          minHeight={230}
          isEmpty={purchasesPerMonthData.length === 0}
          emptyMessage="No purchases recorded for this supplier yet."
        >
          <ResponsiveContainer width="100%" height={230}>
            <BarChart
              data={purchasesPerMonthData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
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
                  <CustomChartTooltip valueFormatter={(v) => formatMoney(v)} />
                }
              />
              <Bar
                dataKey="amount"
                name="Purchased"
                fill="var(--brand)"
                radius={[6, 6, 0, 0]}
                maxBarSize={42}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <PurchaseRateTrendLineChart data={rateTrendPoints} />
      </div>

      {/* Tabs with sliding underline: Ledger | Purchases | Payments | Items bought */}
      <div
        ref={tabsBarRef}
        role="tablist"
        aria-label="Supplier ledger sections"
        className="sup-ledger-stagger relative flex items-center gap-6 border-b border-[var(--border)] overflow-x-auto no-scrollbar"
      >
        {(
          [
            { id: 'ledger', label: `Ledger (${ledger.entries.length})` },
            { id: 'purchases', label: `Purchases (${purchases.length})` },
            { id: 'payments', label: `Payments (${allPaymentRows.length})` },
            { id: 'items', label: `Items bought (${itemsBoughtRows.length})` },
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
        {/* TAB 1: LEDGER */}
        {activeTab === 'ledger' && (
          <div className="space-y-4 min-w-0">
            <FilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search voucher number or detail..."
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
                              Purchased:{' '}
                              <strong className="text-[var(--text)]">
                                {formatMoney(group.totalDebit)}
                              </strong>
                            </span>
                          )}
                          {group.totalCredit.gt(0) && (
                            <span className="text-[var(--text-muted)]">
                              Paid:{' '}
                              <strong className="text-[var(--success)]">
                                {formatMoney(group.totalCredit)}
                              </strong>
                            </span>
                          )}
                          <span className="text-[var(--text-muted)]">
                            Closing:{' '}
                            <strong className="text-[var(--brand)]">
                              {formatSupplierRunningBalanceLabel(group.closingBalance)}
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
                                  <th className="px-4 py-2.5 text-right">Debit (Purchased)</th>
                                  <th className="px-4 py-2.5 text-right">Credit (Paid)</th>
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
                                      {entry.date === '—' ? 'Opening' : formatDate(entry.date)}
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
                                      {formatSupplierRunningBalanceLabel(entry.balance)}
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
                                      {entry.date === '—' ? 'Opening' : formatDate(entry.date)}
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
                                      Bal: {formatSupplierRunningBalanceLabel(entry.balance)}
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

        {/* TAB 2: PURCHASES */}
        {activeTab === 'purchases' && (
          <DataTable<Purchase>
            tableId="supplier-ledger-purchases"
            data={sortedPurchases}
            keyExtractor={(p) => p.id}
            onRowClick={(p) => onViewPurchase?.(p)}
            mobileCardTitle={(p) => p.docNumber}
            mobileCardRight={(p) => formatMoney(p.totalAmount)}
            renderExpanded={(p) => {
              const lines = getPurchaseLines(p);
              return (
                <div className="overflow-x-auto rounded-[10px] border border-[var(--border)] bg-white">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                        <th className="px-3 py-2 text-left font-semibold">Item</th>
                        <th className="px-3 py-2 text-right font-semibold">Quantity</th>
                        <th className="px-3 py-2 text-right font-semibold">Rate</th>
                        <th className="px-3 py-2 text-right font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {lines.map((l) => (
                        <tr key={l.id}>
                          <td className="px-3 py-2 font-medium">{l.itemName}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {l.kind === 'rock'
                              ? formatTon(l.quantity)
                              : formatBags(l.quantity)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatMoney(l.rate)} / {l.kind === 'rock' ? 'ton' : 'bag'}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">
                            {formatMoney(l.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }}
            columns={[
              {
                key: 'docNumber',
                header: 'Voucher #',
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
                key: 'vehicle',
                header: 'Vehicle',
                render: (p) => (
                  <span className="tabular-nums text-[var(--text-secondary)]">
                    {p.vehicleNumber || '—'}
                  </span>
                ),
              },
              {
                key: 'items',
                header: 'Items',
                noTruncate: true,
                render: (p) => {
                  const lines = getPurchaseLines(p);
                  return (
                    <div className="flex flex-wrap items-center gap-1 max-w-[260px]">
                      {lines.map((l) => (
                        <span
                          key={l.id}
                          className="inline-flex items-center gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] font-medium"
                        >
                          <span>{l.itemName}</span>
                          <span className="text-[var(--brand)] font-semibold tabular-nums">
                            {l.kind === 'rock'
                              ? formatTon(l.quantity)
                              : formatBags(l.quantity)}
                          </span>
                        </span>
                      ))}
                    </div>
                  );
                },
              },
              {
                key: 'total',
                header: 'Total',
                align: 'right',
                render: (p) => (
                  <span className="font-semibold tabular-nums">
                    {formatMoney(p.totalAmount)}
                  </span>
                ),
              },
              {
                key: 'paid',
                header: 'Paid',
                align: 'right',
                render: (p) => {
                  const alloc = purchaseAllocMap.get(p.id);
                  return formatMoney(
                    p.status === 'cancelled'
                      ? p.paidNow || 0
                      : alloc?.paidAmount ?? p.paidNow ?? 0
                  );
                },
              },
              {
                key: 'balance',
                header: 'Balance',
                align: 'right',
                render: (p) => {
                  const alloc = purchaseAllocMap.get(p.id);
                  return formatMoney(
                    p.status === 'cancelled'
                      ? 0
                      : alloc?.remainingAmount ?? getPurchaseBalance(p)
                  );
                },
              },
              {
                key: 'status',
                header: 'Status',
                render: (p) => {
                  if (p.status === 'cancelled') {
                    return <StatusBadge status="cancelled" />;
                  }
                  const alloc = purchaseAllocMap.get(p.id);
                  return (
                    <StatusBadge status={alloc?.paymentStatus || 'unpaid'} />
                  );
                },
              },
              ...(onViewPurchase
                ? [
                    {
                      key: 'actions',
                      header: 'Actions',
                      align: 'right' as const,
                      hideable: false,
                      render: (p: Purchase) => (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewPurchase(p);
                          }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Voucher</span>
                        </Button>
                      ),
                    },
                  ]
                : []),
            ]}
            emptyState={
              <EmptyState message="No purchases recorded from this supplier." />
            }
          />
        )}

        {/* TAB 3: PAYMENTS */}
        {activeTab === 'payments' && (
          <DataTable<SupplierPaymentViewRow>
            tableId="supplier-ledger-payments"
            data={allPaymentRows}
            keyExtractor={(p) => p.id}
            onRowClick={(p) => {
              if (p.rawPayment && onViewPaymentReceipt) {
                onViewPaymentReceipt(p.rawPayment);
              }
            }}
            mobileCardTitle={(p) => p.docNumber}
            mobileCardRight={(p) => formatMoney(p.amount)}
            columns={[
              {
                key: 'docNumber',
                header: 'Number',
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
                render: (p) => p.method,
              },
              {
                key: 'notes',
                header: 'Notes',
                render: (p) => (
                  <span className="text-xs text-[var(--text-secondary)]">
                    {p.notes}
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
              ...(onViewPaymentReceipt || onCancelPayment
                ? [
                    {
                      key: 'actions',
                      header: 'Actions',
                      align: 'right' as const,
                      hideable: false,
                      render: (p: SupplierPaymentViewRow) =>
                        p.rawPayment ? (
                          <div className="flex items-center justify-end gap-1">
                            {onViewPaymentReceipt && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onViewPaymentReceipt(p.rawPayment!);
                                }}
                              >
                                <ReceiptText className="h-3.5 w-3.5" />
                                <span>Receipt</span>
                              </Button>
                            )}
                            {onCancelPayment && p.status !== 'cancelled' && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCancelPayment(p.rawPayment!);
                                }}
                              >
                                <Ban className="h-3.5 w-3.5 text-[var(--danger)]" />
                                <span className="text-[var(--danger)]">Cancel</span>
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">—</span>
                        ),
                    },
                  ]
                : []),
            ]}
            emptyState={
              <EmptyState message="No payments made to this supplier yet." />
            }
          />
        )}

        {/* TAB 4: ITEMS BOUGHT (item, total quantity, average rate, total amount) */}
        {activeTab === 'items' && (
          <DataTable<SupplierItemBoughtRow>
            tableId="supplier-ledger-items"
            data={itemsBoughtRows}
            keyExtractor={(r) => r.itemId}
            mobileCardTitle={(r) => r.itemName}
            mobileCardRight={(r) => formatMoney(r.totalAmount)}
            columns={[
              {
                key: 'item',
                header: 'Item',
                hideable: false,
                render: (r) => (
                  <span className="font-semibold text-[var(--text)]">
                    {r.itemName}
                  </span>
                ),
              },
              {
                key: 'quantity',
                header: 'Total quantity',
                align: 'right',
                render: (r) => (
                  <span className="font-medium tabular-nums">
                    {r.unit === 'ton'
                      ? formatTon(r.totalQuantity)
                      : formatBags(r.totalQuantity)}
                  </span>
                ),
              },
              {
                key: 'avgRate',
                header: 'Average rate',
                align: 'right',
                render: (r) => (
                  <span className="tabular-nums text-[var(--text-secondary)]">
                    {formatMoney(r.avgRate)} / {r.unit}
                  </span>
                ),
              },
              {
                key: 'totalAmount',
                header: 'Total amount',
                align: 'right',
                render: (r) => (
                  <span className="font-heading font-semibold text-[var(--text)] tabular-nums">
                    {formatMoney(r.totalAmount)}
                  </span>
                ),
              },
            ]}
            emptyState={
              <EmptyState message="No items bought from this supplier yet." />
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
        partyType="supplier"
        supplier={supplier}
        purchases={purchases}
        supplierPayments={supplierPayments}
      />
    </div>
  );
};
