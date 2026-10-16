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

The builder tests every eligible reading multiset and selected target, stopping at the first counterexample. It supports 3 through 7 readings; for even sample sizes, the median is the exact average of the two central sorted readings. The four fixed candidates above remain five-reading experiments. If a condition admits zero selected grid cases, the report explicitly says so and makes no claim of finite support. It exports an `inward-conditional-claim-v6` record. Existing v1–v5 conditional-claim files remain checkable.

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
The checked [v2 example](../examples/conditional-claim-v2.json) remains
available for a legacy offline audit.

Version 3 adds an independent `classification` beside the chosen-grid `search`.
For each of the 16 pairs without a general proof, the constructor scans the
fixed rational witness basis `{0, 50, 100}` for both five-reading multisets
and targets and records the first eligible counterexample. One exact witness
refutes its universal statement even if the visitor's grid had zero eligible
cases or no counterexample. All 20 pairs are therefore settled **within this
small registered claim language**: four proved implications and 16 refuted
universal claims. This is not a general conjecture solver. The browser and
Python checkers independently replay the fixed basis and require the exact
witness, its condition, mean, median, and strict winner. The selected-grid
`search` is still reproduced separately and may truthfully say
`unrefuted-on-finite-grid`; it cannot override the global witness. The checked
[v3 proof example](../examples/conditional-claim-v3.json) and
[v3 grid-miss example](../examples/conditional-claim-v3-grid-miss.json) show
both outcomes. The Python checker also expands the squared-distance identity
with integer exponent vectors and derives the permitted factor signs.

| Target condition | Lower no farther | Higher no farther | Mean no farther | Median no farther |
| --- | --- | --- | --- | --- |
| Any target | Witness | Witness | Witness | Witness |
| At/below midpoint | Lean proof | Witness | Witness | Witness |
| At/above midpoint | Witness | Lean proof | Witness | Witness |
| At/below both estimates | Lean proof | Witness | Witness | Witness |
| At/above both estimates | Witness | Lean proof | Witness | Witness |

“Witness” means a concrete exact five-reading and target counterexample,
not a proof that a search algorithm exhausted all real inputs. A single
verified violation suffices to refute the corresponding universal claim.

Version 4 adds a required `domain.readingCount` of exactly 3, 5, or 7 and a
statement spelling out that number. The mean divides the exact sum by this
count and the median is the central reading of each sorted multiset. Its
domain contains $\binom{k+n-1}{n}$ multisets for $k$ grid values and $n$
readings. The fixed `{0, 50, 100}` witness basis is independently replayed
at the **same** selected sample size. The four Lean implications concern the
two computed estimates and target, so they hold for each selected count;
Lean itself does not parse a receipt or formalize the sample mean/median.
The browser and Python verifiers separately enforce the count, statement,
multiset cardinality, first selected-grid witness, proof mapping, and first
fixed-basis witness. A 7-reading [proof example](../examples/conditional-claim-v4.json)
and a 3-reading [grid-miss example](../examples/conditional-claim-v4-grid-miss.json)
can be checked offline. V1–v3 receipts retain their original five-reading
schema and bytes.

Version 5 extends the conditional builder to **4 and 6 readings**. The
`domain.medianRule` field must be `central-order-statistics-v1`: for sorted
$x_1\le\dots\le x_n$, the median is $x_{(n+1)/2}$ when $n$ is odd and
$(x_{n/2}+x_{n/2+1})/2$ when $n$ is even. The mean remains
$(x_1+\dots+x_n)/n$. Both verifiers independently recompute these as exact
fractions for each selected-grid case and fixed-basis witness. Four general
implications about the **resulting two estimates** retain their existing
Lean bindings; the Lean source does not formalize the sorting or median
algorithm. The other 16 claim pairs have independently replayed exact
counterexamples for each supported size. The
[6-reading proof example](../examples/conditional-claim-v5.json) and
[4-reading fractional-median witness](../examples/conditional-claim-v5-even-witness.json)
are reproducible. V4 receipts remain odd-only and cannot assert an even count.

## Uniform endpoint construction in version 6

The 16 refutable claim pairs no longer rely on a search of the arbitrary
`{0, 50, 100}` basis. For **every integer $n\ge3$**, consider these two sorted
families, with conventional even-sample medians:

