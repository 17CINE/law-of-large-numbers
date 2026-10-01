"use client";

import { ChartFrame } from "@/components/ChartFrame";
import { colorFor, type Theme } from "@/components/charts/palette";
import {
  formatInteger,
  formatMs,
  formatPercent,
  formatPValue,
  formatZ,
} from "@/lib/format";
import { getDescriptor } from "@/lib/rng";
import type { RngId } from "@/lib/rng/types";
import type { AlgorithmResult } from "@/lib/types";

interface Column {
  header: string;
  title: string;
  align: "left" | "right";
}

const COLUMNS: Column[] = [
  {
    header: "Generator",
    title: "Which random number generator produced this row.",
    align: "left",
  },
  {
    header: "Heads",
    title: "Total heads counted during the run.",
    align: "right",
  },
  {
    header: "Proportion",
    title: "heads / n. Converges to 0.5 as n grows.",
    align: "right",
  },
  {
    header: "z-score",
    title:
      "(heads − n/2) / (√n/2). How many standard deviations from an exact tie. |z| > 3 happens 0.3% of the time for a fair coin.",
    align: "right",
  },
  {
    header: "χ² (df = 9)",
    title:
      "Goodness of fit over the ten equal-sized slices of the run: Σ (observed − expected)² / expected.",
    align: "right",
  },
  {
    header: "p-value",
    title:
      "Probability of seeing a χ² at least this large if the generator really is fair. Below 0.05 rejects the coin.",
    align: "right",
  },
  {
    header: "Longest run",
    title:
      "Longest streak of identical flips. A fair coin needs about 2·log₂(n) flips to produce a run this long.",
    align: "right",
  },
  {
    header: "Runtime",
    title: "Wall-clock time spent in this generator.",
    align: "right",
  },
];

export function StatsTable({
  theme,
  results,
  partialResults,
  ids,
  focusRngId,
  onFocusRng,
  iterations,
}: {
  theme: Theme;
  results: Partial<Record<RngId, AlgorithmResult>>;
  /** Generators still running, so the table can show a pending row. */
  partialResults: RngId[];
  ids: RngId[];
  focusRngId: RngId;
  onFocusRng: (id: RngId) => void;
  iterations: number;
}) {
  const finished = ids.filter((id) => results[id] !== undefined);
  const pending = partialResults.filter((id) => results[id] === undefined);

  return (
    <ChartFrame
      title="Results"
      subtitle={`One row per generator, all at n = ${formatInteger(iterations)} flips`}
      isEmpty={finished.length === 0}
      emptyMessage="Press Run to collect statistics."
      explanation={
        <>
          <p>
            The z-score is the headline number: it measures the final gap in
            standard deviations. For a fair coin it is approximately standard
            normal, so |z| &gt; 3 should happen about once in 300 runs — if you
            see several in a row, something is off.
          </p>
          <p>
            The chi-square test is stricter because it looks at all ten slices
            of the run at once. The ten counts are constrained to sum to n,
            which leaves 9 free parameters, hence df = 9. A healthy generator
            lands near the p-values you would expect by chance: a few small
            ones, most large.
          </p>
          <p>
            Runtimes are not a fair benchmark — a worker thread, JIT warm-up and
            garbage collection all land in there. Treat them as
            order-of-magnitude only, and note that the CSPRNG is doing real
            cryptographic work per call while the others are just arithmetic.
          </p>
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <caption className="sr-only">
            Simulation results for each selected random number generator
          </caption>
          <thead>
            <tr className="border-b border-[var(--color-line)]">
              {COLUMNS.map((column) => (
                <th
                  key={column.header}
                  scope="col"
                  title={column.title}
                  className={`px-2 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] ${
                    column.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {finished.map((id) => {
              const result = results[id];
              if (result === undefined) {
                return null;
              }
              const descriptor = getDescriptor(id);
              return (
                <tr
                  key={id}
                  className="cursor-pointer border-b border-[var(--color-line)] last:border-0 hover:bg-[var(--color-surface)]"
                  onClick={() => onFocusRng(id)}
                >
                  <th scope="row" className="px-2 py-2 text-left font-medium">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="inline-block size-3 shrink-0 rounded-full"
                        style={{ backgroundColor: colorFor(id, theme) }}
                      />
                      <span>{descriptor.shortName}</span>
                      {descriptor.weak ? (
                        <span className="rounded bg-[var(--color-accent)]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">
                          weak
                        </span>
                      ) : null}
                      {focusRngId === id ? (
                        <span className="sr-only">
                          (shown in the distribution chart)
                        </span>
                      ) : null}
                    </span>
                  </th>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatInteger(result.series.totalHeads)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatPercent(result.proportion, 3)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatZ(result.z)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {result.chiSquare.statistic.toFixed(2)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatPValue(result.chiSquare.pValue)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatInteger(result.series.longestRun)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatMs(
                      result.series.runtimeMs + result.histogram.runtimeMs,
                    )}
                  </td>
                </tr>
              );
            })}
            {pending.map((id) => (
              <tr
                key={id}
                className="border-b border-[var(--color-line)] last:border-0"
              >
                <th
                  scope="row"
                  className="px-2 py-2 text-left font-medium text-[var(--color-muted)]"
                >
                  {getDescriptor(id).shortName}
                </th>
                <td
                  colSpan={7}
                  className="px-2 py-2 text-right tabular-nums text-[var(--color-muted)]"
                >
                  running…
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartFrame>
  );
}
