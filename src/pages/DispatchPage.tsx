import Decimal from 'decimal.js';
import { Plus } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SectionLoader } from '../components/loader/SectionLoader';
import {
  downloadDocumentPdf,
  usePrintDocument,
} from '../components/print/PrintLayout';
import { DataTable } from '../components/shared/DataTable';
import { DeleteConfirmDialog } from '../components/shared/DeleteConfirmDialog';
import { DetailDrawer } from '../components/shared/DetailDrawer';
import { ConfirmDialog } from '../components/shared/Dialog';
import { EmptyState } from '../components/shared/EmptyState';
import {
  FilterBar,
  FilterDateRangePill,
  FilterSelectPill,
  type FilterChip,
} from '../components/shared/FilterBar';
import { PageHeader } from '../components/shared/PageHeader';
import { RowActions } from '../components/shared/RowActions';
import { StatCard, StatCardGrid } from '../components/shared/StatCard';
import { EditedChip, StatusBadge } from '../components/shared/StatusBadge';
import { Button } from '../components/ui/Button';
import type {
  Bill,
  CompanySettings,
  Customer,
  Dispatch,
} from '../domain/types';
import { useAuth } from '../features/auth/AuthContext';
import { BillDetailDialog } from '../features/bills/BillDetailDialog';
import { DispatchDetailDialog } from '../features/dispatch/DispatchDetailDialog';
import { EditDispatchDialog } from '../features/dispatch/EditDispatchDialog';
import { NewDispatchDialog } from '../features/dispatch/NewDispatchDialog';
import { ReceiveWeightBillDialog } from '../features/dispatch/ReceiveWeightBillDialog';
import {
  buildBillPrintMeta,
  buildDispatchPrintMeta,
  getDispatchDisplayStatus,
} from '../features/dispatch/dispatchHelpers';
import {
  formatBags,
  formatDate,
  formatDateTime,
  formatMoney,
  formatTon,
  getTodayKarachiIsoDate,
} from '../lib/format';
import { notify } from '../lib/notify';
import {
  CustomerService,
  DispatchService,
  InvoiceService,
  ReportService,
  SettingsService,
} from '../services';

function calculateDaysWaiting(dateTimeIso: string, todayIso: string): number {
  const dStr = dateTimeIso.slice(0, 10);
  const start = new Date(`${dStr}T00:00:00Z`).getTime();
  const end = new Date(`${todayIso}T00:00:00Z`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86400000));
}

