import { Ban } from 'lucide-react';
import React from 'react';
import { PrintLayout } from '../../components/print/PrintLayout';
import { Dialog } from '../../components/shared/Dialog';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { Button } from '../../components/ui/Button';
import type { CompanySettings, ProductionBatch } from '../../domain/types';
import {
  amountInWords,
  formatBags,
  formatDate,
  formatMoney,
  formatTon,
} from '../../lib/format';
import { buildBatchPrintMeta } from './productionHelpers';

interface BatchDetailDialogProps {
  batch: ProductionBatch | null;
  settings?: CompanySettings | null;
  companyId?: string;
  open: boolean;
  onClose: () => void;
  onRequestCancel?: (batch: ProductionBatch) => void;
}

export const BatchDetailDialog: React.FC<BatchDetailDialogProps> = ({
  batch,
  settings,
  companyId,
  open,
  onClose,
  onRequestCancel,
}) => {
  if (!batch) return null;

  const docMeta = buildBatchPrintMeta(batch, settings);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Batch ${batch.docNumber}`}
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <div>
            {batch.status === 'active' && onRequestCancel && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => onRequestCancel(batch)}
              >
                <Ban className="h-4 w-4" />
                <span>Cancel batch</span>
              </Button>
            )}
          </div>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <PrintLayout doc={docMeta} companyId={companyId}>
        <div className="space-y-5">
          {/* Batch Meta Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-[6px] border border-[var(--border)] p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Batch number</span>
                <span className="font-semibold text-[var(--text)] tabular-nums">
                  {batch.docNumber}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Date</span>
                <span className="font-medium text-[var(--text)] tabular-nums">
                  {formatDate(batch.date)}
                </span>
              </div>
              {batch.shift && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Shift</span>
                  <span className="font-medium text-[var(--text)]">{batch.shift}</span>
                </div>
              )}
              {batch.machine && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Machine</span>
                  <span className="font-medium text-[var(--text)]">{batch.machine}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Status</span>
                <StatusBadge status={batch.status} />
              </div>
            </div>

            <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Final product made</span>
                <span className="font-heading font-semibold text-[var(--text)] tabular-nums">
                  {formatTon(batch.finalProductTons)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Total batch cost</span>
                <span className="font-medium text-[var(--text)] tabular-nums">
                  {formatMoney(batch.totalCostSnapshot)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-[var(--border)]">
                <span className="font-medium text-[var(--brand)]">Cost per ton</span>
                <span className="font-heading font-bold text-[var(--brand)] tabular-nums">
                  {formatMoney(batch.costPerTonSnapshot)}
                </span>
              </div>
            </div>
          </div>

          {batch.status === 'cancelled' && batch.cancelReason && (
            <div className="rounded-[6px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-xs text-[var(--danger)]">
              Cancelled: {batch.cancelReason}
            </div>
          )}

          {/* Batch Inputs Table */}
          <div className="overflow-x-auto rounded-[6px] border border-[var(--border)]">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[var(--surface-subtle)] border-b border-[var(--brand)]">
                  <th className="px-3.5 py-2.5 text-left text-xs font-semibold text-[var(--brand)]">
                    Input item
                  </th>
                  <th className="px-3.5 py-2.5 text-left text-xs font-semibold text-[var(--brand)]">
                    Type
                  </th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold text-[var(--brand)]">
                    Quantity used
                  </th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold text-[var(--brand)]">
                    Average cost
                  </th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold text-[var(--brand)]">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {/* Rock Row */}
                <tr>
                  <td className="px-3.5 py-2.5 font-medium text-[var(--text)]">
                    {batch.rockItemName || 'White Rock'}
                  </td>
                  <td className="px-3.5 py-2.5 text-xs text-[var(--text-muted)]">Rock</td>
                  <td className="px-3.5 py-2.5 text-right text-[var(--text)] tabular-nums">
                    {formatTon(batch.rockTons)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right text-[var(--text-muted)] tabular-nums">
                    {formatMoney(batch.rockAvgCostSnapshot)} / ton
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-medium text-[var(--text)] tabular-nums">
                    {formatMoney(batch.rockCostSnapshot)}
                  </td>
                </tr>

                {/* Chemical Rows */}
                {(batch.chemicalUsages || []).map((chem, idx) => (
                  <tr key={`${chem.itemId}_${idx}`}>
                    <td className="px-3.5 py-2.5 font-medium text-[var(--text)]">
                      {chem.itemName}
                    </td>
                    <td className="px-3.5 py-2.5 text-xs text-[var(--text-muted)]">
                      Chemical
                    </td>
                    <td className="px-3.5 py-2.5 text-right text-[var(--text)] tabular-nums">
                      {formatBags(chem.bags)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right text-[var(--text-muted)] tabular-nums">
                      {formatMoney(chem.avgCostPerBagSnapshot)} / bag
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-medium text-[var(--text)] tabular-nums">
                      {formatMoney(chem.lineCostSnapshot)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals and Amount in Words */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-2">
            <div className="space-y-1.5 text-xs text-[var(--text-muted)] max-w-md">
              <p className="rounded-[6px] bg-[var(--surface-subtle)] border border-[var(--border)] px-3 py-2 text-[var(--text)]">
                <span className="text-[var(--text-muted)]">Total cost in words: </span>
                <span className="font-medium">
                  {amountInWords(batch.totalCostSnapshot)}
                </span>
              </p>
              {batch.notes && <p>Notes: {batch.notes}</p>}
            </div>

            <div className="w-full sm:w-64 space-y-1.5 text-sm">
              <div className="flex items-center justify-between py-1 border-b border-[var(--border)]">
                <span className="text-[var(--text-muted)]">Total input cost</span>
                <span className="font-medium text-[var(--text)] tabular-nums">
                  {formatMoney(batch.totalCostSnapshot)}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-[var(--text-muted)]">Final product made</span>
                <span className="font-medium text-[var(--text)] tabular-nums">
                  {formatTon(batch.finalProductTons)}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-t border-[var(--border)]">
                <span className="font-medium text-[var(--brand)]">Cost per ton</span>
                <span className="font-heading font-bold text-[var(--brand)] tabular-nums">
                  {formatMoney(batch.costPerTonSnapshot)}
                </span>
              </div>
            </div>
          </div>

          {/* Signatures for Print */}
          <div className="grid grid-cols-2 gap-8 pt-8 text-xs text-[var(--text-muted)]">
            <div className="border-t border-[var(--border)] pt-2 text-center">
              Production supervisor
            </div>
            <div className="border-t border-[var(--border)] pt-2 text-center">
              Authorized signature
            </div>
          </div>
        </div>
      </PrintLayout>
    </Dialog>
  );
};
