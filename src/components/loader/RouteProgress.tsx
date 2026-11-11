import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import React, { useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { MOTION_DURATIONS, MOTION_EASING, prefersReducedMotion } from '../../lib/motion';

/**
 * Slim 2px brand-gradient progress bar at the top on every route change (D1.2).
 */
export const RouteProgress: React.FC = () => {
  const location = useLocation();
  const barRef = useRef<HTMLDivElement>(null);
  const firstRenderRef = useRef(true);

  useGSAP(
    () => {
      if (firstRenderRef.current) {
        firstRenderRef.current = false;
        return;
      }

      const bar = barRef.current;
      if (!bar) return;

      gsap.killTweensOf(bar);

      if (prefersReducedMotion()) {
        gsap.fromTo(
          bar,
          { scaleX: 1, opacity: 1 },
          { opacity: 0, duration: 0.1 }
        );
        return;
      }

      const tl = gsap.timeline();
      tl.set(bar, { scaleX: 0, opacity: 1, transformOrigin: 'left center' })
        .to(bar, {
          scaleX: 0.8,
          duration: MOTION_DURATIONS.fast,
          ease: MOTION_EASING.in,
        })
        .to(bar, {
          scaleX: 1,
          duration: 0.12,
          ease: MOTION_EASING.in,
        })
        .to(bar, {
          opacity: 0,
          duration: MOTION_DURATIONS.fast,
          ease: MOTION_EASING.out,
        });

      return () => {
        tl.kill();
      };
    },
    { dependencies: [location.pathname] }
  );

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 right-0 z-[90] h-[2px] overflow-hidden no-print"
    >
      <div
        ref={barRef}
        className="h-full w-full origin-left scale-x-0 opacity-0 bg-brand-gradient"
      />
    </div>
  );
};
