import React from 'react';
import { PrintLayout } from '../../components/print/PrintLayout';
import { Dialog } from '../../components/shared/Dialog';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { Button } from '../../components/ui/Button';
import type { CompanySettings, Purchase } from '../../domain/types';
import {
  amountInWords,
  formatBags,
  formatDate,
  formatMoney,
  formatTon,
} from '../../lib/format';
import {
  buildPurchaseVoucherPrintMeta,
  getPurchaseBalance,
  getPurchaseLines,
} from './purchaseHelpers';

interface PurchaseVoucherDialogProps {
  purchase: Purchase | null;
  settings?: CompanySettings | null;
  companyId?: string;
  open: boolean;
  onClose: () => void;
}

export const PurchaseVoucherDialog: React.FC<PurchaseVoucherDialogProps> = ({
  purchase,
  settings,
  companyId,
  open,
  onClose,
}) => {
  if (!purchase) return null;

  const docMeta = buildPurchaseVoucherPrintMeta(purchase, settings);
  const lines = getPurchaseLines(purchase);
  const balance = getPurchaseBalance(purchase);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Purchase ${purchase.docNumber}`}
      maxWidth="lg"
      footer={
        <Button type="button" variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <PrintLayout doc={docMeta} companyId={companyId}>
        <div className="space-y-5">
          {/* Voucher Meta Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-[6px] border border-[var(--border)] p-3.5 space-y-1">
              <span className="text-xs text-[var(--text-muted)]">Supplier</span>
              <p className="font-semibold text-[var(--text)]">{purchase.supplierName}</p>
            </div>
            <div className="rounded-[6px] border border-[var(--border)] p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Date</span>
                <span className="font-medium text-[var(--text)] tabular-nums">
                  {formatDate(purchase.date)}
                </span>
              </div>
              {purchase.vehicleNumber && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Vehicle number</span>
                  <span className="font-medium text-[var(--text)]">
                    {purchase.vehicleNumber}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Status</span>
                <StatusBadge status={purchase.status} />
              </div>
            </div>
          </div>

          {purchase.status === 'cancelled' && purchase.cancelReason && (
            <div className="rounded-[6px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-xs text-[var(--danger)]">
              Cancelled: {purchase.cancelReason}
            </div>
          )}

          {/* Line Items Table */}
          <div className="overflow-x-auto rounded-[6px] border border-[var(--border)]">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[var(--surface-subtle)] border-b border-[var(--brand)]">
                  <th className="px-3.5 py-2.5 text-left text-xs font-semibold text-[var(--brand)]">
                    Item
                  </th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold text-[var(--brand)]">
                    Quantity
                  </th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold text-[var(--brand)]">
                    Rate
                  </th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold text-[var(--brand)]">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-3.5 py-2.5 text-[var(--text)] font-medium">
                      {line.itemName}
                    </td>
                    <td className="px-3.5 py-2.5 text-right text-[var(--text)] tabular-nums">
                      {line.kind === 'rock'
                        ? formatTon(line.quantity)
                        : formatBags(line.quantity)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right text-[var(--text)] tabular-nums">
                      {line.kind === 'rock'
                        ? `${formatMoney(line.rate)} / ton`
                        : `${formatMoney(line.rate)} / bag`}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-medium text-[var(--text)] tabular-nums">
                      {formatMoney(line.amount)}
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
                <span className="text-[var(--text-muted)]">In words: </span>
                <span className="font-medium">{amountInWords(purchase.totalAmount)}</span>
              </p>
              {purchase.notes && <p>Notes: {purchase.notes}</p>}
            </div>

            <div className="w-full sm:w-64 space-y-1.5 text-sm">
              <div className="flex items-center justify-between py-1 border-b border-[var(--border)]">
                <span className="text-[var(--text-muted)]">Total</span>
                <span className="font-heading font-semibold text-[var(--brand)] tabular-nums">
                  {formatMoney(purchase.totalAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-[var(--text-muted)]">Paid now</span>
                <span className="font-medium text-[var(--text)] tabular-nums">
                  {formatMoney(purchase.paidNow ?? 0)}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-t border-[var(--border)]">
                <span className="font-medium text-[var(--text)]">Balance</span>
                <span className="font-heading font-semibold text-[var(--text)] tabular-nums">
                  {formatMoney(balance)}
                </span>
              </div>
            </div>
          </div>

          {/* Signatures for Print */}
          <div className="grid grid-cols-2 gap-8 pt-8 text-xs text-[var(--text-muted)]">
            <div className="border-t border-[var(--border)] pt-2 text-center">
              Prepared by
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
