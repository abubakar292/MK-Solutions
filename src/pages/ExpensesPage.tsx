import { Download, Plus, Printer } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SectionLoader } from '../components/loader/SectionLoader';
import {
  PrintLayout,
  downloadDocumentPdf,
  usePrintDocument,
} from '../components/print/PrintLayout';
import { ExpensesCategoryDonutChart } from '../components/shared/ChartCard';
import { DataTable } from '../components/shared/DataTable';
import { DeleteConfirmDialog } from '../components/shared/DeleteConfirmDialog';
import { DetailDrawer } from '../components/shared/DetailDrawer';
import { ConfirmDialog, Dialog } from '../components/shared/Dialog';
import { EmptyState } from '../components/shared/EmptyState';
import {
  FilterBar,
  FilterDateRangePill,
  FilterMonthPill,
  FilterSelectPill,
  type FilterChip,
} from '../components/shared/FilterBar';
import { PageHeader } from '../components/shared/PageHeader';
import { RowActions } from '../components/shared/RowActions';
import { StatCard, StatCardGrid } from '../components/shared/StatCard';
import { EditedChip, StatusBadge } from '../components/shared/StatusBadge';
import { Button } from '../components/ui/Button';
import {
  calculateMonthlyExpensesAnalysis,
  roundMoney,
} from '../domain/engine';
import type {
  CompanySettings,
  Expense,
  PaymentMethod,
} from '../domain/types';
import { useAuth } from '../features/auth/AuthContext';
import { NewExpenseDialog } from '../features/expenses/NewExpenseDialog';
import {
  buildExpensesPrintMeta,
  exportExpensesToCsv,
  formatExpenseCategory,
  formatMonthDisplay,
} from '../features/expenses/expenseHelpers';
import {
  formatDate,
  formatMoney,
  getTodayKarachiIsoDate,
} from '../lib/format';
import { notify } from '../lib/notify';
import {
  ExpenseService,
  SettingsService,
  type ExpenseCategoryOption,
} from '../services';

function formatPaymentMethod(method?: PaymentMethod): string {
  switch (method) {
    case 'bank':
      return 'Bank transfer';
    case 'online':
      return 'Online';
    case 'cheque':
      return 'Cheque';
    case 'cash':
    default:
      return 'Cash';
  }
}

