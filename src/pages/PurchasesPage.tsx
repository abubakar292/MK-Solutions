import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Plus } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { EditedChip, StatusBadge } from '../components/shared/StatusBadge';
import { Button } from '../components/ui/Button';
import type {
  CompanySettings,
  InventoryItem,
  Purchase,
  Supplier,
  SupplierPayment,
} from '../domain/types';
import { useAuth } from '../features/auth/AuthContext';
import { NewPurchaseDialog } from '../features/purchases/NewPurchaseDialog';
import { PurchaseVoucherDialog } from '../features/purchases/PurchaseVoucherDialog';
import { SuppliersTab } from '../features/purchases/SuppliersTab';
import {
  buildPurchaseVoucherPrintMeta,
  computePurchaseAllocationsMap,
  formatPurchaseItemsSummary,
  getPurchaseBalance,
  getPurchaseLines,
} from '../features/purchases/purchaseHelpers';
import { formatBags, formatDate, formatMoney, formatTon } from '../lib/format';
import { MOTION_DURATIONS, MOTION_EASING, prefersReducedMotion } from '../lib/motion';
import { notify } from '../lib/notify';
import { cn } from '../lib/utils';
import { PurchaseService, SettingsService } from '../services';

type ActiveTab = 'purchases' | 'suppliers';

