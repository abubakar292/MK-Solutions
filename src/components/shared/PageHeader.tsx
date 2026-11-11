import React from 'react';
import { cn } from '../../lib/utils';

interface PageHeaderProps {
  title: string;
  action?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  className?: string;
}

/**
 * PageHeader per A1 & A2:
 * - Short noun title on left
 * - One clear primary action on right (stacks cleanly below on mobile)
 * - Strictly no description paragraphs under titles
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  action,
  secondaryActions,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-5 border-b border-[var(--border)] min-w-0',
        className
      )}
    >
      <h1 className="font-heading text-xl sm:text-2xl font-semibold text-[var(--text)] tracking-tight truncate">
        {title}
      </h1>
      {(action || secondaryActions) && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full sm:w-auto min-w-0">
          {secondaryActions}
          {action}
        </div>
      )}
    </div>
  );
};
