/** Number formatting shared by the table, tooltips and captions. */

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const plain = new Intl.NumberFormat("en-US");

/** 1_000_000 → "1M". Axis ticks and headline numbers. */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return Math.abs(value) < 1000
    ? String(Math.round(value))
    : compact.format(value);
}

/** 1234567 → "1,234,567". Table cells, where precision matters. */
export function formatInteger(value: number): string {
  return plain.format(Math.round(value));
}

/** 0.5012 → "0.5012"; adapts the decimal count to the magnitude. */
export function formatProportion(value: number, digits = 4): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return value.toFixed(digits);
}

export function formatPercent(value: number, digits = 2): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(digits)}%`;
}

/** z-scores below −1e4 explode; scientific notation keeps them readable. */
export function formatZ(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (Math.abs(value) >= 10_000) {
    return value.toExponential(2);
  }
  return value.toFixed(2);
}

/** p-values span 1 down to 1e-300; below 1e-4 scientific reads better. */
export function formatPValue(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (value === 0) {
    return "< 1e-300";
  }
  if (value < 0.0001) {
    return value.toExponential(2);
  }
  return value.toFixed(4);
}

export function formatMs(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (value < 1) {
    return `${value.toFixed(2)} ms`;
  }
  if (value < 1_000) {
    return `${value.toFixed(1)} ms`;
  }
  return `${(value / 1_000).toFixed(2)} s`;
}

/** Flip counts, in the same compact style but never abbreviated below 1k. */
export function formatFlips(value: number): string {
  return value < 1_000 ? plain.format(value) : compact.format(value);
}