export const PurchasesPage: React.FC = () => {
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const companyId = session?.companyId || '';

  const initialTab: ActiveTab = searchParams.get('tab') === 'suppliers' ? 'suppliers' : 'purchases';
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  const [loading, setLoading] = useState(true);
  const { printDocument } = usePrintDocument();

  useEffect(() => {
    if (searchParams.get('tab') === 'suppliers') {
      setActiveTab('suppliers');
    } else if (searchParams.get('tab') === 'purchases') {
      setActiveTab('purchases');
    }
  }, [searchParams]);

  const handleSelectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === 'purchases') {
      next.delete('tab');
    } else {
      next.set('tab', tab);
    }
    setSearchParams(next, { replace: true });
  };

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);

  // Filters for Purchases list
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Dialog & Drawer states
  const [newPurchaseOpen, setNewPurchaseOpen] = useState(false);
  const [defaultPurchaseSupplierId, setDefaultPurchaseSupplierId] = useState<
    string | undefined
  >(undefined);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [drawerPurchase, setDrawerPurchase] = useState<Purchase | null>(null);
  const [voucherPurchase, setVoucherPurchase] = useState<Purchase | null>(null);
  const [cancellingPurchase, setCancellingPurchase] = useState<Purchase | null>(null);
  const [cancellingLoading, setCancellingLoading] = useState(false);
  const [deletingPurchase, setDeletingPurchase] = useState<Purchase | null>(null);
  const [highlightedPurchaseId, setHighlightedPurchaseId] = useState<string | null>(
    null
  );

  // Suppliers tab dialogs & ledger selection
  const [newSupplierDialogOpen, setNewSupplierDialogOpen] = useState(false);
  const [paySupplierDialogOpen, setPaySupplierDialogOpen] = useState(false);
  const [selectedSupplierIdForLedger, setSelectedSupplierIdForLedger] = useState<
    string | null
  >(null);

  const tabsBarRef = useRef<HTMLDivElement>(null);
  const tabUnderlineRef = useRef<HTMLDivElement>(null);
  const tabContentRef = useRef<HTMLDivElement>(null);

  const loadAll = useCallback(async () => {
    if (!companyId) return;
    const [pList, sList, iList, spList, cfg] = await Promise.all([
      PurchaseService.listPurchases(companyId),
      PurchaseService.listSuppliers(companyId),
      PurchaseService.listItems(companyId),
      PurchaseService.listSupplierPayments(companyId),
      SettingsService.getSettings(companyId),
    ]);
    setPurchases(pList);
    setSuppliers(sList);
    setItems(iList);
    setSupplierPayments(spList);
    setSettings(cfg);
  }, [companyId]);

  useEffect(() => {
    setLoading(true);
    loadAll().finally(() => setLoading(false));
  }, [loadAll]);

  useGSAP(
    () => {
      const bar = tabsBarRef.current;
      const line = tabUnderlineRef.current;
      const content = tabContentRef.current;
      if (!bar || !line) return;

      const activeBtn = bar.querySelector<HTMLElement>(
        `[data-tab="${activeTab}"]`
      );
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

  const purchaseAllocationsMap = useMemo(
    () =>
      computePurchaseAllocationsMap({
        suppliers,
        purchases,
        supplierPayments,
      }),
    [suppliers, purchases, supplierPayments]
  );

  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      if (supplierFilter && p.supplierId !== supplierFilter) return false;
      const pDate = p.date.slice(0, 10);
      if (fromDate && pDate < fromDate) return false;
      if (toDate && pDate > toDate) return false;

      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const summary = formatPurchaseItemsSummary(p).toLowerCase();
        const matches =
          p.docNumber.toLowerCase().includes(q) ||
          p.supplierName.toLowerCase().includes(q) ||
          summary.includes(q) ||
          (p.vehicleNumber && p.vehicleNumber.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [purchases, supplierFilter, fromDate, toDate, search]);

  const activeFilterChips = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = [];
    if (supplierFilter) {
      const sup = suppliers.find((s) => s.id === supplierFilter);
      if (sup) {
        chips.push({
          key: 'supplier',
          label: `Supplier: ${sup.name}`,
          onRemove: () => setSupplierFilter(''),
        });
      }
    }
    if (fromDate) {
      chips.push({
        key: 'fromDate',
        label: `From: ${formatDate(fromDate)}`,
        onRemove: () => setFromDate(''),
      });
    }
    if (toDate) {
      chips.push({
        key: 'toDate',
        label: `To: ${formatDate(toDate)}`,
        onRemove: () => setToDate(''),
      });
    }
    return chips;
  }, [supplierFilter, fromDate, toDate, suppliers]);

  const handleCancelPurchase = async (reason: string) => {
    if (!cancellingPurchase || !companyId) return;
    setCancellingLoading(true);
    try {
      await PurchaseService.cancelPurchase(companyId, cancellingPurchase.id, reason);
      notify.success(`${cancellingPurchase.docNumber} cancelled`);
      setCancellingPurchase(null);
      setDrawerPurchase(null);
      await loadAll();
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : 'Could not cancel purchase.'
      );
    } finally {
      setCancellingLoading(false);
    }
  };

  const renderPurchaseExpanded = (p: Purchase) => {
    const lines = getPurchaseLines(p);
    return (
      <div className="space-y-2.5">
        <div className="overflow-x-auto rounded-[10px] border border-[var(--border)] bg-[var(--bg-surface)]">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                <th className="px-3 py-2 text-left font-semibold">Item</th>
                <th className="px-3 py-2 text-left font-semibold">Type</th>
                <th className="px-3 py-2 text-right font-semibold">Quantity</th>
                <th className="px-3 py-2 text-right font-semibold">Rate</th>
                <th className="px-3 py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                    {l.itemName}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">
                    {l.kind === 'rock' ? 'Rock' : 'Chemical'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-primary)]">
                    {l.kind === 'rock' ? formatTon(l.quantity) : formatBags(l.quantity)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">
                    {formatMoney(l.rate)} / {l.kind === 'rock' ? 'ton' : 'bag'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--text-primary)]">
                    {formatMoney(l.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {p.notes && (
          <div className="text-xs text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">Notes: </span>
            {p.notes}
          </div>
        )}
      </div>
    );
  };

  const drawerAlloc = drawerPurchase
    ? purchaseAllocationsMap.get(drawerPurchase.id)
    : undefined;

  return (
    <div className="space-y-5 min-w-0">
      <PageHeader
        title="Purchases"
        action={
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setEditingPurchase(null);
              setNewPurchaseOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            <span>New purchase</span>
          </Button>
        }
      />

      {/* Tabs: Purchases | Suppliers */}
      <div
        ref={tabsBarRef}
        role="tablist"
        aria-label="Purchases sections"
        className="relative flex items-center gap-6 border-b border-[var(--border)]"
      >
        <button
          type="button"
          role="tab"
          data-tab="purchases"
          aria-selected={activeTab === 'purchases'}
          onClick={() => handleSelectTab('purchases')}
          className={cn(
            'pb-3 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap',
            activeTab === 'purchases'
              ? 'text-[var(--brand)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          )}
        >
          Purchases
        </button>
        <button
          type="button"
          role="tab"
          data-tab="suppliers"
          aria-selected={activeTab === 'suppliers'}
          onClick={() => handleSelectTab('suppliers')}
          className={cn(
            'pb-3 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap',
            activeTab === 'suppliers'
              ? 'text-[var(--brand)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          )}
        >
          Suppliers
        </button>

        {/* Sliding underline */}
        <div
          ref={tabUnderlineRef}
          aria-hidden="true"
          className="absolute bottom-0 left-0 h-[2px] w-20 bg-[var(--brand)]"
        />
      </div>

      {loading ? (
        <SectionLoader cards={0} rows={5} />
      ) : (
        <div ref={tabContentRef} className="min-w-0">
          {activeTab === 'purchases' ? (
            <div className="space-y-4 min-w-0">
              <FilterBar
                searchValue={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search voucher, supplier, vehicle or item..."
                activeChips={activeFilterChips}
                onClearAll={() => {
                  setSupplierFilter('');
                  setFromDate('');
                  setToDate('');
                  setSearch('');
                }}
                controls={[
                  {
                    key: 'supplier',
                    label: 'Supplier',
                    node: (
                      <FilterSelectPill
                        label="Supplier"
                        value={supplierFilter}
                        onChange={setSupplierFilter}
                        placeholder="All suppliers"
                        options={[
                          { value: '', label: 'All suppliers' },
                          ...suppliers.map((s) => ({
                            value: s.id,
                            label: s.name,
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
                        fromDate={fromDate}
                        toDate={toDate}
                        onChangeFrom={setFromDate}
                        onChangeTo={setToDate}
                      />
                    ),
                  },
                ]}
              />

              <DataTable
                tableId="purchases"
                data={filteredPurchases}
                keyExtractor={(r) => r.id}
                highlightedRowId={highlightedPurchaseId}
                onRowClick={(r) => setDrawerPurchase(r)}
                renderExpanded={renderPurchaseExpanded}
                mobileCardTitle={(r) => `${r.docNumber} · ${r.supplierName}`}
                mobileCardRight={(r) => formatMoney(r.totalAmount)}
                mobileCardActions={(r) => (
                  <RowActions
                    onView={() => setDrawerPurchase(r)}
                    onEdit={() => {
                      setEditingPurchase(r);
                      setNewPurchaseOpen(true);
                    }}
                    editDisabled={r.status === 'cancelled'}
                    editDisabledReason="Cancelled"
                    onPrint={() =>
                      void printDocument(
                        buildPurchaseVoucherPrintMeta(r, settings),
                        companyId
                      )
                    }
                    onDownloadPdf={() =>
                      void downloadDocumentPdf(
                        buildPurchaseVoucherPrintMeta(r, settings),
                        companyId
                      )
                    }
                    onCancel={() => setCancellingPurchase(r)}
                    cancelDisabled={r.status === 'cancelled'}
                    cancelDisabledReason="Already cancelled"
                    onDelete={() => setDeletingPurchase(r)}
                    deleteDisabled={r.status !== 'cancelled'}
                    deleteDisabledReason={r.status !== 'cancelled' ? 'Cancel it first' : undefined}
                  />
                )}
                columns={[
                  {
                    key: 'docNumber',
                    header: 'Number',
                    noTruncate: true,
                    render: (r) => (
                      <div className="inline-flex items-center gap-1.5">
                        <span className="font-semibold text-[var(--text)] tabular-nums">
                          {r.docNumber}
                        </span>
                        {r.editedAt && <EditedChip />}
                      </div>
                    ),
                  },
                  {
                    key: 'date',
                    header: 'Date',
                    render: (r) => formatDate(r.date),
                  },
                  {
                    key: 'supplier',
                    header: 'Supplier',
                    render: (r) => (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSupplierIdForLedger(r.supplierId);
                          handleSelectTab('suppliers');
                        }}
                        className="font-medium text-[var(--brand)] hover:underline cursor-pointer text-left truncate max-w-[180px]"
                        title={`View ${r.supplierName} ledger`}
                      >
                        {r.supplierName}
                      </button>
                    ),
                  },
                  {
                    key: 'vehicle',
                    header: 'Vehicle',
                    render: (r) => (
                      <span className="text-xs font-medium text-[var(--text-secondary)] tabular-nums">
                        {r.vehicleNumber || '—'}
                      </span>
                    ),
                  },
                  {
                    key: 'items',
                    header: 'Items',
                    noTruncate: true,
                    render: (r) => {
                      const lines = getPurchaseLines(r);
                      if (lines.length === 0) return '—';
                      return (
                        <div className="flex flex-wrap items-center gap-1 max-w-[280px]">
                          {lines.map((l) => (
                            <span
                              key={l.id}
                              className="inline-flex items-center gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-primary)] whitespace-nowrap"
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
                    render: (r) => (
                      <span className="font-semibold tabular-nums">
                        {formatMoney(r.totalAmount)}
                      </span>
                    ),
                  },
                  {
                    key: 'paid',
                    header: 'Paid',
                    align: 'right',
                    render: (r) => {
                      const alloc = purchaseAllocationsMap.get(r.id);
                      return formatMoney(
                        r.status === 'cancelled'
                          ? r.paidNow ?? 0
                          : alloc?.paidAmount ?? r.paidNow ?? 0
                      );
                    },
                  },
                  {
                    key: 'balance',
                    header: 'Balance',
                    align: 'right',
                    render: (r) => {
                      const alloc = purchaseAllocationsMap.get(r.id);
                      return formatMoney(
                        r.status === 'cancelled'
                          ? 0
                          : alloc?.remainingAmount ?? getPurchaseBalance(r)
                      );
                    },
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    noTruncate: true,
                    render: (r) => {
                      if (r.status === 'cancelled') {
                        return <StatusBadge status="cancelled" />;
                      }
                      const alloc = purchaseAllocationsMap.get(r.id);
                      return (
                        <StatusBadge status={alloc?.paymentStatus || 'unpaid'} />
                      );
                    },
                  },
                  {
                    key: 'actions',
                    header: 'Actions',
                    align: 'right',
                    hideOnMobileCard: true,
                    render: (r) => (
                      <RowActions
                        onView={() => setDrawerPurchase(r)}
                        onEdit={() => {
                          setEditingPurchase(r);
                          setNewPurchaseOpen(true);
                        }}
                        editDisabled={r.status === 'cancelled'}
                        editDisabledReason="Cancelled"
                        onPrint={() =>
                          void printDocument(
                            buildPurchaseVoucherPrintMeta(r, settings),
                            companyId
                          )
                        }
                        onDownloadPdf={() =>
                          void downloadDocumentPdf(
                            buildPurchaseVoucherPrintMeta(r, settings),
                            companyId
                          )
                        }
                        onCancel={() => setCancellingPurchase(r)}
                        cancelDisabled={r.status === 'cancelled'}
                        cancelDisabledReason="Already cancelled"
                        onDelete={() => setDeletingPurchase(r)}
                        deleteDisabled={r.status !== 'cancelled'}
                        deleteDisabledReason={
                          r.status !== 'cancelled' ? 'Cancel it first' : undefined
                        }
                      />
                    ),
                  },
                ]}
                emptyState={
                  <EmptyState
                    message="No purchases recorded yet."
                    actionLabel="New purchase"
                    onAction={() => {
                      setEditingPurchase(null);
                      setNewPurchaseOpen(true);
                    }}
                  />
                }
              />
            </div>
          ) : (
            <SuppliersTab
              companyId={companyId}
              suppliers={suppliers}
              purchases={purchases}
              supplierPayments={supplierPayments}
              settings={settings}
              newSupplierDialogOpen={newSupplierDialogOpen}
              setNewSupplierDialogOpen={setNewSupplierDialogOpen}
              paySupplierDialogOpen={paySupplierDialogOpen}
              setPaySupplierDialogOpen={setPaySupplierDialogOpen}
              onRefresh={loadAll}
              onOpenNewPurchase={(supId) => {
                setEditingPurchase(null);
                setDefaultPurchaseSupplierId(supId);
                setNewPurchaseOpen(true);
              }}
              onViewPurchaseVoucher={(p) => setVoucherPurchase(p)}
              selectedSupplierIdForLedger={selectedSupplierIdForLedger}
              onSelectSupplierIdForLedger={setSelectedSupplierIdForLedger}
            />
          )}
        </div>
      )}

      {/* Purchase Detail Drawer (D5.3) */}
      <DetailDrawer
        open={Boolean(drawerPurchase)}
        onClose={() => setDrawerPurchase(null)}
        title={drawerPurchase?.docNumber || ''}
        subtitle={
          drawerPurchase
            ? `${drawerPurchase.supplierName} · ${formatDate(drawerPurchase.date)}`
            : ''
        }
        status={
          drawerPurchase
            ? {
                status:
                  drawerPurchase.status === 'cancelled'
                    ? 'cancelled'
                    : drawerAlloc?.paymentStatus || 'unpaid',
              }
            : undefined
        }
        editedAt={drawerPurchase?.editedAt}
        createdAt={drawerPurchase?.createdAt}
        cancelledAt={drawerPurchase?.cancelledAt}
        cancelReason={drawerPurchase?.cancelReason}
        sections={
          drawerPurchase
            ? [
                {
                  title: 'Purchase summary',
                  fields: [
                    { label: 'Voucher number', value: drawerPurchase.docNumber, mono: true },
                    { label: 'Date', value: formatDate(drawerPurchase.date) },
                    { label: 'Supplier', value: drawerPurchase.supplierName },
                    { label: 'Vehicle', value: drawerPurchase.vehicleNumber || '—' },
                    ...(drawerPurchase.supplierBillNumber
                      ? [{ label: 'Supplier bill #', value: drawerPurchase.supplierBillNumber, mono: true }]
                      : []),
                    ...(drawerPurchase.driverName
                      ? [{ label: 'Driver', value: drawerPurchase.driverName }]
                      : []),
                    {
                      label: 'Total amount',
                      value: formatMoney(drawerPurchase.totalAmount),
                      mono: true,
                    },
                    {
                      label: 'Paid on purchase',
                      value: formatMoney(drawerPurchase.paidNow ?? 0),
                      mono: true,
                    },
                    ...(drawerAlloc && drawerAlloc.allocatedFromPayments.gt(0)
                      ? [
                          {
                            label: 'Allocated from payments',
                            value: formatMoney(drawerAlloc.allocatedFromPayments),
                            mono: true,
                          },
                        ]
                      : []),
                    {
                      label: 'Total paid',
                      value: formatMoney(
                        drawerAlloc?.paidAmount ?? drawerPurchase.paidNow ?? 0
                      ),
                      mono: true,
                    },
                    {
                      label: 'Remaining balance',
                      value: formatMoney(
                        drawerPurchase.status === 'cancelled'
                          ? 0
                          : drawerAlloc?.remainingAmount ?? getPurchaseBalance(drawerPurchase)
                      ),
                      mono: true,
                    },
                    ...(drawerPurchase.notes
                      ? [{ label: 'Notes', value: drawerPurchase.notes }]
                      : []),
                  ],
                },
              ]
            : []
        }
        relatedLinks={
          drawerPurchase
            ? [
                {
                  label: 'Supplier account',
                  value: drawerPurchase.supplierName,
                  sublabel: 'View supplier ledger',
                  onClick: () => {
                    setDrawerPurchase(null);
                    handleSelectTab('suppliers');
                  },
                },
              ]
            : []
        }
        onEdit={
          drawerPurchase
            ? () => {
                const p = drawerPurchase;
                setDrawerPurchase(null);
                setEditingPurchase(p);
                setNewPurchaseOpen(true);
              }
            : undefined
        }
        editDisabled={drawerPurchase?.status === 'cancelled'}
        editDisabledReason="Cancelled"
        onPrint={
          drawerPurchase
            ? () => {
                const p = drawerPurchase;
                setDrawerPurchase(null);
                void printDocument(
                  buildPurchaseVoucherPrintMeta(p, settings),
                  companyId
                );
              }
            : undefined
        }
        onDownloadPdf={
          drawerPurchase
            ? () => {
                const p = drawerPurchase;
                setDrawerPurchase(null);
                void downloadDocumentPdf(
                  buildPurchaseVoucherPrintMeta(p, settings),
                  companyId
                );
              }
            : undefined
        }
        onCancel={
          drawerPurchase
            ? () => {
                const p = drawerPurchase;
                setCancellingPurchase(p);
              }
            : undefined
        }
        cancelDisabled={drawerPurchase?.status === 'cancelled'}
        cancelDisabledReason="Already cancelled"
        onDelete={
          drawerPurchase
            ? () => {
                const p = drawerPurchase;
                setDrawerPurchase(null);
                setDeletingPurchase(p);
              }
            : undefined
        }
        deleteDisabled={drawerPurchase?.status !== 'cancelled'}
        deleteDisabledReason={
          drawerPurchase?.status !== 'cancelled' ? 'Cancel it first' : undefined
        }
      >
        {drawerPurchase && renderPurchaseExpanded(drawerPurchase)}
      </DetailDrawer>

      {/* New / Edit Purchase Form Dialog */}
      <NewPurchaseDialog
        open={newPurchaseOpen}
        onClose={() => {
          setNewPurchaseOpen(false);
          setEditingPurchase(null);
          setDefaultPurchaseSupplierId(undefined);
        }}
        companyId={companyId}
        suppliers={suppliers}
        defaultSupplierId={defaultPurchaseSupplierId}
        items={items}
        editingPurchase={editingPurchase}
        onSuppliersChanged={loadAll}
        onItemsChanged={loadAll}
        onSaved={async (saved) => {
          await loadAll();
          setHighlightedPurchaseId(saved.id);
          window.setTimeout(() => setHighlightedPurchaseId(null), 2200);
        }}
      />

      {/* Print / PDF Purchase Voucher Dialog */}
      <PurchaseVoucherDialog
        open={Boolean(voucherPurchase)}
        onClose={() => setVoucherPurchase(null)}
        purchase={voucherPurchase}
        settings={settings}
        companyId={companyId}
      />

      {/* Cancel Purchase Confirmation Dialog (with required reason) */}
      <ConfirmDialog
        open={Boolean(cancellingPurchase)}
        onClose={() => setCancellingPurchase(null)}
        onConfirm={handleCancelPurchase}
        title={`Cancel ${cancellingPurchase?.docNumber || 'purchase'}`}
        description="Cancelling this purchase keeps the record as cancelled and recalculates stock and average costs. If cancelling would cause negative stock for any production batch, it will be blocked."
        confirmLabel="Cancel purchase"
        requireReason={true}
        loading={cancellingLoading}
      />

      {/* Delete Purchase Confirmation Dialog */}
      <DeleteConfirmDialog
        open={Boolean(deletingPurchase)}
        onOpenChange={(open) => !open && setDeletingPurchase(null)}
        title={`Delete ${deletingPurchase?.docNumber || 'purchase'}`}
        recordLabel={
          deletingPurchase
            ? `${deletingPurchase.docNumber} · ${deletingPurchase.supplierName} (${formatMoney(deletingPurchase.totalAmount)})`
            : undefined
        }
        description="Are you sure you want to permanently delete this cancelled purchase voucher?"
        onConfirm={async () => {
          if (!deletingPurchase) return;
          await PurchaseService.deletePurchase(companyId, deletingPurchase.id);
          notify.success(`${deletingPurchase.docNumber} deleted permanently`);
          await loadAll();
        }}
      />
    </div>
  );
};
