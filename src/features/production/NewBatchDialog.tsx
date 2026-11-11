import { useGSAP } from '@gsap/react';
import Decimal from 'decimal.js';
import gsap from 'gsap';
import { ChevronDown, ChevronUp, Flame, Plus, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '../../components/shared/Dialog';
import { BagInput, DatePicker, TextArea, TextInput, TonInput } from '../../components/shared/Inputs';
import { MoreDetailsSection } from '../../components/shared/MoreDetailsSection';
import { Button } from '../../components/ui/Button';
import {
  calculateProductionBatchCost,
  getInventorySnapshot,
  replayInventoryState,
  roundWeight,
  toDecimal,
} from '../../domain/engine';
import type {
  Dispatch,
  InventoryItem,
  ProductionBatch,
  Purchase,
} from '../../domain/types';
import {
  formatBags,
  formatMoney,
  formatTon,
  getTodayKarachiIsoDate,
} from '../../lib/format';
import {
  MOTION_DURATIONS,
  MOTION_EASING,
  prefersReducedMotion,
  triggerInvalidShake,
} from '../../lib/motion';
import { notify } from '../../lib/notify';
import { cn, generateId } from '../../lib/utils';
import { ProductionService, PurchaseService } from '../../services';

interface NewBatchDialogProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  items: InventoryItem[];
  purchases: Purchase[];
  batches: ProductionBatch[];
  dispatches: Dispatch[];
  editingBatch?: ProductionBatch | null;
  onSaved: (createdBatch: ProductionBatch) => Promise<void> | void;
  onItemsChanged: () => Promise<void> | void;
}

interface DraftChemicalRow {
  id: string;
  itemId: string;
  bags: string;
}

