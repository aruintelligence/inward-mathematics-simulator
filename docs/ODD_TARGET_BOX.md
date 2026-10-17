# Exact target boxes for odd and even samples

The [Target Box lab](../odd-target-box.html) extends the [single-reading flip certificate](ODD_SAMPLE_FLIP.md): for every choice of one movable reading, it determines **all** mean/median/tie outcomes possible while that reading moves continuously through `[L,U]` and the chosen target independently ranges through `[A,B]`. These are inclusive real intervals, with exact rational endpoints; `[A,B]` may be a singleton. The remaining readings stay fixed. The tool labels a route `guarantee: "Mean"` or `"Median"` only if that strict winner holds at **every** position in its rectangle. `null` includes ties or varying outcomes. Its global claim is the union of all routes, not a probability or a recommendation about actual measurements. A separate [browser inspector](../verify-odd-target-box.html) checks downloaded certificates locally with its own exact arithmetic. The [Local Research Archive](../research-archive.html) stores checked copies in this browser profile, then rechecks them every time the archive loads. It is distinct from the public [Discovery Archive](../discovery.html), which contains a fixed, reproducible finite search.

Odd samples retain `inward-odd-target-box-v1`; even samples use `inward-even-target-box-v2` with the central-pair average median. The original odd certificates remain byte-identical. Each certificate contains the canonical rational inputs; for each reading index it contains the complete sorted `knots`, ordered `reachable` outcomes, an exact witness `(reading,target)` for each outcome, and a per-route strict `guarantee`. The global `reachable` and `guarantee` cover every route. Readings and both interval endpoints must be within ±1,000,000; all readings must lie within `[L,U]`, `L<U`, `A≤B`, and the count is 3–21. CLI and browser input permits decimals with up to six places or fractions with at most nine digits per numerator and denominator. Certificates may have larger reduced rational factors; the verifier accepts up to 257-digit rational parts and files up to 2 MB.

## Reproduce

From the repository root with Python 3.12 and Node.js 22 or later, no external packages:

```sh
python3 tools/odd_target_box.py --readings 48,49,50,51,85 --low 0 --high 100 --target-low 48 --target-high 52 --output certificate.json
python3 tools/verify_odd_target_box.py certificate.json
python3 -m unittest discover -s tools -p 'test_odd_target_box.py' -v
node --test tests/odd-target-box.test.cjs
node --test tests/odd-target-box-verifier.test.cjs
```

The [checked-in example](../examples/odd-target-box-v1.json) has all three reachable outcomes over the five routes and target interval 48–52, so no strict global winner exists. As a case with locally stable routes, use `--readings 24,13,45,41,38 --low 13 --high 45 --target-low 49 --target-high 51`; readings 1 and 2 each have `Median` throughout their entire movement and target rectangle, while other routes vary. The target may also lie outside the movement range. Open the lab to load either a stable-route or a signed-range example. The browser's exported JSON is checked by the separate Python verifier, which never imports the generator.

The [four-reading example](../examples/even-target-box-v2.json) uses `[40,45,50,80]`, target interval `[48,52]`, and movement interval `[0,100]`. It records all three outcomes across four possible moved readings. Use **Load four-reading case** in the lab; `python3 tools/verify_odd_target_box.py examples/even-target-box-v2.json` checks the recorded partition and witnesses independently.

## Quantify the exact gap

Choose **Quantify exact gap** in the lab, or add `--gap-envelope` to the Python generator command. This produces `inward-target-box-gap-v3` for either odd or even samples. V1 and v2 default exports remain unchanged. V3 adds an attained minimum and maximum for each route and for the union of all one-reading rectangles. The signed quantity is $D=(\mu-t)^2-(m-t)^2$: negative favors Mean, positive favors Median. If the global maximum is strictly negative, the magnitude of that maximum is a guaranteed lower bound on Median's squared-error disadvantage; if the global minimum is strictly positive, that minimum is a guaranteed lower bound on Mean's squared-error disadvantage. A range containing zero supplies no strict whole-box margin. The units are squared units of the readings, and the result depends on the stipulated bounds. These are **one movable reading at a time**, never simultaneous movement of all readings.

