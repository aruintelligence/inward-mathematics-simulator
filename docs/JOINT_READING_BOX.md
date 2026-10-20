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
The v4 target sweep maps the exact tie region and the attained worst-case lead
for **every target** across a nondegenerate interval, including rational
breakpoints where the worst-case readings change.

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
python3 tools/joint_reading_box.py --intervals=48:49,49:50,50:51,51:52,85:86 --target=0 --target-high=80 --target-sweep > joint-sweep.json
node tools/verify-joint-reading-box.cjs joint-sweep.json
node tools/verify-joint-reading-box.cjs examples/joint-reading-box-sweep-v4.json
python3 tools/verify_joint_reading_sweep.py joint-sweep.json
python3 tools/verify_joint_reading_sweep.py examples/joint-reading-box-sweep-v4.json
python3 tools/render_joint_reading_sweep_report.py --check
python3 tools/joint_reading_threshold.py examples/joint-reading-box-sweep-v4.json --threshold=100 > margin-regions.json
node tools/verify-joint-reading-threshold.cjs examples/joint-reading-box-sweep-v4.json margin-regions.json
```

The browser constructor and Python generator produce the same versioned
receipt; the separate BigInt browser verifier and independent Node checker
recompute the claim without importing either constructor. GitHub Actions
checks the examples and runs seeded odd/even cases against an integer-grid
oracle. These finite checks are distinct from the proof below.

The v1 receipt has one fixed `inputs.target`. The v2, v3, and v4 receipts have
`inputs.targetInterval: [low, high]`; v2/v3 have a `claim.tieTarget` when a tie
is possible. Equal target bounds are allowed in v2/v3; v4 requires a strictly
increasing target interval. The verifier accepts all four
versions, rejects tie targets outside the supplied interval, and independently
recomputes a v3 exact minimum and its `claim.gapWitness`. In v1/v2,
`squaredGapLowerBound` is conservative; in v3 it is the attained exact minimum
for a strict verdict. A tie receipt has a zero minimum, represented by its
`tieWitness`, and leaves the strict-gap fields null. The range model
allows **every** combination of readings and target in the Cartesian product;
it does not describe correlated motion or a probability distribution.
V4 has `claim.tieTargetInterval` (or null), `claim.tieWitness` (or null), and
`claim.strictPieces`. Each piece includes rational `from`, `to`, `slope`,
`intercept`, a strict winner on its interior, and readings that attain
$G(t)=\text{slope}\,t+\text{intercept}$ throughout that piece. A piece's
closed endpoint may touch the tie interval, where $G=0$ and the winner ties.
The independent verifier recomputes every segment boundary and line, checks
coverage, and checks that the reading witness attains its line.

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

The [Lean `AffineProduct` theorem](../formal/InwardFormal.lean) also checks
the core segment inequality without square roots: the product of two
nonnegative affine factors between two configurations is at least the
smaller endpoint product, even when the factors move in opposite directions.
Its margin corollary preserves a claimed endpoint lower bound everywhere on
the segment. It assumes the factors and their endpoint signs; the general
cell-vertex completeness argument above remains outside Lean.

For the readings around $48,49,50,51,85$ and target interval $[0,45]$,
the conservative v2 bound is $2407/25$; the exact v3 minimum is $2581/25$,
attained at readings $(48,49,51,51,85)$ and target $45$.

Box corners alone still fail. With reading intervals
$[-2,-2],[-4,-4],[8,12],[-2,0],[-3,2]$ and fixed target $-20$, the exact
minimum is $404/25$ at $(-2,-4,8,0,0)$. The final zero is **inside**
$[-3,2]$, while the best of all box corners gives $816/25$. The
[independently checkable receipt](../examples/joint-reading-box-interior-v3.json)
records this interior ordering-cell vertex.

## Complete target sweep (v4)

Fix the reading box $B$ and let the target traverse $T=[a,b]$ with $a<b$.
If $0\in I_D$, the same attainable reading vector with $\mu=m$ ties for
**every** target in $T$, and $G(t)=0$ throughout. Otherwise the exact tie
set is $T\cap I_H$. For targets strictly below $H(L)$ or strictly above
$H(U)$, the sign of $D(H-t)$ fixes the winner.

For each $c\in C$, set $w_c=2|D(c)|>0$ and $h_c=H(c)$. The v3 argument
applied separately to every fixed target gives the exact attained gap

$$
G(t)=\begin{cases}
\min_{c\in C}(w_ch_c-w_ct),&t<H(L),\\
0,&t\in I_H,\\
\min_{c\in C}(w_ct-w_ch_c),&t>H(U).
\end{cases}
$$

The minimum of finitely many rational affine lines is a piecewise affine
function. The generator sorts their slopes, discards parallel lines with
larger intercept, intersects consecutive surviving lines exactly, and
clips the lower envelope to $T$. A reading witness for each piece attains
its line at **every target on that piece**. The verifier independently
enumerates the endpoint-valued candidates, rebuilds the lower envelopes,
checks all breakpoints and each witness, and rejects omitted or altered
pieces. Thus there is no target sampling assumption.

The separate [Python v4 auditor](../tools/verify_joint_reading_sweep.py)
checks the same claim by a different route: for each reported piece, it
recomputes the minimum over all endpoint-valued reading candidates at both
piece endpoints, checks that the reported line has those exact values, and
checks an in-box reading vector that attains the line. The difference between
two affine lines is affine, so if the reported line is no higher than every
candidate at both ends, it is no higher at every real target in between.
Checking exact coverage, ties, and adjacent unequal formulas detects omitted
regions and fabricated breakpoints. This audit uses exact fractions and
rejects duplicate JSON keys. It has a 2 MB input limit, the 100,000-candidate
limit, and a 2,000,000 endpoint-comparison budget. It relies on the
ordering-cell vertex argument above for completeness of the candidate set;
it is an independent executable check. The general
[`AffineEnvelope` Lean theorems](../formal/InwardFormal.lean) independently
formalize the endpoint-to-every-target implication for arbitrary real
affine lines, and show that an attaining line is the exact minimum of a
supplied finite candidate list. They also prove the sharp threshold side
of a piece's attained cutoff. Lean does not yet prove that the candidate
list exhausts all median ordering cells or that a JSON sweep satisfies
the theorem's premises.

The [example v4 receipt](../examples/joint-reading-box-sweep-v4.json) for
readings near $(48,49,50,51,85)$ and target range $[0,80]$ has ties exactly
on $[533/10,543/10]$. The strict Median region changes worst-case readings
at $979/20$, and the strict Mean region changes them at $286/5$. These are
rational line intersections computed from the readings, not rounded plot
coordinates. At the tie-band endpoints, the adjacent gap formula equals
zero; the strict winner applies to the open part of each exterior piece.

The [standalone research report](../joint-reading-sweep-report.html) shows
these exact pieces, their witnesses, and a piecewise-line plot. Enter a
target as an integer, fraction, or six-place decimal to query its exact
winner and attained lead. For any tie target, it constructs exact in-box
readings that tie at **that target** and independently rechecks the modified
witness. The receipt's original example readings need not tie at every other
target in the band. The SVG uses approximate screen coordinates, while its
rational labels and query results are exact.

The [exact tie witness constructor](../joint-reading-tie-witness.js) uses two
cases. If the checked example has equal Mean and Median, its same readings tie
for every target. Otherwise, interpolate each reading from its lower bound
to its upper bound using one common parameter $u\in[0,1]$. The estimator
midpoint $H(u)$ is continuous and nondecreasing. It is affine between the
finite parameters where two readings cross, because their sorted order and
central median formula are fixed there. Both $H(0)$ and $H(1)$ bracket every
target in the verified tie band. The constructor solves $H(u)=t$ exactly on
the containing segment, checks every reading against its own interval, and
replays the new witness through the independent v4 verifier. This is a
constructive attainable tie for the selected target, including fractional,
singleton, and even-median cases. The [browser lab](../joint-reading-box.html)
and downloaded offline reports expose this calculation and download a new
v4 receipt with the selected witness, within the receipt's rational precision
limits. Replay it with both checkers:

```sh
node tools/verify-joint-reading-box.cjs joint-reading-box-tie-target-v4.json
python3 tools/verify_joint_reading_sweep.py joint-reading-box-tie-target-v4.json
```

The original receipt bytes remain separately available;
retargeting produces a different JSON fingerprint.
The renderer invokes the independent Node verifier on the original JSON
bytes before writing HTML, embeds those bytes and verifier in the output,
and checks their SHA-256 against the rendered report before independently
rechecking the claim on open. This requires a browser with WebCrypto in a
secure local context. Download the original checked JSON from
the report to replay its claim. SHA-256 identifies bytes, not their author.
For another v4 receipt, render a portable report with:

```sh
python3 tools/render_joint_reading_sweep_report.py receipt.json --output report.html
```

The checked-in example report has a CI regeneration gate. Its HTML is
self-contained for offline inspection, although a link to the repository's
proof notes requires an internet connection when the file is moved elsewhere.
For your own v4 sweep, the browser lab's **Download self-checking HTML report**
button creates a self-contained report directly on your device, with the
current positive threshold as its initial query. Open the downloaded HTML in
a modern browser to independently recheck the original JSON bytes and v4
claim, inspect exact targets, calculate other threshold regions, print the
report, or download the source JSON and derived answer. Its verifier and
threshold code are embedded after a SHA-256 check of the assets used to build
it. The report does not establish where the input bounds came from. Its
embedded JSON reveals all those bounds to anyone who receives the file.

## Exact inverse margin regions

Given a positive rational required lead $q$, ask for the exact set

$$
S_q=\{t\in T:\ \forall x\in B,\quad
 |(\mu(x)-t)^2-(m(x)-t)^2|\ge q\}.
$$

This is exactly $\{t:G(t)\ge q\}$ for the verified v4 sweep. On each
strict piece $G(t)=s t+b$, solve $s t+b\ge q$ with rational arithmetic,
clip to that piece, and merge adjacent qualifying spans. Because the lines
have negative slope below the tie band and positive slope above it,
$S_q$ has at most two closed intervals, one on either side. It may be empty,
span an entire exterior region, or include a single endpoint. The tie band
never qualifies for positive $q$.

An interior cutoff occurs where $s t+b=q$. The piece's recorded readings
attain that equality, proving the threshold boundary is sharp. The
[worked margin answer](../examples/joint-reading-box-margin-100-v1.json)
requires a lead of $100$ and gives exactly $[0,13131/290]$ with Median
strictly closer, and $[18131/290,80]$ with Mean strictly closer. Both
cutoffs have attaining reading witnesses. The report can calculate another
threshold and download its JSON answer. The Python command above first
independently verifies the source v4 receipt; the separate Node checker
replays the source and recomputes the threshold regions, source fingerprint,
and boundary witnesses. A fingerprint identifies exact source bytes and
does not authenticate their origin.

The [interactive lab](../joint-reading-box.html) also runs the inverse query
for newly generated or imported v4 sweeps. After it checks the sweep and
fingerprints its original JSON bytes, enter a positive required lead beneath
the target map. Its downloaded answer carries that source fingerprint and
can be replayed with the Node checker above. Editing inputs, receipt text,
or the threshold clears the previous answer before another download.

This query classifies stipulated targets; it does not recommend choosing a
target to make one estimator appear better, and does not validate whether
the reading intervals model a real application.

## Exact target tolerance

Choose an anchor target $t_0\in T$ and a positive required squared-error
lead $q$. The inverse margin set $S_q$ above has at most two disjoint closed
components. If $t_0\notin S_q$, the requested lead is not guaranteed even
at the anchor. Otherwise the unique component $[l,r]$ containing $t_0$
is the **largest connected target interval within the supplied sweep** that
contains $t_0$ and keeps the same strict winner with lead at least $q$
for every allowed reading. The exact left and right reaches are
$t_0-l$ and $r-t_0$. The largest symmetric interval about $t_0$ inside
this verified domain has radius

$$
\rho=\min(t_0-l,\ r-t_0),\qquad [t_0-\rho,t_0+\rho]\subseteq[l,r].
$$

At an interior endpoint where $G(l)=q$ or $G(r)=q$, the strict piece's
readings attain the required lead exactly. Any movement beyond that cutoff
toward the tie band fails the required lead. A domain endpoint can have no
threshold witness because the lead there still exceeds $q$; the result
makes no claim beyond the supplied domain. An anchor at a qualifying
endpoint has symmetric radius zero. The result uses exact rational
arithmetic and the independently verified v4 sweep, not sampled targets.

For the [worked tolerance answer](../examples/joint-reading-box-tolerance-40-v1.json),
$t_0=40$ and $q=100$. Median is guaranteed on $[0,13131/290]$;
the left reach is $40$ and the right reach is $1531/290$. Hence
$\rho=1531/290$, with symmetric interval $[10069/290,13131/290]$.
At the right cutoff, readings $(48,49,51,51,85)$ attain lead exactly
$100$. The browser lab and both offline reports calculate and export this
answer for a selected target. The JSON binds to the exact SHA-256 of the
source receipt and can be independently replayed in Python:

```sh
python3 tools/joint_reading_tolerance.py examples/joint-reading-box-sweep-v4.json --target=40 --threshold=100 > tolerance.json
python3 tools/joint_reading_tolerance.py examples/joint-reading-box-sweep-v4.json --verify tolerance.json
```

The Python checker separately audits the original sweep, recalculates the
inverse regions and both cutoffs using rational fractions, then compares
every field and the source fingerprint. These are conditional sensitivity
limits for stipulated bounds, not a probability distribution or a measured
error tolerance.

## Exact counterexample to a required lead

The target-tolerance query also gives a concrete reason when a positive
required lead $q$ fails at a selected target $t$ in the verified sweep. It
first checks the exact value $G(t)<q$ from the v4 envelope. On a strict
piece, that piece's recorded in-box readings attain $G(t)$ at **every**
target on the piece, including shared breakpoints. In the tie band, the
target-specific constructor above supplies in-box readings with equal
absolute errors at the selected $t$, so $G(t)=0$. Recompute the Mean,
Median, their individual squared errors, and the absolute difference from
those readings; the difference must equal $G(t)$ and be strictly below $q$.
If $G(t)\ge q$, no failing readings exist under these stipulated bounds.

For the [worked failure receipt](../examples/joint-reading-box-counterexample-46-v1.json),
$q=100$ and $t=46$. Readings $(48,49,51,51,85)$ yield Mean $284/5$ and
Median $51$. Their squared errors are $2916/25$ and $25$, respectively,
and the attained lead $2291/25$ is strictly less than $100$. This is a
counterexample to the **required margin**, even though Median remains the
strict winner at this target. At target $54$, the constructor instead gives
an attainable tie and a zero lead. The lab and both offline reports display
these readings whenever a selected target fails the threshold and export
JSON linked to the exact original source bytes. Editing the target, required
lead, or source clears that download.

```sh
python3 tools/joint_reading_counterexample.py examples/joint-reading-box-sweep-v4.json --target=46 --threshold=100 > failure.json
python3 tools/joint_reading_counterexample.py examples/joint-reading-box-sweep-v4.json --verify failure.json
```

The independent Python checker audits the entire original sweep, rejects
duplicate JSON keys and changed source fingerprints, checks every witness
reading against its interval, recomputes both squared errors exactly, and
confirms that the witness attains the audited minimum and fails the specified
threshold. Tie witnesses may differ while still being valid; the checker
checks their mathematical content rather than requiring the generator's
particular interpolation. The receipt does not test whether the stipulated
intervals correspond to real measurements.

## Why corners alone are insufficient

For the intervals $[-4,-3],[-1,4],[1,2]$, the true minimum of $D$ is
$-2$ at the readings $(-4,2,2)$. The smallest value at any of the eight
box corners is only $-4/3$. The [tie example](../examples/joint-reading-box-tie-v1.json)
records the exact extremum and an attained tie at target $-2$.

## Limits and status

Input is 3–5 intervals, rational or at most six-place decimal bounds within
$[-1{,}000{,}000,1{,}000{,}000]$, and a fixed target (v1) or target interval
(v2/v3, including equal bounds, or v4 with strictly increasing bounds) in that range.
Every interval may have zero width. At most 100,000 feasible endpoint-valued
vectors may be enumerated; a larger case fails explicitly. Imported input
fractions are canonical and limited to 18 digits per part, computed claim
fractions to 257 digits per part, and JSON to 2 MB. The result covers all
real values inside the accepted intervals, not just input-grid readings.

The proof is an elementary argument recorded here, with separate Python and
browser constructors, an independent exact verifier, and finite regression
checks. Lean now proves the generic v4 affine endpoint audit and threshold
cutoff lemmas. There is **no Lean formalization of the arbitrary-interval
vertex argument, the v3 sharp-gap argument, or the completeness of a v4
receipt's candidates and coverage** in this release.
The receipt cannot verify the provenance or suitability of supplied data,
the target choice, correlation assumptions, or market demand. Attribution
and licensing remain in the repository's `LICENSE` and `CITATION.cff`.
