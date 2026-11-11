import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatDate, getTodayKarachiIsoDate } from '../../lib/format';
import { prefersReducedMotion } from '../../lib/motion';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Dialog } from './Dialog';

export interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

export interface FilterControl {
  key: string;
  label: string;
  node: React.ReactNode;
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterSelectPillProps {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (val: string) => void;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}

/**
 * D4 Pill Dropdown ("Status: All"):
 * Opens a small GSAP-animated popover list with check marks that stays inside the screen.
 */
export const FilterSelectPill: React.FC<FilterSelectPillProps> = ({
  label,
  value,
  options,
  onChange,
  defaultValue = '',
  placeholder,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [optionSearch, setOptionSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [alignRight, setAlignRight] = useState(false);
  const [openUp, setOpenUp] = useState(false);

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value) ?? options[0],
    [options, value]
  );

  const isFiltered = value !== defaultValue && value !== 'all' && value !== '';

  const filteredOptions = useMemo(() => {
    if (!optionSearch.trim()) return options;
    const q = optionSearch.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, optionSearch]);

  // Keep popover inside viewport horizontally and vertically
  useEffect(() => {
    if (!open || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.left;
    setAlignRight(spaceRight < 250 && rect.right > 250);
    const spaceBelow = window.innerHeight - rect.bottom;
    setOpenUp(spaceBelow < 260 && rect.top > 260);
  }, [open]);

  // GSAP scale and fade from anchor
  useEffect(() => {
    if (!open || !popoverRef.current) return;
    if (prefersReducedMotion()) {
      gsap.set(popoverRef.current, { opacity: 1, scale: 1, y: 0 });
      return;
    }
    gsap.fromTo(
      popoverRef.current,
      { opacity: 0, scale: 0.95, y: -4 },
      { opacity: 1, scale: 1, y: 0, duration: 0.18, ease: 'power3.out' }
    );
  }, [open]);

  // Close on click outside or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={cn('relative inline-block w-full sm:w-auto', className)}>
      <button
        type="button"
        onClick={() => {
          setOptionSearch('');
          setOpen((prev) => !prev);
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          'inline-flex h-10 w-full sm:w-auto items-center justify-between gap-2 rounded-[10px] border px-3 text-xs transition-all cursor-pointer focus-ring whitespace-nowrap',
          isFiltered
            ? 'border-[var(--brand-mid)] bg-[var(--brand-soft)] text-[var(--brand)]'
            : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text)] hover:bg-[var(--surface-subtle)]'
        )}
      >
        <span className="inline-flex items-center gap-1.5 truncate">
          <span
            className={cn(
              'font-medium',
              isFiltered ? 'text-[var(--brand)]/80' : 'text-[var(--text-muted)]'
            )}
          >
            {label}:
          </span>
          <span className="font-semibold truncate max-w-[140px]">
            {selectedOption?.label ?? placeholder ?? 'All'}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 transition-transform duration-150',
            isFiltered ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="listbox"
          aria-label={label}
          style={{
            transformOrigin: `${openUp ? 'bottom' : 'top'} ${alignRight ? 'right' : 'left'}`,
          }}
          className={cn(
            'absolute z-[80] min-w-[210px] max-w-[min(280px,calc(100vw-24px))] rounded-[16px] border border-[var(--border)] bg-[var(--bg)] p-1.5 shadow-pop',
            openUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
            alignRight ? 'right-0' : 'left-0'
          )}
        >
          {options.length > 7 && (
            <div className="p-1 pb-1.5">
              <div className="relative flex items-center h-8 rounded-[8px] border border-[var(--border)] bg-[var(--surface-subtle)] px-2">
                <Search className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                <input
                  type="text"
                  value={optionSearch}
                  onChange={(e) => setOptionSearch(e.target.value)}
                  placeholder={`Filter ${label.toLowerCase()}...`}
                  className="w-full bg-transparent px-2 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none"
                />
              </div>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto space-y-0.5">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[var(--text-muted)] text-center">
                No matches
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const selected = opt.value === value;
                return (
                  <button
                    key={opt.value || '__empty__'}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-center justify-between gap-2.5 rounded-[10px] px-3 py-2 text-left text-xs transition-colors cursor-pointer',
                      selected
                        ? 'bg-[var(--brand-soft)] text-[var(--brand)] font-semibold'
                        : 'text-[var(--text)] font-medium hover:bg-[var(--surface-subtle)]'
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                    {selected && (
                      <Check className="h-3.5 w-3.5 text-[var(--brand)] shrink-0 stroke-[2.5]" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// D4 DATE RANGE PILL WITH PRESETS + CUSTOM CALENDAR POPOVER
// ============================================================================
export type DateRangePresetId =
  | 'all'
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'custom';

function computePresetRange(preset: DateRangePresetId): { from: string; to: string } {
  const todayIso = getTodayKarachiIsoDate();
  if (preset === 'all') return { from: '', to: '' };
  if (preset === 'today') return { from: todayIso, to: todayIso };

  const [y, m, d] = todayIso.split('-').map(Number);

  if (preset === 'this_week') {
    const dt = new Date(Date.UTC(y, m - 1, d));
    const dayOfWeek = dt.getUTCDay(); // 0=Sun..6=Sat
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startDt = new Date(Date.UTC(y, m - 1, d - diffToMonday));
    const fromIso = startDt.toISOString().slice(0, 10);
    return { from: fromIso, to: todayIso };
  }

  if (preset === 'this_month') {
    const monthPrefix = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return {
      from: `${monthPrefix}-01`,
      to: `${monthPrefix}-${String(lastDay).padStart(2, '0')}`,
    };
  }

  if (preset === 'last_month') {
    const prevDate = new Date(Date.UTC(y, m - 2, 1));
    const py = prevDate.getUTCFullYear();
    const pm = prevDate.getUTCMonth() + 1;
    const lastDay = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    const prefix = `${String(py).padStart(4, '0')}-${String(pm).padStart(2, '0')}`;
    return {
      from: `${prefix}-01`,
      to: `${prefix}-${String(lastDay).padStart(2, '0')}`,
    };
  }

  return { from: '', to: '' };
}

function buildCalendarMonthDays(yearMonth: string): {
  year: number;
  month: number;
  monthLabel: string;
  cells: Array<{ iso: string | null; dayNum: number | null }>;
} {
  const [yStr, mStr] = yearMonth.split('-');
  const year = Number(yStr) || 2026;
  const month = Number(mStr) || 1;
  const firstDayUtc = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDow = firstDayUtc.getUTCDay(); // 0=Sun..6=Sat
  const offset = startDow === 0 ? 6 : startDow - 1; // Monday-first

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const cells: Array<{ iso: string | null; dayNum: number | null }> = [];
  for (let i = 0; i < offset; i++) {
    cells.push({ iso: null, dayNum: null });
  }
  const ymPrefix = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      iso: `${ymPrefix}-${String(d).padStart(2, '0')}`,
      dayNum: d,
    });
  }
  return {
    year,
    month,
    monthLabel: `${monthNames[month - 1]} ${year}`,
    cells,
  };
}

function shiftCalendarMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface FilterDateRangePillProps {
  label?: string;
  fromDate: string;
  toDate: string;
  onChangeFrom: (val: string) => void;
  onChangeTo: (val: string) => void;
  /** If false, hides the "All dates" preset (useful for Reports where a period is always active) */
  allowAllDates?: boolean;
  className?: string;
}

/**
 * D4 Date Range Pill with Presets (Today, This week, This month, Last month, Custom)
 * and a custom interactive calendar popover (replaces native mm/dd/yyyy inputs).
 */
export const FilterDateRangePill: React.FC<FilterDateRangePillProps> = ({
  label = 'Date',
  fromDate,
  toDate,
  onChangeFrom,
  onChangeTo,
  allowAllDates = true,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<string>(() =>
    (fromDate || toDate || getTodayKarachiIsoDate()).slice(0, 7)
  );
  const [selectingField, setSelectingField] = useState<'from' | 'to'>('from');

  const wrapRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [alignRight, setAlignRight] = useState(false);
  const [openUp, setOpenUp] = useState(false);

  const hasRange = Boolean(fromDate || toDate);

  // Detect matching preset label
  const activePreset = useMemo<DateRangePresetId>(() => {
    if (!fromDate && !toDate) return 'all';
    const presets: DateRangePresetId[] = [
      'today',
      'this_week',
      'this_month',
      'last_month',
    ];
    for (const p of presets) {
      const r = computePresetRange(p);
      if (r.from === fromDate && r.to === toDate) return p;
    }
    return 'custom';
  }, [fromDate, toDate]);

  const displayValue = useMemo(() => {
    if (!fromDate && !toDate) return 'All dates';
    if (activePreset === 'today') return 'Today';
    if (activePreset === 'this_week') return 'This week';
    if (activePreset === 'this_month') return 'This month';
    if (activePreset === 'last_month') return 'Last month';
    if (fromDate && toDate) {
      if (fromDate === toDate) return formatDate(fromDate);
      return `${formatDate(fromDate)} – ${formatDate(toDate)}`;
    }
    if (fromDate) return `From ${formatDate(fromDate)}`;
    return `Until ${formatDate(toDate)}`;
  }, [fromDate, toDate, activePreset]);

  useEffect(() => {
    if (!open || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.left;
    setAlignRight(spaceRight < 320 && rect.right > 300);
    const spaceBelow = window.innerHeight - rect.bottom;
    setOpenUp(spaceBelow < 390 && rect.top > 390);
  }, [open]);

  useEffect(() => {
    if (!open || !popoverRef.current) return;
    if (prefersReducedMotion()) {
      gsap.set(popoverRef.current, { opacity: 1, scale: 1, y: 0 });
      return;
    }
    gsap.fromTo(
      popoverRef.current,
      { opacity: 0, scale: 0.95, y: -4 },
      { opacity: 1, scale: 1, y: 0, duration: 0.18, ease: 'power3.out' }
    );
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const calendar = useMemo(() => buildCalendarMonthDays(viewMonth), [viewMonth]);

  const handleSelectPreset = (preset: DateRangePresetId) => {
    if (preset === 'custom') {
      setSelectingField('from');
      return;
    }
    const range = computePresetRange(preset);
    onChangeFrom(range.from);
    onChangeTo(range.to);
    if (range.from) {
      setViewMonth(range.from.slice(0, 7));
    }
    setOpen(false);
  };

  const handleDayClick = (iso: string) => {
    if (selectingField === 'from' || !fromDate || (fromDate && toDate)) {
      onChangeFrom(iso);
      onChangeTo('');
      setSelectingField('to');
    } else {
      if (iso < fromDate) {
        onChangeTo(fromDate);
        onChangeFrom(iso);
      } else {
        onChangeTo(iso);
      }
      setSelectingField('from');
    }
  };

  const presetsList: Array<{ id: DateRangePresetId; label: string }> = [
    ...(allowAllDates ? [{ id: 'all' as const, label: 'All dates' }] : []),
    { id: 'today', label: 'Today' },
    { id: 'this_week', label: 'This week' },
    { id: 'this_month', label: 'This month' },
    { id: 'last_month', label: 'Last month' },
    { id: 'custom', label: 'Custom' },
  ];

  return (
    <div ref={wrapRef} className={cn('relative inline-block w-full sm:w-auto', className)}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          'inline-flex h-10 w-full sm:w-auto items-center justify-between gap-2 rounded-[10px] border px-3 text-xs transition-all cursor-pointer focus-ring whitespace-nowrap',
          hasRange
            ? 'border-[var(--brand-mid)] bg-[var(--brand-soft)] text-[var(--brand)]'
            : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text)] hover:bg-[var(--surface-subtle)]'
        )}
      >
        <span className="inline-flex items-center gap-1.5 truncate">
          <Calendar
            className={cn(
              'h-3.5 w-3.5 shrink-0',
              hasRange ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]'
            )}
          />
          <span
            className={cn(
              'font-medium',
              hasRange ? 'text-[var(--brand)]/80' : 'text-[var(--text-muted)]'
            )}
          >
            {label}:
          </span>
          <span className="font-semibold tabular-nums truncate max-w-[165px]">
            {displayValue}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 transition-transform duration-150',
            hasRange ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Select date range"
          style={{
            transformOrigin: `${openUp ? 'bottom' : 'top'} ${alignRight ? 'right' : 'left'}`,
          }}
          className={cn(
            'absolute z-[80] w-[min(310px,calc(100vw-24px))] rounded-[16px] border border-[var(--border)] bg-[var(--bg)] p-3 shadow-pop space-y-3',
            openUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
            alignRight ? 'right-0' : 'left-0'
          )}
        >
          {/* Presets */}
          <div className="flex flex-wrap gap-1.5">
            {presetsList.map((p) => {
              const active = activePreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPreset(p.id)}
                  className={cn(
                    'rounded-[8px] border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                    active
                      ? 'border-[var(--brand)] bg-[var(--brand)] text-white font-semibold'
                      : 'border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text)] hover:bg-[var(--brand-soft)]'
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Selected Range Summary Strip */}
          <div className="grid grid-cols-2 gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] p-2 text-xs">
            <button
              type="button"
              onClick={() => setSelectingField('from')}
              className={cn(
                'rounded-[8px] px-2 py-1 text-left transition-colors cursor-pointer',
                selectingField === 'from'
                  ? 'bg-[var(--bg)] border border-[var(--brand-mid)] text-[var(--brand)]'
                  : 'text-[var(--text)]'
              )}
            >
              <span className="block text-[10px] text-[var(--text-muted)]">From</span>
              <span className="font-semibold tabular-nums">
                {fromDate ? formatDate(fromDate) : 'Start date'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSelectingField('to')}
              className={cn(
                'rounded-[8px] px-2 py-1 text-left transition-colors cursor-pointer',
                selectingField === 'to'
                  ? 'bg-[var(--bg)] border border-[var(--brand-mid)] text-[var(--brand)]'
                  : 'text-[var(--text)]'
              )}
            >
              <span className="block text-[10px] text-[var(--text-muted)]">To</span>
              <span className="font-semibold tabular-nums">
                {toDate ? formatDate(toDate) : 'End date'}
              </span>
            </button>
          </div>

          {/* Custom Calendar Header */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setViewMonth((m) => shiftCalendarMonth(m, -1))}
                className="h-7 w-7 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="font-heading text-xs font-semibold text-[var(--text)]">
                {calendar.monthLabel}
              </span>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setViewMonth((m) => shiftCalendarMonth(m, 1))}
                className="h-7 w-7 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Weekday Headers */}
            <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-[var(--text-muted)]">
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
                <span key={d} className="py-0.5">
                  {d}
                </span>
              ))}
            </div>

            {/* Calendar Day Grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {calendar.cells.map((cell, idx) => {
                if (!cell.iso || !cell.dayNum) {
                  return <span key={`empty-${idx}`} className="h-8" />;
                }
                const isStart = cell.iso === fromDate;
                const isEnd = cell.iso === toDate;
                const isBetween =
                  Boolean(fromDate && toDate) &&
                  cell.iso > fromDate &&
                  cell.iso < toDate;

                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => handleDayClick(cell.iso!)}
                    className={cn(
                      'h-8 w-full rounded-[8px] text-xs tabular-nums transition-colors cursor-pointer flex items-center justify-center',
                      isStart || isEnd
                        ? 'bg-[var(--brand)] text-white font-semibold'
                        : isBetween
                          ? 'bg-[var(--brand-soft)] text-[var(--brand)] font-medium'
                          : 'text-[var(--text)] hover:bg-[var(--surface-subtle)]'
                    )}
                  >
                    {cell.dayNum}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
            {hasRange ? (
              <button
                type="button"
                onClick={() => {
                  onChangeFrom('');
                  onChangeTo('');
                }}
                className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] underline cursor-pointer"
              >
                Reset
              </button>
            ) : (
              <span />
            )}
            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// D4 CUSTOM MONTH PICKER PILL (REPLACES NATIVE <input type="month">)
// ============================================================================
const SHORT_MONTHS = [
  { num: '01', label: 'Jan', full: 'January' },
  { num: '02', label: 'Feb', full: 'February' },
  { num: '03', label: 'Mar', full: 'March' },
  { num: '04', label: 'Apr', full: 'April' },
  { num: '05', label: 'May', full: 'May' },
  { num: '06', label: 'Jun', full: 'June' },
  { num: '07', label: 'Jul', full: 'July' },
  { num: '08', label: 'Aug', full: 'August' },
  { num: '09', label: 'Sep', full: 'September' },
  { num: '10', label: 'Oct', full: 'October' },
  { num: '11', label: 'Nov', full: 'November' },
  { num: '12', label: 'Dec', full: 'December' },
];

export interface FilterMonthPillProps {
  value: string; // YYYY-MM
  onChange: (ym: string) => void;
  showArrows?: boolean;
  ariaLabel?: string;
  className?: string;
}

export const FilterMonthPill: React.FC<FilterMonthPillProps> = ({
  value,
  onChange,
  showArrows = true,
  ariaLabel = 'Select month',
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState<number>(() => {
    const y = Number(value.slice(0, 4));
    return Number.isFinite(y) && y > 2000 ? y : 2026;
  });

  const wrapRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [alignRight, setAlignRight] = useState(false);

  useEffect(() => {
    const y = Number(value.slice(0, 4));
    if (Number.isFinite(y) && y > 2000) setPickerYear(y);
  }, [value]);

  const formattedLabel = useMemo(() => {
    const [y, m] = value.split('-');
    const found = SHORT_MONTHS.find((item) => item.num === m);
    return found ? `${found.full} ${y}` : value;
  }, [value]);

  useEffect(() => {
    if (!open || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.left;
    setAlignRight(spaceRight < 260 && rect.right > 250);
  }, [open]);

  useEffect(() => {
    if (!open || !popoverRef.current) return;
    if (prefersReducedMotion()) {
      gsap.set(popoverRef.current, { opacity: 1, scale: 1, y: 0 });
      return;
    }
    gsap.fromTo(
      popoverRef.current,
      { opacity: 0, scale: 0.95, y: -4 },
      { opacity: 1, scale: 1, y: 0, duration: 0.18, ease: 'power3.out' }
    );
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={cn('relative inline-flex items-center gap-1', className)}>
      {showArrows && (
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => onChange(shiftCalendarMonth(value, -1))}
          className="flex h-10 w-9 items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)] hover:border-[var(--brand-mid)] hover:text-[var(--text)] transition-colors cursor-pointer focus-ring"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer focus-ring whitespace-nowrap tabular-nums"
      >
        <Calendar className="h-3.5 w-3.5 text-[var(--brand)] shrink-0" />
        <span>{formattedLabel}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-[var(--text-muted)] transition-transform duration-150',
            open && 'rotate-180'
          )}
        />
      </button>

      {showArrows && (
        <button
          type="button"
          aria-label="Next month"
          onClick={() => onChange(shiftCalendarMonth(value, 1))}
          className="flex h-10 w-9 items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)] hover:border-[var(--brand-mid)] hover:text-[var(--text)] transition-colors cursor-pointer focus-ring"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Select month"
          style={{
            transformOrigin: alignRight ? 'top right' : 'top left',
          }}
          className={cn(
            'absolute top-full z-50 mt-1.5 w-[240px] rounded-[16px] border border-[var(--border)] bg-[var(--bg)] p-3 shadow-pop space-y-2.5',
            alignRight ? 'right-0' : 'left-0'
          )}
        >
          {/* Year Stepper */}
          <div className="flex items-center justify-between px-1">
            <button
              type="button"
              aria-label="Previous year"
              onClick={() => setPickerYear((y) => y - 1)}
              className="h-7 w-7 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="font-heading text-xs font-semibold text-[var(--text)] tabular-nums">
              {pickerYear}
            </span>
            <button
              type="button"
              aria-label="Next year"
              onClick={() => setPickerYear((y) => y + 1)}
              className="h-7 w-7 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* 12-Month Grid */}
          <div className="grid grid-cols-3 gap-1.5">
            {SHORT_MONTHS.map((m) => {
              const ym = `${pickerYear}-${m.num}`;
              const selected = ym === value;
              return (
                <button
                  key={m.num}
                  type="button"
                  onClick={() => {
                    onChange(ym);
                    setOpen(false);
                  }}
                  className={cn(
                    'h-8 rounded-[8px] text-xs font-medium transition-colors cursor-pointer',
                    selected
                      ? 'bg-[var(--brand)] text-white font-semibold'
                      : 'bg-[var(--surface-subtle)] text-[var(--text)] hover:bg-[var(--brand-soft)]'
                  )}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// D4 ROUNDED FILTER BAR
// ============================================================================
interface FilterBarProps {
  searchValue: string;
  onSearchChange: (val: string) => void;
  searchPlaceholder?: string;
  controls?: FilterControl[];
  activeChips?: FilterChip[];
  onClearAll?: () => void;
  className?: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  controls = [],
  activeChips = [],
  onClearAll,
  className,
}) => {
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const chipsContainerRef = useRef<HTMLDivElement>(null);
  const activeCount = activeChips.length;

  // Pop-in animation for active filter chips
  useGSAP(
    () => {
      if (prefersReducedMotion() || !chipsContainerRef.current) return;
      const items = chipsContainerRef.current.querySelectorAll('[data-filter-chip]');
      if (items.length > 0) {
        gsap.fromTo(
          items,
          { scale: 0.9, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.2, stagger: 0.03, ease: 'back.out(2)' }
        );
      }
    },
    { dependencies: [activeChips.map((c) => c.key).join(',')] }
  );

  return (
    <div className={cn('space-y-2.5 min-w-0', className)}>
      {/* One tidy rounded filter bar */}
      <div className="rounded-[16px] border border-[var(--border)] bg-[var(--bg)] p-2.5 sm:p-3 shadow-soft">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          {/* Search Input: full width on mobile, flexible on desktop */}
          <div className="w-full sm:flex-1 sm:min-w-[220px]">
            <div className="relative flex items-center h-10 rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] focus-within:bg-[var(--bg)] focus-ring transition-colors">
              <Search className="h-4 w-4 text-[var(--text-muted)] ml-3 shrink-0" />
              <input
                type="search"
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="w-full min-w-0 h-full bg-transparent px-2.5 text-xs sm:text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none"
              />
              {searchValue && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  aria-label="Clear search"
                  className="mr-1.5 h-7 w-7 inline-flex items-center justify-center rounded-[8px] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--brand-soft)] cursor-pointer transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Desktop pill controls: one tidy row that wraps cleanly */}
          {controls.length > 0 && (
            <div className="hidden sm:flex flex-wrap items-center gap-2">
              {controls.map((c) => (
                <div key={c.key} className="shrink-0">
                  {c.node}
                </div>
              ))}
              {(activeCount > 0 || searchValue) && onClearAll && (
                <button
                  type="button"
                  onClick={onClearAll}
                  className="h-10 rounded-[10px] px-2.5 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--brand)] hover:bg-[var(--brand-soft)] transition-colors cursor-pointer"
                >
                  Clear all
                </button>
              )}
            </div>
          )}

          {/* Mobile Filters button (< 640px) */}
          {controls.length > 0 && (
            <div className="flex sm:hidden w-full items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setMobileSheetOpen(true)}
                className="w-full justify-center h-10"
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span>Filters</span>
                {activeCount > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-semibold rounded-[10px] bg-[var(--brand-soft)] text-[var(--brand)] tabular-nums">
                    {activeCount}
                  </span>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Removable active filter chips that pop in and out, with "Clear all" */}
      {activeChips.length > 0 && (
        <div
          ref={chipsContainerRef}
          className="flex flex-wrap items-center gap-2 px-1"
        >
          {activeChips.map((chip) => (
            <span
              key={chip.key}
              data-filter-chip
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[10px] bg-[var(--brand-soft)] text-[var(--brand)] text-xs font-medium border border-[var(--brand-mid)]/40"
            >
              <span>{chip.label}</span>
              <button
                type="button"
                onClick={chip.onRemove}
                aria-label={`Remove ${chip.label} filter`}
                className="h-4 w-4 inline-flex items-center justify-center rounded-[6px] hover:bg-[var(--brand)]/15 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {onClearAll && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--brand)] underline cursor-pointer px-1"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Mobile Bottom Sheet for Filters with Apply and Clear */}
      <Dialog
        open={mobileSheetOpen}
        onClose={() => setMobileSheetOpen(false)}
        title="Filters"
        maxWidth="sm"
        footer={
          <>
            {onClearAll && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  onClearAll();
                  setMobileSheetOpen(false);
                }}
              >
                Clear
              </Button>
            )}
            <Button
              type="button"
              variant="primary"
              onClick={() => setMobileSheetOpen(false)}
            >
              Apply
            </Button>
          </>
        }
      >
        <div className="space-y-3 pb-16">
          {controls.map((c) => (
            <div key={c.key} className="min-w-0">
              {c.node}
            </div>
          ))}
        </div>
      </Dialog>
    </div>
  );
};