The [checked four-reading v3 example](../examples/target-box-gap-v3.json) has an exact global range $[-1435/16,3885/16]$, so both strict winners occur under its assumptions. Its minimum is attained by changing reading 3 to 40 with target 52; its maximum by changing reading 4 to 0 with target 52. A separate `[11,20,4,2,5]` case has a route maximum $49/6$ at reading $79/12$, target 6: this is a genuine interior quadratic vertex, absent from the partition knots. The verifiers check it rather than inferring extrema only from rectangle corners.

For a strict guarantee example, readings `[8,6,8,7,0,8]`, movement `[0,10]`, and target `[30,40]` yield `Median` throughout every one-reading rectangle. The global minimum $D=265/36>0$ is an exact lower bound on Mean's squared-error disadvantage for this specified family. It does not estimate an empirical probability or certify the target's provenance.

Why the v3 bounds are exhaustive: on each median cell write $\mu(x)=\alpha x+\beta$ and $m(x)=\gamma x+\delta$. For a fixed target, $D$ is a quadratic in $x$ with coefficient $\alpha^2-\gamma^2$ and linear coefficient $2[(\beta-t)\alpha-(\delta-t)\gamma]$. Its extrema on a closed cell occur at its endpoints or at the in-cell vertex $x=-b/(2a)$ when $a\ne0$. For fixed $x$, $D$ is affine in $t$, so its extrema over `[A,B]` occur at $A$ or $B$. The existing exact knot partition includes the median transitions and covers `[L,U]`; evaluating the two target endpoints, each cell's endpoints, and any interior vertex finds the attained global extrema. The browser generator reconstructs each quadratic from three exact values; the independent browser and Python verifiers derive slopes and check the claimed values and witness coordinates against direct squared-error arithmetic. A forged bound fails even if its JSON fingerprint is recomputed. The related Lean source proves factor identities and root formulas; it does not verify each v3 JSON receipt.

## Find the first failure from the original readings

Choose **Find first failure** in the lab or run the generator with `--stability-radius` to produce `inward-target-box-stability-v4`. For each route, its baseline is the strict winner at the *original* reading for **every** target in `[A,B]`, or `null` if there is no such winner. The `left` and `right` limits bound the connected region around that original reading where the same strict winner holds for all targets. `included: true` means the limit is the original movement bound and remains strict there; `included: false` identifies an exact tie at the limit with a `(reading,target)` witness. These directions matter: a reading can be much more stable in one direction than the other. The global `nearestFailure` selects the least absolute change over all one-reading routes and sides, breaking equal distances by reading index and then left before right. If it is `null`, the original strict winner survives every permitted one-reading move. If the baseline has no strict winner, the first failure is distance zero at the original reading. A reported distance $d>0$ guarantees the original strict result for every permitted move of magnitude **strictly less than** $d$; the reported tie means the guarantee fails at $d$ itself. This is not the distance to an opposing strict winner, which may have no attained minimum.

For `[48,49,50,51,85]`, movement `[0,100]`, and target `[48,52]`, the original verdict is Median at every target. The [checked v4 example](../examples/target-box-stability-v4.json) locates the nearest failure at distance **8**: change reading 3 from 50 to **42** and choose target **52** for an exact tie. Every smaller absolute movement of any single reading preserves a strict Median win throughout the target interval. Narrowing the target range to `[49,51]` raises this exact first-failure distance to **18**; fixing the target at 50 raises it to **28**. These are sensitivity results under different stated assumptions, not confidence levels. For `[8,6,8,7,0,8]`, movement `[0,10]`, target `[30,40]`, the global nearest failure is `null`: the stipulated movement range is entirely safe. For `[40,45,50,80]` with target `[48,52]`, the initial verdict already varies with target and a tie occurs at $405/8$, giving distance zero.

