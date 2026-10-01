"use client";

import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartFrame } from "@/components/ChartFrame";
import { CHART_THEME, colorFor, type Theme } from "@/components/charts/palette";
import { formatFlips, formatInteger } from "@/lib/format";
import type { RngId } from "@/lib/rng/types";
import { normalBinMass } from "@/lib/stats";
import type { TrialHistogram } from "@/lib/types";

interface HistogramPoint {
  heads: number;
  count: number;
  expected: number;
  [series: string]: number | undefined;
}

function buildPoints(
  histogram: TrialHistogram,
  iterations: number,
): HistogramPoint[] {
  // The underlying model is exactly Binomial(n, ½); these are its normal
  // parameters. Using them directly keeps the overlay anchored to the theory
  // rather than to whatever the bins happen to be.
  const mu = iterations / 2;
  const sigma = Math.sqrt(iterations) / 2;

  return histogram.counts.map((count, index) => {
    const lower = histogram.edges[index] ?? 0;
    const upper = histogram.edges[index + 1] ?? iterations;
    return {
      heads: (lower + upper) / 2,
      count,
      // Probability mass of the bin × number of trials = expected bar height.
      expected: normalBinMass(lower, upper, mu, sigma) * histogram.trials,
    };
  });
}

export function DistributionChart({
  theme,
  rngId,
  histogram,
  iterations,
  trialsRequested,
  trialsRun,
}: {
  theme: Theme;
  rngId: RngId;
  histogram: TrialHistogram | undefined;
  iterations: number;
  trialsRequested: number;
  trialsRun: number;
}) {
  const chrome = CHART_THEME[theme];
  const data = useMemo(
    () => (histogram ? buildPoints(histogram, iterations) : []),
    [histogram, iterations],
  );
  const color = colorFor(rngId, theme);
  const tooFewTrials = (histogram?.trials ?? 0) < 2;

  return (
    <ChartFrame
      title="Distribution of results"
      subtitle={
        histogram
          ? `${formatInteger(histogram.trials)} independent runs of ${formatFlips(iterations)} flips`
          : `${formatFlips(iterations)} flips per run`
      }
      isEmpty={histogram === undefined}
      emptyMessage="Press Run to generate data."
      explanation={
        <>
          <p>
            Each bar counts how many experiments ended with roughly that many
            heads. This is the binomial distribution with n ={" "}
            {formatFlips(iterations)} and p = 0.5.
          </p>
          <p>
            The line is the Normal(n/2, n/4) approximation: mean{" "}
            {formatFlips(iterations / 2)} heads, standard deviation{" "}
            {formatFlips(Math.sqrt(iterations) / 2)} flips. As n grows the
            binomial and the normal curve become indistinguishable — that
            approximation is the CLT, and it is what makes the ±3σ funnel in the
            first chart legitimate.
          </p>
          <p>
            A narrow histogram means the generator is predictable in its error:
            it will land close to half every single time. A flat or lopsided
            histogram means you can still tell something about the generator
            after a million flips, which is the whole point of comparing
            generators.
          </p>
          {trialsRun < trialsRequested ? (
            <p className="text-[var(--color-accent)]">
              {formatInteger(trialsRequested - trialsRun)} requested trials were
              skipped to stay inside the flip budget.
            </p>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {tooFewTrials ? (
          <p className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-muted)]">
            Set <span className="font-semibold">Trials</span> above 1 in the
            controls to fill this chart with more than one experiment.
          </p>
        ) : null}
        <div className="h-64 w-full sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 14, bottom: 8, left: 0 }}
            >
              <CartesianGrid stroke={chrome.grid} strokeDasharray="2 4" />
              <XAxis
                dataKey="heads"
                type="number"
                domain={["dataMin", "dataMax"]}
                stroke={chrome.axis}
                tick={{ fill: chrome.text, fontSize: 11 }}
                tickFormatter={formatFlips}
                label={{
                  value: "heads in the run",
                  position: "insideBottom",
                  offset: 0,
                  fill: chrome.text,
                  fontSize: 11,
                }}
                minTickGap={16}
              />
              <YAxis
                stroke={chrome.axis}
                tick={{ fill: chrome.text, fontSize: 11 }}
                tickFormatter={formatFlips}
                width={54}
                label={{
                  value: "experiments",
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
                    ? formatInteger(value)
                    : String(value),
                  name === "expected" ? "Normal(n/2, n/4)" : "observed",
                ]}
                labelFormatter={(label) =>
                  `${formatFlips(Number(label))} heads`
                }
              />
              <Bar
                dataKey="count"
                name="observed"
                fill={color}
                fillOpacity={0.75}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="expected"
                name="expected"
                stroke={chrome.reference}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ChartFrame>
  );
}
