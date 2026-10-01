import type { RngId } from "@/lib/rng/types";

/**
 * One stable colour per generator, in both themes. Hues are spread far enough
 * apart to stay distinguishable for the most common colour-vision deficiencies,
 * and the dark variants are lightened because the dark background is the harder
 * case for thin 2px strokes.
 */
interface Palette {
  light: Record<RngId, string>;
  dark: Record<RngId, string>;
}

export const PALETTE: Palette = {
  light: {
    "math-random": "#2563eb",
    "crypto-random": "#059669",
    mulberry32: "#c2410c",
    xoshiro128: "#7c3aed",
    pcg32: "#0891b2",
    randu: "#dc2626",
    "lcg-broken": "#a16207",
  },
  dark: {
    "math-random": "#60a5fa",
    "crypto-random": "#34d399",
    mulberry32: "#fb923c",
    xoshiro128: "#c084fc",
    pcg32: "#22d3ee",
    randu: "#f87171",
    "lcg-broken": "#fbbf24",
  },
};

export type Theme = keyof Palette;

export function colorFor(id: RngId, theme: Theme): string {
  return PALETTE[theme][id];
}

/** Chart chrome colours, resolved from the CSS custom properties per theme. */
export interface ChartTheme {
  grid: string;
  axis: string;
  text: string;
  reference: string;
  envelope: string;
  background: string;
}

export const CHART_THEME: Record<Theme, ChartTheme> = {
  light: {
    grid: "#e2e8f0",
    axis: "#94a3b8",
    text: "#475569",
    reference: "#64748b",
    envelope: "rgba(100, 116, 139, 0.13)",
    background: "#ffffff",
  },
  dark: {
    grid: "#2b3040",
    axis: "#64748b",
    text: "#94a3b8",
    reference: "#8b95a8",
    envelope: "rgba(148, 163, 184, 0.16)",
    background: "#0f1118",
  },
};
