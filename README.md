# Inward Mathematics™ Interactive Lab

A dependency-free browser demonstration of two **toy models**: a damped attractor and a five-observer comparison. The equations, target values, controls, and export are visible in `index.html`. This is exploratory visualization, not a validated theory of memory, identity, consciousness, safety, or physical dynamics.

## Open it

Download the repository and open `index.html` in a modern browser. No build, network connection, or server is required. To run the model tests, use Node.js 22 or later:

```bash
node tests/lab.test.cjs
```

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

## Reproduce and inspect

Start paused, set a seed, then use manual steps or Run. **Export run JSON** downloads the current seed, model constants, inputs, exact position and velocity, recorded shock impulses and steps, parameter changes, five observer values, and both errors. The `inward-math-toy-v2` JSON also includes the sweep grid definition, 101 exact point estimates and errors, counts, and worst errors. No input is sent to a server. Identical seed, parameter changes, shock timing, and step count yield identical numeric results. The page respects the browser's reduced-motion preference by starting paused for everyone and allowing manual stepping.

The original page only drew an unseeded spring animation even though its README described a second panel and telemetry. This revision implements both panels and makes the claims and formulas inspectable.

Created by Daniel Jacob Read IV / ĀRU Intelligence Inc. with Shane Travis Horman. Development assistance included Grok (xAI). Released under the [MIT License](LICENSE); see [CITATION.cff](CITATION.cff).
