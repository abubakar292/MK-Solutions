import { useGSAP } from '@gsap/react';
import Decimal from 'decimal.js';
import gsap from 'gsap';
import { AlertCircle, Boxes, Download, FileSpreadsheet, Plus, Printer } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SectionLoader } from '../components/loader/SectionLoader';
import {
  PrintLayout,
  downloadDocumentPdf,
  usePrintDocument,
  type PrintableDocumentMeta,
} from '../components/print/PrintLayout';
import { StockValueSplitBar } from '../components/shared/ChartCard';
import { DataTable } from '../components/shared/DataTable';
import { DetailDrawer } from '../components/shared/DetailDrawer';
import { Dialog } from '../components/shared/Dialog';
import { EmptyState } from '../components/shared/EmptyState';
import { FilterBar } from '../components/shared/FilterBar';
import { SelectField, TextArea, TextInput } from '../components/shared/Inputs';
import { MoreDetailsSection } from '../components/shared/MoreDetailsSection';
import { PageHeader } from '../components/shared/PageHeader';
import { RowActions } from '../components/shared/RowActions';
import { StatCard, StatCardGrid } from '../components/shared/StatCard';
import { Button } from '../components/ui/Button';
import { roundMoney, roundWeight, toDecimal, type ItemStockState } from '../domain/engine';
import type { CompanySettings, InventoryItem, ProductionBatch, Purchase } from '../domain/types';
import { useAuth } from '../features/auth/AuthContext';
import { getPurchaseLines } from '../features/purchases/purchaseHelpers';
import { formatBags, formatDate, formatMoney, formatTon } from '../lib/format';
import { MOTION_DURATIONS, MOTION_EASING, prefersReducedMotion } from '../lib/motion';
import { notify } from '../lib/notify';
import { cn } from '../lib/utils';
import {
  ProductionService,
  PurchaseService,
  ReportService,
  SettingsService,
} from '../services';

type StockTab = 'all' | 'rock' | 'chemical' | 'final_product';

const TABS: Array<{ key: StockTab; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'rock', label: 'Rock' },
  { key: 'chemical', label: 'Chemicals' },
  { key: 'final_product', label: 'Final product' },
];

function formatKindLabel(kind: ItemStockState['kind']): string {
  if (kind === 'rock') return 'Rock';
  if (kind === 'chemical') return 'Chemical';
  return 'Final product';
}

