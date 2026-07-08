/* Small shared visual primitives shared by feature pages. */

import type { ReactNode } from 'react';
import type { SafelineSummary } from '../data/adapter';
import {
  BUDGET_WARNING_THRESHOLD,
  budgetRatio,
  formatPlain,
  waterlineGeometry,
} from '../lib/format';

/** Muted category palette for proportional charts (pair with a text legend —
    color is never the only encoding). */
export const CHART_PALETTE = [
  'var(--color-mint)',
  'var(--color-mocha)',
  'var(--color-apricot)',
  'var(--color-mint-deep)',
  'var(--color-apricot-strong)',
  'var(--color-mint-border)',
  'var(--color-ink-40)',
  'var(--color-apricot-border)',
];

/** Readable on-segment text color for each CHART_PALETTE entry. */
const CHART_LABEL_COLORS = [
  'var(--color-mint-deeper)',
  '#FFFFFF',
  'var(--color-apricot-deepest)',
  '#F9F5F0',
  'var(--color-apricot-deepest)',
  'var(--color-mint-deeper)',
  '#FFFFFF',
  'var(--color-apricot-deepest)',
];

/** Ring/donut proportion chart drawn with plain SVG strokes.
    Scales to its container width (fixed viewBox); optional hover callbacks
    let the caller float a tooltip and highlight the active segment. */
export function DonutChart({
  values,
  thickness = 30,
  hoveredIndex = null,
  onHoverSegment,
  segmentLabels,
}: {
  values: number[];
  thickness?: number;
  hoveredIndex?: number | null;
  onHoverSegment?: (index: number | null) => void;
  /** When provided, segments wide enough get their name (and, if wider,
      the value) written directly on the ring band. */
  segmentLabels?: { title: string; value: string }[];
}) {
  const SIZE = 200;
  const NAME_MIN_FRAC = 0.07;
  const VALUE_MIN_FRAC = 0.11;
  const total = values.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return null;
  const c = SIZE / 2;
  const r = (SIZE - thickness - 8) / 2;
  let acc = 0;
  const segments = values.map((v, i) => {
    const start = (acc / total) * 2 * Math.PI - Math.PI / 2;
    acc += v;
    const end = (acc / total) * 2 * Math.PI - Math.PI / 2;
    return { start, end, frac: (end - start) / (2 * Math.PI), i };
  });
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      role="img"
      onMouseLeave={() => onHoverSegment?.(null)}
    >
      {segments.map(({ start, end, frac, i }) => {
        const color = CHART_PALETTE[i % CHART_PALETTE.length];
        const width = hoveredIndex === i ? thickness + 8 : thickness;
        const shared = {
          fill: 'none',
          stroke: color,
          strokeWidth: width,
          opacity: hoveredIndex === null || hoveredIndex === i ? 1 : 0.45,
          onMouseEnter: () => onHoverSegment?.(i),
        };
        if (frac <= 0) return null;
        if (frac >= 0.999) {
          return <circle key={i} cx={c} cy={c} r={r} {...shared} />;
        }
        const x1 = c + r * Math.cos(start);
        const y1 = c + r * Math.sin(start);
        const x2 = c + r * Math.cos(end);
        const y2 = c + r * Math.sin(end);
        const large = frac > 0.5 ? 1 : 0;
        return (
          <path
            key={i}
            d={`M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`}
            {...shared}
          />
        );
      })}
      {/* On-ring labels — drawn after all bands so they stay on top */}
      {segmentLabels &&
        segments.map(({ start, end, frac, i }) => {
          if (frac < NAME_MIN_FRAC) return null;
          const label = segmentLabels[i];
          if (!label) return null;
          const mid = (start + end) / 2;
          const tx = c + r * Math.cos(mid);
          const ty = c + r * Math.sin(mid);
          const fill = CHART_LABEL_COLORS[i % CHART_LABEL_COLORS.length];
          const showValue = frac >= VALUE_MIN_FRAC;
          return (
            <text
              key={`label-${i}`}
              x={tx.toFixed(1)}
              y={ty.toFixed(1)}
              textAnchor="middle"
              fill={fill}
              style={{ pointerEvents: 'none' }}
            >
              <tspan
                x={tx.toFixed(1)}
                dy={showValue ? '-0.15em' : '0.35em'}
                style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 500 }}
              >
                {label.title}
              </tspan>
              {showValue && (
                <tspan
                  x={tx.toFixed(1)}
                  dy="1.1em"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}
                >
                  {label.value}
                </tspan>
              )}
            </text>
          );
        })}
    </svg>
  );
}

