import React, { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { BrandLoader } from './BrandLoader';

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div
      aria-hidden="true"
      className={cn('rounded-[10px] skeleton-shimmer', className)}
    />
  );
};

interface SectionLoaderProps {
  rows?: number;
  cards?: number;
  label?: string;
  className?: string;
}

/**
 * SectionLoader (D1.2):
 * Skeletons with a soft shimmer underneath; when a page or large card loads for more than 600ms,
 * shows BrandLoader (size="md", variant="section") centered with fixed dimensions and no layout shift.
 */
export const SectionLoader: React.FC<SectionLoaderProps> = ({
  rows = 4,
  cards = 4,
  label,
  className,
}) => {
  const [showLoader, setShowLoader] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowLoader(true);
    }, 600);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      role="status"
      aria-label="Loading section"
      className={cn('relative space-y-6', className)}
    >
      {showLoader && (
        <div className="flex items-center justify-center min-h-[96px]">
          <BrandLoader size="md" variant="section" label={label} className="py-1" />
        </div>
      )}

      {cards > 0 && (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
        >
          {Array.from({ length: cards }).map((_, idx) => (
            <div
              key={idx}
              className="rounded-[16px] border border-[var(--border)] bg-[var(--bg)] p-5 space-y-3 shadow-soft"
            >
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-36" />
            </div>
          ))}
        </div>
      )}

      {rows > 0 && (
        <div className="rounded-[16px] border border-[var(--border)] bg-[var(--bg)] overflow-hidden shadow-soft">
          <div className="bg-[var(--surface-subtle)] px-4 py-3 border-b border-[var(--border)]">
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="divide-y divide-[var(--border)]">
            {Array.from({ length: rows }).map((_, idx) => (
              <div key={idx} className="px-4 py-3.5 flex items-center justify-between gap-4">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
