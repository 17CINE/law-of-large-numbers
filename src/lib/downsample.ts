/**
 * Chart data conditioning.
 *
 * The checkpoints a run produces are already sparse (~67 points for 10M flips),
 * but a run that someone reconfigured, or a generator with a much finer
 * checkpoint ladder, can produce more. Recharts is happiest around a thousand
 * points, so everything is funnelled through `downsampleLog`.
 */

export const MAX_RENDER_POINTS = 1000;

/**
 * Keeps at most `maxPoints` entries, always preserving the first and the last,
 * and spreading the retained indices logarithmically. For log-spaced input this
 * keeps the shape of the funnel intact instead of over-sampling the left edge.
 */
export function downsampleLog<T>(
  points: readonly T[],
  maxPoints = MAX_RENDER_POINTS,
): T[] {
  const total = points.length;
  // Below 2 there is no way to keep both ends, and the stepping loop below
  // would never advance: guard rather than trust the caller.
  const limit = Math.max(2, Math.floor(maxPoints));
  if (total <= limit) {
    return points.slice();
  }
  const kept: T[] = [];
  let lastPosition = -1;
  const last = total - 1;
  // Geometric spacing across the index range. Note that a `position *= ratio`
  // loop cannot be used here: it starts at 0, and 0 × anything is still 0, so
  // it either spins forever or stops early on duplicates.
  for (let step = 0; step < limit; step += 1) {
    const t = step / (limit - 1);
    const position = Math.min(
      last,
      Math.round(Math.exp(t * Math.log(last + 1))) - 1,
    );
    if (position === lastPosition) {
      continue;
    }
    lastPosition = position;
    const point = points[position];
    if (point !== undefined) {
      kept.push(point);
    }
    if (position === last) {
      break;
    }
  }
  return kept;
}

/**
 * A nice human-readable axis tick set for a log axis: powers of ten, with
 * ×2/×5 in between when that does not overcrowd the domain.
 */
export function logTicks(min: number, max: number, maxTicks = 12): number[] {
  const startExp = Math.floor(Math.log10(min));
  const endExp = Math.ceil(Math.log10(max));
  const decades = endExp - startExp;

  const build = (leads: readonly number[]): number[] => {
    const values: number[] = [];
    for (let exp = startExp; exp <= endExp; exp += 1) {
      for (const lead of leads) {
        const value = lead * 10 ** exp;
        if (value >= min && value <= max) {
          values.push(value);
        }
      }
    }
    return values;
  };

  // Preference order when the budget is tight: keep the 1/2/5 ladder while it
  // fits, fall back to whole decades, then stride whole decades. Striding the
  // dense ladder directly would silently drop whichever lead lost the race.
  let candidates = build(decades > 2 ? [1, 2, 5] : [1]);
  if (candidates.length > maxTicks) {
    candidates = build([1]);
  }
  if (candidates.length > maxTicks) {
    const stride = Math.ceil(candidates.length / maxTicks);
    candidates = candidates.filter((_, index) => index % stride === 0);
  }

  // Label the actual top of the domain, not merely the last round tick inside
  // it: the last row of the table usually *is* the run length, and an axis that
  // stops at 10^7 when the run went to 5×10^7 reads as a mistake.
  if (max > (candidates.at(-1) ?? Number.NEGATIVE_INFINITY)) {
    candidates.push(max);
  }
  return candidates;
}
