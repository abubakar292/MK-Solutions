import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import React, { useEffect, useId, useRef, useState } from 'react';
import { getActiveLogoUrl } from '../../lib/brand';
import { MOTION_EASING, prefersReducedMotion } from '../../lib/motion';
import { cn } from '../../lib/utils';

export type BrandLoaderSize = 'xs' | 'sm' | 'md' | 'lg';
export type BrandLoaderVariant = 'inline' | 'section' | 'overlay' | 'splash';

export interface BrandLoaderProps {
  size?: BrandLoaderSize;
  variant?: BrandLoaderVariant;
  label?: string;
  labelDelayMs?: number;
  exiting?: boolean;
  onExitComplete?: () => void;
  companyId?: string;
  className?: string;
}

const SIZE_CONFIG: Record<
  BrandLoaderSize,
  {
    px: number;
    strokeWidth: number;
    badgePx: number;
    logoPx: number;
    dotRadius: number;
    showLogo: boolean;
  }
> = {
  xs: {
    px: 20,
    strokeWidth: 2.2,
    badgePx: 0,
    logoPx: 0,
    dotRadius: 1.75,
    showLogo: false,
  },
  sm: {
    px: 48,
    strokeWidth: 2.5,
    badgePx: 30,
    logoPx: 22,
    dotRadius: 2.4,
    showLogo: true,
  },
  md: {
    px: 80,
    strokeWidth: 3,
    badgePx: 52,
    logoPx: 38,
    dotRadius: 3.1,
    showLogo: true,
  },
  lg: {
    px: 128,
    strokeWidth: 3.6,
    badgePx: 86,
    logoPx: 64,
    dotRadius: 4,
    showLogo: true,
  },
};

/**
 * BrandLoader (D1.2):
 * Single unified animated logo loader built with GSAP + SVG.
 * - Centered MK logo inside a white circular badge with soft shadow (omitted for xs 20px).
 * - SVG ring around it: thin track circle (--border), main gradient arc (--brand to --brand-mid)
 *   rotating smoothly (1.6s per turn, linear), shorter second arc rotating the opposite way at lower opacity,
 *   and one small dot orbiting on the ring.
 * - Logo gently breathes (scale 1 to 1.03) and a subtle diagonal shine sweep passes across it every few seconds.
 * - Entrance: ring draws in (stroke-dashoffset, 0.6s), logo fades up.
 * - Exit: arc completes a full turn, logo scales to 1.05 and fades.
 */
