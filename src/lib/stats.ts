/**
 * Statistics used by the visualizer. Pure functions, no DOM, no worker globals
 * — that is what makes them unit-testable and reusable inside the worker.
 *
 * Notation used throughout: n = number of flips, h = number of heads,
 * p = h/n, and for a fair coin σ_p = sqrt(p(1−p)/n) = 0.5/sqrt(n).
 */

/** Floor for reported p-values, so a chi-square p of "0" still reads sensibly. */
const MIN_P = 1e-300;

// ---------------------------------------------------------------------------
// Normal distribution
// ---------------------------------------------------------------------------

/**
 * Complementary error function for z ≥ 0, built on the regularised incomplete
 * gamma: erfc(z) = Q(½, z²). Reusing the gamma machinery below keeps one
 * numerical core in this file and buys ~1e-14 accuracy, where the classic
 * Abramowitz & Stegun 7.1.26 polynomial only manages 1.5e-7.
 */
function erfcNonNegative(z: number): number {
  const t = z * z;
  return t > 1.5 ? gammaQContinuedFraction(0.5, t) : 1 - gammaP(0.5, t);
}

export function erfc(z: number): number {
  return z >= 0 ? erfcNonNegative(z) : 2 - erfcNonNegative(-z);
}

export function erf(x: number): number {
  return x >= 0 ? 1 - erfcNonNegative(x) : erfcNonNegative(-x) - 1;
}

export function normalPdf(x: number, mu = 0, sigma = 1): number {
  const z = (x - mu) / sigma;
  return (0.3989422804014327 * Math.exp(-0.5 * z * z)) / sigma;
}

export function normalCdf(x: number, mu = 0, sigma = 1): number {
  return 0.5 * (1 + erf((x - mu) / (sigma * Math.SQRT2)));
}

/**
 * Probability that a Normal(mu, sigma) draw falls inside [lo, hi].
 * Use this (not the pdf) to build histogram overlays: the pdf is a density,
 * bar heights are probabilities × number of trials.
 */
export function normalBinMass(
  lo: number,
  hi: number,
  mu = 0,
  sigma = 1,
): number {
  return normalCdf(hi, mu, sigma) - normalCdf(lo, mu, sigma);
}

/**
 * Gaussian approximation to P(heads = k) for a Binomial(n, 1/2), evaluated as
 * the probability of the width-1 interval around k.
 */
export function normalApproxBinomialPmf(k: number, n: number): number {
  const mu = n / 2;
  const sigma = Math.sqrt(n) / 2;
  return normalBinMass(k - 0.5, k + 0.5, mu, sigma);
}

// ---------------------------------------------------------------------------
// Incomplete gamma — the engine behind the chi-square p-value
// ---------------------------------------------------------------------------

const LANCZOS_C = [
  76.18009172947146, -86.50532032941678, 24.01409824083091, -1.231739572450155,
  0.1208650973866179e-2, -0.5395239384953e-5,
];
const EPS = 1e-15;
const CF_ITMAX = 500;

/** Lanczos log-gamma. Relative error ~1e-11 for x > 0. */
export function lnGamma(x: number): number {
  if (!(x > 0)) {
    return Number.NaN;
  }
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let series = 1.000000000190015;
  let y = x;
  for (let j = 0; j < LANCZOS_C.length; j += 1) {
    y += 1;
    series += (LANCZOS_C[j] ?? 0) / y;
  }
  return Math.log((2.5066282746310007 * series) / x) - tmp;
}

/**
 * Regularised lower incomplete gamma P(a, x), evaluated with the series form
 * when x < a + 1 and the Lentz continued fraction otherwise (Numerical Recipes
 * 6.2). Accurate to ~1e-14, which is well past what any p-value needs.
 */
export function gammaP(a: number, x: number): number {
  if (!(a > 0) || x < 0) {
    return Number.NaN;
  }
  if (x === 0) {
    return 0;
  }
  if (x < a + 1) {
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 0; n < CF_ITMAX; n += 1) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * EPS) {
        break;
      }
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  return 1 - gammaQContinuedFraction(a, x);
}

