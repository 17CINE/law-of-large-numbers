import type { ReactNode } from "react";

/**
 * Card wrapper shared by every chart: title, optional subtitle, the chart
 * itself, and the plain-English "What am I looking at?" explanation.
 */
export function ChartFrame({
  title,
  subtitle,
  explanation,
  actions,
  isEmpty,
  emptyMessage,
  children,
}: {
  title: string;
  subtitle?: string;
  explanation: ReactNode;
  actions?: ReactNode;
  isEmpty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4 sm:p-5">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-ink)] sm:text-lg">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 text-sm text-[var(--color-muted)]">
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </header>

      {isEmpty ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-[var(--color-line)] text-sm text-[var(--color-muted)]">
          {emptyMessage ?? "Press Run to generate data."}
        </div>
      ) : (
        <div className="h-72 w-full sm:h-80">{children}</div>
      )}

      <details className="group mt-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2">
        <summary className="cursor-pointer list-none text-sm font-medium text-[var(--color-muted)] select-none group-open:text-[var(--color-ink)]">
          <span
            aria-hidden="true"
            className="mr-1 inline-block transition-transform group-open:rotate-90"
          >
            ▶
          </span>
          What am I looking at?
        </summary>
        <div className="mt-2 space-y-2 text-sm leading-relaxed text-[var(--color-muted)]">
          {explanation}
        </div>
      </details>
    </section>
  );
}

/** Small toggle used for chart options (zoom mode, reference lines, …). */
export function ChipToggle({
  checked,
  onChange,
  children,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: ReactNode;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        checked
          ? "border-transparent bg-[var(--color-accent)] text-white"
          : "border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-accent)]"
      }`}
    >
      {children}
    </button>
  );
}