| Family | Readings | Mean | Median |
| --- | --- | --- | --- |
| One high | $0,\ldots,0,100$ | $100/n$ | $0$ |
| One low | $0,100,\ldots,100$ | $100-100/n$ | $100$ |

Since $n\ge3$, both central readings in an even sample, or its single central
reading in an odd sample, equal the repeated endpoint. Also
$0<100/n<100$. In the one-high family, target 0 strictly favors the median
and target 100 strictly favors the mean. In the one-low family, target 0
strictly favors the mean and target 100 strictly favors the median. Target 0
is at or below **both** estimates; target 100 is at or above both. Therefore
the corresponding weaker midpoint guards also hold. Choosing the appropriate
family and endpoint supplies an exact counterexample for each of the other
16 condition/prediction pairs, for any $n\ge3$. The four surviving pairs are
the existing real-number implications established by the squared-error
factorization and checked in Lean. This is a complete classification of the
registered 20-pair language for conventional mean and median, **not** a
general theorem-discovery algorithm or a novel mathematical theorem.

The [Lean module](../formal/InwardFormal.lean) checks the exact mean and
central-pair median formulas for both sorted endpoint lists for all $n\ge3$.
It also checks the strict winner at both endpoint targets. Its typed
`RegisteredClaim` theorem checks all 20 cells of the table above: four are
universal for arbitrary real estimates, and each other cell has a sorted
endpoint counterexample at every $n\ge3$. The Lean table is encoded
separately from the browser and Python tables; the build does not prove that
the source files have identical routing definitions. Separate Lean lemmas
equate its midpoint guard to the app's average-of-estimates rule and expand
the two endpoint guards into inequalities for each estimate. Arbitrary input
sorting and JSON receipt verification remain outside Lean.

The v6 `classification.construction` identifies one-high or one-low and its
endpoint target. The browser and Python verifiers independently rebuild all
$n$ readings, recompute the exact mean and median, check the target guard,
check that the predicted ordering is strictly false, and require the full
canonical record. The UI still bounds its finite selected-grid search to
3–7 readings. A certificate for one selected $n$ contains an exact witness
for that $n$; the algebra above explains why the family works for every
$n\ge3$. Older v1–v5 bytes retain their historical interpretation.

Check a v6 example with a central-pair median:

```sh
python3 tools/verify_conditional_claim.py examples/conditional-claim-v6-endpoint.json
```

Reproduce the grid-miss receipt and its verification:

```sh
python3 tools/verify_conditional_claim.py examples/conditional-claim-v5-even-witness.json
node --test tests/conjecture-lab.test.cjs
```

It rejects inconsistent witnesses, counts, statements, status, proof fields, duplicate JSON keys, unknown fields, and oversized files. It reports the SHA-256 of exact input bytes. The per-record checker relies on arithmetic and program correctness; Lean checks the separate general implications, not a particular JSON file. The proof concerns the specified mathematical model and does not establish the truth of an input target, quality of measurements, or practical superiority of an estimator. No inputs leave the device unless the visitor chooses to download or share the record.

The [Claim Inspector](../verify-conditional-claim.html) provides a second independent check directly in a browser. It accepts a downloaded JSON file or pasted text; nothing is uploaded. Its standalone verifier does **not** import the claim builder: it independently enumerates rational cases, checks the first eligible witness on both grids, expands the squared-error polynomials, and derives the permitted factor signs. It reuses the separately tested JSON parser from the Target Lens inspector to reject duplicate keys. The interface rejects malformed UTF-8 and records over 1 MB, hides any result as soon as a file or pasted value changes, and hashes the exact accepted bytes. The Node test cross-checks all twenty condition/prediction combinations across three domains against the Python implementation. The Lean proof checks the general factor-sign implications, while the two app checkers replay individual records. None of these checks certify input provenance.

After verification, **Save checked claim locally** retains the exact JSON in the [Local Research Archive](../research-archive.html). The archive also accepts exported claim files directly, independently replays them on import and on every archive visit, and indexes global classification separately from selected-grid status. It shares a 100-record device-local limit with Target Box certificates. Existing Target Box and older claim entries remain readable; a stored type, label, or timestamp is never treated as mathematical evidence. Export the exact JSON individually or as a [portable checked collection](RESEARCH_COLLECTION.md). Browser storage can be cleared and is not encrypted, synchronized, or evidence of authorship.
