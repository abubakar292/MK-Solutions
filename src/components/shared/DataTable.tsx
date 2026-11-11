import gsap from 'gsap';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStaggerIn } from '../../lib/motion';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => React.ReactNode;
  hideOnMobileCard?: boolean;
  defaultHidden?: boolean;
  canHide?: boolean;
  hideable?: boolean;
  noTruncate?: boolean;
}

interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  keyExtractor: (row: T) => string;
  highlightedRowId?: string | null;
  onRowClick?: (row: T) => void;
  renderExpanded?: (row: T) => React.ReactNode;
  tableId?: string;
  hideColumnSelector?: boolean;
  pageSize?: number;
  emptyState?: React.ReactNode;
  mobileCardTitle?: (row: T) => React.ReactNode;
  mobileCardRight?: (row: T) => React.ReactNode;
  mobileCardActions?: (row: T) => React.ReactNode;
  className?: string;
}

/**
 * Animated inline expansion wrapper using GSAP height animation.
 */
const AnimatedExpandedContent: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    gsap.fromTo(
      el,
      { height: 0, opacity: 0 },
      {
        height: 'auto',
        opacity: 1,
        duration: 0.25,
        ease: 'power3.out',
        clearProps: 'height',
      }
    );
  }, []);

  return (
    <div ref={ref} className="overflow-hidden">
      <div className="px-4 py-3.5 bg-[var(--bg-subtle)]/65 border-t border-[var(--border)]/70">
        {children}
      </div>
    </div>
  );
};

/**
 * DataTable per A2, A3, A4 & D5.1:
 * - Richer rows with a "Columns" menu to show or hide columns
 * - Row expand arrow that opens the full details inline with smooth GSAP height animation
 * - Clicking a row opens the detail drawer via onRowClick
 * - Stacked cards on mobile (< 640px)
 */
