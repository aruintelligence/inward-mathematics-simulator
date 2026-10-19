# Joint Reading Box: simultaneous uncertainty certificates

This research instrument answers a specific question: for a fixed rational target
or a **closed rational target interval**, and **3–5 readings that may all change
independently** inside closed rational intervals, is Mean or Median strictly
closer at every permitted configuration? If a tie is reachable, the receipt
supplies exact rational readings and a target that attain it. This extends the
original Target Lens five-reading uniform-drift model to heterogeneous,
signed rational intervals and includes the central-pair median
for even samples. It does not replace the one-reading-at-a-time Target Box.
New v3 receipts also find the **exact attained minimum squared-error lead**
when one estimator wins throughout the box.

## Reproduce and inspect

Open the [browser lab](../joint-reading-box.html) to set 3–5 reading bounds
and a target or target interval, generate a certificate on your device,
independently verify its claim, and download the checked JSON. The same lab
can check the examples, imported files, or pasted receipts on a phone. It
reads files locally, rejects duplicate JSON keys, verifies exact rational calculations,
and prints the SHA-256 of the checked bytes. The fingerprint identifies
matching bytes; it does not authenticate an author. Generating a new receipt
does not require Python or a server.

To reproduce the experiment offline from the repository root:

```sh
python3 tools/joint_reading_box.py --intervals=48:49,49:50,50:51,51:52,85:86 --target=0 > joint.json
node tools/verify-joint-reading-box.cjs joint.json
node tools/verify-joint-reading-box.cjs examples/joint-reading-box-tie-v1.json
python3 tools/joint_reading_box.py --intervals=48:49,49:50,50:51,51:52,85:86 --target=0 --target-high=45 > joint-range.json
node tools/verify-joint-reading-box.cjs joint-range.json
node tools/verify-joint-reading-box.cjs examples/joint-reading-box-tie-v2.json
python3 tools/joint_reading_box.py --intervals=48:49,49:50,50:51,51:52,85:86 --target=0 --target-high=45 --exact-gap > joint-sharp.json
node tools/verify-joint-reading-box.cjs joint-sharp.json
node tools/verify-joint-reading-box.cjs examples/joint-reading-box-interior-v3.json
```

The browser constructor and Python generator produce the same versioned
receipt; the separate BigInt browser verifier and independent Node checker
recompute the claim without importing either constructor. GitHub Actions
checks the examples and runs seeded odd/even cases against an integer-grid
oracle. These finite checks are distinct from the proof below.

The v1 receipt has one fixed `inputs.target`. The v2 and v3 receipts have
`inputs.targetInterval: [low, high]` and a `claim.tieTarget` when a tie is
possible. Equal target bounds are allowed. The verifier accepts all three
versions, rejects tie targets outside the supplied interval, and independently
recomputes a v3 exact minimum and its `claim.gapWitness`. In v1/v2,
`squaredGapLowerBound` is conservative; in v3 it is the attained exact minimum
for a strict verdict. A tie receipt has a zero minimum, represented by its
`tieWitness`, and leaves the strict-gap fields null. The range model
allows **every** combination of readings and target in the Cartesian product;
it does not describe correlated motion or a probability distribution.

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

For a strict winner, legacy v1/v2 receipts report a conservative lower bound on
the **absolute squared-error difference**. Let
$\delta_D=\operatorname{dist}(0,[D_{\min},D_{\max}])$ and
$\delta_H=\operatorname{dist}(t,[H(L),H(U)])$. Both are positive in a strict
case, and every permitted configuration obeys

$$
\left|(\mu-t)^2-(m-t)^2\right|\geq 2\delta_D\delta_H>0.
$$

This bound need not be sharp. It is a quantitative guarantee for the
stipulated box, not a probability or an empirical error bar.

## Target interval theorem (v2)

Let the target vary independently over $T=[a,b]$ and write
$I_H=[H(L),H(U)]$, $I_D=[D_{\min},D_{\max}]$. The **complete** tie test is

$$
0\in I_D\quad\text{or}\quad T\cap I_H\ne\varnothing.
$$

If $0\in I_D$, an attained configuration has $\mu=m$ and ties at **every**
target in $T$. Otherwise, if the intervals intersect, choose any rational
$t_*\in T\cap I_H$. Continuity and monotonicity of $H$ give readings with
$H=t_*$, so their squared errors tie. The generator chooses
$t_*=\max(a,H(L))$ and solves for readings by exact piecewise affine
interpolation. The verifier independently checks both the reading bounds
and $t_*\in T$ and recomputes the zero squared-error difference.

