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
that the five readings, mean, median, or target in a particular exported JSON
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

This verifies the **general mathematical implications**, not the app's JSON
parser, the authenticity of measurements, the correctness of an arbitrary
claim, or a newly discovered mathematical result. The app and independent
Python verifier still replay each specific certificate and finite search.