export const NewBatchDialog: React.FC<NewBatchDialogProps> = ({
  open,
  onClose,
  companyId,
  items,
  purchases,
  batches,
  dispatches,
  editingBatch,
  onSaved,
  onItemsChanged,
}) => {
  const [date, setDate] = useState<string>(() => getTodayKarachiIsoDate());
  const [rockItemId, setRockItemId] = useState<string>('');
  const [rockTons, setRockTons] = useState<string>('');
  const [chemicalRows, setChemicalRows] = useState<DraftChemicalRow[]>([]);
  const [finalProductTons, setFinalProductTons] = useState<string>('');
  const [shift, setShift] = useState<string>('');
  const [machine, setMachine] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Inline "Add new chemical" state
  const [addingChemForRowId, setAddingChemForRowId] = useState<string | null>(null);
  const [newChemName, setNewChemName] = useState('');
  const [newChemError, setNewChemError] = useState('');
  const [savingChem, setSavingChem] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);

  const rockItems = useMemo(
    () => items.filter((i) => i.kind === 'rock' && i.status === 'active'),
    [items]
  );

  const chemicalItems = useMemo(
    () => items.filter((i) => i.kind === 'chemical' && i.status === 'active'),
    [items]
  );

  useEffect(() => {
    if (open) {
      if (editingBatch) {
        setDate(editingBatch.date.slice(0, 10));
        setRockItemId(editingBatch.rockItemId || rockItems[0]?.id || '');
        setRockTons(editingBatch.rockTons);
        setChemicalRows(
          editingBatch.chemicalUsages.map((u) => ({
            id: generateId('chem'),
            itemId: u.itemId,
            bags: u.bags,
          }))
        );
        setFinalProductTons(editingBatch.finalProductTons);
        setShift(editingBatch.shift || '');
        setMachine(editingBatch.machine || '');
        setNotes(editingBatch.notes || '');
      } else {
        setDate(getTodayKarachiIsoDate());
        setRockItemId(rockItems[0]?.id || '');
        setRockTons('');
        setChemicalRows(
          chemicalItems.length > 0
            ? [{ id: generateId('chem'), itemId: chemicalItems[0].id, bags: '' }]
            : []
        );
        setFinalProductTons('');
        setShift('');
        setMachine('');
        setNotes('');
      }
      setAddingChemForRowId(null);
      setNewChemName('');
      setNewChemError('');
      setFormError(null);
      setSavedSuccess(false);
    }
  }, [open, editingBatch]);

  // Keep rockItemId synced if catalog updates
  useEffect(() => {
    if (!rockItemId && rockItems.length > 0) {
      setRockItemId(rockItems[0].id);
    }
  }, [rockItems, rockItemId]);

  const baselineBatches = useMemo(
    () => (editingBatch ? batches.filter((b) => b.id !== editingBatch.id) : batches),
    [batches, editingBatch]
  );

  // Single inventory source per 3.1
  const inventorySnapshot = useMemo(() => {
    return getInventorySnapshot({
      catalogItems: items,
      purchases,
      batches: baselineBatches,
      dispatches,
      asOfDate: date,
    });
  }, [items, purchases, baselineBatches, dispatches, date]);

  const overallInventorySnapshot = useMemo(() => {
    return getInventorySnapshot({
      catalogItems: items,
      purchases,
      batches: baselineBatches,
      dispatches,
    });
  }, [items, purchases, baselineBatches, dispatches]);

  const currentRockItem = useMemo(
    () => rockItems.find((r) => r.id === rockItemId) || rockItems[0],
    [rockItems, rockItemId]
  );

  const availableRockStock = useMemo(() => {
    if (!currentRockItem) return new Decimal(0);
    const snapItem = inventorySnapshot.rockItems.find((r) => r.itemId === currentRockItem.id);
    const overallItem = overallInventorySnapshot.rockItems.find((r) => r.itemId === currentRockItem.id);
    const snapStock = snapItem ? snapItem.stock : new Decimal(0);
    const overallStock = overallItem ? overallItem.stock : new Decimal(0);
    return Decimal.min(snapStock, overallStock);
  }, [currentRockItem, inventorySnapshot, overallInventorySnapshot]);

  const getChemicalAvailableBags = useCallback(
    (itemId: string) => {
      if (!itemId) return new Decimal(0);
      const snapItem = inventorySnapshot.chemicalItems.find((c) => c.itemId === itemId);
      const overallItem = overallInventorySnapshot.chemicalItems.find((c) => c.itemId === itemId);
      const snapStock = snapItem ? snapItem.stock : new Decimal(0);
      const overallStock = overallItem ? overallItem.stock : new Decimal(0);
      return Decimal.min(snapStock, overallStock);
    },
    [inventorySnapshot, overallInventorySnapshot]
  );

  // Live calculation of Cost per ton
  const liveCostPerTon = useMemo(() => {
    const rockSnap = inventorySnapshot.rockItems.find((r) => r.itemId === currentRockItem?.id);
    const rockAvg = rockSnap?.rawAvgCost ?? new Decimal(0);

    const calc = calculateProductionBatchCost({
      rockTons: rockTons || 0,
      rockAvgCost: rockAvg,
      chemicals: chemicalRows
        .filter((r) => r.itemId && toDecimal(r.bags).gt(0))
        .map((r) => {
          const st = inventorySnapshot.chemicalItems.find((c) => c.itemId === r.itemId);
          const itemObj = items.find((i) => i.id === r.itemId);
          return {
            itemId: r.itemId,
            itemName: itemObj?.name || st?.itemName || 'Chemical',
            bags: r.bags,
            avgCostPerBag: st?.rawAvgCost ?? new Decimal(0),
          };
        }),
      finalProductTons: finalProductTons || 0,
    });

    return calc.costPerTon;
  }, [inventorySnapshot, currentRockItem, rockTons, chemicalRows, finalProductTons, items]);

  // Remaining stock preview after this batch per 3.2
  const remainingRock = useMemo(() => {
    const used = roundWeight(rockTons || 0);
    return roundWeight(availableRockStock.minus(used));
  }, [availableRockStock, rockTons]);

  const chemicalRemainingList = useMemo(() => {
    const usedMap = new Map<string, Decimal>();
    for (const r of chemicalRows) {
      if (!r.itemId) continue;
      const bags = roundWeight(r.bags || 0);
      const prev = usedMap.get(r.itemId) || new Decimal(0);
      usedMap.set(r.itemId, roundWeight(prev.plus(bags)));
    }
    const list: Array<{
      itemId: string;
      itemName: string;
      available: Decimal;
      used: Decimal;
      remaining: Decimal;
    }> = [];
    for (const [id, used] of usedMap.entries()) {
      const item = items.find((i) => i.id === id);
      const available = getChemicalAvailableBags(id);
      list.push({
        itemId: id,
        itemName: item?.name || 'Chemical',
        available,
        used,
        remaining: roundWeight(available.minus(used)),
      });
    }
    return list;
  }, [chemicalRows, items, getChemicalAvailableBags]);

  const newPowderTotal = useMemo(() => {
    const currentPowder = inventorySnapshot.powder.stock;
    const added = roundWeight(finalProductTons || 0);
    return roundWeight(currentPowder.plus(added));
  }, [inventorySnapshot.powder.stock, finalProductTons]);

  // Live stock shortages naming every short item and the shortage
  const liveShortages = useMemo(() => {
    const list: Array<{
      itemName: string;
      shortage: string;
      unit: 'ton' | 'bag';
    }> = [];

    const neededRock = roundWeight(rockTons || 0);
    if (neededRock.gt(availableRockStock)) {
      const diff = roundWeight(neededRock.minus(availableRockStock));
      list.push({
        itemName: currentRockItem?.name || 'White Rock',
        shortage: diff.toString(),
        unit: 'ton',
      });
    }

    for (const cr of chemicalRemainingList) {
      if (cr.used.gt(cr.available)) {
        const diff = roundWeight(cr.used.minus(cr.available));
        list.push({
          itemName: cr.itemName,
          shortage: diff.toString(),
          unit: 'bag',
        });
      }
    }

    return list;
  }, [rockTons, availableRockStock, currentRockItem, chemicalRemainingList]);

  const handleAddChemicalRow = () => {
    const defaultItemId = chemicalItems[0]?.id || '';
    setChemicalRows((prev) => [
      ...prev,
      { id: generateId('chem'), itemId: defaultItemId, bags: '' },
    ]);
  };

  const handleRemoveChemicalRow = (id: string) => {
    setChemicalRows((prev) => prev.filter((r) => r.id !== id));
    if (addingChemForRowId === id) {
      setAddingChemForRowId(null);
    }
  };

  const handleUpdateChemicalRow = (
    id: string,
    patch: Partial<DraftChemicalRow>
  ) => {
    setChemicalRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
    setFormError(null);
  };

  const handleCreateInlineChemical = async (rowId: string) => {
    const trimmed = newChemName.trim();
    if (!trimmed) {
      setNewChemError('Enter the chemical name.');
      return;
    }
    setSavingChem(true);
    setNewChemError('');
    try {
      const created = await PurchaseService.createItemInline(
        companyId,
        trimmed,
        'chemical'
      );
      await onItemsChanged();
      handleUpdateChemicalRow(rowId, { itemId: created.id });
      setAddingChemForRowId(null);
      setNewChemName('');
      notify.success(`Added chemical "${created.name}".`);
    } catch (err) {
      setNewChemError(
        err instanceof Error ? err.message : 'Could not add chemical.'
      );
    } finally {
      setSavingChem(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!date) {
      setFormError('Select the batch date.');
      triggerInvalidShake(formRef.current);
      return;
    }

    const parsedRockTons = roundWeight(rockTons);
    if (parsedRockTons.lte(0)) {
      setFormError('Enter the rock used in tons (greater than 0).');
      triggerInvalidShake(formRef.current);
      return;
    }

    const parsedFinalTons = roundWeight(finalProductTons);
    if (parsedFinalTons.lte(0)) {
      setFormError('Enter the final product made in tons (greater than 0).');
      triggerInvalidShake(formRef.current);
      return;
    }

    // Validate chemical rows
    for (let i = 0; i < chemicalRows.length; i++) {
      const row = chemicalRows[i];
      const hasBags = row.bags.trim() !== '' && toDecimal(row.bags).gt(0);
      if (hasBags && !row.itemId) {
        setFormError(`Row ${i + 1}: Select a chemical.`);
        triggerInvalidShake(formRef.current);
        return;
      }
      if (row.itemId && (!row.bags.trim() || toDecimal(row.bags).lte(0))) {
        const chemName =
          items.find((it) => it.id === row.itemId)?.name || `Row ${i + 1}`;
        setFormError(`Enter the bags used for ${chemName} (or remove the row).`);
        triggerInvalidShake(formRef.current);
        return;
      }
    }

    // Blocking validation: not enough rock or chemical stock names every short item and the shortage
    if (parsedRockTons.gt(availableRockStock)) {
      setFormError(
        `Not enough stock — only ${formatTon(availableRockStock)} available for ${currentRockItem?.name || 'Rock'}.`
      );
      triggerInvalidShake(formRef.current);
      return;
    }

    for (const cr of chemicalRemainingList) {
      if (cr.used.gt(cr.available)) {
        setFormError(
          `Not enough stock — only ${formatBags(cr.available)} available for ${cr.itemName}.`
        );
        triggerInvalidShake(formRef.current);
        return;
      }
    }

    if (liveShortages.length > 0) {
      const details = liveShortages
        .map((s) => `${s.itemName} (short by ${s.shortage} ${s.unit === 'ton' ? 'ton' : 'bags'})`)
        .join(', ');
      setFormError(`Not enough stock — ${details}.`);
      triggerInvalidShake(formRef.current);
      return;
    }

    setSaving(true);
    try {
      let targetRockItem =
        rockItems.find((r) => r.id === rockItemId) || rockItems[0];
      if (!targetRockItem) {
        targetRockItem = await PurchaseService.createItemInline(
          companyId,
          'White Rock',
          'rock'
        );
        await onItemsChanged();
      }

      // Merge chemical rows that refer to the same chemical item
      const mergedChemicalsMap = new Map<
        string,
        { itemId: string; itemName: string; bags: Decimal }
      >();

      for (const row of chemicalRows) {
        const bagsDec = roundWeight(row.bags);
        if (!row.itemId || bagsDec.lte(0)) continue;
        const chemItem = items.find((i) => i.id === row.itemId);
        const existing = mergedChemicalsMap.get(row.itemId);
        if (existing) {
          existing.bags = roundWeight(existing.bags.plus(bagsDec));
        } else {
          mergedChemicalsMap.set(row.itemId, {
            itemId: row.itemId,
            itemName: chemItem?.name || 'Chemical',
            bags: bagsDec,
          });
        }
      }

      const payload = {
        date,
        rockItemId: targetRockItem.id,
        rockItemName: targetRockItem.name,
        rockTons: parsedRockTons.toString(),
        chemicalUsages: Array.from(mergedChemicalsMap.values()).map((c) => ({
          itemId: c.itemId,
          itemName: c.itemName,
          bags: c.bags.toString(),
          avgCostPerBagSnapshot: '0',
          lineCostSnapshot: '0',
        })),
        finalProductTons: parsedFinalTons.toString(),
        shift: shift.trim() || undefined,
        machine: machine.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      const saved = editingBatch
        ? await ProductionService.updateBatch(companyId, editingBatch.id, payload)
        : await ProductionService.createBatch(companyId, payload);

      setSavedSuccess(true);
      notify.success(
        `${saved.docNumber} ${editingBatch ? 'updated' : 'saved'}. Cost per ton: ${formatMoney(saved.costPerTonSnapshot)}`
      );

      await onSaved(saved);
      setTimeout(() => {
        onClose();
      }, 240);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Could not save batch.'
      );
      triggerInvalidShake(formRef.current);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={saving ? () => {} : onClose}
      icon={<Flame className="h-4 w-4" />}
      title={editingBatch ? `Edit ${editingBatch.docNumber}` : 'New batch'}
      maxWidth="lg"
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
            form="new-batch-form"
            variant="primary"
            loading={saving}
            saved={savedSuccess}
          >
            {editingBatch ? 'Save changes' : 'Save batch'}
          </Button>
        </>
      }
    >
      <form
        id="new-batch-form"
        ref={formRef}
        onSubmit={handleSubmit}
        className="space-y-5"
        noValidate
      >
        {formError && (
          <div
            role="alert"
            className="rounded-[6px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-xs font-medium text-[var(--danger)]"
          >
            {formError}
          </div>
        )}

        {/* Date & Rock used (tons) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DatePicker
            label="Date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setFormError(null);
            }}
          />

          <div className="space-y-2">
            {rockItems.length > 1 && (
              <div>
                <label className="block text-[13px] font-medium text-[var(--text)] mb-1">
                  Rock item
                </label>
                <select
                  value={rockItemId}
                  onChange={(e) => {
                    setRockItemId(e.target.value);
                    setFormError(null);
                  }}
                  className="w-full min-h-[44px] rounded-[6px] border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] glow-input-focus"
                >
                  {rockItems.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1.5 min-w-0">
              <div className="flex items-center justify-between text-sm">
                <label className="font-medium text-[var(--text)]">Rock used</label>
                <span className="text-xs font-medium text-[var(--text-muted)] tabular-nums">
                  Available: {formatTon(availableRockStock)}
                </span>
              </div>
              <TonInput
                placeholder="0"
                value={rockTons}
                onChange={(e) => {
                  setRockTons(e.target.value);
                  setFormError(null);
                }}
              />
            </div>
          </div>
        </div>

        {/* Chemicals used (rows: chemical dropdown, bags, with "Add chemical") */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-medium text-[var(--text)]">
              Chemicals used
            </label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleAddChemicalRow}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add chemical</span>
            </Button>
          </div>

          {chemicalRows.length === 0 ? (
            <div className="rounded-[6px] border border-dashed border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-xs text-[var(--text-muted)] flex items-center justify-between">
              <span>No chemicals added for this batch.</span>
              <button
                type="button"
                onClick={handleAddChemicalRow}
                className="font-medium text-[var(--brand)] hover:underline"
              >
                + Add chemical
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {chemicalRows.map((row) => (
                <div
                  key={row.id}
                  className="rounded-[6px] border border-[var(--border)] bg-white p-3 space-y-2.5"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                    {/* Chemical dropdown */}
                    <div className="sm:col-span-7">
                      <label className="block sm:hidden text-xs font-medium text-[var(--text-muted)] mb-1">
                        Chemical
                      </label>
                      <select
                        aria-label="Chemical"
                        value={
                          addingChemForRowId === row.id
                            ? '__ADD_NEW__'
                            : row.itemId
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '__ADD_NEW__') {
                            setAddingChemForRowId(row.id);
                            setNewChemName('');
                            setNewChemError('');
                          } else {
                            setAddingChemForRowId(null);
                            handleUpdateChemicalRow(row.id, { itemId: val });
                          }
                        }}
                        className="w-full min-h-[44px] rounded-[6px] border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] glow-input-focus"
                      >
                        <option value="">Select chemical...</option>
                        {chemicalItems.map((chem) => (
                          <option key={chem.id} value={chem.id}>
                            {chem.name}
                          </option>
                        ))}
                        <option value="__ADD_NEW__">+ Add new chemical</option>
                      </select>
                    </div>

                    {/* Bags input with available bags next to it */}
                    <div className="sm:col-span-4">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-[var(--text-muted)]">Bags</span>
                        {row.itemId && (
                          <span className="text-[11px] font-medium text-[var(--text-muted)] tabular-nums">
                            Available: {formatBags(getChemicalAvailableBags(row.itemId))}
                          </span>
                        )}
                      </div>
                      <BagInput
                        aria-label="Chemical bags"
                        placeholder="0"
                        value={row.bags}
                        onChange={(e) =>
                          handleUpdateChemicalRow(row.id, {
                            bags: e.target.value,
                          })
                        }
                      />
                    </div>

                    {/* Remove row */}
                    <div className="sm:col-span-1 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => handleRemoveChemicalRow(row.id)}
                        aria-label="Remove chemical row"
                        className="inline-flex h-11 w-11 items-center justify-center rounded-[6px] text-[var(--text-muted)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)] transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Inline "Add new chemical" panel */}
                  {addingChemForRowId === row.id && (
                    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3 space-y-2.5">
                      <p className="text-xs font-semibold text-[var(--brand)]">
                        Add new chemical
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="flex-1">
                          <TextInput
                            placeholder="Chemical name"
                            value={newChemName}
                            onChange={(e) => {
                              setNewChemName(e.target.value);
                              setNewChemError('');
                            }}
                            error={newChemError}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setAddingChemForRowId(null)}
                            disabled={savingChem}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            loading={savingChem}
                            onClick={() => handleCreateInlineChemical(row.id)}
                          >
                            Add chemical
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Final product made (tons) */}
        <div>
          <TonInput
            label="Final product made"
            placeholder="0"
            value={finalProductTons}
            onChange={(e) => {
              setFinalProductTons(e.target.value);
              setFormError(null);
            }}
          />
        </div>

        {/* Live blocking stock shortage banner naming every short item and the shortage */}
        {liveShortages.length > 0 && (
          <div
            role="alert"
            className="rounded-[6px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-xs text-[var(--danger)] space-y-1"
          >
            <p className="font-semibold">Not enough stock for this batch:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {liveShortages.map((s) => (
                <li key={s.itemName} className="tabular-nums">
                  <span className="font-medium">{s.itemName}</span>: short by{' '}
                  <span className="font-semibold">
                    {s.shortage}{' '}
                    {s.unit === 'ton'
                      ? 'ton'
                      : Number(s.shortage) === 1
                        ? 'bag'
                        : 'bags'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Remaining after this batch (per 3.2) */}
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text)]">
              Remaining after this batch
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">Stock preview</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            {/* Rock remaining */}
            <div className="rounded-[6px] border border-[var(--border)] bg-white p-2.5">
              <div className="text-[11px] text-[var(--text-muted)] truncate">{currentRockItem?.name || 'Rock'}</div>
              <div
                className={cn(
                  'font-heading font-semibold tabular-nums mt-0.5 text-sm',
                  remainingRock.lt(0) ? 'text-[var(--danger)]' : 'text-[var(--text)]'
                )}
              >
                {remainingRock.lt(0)
                  ? `Short by ${formatTon(remainingRock.abs())}`
                  : formatTon(remainingRock)}
              </div>
            </div>

            {/* Chemicals remaining */}
            <div className="rounded-[6px] border border-[var(--border)] bg-white p-2.5">
              <div className="text-[11px] text-[var(--text-muted)]">Chemicals</div>
              <div className="mt-0.5 space-y-1">
                {chemicalRemainingList.length === 0 ? (
                  <span className="text-[var(--text-muted)] italic">None added</span>
                ) : (
                  chemicalRemainingList.map((c) => (
                    <div
                      key={c.itemId}
                      className="flex justify-between items-center text-xs tabular-nums"
                    >
                      <span className="truncate pr-1 text-[var(--text)]">{c.itemName}</span>
                      <span
                        className={cn(
                          'font-medium shrink-0',
                          c.remaining.lt(0) ? 'text-[var(--danger)] font-semibold' : 'text-[var(--text)]'
                        )}
                      >
                        {c.remaining.lt(0)
                          ? `Short ${formatBags(c.remaining.abs())}`
                          : formatBags(c.remaining)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Final powder made / new total */}
            <div className="rounded-[6px] border border-[var(--border)] bg-white p-2.5">
              <div className="text-[11px] text-[var(--text-muted)]">Final powder stock</div>
              <div className="font-heading font-semibold text-[var(--brand)] tabular-nums mt-0.5 text-sm">
                {formatTon(newPowderTotal)}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] tabular-nums mt-0.5">
                {roundWeight(finalProductTons || 0).gt(0)
                  ? `(+${formatTon(finalProductTons)})`
                  : 'Current in stock'}
              </div>
            </div>
          </div>
        </div>

        {/* More details (Shift, Machine, Notes) */}
        <MoreDetailsSection title="More details">
          <TextInput
            label="Shift"
            placeholder="e.g. Day / Night"
            value={shift}
            onChange={(e) => setShift(e.target.value)}
          />
          <TextInput
            label="Machine"
            placeholder="e.g. Mill #1 / Ball Mill"
            value={machine}
            onChange={(e) => setMachine(e.target.value)}
          />
          <div className="sm:col-span-2">
            <TextArea
              label="Notes"
              placeholder="Optional batch or quality notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </MoreDetailsSection>

        {/* One small live result line: "Cost per ton" (nothing else) */}
        <div className="flex items-center justify-between rounded-[6px] border border-[var(--border)] bg-[var(--surface-subtle)] px-3.5 py-2.5 text-sm">
          <span className="font-medium text-[var(--text-muted)]">Cost per ton</span>
          <span className="font-heading font-semibold text-[var(--brand)] tabular-nums">
            {formatMoney(liveCostPerTon)}
          </span>
        </div>
      </form>
    </Dialog>
  );
};
