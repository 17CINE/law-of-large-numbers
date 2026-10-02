"use client";

import { useId } from "react";

import { colorFor, type Theme } from "@/components/charts/palette";
import {
  ITERATION_PRESETS,
  MAX_FLIPS,
  MAX_TRIALS,
  MIN_FLIPS,
} from "@/lib/checkpoints";
import { formatCompact, formatInteger } from "@/lib/format";
import { RNG_DESCRIPTORS } from "@/lib/rng";
import type { BitOrder, RngId } from "@/lib/rng/types";
import type { SimulationMode } from "@/lib/types";
import type { RunStatus } from "@/store/simulation-store";

export function ControlPanel({
  theme,
  mode,
  onMode,
  selectedRngIds,
  onToggleRng,
  onSelectAll,
  onSelectNone,
  iterations,
  iterationsText,
  iterationsError,
  onIterationPreset,
  onIterationsText,
  onIterationsCommit,
  seed,
  seedVisible,
  onSeed,
  onRandomizeSeed,
  trialsText,
  trialsError,
  onTrialsText,
  onTrialsCommit,
  bitOrder,
  onBitOrder,
  status,
  progress,
  progressLabel,
  estimatedFlips,
  cappedFrom,
  error,
  onRun,
  onCancel,
  onReset,
}: {
  theme: Theme;
  mode: SimulationMode;
  onMode: (mode: SimulationMode) => void;
  selectedRngIds: RngId[];
  onToggleRng: (id: RngId) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  iterations: number;
  iterationsText: string;
  iterationsError: string | null;
  onIterationPreset: (value: number) => void;
  onIterationsText: (value: string) => void;
  onIterationsCommit: () => void;
  seed: number;
  seedVisible: boolean;
  onSeed: (value: number) => void;
  onRandomizeSeed: () => void;
  trialsText: string;
  trialsError: string | null;
  onTrialsText: (value: string) => void;
  onTrialsCommit: () => void;
  bitOrder: BitOrder;
  onBitOrder: (value: BitOrder) => void;
  status: RunStatus;
  progress: number;
  progressLabel: string;
  estimatedFlips: number;
  cappedFrom: number | null;
  error: string | null;
  onRun: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  const iterationsId = useId();
  const seedId = useId();
  const trialsId = useId();
  const busy = status === "running";
  const unit = mode === "coin" ? "flips" : "rolls";

  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="text-sm font-semibold text-[var(--color-ink)]">
          Experiment
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {(["coin", "die"] as const).map((value) => (
            <label key={value} className="block">
              <input
                type="radio"
                name="experiment-mode"
                checked={mode === value}
                onChange={() => onMode(value)}
                className="peer sr-only"
              />
              <span className="block cursor-pointer rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-center text-xs font-medium text-[var(--color-muted)] peer-checked:border-transparent peer-checked:bg-[var(--color-accent)] peer-checked:text-white">
                {value === "coin" ? "Fair coin" : "Fair die"}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          {mode === "coin"
            ? "Track heads toward one half."
            : "Track six faces toward one sixth."}
        </p>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-[var(--color-ink)]">
          Generators
        </legend>
        <div className="mt-2 flex gap-2 text-xs">
          <button
            type="button"
            onClick={onSelectAll}
            className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[var(--color-muted)]"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={onSelectNone}
            className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[var(--color-muted)]"
          >
            Clear
          </button>
        </div>
        <ul className="mt-2 space-y-1.5">
          {RNG_DESCRIPTORS.map((descriptor) => {
            const checked = selectedRngIds.includes(descriptor.id);
            return (
              <li key={descriptor.id}>
                <label
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 ${checked ? "border-[var(--color-accent)] bg-[var(--color-surface)]" : "border-[var(--color-line)]"}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleRng(descriptor.id)}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
                  />
                  <span
                    aria-hidden="true"
                    className="mt-1 size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: colorFor(descriptor.id, theme) }}
                  />
                  <span className="min-w-0">
                    <span className="text-sm font-medium text-[var(--color-ink)]">
                      {descriptor.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                      {descriptor.description}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-[var(--color-ink)]">
          {unit} per run
        </legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ITERATION_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={iterations === preset}
              onClick={() => onIterationPreset(preset)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium ${iterations === preset ? "border-transparent bg-[var(--color-accent)] text-white" : "border-[var(--color-line)] text-[var(--color-muted)]"}`}
            >
              {formatCompact(preset)}
            </button>
          ))}
        </div>
        <label
          htmlFor={iterationsId}
          className="mt-3 block text-xs text-[var(--color-muted)]"
        >
          Custom value ({formatInteger(MIN_FLIPS)}–{formatInteger(MAX_FLIPS)}{" "}
          {unit})
        </label>
        <input
          id={iterationsId}
          type="text"
          inputMode="numeric"
          value={iterationsText}
          onChange={(event) => onIterationsText(event.target.value)}
          onBlur={onIterationsCommit}
          onKeyDown={(event) => event.key === "Enter" && onIterationsCommit()}
          aria-invalid={iterationsError !== null}
          className="mt-1 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm"
        />
        {iterationsError ? (
          <p role="alert" className="mt-1 text-xs text-red-500">
            {iterationsError}
          </p>
        ) : null}
      </fieldset>

      {seedVisible ? (
        <fieldset>
          <legend className="text-sm font-semibold text-[var(--color-ink)]">
            Seed
          </legend>
          <div className="mt-2 flex gap-2">
            <input
              id={seedId}
              type="number"
              value={seed}
              min={0}
              max={0xffff_ffff}
              step={1}
              onChange={(event) => onSeed(Number(event.target.value))}
              className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={onRandomizeSeed}
              className="rounded-md border border-[var(--color-line)] px-2.5 text-xs"
            >
              Randomize
            </button>
          </div>
        </fieldset>
      ) : null}

      <fieldset>
        <legend className="text-sm font-semibold text-[var(--color-ink)]">
          Independent runs
        </legend>
        <label
          htmlFor={trialsId}
          className="mt-2 block text-xs text-[var(--color-muted)]"
        >
          {formatCompact(iterations)} {unit} each (1–{formatInteger(MAX_TRIALS)}
          )
        </label>
        <input
          id={trialsId}
          type="text"
          inputMode="numeric"
          value={trialsText}
          onChange={(event) => onTrialsText(event.target.value)}
          onBlur={onTrialsCommit}
          onKeyDown={(event) => event.key === "Enter" && onTrialsCommit()}
          aria-invalid={trialsError !== null}
          className="mt-1 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm"
        />
        {trialsError ? (
          <p role="alert" className="mt-1 text-xs text-red-500">
            {trialsError}
          </p>
        ) : null}
        {cappedFrom !== null ? (
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            {formatInteger(cappedFrom)} runs were capped by the flip budget.
          </p>
        ) : null}
      </fieldset>

      {mode === "coin" ? (
        <fieldset>
          <legend className="text-sm font-semibold text-[var(--color-ink)]">
            Which bit is the coin?
          </legend>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {(["high", "low"] as const).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="bit-order"
                  value={value}
                  checked={bitOrder === value}
                  onChange={() => onBitOrder(value)}
                  className="peer sr-only"
                />
                <span className="block rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-center text-xs capitalize text-[var(--color-muted)] peer-checked:bg-[var(--color-accent)] peer-checked:text-white">
                  {value} bit
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-[var(--color-line)] pt-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRun}
            disabled={busy || selectedRngIds.length === 0}
            className="flex-1 rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {status === "done" ? "Run again" : "Run"}
          </button>
          <button
            type="button"
            onClick={busy ? onCancel : onReset}
            className="rounded-md border border-[var(--color-line)] px-3 py-2 text-sm"
          >
            {busy ? "Cancel" : "Reset"}
          </button>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          aria-label="Simulation progress"
          className="h-2 overflow-hidden rounded-full bg-[var(--color-line)]"
        >
          <div
            className="h-full bg-[var(--color-accent)]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <p className="text-xs text-[var(--color-muted)]" aria-live="polite">
          {progressLabel} ({Math.round(progress * 100)}% ·{" "}
          {formatCompact(estimatedFlips)} {unit} queued)
        </p>
        {error ? (
          <p role="alert" className="text-xs text-red-500">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
