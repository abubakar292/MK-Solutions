import {
  Ban,
  Download,
  Eye,
  MoreHorizontal,
  Pencil,
  Printer,
  Trash2,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';
import { useDocumentPreparing } from '../print/PrintLayout';

export interface ExtraRowAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'brand' | 'default';
  disabled?: boolean;
  disabledReason?: string;
}

export interface RowActionsProps {
  rowLabel?: string;
  onView?: () => void;
  onEdit?: () => void;
  editDisabled?: boolean | string;
  editDisabledReason?: string;
  onPrint?: () => void;
  onDownloadPdf?: () => void;
  onCancel?: () => void;
  cancelDisabled?: boolean | string;
  cancelDisabledReason?: string;
  onDelete?: () => void;
  deleteDisabled?: boolean | string;
  deleteDisabledReason?: string;
  primaryAction?: ExtraRowAction;
  extraMenuItems?: ExtraRowAction[];
  className?: string;
}

/**
 * D5.2 RowActions:
 * - Desktop: View (eye), Edit (pencil), Print (printer), and ⋯ menu (Download PDF, Cancel, Delete).
 * - Mobile: all actions live inside the ⋯ menu (plus optional primaryAction chip).
 * - Uses a portal popover so menus never clip inside overflow-x-auto table containers.
 */
