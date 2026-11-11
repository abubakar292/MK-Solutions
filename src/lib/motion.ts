import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { type RefObject, useEffect, useRef, useState } from 'react';

gsap.registerPlugin(useGSAP);

export const MOTION_DURATIONS = {
  fast: 0.18,
  base: 0.3,
  slow: 0.5,
  enter: 0.6,
} as const;

export const MOTION_EASING = {
  in: 'power3.out', // Smooth deceleration into view (A3)
  out: 'power2.in', // Clean acceleration out of view (A3)
} as const;

/**
 * Single centralized check for prefers-reduced-motion per A3.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => prefersReducedMotion());

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}

/**
 * D1.3: usePageEnter — Entrance animation on first mount or route change (transform + opacity, 0.3s, power3.out).
 */
export function usePageEnter(
  containerRef: RefObject<HTMLElement | null>,
  routeKey = 'default'
) {
  useGSAP(
    () => {
      const el = containerRef.current;
      if (!el) return;
      gsap.killTweensOf(el);

      if (prefersReducedMotion()) {
        gsap.fromTo(el, { opacity: 0.92, y: 0 }, { opacity: 1, y: 0, duration: 0.1 });
        return;
      }

      gsap.fromTo(
        el,
        { opacity: 0, y: 8 },
        {
          opacity: 1,
          y: 0,
          duration: MOTION_DURATIONS.base,
          ease: MOTION_EASING.in,
          clearProps: 'transform',
        }
      );

      return () => {
        gsap.killTweensOf(el);
      };
    },
    { dependencies: [routeKey], scope: containerRef }
  );
}

// Alias for existing callers
export const usePageTransition = usePageEnter;

/**
 * D1.3: useStaggerIn — Staggered entrance for cards, stat cards, and table rows.
 * Runs once on first mount, never replays on background refetch.
 */
export function useStaggerIn(
  containerRef: RefObject<HTMLElement | null>,
  selector = '[data-stagger-item]',
  enabled = true
) {
  const hasAnimatedRef = useRef(false);

  useGSAP(
    () => {
      if (!enabled || hasAnimatedRef.current) return;
      const el = containerRef.current;
      if (!el) return;

      const targets = Array.from(el.querySelectorAll<HTMLElement>(selector)).slice(0, 12);
      if (targets.length === 0) return;

      hasAnimatedRef.current = true;

      if (prefersReducedMotion()) {
        gsap.set(targets, { opacity: 1, y: 0 });
        return;
      }

      const tween = gsap.fromTo(
        targets,
        { opacity: 0, y: 8 },
        {
          opacity: 1,
          y: 0,
          duration: MOTION_DURATIONS.base,
          stagger: 0.04,
          ease: MOTION_EASING.in,
          clearProps: 'transform',
        }
      );

      return () => {
        tween.kill();
      };
    },
    { dependencies: [enabled], scope: containerRef }
  );
}

// Alias for existing callers
export const useStaggerEntrance = useStaggerIn;

/**
 * D1.3: useCountUp — Count up a numeric value once on first appearance.
 */
export function useCountUp(
  targetValue: number,
  formatter: (val: number) => string,
  duration: number = MOTION_DURATIONS.slow
): string {
  const [displayValue, setDisplayValue] = useState<string>(() => formatter(targetValue));
  const animatedOnceRef = useRef(false);

  useEffect(() => {
    if (animatedOnceRef.current || prefersReducedMotion() || targetValue === 0) {
      setDisplayValue(formatter(targetValue));
      animatedOnceRef.current = true;
      return;
    }

    animatedOnceRef.current = true;
    const counter = { val: 0 };
    const tween = gsap.to(counter, {
      val: targetValue,
      duration,
      ease: MOTION_EASING.in,
      onUpdate: () => {
        setDisplayValue(formatter(counter.val));
      },
      onComplete: () => {
        setDisplayValue(formatter(targetValue));
      },
    });

    return () => {
      tween.kill();
    };
  }, [targetValue, formatter, duration]);

  return displayValue;
}

// Alias for existing callers
export const useCountUpOnce = useCountUp;

/**
 * D1.3: useCollapse — Smoothly reveals/collapses a section container using transform and opacity.
 */
export function useCollapse(
  contentRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  duration: number = MOTION_DURATIONS.fast
) {
  useGSAP(
    () => {
      const el = contentRef.current;
      if (!el) return;
      gsap.killTweensOf(el);

      if (prefersReducedMotion()) {
        gsap.set(el, {
          opacity: isOpen ? 1 : 0,
          y: 0,
          display: isOpen ? 'block' : 'none',
        });
        return;
      }

      if (isOpen) {
        gsap.set(el, { display: 'block' });
        gsap.fromTo(
          el,
          { opacity: 0, y: -6 },
          {
            opacity: 1,
            y: 0,
            duration,
            ease: MOTION_EASING.in,
            clearProps: 'transform',
          }
        );
      } else {
        gsap.to(el, {
          opacity: 0,
          y: -4,
          duration,
          ease: MOTION_EASING.out,
          onComplete: () => {
            gsap.set(el, { display: 'none' });
          },
        });
      }

      return () => {
        gsap.killTweensOf(el);
      };
    },
    { dependencies: [isOpen, duration] }
  );
}

