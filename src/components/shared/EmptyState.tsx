import React from 'react';
import { cn } from '../../lib/utils';
import { BrandLoader } from '../loader/BrandLoader';
import { Button } from '../ui/Button';

interface EmptyStateProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  loading?: boolean;
  className?: string;
}

/**
 * EmptyState per A2 & D1.2:
 * One short line and one button, 16px card radius, uses BrandLoader when loading.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  message,
  actionLabel,
  onAction,
  loading = false,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center rounded-[16px] border border-[var(--border)] bg-[var(--bg)] px-6 py-12 gap-4 shadow-soft',
        className
      )}
    >
      {loading && <BrandLoader size="sm" variant="inline" />}
      <p className="text-sm font-medium text-[var(--text-muted)]">{message}</p>
      {actionLabel && onAction && (
        <Button type="button" variant="primary" loading={loading} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
