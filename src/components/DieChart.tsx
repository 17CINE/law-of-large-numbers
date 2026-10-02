"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartFrame } from "@/components/ChartFrame";
import { CHART_THEME, colorFor, type Theme } from "@/components/charts/palette";
import { formatInteger } from "@/lib/format";
import type { RngId } from "@/lib/rng/types";
import type { DieSummary } from "@/lib/types";

export function DieChart({
  theme,
  rngId,
  summary,
  iterations,
  trials,
}: {
  theme: Theme;
  rngId: RngId;
  summary: DieSummary | undefined;
  iterations: number;
  trials: number;
}) {
  const chrome = CHART_THEME[theme];
  const color = colorFor(rngId, theme);
  const expected = summary ? summary.total / 6 : (iterations * trials) / 6;
  const data = (summary?.counts ?? []).map((count, index) => ({
    face: String(index + 1),
    count,
    expected,
  }));

  return (
    <ChartFrame
      title="Fair die face frequencies"
      subtitle={
        summary
          ? `${formatInteger(summary.total)} rolls across ${formatInteger(trials)} independent runs`
          : `${formatInteger(iterations)} rolls per run`
      }
      isEmpty={summary === undefined}
      emptyMessage="Press Run to roll the die."
      explanation={
        <p>
          Each bar counts how often that face appeared. A fair die gives every
          face probability 1/6, so the bars should settle toward the same height
          as the number of rolls grows. Rejection sampling turns three random
          bits into one unbiased roll: values 6 and 7 are discarded instead of
          introducing modulo bias.
        </p>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 12, right: 16, bottom: 12, left: 4 }}
        >
          <CartesianGrid stroke={chrome.grid} strokeDasharray="2 4" />
          <XAxis
            dataKey="face"
            stroke={chrome.axis}
            tick={{ fill: chrome.text, fontSize: 12 }}
            label={{
              value: "die face",
              position: "insideBottom",
              offset: -4,
              fill: chrome.text,
              fontSize: 11,
            }}
          />
          <YAxis
            stroke={chrome.axis}
            tick={{ fill: chrome.text, fontSize: 11 }}
            tickFormatter={formatInteger}
            width={58}
            label={{
              value: "occurrences",
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
              typeof value === "number" ? formatInteger(value) : String(value),
              name === "expected" ? "expected (1/6)" : "observed",
            ]}
            labelFormatter={(label) => `face ${label}`}
          />
          <ReferenceLine
            y={expected}
            stroke={chrome.reference}
            strokeDasharray="5 4"
          />
          <Bar
            dataKey="count"
            name="observed"
            fill={color}
            fillOpacity={0.82}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
          <Line
            dataKey="expected"
            name="expected"
            stroke={chrome.reference}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