Why no earlier failure is missed: within each median cell, the sign of $D(x,t)=(\mu-m)(\mu+m-2t)$ can change only when a factor reaches zero. The complete partition contains the median transitions, the first-factor root, and the second-factor roots at both target endpoints. Between consecutive knots, the signs for the two endpoint targets cannot change. Because $D$ is affine in $t$ for fixed $x$, a strict endpoint winner shared by both endpoints holds throughout the target interval. Starting at the original reading, the verifier scans knots separately to the left and right; the first position without the strict baseline verdict is the exact nearest boundary in that direction. It checks that the claimed excluded boundary has an actual tie at a supplied target. The browser and Python verifiers recompute the roots and direct squared errors independently of the constructors. This is a conditional theorem of the stated one-reading model, not validation of observed measurements, and the JSON is not itself a Lean proof.

```sh
python3 tools/odd_target_box.py --readings 48,49,50,51,85 --low 0 --high 100 --target-low 48 --target-high 52 --stability-radius --output stability.json
python3 tools/verify_odd_target_box.py stability.json
```

## Map the exact decision regions

Choose **Map exact regions** in the lab or run the Python generator with `--region-atlas` to produce `inward-target-box-atlas-v5`. The [checked example](../examples/target-box-atlas-v5.json) records every open strip between consecutive exact reading knots. Each strip stores its endpoints, the tie target $h(x)=(\mu(x)+m(x))/2$ at both endpoints, the strict winner below and above that line, and the outcomes at the chosen target endpoints. In its first route, the open reading strip $(0,15)$ has a tie line rising from $97/2$ to $50$: Mean wins below that line and Median above it. Reading $15$ is an all-target tie column on that route. The record lists every such column where $\mu=m$. Even-sample medians use the central-pair average. Existing v1–v4 receipts retain their schemas and bytes.

The complete coverage argument is algebraic. On each open strip the mean and median are affine functions of the moved reading; the median transitions are already knots. Every root of $\mu-m$ is also a knot, so this factor has one strict sign throughout each open strip. The tie target $h(x)$ is a straight line there. By

$$D(x,t)=2(\mu(x)-m(x))(h(x)-t),$$

the outcome for **every real** $(x,t)$ inside a strip follows from which side of the tie line contains $t$. At a vertical root $\mu=m$, all targets tie. Exact line endpoints and the vertical tie columns cover the boundaries. The browser and Python verifiers recompute each strip from the readings and compare squared errors directly on both sides of the tie line; neither imports the atlas constructor. The chart clips those exact lines to the chosen target interval and draws them at finite pixel resolution. The collapsible rules retain the exact fractions for keyboard and screen-reader use. Colored area is not a probability, a frequency estimate, or scientific validation of the inputs.

For a singleton target `[A,A]`, the chart shows a one-dimensional winner band with exact tie points rather than suggesting a rectangle of possible targets. The underlying certificate uses the same strip rules. A region receipt can be saved in the Local Research Archive or checked in a portable collection.

```sh
python3 tools/odd_target_box.py --readings 48,49,50,51,85 --low 0 --high 100 --target-low 48 --target-high 52 --region-atlas --output atlas.json
python3 tools/verify_odd_target_box.py atlas.json
```

## Solve the target horizon

Choose **Solve target horizon** in the lab or pass `--target-horizon` to produce `inward-target-horizon-v6`. This reverses the usual query: hold the permitted one-reading movement range fixed, and solve **all real target values** where a strict winner survives every route. The input target interval `[A,B]` is still used for the existing bounded outcome certificate; its exact midpoint is also reported as a concrete probe. The horizon itself does not restrict targets to `[A,B]` or ±1,000,000.

For each route, the receipt records the tie target $h_r(L)$ and $h_r(U)$ at the movement endpoints. Across routes, define $h_- = \min_r h_r(L)$ and $h_+ = \max_r h_r(U)$. If $\mu(x)=m(x)$ at **any** permitted movement position, that reading is an all-target tie: there is no strict global winner for *any* target. V6 provides its exact route and moved-reading witness. In this case the finite span $[h_-,h_+]$ is merely the range of midpoint targets, not the complete set of tied target values.

