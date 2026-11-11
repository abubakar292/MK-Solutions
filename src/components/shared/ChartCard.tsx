import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import React, { useId, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney, formatTon } from '../../lib/format';
import { prefersReducedMotion } from '../../lib/motion';
import { cn } from '../../lib/utils';

export const CHART_SERIES_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
] as const;

export interface ChartLegendChipItem {
  key: string;
  label: string;
  color: string;
}

export interface ChartPeriodOption {
  id: string;
  label: string;
}

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  periodToggle?: {
    options: ChartPeriodOption[];
    value: string;
    onChange: (id: string) => void;
  };
  legendItems?: ChartLegendChipItem[];
  hiddenSeries?: Record<string, boolean>;
  onToggleSeries?: (key: string) => void;
  loading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  minHeight?: number;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * D4 Shared ChartCard:
 * - Title, optional period toggle, interactive legend chips (below on mobile, inline on desktop),
 *   empty state, shimmer skeleton, and min-height 240px.
 */
export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  periodToggle,
  legendItems,
  hiddenSeries = {},
  onToggleSeries,
  loading = false,
  isEmpty = false,
  emptyMessage = 'No data recorded for this period.',
  minHeight = 240,
  headerRight,
  children,
  className,
}) => {
  const cardRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion() || !cardRef.current) return;
      gsap.fromTo(
        cardRef.current,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.36, ease: 'power3.out' }
      );
    },
    { scope: cardRef }
  );

  const renderLegendChips = (mobileLayout = false) => {
    if (!legendItems || legendItems.length === 0) return null;
    return (
      <div
        className={cn(
          'flex flex-wrap items-center gap-1.5',
          mobileLayout ? 'flex sm:hidden pt-3 border-t border-[var(--border)] mt-3' : 'hidden sm:flex'
        )}
      >
        {legendItems.map((item) => {
          const isHidden = Boolean(hiddenSeries[item.key]);
          const interactive = Boolean(onToggleSeries);
          return (
            <button
              key={item.key}
              type="button"
              disabled={!interactive}
              onClick={() => onToggleSeries?.(item.key)}
              aria-pressed={!isHidden}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1 text-xs font-medium transition-all',
                isHidden
                  ? 'border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-muted)] opacity-55 line-through'
                  : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text)] shadow-2xs',
                interactive && 'cursor-pointer hover:border-[var(--brand-mid)] focus-ring'
              )}
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <section
      ref={cardRef}
      data-chart-card
      className={cn(
        'rounded-[16px] border border-[var(--border)] bg-[var(--bg)] p-4 sm:p-5 shadow-soft flex flex-col justify-between min-w-0',
        className
      )}
    >
      {/* Card Header */}
      <div className="mb-3.5 flex flex-wrap items-start justify-between gap-2.5">
        <div className="min-w-0">
          <h3 className="font-heading text-sm sm:text-base font-semibold text-[var(--text)] leading-snug">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-[var(--text-muted)] tabular-nums">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {periodToggle && (
            <div className="inline-flex items-center gap-1 rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] p-0.5">
              {periodToggle.options.map((opt) => {
                const active = periodToggle.value === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => periodToggle.onChange(opt.id)}
                    className={cn(
                      'rounded-[8px] px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                      active
                        ? 'bg-[var(--brand)] text-white font-semibold'
                        : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}

          {renderLegendChips(false)}
          {headerRight}
        </div>
      </div>

      {/* Card Body */}
      {loading ? (
        <div
          style={{ minHeight }}
          className="w-full rounded-[12px] skeleton-shimmer"
        />
      ) : isEmpty ? (
        <div
          style={{ minHeight }}
          className="flex w-full items-center justify-center rounded-[12px] border border-dashed border-[var(--border)] bg-[var(--surface-subtle)] px-4 text-center text-xs sm:text-sm text-[var(--text-muted)]"
        >
          {emptyMessage}
        </div>
      ) : (
        <div style={{ minHeight }} className="w-full min-w-0 flex flex-col justify-center">
          {children}
        </div>
      )}

      {/* Mobile Legend Chips below chart */}
      {!loading && !isEmpty && renderLegendChips(true)}
    </section>
  );
};

export interface CustomTooltipPayloadItem {
  name?: string;
  dataKey?: string;
  value?: number | string;
  color?: string;
  fill?: string;
  stroke?: string;
  payload?: Record<string, unknown>;
}

export interface CustomChartTooltipProps {
  active?: boolean;
  label?: string;
  payload?: CustomTooltipPayloadItem[];
  valueFormatter?: (value: number, key: string, item: CustomTooltipPayloadItem) => string;
  labelMap?: Record<string, string>;
}

/**
 * D4 Shared Custom Tooltip:
 * White card with shadow-pop glow, colored dots, formatted values (Rs and tons), quick fade.
 */
export const CustomChartTooltip: React.FC<CustomChartTooltipProps> = ({
  active,
  label,
  payload,
  valueFormatter,
  labelMap = {},
}) => {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 shadow-pop text-xs transition-opacity duration-150 min-w-[155px]">
      {label && (
        <div className="mb-1.5 font-heading font-semibold text-[var(--text)] border-b border-[var(--border)] pb-1">
          {label}
        </div>
      )}
      <div className="space-y-1.5">
        {payload.map((entry, idx) => {
          const rawKey = String(entry.dataKey || entry.name || idx);
          const displayLabel = labelMap[rawKey] || entry.name || rawKey;
          const numVal = Number(entry.value ?? 0);
          const dotColor =
            entry.color ||
            entry.stroke ||
            entry.fill ||
            'var(--brand)';
          const formatted = valueFormatter
            ? valueFormatter(numVal, rawKey, entry)
            : formatMoney(numVal);

          return (
            <div
              key={`${rawKey}-${idx}`}
              className="flex items-center justify-between gap-4 tabular-nums"
            >
              <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: dotColor }}
                />
                <span className="truncate max-w-[130px]">{displayLabel}</span>
              </span>
              <span className="font-heading font-semibold text-[var(--text)]">
                {formatted}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

function formatCompactAxisMoney(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(v);
}

// ============================================================================
// 1. SALES VS EXPENSES VS NET PROFIT (6 MONTHS) COMBO CHART
// ============================================================================
export interface SixMonthComboDatum {
  month?: string;
  label: string;
  sales: number;
  expenses: number;
  netProfit?: number;
}

export const SalesExpensesProfitComboChart: React.FC<{
  title?: string;
  subtitle?: string;
  data: SixMonthComboDatum[];
  expensesLabel?: string;
}> = ({
  title = 'Sales, expenses and net profit (last 6 months)',
  subtitle,
  data,
  expensesLabel = 'Expenses',
}) => {
  const uid = useId().replace(/:/g, '');
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const animate = !prefersReducedMotion();

  const normalizedData = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        netProfit:
          d.netProfit !== undefined ? d.netProfit : d.sales - d.expenses,
      })),
    [data]
  );

  const toggleSeries = (key: string) => {
    setHidden((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const legendItems: ChartLegendChipItem[] = [
    { key: 'sales', label: 'Sales', color: 'var(--brand)' },
    { key: 'expenses', label: expensesLabel, color: 'var(--chart-2)' },
    { key: 'netProfit', label: 'Net profit', color: 'var(--brand-deep)' },
  ];

  const glowFilterId = `combo-glow-${uid}`;
  const salesGradId = `combo-sales-${uid}`;
  const expGradId = `combo-exp-${uid}`;

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      legendItems={legendItems}
      hiddenSeries={hidden}
      onToggleSeries={toggleSeries}
      isEmpty={normalizedData.length === 0}
    >
      <div className="h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={normalizedData}
            margin={{ top: 12, right: 12, left: 0, bottom: 4 }}
            onMouseMove={(state) => {
              if (state && typeof state.activeTooltipIndex === 'number') {
                setActiveIndex(state.activeTooltipIndex);
              }
            }}
            onMouseLeave={() => setActiveIndex(null)}
          >
            <defs>
              <linearGradient id={salesGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.96} />
                <stop offset="100%" stopColor="var(--brand)" stopOpacity={0.68} />
              </linearGradient>
              <linearGradient id={expGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.92} />
                <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.62} />
              </linearGradient>
              <filter id={glowFilterId} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow
                  dx="0"
                  dy="2"
                  stdDeviation="3"
                  floodColor="var(--brand)"
                  floodOpacity="0.32"
                />
              </filter>
            </defs>

            <CartesianGrid
              strokeDasharray="4 4"
              stroke="var(--chart-grid)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatCompactAxisMoney}
              width={48}
            />
            <Tooltip
              cursor={{ fill: 'var(--surface-subtle)', opacity: 0.6 }}
              content={
                <CustomChartTooltip
                  labelMap={{
                    sales: 'Sales',
                    expenses: expensesLabel,
                    netProfit: 'Net profit',
                  }}
                  valueFormatter={(v) => formatMoney(v)}
                />
              }
            />

            {!hidden.sales && (
              <Bar
                dataKey="sales"
                fill={`url(#${salesGradId})`}
                radius={[6, 6, 0, 0]}
                maxBarSize={28}
                isAnimationActive={animate}
              >
                {normalizedData.map((entry, idx) => (
                  <Cell
                    key={`sales-${entry.label}-${idx}`}
                    fill={`url(#${salesGradId})`}
                    opacity={activeIndex === null || activeIndex === idx ? 1 : 0.42}
                  />
                ))}
              </Bar>
            )}

            {!hidden.expenses && (
              <Bar
                dataKey="expenses"
                fill={`url(#${expGradId})`}
                radius={[6, 6, 0, 0]}
                maxBarSize={28}
                isAnimationActive={animate}
              >
                {normalizedData.map((entry, idx) => (
                  <Cell
                    key={`exp-${entry.label}-${idx}`}
                    fill={`url(#${expGradId})`}
                    opacity={activeIndex === null || activeIndex === idx ? 1 : 0.42}
                  />
                ))}
              </Bar>
            )}

            {!hidden.netProfit && (
              <Line
                type="monotone"
                dataKey="netProfit"
                stroke="var(--brand-deep)"
                strokeWidth={2.5}
                filter={`url(#${glowFilterId})`}
                dot={{
                  r: 4,
                  fill: 'var(--bg)',
                  stroke: 'var(--brand-deep)',
                  strokeWidth: 2,
                }}
                activeDot={{
                  r: 6,
                  fill: 'var(--brand)',
                  stroke: 'var(--bg)',
                  strokeWidth: 2,
                }}
                isAnimationActive={animate}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
};

// ============================================================================
// 2. TONS SOLD PER DAY / MONTH GRADIENT AREA CHART
// ============================================================================
export interface TonsTrendDatum {
  label: string;
  tons: number;
}

export const TonsSoldAreaChart: React.FC<{
  title: string;
  subtitle?: string;
  data: TonsTrendDatum[];
  seriesLabel?: string;
  emptyMessage?: string;
}> = ({
  title,
  subtitle,
  data,
  seriesLabel = 'Tons sold',
  emptyMessage = 'No weight recorded for this period.',
}) => {
  const uid = useId().replace(/:/g, '');
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const animate = !prefersReducedMotion();

  const areaGradId = `tons-area-${uid}`;
  const glowId = `tons-glow-${uid}`;

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      legendItems={[{ key: 'tons', label: seriesLabel, color: 'var(--brand)' }]}
      hiddenSeries={hidden}
      onToggleSeries={(k) => setHidden((p) => ({ ...p, [k]: !p[k] }))}
      isEmpty={data.length === 0}
      emptyMessage={emptyMessage}
    >
      <div className="h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 12, right: 12, left: 0, bottom: 4 }}
          >
            <defs>
              <linearGradient id={areaGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.34} />
                <stop offset="95%" stopColor="var(--brand)" stopOpacity={0.0} />
              </linearGradient>
              <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow
                  dx="0"
                  dy="3"
                  stdDeviation="3"
                  floodColor="var(--brand)"
                  floodOpacity="0.28"
                />
              </filter>
            </defs>

            <CartesianGrid
              strokeDasharray="4 4"
              stroke="var(--chart-grid)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}t`}
              width={44}
            />
            <Tooltip
              content={
                <CustomChartTooltip
                  labelMap={{ tons: seriesLabel }}
                  valueFormatter={(v) => formatTon(v)}
                />
              }
            />

            {!hidden.tons && (
              <Area
                type="monotone"
                dataKey="tons"
                stroke="var(--brand)"
                strokeWidth={2.5}
                fill={`url(#${areaGradId})`}
                filter={`url(#${glowId})`}
                dot={{
                  r: 3.5,
                  fill: 'var(--bg)',
                  stroke: 'var(--brand)',
                  strokeWidth: 2,
                }}
                activeDot={{
                  r: 6,
                  fill: 'var(--brand)',
                  stroke: 'var(--bg)',
                  strokeWidth: 2,
                }}
                isAnimationActive={animate}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
};

// ============================================================================
// 3. EXPENSES BY CATEGORY DONUT CHART (ROUNDED SEGMENTS, CENTER TOTAL, HOVER LEGEND)
// ============================================================================
export interface ExpenseDonutDatum {
  category: string;
  label: string;
  amount: number;
  percent?: number;
}

export const ExpensesCategoryDonutChart: React.FC<{
  title: string;
  subtitle?: string;
  data: ExpenseDonutDatum[];
  totalAmount?: number;
  activeCategoryFilter?: string;
  onSelectCategory?: (category: string) => void;
  emptyMessage?: string;
}> = ({
  title,
  subtitle,
  data,
  totalAmount,
  activeCategoryFilter,
  onSelectCategory,
  emptyMessage = 'No expenses recorded for this period.',
}) => {
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [hiddenCategories, setHiddenCategories] = useState<Record<string, boolean>>({});
  const animate = !prefersReducedMotion();

  const computedTotal = useMemo(() => {
    if (totalAmount !== undefined) return totalAmount;
    return data.reduce((sum, item) => sum + item.amount, 0);
  }, [data, totalAmount]);

  const enriched = useMemo(() => {
    return data.map((item, idx) => {
      const pct =
        item.percent !== undefined
          ? item.percent
          : computedTotal > 0
            ? Number(((item.amount / computedTotal) * 100).toFixed(1))
            : 0;
      return {
        ...item,
        percent: pct,
        color: CHART_SERIES_COLORS[idx % CHART_SERIES_COLORS.length],
      };
    });
  }, [data, computedTotal]);

  const visibleData = useMemo(
    () => enriched.filter((d) => !hiddenCategories[d.category]),
    [enriched, hiddenCategories]
  );

  const legendChips: ChartLegendChipItem[] = useMemo(
    () =>
      enriched.map((item) => ({
        key: item.category,
        label: item.label,
        color: item.color,
      })),
    [enriched]
  );

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      legendItems={legendChips}
      hiddenSeries={hiddenCategories}
      onToggleSeries={(key) =>
        setHiddenCategories((prev) => ({ ...prev, [key]: !prev[key] }))
      }
      isEmpty={enriched.length === 0}
      emptyMessage={emptyMessage}
    >
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center min-h-[240px]">
        {/* Donut with Center Total */}
        <div className="md:col-span-6 relative h-[220px] w-full flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                content={
                  <CustomChartTooltip
                    valueFormatter={(v) => formatMoney(v)}
                  />
                }
              />
              <Pie
                data={visibleData}
                dataKey="amount"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={62}
                outerRadius={88}
                paddingAngle={3}
                cornerRadius={6}
                stroke="none"
                isAnimationActive={animate}
                onMouseEnter={(_, idx) => {
                  const item = visibleData[idx];
                  if (item) setHoveredCategory(item.category);
                }}
                onMouseLeave={() => setHoveredCategory(null)}
              >
                {visibleData.map((entry) => {
                  const isHighlighted =
                    hoveredCategory === entry.category ||
                    activeCategoryFilter === entry.category;
                  const isDimmed =
                    hoveredCategory !== null && hoveredCategory !== entry.category;
                  return (
                    <Cell
                      key={entry.category}
                      fill={entry.color}
                      opacity={isDimmed ? 0.38 : 1}
                      style={{
                        transform: isHighlighted ? 'scale(1.03)' : 'scale(1)',
                        transformOrigin: 'center center',
                        transition: 'opacity 180ms ease, transform 180ms ease',
                      }}
                    />
                  );
                })}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          {/* Center Total Label */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-3">
            <span className="text-[11px] font-medium text-[var(--text-muted)]">
              Total
            </span>
            <span className="font-heading text-[11px] sm:text-xs font-semibold text-[var(--text)] tabular-nums leading-tight mt-0.5 max-w-[124px] break-words">
              {formatMoney(computedTotal)}
            </span>
          </div>
        </div>

        {/* Interactive Legend List (amount and %; hover highlights matching segment) */}
        <div className="md:col-span-6 space-y-1.5">
          {enriched.map((item) => {
            const isHovered = hoveredCategory === item.category;
            const isSelected = activeCategoryFilter === item.category;
            const isHidden = Boolean(hiddenCategories[item.category]);
            return (
              <button
                key={item.category}
                type="button"
                onMouseEnter={() => setHoveredCategory(item.category)}
                onMouseLeave={() => setHoveredCategory(null)}
                onClick={() => {
                  if (onSelectCategory) {
                    onSelectCategory(item.category);
                  } else {
                    setHiddenCategories((prev) => ({
                      ...prev,
                      [item.category]: !prev[item.category],
                    }));
                  }
                }}
                className={cn(
                  'w-full flex items-center justify-between gap-2 rounded-[10px] border px-3 py-2 text-xs transition-all cursor-pointer focus-ring',
                  isHovered || isSelected
                    ? 'border-[var(--brand-mid)] bg-[var(--brand-soft)]'
                    : 'border-[var(--border)] bg-[var(--surface-subtle)] hover:bg-[var(--brand-soft)]',
                  isHidden && 'opacity-45 line-through'
                )}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-3 w-3 rounded-[4px] shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="font-medium text-[var(--text)] truncate">
                    {item.label}
                  </span>
                </span>
                <span className="flex items-center gap-2.5 shrink-0 tabular-nums">
                  <span className="text-[var(--text-muted)]">{item.percent}%</span>
                  <span className="font-heading font-semibold text-[var(--text)]">
                    {formatMoney(item.amount)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </ChartCard>
  );
};

// ============================================================================
// 4. TOP CUSTOMERS HORIZONTAL BARS WITH VALUE AT BAR END
// ============================================================================
export interface TopCustomerBarDatum {
  customerId: string;
  customerName: string;
  sales: number;
}

export const TopCustomersHorizontalBarChart: React.FC<{
  title: string;
  subtitle?: string;
  data: TopCustomerBarDatum[];
  emptyMessage?: string;
}> = ({
  title,
  subtitle,
  data,
  emptyMessage = 'No customer sales recorded for this period.',
}) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const animate = !prefersReducedMotion();

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      legendItems={[{ key: 'sales', label: 'Sales', color: 'var(--brand)' }]}
      hiddenSeries={hidden}
      onToggleSeries={(k) => setHidden((p) => ({ ...p, [k]: !p[k] }))}
      isEmpty={data.length === 0}
      emptyMessage={emptyMessage}
    >
      <div className="h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 68, left: 8, bottom: 4 }}
            onMouseMove={(state) => {
              if (state && typeof state.activeTooltipIndex === 'number') {
                setActiveIndex(state.activeTooltipIndex);
              }
            }}
            onMouseLeave={() => setActiveIndex(null)}
          >
            <CartesianGrid
              strokeDasharray="4 4"
              stroke="var(--chart-grid)"
              horizontal={false}
            />
            <XAxis
              type="number"
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatCompactAxisMoney}
            />
            <YAxis
              type="category"
              dataKey="customerName"
              width={125}
              tick={{ fill: 'var(--text)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'var(--surface-subtle)', opacity: 0.6 }}
              content={
                <CustomChartTooltip
                  labelMap={{ sales: 'Sales' }}
                  valueFormatter={(v) => formatMoney(v)}
                />
              }
            />

            {!hidden.sales && (
              <Bar
                dataKey="sales"
                radius={[0, 6, 6, 0]}
                barSize={22}
                isAnimationActive={animate}
              >
                {data.map((entry, idx) => (
                  <Cell
                    key={entry.customerId}
                    fill={CHART_SERIES_COLORS[idx % CHART_SERIES_COLORS.length]}
                    opacity={activeIndex === null || activeIndex === idx ? 1 : 0.42}
                  />
                ))}
                <LabelList
                  dataKey="sales"
                  position="right"
                  formatter={(val: unknown) =>
                    `Rs ${formatCompactAxisMoney(Number(val ?? 0))}`
                  }
                  style={{
                    fill: 'var(--text)',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                />
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
};

// ============================================================================
// 5. PURCHASE RATE TREND PER ITEM (SMOOTH LINES WITH MARKERS)
// ============================================================================
export interface PurchaseRateTrendPoint {
  label: string;
  itemName: string;
  rate: number;
  date?: string;
}

export const PurchaseRateTrendLineChart: React.FC<{
  title?: string;
  subtitle?: string;
  data: PurchaseRateTrendPoint[];
}> = ({
  title = 'Purchase rate trend per item',
  subtitle,
  data,
}) => {
  const uid = useId().replace(/:/g, '');
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const animate = !prefersReducedMotion();

  // Extract distinct items and build multi-series or single-series line points
  const { items, chartRows, legendItems } = useMemo(() => {
    const distinctItems = Array.from(
      new Set(data.map((d) => d.itemName || 'Rate'))
    );

    const rows = data.map((d, idx) => {
      const itemKey = d.itemName || 'Rate';
      return {
        indexLabel: `${idx + 1}. ${d.label}`,
        shortLabel: d.label,
        [itemKey]: d.rate,
        rate: d.rate,
      };
    });

    const legends: ChartLegendChipItem[] = distinctItems.map((name, idx) => ({
      key: name,
      label: name,
      color: CHART_SERIES_COLORS[idx % CHART_SERIES_COLORS.length],
    }));

    return { items: distinctItems, chartRows: rows, legendItems: legends };
  }, [data]);

  const glowId = `rate-glow-${uid}`;

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      legendItems={legendItems}
      hiddenSeries={hidden}
      onToggleSeries={(k) => setHidden((p) => ({ ...p, [k]: !p[k] }))}
      isEmpty={data.length === 0}
      emptyMessage="No purchase rate history recorded for this period."
    >
      <div className="h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartRows}
            margin={{ top: 12, right: 16, left: 4, bottom: 4 }}
          >
            <defs>
              <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow
                  dx="0"
                  dy="2"
                  stdDeviation="3"
                  floodColor="var(--brand)"
                  floodOpacity="0.28"
                />
              </filter>
            </defs>

            <CartesianGrid
              strokeDasharray="4 4"
              stroke="var(--chart-grid)"
              vertical={false}
            />
            <XAxis
              dataKey="shortLabel"
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatCompactAxisMoney}
              width={48}
            />
            <Tooltip
              content={
                <CustomChartTooltip
                  valueFormatter={(v) => formatMoney(v)}
                />
              }
            />

            {items.map((itemName, idx) => {
              if (hidden[itemName]) return null;
              const color = CHART_SERIES_COLORS[idx % CHART_SERIES_COLORS.length];
              return (
                <Line
                  key={itemName}
                  type="monotone"
                  dataKey={itemName}
                  name={itemName}
                  connectNulls
                  stroke={color}
                  strokeWidth={2.5}
                  filter={`url(#${glowId})`}
                  dot={{
                    r: 4.5,
                    fill: 'var(--bg)',
                    stroke: color,
                    strokeWidth: 2,
                  }}
                  activeDot={{
                    r: 6.5,
                    fill: color,
                    stroke: 'var(--bg)',
                    strokeWidth: 2,
                  }}
                  isAnimationActive={animate}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
};

// ============================================================================
// 6. STOCK VALUE SPLIT (ONE STACKED HORIZONTAL BAR: ROCK, CHEMICALS, POWDER)
// ============================================================================
export const StockValueSplitBar: React.FC<{
  rockValue: number;
  chemicalsValue: number;
  powderValue: number;
  title?: string;
  subtitle?: string;
}> = ({
  rockValue,
  chemicalsValue,
  powderValue,
  title = 'Stock value split',
  subtitle,
}) => {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const animate = !prefersReducedMotion();

  const total =
    (hidden.rock ? 0 : rockValue) +
    (hidden.chemicals ? 0 : chemicalsValue) +
    (hidden.powder ? 0 : powderValue);

  const data = useMemo(
    () => [
      {
        name: 'Stock value',
        rock: hidden.rock ? 0 : rockValue,
        chemicals: hidden.chemicals ? 0 : chemicalsValue,
        powder: hidden.powder ? 0 : powderValue,
      },
    ],
    [rockValue, chemicalsValue, powderValue, hidden]
  );

  const legendItems: ChartLegendChipItem[] = [
    { key: 'rock', label: 'Rock', color: 'var(--chart-1)' },
    { key: 'chemicals', label: 'Chemicals', color: 'var(--chart-2)' },
    { key: 'powder', label: 'Powder', color: 'var(--chart-3)' },
  ];

  const segments = [
    { key: 'rock', label: 'Rock', value: rockValue, color: 'var(--chart-1)' },
    { key: 'chemicals', label: 'Chemicals', value: chemicalsValue, color: 'var(--chart-2)' },
    { key: 'powder', label: 'Powder', value: powderValue, color: 'var(--chart-3)' },
  ];

  return (
    <ChartCard
      title={title}
      subtitle={subtitle ?? `Total stock value: ${formatMoney(total)}`}
      legendItems={legendItems}
      hiddenSeries={hidden}
      onToggleSeries={(k) => setHidden((p) => ({ ...p, [k]: !p[k] }))}
      isEmpty={rockValue + chemicalsValue + powderValue <= 0}
      emptyMessage="No stock value on hand yet."
      minHeight={240}
    >
      <div className="space-y-5 py-2">
        <div className="h-[110px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 12, right: 16, left: 16, bottom: 12 }}
            >
              <CartesianGrid
                strokeDasharray="4 4"
                stroke="var(--chart-grid)"
                horizontal={false}
              />
              <XAxis
                type="number"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatCompactAxisMoney}
              />
              <YAxis type="category" dataKey="name" hide />
              <Tooltip
                cursor={{ fill: 'var(--surface-subtle)', opacity: 0.5 }}
                content={
                  <CustomChartTooltip
                    labelMap={{
                      rock: 'Rock',
                      chemicals: 'Chemicals',
                      powder: 'Powder',
                    }}
                    valueFormatter={(v) => formatMoney(v)}
                  />
                }
              />
              {!hidden.rock && (
                <Bar
                  dataKey="rock"
                  stackId="stock"
                  fill="var(--chart-1)"
                  radius={[6, 0, 0, 6]}
                  barSize={38}
                  isAnimationActive={animate}
                />
              )}
              {!hidden.chemicals && (
                <Bar
                  dataKey="chemicals"
                  stackId="stock"
                  fill="var(--chart-2)"
                  radius={[0, 0, 0, 0]}
                  barSize={38}
                  isAnimationActive={animate}
                />
              )}
              {!hidden.powder && (
                <Bar
                  dataKey="powder"
                  stackId="stock"
                  fill="var(--chart-3)"
                  radius={[0, 6, 6, 0]}
                  barSize={38}
                  isAnimationActive={animate}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Summary breakdown cards underneath */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {segments.map((seg) => {
            const rawSum = rockValue + chemicalsValue + powderValue;
            const pct = rawSum > 0 ? ((seg.value / rawSum) * 100).toFixed(1) : '0.0';
            return (
              <div
                key={seg.key}
                className={cn(
                  'flex items-center justify-between rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2 text-xs tabular-nums',
                  hidden[seg.key] && 'opacity-45'
                )}
              >
                <span className="inline-flex items-center gap-2 font-medium text-[var(--text)]">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span>{seg.label}</span>
                </span>
                <span className="font-heading font-semibold text-[var(--text)]">
                  {formatMoney(seg.value)}{' '}
                  <span className="font-sans font-normal text-[var(--text-muted)]">
                    ({pct}%)
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </ChartCard>
  );
};

// ============================================================================
// 7. CUSTOMER AGEING STACKED BAR CHART (0-30, 31-60, OVER 60 DAYS)
// ============================================================================
export interface CustomerAgeingRowDatum {
  customerName: string;
  days0To30: number;
  days31To60: number;
  days60Plus: number;
}

export const CustomerAgeingStackedBarChart: React.FC<{
  title?: string;
  subtitle?: string;
  rows: CustomerAgeingRowDatum[];
}> = ({
  title = 'Customer ageing (0–30, 31–60, over 60 days)',
  subtitle,
  rows,
}) => {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const animate = !prefersReducedMotion();

  const activeRows = useMemo(
    () =>
      rows
        .filter((r) => r.days0To30 + r.days31To60 + r.days60Plus > 0)
        .slice(0, 8),
    [rows]
  );

  const legendItems: ChartLegendChipItem[] = [
    { key: 'days0To30', label: '0–30 days', color: 'var(--chart-3)' },
    { key: 'days31To60', label: '31–60 days', color: 'var(--chart-2)' },
    { key: 'days60Plus', label: 'Over 60 days', color: 'var(--chart-1)' },
  ];

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      legendItems={legendItems}
      hiddenSeries={hidden}
      onToggleSeries={(k) => setHidden((p) => ({ ...p, [k]: !p[k] }))}
      isEmpty={activeRows.length === 0}
      emptyMessage="No outstanding customer balances to age."
    >
      <div className="h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={activeRows}
            margin={{ top: 12, right: 12, left: 0, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="4 4"
              stroke="var(--chart-grid)"
              vertical={false}
            />
            <XAxis
              dataKey="customerName"
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatCompactAxisMoney}
              width={48}
            />
            <Tooltip
              cursor={{ fill: 'var(--surface-subtle)', opacity: 0.6 }}
              content={
                <CustomChartTooltip
                  labelMap={{
                    days0To30: '0–30 days',
                    days31To60: '31–60 days',
                    days60Plus: 'Over 60 days',
                  }}
                  valueFormatter={(v) => formatMoney(v)}
                />
              }
            />

            {!hidden.days0To30 && (
              <Bar
                dataKey="days0To30"
                stackId="ageing"
                fill="var(--chart-3)"
                radius={[0, 0, 0, 0]}
                maxBarSize={36}
                isAnimationActive={animate}
              />
            )}
            {!hidden.days31To60 && (
              <Bar
                dataKey="days31To60"
                stackId="ageing"
                fill="var(--chart-2)"
                radius={[0, 0, 0, 0]}
                maxBarSize={36}
                isAnimationActive={animate}
              />
            )}
            {!hidden.days60Plus && (
              <Bar
                dataKey="days60Plus"
                stackId="ageing"
                fill="var(--chart-1)"
                radius={[6, 6, 0, 0]}
                maxBarSize={36}
                isAnimationActive={animate}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
};
