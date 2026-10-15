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

The engine tests every eligible reading multiset and selected target, stopping at the first counterexample. If a condition admits zero selected grid cases, the report explicitly says so and makes no claim of finite support. It exports a separate `inward-conditional-claim-v2` record, leaving the fixed four-candidate v1 experiment unchanged. Existing v1 conditional-claim files remain checkable.

For four condition and prediction pairs, the report also carries a **general algebraic proof** independent of the grid:

| Condition | Valid conclusion | Lean declaration |
| --- | --- | --- |
| target ≤ midpoint of the two estimates | lower estimate is no farther | `lower_no_worse_at_midpoint` |
| target ≤ both estimates | lower estimate is no farther | `lower_no_worse_below_both` |
| target ≥ midpoint of the two estimates | higher estimate is no farther | `higher_no_worse_at_midpoint` |
| target ≥ both estimates | higher estimate is no farther | `higher_no_worse_above_both` |

For any real $a\le b$ and $t$, exact expansion gives

$$
(a-t)^2-(b-t)^2=(a-b)(a+b-2t).
$$

If $t\le(a+b)/2$, the first factor is nonpositive and the second is nonnegative, so $(a-t)^2\le(b-t)^2$. The absolute-error ordering is the same. If $t\ge(a+b)/2$, both factors are nonpositive, so the ordering reverses. The stronger endpoint guards imply the corresponding midpoint inequality because $a\le(a+b)/2\le b$. Equal estimates and targets on boundaries are included. These are established elementary consequences of the identity, **not newly discovered theorems**. The [Lean formalization](../formal/README.md) states and checks all four implications over the real numbers; its CI job checks the proof objects and axioms.

For distinct fixed estimates $a<b$, the formalization checks the **converses**:
$|a-t|\le|b-t|$ exactly when $2t\le a+b$, and $|b-t|\le|a-t|$ exactly when
$a+b\le2t$. Thus $a$ wins strictly below the midpoint, the two tie only at
the midpoint, and $b$ wins strictly above it. If $a=b$, they tie for every
real target. After a composed claim finds a counterexample, the page uses
exact rational arithmetic to display this complete target partition for that
fixed witness's mean and median, including a crossover that may not be in the
chosen target grid. The partition explains the witness; it does not turn the
refuted universal claim into a theorem.

Version 2 adds a `formal` field to the receipt. For each of the four
proof-bearing condition/prediction pairs in the table, it names the exact
`InwardFormal` declaration and pins the source revision to commit
`59a7e9dccd3cc328f855fc1fce1d6b6d55fdd705`. For a counterexample or an
unrefuted finite search, `formal` must be `null`. The independent browser and
Python verifiers derive the expected mapping from the claim choices and reject
missing, swapped, altered, or invented references. A legacy v1 receipt has no
machine-readable theorem reference, and is displayed as such. The pinned link
supports inspection of the Lean proof that CI built and audited; the per-file
verifiers do not invoke Lean on arbitrary JSON, authenticate a source commit,
or validate the supplied measurements.
The checked [v2 example](../examples/conditional-claim-v2.json) is a
reproducible starting point for an offline audit.

Other composed statements receive a counterexample if one appears; otherwise their status is `unrefuted-on-finite-grid` and there is no proof. A genuine universal counterexample settles its universal claim even when the finite search was small; absence of one does not. The Python checker recomputes the full finite search with `Fraction`, expands both polynomials with integer exponent vectors, and derives the permitted factor signs from the selected condition:

```sh
python3 tools/verify_conditional_claim.py inward-conditional-claim-v2.json
node --test tests/conjecture-lab.test.cjs
```

It rejects inconsistent witnesses, counts, statements, status, proof fields, duplicate JSON keys, unknown fields, and oversized files. It reports the SHA-256 of exact input bytes. The per-record checker relies on arithmetic and program correctness; Lean checks the separate general implications, not a particular JSON file. The proof concerns the specified mathematical model and does not establish the truth of an input target, quality of measurements, or practical superiority of an estimator. No inputs leave the device unless the visitor chooses to download or share the record.

The [Claim Inspector](../verify-conditional-claim.html) provides a second independent check directly in a browser. It accepts a downloaded JSON file or pasted text; nothing is uploaded. Its standalone verifier does **not** import the claim builder: it independently enumerates rational cases, checks the first eligible witness, expands the squared-error polynomials, and derives the permitted factor signs. It reuses the separately tested JSON parser from the Target Lens inspector to reject duplicate keys. The interface rejects malformed UTF-8 and records over 1 MB, hides any result as soon as a file or pasted value changes, and hashes the exact accepted bytes. The Node test cross-checks all twenty condition/prediction combinations across three domains against the Python implementation. The Lean proof checks the general factor-sign implications, while the two app checkers replay individual records. None of these checks certify input provenance.

After verification, **Save checked claim locally** retains the exact JSON in the [Local Research Archive](../research-archive.html). The archive also accepts exported claim files directly, independently replays them on import and on every archive visit, and indexes the distinction between an algebraic proof, a finite counterexample, and an unrefuted finite grid. It shares a 100-record device-local limit with Target Box certificates. Existing Target Box entries remain readable; a stored type, label, or timestamp is never treated as mathematical evidence. Export the exact JSON individually or as a [portable checked collection](RESEARCH_COLLECTION.md). Browser storage can be cleared and is not encrypted, synchronized, or evidence of authorship.
