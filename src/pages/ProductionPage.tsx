import { Plus } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Dispatch,
  InventoryItem,
  ProductionBatch,
  Purchase,
} from '../domain/types';
import { useAuth } from '../features/auth/AuthContext';
import { BatchDetailDialog } from '../features/production/BatchDetailDialog';
import { NewBatchDialog } from '../features/production/NewBatchDialog';
import {
  buildBatchPrintMeta,
  formatBatchChemicalsSummary,
} from '../features/production/productionHelpers';
import {
  formatBags,
  formatDate,
  formatMoney,
  formatTon,
} from '../lib/format';
import { notify } from '../lib/notify';
import {
  DispatchService,
  ProductionService,
  PurchaseService,
  SettingsService,
} from '../services';

export const ProductionPage: React.FC = () => {
  const { session } = useAuth();
  const navigate = useNavigate();
  const companyId = session?.companyId || '';
  const { printDocument } = usePrintDocument();

  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);

  // FilterBar state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Dialog states
  const [newBatchOpen, setNewBatchOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<ProductionBatch | null>(null);
  const [drawerBatch, setDrawerBatch] = useState<ProductionBatch | null>(null);
  const [printingBatch, setPrintingBatch] = useState<ProductionBatch | null>(
    null
  );
  const [cancellingBatch, setCancellingBatch] =
    useState<ProductionBatch | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [deletingBatch, setDeletingBatch] = useState<ProductionBatch | null>(
    null
  );
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [highlightedBatchId, setHighlightedBatchId] = useState<string | null>(
    null
  );

  const loadData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [batchList, itemList, purchaseList, dispatchList, companySettings] =
        await Promise.all([
          ProductionService.listBatches(companyId),
          PurchaseService.listItems(companyId),
          PurchaseService.listPurchases(companyId),
          DispatchService.listDispatches(companyId),
          SettingsService.getSettings(companyId),
        ]);
      setBatches(batchList);
      setItems(itemList);
      setPurchases(purchaseList);
      setDispatches(dispatchList);
      setSettings(companySettings);
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : 'Failed to load production batches.'
      );
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const reloadItems = useCallback(async () => {
    if (!companyId) return;
    const itemList = await PurchaseService.listItems(companyId);
    setItems(itemList);
  }, [companyId]);

  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) {
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
        const chemSummary = formatBatchChemicalsSummary(b).toLowerCase();
        const matchesNumber = b.docNumber.toLowerCase().includes(q);
        const matchesRock = (b.rockItemName || '').toLowerCase().includes(q);
        const matchesChem = chemSummary.includes(q);
        const matchesNotes = (b.notes || '').toLowerCase().includes(q);
        if (!matchesNumber && !matchesRock && !matchesChem && !matchesNotes) {
          return false;
        }
      }
      return true;
    });
  }, [batches, statusFilter, dateFrom, dateTo, search]);

  const activeFilterChips = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = [];
    if (statusFilter !== 'all') {
      chips.push({
        key: 'status',
        label: `Status: ${statusFilter === 'active' ? 'Active' : 'Cancelled'}`,
        onRemove: () => setStatusFilter('all'),
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
  }, [statusFilter, dateFrom, dateTo]);

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const handleConfirmCancel = async (reason: string) => {
    if (!cancellingBatch || !reason) return;
    setCancelLoading(true);
    try {
      await ProductionService.cancelBatch(companyId, cancellingBatch.id, reason);
      notify.success(`Cancelled ${cancellingBatch.docNumber}. Stock updated.`);
      const cancelledId = cancellingBatch.id;
      setCancellingBatch(null);
      await loadData();
      if (drawerBatch?.id === cancelledId) {
        setDrawerBatch(null);
      }
      if (printingBatch?.id === cancelledId) {
        setPrintingBatch(null);
      }
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : 'Could not cancel batch.'
      );
    } finally {
      setCancelLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingBatch) return;
    setDeleteLoading(true);
    try {
      await ProductionService.deleteBatch(companyId, deletingBatch.id);
      notify.success(`Deleted ${deletingBatch.docNumber}.`);
      const deletedId = deletingBatch.id;
      setDeletingBatch(null);
      await loadData();
      if (drawerBatch?.id === deletedId) {
        setDrawerBatch(null);
      }
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : 'Could not delete batch.'
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-5 min-w-0">
      <PageHeader
        title="Production"
        action={
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setEditingBatch(null);
              setNewBatchOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            <span>New batch</span>
          </Button>
        }
      />

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search batch number or chemical..."
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
                  { value: 'active', label: 'Active' },
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
        <DataTable<ProductionBatch>
          tableId="production"
          data={filteredBatches}
          keyExtractor={(r) => r.id}
          highlightedRowId={highlightedBatchId}
          onRowClick={(row) => setDrawerBatch(row)}
          mobileCardTitle={(r) => `${r.docNumber} · ${formatDate(r.date)}`}
          mobileCardRight={(r) => formatTon(r.finalProductTons)}
          renderExpanded={(row) => {
            const chemList =
              row.chemicalLines && row.chemicalLines.length > 0
                ? row.chemicalLines
                : (row.chemicalUsages || []).map((u) => ({
                    itemId: u.itemId,
                    itemName: u.itemName,
                    bagsUsed: u.bags,
                    avgCostSnapshot: u.avgCostPerBagSnapshot,
                    lineCost: u.lineCostSnapshot,
                  }));
            const totalBatchCost =
              row.totalBatchCostSnapshot || row.totalCostSnapshot;
            return (
              <div className="space-y-3">
                <div className="text-xs font-semibold text-[var(--text-muted)]">
                  Cost breakdown
                </div>
                <div className="overflow-x-auto rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                        <th className="py-2 px-3 text-left font-medium text-[var(--text-muted)]">
                          Input
                        </th>
                        <th className="py-2 px-3 text-left font-medium text-[var(--text-muted)]">
                          Type
                        </th>
                        <th className="py-2 px-3 text-right font-medium text-[var(--text-muted)]">
                          Quantity used
                        </th>
                        <th className="py-2 px-3 text-right font-medium text-[var(--text-muted)]">
                          Cost
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      <tr>
                        <td className="py-2 px-3 font-medium text-[var(--text)]">
                          {row.rockItemName || 'Phosphate rock'}
                        </td>
                        <td className="py-2 px-3 text-[var(--text-muted)]">
                          Rock
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-[var(--text)]">
                          {formatTon(row.rockTons)}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold tabular-nums text-[var(--text)]">
                          {formatMoney(row.rockCostSnapshot)}
                        </td>
                      </tr>
                      {chemList.map((c, idx) => (
                        <tr key={`${c.itemId}-${idx}`}>
                          <td className="py-2 px-3 font-medium text-[var(--text)]">
                            {c.itemName}
                          </td>
                          <td className="py-2 px-3 text-[var(--text-muted)]">
                            Chemical
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-[var(--text)]">
                            {formatBags(c.bagsUsed)}
                          </td>
                          <td className="py-2 px-3 text-right font-semibold tabular-nums text-[var(--text)]">
                            {formatMoney(c.lineCost)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-[var(--surface-2)] font-semibold">
                        <td className="py-2 px-3 text-[var(--text)]" colSpan={2}>
                          Total batch cost · {formatTon(row.finalProductTons)} powder made
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-[var(--brand)]">
                          {formatMoney(row.costPerTonSnapshot)} / ton
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-[var(--text)]">
                          {formatMoney(totalBatchCost)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {row.notes && (
                  <div className="text-xs text-[var(--text-muted)]">
                    <span className="font-semibold text-[var(--text)]">Notes: </span>
                    {row.notes}
                  </div>
                )}
              </div>
            );
          }}
          mobileCardActions={(r) => (
            <RowActions
              rowLabel={r.docNumber}
              onView={() => setDrawerBatch(r)}
              onEdit={
                r.status === 'active'
                  ? () => {
                      setEditingBatch(r);
                      setNewBatchOpen(true);
                    }
                  : undefined
              }
              editDisabled={
                r.status === 'cancelled'
                  ? 'Cannot edit a cancelled batch'
                  : false
              }
              onPrint={() =>
                void printDocument(buildBatchPrintMeta(r, settings), companyId)
              }
              onDownloadPdf={() =>
                void downloadDocumentPdf(
                  buildBatchPrintMeta(r, settings),
                  companyId
                )
              }
              onCancel={() => setCancellingBatch(r)}
              cancelDisabled={
                r.status === 'cancelled' ? 'Already cancelled' : false
              }
              onDelete={() => setDeletingBatch(r)}
              deleteDisabled={
                r.status !== 'cancelled' ? 'Cancel it first' : false
              }
            />
          )}
          columns={[
            {
              key: 'number',
              header: 'Number',
              hideable: false,
              render: (row) => (
                <div className="inline-flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-[var(--brand)] tabular-nums">
                    {row.docNumber}
                  </span>
                  {row.editedAt && <EditedChip />}
                </div>
              ),
            },
            {
              key: 'date',
              header: 'Date',
              render: (row) => (
                <span className="text-[var(--text)] tabular-nums">
                  {formatDate(row.date)}
                </span>
              ),
            },
            {
              key: 'rockTons',
              header: 'Rock tons',
              align: 'right',
              render: (row) => (
                <span className="text-[var(--text)] tabular-nums">
                  {formatTon(row.rockTons)}
                </span>
              ),
            },
            {
              key: 'chemicals',
              header: 'Chemicals used',
              render: (row) => {
                const chemList =
                  row.chemicalLines && row.chemicalLines.length > 0
                    ? row.chemicalLines
                    : (row.chemicalUsages || []).map((u) => ({
                        itemId: u.itemId,
                        itemName: u.itemName,
                        bagsUsed: u.bags,
                      }));
                return (
                  <div className="flex flex-wrap gap-1 max-w-[240px]">
                    {chemList.length > 0 ? (
                      chemList.map((c, idx) => (
                        <span
                          key={`${c.itemId}-${idx}`}
                          title={`${c.itemName} ${formatBags(c.bagsUsed)}`}
                          className="inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--text)] truncate max-w-[180px]"
                        >
                          {c.itemName} {formatBags(c.bagsUsed)}
                        </span>
                      ))
                    ) : (
                      <span className="text-[var(--text-muted)] text-xs">
                        {formatBatchChemicalsSummary(row)}
                      </span>
                    )}
                  </div>
                );
              },
            },
            {
              key: 'powderTons',
              header: 'Powder tons',
              align: 'right',
              render: (row) => (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/stock?tab=final_product');
                  }}
                  className="font-medium text-[var(--brand)] hover:underline cursor-pointer tabular-nums text-right"
                  title="View final powder stock"
                >
                  {formatTon(row.finalProductTons)}
                </button>
              ),
            },
            {
              key: 'rockCost',
              header: 'Rock cost',
              align: 'right',
              render: (row) => (
                <span className="text-[var(--text)] tabular-nums">
                  {formatMoney(row.rockCostSnapshot)}
                </span>
              ),
            },
            {
              key: 'chemicalsCost',
              header: 'Chemicals cost',
              align: 'right',
              render: (row) => {
                const chemCost =
                  row.chemicalsCostSnapshot ??
                  String(
                    (row.chemicalUsages || []).reduce(
                      (acc, u) => acc + Number(u.lineCostSnapshot || 0),
                      0
                    )
                  );
                return (
                  <span className="text-[var(--text)] tabular-nums">
                    {formatMoney(chemCost)}
                  </span>
                );
              },
            },
            {
              key: 'totalCost',
              header: 'Total cost',
              align: 'right',
              render: (row) => (
                <span className="font-semibold text-[var(--text)] tabular-nums">
                  {formatMoney(row.totalBatchCostSnapshot || row.totalCostSnapshot)}
                </span>
              ),
            },
            {
              key: 'costPerTon',
              header: 'Cost per ton',
              align: 'right',
              render: (row) => (
                <span className="font-semibold text-[var(--brand)] tabular-nums">
                  {formatMoney(row.costPerTonSnapshot)}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (row) => <StatusBadge status={row.status} />,
            },
            {
              key: 'actions',
              header: 'Actions',
              align: 'right',
              hideable: false,
              hideOnMobileCard: true,
              render: (row) => (
                <RowActions
                  rowLabel={row.docNumber}
                  onView={() => setDrawerBatch(row)}
                  onEdit={
                    row.status === 'active'
                      ? () => {
                          setEditingBatch(row);
                          setNewBatchOpen(true);
                        }
                      : undefined
                  }
                  editDisabled={
                    row.status === 'cancelled'
                      ? 'Cannot edit a cancelled batch'
                      : false
                  }
                  onPrint={() =>
                    void printDocument(
                      buildBatchPrintMeta(row, settings),
                      companyId
                    )
                  }
                  onDownloadPdf={() =>
                    void downloadDocumentPdf(
                      buildBatchPrintMeta(row, settings),
                      companyId
                    )
                  }
                  onCancel={() => setCancellingBatch(row)}
                  cancelDisabled={
                    row.status === 'cancelled' ? 'Already cancelled' : false
                  }
                  onDelete={() => setDeletingBatch(row)}
                  deleteDisabled={
                    row.status !== 'cancelled' ? 'Cancel it first' : false
                  }
                />
              ),
            },
          ]}
          emptyState={
            <EmptyState
              message={
                search.trim() || activeFilterChips.length > 0
                  ? 'No production batches match your filters.'
                  : 'No production batches recorded yet.'
              }
              actionLabel={
                search.trim() || activeFilterChips.length > 0
                  ? undefined
                  : 'New batch'
              }
              onAction={
                search.trim() || activeFilterChips.length > 0
                  ? undefined
                  : () => {
                      setEditingBatch(null);
                      setNewBatchOpen(true);
                    }
              }
            />
          }
        />
      )}

      {/* New / Edit Batch Dialog */}
      <NewBatchDialog
        open={newBatchOpen}
        onClose={() => {
          setNewBatchOpen(false);
          setEditingBatch(null);
        }}
        companyId={companyId}
        items={items}
        purchases={purchases}
        batches={batches}
        dispatches={dispatches}
        editingBatch={editingBatch}
        onSaved={async (saved) => {
          await loadData();
          setHighlightedBatchId(saved.id);
          if (drawerBatch?.id === saved.id) {
            setDrawerBatch(saved);
          }
          window.setTimeout(() => setHighlightedBatchId(null), 2200);
        }}
        onItemsChanged={reloadItems}
      />

      {/* Detail Drawer (D5.3) */}
      <DetailDrawer
        open={Boolean(drawerBatch)}
        onClose={() => setDrawerBatch(null)}
        docNumber={drawerBatch?.docNumber || ''}
        subtitle={
          drawerBatch
            ? `Production batch · ${formatDate(drawerBatch.date)}`
            : undefined
        }
        status={drawerBatch?.status}
        editedAt={drawerBatch?.editedAt}
        createdAt={drawerBatch?.createdAt}
        cancelledAt={drawerBatch?.cancelledAt}
        cancelReason={drawerBatch?.cancelReason}
        sections={
          drawerBatch
            ? [
                {
                  title: 'Batch summary',
                  fields: [
                    { label: 'Batch number', value: drawerBatch.docNumber },
                    { label: 'Date', value: formatDate(drawerBatch.date) },
                    ...(drawerBatch.shift ? [{ label: 'Shift', value: drawerBatch.shift }] : []),
                    ...(drawerBatch.machine ? [{ label: 'Machine', value: drawerBatch.machine }] : []),
                    {
                      label: 'Rock used',
                      value: `${drawerBatch.rockItemName || 'Phosphate rock'} · ${formatTon(drawerBatch.rockTons)}`,
                    },
                    {
                      label: 'Powder made',
                      value: formatTon(drawerBatch.finalProductTons),
                      highlight: true,
                    },
                  ],
                },
                {
                  title: 'Cost breakdown',
                  fields: [
                    {
                      label: 'Rock cost',
                      value: formatMoney(drawerBatch.rockCostSnapshot),
                    },
                    {
                      label: 'Chemicals cost',
                      value: formatMoney(
                        drawerBatch.chemicalsCostSnapshot ??
                          String(
                            (drawerBatch.chemicalUsages || []).reduce(
                              (acc, u) => acc + Number(u.lineCostSnapshot || 0),
                              0
                            )
                          )
                      ),
                    },
                    {
                      label: 'Total batch cost',
                      value: formatMoney(
                        drawerBatch.totalBatchCostSnapshot ||
                          drawerBatch.totalCostSnapshot
                      ),
                    },
                    {
                      label: 'Cost per ton',
                      value: formatMoney(drawerBatch.costPerTonSnapshot),
                      highlight: true,
                    },
                  ],
                },
                ...(drawerBatch.notes
                  ? [
                      {
                        title: 'Notes',
                        fields: [
                          {
                            label: 'Notes',
                            value: drawerBatch.notes,
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
          drawerBatch?.status === 'active'
            ? () => {
                const target = drawerBatch;
                setDrawerBatch(null);
                setEditingBatch(target);
                setNewBatchOpen(true);
              }
            : undefined
        }
        editDisabled={
          drawerBatch?.status === 'cancelled'
            ? 'Cannot edit a cancelled batch'
            : false
        }
        onPrint={
          drawerBatch
            ? () => {
                const target = drawerBatch;
                setDrawerBatch(null);
                void printDocument(
                  buildBatchPrintMeta(target, settings),
                  companyId
                );
              }
            : undefined
        }
        onDownloadPdf={
          drawerBatch
            ? () => {
                const target = drawerBatch;
                setDrawerBatch(null);
                void downloadDocumentPdf(
                  buildBatchPrintMeta(target, settings),
                  companyId
                );
              }
            : undefined
        }
        onCancel={
          drawerBatch ? () => setCancellingBatch(drawerBatch) : undefined
        }
        cancelDisabled={
          drawerBatch?.status === 'cancelled' ? 'Already cancelled' : false
        }
        onDelete={
          drawerBatch ? () => setDeletingBatch(drawerBatch) : undefined
        }
        deleteDisabled={
          drawerBatch && drawerBatch.status !== 'cancelled'
            ? 'Cancel it first'
            : false
        }
      >
        {drawerBatch && (
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold text-[var(--text-muted)]">
              Chemicals used
            </h4>
            {(() => {
              const drawerChemList =
                drawerBatch.chemicalLines && drawerBatch.chemicalLines.length > 0
                  ? drawerBatch.chemicalLines
                  : (drawerBatch.chemicalUsages || []).map((u) => ({
                      itemId: u.itemId,
                      itemName: u.itemName,
                      bagsUsed: u.bags,
                      lineCost: u.lineCostSnapshot,
                    }));
              return drawerChemList.length > 0 ? (
                <div className="overflow-x-auto rounded-[12px] border border-[var(--border)] bg-[var(--surface)]">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                        <th className="py-2 px-3 text-left font-medium text-[var(--text-muted)]">
                          Chemical
                        </th>
                        <th className="py-2 px-3 text-right font-medium text-[var(--text-muted)]">
                          Bags used
                        </th>
                        <th className="py-2 px-3 text-right font-medium text-[var(--text-muted)]">
                          Cost
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {drawerChemList.map((c, idx) => (
                        <tr key={`${c.itemId}-${idx}`}>
                          <td className="py-2 px-3 font-medium text-[var(--text)]">
                            {c.itemName}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-[var(--text)]">
                            {formatBags(c.bagsUsed)}
                          </td>
                          <td className="py-2 px-3 text-right font-semibold tabular-nums text-[var(--text)]">
                            {formatMoney(c.lineCost)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5 text-xs text-[var(--text-muted)]">
                  No chemicals used in this batch.
                </div>
              );
            })()}
          </div>
        )}
      </DetailDrawer>

      {/* Batch Detail & Print/PDF Dialog */}
      <BatchDetailDialog
        batch={printingBatch}
        settings={settings}
        companyId={companyId}
        open={Boolean(printingBatch)}
        onClose={() => setPrintingBatch(null)}
        onRequestCancel={(b) => setCancellingBatch(b)}
      />

      {/* Cancel Batch Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(cancellingBatch)}
        onClose={() => setCancellingBatch(null)}
        onConfirm={handleConfirmCancel}
        title={
          cancellingBatch
            ? `Cancel ${cancellingBatch.docNumber}?`
            : 'Cancel batch?'
        }
        description="Cancelling this batch restores the rock and chemicals to stock and removes its final product tons. If later dispatches used this stock, cancellation will be blocked."
        confirmLabel="Cancel batch"
        requireReason={true}
        reasonLabel="Reason for cancellation"
        loading={cancelLoading}
      />

      {/* Delete Batch Confirmation Dialog */}
      <DeleteConfirmDialog
        open={Boolean(deletingBatch)}
        onClose={() => setDeletingBatch(null)}
        onConfirm={handleConfirmDelete}
        recordLabel={
          deletingBatch ? `batch ${deletingBatch.docNumber}` : 'batch'
        }
        loading={deleteLoading}
      />
    </div>
  );
};
