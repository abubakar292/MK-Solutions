import { Ban, Lock } from 'lucide-react';
import React from 'react';
import { PrintLayout } from '../../components/print/PrintLayout';
import { Dialog } from '../../components/shared/Dialog';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { Button } from '../../components/ui/Button';
import type {
  Bill,
  BillPaymentStatus,
  CompanySettings,
} from '../../domain/types';
import {
  amountInWords,
  formatBags,
  formatDate,
  formatDateTime,
  formatMoney,
  formatTon,
} from '../../lib/format';
import { buildBillPrintMeta } from '../dispatch/dispatchHelpers';

interface BillDetailDialogProps {
  bill: Bill | null;
  allocation?: {
    paidAmount: string;
    remainingAmount: string;
    paymentStatus: BillPaymentStatus;
  };
  settings?: CompanySettings | null;
  companyId?: string;
  open: boolean;
  onClose: () => void;
  onRequestCancel?: (bill: Bill) => void;
}

export const BillDetailDialog: React.FC<BillDetailDialogProps> = ({
  bill,
  allocation,
  settings,
  companyId,
  open,
  onClose,
  onRequestCancel,
}) => {
  if (!bill) return null;

  const docMeta = buildBillPrintMeta(bill, settings, allocation);
  const badgeStatus =
    bill.status === 'cancelled'
      ? 'cancelled'
      : allocation?.paymentStatus || 'unpaid';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Bill ${bill.docNumber}`}
      maxWidth="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between w-full gap-2">
          <div className="flex items-center gap-2">
            {bill.status === 'active' && onRequestCancel && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => onRequestCancel(bill)}
              >
                <Ban className="h-4 w-4" />
                <span>Cancel bill</span>
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
          {/* Locked Bill Notice */}
          <div className="no-print flex items-center justify-between rounded-[6px] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2 text-xs text-[var(--text-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-[var(--brand)]" />
              <span>
                This bill is locked. To change weights or rate, cancel this bill (which returns {bill.dispatchDocNumber} to Sent).
              </span>
            </span>
          </div>

          {bill.status === 'cancelled' && bill.cancelReason && (
            <div className="rounded-[6px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-xs text-[var(--danger)]">
              Cancelled: {bill.cancelReason}
            </div>
          )}

          {/* Customer & Dispatch Header Grid per A10 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-[6px] border border-[var(--border)] p-3.5 space-y-1.5">
              <span className="text-xs text-[var(--text-muted)]">Bill to</span>
              <p className="font-semibold text-[var(--text)] text-base">
                {bill.customerName}
              </p>
              {bill.customerAddress && (
                <p className="text-xs text-[var(--text-muted)]">{bill.customerAddress}</p>
              )}
              <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Vehicle number</span>
                <span className="font-semibold text-[var(--text)]">
                  {bill.vehicleNumber}
                </span>
              </div>
              {bill.driverName && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Driver name</span>
                  <span className="font-medium text-[var(--text)]">
                    {bill.driverName}
                  </span>
                </div>
              )}
            </div>

            <div className="rounded-[6px] border border-[var(--border)] p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Bill number</span>
                <span className="font-semibold text-[var(--brand)] tabular-nums">
                  {bill.docNumber}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Bill date</span>
                <span className="font-medium text-[var(--text)] tabular-nums">
                  {formatDate(bill.date)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Dispatch number</span>
                <span className="font-medium text-[var(--text)] tabular-nums">
                  {bill.dispatchDocNumber}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Dispatch date & time</span>
                <span className="font-medium text-[var(--text)] tabular-nums">
                  {formatDateTime(bill.dispatchDateTime)}
                </span>
              </div>
              {bill.weightSlipNumber && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Weight slip #</span>
                  <span className="font-medium text-[var(--text)] tabular-nums">
                    {bill.weightSlipNumber}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-[var(--text-muted)]">Payment status</span>
                <StatusBadge status={badgeStatus} />
              </div>
            </div>
          </div>

          {/* Bill Line Table */}
          <div className="overflow-x-auto rounded-[6px] border border-[var(--border)]">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[var(--surface-subtle)] border-b border-[var(--brand)]">
                  <th className="px-3.5 py-2.5 text-left text-xs font-semibold text-[var(--brand)]">
                    Product
                  </th>
                  {bill.bagsCount && bill.bagsCount > 0 ? (
                    <th className="px-3.5 py-2.5 text-right text-xs font-semibold text-[var(--brand)]">
                      Bags
                    </th>
                  ) : null}
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold text-[var(--brand)]">
                    Received weight
                  </th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold text-[var(--brand)]">
                    Rate per ton
                  </th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold text-[var(--brand)]">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3.5 py-2.5 font-medium text-[var(--text)]">
                    Final Powder
                  </td>
                  {bill.bagsCount && bill.bagsCount > 0 ? (
                    <td className="px-3.5 py-2.5 text-right text-[var(--text)] tabular-nums">
                      {formatBags(bill.bagsCount)}
                    </td>
                  ) : null}
                  <td className="px-3.5 py-2.5 text-right font-semibold text-[var(--text)] tabular-nums">
                    {formatTon(bill.receivedWeightTons)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right text-[var(--text)] tabular-nums">
                    {formatMoney(bill.ratePerTon)} / ton
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-heading font-semibold text-[var(--text)] tabular-nums">
                    {formatMoney(bill.subtotal ?? bill.totalAmount, { alwaysShowDecimals: true })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Totals and Amount in Words */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-2">
            <div className="space-y-1.5 text-xs text-[var(--text-muted)] max-w-md">
              <p className="rounded-[6px] bg-[var(--surface-subtle)] border border-[var(--border)] px-3 py-2 text-[var(--text)]">
                <span className="text-[var(--text-muted)]">Amount in words: </span>
                <span className="font-medium">
                  {amountInWords(bill.totalAmount)}
                </span>
              </p>
              {bill.remarks && <p>Remarks: {bill.remarks}</p>}
              {bill.notes && <p>Notes: {bill.notes}</p>}
            </div>

            <div className="w-full sm:w-64 space-y-1.5 text-sm">
              {bill.discount && Number(bill.discount) > 0 && (
                <>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-[var(--text-muted)]">Subtotal</span>
                    <span className="font-medium text-[var(--text)] tabular-nums">
                      {formatMoney(bill.subtotal, { alwaysShowDecimals: true })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1 text-[var(--brand)]">
                    <span>Discount</span>
                    <span className="font-medium tabular-nums">
                      - {formatMoney(bill.discount, { alwaysShowDecimals: true })}
                    </span>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between py-1 border-b border-[var(--border)]">
                <span className="text-[var(--text-muted)]">Total bill</span>
                <span className="font-heading font-bold text-[var(--brand)] tabular-nums">
                  {formatMoney(bill.totalAmount, { alwaysShowDecimals: true })}
                </span>
              </div>
              {allocation && (
                <>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-[var(--text-muted)]">Paid</span>
                    <span className="font-medium text-[var(--text)] tabular-nums">
                      {formatMoney(allocation.paidAmount, {
                        alwaysShowDecimals: true,
                      })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-t border-[var(--border)]">
                    <span className="font-medium text-[var(--text)]">Balance</span>
                    <span className="font-heading font-semibold text-[var(--text)] tabular-nums">
                      {formatMoney(allocation.remainingAmount, {
                        alwaysShowDecimals: true,
                      })}
                    </span>
                  </div>
                </>
              )}
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
