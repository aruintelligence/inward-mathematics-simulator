# Exact single-reading reversal for odd samples

This research tool extends the five-reading Flip Point question to any **odd number of 3 through 21 rational readings** in `[0,100]`. The target is a stipulated rational number in `[0,100]`. Hold every reading but one fixed, allow that reading to move continuously anywhere in `[0,100]`, and ask how near a strict mean-versus-median winner reversal can occur. The result is an exact **infimum of movement**, a tie at that boundary, and an explicit strict-reversal witness beyond it. It is not a claim about which observation should change in the real world.

## Reproduce

From the repository root, using Python 3.12 or later and no external packages:

```sh
python3 tools/odd_sample_flip.py --readings 48,49,50,51,85 --target 50 --output example.json
python3 tools/verify_odd_sample_flip.py example.json
python3 tools/render_odd_flip_report.py example.json --output report.html
python3 -m unittest discover -s tools -p 'test_odd_sample_flip.py' -v
```

The [checked-in example](../examples/odd-sample-flip-v1.json) starts with median winning. Changing the third reading from 50 down to 22 ties the errors; moving it strictly below 22 makes the mean win. The infimum distance is 28. Changing the fourth reading down to 23 also has distance 28; the global certificate chooses the lower index deterministically. Some individual readings cannot reverse the winner anywhere in `[0,100]`.

Open the [sample research report](../odd-flip-report.html) to inspect the five complete routes in a responsive dark or light layout and print the result. `render_odd_flip_report.py` verifies any certificate before rendering, embeds its exact checked bytes in a local download link, and shows the SHA-256 for comparison. The plots approximate positions for orientation; the fraction labels and downloaded record are exact. Use `python3 tools/render_odd_flip_report.py --check` to verify that the checked-in report matches its certificate.

## Why the search is exhaustive over real changes

Write the odd count as $n=2k+1$, and sort the other $2k$ fixed readings as $s_1\le\cdots\le s_{2k}$. With movable value $x$, fixed sum $S$, and target $t$:

$$
\mu(x)=\frac{S+x}{n},\qquad
m(x)=\min\bigl(s_{k+1},\max(s_k,x)\bigr).
$$

Thus the median is $s_k$, $x$, or $s_{k+1}$ on three successive cells. The difference of squared absolute errors factors as

$$
(\mu(x)-t)^2-(m(x)-t)^2
 =(\mu(x)-m(x))(\mu(x)+m(x)-2t).
$$

Both factors are affine within each cell. Their zeroes and the two median transitions partition the entire permitted interval `[0,100]` into finitely many open intervals. On each open interval, neither nonzero factor changes sign; a factor that vanishes identically gives ties throughout that interval. An exact midpoint evaluation therefore determines the winner on the **whole interval**, for every real $x$, rather than sampling a grid. The certificate lists every knot, winner at each knot, and winner on each open interval for each movable reading.

For a strict starting winner, the closure of every opposing open interval has a nearest point to the starting reading. The least of those distances over all reading positions is the exact reversal **infimum**. The selected boundary ties by continuity, so there is generally **no attained smallest strict reversal**: every arbitrarily small move beyond that threshold into the opposing interval reverses the winner. The certificate records an interior rational witness proving the opposing side exists. If the initial errors tie, the certificate reports `baseline-tie`; it does not invent an opposing baseline winner. If no position has an opposing interval, `best` is `null`.

The [independent checker](../tools/verify_odd_sample_flip.py) does not import the generator. It obtains the candidate roots from closed-form equations: on an outer cell with fixed median $c$, roots are $nc-S$ and $n(2t-c)-S$; on the middle cell, they are $S/(n-1)$ and $(2nt-S)/(n+1)$. It compares the complete partition, directly recomputes squared errors at every knot and interval midpoint with exact `Fraction`, checks the witness and tie boundary, and selects the closest route. It rejects duplicate JSON keys, noncanonical rationals, altered fields, and files above 2 MB. Its SHA-256 fingerprints the exact bytes checked; it does not authenticate their author.

This is a reproducible mathematical argument under the specified rational inputs and continuous real movement. It is not a Lean/Coq formal proof, a new general theorem, a statistical estimator recommendation, or validation of a physical model. The existing five-reading browser lab uses a four-decimal discrete movement grid for some challenges; its **smallest selectable strict move** is different from this continuous infimum.