/**
 * D1.3: useDialogMotion — Dialog / bottom sheet entrance animation:
 * fade + scale from 0.96 + upward move on desktop; slide up as bottom sheet on mobile (< 640px).
 */
export function useDialogMotion(
  panelRef: RefObject<HTMLElement | null>,
  backdropRef: RefObject<HTMLElement | null>,
  isOpen: boolean
) {
  useGSAP(
    () => {
      if (!isOpen) return;
      const panel = panelRef.current;
      const backdrop = backdropRef.current;

      if (prefersReducedMotion()) {
        if (backdrop) gsap.set(backdrop, { opacity: 1 });
        if (panel) gsap.set(panel, { opacity: 1, scale: 1, y: 0 });
        return;
      }

      const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

      if (backdrop) {
        gsap.killTweensOf(backdrop);
        gsap.fromTo(
          backdrop,
          { opacity: 0 },
          { opacity: 1, duration: MOTION_DURATIONS.fast, ease: MOTION_EASING.in }
        );
      }

      if (panel) {
        gsap.killTweensOf(panel);
        if (isMobile) {
          gsap.fromTo(
            panel,
            { opacity: 0, y: 36 },
            {
              opacity: 1,
              y: 0,
              duration: MOTION_DURATIONS.base,
              ease: MOTION_EASING.in,
              clearProps: 'transform',
            }
          );
        } else {
          gsap.fromTo(
            panel,
            { opacity: 0, scale: 0.96, y: 8 },
            {
              opacity: 1,
              scale: 1,
              y: 0,
              duration: MOTION_DURATIONS.base,
              ease: MOTION_EASING.in,
              clearProps: 'transform',
            }
          );
        }
      }

      return () => {
        if (backdrop) gsap.killTweensOf(backdrop);
        if (panel) gsap.killTweensOf(panel);
      };
    },
    { dependencies: [isOpen] }
  );
}

// Alias for existing callers
export const useDialogEntrance = useDialogMotion;

/**
 * D1.3: usePressFeedback — Tactile GSAP press scale (0.97) and optional subtle hover lift (-1px).
 */
export function usePressFeedback(
  elementRef: RefObject<HTMLElement | null>,
  options: { hoverLift?: boolean; disabled?: boolean } = {}
) {
  const { hoverLift = false, disabled = false } = options;

  useEffect(() => {
    const el = elementRef.current;
    if (!el || disabled || prefersReducedMotion()) return;

    const onPointerDown = () => {
      gsap.to(el, {
        scale: 0.97,
        duration: MOTION_DURATIONS.fast,
        ease: MOTION_EASING.in,
        overwrite: 'auto',
      });
    };

    const onPointerUp = () => {
      gsap.to(el, {
        scale: 1,
        y: hoverLift ? -1 : 0,
        duration: MOTION_DURATIONS.fast,
        ease: MOTION_EASING.in,
        overwrite: 'auto',
      });
    };

    const onPointerEnter = () => {
      if (!hoverLift) return;
      gsap.to(el, {
        y: -1,
        duration: MOTION_DURATIONS.fast,
        ease: MOTION_EASING.in,
        overwrite: 'auto',
      });
    };

    const onPointerLeave = () => {
      gsap.to(el, {
        scale: 1,
        y: 0,
        duration: MOTION_DURATIONS.fast,
        ease: MOTION_EASING.in,
        overwrite: 'auto',
      });
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointerenter', onPointerEnter);
    el.addEventListener('pointerleave', onPointerLeave);
    el.addEventListener('pointercancel', onPointerLeave);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointerenter', onPointerEnter);
      el.removeEventListener('pointerleave', onPointerLeave);
      el.removeEventListener('pointercancel', onPointerLeave);
      gsap.killTweensOf(el);
    };
  }, [elementRef, hoverLift, disabled]);
}

/**
 * D1.3: shake(el) — Horizontal shake with x keyframes ±10, ±7, ±4, 0 over 0.5 s.
 */
export function shake(element: HTMLElement | null): void {
  if (!element || prefersReducedMotion()) return;
  gsap.killTweensOf(element);
  gsap.to(element, {
    keyframes: [
      { x: -10, duration: 0.07 },
      { x: 10, duration: 0.08 },
      { x: -7, duration: 0.08 },
      { x: 7, duration: 0.08 },
      { x: -4, duration: 0.07 },
      { x: 4, duration: 0.06 },
      { x: 0, duration: 0.06 },
    ],
    ease: 'power2.out',
    clearProps: 'transform',
  });
}

// Alias for existing callers
export const triggerInvalidShake = shake;