export const RowActions: React.FC<RowActionsProps> = ({
  onView,
  onEdit,
  editDisabled,
  editDisabledReason,
  onPrint,
  onDownloadPdf,
  onCancel,
  cancelDisabled,
  cancelDisabledReason,
  onDelete,
  deleteDisabled,
  deleteDisabledReason,
  primaryAction,
  extraMenuItems = [],
  className,
}) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; openUp: boolean }>({
    top: 0,
    left: 0,
    openUp: false,
  });

  const isPreparingDoc = useDocumentPreparing();
  const isEditDisabled = Boolean(editDisabled);
  const resolvedEditReason =
    typeof editDisabled === 'string' ? editDisabled : editDisabledReason;
  const isCancelDisabled = Boolean(cancelDisabled);
  const resolvedCancelReason =
    typeof cancelDisabled === 'string' ? cancelDisabled : cancelDisabledReason;
  const isDeleteDisabled = Boolean(deleteDisabled);
  const resolvedDeleteReason =
    typeof deleteDisabled === 'string' ? deleteDisabled : deleteDisabledReason;

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 240;
    const menuWidth = 224;
    const left = Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12));
    const top = openUp ? rect.top - 6 : rect.bottom + 6;
    setCoords({ top, left, openUp });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [open]);

  const hasMoreMenu =
    Boolean(onDownloadPdf || onCancel || onDelete || extraMenuItems.length > 0) ||
    Boolean(onView || onEdit || onPrint);

  return (
    <div
      className={cn('inline-flex items-center justify-end gap-1', className)}
      onClick={(e) => e.stopPropagation()}
    >
      {primaryAction && (
        <button
          type="button"
          disabled={primaryAction.disabled}
          title={primaryAction.disabled ? primaryAction.disabledReason : primaryAction.label}
          onClick={(e) => {
            e.stopPropagation();
            if (!primaryAction.disabled) primaryAction.onClick();
          }}
          className={cn(
            'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[9px] text-xs font-semibold transition-all whitespace-nowrap cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed',
            primaryAction.variant === 'brand'
              ? 'bg-[var(--brand)] text-[var(--text-on-brand)] hover:bg-[var(--brand-hover)] shadow-xs'
              : 'border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--brand)] hover:bg-[var(--brand-soft)]/50'
          )}
        >
          {primaryAction.icon}
          <span>{primaryAction.label}</span>
        </button>
      )}

      {/* Desktop direct icon buttons: View, Edit, Print */}
      <div className="hidden md:inline-flex items-center gap-0.5">
        {onView && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onView();
            }}
            title="View details"
            aria-label="View details"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-secondary)] hover:bg-[var(--brand-soft)]/60 hover:text-[var(--brand)] transition-colors cursor-pointer"
          >
            <Eye className="h-4 w-4" />
          </button>
        )}

        {(onEdit || isEditDisabled) && (
          <button
            type="button"
            disabled={isEditDisabled || !onEdit}
            onClick={(e) => {
              e.stopPropagation();
              if (!isEditDisabled && onEdit) onEdit();
            }}
            title={isEditDisabled ? resolvedEditReason || 'Cannot edit' : 'Edit'}
            aria-label="Edit"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-secondary)] hover:bg-[var(--brand-soft)]/60 hover:text-[var(--brand)] transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}

        {onPrint && (
          <button
            type="button"
            disabled={isPreparingDoc}
            onClick={(e) => {
              e.stopPropagation();
              if (!isPreparingDoc) onPrint();
            }}
            title="Print"
            aria-label="Print"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-secondary)] hover:bg-[var(--brand-soft)]/60 hover:text-[var(--brand)] transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
          >
            <Printer className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ⋯ Menu trigger */}
      {hasMoreMenu && (
        <button
          ref={triggerRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((prev) => !prev);
          }}
          title="More actions"
          aria-label="More actions"
          aria-expanded={open}
          className={cn(
            'inline-flex h-8 w-8 items-center justify-center rounded-[8px] transition-colors cursor-pointer',
            open
              ? 'bg-[var(--brand-soft)] text-[var(--brand)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
          )}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      )}

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              transform: coords.openUp ? 'translateY(-100%)' : undefined,
              zIndex: 9999,
            }}
            className="w-56 rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] p-1.5 shadow-pop animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Mobile-only View / Edit / Print items */}
            <div className="md:hidden">
              {onView && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onView();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                >
                  <Eye className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                  <span>View details</span>
                </button>
              )}

              {(onEdit || isEditDisabled) && (
                <button
                  type="button"
                  disabled={isEditDisabled || !onEdit}
                  title={isEditDisabled ? resolvedEditReason : undefined}
                  onClick={() => {
                    if (isEditDisabled || !onEdit) return;
                    setOpen(false);
                    onEdit();
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Pencil className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                    <span>Edit</span>
                  </span>
                  {isEditDisabled && resolvedEditReason && (
                    <span className="text-[10px] text-[var(--text-muted)]">{resolvedEditReason}</span>
                  )}
                </button>
              )}

              {onPrint && (
                <button
                  type="button"
                  disabled={isPreparingDoc}
                  onClick={() => {
                    if (isPreparingDoc) return;
                    setOpen(false);
                    onPrint();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <Printer className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                  <span>Print</span>
                </button>
              )}

              {(onDownloadPdf || onCancel || onDelete || extraMenuItems.length > 0) && (
                <div className="my-1 h-px bg-[var(--border)]" />
              )}
            </div>

            {extraMenuItems.map((item, idx) => (
              <button
                key={idx}
                type="button"
                disabled={item.disabled}
                title={item.disabled ? item.disabledReason : undefined}
                onClick={() => {
                  if (item.disabled) return;
                  setOpen(false);
                  item.onClick();
                }}
                className="flex w-full items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <span className="inline-flex items-center gap-2.5">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                {item.disabled && item.disabledReason && (
                  <span className="text-[10px] text-[var(--text-muted)]">{item.disabledReason}</span>
                )}
              </button>
            ))}

            {onDownloadPdf && (
              <button
                type="button"
                disabled={isPreparingDoc}
                onClick={() => {
                  if (isPreparingDoc) return;
                  setOpen(false);
                  onDownloadPdf();
                }}
                className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <Download className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                <span>Download PDF</span>
              </button>
            )}

            {(onCancel || isCancelDisabled) && (
              <button
                type="button"
                disabled={isCancelDisabled || !onCancel}
                title={isCancelDisabled ? resolvedCancelReason : 'Cancel record'}
                onClick={() => {
                  if (isCancelDisabled || !onCancel) return;
                  setOpen(false);
                  onCancel();
                }}
                className="flex w-full items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <span className="inline-flex items-center gap-2.5">
                  <Ban className="h-3.5 w-3.5 text-[var(--danger)]" />
                  <span>Cancel</span>
                </span>
                {isCancelDisabled && resolvedCancelReason && (
                  <span className="text-[10px] text-[var(--text-muted)]">{resolvedCancelReason}</span>
                )}
              </button>
            )}

            {(onDelete || isDeleteDisabled) && (
              <button
                type="button"
                disabled={isDeleteDisabled || !onDelete}
                title={isDeleteDisabled ? resolvedDeleteReason || 'Cannot delete' : 'Delete permanently'}
                onClick={() => {
                  if (isDeleteDisabled || !onDelete) return;
                  setOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-medium text-[var(--danger)] hover:bg-[var(--danger-bg)]/60 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <span className="inline-flex items-center gap-2.5">
                  <Trash2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Delete</span>
                </span>
                {isDeleteDisabled && resolvedDeleteReason && (
                  <span className="rounded bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                    {resolvedDeleteReason}
                  </span>
                )}
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};