/** The continued fraction for Q(a, x) = 1 − P(a, x), via Lentz's method. */
function gammaQContinuedFraction(a: number, x: number): number {
  const b0 = x + 1 - a;
  let c = 1 / EPS;
  let d = 1 / b0;
  let h = d;
  for (let i = 1; i <= CF_ITMAX; i += 1) {
    const an = -i * (i - a);
    const b = b0 + 2 * i;
    d = an * d + b;
    if (Math.abs(d) < EPS) {
      d = EPS;
    }
    c = b + an / c;
    if (Math.abs(c) < EPS) {
      c = EPS;
    }
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) {
      break;
    }
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

// ---------------------------------------------------------------------------
// Chi-square
// ---------------------------------------------------------------------------

/**
 * P(X > x) for X ~ chi-square(df): the p-value of a chi-square
 * goodness-of-fit test, i.e. "how surprising is this statistic?".
 */
export function chiSquareSurvival(x: number, df: number): number {
  if (!(df > 0)) {
    return 1;
  }
  if (!(x > 0)) {
    return 1;
  }
  const upper = 1 - gammaP(df / 2, x / 2);
  if (!Number.isFinite(upper)) {
    return 0;
  }
  return Math.min(1, Math.max(MIN_P, upper));
}

export interface ChiSquareResult {
  statistic: number;
  degreesOfFreedom: number;
  pValue: number;
}

/**
 * Goodness-of-fit: χ² = Σ (Oᵢ − Eᵢ)² / Eᵢ.
 *
 * `df` is passed explicitly because it must be reduced by one per *fitted*
 * parameter: the 10 decile counts sum to n, so they carry 9 free parameters.
 */
export function chiSquareGoodnessOfFit(
  observed: readonly number[],
  expected: readonly number[],
  degreesOfFreedom: number,
): ChiSquareResult {
  let statistic = 0;
  const m = Math.min(observed.length, expected.length);
  for (let i = 0; i < m; i += 1) {
    const o = observed[i] ?? 0;
    const e = expected[i] ?? 0;
    if (e > 0) {
      const diff = o - e;
      statistic += (diff * diff) / e;
    }
  }
  return {
    statistic,
    degreesOfFreedom,
    pValue: chiSquareSurvival(statistic, degreesOfFreedom),
  };
}

/** Goodness-of-fit for a categorical distribution with equal expected counts. */
export function chiSquareUniform(observed: readonly number[]): ChiSquareResult {
  const total = observed.reduce((sum, value) => sum + value, 0);
  if (total === 0 || observed.length < 2) {
    return {
      statistic: 0,
      degreesOfFreedom: Math.max(0, observed.length - 1),
      pValue: 1,
    };
  }
  const expected = total / observed.length;
  const statistic = observed.reduce(
    (sum, value) => sum + (value - expected) ** 2 / expected,
    0,
  );
  return {
    statistic,
    degreesOfFreedom: observed.length - 1,
    pValue: chiSquareSurvival(statistic, observed.length - 1),
  };
}

/**
 * The classic "is this coin fair?" test: a 2×2 heads/tails contingency table
 * with one fitted constraint, so df = 1. Equivalent to z² for a fair coin.
 */
export function chiSquareCoinToss(
  heads: number,
  tails: number,
): ChiSquareResult {
  const n = heads + tails;
  if (n === 0) {
    return { statistic: 0, degreesOfFreedom: 1, pValue: 1 };
  }
  const expected = n / 2;
  const diff = heads - expected;
  const statistic = (diff * diff) / expected + (diff * diff) / expected;
  return {
    statistic,
    degreesOfFreedom: 1,
    pValue: chiSquareSurvival(statistic, 1),
  };
}

// ---------------------------------------------------------------------------
// Convergence helpers
// ---------------------------------------------------------------------------

/** Standard deviation of the proportion after n fair flips: 0.5 / sqrt(n). */
export function proportionSigma(n: number): number {
  return 0.5 / Math.sqrt(n);
}

/** Standard deviation of the heads count after n fair flips: sqrt(n) / 2. */
export function headsSigma(n: number): number {
  return Math.sqrt(n) / 2;
}

/** Half-width of the ±kσ envelope drawn on the convergence chart. */
export function sigmaBand(n: number, k: number): number {
  return k * proportionSigma(n);
}

/** Standardised deviation: (h − n/2) / (sqrt(n)/2). */
export function zScore(heads: number, n: number): number {
  if (n === 0) {
    return 0;
  }
  return (heads - n / 2) / headsSigma(n);
}

/** Proportion of heads after n flips. */
export function proportion(heads: number, n: number): number {
  return n === 0 ? 0 : heads / n;
}

/**
 * E|D| where D = h − n/2 is approximately normal with σ = sqrt(n)/2:
 * E|D| = σ·sqrt(2/π) ≈ 0.7979σ. This is the "the deviation curve should sit
 * around here" line on the absolute-deviation chart.
 */
export function expectedAbsoluteDeviation(n: number): number {
  return headsSigma(n) * Math.sqrt(2 / Math.PI);
}

/** |z|: the gap expressed in standard deviations, ignoring the sign. */
export function absoluteZScore(heads: number, n: number): number {
  return Math.abs(zScore(heads, n));
}