export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  highlightedRowId,
  onRowClick,
  renderExpanded,
  tableId,
  hideColumnSelector = false,
  pageSize = 10,
  emptyState,
  mobileCardTitle,
  mobileCardRight,
  mobileCardActions,
  className,
}: DataTableProps<T>) {
  const [page, setPage] = useState(1);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);
  const colTriggerRef = useRef<HTMLButtonElement>(null);
  const colPortalRef = useRef<HTMLDivElement>(null);
  const [colMenuCoords, setColMenuCoords] = useState<{
    top: number;
    left: number;
    openUp: boolean;
    maxHeight: number;
  }>({
    top: 0,
    left: 0,
    openUp: false,
    maxHeight: 280,
  });
  const containerRef = useRef<HTMLDivElement>(null);

  const storageKey = tableId ? `mk_table_cols_${tableId}` : undefined;

  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => {
    if (storageKey && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return new Set(parsed);
        }
      } catch {
        // ignore
      }
    }
    return new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key));
  });

  useEffect(() => {
    if (!colMenuOpen) return;

    const updateColMenuPosition = () => {
      if (!colTriggerRef.current) return;
      const rect = colTriggerRef.current.getBoundingClientRect();
      const menuWidth = 236;
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const spaceAbove = rect.top - 12;
      const openUp = spaceBelow < 260 && spaceAbove > spaceBelow;
      const availableHeight = openUp ? spaceAbove - 8 : spaceBelow - 8;
      const maxHeight = Math.max(160, Math.min(300, availableHeight));
      const left = Math.max(
        12,
        Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12)
      );
      const top = openUp ? rect.top - 6 : rect.bottom + 6;
      setColMenuCoords({ top, left, openUp, maxHeight });
    };

    updateColMenuPosition();

    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        colMenuRef.current &&
        !colMenuRef.current.contains(target) &&
        (!colPortalRef.current || !colPortalRef.current.contains(target))
      ) {
        setColMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setColMenuOpen(false);
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', updateColMenuPosition, true);
    window.addEventListener('resize', updateColMenuPosition);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', updateColMenuPosition, true);
      window.removeEventListener('resize', updateColMenuPosition);
    };
  }, [colMenuOpen]);

  const toggleColumn = (key: string) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      if (storageKey && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
        } catch {
          // ignore
        }
      }
      return next;
    });
  };

  const resetColumns = () => {
    const defaults = new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key));
    setHiddenKeys(defaults);
    if (storageKey && typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    }
  };

  const toggleExpandRow = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const visibleColumns = useMemo(
    () => columns.filter((col) => !hiddenKeys.has(col.key)),
    [columns, hiddenKeys]
  );

  const toggleableColumns = useMemo(
    () =>
      columns.filter(
        (col) =>
          col.canHide !== false &&
          col.hideable !== false &&
          col.key !== 'actions' &&
          Boolean(col.header && col.header.trim())
      ),
    [columns]
  );

  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const pagedData = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, safePage, pageSize]);

  useStaggerIn(containerRef, '[data-table-row]', pagedData.length > 0);

  if (data.length === 0) {
    return <>{emptyState || null}</>;
  }

  return (
    <div ref={containerRef} className={cn('space-y-2.5 min-w-0', className)}>
      {/* Top bar with record count & Columns visibility menu */}
      {!hideColumnSelector && toggleableColumns.length > 2 && (
        <div className="flex items-center justify-between gap-2 px-0.5">
          <span className="text-xs text-[var(--text-muted)] tabular-nums">
            {data.length} {data.length === 1 ? 'record' : 'records'}
          </span>
          <div ref={colMenuRef} className="relative">
            <button
              ref={colTriggerRef}
              type="button"
              onClick={() => setColMenuOpen((prev) => !prev)}
              aria-expanded={colMenuOpen}
              aria-haspopup="menu"
              className={cn(
                'inline-flex items-center gap-1.5 h-8 px-3 rounded-[10px] border text-xs font-medium transition-all cursor-pointer',
                colMenuOpen
                  ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]'
                  : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text)] hover:bg-[var(--surface-subtle)]'
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--brand)]" />
              <span>Columns</span>
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 text-[var(--text-muted)] transition-transform duration-150',
                  colMenuOpen && 'rotate-180'
                )}
              />
            </button>

            {colMenuOpen &&
              typeof document !== 'undefined' &&
              createPortal(
                <div
                  ref={colPortalRef}
                  role="menu"
                  aria-label="Show columns"
                  style={{
                    position: 'fixed',
                    top: colMenuCoords.top,
                    left: colMenuCoords.left,
                    transform: colMenuCoords.openUp ? 'translateY(-100%)' : undefined,
                    zIndex: 9999,
                  }}
                  className="w-[236px] rounded-[14px] border border-[var(--border)] bg-[var(--bg)] p-1.5 shadow-pop"
                >
                  <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--border)] mb-1">
                    <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                      Show columns
                    </span>
                    {hiddenKeys.size > 0 && (
                      <button
                        type="button"
                        onClick={resetColumns}
                        className="text-[11px] font-medium text-[var(--brand)] hover:underline cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <div
                    style={{ maxHeight: colMenuCoords.maxHeight }}
                    className="overflow-y-auto space-y-0.5 pr-0.5"
                  >
                    {toggleableColumns.map((col) => {
                      const isVisible = !hiddenKeys.has(col.key);
                      return (
                        <button
                          key={col.key}
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={isVisible}
                          onClick={() => toggleColumn(col.key)}
                          className="flex w-full items-center justify-between gap-2 rounded-[9px] px-2.5 py-1.5 text-left text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-subtle)] cursor-pointer"
                        >
                          <span className="truncate">{col.header}</span>
                          <span
                            className={cn(
                              'flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors',
                              isVisible
                                ? 'border-[var(--brand)] bg-[var(--brand)] text-white'
                                : 'border-[var(--border)] bg-[var(--bg)]'
                            )}
                          >
                            {isVisible && <Check className="h-3 w-3 text-white stroke-[2.5]" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>,
                document.body
              )}
          </div>
        </div>
      )}

      {/* Desktop Table View */}
      <div className="hidden sm:block rounded-[16px] border border-[var(--border)] bg-[var(--bg)] overflow-hidden min-w-0 shadow-soft">
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--surface-subtle)] border-b border-[var(--border)]">
              <tr>
                {renderExpanded && (
                  <th
                    scope="col"
                    className="w-9 px-2.5 py-3 text-center text-xs font-semibold text-[var(--text-muted)] select-none"
                    aria-label="Expand row"
                  />
                )}
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={cn(
                      'px-3.5 py-3 text-xs font-semibold text-[var(--text-muted)] whitespace-nowrap select-none',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center'
                    )}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {pagedData.map((row) => {
                const rowId = keyExtractor(row);
                const isHighlighted = highlightedRowId === rowId;
                const isExpanded = expandedIds.has(rowId);

                return (
                  <React.Fragment key={rowId}>
                    <tr
                      data-table-row
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={cn(
                        'transition-colors duration-200',
                        isHighlighted
                          ? 'bg-[var(--brand-soft)]'
                          : isExpanded
                            ? 'bg-[var(--brand-soft)]/25'
                            : 'bg-[var(--bg)] hover:bg-[var(--surface-subtle)]',
                        onRowClick && 'cursor-pointer'
                      )}
                    >
                      {renderExpanded && (
                        <td
                          className="w-9 px-2 py-2.5 text-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpandRow(rowId);
                          }}
                        >
                          <button
                            type="button"
                            aria-label={isExpanded ? 'Collapse row details' : 'Expand row details'}
                            aria-expanded={isExpanded}
                            title={isExpanded ? 'Hide row details' : 'Show row details'}
                            className={cn(
                              'inline-flex h-7 w-7 items-center justify-center rounded-[8px] transition-colors cursor-pointer',
                              isExpanded
                                ? 'bg-[var(--brand-soft)] text-[var(--brand)]'
                                : 'text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                            )}
                          >
                            <ChevronRight
                              className={cn(
                                'h-4 w-4 transition-transform duration-200',
                                isExpanded && 'rotate-90 text-[var(--brand)]'
                              )}
                            />
                          </button>
                        </td>
                      )}
                      {visibleColumns.map((col) => {
                        const isActionOrCustom = col.key === 'actions' || col.noTruncate;
                        return (
                          <td
                            key={col.key}
                            className={cn(
                              'px-3.5 py-2.5 text-sm text-[var(--text)]',
                              !isActionOrCustom && 'max-w-[260px] truncate',
                              col.align === 'right' && 'text-right tabular-nums',
                              col.align === 'center' && 'text-center'
                            )}
                          >
                            {col.render(row)}
                          </td>
                        );
                      })}
                    </tr>
                    {renderExpanded && isExpanded && (
                      <tr>
                        <td
                          colSpan={visibleColumns.length + 1}
                          className="p-0 border-t-0"
                        >
                          <AnimatedExpandedContent>
                            {renderExpanded(row)}
                          </AnimatedExpandedContent>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Stacked Cards View */}
      <div className="grid grid-cols-1 gap-3 sm:hidden min-w-0">
        {pagedData.map((row) => {
          const rowId = keyExtractor(row);
          const isHighlighted = highlightedRowId === rowId;
          const isExpanded = expandedIds.has(rowId);

          return (
            <div
              key={rowId}
              data-table-row
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'rounded-[16px] border border-[var(--border)] p-4 space-y-2.5 transition-colors duration-200 min-w-0 shadow-soft',
                isHighlighted ? 'bg-[var(--brand-soft)]' : 'bg-[var(--bg)]',
                onRowClick && 'cursor-pointer active:bg-[var(--surface-subtle)]'
              )}
            >
              {(mobileCardTitle || mobileCardRight) && (
                <div className="flex items-start justify-between gap-2 pb-2 border-b border-[var(--border)]/60 min-w-0">
                  <div className="font-heading font-semibold text-sm text-[var(--text)] truncate">
                    {mobileCardTitle ? mobileCardTitle(row) : null}
                  </div>
                  {mobileCardRight && (
                    <div className="shrink-0 text-right tabular-nums">
                      {mobileCardRight(row)}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                {visibleColumns
                  .filter((col) => !col.hideOnMobileCard && col.key !== 'actions')
                  .map((col) => (
                    <div
                      key={col.key}
                      className="flex items-center justify-between gap-3 text-xs min-w-0"
                    >
                      <span className="text-[var(--text-muted)] shrink-0">{col.header}</span>
                      <span className="text-[var(--text)] font-medium truncate text-right tabular-nums">
                        {col.render(row)}
                      </span>
                    </div>
                  ))}
              </div>

              {renderExpanded && isExpanded && (
                <div
                  className="-mx-4 pt-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <AnimatedExpandedContent>{renderExpanded(row)}</AnimatedExpandedContent>
                </div>
              )}

              {(mobileCardActions || renderExpanded) && (
                <div
                  className="pt-2 border-t border-[var(--border)]/60 flex items-center justify-between gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  {renderExpanded ? (
                    <button
                      type="button"
                      onClick={() => toggleExpandRow(rowId)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand)] cursor-pointer"
                    >
                      <ChevronRight
                        className={cn(
                          'h-3.5 w-3.5 transition-transform duration-200',
                          isExpanded && 'rotate-90'
                        )}
                      />
                      <span>{isExpanded ? 'Hide lines' : 'Show details'}</span>
                    </button>
                  ) : (
                    <span />
                  )}
                  <div className="flex items-center justify-end gap-1.5">
                    {mobileCardActions && mobileCardActions(row)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination that wraps */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-[var(--text-muted)]">
          <span className="tabular-nums">
            Showing {(safePage - 1) * pageSize + 1}–
            {Math.min(safePage * pageSize, data.length)} of {data.length}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Previous</span>
            </Button>
            <span className="px-2 font-medium text-[var(--text)] tabular-nums">
              Page {safePage} of {totalPages}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next page"
            >
              <span>Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