Otherwise, the sign of $\mu-m$ cannot change within a route without an equality, and every route passes through the same original sample. Thus all routes share one strict sign. If $\mu<m$, Mean wins for every target $t<h_-$ and Median wins for every $t>h_+$; if $\mu>m$, those names switch. The boundaries are **excluded** from strict guarantees. For *each* target $t\in[h_-,h_+]$, at least one permitted one-reading move yields an exact tie. The receipt constructs one at the midpoint of `[A,B]` when that midpoint lies in the horizon, or reports the strict global winner when it is outside.

Why no hidden gaps occur: the mean is strictly increasing in the moved reading, while each central order statistic and their average median are nondecreasing. Hence $h_r(x)=(\mu_r(x)+m_r(x))/2$ is continuous and **strictly increasing**, with image $[h_r(L),h_r(U)]$. Every image contains the common original-sample midpoint $h_0$, so their union is exactly $[h_-,h_+]$. On each knot interval the midpoint is affine. For a requested target in that interval, the constructive tie reading is

$$x=p+(q-p)\frac{t-h_r(p)}{h_r(q)-h_r(p)},$$

where $p,q$ are consecutive knots and $h_r(p)\le t\le h_r(q)$. The denominator is positive. The independent JavaScript and Python verifiers recompute endpoint midpoints, every possible all-target equality using their own factor roots, side winners from direct squared errors, and the probe's exact witness. This is a conditional algebraic result for one reading moving at a time, with independently checked executable receipts; the v6 JSON is not itself checked by Lean and does not authenticate a target.

The checked Lean module now proves strict increase and the exact in-cell
interpolation for arbitrary real affine mean and median functions with the
required slopes. It proves that the interpolated reading ties in absolute
error, that supplied global bounds and strict ordering imply the stated
outside winners for every route, and that one equal-estimate route prevents
either strict global winner. Lean also evaluates the exhibited endpoint
midpoints and example ties. The independent receipt verifiers remain
responsible for sorting arbitrary samples, enumerating cells, establishing
the global minimum and maximum, and matching these premises to each JSON
record. These formal statements do not turn a computational certificate into
an automatically checked Lean proof of its data.

For readings `[8,6,8,7,0,8]`, movement `[0,10]`, and probe target `[6,6]`, the [checked v6 example](../examples/target-horizon-v6.json) has $h_-=17/3$ and $h_+=95/12$. Every target below $17/3$ strictly favors Mean under every permitted move; every target above $95/12$ strictly favors Median. At target $6$, moving reading 1 to $4$ gives an exact tie. By contrast, the five-reading `[48,49,50,51,85]` case with movement `[0,100]` has an all-target tie after moving reading 1 to $15$, so no target can provide a strict global guarantee across every route. These conclusions concern the stated hypothetical movement model and do not establish which estimator is appropriate for real measurements.

```sh
python3 tools/odd_target_box.py --readings 8,6,8,7,0,8 --low 0 --high 10 --target-low 6 --target-high 6 --target-horizon --output horizon.json
python3 tools/verify_odd_target_box.py horizon.json
```

## Why every real outcome is covered

For $n=2k+1$ readings, let $s_1\le\cdots\le s_{2k}$ be the fixed ones, $S$ their sum, $x$ the moved reading, and $t$ the target. Then

$$
\mu(x)=(S+x)/n,\qquad
m(x)=\min(s_{k+1},\max(s_k,x)),
$$

and the signed squared-error difference is

$$
D(x,t)=(\mu(x)-t)^2-(m(x)-t)^2
       =(\mu(x)-m(x))(\mu(x)+m(x)-2t).
$$

