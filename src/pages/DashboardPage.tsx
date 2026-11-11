import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import {
  AlertTriangle,
  ArrowRight,
  FileBarChart2,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionLoader } from '../components/loader/SectionLoader';
import {
  ExpensesCategoryDonutChart,
  SalesExpensesProfitComboChart,
  TonsSoldAreaChart,
  TopCustomersHorizontalBarChart,
} from '../components/shared/ChartCard';
import { EmptyState } from '../components/shared/EmptyState';
import { FilterMonthPill } from '../components/shared/FilterBar';
import { PageHeader } from '../components/shared/PageHeader';
import { StatCard, StatCardGrid } from '../components/shared/StatCard';
import { Button } from '../components/ui/Button';
import Decimal from 'decimal.js';
import {
  type AllCompanyRecords,
  calculateDashboardAnalytics,
  getInventorySnapshot,
  roundWeight,
} from '../domain/engine';
import { useAuth } from '../features/auth/AuthContext';
import { formatMonthLabel } from '../features/employees/employeeHelpers';
import {
  formatBags,
  formatDate,
  formatMoney,
  formatTon,
  getTodayKarachiIsoDate,
} from '../lib/format';
import { MOTION_DURATIONS, MOTION_EASING, prefersReducedMotion } from '../lib/motion';
import { notify } from '../lib/notify';
import { ReportService } from '../services';

