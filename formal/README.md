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

For the checked four-reading example `[40,45,50,80]` at target `50`, the
module also computes the mean and central-pair median on the explicitly
ordered list `[40,x,50,80]`. For `40 ≤ x ≤ 50`,
`four_reading_middle_mean_wins_iff` proves that the mean is strictly closer
exactly when `x < 130/3`. Separate theorems verify the median-winning start
at `x=45`, the tie at `130/3`, the mean-winning witness at `125/3`, and that
every strict reversal *within this middle cell* moves farther than `5/3`.
This proves the exhibited local route, not its optimality among all movable
readings and cells; the receipt verifier checks that global selection.

`InwardFormal.AffinePartition` proves a general interval principle behind
both parities' continuous search. An affine factor with no zero in an open
cell has the same strict sign at every point as at its midpoint: opposite
signs would force an explicit zero between them. The product of two such
factors has the same winner sign throughout the cell. A factor zero at two
distinct points is identically zero, covering the degenerate tie case.
These theorems justify the midpoint argument when the cell is known to
contain no roots. `no_zero_if_root_outside` derives that premise from a
nonconstant factor's exact root at or outside the cell; the product theorem
then applies directly to two such located roots. The code that enumerates
and clips every root,
sorts arbitrary input, and selects the global closest route is still checked
by the independent certificate verifier rather than proved equivalent to
this Lean model.

`InwardFormal.TargetHorizon` formalizes the v6 midpoint-target calculation
on a cell where both estimates are affine in the moved reading. A positive
mean slope and nonnegative median slope make the midpoint target strictly
increasing. Its interpolation theorem constructs an in-cell reading for
**every real target** between the endpoint midpoints and proves the two
absolute errors tie there. `two_cell_error_tie` joins adjacent affine cells
at a common midpoint knot, including a target exactly at that knot.
`common_anchor_horizon_tie` proves the global no-gap argument: all routes
share the original sample midpoint, so a target below that anchor can be
reached along the route attaining the lower endpoint, while a target above
it can be reached along the route attaining the upper endpoint. These can
be different routes. Every target between the reported endpoints has an
exact equal-error witness provided each route interpolates between its
endpoint midpoints. `MidpointPath` makes this route premise composable:
`affine_cell_path` constructs a cell when its affine formula agrees with the
route, `MidpointPath.append` glues adjacent cells, and
`midpoint_path_covers` proves interpolation across any finite chain.
`cell_paths_horizon_tie` derives a global tie from such paths on each side of
the original reading, including when the endpoint routes differ. A separate
theorem gives strict winners outside supplied global midpoint bounds for an arbitrary collection of routes whose
estimates have the same strict ordering. Equality of the estimates on even
one route blocks either universal strict winner for every target. The module
also checks the mean, median, and target-6 tie for the six-reading v6 example,
both exhibited endpoint midpoint values `17/3` and `95/12`, and the
five-reading all-target equality example. It now builds explicit affine-cell
paths for the two six-reading routes attaining those endpoint values.
`strict_outside_horizon_open_margin` proves an exact symmetric open radius
for any target outside supplied global midpoint bounds, under strict
estimate ordering. The same theorem applies when Median is the lower estimate
by swapping its function arguments. `target_margin_boundary_tie` proves that
an attained midpoint endpoint is an actual equal-error boundary, making that
radius maximal. These lemmas justify the independently rechecked target-margin
answers in the browser and Python inspector; they do not parse certificates.
`six_reading_inner_horizon_tie` proves that **every real target** in
`[17/3,95/12]` has an exact equal-error reading on one of those two routes,
even though the lower and upper endpoint routes differ. This extends the
example beyond the single target-6 probe in its JSON receipt. The
`six_*_route_sorted_median` theorems exhibit sorted permutations of the
original six readings after each permitted one-reading move and prove that
their order-statistic medians equal the route formulas on every cell.
`six_reading_sorted_sample_horizon_tie` states the full inner tie result
using `sampleMean` and `orderedMedian` of those concrete lists.
`SixReadingMove` enumerates all six index choices in the original sample,
including its three positions containing `8`. For every real moved reading
in `[0,10]`, `six_move_sorted_median` exhibits an ordered permutation of
that moved sample, and `six_move_global_bounds` proves strict Mean-below-Median
ordering and both exact midpoint bounds. The theorem
`six_reading_full_horizon` combines these results: every target below
`17/3` strictly favors Mean on **all six routes**, every target above
`95/12` strictly favors Median on all routes, and each target in the closed
middle interval has an attained tie. Its statement accepts *any* sorted
permutation of each moved sample; sorted-permutation uniqueness removes
dependence on which sorting implementation produced it.

