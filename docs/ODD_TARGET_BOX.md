# Exact target boxes for odd samples

The [Target Box lab](../odd-target-box.html) extends the [single-reading flip certificate](ODD_SAMPLE_FLIP.md): for every choice of one movable reading, it determines **all** mean/median/tie outcomes possible while that reading moves continuously through `[L,U]` and the chosen target independently ranges through `[A,B]`. These are inclusive real intervals, with exact rational endpoints; `[A,B]` may be a singleton. The remaining readings stay fixed. The tool labels a route `guarantee: "Mean"` or `"Median"` only if that strict winner holds at **every** position in its rectangle. `null` includes ties or varying outcomes. Its global claim is the union of all routes, not a probability or a recommendation about actual measurements.

The certificate has format `inward-odd-target-box-v1`. It contains the canonical rational inputs; for each reading index it contains the complete sorted `knots`, ordered `reachable` outcomes, an exact witness `(reading,target)` for each outcome, and a per-route strict `guarantee`. The global `reachable` and `guarantee` cover every route. Readings and both interval endpoints must be within ±1,000,000; all readings must lie within `[L,U]`, `L<U`, `A≤B`, and the odd count is 3–21. CLI and browser input permits decimals with up to six places or fractions with at most nine digits per numerator and denominator. Certificates may have larger reduced rational factors; the verifier accepts up to 257-digit rational parts and files up to 2 MB.

## Reproduce

From the repository root with Python 3.12 and Node.js 22 or later, no external packages:

```sh
python3 tools/odd_target_box.py --readings 48,49,50,51,85 --low 0 --high 100 --target-low 48 --target-high 52 --output certificate.json
python3 tools/verify_odd_target_box.py certificate.json
python3 -m unittest discover -s tools -p 'test_odd_target_box.py' -v
node --test tests/odd-target-box.test.cjs
```

The [checked-in example](../examples/odd-target-box-v1.json) has all three reachable outcomes over the five routes and target interval 48–52, so no strict global winner exists. As a case with locally stable routes, use `--readings 24,13,45,41,38 --low 13 --high 45 --target-low 49 --target-high 51`; readings 1 and 2 each have `Median` throughout their entire movement and target rectangle, while other routes vary. The target may also lie outside the movement range. Open the lab to load either a stable-route or a signed-range example. The browser's exported JSON is checked by the separate Python verifier, which never imports the generator.

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

The independent verifier uses different closed-form root equations and directly compares squared errors. For a fixed outer-cell median $c$, its roots are $nc-S$ and $n(2T-c)-S$ for $T=A,B$; in the middle cell they are $S/(n-1)$ and $(2nT-S)/(n+1)$. It compares the recorded knots with its complete roots, derives all outcomes from endpoint signs and target crossings, recomputes global and per-route guarantees, and validates every witness by direct rational squared errors. It rejects duplicate JSON keys, extra fields, noncanonical/out-of-range rational values, incomplete routes, and false claims. The SHA-256 it prints identifies the checked bytes; it does **not** authenticate the author or the source of the inputs.

The result is a conditional theorem under the stated exact model. It is not a Lean or Coq formal proof, an assertion that a target is ground truth, an empirical validation, a new statistical estimator recommendation, or a scientific breakthrough. It can serve as a reproducible sensitivity audit for hypothetical inputs. Commercial use would need user research and validation in the intended domain; no customers or revenue are implied.

Existing work and attribution remain with Daniel Jacob Read IV / ĀRU Intelligence Inc. See [CITATION.cff](../CITATION.cff) and [LICENSE](../LICENSE).
