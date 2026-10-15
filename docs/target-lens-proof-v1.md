# Target Lens proof receipt v1

This is a portable certificate for the five-reading **what-if model** in Target Lens. It states exactly what follows from five stipulated readings, a closed target interval, and independently bounded reading changes. It is not a measurement record or a statement that the target is correct.

## Verify

1. [Download a receipt from Target Lens](../target-lens.html) after choosing readings, target interval, and drift.
2. [Check it in the browser](../verify-proof.html) by choosing the JSON file. The file is read locally by the page.
3. Or run one of the offline checkers from the repository root:

```sh
node tools/verify-target-lens.cjs receipt.json
python3 tools/verify_target_lens.py receipt.json
```

Both exit nonzero for a rejected receipt. The browser and Node use the same JavaScript verifier; Python is a separate implementation. The CI differential gate generates seeded cases, corrupts claims and inputs, checks boundary conditions, and compares both verdicts and fingerprints. Run it locally with `python3 tools/differential_verify.py --seed 620810 --cases 64`.

After a successful check, the browser's printable sheet and both command line checkers show a `Receipt SHA-256` fingerprint. It hashes the **exact UTF-8 text fed to the verifier**, including whitespace and key order. Receipt files must contain valid UTF-8; their bytes are hashed without reformatting. To pair a printed sheet with a saved receipt, run either checker on that file and compare all 64 hexadecimal characters. Paste input is hashed as pasted, including leading and trailing whitespace. Reserializing the same JSON changes the fingerprint even when the mathematical claim stays the same. The fingerprint identifies matching text; it does not prove who made the receipt or whether its inputs are true.

## Integer encoding

The format is `inward-target-lens-proof-v1` with `scale: 1000000`. Each reading is an integer number of millionths of a unit in `[0, 100]`, divisible by 100 because input readings have at most four decimal places. The target bounds, selected target, and drift are also integer millionths. Both verifiers reject out-of-range values and reversed target bounds. The selected target is contextual; the certificate quantifies over **every real target** in the closed interval.

In the equations below, $r_i$ and $\varepsilon$ are the decoded values in ordinary units. For each reading $r_i$, the allowed real value $x_i$ lies in

$$
 L_i=\max(0,r_i-\varepsilon)\ \le x_i\le\ U_i=\min(100,r_i+\varepsilon).
$$

All five reading intervals are independent. There is no probability distribution. In the JSON, `inputs.readings`, `low`, `high`, `drift`, and `selectedTarget` use the millionth-unit encoding. `claim.kind` is `strict`, `tie-possible`, or `all-tie`; `claim.winner` is `Mean`, `Median`, or `null`.

## What is proved

Let $S=\sum_i x_i$, $M=\operatorname{median}(x_1,\ldots,x_5)$, and $t$ be the target. The sign of the difference of squared absolute errors is the sign of

$$
 \left(S-5M\right)\left(S+5M-10t\right).
$$

The receipt's `estimateRange` and `referenceRange` are the **exact minimum and maximum** of these two integer-unit factors over the full reading box and target interval. Divide either reported integer by $5\cdot10^6$ to read the corresponding factor $\text{mean}-\text{median}$ or $\text{mean}+\text{median}-2t$ in ordinary units.

The reference factor is monotone in every reading and opposite in the target, so its extrema occur at all-low readings with the high target and all-high readings with the low target. To bound the estimate factor, partition the reading box by which reading is the median and which two are below it. There are $5\binom{4}{2}=30$ cells. At a fixed feasible median, the other four readings move to their constrained endpoints. The JavaScript verifier checks the limiting feasible median values. The Python verifier checks every interval breakpoint of the resulting piecewise-affine functions, including those limits.

If both ranges exclude zero, their signs give the same strict winner everywhere. If either includes zero, a tie exists: each factor is continuous on a connected reading box (and target interval), so its image contains every value between its extrema. If the estimate factor is identically zero, mean and median coincide for every allowed reading configuration and every target ties.

`tieTargets` gives an exact interval of targets where a tie can occur, using numerator fields divided by `denominator: 10000000`. Its lower and upper endpoints are the midpoints of mean and median for the all-low and all-high readings. This midpoint is monotone in each reading and continuous over the connected box, so every intermediate target is attainable. When mean and median can coincide, `tieTargets.kind` is `all`: that reading configuration ties at every target from 0 through 100.

## Witness and limitations

For `tie-possible`, `claim.witness` is either an explicit `readings` array and `targetUnits`, or a `path` with `from`, `to`, endpoint targets, and a rational fraction `numerator/denominator`. A checker verifies the endpoints are inside the allowed box and interval, interpolates with exact rational arithmetic, and checks that at least one factor equals zero at the resulting point. A strict or all-tie receipt has a `null` witness.

The checkers recompute every claimed factor range, verdict, tie-target band, and any witness from the supplied inputs. They do **not** authenticate the JSON author, attest to input provenance, establish a target's truth, assign probabilities, or validate the model for real-world use. If someone changes the inputs and recomputes a consistent receipt, it is a different valid what-if statement. The MIT license and attribution are in the repository root.
