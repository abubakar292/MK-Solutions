import Decimal from 'decimal.js';
import { AlertCircle, Truck } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { Dialog } from '../../components/shared/Dialog';
import {
  BagInput,
  DateTimePicker,
  TextArea,
  TextInput,
} from '../../components/shared/Inputs';
import { MoreDetailsSection } from '../../components/shared/MoreDetailsSection';
import { Button } from '../../components/ui/Button';
import { roundWeight } from '../../domain/engine';
import type { Customer, Dispatch } from '../../domain/types';
import { formatTon, getNowKarachiIsoDateTime } from '../../lib/format';
import {
  MOTION_DURATIONS,
  MOTION_EASING,
  prefersReducedMotion,
  triggerInvalidShake,
} from '../../lib/motion';
import { notify } from '../../lib/notify';
import { CustomerService, DispatchService } from '../../services';

interface NewDispatchDialogProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  customers: Customer[];
  defaultCustomerId?: string;
  currentFinalStockTons: Decimal;
  vehiclesOnTheWayCount: number;
  onSaved: (createdDispatch: Dispatch) => Promise<void> | void;
  onCustomersChanged: () => Promise<void> | void;
}

export const NewDispatchDialog: React.FC<NewDispatchDialogProps> = ({
  open,
  onClose,
  companyId,
  customers,
  defaultCustomerId,
  currentFinalStockTons,
  vehiclesOnTheWayCount,
  onSaved,
  onCustomersChanged,
}) => {
  const [dateTime, setDateTime] = useState<string>(() =>
    getNowKarachiIsoDateTime()
  );
  const [customerId, setCustomerId] = useState<string>('');
  const [vehicleNumber, setVehicleNumber] = useState<string>('');
  const [driverName, setDriverName] = useState<string>('');
  const [bags, setBags] = useState<string>('');
  const [driverPhone, setDriverPhone] = useState<string>('');
  const [destinationCity, setDestinationCity] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Inline "Add new customer"
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerError, setNewCustomerError] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (open) {
      setDateTime(getNowKarachiIsoDateTime());
      setCustomerId(defaultCustomerId || customers[0]?.id || '');
      setVehicleNumber('');
      setDriverName('');
      setDriverPhone('');
      setDestinationCity('');
      setBags('');
      setNotes('');
      setAddingCustomer(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerError('');
      setFormError(null);
      setSavedSuccess(false);
    }
  }, [open, customers, defaultCustomerId]);

  useEffect(() => {
    if (!customerId && customers.length > 0 && !addingCustomer) {
      setCustomerId(customers[0].id);
    }
  }, [customers, customerId, addingCustomer]);

  const stockTons = roundWeight(currentFinalStockTons);
  const isZeroStock = stockTons.lte(0);

  const handleCreateInlineCustomer = async () => {
    const trimmedName = newCustomerName.trim();
    if (!trimmedName) {
      setNewCustomerError('Enter the customer name.');
      return;
    }
    setSavingCustomer(true);
    setNewCustomerError('');
    try {
      const created = await CustomerService.createCustomer(companyId, {
        name: trimmedName,
        phone: newCustomerPhone.trim() || undefined,
        openingBalance: '0',
      });
      await onCustomersChanged();
      setCustomerId(created.id);
      setAddingCustomer(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      notify.success(`Added customer "${created.name}".`);
    } catch (err) {
      setNewCustomerError(
        err instanceof Error ? err.message : 'Could not add customer.'
      );
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!dateTime) {
      setFormError('Select the dispatch date and time.');
      triggerInvalidShake(formRef.current);
      return;
    }

    const selectedCustomer = customers.find((c) => c.id === customerId);
    if (!selectedCustomer) {
      setFormError('Select a customer (or add a new customer).');
      triggerInvalidShake(formRef.current);
      return;
    }

    const trimmedVehicle = vehicleNumber.trim();
    if (!trimmedVehicle) {
      setFormError('Enter the vehicle number.');
      triggerInvalidShake(formRef.current);
      return;
    }

    const parsedBags = bags.trim() ? Math.max(0, Math.round(Number(bags))) : 0;

    setSaving(true);
    try {
      const created = await DispatchService.createDispatch(companyId, {
        dateTime,
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        vehicleNumber: trimmedVehicle.toUpperCase(),
        driverName: driverName.trim() || undefined,
        driverPhone: driverPhone.trim() || undefined,
        destinationCity: destinationCity.trim() || undefined,
        bagsCount: parsedBags,
        notes: notes.trim() || undefined,
      });

      setSavedSuccess(true);
      notify.success(
        `${created.docNumber} saved. Dispatched on ${created.vehicleNumber} (Sent).`
      );

      await onSaved(created);
      setTimeout(() => {
        onClose();
      }, 240);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Could not save dispatch.'
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
      icon={<Truck className="h-4 w-4" />}
      title="New dispatch"
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
            form="new-dispatch-form"
            variant="primary"
            loading={saving}
            saved={savedSuccess}
          >
            Save dispatch
          </Button>
        </>
      }
    >
      <form
        id="new-dispatch-form"
        ref={formRef}
        onSubmit={handleSubmit}
        className="space-y-4"
        noValidate
      >
        {/* Live status strip at top of form per 2.2 */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-[var(--border)] bg-[var(--surface-subtle)] px-3.5 py-2.5 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--text-muted)]">Powder in stock:</span>
            <span className="font-heading font-semibold text-[var(--brand)] tabular-nums">
              {formatTon(stockTons)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--text-muted)]">On the way:</span>
            <span className="font-semibold text-[var(--text)] tabular-nums">
              {vehiclesOnTheWayCount} {vehiclesOnTheWayCount === 1 ? 'vehicle' : 'vehicles'}
            </span>
          </div>
        </div>

        {/* Small warning if powder stock is zero, but allow saving per 2.2 */}
        {isZeroStock && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-[6px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2 text-xs text-[var(--danger)]"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Powder stock is currently 0 ton. You can still dispatch; stock will be checked when the received weight is entered.
            </span>
          </div>
        )}

        {formError && (
          <div
            role="alert"
            className="rounded-[6px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-xs font-medium text-[var(--danger)]"
          >
            {formError}
          </div>
        )}

        {/* Date & time + Customer */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DateTimePicker
            label="Date and time"
            value={dateTime}
            onChange={(e) => {
              setDateTime(e.target.value);
              setFormError(null);
            }}
          />

          <div className="flex flex-col gap-1.5 min-w-0">
            <label
              htmlFor="dispatch-customer-select"
              className="text-sm font-medium text-[var(--text)] select-none"
            >
              Customer
            </label>
            <select
              id="dispatch-customer-select"
              value={addingCustomer ? '__ADD_NEW__' : customerId}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '__ADD_NEW__') {
                  setAddingCustomer(true);
                  setNewCustomerName('');
                  setNewCustomerPhone('');
                  setNewCustomerError('');
                } else {
                  setAddingCustomer(false);
                  setCustomerId(val);
                  setFormError(null);
                }
              }}
              className="h-11 sm:h-10 w-full rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] glow-input-focus"
            >
              <option value="">Select customer...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="__ADD_NEW__">+ Add new customer</option>
            </select>
          </div>
        </div>

        {/* Inline "Add new customer" */}
        {addingCustomer && (
          <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3.5 space-y-3">
            <p className="text-xs font-semibold text-[var(--brand)]">
              Add new customer
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextInput
                label="Customer name"
                placeholder="e.g. Allied Rebar Mills"
                value={newCustomerName}
                onChange={(e) => {
                  setNewCustomerName(e.target.value);
                  setNewCustomerError('');
                }}
                error={newCustomerError}
              />
              <TextInput
                label="Phone"
                placeholder="0300-0000000"
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setAddingCustomer(false)}
                disabled={savingCustomer}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                loading={savingCustomer}
                onClick={handleCreateInlineCustomer}
              >
                Add customer
              </Button>
            </div>
          </div>
        )}

        {/* Vehicle number & Driver name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextInput
            label="Vehicle number"
            placeholder="e.g. TLA-842"
            value={vehicleNumber}
            onChange={(e) => {
              setVehicleNumber(e.target.value);
              setFormError(null);
            }}
          />
          <TextInput
            label="Driver name (optional)"
            placeholder="Driver name"
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
          />
        </div>

        {/* Number of bags (optional) */}
        <div>
          <BagInput
            label="Number of bags (optional)"
            placeholder="0"
            value={bags}
            onChange={(e) => setBags(e.target.value)}
          />
        </div>

        {/* More details (Driver phone, Destination city, Notes) */}
        <MoreDetailsSection title="More details">
          <TextInput
            label="Driver phone"
            placeholder="0300-1234567"
            value={driverPhone}
            onChange={(e) => setDriverPhone(e.target.value)}
          />
          <TextInput
            label="Destination city"
            placeholder="e.g. Lahore / Faisalabad"
            value={destinationCity}
            onChange={(e) => setDestinationCity(e.target.value)}
          />
          <div className="sm:col-span-2">
            <TextArea
              label="Notes"
              placeholder="Gate pass, destination or driver remarks"
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
