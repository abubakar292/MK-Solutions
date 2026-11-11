import { AlertCircle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import React from 'react';
import { cn } from '../../lib/utils';

export type BadgeStatus =
  | 'active'
  | 'cancelled'
  | 'paid'
  | 'partial'
  | 'unpaid'
  | 'open'
  | 'closed'
  | 'sent'
  | 'sold';

interface StatusBadgeProps {
  status: BadgeStatus;
  label?: string;
  className?: string;
}

const STATUS_CONFIG: Record<
  BadgeStatus,
  { text: string; classes: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  active: {
    text: 'Active',
    classes: 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]',
    Icon: CheckCircle2,
  },
  sold: {
    text: 'Sold',
    classes: 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]',
    Icon: CheckCircle2,
  },
  paid: {
    text: 'Paid',
    classes: 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]',
    Icon: CheckCircle2,
  },
  closed: {
    text: 'Closed',
    classes: 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]',
    Icon: CheckCircle2,
  },
  sent: {
    text: 'Sent',
    classes: 'bg-[var(--brand-soft)] text-[var(--brand)] border-[var(--border)]',
    Icon: Clock,
  },
  partial: {
    text: 'Partial',
    classes: 'bg-[var(--brand-soft)] text-[var(--brand)] border-[var(--border)]',
    Icon: Clock,
  },
  open: {
    text: 'Open',
    classes: 'bg-[var(--brand-soft)] text-[var(--brand)] border-[var(--border)]',
    Icon: Clock,
  },
  unpaid: {
    text: 'Unpaid',
    classes: 'bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--danger-border)]',
    Icon: AlertCircle,
  },
  cancelled: {
    text: 'Cancelled',
    classes: 'bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--danger-border)]',
    Icon: XCircle,
  },
};

/**
 * StatusBadge component using A2 chip radius (10px) and semantic CSS variables,
 * with a small colored dot + sentence-case label.
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, className }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.active;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[10px] border text-xs font-medium whitespace-nowrap shrink-0',
        cfg.classes,
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current shrink-0" />
      <span>{label || cfg.text}</span>
    </span>
  );
};

export const EditedChip: React.FC<{ className?: string }> = ({ className }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-[8px] border border-[var(--border)] bg-[var(--brand-soft)]/50 text-[11px] font-medium text-[var(--brand)] whitespace-nowrap shrink-0',
      className
    )}
    title="This record was edited"
  >
    <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)] shrink-0" />
    <span>Edited</span>
  </span>
);

