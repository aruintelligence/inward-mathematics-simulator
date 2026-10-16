# Exact single-reading reversal for 3–21 samples

This research tool extends the five-reading Flip Point question to **3 through 21 rational readings, odd or even**. Hold every reading but one fixed, allow that reading to move continuously within an inclusive interval, and ask how near a strict mean-versus-median winner reversal can occur. For even samples the median is the average of the two central sorted readings. The result is an exact **infimum of movement**, a tie at that boundary, and an explicit strict-reversal witness beyond it. Existing odd-sample version 1 uses readings, target, and movement in `[0,100]`; version 2 carries explicit signed movement bounds and permits a target outside those bounds. New even-sample version 3 always carries explicit bounds, including `[0,100]` when defaults are used. It is not a claim about which observation should change in the real world.

## Reproduce

From the repository root, using Python 3.12 or later and no external packages:

```sh
python3 tools/odd_sample_flip.py --readings 48,49,50,51,85 --target 50 --output example.json
python3 tools/verify_odd_sample_flip.py example.json
python3 tools/render_odd_flip_report.py example.json --output report.html
python3 tools/odd_sample_flip.py --readings=-2,-1,0,1,35 --target=0 --low=-10 --high=40 --output signed.json
python3 tools/verify_odd_sample_flip.py signed.json
python3 tools/render_odd_flip_report.py signed.json --output signed-report.html
python3 tools/odd_sample_flip.py --readings 40,45,50,80 --target 50 --output even.json
python3 tools/verify_odd_sample_flip.py even.json
python3 tools/render_odd_flip_report.py even.json --output even-report.html
python3 -m unittest discover -s tools -p 'test_odd_sample_flip.py' -v
```

The [checked-in example](../examples/odd-sample-flip-v1.json) starts with median winning. Changing the third reading from 50 down to 22 ties the errors; moving it strictly below 22 makes the mean win. The infimum distance is 28. Changing the fourth reading down to 23 also has distance 28; the global certificate chooses the lower index deterministically. Some individual readings cannot reverse the winner anywhere in `[0,100]`.

The [signed constrained example](../examples/odd-sample-flip-v2.json) uses readings `[-2,-1,0,1,35]` and target `0`. With permitted movement `[-30,40]`, changing reading 3 to `-28` ties at distance `28`, and `-29` strictly reverses the winner. Narrowing the movement to `[-10,40]` excludes that route: changing reading 5 to `-1/2` ties at distance `71/2`, and `-3/4` witnesses the opposite winner. The [checked signed report](../odd-flip-signed-report.html) shows all five routes for the narrower interval. These are conditional conclusions for the stated interval, not empirical findings about readings.

The [checked even-sample report](../even-flip-report.html) and its [v3 certificate](../examples/even-sample-flip-v3.json) use readings `[40,45,50,80]` and target `50`. The median starts closer. Changing reading 2 from `45` to `130/3` ties the errors, an infimum distance of `5/3`; `125/3` strictly reverses them in favor of the mean. The exact central pair changes with the movable reading. The v3 record includes `inputs.bounds` even at the default range so that its median rule and domain are unambiguous.

Open the [odd-sample report](../odd-flip-report.html), [even-sample report](../even-flip-report.html), or [signed constrained report](../odd-flip-signed-report.html) to inspect complete routes in a responsive dark or light layout and print the result. `render_odd_flip_report.py` verifies any certificate before rendering, embeds its exact checked bytes in a local download link, and shows the SHA-256 for comparison. The plots approximate positions for orientation; the fraction labels and downloaded record are exact. Run the renderer with `--check` and the matching `--output` path to detect a stale report.

The [interactive research lab](../odd-flip-lab.html) applies the same partition to 3–21 visitor-supplied samples entirely in the browser using BigInt fractions. Odd default `[0,100]` inputs export v1; odd custom bounds export v2; even inputs export v3 with canonical `inputs.bounds` even at the default range. All readings must lie within the specified bounds; with custom bounds the target may lie outside them. Each input accepts an exact decimal of up to six places or a rational with up to nine digits per part; bounds and target must be within `[-1000000,1000000]`. It can print the visual summary. The Python verifier above independently checks the exported record, rather than trusting the page's labels. `node --test tests/odd-flip-lab.test.cjs` compares the browser constructor against the Python generator for seeded odd and even counts, signed and fractional inputs, and boundary targets. The page does not place visitor values into URLs or send them to an application server. The static worked reports additionally embed verifier-checked bytes and a SHA-256 fingerprint; the interactive page does not claim independent verification until its export is checked.

