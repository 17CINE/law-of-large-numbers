"use client";

import { useMemo, useReducer, useState } from "react";

import { ControlPanel } from "@/components/ControlPanel";
import { ConvergenceChart } from "@/components/ConvergenceChart";
import { DeviationChart } from "@/components/DeviationChart";
import { DieChart } from "@/components/DieChart";
import { DistributionChart } from "@/components/DistributionChart";
import { StatsTable } from "@/components/StatsTable";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSimulationWorker } from "@/hooks/useSimulationWorker";
import { useTheme } from "@/hooks/useTheme";
import { getDescriptor, RNG_IDS } from "@/lib/rng";
import type { RngId } from "@/lib/rng/types";
import type { Checkpoint } from "@/lib/types";
import {
  estimateFlips,
  initialState,
  seedApplies,
  simulationReducer,
  trialsForRun,
} from "@/store/simulation-store";

export default function Page() {
  const [state, dispatch] = useReducer(simulationReducer, initialState);
  const { theme, toggle } = useTheme();
  const { run, cancel } = useSimulationWorker(state, dispatch);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { cappedFrom } = trialsForRun(state);

  const completedSeries = useMemo<Partial<Record<RngId, Checkpoint[]>>>(
    () =>
      Object.fromEntries(
        Object.entries(state.results).map(([id, result]) => [
          id,
          result?.series.points ?? [],
        ]),
      ),
    [state.results],
  );

  /**
   * Largest |p − 0.5| seen at the *end* of each run.
   *
   * Deliberately not the global maximum: at n = 1 the proportion is 0 or 1 and
   * the deviation is 0.5 by construction, so including the first checkpoints
   * would pin the zoomed axis to the full 0–1 range and defeat the point of
   * "follow the funnel". Only the tail of each series matters for how wide the
   * final window has to be.
   */
  const maxAbsDeviation = useMemo(() => {
    let worst = 0;
    const consider = (points: readonly Checkpoint[] | undefined) => {
      if (points === undefined || points.length === 0) {
        return;
      }
      const tail = points.slice(-Math.max(1, Math.ceil(points.length / 4)));
      for (const point of tail) {
        worst = Math.max(worst, Math.abs(point.heads / point.n - 0.5));
      }
    };
    for (const id of state.selectedRngIds) {
      consider(state.results[id]?.series.points);
      consider(state.partialPoints[id]);
    }
    return worst;
  }, [state.partialPoints, state.results, state.selectedRngIds]);

  const pendingIds = state.selectedRngIds.filter(
    (id) => state.results[id] === undefined,
  );

  const controlPanel = (
    <ControlPanel
      theme={theme}
      mode={state.mode}
      onMode={(mode) => dispatch({ type: "setMode", mode })}
      selectedRngIds={state.selectedRngIds}
      onToggleRng={(id) => dispatch({ type: "toggleRng", id })}
      onSelectAll={() =>
        dispatch({ type: "setRngSelection", ids: [...RNG_IDS] })
      }
      onSelectNone={() => dispatch({ type: "setRngSelection", ids: [] })}
      iterations={state.iterations}
      iterationsText={state.iterationsText}
      iterationsError={state.iterationsError}
      onIterationPreset={(value) =>
        dispatch({ type: "setIterationsPreset", value })
      }
      onIterationsText={(value) =>
        dispatch({ type: "setIterationsText", value })
      }
      onIterationsCommit={() => dispatch({ type: "commitIterations" })}
      seed={state.seed}
      seedVisible={seedApplies(state)}
      onSeed={(value) => dispatch({ type: "setSeed", value })}
      onRandomizeSeed={() => dispatch({ type: "randomizeSeed" })}
      trialsText={state.trialsText}
      trialsError={state.trialsError}
      onTrialsText={(value) => dispatch({ type: "setTrialsText", value })}
      onTrialsCommit={() => dispatch({ type: "commitTrials" })}
      bitOrder={state.bitOrder}
      onBitOrder={(value) => dispatch({ type: "setBitOrder", value })}
      status={state.status}
      progress={state.progress}
      progressLabel={state.progressLabel}
      estimatedFlips={estimateFlips(state)}
      cappedFrom={cappedFrom}
      error={state.error}
      onRun={run}
      onCancel={cancel}
      onReset={() => dispatch({ type: "reset" })}
    />
  );

  return (
    <div className="mx-auto w-full max-w-[110rem] px-4 py-6 sm:px-6 lg:py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-2xl">
            Law of Large Numbers Visualizer
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
            Flip the same coin millions of times with different random number
            generators and watch the proportion of heads crawl toward 0.5. Every
            flip runs in a web worker, so the page stays responsive.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle theme={theme} onToggle={toggle} />
          <button
            type="button"
            onClick={() => setDrawerOpen((open) => !open)}
            aria-expanded={drawerOpen}
            aria-controls="control-panel"
            className="rounded-md border border-[var(--color-line)] px-3 py-2 text-sm font-medium text-[var(--color-muted)] hover:border-[var(--color-accent)] lg:hidden"
          >
            {drawerOpen ? "Hide controls" : "Controls"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
        {/* Hidden on mobile unless the drawer toggle is open; always a sidebar
            from `lg` up. `lg:block` deliberately outranks the `hidden`. */}
        <aside
          id="control-panel"
          className={`rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4 lg:sticky lg:top-6 lg:block lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:p-5 ${
            drawerOpen ? "" : "hidden"
          }`}
        >
          {controlPanel}
        </aside>

        <main className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-3">
            <span className="text-sm font-medium text-[var(--color-muted)]">
              {state.mode === "coin"
                ? "Distribution chart shows:"
                : "Bars show results for:"}
            </span>
            {state.selectedRngIds.length === 0 ? (
              <span className="text-sm text-[var(--color-muted)]">
                nothing selected yet
              </span>
            ) : (
              state.selectedRngIds.map((id) => {
                const isFocus = id === state.focusRngId;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={isFocus}
                    onClick={() => dispatch({ type: "setFocusRng", id })}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      isFocus
                        ? "border-transparent bg-[var(--color-accent)] text-white"
                        : "border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-accent)]"
                    }`}
                  >
                    {getDescriptor(id).shortName}
                  </button>
                );
              })
            )}
          </div>

          {state.mode === "coin" ? (
            <>
              <ConvergenceChart
                theme={theme}
                series={completedSeries}
                partialSeries={state.partialPoints}
                iterations={state.iterations}
                maxAbsDeviation={maxAbsDeviation}
              />
              <DeviationChart
                theme={theme}
                series={completedSeries}
                iterations={state.iterations}
              />
              <DistributionChart
                theme={theme}
                rngId={state.focusRngId}
                histogram={state.results[state.focusRngId]?.histogram}
                iterations={state.iterations}
                trialsRequested={state.trials}
                trialsRun={trialsForRun(state).trials}
              />
              <StatsTable
                theme={theme}
                results={state.results}
                partialResults={pendingIds}
                ids={state.selectedRngIds}
                focusRngId={state.focusRngId}
                onFocusRng={(id) => dispatch({ type: "setFocusRng", id })}
                iterations={state.iterations}
              />
            </>
          ) : (
            <DieChart
              theme={theme}
              rngId={state.focusRngId}
              summary={state.results[state.focusRngId]?.die}
              iterations={state.iterations}
              trials={trialsForRun(state).trials}
            />
          )}
        </main>
      </div>
    </div>
  );
}
