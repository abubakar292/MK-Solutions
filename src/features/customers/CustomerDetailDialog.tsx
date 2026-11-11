import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Ban, Banknote, Eye, Printer } from 'lucide-react';
import React, { useMemo, useRef, useState } from 'react';
import {
  PrintLayout,
  usePrintDocument,
} from '../../components/print/PrintLayout';
import { DataTable } from '../../components/shared/DataTable';
import { Dialog } from '../../components/shared/Dialog';
import { EmptyState } from '../../components/shared/EmptyState';
import { FilterDateRangePill } from '../../components/shared/FilterBar';
import { StatCard, StatCardGrid } from '../../components/shared/StatCard';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { Button } from '../../components/ui/Button';
import type {
  AllocatedBillSummary,
  CustomerLedgerEntry,
  CustomerLedgerResult,
} from '../../domain/engine';
import type {
  Bill,
  CompanySettings,
  Customer,
  CustomerPayment,
  Dispatch,
} from '../../domain/types';
import {
  formatBags,
  formatDate,
  formatDateTime,
  formatMoney,
  formatTon,
} from '../../lib/format';
import {
  MOTION_DURATIONS,
  MOTION_EASING,
  prefersReducedMotion,
} from '../../lib/motion';
import { cn } from '../../lib/utils';
import { getDispatchDisplayStatus } from '../dispatch/dispatchHelpers';
import { buildCustomerStatementPrintMeta } from './customerHelpers';

type DetailTab = 'ledger' | 'bills' | 'dispatches';

interface CustomerDetailDialogProps {
  customer: Customer | null;
  ledger: CustomerLedgerResult | null;
  bills: Bill[];
  dispatches: Dispatch[];
  payments: CustomerPayment[];
  allBillsMap: Map<string, Bill>;
  settings?: CompanySettings | null;
  companyId?: string;
  open: boolean;
  onClose: () => void;
  onOpenReceivePayment: (customer: Customer) => void;
  onViewBill: (bill: Bill) => void;
  onViewReceipt: (payment: CustomerPayment) => void;
  onCancelPayment: (payment: CustomerPayment) => void;
}

