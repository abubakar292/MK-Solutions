import Decimal from 'decimal.js';
import { ReceiptText } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SectionLoader } from '../components/loader/SectionLoader';
import {
  downloadDocumentPdf,
  usePrintDocument,
} from '../components/print/PrintLayout';
import { DataTable } from '../components/shared/DataTable';
import { DeleteConfirmDialog } from '../components/shared/DeleteConfirmDialog';
import { DetailDrawer } from '../components/shared/DetailDrawer';
import { ConfirmDialog, Dialog } from '../components/shared/Dialog';
import { EmptyState } from '../components/shared/EmptyState';
import {
  FilterBar,
  FilterDateRangePill,
  FilterSelectPill,
  type FilterChip,
} from '../components/shared/FilterBar';
import {
  DatePicker,
  MoneyInput,
  TextArea,
  TextInput,
  TonInput,
} from '../components/shared/Inputs';
import { MoreDetailsSection } from '../components/shared/MoreDetailsSection';
import { PageHeader } from '../components/shared/PageHeader';
import { RowActions } from '../components/shared/RowActions';
import { EditedChip, StatusBadge } from '../components/shared/StatusBadge';
import { Button } from '../components/ui/Button';
import {
  calculateCustomerLedgerAndAllocations,
  roundMoney,
  type AllocatedBillSummary,
} from '../domain/engine';
import type {
  Bill,
  BillPaymentStatus,
  CompanySettings,
  Customer,
  CustomerPayment,
} from '../domain/types';
import { useAuth } from '../features/auth/AuthContext';
import { BillDetailDialog } from '../features/bills/BillDetailDialog';
import { buildBillPrintMeta } from '../features/dispatch/dispatchHelpers';
import {
  formatDate,
  formatMoney,
  formatTon,
  getTodayKarachiIsoDate,
} from '../lib/format';
import { triggerInvalidShake } from '../lib/motion';
import { notify } from '../lib/notify';
import {
  CustomerService,
  InvoiceService,
  SettingsService,
} from '../services';

