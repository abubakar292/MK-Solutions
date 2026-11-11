import Decimal from 'decimal.js';
import { Ban } from 'lucide-react';
import React from 'react';
import { PrintLayout } from '../../components/print/PrintLayout';
import { Dialog } from '../../components/shared/Dialog';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { Button } from '../../components/ui/Button';
import type {
  CompanySettings,
  Supplier,
  SupplierPayment,
} from '../../domain/types';
import {
  amountInWords,
  formatDate,
  formatMoney,
} from '../../lib/format';
import { formatPaymentMethod } from '../customers/customerHelpers';
import {
  buildSupplierPaymentReceiptPrintMeta,
  formatSupplierRunningBalanceLabel,
} from './purchaseHelpers';

export interface SupplierPaymentReceiptDialogProps {
  payment: SupplierPayment | null;
  supplier?: Supplier | null;
  settings?: CompanySettings | null;
  companyId?: string;
  balanceBefore?: Decimal;
  balanceAfter?: Decimal;
  open: boolean;
  onClose: () => void;
  onRequestCancel?: (payment: SupplierPayment) => void;
}

export const SupplierPaymentReceiptDialog: React.FC<
  SupplierPaymentReceiptDialogProps
> = ({
  payment,
  supplier,
  settings,
  companyId,
  balanceBefore,
  balanceAfter,
  open,
  onClose,
  onRequestCancel,
}) => {
  if (!payment) return null;

  const docMeta = buildSupplierPaymentReceiptPrintMeta(
    payment,
    supplier,
    settings,
    {
      balanceBefore,
      balanceAfter,
    }
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Payment voucher ${payment.docNumber}`}
      maxWidth="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between w-full gap-2">
          <div>
            {payment.status === 'active' && onRequestCancel && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => onRequestCancel(payment)}
              >
                <Ban className="h-4 w-4" />
                <span>Cancel payment</span>
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
          {payment.status === 'cancelled' && payment.cancelReason && (
            <div className="rounded-[6px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-xs text-[var(--danger)]">
              Cancelled: {payment.cancelReason}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-[6px] border border-[var(--border)] p-3.5 space-y-1.5">
              <span className="text-xs text-[var(--text-muted)]">
                Paid to supplier
              </span>
              <p className="font-semibold text-[var(--text)] text-base">
                {payment.supplierName}
              </p>
              {supplier?.phone && (
                <p className="text-xs text-[var(--text-muted)]">
                  {supplier.phone}
                </p>
              )}
              <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Method</span>
                <span className="font-semibold text-[var(--text)]">
                  {formatPaymentMethod(payment.method)}
                </span>
              </div>
            </div>

            <div className="rounded-[6px] border border-[var(--border)] p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Voucher number</span>
                <span className="font-semibold text-[var(--brand)] tabular-nums">
                  {payment.docNumber}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Date</span>
                <span className="font-medium text-[var(--text)] tabular-nums">
                  {formatDate(payment.date)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Status</span>
                <StatusBadge status={payment.status} />
              </div>
            </div>
          </div>

          <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-subtle)] p-4 space-y-2">
            {balanceBefore !== undefined && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Balance before</span>
                <span className="font-medium text-[var(--text)] tabular-nums">
                  {formatSupplierRunningBalanceLabel(balanceBefore)}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between py-1.5 border-y border-[var(--border)]">
              <span className="text-sm font-medium text-[var(--text)]">
                Amount paid
              </span>
              <span className="font-heading text-lg font-bold text-[var(--brand)] tabular-nums">
                {formatMoney(payment.amount, { alwaysShowDecimals: true })}
              </span>
            </div>

            {balanceAfter !== undefined && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">
                  {balanceAfter.lt(0) ? 'Advance after' : 'Balance after'}
                </span>
                <span className="font-semibold text-[var(--text)] tabular-nums">
                  {formatSupplierRunningBalanceLabel(balanceAfter)}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-1.5 text-xs text-[var(--text-muted)]">
            <p className="rounded-[6px] bg-[var(--surface-subtle)] border border-[var(--border)] px-3 py-2 text-[var(--text)]">
              <span className="text-[var(--text-muted)]">Amount in words: </span>
              <span className="font-medium">
                {amountInWords(payment.amount)}
              </span>
            </p>
            {payment.reference && <p>Reference: {payment.reference}</p>}
            {payment.bankName && <p>Bank: {payment.bankName}</p>}
            {payment.notes && <p>Note: {payment.notes}</p>}
          </div>

          {/* Signatures for Print */}
          <div className="grid grid-cols-2 gap-8 pt-8 text-xs text-[var(--text-muted)]">
            <div className="border-t border-[var(--border)] pt-2 text-center">
              Prepared / Paid by
            </div>
            <div className="border-t border-[var(--border)] pt-2 text-center">
              Supplier signature
            </div>
          </div>
        </div>
      </PrintLayout>
    </Dialog>
  );
};
