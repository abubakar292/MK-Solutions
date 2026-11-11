import React, { useEffect, useRef } from 'react';
import { shake } from '../../lib/motion';
import { cn } from '../../lib/utils';

export interface BaseFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  suffix?: string;
  prefixText?: string;
  containerClassName?: string;
}

/**
 * Base field wrapper per A2, D1.1 & D1.3:
 * - Sentence-case label
 * - 10px input radius, 44px height on mobile / 40px on desktop
 * - focus-ring (2px brand at 30% plus faint glow)
 * - shake(el) on invalid error
 */
export const TextInput = React.forwardRef<HTMLInputElement, BaseFieldProps>(
  (
    {
      label,
      error,
      suffix,
      prefixText,
      className,
      containerClassName,
      id,
      ...props
    },
    ref
  ) => {
    const wrapRef = useRef<HTMLDivElement>(null);
    const prevErrorRef = useRef<string | undefined>(undefined);

    useEffect(() => {
      if (error && error !== prevErrorRef.current) {
        shake(wrapRef.current);
      }
      prevErrorRef.current = error;
    }, [error]);

    const inputId = id || (label ? `field_${label.toLowerCase().replace(/\s+/g, '_')}` : undefined);

    return (
      <div ref={wrapRef} className={cn('flex flex-col gap-1.5 min-w-0', containerClassName)}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-[var(--text)] select-none"
          >
            {label}
          </label>
        )}
        <div
          className={cn(
            'relative flex items-center w-full min-w-0 rounded-[10px] border bg-[var(--bg)] transition-shadow h-11 sm:h-10 focus-ring',
            error ? 'border-[var(--danger)]' : 'border-[var(--border)]'
          )}
        >
          {prefixText && (
            <span className="pl-3 pr-1.5 text-sm text-[var(--text-muted)] select-none shrink-0">
              {prefixText}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={!!error}
            className={cn(
              'w-full min-w-0 h-full bg-transparent px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/70 focus:outline-none disabled:opacity-50',
              prefixText && 'pl-1',
              suffix && 'pr-12',
              className
            )}
            {...props}
          />
          {suffix && (
            <span className="absolute right-3 text-xs font-medium text-[var(--text-muted)] select-none pointer-events-none">
              {suffix}
            </span>
          )}
        </div>
        {error && (
          <p role="alert" className="text-xs font-medium text-[var(--danger)]">
            {error}
          </p>
        )}
      </div>
    );
  }
);
TextInput.displayName = 'TextInput';

/**
 * MoneyInput (PKR, tabular numerals, up to 2 decimals)
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, Omit<BaseFieldProps, 'prefixText'>>(
  ({ className, ...props }, ref) => {
    return (
      <TextInput
        ref={ref}
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        prefixText="Rs"
        className={cn('tabular-nums', className)}
        {...props}
      />
    );
  }
);
MoneyInput.displayName = 'MoneyInput';

/**
 * TonInput (Rock and Final Product weights in tons only, never kg, up to 3 decimals)
 */
export const TonInput = React.forwardRef<HTMLInputElement, Omit<BaseFieldProps, 'suffix'>>(
  ({ className, ...props }, ref) => {
    return (
      <TextInput
        ref={ref}
        type="number"
        inputMode="decimal"
        step="0.001"
        min="0"
        suffix="ton"
        className={cn('tabular-nums', className)}
        {...props}
      />
    );
  }
);
TonInput.displayName = 'TonInput';

/**
 * BagInput (Chemical quantities and dispatch bag count in bags only, never kg)
 */
export const BagInput = React.forwardRef<HTMLInputElement, Omit<BaseFieldProps, 'suffix'>>(
  ({ className, ...props }, ref) => {
    return (
      <TextInput
        ref={ref}
        type="number"
        inputMode="numeric"
        step="1"
        min="0"
        suffix="bag"
        className={cn('tabular-nums', className)}
        {...props}
      />
    );
  }
);
BagInput.displayName = 'BagInput';

/**
 * DatePicker (clean native date input styled to tokens)
 */
export const DatePicker = React.forwardRef<HTMLInputElement, BaseFieldProps>(
  ({ className, ...props }, ref) => {
    return (
      <TextInput
        ref={ref}
        type="date"
        className={cn('tabular-nums', className)}
        {...props}
      />
    );
  }
);
DatePicker.displayName = 'DatePicker';

/**
 * DateTimePicker (clean native datetime-local input styled to tokens)
 */
export const DateTimePicker = React.forwardRef<HTMLInputElement, BaseFieldProps>(
  ({ className, ...props }, ref) => {
    return (
      <TextInput
        ref={ref}
        type="datetime-local"
        className={cn('tabular-nums', className)}
        {...props}
      />
    );
  }
);
DateTimePicker.displayName = 'DateTimePicker';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: SelectOption[];
  containerClassName?: string;
}

/**
 * SelectField custom styled to design tokens with 44px/40px height, rounded-[10px], focus-ring
 */
export const SelectField = React.forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, error, options, className, containerClassName, id, children, ...props }, ref) => {
    const inputId = id || (label ? `select_${label.toLowerCase().replace(/\s+/g, '_')}` : undefined);

    return (
      <div className={cn('flex flex-col gap-1.5 min-w-0', containerClassName)}>
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-[var(--text)] select-none">
            {label}
          </label>
        )}
        <div
          className={cn(
            'relative flex items-center w-full min-w-0 rounded-[10px] border bg-[var(--bg)] transition-shadow h-11 sm:h-10 focus-ring',
            error ? 'border-[var(--danger)]' : 'border-[var(--border)]'
          )}
        >
          <select
            ref={ref}
            id={inputId}
            aria-invalid={!!error}
            className={cn(
              'w-full min-w-0 h-full bg-transparent px-3 pr-8 text-sm text-[var(--text)] focus:outline-none appearance-none cursor-pointer disabled:opacity-50',
              className
            )}
            {...props}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-[var(--bg)] text-[var(--text)]">
                {opt.label}
              </option>
            ))}
            {children}
          </select>
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        {error && (
          <p role="alert" className="text-xs font-medium text-[var(--danger)]">
            {error}
          </p>
        )}
      </div>
    );
  }
);
SelectField.displayName = 'SelectField';

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  containerClassName?: string;
}

/**
 * TextArea styled to design tokens with rounded-[10px], focus-ring
 */
export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, error, className, containerClassName, id, rows = 3, ...props }, ref) => {
    const inputId = id || (label ? `area_${label.toLowerCase().replace(/\s+/g, '_')}` : undefined);

    return (
      <div className={cn('flex flex-col gap-1.5 min-w-0', containerClassName)}>
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-[var(--text)] select-none">
            {label}
          </label>
        )}
        <div
          className={cn(
            'relative flex w-full min-w-0 rounded-[10px] border bg-[var(--bg)] transition-shadow focus-ring',
            error ? 'border-[var(--danger)]' : 'border-[var(--border)]'
          )}
        >
          <textarea
            ref={ref}
            id={inputId}
            rows={rows}
            aria-invalid={!!error}
            className={cn(
              'w-full min-w-0 bg-transparent p-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/70 focus:outline-none disabled:opacity-50 resize-y',
              className
            )}
            {...props}
          />
        </div>
        {error && (
          <p role="alert" className="text-xs font-medium text-[var(--danger)]">
            {error}
          </p>
        )}
      </div>
    );
  }
);
TextArea.displayName = 'TextArea';