function parseSafeDecimal(val: string): Decimal {
  const cleaned = (val || '').replace(/,/g, '').trim();
  if (!cleaned) return new Decimal(0);
  try {
    const d = new Decimal(cleaned);
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

function calculateAgeInDays(dateIso: string, todayIso: string): number {
  const dStr = dateIso.slice(0, 10);
  const start = new Date(`${dStr}T00:00:00Z`).getTime();
  const end = new Date(`${todayIso}T00:00:00Z`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86400000));
}

export const BillsPage: React.FC = () => {
  const { session } = useAuth();
  const companyId = session?.companyId || '';
  const { printDocument } = usePrintDocument();

  const [bills, setBills] = useState<Bill[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters: search, customer, date range, payment status
  const [search, setSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all');

  // Dialogs & Drawer
  const [drawerBill, setDrawerBill] = useState<Bill | null>(null);
  const [printingBill, setPrintingBill] = useState<Bill | null>(null);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [cancellingBill, setCancellingBill] = useState<Bill | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [deletingBill, setDeletingBill] = useState<Bill | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [highlightedBillId, setHighlightedBillId] = useState<string | null>(
    null
  );

  // Edit bill form state
  const [editDate, setEditDate] = useState('');
  const [editTons, setEditTons] = useState('');
  const [editRate, setEditRate] = useState('');
  const [editDiscount, setEditDiscount] = useState('');
  const [editWeightSlipNumber, setEditWeightSlipNumber] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const editFormRef = useRef<HTMLFormElement>(null);

  const todayIso = useMemo(() => getTodayKarachiIsoDate(), []);

  const loadData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [billList, customerList, paymentList, companySettings] =
        await Promise.all([
          InvoiceService.listBills(companyId),
          CustomerService.listCustomers(companyId),
          CustomerService.listPayments(companyId),
          SettingsService.getSettings(companyId),
        ]);
      setBills(billList);
      setCustomers(customerList);
      setPayments(paymentList);
      setSettings(companySettings);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to load bills.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Compute FIFO payment allocations per customer so every active bill has exact paid, balance, and paymentStatus
  const billAllocationsMap = useMemo(() => {
    const map = new Map<
      string,
      {
        paidAmount: string;
        remainingAmount: string;
        paymentStatus: BillPaymentStatus;
      }
    >();

    const customerIds = new Set<string>();
    for (const c of customers) customerIds.add(c.id);
    for (const b of bills) customerIds.add(b.customerId);

    for (const custId of customerIds) {
      const cust = customers.find((c) => c.id === custId);
      const custBills = bills.filter((b) => b.customerId === custId);
      const custPayments = payments.filter((p) => p.customerId === custId);

      const ledger = calculateCustomerLedgerAndAllocations({
        openingBalance: cust?.openingBalance ?? '0',
        bills: custBills.map((b) => ({
          id: b.id,
          docNumber: b.docNumber,
          date: b.date,
          totalAmount: b.totalAmount,
          status: b.status,
        })),
        payments: custPayments.map((p) => ({
          id: p.id,
          date: p.date,
          amount: p.amount,
          status: p.status,
        })),
      });

      for (const alloc of ledger.billAllocations as AllocatedBillSummary[]) {
        map.set(alloc.billId, {
          paidAmount: alloc.paidAmount.toString(),
          remainingAmount: alloc.remainingAmount.toString(),
          paymentStatus: alloc.paymentStatus,
        });
      }
    }

    return map;
  }, [bills, customers, payments]);

  const getBillAllocation = useCallback(
    (bill: Bill) => {
      if (bill.status === 'cancelled') {
        return {
          paidAmount: '0',
          remainingAmount: '0',
          paymentStatus: 'unpaid' as BillPaymentStatus,
        };
      }
      return (
        billAllocationsMap.get(bill.id) || {
          paidAmount: '0',
          remainingAmount: bill.totalAmount,
          paymentStatus: 'unpaid' as BillPaymentStatus,
        }
      );
    },
    [billAllocationsMap]
  );

  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      const alloc = getBillAllocation(b);
      if (paymentStatusFilter !== 'all') {
        if (paymentStatusFilter === 'cancelled') {
          if (b.status !== 'cancelled') return false;
        } else {
          if (b.status === 'cancelled') return false;
          if (alloc.paymentStatus !== paymentStatusFilter) return false;
        }
      }
      if (customerFilter && b.customerId !== customerFilter) {
        return false;
      }
      const bDate = b.date.slice(0, 10);
      if (dateFrom && bDate < dateFrom) {
        return false;
      }
      if (dateTo && bDate > dateTo) {
        return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matches =
          b.docNumber.toLowerCase().includes(q) ||
          b.customerName.toLowerCase().includes(q) ||
          b.vehicleNumber.toLowerCase().includes(q) ||
          b.dispatchDocNumber.toLowerCase().includes(q) ||
          (b.notes && b.notes.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [
    bills,
    getBillAllocation,
    paymentStatusFilter,
    customerFilter,
    dateFrom,
    dateTo,
    search,
  ]);

  const activeFilterChips = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = [];
    if (paymentStatusFilter !== 'all') {
      const statusLabels: Record<string, string> = {
        unpaid: 'Unpaid',
        partial: 'Partial',
        paid: 'Paid',
        cancelled: 'Cancelled',
      };
      chips.push({
        key: 'paymentStatus',
        label: `Status: ${statusLabels[paymentStatusFilter] || paymentStatusFilter}`,
        onRemove: () => setPaymentStatusFilter('all'),
      });
    }
    if (customerFilter) {
      const cust = customers.find((c) => c.id === customerFilter);
      if (cust) {
        chips.push({
          key: 'customer',
          label: `Customer: ${cust.name}`,
          onRemove: () => setCustomerFilter(''),
        });
      }
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
  }, [paymentStatusFilter, customerFilter, dateFrom, dateTo, customers]);

  const handleResetFilters = () => {
    setSearch('');
    setCustomerFilter('');
    setDateFrom('');
    setDateTo('');
    setPaymentStatusFilter('all');
  };

  const openEditBill = (bill: Bill) => {
    setEditingBill(bill);
    setEditDate(bill.date.slice(0, 10));
    setEditTons(bill.receivedWeightTons);
    setEditRate(bill.ratePerTon);
    setEditDiscount(
      new Decimal(bill.discount || '0').gt(0) ? bill.discount : ''
    );
    setEditWeightSlipNumber(bill.weightSlipNumber || '');
    setEditRemarks(bill.remarks || '');
    setEditNotes(bill.notes || '');
    setEditError(null);
  };

  const editPreview = useMemo(() => {
    const t = parseSafeDecimal(editTons);
    const r = parseSafeDecimal(editRate);
    const d = parseSafeDecimal(editDiscount);
    const subtotal = roundMoney(t.mul(r));
    const totalAmount = Decimal.max(0, roundMoney(subtotal.sub(d)));
    return {
      subtotal: subtotal.toString(),
      totalAmount: totalAmount.toString(),
    };
  }, [editTons, editRate, editDiscount]);

  const handleSaveEditBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBill) return;
    setEditError(null);

    if (!editDate) {
      setEditError('Select the bill date.');
      triggerInvalidShake(editFormRef.current);
      return;
    }

    const tonsDec = parseSafeDecimal(editTons);
    if (tonsDec.lte(0)) {
      setEditError('Enter received tons greater than 0.');
      triggerInvalidShake(editFormRef.current);
      return;
    }

    const rateDec = parseSafeDecimal(editRate);
    if (rateDec.lte(0)) {
      setEditError('Enter rate per ton greater than 0.');
      triggerInvalidShake(editFormRef.current);
      return;
    }

    const discountDec = parseSafeDecimal(editDiscount);
    if (discountDec.lt(0)) {
      setEditError('Discount cannot be negative.');
      triggerInvalidShake(editFormRef.current);
      return;
    }

    setEditSaving(true);
    try {
      const updated = await InvoiceService.updateBill(
        companyId,
        editingBill.id,
        {
          date: editDate,
          receivedWeightTons: tonsDec.toString(),
          ratePerTon: rateDec.toString(),
          discount: discountDec.toString(),
          weightSlipNumber: editWeightSlipNumber.trim() || undefined,
          remarks: editRemarks.trim() || undefined,
          notes: editNotes.trim() || undefined,
        }
      );
      notify.success(`Updated ${updated.docNumber}.`);
      setEditingBill(null);
      await loadData();
      setHighlightedBillId(updated.id);
      if (drawerBill?.id === updated.id) {
        setDrawerBill(updated);
      }
      window.setTimeout(() => setHighlightedBillId(null), 2200);
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : 'Could not update bill.'
      );
      triggerInvalidShake(editFormRef.current);
    } finally {
      setEditSaving(false);
    }
  };

  const handleConfirmCancelBill = async (reason: string) => {
    if (!cancellingBill || !reason) return;
    setCancelLoading(true);
    try {
      await InvoiceService.cancelBill(companyId, cancellingBill.id, reason);
      notify.success(
        `Cancelled ${cancellingBill.docNumber}. Dispatch ${cancellingBill.dispatchDocNumber} returned to Sent.`
      );
      const cancelledId = cancellingBill.id;
      setCancellingBill(null);
      await loadData();
      if (drawerBill?.id === cancelledId) {
        setDrawerBill(null);
      }
      if (printingBill?.id === cancelledId) {
        setPrintingBill(null);
      }
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : 'Could not cancel bill.'
      );
    } finally {
      setCancelLoading(false);
    }
  };

  const handleConfirmDeleteBill = async () => {
    if (!deletingBill) return;
    setDeleteLoading(true);
    try {
      await InvoiceService.deleteBill(companyId, deletingBill.id);
      notify.success(`Deleted ${deletingBill.docNumber}.`);
      const deletedId = deletingBill.id;
      setDeletingBill(null);
      await loadData();
      if (drawerBill?.id === deletedId) {
        setDrawerBill(null);
      }
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : 'Could not delete bill.'
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  const renderBillActions = (r: Bill) => (
    <RowActions
      rowLabel={r.docNumber}
      onView={() => setDrawerBill(r)}
      onEdit={r.status === 'active' ? () => openEditBill(r) : undefined}
      editDisabled={
        r.status === 'cancelled' ? 'Cannot edit a cancelled bill' : false
      }
      onPrint={() =>
        void printDocument(
          buildBillPrintMeta(r, settings, getBillAllocation(r)),
          companyId
        )
      }
      onDownloadPdf={() =>
        void downloadDocumentPdf(
          buildBillPrintMeta(r, settings, getBillAllocation(r)),
          companyId
        )
      }
      onCancel={() => setCancellingBill(r)}
      cancelDisabled={r.status === 'cancelled' ? 'Already cancelled' : false}
      onDelete={() => setDeletingBill(r)}
      deleteDisabled={r.status !== 'cancelled' ? 'Cancel it first' : false}
    />
  );

  const drawerAlloc = useMemo(() => {
    if (!drawerBill) return null;
    return getBillAllocation(drawerBill);
  }, [drawerBill, getBillAllocation]);

  return (
    <div className="space-y-5 min-w-0">
      <PageHeader title="Bills" />

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search bill #, customer, vehicle or dispatch #..."
        activeChips={activeFilterChips}
        onClearAll={handleResetFilters}
        controls={[
          {
            key: 'customer',
            label: 'Customer',
            node: (
              <FilterSelectPill
                label="Customer"
                value={customerFilter}
                onChange={setCustomerFilter}
                placeholder="All customers"
                options={[
                  { value: '', label: 'All customers' },
                  ...customers.map((c) => ({
                    value: c.id,
                    label: c.name,
                  })),
                ]}
              />
            ),
          },
          {
            key: 'paymentStatus',
            label: 'Payment status',
            node: (
              <FilterSelectPill
                label="Payment status"
                value={paymentStatusFilter}
                onChange={setPaymentStatusFilter}
                placeholder="All statuses"
                options={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'unpaid', label: 'Unpaid' },
                  { value: 'partial', label: 'Partial' },
                  { value: 'paid', label: 'Paid' },
                  { value: 'cancelled', label: 'Cancelled' },
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

      {loading ? (
        <SectionLoader cards={0} rows={5} />
      ) : (
        <DataTable<Bill>
          tableId="bills"
          data={filteredBills}
          keyExtractor={(r) => r.id}
          highlightedRowId={highlightedBillId}
          onRowClick={(r) => setDrawerBill(r)}
          mobileCardTitle={(r) => `${r.docNumber} · ${r.customerName}`}
          mobileCardRight={(r) => formatMoney(r.totalAmount)}
          renderExpanded={(r) => {
            const alloc = getBillAllocation(r);
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
                  <div>
                    <div className="text-[var(--text-muted)]">Dispatch #</div>
                    <div className="font-semibold text-[var(--text)] mt-0.5 tabular-nums">
                      {r.dispatchDocNumber} · {r.vehicleNumber}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)]">
                      Received × Rate
                    </div>
                    <div className="font-semibold text-[var(--text)] mt-0.5 tabular-nums">
                      {formatTon(r.receivedWeightTons)} ×{' '}
                      {formatMoney(r.ratePerTon)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)]">
                      Subtotal / Discount
                    </div>
                    <div className="font-semibold text-[var(--text)] mt-0.5 tabular-nums">
                      {formatMoney(r.subtotal)} · Disc{' '}
                      {formatMoney(r.discount)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)]">Total / Paid</div>
                    <div className="font-semibold text-[var(--text)] mt-0.5 tabular-nums">
                      {formatMoney(r.totalAmount)} · Paid{' '}
                      {formatMoney(alloc.paidAmount)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)]">Balance</div>
                    <div className="font-semibold text-[var(--brand)] mt-0.5 tabular-nums">
                      {formatMoney(alloc.remainingAmount)}
                    </div>
                  </div>
                </div>
                {r.notes && (
                  <div className="text-xs text-[var(--text-muted)]">
                    <span className="font-semibold text-[var(--text)]">
                      Notes:{' '}
                    </span>
                    {r.notes}
                  </div>
                )}
              </div>
            );
          }}
          mobileCardActions={(r) => renderBillActions(r)}
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
              key: 'customer',
              header: 'Customer',
              render: (r) => (
                <span className="font-medium text-[var(--text)]">
                  {r.customerName}
                </span>
              ),
            },
            {
              key: 'vehicle',
              header: 'Vehicle',
              render: (r) => (
                <span className="text-[var(--text)] font-mono text-xs">
                  {r.vehicleNumber}
                </span>
              ),
            },
            {
              key: 'dispatchNumber',
              header: 'Dispatch #',
              render: (r) => (
                <span className="text-[var(--text-muted)] tabular-nums text-xs">
                  {r.dispatchDocNumber}
                </span>
              ),
            },
            {
              key: 'receivedWeight',
              header: 'Received tons',
              align: 'right',
              render: (r) => (
                <span className="font-medium text-[var(--text)] tabular-nums">
                  {formatTon(r.receivedWeightTons)}
                </span>
              ),
            },
            {
              key: 'rate',
              header: 'Rate',
              align: 'right',
              render: (r) => (
                <span className="text-[var(--text)] tabular-nums">
                  {formatMoney(r.ratePerTon)}
                </span>
              ),
            },
            {
              key: 'discount',
              header: 'Discount',
              align: 'right',
              render: (r) => (
                <span className="text-[var(--text-muted)] tabular-nums">
                  {new Decimal(r.discount || '0').gt(0)
                    ? formatMoney(r.discount)
                    : '—'}
                </span>
              ),
            },
            {
              key: 'total',
              header: 'Total',
              align: 'right',
              render: (r) => (
                <span className="font-semibold text-[var(--text)] tabular-nums">
                  {formatMoney(r.totalAmount)}
                </span>
              ),
            },
            {
              key: 'paid',
              header: 'Paid',
              align: 'right',
              render: (r) => {
                const alloc = getBillAllocation(r);
                return (
                  <span className="text-[var(--text)] tabular-nums">
                    {formatMoney(alloc.paidAmount)}
                  </span>
                );
              },
            },
            {
              key: 'balance',
              header: 'Balance',
              align: 'right',
              render: (r) => {
                const alloc = getBillAllocation(r);
                return (
                  <span className="font-semibold text-[var(--text)] tabular-nums">
                    {formatMoney(alloc.remainingAmount)}
                  </span>
                );
              },
            },
            {
              key: 'status',
              header: 'Payment status',
              render: (r) => {
                const alloc = getBillAllocation(r);
                const badgeStatus =
                  r.status === 'cancelled' ? 'cancelled' : alloc.paymentStatus;
                return <StatusBadge status={badgeStatus} />;
              },
            },
            {
              key: 'age',
              header: 'Age',
              align: 'right',
              render: (r) => {
                if (r.status === 'cancelled') {
                  return <span className="text-[var(--text-muted)]">—</span>;
                }
                const days = calculateAgeInDays(r.date, todayIso);
                return (
                  <span className="text-[var(--text-muted)] tabular-nums text-xs">
                    {days}d
                  </span>
                );
              },
            },
            {
              key: 'actions',
              header: 'Actions',
              align: 'right',
              hideable: false,
              hideOnMobileCard: true,
              render: (r) => renderBillActions(r),
            },
          ]}
          emptyState={
            <EmptyState
              message={
                search.trim() || activeFilterChips.length > 0
                  ? 'No bills match your filters.'
                  : 'No bills created yet. Add received weight on a Sent dispatch to create a bill.'
              }
            />
          }
        />
      )}

      {/* Detail Drawer (D5.3) */}
      <DetailDrawer
        open={Boolean(drawerBill)}
        onClose={() => setDrawerBill(null)}
        docNumber={drawerBill?.docNumber || ''}
        subtitle={
          drawerBill
            ? `${drawerBill.customerName} · ${formatDate(drawerBill.date)}`
            : undefined
        }
        status={
          drawerBill
            ? drawerBill.status === 'cancelled'
              ? 'cancelled'
              : drawerAlloc?.paymentStatus || 'unpaid'
            : undefined
        }
        editedAt={drawerBill?.editedAt}
        createdAt={drawerBill?.createdAt}
        cancelledAt={drawerBill?.cancelledAt}
        cancelReason={drawerBill?.cancelReason}
        sections={
          drawerBill && drawerAlloc
            ? [
                {
                  title: 'Bill summary',
                  fields: [
                    { label: 'Bill number', value: drawerBill.docNumber },
                    { label: 'Date', value: formatDate(drawerBill.date) },
                    { label: 'Customer', value: drawerBill.customerName },
                    { label: 'Vehicle', value: drawerBill.vehicleNumber },
                    {
                      label: 'Dispatch number',
                      value: drawerBill.dispatchDocNumber,
                    },
                    ...(drawerBill.weightSlipNumber
                      ? [{ label: 'Weight slip #', value: drawerBill.weightSlipNumber, mono: true }]
                      : []),
                    {
                      label: 'Age in days',
                      value:
                        drawerBill.status === 'cancelled'
                          ? '—'
                          : `${calculateAgeInDays(drawerBill.date, todayIso)} days`,
                    },
                  ],
                },
                {
                  title: 'Calculation & payment',
                  fields: [
                    {
                      label: 'Received tons',
                      value: formatTon(drawerBill.receivedWeightTons),
                      highlight: true,
                    },
                    {
                      label: 'Rate per ton',
                      value: formatMoney(drawerBill.ratePerTon),
                    },
                    {
                      label: 'Subtotal',
                      value: formatMoney(drawerBill.subtotal),
                    },
                    {
                      label: 'Discount',
                      value: formatMoney(drawerBill.discount),
                    },
                    {
                      label: 'Total amount',
                      value: formatMoney(drawerBill.totalAmount),
                      highlight: true,
                    },
                    {
                      label: 'Paid',
                      value: formatMoney(drawerAlloc.paidAmount),
                    },
                    {
                      label: 'Balance',
                      value: formatMoney(drawerAlloc.remainingAmount),
                      highlight: true,
                    },
                  ],
                },
                ...(drawerBill.remarks || drawerBill.notes
                  ? [
                      {
                        title: 'Notes & remarks',
                        fields: [
                          ...(drawerBill.remarks
                            ? [
                                {
                                  label: 'Remarks',
                                  value: drawerBill.remarks,
                                  fullWidth: true,
                                },
                              ]
                            : []),
                          ...(drawerBill.notes
                            ? [
                                {
                                  label: 'Notes',
                                  value: drawerBill.notes,
                                  fullWidth: true,
                                },
                              ]
                            : []),
                        ],
                      },
                    ]
                  : []),
              ]
            : []
        }
        onEdit={
          drawerBill?.status === 'active'
            ? () => {
                const target = drawerBill;
                setDrawerBill(null);
                openEditBill(target);
              }
            : undefined
        }
        editDisabled={
          drawerBill?.status === 'cancelled'
            ? 'Cannot edit a cancelled bill'
            : false
        }
        onPrint={
          drawerBill
            ? () => {
                const target = drawerBill;
                setDrawerBill(null);
                void printDocument(
                  buildBillPrintMeta(
                    target,
                    settings,
                    getBillAllocation(target)
                  ),
                  companyId
                );
              }
            : undefined
        }
        onDownloadPdf={
          drawerBill
            ? () => {
                const target = drawerBill;
                setDrawerBill(null);
                void downloadDocumentPdf(
                  buildBillPrintMeta(
                    target,
                    settings,
                    getBillAllocation(target)
                  ),
                  companyId
                );
              }
            : undefined
        }
        onCancel={
          drawerBill ? () => setCancellingBill(drawerBill) : undefined
        }
        cancelDisabled={
          drawerBill?.status === 'cancelled' ? 'Already cancelled' : false
        }
        onDelete={
          drawerBill ? () => setDeletingBill(drawerBill) : undefined
        }
        deleteDisabled={
          drawerBill && drawerBill.status !== 'cancelled'
            ? 'Cancel it first'
            : false
        }
      />

      {/* Edit Bill Dialog */}
      <Dialog
        open={Boolean(editingBill)}
        onClose={editSaving ? () => {} : () => setEditingBill(null)}
        icon={<ReceiptText className="h-4 w-4" />}
        title={
          editingBill ? `Edit bill ${editingBill.docNumber}` : 'Edit bill'
        }
        maxWidth="lg"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditingBill(null)}
              disabled={editSaving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="edit-bill-form"
              variant="primary"
              loading={editSaving}
            >
              Save changes
            </Button>
          </>
        }
      >
        <form
          id="edit-bill-form"
          ref={editFormRef}
          onSubmit={handleSaveEditBill}
          className="space-y-4"
          noValidate
        >
          {editError && (
            <div
              role="alert"
              className="rounded-[6px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-xs font-medium text-[var(--danger)]"
            >
              {editError}
            </div>
          )}

          {editingBill && (
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5 text-xs text-[var(--text-muted)] flex flex-wrap items-center justify-between gap-2">
              <span>
                Customer:{' '}
                <strong className="text-[var(--text)]">
                  {editingBill.customerName}
                </strong>
              </span>
              <span>
                Dispatch:{' '}
                <strong className="text-[var(--text)]">
                  {editingBill.dispatchDocNumber} · {editingBill.vehicleNumber}
                </strong>
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DatePicker
              label="Bill date"
              value={editDate}
              onChange={(e) => {
                setEditDate(e.target.value);
                setEditError(null);
              }}
            />
            <TonInput
              label="Received tons"
              placeholder="0.00"
              value={editTons}
              onChange={(e) => {
                setEditTons(e.target.value);
                setEditError(null);
              }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MoneyInput
              label="Rate per ton"
              placeholder="0"
              value={editRate}
              onChange={(e) => {
                setEditRate(e.target.value);
                setEditError(null);
              }}
            />
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] p-3.5 flex items-center justify-between text-xs sm:mt-6">
              <div className="text-[var(--text-muted)]">
                Subtotal: {formatMoney(editPreview.subtotal)}
              </div>
              <div className="font-semibold text-[var(--brand)] text-sm tabular-nums">
                Total: {formatMoney(editPreview.totalAmount)}
              </div>
            </div>
          </div>

          {/* More details (Weight slip #, Discount, Remarks, Notes) */}
          <MoreDetailsSection title="More details">
            <TextInput
              label="Weight slip / reference #"
              placeholder="e.g. SLIP-8841"
              value={editWeightSlipNumber}
              onChange={(e) => setEditWeightSlipNumber(e.target.value)}
            />
            <MoneyInput
              label="Discount"
              placeholder="0"
              value={editDiscount}
              onChange={(e) => {
                setEditDiscount(e.target.value);
                setEditError(null);
              }}
            />
            <TextInput
              label="Remarks"
              placeholder="e.g. Buyer weight scale deduction"
              value={editRemarks}
              onChange={(e) => setEditRemarks(e.target.value)}
            />
            <TextInput
              label="Notes"
              placeholder="Optional bill notes"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
            />
          </MoreDetailsSection>
        </form>
      </Dialog>

      {/* Bill Detail Dialog (A10 layout + Print + Download PDF) */}
      <BillDetailDialog
        bill={printingBill}
        allocation={printingBill ? getBillAllocation(printingBill) : undefined}
        settings={settings}
        companyId={companyId}
        open={Boolean(printingBill)}
        onClose={() => setPrintingBill(null)}
        onRequestCancel={(b) => setCancellingBill(b)}
      />

      {/* Cancel Bill Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(cancellingBill)}
        onClose={() => setCancellingBill(null)}
        onConfirm={handleConfirmCancelBill}
        title={
          cancellingBill
            ? `Cancel ${cancellingBill.docNumber}?`
            : 'Cancel bill?'
        }
        description={
          cancellingBill
            ? `Cancelling this bill marks ${cancellingBill.docNumber} as cancelled, updates ${cancellingBill.customerName}'s balance, and returns dispatch ${cancellingBill.dispatchDocNumber} to Sent.`
            : 'Cancelling this bill returns its dispatch to Sent and updates the customer balance.'
        }
        confirmLabel="Cancel bill"
        requireReason={true}
        reasonLabel="Reason for cancellation"
        loading={cancelLoading}
      />

      {/* Delete Bill Confirmation Dialog */}
      <DeleteConfirmDialog
        open={Boolean(deletingBill)}
        onClose={() => setDeletingBill(null)}
        onConfirm={handleConfirmDeleteBill}
        recordLabel={
          deletingBill ? `bill ${deletingBill.docNumber}` : 'bill'
        }
        loading={deleteLoading}
      />
    </div>
  );
};
