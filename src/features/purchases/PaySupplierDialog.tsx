import Decimal from 'decimal.js';
import gsap from 'gsap';
import {
  Banknote,
  CheckCircle2,
  Eraser,
  FileCheck2,
  Globe,
  Landmark,
  Printer,
  Sparkles,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '../../components/shared/Dialog';
import {
  DatePicker,
  SelectField,
  TextArea,
  TextInput,
} from '../../components/shared/Inputs';
import { MoreDetailsSection } from '../../components/shared/MoreDetailsSection';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { Button } from '../../components/ui/Button';
import {
  calculateSupplierLedger,
  roundMoney,
} from '../../domain/engine';
import type {
  Purchase,
  Supplier,
  SupplierPayment,
} from '../../domain/types';
import {
  formatDate,
  formatMoney,
  getTodayKarachiIsoDate,
} from '../../lib/format';
import {
  prefersReducedMotion,
  triggerInvalidShake,
} from '../../lib/motion';
import { notify } from '../../lib/notify';
import { cn } from '../../lib/utils';
import { PurchaseService } from '../../services';
import { formatSupplierRunningBalanceLabel } from './purchaseHelpers';

export interface PaySupplierDialogProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  suppliers: Supplier[];
  defaultSupplierId?: string;
  purchases: Purchase[];
  supplierPayments: SupplierPayment[];
  onSaved: (
    payment: SupplierPayment,
    context: {
      balanceBefore: Decimal;
      balanceAfter: Decimal;
      openReceipt?: boolean;
    }
  ) => Promise<void> | void;
}

const SUPPLIER_PAYMENT_METHODS: Array<{
  id: 'cash' | 'bank' | 'cheque' | 'online';
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'cash', label: 'Cash', Icon: Banknote },
  { id: 'bank', label: 'Bank', Icon: Landmark },
  { id: 'cheque', label: 'Cheque', Icon: FileCheck2 },
  { id: 'online', label: 'Online', Icon: Globe },
];

const AnimatedSupplierBalanceValue: React.FC<{
  value: Decimal;
  formatter?: (val: Decimal) => string;
  className?: string;
}> = ({
  value,
  formatter = formatSupplierRunningBalanceLabel,
  className,
}) => {
  const targetNum = value.toNumber();
  const [displayStr, setDisplayStr] = useState(() => formatter(value));
  const prevNumRef = useRef<number>(targetNum);

  useEffect(() => {
    if (prefersReducedMotion() || prevNumRef.current === targetNum) {
      setDisplayStr(formatter(value));
      prevNumRef.current = targetNum;
      return;
    }

    const counter = { val: prevNumRef.current };
    prevNumRef.current = targetNum;

    const tween = gsap.to(counter, {
      val: targetNum,
      duration: 0.28,
      ease: 'power3.out',
      onUpdate: () => {
        setDisplayStr(formatter(roundMoney(counter.val)));
      },
      onComplete: () => {
        setDisplayStr(formatter(value));
      },
    });

    return () => {
      tween.kill();
    };
  }, [targetNum, value, formatter]);

  return <span className={className}>{displayStr}</span>;
};