These proofs take agreement between each route and its affine cell formula,
adjacent cell boundaries, endpoint attainment, common anchor, global bounds,
and route ordering as hypotheses where used. The path theorem proves that
the supplied cells compose without a target gap; it does not construct the
paths from a concrete receipt. The six-reading example has an explicit
global bound proof for all six moves; the general theorem still takes bounds
as premises. These proofs do not establish that an arbitrary JSON record
enumerates every route or cell. There is no general machine-checked bridge
from arbitrary JSON routes to the Lean definitions. The
independently implemented browser and Python receipt verifiers check their
own concrete calculations from the supplied readings. Lean does not parse
v6 JSON.

For the **fixed six-reading example only**, [TargetHorizonReceipt.lean](TargetHorizonReceipt.lean)
is generated from the exact JSON bytes *after* the independent Python verifier
has checked the full receipt. It contains the six extracted route literals,
original readings, movement bounds, and target-horizon endpoints. Lean proves
that each route agrees with `sixMovedSample` for every real moved reading and
that the literal bounds match `six_reading_full_horizon`; its specialization
then states the full three-region result using the extracted route function.
The formal CI job regenerates the file and typechecks it after building
`InwardFormal`. A changed receipt or stale export fails the gate. This is a
checked bridge for the worked model, not a Lean JSON parser or a proof that
the verifier's general algorithm is sound for arbitrary receipts.

```sh
python3 tools/export_target_horizon_lean.py --check
(cd formal && lake env lean TargetHorizonReceipt.lean)
```

`InwardFormal.AffineEquivariance` proves that changing units by
`v ↦ scale * v + shift` multiplies the squared-error difference and its
factored form by `scale²`. For positive `scale`, a strict mean win and an
exact tie therefore remain unchanged for arbitrary real estimates and
targets. It additionally proves that the mean of every nonempty real list,
and both central entries of its order-statistic median, transform by the
same affine map. A positive scale preserves sorted order, so this applies
to both odd and even already sorted samples. The resulting list-level
theorems preserve strict mean wins and exact ties after recomputing both
estimates. Seeded Python and browser tests separately check the stronger
whole-certificate rule: when transformed inputs satisfy the documented
input limits, winners and route indices stay the same, all knots,
thresholds, and witnesses transform by the same affine map, and distances
multiply by `scale`. The Lean statements do not formalize the particular
runtime sorting algorithm, its JSON parser, or source equivalence.

`InwardFormal.AffineEnvelope` proves the universal algebraic step used by
the v4 Joint Reading Box audit. If one affine line is no higher than a
competitor at both endpoints of a nonempty target interval, it remains no
higher at **every real target** between them. For a finite list of competing
lines, checking those endpoint inequalities and exhibiting the reported
line in the list proves that it is an **attained exact minimum throughout
the piece**. Two additional theorems characterize the exact closed
threshold side of an attained cutoff for negative and positive slopes.
The proof uses nonnegative endpoint weights `(right − t)` and `(t − left)`
and has no target-grid assumption.

The theorem takes the complete candidate list and its endpoint checks as
premises. It does not prove that enumerating endpoint-valued reading
candidates covers every vertex of each median ordering cell, that a JSON
receipt supplies the premises, or that the reported pieces cover the full
target sweep. The independent browser and Python verifiers check those
concrete claims with exact rational arithmetic. The general v4
arbitrary-interval vertex argument remains an elementary written proof,
not a Lean theorem.

`InwardFormal.AffineProduct` formalizes another step used by the exact v3
margin and v4 target sweep. If two affine factors are nonnegative at both
ends of a segment, their product at every interior point is at least the
smaller endpoint product. This includes opposing factor slopes, where the
product can rise above both endpoint values. A second theorem carries any
common endpoint margin through the segment. The mathematical argument
iterates this fact over convex combinations of median-ordering-cell
vertices. The Lean module proves the segment step; it does not formalize
the convex-hull decomposition or the endpoint-valued vertex enumeration.

To run the route gate after `lake build`:

```sh
lake env lean --run ExportRegisteredRoutes.lean > /tmp/inward-routes.tsv
python3 ../tools/check_registered_routes.py /tmp/inward-routes.tsv
```