export const DispatchPage: React.FC = () => {
  const { session } = useAuth();
  const companyId = session?.companyId || '';
  const { printDocument } = usePrintDocument();

  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [finalStockTons, setFinalStockTons] = useState<Decimal>(new Decimal(0));
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters: search, customer, vehicle, date range, status
  const [search, setSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Dialogs
  const [newDispatchOpen, setNewDispatchOpen] = useState(false);
  const [receivingDispatch, setReceivingDispatch] = useState<Dispatch | null>(
    null
  );
  const [editingDispatch, setEditingDispatch] = useState<Dispatch | null>(null);
  const [drawerDispatch, setDrawerDispatch] = useState<Dispatch | null>(null);
  const [printingDispatch, setPrintingDispatch] = useState<Dispatch | null>(
    null
  );
  const [viewingBill, setViewingBill] = useState<Bill | null>(null);
  const [cancellingDispatch, setCancellingDispatch] =
    useState<Dispatch | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [deletingDispatch, setDeletingDispatch] = useState<Dispatch | null>(
    null
  );
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [highlightedDispatchId, setHighlightedDispatchId] = useState<
    string | null
  >(null);

  const todayIso = useMemo(() => getTodayKarachiIsoDate(), []);

  const loadData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [
        dispatchList,
        billList,
        customerList,
        stockSnapshot,
        companySettings,
      ] = await Promise.all([
        DispatchService.listDispatches(companyId),
        InvoiceService.listBills(companyId),
        CustomerService.listCustomers(companyId),
        ReportService.getStockSnapshot(companyId),
        SettingsService.getSettings(companyId),
      ]);
      setDispatches(dispatchList);
      setBills(billList);
      setCustomers(customerList);
      setFinalStockTons(stockSnapshot.finalProduct.quantity);
      setSettings(companySettings);
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : 'Failed to load dispatches.'
      );
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const reloadCustomers = useCallback(async () => {
    if (!companyId) return;
    const customerList = await CustomerService.listCustomers(companyId);
    setCustomers(customerList);
  }, [companyId]);

  const billsMap = useMemo(() => {
    const map = new Map<string, Bill>();
    for (const b of bills) {
      map.set(b.id, b);
    }
    return map;
  }, [bills]);

  // Vehicles on the way = Sent dispatches (waiting for weight)
  const waitingDispatches = useMemo(() => {
    return dispatches.filter(
      (d) => getDispatchDisplayStatus(d, billsMap) === 'sent'
    );
  }, [dispatches, billsMap]);

  // Summary strip statistics per 2.3:
  // Powder in stock (ton), Vehicles on the way, Sold this month (ton)
  const currentMonthStr = useMemo(() => todayIso.slice(0, 7), [todayIso]);

  const soldThisMonthTons = useMemo(() => {
    let sum = new Decimal(0);
    for (const d of dispatches) {
      if (d.status === 'active' && d.billId && d.receivedWeightTons) {
        const saleDate = (d.saleDate || d.dateTime).slice(0, 7);
        if (saleDate === currentMonthStr) {
          sum = sum.plus(new Decimal(d.receivedWeightTons));
        }
      }
    }
    return sum;
  }, [dispatches, currentMonthStr]);

  const filteredDispatches = useMemo(() => {
    return dispatches.filter((d) => {
      const displayStatus = getDispatchDisplayStatus(d, billsMap);
      if (statusFilter !== 'all' && displayStatus !== statusFilter) {
        return false;
      }
      if (customerFilter && d.customerId !== customerFilter) {
        return false;
      }
      if (vehicleFilter.trim()) {
        const vq = vehicleFilter.trim().toLowerCase();
        if (!d.vehicleNumber.toLowerCase().includes(vq)) {
          return false;
        }
      }
      const dDate = d.dateTime.slice(0, 10);
      if (dateFrom && dDate < dateFrom) {
        return false;
      }
      if (dateTo && dDate > dateTo) {
        return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matches =
          d.docNumber.toLowerCase().includes(q) ||
          d.customerName.toLowerCase().includes(q) ||
          d.vehicleNumber.toLowerCase().includes(q) ||
          (d.driverName && d.driverName.toLowerCase().includes(q)) ||
          (d.billDocNumber && d.billDocNumber.toLowerCase().includes(q)) ||
          (d.notes && d.notes.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [
    dispatches,
    billsMap,
    statusFilter,
    customerFilter,
    vehicleFilter,
    dateFrom,
    dateTo,
    search,
  ]);

  const activeFilterChips = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = [];
    if (statusFilter !== 'all') {
      const labelMap: Record<string, string> = {
        sent: 'Waiting for weight (Sent)',
        sold: 'Sold',
        cancelled: 'Cancelled',
      };
      chips.push({
        key: 'status',
        label: `Status: ${labelMap[statusFilter] || statusFilter}`,
        onRemove: () => setStatusFilter('all'),
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
    if (vehicleFilter.trim()) {
      chips.push({
        key: 'vehicle',
        label: `Vehicle: ${vehicleFilter.trim().toUpperCase()}`,
        onRemove: () => setVehicleFilter(''),
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
  }, [statusFilter, customerFilter, vehicleFilter, dateFrom, dateTo, customers]);

  const handleResetFilters = () => {
    setSearch('');
    setCustomerFilter('');
    setVehicleFilter('');
    setDateFrom('');
    setDateTo('');
    setStatusFilter('all');
  };

  const handleConfirmCancelDispatch = async (reason: string) => {
    if (!cancellingDispatch || !reason) return;
    setCancelLoading(true);
    try {
      await DispatchService.cancelDispatch(
        companyId,
        cancellingDispatch.id,
        reason
      );
      notify.success(`Cancelled ${cancellingDispatch.docNumber}.`);
      const cancelledId = cancellingDispatch.id;
      setCancellingDispatch(null);
      await loadData();
      if (drawerDispatch?.id === cancelledId) {
        setDrawerDispatch(null);
      }
      if (printingDispatch?.id === cancelledId) {
        setPrintingDispatch(null);
      }
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : 'Could not cancel dispatch.'
      );
    } finally {
      setCancelLoading(false);
    }
  };

  const handleConfirmDeleteDispatch = async () => {
    if (!deletingDispatch) return;
    setDeleteLoading(true);
    try {
      await DispatchService.deleteDispatch(companyId, deletingDispatch.id);
      notify.success(`Deleted ${deletingDispatch.docNumber}.`);
      const deletedId = deletingDispatch.id;
      setDeletingDispatch(null);
      await loadData();
      if (drawerDispatch?.id === deletedId) {
        setDrawerDispatch(null);
      }
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : 'Could not delete dispatch.'
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleBillCreated = async (bill: Bill, printImmediately = false) => {
    await loadData();
    if (printImmediately) {
      setViewingBill(bill);
      void printDocument(buildBillPrintMeta(bill, settings), companyId);
    }
  };

  const renderDispatchActions = (r: Dispatch) => {
    const st = getDispatchDisplayStatus(r, billsMap);
    const canDelete = r.status === 'cancelled' || !r.billId;
    return (
      <RowActions
        rowLabel={r.docNumber}
        primaryAction={
          st === 'sent'
            ? {
                label: 'Receive weight',
                onClick: () => setReceivingDispatch(r),
              }
            : undefined
        }
        onView={() => setDrawerDispatch(r)}
        onEdit={
          r.status === 'active' ? () => setEditingDispatch(r) : undefined
        }
        editDisabled={
          r.status === 'cancelled' ? 'Cannot edit a cancelled dispatch' : false
        }
        onPrint={() => {
          const statusLabel =
            st === 'sold' ? 'Sold' : st === 'cancelled' ? 'Cancelled' : 'Sent';
          void printDocument(
            buildDispatchPrintMeta(r, settings, statusLabel),
            companyId
          );
        }}
        onDownloadPdf={() => {
          const statusLabel =
            st === 'sold' ? 'Sold' : st === 'cancelled' ? 'Cancelled' : 'Sent';
          void downloadDocumentPdf(
            buildDispatchPrintMeta(r, settings, statusLabel),
            companyId
          );
        }}
        onCancel={() => setCancellingDispatch(r)}
        cancelDisabled={
          r.status === 'cancelled'
            ? 'Already cancelled'
            : st === 'sold'
              ? 'Cancel bill first'
              : false
        }
        onDelete={() => setDeletingDispatch(r)}
        deleteDisabled={!canDelete ? 'Cancel bill first' : false}
      />
    );
  };

  const drawerBill = useMemo(() => {
    if (!drawerDispatch?.billId) return null;
    return billsMap.get(drawerDispatch.billId) || null;
  }, [drawerDispatch, billsMap]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dispatch"
        action={
          <Button
            type="button"
            variant="primary"
            onClick={() => setNewDispatchOpen(true)}
          >
            <Plus className="h-4 w-4" />
            <span>New dispatch</span>
          </Button>
        }
      />

      {/* Summary Strip per 2.3: Powder in stock (ton), Vehicles on the way, Sold this month (ton) */}
      <StatCardGrid>
        <StatCard
          label="Powder in stock"
          value={formatTon(finalStockTons)}
        />
        <StatCard
          label="Vehicles on the way"
          value={String(waitingDispatches.length)}
        />
        <StatCard
          label="Sold this month"
          value={formatTon(soldThisMonthTons)}
        />
      </StatCardGrid>

      {/* FilterBar */}
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search dispatch #, customer, vehicle..."
        activeChips={activeFilterChips}
        onClearAll={handleResetFilters}
        controls={[
          {
            key: 'status',
            label: 'Status',
            node: (
              <FilterSelectPill
                label="Status"
                value={statusFilter}
                onChange={setStatusFilter}
                placeholder="All statuses"
                options={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'sent', label: 'Waiting for weight (Sent)' },
                  { value: 'sold', label: 'Sold' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]}
              />
            ),
          },
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
            key: 'vehicle',
            label: 'Vehicle',
            node: (
              <FilterSelectPill
                label="Vehicle"
                value={vehicleFilter}
                onChange={setVehicleFilter}
                placeholder="All vehicles"
                options={[
                  { value: '', label: 'All vehicles' },
                  ...Array.from(
                    new Set(
                      dispatches
                        .map((d) => d.vehicleNumber.trim().toUpperCase())
                        .filter(Boolean)
                    )
                  )
                    .sort()
                    .map((v) => ({ value: v, label: v })),
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
        <DataTable<Dispatch>
          tableId="dispatches"
          data={filteredDispatches}
          keyExtractor={(r) => r.id}
          highlightedRowId={highlightedDispatchId}
          onRowClick={(r) => setDrawerDispatch(r)}
          mobileCardTitle={(r) => `${r.docNumber} · ${r.customerName}`}
          mobileCardRight={(r) => {
            const st = getDispatchDisplayStatus(r, billsMap);
            return (
              <span className="font-semibold tabular-nums text-xs">
                {st === 'sold' && r.receivedWeightTons
                  ? formatTon(r.receivedWeightTons)
                  : r.vehicleNumber}
              </span>
            );
          }}
          renderExpanded={(r) => {
            const st = getDispatchDisplayStatus(r, billsMap);
            const bill = r.billId ? billsMap.get(r.billId) : undefined;
            const daysWait =
              st === 'sent' ? calculateDaysWaiting(r.dateTime, todayIso) : 0;
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
                  <div>
                    <div className="text-[var(--text-muted)]">Customer</div>
                    <div className="font-semibold text-[var(--text)] mt-0.5">
                      {r.customerName}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)]">
                      Vehicle & driver
                    </div>
                    <div className="font-semibold text-[var(--text)] mt-0.5">
                      {r.vehicleNumber}
                      {r.driverName ? ` · ${r.driverName}` : ''}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)]">Bags loaded</div>
                    <div className="font-semibold text-[var(--text)] mt-0.5 tabular-nums">
                      {r.bagsCount && r.bagsCount > 0
                        ? formatBags(r.bagsCount)
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)]">
                      {st === 'sold' ? 'Sale bill' : 'Status'}
                    </div>
                    <div className="font-semibold text-[var(--text)] mt-0.5">
                      {st === 'sold' && bill ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingBill(bill);
                          }}
                          className="text-[var(--brand)] hover:underline cursor-pointer"
                        >
                          {bill.docNumber} · {formatMoney(bill.totalAmount)}
                        </button>
                      ) : st === 'sent' ? (
                        <span className="text-[var(--brand)]">
                          Waiting for weight ({daysWait === 0 ? 'today' : `${daysWait}d waiting`})
                        </span>
                      ) : (
                        'Cancelled'
                      )}
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
          mobileCardActions={(r) => renderDispatchActions(r)}
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
              key: 'dateTime',
              header: 'Date & time',
              render: (r) => (
                <span className="text-[var(--text)] tabular-nums text-xs">
                  {formatDateTime(r.dateTime)}
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
              key: 'driver',
              header: 'Driver',
              render: (r) => (
                <span className="text-[var(--text-muted)] text-xs">
                  {r.driverName || '—'}
                </span>
              ),
            },
            {
              key: 'bags',
              header: 'Bags',
              align: 'right',
              render: (r) => (
                <span className="text-[var(--text-muted)] tabular-nums">
                  {r.bagsCount && r.bagsCount > 0
                    ? formatBags(r.bagsCount)
                    : '—'}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (r) => {
                const st = getDispatchDisplayStatus(r, billsMap);
                const label =
                  st === 'sold'
                    ? 'Sold'
                    : st === 'cancelled'
                      ? 'Cancelled'
                      : 'Sent';
                const daysWait =
                  st === 'sent' ? calculateDaysWaiting(r.dateTime, todayIso) : 0;
                return (
                  <div className="inline-flex items-center gap-1.5 flex-wrap">
                    <StatusBadge status={st} label={label} />
                    {st === 'sent' && (
                      <span className="inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)] tabular-nums">
                        {daysWait === 0
                          ? '0d waiting'
                          : `${daysWait}d waiting`}
                      </span>
                    )}
                  </div>
                );
              },
            },
            {
              key: 'receivedWeight',
              header: 'Received tons',
              align: 'right',
              render: (r) => {
                const st = getDispatchDisplayStatus(r, billsMap);
                if (st === 'sold' && r.receivedWeightTons) {
                  return (
                    <span className="font-semibold text-[var(--text)] tabular-nums">
                      {formatTon(r.receivedWeightTons)}
                    </span>
                  );
                }
                return <span className="text-[var(--text-muted)]">—</span>;
              },
            },
            {
              key: 'rate',
              header: 'Rate',
              align: 'right',
              render: (r) => {
                const st = getDispatchDisplayStatus(r, billsMap);
                const bill = r.billId ? billsMap.get(r.billId) : undefined;
                if (st === 'sold' && bill) {
                  return (
                    <span className="text-[var(--text)] tabular-nums">
                      {formatMoney(bill.ratePerTon)}
                    </span>
                  );
                }
                return <span className="text-[var(--text-muted)]">—</span>;
              },
            },
            {
              key: 'amount',
              header: 'Amount',
              align: 'right',
              render: (r) => {
                const st = getDispatchDisplayStatus(r, billsMap);
                const bill = r.billId ? billsMap.get(r.billId) : undefined;
                if (st === 'sold' && bill) {
                  return (
                    <span className="font-semibold text-[var(--text)] tabular-nums">
                      {formatMoney(bill.totalAmount)}
                    </span>
                  );
                }
                return <span className="text-[var(--text-muted)]">—</span>;
              },
            },
            {
              key: 'bill',
              header: 'Bill #',
              render: (r) => {
                const st = getDispatchDisplayStatus(r, billsMap);
                if (st === 'sold' && r.billId) {
                  const bill = billsMap.get(r.billId);
                  const docNum =
                    bill?.docNumber || r.billDocNumber || 'View bill';
                  return (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (bill) setViewingBill(bill);
                      }}
                      className="font-semibold text-[var(--brand)] hover:underline cursor-pointer tabular-nums"
                    >
                      {docNum}
                    </button>
                  );
                }
                return <span className="text-[var(--text-muted)]">—</span>;
              },
            },
            {
              key: 'actions',
              header: 'Actions',
              align: 'right',
              hideable: false,
              hideOnMobileCard: true,
              render: (r) => renderDispatchActions(r),
            },
          ]}
          emptyState={
            <EmptyState
              message={
                search ||
                statusFilter !== 'all' ||
                customerFilter ||
                vehicleFilter ||
                dateFrom ||
                dateTo
                  ? 'No dispatches match the current filters.'
                  : 'No dispatches recorded yet.'
              }
              actionLabel={
                !search &&
                statusFilter === 'all' &&
                !customerFilter &&
                !vehicleFilter &&
                !dateFrom &&
                !dateTo
                  ? 'Create first dispatch'
                  : undefined
              }
              onAction={
                !search &&
                statusFilter === 'all' &&
                !customerFilter &&
                !vehicleFilter &&
                !dateFrom &&
                !dateTo
                  ? () => setNewDispatchOpen(true)
                  : undefined
              }
            />
          }
        />
      )}

      {/* New Dispatch Dialog */}
      <NewDispatchDialog
        open={newDispatchOpen}
        onClose={() => setNewDispatchOpen(false)}
        companyId={companyId}
        customers={customers}
        currentFinalStockTons={finalStockTons}
        vehiclesOnTheWayCount={waitingDispatches.length}
        onSaved={async (created) => {
          setHighlightedDispatchId(created.id);
          await loadData();
        }}
        onCustomersChanged={reloadCustomers}
      />

      {/* Edit Dispatch Dialog */}
      <EditDispatchDialog
        open={Boolean(editingDispatch)}
        onClose={() => setEditingDispatch(null)}
        companyId={companyId}
        dispatch={editingDispatch}
        customers={customers}
        onSaved={async (updated) => {
          setHighlightedDispatchId(updated.id);
          await loadData();
          if (drawerDispatch?.id === updated.id) {
            setDrawerDispatch(updated);
          }
        }}
      />

      {/* Add Weight and Rate Dialog (Creates Bill and records Sale) */}
      <ReceiveWeightBillDialog
        open={Boolean(receivingDispatch)}
        onClose={() => setReceivingDispatch(null)}
        companyId={companyId}
        dispatch={receivingDispatch}
        customers={customers}
        currentFinalStockTons={finalStockTons}
        onBillCreated={handleBillCreated}
      />

      {/* Detail Drawer (D5.3) */}
      <DetailDrawer
        open={Boolean(drawerDispatch)}
        onClose={() => setDrawerDispatch(null)}
        docNumber={drawerDispatch?.docNumber || ''}
        subtitle={
          drawerDispatch
            ? `${drawerDispatch.customerName} · ${formatDateTime(drawerDispatch.dateTime)}`
            : undefined
        }
        status={
          drawerDispatch
            ? getDispatchDisplayStatus(drawerDispatch, billsMap)
            : undefined
        }
        statusLabel={
          drawerDispatch
            ? getDispatchDisplayStatus(drawerDispatch, billsMap) === 'sold'
              ? 'Sold'
              : getDispatchDisplayStatus(drawerDispatch, billsMap) ===
                  'cancelled'
                ? 'Cancelled'
                : 'Sent'
            : undefined
        }
        editedAt={drawerDispatch?.editedAt}
        createdAt={drawerDispatch?.createdAt}
        cancelledAt={drawerDispatch?.cancelledAt}
        cancelReason={drawerDispatch?.cancelReason}
        sections={
          drawerDispatch
            ? [
                {
                  title: 'Dispatch details',
                  fields: [
                    { label: 'Dispatch number', value: drawerDispatch.docNumber },
                    {
                      label: 'Date and time',
                      value: formatDateTime(drawerDispatch.dateTime),
                    },
                    { label: 'Customer', value: drawerDispatch.customerName },
                    { label: 'Vehicle', value: drawerDispatch.vehicleNumber },
                    {
                      label: 'Driver',
                      value: drawerDispatch.driverName || '—',
                    },
                    ...(drawerDispatch.driverPhone
                      ? [{ label: 'Driver phone', value: drawerDispatch.driverPhone }]
                      : []),
                    ...(drawerDispatch.destinationCity
                      ? [{ label: 'Destination city', value: drawerDispatch.destinationCity }]
                      : []),
                    {
                      label: 'Bags',
                      value:
                        drawerDispatch.bagsCount &&
                        drawerDispatch.bagsCount > 0
                          ? formatBags(drawerDispatch.bagsCount)
                          : '—',
                    },
                  ],
                },
                ...(drawerBill
                  ? [
                      {
                        title: 'Sale & billing',
                        fields: [
                          { label: 'Bill number', value: drawerBill.docNumber },
                          {
                            label: 'Sale date',
                            value: formatDate(drawerBill.date),
                          },
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
                            label: 'Discount',
                            value: formatMoney(drawerBill.discount),
                          },
                          {
                            label: 'Total bill amount',
                            value: formatMoney(drawerBill.totalAmount),
                            highlight: true,
                          },
                        ],
                      },
                    ]
                  : []),
                ...(drawerDispatch.notes
                  ? [
                      {
                        title: 'Notes',
                        fields: [
                          {
                            label: 'Notes',
                            value: drawerDispatch.notes,
                            fullWidth: true,
                          },
                        ],
                      },
                    ]
                  : []),
              ]
            : []
        }
        relatedLinks={
          drawerBill
            ? [
                {
                  label: `Bill ${drawerBill.docNumber}`,
                  sublabel: `${formatTon(drawerBill.receivedWeightTons)} · ${formatMoney(drawerBill.totalAmount)}`,
                  onClick: () => {
                    const b = drawerBill;
                    setDrawerDispatch(null);
                    setViewingBill(b);
                  },
                },
              ]
            : undefined
        }
        primaryAction={
          drawerDispatch &&
          getDispatchDisplayStatus(drawerDispatch, billsMap) === 'sent'
            ? {
                label: 'Receive weight',
                onClick: () => {
                  const target = drawerDispatch;
                  setDrawerDispatch(null);
                  setReceivingDispatch(target);
                },
              }
            : undefined
        }
        onEdit={
          drawerDispatch?.status === 'active'
            ? () => {
                const target = drawerDispatch;
                setDrawerDispatch(null);
                setEditingDispatch(target);
              }
            : undefined
        }
        editDisabled={
          drawerDispatch?.status === 'cancelled'
            ? 'Cannot edit a cancelled dispatch'
            : false
        }
        onPrint={
          drawerDispatch
            ? () => {
                const target = drawerDispatch;
                const st = getDispatchDisplayStatus(target, billsMap);
                const statusLabel =
                  st === 'sold'
                    ? 'Sold'
                    : st === 'cancelled'
                      ? 'Cancelled'
                      : 'Sent';
                setDrawerDispatch(null);
                void printDocument(
                  buildDispatchPrintMeta(target, settings, statusLabel),
                  companyId
                );
              }
            : undefined
        }
        onDownloadPdf={
          drawerDispatch
            ? () => {
                const target = drawerDispatch;
                const st = getDispatchDisplayStatus(target, billsMap);
                const statusLabel =
                  st === 'sold'
                    ? 'Sold'
                    : st === 'cancelled'
                      ? 'Cancelled'
                      : 'Sent';
                setDrawerDispatch(null);
                void downloadDocumentPdf(
                  buildDispatchPrintMeta(target, settings, statusLabel),
                  companyId
                );
              }
            : undefined
        }
        onCancel={
          drawerDispatch
            ? () => setCancellingDispatch(drawerDispatch)
            : undefined
        }
        cancelDisabled={
          drawerDispatch?.status === 'cancelled'
            ? 'Already cancelled'
            : drawerDispatch &&
                getDispatchDisplayStatus(drawerDispatch, billsMap) === 'sold'
              ? 'Cancel bill first'
              : false
        }
        onDelete={
          drawerDispatch
            ? () => setDeletingDispatch(drawerDispatch)
            : undefined
        }
        deleteDisabled={
          drawerDispatch &&
          drawerDispatch.status !== 'cancelled' &&
          Boolean(drawerDispatch.billId)
            ? 'Cancel bill first'
            : false
        }
      />

      {/* Dispatch Print / PDF Dialog */}
      <DispatchDetailDialog
        open={Boolean(printingDispatch)}
        onClose={() => setPrintingDispatch(null)}
        dispatch={printingDispatch}
        displayStatus={
          printingDispatch
            ? getDispatchDisplayStatus(printingDispatch, billsMap)
            : 'sent'
        }
        settings={settings}
        companyId={companyId}
        onAddReceivedWeight={(d) => setReceivingDispatch(d)}
        onEditDispatch={(d) => setEditingDispatch(d)}
        onRequestCancel={(d) => setCancellingDispatch(d)}
        onViewBill={(billId) => {
          const b = billsMap.get(billId);
          if (b) setViewingBill(b);
        }}
      />

      {/* Bill Detail Dialog */}
      {viewingBill && (
        <BillDetailDialog
          open={Boolean(viewingBill)}
          onClose={() => setViewingBill(null)}
          bill={viewingBill}
          settings={settings}
          companyId={companyId}
          onRequestCancel={async () => {
            setViewingBill(null);
            await loadData();
          }}
        />
      )}

      {/* Cancel Dispatch Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(cancellingDispatch)}
        onClose={() => setCancellingDispatch(null)}
        title="Cancel dispatch"
        description={
          cancellingDispatch
            ? `Are you sure you want to cancel dispatch ${cancellingDispatch.docNumber}?`
            : ''
        }
        confirmLabel="Cancel dispatch"
        requireReason={true}
        reasonLabel="Reason for cancelling this dispatch"
        loading={cancelLoading}
        variant="destructive"
        onConfirm={handleConfirmCancelDispatch}
      />

      {/* Delete Dispatch Confirm Dialog */}
      <DeleteConfirmDialog
        open={Boolean(deletingDispatch)}
        onClose={() => setDeletingDispatch(null)}
        onConfirm={handleConfirmDeleteDispatch}
        recordLabel={
          deletingDispatch
            ? `dispatch ${deletingDispatch.docNumber}`
            : 'dispatch'
        }
        loading={deleteLoading}
      />
    </div>
  );
};
