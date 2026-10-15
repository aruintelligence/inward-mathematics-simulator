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
