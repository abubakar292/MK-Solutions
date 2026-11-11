import { Check } from 'lucide-react';
import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { usePressFeedback } from '../../lib/motion';
import { cn } from '../../lib/utils';
import { BrandLoader } from '../loader/BrandLoader';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  saved?: boolean;
}

/**
 * Button component themed to A2, D1.1, D1.2 & D1.3:
 * - Primary: brand-gradient background, white text, weight 600, soft brand glow
 * - Secondary: white (--bg) with 1px --border
 * - Destructive: outlined in --danger, never filled with brand
 * - Uses BrandLoader (size="xs", variant="inline") during loading, replacing the label smoothly while keeping button width
 * - Uses usePressFeedback for tactile scale & hover lift
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      saved = false,
      disabled,
      children,
      ...props
    },
    forwardedRef
  ) => {
    const innerRef = useRef<HTMLButtonElement>(null);
    useImperativeHandle(forwardedRef, () => innerRef.current as HTMLButtonElement);

    const [showCheck, setShowCheck] = useState(false);

    useEffect(() => {
      if (saved) {
        setShowCheck(true);
        const timer = window.setTimeout(() => {
          setShowCheck(false);
        }, 600);
        return () => window.clearTimeout(timer);
      }
      setShowCheck(false);
    }, [saved]);

    usePressFeedback(innerRef, {
      hoverLift: variant === 'primary',
      disabled: Boolean(disabled || loading),
    });

    const variantStyles: Record<ButtonVariant, string> = {
      primary:
        'bg-[var(--brand)] bg-brand-gradient text-[var(--bg)] font-semibold hover:bg-[var(--brand-deep)] glow-btn-primary border border-transparent',
      secondary:
        'bg-[var(--bg)] text-[var(--text)] font-medium border border-[var(--border)] hover:bg-[var(--surface-subtle)]',
      destructive:
        'bg-[var(--bg)] text-[var(--danger)] font-medium border border-[var(--danger)] hover:bg-[var(--danger-bg)]',
      ghost:
        'bg-transparent text-[var(--text)] font-medium hover:bg-[var(--surface-subtle)] border border-transparent',
    };

    const sizeStyles: Record<ButtonSize, string> = {
      sm: 'h-9 px-3 text-xs rounded-[10px]',
      md: 'h-11 sm:h-10 px-4 text-sm rounded-[10px]',
      lg: 'h-11 px-5 text-sm rounded-[10px]',
      icon: 'h-11 w-11 sm:h-10 sm:w-10 p-0 rounded-[10px]',
    };

    return (
      <button
        ref={innerRef}
        disabled={disabled || loading}
        className={cn(
          'relative inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 select-none cursor-pointer transition-colors duration-150 disabled:opacity-55 disabled:pointer-events-none focus-visible:outline-none focus-ring',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        <span
          className={cn(
            'inline-flex items-center justify-center gap-2 transition-opacity duration-150',
            (loading || showCheck) && 'opacity-0'
          )}
        >
          {children}
        </span>

        {loading && (
          <span
            aria-label="Loading"
            className="absolute inset-0 flex items-center justify-center"
          >
            <BrandLoader size="xs" variant="inline" />
          </span>
        )}

        {!loading && showCheck && (
          <span
            aria-label="Saved"
            className="absolute inset-0 flex items-center justify-center"
          >
            <Check className="h-4 w-4 text-current" />
          </span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
