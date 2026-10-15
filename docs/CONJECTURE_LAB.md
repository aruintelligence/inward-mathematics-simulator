# Interactive finite conjecture laboratory

The [Conjecture Lab](../conjecture-lab.html) tests four registered five-reading statements over a user-chosen **finite** rational grid. It visits every nondecreasing five-reading multiset drawn from 2–6 distinct reading values and tests 2–12 distinct targets. Values must be exact reduced fractions from 0 to 100 (up to nine digits per numerator or denominator). The midpoint claim constructs its own exact midpoint for each multiset with distinct mean and median; it is not restricted to the chosen target grid.

The mean, median, absolute-error comparison, and witnesses use integer fractions throughout. Plots scale to the smallest and largest values in the selected reading and target grids. Their coordinates are approximate screen positions only; the displayed labels and downloaded JSON contain the exact values. A valid counterexample disproves its universal statement within this mathematical model. When the finite grid has no counterexample, the tool says **unrefuted on this finite grid**. It does not label that observation a theorem.

The four fixed candidate IDs are `median-never-worse`, `mean-never-worse`, `target-independent`, and `midpoint-tie`. The first three have counterexamples on the default grid. The midpoint result has a [separate general mathematical argument](ESTABLISHED_IDENTITIES.md); this finite run does not claim to supply that proof. Neither this page nor the argument authenticates measurements or recommends an estimator for real data.

Download the versioned `inward-conjecture-experiment-v1` JSON record and replay its entire finite search independently:

```sh
python3 tools/verify_conjecture_experiment.py inward-conjecture-experiment-v1.json
```

The Python verifier has separate arithmetic and enumeration code. It checks canonical sorted input grids, domain size, claim identifiers and statements, tested-case counts, first counterexamples, exact estimates, and outcomes. It rejects duplicate JSON keys, unexpected fields, and altered claims. The SHA-256 reported by the browser and verifier is for exact bytes and reproducibility, not authorship. Editing the record or changing the grid calls for a fresh replay. New predicates require a new version and an independent checker.

Existing work and attribution remain with Daniel Jacob Read IV / ĀRU Intelligence Inc. See [CITATION.cff](../CITATION.cff) and [LICENSE](../LICENSE).

## Conditional claim builder

The same page now lets a visitor form a precise universal statement: select a condition on the target (`any`, at/below or at/above the estimates' midpoint, at/below both estimates, or at/above both) and predict whether the lower, higher, mean, or median estimate is no farther from the target. This is a deliberately small mathematical language. A phrase like “no farther” includes ties; no free-form or unsupported theorem is silently interpreted.

The engine tests every eligible reading multiset and selected target, stopping at the first counterexample. If a condition admits zero selected grid cases, the report explicitly says so and makes no claim of finite support. It exports a separate `inward-conditional-claim-v1` record, leaving the fixed four-candidate v1 experiment unchanged.

For four condition and prediction pairs, the report also carries a **general algebraic proof** independent of the grid:

| Condition | Valid conclusion |
| --- | --- |
| target ≤ midpoint of the two estimates | lower estimate is no farther |
| target ≤ both estimates | lower estimate is no farther |
| target ≥ midpoint of the two estimates | higher estimate is no farther |
| target ≥ both estimates | higher estimate is no farther |

For any real $a\le b$ and $t$, exact expansion gives

$$
(a-t)^2-(b-t)^2=(a-b)(a+b-2t).
$$

If $t\le(a+b)/2$, the first factor is nonpositive and the second is nonnegative, so $(a-t)^2\le(b-t)^2$. The absolute-error ordering is the same. If $t\ge(a+b)/2$, both factors are nonpositive, so the ordering reverses. The stronger endpoint guards imply the corresponding midpoint inequality because $a\le(a+b)/2\le b$. Equal estimates and targets on boundaries are included. These are established elementary consequences of the identity, **not newly discovered theorems**.

Other composed statements receive a counterexample if one appears; otherwise their status is `unrefuted-on-finite-grid` and there is no proof. A genuine universal counterexample settles its universal claim even when the finite search was small; absence of one does not. The Python checker recomputes the full finite search with `Fraction`, expands both polynomials with integer exponent vectors, and derives the permitted factor signs from the selected condition:

```sh
python3 tools/verify_conditional_claim.py inward-conditional-claim-v1.json
node --test tests/conjecture-lab.test.cjs
```

It rejects inconsistent witnesses, counts, statements, status, proof fields, duplicate JSON keys, unknown fields, and oversized files. It reports the SHA-256 of exact input bytes. The checker and mathematical argument rely on arithmetic and program correctness; they are not formal proof-assistant validation. The proof concerns the specified mathematical model and does not establish the truth of an input target, quality of measurements, or practical superiority of an estimator. No inputs leave the device unless the visitor chooses to download or share the record.
