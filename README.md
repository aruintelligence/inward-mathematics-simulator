# Inward Mathematics™ Interactive Lab

A dependency-free browser demonstration of two **toy models**: a damped attractor and a five-observer comparison. The equations, target values, controls, and export are visible in `index.html`. This is exploratory visualization, not a validated theory of memory, identity, consciousness, safety, or physical dynamics.

**[Open the live interactive lab](https://aruintelligence.github.io/inward-mathematics-simulator/)** · [Read the source](index.html)

![One number changes the answer: mean and median error curves across 128 generated seeds, with the seed-42 cohort result at fifth estimate 50.](social-card.png)

## Open it

Open the live lab above, or download the repository and open `index.html` in a modern browser. No build, network connection, or server is required for the downloaded version. For a quick comparison, leave seed at 42 and move the fifth observer to 50; the single-seed and 128-seed results differ in useful ways. To run the model tests, use Node.js 22 or later:

```bash
node tests/lab.test.cjs
```

The first screen offers three guided cases: an extreme fifth estimate at 85, a counterexample where the mean has lower error at 40, and a cohort reversal at 50. Choosing one sets seed 42 and moves to the relevant chart. **Copy this exact case** creates a link with validated `seed` and `fifth` parameters; opening that link restores the same witness setup. The link does not encode the spring's step history or shocks. The live reading and guided outcome update as you change the slider. The page contains a descriptive title, summary, and canonical URL for the published lab; the local file works without a network connection.

The checked-in [social preview](social-card.png) is generated from the same seed-42 cohort equations with `python tools/render_social_card.py` (Pillow required only to regenerate the image). Its chart is illustrative of this specific toy cohort; it does not report a population result.

## Bring your own numbers

The local workbench accepts 3–40 finite observations between −1,000,000 and 1,000,000, separated by commas, semicolons, or whitespace. An optional **known target** lets you compare absolute errors; without one, the workbench shows both estimates without declaring either more accurate. It plots the original observations, mean, median, and supplied target. It then removes the original observation farthest from the original median and recomputes both estimators. This leave-one-out comparison shows sensitivity; it does not establish that the removed point is invalid. An even-length dataset uses the average of its two middle sorted values. Ties for the farthest observation use the first entered value.

Use the invented outlier and mean-wins examples to learn the controls, or paste your own numbers. **Save this analysis as JSON** downloads the inputs, optional target, exact computed values, errors, and leave-one-out result. The data stays in the browser: the page has no backend, network request, or analytics. Custom inputs are not put into share links and are separate from the generated seed experiment and its export. Display labels round to four decimal places; the saved JSON retains JavaScript's numeric values. Avoid interpreting a supplied target as independently verified ground truth.

## Experiment 1: Remembrance Calculus™

The yellow point moves toward a fixed green target. Each discrete step applies:

```text
velocity = 0.92 × (velocity + 0.008 × α × (target − position))
position = position + velocity
coherence proxy = exp(−distance to target / 120)
```

Set **pull strength α** between 0.5 and 3.0. **Step once** advances exactly one update; **Run** advances at a fixed 60 updates per simulated second. **Add shock** applies an impulse whose magnitude and direction come from an isolated seeded pseudorandom stream. The seed also generates the four fixed observer values in the second experiment. Resetting the seed and replaying shocks at the same step reproduces the same numeric trajectory. “Settled” means distance under 4 and speed under 0.5 for 45 consecutive steps; it is a display rule, not a proof of convergence under every possible input.

## Experiment 2: Witness Geometry™

Four seeded observers estimate a known target of 50; a fifth estimate is adjustable from 0 to 100. The graph and telemetry show the ordinary arithmetic mean, median, and each one's absolute error against the known target. With seed 42 and the fifth observer at 85, the mean is about **55.38** (error **5.38**) and the median about **50.12** (error **0.12**).

The sensitivity sweep holds the four seeded values fixed and computes both absolute errors for every whole-number fifth estimate from 0 through 100. The curves, current-position marker, sample table, lower-error counts, and maximum errors make the comparison inspectable beyond one selected example. With seed 42, the median has lower error at **84** grid positions and the mean at **17**; there are no ties. For example, the mean wins at 40 while the median wins at 0 and 100. These counts describe an evenly spaced grid, **not** the chance of either estimator winning on real data. Change the seed and reset to generate four new fixed values. The fifth estimate is a numeric perturbation; it does not imply dishonesty or establish a generally superior rule.

The cohort view repeats that grid for **128 consecutive generated seeds**, starting at the selected seed and wrapping modulo 2³². Each seed generates four values with four successive draws from the same seeded linear congruential generator; the fifth estimate is shared across seeds. Its curves show average absolute error across those 128 cases. The table also shows how many individual seeds yield lower median error at each sampled fifth estimate. With start seed 42 and fifth estimate 50, the mean has lower **average** absolute error (about **1.43** versus **1.56**) even though the median has lower error in **75** of 128 seeds. Frequency of winning and size of errors can disagree. At fifth estimate 85, the median has lower error in **126** of 128 seeds. The cohort is deterministic generated data; consecutive PRNG seeds are not an independent sample of real observers, and these numbers are not population estimates.

## Reproduce and inspect

Start paused, set a seed, then use manual steps or Run. **Export run JSON** downloads the current seed, model constants, inputs, exact position and velocity, recorded shock impulses and steps, parameter changes, five observer values, and both errors. The `inward-math-toy-v3` JSON includes the 101-point sweep and the cohort protocol, 128 generated seed/observer records, 101 aggregate points, and per-position winner counts. No input is sent to a server. Identical seed, parameter changes, shock timing, and step count yield identical numeric results. The page respects the browser's reduced-motion preference by starting paused for everyone and allowing manual stepping.

The original page only drew an unseeded spring animation even though its README described a second panel and telemetry. The current lab implements both panels and makes the claims and formulas inspectable.

Created by Daniel Jacob Read IV / ĀRU Intelligence Inc. with Shane Travis Horman. Development assistance included Grok (xAI). Released under the [MIT License](LICENSE); see [CITATION.cff](CITATION.cff).
