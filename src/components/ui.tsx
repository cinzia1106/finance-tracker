/* Small shared visual primitives shared by feature pages. */

import type { ReactNode } from 'react';
import type { SafelineSummary } from '../data/adapter';
import {
  BUDGET_WARNING_THRESHOLD,
  budgetRatio,
  formatPlain,
  waterlineGeometry,
} from '../lib/format';

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