The [browser certificate inspector](../verify-odd-flip.html) can check the download locally without Python. Its separate verifier recomputes the partition using the closed-form roots above and compares *squared errors* with exact BigInt fractions, instead of importing the browser constructor or using its factored verdict. It checks every recorded winner, tie threshold, and strict witness, rejects duplicate JSON keys including escaped names, and shows a SHA-256 fingerprint of the exact checked file bytes. Paste and file input stay in the browser. The independent Python verifier remains useful as a second language implementation. Run `node --test tests/odd-flip-verifier.test.cjs` for cross-checks and forged-certificate rejection. Neither checker authenticates where the input values came from.

## Why the search is exhaustive over real changes

Write the odd count as $n=2k+1$, and sort the other $2k$ fixed readings as $s_1\le\cdots\le s_{2k}$. With movable value $x$, fixed sum $S$, and target $t$:

$$
\mu(x)=\frac{S+x}{n},\qquad
m(x)=\min\bigl(s_{k+1},\max(s_k,x)\bigr).
$$

Thus the median is $s_k$, $x$, or $s_{k+1}$ on three successive cells.

For even $n=2k\ge4$, sort the $2k-1$ fixed readings. The central-pair median is also affine on three cells:

$$
m(x)=\begin{cases}
(s_{k-1}+s_k)/2 & x\le s_{k-1},\\
(s_k+x)/2 & s_{k-1}\le x\le s_{k+1},\\
(s_k+s_{k+1})/2 & x\ge s_{k+1}.
\end{cases}
$$

For both parities the difference of squared absolute errors factors as

$$
(\mu(x)-t)^2-(m(x)-t)^2
 =(\mu(x)-m(x))(\mu(x)+m(x)-2t).
$$

Both factors are affine within each cell. Their zeroes and the two median transitions partition the entire permitted interval $[L,U]$ into finitely many open intervals, clipped at the two specified bounds. On an even sample's middle cell the zeroes are $(2S-ns_k)/(n-2)$ and $(4nt-2S-ns_k)/(n+2)$. On either outer cell with constant median $c$, they are $nc-S$ and $n(2t-c)-S$. The proof is unchanged when $L$ or $U$ is negative or the target lies outside the interval. On each open interval, neither nonzero factor changes sign; a factor that vanishes identically gives ties throughout that interval. An exact midpoint evaluation therefore determines the winner on the **whole interval**, for every real $x$, rather than sampling a grid. The certificate lists every knot, winner at each knot, and winner on each open interval for each movable reading.

For a strict starting winner, the closure of every opposing open interval has a nearest point to the starting reading. The least of those distances over all reading positions is the exact reversal **infimum**. The selected boundary ties by continuity, so there is generally **no attained smallest strict reversal**: every arbitrarily small move beyond that threshold into the opposing interval reverses the winner. The certificate records an interior rational witness proving the opposing side exists. If the initial errors tie, the certificate reports `baseline-tie`; it does not invent an opposing baseline winner. If no position has an opposing interval, `best` is `null`.

The [independent checker](../tools/verify_odd_sample_flip.py) does not import the generator. It obtains candidate roots from the closed-form equations above; the odd middle-cell roots are $S/(n-1)$ and $(2nt-S)/(n+1)$. It compares the complete partition, directly recomputes squared errors at every knot and interval midpoint with exact `Fraction`, checks the witness and tie boundary, and selects the closest route. It checks the sample parity against the receipt version and rejects duplicate JSON keys, noncanonical rationals, altered fields, and files above 2 MB. Its SHA-256 fingerprints the exact bytes checked; it does not authenticate their author.

This is a reproducible mathematical argument under the specified rational inputs and continuous real movement. It is not a Lean/Coq formal proof, a new general theorem, a statistical estimator recommendation, or validation of a physical model. The existing five-reading browser lab uses a four-decimal discrete movement grid for some challenges; its **smallest selectable strict move** is different from this continuous infimum.