export const StockPage: React.FC = () => {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const companyId = session?.companyId || '';

  const initialTab = useMemo<StockTab>(() => {
    const p = searchParams.get('tab');
    if (p === 'rock' || p === 'chemical' || p === 'final_product') return p;
    return 'all';
  }, [searchParams]);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<StockTab>(initialTab);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const p = searchParams.get('tab');
    if (p === 'rock' || p === 'chemical' || p === 'final_product') {
      setActiveTab(p);
    } else if (p === 'all') {
      setActiveTab('all');
    }
  }, [searchParams]);

  const handleSelectTab = (t: StockTab) => {
    setActiveTab(t);
    const next = new URLSearchParams(searchParams);
    if (t === 'all') {
      next.delete('tab');
    } else {
      next.set('tab', t);
    }
    setSearchParams(next, { replace: true });
  };

  const [items, setItems] = useState<ItemStockState[]>([]);
  const [finalProduct, setFinalProduct] = useState<ItemStockState | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [catalogItems, setCatalogItems] = useState<InventoryItem[]>([]);

  // New Item dialog state
  const [newItemModalOpen, setNewItemModalOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemKind, setNewItemKind] = useState<'rock' | 'chemical'>('rock');
  const [newItemLowStockAlert, setNewItemLowStockAlert] = useState('');
  const [newItemNotes, setNewItemNotes] = useState('');
  const [newItemError, setNewItemError] = useState('');
  const [savingNewItem, setSavingNewItem] = useState(false);
  const [savedNewItemSuccess, setSavedNewItemSuccess] = useState(false);

  // Drawer & Edit item dialog state
  const [drawerItem, setDrawerItem] = useState<ItemStockState | null>(null);
  const [editingItem, setEditingItem] = useState<ItemStockState | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [editLowStockAlert, setEditLowStockAlert] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editNameError, setEditNameError] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [savedNameSuccess, setSavedNameSuccess] = useState(false);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);

  // Print preview dialog state
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const tabsBarRef = useRef<HTMLDivElement>(null);
  const tabUnderlineRef = useRef<HTMLDivElement>(null);
  const tabContentRef = useRef<HTMLDivElement>(null);

  const loadStock = useCallback(async () => {
    if (!companyId) return;
    const [snapshot, pList, bList, cfg, cItems] = await Promise.all([
      ReportService.getStockSnapshot(companyId),
      PurchaseService.listPurchases(companyId),
      ProductionService.listBatches(companyId),
      SettingsService.getSettings(companyId),
      PurchaseService.listItems(companyId),
    ]);
    setItems(snapshot.items);
    setFinalProduct(snapshot.finalProduct);
    setPurchases(pList);
    setBatches(bList);
    setSettings(cfg);
    setCatalogItems(cItems);
  }, [companyId]);

  useEffect(() => {
    setLoading(true);
    loadStock().finally(() => setLoading(false));
  }, [loadStock]);

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

  const allStockRows = useMemo<ItemStockState[]>(() => {
    const list = [...items];
    if (finalProduct) {
      list.push(finalProduct);
    }
    return list;
  }, [items, finalProduct]);

  const summaryStats = useMemo(() => {
    let rockTons = new Decimal(0);
    let chemicalBags = new Decimal(0);
    let rockValue = new Decimal(0);
    let chemicalsValue = new Decimal(0);
    let totalValue = new Decimal(0);

    for (const st of items) {
      if (st.kind === 'rock') {
        rockTons = rockTons.plus(st.quantity);
        rockValue = rockValue.plus(st.totalValue);
      } else if (st.kind === 'chemical') {
        chemicalBags = chemicalBags.plus(st.quantity);
        chemicalsValue = chemicalsValue.plus(st.totalValue);
      }
      totalValue = totalValue.plus(st.totalValue);
    }

    const finalPowderTons = finalProduct ? finalProduct.quantity : new Decimal(0);
    const powderValue = finalProduct ? finalProduct.totalValue : new Decimal(0);
    if (finalProduct) {
      totalValue = totalValue.plus(finalProduct.totalValue);
    }

    return {
      rockTons: roundWeight(rockTons),
      chemicalBags: roundWeight(chemicalBags),
      finalPowderTons: roundWeight(finalPowderTons),
      rockValue: roundMoney(rockValue),
      chemicalsValue: roundMoney(chemicalsValue),
      powderValue: roundMoney(powderValue),
      totalValue: roundMoney(totalValue),
    };
  }, [items, finalProduct]);

  // Map each itemId to its latest active purchase date and rate (or batch date & cost/ton for final product)
  const lastPurchaseMeta = useMemo(() => {
    const map = new Map<string, { date: string; rate: string; docNumber: string }>();
    const activePurchases = purchases
      .filter((p) => p.status === 'active')
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

    for (const p of activePurchases) {
      const lines = getPurchaseLines(p);
      for (const l of lines) {
        if (!map.has(l.itemId) && toDecimal(l.quantity).gt(0)) {
          map.set(l.itemId, {
            date: p.date.slice(0, 10),
            rate: l.rate,
            docNumber: p.docNumber,
          });
        }
      }
    }

    const activeBatches = batches
      .filter((b) => b.status === 'active')
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    if (activeBatches[0]) {
      map.set('__FINAL_PRODUCT__', {
        date: activeBatches[0].date.slice(0, 10),
        rate: activeBatches[0].costPerTonSnapshot,
        docNumber: activeBatches[0].docNumber,
      });
    }

    return map;
  }, [purchases, batches]);

  const filteredRows = useMemo(() => {
    return allStockRows.filter((row) => {
      if (activeTab !== 'all' && row.kind !== activeTab) {
        return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const typeStr = formatKindLabel(row.kind).toLowerCase();
        if (
          !row.itemName.toLowerCase().includes(q) &&
          !typeStr.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [allStockRows, activeTab, search]);

  const printDocMeta = useMemo<PrintableDocumentMeta>(() => {
    return {
      title: 'Stock report',
      date: formatDate(new Date().toISOString().slice(0, 10)),
      companyName: settings?.companyName || 'MK Melting Solutions',
      companyAddress: settings?.address,
      companyPhone: settings?.phone,
      metaRows: [
        { label: 'Rock stock', value: formatTon(summaryStats.rockTons) },
        { label: 'Chemical stock', value: formatBags(summaryStats.chemicalBags) },
        { label: 'Final powder stock', value: formatTon(summaryStats.finalPowderTons) },
        { label: 'Total stock value', value: formatMoney(summaryStats.totalValue) },
      ],
      columns: [
        { key: 'item', header: 'Item', align: 'left' },
        { key: 'type', header: 'Type', align: 'left' },
        { key: 'stock', header: 'Stock', align: 'right' },
        { key: 'avgCost', header: 'Average cost', align: 'right' },
        { key: 'value', header: 'Value', align: 'right' },
      ],
      rows: filteredRows.map((r) => ({
        item: r.quantity.lte(0) ? `${r.itemName} (Low)` : r.itemName,
        type: formatKindLabel(r.kind),
        stock: r.unit === 'ton' ? formatTon(r.quantity) : formatBags(r.quantity),
        avgCost: `${formatMoney(r.avgCost)} / ${r.unit}`,
        value: formatMoney(r.totalValue),
      })),
      totals: [
        {
          label: 'Total stock value',
          value: formatMoney(summaryStats.totalValue),
          highlight: true,
        },
      ],
    };
  }, [filteredRows, settings, summaryStats]);

  const handleOpenNewItem = () => {
    setNewItemName('');
    setNewItemKind('rock');
    setNewItemLowStockAlert('');
    setNewItemNotes('');
    setNewItemError('');
    setSavedNewItemSuccess(false);
    setNewItemModalOpen(true);
  };

  const handleSaveNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newItemName.trim();
    if (!trimmed) {
      setNewItemError('Enter item name');
      return;
    }
    setSavingNewItem(true);
    setNewItemError('');
    try {
      const created = await PurchaseService.createItem(companyId, {
        name: trimmed,
        kind: newItemKind,
        lowStockAlert: newItemLowStockAlert.trim() || undefined,
        notes: newItemNotes.trim() || undefined,
      });
      setSavedNewItemSuccess(true);
      notify.success(`Created item "${created.name}"`);
      await loadStock();
      setHighlightedItemId(created.id);
      window.setTimeout(() => setHighlightedItemId(null), 2200);
      window.setTimeout(() => {
        setNewItemModalOpen(false);
        setSavedNewItemSuccess(false);
      }, 380);
    } catch (err) {
      setNewItemError(err instanceof Error ? err.message : 'Could not create item');
    } finally {
      setSavingNewItem(false);
    }
  };

  const handleOpenRename = (row: ItemStockState) => {
    const cat = catalogItems.find((c) => c.id === row.itemId);
    setEditingItem(row);
    setEditNameValue(row.itemName);
    setEditLowStockAlert(cat?.lowStockAlert || '');
    setEditNotes(cat?.notes || '');
    setEditNameError('');
    setSavedNameSuccess(false);
  };

  const handleSaveRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    const trimmed = editNameValue.trim();
    if (!trimmed) {
      setEditNameError('Enter item name');
      return;
    }

    setSavingName(true);
    setEditNameError('');
    try {
      if (editingItem.itemId === '__FINAL_PRODUCT__') {
        await PurchaseService.renameItem(companyId, editingItem.itemId, trimmed);
      } else {
        await PurchaseService.updateItem(companyId, editingItem.itemId, {
          name: trimmed,
          lowStockAlert: editLowStockAlert.trim() || undefined,
          notes: editNotes.trim() || undefined,
        });
      }
      setSavedNameSuccess(true);
      notify.success('Item updated');
      await loadStock();
      setHighlightedItemId(editingItem.itemId);
      window.setTimeout(() => setHighlightedItemId(null), 2200);
      window.setTimeout(() => {
        setEditingItem(null);
        setSavedNameSuccess(false);
      }, 380);
    } catch (err) {
      setEditNameError(err instanceof Error ? err.message : 'Could not update item');
    } finally {
      setSavingName(false);
    }
  };

  const handleExportCsv = () => {
    const headers = ['Item', 'Type', 'Stock', 'Unit', 'Average cost (PKR)', 'Value (PKR)', 'Status'];
    const csvRows = [headers.join(',')];

    for (const r of filteredRows) {
      const cells = [
        `"${r.itemName.replace(/"/g, '""')}"`,
        `"${formatKindLabel(r.kind)}"`,
        r.quantity.toDecimalPlaces(3).toString(),
        r.unit,
        r.avgCost.toFixed(2),
        r.totalValue.toFixed(2),
        r.quantity.lte(0) ? 'Low' : 'Available',
      ];
      csvRows.push(cells.join(','));
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mk-stock-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify.success('Stock CSV exported');
  };

  const { printDocument, isPrinting } = usePrintDocument();

  const handleDirectPdfDownload = async () => {
    setDownloadingPdf(true);
    try {
      await downloadDocumentPdf(printDocMeta, companyId);
      notify.success('Stock PDF downloaded');
    } catch (err) {
      notify.error(
        'Could not generate PDF.',
        err instanceof Error ? err.message : 'Try again.'
      );
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handlePrintStock = () => {
    void printDocument(printDocMeta, companyId);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Stock" />
        <SectionLoader cards={4} rows={5} />
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Stock"
        secondaryActions={
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleOpenNewItem}
            >
              <Plus className="h-4 w-4" />
              <span>New item</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleExportCsv}
              disabled={filteredRows.length === 0}
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>Export CSV</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={downloadingPdf}
              onClick={handleDirectPdfDownload}
              disabled={filteredRows.length === 0 || downloadingPdf || isPrinting}
            >
              <Download className="h-4 w-4" />
              <span>Download PDF</span>
            </Button>
          </>
        }
        action={
          <Button
            type="button"
            variant="primary"
            onClick={handlePrintStock}
            disabled={filteredRows.length === 0 || isPrinting || downloadingPdf}
          >
            <Printer className="h-4 w-4" />
            <span>Print stock</span>
          </Button>
        }
      />

      {/* 4 Summary Cards */}
      <StatCardGrid>
        <StatCard
          label="Rock stock"
          value={formatTon(summaryStats.rockTons)}
          onClick={() => setActiveTab('rock')}
        />
        <StatCard
          label="Total chemical bags"
          value={formatBags(summaryStats.chemicalBags)}
          onClick={() => handleSelectTab('chemical')}
        />
        <StatCard
          label="Final powder stock"
          value={formatTon(summaryStats.finalPowderTons)}
          onClick={() => handleSelectTab('final_product')}
        />
        <StatCard
          label="Total stock value"
          value={formatMoney(summaryStats.totalValue)}
          numericValue={summaryStats.totalValue.toNumber()}
          formatter={(v) => formatMoney(v)}
          onClick={() => handleSelectTab('all')}
        />
      </StatCardGrid>

      {/* Stock value split chart */}
      <StockValueSplitBar
        rockValue={summaryStats.rockValue.toNumber()}
        chemicalsValue={summaryStats.chemicalsValue.toNumber()}
        powderValue={summaryStats.powderValue.toNumber()}
      />

      {/* Quiet text links */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)] pt-1">
        <button
          type="button"
          onClick={() => navigate('/production')}
          className="text-[var(--brand)] hover:underline font-medium cursor-pointer"
        >
          Rock and chemicals are used in Production &rarr;
        </button>
        <span className="text-[var(--border)]">•</span>
        <button
          type="button"
          onClick={() => navigate('/dispatch')}
          className="text-[var(--brand)] hover:underline font-medium cursor-pointer"
        >
          Powder is sold in Dispatch &rarr;
        </button>
      </div>

      {/* Tabs: All | Rock | Chemicals | Final product */}
      <div
        ref={tabsBarRef}
        role="tablist"
        aria-label="Stock categories"
        className="relative flex items-center gap-6 border-b border-[var(--border)] overflow-x-auto"
      >
        {TABS.map((t) => {
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              data-tab={t.key}
              aria-selected={isActive}
              onClick={() => handleSelectTab(t.key)}
              className={cn(
                'pb-3 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0',
                isActive
                  ? 'text-[var(--brand)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              )}
            >
              {t.label}
            </button>
          );
        })}

        <div
          ref={tabUnderlineRef}
          aria-hidden="true"
          className="absolute bottom-0 left-0 h-[2px] w-12 bg-[var(--brand)]"
        />
      </div>

      {/* FilterBar & Stock Table */}
      <div ref={tabContentRef} className="space-y-4 min-w-0">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search item name..."
        />

        <DataTable
          tableId="stock"
          data={filteredRows}
          keyExtractor={(r) => r.itemId}
          highlightedRowId={highlightedItemId}
          onRowClick={(r) => setDrawerItem(r)}
          mobileCardTitle={(r) => (
            <div className="inline-flex items-center gap-2">
              <span>{r.itemName}</span>
              {r.quantity.lte(0) && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[11px] font-medium text-[var(--danger)]">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span>Low</span>
                </span>
              )}
            </div>
          )}
          mobileCardRight={(r) =>
            r.unit === 'ton' ? formatTon(r.quantity) : formatBags(r.quantity)
          }
          mobileCardActions={(r) => (
            <RowActions
              onView={() => setDrawerItem(r)}
              onEdit={() => handleOpenRename(r)}
              onPrint={handlePrintStock}
              onDownloadPdf={() => void handleDirectPdfDownload()}
            />
          )}
          columns={[
            {
              key: 'item',
              header: 'Item',
              noTruncate: true,
              render: (r) => (
                <div className="inline-flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-[var(--text)] truncate">
                    {r.itemName}
                  </span>
                  {r.quantity.lte(0) && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[8px] border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[11px] font-medium text-[var(--danger)] shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--danger)]" />
                      <span>Low</span>
                    </span>
                  )}
                </div>
              ),
            },
            {
              key: 'type',
              header: 'Type',
              render: (r) => (
                <span className="text-[var(--text-secondary)]">{formatKindLabel(r.kind)}</span>
              ),
            },
            {
              key: 'stock',
              header: 'Stock',
              align: 'right',
              render: (r) => (
                <span className="font-semibold text-[var(--text)] tabular-nums">
                  {r.unit === 'ton' ? formatTon(r.quantity) : formatBags(r.quantity)}
                </span>
              ),
            },
            {
              key: 'avgCost',
              header: 'Average cost',
              align: 'right',
              render: (r) => (
                <span className="text-[var(--text)] tabular-nums">
                  {formatMoney(r.avgCost)} / {r.unit}
                </span>
              ),
            },
            {
              key: 'value',
              header: 'Value',
              align: 'right',
              render: (r) => (
                <span className="font-heading font-semibold text-[var(--text)] tabular-nums">
                  {formatMoney(r.totalValue)}
                </span>
              ),
            },
            {
              key: 'share',
              header: 'Share of total value',
              noTruncate: true,
              render: (r) => {
                const sharePct = summaryStats.totalValue.gt(0)
                  ? r.totalValue.dividedBy(summaryStats.totalValue).times(100).toNumber()
                  : 0;
                return (
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <div className="h-2 flex-1 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--brand)] transition-all"
                        style={{ width: `${Math.min(100, Math.max(0, sharePct))}%` }}
                      />
                    </div>
                    <span className="w-11 text-right text-xs font-medium text-[var(--text-secondary)] tabular-nums">
                      {sharePct.toFixed(1)}%
                    </span>
                  </div>
                );
              },
            },
            {
              key: 'lastPurchase',
              header: 'Last purchase date & rate',
              render: (r) => {
                const meta = lastPurchaseMeta.get(r.itemId);
                if (!meta) return '—';
                return (
                  <span className="text-xs text-[var(--text-secondary)] tabular-nums">
                    {formatDate(meta.date)} · {formatMoney(meta.rate)} / {r.unit}
                  </span>
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
                  onView={() => setDrawerItem(r)}
                  onEdit={() => handleOpenRename(r)}
                  onPrint={handlePrintStock}
                  onDownloadPdf={() => void handleDirectPdfDownload()}
                />
              ),
            },
          ]}
          emptyState={
            <EmptyState
              message="No stock items found."
              actionLabel="New purchase"
              onAction={() => navigate('/purchases')}
            />
          }
        />
      </div>

      {/* Stock Item Detail Drawer (D5.3) */}
      <DetailDrawer
        open={Boolean(drawerItem)}
        onClose={() => setDrawerItem(null)}
        title={drawerItem?.itemName || ''}
        subtitle={drawerItem ? formatKindLabel(drawerItem.kind) : ''}
        sections={
          drawerItem
            ? [
                {
                  title: 'Current stock & valuation',
                  fields: [
                    { label: 'Item name', value: drawerItem.itemName },
                    { label: 'Type', value: formatKindLabel(drawerItem.kind) },
                    {
                      label: 'Current stock',
                      value:
                        drawerItem.unit === 'ton'
                          ? formatTon(drawerItem.quantity)
                          : formatBags(drawerItem.quantity),
                      mono: true,
                    },
                    {
                      label: 'Average cost',
                      value: `${formatMoney(drawerItem.avgCost)} / ${drawerItem.unit}`,
                      mono: true,
                    },
                    {
                      label: 'Total value',
                      value: formatMoney(drawerItem.totalValue),
                      mono: true,
                    },
                    {
                      label: 'Share of total value',
                      value: summaryStats.totalValue.gt(0)
                        ? `${drawerItem.totalValue
                            .dividedBy(summaryStats.totalValue)
                            .times(100)
                            .toFixed(1)}%`
                        : '0.0%',
                      mono: true,
                    },
                    {
                      label:
                        drawerItem.kind === 'final_product'
                          ? 'Last production batch'
                          : 'Last purchase date & rate',
                      value: (() => {
                        const meta = lastPurchaseMeta.get(drawerItem.itemId);
                        if (!meta) return '—';
                        return `${formatDate(meta.date)} · ${formatMoney(meta.rate)} / ${drawerItem.unit} (${meta.docNumber})`;
                      })(),
                      fullWidth: true,
                    },
                    ...(() => {
                      const cat = catalogItems.find((c) => c.id === drawerItem.itemId);
                      const extra: Array<{ label: string; value: string; mono?: boolean }> = [];
                      if (cat?.lowStockAlert) {
                        extra.push({ label: 'Low stock alert', value: `${cat.lowStockAlert} ${drawerItem.unit}`, mono: true });
                      }
                      if (cat?.notes) {
                        extra.push({ label: 'Notes', value: cat.notes });
                      }
                      return extra;
                    })(),
                  ],
                },
              ]
            : []
        }
        onEdit={
          drawerItem
            ? () => {
                const it = drawerItem;
                setDrawerItem(null);
                handleOpenRename(it);
              }
            : undefined
        }
        onPrint={() => {
          setDrawerItem(null);
          handlePrintStock();
        }}
        onDownloadPdf={() => {
          setDrawerItem(null);
          void handleDirectPdfDownload();
        }}
      />

      {/* New Item Dialog */}
      <Dialog
        open={newItemModalOpen}
        onClose={() => setNewItemModalOpen(false)}
        title="New item"
        icon={<Boxes className="h-4 w-4" />}
        maxWidth="md"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setNewItemModalOpen(false)}
              disabled={savingNewItem}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="new-item-form"
              variant="primary"
              loading={savingNewItem}
              saved={savedNewItemSuccess}
            >
              Save item
            </Button>
          </>
        }
      >
        <form id="new-item-form" onSubmit={handleSaveNewItem} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextInput
              label="Item name"
              placeholder="e.g. Limestone Rock, Sodium Binder"
              value={newItemName}
              onChange={(e) => {
                setNewItemName(e.target.value);
                if (newItemError) setNewItemError('');
              }}
              error={newItemError}
              autoFocus
            />

            <SelectField
              label="Item type"
              value={newItemKind}
              onChange={(e) => setNewItemKind(e.target.value as 'rock' | 'chemical')}
              options={[
                { value: 'rock', label: 'Rock (tons)' },
                { value: 'chemical', label: 'Chemical (bags)' },
              ]}
            />
          </div>

          <MoreDetailsSection title="More details">
            <TextInput
              label="Low stock alert level"
              placeholder={newItemKind === 'rock' ? 'e.g. 50 (tons)' : 'e.g. 100 (bags)'}
              value={newItemLowStockAlert}
              onChange={(e) => setNewItemLowStockAlert(e.target.value)}
            />
            <div className="sm:col-span-2">
              <TextArea
                label="Notes"
                placeholder="Item specification, grade, or storage notes"
                value={newItemNotes}
                rows={2}
                onChange={(e) => setNewItemNotes(e.target.value)}
              />
            </div>
          </MoreDetailsSection>
        </form>
      </Dialog>

      {/* Edit Item Dialog */}
      <Dialog
        open={Boolean(editingItem)}
        onClose={() => setEditingItem(null)}
        title={editingItem ? `Edit ${editingItem.itemName}` : 'Edit item'}
        icon={<Boxes className="h-4 w-4" />}
        maxWidth="md"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditingItem(null)}
              disabled={savingName}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="edit-item-name-form"
              variant="primary"
              loading={savingName}
              saved={savedNameSuccess}
            >
              Save changes
            </Button>
          </>
        }
      >
        <form id="edit-item-name-form" onSubmit={handleSaveRename} className="space-y-4">
          <TextInput
            label="Item name"
            value={editNameValue}
            onChange={(e) => {
              setEditNameValue(e.target.value);
              if (editNameError) setEditNameError('');
            }}
            error={editNameError}
            autoFocus
          />

          {editingItem?.itemId !== '__FINAL_PRODUCT__' && (
            <MoreDetailsSection title="More details">
              <TextInput
                label="Low stock alert level"
                placeholder="Threshold quantity"
                value={editLowStockAlert}
                onChange={(e) => setEditLowStockAlert(e.target.value)}
              />
              <div className="sm:col-span-2">
                <TextArea
                  label="Notes"
                  placeholder="Item specification, grade, or storage notes"
                  value={editNotes}
                  rows={2}
                  onChange={(e) => setEditNotes(e.target.value)}
                />
              </div>
            </MoreDetailsSection>
          )}
        </form>
      </Dialog>

      {/* Print & PDF Stock Report Dialog */}
      <Dialog
        open={printPreviewOpen}
        onClose={() => setPrintPreviewOpen(false)}
        title="Print stock report"
        maxWidth="xl"
        footer={
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPrintPreviewOpen(false)}
          >
            Close
          </Button>
        }
      >
        <PrintLayout doc={printDocMeta} companyId={companyId} />
      </Dialog>
    </div>
  );
};
