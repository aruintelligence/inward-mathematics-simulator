# Joint Reading Box: simultaneous uncertainty certificate v1

This research instrument answers a specific question: for a fixed rational target
and **3–5 readings that may all change independently** inside closed rational
intervals, is Mean or Median strictly closer at every permitted configuration?
If a tie is reachable, the receipt supplies exact rational readings that attain
it. This extends the original Target Lens five-reading uniform-drift model to
heterogeneous, signed rational intervals and includes the central-pair median
for even samples. It does not replace the one-reading-at-a-time Target Box.

## Reproduce and inspect

Open the [browser lab](../joint-reading-box.html) to set 3–5 reading bounds
and a target, generate a certificate on your device, independently verify
its claim, and download the checked JSON. The same lab can check the two
examples, imported files, or pasted receipts on a phone. It reads files
locally, rejects duplicate JSON keys, verifies exact rational calculations,
and prints the SHA-256 of the checked bytes. The fingerprint identifies
matching bytes; it does not authenticate an author. Generating a new receipt
does not require Python or a server.

To reproduce the experiment offline from the repository root:

```sh
python3 tools/joint_reading_box.py --intervals=48:49,49:50,50:51,51:52,85:86 --target=0 > joint.json
node tools/verify-joint-reading-box.cjs joint.json
node tools/verify-joint-reading-box.cjs examples/joint-reading-box-tie-v1.json
```

The browser constructor and Python generator produce the same versioned
receipt; the separate BigInt browser verifier and independent Node checker
recompute the claim without importing either constructor. GitHub Actions
checks both examples and runs seeded odd/even cases against an integer-grid
oracle. These finite checks are distinct from the proof below.

## Complete algebraic argument

Write $\mu(x)$ for the arithmetic mean, $m(x)$ for the usual median (the
average of the two middle values when the count is even),
$D(x)=\mu(x)-m(x)$, and $H(x)=(\mu(x)+m(x))/2$. For any fixed target $t$,

$$
(\mu(x)-t)^2-(m(x)-t)^2=2D(x)(H(x)-t).
$$

The input box $B=\prod_i[L_i,U_i]$ is compact and connected. The median is
continuous and nondecreasing in each reading. Hence $H$ is continuous and
strictly increasing in each coordinate. Its **exact** image is the whole
interval $[H(L),H(U)]$: the endpoints are coordinatewise extrema, and a
continuous image of a connected set is an interval.

Finding the extrema of $D$ requires more care. Partition $B$ into the
finitely many closed cells determined by a weak ordering of the readings.
On each cell the median, including the even central-pair rule, is affine,
so $D$ attains its extrema at vertices. At a vertex, group coordinates that
are equal. Every such group must contain a coordinate fixed at one of its
interval endpoints. Otherwise the entire group could be shifted slightly
both ways without leaving that ordering cell, contradicting that it is a
vertex. Thus **each coordinate of every vertex is equal to an original
interval endpoint**. Enumerating all feasible endpoint-valued vectors gives
the true, attained global minimum and maximum of $D$; no finite measurement
grid stands in for the continuum.

Because $D$ is continuous on connected $B$, it attains every value between
those extrema. If its range contains zero, some permitted readings have
$\mu=m$ and tie at *every* target. Otherwise $D$ has one strict sign. If
$t\in[H(L),H(U)]$, some permitted readings have $H=t$ and tie at this target.
Otherwise both factors have fixed, nonzero signs everywhere, and the product
identifies the same strict winner throughout $B$. The certificate constructs
a tie by interpolating between the two bracketing configurations. It splits
the line segment at every pairwise reading crossing, where the median's
affine formula can change, and solves an exact linear equation on the
bracketing piece. The verifier checks the resulting readings independently.

For a strict winner, the receipt also reports a conservative lower bound on
the **absolute squared-error difference**. Let
$\delta_D=\operatorname{dist}(0,[D_{\min},D_{\max}])$ and
$\delta_H=\operatorname{dist}(t,[H(L),H(U)])$. Both are positive in a strict
case, and every permitted configuration obeys

$$
\left|(\mu-t)^2-(m-t)^2\right|\geq 2\delta_D\delta_H>0.
$$

This bound need not be sharp. It is a quantitative guarantee for the
stipulated box, not a probability or an empirical error bar.

## Why corners alone are insufficient

For the intervals $[-4,-3],[-1,4],[1,2]$, the true minimum of $D$ is
$-2$ at the readings $(-4,2,2)$. The smallest value at any of the eight
box corners is only $-4/3$. The [tie example](../examples/joint-reading-box-tie-v1.json)
records the exact extremum and an attained tie at target $-2$.

## Limits and status

Input is 3–5 intervals, rational or at most six-place decimal bounds within
$[-1{,}000{,}000,1{,}000{,}000]$, and one fixed target in that range.
Every interval may have zero width. At most 100,000 feasible endpoint-valued
vectors may be enumerated; a larger case fails explicitly. Imported input
fractions are canonical and limited to 18 digits per part, computed claim
fractions to 257 digits per part, and JSON to 2 MB. The result covers all
real values inside the accepted intervals, not just input-grid readings.

The proof is an elementary argument recorded here, with separate Python and
browser constructors, an independent exact verifier, and finite regression
checks. There is **no Lean
formalization of the arbitrary-interval vertex argument** in this release.
The receipt cannot verify the provenance or suitability of supplied data,
the target choice, correlation assumptions, or market demand. Attribution
and licensing remain in the repository's `LICENSE` and `CITATION.cff`.
