import gsap from 'gsap';
import {
  ArrowUpRight,
  Ban,
  Clock,
  Download,
  Pencil,
  Printer,
  Trash2,
  X,
} from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatDateTime } from '../../lib/format';
import { cn } from '../../lib/utils';
import { useDocumentPreparing } from '../print/PrintLayout';
import { type BadgeStatus, EditedChip, StatusBadge } from './StatusBadge';

export interface DetailFieldItem {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  highlight?: boolean;
  fullWidth?: boolean;
}

export interface DetailSection {
  title: string;
  fields: DetailFieldItem[];
}

export interface DetailRelatedLink {
  label: string;
  value?: string;
  sublabel?: string;
  onClick?: () => void;
}

export interface DetailDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  docNumber?: string;
  subtitle?: string;
  status?:
    | BadgeStatus
    | {
        status: BadgeStatus;
        label?: string;
      };
  statusLabel?: string;
  editedAt?: string;
  createdAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  sections?: DetailSection[];
  relatedLinks?: DetailRelatedLink[];
  children?: React.ReactNode;
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
  primaryAction?: {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
  };
}

/**
 * D5.3 DetailDrawer:
 * - Right drawer on desktop (>=768px), bottom sheet on mobile (<768px).
 * - Smooth GSAP slide-in with subtle brand glow.
 * - Header with document number, status chip, and "Edited" chip if edited.
 * - Grouped field sections, related item links, activity timeline, and bottom action bar.
 */
