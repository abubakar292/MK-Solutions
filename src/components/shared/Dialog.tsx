import { X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useDialogMotion } from '../../lib/motion';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { TextInput } from './Inputs';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  hasUnsavedChanges?: boolean;
}

const MAX_WIDTH_MAP: Record<NonNullable<DialogProps['maxWidth']>, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

/**
 * Dialog / Bottom Sheet component built strictly to A2 & A4 rules:
 * - Dialog radius 16px, max-height 90dvh, margin 16px from edges on desktop.
 * - Under 640px becomes bottom sheet (max-height 92dvh, rounded-t-[16px], safe area padding).
 * - Fixed header (title + 40x40px visible X button inside top-right corner).
 * - Scrollable body, fixed footer with actions.
 * - Uses useDialogMotion and shadow-pop.
 */
export const Dialog: React.FC<DialogProps> = ({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
  maxWidth = 'md',
  hasUnsavedChanges = false,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  useDialogMotion(panelRef, backdropRef, open);

  const attemptClose = () => {
    if (hasUnsavedChanges) {
      setConfirmDiscardOpen(true);
      return;
    }
    onClose();
  };

  useEffect(() => {
    if (!open) {
      setConfirmDiscardOpen(false);
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        attemptClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, hasUnsavedChanges]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4"
    >
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={attemptClose}
        className="fixed inset-0 bg-[var(--text)]/35 backdrop-blur-[1px] no-print"
      />

      {/* Dialog / Bottom Sheet Panel */}
      <div
        ref={panelRef}
        className={cn(
          'relative z-10 flex flex-col w-full bg-[var(--bg)] border border-[var(--border)] shadow-pop',
          'max-h-[92dvh] rounded-t-[16px] sm:rounded-[16px] sm:max-h-[90dvh]',
          MAX_WIDTH_MAP[maxWidth]
        )}
      >
        {/* Fixed Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-[var(--border)] shrink-0 no-print">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <div className="h-8 w-8 rounded-[8px] bg-[var(--brand-soft)] text-[var(--brand)] inline-flex items-center justify-center shrink-0">
                {icon}
              </div>
            )}
            <h2
              id="dialog-title"
              className="font-heading text-base sm:text-lg font-semibold text-[var(--text)] truncate"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={attemptClose}
            aria-label="Close dialog"
            className="h-10 w-10 rounded-[10px] inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-subtle)] transition-colors shrink-0 cursor-pointer focus-ring"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          {children}

          {confirmDiscardOpen && (
            <div className="mt-4 rounded-[10px] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
              <p className="text-xs font-medium text-[var(--danger)]">
                Discard unsaved changes and close?
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setConfirmDiscardOpen(false)}
                >
                  Keep editing
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setConfirmDiscardOpen(false);
                    onClose();
                  }}
                >
                  Discard
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Fixed Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-[var(--border)] bg-[var(--bg)] rounded-b-[16px] shrink-0 pb-[max(0.875rem,env(safe-area-inset-bottom))] no-print">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'primary' | 'destructive';
  requireReason?: boolean;
  reasonLabel?: string;
  loading?: boolean;
}

/**
 * ConfirmDialog for destructive / cancellation / data management actions with optional required reason.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  variant = 'destructive',
  requireReason = false,
  reasonLabel = 'Reason for cancellation',
  loading = false,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setReason('');
      setError('');
    }
  }, [open]);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requireReason && !reason.trim()) {
      setError('Enter a reason before continuing.');
      return;
    }
    setError('');
    await onConfirm(reason.trim());
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="sm"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={variant}
            loading={loading}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form onSubmit={handleConfirm} className="space-y-4">
        <p className="text-sm text-[var(--text-muted)] leading-relaxed">{description}</p>
        {requireReason && (
          <TextInput
            label={reasonLabel}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError('');
            }}
            placeholder="e.g., Entered wrong weight or supplier"
            error={error}
            autoFocus
          />
        )}
      </form>
    </Dialog>
  );
};
