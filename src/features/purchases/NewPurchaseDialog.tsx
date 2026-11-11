import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ChevronDown, ChevronUp, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import { Dialog } from '../../components/shared/Dialog';
import { DatePicker, MoneyInput, TextArea, TextInput } from '../../components/shared/Inputs';
import { MoreDetailsSection } from '../../components/shared/MoreDetailsSection';
import { Button } from '../../components/ui/Button';
import { roundMoney, roundWeight, toDecimal } from '../../domain/engine';
import type { InventoryItem, ItemKind, Purchase, Supplier } from '../../domain/types';
import { formatBags, formatMoney, formatTon, getTodayKarachiIsoDate } from '../../lib/format';
import { MOTION_DURATIONS, MOTION_EASING, prefersReducedMotion, triggerInvalidShake } from '../../lib/motion';
import { notify } from '../../lib/notify';
import { cn, generateId } from '../../lib/utils';
import { PurchaseService, ReportService } from '../../services';
import { buildPurchaseStorageLines, getPurchaseLines } from './purchaseHelpers';

interface NewPurchaseDialogProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  suppliers: Supplier[];
  defaultSupplierId?: string;
  items: InventoryItem[];
  editingPurchase?: Purchase | null;
  onSaved: (createdPurchase: Purchase) => Promise<void> | void;
  onSuppliersChanged: () => Promise<void> | void;
  onItemsChanged: () => Promise<void> | void;
}

interface DraftLine {
  id: string;
  itemId: string;
  quantity: string;
  rate: string;
}