export const BrandLoader: React.FC<BrandLoaderProps> = ({
  size = 'md',
  variant = 'inline',
  label,
  labelDelayMs,
  exiting = false,
  onExitComplete,
  companyId,
  className,
}) => {
  const uid = useId().replace(/:/g, '');
  const cfg = SIZE_CONFIG[size];
  const center = cfg.px / 2;
  const radius = center - cfg.strokeWidth - 2;
  const circumference = 2 * Math.PI * radius;
  const mainArcLen = circumference * 0.36;
  const secondaryArcLen = circumference * 0.18;

  const rootRef = useRef<HTMLDivElement>(null);
  const primaryOrbitRef = useRef<SVGGElement>(null);
  const secondaryOrbitRef = useRef<SVGGElement>(null);
  const dotOrbitRef = useRef<SVGGElement>(null);
  const mainArcRef = useRef<SVGCircleElement>(null);
  const secondArcRef = useRef<SVGCircleElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const shineRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLParagraphElement>(null);

  const [logoSrc, setLogoSrc] = useState<string>(() => getActiveLogoUrl(companyId));
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    const sync = () => {
      setLogoSrc(getActiveLogoUrl(companyId));
      setImgFailed(false);
    };
    window.addEventListener('mk-logo-updated', sync);
    return () => window.removeEventListener('mk-logo-updated', sync);
  }, [companyId]);

  const effectiveLabelDelay =
    labelDelayMs !== undefined ? labelDelayMs : variant === 'overlay' ? 200 : 2000;

  // Entrance and continuous orbit + breathing + shine animations
  useGSAP(
    () => {
      const reduced = prefersReducedMotion();
      const primaryOrbit = primaryOrbitRef.current;
      const secondaryOrbit = secondaryOrbitRef.current;
      const dotOrbit = dotOrbitRef.current;
      const mainArc = mainArcRef.current;
      const secondArc = secondArcRef.current;
      const badge = badgeRef.current;
      const shine = shineRef.current;
      const labelEl = labelRef.current;

      const tweens: gsap.core.Animation[] = [];

      if (reduced) {
        if (mainArc) gsap.set(mainArc, { strokeDashoffset: circumference - mainArcLen });
        if (secondArc) {
          gsap.set(secondArc, { strokeDashoffset: circumference - secondaryArcLen });
        }
        if (badge) gsap.set(badge, { opacity: 1, y: 0, scale: 1 });
        if (labelEl && label) gsap.set(labelEl, { opacity: 1 });
        return;
      }

      // 1. Entrance: ring draws in over 0.6s
      if (mainArc) {
        tweens.push(
          gsap.fromTo(
            mainArc,
            { strokeDashoffset: circumference },
            {
              strokeDashoffset: circumference - mainArcLen,
              duration: 0.6,
              ease: MOTION_EASING.in,
            }
          )
        );
      }
      if (secondArc) {
        tweens.push(
          gsap.fromTo(
            secondArc,
            { strokeDashoffset: circumference },
            {
              strokeDashoffset: circumference - secondaryArcLen,
              duration: 0.6,
              ease: MOTION_EASING.in,
            }
          )
        );
      }

      // 2. Entrance + gentle breathing for the center logo badge
      if (badge) {
        tweens.push(
          gsap.fromTo(
            badge,
            { opacity: 0, y: 5, scale: 0.95 },
            {
              opacity: 1,
              y: 0,
              scale: 1,
              duration: 0.45,
              ease: MOTION_EASING.in,
            }
          )
        );

        tweens.push(
          gsap.to(badge, {
            scale: 1.03,
            duration: 1.4,
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
            delay: 0.45,
          })
        );
      }

      // 3. Smooth continuous orbit rotations (1.6s per turn linear)
      if (primaryOrbit) {
        tweens.push(
          gsap.to(primaryOrbit, {
            rotation: 360,
            svgOrigin: `${center} ${center}`,
            duration: 1.6,
            repeat: -1,
            ease: 'none',
          })
        );
      }

      if (secondaryOrbit) {
        tweens.push(
          gsap.to(secondaryOrbit, {
            rotation: -360,
            svgOrigin: `${center} ${center}`,
            duration: 2.2,
            repeat: -1,
            ease: 'none',
          })
        );
      }

      if (dotOrbit) {
        tweens.push(
          gsap.to(dotOrbit, {
            rotation: 360,
            svgOrigin: `${center} ${center}`,
            duration: 1.6,
            repeat: -1,
            ease: 'none',
          })
        );
      }

      // 4. Periodic diagonal metallic shine sweep across logo badge
      if (shine) {
        const shineTl = gsap.timeline({ repeat: -1, repeatDelay: 2.4, delay: 0.9 });
        shineTl.fromTo(
          shine,
          { xPercent: -160, opacity: 0 },
          {
            xPercent: 160,
            opacity: 0.85,
            duration: 0.6,
            ease: MOTION_EASING.in,
          }
        );
        shineTl.to(shine, { opacity: 0, duration: 0.15 });
        tweens.push(shineTl);
      }

      // 5. Optional label fade-in after delay (default 2s)
      if (labelEl && label) {
        tweens.push(
          gsap.fromTo(
            labelEl,
            { opacity: 0, y: 3 },
            {
              opacity: 1,
              y: 0,
              duration: 0.3,
              delay: effectiveLabelDelay / 1000,
              ease: MOTION_EASING.in,
            }
          )
        );
      }

      return () => {
        for (const t of tweens) {
          t.kill();
        }
      };
    },
    { dependencies: [size, label, effectiveLabelDelay], scope: rootRef }
  );

  // Exit animation: arc completes a full turn, logo scales to 1.05 and fades
  useGSAP(
    () => {
      if (!exiting) return;
      const root = rootRef.current;
      const primaryOrbit = primaryOrbitRef.current;
      const badge = badgeRef.current;

      if (prefersReducedMotion()) {
        if (root) {
          gsap.to(root, {
            opacity: 0,
            duration: 0.1,
            onComplete: () => onExitComplete?.(),
          });
        } else {
          onExitComplete?.();
        }
        return;
      }

      const tl = gsap.timeline({
        onComplete: () => onExitComplete?.(),
      });

      if (primaryOrbit) {
        tl.to(
          primaryOrbit,
          {
            rotation: '+=360',
            svgOrigin: `${center} ${center}`,
            duration: 0.42,
            ease: MOTION_EASING.in,
          },
          0
        );
      }

      if (badge) {
        gsap.killTweensOf(badge);
        tl.to(
          badge,
          {
            scale: 1.05,
            opacity: 0,
            duration: 0.32,
            ease: MOTION_EASING.out,
          },
          0.1
        );
      }

      if (root) {
        tl.to(
          root,
          {
            opacity: 0,
            y: variant === 'splash' ? -24 : 0,
            duration: 0.32,
            ease: MOTION_EASING.out,
          },
          0.18
        );
      }

      return () => {
        tl.kill();
      };
    },
    { dependencies: [exiting, variant] }
  );

  const gradId = `mk-loader-grad-${uid}`;

  const coreWidget = (
    <div
      className="flex flex-col items-center justify-center shrink-0 select-none"
      style={{ minWidth: cfg.px, minHeight: cfg.px }}
    >
      <div
        className="relative flex items-center justify-center shrink-0"
        style={{ width: cfg.px, height: cfg.px }}
      >
        <svg
          width={cfg.px}
          height={cfg.px}
          viewBox={`0 0 ${cfg.px} ${cfg.px}`}
          fill="none"
          aria-hidden="true"
          className="block overflow-visible"
        >
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--brand)" />
              <stop offset="100%" stopColor="var(--brand-mid)" />
            </linearGradient>
          </defs>

          {/* Thin track circle (--border) */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            stroke="var(--border)"
            strokeWidth={cfg.strokeWidth}
             opacity={size === 'xs' ? 0.45 : 0.85}
          />

          {/* Counter-rotating secondary arc at lower opacity */}
          <g ref={secondaryOrbitRef}>
            <circle
              ref={secondArcRef}
              cx={center}
              cy={center}
              r={radius}
              stroke="var(--brand-mid)"
              strokeWidth={Math.max(1.5, cfg.strokeWidth * 0.8)}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - secondaryArcLen}
              opacity={0.45}
              transform={`rotate(140 ${center} ${center})`}
            />
          </g>

          {/* Main gradient arc rotating smoothly (1.6s per turn) */}
          <g ref={primaryOrbitRef}>
            <circle
              ref={mainArcRef}
              cx={center}
              cy={center}
              r={radius}
              stroke={size === 'xs' ? 'currentColor' : `url(#${gradId})`}
              strokeWidth={cfg.strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - mainArcLen}
              transform={`rotate(-90 ${center} ${center})`}
            />
          </g>

          {/* Small orbiting dot on the ring */}
          <g ref={dotOrbitRef}>
            <circle
              cx={center}
              cy={center - radius}
              r={cfg.dotRadius}
              fill={size === 'xs' ? 'currentColor' : 'var(--brand)'}
            />
          </g>
        </svg>

        {/* Centered white circular badge with MK logo and diagonal metallic shine */}
        {cfg.showLogo && (
          <div
            ref={badgeRef}
            className="absolute flex items-center justify-center rounded-full bg-[var(--bg)] border border-[var(--border)] shadow-soft overflow-hidden"
            style={{ width: cfg.badgePx, height: cfg.badgePx }}
          >
            {!imgFailed ? (
              <img
                src={logoSrc}
                alt="MK Solutions"
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="object-contain select-none pointer-events-none"
                style={{ width: cfg.logoPx, height: cfg.logoPx }}
              />
            ) : (
              <span
                className="font-heading font-bold text-[var(--brand)] tracking-tight select-none"
                style={{ fontSize: Math.max(11, Math.round(cfg.logoPx * 0.38)) }}
              >
                MK
              </span>
            )}

            {/* Subtle diagonal metallic shine sweep */}
            <div
              ref={shineRef}
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 opacity-0"
              style={{
                background:
                  'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.78) 50%, rgba(248,237,242,0) 100%)',
              }}
            />
          </div>
        )}
      </div>

      {label && (
        <div className="mt-3 min-h-[18px] flex items-center justify-center">
          <p
            ref={labelRef}
            className="text-xs font-medium text-[var(--text-muted)] text-center opacity-0"
          >
            {label}
          </p>
        </div>
      )}
    </div>
  );

  if (variant === 'splash') {
    return (
      <div
        ref={rootRef}
        role="status"
        aria-live="polite"
        aria-label={label || 'Loading MK Solutions'}
        className={cn(
          'fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[var(--bg)] px-6 select-none no-print',
          className
        )}
      >
        {coreWidget}
      </div>
    );
  }

  if (variant === 'overlay') {
    return (
      <div
        ref={rootRef}
        role="status"
        aria-live="polite"
        aria-label={label || 'Loading'}
        className={cn(
          'fixed inset-0 z-[95] flex items-center justify-center bg-[var(--text)]/20 backdrop-blur-[2px] p-4 select-none no-print',
          className
        )}
      >
        <div className="flex flex-col items-center justify-center rounded-[16px] border border-[var(--border)] bg-[var(--bg)] px-7 py-6 shadow-pop">
          {coreWidget}
        </div>
      </div>
    );
  }

  if (variant === 'section') {
    return (
      <div
        ref={rootRef}
        role="status"
        aria-live="polite"
        aria-label={label || 'Loading section'}
        className={cn(
          'flex w-full flex-col items-center justify-center py-6 select-none',
          className
        )}
      >
        {coreWidget}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      role="status"
      aria-live="polite"
      aria-label={label || 'Loading'}
      className={cn('inline-flex items-center justify-center shrink-0', className)}
    >
      {coreWidget}
    </div>
  );
};
