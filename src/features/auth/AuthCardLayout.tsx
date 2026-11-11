import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { AlertCircle, ArrowRight, Check, Eye, EyeOff, type LucideIcon } from 'lucide-react';
import React, { forwardRef, useEffect, useId, useRef, useState } from 'react';
import { BrandLoader } from '../../components/loader/BrandLoader';
import { getActiveLogoUrl } from '../../lib/brand';
import { prefersReducedMotion, shake, usePressFeedback } from '../../lib/motion';
import { cn } from '../../lib/utils';

export interface AuthCardLayoutProps {
  subtitle: string;
  /** Increment this counter whenever a submit or credential error occurs */
  errorBurstKey: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Shared D2 Auth Layout for Login, Sign-up, and Forgot Password pages.
 * - Burgundy background (--brand) with two slow-drifting radial depth shapes (~18s GSAP loops)
 * - Centered white card (max-w 420px, radius 20px, padding 32px, shadow-auth-card)
 * - Card entrance (y: 16 -> 0, fade in), one-time logo ring draw + metallic shine reveal,
 *   and 0.06s stagger on title and fields ([data-auth-stagger])
 * - Under-card rose error glow (scaleX 0.6 -> 1.7, opacity 0.9 -> 0 over 1.8s, power2.out)
 *   strictly behind the card (z-0) plus 0.5s card shake on submit failure
 */
export const AuthCardLayout: React.FC<AuthCardLayoutProps> = ({
  subtitle,
  errorBurstKey,
  children,
  footer,
}) => {
  const uid = useId().replace(/:/g, '');
  const containerRef = useRef<HTMLDivElement>(null);
  const orbWarmRef = useRef<HTMLDivElement>(null);
  const orbDeepRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const errorGlowRef = useRef<HTMLDivElement>(null);
  const ringCircleRef = useRef<SVGCircleElement>(null);
  const shineRef = useRef<HTMLDivElement>(null);
  const logoBadgeRef = useRef<HTMLDivElement>(null);

  const logoSize = 84;
  const strokeWidth = 2.25;
  const radius = (logoSize - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;

  // Ambient drifting radial shapes + one-time card entrance, logo reveal, and field stagger
  useGSAP(
    () => {
      const reduced = prefersReducedMotion();

      if (reduced) {
        if (cardRef.current) {
          gsap.set(cardRef.current, { opacity: 1, y: 0 });
        }
        if (ringCircleRef.current) {
          gsap.set(ringCircleRef.current, { strokeDashoffset: 0, opacity: 0.35 });
        }
        const staggerNodes = cardRef.current?.querySelectorAll('[data-auth-stagger]');
        if (staggerNodes && staggerNodes.length > 0) {
          gsap.set(staggerNodes, { opacity: 1, y: 0 });
        }
        return;
      }

      // 1. Slow ~18s ambient drift loops for the two blurred radial shapes
      if (orbWarmRef.current) {
        gsap.to(orbWarmRef.current, {
          x: 48,
          y: -36,
          scale: 1.08,
          duration: 18,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        });
      }

      if (orbDeepRef.current) {
        gsap.to(orbDeepRef.current, {
          x: -44,
          y: 38,
          scale: 1.1,
          duration: 19.5,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        });
      }

      // 2. Entrance timeline: card rises 16px -> logo ring draw + shine -> title & fields stagger (0.06s)
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      if (cardRef.current) {
        tl.fromTo(
          cardRef.current,
          { opacity: 0, y: 16 },
          { opacity: 1, y: 0, duration: 0.44, clearProps: 'transform' }
        );
      }

      if (logoBadgeRef.current) {
        tl.fromTo(
          logoBadgeRef.current,
          { opacity: 0, scale: 0.92, y: 6 },
          { opacity: 1, scale: 1, y: 0, duration: 0.36 },
          '-=0.22'
        );
      }

      if (ringCircleRef.current) {
        tl.fromTo(
          ringCircleRef.current,
          { strokeDashoffset: circumference, opacity: 0.95 },
          { strokeDashoffset: 0, opacity: 0.42, duration: 0.58, ease: 'power2.out' },
          '-=0.28'
        );
      }

      if (shineRef.current) {
        tl.fromTo(
          shineRef.current,
          { xPercent: -170 },
          { xPercent: 230, duration: 0.85, ease: 'power2.inOut' },
          '-=0.35'
        );
      }

      const staggerItems = cardRef.current?.querySelectorAll('[data-auth-stagger]');
      if (staggerItems && staggerItems.length > 0) {
        tl.fromTo(
          staggerItems,
          { opacity: 0, y: 10 },
          {
            opacity: 1,
            y: 0,
            duration: 0.34,
            stagger: 0.06,
            clearProps: 'transform',
          },
          '-=0.52'
        );
      }
    },
    { scope: containerRef }
  );

  // Error burst: shake the card (0.5s) and expand the rose glow underneath (1.8s, power2.out)
  useEffect(() => {
    if (errorBurstKey <= 0) return;

    shake(cardRef.current);

    if (!errorGlowRef.current) return;
    gsap.killTweensOf(errorGlowRef.current);

    if (prefersReducedMotion()) {
      gsap.set(errorGlowRef.current, { opacity: 0 });
      return;
    }

    gsap.fromTo(
      errorGlowRef.current,
      {
        scaleX: 0.6,
        scaleY: 0.85,
        opacity: 0.9,
      },
      {
        scaleX: 1.7,
        scaleY: 1.15,
        opacity: 0,
        duration: 1.8,
        ease: 'power2.out',
      }
    );
  }, [errorBurstKey]);

  const gradId = `mk-auth-ring-${uid}`;

  return (
    <div
      ref={containerRef}
      className="relative min-h-[100dvh] w-full bg-[var(--brand)] overflow-x-hidden overflow-y-auto flex flex-col items-center justify-center px-4 py-6 sm:py-10"
    >
      {/* Subtle drifting radial background shapes (low opacity, no noise/patterns) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden z-0"
      >
        <div
          ref={orbWarmRef}
          className="absolute -top-24 -left-20 h-[420px] w-[420px] sm:h-[540px] sm:w-[540px] rounded-full bg-[var(--brand-glow-warm)] opacity-45 blur-[96px]"
        />
        <div
          ref={orbDeepRef}
          className="absolute -bottom-28 -right-20 h-[440px] w-[440px] sm:h-[580px] sm:w-[580px] rounded-full bg-[var(--brand-deep)] opacity-60 blur-[108px]"
        />
      </div>

      {/* Centered Card Wrapper (my-auto keeps keyboard scroll safe on mobile) */}
      <div className="relative z-10 w-full max-w-[420px] my-auto">
        {/* Under-card error glow: strictly behind the card (z-0), expands outward and fades */}
        <div
          ref={errorGlowRef}
          aria-hidden="true"
          style={{
            background: 'var(--auth-error-glow)',
            opacity: 0,
          }}
          className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 z-0 h-16 w-[88%] rounded-full blur-[10px]"
        />

        {/* Main White Auth Card (z-10, 20px radius, 32px padding on sm+, shadow-auth-card) */}
        <div
          ref={cardRef}
          className="relative z-10 w-full rounded-[20px] bg-[var(--bg)] p-6 sm:p-8 shadow-auth-card"
        >
          {/* Top Logo Reveal + Brand Heading */}
          <div className="flex flex-col items-center text-center mb-6">
            <div
              ref={logoBadgeRef}
              className="relative flex items-center justify-center h-[72px] w-[72px] sm:h-[84px] sm:w-[84px] mb-3.5 select-none"
            >
              <svg
                viewBox={`0 0 ${logoSize} ${logoSize}`}
                fill="none"
                aria-hidden="true"
                className="absolute inset-0 h-full w-full -rotate-90"
              >
                <defs>
                  <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="var(--brand)" />
                    <stop offset="100%" stopColor="var(--brand-mid)" />
                  </linearGradient>
                </defs>
                <circle
                  cx={logoSize / 2}
                  cy={logoSize / 2}
                  r={radius}
                  stroke="var(--border)"
                  strokeWidth={strokeWidth}
                  opacity={0.75}
                />
                <circle
                  ref={ringCircleRef}
                  cx={logoSize / 2}
                  cy={logoSize / 2}
                  r={radius}
                  stroke={`url(#${gradId})`}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={0}
                />
              </svg>

              {/* Circular white badge with MK logo and one-time diagonal shine */}
              <div className="relative flex items-center justify-center h-[60px] w-[60px] sm:h-[70px] sm:w-[70px] rounded-full bg-[var(--bg)] shadow-soft border border-[var(--border)] overflow-hidden p-1.5">
                <img
                  src={getActiveLogoUrl()}
                  alt="MK Melting Solutions"
                  className="h-full w-full object-contain rounded-full"
                />
                <div
                  ref={shineRef}
                  aria-hidden="true"
                  style={{
                    background:
                      'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.68) 50%, rgba(255,255,255,0) 100%)',
                  }}
                  className="pointer-events-none absolute -inset-y-4 w-1/2 -skew-x-25"
                />
              </div>
            </div>

            <h1
              data-auth-stagger
              className="font-heading text-xl sm:text-[22px] font-semibold text-[var(--text)] tracking-tight"
            >
              MK Melting Solutions
            </h1>
            <p
              data-auth-stagger
              className="mt-1 text-sm text-[var(--text-muted)]"
            >
              {subtitle}
            </p>
          </div>

          {children}

          {footer && (
            <div data-auth-stagger className="mt-6 pt-1 text-center">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export interface AuthFloatingFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  icon: LucideIcon;
  error?: string;
  /** Highlights field border & error icon when credentials/submit fail even without a separate message */
  hasSubmitError?: boolean;
  /** Renders animated password visibility eye toggle */
  isPassword?: boolean;
  /** Controlled password visibility state (so password and confirm password can share or toggle cleanly) */
  passwordVisible?: boolean;
  onTogglePasswordVisible?: () => void;
  /** Shows animated green check mark (used on Confirm Password when matching) */
  showMatchCheck?: boolean;
}

/**
 * 48px floating-label input with leading icon, focus bounce, brand focus glow,
 * animated password eye toggle, confirm-password match check, and inline error state.
 */
export const AuthFloatingField = forwardRef<HTMLInputElement, AuthFloatingFieldProps>(
  (
    {
      label,
      icon: Icon,
      error,
      hasSubmitError = false,
      isPassword = false,
      passwordVisible,
      onTogglePasswordVisible,
      showMatchCheck = false,
      id,
      value,
      defaultValue,
      onFocus,
      onBlur,
      onChange,
      className,
      type = 'text',
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || `auth-field-${generatedId}`;
    const errorId = `${inputId}-error`;

    const internalInputRef = useRef<HTMLInputElement | null>(null);
    const iconWrapRef = useRef<HTMLSpanElement>(null);
    const eyeIconRef = useRef<HTMLSpanElement>(null);
    const matchBadgeRef = useRef<HTMLSpanElement>(null);

    const [focused, setFocused] = useState(false);
    const [uncontrolledHasText, setUncontrolledHasText] = useState(() => {
      if (value !== undefined) return String(value).length > 0;
      if (defaultValue !== undefined) return String(defaultValue).length > 0;
      return false;
    });
    const [internalShowPassword, setInternalShowPassword] = useState(false);

    const showPwd = passwordVisible !== undefined ? passwordVisible : internalShowPassword;
    const effectiveType = isPassword ? (showPwd ? 'text' : 'password') : type;

    const hasText =
      value !== undefined
        ? String(value).length > 0
        : uncontrolledHasText || Boolean(internalInputRef.current?.value);

    const isFloated = focused || hasText;
    const isInvalid = Boolean(error) || hasSubmitError;

    // Sync uncontrolled input value on mount / autofill
    useEffect(() => {
      if (internalInputRef.current && internalInputRef.current.value) {
        setUncontrolledHasText(true);
      }
    }, []);

    // Animate match check badge when it appears
    useEffect(() => {
      if (showMatchCheck && matchBadgeRef.current && !prefersReducedMotion()) {
        gsap.fromTo(
          matchBadgeRef.current,
          { scale: 0.3, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.28, ease: 'back.out(2.4)' }
        );
      }
    }, [showMatchCheck]);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(true);
      if (iconWrapRef.current && !prefersReducedMotion()) {
        gsap.killTweensOf(iconWrapRef.current);
        gsap.fromTo(
          iconWrapRef.current,
          { scale: 1, y: 0 },
          {
             keyframes: [
              { scale: 1.18, y: -1.5, duration: 0.14, ease: 'power2.out' },
              { scale: 1, y: 0, duration: 0.18, ease: 'back.out(2)' },
            ],
          }
        );
      }
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(false);
      setUncontrolledHasText(e.currentTarget.value.length > 0);
      onBlur?.(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setUncontrolledHasText(e.currentTarget.value.length > 0);
      onChange?.(e);
    };

    const handleToggleEye = () => {
      if (eyeIconRef.current && !prefersReducedMotion()) {
        gsap.fromTo(
          eyeIconRef.current,
          { scale: 0.65, rotate: -18, opacity: 0.5 },
          { scale: 1, rotate: 0, opacity: 1, duration: 0.24, ease: 'back.out(2.2)' }
        );
      }
      if (onTogglePasswordVisible) {
        onTogglePasswordVisible();
      } else {
        setInternalShowPassword((prev) => !prev);
      }
    };

    return (
      <div data-auth-stagger className="w-full">
        <div
          className={cn(
            'relative flex items-center h-12 w-full rounded-[10px] border bg-[var(--bg)] transition-all duration-200',
            isInvalid
              ? 'border-[var(--danger)] focus-ring-danger'
              : 'border-[var(--border)] focus-ring',
            className
          )}
        >
          {/* Leading Icon */}
          <span
            ref={iconWrapRef}
            aria-hidden="true"
            className={cn(
              'pointer-events-none pl-3.5 pr-2.5 flex items-center justify-center transition-colors duration-200',
              isInvalid
                ? 'text-[var(--danger)]'
                : focused
                  ? 'text-[var(--brand)]'
                  : 'text-[var(--text-muted)]'
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
          </span>

          {/* Floating Label + Input Area */}
          <div className="relative flex-1 h-full">
            <label
              htmlFor={inputId}
              className={cn(
                'pointer-events-none absolute left-0 transition-all duration-200 select-none truncate max-w-full',
                isFloated
                  ? 'top-[6px] text-[11px] font-medium leading-none'
                  : 'top-1/2 -translate-y-1/2 text-sm font-normal leading-none',
                isInvalid
                  ? 'text-[var(--danger)]'
                  : focused
                    ? 'text-[var(--brand)]'
                    : 'text-[var(--text-muted)]'
              )}
            >
              {label}
            </label>

            <input
              ref={(node) => {
                internalInputRef.current = node;
                if (typeof ref === 'function') {
                  ref(node);
                } else if (ref) {
                  ref.current = node;
                }
              }}
              id={inputId}
              type={effectiveType}
              value={value}
              defaultValue={defaultValue}
              aria-invalid={isInvalid}
              aria-describedby={error ? errorId : undefined}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onChange={handleChange}
              className={cn(
                'h-full w-full bg-transparent pt-4 pb-1 pr-2 text-sm text-[var(--text)] focus:outline-none placeholder:text-transparent'
              )}
              {...props}
            />
          </div>

          {/* Trailing Indicators: Match Check, Error Icon, Password Eye */}
          <div className="flex items-center pr-1.5 gap-1">
            {showMatchCheck && !isInvalid && (
              <span
                ref={matchBadgeRef}
                title="Passwords match"
                aria-label="Passwords match"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--success-bg)] border border-[var(--success-border)] text-[var(--success)] mr-1"
              >
                <Check className="h-3 w-3 stroke-[2.5]" />
              </span>
            )}

            {isInvalid && (
              <span
                aria-hidden="true"
                className="inline-flex h-6 w-6 items-center justify-center text-[var(--danger)]"
              >
                <AlertCircle className="h-4 w-4" />
              </span>
            )}

            {isPassword && (
              <button
                type="button"
                onClick={handleToggleEye}
                aria-label={showPwd ? 'Hide password' : 'Show password'}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-[var(--text-muted)] hover:text-[var(--text)] focus-visible:outline-none focus-ring cursor-pointer transition-colors"
              >
                <span ref={eyeIconRef} className="inline-flex items-center justify-center">
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Inline field error message */}
        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--danger)]"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
      </div>
    );
  }
);

AuthFloatingField.displayName = 'AuthFloatingField';

/**
 * Evaluates password strength on a 0..4 scale for the 4-segment meter.
 */
export function evaluatePasswordStrength(password: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
} {
  if (!password) return { score: 0, label: '' };

  let points = 0;
  if (password.length >= 4) points += 1;
  if (password.length >= 8) points += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password)) {
    points += 1;
  } else if (/\d/.test(password) && password.length >= 8) {
    points += 1;
  }
  if ((/[^A-Za-z0-9]/.test(password) && password.length >= 8) || password.length >= 12) {
    points += 1;
  }

  const clamped = Math.min(4, Math.max(1, points)) as 1 | 2 | 3 | 4;
  const labels: Record<1 | 2 | 3 | 4, string> = {
    1: 'Weak',
    2: 'Fair',
    3: 'Good',
    4: 'Strong',
  };

  return { score: clamped, label: labels[clamped] };
}

export const PasswordStrengthMeter: React.FC<{ password: string }> = ({ password }) => {
  const { score, label } = evaluatePasswordStrength(password);

  const getSegmentColor = (segmentIndex: number) => {
    if (score < segmentIndex) return 'bg-[var(--border)]';
    if (score === 1) return 'bg-[var(--danger)]';
    if (score === 2) return 'bg-[var(--brand-mid)]';
    if (score === 3) return 'bg-[var(--brand)]';
    return 'bg-[var(--success)]';
  };

  return (
    <div data-auth-stagger className="space-y-1.5 pt-0.5" aria-live="polite">
      <div className="grid grid-cols-4 gap-1.5" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={4} aria-label="Password strength">
        {[1, 2, 3, 4].map((seg) => (
          <div
            key={seg}
            className="h-1.5 w-full rounded-full bg-[var(--border)] overflow-hidden"
          >
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300 ease-out',
                getSegmentColor(seg),
                score >= seg ? 'w-full opacity-100' : 'w-0 opacity-0'
              )}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-[11px] leading-none">
        <span className="text-[var(--text-muted)]">Minimum 8 characters</span>
        {label && (
          <span
            className={cn(
              'font-semibold',
              score === 1 && 'text-[var(--danger)]',
              score === 2 && 'text-[var(--text-muted)]',
              score === 3 && 'text-[var(--brand)]',
              score === 4 && 'text-[var(--success)]'
            )}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * Rounded error pill that slides in above the submit button on failed submit.
 */
export const AuthErrorPill: React.FC<{ message: string | null }> = ({ message }) => {
  const pillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (message && pillRef.current && !prefersReducedMotion()) {
      gsap.fromTo(
        pillRef.current,
        { opacity: 0, y: -6, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.25, ease: 'power2.out' }
      );
    }
  }, [message]);

  return (
    <div aria-live="assertive" aria-atomic="true">
      {message && (
        <div
          ref={pillRef}
          role="alert"
          className="rounded-[10px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-xs font-medium text-[var(--danger)] flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-[var(--danger)]" aria-hidden="true" />
          <span>{message}</span>
        </div>
      )}
    </div>
  );
};

export interface AuthPrimaryButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  succeeded?: boolean;
  children: React.ReactNode;
}

/**
 * Primary 48px Auth Button:
 * - Full width, --grad-brand, white text weight 600
 * - Hover: lifts 1px, light sheen sweeps across, arrow icon nudges right
 * - Press: scale 0.98
 * - Loading: label smoothly becomes BrandLoader xs ring without changing width
 * - Success: quick check mark pop before page transition
 */
export const AuthPrimaryButton: React.FC<AuthPrimaryButtonProps> = ({
  loading = false,
  succeeded = false,
  disabled,
  children,
  className,
  ...props
}) => {
  const btnRef = useRef<HTMLButtonElement>(null);
  const checkRef = useRef<HTMLSpanElement>(null);
  const isDisabled = disabled || loading || succeeded;

  usePressFeedback(btnRef, { hoverLift: false, disabled: isDisabled });

  useEffect(() => {
    if (succeeded && checkRef.current && !prefersReducedMotion()) {
      gsap.fromTo(
        checkRef.current,
        { scale: 0.4, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.26, ease: 'back.out(2.4)' }
      );
    }
  }, [succeeded]);

  return (
    <div data-auth-stagger className="w-full">
      <button
        ref={btnRef}
        type="submit"
        disabled={isDisabled}
        aria-busy={loading}
        className={cn(
          'group relative inline-flex h-12 w-full items-center justify-center overflow-hidden rounded-[10px] px-5 text-sm font-semibold text-white glow-btn-primary focus-ring transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-90 hover:not-disabled:-translate-y-[1px]',
          className
        )}
        {...props}
      >
        {/* Hover light sheen sweep */}
        <span
          aria-hidden="true"
          className="auth-btn-sheen pointer-events-none absolute inset-0"
        />

        {/* Button label + nudging arrow (invisible when loading/succeeded so button width never shifts) */}
        <span
          className={cn(
            'relative z-10 inline-flex items-center justify-center gap-2 transition-opacity duration-150',
            (loading || succeeded) && 'opacity-0 pointer-events-none'
          )}
        >
          <span>{children}</span>
          <ArrowRight
            className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
            aria-hidden="true"
          />
        </span>

        {/* Loading state: BrandLoader xs ring centered */}
        {loading && !succeeded && (
          <span className=" absolute inset-0 z-10 flex items-center justify-center">
            <BrandLoader size="xs" variant="inline" />
          </span>
        )}

        {/* Success state: quick check mark before transition */}
        {succeeded && (
          <span
            ref={checkRef}
            className="absolute inset-0 z-10 flex items-center justify-center"
            aria-label="Success"
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-white">
              <Check className="h-4 w-4 stroke-[2.75]" />
            </span>
          </span>
        )}
      </button>
    </div>
  );
};
