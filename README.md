# Inward Mathematics™ Interactive Lab

A dependency-free browser demonstration of two **toy models**: a damped attractor and a five-observer comparison. The equations, target values, controls, and export are visible in `index.html`. This is exploratory visualization, not a validated theory of memory, identity, consciousness, safety, or physical dynamics.

**[Open the live interactive lab](https://aruintelligence.github.io/inward-mathematics-simulator/)** · [Read the source](index.html)

**[Share the five-minute mean vs median lesson](https://aruintelligence.github.io/inward-mathematics-simulator/guide.html)** — two opposing worked examples, revealable answers, a short activity, and links into the lab. It is a static page that can be shared without an account.

**[Print the three-case worksheet](https://aruintelligence.github.io/inward-mathematics-simulator/worksheet.html)** — a student sheet with predictions and calculation space, plus a worked teacher answer key on a separate printed page. [Download the two-page PDF](https://aruintelligence.github.io/inward-mathematics-simulator/output/pdf/mean-vs-median-worksheet.pdf) for predictable Letter-size printing. Cases A, B, and C yield median, mean, and equal-error outcomes. On screen, each case opens an exact blind challenge that keeps its answer hidden until the student chooses. The exercises use invented values and stated targets; the targets are not independently verified. Print page 1 for students and page 2 for the answer key. Regenerate the PDF with `python tools/render_worksheet_pdf.py` (requires ReportLab and DejaVu Sans).

**[Send a prediction challenge](https://aruintelligence.github.io/inward-mathematics-simulator/challenge.html)** — a blind mean-versus-median question with five seeded readings and a known target. A visitor chooses before seeing the exact answer, then opens the same case in the full lab. From the lab, **Challenge someone with this case** carries the selected seed and fifth reading into a shareable URL. The URL contains generated inputs only; it does not include a guess, score, custom workbench data, or spring history. **Try another challenge** chooses from a balanced set of invented examples. The static [challenge preview](challenge-card.png) deliberately does not reveal an answer.

**Invite someone to predict** opens the device share sheet when available, or copies a short invitation and exact challenge link for pasting into a message. The invitation works before or after your own answer and never includes your guess or the revealed result. Reader-supplied challenge links include all five values and the stated target; a nearby warning reminds you to share only invented or public data. The compact iframe keeps the invitation out of its fixed-height view.

**Create a challenge from five readings.** In the workbench, analyze exactly five values with a known target, then use **Turn these values into a prediction challenge**. Or expand **Create a challenge with your own numbers** on the challenge page. Values and target must be from 0 to 100 with at most four decimal places. The new challenge hides the answer until a prediction, can be embedded, and links back to the same values in the workbench. [Try a mean-wins example](https://aruintelligence.github.io/inward-mathematics-simulator/challenge.html?values=40%2C42%2C50%2C60%2C68&target=52). These reader-supplied values are separate from the seeded atlas. The target comes from the link author and is not verified. The URL includes all five values and the target; it can appear in browser history, hosting logs, and referrers. Use invented or public data, never sensitive values. No guess is encoded in the URL.

**Explore after predicting.** The full challenge reveals a counterfactual sweep after an answer. Move the fifth reading through 101 whole-number positions while the first four readings and stated target stay fixed. A color map and counts show where the mean, median, or neither has smaller absolute error; the numeric readout shows the selected position. The original prediction and receipt stay in place. **Open this selection as a new blind challenge** shares the exact generated seed and fifth reading, or the four supplied values, selected fifth reading, and target. If the original fifth reading is fractional, the explorer starts at its nearest whole number and states both readings. The 101 positions are a grid, not an estimated probability. The compact iframe retains its fixed-height prediction view and links to the full challenge for this exploration.

**Keep the result as a picture.** After answering on the full challenge page, expand **Keep a picture of your result** to preview and download a 1200 × 630 PNG. It records the original choice, five readings, stated target, closer estimate, and both absolute errors; moving the counterfactual slider does not alter it. The browser draws the image locally and downloads it on request. Reader-supplied cards say that their values and target have not been independently verified. The PNG exposes the answer and all five readings, so share only invented or public data. The compact iframe links to the full challenge for this feature.

**Embed a case in an article or course page.** Open a generated or reader-supplied challenge, expand **Put this challenge on your own page**, and copy the iframe code for that exact case. The compact widget asks for a prediction before revealing the result, includes the toy-model caveat, and links back to the full challenge and lab. The [five-minute lesson](guide.html#teach) contains a live sample. The widget has no account, tracking, or backend; answers are not collected. The publisher's own platform may still have its own analytics and iframe restrictions. The snippet uses `loading="lazy"` and an 800-pixel height; preview it on the target platform before publishing. The ordinary share link does not include the `embed=1` display flag.

**[Explore the outcome atlas](https://aruintelligence.github.io/inward-mathematics-simulator/atlas.html)** — a clickable map of 128 consecutive generated seeds × 101 whole-number fifth readings (12,928 deterministic cases). Gold and mint distinguish which estimator has lower absolute error against the stated target of 50; brightness shows the size of that error difference, capped at four units. Select a cell by pointer or use labeled seed-row and fifth-reading controls. The side panel exposes all five readings, both estimates and errors, column-level win counts and average errors. Buttons find a mean win or median win in the selected column; the exact cell opens in the lab or the blind challenge. Share links encode the cohort start seed, selected row, and fifth reading, all validated on load. The atlas is a teaching grid, **not** evidence about real observer populations or a probability of either estimator winning. On a narrow screen, the map scrolls horizontally while the numeric controls remain available.

![One number changes the answer: mean and median error curves across 128 generated seeds, with the seed-42 cohort result at fifth estimate 50.](social-card.png)

## Open it

Open the live lab above, or download the repository and open `index.html` in a modern browser. No build, network connection, or server is required for the downloaded version. For a quick comparison, leave seed at 42 and move the fifth observer to 50; the single-seed and 128-seed results differ in useful ways. To run the model tests, use Node.js 22 or later:

```bash
node tests/lab.test.cjs
```

The first screen offers three guided cases: an extreme fifth estimate at 85, a counterexample where the mean has lower error at 40, and a cohort reversal at 50. Choosing one sets seed 42 and moves to the relevant chart. **Copy this exact case** creates a link with validated `seed` and `fifth` parameters; opening that link restores the same witness setup. The link does not encode the spring's step history or shocks. The live reading and guided outcome update as you change the slider. The page contains a descriptive title, summary, and canonical URL for the published lab; the local file works without a network connection.

The first-screen instrument now has its own fifth-reading slider. Moving it updates the error numbers, the closer estimate, the charts, and the lower lab slider together. **See a mean/median win** jumps to an opposing result for the current seed when one exists; the link beside it opens the selected case as a blind challenge. Guided cases, reset, and shared URLs also update this control. The result is for these five generated values against the stated target of 50, not a general claim about the estimators.

On narrow layouts, the instrument follows the headline before the longer introduction and route links, so the first interaction appears sooner in reading and keyboard order. Its range control has a taller touch area, and its flip and challenge actions have at least 44-pixel-high targets; at phone widths those actions stack across the card. The desktop and mobile layouts use the same calculations and controls.

The checked-in [social preview](social-card.png) is generated from the same seed-42 cohort equations with `python tools/render_social_card.py` (Pillow required only to regenerate the image). Its chart is illustrative of this specific toy cohort; it does not report a population result.

## Bring your own numbers

The local workbench accepts 3–40 finite observations between −1,000,000 and 1,000,000, separated by commas, semicolons, or whitespace. An optional **known target** lets you compare absolute errors; without one, the workbench shows both estimates without declaring either more accurate. It plots the original observations, mean, median, and supplied target. It then removes the original observation farthest from the original median and recomputes both estimators. This leave-one-out comparison shows sensitivity; it does not establish that the removed point is invalid. An even-length dataset uses the average of its two middle sorted values. Ties for the farthest observation use the first entered value.

Use the invented outlier and mean-wins examples to learn the controls, or paste your own numbers. **Save this analysis as JSON** downloads the inputs, optional target, exact computed values, errors, and leave-one-out result. Analysis runs in the browser, with no application backend or analytics. The workbench does not transmit values while you edit or analyze them. If you deliberately open a challenge link, its five values and target are placed in the URL and sent in the page request. Other workbench inputs are not put into links. Display labels round to four decimal places; the saved JSON retains JavaScript's numeric values. Avoid interpreting a supplied target as independently verified ground truth.

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