export const PaySupplierDialog: React.FC<PaySupplierDialogProps> = ({
  open,
  onClose,
  companyId,
  suppliers,
  defaultSupplierId,
  purchases,
  supplierPayments,
  onSaved,
}) => {
  const [supplierId, setSupplierId] = useState<string>('');
  const [date, setDate] = useState<string>(() => getTodayKarachiIsoDate());
  const [amount, setAmount] = useState<string>('');
  const [method, setMethod] = useState<'cash' | 'bank' | 'cheque' | 'online'>('cash');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [bankName, setBankName] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [lastSavedPayment, setLastSavedPayment] = useState<{
    payment: SupplierPayment;
    balanceBefore: Decimal;
    balanceAfter: Decimal;
  } | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSupplierId(defaultSupplierId || suppliers[0]?.id || '');
      setDate(getTodayKarachiIsoDate());
      setAmount('');
      setMethod('cash');
      setReferenceNumber('');
      setBankName('');
      setNote('');
      setFormError(null);
      setSavedSuccess(false);
      setLastSavedPayment(null);
    }
  }, [open, defaultSupplierId, suppliers]);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) || null,
    [suppliers, supplierId]
  );

  // Calculate current supplier ledger before this payment
  const ledgerBefore = useMemo(() => {
    if (!selectedSupplier) return null;
    const supPurchases = purchases.filter(
      (p) => p.supplierId === selectedSupplier.id
    );
    const supPayments = supplierPayments.filter(
      (sp) =>
        sp.supplierId === selectedSupplier.id &&
        (!lastSavedPayment || sp.id !== lastSavedPayment.payment.id)
    );
    return calculateSupplierLedger({
      openingBalance: selectedSupplier.openingBalance,
      purchases: supPurchases,
      payments: supPayments,
    });
  }, [selectedSupplier, purchases, supplierPayments, lastSavedPayment]);

  const enteredAmount = useMemo(() => {
    const cleaned = String(amount || '').replace(/,/g, '').trim();
    if (!cleaned || isNaN(Number(cleaned))) return new Decimal(0);
    return Decimal.max(new Decimal(0), roundMoney(cleaned));
  }, [amount]);

  // Simulate supplier ledger after entering `amount`
  const ledgerAfter = useMemo(() => {
    if (!selectedSupplier || !ledgerBefore) return null;
    if (enteredAmount.lte(0)) return ledgerBefore;

    const supPurchases = purchases.filter(
      (p) => p.supplierId === selectedSupplier.id
    );
    const supPayments = supplierPayments.filter(
      (sp) =>
        sp.supplierId === selectedSupplier.id &&
        (!lastSavedPayment || sp.id !== lastSavedPayment.payment.id)
    );

    return calculateSupplierLedger({
      openingBalance: selectedSupplier.openingBalance,
      purchases: supPurchases,
      payments: [
        ...supPayments,
        {
          id: '__preview_supplier_payment__',
          date: date || getTodayKarachiIsoDate(),
          amount: enteredAmount,
          method,
          notes: note,
          status: 'active',
        },
      ],
    });
  }, [
    selectedSupplier,
    ledgerBefore,
    enteredAmount,
    purchases,
    supplierPayments,
    date,
    method,
    note,
    lastSavedPayment,
  ]);

  // Build detailed purchase allocation preview rows (oldest unpaid purchases first)
  const previewPurchaseRows = useMemo(() => {
    if (!ledgerBefore || !ledgerAfter) return [];
    const afterMap = new Map(
      ledgerAfter.purchaseAllocations.map((a) => [a.purchaseId, a])
    );

    const unpaidBefore = ledgerBefore.purchaseAllocations.filter((p) =>
      p.remainingAmount.gt(0)
    );
    const sourceList =
      unpaidBefore.length > 0 ? unpaidBefore : ledgerBefore.purchaseAllocations;

    return sourceList.map((before) => {
      const after = afterMap.get(before.purchaseId) || before;
      const allocatedNow = Decimal.max(
        new Decimal(0),
        roundMoney(after.paidAmount.minus(before.paidAmount))
      );
      const fillPct = before.totalAmount.gt(0)
        ? Math.min(
            100,
            Math.max(
              0,
              after.paidAmount
                .dividedBy(before.totalAmount)
                .times(100)
                .toNumber()
            )
          )
        : 100;

      return {
        purchaseId: before.purchaseId,
        docNumber: before.docNumber,
        date: before.date,
        totalAmount: before.totalAmount,
        paidNowAmount: before.paidNowAmount,
        paidBefore: before.paidAmount,
        allocatedNow,
        paidAfter: after.paidAmount,
        remainingAfter: after.remainingAmount,
        statusAfter: after.paymentStatus,
        fillPct,
      };
    });
  }, [ledgerBefore, ledgerAfter]);

  const balanceBefore = ledgerBefore?.balance ?? new Decimal(0);
  const balanceAfter = ledgerAfter?.balance ?? balanceBefore;
  const hasPositivePayable = balanceBefore.gt(0);

  const handleQuickFull = () => {
    if (!hasPositivePayable) return;
    setAmount(roundMoney(balanceBefore).toString());
    setFormError(null);
    setSavedSuccess(false);
    setLastSavedPayment(null);
  };

  const handleQuickHalf = () => {
    if (!hasPositivePayable) return;
    const half = roundMoney(balanceBefore.dividedBy(2));
    setAmount(half.toString());
    setFormError(null);
    setSavedSuccess(false);
    setLastSavedPayment(null);
  };

  const handleQuickClear = () => {
    setAmount('');
    setFormError(null);
    setSavedSuccess(false);
    setLastSavedPayment(null);
    amountInputRef.current?.focus();
  };

  const saveSupplierPaymentRecord = async (openReceiptAfter: boolean) => {
    setFormError(null);

    if (!selectedSupplier) {
      setFormError('Select a supplier to pay.');
      triggerInvalidShake(formRef.current);
      return;
    }

    if (!date) {
      setFormError('Select the payment date.');
      triggerInvalidShake(formRef.current);
      return;
    }

    if (enteredAmount.lte(0)) {
      setFormError('Enter a payment amount greater than zero.');
      triggerInvalidShake(formRef.current);
      return;
    }

    const beforeSnap = ledgerBefore?.balance ?? new Decimal(0);
    const afterSnap = roundMoney(beforeSnap.minus(enteredAmount));

    setSaving(true);
    try {
      const created = await PurchaseService.paySupplier(companyId, {
        date,
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.name,
        amount: enteredAmount.toString(),
        method,
        reference: referenceNumber.trim() || undefined,
        bankName: bankName.trim() || undefined,
        notes: note.trim() || undefined,
      });

      setSavedSuccess(true);
      const savedCtx = {
        payment: created,
        balanceBefore: beforeSnap,
        balanceAfter: afterSnap,
      };
      setLastSavedPayment(savedCtx);

      notify.success(
        `Payment ${created.docNumber} saved (${formatMoney(created.amount)} paid to ${selectedSupplier.name}).`
      );

      await onSaved(created, {
        balanceBefore: beforeSnap,
        balanceAfter: afterSnap,
        openReceipt: openReceiptAfter,
      });

      if (openReceiptAfter) {
        onClose();
      }
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Could not save supplier payment. Please check the amount and try again.'
      );
      triggerInvalidShake(formRef.current);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lastSavedPayment) {
      onClose();
      return;
    }
    await saveSupplierPaymentRecord(false);
  };

  const handlePrintReceiptClick = async () => {
    if (lastSavedPayment) {
      await onSaved(lastSavedPayment.payment, {
        balanceBefore: lastSavedPayment.balanceBefore,
        balanceAfter: lastSavedPayment.balanceAfter,
        openReceipt: true,
      });
      onClose();
      return;
    }
    await saveSupplierPaymentRecord(true);
  };

  return (
    <Dialog
      open={open}
      onClose={saving ? () => {} : onClose}
      title="Pay supplier"
      icon={<Banknote className="h-4 w-4" />}
      maxWidth="xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2.5">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={saving}
          >
            {lastSavedPayment ? 'Close' : 'Cancel'}
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={saving || (!lastSavedPayment && enteredAmount.lte(0))}
              onClick={handlePrintReceiptClick}
              className={cn(
                lastSavedPayment &&
                  'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)] font-semibold'
              )}
            >
              <Printer className="h-4 w-4" />
              <span>Print receipt</span>
            </Button>

            <Button
              type="submit"
              form="pay-supplier-form"
              variant="primary"
              loading={saving}
              saved={savedSuccess}
            >
              Save payment
            </Button>
          </div>
        </div>
      }
    >
      <form
        id="pay-supplier-form"
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className="min-w-0"
      >
        {formError && (
          <div
            role="alert"
            className="mb-4 rounded-[10px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-xs font-medium text-[var(--danger)]"
          >
            {formError}
          </div>
        )}

        {/* Two-column layout on desktop (1440px), single column on mobile (360px) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start min-w-0">
          {/* LEFT COLUMN: THE FORM */}
          <div className="lg:col-span-6 space-y-4 min-w-0">
            {/* Supplier selector + Balance owed chip */}
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block text-xs font-medium text-[var(--text-secondary)]">
                  Supplier
                </label>
                {selectedSupplier && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-[10px] border px-2.5 py-0.5 text-xs font-semibold tabular-nums',
                      balanceBefore.gt(0)
                        ? 'border-[var(--brand-mid)] bg-[var(--brand-soft)] text-[var(--brand)]'
                        : balanceBefore.lt(0)
                          ? 'border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]'
                          : 'border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-muted)]'
                    )}
                  >
                    <span>
                      {balanceBefore.gt(0)
                        ? 'Balance owed:'
                        : balanceBefore.lt(0)
                          ? 'Advance:'
                          : 'Settled:'}
                    </span>
                    <span className="font-heading">
                      {formatMoney(balanceBefore.abs())}
                    </span>
                  </span>
                )}
              </div>

              <SelectField
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  setFormError(null);
                  setSavedSuccess(false);
                  setLastSavedPayment(null);
                }}
                options={[
                  { value: '', label: 'Select supplier...' },
                  ...suppliers.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
            </div>

            {/* Large Amount Field (Rs prefix, big digits) + Quick Buttons (Full balance, Half, Clear) */}
            <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-subtle)]/60 p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="pay-supplier-amount"
                  className="text-xs font-medium text-[var(--text-secondary)]"
                >
                  Amount paid
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!hasPositivePayable}
                    onClick={handleQuickFull}
                    className="min-h-[30px] rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-xs font-semibold text-[var(--brand)] hover:border-[var(--brand)] hover:bg-[var(--brand-soft)]/50 disabled:opacity-45 disabled:pointer-events-none transition-colors cursor-pointer"
                  >
                    Full balance
                  </button>
                  <button
                    type="button"
                    disabled={!hasPositivePayable}
                    onClick={handleQuickHalf}
                    className="min-h-[30px] rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:opacity-45 disabled:pointer-events-none transition-colors cursor-pointer"
                  >
                    Half
                  </button>
                  <button
                    type="button"
                    disabled={!amount}
                    onClick={handleQuickClear}
                    className="inline-flex min-h-[30px] items-center gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--danger)] hover:border-[var(--danger-border)] disabled:opacity-45 disabled:pointer-events-none transition-colors cursor-pointer"
                  >
                    <Eraser className="h-3 w-3" />
                    <span>Clear</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3.5 min-h-[52px] focus-within:border-[var(--brand)] focus-within:shadow-[var(--shadow-glow)] transition-all">
                <span className="mr-2.5 select-none rounded-[6px] bg-[var(--brand-soft)] px-2 py-1 font-heading text-xs font-bold text-[var(--brand)]">
                  Rs
                </span>
                <input
                  id="pay-supplier-amount"
                  ref={amountInputRef}
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  placeholder="0"
                  value={amount}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[^0-9.]/g, '');
                    setAmount(cleaned);
                    setFormError(null);
                    setSavedSuccess(false);
                    setLastSavedPayment(null);
                  }}
                  className="w-full bg-transparent font-heading text-xl sm:text-2xl font-bold text-[var(--text)] tabular-nums placeholder:text-[var(--text-muted)]/45 focus:outline-none"
                />
              </div>
            </div>

            {/* Date & Reference */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <DatePicker
                label="Payment date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setFormError(null);
                  setSavedSuccess(false);
                  setLastSavedPayment(null);
                }}
              />
              <TextInput
                label="Reference or cheque number"
                placeholder="e.g. CHQ-8902 or TXN-4410"
                value={referenceNumber}
                onChange={(e) => {
                  setReferenceNumber(e.target.value);
                  setSavedSuccess(false);
                  setLastSavedPayment(null);
                }}
              />
            </div>

            {/* Payment Method as Segmented Chips with Icons */}
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-[var(--text-secondary)]">
                Payment method
              </span>
              <div
                role="radiogroup"
                aria-label="Payment method"
                className="grid grid-cols-2 sm:grid-cols-4 gap-2"
              >
                {SUPPLIER_PAYMENT_METHODS.map(({ id, label, Icon }) => {
                  const active = method === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        setMethod(id);
                        setSavedSuccess(false);
                        setLastSavedPayment(null);
                      }}
                      className={cn(
                        'flex min-h-[44px] items-center justify-center gap-2 rounded-[10px] border px-3 py-2 text-xs font-semibold transition-all cursor-pointer',
                        active
                          ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)] shadow-[var(--shadow-xs)]'
                          : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)] hover:border-[var(--brand-mid)] hover:text-[var(--text)]'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Optional details collapsed */}
            <MoreDetailsSection title="More details">
              <TextInput
                label="Bank name"
                placeholder="e.g. Meezan Bank, HBL"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
              <div className="sm:col-span-2">
                <TextArea
                  label="Notes"
                  placeholder="Optional payment remarks"
                  value={note}
                  rows={2}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </MoreDetailsSection>
          </div>

          {/* RIGHT COLUMN: LIVE PREVIEW PANEL */}
          <div className="lg:col-span-6 rounded-[14px] border border-[var(--border)] bg-[var(--surface-subtle)]/70 p-4 space-y-4 min-w-0">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
              <div>
                <h3 className="font-heading text-sm font-bold text-[var(--text)]">
                  Live allocation preview
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Applies to oldest unpaid purchases first ("paid now" counts toward that purchase)
                </p>
              </div>
              {enteredAmount.gt(0) && (
                <span className="rounded-[8px] bg-[var(--brand-soft)] px-2.5 py-1 font-heading text-xs font-bold text-[var(--brand)] tabular-nums shrink-0">
                  +{formatMoney(enteredAmount)}
                </span>
              )}
            </div>

            {/* Balance Before & Balance After */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] p-3 min-w-0">
                <div className="text-[11px] font-medium text-[var(--text-muted)] truncate">
                  Balance before
                </div>
                <div className="mt-1 font-heading text-base sm:text-lg font-bold text-[var(--text)] tabular-nums break-words">
                  <AnimatedSupplierBalanceValue value={balanceBefore} />
                </div>
              </div>

              <div
                className={cn(
                  'rounded-[12px] border p-3 min-w-0 transition-colors',
                  balanceAfter.lt(0)
                    ? 'border-[var(--success-border)] bg-[var(--success-bg)]/55'
                    : balanceAfter.eq(0)
                      ? 'border-[var(--success-border)] bg-[var(--bg)]'
                      : 'border-[var(--brand-mid)] bg-[var(--bg)]'
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-medium text-[var(--text-muted)] truncate">
                    {balanceAfter.lt(0) ? 'Advance after' : 'Balance after'}
                  </span>
                  {balanceAfter.lt(0) && (
                    <span className="rounded-[6px] bg-[var(--success)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      Advance
                    </span>
                  )}
                </div>
                <div
                  className={cn(
                    'mt-1 font-heading text-base sm:text-lg font-bold tabular-nums break-words',
                    balanceAfter.lt(0)
                      ? 'text-[var(--success)]'
                      : balanceAfter.gt(0)
                        ? 'text-[var(--brand)]'
                        : 'text-[var(--text)]'
                  )}
                >
                  <AnimatedSupplierBalanceValue value={balanceAfter} />
                </div>
              </div>
            </div>

            {/* Oldest Unpaid Purchases List with Smooth Filling Progress Bars */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--text-secondary)]">
                  Oldest unpaid purchases ({previewPurchaseRows.length})
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  Oldest first (FIFO)
                </span>
              </div>

              {previewPurchaseRows.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--bg)] px-4 py-6 text-center text-xs text-[var(--text-muted)]">
                  No active purchases found for this supplier. Any payment made will be recorded as an advance to supplier.
                </div>
              ) : (
                <div className="max-h-[290px] overflow-y-auto space-y-2 pr-0.5">
                  {previewPurchaseRows.map((row) => {
                    const isReceivingNow = row.allocatedNow.gt(0);
                    return (
                      <div
                        key={row.purchaseId}
                        className={cn(
                          'rounded-[10px] border bg-[var(--bg)] p-3 space-y-2 transition-colors',
                          isReceivingNow
                            ? 'border-[var(--brand)] shadow-2xs'
                            : 'border-[var(--border)]'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-heading text-xs font-bold text-[var(--text)] tabular-nums">
                              {row.docNumber}
                            </span>
                            <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                              {formatDate(row.date)}
                            </span>
                            {row.paidNowAmount.gt(0) && (
                              <span className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)] tabular-nums">
                                Paid now: {formatMoney(row.paidNowAmount)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {isReceivingNow && (
                              <span className="rounded-[6px] bg-[var(--brand-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--brand)] tabular-nums">
                                +{formatMoney(row.allocatedNow)} applied
                              </span>
                            )}
                            <StatusBadge status={row.statusAfter} />
                          </div>
                        </div>

                        {/* Smooth Progress Bar */}
                        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)] border border-[var(--border)]/60">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-300 ease-out',
                              row.statusAfter === 'paid'
                                ? 'bg-[var(--success)]'
                                : 'bg-[var(--brand)]'
                            )}
                            style={{ width: `${row.fillPct}%` }}
                          />
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] tabular-nums">
                          <span className="text-[var(--text-muted)]">
                            Purchase:{' '}
                            <strong className="text-[var(--text)]">
                              {formatMoney(row.totalAmount)}
                            </strong>
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="text-[var(--success)] font-medium">
                              Paid: {formatMoney(row.paidAfter)}
                            </span>
                            <span
                              className={cn(
                                'font-semibold',
                                row.remainingAfter.gt(0)
                                  ? 'text-[var(--danger)]'
                                  : 'text-[var(--text-muted)]'
                              )}
                            >
                              Left: {formatMoney(row.remainingAfter)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Overpayment Advance to Supplier Line with Distinct Chip */}
            {ledgerAfter && ledgerAfter.advanceAvailable.gt(0) && (
              <div className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--success-border)] bg-[var(--success-bg)] px-3.5 py-3 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles className="h-4 w-4 text-[var(--success)] shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[var(--text)]">
                        Advance to supplier
                      </span>
                      <span className="inline-flex items-center rounded-[8px] bg-[var(--success)] px-2 py-0.5 text-[10px] font-bold text-white">
                        Advance
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] truncate">
                      Extra payment above unpaid purchases stays as supplier advance
                    </p>
                  </div>
                </div>
                <span className="font-heading text-sm font-bold text-[var(--success)] tabular-nums shrink-0">
                  {formatMoney(ledgerAfter.advanceAvailable)}
                </span>
              </div>
            )}

            {lastSavedPayment && (
              <div className="flex items-center justify-between gap-2 rounded-[10px] border border-[var(--success-border)] bg-[var(--success-bg)] px-3.5 py-2.5 text-xs text-[var(--success)]">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>
                    Saved {lastSavedPayment.payment.docNumber}. Click "Print receipt" below to print or download PDF.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </form>
    </Dialog>
  );
};