export const DashboardPage: React.FC = () => {
  const { session } = useAuth();
  const navigate = useNavigate();
  const companyId = session?.companyId || '';

  const [selectedMonth, setSelectedMonth] = useState<string>(() =>
    getTodayKarachiIsoDate().slice(0, 7)
  );
  const [records, setRecords] = useState<AllCompanyRecords | null>(null);
  const [loading, setLoading] = useState(true);

  const initializedMonthRef = useRef(false);
  const animatedOnceRef = useRef(false);
  const chartsGridRef = useRef<HTMLDivElement>(null);
  const flowCardRef = useRef<HTMLDivElement>(null);

  const loadRecords = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const data = await ReportService.getAllCompanyRecords(companyId);
      setRecords(data);

      if (!initializedMonthRef.current) {
        initializedMonthRef.current = true;
        const currMonth = getTodayKarachiIsoDate().slice(0, 7);
        const hasCurrMonthActivity =
          data.bills.some((b) => b.status === 'active' && b.date.startsWith(currMonth)) ||
          data.expenses.some((e) => e.status === 'active' && e.date.startsWith(currMonth)) ||
          data.dispatches.some(
            (d) => d.status === 'active' && d.dateTime.startsWith(currMonth)
          ) ||
          data.salaries.some((s) => s.status === 'active' && s.month === currMonth);

        if (!hasCurrMonthActivity) {
          // Find latest active month across bills, expenses, dispatches, purchases
          const months: string[] = [];
          for (const b of data.bills) {
            if (b.status === 'active') months.push(b.date.slice(0, 7));
          }
          for (const e of data.expenses) {
            if (e.status === 'active') months.push(e.date.slice(0, 7));
          }
          for (const d of data.dispatches) {
            if (d.status === 'active') months.push(d.dateTime.slice(0, 7));
          }
          for (const p of data.purchases) {
            if (p.status === 'active') months.push(p.date.slice(0, 7));
          }
          if (months.length > 0) {
            months.sort();
            setSelectedMonth(months[months.length - 1]);
          }
        }
      }
    } catch (err) {
      notify.error(
        'Could not load dashboard.',
        err instanceof Error ? err.message : 'Refresh the page to try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const analytics = useMemo(() => {
    if (!records) return null;
    return calculateDashboardAnalytics(
      records,
      selectedMonth,
      getTodayKarachiIsoDate()
    );
  }, [records, selectedMonth]);

  // Inventory snapshot per 3.1
  const inventorySnapshot = useMemo(() => {
    if (!records) return null;
    return getInventorySnapshot({
      catalogItems: records.items,
      purchases: records.purchases,
      batches: records.batches,
      dispatches: records.dispatches,
    });
  }, [records]);

  // Sold tons this month for flow card
  const soldThisMonthTons = useMemo(() => {
    if (!records) return new Decimal(0);
    return records.bills
      .filter((b) => b.status === 'active' && b.date.startsWith(selectedMonth))
      .reduce((sum, b) => sum.plus(roundWeight(b.receivedWeightTons)), new Decimal(0));
  }, [records, selectedMonth]);

  const hasAnyCompanyData = useMemo(() => {
    if (!records) return false;
    return (
      records.purchases.some((p) => p.status === 'active') ||
      records.batches.some((b) => b.status === 'active') ||
      records.dispatches.some((d) => d.status === 'active') ||
      records.bills.some((b) => b.status === 'active') ||
      records.expenses.some((e) => e.status === 'active')
    );
  }, [records]);

  useGSAP(
    () => {
      if (animatedOnceRef.current || prefersReducedMotion()) {
        return;
      }
      animatedOnceRef.current = true;

      if (flowCardRef.current) {
        gsap.fromTo(
          flowCardRef.current,
          { opacity: 0, y: 12 },
          {
            opacity: 1,
            y: 0,
            duration: MOTION_DURATIONS.base,
            ease: MOTION_EASING.in,
          }
        );
      }
    },
    { dependencies: [loading, hasAnyCompanyData] }
  );

  if (loading || !analytics) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" />
        <SectionLoader cards={8} rows={2} />
      </div>
    );
  }

  const totalAttentionCount =
    analytics.needsAttention.waitingForWeightDispatches.length +
    analytics.needsAttention.overdueBills30Plus.length +
    analytics.needsAttention.zeroOrLowStockItems.length +
    analytics.needsAttention.openAdvances.length;

  const netProfitSparkline = analytics.salesVsExpenses6Months.map(
    (m) => m.sales - m.expenses
  );
  const salesSparkline = analytics.salesVsExpenses6Months.map((m) => m.sales);
  const expensesSparkline = analytics.salesVsExpenses6Months.map((m) => m.expenses);

  return (
    <div className="space-y-6 pb-12 min-w-0">
      <PageHeader
        title="Dashboard"
        secondaryActions={
          <FilterMonthPill
            value={selectedMonth}
            onChange={setSelectedMonth}
            showArrows={true}
          />
        }
        action={
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(`/reports?month=${selectedMonth}`)}
          >
            <FileBarChart2 className="h-4 w-4" />
            View reports
          </Button>
        }
      />

      {!hasAnyCompanyData ? (
        <EmptyState message="No factory transactions recorded yet." />
      ) : (
        <>
          {/* 1. Primary Financial Stat Cards (8 cards: Net Profit Hero Card + Sales, COGS, Profit on sales, Expenses, Salaries, Receivable, Payable) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-sm font-semibold text-[var(--text)]">
                Financial summary — {formatMonthLabel(selectedMonth)}
              </h2>
            </div>

            <StatCardGrid>
              <StatCard
                label="Net profit"
                value={formatMoney(analytics.netProfit)}
                numericValue={analytics.netProfit.toNumber()}
                formatter={(v) => formatMoney(v)}
                isHero={true}
                sparklineData={netProfitSparkline}
                onClick={() => navigate(`/reports?tab=pnl&month=${selectedMonth}`)}
              />
              <StatCard
                label="Sales"
                value={formatMoney(analytics.sales)}
                numericValue={analytics.sales.toNumber()}
                formatter={(v) => formatMoney(v)}
                sparklineData={salesSparkline}
                onClick={() => navigate(`/reports?tab=sales&month=${selectedMonth}`)}
              />
              <StatCard
                label="Cost of powder sold"
                value={formatMoney(analytics.cogs)}
                numericValue={analytics.cogs.toNumber()}
                formatter={(v) => formatMoney(v)}
                onClick={() => navigate(`/reports?tab=pnl&month=${selectedMonth}`)}
              />
              <StatCard
                label="Profit on sales"
                value={formatMoney(analytics.grossProfit)}
                numericValue={analytics.grossProfit.toNumber()}
                formatter={(v) => formatMoney(v)}
                onClick={() => navigate(`/reports?tab=pnl&month=${selectedMonth}`)}
              />
              <StatCard
                label="Expenses"
                value={formatMoney(analytics.expenses)}
                numericValue={analytics.expenses.toNumber()}
                formatter={(v) => formatMoney(v)}
                sparklineData={expensesSparkline}
                onClick={() => navigate(`/reports?tab=expenses&month=${selectedMonth}`)}
              />
              <StatCard
                label="Salaries"
                value={formatMoney(analytics.salaries)}
                numericValue={analytics.salaries.toNumber()}
                formatter={(v) => formatMoney(v)}
                onClick={() => navigate(`/reports?tab=salaries&month=${selectedMonth}`)}
              />
              <StatCard
                label="Receivable"
                value={formatMoney(analytics.receivables)}
                numericValue={analytics.receivables.toNumber()}
                formatter={(v) => formatMoney(v)}
                onClick={() => navigate('/reports?tab=receivables')}
              />
              <StatCard
                label="Payable"
                value={formatMoney(analytics.payables)}
                numericValue={analytics.payables.toNumber()}
                formatter={(v) => formatMoney(v)}
                onClick={() => navigate('/reports?tab=payables')}
              />
            </StatCardGrid>
          </div>

          {/* Flow Card per 3.4: Raw materials (value) → Powder in stock (tons and value) → On the way (vehicles) → Sold this month (tons and Rs) */}
          {inventorySnapshot && (
            <div
              ref={flowCardRef}
              className="rounded-[16px] border border-[var(--border)] bg-[var(--bg)] p-4 sm:p-5 space-y-3 shadow-soft"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-[var(--brand)]" />
                  <h2 className="font-heading text-sm font-semibold text-[var(--text)]">
                    Factory inventory & sales flow
                  </h2>
                </div>
                <span className="text-xs text-[var(--text-muted)]">Live pipeline</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-stretch">
                {/* 1. Raw materials */}
                <button
                  type="button"
                  onClick={() => navigate('/stock')}
                  className="group relative rounded-[12px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3.5 transition-all hover:border-[var(--brand)] hover:bg-[var(--bg)] cursor-pointer text-left flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
                      <span className="font-medium text-[var(--text)]">1. Raw materials</span>
                      <ArrowRight className="h-3.5 w-3.5 text-[var(--brand)] opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="font-heading text-base sm:text-lg font-semibold text-[var(--text)] tabular-nums">
                      {formatMoney(inventorySnapshot.rawMaterialsValue)}
                    </div>
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-2">
                    {formatTon(analytics.rockStockTons)} rock · {formatBags(analytics.chemicalBagsTotal)}
                  </div>
                </button>

                {/* 2. Powder in stock */}
                <button
                  type="button"
                  onClick={() => navigate('/stock?tab=final_product')}
                  className="group relative rounded-[12px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3.5 transition-all hover:border-[var(--brand)] hover:bg-[var(--bg)] cursor-pointer text-left flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
                      <span className="font-medium text-[var(--brand)]">2. Powder in stock</span>
                      <ArrowRight className="h-3.5 w-3.5 text-[var(--brand)] opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="font-heading text-base sm:text-lg font-semibold text-[var(--brand)] tabular-nums">
                      {formatTon(inventorySnapshot.powder.stock)}
                    </div>
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-2">
                    Value: {formatMoney(inventorySnapshot.powder.totalValue)}
                  </div>
                </button>

                {/* 3. On the way */}
                <button
                  type="button"
                  onClick={() => navigate('/dispatch')}
                  className="group relative rounded-[12px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3.5 transition-all hover:border-[var(--brand)] hover:bg-[var(--bg)] cursor-pointer text-left flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
                      <span className="font-medium text-[var(--text)]">3. On the way</span>
                      <ArrowRight className="h-3.5 w-3.5 text-[var(--brand)] opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="font-heading text-base sm:text-lg font-semibold text-[var(--text)] tabular-nums">
                      {inventorySnapshot.vehiclesOnTheWayCount}{' '}
                      <span className="text-xs sm:text-sm font-normal text-[var(--text-muted)]">
                        {inventorySnapshot.vehiclesOnTheWayCount === 1 ? 'vehicle' : 'vehicles'}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-2">
                    Awaiting received weight
                  </div>
                </button>

                {/* 4. Sold this month */}
                <button
                  type="button"
                  onClick={() => navigate('/bills')}
                  className="group relative rounded-[12px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3.5 transition-all hover:border-[var(--brand)] hover:bg-[var(--bg)] cursor-pointer text-left flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
                      <span className="font-medium text-[var(--text)]">4. Sold this month</span>
                      <ArrowRight className="h-3.5 w-3.5 text-[var(--brand)] opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="font-heading text-base sm:text-lg font-semibold text-[var(--text)] tabular-nums">
                      {formatTon(soldThisMonthTons)}
                    </div>
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-2">
                    Revenue: {formatMoney(analytics.sales)}
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* 2. Stock Cards: Rock (ton), Chemical bags, Final powder (ton) */}
          <div className="space-y-2.5">
            <h2 className="font-heading text-sm font-semibold text-[var(--text)]">
              Current stock on hand
            </h2>
            <StatCardGrid>
              <StatCard
                label="Rock stock"
                value={formatTon(analytics.rockStockTons)}
                numericValue={analytics.rockStockTons.toNumber()}
                formatter={(v) => formatTon(v)}
                onClick={() => navigate('/stock')}
              />
              <StatCard
                label="Chemical bags"
                value={formatBags(analytics.chemicalBagsTotal)}
                numericValue={analytics.chemicalBagsTotal.toNumber()}
                formatter={(v) => formatBags(v)}
                onClick={() => navigate('/stock')}
              />
              <StatCard
                label="Final powder"
                value={formatTon(analytics.finalPowderTons)}
                numericValue={analytics.finalPowderTons.toNumber()}
                formatter={(v) => formatTon(v)}
                onClick={() => navigate('/stock')}
              />
            </StatCardGrid>
          </div>

          {/* 3. Upgraded D4 Charts (2x2 Grid) */}
          <div
            ref={chartsGridRef}
            className="grid grid-cols-1 gap-4 lg:grid-cols-2"
          >
            {/* Chart 1: Sales vs expenses vs net profit (6 months) */}
            <SalesExpensesProfitComboChart
              title="Sales vs expenses vs net profit (6 months)"
              subtitle="Monthly powder sales, operating expenses and net profit"
              data={analytics.salesVsExpenses6Months}
            />

            {/* Chart 2: Tons sold per day (gradient area chart) */}
            <TonsSoldAreaChart
              title={`Tons sold per day (${formatMonthLabel(selectedMonth)})`}
              subtitle="Daily factory powder weight (ton)"
              data={analytics.dispatchedTonsPerDay.map((d) => ({
                label: d.dayLabel,
                tons: d.tons,
              }))}
              seriesLabel="Tons"
              emptyMessage={`No dispatches recorded in ${formatMonthLabel(selectedMonth)}.`}
            />

            {/* Chart 3: Expenses by category (donut with rounded segments, center total, hover legend) */}
            <ExpensesCategoryDonutChart
              title={`Expenses by category (${formatMonthLabel(selectedMonth)})`}
              subtitle={`Total: ${formatMoney(analytics.expenses)}`}
              data={analytics.expensesByCategory}
              totalAmount={analytics.expenses.toNumber()}
              emptyMessage={`No expenses recorded in ${formatMonthLabel(selectedMonth)}.`}
            />

            {/* Chart 4: Top customers (horizontal bars with value at bar end) */}
            <TopCustomersHorizontalBarChart
              title={`Top customers by sales (${formatMonthLabel(selectedMonth)})`}
              subtitle="Ranked by active powder sales in month"
              data={analytics.top5CustomersBySales}
              emptyMessage={`No customer sales in ${formatMonthLabel(selectedMonth)}.`}
            />
          </div>

          {/* 4. Compact "Needs attention" list */}
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg)] p-5">
            <div className="mb-3.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-[var(--brand)]" />
                <h2 className="font-heading text-base font-semibold text-[var(--text)]">
                  Needs attention
                </h2>
              </div>
              <span className="text-xs font-medium text-[var(--text-muted)] tabular-nums">
                {totalAttentionCount} item{totalAttentionCount === 1 ? '' : 's'}
              </span>
            </div>

            {totalAttentionCount === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                Everything is up to date — no pending weights, overdue bills, low stock, or open advances.
              </p>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {/* Dispatches waiting for received weight */}
                {analytics.needsAttention.waitingForWeightDispatches.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => navigate('/dispatch')}
                    className="flex w-full items-center justify-between gap-3 py-3 text-left transition-colors hover:bg-[var(--surface-subtle)] px-2 rounded-[6px]"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[var(--text)] truncate">
                        Dispatch {d.docNumber} waiting for received weight — {d.customerName}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] tabular-nums">
                        {formatDate(d.date)} · Vehicle {d.vehicleNumber} · On the way
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand)] shrink-0">
                      Enter weight <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </button>
                ))}

                {/* Unpaid bills older than 30 days */}
                {analytics.needsAttention.overdueBills30Plus.slice(0, 4).map((b) => (
                  <button
                    key={b.billId}
                    type="button"
                    onClick={() => navigate('/customers')}
                    className="flex w-full items-center justify-between gap-3 py-3 text-left transition-colors hover:bg-[var(--surface-subtle)] px-2 rounded-[6px]"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[var(--text)] truncate">
                        Unpaid bill {b.docNumber} ({b.ageDays} days old) — {b.customerName}
                      </div>
                      <div className="text-xs text-[var(--danger)] tabular-nums">
                        Bill date {formatDate(b.date)} · Balance due {formatMoney(b.remainingAmount)}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand)] shrink-0">
                      Receive payment <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </button>
                ))}

                {/* Zero or low stock */}
                {analytics.needsAttention.zeroOrLowStockItems.map((st) => (
                  <button
                    key={st.itemId}
                    type="button"
                    onClick={() => navigate('/stock')}
                    className="flex w-full items-center justify-between gap-3 py-3 text-left transition-colors hover:bg-[var(--surface-subtle)] px-2 rounded-[6px]"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[var(--text)] truncate">
                        Low / zero stock: {st.itemName} ({st.typeLabel})
                      </div>
                      <div className="text-xs text-[var(--danger)] tabular-nums">
                        Available: {st.quantity} {st.unit}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand)] shrink-0">
                      View stock <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </button>
                ))}

                {/* Open advances */}
                {analytics.needsAttention.openAdvances.map((adv) => (
                  <button
                    key={adv.employeeId}
                    type="button"
                    onClick={() => navigate('/employees')}
                    className="flex w-full items-center justify-between gap-3 py-3 text-left transition-colors hover:bg-[var(--surface-subtle)] px-2 rounded-[6px]"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[var(--text)] truncate">
                        Open employee advance — {adv.employeeName}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] tabular-nums">
                        {adv.role} · Remaining balance {formatMoney(adv.openBalance)}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand)] shrink-0">
                      Employees <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
