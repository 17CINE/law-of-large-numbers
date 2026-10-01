# Law of Large Numbers Visualizer

Flip millions of coins with seven different random number generators and watch
the proportion of heads converge to 0.5 — or visibly fail to.

The point of this app is that **convergence is not the same as getting closer to
a nice number in absolute terms.** Two charts show the same run from opposite
sides: the convergence chart says "the gap shrinks", the deviation chart says
"the gap grows". Both are true, and seeing them together is the whole lesson.

```bash
npm install
npm run dev        # http://localhost:3000
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run check` | Typecheck, lint and tests in one go |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `npm run lint:fix` | Biome |
| `npm test` / `npm run test:watch` | Vitest |

Requires Node 20 or newer (Next 16).

## What you can do

Pick any combination of generators, choose the number of flips (up to 50 million)
and the number of independent experiments, then press **Run**. While it runs you
can watch the charts fill in live, cancel it, or switch theme. Everything is
reproducible: seedable generators take a seed and always produce the same run.

### The generators

| Generator | Seedable | Expected verdict |
| --- | --- | --- |
| `Math.random` (V8 xorshift128+) | no | Fine. Whatever your engine ships. |
| `crypto.getRandomValues` | no | Fine. A real CSPRNG. |
| Mulberry32 | yes | Fine. 32-bit, tiny, excellent quality. |
| xoshiro128\*\* | yes | Fine. Period 2¹²⁸−1, passes BigCrush. |
| PCG32 | yes | Fine. 64-bit LCG state plus XSH-RR output permutation. |
| **RANDU** | yes | Looks fine on the top bit. The damage is structural. |
| **Broken LCG** (`a=2, c=1`) | yes | Fails outright — heads forever. |

Two failure modes are worth playing with:

- **RANDU** (`x = 65539x mod 2³¹`) has a high bit that passes every marginal
  test here. Its *low* bit is always `1`, because the multiplier is odd. Switch
  the bit order to "lowest bit" and watch it collapse.
- **The broken LCG** uses a power-of-two multiplier, so it converges to a fixed
  point and emits heads forever. The proportion curve climbs to 1.0 and the
  distribution histogram degenerates into a single spike.

## The charts

**Convergence** plots `heads / n` against `n` on a log–log grid, with a shaded
±σ funnel where σ = √(n/4) and a reference line at 0.5. The vertical axis zooms
to follow the funnel, so the approach to 0.5 stays readable at 50 million flips
instead of collapsing into a flat line.

**Absolute deviation** plots `|heads − n/2|` against `n`, also log–log, next to
the two theory curves. σ = √n/2 and E|D| ≈ 0.4√n are straight lines on this grid
because √n is a power law. A generator whose line runs above them has unusually
large gaps. Exact ties are floored onto the smallest displayed tick, since zero
has no place on a log axis.

**Distribution of results** histograms the head counts from the independent
experiments and overlays the exact normal approximation
`p(k) ≈ 2 / √(2πn) · exp(−2(k − n/2)² / n)`. Bins span mean ± 4σ so the
interesting part of the distribution always fills the plot.

**Results** is one row per generator: heads, proportion, z-score, a χ²
goodness-of-fit statistic with its p-value, the longest run of identical bits,
and the runtime.

## The mathematics

For a fair coin, `heads ~ Binomial(n, ½)`, so:

- `E[heads] = n/2`
- `σ = √(n/4) = √n / 2`
- `z = (heads − n/2) / σ`
- `E|D| = σ · √(2/π) ≈ 0.4√n`, with `D = heads − n/2`
- The funnel is `0.5 ± z · √n/2`; the relative gap `√n/2` divided by `n/2` is
  `1/√n`, which is why the relative error vanishes while the absolute error grows.

The χ² test compares observed heads per decile of the run against the expected
`n/20` per decile with 9 degrees of freedom:

```
χ² = Σ (observed_d − expected)² / expected        over d = 1…10
p  = P(χ²₉ > χ²)
```

The p-value answers "would a fair coin produce this uneven a spread?" It is a
marginal test only: it cannot see correlation, which is exactly why RANDU's top
bit sails through it while the longest-run column still looks off.

