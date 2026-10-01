"use client";

import { useId } from "react";

import { colorFor, type Theme } from "@/components/charts/palette";
import {
  FLIP_BUDGET_PER_ALGORITHM,
  ITERATION_PRESETS,
  MAX_FLIPS,
  MAX_TRIALS,
  MIN_FLIPS,
  MIN_TRIALS,
} from "@/lib/checkpoints";
import { formatCompact, formatInteger } from "@/lib/format";
import { RNG_DESCRIPTORS } from "@/lib/rng";
import type { BitOrder, RngId } from "@/lib/rng/types";
import type { RunStatus } from "@/store/simulation-store";

export function ControlPanel({
  theme,
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

  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="text-sm font-semibold text-[var(--color-ink)]">
          Generators
          <span className="ml-2 font-normal text-[var(--color-muted)]">
            pick several to overlay
          </span>
        </legend>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={onSelectAll}
            className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[var(--color-muted)] hover:border-[var(--color-accent)]"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={onSelectNone}
            className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[var(--color-muted)] hover:border-[var(--color-accent)]"
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
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors ${
                    checked
                      ? "border-[var(--color-accent)] bg-[var(--color-surface)]"
                      : "border-[var(--color-line)] hover:border-[var(--color-accent)]/60"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleRng(descriptor.id)}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
                  />
                  <span
                    aria-hidden="true"
                    className="mt-1 inline-block size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: colorFor(descriptor.id, theme) }}
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-[var(--color-ink)]">
                      {descriptor.name}
                      {descriptor.weak ? (
                        <span className="rounded bg-[var(--color-accent)]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">
                          weak
                        </span>
                      ) : null}
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
          Flips per run
        </legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ITERATION_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={iterations === preset}
              onClick={() => onIterationPreset(preset)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors ${
                iterations === preset
                  ? "border-transparent bg-[var(--color-accent)] text-white"
                  : "border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-accent)]"
              }`}
            >
              {formatCompact(preset)}
            </button>
          ))}
        </div>
        <label
          htmlFor={iterationsId}
          className="mt-3 block text-xs text-[var(--color-muted)]"
        >
          Custom value ({formatInteger(MIN_FLIPS)}–{formatInteger(MAX_FLIPS)})
        </label>
        <input
          id={iterationsId}
          type="text"
          inputMode="numeric"
          value={iterationsText}
          onChange={(event) => onIterationsText(event.target.value)}
          onBlur={onIterationsCommit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onIterationsCommit();
            }
          }}
          aria-invalid={iterationsError !== null}
          aria-describedby={
            iterationsError ? `${iterationsId}-error` : undefined
          }
          className="mt-1 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-[var(--color-accent)]"
        />
        {iterationsError ? (
          <p
            id={`${iterationsId}-error`}
            role="alert"
            className="mt-1 text-xs text-red-500"
          >
            {iterationsError}
          </p>
        ) : null}
      </fieldset>

      {seedVisible ? (
        <fieldset>
          <legend className="text-sm font-semibold text-[var(--color-ink)]">
            Seed
          </legend>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Only the seedable generators use this. Same seed, same run — every
            time.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              id={seedId}
              type="number"
              value={seed}
              min={0}
              max={0xffff_ffff}
              step={1}
              onChange={(event) => onSeed(Number(event.target.value))}
              aria-label="Random seed for the seedable generators"
              className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-[var(--color-accent)]"
            />
            <button
              type="button"
              onClick={onRandomizeSeed}
              className="shrink-0 rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-muted)] hover:border-[var(--color-accent)]"
            >
              Randomize
            </button>
          </div>
        </fieldset>
      ) : null}

      <fieldset>
        <legend className="text-sm font-semibold text-[var(--color-ink)]">
          Trials for the histogram
        </legend>
        <label
          htmlFor={trialsId}
          className="mt-2 block text-xs text-[var(--color-muted)]"
        >
          Independent runs of {formatCompact(iterations)} flips each (1–
          {formatInteger(MAX_TRIALS)})
        </label>
        <input
          id={trialsId}
          type="text"
          inputMode="numeric"
          value={trialsText}
          onChange={(event) => onTrialsText(event.target.value)}
          onBlur={onTrialsCommit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onTrialsCommit();
            }
          }}
          aria-invalid={trialsError !== null}
          aria-describedby={trialsError ? `${trialsId}-error` : undefined}
          className="mt-1 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-[var(--color-accent)]"
        />
        {trialsError ? (
          <p
            id={`${trialsId}-error`}
            role="alert"
            className="mt-1 text-xs text-red-500"
          >
            {trialsError}
          </p>
        ) : null}
        {cappedFrom !== null ? (
          <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-[var(--color-muted)]">
            {formatInteger(cappedFrom)} trials would need{" "}
            {formatCompact(cappedFrom * iterations)} flips per generator, over
            the {formatCompact(FLIP_BUDGET_PER_ALGORITHM)} budget. Running{" "}
            {formatInteger(
              Math.max(
                MIN_TRIALS,
                Math.floor(FLIP_BUDGET_PER_ALGORITHM / iterations),
              ),
            )}{" "}
            instead.
          </p>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-[var(--color-ink)]">
          Which bit is the coin?
        </legend>
        {/* Real radio inputs, visually replaced by labels: keeps arrow-key
            navigation, the radiogroup semantics and the focus ring that a
            hand-rolled role="radio" button would have to reimplement. */}
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {(
            [
              ["high", "High bit"],
              ["low", "Low bit"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="block">
              <input
                type="radio"
                name="bit-order"
                value={value}
                checked={bitOrder === value}
                onChange={() => onBitOrder(value)}
                className="peer sr-only"
              />
              <span className="block cursor-pointer rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-center text-xs font-medium text-[var(--color-muted)] transition-colors hover:border-[var(--color-accent)] peer-checked:border-transparent peer-checked:bg-[var(--color-accent)] peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--color-accent)]">
                {label}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          {bitOrder === "high"
            ? "The most significant bit — the fairest bit a generator has. Default, and the setting that gives weak generators every chance."
            : "The least significant bit. Weak LCGs die here: RANDU's lowest bit is always 1, because its multiplier is odd."}
        </p>
      </fieldset>

      <div className="flex flex-col gap-2 border-t border-[var(--color-line)] pt-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRun}
            disabled={busy || selectedRngIds.length === 0}
            className="flex-1 rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === "done" ? "Run again" : "Run"}
          </button>
          <button
            type="button"
            onClick={busy ? onCancel : onReset}
            className="rounded-md border border-[var(--color-line)] px-3 py-2 text-sm font-medium text-[var(--color-muted)] hover:border-[var(--color-accent)]"
          >
            {busy ? "Cancel" : "Reset"}
          </button>
        </div>

        <div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-valuetext={progressLabel}
            aria-label="Simulation progress"
            className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-line)]"
          >
            <div
              className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-150"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p
            className="mt-1.5 text-xs text-[var(--color-muted)]"
            aria-live="polite"
          >
            {progressLabel}
            <span className="ml-1.5 tabular-nums">
              ({Math.round(progress * 100)}% · {formatCompact(estimatedFlips)}{" "}
              flips queued)
            </span>
          </p>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-500"
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
