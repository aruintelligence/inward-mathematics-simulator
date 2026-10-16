# Formal midpoint proof

`InwardFormal.lean` is a Lean 4 / Mathlib formalization of the real-number
midpoint comparison used by four `squared-error-factor-sign-v1` certificates
in the Conditional Claim Lab. It proves the squared-error factorization,
both midpoint guards, both stronger endpoint guards, and the midpoint tie.
The statements include equality cases and arbitrary real inputs. They are
established elementary results, not newly discovered theorems.

The module also proves the converses for distinct ordered estimates `a < b`:
`|a-t| ≤ |b-t|` if and only if `2*t ≤ a+b`, and `|b-t| ≤ |a-t|` if
and only if `a+b ≤ 2*t`. Their tie occurs if and only if `2*t = a+b`;
coincident estimates tie for every target. Together these results justify an
exhaustive three-region target map for any *fixed* pair of estimates, even
when the chosen finite target grid misses the crossover. They do not verify
that the 3–7 readings, mean, median, or target in a particular exported JSON
record were parsed or computed correctly.

From this directory, with `elan` installed:

```sh
lake update
lake exe cache get
lake build
lake env leanchecker InwardFormal
```

The `Formal midpoint proof` GitHub Actions job builds the module with
Lean 4 v4.35.0 and Mathlib v4.35.0, also runs Lean's checker and audits the
theorems' axioms. The declaration names in this file can be compared with
the four proof-bearing pairs documented in `docs/CONJECTURE_LAB.md`.
The v2–v6 claim exporters name one of those four declarations and pin this
file's source revision. Its independent receipt verifiers check the mapping
and schema; they do not turn a JSON file into a Lean proof object.

The v6 refutation construction uses two sorted endpoint sample families for
every integer sample size at least three. The same Lean module defines the
mean and central-pair median on those lists and proves their exact formulas,
including the even-size case. It also proves that the means lie strictly
between 0 and 100 and that each family switches its strict winner between
targets 0 and 100.

`InwardFormal.RegisteredClaim` defines the five target conditions, four
no-farther predictions, and their real-number semantics. The theorem
`belowMidpoint_iff` (and its upper counterpart) equates the formal guard to
the app's average-of-estimates midpoint; the both-estimates guard equivalences
spell out the two individual inequalities. The theorem
`universal_iff_established` checks the **entire registered 20-pair table**:
exactly the four documented implications are universal for arbitrary real
estimates. For every other pair and every integer $n\ge3$, `classify` gives
one of the explicit endpoint samples and an eligible target with a strictly
false prediction. `refutation_disproves_universal` establishes that such a
witness rules out the universal statement. These are elementary facts, not
novel theorems.

The Lean result covers the two explicit sorted sample families, the general
two-estimate implications, and a separate formal encoding of the registered
routing table. It does not formalize the UI's arbitrary sorting routine, the
app's JSON parser, or the correspondence between the formal encoding and
runtime source code. It does not authenticate measurements or certify an
arbitrary claim. The app and independent Python verifier still replay each
specific certificate and finite search.

`endpointRoute_sound` proves that each selected endpoint refutes its
prediction for every $n\ge3$, or that a `none` cell is universal. The formal
CI job executes `ExportRegisteredRoutes.lean` and compares all 20 route
outputs with the browser builder and independent Python verifier for every
supported size 3–7. A changed route or classification fails CI. This is a
cross-implementation test of those choices, not a formal proof of runtime
source equivalence or JSON verification in Lean.

`InwardFormal.EvenSample` proves the affine factor equations for the even
sample's middle median cell `(c + x) / 2`, their exact squared-error product,
and the unique real root of each factor for `n > 2`. It also proves the two
unique roots for an outer cell with constant median `c` and nonzero `n`.
These are precisely the four root formulas used by the v3 continuous-movement
certificate. The statements allow arbitrary real fixed sums, targets, and
movement values; admissible cell bounds still determine which roots apply.
The Lean module does not prove the general sorting and cell-selection logic,
the finite partition's completeness, the global infimum selection, or the
browser/Python implementations. The independent receipt verifiers check
individual records with exact rational arithmetic.

To run the route gate after `lake build`:

```sh
lake env lean --run ExportRegisteredRoutes.lean > /tmp/inward-routes.tsv
python3 ../tools/check_registered_routes.py /tmp/inward-routes.tsv
```