export const NewPurchaseDialog: React.FC<NewPurchaseDialogProps> = ({
  open,
  onClose,
  companyId,
  suppliers,
  defaultSupplierId,
  items,
  editingPurchase,
  onSaved,
  onSuppliersChanged,
  onItemsChanged,
}) => {
  const [date, setDate] = useState<string>(() => getTodayKarachiIsoDate());
  const [supplierId, setSupplierId] = useState<string>('');
  const [vehicleNumber, setVehicleNumber] = useState<string>('');
  const [lines, setLines] = useState<DraftLine[]>([
    { id: generateId('line'), itemId: '', quantity: '', rate: '' },
  ]);
  const [paidNow, setPaidNow] = useState<string>('');
  const [supplierBillNumber, setSupplierBillNumber] = useState<string>('');
  const [driverName, setDriverName] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Inline "Add new supplier" state (Name and Phone only per 2.2)
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierError, setNewSupplierError] = useState('');
  const [savingSupplier, setSavingSupplier] = useState(false);

  // Inline "Add new item" state (Name and Type: Rock or Chemical only per 2.2)
  const [addingItemForLineId, setAddingItemForLineId] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemKind, setNewItemKind] = useState<ItemKind>('chemical');
  const [newItemError, setNewItemError] = useState('');
  const [savingItem, setSavingItem] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (open) {
      if (editingPurchase) {
        const existingLines = getPurchaseLines(editingPurchase);
        setDate(editingPurchase.date.slice(0, 10));
        setSupplierId(editingPurchase.supplierId);
        setVehicleNumber(editingPurchase.vehicleNumber || '');
        setSupplierBillNumber(editingPurchase.supplierBillNumber || '');
        setDriverName(editingPurchase.driverName || '');
        setLines(
          existingLines.length > 0
            ? existingLines.map((l) => ({
                id: l.id || generateId('line'),
                itemId: l.itemId,
                quantity: l.quantity,
                rate: l.rate,
              }))
            : [
                {
                  id: generateId('line'),
                  itemId: items[0]?.id || '',
                  quantity: '',
                  rate: '',
                },
              ]
        );
        setPaidNow(editingPurchase.paidNow && Number(editingPurchase.paidNow) > 0 ? editingPurchase.paidNow : '');
        setNotes(editingPurchase.notes || '');
      } else {
        setDate(getTodayKarachiIsoDate());
        setSupplierId(defaultSupplierId || suppliers[0]?.id || '');
        setVehicleNumber('');
        setSupplierBillNumber('');
        setDriverName('');
        setLines([
          {
            id: generateId('line'),
            itemId: items[0]?.id || '',
            quantity: '',
            rate: '',
          },
        ]);
        setPaidNow('');
        setNotes('');
      }
      setAddingSupplier(false);
      setAddingItemForLineId(null);
      setFormError(null);
      setSavedSuccess(false);
    }
  }, [open, editingPurchase, defaultSupplierId, suppliers, items]);

  const itemsMap = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    for (const item of items) {
      map.set(item.id, item);
    }
    return map;
  }, [items]);

  const computedLines = useMemo(() => {
    return lines.map((line) => {
      const item = itemsMap.get(line.itemId);
      const kind: ItemKind = item?.kind ?? 'rock';
      const qty = roundWeight(line.quantity || 0);
      const rate = toDecimal(line.rate || 0);
      const amount = roundMoney(qty.times(rate));
      return {
        ...line,
        item,
        kind,
        amount,
      };
    });
  }, [lines, itemsMap]);

  const totalAmount = useMemo(() => {
    return computedLines.reduce((acc, l) => acc.plus(l.amount), new Decimal(0));
  }, [computedLines]);

  const paidNowDec = useMemo(() => roundMoney(paidNow || 0), [paidNow]);
  const remainingBalance = useMemo(
    () => roundMoney(totalAmount.minus(paidNowDec)),
    [totalAmount, paidNowDec]
  );

  const hasUnsavedChanges = useMemo(() => {
    return (
      lines.some((l) => Number(l.quantity) > 0 || Number(l.rate) > 0) ||
      Boolean(vehicleNumber.trim()) ||
      Boolean(notes.trim())
    );
  }, [lines, vehicleNumber, notes]);

  const handleCreateInlineSupplier = async () => {
    const trimmedName = newSupplierName.trim();
    if (!trimmedName) {
      setNewSupplierError('Enter supplier name');
      return;
    }
    setSavingSupplier(true);
    setNewSupplierError('');
    try {
      const created = await PurchaseService.createSupplierInline(
        companyId,
        trimmedName,
        newSupplierPhone.trim() || undefined
      );
      await onSuppliersChanged();
      setSupplierId(created.id);
      setAddingSupplier(false);
      setNewSupplierName('');
      setNewSupplierPhone('');
      notify.success(`Supplier "${created.name}" added`);
    } catch (err) {
      setNewSupplierError(err instanceof Error ? err.message : 'Could not add supplier');
    } finally {
      setSavingSupplier(false);
    }
  };

  const handleCreateInlineItem = async () => {
    const trimmedName = newItemName.trim();
    if (!trimmedName) {
      setNewItemError('Enter item name');
      return;
    }
    setSavingItem(true);
    setNewItemError('');
    try {
      const created = await PurchaseService.createItemInline(
        companyId,
        trimmedName,
        newItemKind
      );
      await onItemsChanged();
      if (addingItemForLineId) {
        setLines((prev) =>
          prev.map((l) =>
            l.id === addingItemForLineId ? { ...l, itemId: created.id } : l
          )
        );
      }
      setAddingItemForLineId(null);
      setNewItemName('');
      notify.success(
        `${created.name} (${created.kind === 'rock' ? 'ton' : 'bag'}) added`
      );
    } catch (err) {
      setNewItemError(err instanceof Error ? err.message : 'Could not add item');
    } finally {
      setSavingItem(false);
    }
  };

  const handleAddRow = () => {
    setLines((prev) => [
      ...prev,
      {
        id: generateId('line'),
        itemId: items[0]?.id || '',
        quantity: '',
        rate: '',
      },
    ]);
  };

  const handleRemoveRow = (id: string) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLine = (id: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!date) {
      setFormError('Select a purchase date.');
      triggerInvalidShake(formRef.current);
      return;
    }

    const supplier = suppliers.find((s) => s.id === supplierId);
    if (!supplier) {
      setFormError('Select a supplier or add a new supplier.');
      triggerInvalidShake(formRef.current);
      return;
    }

    const validLines = computedLines.filter(
      (l) => l.item && toDecimal(l.quantity).gt(0) && toDecimal(l.rate).gt(0)
    );

    if (validLines.length === 0) {
      setFormError('Add at least one item with quantity and rate greater than zero.');
      triggerInvalidShake(formRef.current);
      return;
    }

    for (const l of computedLines) {
      if (!l.item) {
        setFormError('Select an item for every row.');
        triggerInvalidShake(formRef.current);
        return;
      }
      if (toDecimal(l.quantity).lte(0) || toDecimal(l.rate).lte(0)) {
        setFormError(`Enter a valid quantity and rate for ${l.item.name}.`);
        triggerInvalidShake(formRef.current);
        return;
      }
    }

    if (paidNowDec.lt(0)) {
      setFormError('Paid now amount cannot be negative.');
      triggerInvalidShake(formRef.current);
      return;
    }

    setSaving(true);
    try {
      const built = buildPurchaseStorageLines(
        validLines.map((l) => ({
          id: l.id,
          itemId: l.item!.id,
          itemName: l.item!.name,
          kind: l.kind,
          quantity: l.quantity,
          rate: l.rate,
        }))
      );

      const payload = {
        date,
        supplierId: supplier.id,
        supplierName: supplier.name,
        vehicleNumber: vehicleNumber.trim() || undefined,
        supplierBillNumber: supplierBillNumber.trim() || undefined,
        driverName: driverName.trim() || undefined,
        lines: built.lines,
        rockLine: built.rockLine,
        chemicalLines: built.chemicalLines,
        subtotal: built.subtotal.toString(),
        otherCharges: '0',
        totalAmount: built.subtotal.toString(),
        paidNow: paidNowDec.toString(),
        paymentMethod: 'cash' as const,
        notes: notes.trim() || undefined,
      };

      const saved = editingPurchase
        ? await PurchaseService.updatePurchase(companyId, editingPurchase.id, payload)
        : await PurchaseService.createPurchase(companyId, payload);

      // Compute updated stock and average cost for each purchased item to display in toast per 3.2
      const snapshot = await ReportService.getStockSnapshot(companyId);
      const purchasedItemIds = Array.from(new Set(validLines.map((l) => l.item!.id)));
      const stockSummaryParts = purchasedItemIds
        .map((id) => {
          const st = snapshot.items.find((i) => i.itemId === id);
          if (!st) return null;
          const stockStr = st.unit === 'ton' ? formatTon(st.quantity) : formatBags(st.quantity);
          return `${st.itemName}: ${stockStr} @ ${formatMoney(st.avgCost)} / ${st.unit}`;
        })
        .filter(Boolean);

      setSavedSuccess(true);
      notify.success(
        `${saved.docNumber} ${editingPurchase ? 'updated' : 'saved'}`,
        stockSummaryParts.length > 0
          ? `New stock & cost — ${stockSummaryParts.join(' · ')}`
          : undefined
      );

      await onSaved(saved);
      window.setTimeout(() => {
        onClose();
      }, 420);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to save purchase. Try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={<ShoppingCart className="h-4 w-4" />}
      title={editingPurchase ? `Edit ${editingPurchase.docNumber}` : 'New purchase'}
      maxWidth="xl"
      hasUnsavedChanges={hasUnsavedChanges && !savedSuccess}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="new-purchase-form"
            variant="primary"
            loading={saving}
            saved={savedSuccess}
          >
            {editingPurchase ? 'Save changes' : 'Save purchase'}
          </Button>
        </>
      }
    >
      <form
        id="new-purchase-form"
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className="space-y-5"
      >
        {formError && (
          <div
            role="alert"
            className="rounded-[6px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-xs font-medium text-[var(--danger)]"
          >
            {formError}
          </div>
        )}

        {/* Top Row: Date, Supplier (with inline Add new supplier), Vehicle number */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <DatePicker
            label="Date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />

          <div className="flex flex-col gap-1.5 min-w-0">
            <label
              htmlFor="purchase-supplier-select"
              className="text-sm font-medium text-[var(--text)]"
            >
              Supplier
            </label>
            <select
              id="purchase-supplier-select"
              value={addingSupplier ? '__ADD_NEW_SUPPLIER__' : supplierId}
              onChange={(e) => {
                if (e.target.value === '__ADD_NEW_SUPPLIER__') {
                  setAddingSupplier(true);
                } else {
                  setAddingSupplier(false);
                  setSupplierId(e.target.value);
                }
              }}
              className="h-11 sm:h-10 w-full rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] glow-input-focus"
            >
              <option value="" disabled>
                Select supplier...
              </option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="__ADD_NEW_SUPPLIER__">+ Add new supplier</option>
            </select>
          </div>

          <TextInput
            label="Vehicle number (optional)"
            placeholder="e.g., LES-22-4100"
            value={vehicleNumber}
            onChange={(e) => setVehicleNumber(e.target.value)}
          />
        </div>

        {/* Inline Add New Supplier Box (Name and Phone only per 2.2) */}
        {addingSupplier && (
          <div className="rounded-[10px] border border-[var(--brand-mid)] bg-[var(--surface-subtle)] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--brand)]">
                Add new supplier
              </span>
              <button
                type="button"
                onClick={() => setAddingSupplier(false)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
              >
                Cancel
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextInput
                label="Name"
                placeholder="Supplier name"
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                error={newSupplierError}
                autoFocus
              />
              <TextInput
                label="Phone"
                placeholder="0300-0000000"
                value={newSupplierPhone}
                onChange={(e) => setNewSupplierPhone(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="primary"
                loading={savingSupplier}
                onClick={handleCreateInlineSupplier}
              >
                Save supplier
              </Button>
            </div>
          </div>
        )}

        {/* Items Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--text)]">Items</span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleAddRow}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add item</span>
            </Button>
          </div>

          {/* Inline Add New Item Box (Name and Type: Rock or Chemical only per 2.2) */}
          {addingItemForLineId && (
            <div className="rounded-[10px] border border-[var(--brand-mid)] bg-[var(--surface-subtle)] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--brand)]">
                  Add new item
                </span>
                <button
                  type="button"
                  onClick={() => setAddingItemForLineId(null)}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextInput
                  label="Item name"
                  placeholder="e.g., White Rock or Flux Binder"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  error={newItemError}
                  autoFocus
                />
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-[var(--text)]">Type</label>
                  <div className="grid grid-cols-2 gap-2 h-11 sm:h-10">
                    <button
                      type="button"
                      onClick={() => setNewItemKind('rock')}
                      className={cn(
                        'rounded-[6px] border text-xs font-semibold transition-colors cursor-pointer',
                        newItemKind === 'rock'
                          ? 'bg-[var(--brand-soft)] border-[var(--brand)] text-[var(--brand)]'
                          : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text)]'
                      )}
                    >
                      Rock (ton)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewItemKind('chemical')}
                      className={cn(
                        'rounded-[6px] border text-xs font-semibold transition-colors cursor-pointer',
                        newItemKind === 'chemical'
                          ? 'bg-[var(--brand-soft)] border-[var(--brand)] text-[var(--brand)]'
                          : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text)]'
                      )}
                    >
                      Chemical (bag)
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  loading={savingItem}
                  onClick={handleCreateInlineItem}
                >
                  Save item
                </Button>
              </div>
            </div>
          )}

          {/* Lines List (Responsive: stacked rows on mobile, grid table on desktop) */}
          <div className="space-y-3">
            {computedLines.map((line, index) => {
              const isRock = line.kind === 'rock';
              const qtySuffix = isRock ? 'ton' : 'bags';
              const rateSuffix = isRock ? 'Rs per ton' : 'Rs per bag';

              return (
                <div
                  key={line.id}
                  className="rounded-[10px] border border-[var(--border)] bg-[var(--bg)] p-3.5 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
                >
                  {/* Item Dropdown */}
                  <div className="sm:col-span-4 flex flex-col gap-1.5 min-w-0">
                    <label className="text-xs font-medium text-[var(--text-muted)]">
                      Item {index + 1}
                    </label>
                    <select
                      aria-label={`Item ${index + 1}`}
                      value={line.itemId}
                      onChange={(e) => {
                        if (e.target.value === '__ADD_NEW_ITEM__') {
                          setAddingItemForLineId(line.id);
                          setNewItemName('');
                          setNewItemError('');
                        } else {
                          updateLine(line.id, { itemId: e.target.value });
                        }
                      }}
                      className="h-11 sm:h-10 w-full rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] glow-input-focus"
                    >
                      <option value="" disabled>
                        Select item...
                      </option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name} ({it.kind === 'rock' ? 'ton' : 'bag'})
                        </option>
                      ))}
                      <option value="__ADD_NEW_ITEM__">+ Add new item</option>
                    </select>
                  </div>

                  {/* Quantity */}
                  <div className="sm:col-span-3 min-w-0">
                    <TextInput
                      label="Quantity"
                      type="number"
                      inputMode="decimal"
                      step={isRock ? '0.001' : '1'}
                      min="0"
                      placeholder="0"
                      suffix={qtySuffix}
                      value={line.quantity}
                      onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                      className="tabular-nums"
                    />
                  </div>

                  {/* Rate */}
                  <div className="sm:col-span-3 min-w-0">
                    <TextInput
                      label="Rate"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      placeholder="0"
                      suffix={rateSuffix}
                      value={line.rate}
                      onChange={(e) => updateLine(line.id, { rate: e.target.value })}
                      className="tabular-nums pr-20"
                    />
                  </div>

                  {/* Automatic Line Amount & Remove */}
                  <div className="sm:col-span-2 flex items-center justify-between sm:justify-end gap-2 h-11 sm:h-10">
                    <div className="text-right min-w-0">
                      <span className="block sm:hidden text-xs text-[var(--text-muted)]">Amount</span>
                      <span className="font-heading text-sm font-semibold text-[var(--text)] tabular-nums truncate">
                        {formatMoney(line.amount)}
                      </span>
                    </div>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(line.id)}
                        aria-label="Remove item row"
                        className="h-9 w-9 inline-flex items-center justify-center rounded-[6px] text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-colors shrink-0 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Totals, Paid Now, and Remaining Balance */}
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <span className="text-xs font-medium text-[var(--text-muted)]">Total amount</span>
            <div className="mt-1 font-heading text-lg font-semibold text-[var(--brand)] tabular-nums">
              {formatMoney(totalAmount)}
            </div>
          </div>

          <MoneyInput
            label="Paid now"
            placeholder="0"
            value={paidNow}
            onChange={(e) => setPaidNow(e.target.value)}
          />

          <div className="sm:text-right">
            <span className="text-xs font-medium text-[var(--text-muted)]">Remaining balance</span>
            <div className="mt-1 font-heading text-lg font-semibold text-[var(--text)] tabular-nums">
              {formatMoney(remainingBalance)}
            </div>
          </div>
        </div>

        {/* More details (Supplier bill #, Driver, Notes) */}
        <MoreDetailsSection title="More details">
          <TextInput
            label="Supplier bill #"
            placeholder="e.g. SUP-9821"
            value={supplierBillNumber}
            onChange={(e) => setSupplierBillNumber(e.target.value)}
          />
          <TextInput
            label="Driver name"
            placeholder="e.g. Tariq Khan"
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
          />
          <div className="sm:col-span-2">
            <TextArea
              label="Notes"
              placeholder="Delivery notes, terms, or quality remarks"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </MoreDetailsSection>
      </form>
    </Dialog>
  );
};
