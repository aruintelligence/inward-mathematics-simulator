# Independently audit the continuous stability edge

The Target Lens stability edge is the least **real** reading drift that permits a tie for five stipulated readings and a closed target interval. A six-decimal control can select only the first grid setting at or above that exact radius. The [Python audit](../tools/audit_stability_edge.py) recomputes both factor routes with rational arithmetic, then constructs admissible tie readings at each route. It does not call the browser's threshold routine.

## Run it on a saved receipt

Run the included [worked receipt](../examples/stability-case-a.json) immediately, or download your own [Target Lens proof receipt](../target-lens.html). From the repository root:

```sh
python3 tools/audit_stability_edge.py examples/stability-case-a.json
python3 tools/audit_stability_edge.py receipt.json
python3 tools/audit_stability_edge.py receipt.json --mask 5 --json
```

The default mask `31` lets all five readings move. Mask bits `1, 2, 4, 8, 16` select readings one through five; `5` lets readings one and three move and freezes the other three. The script first checks the receipt with the independent [Python v1 verifier](../tools/verify_target_lens.py), then derives the edge from its original readings and target interval. The selected target and selected drift are context and do not change the edge. A tampered receipt fails before the audit. A baseline that already ties returns `no-baseline`; a selected mask that cannot reach a tie by drift 100 returns `unreachable`.

The output gives the smallest rational radius, the first six-decimal setting at or above it, and the two individual routes if reachable. A route can occur after the overall guarantee has ended. Witness readings, target, mean, median, and equal absolute errors are reduced fractions in ordinary 0–100 units. `--json` makes these values available to another program without rounding them.

## Why the scan is exhaustive

Write $S(x)=\sum_{i=1}^5 x_i$, $M(x)=\operatorname{median}(x)$, and let the target $t$ lie in $[a,b]$. The sign of the squared-error difference is the sign of

$$
  F(x)G(x,t),\qquad F(x)=S(x)-5M(x),\qquad G(x,t)=S(x)+5M(x)-10t.
$$

At drift radius $\rho$, each selected reading independently lies in $[L_i(\rho),U_i(\rho)]=[\max(0,r_i-\rho),\min(100,r_i+\rho)]$; an unselected reading stays fixed. If the zero-drift box has a strict winner, both factors have fixed nonzero signs throughout that target interval. For each factor, multiply by its baseline sign and minimize over the growing box. A tie first becomes possible when either signed minimum reaches zero. Before that first root both factors preserve their signs everywhere. The connected box and target interval make a zero attainable when either continuous factor reaches zero.

For $G$, monotonicity puts its minimum at all lower reading bounds and $t=b$, or its maximum at all upper reading bounds and $t=a$. For $F$, consider each of the $5\binom{4}{2}=30$ choices of median index and two indices below it. At a feasible median $m$, the other readings move to their constrained endpoints. The signed minimum on that ordering cell occurs at its largest feasible $m$ when the baseline $F$ is positive, or its smallest feasible $m$ when it is negative.

All these candidate margins are affine between finitely many drift landmarks: a moving reading clips at 0 or 100, or two reading intervals first meet. With two movable readings that meeting radius is half their original gap; with one movable reading it is the full gap. Thus a candidate cannot become nonpositive between consecutive landmarks without a zero of its affine expression. The audit scans every cell on every segment, solves each first zero as an exact `Fraction`, and takes the earliest route. At each reported root it substitutes the extremal readings and checks that they lie within the box and that the two absolute errors are exactly equal. Nested boxes keep that witness admissible at every larger radius.

For readings `[48, 49, 50, 51, 85]` and target interval `[48, 52]`, the midpoint route first ties at $\rho=13/10$; the distinct-estimate route reaches $\rho=16/3$. For target interval `[0, 1]`, their order reverses: estimates first meet at $16/3$, while the midpoint route appears at $75$. The first selectable six-decimal setting for $16/3$ is `5.333334`.

The automated cross-check compares both exact routes and the first selectable setting with the JavaScript implementation across varied reading boxes and masks. Agreement between two implementations is useful error detection, not a statement that the invented readings are measured truth or that the uncertainty box models a real population. See the [receipt format and limitations](target-lens-proof-v1.md).
