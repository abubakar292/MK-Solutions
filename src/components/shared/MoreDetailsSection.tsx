import { ChevronDown } from 'lucide-react';
import React, { useId, useRef, useState } from 'react';
import gsap from 'gsap';
import { MOTION_DURATIONS, MOTION_EASING, prefersReducedMotion } from '../../lib/motion';
import { cn } from '../../lib/utils';

interface MoreDetailsSectionProps {
  children: React.ReactNode;
  title?: string;
  defaultOpen?: boolean;
  className?: string;
}

/**
 * Reusable collapsible "More details" section for dialogs per D6:
 * - Hidden by default under collapsible toggle.
 * - Smooth GSAP height animation (0.3s, power3.out).
 * - Thin divider separating sections.
 * - Single column on mobile, two-column grid on desktop.
 */
export const MoreDetailsSection: React.FC<MoreDetailsSectionProps> = ({
  children,
  title = 'More details',
  defaultOpen = false,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentId = useId();

  const toggle = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);

    const el = contentRef.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      el.style.height = nextState ? 'auto' : '0px';
      el.style.opacity = nextState ? '1' : '0';
      return;
    }

    gsap.killTweensOf(el);

    if (nextState) {
      // Expand
      gsap.fromTo(
        el,
        { height: 0, opacity: 0 },
        {
          height: 'auto',
          opacity: 1,
          duration: MOTION_DURATIONS.base,
          ease: MOTION_EASING.in,
          clearProps: 'height',
        }
      );
    } else {
      // Collapse
      gsap.to(el, {
        height: 0,
        opacity: 0,
        duration: MOTION_DURATIONS.fast,
        ease: MOTION_EASING.out,
      });
    }
  };

  return (
    <div ref={containerRef} className={cn('pt-3 border-t border-[var(--border)] mt-4', className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className="w-full flex items-center justify-between py-2 text-sm font-medium text-[var(--brand)] hover:text-[var(--brand-dark)] transition-colors cursor-pointer select-none group focus-ring rounded-[8px]"
      >
        <span className="flex items-center gap-2">
          <span>{title}</span>
          <span className="text-xs text-[var(--text-muted)] font-normal group-hover:text-[var(--text)] transition-colors">
            (optional)
          </span>
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-[var(--text-muted)] group-hover:text-[var(--brand)] transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      <div
        id={contentId}
        ref={contentRef}
        className={cn(
          'overflow-hidden transition-none',
          !isOpen && 'h-0 opacity-0'
        )}
      >
        <div className="pt-3 pb-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {children}
        </div>
      </div>
    </div>
  );
};
