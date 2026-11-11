import {
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  Factory,
  FileText,
  FlaskConical,
  type LucideIcon,
  Package,
  Percent,
  Receipt,
  Scale,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import React, { useId, useMemo, useRef } from 'react';
import { prefersReducedMotion, useCountUp, useStaggerIn } from '../../lib/motion';
import { cn } from '../../lib/utils';

export interface StatCardProps {
  label: string;
  value: string;
  numericValue?: number;
  formatter?: (val: number) => string;
  /** Applies faint burgundy accent for key metrics */
  isKeyNumber?: boolean;
  /** Hero card for Net profit on dashboard: --grad-brand background with white text and small area chart */
  isHero?: boolean;
  /** Optional custom 32px chip icon (auto-detected from label if omitted) */
  icon?: LucideIcon;
  /** Optional small change chip (e.g. "+12.4%", "Vs last month") */
  changeLabel?: string;
  changeTone?: 'positive' | 'negative' | 'neutral';
  /** Optional 40px sparkline values (no axes) */
  sparklineData?: number[];
  onClick?: () => void;
  className?: string;
}

function resolveDefaultIcon(label: string): LucideIcon {
  const lower = label.toLowerCase();
  if (lower.includes('profit') || lower.includes('vs last')) return TrendingUp;
  if (lower.includes('margin') || lower.includes('%')) return Percent;
  if (lower.includes('chemical')) return FlaskConical;
  if (lower.includes('rock')) return Scale;
  if (lower.includes('powder') || lower.includes('stock')) return Boxes;
  if (lower.includes('vehicle') || lower.includes('dispatch') || lower.includes('way'))
    return Truck;
  if (lower.includes('batch') || lower.includes('made')) return Factory;
  if (lower.includes('purchase')) return ShoppingCart;
  if (lower.includes('expense') || lower.includes('category')) return Receipt;
  if (lower.includes('employee') || lower.includes('customer') || lower.includes('salary'))
    return Users;
  if (lower.includes('bill') || lower.includes('ton')) return FileText;
  if (lower.includes('sale') || lower.includes('receivable') || lower.includes('payable'))
    return Wallet;
  return Package;
}

function buildSparklinePaths(
  points: number[],
  width = 88,
  height = 40
): { linePath: string; areaPath: string } | null {
  if (!points || points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min === 0 ? 1 : max - min;
  const padY = 5;
  const usableH = height - padY * 2;

  const coords = points.map((val, idx) => {
    const x = (idx / (points.length - 1)) * width;
    const y = padY + usableH - ((val - min) / range) * usableH;
    return { x, y };
  });

  // Smooth quadratic curve segments
  let d = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const curr = coords[i];
    const next = coords[i + 1];
    const midX = (curr.x + next.x) / 2;
    const midY = (curr.y + next.y) / 2;
    if (i === 0) {
      d += ` Q ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)}`;
    } else {
      d += ` T ${midX.toFixed(1)} ${midY.toFixed(1)}`;
    }
  }
  const last = coords[coords.length - 1];
  d += ` T ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;

  const area = `${d} L ${width} ${height} L 0 ${height} Z`;
  return { linePath: d, areaPath: area };
}

/**
 * D4 Compact Minimalist StatCard:
 * - Height ~84–96px, padding 14–16px, label 12px muted, value 22px Sora tabular-nums
 * - 32px icon chip with brand-soft background (or white/18 on hero card)
 * - Optional small change chip and optional 40px sparkline (no axes)
 * - Hover: 2px lift with shadow-soft; numbers count up once via useCountUp
 * - Hero variant: --grad-brand background with white text and small area chart
 */
export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  numericValue,
  formatter,
  isKeyNumber = false,
  isHero = false,
  icon,
  changeLabel,
  changeTone = 'neutral',
  sparklineData,
  onClick,
  className,
}) => {
  const uid = useId().replace(/:/g, '');
  const animatedText = useCountUp(
    numericValue ?? 0,
    formatter ?? (() => value)
  );

  const displayStr = numericValue !== undefined && formatter ? animatedText : value;
  const reduced = prefersReducedMotion();
  const IconComp = useMemo(() => icon ?? resolveDefaultIcon(label), [icon, label]);

  const sparkPaths = useMemo(
    () => (sparklineData && sparklineData.length >= 2 ? buildSparklinePaths(sparklineData) : null),
    [sparklineData]
  );

  const sparkGradId = `stat-spark-${uid}`;

  return (
    <div
      data-stagger-item
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        'group relative flex flex-col justify-between rounded-[16px] border p-3.5 sm:p-4 min-h-[86px] min-w-0 overflow-hidden shadow-soft transition-all duration-200',
        isHero
          ? 'bg-brand-gradient border-transparent text-white'
          : isKeyNumber
            ? 'border-[var(--brand-mid)] bg-[var(--bg)] text-[var(--text)]'
            : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text)]',
        !reduced && 'hover:-translate-y-[2px]',
        onClick && 'cursor-pointer focus-ring',
        className
      )}
    >
      {/* Top row: 12px muted label + 32px icon chip */}
      <div className="relative z-10 flex items-start justify-between gap-2 min-w-0">
        <span
          className={cn(
            'text-[12px] font-medium leading-snug break-words pt-0.5',
            isHero ? 'text-white/85' : 'text-[var(--text-muted)]'
          )}
          title={label}
        >
          {label}
        </span>

        <span
          aria-hidden="true"
          className={cn(
            'h-8 w-8 rounded-[10px] inline-flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105',
            isHero
              ? 'bg-white/16 text-white'
              : 'bg-[var(--brand-soft)] text-[var(--brand)]'
          )}
        >
          <IconComp className="h-4 w-4 stroke-[2]" />
        </span>
      </div>

      {/* Bottom section: full-width Sora value + optional change chip + optional sparkline */}
      <div className="relative z-10 mt-1.5 flex flex-col gap-1.5 min-w-0">
        <div className="min-w-0 w-full">
          <div
            className={cn(
              'font-heading font-semibold tabular-nums tracking-tight leading-tight break-words',
              displayStr.length > 13
                ? 'text-[15px] sm:text-base lg:text-[17px]'
                : displayStr.length > 10
                  ? 'text-base sm:text-[17px] lg:text-[19px]'
                  : 'text-[17px] sm:text-[19px] lg:text-[21px]',
              isHero
                ? 'text-white'
                : isKeyNumber
                  ? 'text-[var(--brand)] glow-key-number'
                  : 'text-[var(--text)]'
            )}
            title={displayStr}
          >
            {displayStr}
          </div>

          {changeLabel && (
            <div className="mt-1 inline-flex items-center gap-0.5 max-w-full">
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-[10px] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none break-words',
                  isHero
                    ? 'bg-white/18 text-white'
                    : changeTone === 'positive'
                      ? 'bg-[var(--success-bg)] text-[var(--success)]'
                      : changeTone === 'negative'
                        ? 'bg-[var(--danger-bg)] text-[var(--danger)]'
                        : 'bg-[var(--brand-soft)] text-[var(--brand)]'
                )}
              >
                {changeTone === 'positive' && <ArrowUpRight className="h-2.5 w-2.5 shrink-0" />}
                {changeTone === 'negative' && <ArrowDownRight className="h-2.5 w-2.5 shrink-0" />}
                <span>{changeLabel}</span>
              </span>
            </div>
          )}
        </div>

        {/* Optional sparkline spans below the number so it never steals horizontal space from the figure */}
        {sparkPaths && (
          <div className="h-[26px] w-full pointer-events-none">
            <svg
              viewBox="0 0 88 40"
              preserveAspectRatio="none"
              fill="none"
              aria-hidden="true"
              className="h-full w-full overflow-visible"
            >
              <defs>
                <linearGradient id={sparkGradId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={isHero ? 'var(--bg)' : 'var(--brand)'}
                    stopOpacity={isHero ? 0.38 : 0.24}
                  />
                  <stop
                    offset="100%"
                    stopColor={isHero ? 'var(--bg)' : 'var(--brand)'}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <path d={sparkPaths.areaPath} fill={`url(#${sparkGradId})`} />
              <path
                d={sparkPaths.linePath}
                stroke={isHero ? 'var(--bg)' : 'var(--brand)'}
                strokeWidth={1.85}
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * D4 StatCardGrid:
 * 2 across on mobile (360px), repeat(auto-fit, minmax(200px, 1fr)) on tablet/desktop (4 across on desktop).
 */
export const StatCardGrid: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => {
  const gridRef = useRef<HTMLDivElement>(null);
  useStaggerIn(gridRef, '[data-stagger-item]', true);

  return (
    <div
      ref={gridRef}
      className={cn(
        'grid grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 sm:gap-3.5 items-stretch min-w-0',
        className
      )}
    >
      {children}
    </div>
  );
};
