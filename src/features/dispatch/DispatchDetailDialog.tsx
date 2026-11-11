import { Ban, Edit2, Eye, Scale } from 'lucide-react';
import React from 'react';
import { PrintLayout } from '../../components/print/PrintLayout';
import { Dialog } from '../../components/shared/Dialog';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { Button } from '../../components/ui/Button';
import type { CompanySettings, Dispatch } from '../../domain/types';
import {
  formatBags,
  formatDateTime,
  formatMoney,
  formatTon,
} from '../../lib/format';
import {
  buildDispatchPrintMeta,
  type DispatchDisplayStatus,
} from './dispatchHelpers';

interface DispatchDetailDialogProps {
  dispatch: Dispatch | null;
  displayStatus: DispatchDisplayStatus;
  settings?: CompanySettings | null;
  companyId?: string;
  open: boolean;
  onClose: () => void;
  onAddReceivedWeight?: (dispatch: Dispatch) => void;
  onEditDispatch?: (dispatch: Dispatch) => void;
  onRequestCancel?: (dispatch: Dispatch) => void;
  onViewBill?: (billId: string) => void;
}

export const DispatchDetailDialog: React.FC<DispatchDetailDialogProps> = ({
  dispatch,
  displayStatus,
  settings,
  companyId,
  open,
  onClose,
  onAddReceivedWeight,
  onEditDispatch,
  onRequestCancel,
  onViewBill,
}) => {
  if (!dispatch) return null;

  const statusLabel =
    displayStatus === 'sold'
      ? 'Sold'
      : displayStatus === 'cancelled'
        ? 'Cancelled'
        : 'Sent';

  const docMeta = buildDispatchPrintMeta(dispatch, settings, statusLabel);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Dispatch ${dispatch.docNumber}`}
      maxWidth="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between w-full gap-2">
          <div className="flex items-center gap-2">
            {displayStatus === 'sent' && onAddReceivedWeight && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  onClose();
                  onAddReceivedWeight(dispatch);
                }}
              >
                <Scale className="h-4 w-4" />
                <span>Add weight and rate</span>
              </Button>
            )}
            {displayStatus === 'sent' && onEditDispatch && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  onClose();
                  onEditDispatch(dispatch);
                }}
              >
                <Edit2 className="h-4 w-4" />
                <span>Edit dispatch</span>
              </Button>
            )}
            {displayStatus === 'sent' && onRequestCancel && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => onRequestCancel(dispatch)}
              >
                <Ban className="h-4 w-4" />
                <span>Cancel dispatch</span>
              </Button>
            )}
            {displayStatus === 'sold' && dispatch.billId && onViewBill && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  onClose();
                  onViewBill(dispatch.billId!);
                }}
              >
                <Eye className="h-4 w-4" />
                <span>View bill {dispatch.billDocNumber ? `(${dispatch.billDocNumber})` : ''}</span>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-[6px] border border-[var(--border)] p-3.5 space-y-1.5">
              <span className="text-xs text-[var(--text-muted)]">Customer</span>
              <p className="font-semibold text-[var(--text)]">
                {dispatch.customerName}
              </p>
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-[var(--text-muted)]">Vehicle number</span>
                <span className="font-semibold text-[var(--text)]">
                  {dispatch.vehicleNumber}
                </span>
              </div>
              {dispatch.driverName && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Driver name</span>
                  <span className="font-medium text-[var(--text)]">
                    {dispatch.driverName}
                  </span>
                </div>
              )}
              {dispatch.driverPhone && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Driver phone</span>
                  <span className="font-medium text-[var(--text)]">
                    {dispatch.driverPhone}
                  </span>
                </div>
              )}
              {dispatch.destinationCity && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Destination city</span>
                  <span className="font-medium text-[var(--text)]">
                    {dispatch.destinationCity}
                  </span>
                </div>
              )}
            </div>

            <div className="rounded-[6px] border border-[var(--border)] p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Date & time</span>
                <span className="font-medium text-[var(--text)] tabular-nums">
                  {formatDateTime(dispatch.dateTime)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Bags loaded</span>
                <span className="font-medium text-[var(--text)] tabular-nums">
                  {dispatch.bagsCount && dispatch.bagsCount > 0
                    ? formatBags(dispatch.bagsCount)
                    : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Status</span>
                <StatusBadge status={displayStatus} label={statusLabel} />
              </div>
              {dispatch.billDocNumber && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Bill number</span>
                  <span className="font-semibold text-[var(--brand)]">
                    {dispatch.billDocNumber}
                  </span>
                </div>
              )}
            </div>
          </div>

          {dispatch.status === 'cancelled' && dispatch.cancelReason && (
            <div className="rounded-[6px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-xs text-[var(--danger)]">
              Cancelled: {dispatch.cancelReason}
            </div>
          )}

          {/* Details Table */}
          <div className="overflow-x-auto rounded-[6px] border border-[var(--border)]">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[var(--surface-subtle)] border-b border-[var(--brand)]">
                  <th className="px-3.5 py-2.5 text-left text-xs font-semibold text-[var(--brand)]">
                    Item
                  </th>
                  <th className="px-3.5 py-2.5 text-left text-xs font-semibold text-[var(--brand)]">
                    Vehicle #
                  </th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold text-[var(--brand)]">
                    Bags
                  </th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold text-[var(--brand)]">
                    Sold weight
                  </th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold text-[var(--brand)]">
                    Rate per ton
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3.5 py-2.5 font-medium text-[var(--text)]">
                    Final Powder
                  </td>
                  <td className="px-3.5 py-2.5 text-[var(--text)]">
                    {dispatch.vehicleNumber}
                  </td>
                  <td className="px-3.5 py-2.5 text-right text-[var(--text)] tabular-nums">
                    {dispatch.bagsCount && dispatch.bagsCount > 0
                      ? formatBags(dispatch.bagsCount)
                      : '—'}
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-semibold text-[var(--text)] tabular-nums">
                    {dispatch.receivedWeightTons
                      ? formatTon(dispatch.receivedWeightTons)
                      : 'Waiting'}
                  </td>
                  <td className="px-3.5 py-2.5 text-right text-[var(--text-muted)] tabular-nums">
                    {dispatch.ratePerTon
                      ? `${formatMoney(dispatch.ratePerTon)} / ton`
                      : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {dispatch.notes && (
            <div className="rounded-[6px] bg-[var(--surface-subtle)] border border-[var(--border)] p-3 text-xs text-[var(--text-muted)]">
              <span className="font-medium text-[var(--text)]">Notes: </span>
              {dispatch.notes}
            </div>
          )}
        </div>
      </PrintLayout>
    </Dialog>
  );
};