The distribution overlay uses the normal approximation to the binomial pmf, which
is appropriate because the bins span mean ± 4σ.

## Architecture

```
src/
  app/
    page.tsx            state → props, the only place charts are composed
    layout.tsx          metadata and the pre-paint theme script
    globals.css         theme variables, Tailwind entry
    icon.svg            app icon
  components/           presentational, no store access
    ConvergenceChart    ComposedChart: funnel Area + ½ line + RNG lines
    DeviationChart      log–log |heads − n/2| with theory curves
    DistributionChart   histogram + normal overlay
    ControlPanel        inputs, presets, run/cancel, progress bar
    StatsTable          per-generator numbers
    ChartFrame          title, chips, empty state, explanation
    charts/palette.ts   per-theme chart colours
  store/
    simulation-store.ts reducer, validation, derived helpers
  hooks/
    useSimulationWorker.ts owns the worker for the page's lifetime
    useTheme.ts         localStorage-backed light/dark
  workers/
    simulate.worker.ts  every coin flip happens here
  lib/
    rng/                seven generators + registry
    stats.ts            erf/erfc, gamma, χ², z, normal binomial pmf
    checkpoints.ts      log-spaced checkpoints, flip budget
    downsample.ts       log downsampling and axis ticks
    format.ts           display formatting
```

### Threading and cancellation

The worker is created once per page and reused for every run: creating one per
run would mean re-downloading the worker chunk and losing the JIT's warm-up,
which is exactly what the runtime column measures.

Every flip happens in the worker. A run keeps one integer head counter, ten
decile counters and at most 24 checkpoint snapshots — no flip is ever stored, so
memory is O(1) in the number of flips.

A dedicated worker runs single-threaded, so a tight synchronous loop is deaf to
`message` events: a `cancel` posted mid-run would not be delivered until the run
finished. The loops therefore yield to the event loop with a `MessageChannel`
callback every 65 536 flips (a plain macrotask, unlike `setTimeout`, which is
clamped to ≥4 ms and would add hundreds of milliseconds of dead time per run).
Progress is quantised to ~100 messages per main experiment and partial chart
snapshots to ~8, so the message channel never becomes the bottleneck.

Cancellation is reported back as a normal outcome: the store returns to `idle`
with the label "Cancelled" and keeps whatever checkpoints were already streamed,
rather than raising an error and discarding the work.

### Checkpoints and the flip budget

Checkpoints are log-spaced: 1, 2, 5, 10, 20, 50, … capped at the flip count, so
the charts show the first few flips and the last few with equal resolution
instead of a straight line — 16 points for 100 000 flips, 24 at the 50 million
ceiling. At most 1000 points are ever handed to a chart; `downsampleLog` reduces
a longer series by picking points evenly in log space.

`FLIP_BUDGET_PER_ALGORITHM` caps the total work at 100 million flips per
generator. At 50 million flips that leaves room for 2 experiments; at 100 000
flips the 200 default is untouched. If the requested experiment count would
exceed the budget it is reduced and the downgrade is logged — silently running
fewer experiments than the control says would make the histogram disagree with
the UI.

### Recharts 3 notes

Two library behaviours shaped the chart code and are worth knowing before
editing it:

- A logarithmic `YAxis` with `domain={["auto", "auto"]}` can render no ticks and
  no curves at all. Both log axes here use explicit positive numeric domains
  with an explicit `ticks` array.
- An `Area` inside a `LineChart` does not render; the convergence chart uses a
  `ComposedChart`.

## Tests

89 tests across six files, all pure logic — no DOM or worker harness:

- `lib/stats.test.ts` — special functions, χ², z, normal binomial pmf against
  closed forms and Monte Carlo
- `lib/rng/rng.test.ts` — uniformity, bit balance, cross-generator agreement
- `lib/rng/reference.test.ts` — each generator against published reference vectors
- `lib/checkpoints.test.ts` — log spacing, limits, budget arithmetic
- `lib/downsample.test.ts` — endpoints preserved, strict monotonicity, bounds
- `store/simulation-store.test.ts` — validation, run lifecycle, stale-message
  rejection, cancellation