Negative $D$ means Mean is closer; positive $D$ means Median; zero is a tie. On each of the three median cells, both factors are affine in $x$ at fixed $t$. Partition `[L,U]` at the two median transitions, the root of $\mu-m$, and the roots of $\mu+m-2A$ and $\mu+m-2B$ in each applicable cell. Include endpoints. Each open interval between consecutive knots has constant signs for the first factor and both target-endpoint values of the second. Since the second factor is affine in $t$, the two endpoint outcomes determine the strict winners possible across `[A,B]`; a tie is possible exactly when $t=(\mu+m)/2$ lies within `[A,B]`, or when $\mu=m$. One exact midpoint of each open interval and every knot suffices to enumerate all real outcomes on the full rectangle. This is an **exhaustive sign argument**, not a grid approximation. The interface merely places the exact witness points approximately on a chart.

The independent Python verifier and the separate browser inspector use different closed-form root equations from the constructor and directly compare squared errors. For a fixed outer-cell median $c$, its roots are $nc-S$ and $n(2T-c)-S$ for $T=A,B$; in the middle cell they are $S/(n-1)$ and $(2nT-S)/(n+1)$. They compare the recorded knots with complete roots, derive all outcomes from endpoint signs and target crossings, recompute global and per-route guarantees, and validate every witness by direct rational squared errors. Both reject duplicate JSON keys, extra fields, noncanonical/out-of-range rational values, incomplete routes, and false claims. The browser runs on the device without uploading the certificate. The SHA-256 identifies the checked bytes; it does **not** authenticate the author or the source of the inputs. For a second implementation check, run both verifiers on the same exported file; neither relies on the browser constructor, though both share the same mathematical argument.

For even $n=2k$, the fixed readings are $s_1\le\cdots\le s_{2k-1}$. The two median transitions are $s_{k-1}$ and $s_{k+1}$. The median is $(s_{k-1}+s_k)/2$ on the left, $(s_k+x)/2$ in the middle, and $(s_k+s_{k+1})/2$ on the right. The middle-cell first-factor root is $(2S-ns_k)/(n-2)$; for each target endpoint $T$, the second-factor root is $(4nT-2S-ns_k)/(n+2)$. The outer-cell equations above still apply with their constant central-pair median. The independent verifiers derive these roots separately and reject a missing or altered knot. The same affine sign argument covers every real point in the movement and target rectangle, including ties at cell boundaries and singleton target ranges. The checked Lean source proves the relevant middle-cell factor identities and root equations, while these complete JSON routes are checked by the independent browser and Python verifiers; there is no Lean theorem binding each JSON byte.

The result is a conditional theorem under the stated exact model. The JSON certificate itself is checked by the independent executable verifiers; it is not a Lean or Coq proof of its particular data and routes. It does not assert that a target is ground truth, validate an empirical theory, or recommend a statistical estimator for real measurements. It can serve as a reproducible sensitivity audit for hypothetical inputs. Commercial use would need user research and validation in the intended domain; no customers or revenue are implied.

## Local research archive

Open the [browser inspector](../verify-odd-target-box.html), verify a certificate, and choose **Save checked certificate locally**. You can also import JSON directly into the [Local Research Archive](../research-archive.html). The archive re-runs the independent checker and SHA-256 check before presenting any stored result as verified. Its search covers the label, exact readings and bounds, witness values, outcomes, and fingerprint; filters show reachable outcomes or certificates with strict routes. It also accepts independently checked [conditional claims](CONJECTURE_LAB.md) with separate proof, counterexample, and finite-search statuses. Existing Target Box entries are preserved. Identical bytes are deduplicated by fingerprint. Export any card's original JSON to keep a portable backup. The archive holds up to 100 records in IndexedDB and reports when local storage is unavailable or full. Its labels and local save times are convenience metadata, not proof of authorship, collection time, or input authenticity. Browser data can be cleared or read by others with access to the same browser profile; the app does not upload these records, encrypt them, or sync them across devices.

Existing work and attribution remain with Daniel Jacob Read IV / ĀRU Intelligence Inc. See [CITATION.cff](../CITATION.cff) and [LICENSE](../LICENSE).
