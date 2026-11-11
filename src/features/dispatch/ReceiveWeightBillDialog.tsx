import Decimal from 'decimal.js';
import { Printer, ReceiptText } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '../../components/shared/Dialog';
import { DatePicker, MoneyInput, TextArea, TextInput, TonInput } from '../../components/shared/Inputs';
import { MoreDetailsSection } from '../../components/shared/MoreDetailsSection';
import { Button } from '../../components/ui/Button';
import {
  calculateDispatchAndBill,
  roundMoney,
  roundWeight,
} from '../../domain/engine';
import type {
  Bill,
  Customer,
  Dispatch,
} from '../../domain/types';
import {
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
import { InvoiceService } from '../../services';

interface ReceiveWeightBillDialogProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  dispatch: Dispatch | null;
  customers: Customer[];
  currentFinalStockTons: Decimal;
  onBillCreated: (bill: Bill, printImmediately?: boolean) => Promise<void> | void;
}

export const ReceiveWeightBillDialog: React.FC<ReceiveWeightBillDialogProps> = ({
  open,
  onClose,
  companyId,
  dispatch,
  customers,
  currentFinalStockTons,
  onBillCreated,
}) => {
  const [receivedWeightTons, setReceivedWeightTons] = useState<string>('');
  const [ratePerTon, setRatePerTon] = useState<string>('');
  const [saleDate, setSaleDate] = useState<string>(() => getTodayKarachiIsoDate());
  const [discount, setDiscount] = useState<string>('');
  const [weightSlipNumber, setWeightSlipNumber] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');

  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [createdBill, setCreatedBill] = useState<Bill | null>(null);

  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (open && dispatch) {
      setReceivedWeightTons(dispatch.receivedWeightTons || '');
      setRatePerTon(dispatch.ratePerTon || '');
      setSaleDate(getTodayKarachiIsoDate());
      setDiscount('');
      setWeightSlipNumber('');
      setRemarks('');
      setFormError(null);
      setSavedSuccess(false);
      setCreatedBill(null);
    }
  }, [open, dispatch]);

  const parsedReceived = roundWeight(receivedWeightTons || 0);
  const parsedRate = roundMoney(ratePerTon || 0);
  const parsedDiscount = roundMoney(discount || 0);

  const calc = useMemo(() => {
    if (!dispatch) return null;
    return calculateDispatchAndBill({
      receivedWeightTons: parsedReceived,
      ratePerTon: parsedRate,
      discount: parsedDiscount,
      avgCostPerTon: dispatch.rawAvgCostPerTonSnapshot || 0,
    });
  }, [dispatch, parsedReceived, parsedRate, parsedDiscount]);

  // Live powder left after this sale per 2.4
  const powderLeftAfterSale = useMemo(() => {
    const current = roundWeight(currentFinalStockTons);
    return roundWeight(current.minus(parsedReceived));
  }, [currentFinalStockTons, parsedReceived]);

  const isShortage = parsedReceived.gt(roundWeight(currentFinalStockTons));

  if (!dispatch) return null;

  const handleSubmit = async (e: React.FormEvent, printImmediately = false) => {
    e.preventDefault();
    setFormError(null);

    if (parsedReceived.lte(0)) {
      setFormError('Enter the received weight in tons (greater than 0).');
      triggerInvalidShake(formRef.current);
      return;
    }

    if (parsedRate.lte(0)) {
      setFormError('Enter the rate per ton (greater than 0).');
      triggerInvalidShake(formRef.current);
      return;
    }

    if (!saleDate) {
      setFormError('Select the sale date.');
      triggerInvalidShake(formRef.current);
      return;
    }

    // Blocking rule per 2.4 & A4: "Only X ton available"
    if (isShortage) {
      setFormError(`Only ${roundWeight(currentFinalStockTons).toString()} ton available`);
      triggerInvalidShake(formRef.current);
      return;
    }

    setSaving(true);
    try {
      const customerObj = customers.find((c) => c.id === dispatch.customerId);
      const customerAddress = [customerObj?.address, customerObj?.city]
        .filter(Boolean)
        .join(', ');

      const bill = await InvoiceService.createBill(companyId, {
        date: saleDate,
        customerId: dispatch.customerId,
        customerName: dispatch.customerName,
        customerAddress: customerAddress || undefined,
        dispatchId: dispatch.id,
        dispatchDocNumber: dispatch.docNumber,
        dispatchDateTime: dispatch.dateTime,
        vehicleNumber: dispatch.vehicleNumber,
        driverName: dispatch.driverName,
        bagsCount: dispatch.bagsCount || 0,
        receivedWeightTons: parsedReceived.toString(),
        ratePerTon: parsedRate.toString(),
        discount: parsedDiscount.toString(),
        weightSlipNumber: weightSlipNumber.trim() || undefined,
        remarks: remarks.trim() || undefined,
      });

      setCreatedBill(bill);
      setSavedSuccess(true);
      notify.success(
        `Sold! Bill ${bill.docNumber} created (${formatMoney(bill.totalAmount, { alwaysShowDecimals: true })}).`
      );

      await onBillCreated(bill, printImmediately);
      if (!printImmediately) {
        setTimeout(() => {
          onClose();
        }, 500);
      }
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Could not create bill.'
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
      icon={<ReceiptText className="h-4 w-4" />}
      title="Add weight and rate"
      maxWidth="md"
      footer={
        savedSuccess && createdBill ? (
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-[var(--success)] font-semibold">
              Sale completed · Bill {createdBill.docNumber}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  onClose();
                  void onBillCreated(createdBill, true);
                }}
              >
                <Printer className="h-4 w-4" />
                <span>Print bill</span>
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
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
              form="add-weight-rate-form"
              variant="primary"
              loading={saving}
              saved={savedSuccess}
            >
              Save as sold
            </Button>
          </>
        )
      }
    >
      <form
        id="add-weight-rate-form"
        ref={formRef}
        onSubmit={(e) => void handleSubmit(e, false)}
        className="space-y-4"
        noValidate
      >
        {/* Dispatch compact header */}
        <div className="flex items-center justify-between rounded-[6px] border border-[var(--border)] bg-[var(--surface-subtle)] px-3.5 py-2.5 text-xs">
          <div>
            <p className="font-semibold text-[var(--text)]">
              {dispatch.docNumber} · {dispatch.customerName}
            </p>
            <p className="text-[var(--text-muted)]">Vehicle: {dispatch.vehicleNumber}</p>
          </div>
          <div className="text-right">
            <span className="text-[var(--text-muted)] block">Current powder stock</span>
            <span className="font-heading font-semibold text-[var(--brand)] tabular-nums">
              {formatTon(currentFinalStockTons)}
            </span>
          </div>
        </div>

        {formError && (
          <div
            role="alert"
            className="rounded-[6px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-xs font-medium text-[var(--danger)]"
          >
            {formError}
          </div>
        )}

        {/* Received weight (tons) & Rate per ton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TonInput
            label="Received weight"
            placeholder="0"
            value={receivedWeightTons}
            onChange={(e) => {
              setReceivedWeightTons(e.target.value);
              setFormError(null);
            }}
          />
          <MoneyInput
            label="Rate per ton"
            placeholder="0"
            suffix="/ ton"
            value={ratePerTon}
            onChange={(e) => {
              setRatePerTon(e.target.value);
              setFormError(null);
            }}
          />
        </div>

        {/* Sale date */}
        <div>
          <DatePicker
            label="Sale date"
            value={saleDate}
            onChange={(e) => {
              setSaleDate(e.target.value);
              setFormError(null);
            }}
          />
        </div>

        {/* Live lines per 2.4: Amount and Powder left after this sale */}
        {calc && (
          <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">Amount</span>
              <span className="font-heading font-semibold text-[var(--text)] tabular-nums text-sm">
                {formatMoney(calc.billAmount, { alwaysShowDecimals: true })}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--border)] pt-1.5">
              <span className="text-[var(--text-muted)]">Powder left after this sale</span>
              <span
                className={`font-semibold tabular-nums ${
                  powderLeftAfterSale.lt(0) ? 'text-[var(--danger)]' : 'text-[var(--brand)]'
                }`}
              >
                {powderLeftAfterSale.lt(0)
                  ? `Shortage of ${formatTon(powderLeftAfterSale.abs())}`
                  : formatTon(powderLeftAfterSale)}
              </span>
            </div>
          </div>
        )}

        {/* More details (Weight slip / reference #, Discount, Remarks) */}
        <MoreDetailsSection title="More details">
          <TextInput
            label="Weight slip / reference #"
            placeholder="e.g. SLIP-8841"
            value={weightSlipNumber}
            onChange={(e) => setWeightSlipNumber(e.target.value)}
          />
          <MoneyInput
            label="Discount"
            placeholder="0"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
          />
          <div className="sm:col-span-2">
            <TextArea
              label="Remarks"
              placeholder="Delivery terms, buyer weight note, or deductibles"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
            />
          </div>
        </MoreDetailsSection>
      </form>
    </Dialog>
  );
};
