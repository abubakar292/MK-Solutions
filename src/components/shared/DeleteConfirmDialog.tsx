import { AlertTriangle, Trash2, X } from 'lucide-react';
import React, { useState } from 'react';
import { createPortal } from 'react-dom';

export interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  title?: string;
  description?: string;
  recordLabel?: string;
  loading?: boolean;
  onConfirm: () => Promise<void> | void;
}

/**
 * D5.2 DeleteConfirmDialog:
 * States clearly what will be permanently removed and that it cannot be undone.
 */
export const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({
  open,
  onOpenChange,
  onClose,
  title,
  description,
  recordLabel,
  loading,
  onConfirm,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || typeof document === 'undefined') return null;

  const isBusy = Boolean(submitting || loading);
  const resolvedTitle =
    title || (recordLabel ? `Delete ${recordLabel}?` : 'Delete record?');
  const resolvedDescription =
    description ||
    `Are you sure you want to permanently delete ${recordLabel || 'this record'}?`;

  const closeDialog = () => {
    onOpenChange?.(false);
    onClose?.();
  };

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm();
      closeDialog();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete record.');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        onClick={() => !isBusy && closeDialog()}
        className="fixed inset-0 bg-[var(--text-primary)]/40 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
        className="relative z-10 w-full sm:max-w-[440px] rounded-t-[20px] sm:rounded-[18px] border border-[var(--border)] bg-[var(--bg-surface)] shadow-pop overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--danger-bg)] text-[var(--danger)]">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <h2
              id="delete-confirm-title"
              className="font-display text-base font-bold text-[var(--text-primary)]"
            >
              {resolvedTitle}
            </h2>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={closeDialog}
            aria-label="Close dialog"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {recordLabel && (
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)]">
              {recordLabel}
            </div>
          )}
          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
            {resolvedDescription} This action permanently removes the record from storage and{' '}
            <span className="font-semibold text-[var(--text-primary)]">cannot be undone</span>.
          </p>
          {error && (
            <div className="rounded-[10px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-xs font-medium text-[var(--danger)]">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--bg-subtle)]/40 px-5 py-3.5">
          <button
            type="button"
            disabled={isBusy}
            onClick={closeDialog}
            className="h-9 px-4 rounded-[10px] border border-[var(--border)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
          >
            Keep record
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={handleConfirm}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[10px] bg-[var(--danger)] text-xs font-semibold text-[var(--text-on-brand)] hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{isBusy ? 'Deleting...' : 'Delete permanently'}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