export const ExpensesPage: React.FC = () => {
  const { session } = useAuth();
  const companyId = session?.companyId || '';

  const [selectedMonth, setSelectedMonth] = useState<string>(() =>
    getTodayKarachiIsoDate().slice(0, 7)
  );
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategoryOption[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters: search, category, date range
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Dialogs & Drawer
  const [newExpenseOpen, setNewExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [drawerExpense, setDrawerExpense] = useState<Expense | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [cancellingExpense, setCancellingExpense] = useState<Expense | null>(
    null
  );
  const [cancelLoading, setCancelLoading] = useState(false);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [highlightedExpenseId, setHighlightedExpenseId] = useState<
    string | null
  >(null);

  const loadData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [expList, catList, companySettings] = await Promise.all([
        ExpenseService.listExpenses(companyId),
        ExpenseService.listCategories(companyId),
        SettingsService.getSettings(companyId),
      ]);
      setExpenses(expList);
      setCategories(catList);
      setSettings(companySettings);

      if (expList.length > 0) {
        const currentMonthHasData = expList.some(
          (e) => e.date.slice(0, 7) === selectedMonth
        );
        if (!currentMonthHasData) {
          setSelectedMonth(expList[0].date.slice(0, 7));
        }
      }
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : 'Failed to load expenses.'
      );
    } finally {
      setLoading(false);
    }
  }, [companyId, selectedMonth]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const reloadCategories = useCallback(async () => {
    if (!companyId) return;
    const catList = await ExpenseService.listCategories(companyId);
    setCategories(catList);
  }, [companyId]);

  const categoryLabelsMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of categories) {
      map[c.value] = c.label;
    }
    return map;
  }, [categories]);

  // Pure domain engine analysis for the selected month
  const monthlyAnalysis = useMemo(() => {
    return calculateMonthlyExpensesAnalysis({
      expenses,
      month: selectedMonth,
      categoryLabels: categoryLabelsMap,
    });
  }, [expenses, selectedMonth, categoryLabelsMap]);

  // Filtered expenses for the selected month
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (e.date.slice(0, 7) !== selectedMonth) {
        return false;
      }
      if (categoryFilter && e.category !== categoryFilter) {
        return false;
      }
      const eDate = e.date.slice(0, 10);
      if (dateFrom && eDate < dateFrom) {
        return false;
      }
      if (dateTo && eDate > dateTo) {
        return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const catLabel = formatExpenseCategory(
          e.category,
          categoryLabelsMap
        ).toLowerCase();
        const matches =
          e.docNumber.toLowerCase().includes(q) ||
          catLabel.includes(q) ||
          (e.paidTo && e.paidTo.toLowerCase().includes(q)) ||
          (e.notes && e.notes.toLowerCase().includes(q)) ||
          (e.description && e.description.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [
    expenses,
    selectedMonth,
    categoryFilter,
    dateFrom,
    dateTo,
    search,
    categoryLabelsMap,
  ]);

  const activeFilterChips = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = [];
    if (categoryFilter) {
      chips.push({
        key: 'category',
        label: `Category: ${formatExpenseCategory(categoryFilter, categoryLabelsMap)}`,
        onRemove: () => setCategoryFilter(''),
      });
    }
    if (dateFrom) {
      chips.push({
        key: 'dateFrom',
        label: `From: ${formatDate(dateFrom)}`,
        onRemove: () => setDateFrom(''),
      });
    }
    if (dateTo) {
      chips.push({
        key: 'dateTo',
        label: `To: ${formatDate(dateTo)}`,
        onRemove: () => setDateTo(''),
      });
    }
    return chips;
  }, [categoryFilter, dateFrom, dateTo, categoryLabelsMap]);

  const handleResetFilters = () => {
    setSearch('');
    setCategoryFilter('');
    setDateFrom('');
    setDateTo('');
  };

  const handleConfirmCancelExpense = async (reason: string) => {
    if (!cancellingExpense || !reason) return;
    setCancelLoading(true);
    try {
      await ExpenseService.cancelExpense(
        companyId,
        cancellingExpense.id,
        reason
      );
      notify.success(`Cancelled ${cancellingExpense.docNumber}.`);
      const cancelledId = cancellingExpense.id;
      setCancellingExpense(null);
      await loadData();
      if (drawerExpense?.id === cancelledId) {
        setDrawerExpense(null);
      }
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : 'Could not cancel expense.'
      );
    } finally {
      setCancelLoading(false);
    }
  };

  const handleConfirmDeleteExpense = async () => {
    if (!deletingExpense) return;
    setDeleteLoading(true);
    try {
      await ExpenseService.deleteExpense(companyId, deletingExpense.id);
      notify.success(`Deleted ${deletingExpense.docNumber}.`);
      const deletedId = deletingExpense.id;
      setDeletingExpense(null);
      await loadData();
      if (drawerExpense?.id === deletedId) {
        setDrawerExpense(null);
      }
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : 'Could not delete expense.'
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  const { printDocument, isPrinting } = usePrintDocument();

  const renderExpenseActions = (r: Expense) => (
    <RowActions
      rowLabel={r.docNumber}
      onView={() => setDrawerExpense(r)}
      onEdit={
        r.status === 'active'
          ? () => {
              setEditingExpense(r);
              setNewExpenseOpen(true);
            }
          : undefined
      }
      editDisabled={
        r.status === 'cancelled' ? 'Cannot edit a cancelled expense' : false
      }
      onPrint={() => void printDocument(printMeta, companyId)}
      onDownloadPdf={() => void downloadDocumentPdf(printMeta, companyId)}
      onCancel={() => setCancellingExpense(r)}
      cancelDisabled={r.status === 'cancelled' ? 'Already cancelled' : false}
      onDelete={() => setDeletingExpense(r)}
    />
  );

  const chartData = useMemo(() => {
    return monthlyAnalysis.categoryBreakdown.map((item) => ({
      label: item.label,
      category: item.category,
      amount: item.amount.toNumber(),
      percent: item.percent.toNumber(),
    }));
  }, [monthlyAnalysis.categoryBreakdown]);

  const vsLastMonthText = useMemo(() => {
    if (monthlyAnalysis.vsLastMonthPercent === null) {
      return 'No prior month';
    }
    const val = monthlyAnalysis.vsLastMonthPercent.toNumber();
    const sign = val > 0 ? '+' : '';
    return `${sign}${val.toFixed(1)}%`;
  }, [monthlyAnalysis.vsLastMonthPercent]);

  const topCategoryText = useMemo(() => {
    if (!monthlyAnalysis.topCategory) return '—';
    return `${monthlyAnalysis.topCategory.label} (${formatMoney(monthlyAnalysis.topCategory.amount)})`;
  }, [monthlyAnalysis.topCategory]);

  const printMeta = useMemo(
    () =>
      buildExpensesPrintMeta(
        filteredExpenses,
        selectedMonth,
        settings,
        categoryLabelsMap
      ),
    [filteredExpenses, selectedMonth, settings, categoryLabelsMap]
  );

  return (
    <div className="space-y-5 min-w-0">
      <PageHeader
        title="Expenses"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <FilterMonthPill
              value={selectedMonth}
              onChange={setSelectedMonth}
              ariaLabel="Select expenses month"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                exportExpensesToCsv(
                  filteredExpenses,
                  selectedMonth,
                  categoryLabelsMap
                )
              }
            >
              <Download className="h-4 w-4" />
              <span>Export CSV</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isPrinting}
              onClick={() => void printDocument(printMeta, companyId)}
            >
              <Printer className="h-4 w-4" />
              <span>Print</span>
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                setEditingExpense(null);
                setNewExpenseOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              <span>New expense</span>
            </Button>
          </div>
        }
      />

      {loading ? (
        <SectionLoader cards={3} rows={5} />
      ) : (
        <>
          {/* 3 Summary Cards: Month total, Vs last month in percent, Top category */}
          <StatCardGrid>
            <StatCard
              label={`Month total (${formatMonthDisplay(selectedMonth)})`}
              value={formatMoney(monthlyAnalysis.monthTotal)}
              numericValue={monthlyAnalysis.monthTotal.toNumber()}
              formatter={(v) => formatMoney(v)}
            />
            <StatCard
              label="Vs last month"
              value={vsLastMonthText}
            />
            <StatCard
              label="Top category"
              value={topCategoryText}
            />
          </StatCardGrid>

          {/* Expenses by category donut chart */}
          {chartData.length > 0 && (
            <ExpensesCategoryDonutChart
              title={`Expenses by category — ${formatMonthDisplay(selectedMonth)}`}
              subtitle={`Total: ${formatMoney(monthlyAnalysis.monthTotal)}`}
              data={chartData}
              totalAmount={monthlyAnalysis.monthTotal.toNumber()}
              activeCategoryFilter={categoryFilter}
              onSelectCategory={(cat) =>
                setCategoryFilter((prev) => (prev === cat ? '' : cat))
              }
            />
          )}

          {/* FilterBar (search, category, date range) */}
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search expense #, category, paid to or notes..."
            activeChips={activeFilterChips}
            onClearAll={handleResetFilters}
            controls={[
              {
                key: 'category',
                label: 'Category',
                node: (
                  <FilterSelectPill
                    label="Category"
                    value={categoryFilter}
                    onChange={setCategoryFilter}
                    placeholder="All categories"
                    options={[
                      { value: '', label: 'All categories' },
                      ...categories.map((c) => ({
                        value: c.value,
                        label: c.label,
                      })),
                    ]}
                  />
                ),
              },
              {
                key: 'dateRange',
                label: 'Dates',
                node: (
                  <FilterDateRangePill
                    label="Date range"
                    fromDate={dateFrom}
                    toDate={dateTo}
                    onChangeFrom={setDateFrom}
                    onChangeTo={setDateTo}
                  />
                ),
              },
            ]}
          />

          <DataTable<Expense>
            tableId="expenses"
            data={filteredExpenses}
            keyExtractor={(r) => r.id}
            highlightedRowId={highlightedExpenseId}
            onRowClick={(r) => setDrawerExpense(r)}
            mobileCardTitle={(r) =>
              `${r.docNumber} · ${formatExpenseCategory(r.category, categoryLabelsMap)}`
            }
            mobileCardRight={(r) => formatMoney(r.amount)}
            renderExpanded={(r) => (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
                  <div>
                    <div className="text-[var(--text-muted)]">Category</div>
                    <div className="font-semibold text-[var(--text)] mt-0.5">
                      {formatExpenseCategory(r.category, categoryLabelsMap)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)]">Paid to</div>
                    <div className="font-semibold text-[var(--text)] mt-0.5">
                      {r.paidTo || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)]">Method</div>
                    <div className="font-semibold text-[var(--text)] mt-0.5">
                      {formatPaymentMethod(r.method)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)]">Amount</div>
                    <div className="font-semibold text-[var(--brand)] mt-0.5 tabular-nums">
                      {formatMoney(r.amount)}
                    </div>
                  </div>
                </div>
                {(r.notes || r.description) && (
                  <div className="text-xs text-[var(--text-muted)]">
                    <span className="font-semibold text-[var(--text)]">
                      Notes:{' '}
                    </span>
                    {r.notes || r.description}
                  </div>
                )}
              </div>
            )}
            mobileCardActions={(r) => renderExpenseActions(r)}
            columns={[
              {
                key: 'docNumber',
                header: 'Number',
                hideable: false,
                render: (r) => (
                  <div className="inline-flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-[var(--brand)] tabular-nums">
                      {r.docNumber}
                    </span>
                    {r.editedAt && <EditedChip />}
                  </div>
                ),
              },
              {
                key: 'date',
                header: 'Date',
                render: (r) => (
                  <span className="text-[var(--text)] tabular-nums">
                    {formatDate(r.date)}
                  </span>
                ),
              },
              {
                key: 'category',
                header: 'Category',
                render: (r) => (
                  <span className="font-medium text-[var(--text)]">
                    {formatExpenseCategory(r.category, categoryLabelsMap)}
                  </span>
                ),
              },
              {
                key: 'paidTo',
                header: 'Paid to',
                render: (r) => (
                  <span className="text-[var(--text)]">{r.paidTo || '—'}</span>
                ),
              },
              {
                key: 'method',
                header: 'Method',
                render: (r) => (
                  <span className="text-[var(--text-muted)] text-xs">
                    {formatPaymentMethod(r.method)}
                  </span>
                ),
              },
              {
                key: 'amount',
                header: 'Amount',
                align: 'right',
                render: (r) => (
                  <span className="font-heading font-semibold text-[var(--text)] tabular-nums">
                    {formatMoney(r.amount)}
                  </span>
                ),
              },
              {
                key: 'notes',
                header: 'Notes',
                render: (r) => (
                  <span className="text-xs text-[var(--text-muted)] line-clamp-1 max-w-[200px]">
                    {r.notes || r.description || '—'}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (r) => <StatusBadge status={r.status} />,
              },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                hideable: false,
                hideOnMobileCard: true,
                render: (r) => renderExpenseActions(r),
              },
            ]}
            emptyState={
              <EmptyState
                message={
                  search.trim() || activeFilterChips.length > 0
                    ? 'No expenses match your filters in this month.'
                    : `No expenses recorded in ${formatMonthDisplay(selectedMonth)}.`
                }
                actionLabel={
                  search.trim() || activeFilterChips.length > 0
                    ? undefined
                    : 'New expense'
                }
                onAction={
                  search.trim() || activeFilterChips.length > 0
                    ? undefined
                    : () => {
                        setEditingExpense(null);
                        setNewExpenseOpen(true);
                      }
                }
              />
            }
          />
        </>
      )}

      {/* Detail Drawer (D5.3) */}
      <DetailDrawer
        open={Boolean(drawerExpense)}
        onClose={() => setDrawerExpense(null)}
        docNumber={drawerExpense?.docNumber || ''}
        subtitle={
          drawerExpense
            ? `${formatExpenseCategory(drawerExpense.category, categoryLabelsMap)} · ${formatDate(drawerExpense.date)}`
            : undefined
        }
        status={drawerExpense?.status}
        editedAt={drawerExpense?.editedAt}
        createdAt={drawerExpense?.createdAt}
        cancelledAt={drawerExpense?.cancelledAt}
        cancelReason={drawerExpense?.cancelReason}
        sections={
          drawerExpense
            ? [
                {
                  title: 'Expense details',
                  fields: [
                    { label: 'Number', value: drawerExpense.docNumber },
                    { label: 'Date', value: formatDate(drawerExpense.date) },
                    {
                      label: 'Category',
                      value: formatExpenseCategory(
                        drawerExpense.category,
                        categoryLabelsMap
                      ),
                    },
                    {
                      label: 'Paid to',
                      value: drawerExpense.paidTo || '—',
                    },
                    ...(drawerExpense.invoiceNumber
                      ? [{ label: 'Invoice #', value: drawerExpense.invoiceNumber, mono: true }]
                      : []),
                    {
                      label: 'Payment method',
                      value: formatPaymentMethod(drawerExpense.method),
                    },
                    {
                      label: 'Amount',
                      value: formatMoney(drawerExpense.amount),
                      highlight: true,
                    },
                  ],
                },
                ...(drawerExpense.notes || drawerExpense.description
                  ? [
                      {
                        title: 'Notes',
                        fields: [
                          {
                            label: 'Notes',
                            value:
                              drawerExpense.notes || drawerExpense.description,
                            fullWidth: true,
                          },
                        ],
                      },
                    ]
                  : []),
              ]
            : []
        }
        onEdit={
          drawerExpense?.status === 'active'
            ? () => {
                const target = drawerExpense;
                setDrawerExpense(null);
                setEditingExpense(target);
                setNewExpenseOpen(true);
              }
            : undefined
        }
        editDisabled={
          drawerExpense?.status === 'cancelled'
            ? 'Cannot edit a cancelled expense'
            : false
        }
        onPrint={() => {
          setDrawerExpense(null);
          void printDocument(printMeta, companyId);
        }}
        onDownloadPdf={() => {
          setDrawerExpense(null);
          void downloadDocumentPdf(printMeta, companyId);
        }}
        onCancel={
          drawerExpense ? () => setCancellingExpense(drawerExpense) : undefined
        }
        cancelDisabled={
          drawerExpense?.status === 'cancelled' ? 'Already cancelled' : false
        }
        onDelete={
          drawerExpense ? () => setDeletingExpense(drawerExpense) : undefined
        }
      />

      {/* New / Edit Expense Dialog */}
      <NewExpenseDialog
        open={newExpenseOpen}
        onClose={() => {
          setNewExpenseOpen(false);
          setEditingExpense(null);
        }}
        companyId={companyId}
        categories={categories}
        onCategoriesChanged={reloadCategories}
        editingExpense={editingExpense}
        onSaved={async (saved) => {
          const expMonth = saved.date.slice(0, 7);
          setSelectedMonth(expMonth);
          await loadData();
          setHighlightedExpenseId(saved.id);
          if (drawerExpense?.id === saved.id) {
            setDrawerExpense(saved);
          }
          window.setTimeout(() => setHighlightedExpenseId(null), 2200);
        }}
      />

      {/* Print / PDF Expenses Report Dialog */}
      <Dialog
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        title={`Expenses — ${formatMonthDisplay(selectedMonth)}`}
        maxWidth="lg"
        footer={
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPrintOpen(false)}
          >
            Close
          </Button>
        }
      >
        <PrintLayout doc={printMeta} companyId={companyId}>
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-[6px] border border-[var(--border)]">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[var(--surface-subtle)] border-b border-[var(--brand)]">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--brand)]">
                      Number
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--brand)]">
                      Date
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--brand)]">
                      Category
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--brand)]">
                      Paid to
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--brand)]">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filteredExpenses.map((e) => (
                    <tr key={e.id}>
                      <td className="px-3 py-2 text-xs font-semibold text-[var(--brand)] tabular-nums">
                        {e.docNumber}
                      </td>
                      <td className="px-3 py-2 text-xs text-[var(--text)] tabular-nums">
                        {formatDate(e.date)}
                      </td>
                      <td className="px-3 py-2 text-xs text-[var(--text)]">
                        {formatExpenseCategory(e.category, categoryLabelsMap)}
                      </td>
                      <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                        {e.paidTo || '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-semibold text-[var(--text)] tabular-nums">
                        {formatMoney(e.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-2 text-sm">
                <span className="text-[var(--text-muted)] mr-3">Total active expenses:</span>
                <span className="font-heading font-bold text-[var(--brand)] tabular-nums">
                  {formatMoney(
                    filteredExpenses
                      .filter((e) => e.status === 'active')
                      .reduce((acc, e) => acc.plus(roundMoney(e.amount)), roundMoney(0))
                  )}
                </span>
              </div>
            </div>
          </div>
        </PrintLayout>
      </Dialog>

      {/* Cancel Expense Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(cancellingExpense)}
        onClose={() => setCancellingExpense(null)}
        onConfirm={handleConfirmCancelExpense}
        title={
          cancellingExpense
            ? `Cancel ${cancellingExpense.docNumber}?`
            : 'Cancel expense?'
        }
        description="Cancelling this expense keeps the record as cancelled and removes its amount from the monthly total and net profit calculation."
        confirmLabel="Cancel expense"
        requireReason={true}
        reasonLabel="Reason for cancellation"
        loading={cancelLoading}
      />

      {/* Delete Expense Confirmation Dialog */}
      <DeleteConfirmDialog
        open={Boolean(deletingExpense)}
        onClose={() => setDeletingExpense(null)}
        onConfirm={handleConfirmDeleteExpense}
        recordLabel={
          deletingExpense
            ? `expense ${deletingExpense.docNumber}`
            : 'expense'
        }
        loading={deleteLoading}
      />
    </div>
  );
};
