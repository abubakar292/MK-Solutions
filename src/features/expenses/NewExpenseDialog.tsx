import { Receipt } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { Dialog } from '../../components/shared/Dialog';
import { DatePicker, MoneyInput, SelectField, TextArea, TextInput } from '../../components/shared/Inputs';
import { MoreDetailsSection } from '../../components/shared/MoreDetailsSection';
import { Button } from '../../components/ui/Button';
import { roundMoney } from '../../domain/engine';
import type { Expense, PaymentMethod } from '../../domain/types';
import {
  formatMoney,
  getTodayKarachiIsoDate,
} from '../../lib/format';
import {
  MOTION_DURATIONS,
  MOTION_EASING,
  prefersReducedMotion,
  triggerInvalidShake,
} from '../../lib/motion';
import { notify } from '../../lib/notify';
import { ExpenseService, type ExpenseCategoryOption } from '../../services';

interface NewExpenseDialogProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  categories: ExpenseCategoryOption[];
  onCategoriesChanged: () => Promise<void> | void;
  onSaved: (expense: Expense) => Promise<void> | void;
  editingExpense?: Expense | null;
}

export const NewExpenseDialog: React.FC<NewExpenseDialogProps> = ({
  open,
  onClose,
  companyId,
  categories,
  onCategoriesChanged,
  onSaved,
  editingExpense,
}) => {
  const [date, setDate] = useState<string>(() => getTodayKarachiIsoDate());
  const [category, setCategory] = useState<string>('machine_maintenance');
  const [amount, setAmount] = useState<string>('');
  const [paidTo, setPaidTo] = useState<string>('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Inline "Add new category"
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [newCategoryError, setNewCategoryError] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (open) {
      if (editingExpense) {
        setDate(editingExpense.date.slice(0, 10));
        setCategory(editingExpense.category || categories[0]?.value || 'machine_maintenance');
        setAmount(editingExpense.amount);
        setPaidTo(editingExpense.paidTo || '');
        setMethod(editingExpense.method || 'cash');
        setInvoiceNumber(editingExpense.invoiceNumber || '');
        setNotes(editingExpense.notes || '');
      } else {
        setDate(getTodayKarachiIsoDate());
        setCategory(categories[0]?.value || 'machine_maintenance');
        setAmount('');
        setPaidTo('');
        setMethod('cash');
        setInvoiceNumber('');
        setNotes('');
      }
      setAddingCategory(false);
      setNewCategoryLabel('');
      setNewCategoryError('');
      setFormError(null);
      setSavedSuccess(false);
    }
  }, [open, editingExpense, categories]);

  const handleCreateInlineCategory = async () => {
    const trimmed = newCategoryLabel.trim();
    if (!trimmed) {
      setNewCategoryError('Enter the category name.');
      return;
    }
    setSavingCategory(true);
    setNewCategoryError('');
    try {
      const created = await ExpenseService.createCategoryInline(
        companyId,
        trimmed
      );
      await onCategoriesChanged();
      setCategory(created.value);
      setAddingCategory(false);
      setNewCategoryLabel('');
      notify.success(`Added category "${created.label}".`);
    } catch (err) {
      setNewCategoryError(
        err instanceof Error ? err.message : 'Could not add category.'
      );
    } finally {
      setSavingCategory(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!date) {
      setFormError('Select the expense date.');
      triggerInvalidShake(formRef.current);
      return;
    }

    if (!category || addingCategory) {
      setFormError('Select an expense category.');
      triggerInvalidShake(formRef.current);
      return;
    }

    const parsedAmount = roundMoney(amount);
    if (parsedAmount.lte(0)) {
      setFormError('Enter an expense amount greater than zero.');
      triggerInvalidShake(formRef.current);
      return;
    }

    const categoryObj = categories.find((c) => c.value === category);
    const categoryLabel = categoryObj?.label || category;

    setSaving(true);
    try {
      const saved = editingExpense
        ? await ExpenseService.updateExpense(companyId, editingExpense.id, {
            date,
            category,
            description: notes.trim() || categoryLabel,
            amount: parsedAmount.toString(),
            paidTo: paidTo.trim() || undefined,
            method,
            invoiceNumber: invoiceNumber.trim() || undefined,
            notes: notes.trim() || undefined,
          })
        : await ExpenseService.createExpense(companyId, {
            date,
            category,
            description: notes.trim() || categoryLabel,
            amount: parsedAmount.toString(),
            paidTo: paidTo.trim() || undefined,
            method,
            invoiceNumber: invoiceNumber.trim() || undefined,
            notes: notes.trim() || undefined,
          });

      setSavedSuccess(true);
      notify.success(
        `${saved.docNumber} ${editingExpense ? 'updated' : 'saved'} (${formatMoney(saved.amount)}).`
      );

      await onSaved(saved);
      setTimeout(() => {
        onClose();
      }, 240);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Could not save expense.'
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
      icon={<Receipt className="h-4 w-4" />}
      title={
        editingExpense
          ? `Edit expense ${editingExpense.docNumber}`
          : 'New expense'
      }
      maxWidth="md"
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
            form="new-expense-form"
            variant="primary"
            loading={saving}
            saved={savedSuccess}
          >
            {editingExpense ? 'Save changes' : 'Save expense'}
          </Button>
        </>
      }
    >
      <form
        id="new-expense-form"
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

        {/* Date & Category */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DatePicker
            label="Date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setFormError(null);
            }}
          />

          <div className="flex flex-col gap-1.5 min-w-0">
            <label
              htmlFor="expense-category-select"
              className="text-sm font-medium text-[var(--text)] select-none"
            >
              Category
            </label>
            <select
              id="expense-category-select"
              value={addingCategory ? '__ADD_NEW__' : category}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '__ADD_NEW__') {
                  setAddingCategory(true);
                  setNewCategoryLabel('');
                  setNewCategoryError('');
                } else {
                  setAddingCategory(false);
                  setCategory(val);
                  setFormError(null);
                }
              }}
              className="h-11 sm:h-10 w-full rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] glow-input-focus"
            >
              {categories.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
              <option value="__ADD_NEW__">+ Add new category</option>
            </select>
          </div>
        </div>

        {/* Inline "Add new category" panel */}
        {addingCategory && (
          <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3.5 space-y-2.5">
            <p className="text-xs font-semibold text-[var(--brand)]">
              Add new category
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <TextInput
                  placeholder="e.g. Lab testing"
                  value={newCategoryLabel}
                  onChange={(e) => {
                    setNewCategoryLabel(e.target.value);
                    setNewCategoryError('');
                  }}
                  error={newCategoryError}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setAddingCategory(false)}
                  disabled={savingCategory}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  loading={savingCategory}
                  onClick={handleCreateInlineCategory}
                >
                  Add category
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Amount, Paid to & Method */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MoneyInput
            label="Amount"
            placeholder="0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setFormError(null);
            }}
          />
          <TextInput
            label="Paid to (optional)"
            placeholder="e.g. LESCO / Workshop vendor"
            value={paidTo}
            onChange={(e) => setPaidTo(e.target.value)}
          />
        </div>

        <div>
          <label
            htmlFor="expense-method-select"
            className="text-sm font-medium text-[var(--text)] select-none block mb-1.5"
          >
            Payment method
          </label>
          <select
            id="expense-method-select"
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            className="h-11 sm:h-10 w-full rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] glow-input-focus"
          >
            <option value="cash">Cash</option>
            <option value="bank">Bank transfer</option>
            <option value="online">Online</option>
            <option value="cheque">Cheque</option>
          </select>
        </div>

        {/* More details (Invoice #, Notes) */}
        <MoreDetailsSection title="More details">
          <TextInput
            label="Invoice / bill #"
            placeholder="e.g. INV-4921 / Bill #"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
          />
          <div className="sm:col-span-2">
            <TextArea
              label="Notes"
              placeholder="Optional expense description or vendor details"
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
