/* Number/amount formatting and shared display rules.
   Amount rules (handoff): mono font, thousands separators mandatory;
   income shows "+", liabilities/due show "−", transfers show no sign. */

export function formatThousands(n: number): string {
  return Math.abs(Math.round(n)).toLocaleString('en-US');
}

/** Signed amount for transaction lists: -486 → "−486", 18500 → "+18,500". */
export function formatSigned(n: number): string {
  const body = formatThousands(n);
  if (n < 0) return `−${body}`;
  return `+${body}`;
}

/** Unsigned amount (transfers, plain figures). */
export function formatPlain(n: number): string {
  return formatThousands(n);
}

/** Liability display: always a leading minus. */
export function formatLiability(n: number): string {
  return `−${formatThousands(n)}`;
}

/** Page-level currency figures, e.g. "NT$ 415,400" / "+NT$ 21,060". */
export function formatCurrency(n: number, withSign = false): string {
  const sign = withSign ? (n >= 0 ? '+' : '−') : '';
  return `${sign}NT$ ${formatThousands(n)}`;
}

/** Budget usage ratio clamped to [0, 1]. */
export function budgetRatio(spent: number, budget: number): number {
  if (budget <= 0) return 0;
  return Math.min(spent / budget, 1);
}

/** Budgets at or above this usage show the warning treatment. */
export const BUDGET_WARNING_THRESHOLD = 0.9;

/* Waterline bar geometry: the design places the comfort line at 77% of the
   track, i.e. the track spans comfortLine * 1.3. */
const WATERLINE_SCALE_FACTOR = 1.3;

export function waterlineGeometry(safeline: {
  balance: number;
  firstLine: number;
  comfortLine: number;
}) {
  const scale = safeline.comfortLine * WATERLINE_SCALE_FACTOR;
  const pct = (v: number) => {
    if (scale <= 0) return '0%';
    return `${Math.min((v / scale) * 100, 100).toFixed(0)}%`;
  };
  return {
    fill: pct(safeline.balance),
    firstTick: pct(safeline.firstLine),
    comfortTick: pct(safeline.comfortLine),
    firstLineMet: safeline.balance >= safeline.firstLine,
    comfortLineMet: safeline.balance >= safeline.comfortLine,
    comfortGap: Math.max(safeline.comfortLine - safeline.balance, 0),
    comfortPct: safeline.comfortLine > 0 ? Math.round((safeline.balance / safeline.comfortLine) * 100) : 0,
  };
}