export const DetailDrawer: React.FC<DetailDrawerProps> = ({
  open,
  onClose,
  title,
  docNumber,
  subtitle,
  status,
  statusLabel,
  editedAt,
  createdAt,
  cancelledAt,
  cancelReason,
  sections = [],
  relatedLinks = [],
  children,
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
}) => {
  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isPreparingDoc = useDocumentPreparing();
  const resolvedTitle = title || docNumber || '';
  const isEditDisabled = Boolean(editDisabled);
  const resolvedEditReason =
    typeof editDisabled === 'string' ? editDisabled : editDisabledReason;
  const isCancelDisabled = Boolean(cancelDisabled);
  const resolvedCancelReason =
    typeof cancelDisabled === 'string' ? cancelDisabled : cancelDisabledReason;
  const isDeleteDisabled = Boolean(deleteDisabled);
  const resolvedDeleteReason =
    typeof deleteDisabled === 'string' ? deleteDisabled : deleteDisabledReason;

  useEffect(() => {
    if (!open) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!prefersReducedMotion && panelRef.current && backdropRef.current) {
      const isMobile = window.innerWidth < 768;
      gsap.fromTo(
        backdropRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.22, ease: 'power2.out' }
      );
      if (isMobile) {
        gsap.fromTo(
          panelRef.current,
          { y: 60, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.3, ease: 'power3.out' }
        );
      } else {
        gsap.fromTo(
          panelRef.current,
          { x: 48, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.3, ease: 'power3.out' }
        );
      }
    }

    return () => {
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const hasActions = Boolean(
    primaryAction || onEdit || onPrint || onDownloadPdf || onCancel || onDelete
  );

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end">
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={onClose}
        className="fixed inset-0 bg-[var(--text-primary)]/40 backdrop-blur-[2px]"
      />

      {/* Drawer / Bottom Sheet Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={resolvedTitle}
        className={cn(
          'relative z-10 flex w-full flex-col bg-[var(--bg-surface)] shadow-pop border-[var(--border)]',
          'max-h-[90vh] rounded-t-[20px] border-t md:max-h-screen md:h-full md:max-w-[520px] md:rounded-t-none md:rounded-l-[20px] md:border-t-0 md:border-l'
        )}
      >
        {/* Mobile grab handle */}
        <div className="flex justify-center pt-2.5 pb-1 md:hidden">
          <div className="h-1.5 w-10 rounded-full bg-[var(--border)]" />
        </div>

        {/* Fixed Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-bold text-[var(--text-primary)] truncate">
                {resolvedTitle}
              </h2>
              {status && (
                <StatusBadge
                  status={typeof status === 'string' ? status : status.status}
                  label={typeof status === 'string' ? statusLabel : status.label}
                />
              )}
              {editedAt && <EditedChip />}
            </div>
            {subtitle && (
              <p className="mt-1 text-xs text-[var(--text-secondary)] truncate">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Grouped field sections */}
          {sections.map((section, sIdx) => (
            <div
              key={sIdx}
              className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-subtle)]/45 p-3.5"
            >
              <h3 className="mb-2.5 text-xs font-semibold text-[var(--text-secondary)]">
                {section.title}
              </h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
                {section.fields.map((field, fIdx) => (
                  <div
                    key={fIdx}
                    className={cn(
                      'flex flex-col gap-0.5',
                      field.fullWidth && 'sm:col-span-2'
                    )}
                  >
                    <dt className="text-[11px] text-[var(--text-muted)]">{field.label}</dt>
                    <dd
                      className={cn(
                        'text-xs font-semibold break-words',
                        field.highlight
                          ? 'text-[var(--brand)] font-display tabular-nums'
                          : 'text-[var(--text-primary)]',
                        field.mono && 'tabular-nums font-display'
                      )}
                    >
                      {field.value ?? '—'}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}

          {/* Custom children (item lines table, cost breakdown, etc.) */}
          {children}

          {/* Related items */}
          {relatedLinks.length > 0 && (
            <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] p-3.5">
              <h3 className="mb-2.5 text-xs font-semibold text-[var(--text-secondary)]">
                Related records
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {relatedLinks.map((rel, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={!rel.onClick}
                    onClick={() => rel.onClick?.()}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--bg-subtle)]/50 px-3 py-2 text-left transition-colors',
                      rel.onClick
                        ? 'hover:border-[var(--brand)]/40 hover:bg-[var(--brand-soft)]/35 cursor-pointer'
                        : 'cursor-default'
                    )}
                  >
                    <div className="min-w-0">
                      {rel.value ? (
                        <>
                          <div className="text-[11px] text-[var(--text-muted)]">{rel.label}</div>
                          <div className="text-xs font-semibold text-[var(--brand)] truncate">
                            {rel.value}
                          </div>
                        </>
                      ) : (
                        <div className="text-xs font-semibold text-[var(--brand)] truncate">
                          {rel.label}
                        </div>
                      )}
                      {rel.sublabel && (
                        <div className="text-[11px] text-[var(--text-secondary)] truncate">
                          {rel.sublabel}
                        </div>
                      )}
                    </div>
                    {rel.onClick && (
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-[var(--brand)]" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Activity line */}
          {(createdAt || editedAt || cancelledAt || cancelReason) && (
            <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-subtle)]/30 p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                <Clock className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <span>Activity</span>
              </div>
              <div className="space-y-1.5 text-xs">
                {createdAt && (
                  <div className="flex items-center justify-between text-[var(--text-secondary)]">
                    <span>Created</span>
                    <span className="tabular-nums text-[var(--text-muted)]">
                      {formatDateTime(createdAt)}
                    </span>
                  </div>
                )}
                {editedAt && (
                  <div className="flex items-center justify-between text-[var(--brand)] font-medium">
                    <span>Edited</span>
                    <span className="tabular-nums">{formatDateTime(editedAt)}</span>
                  </div>
                )}
                {(cancelledAt || cancelReason) && (
                  <div className="rounded-[10px] border border-[var(--danger-border)] bg-[var(--danger-bg)]/50 p-2.5 text-[var(--danger)]">
                    <div className="flex items-center justify-between font-semibold">
                      <span>Cancelled</span>
                      {cancelledAt && (
                        <span className="tabular-nums text-[11px]">
                          {formatDateTime(cancelledAt)}
                        </span>
                      )}
                    </div>
                    {cancelReason && (
                      <p className="mt-1 text-xs text-[var(--danger)]">
                        Reason: {cancelReason}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sticky Bottom Action Bar */}
        {hasActions && (
          <div className="border-t border-[var(--border)] bg-[var(--bg-surface)] px-5 py-3.5 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {primaryAction && (
                  <button
                    type="button"
                    onClick={primaryAction.onClick}
                    className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] bg-[var(--brand)] text-xs font-semibold text-[var(--text-on-brand)] hover:bg-[var(--brand-hover)] transition-colors cursor-pointer"
                  >
                    {primaryAction.icon}
                    <span>{primaryAction.label}</span>
                  </button>
                )}

                {onEdit && (
                  <button
                    type="button"
                    disabled={isEditDisabled}
                    title={isEditDisabled ? resolvedEditReason : 'Edit'}
                    onClick={() => {
                      if (!isEditDisabled) onEdit();
                    }}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] border border-[var(--border)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    <Pencil className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                    <span>Edit</span>
                  </button>
                )}

                {onPrint && (
                  <button
                    type="button"
                    disabled={isPreparingDoc}
                    onClick={() => {
                      if (!isPreparingDoc) onPrint();
                    }}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] border border-[var(--border)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    <Printer className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                    <span>Print</span>
                  </button>
                )}

                {onDownloadPdf && (
                  <button
                    type="button"
                    disabled={isPreparingDoc}
                    onClick={() => {
                      if (!isPreparingDoc) onDownloadPdf();
                    }}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] border border-[var(--border)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    <Download className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                    <span>Download PDF</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {onCancel && (
                  <button
                    type="button"
                    disabled={isCancelDisabled}
                    title={isCancelDisabled ? resolvedCancelReason : 'Cancel record'}
                    onClick={() => {
                      if (!isCancelDisabled) onCancel();
                    }}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] border border-[var(--border)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger-bg)]/40 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    <Ban className="h-3.5 w-3.5" />
                    <span>Cancel</span>
                  </button>
                )}

                {onDelete && (
                  <button
                    type="button"
                    disabled={isDeleteDisabled}
                    title={isDeleteDisabled ? resolvedDeleteReason || 'Cannot delete' : 'Delete permanently'}
                    onClick={() => {
                      if (!isDeleteDisabled) onDelete();
                    }}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] border border-[var(--danger-border)] bg-[var(--danger-bg)]/50 text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