/** 2g empty state: white card, 48px icon block, H2, short caption, actions. */
export function EmptyState({
  icon = '·',
  title,
  children,
  actions,
}: {
  icon?: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="card empty-state span-12">
      <div className="empty-state__icon">{icon}</div>
      <h2 className="h2">{title}</h2>
      {children && <p className="caption empty-state__text">{children}</p>}
      {actions && <div className="empty-state__actions">{actions}</div>}
    </section>
  );
}

export function ReviewBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="badge badge--review">
      <span className="badge__dot" />
      待確認 {count} 筆
    </span>
  );
}

export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="count-badge">{count}</span>;
}

/** 6px budget/ratio bar. `tone` picks the fill token. */
export function BudgetBar({
  ratio,
  tone,
}: {
  ratio: number;
  tone: 'mint' | 'mocha' | 'apricot' | 'apricot-strong';
}) {
  const fill = {
    mint: 'var(--color-mint-bar)',
    mocha: 'var(--color-mocha)',
    apricot: 'var(--color-apricot)',
    'apricot-strong': 'var(--color-apricot-strong)',
  }[tone];
  return (
    <div className="budget-bar">
      <div
        className="budget-bar__fill"
        style={{ width: `${Math.min(ratio * 100, 100).toFixed(0)}%`, background: fill }}
      />
    </div>
  );
}

/** One labelled budget row: name, spent / budget, warning near the limit. */
export function BudgetRow({
  category,
  spent,
  budget,
}: {
  category: string;
  spent: number;
  budget: number;
}) {
  const ratio = budgetRatio(spent, budget);
  const warning = ratio >= BUDGET_WARNING_THRESHOLD;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span>
          {category}
          {warning && (
            <span className="micro" style={{ color: 'var(--color-apricot-deep)', letterSpacing: 0 }}>
              {' '}
              · 接近上限
            </span>
          )}
        </span>
        <span className="mono" style={{ color: 'var(--color-ink-70)' }}>
          {formatPlain(spent)}{' '}
          <span style={{ color: 'var(--color-ink-40)' }}>/ {formatPlain(budget)}</span>
        </span>
      </div>
      <BudgetBar ratio={ratio} tone={warning ? 'apricot-strong' : 'mint'} />
    </div>
  );
}

/** 10px waterline bar with the two safety-line ticks. */
export function WaterlineBar({ safeline }: { safeline: SafelineSummary }) {
  const geo = waterlineGeometry(safeline);
  return (
    <div className="waterline-bar">
      <div className="waterline-bar__fill" style={{ width: geo.fill }} />
      <div
        className="waterline-bar__tick waterline-bar__tick--first"
        style={{ left: geo.firstTick }}
      />
      <div
        className="waterline-bar__tick waterline-bar__tick--comfort"
        style={{ left: geo.comfortTick }}
      />
    </div>
  );
}

/** Thin polyline sparkline/trend chart (1.5px stroke, ≤16% fill). */
export function TrendLine({
  values,
  width,
  height,
  filled = false,
  gridLines = 0,
}: {
  values: number[];
  width: number;
  height: number;
  filled?: boolean;
  gridLines?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padX = 4;
  const padY = 5;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const pts = values.map((v, i) => {
    const x = padX + (i / (values.length - 1)) * innerW;
    const y = padY + (1 - (v - min) / range) * innerH;
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const baseline = height - padY;
  const area = `${line} ${(width - padX).toFixed(1)},${baseline} ${padX},${baseline}`;
  const [lastX, lastY] = pts[pts.length - 1];
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
    >
      {Array.from({ length: gridLines }, (_, i) => {
        const y = padY + ((i + 1) / (gridLines + 1)) * innerH;
        return (
          <line
            key={i}
            x1={padX}
            y1={y}
            x2={width - padX}
            y2={y}
            stroke="var(--color-bar-track)"
            strokeWidth="1"
          />
        );
      })}
      {filled && (
        <polygon
          points={area}
          fill="var(--color-mint)"
          opacity="var(--chart-fill-opacity)"
        />
      )}
      <polyline
        points={line}
        fill="none"
        stroke="var(--color-mint-deep)"
        strokeWidth="var(--chart-stroke-width)"
      />
      <circle cx={lastX} cy={lastY} r="3" fill="var(--color-mint-deep)" />
    </svg>
  );
}
