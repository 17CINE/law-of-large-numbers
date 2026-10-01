"use client";

import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartFrame, ChipToggle } from "@/components/ChartFrame";
import { CHART_THEME, colorFor, type Theme } from "@/components/charts/palette";
import { logTicks } from "@/lib/downsample";
import { formatFlips, formatProportion } from "@/lib/format";
import { getDescriptor, isRngId } from "@/lib/rng";
import type { RngId } from "@/lib/rng/types";
import type { Checkpoint } from "@/lib/types";

/**
 * One row per checkpoint: the theoretical funnel, plus the running proportion of
 * every generator that has reached that many flips.
 */
interface ConvergencePoint {
  n: number;
  envelope: [number, number];
  [series: string]: number | [number, number] | undefined;
}

const SIGMA_K = 3;

/** Half-width of the funnel at n: k·σ = k·0.5/√n. */
export function sigmaBandHalfWidth(n: number, k = SIGMA_K): number {
  return (k * 0.5) / Math.sqrt(n);
}

function buildRows(
  ids: readonly RngId[],
  series: Partial<Record<RngId, Checkpoint[]>>,
  partialSeries: Partial<Record<RngId, Checkpoint[]>>,
): ConvergencePoint[] {
  const merged: Partial<Record<RngId, Checkpoint[]>> = {
    ...partialSeries,
    ...series,
  };
  const rows = new Map<number, ConvergencePoint>();

  for (const id of ids) {
    for (const point of merged[id] ?? []) {
      let row = rows.get(point.n);
      if (row === undefined) {
        row = { n: point.n, envelope: [0, 1] };
        rows.set(point.n, row);
      }
      row[id] = point.heads / point.n;
    }
  }

  return [...rows.values()]
    .sort((a, b) => a.n - b.n)
    .map((row) => {
      const half = sigmaBandHalfWidth(row.n);
      return {
        ...row,
        envelope: [Math.max(0, 0.5 - half), Math.min(1, 0.5 + half)],
      };
    });
}

export function ConvergenceChart({
  theme,
  series,
  partialSeries,
  iterations,
  maxAbsDeviation,
}: {
  theme: Theme;
  /** Finished runs, keyed by generator. */
  series: Partial<Record<RngId, Checkpoint[]>>;
  /** In-flight checkpoint data, keyed by generator. */
  partialSeries: Partial<Record<RngId, Checkpoint[]>>;
  iterations: number;
  /** Largest |p − 0.5| seen so far, used to size the zoomed y-axis. */
  maxAbsDeviation: number;
}) {
  const [followFunnel, setFollowFunnel] = useState(true);
  const chrome = CHART_THEME[theme];
  // Generators that are finished *or* still streaming: a line must appear the
  // moment the first checkpoint lands, not when the run finishes.
  const ids = useMemo(() => {
    const all = new Set<RngId>([
      ...(Object.keys(series) as RngId[]),
      ...(Object.keys(partialSeries) as RngId[]),
    ]);
    return [...all].sort();
  }, [partialSeries, series]);

  /**
   * Recharts hands the tooltip the series `name`. RNG lines are named by id, so
   * they resolve through the registry; the envelope is not a generator and must
   * not be looked up.
   */
  const labelFor = (name: unknown): string => {
    const key = String(name);
    return isRngId(key) ? getDescriptor(key).shortName : key;
  };

  const data = useMemo(
    () => buildRows(ids, series, partialSeries),
    [ids, partialSeries, series],
  );

  /**
   * Two views. "Follow the funnel" zooms onto the ±3σ band so the narrowing is
   * visible at all; "Full range" keeps 0…1, which shows how tightly the curve
   * hugs 0.5 from the very first flip.
   */
  const yDomain = useMemo<[number, number]>(() => {
    if (!followFunnel || iterations < 1) {
      return [0, 1];
    }
    const span =
      Math.max(sigmaBandHalfWidth(iterations), maxAbsDeviation, 0.004) * 1.2;
    return [Math.max(0, 0.5 - span), Math.min(1, 0.5 + span)];
  }, [followFunnel, iterations, maxAbsDeviation]);

  return (
    <ChartFrame
      title="Convergence"
      subtitle="Running proportion of heads against flips (log x-axis)"
      isEmpty={data.length === 0}
      emptyMessage="Press Run to flip some coins."
      actions={
        <>
          <ChipToggle
            checked={followFunnel}
            onChange={setFollowFunnel}
            label="Zoom the y-axis onto the three sigma funnel"
          >
            Follow the funnel
          </ChipToggle>
          <ChipToggle
            checked={!followFunnel}
            onChange={(next) => setFollowFunnel(!next)}
            label="Show the full zero to one range"
          >
            Full 0–1 range
          </ChipToggle>
        </>
      }
      explanation={
        <>
          <p>
            Each line is the share of flips that came up heads so far. Good
            generators wobble early and get pulled toward the dashed line at 0.5
            as flips pile up. That pull <em>is</em> the law of large numbers.
          </p>
          <p>
            The shaded funnel is the theoretical envelope: for a fair coin the
            running proportion stays within ±{SIGMA_K}σ with about 99.7%
            probability, where σ = 0.5/√n. The funnel closes as you read right
            because quadrupling n halves the allowed wobble. A line that leaves
            the funnel and stays out is doing something a fair coin cannot do.
          </p>
          <p>
            The x-axis is logarithmic, which is the only way to fit 100 flips
            and ten million flips on one screen. On a linear axis everything
            after n = 10,000 would be a flat line pinned to 0.5.
          </p>
        </>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        {/* ComposedChart, not LineChart: Recharts only renders the Area
            (the funnel) when the chart is allowed to mix graphic kinds. */}
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 14, bottom: 8, left: 0 }}
        >
          <CartesianGrid stroke={chrome.grid} strokeDasharray="2 4" />
          <XAxis
            dataKey="n"
            type="number"
            scale="log"
            domain={[1, Math.max(2, iterations)]}
            ticks={logTicks(1, iterations)}
            tickFormatter={formatFlips}
            stroke={chrome.axis}
            tick={{ fill: chrome.text, fontSize: 11 }}
            label={{
              value: "flips (n)",
              position: "insideBottom",
              offset: 0,
              fill: chrome.text,
              fontSize: 11,
            }}
            minTickGap={8}
          />
          <YAxis
            domain={yDomain}
            stroke={chrome.axis}
            tick={{ fill: chrome.text, fontSize: 11 }}
            tickFormatter={(value: number) => formatProportion(value, 3)}
            width={54}
          />
          <Tooltip
            contentStyle={{
              background: chrome.background,
              border: `1px solid ${chrome.grid}`,
              borderRadius: 8,
              fontSize: 12,
              color: chrome.text,
            }}
            formatter={(value, name) => [
              typeof value === "number"
                ? formatProportion(value, 5)
                : String(value),
              labelFor(name),
            ]}
            labelFormatter={(label) => `${formatFlips(Number(label))} flips`}
          />
          <Area
            dataKey="envelope"
            name={`±${SIGMA_K}σ band`}
            stroke="none"
            fill={chrome.envelope}
            isAnimationActive={false}
            activeDot={false}
          />
          <ReferenceLine
            y={0.5}
            stroke={chrome.reference}
            strokeDasharray="6 4"
          />
          {ids.map((id) => (
            <Line
              key={id}
              type="monotone"
              dataKey={id}
              name={id}
              stroke={colorFor(id, theme)}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
