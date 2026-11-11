import { Truck } from 'lucide-react';
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
import type { Customer, Dispatch } from '../../domain/types';
import { triggerInvalidShake } from '../../lib/motion';
import { notify } from '../../lib/notify';
import { DispatchService } from '../../services';

interface EditDispatchDialogProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  dispatch: Dispatch | null;
  customers: Customer[];
  onSaved: (updatedDispatch: Dispatch) => Promise<void> | void;
}

export const EditDispatchDialog: React.FC<EditDispatchDialogProps> = ({
  open,
  onClose,
  companyId,
  dispatch,
  customers,
  onSaved,
}) => {
  const [dateTime, setDateTime] = useState<string>('');
  const [customerId, setCustomerId] = useState<string>('');
  const [vehicleNumber, setVehicleNumber] = useState<string>('');
  const [driverName, setDriverName] = useState<string>('');
  const [driverPhone, setDriverPhone] = useState<string>('');
  const [destinationCity, setDestinationCity] = useState<string>('');
  const [bags, setBags] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (open && dispatch) {
      setDateTime(dispatch.dateTime);
      setCustomerId(dispatch.customerId);
      setVehicleNumber(dispatch.vehicleNumber);
      setDriverName(dispatch.driverName || '');
      setDriverPhone(dispatch.driverPhone || '');
      setDestinationCity(dispatch.destinationCity || '');
      setBags(dispatch.bagsCount ? String(dispatch.bagsCount) : '');
      setNotes(dispatch.notes || '');
      setFormError(null);
      setSavedSuccess(false);
    }
  }, [open, dispatch]);

  if (!dispatch) return null;

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
      setFormError('Select a customer.');
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
      const updated = await DispatchService.editDispatch(companyId, dispatch.id, {
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
      notify.success(`Updated ${updated.docNumber}.`);
      await onSaved(updated);
      setTimeout(() => {
        onClose();
      }, 240);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Could not update dispatch.'
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
      title={`Edit dispatch ${dispatch.docNumber}`}
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
            form="edit-dispatch-form"
            variant="primary"
            loading={saving}
            saved={savedSuccess}
          >
            Save changes
          </Button>
        </>
      }
    >
      <form
        id="edit-dispatch-form"
        ref={formRef}
        onSubmit={handleSubmit}
        className="space-y-4"
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
              htmlFor="edit-dispatch-customer-select"
              className="text-sm font-medium text-[var(--text)] select-none"
            >
              Customer
            </label>
            <select
              id="edit-dispatch-customer-select"
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setFormError(null);
              }}
              className="h-11 sm:h-10 w-full rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] glow-input-focus"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

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