export const CustomerDetailDialog: React.FC<CustomerDetailDialogProps> = ({
  customer,
  ledger,
  bills,
  dispatches,
  payments,
  allBillsMap,
  settings,
  companyId,
  open,
  onClose,
  onOpenReceivePayment,
  onViewBill,
  onViewReceipt,
  onCancelPayment,
}) => {
  const [activeTab, setActiveTab] = useState<DetailTab>('ledger');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [statementPrintOpen, setStatementPrintOpen] = useState(false);
  const { printDocument, isPrinting } = usePrintDocument();

  const tabsBarRef = useRef<HTMLDivElement>(null);
  const tabUnderlineRef = useRef<HTMLDivElement>(null);
  const tabContentRef = useRef<HTMLDivElement>(null);

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
          {
            opacity: 1,
            y: 0,
            duration: MOTION_DURATIONS.fast,
            ease: MOTION_EASING.in,
          }
        );
      }
    },
    { dependencies: [activeTab, open] }
  );

  const filteredLedgerEntries = useMemo(() => {
    if (!ledger) return [];
    return ledger.entries.filter((e) => {
      if (e.type === 'opening') return true;
      if (fromDate && e.date < fromDate) return false;
      if (toDate && e.date > toDate) return false;
      return true;
    });
  }, [ledger, fromDate, toDate]);

  const allocationsMap = useMemo(() => {
    const map = new Map<string, AllocatedBillSummary>();
    if (!ledger) return map;
    for (const a of ledger.billAllocations) {
      map.set(a.billId, a);
    }
    return map;
  }, [ledger]);

  const paymentsMap = useMemo(() => {
    const map = new Map<string, CustomerPayment>();
    for (const p of payments) {
      map.set(p.id, p);
    }
    return map;
  }, [payments]);

  if (!customer || !ledger) return null;

  const statementMeta = buildCustomerStatementPrintMeta(
    customer,
    ledger,
    filteredLedgerEntries,
    settings,
    { fromDate: fromDate || undefined, toDate: toDate || undefined }
  );

  const isAdvance = ledger.balance.lt(0);
  const owesMoney = ledger.balance.gt(0);

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={customer.name}
        maxWidth="xl"
        footer={
          <div className="flex flex-wrap items-center justify-between w-full gap-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => onOpenReceivePayment(customer)}
              >
                <Banknote className="h-4 w-4" />
                <span>Receive payment</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isPrinting}
                onClick={() => void printDocument(statementMeta, companyId)}
              >
                <Printer className="h-4 w-4" />
                <span>Print statement</span>
              </Button>
            </div>
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        }
      >
        <div className="space-y-5 min-w-0">
          {/* Customer Contact Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
            <div className="flex flex-wrap items-center gap-3">
              {customer.phone && <span>Phone: {customer.phone}</span>}
              {customer.city && <span>City: {customer.city}</span>}
              {customer.address && <span>Address: {customer.address}</span>}
            </div>
            {isAdvance && (
              <span className="inline-flex items-center rounded-[6px] bg-[var(--success-bg)] border border-[var(--success-border)] px-2.5 py-0.5 text-xs font-semibold text-[var(--success)]">
                Advance: {formatMoney(ledger.balance.abs())}
              </span>
            )}
          </div>

          {/* 3 Summary Cards: Total sold, Total received, Balance or Advance */}
          <StatCardGrid>
            <StatCard
              label="Total sold"
              value={formatMoney(ledger.totalSold)}
            />
            <StatCard
              label="Total received"
              value={formatMoney(ledger.totalPaid)}
            />
            <StatCard
              label={isAdvance ? 'Customer advance' : 'Balance receivable'}
              value={
                isAdvance
                  ? `${formatMoney(ledger.balance.abs())} (Advance)`
                  : formatMoney(ledger.balance)
              }
            />
          </StatCardGrid>

          {/* Tabs: Ledger | Bills | Dispatches */}
          <div
            ref={tabsBarRef}
            role="tablist"
            aria-label="Customer detail sections"
            className="relative flex items-center gap-6 border-b border-[var(--border)]"
          >
            {(
              [
                { id: 'ledger', label: `Ledger (${ledger.entries.length})` },
                { id: 'bills', label: `Bills (${bills.length})` },
                { id: 'dispatches', label: `Dispatches (${dispatches.length})` },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                data-tab={t.id}
                aria-selected={activeTab === t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  'pb-3 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap',
                  activeTab === t.id
                    ? 'text-[var(--brand)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                )}
              >
                {t.label}
              </button>
            ))}

            <div
              ref={tabUnderlineRef}
              aria-hidden="true"
              className="absolute bottom-0 left-0 h-[2px] w-20 bg-[var(--brand)]"
            />
          </div>

          {/* Tab Content */}
          <div ref={tabContentRef} className="space-y-4 min-w-0">
            {activeTab === 'ledger' && (
              <div className="space-y-4">
                {/* Date filter + Print statement / Download PDF */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <FilterDateRangePill
                      label="Dates"
                      fromDate={fromDate}
                      toDate={toDate}
                      onChangeFrom={setFromDate}
                      onChangeTo={setToDate}
                    />
                    {(fromDate || toDate) && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setFromDate('');
                          setToDate('');
                        }}
                      >
                        Reset dates
                      </Button>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={isPrinting}
                    onClick={() => void printDocument(statementMeta, companyId)}
                  >
                    <Printer className="h-4 w-4" />
                    <span>Print statement</span>
                  </Button>
                </div>

                <DataTable<CustomerLedgerEntry>
                  data={filteredLedgerEntries}
                  keyExtractor={(r) => r.id}
                  mobileCardTitle={(r) => r.detail}
                  mobileCardRight={(r) =>
                    r.balance.lt(0)
                      ? `${formatMoney(r.balance.abs())} (Adv)`
                      : formatMoney(r.balance)
                  }
                  mobileCardActions={(r) => {
                    if (r.type === 'payment' && r.paymentId) {
                      const payObj = paymentsMap.get(r.paymentId);
                      if (!payObj) return null;
                      return (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => onViewReceipt(payObj)}
                          >
                            Receipt
                          </Button>
                          {payObj.status === 'active' && (
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={() => onCancelPayment(payObj)}
                            >
                              Cancel
                            </Button>
                          )}
                        </>
                      );
                    }
                    return null;
                  }}
                  columns={[
                    {
                      key: 'date',
                      header: 'Date',
                      render: (r) => (
                        <span className="text-[var(--text)] tabular-nums">
                          {r.date ? formatDate(r.date) : 'Opening'}
                        </span>
                      ),
                    },
                    {
                      key: 'detail',
                      header: 'Detail',
                      render: (r) => {
                        if (r.type === 'bill' && r.billId) {
                          const billObj =
                            allBillsMap.get(r.billId) ||
                            bills.find((b) => b.id === r.billId);
                          if (billObj) {
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onViewBill(billObj);
                                }}
                                className="font-medium text-[var(--brand)] hover:underline cursor-pointer text-left"
                                title={`Open bill ${billObj.docNumber}`}
                              >
                                {r.detail}
                              </button>
                            );
                          }
                        }
                        return (
                          <span className="font-medium text-[var(--text)]">
                            {r.detail}
                          </span>
                        );
                      },
                    },
                    {
                      key: 'debit',
                      header: 'Debit',
                      align: 'right',
                      render: (r) => (
                        <span className="text-[var(--text)] tabular-nums">
                          {r.debit.gt(0) ? formatMoney(r.debit) : '—'}
                        </span>
                      ),
                    },
                    {
                      key: 'credit',
                      header: 'Credit',
                      align: 'right',
                      render: (r) => (
                        <span className="text-[var(--success)] font-medium tabular-nums">
                          {r.credit.gt(0) ? formatMoney(r.credit) : '—'}
                        </span>
                      ),
                    },
                    {
                      key: 'balance',
                      header: 'Balance',
                      align: 'right',
                      render: (r) => (
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {r.balance.lt(0) && (
                            <span className="inline-flex items-center rounded-[6px] bg-[var(--success-bg)] border border-[var(--success-border)] px-2 py-0.5 text-[11px] font-semibold text-[var(--success)]">
                              Advance
                            </span>
                          )}
                          <span
                            className={cn(
                              'font-heading font-semibold tabular-nums',
                              r.balance.gt(0)
                                ? 'text-[var(--danger)]'
                                : r.balance.lt(0)
                                  ? 'text-[var(--success)]'
                                  : 'text-[var(--text)]'
                            )}
                          >
                            {formatMoney(r.balance.abs())}
                          </span>
                        </div>
                      ),
                    },
                    {
                      key: 'actions',
                      header: 'Actions',
                      align: 'right',
                      hideOnMobileCard: true,
                      render: (r) => {
                        if (r.type === 'payment' && r.paymentId) {
                          const payObj = paymentsMap.get(r.paymentId);
                          if (!payObj) return null;
                          return (
                            <div
                              className="inline-flex items-center justify-end gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => onViewReceipt(payObj)}
                                aria-label={`View receipt ${payObj.docNumber}`}
                                title="View / Print receipt"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-muted)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)] transition-colors cursor-pointer"
                              >
                                <Printer className="h-4 w-4" />
                              </button>
                              {payObj.status === 'active' && (
                                <button
                                  type="button"
                                  onClick={() => onCancelPayment(payObj)}
                                  aria-label={`Cancel payment ${payObj.docNumber}`}
                                  title="Cancel payment"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-muted)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)] transition-colors cursor-pointer"
                                >
                                  <Ban className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          );
                        }
                        if (r.type === 'bill' && r.billId) {
                          const billObj = bills.find((b) => b.id === r.billId);
                          if (!billObj) return null;
                          return (
                            <button
                              type="button"
                              onClick={() => onViewBill(billObj)}
                              aria-label={`View bill ${billObj.docNumber}`}
                              title="View bill"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-muted)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)] transition-colors cursor-pointer"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          );
                        }
                        return null;
                      },
                    },
                  ]}
                  emptyState={
                    <EmptyState message="No ledger entries in this period." />
                  }
                />
              </div>
            )}

            {activeTab === 'bills' && (
              <DataTable<Bill>
                data={bills}
                keyExtractor={(r) => r.id}
                onRowClick={(r) => onViewBill(r)}
                mobileCardTitle={(r) => `${r.docNumber} · ${formatDate(r.date)}`}
                mobileCardRight={(r) => formatMoney(r.totalAmount)}
                columns={[
                  {
                    key: 'docNumber',
                    header: 'Bill number',
                    render: (r) => (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewBill(r);
                        }}
                        className="font-semibold text-[var(--brand)] hover:underline cursor-pointer tabular-nums text-left"
                        title={`Open bill ${r.docNumber}`}
                      >
                        {r.docNumber}
                      </button>
                    ),
                  },
                  {
                    key: 'date',
                    header: 'Date',
                    render: (r) => formatDate(r.date),
                  },
                  {
                    key: 'vehicle',
                    header: 'Vehicle',
                    render: (r) => r.vehicleNumber,
                  },
                  {
                    key: 'receivedWeight',
                    header: 'Received weight',
                    align: 'right',
                    render: (r) => formatTon(r.receivedWeightTons),
                  },
                  {
                    key: 'total',
                    header: 'Total',
                    align: 'right',
                    render: (r) => formatMoney(r.totalAmount),
                  },
                  {
                    key: 'paid',
                    header: 'Paid',
                    align: 'right',
                    render: (r) => {
                      const a = allocationsMap.get(r.id);
                      return formatMoney(a ? a.paidAmount : 0);
                    },
                  },
                  {
                    key: 'balance',
                    header: 'Balance',
                    align: 'right',
                    render: (r) => {
                      const a = allocationsMap.get(r.id);
                      return formatMoney(
                        r.status === 'cancelled'
                          ? 0
                          : a
                            ? a.remainingAmount
                            : r.totalAmount
                      );
                    },
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (r) => {
                      const a = allocationsMap.get(r.id);
                      const st =
                        r.status === 'cancelled'
                          ? 'cancelled'
                          : a?.paymentStatus || 'unpaid';
                      return <StatusBadge status={st} />;
                    },
                  },
                ]}
                emptyState={<EmptyState message="No bills for this customer." />}
              />
            )}

            {activeTab === 'dispatches' && (
              <DataTable<Dispatch>
                data={dispatches}
                keyExtractor={(r) => r.id}
                mobileCardTitle={(r) => `${r.docNumber} · ${r.vehicleNumber}`}
                mobileCardRight={(r) =>
                  r.billId && r.receivedWeightTons
                    ? formatTon(r.receivedWeightTons)
                    : 'On the way'
                }
                columns={[
                  {
                    key: 'docNumber',
                    header: 'Dispatch #',
                    render: (r) => (
                      <span className="font-semibold text-[var(--brand)] tabular-nums">
                        {r.docNumber}
                      </span>
                    ),
                  },
                  {
                    key: 'dateTime',
                    header: 'Date & time',
                    render: (r) => formatDateTime(r.dateTime),
                  },
                  {
                    key: 'vehicle',
                    header: 'Vehicle',
                    render: (r) => r.vehicleNumber,
                  },
                  {
                    key: 'bags',
                    header: 'Bags',
                    align: 'right',
                    render: (r) =>
                      r.bagsCount && r.bagsCount > 0
                        ? formatBags(r.bagsCount)
                        : '—',
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (r) => {
                      const st = getDispatchDisplayStatus(r, allBillsMap);
                      if (st === 'sent') {
                        return (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[6px] border text-xs font-medium bg-[var(--brand-soft)] text-[var(--brand)] border-[var(--border)]">
                            On the way
                          </span>
                        );
                      }
                      return <StatusBadge status={st} />;
                    },
                  },
                  {
                    key: 'receivedWeight',
                    header: 'Received weight',
                    align: 'right',
                    render: (r) =>
                      r.receivedWeightTons ? (
                        <span className="tabular-nums font-medium text-[var(--text)]">
                          {formatTon(r.receivedWeightTons)}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)] text-xs">On the way</span>
                      ),
                  },
                  {
                    key: 'bill',
                    header: 'Bill',
                    align: 'right',
                    render: (r) => {
                      if (!r.billId) return <span className="text-[var(--text-muted)] text-xs">—</span>;
                      const bill = allBillsMap?.get(r.billId);
                      return (
                        <button
                          type="button"
                          onClick={() => bill && onViewBill(bill)}
                          className="font-semibold text-xs text-[var(--brand)] hover:underline tabular-nums cursor-pointer"
                        >
                          {r.billDocNumber || bill?.docNumber || 'View bill'}
                        </button>
                      );
                    },
                  },
                ]}
                emptyState={
                  <EmptyState message="No dispatches for this customer." />
                }
              />
            )}
          </div>
        </div>
      </Dialog>

      {/* Print Statement & Download PDF Dialog */}
      <Dialog
        open={statementPrintOpen}
        onClose={() => setStatementPrintOpen(false)}
        title={`Statement — ${customer.name}`}
        maxWidth="lg"
        footer={
          <Button
            type="button"
            variant="secondary"
            onClick={() => setStatementPrintOpen(false)}
          >
            Close
          </Button>
        }
      >
        <PrintLayout doc={statementMeta} companyId={companyId}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-[6px] border border-[var(--border)] p-3">
                <span className="text-[var(--text-muted)] block">Total sold</span>
                <span className="font-heading font-semibold text-sm text-[var(--text)] tabular-nums">
                  {formatMoney(ledger.totalSold)}
                </span>
              </div>
              <div className="rounded-[6px] border border-[var(--border)] p-3">
                <span className="text-[var(--text-muted)] block">Total received</span>
                <span className="font-heading font-semibold text-sm text-[var(--success)] tabular-nums">
                  {formatMoney(ledger.totalPaid)}
                </span>
              </div>
              <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                <span className="text-[var(--text-muted)] block">
                  {isAdvance ? 'Closing advance' : 'Closing balance'}
                </span>
                <span className="font-heading font-bold text-sm text-[var(--brand)] tabular-nums">
                  {isAdvance
                    ? `${formatMoney(ledger.balance.abs())} (Advance)`
                    : formatMoney(ledger.balance)}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto rounded-[6px] border border-[var(--border)]">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[var(--surface-subtle)] border-b border-[var(--brand)]">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--brand)]">
                      Date
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--brand)]">
                      Detail
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--brand)]">
                      Debit
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--brand)]">
                      Credit
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--brand)]">
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filteredLedgerEntries.map((e) => (
                    <tr key={e.id}>
                      <td className="px-3 py-2 text-xs text-[var(--text)] tabular-nums">
                        {e.date ? formatDate(e.date) : 'Opening'}
                      </td>
                      <td className="px-3 py-2 text-xs font-medium text-[var(--text)]">
                        {e.detail}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-[var(--text)] tabular-nums">
                        {e.debit.gt(0) ? formatMoney(e.debit) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-[var(--success)] tabular-nums">
                        {e.credit.gt(0) ? formatMoney(e.credit) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-semibold text-[var(--text)] tabular-nums">
                        {e.balance.lt(0)
                          ? `${formatMoney(e.balance.abs())} (Advance)`
                          : formatMoney(e.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </PrintLayout>
      </Dialog>
    </>
  );
};
