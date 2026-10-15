# Established estimator identities

The [Discovery Archive](../discovery.html) tests five claims on a bounded rational grid. Two claims have separate, elementary arguments valid for **all real inputs** in the stated mathematical model. These identities are established mathematics; they are not newly discovered theorems. The scan still labels them `unrefuted-on-finite-grid`, because that label describes what its finite search itself established.

## Midpoint tie

For any real estimates $a,b$ and real target $t$, expand and factor:

$$
(a-t)^2-(b-t)^2
=a^2-b^2-2at+2bt
=(a-b)(a+b-2t).
$$

At $t=(a+b)/2$, the second factor is zero. Equivalently, the signed residuals are $(a-b)/2$ and $(b-a)/2$, so their absolute values are equal. This includes $a=b$ and any negative readings or target. If $a$ and $b$ are the mean and median of five readings, it gives their tie at the midpoint of those two estimates. It does not imply that either estimate wins for every other target.

## Reordering invariance

For any five real readings $r_1,\ldots,r_5$ and permutation $\pi$ of their five positions,

$$
\frac{1}{5}\sum_{i=1}^{5}r_{\pi(i)}
=\frac{1}{5}\sum_{i=1}^{5}r_i.
$$

The permuted sequence has the same multiset, including multiplicities, so sorting either sequence gives the same ordered list. Its third entry, the median of five, is therefore identical. Both estimates are identical before and after the permutation; their absolute errors relative to **any** real target $t$ are identical too. Repeated reading values cause no exception.

## Reproduce the check

From the repository root:

```sh
python3 tools/verify_estimator_identities.py examples/estimator-identities-v1.json
python3 -m unittest discover -s tools -p 'test_discover_candidates.py' -v
python3 tools/render_discovery_page.py --check
```

The [proof record](../examples/estimator-identities-v1.json) stores the expanded polynomial coefficients, the two midpoint residual coefficient maps, the mean coefficients, median rank, and the number of permutations. The [checker](../tools/verify_estimator_identities.py) derives the factorization and midpoint residuals anew with integer exponent vectors and exact `Fraction` coefficients. It then enumerates all $5!=120$ index permutations, checks the symbolic mean coefficient vector and index multiset, and rejects a record whose claims or fields disagree. Neither operation samples real readings. The CLI rejects duplicate JSON keys, nonfinite constants, and oversized records, and prints the SHA-256 of the exact bytes it checked. This fingerprint permits comparison with a saved file; it does not authenticate its author.

The mathematical argument relies on the ordinary axioms of real arithmetic, the definition of absolute value and median, and the fact that permutations preserve multisets. The software check additionally trusts Python's `Fraction`, sorting, permutation enumeration, JSON parsing, and this small checker implementation. It is a reviewable symbolic check, **not a formal proof in Lean, Coq, or another proof assistant**. The separate finite archive replay verifies counterexamples and scan boundaries; its status labels are deliberately not upgraded by this proof record. Neither the identities nor a proof receipt validates real-world inputs, scientific measurements, or commercial performance.