If neither condition holds, $D$ keeps one nonzero sign and $H(x)-t$ keeps
one nonzero sign for every $(x,t)\in B\times T$. Thus the strict winner is
uniform over the entire box and target interval. With
$\delta_T=\operatorname{dist}(I_H,T)>0$, the receipt proves

$$
\left|(\mu(x)-t)^2-(m(x)-t)^2\right|
\ge 2\operatorname{dist}(0,I_D)\,\delta_T>0
\quad\text{for every }(x,t)\in B\times T.
$$

For the example readings around $48,49,50,51,85$, the target interval
$[0,45]$ gives a uniform Median verdict and a squared-error lead of at least
$2407/25$. The interval $[54,55]$ permits a tie at target $54$ with exact
readings $(487/10,497/10,507/10,517/10,857/10)$. Both claims can be
reproduced from the [strict](../examples/joint-reading-box-strict-v2.json)
and [tie](../examples/joint-reading-box-tie-v2.json) v2 receipts.

## Exact attained squared-error lead (v3)

When the verdict is strict, $I_H$ and $T$ are disjoint. For every reading
vector $x$, the target that minimizes the absolute squared-error difference
is the endpoint of $T$ closest to $I_H$: $t_*=b$ if $H(L)>b$, and $t_*=a$
if $H(U)<a$. Let $C$ be the endpoint-valued feasible vectors enumerated
for the $D$ extrema. The exact minimum over the **entire continuum** is

$$
G_{\min}=2\min_{c\in C}|D(c)|\,|H(c)-t_*|.
$$

To see why, fix any closed ordering cell. Since the verdict is strict,
the two factors $A(x)=|D(x)|$ and $B(x)=|H(x)-t_*|$ have fixed signs before
the absolute values and are therefore positive affine functions on this
convex cell. Express any point as a convex combination of the cell's
vertices, $x=\sum_i\lambda_i v_i$. The Cauchy–Schwarz inequality gives

$$
A(x)B(x)
=\left(\sum_i\lambda_i A(v_i)\right)
 \left(\sum_i\lambda_i B(v_i)\right)
\ge\left(\sum_i\lambda_i\sqrt{A(v_i)B(v_i)}\right)^2
\ge\min_i A(v_i)B(v_i).
$$

Each cell vertex is endpoint-valued by the earlier argument, so $C$
contains a global minimizer. Every candidate is feasible, so this is an
**attained equality**, not merely a safe bound. The v3 `gapWitness`
records its readings and $t_*$. The separate verifier enumerates candidates
again, checks the exact minimum, and confirms the witness attains it. It
does not trust the generator's extremum or witness.

For the readings around $48,49,50,51,85$ and target interval $[0,45]$,
the conservative v2 bound is $2407/25$; the exact v3 minimum is $2581/25$,
attained at readings $(48,49,51,51,85)$ and target $45$.

Box corners alone still fail. With reading intervals
$[-2,-2],[-4,-4],[8,12],[-2,0],[-3,2]$ and fixed target $-20$, the exact
minimum is $404/25$ at $(-2,-4,8,0,0)$. The final zero is **inside**
$[-3,2]$, while the best of all box corners gives $816/25$. The
[independently checkable receipt](../examples/joint-reading-box-interior-v3.json)
records this interior ordering-cell vertex.

## Why corners alone are insufficient

For the intervals $[-4,-3],[-1,4],[1,2]$, the true minimum of $D$ is
$-2$ at the readings $(-4,2,2)$. The smallest value at any of the eight
box corners is only $-4/3$. The [tie example](../examples/joint-reading-box-tie-v1.json)
records the exact extremum and an attained tie at target $-2$.

## Limits and status

Input is 3–5 intervals, rational or at most six-place decimal bounds within
$[-1{,}000{,}000,1{,}000{,}000]$, and a fixed target (v1) or target interval
(v2/v3, including equal bounds) in that range.
Every interval may have zero width. At most 100,000 feasible endpoint-valued
vectors may be enumerated; a larger case fails explicitly. Imported input
fractions are canonical and limited to 18 digits per part, computed claim
fractions to 257 digits per part, and JSON to 2 MB. The result covers all
real values inside the accepted intervals, not just input-grid readings.

The proof is an elementary argument recorded here, with separate Python and
browser constructors, an independent exact verifier, and finite regression
checks. There is **no Lean formalization of the arbitrary-interval vertex
argument or the v3 sharp-gap argument** in this release.
The receipt cannot verify the provenance or suitability of supplied data,
the target choice, correlation assumptions, or market demand. Attribution
and licensing remain in the repository's `LICENSE` and `CITATION.cff`.
