"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartFrame, ChipToggle } from "@/components/ChartFrame";
import { CHART_THEME, colorFor, type Theme } from "@/components/charts/palette";
import { logTicks } from "@/lib/downsample";
import { formatFlips } from "@/lib/format";
import { getDescriptor } from "@/lib/rng";
import type { RngId } from "@/lib/rng/types";
import type { Checkpoint } from "@/lib/types";

interface DeviationPoint {
  n: number;
  /** √n / 2 — one standard deviation, a power law, hence straight on log-log. */
  sigma: number;
  /** √n/2 · √(2/π) — the expected gap for a fair coin. */
  expected: number;
  [series: string]: number | undefined;
}

const SQRT_2_OVER_PI = Math.sqrt(2 / Math.PI);

export function DeviationChart({
  theme,
  series,
  iterations,
}: {
  theme: Theme;
  series: Partial<Record<RngId, Checkpoint[]>>;
  iterations: number;
}) {
  const [showSigma, setShowSigma] = useState(true);
  const [showExpected, setShowExpected] = useState(true);
  const chrome = CHART_THEME[theme];
  const ids = useMemo(() => Object.keys(series).sort() as RngId[], [series]);

  const data = useMemo(() => {
    const rows = new Map<number, DeviationPoint>();
    for (const id of ids) {
      for (const point of series[id] ?? []) {
        let row = rows.get(point.n);
        if (row === undefined) {
          const sigma = Math.sqrt(point.n) / 2;
          row = { n: point.n, sigma, expected: sigma * SQRT_2_OVER_PI };
          rows.set(point.n, row);
        }
        row[id] = Math.abs(point.heads - point.n / 2);
      }
    }
    return [...rows.values()].sort((a, b) => a.n - b.n);
  }, [ids, series]);

  /**
   * The y axis is logarithmic, and |heads − n/2| is an integer that hits exactly
   * zero often enough to matter — an exact tie at some checkpoint. Zero has no
   * place on a log axis: Recharts silently drops the whole series rather than
   * drawing one. So values are floored onto the smallest tick we will actually
   * show, and the domain is stated explicitly instead of left to "auto".
   */
  const FLOOR = 0.5;

  const floored = useMemo(
    () =>
      data.map((row) => {
        const next: DeviationPoint = { ...row };
        if (next.expected !== undefined) {
          next.expected = Math.max(FLOOR, next.expected);
        }
        if (next.sigma !== undefined) {
          next.sigma = Math.max(FLOOR, next.sigma);
        }
        for (const id of ids) {
          const value = next[id];
          if (value !== undefined) {
            next[id] = Math.max(FLOOR, value);
          }
        }
        return next;
      }),
    [data, ids],
  );

  const yDomain = useMemo<[number, number]>(() => {
    let max = FLOOR;
    for (const row of floored) {
      for (const value of Object.values(row)) {
        if (typeof value === "number" && value > max) {
          max = value;
        }
      }
    }
    return [FLOOR, max * 1.25];
  }, [floored]);

  return (
    <ChartFrame
      title="Absolute deviation"
      subtitle="How far the head count sits from an exact tie, in flips"
      isEmpty={data.length === 0}
      emptyMessage="Press Run to flip some coins."
      actions={
        <>
          <ChipToggle
            checked={showSigma}
            onChange={setShowSigma}
            label="Show the one sigma curve"
          >
            √n / 2 (1σ)
          </ChipToggle>
          <ChipToggle
            checked={showExpected}
            onChange={setShowExpected}
            label="Show the expected absolute deviation curve"
          >
            E|D| ≈ 0.4√n
          </ChipToggle>
        </>
      }
      explanation={
        <>
          <p>
            This chart answers the question the convergence chart hides: does
            the gap between heads and tails actually get smaller? It does not.
            Each line is |heads − n/2|, and it <em>rises</em>, because any run
            of n flips ends with a gap of order √n, not order 1.
          </p>
          <p>
            The grey curves are the theory: a fair coin has σ = √n/2 flips of
            standard deviation, so the typical gap is about 0.4√n. On a log–log
            plot those curves are straight lines with slope 0.5. A generator
            whose line runs above them, or wanders off them, has unusually large
            gaps.
          </p>
          <p>
            The important contrast: the gap grows like √n while the run length
            grows like n, so the <em>relative</em> gap shrinks. At a million
            flips a gap of 500 is completely normal — it is half a percent.
          </p>
        </>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
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
            scale="log"
            domain={yDomain}
            ticks={logTicks(FLOOR, yDomain[1], 8)}
            stroke={chrome.axis}
            tick={{ fill: chrome.text, fontSize: 11 }}
            tickFormatter={formatFlips}
            width={54}
            label={{
              value: "|heads − n/2|",
              angle: -90,
              position: "insideLeft",
              fill: chrome.text,
              fontSize: 11,
            }}
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
                ? `${value.toFixed(1)} flips`
                : String(value),
              getDescriptor(name as RngId).shortName,
            ]}
            labelFormatter={(label) => `${formatFlips(Number(label))} flips`}
          />
          {showExpected ? (
            <Line
              type="monotone"
              dataKey="expected"
              name="Expected gap ≈ 0.4√n"
              stroke={chrome.reference}
              strokeWidth={1.5}
              strokeDasharray="6 4"
              dot={false}
              isAnimationActive={false}
            />
          ) : null}
          {showSigma ? (
            <Line
              type="monotone"
              dataKey="sigma"
              name="1σ = √n / 2"
              stroke={chrome.axis}
              strokeWidth={1.5}
              strokeDasharray="2 3"
              dot={false}
              isAnimationActive={false}
            />
          ) : null}
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
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
