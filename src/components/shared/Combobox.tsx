import { Check, ChevronDown, Plus, Search } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { BrandLoader } from '../loader/BrandLoader';

export interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface ComboboxProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  onAddNew?: (name: string) => Promise<ComboboxOption | void> | ComboboxOption | void;
  addNewLabel?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Accessible Combobox with search filtering, inline "Add new" option, 10px input radius, and CSS variables.
 */
export const Combobox: React.FC<ComboboxProps> = ({
  label,
  placeholder = 'Select...',
  value,
  onChange,
  options,
  onAddNew,
  addNewLabel = 'Add',
  error,
  disabled = false,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel && o.sublabel.toLowerCase().includes(q))
    );
  }, [options, query]);

  const exactMatchExists = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return options.some((o) => o.label.trim().toLowerCase() === q);
  }, [options, query]);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => searchInputRef.current?.focus(), 20);
    } else {
      setQuery('');
    }
  }, [open]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const handleAddInline = async () => {
    const trimmed = query.trim();
    if (!trimmed || !onAddNew || creating) return;
    setCreating(true);
    try {
      const created = await onAddNew(trimmed);
      if (created && created.value) {
        onChange(created.value);
      }
      setOpen(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={containerRef} className={cn('relative flex flex-col gap-1.5 min-w-0', className)}>
      {label && (
        <label className="text-sm font-medium text-[var(--text)] select-none">
          {label}
        </label>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className={cn(
          'flex items-center justify-between gap-2 w-full min-w-0 h-11 sm:h-10 px-3 rounded-[10px] border bg-[var(--bg)] text-left text-sm transition-shadow cursor-pointer focus-ring disabled:opacity-50',
          error ? 'border-[var(--danger)]' : 'border-[var(--border)]'
        )}
      >
        <span
          className={cn(
            'truncate',
            selectedOption ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'
          )}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1.5 z-[80] rounded-[16px] border border-[var(--border)] bg-[var(--bg)] shadow-pop overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--surface-subtle)]">
            <Search className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or type name..."
              className="w-full min-w-0 bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
          </div>

          <div className="max-h-56 overflow-y-auto divide-y divide-[var(--border)]/50">
            {filtered.length > 0 ? (
              filtered.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors cursor-pointer',
                      isSelected
                        ? 'bg-[var(--brand-soft)] text-[var(--brand)] font-medium'
                        : 'text-[var(--text)] hover:bg-[var(--surface-subtle)]'
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate">{opt.label}</div>
                      {opt.sublabel && (
                        <div className="text-xs text-[var(--text-muted)] truncate">
                          {opt.sublabel}
                        </div>
                      )}
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-[var(--brand)] shrink-0" />}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-3 text-xs text-[var(--text-muted)]">No matching options</div>
            )}

            {onAddNew && query.trim().length > 0 && !exactMatchExists && (
              <button
                type="button"
                disabled={creating}
                onClick={handleAddInline}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-[var(--brand)] bg-[var(--surface-subtle)] hover:bg-[var(--brand-soft)] transition-colors cursor-pointer"
              >
                {creating ? (
                  <BrandLoader size="xs" variant="inline" />
                ) : (
                  <Plus className="h-4 w-4 shrink-0" />
                )}
                <span className="truncate">
                  {creating ? 'Adding...' : `${addNewLabel} "${query.trim()}"`}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs font-medium text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
};
