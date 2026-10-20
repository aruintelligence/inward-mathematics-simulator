import Mathlib

/-!
# Formal midpoint error comparison

These are elementary real-number facts underlying the four algebraic
certificates emitted by the conditional claim verifier. They say nothing about
the provenance of measurements or the truth of other generated claims.
-/

namespace InwardFormal

/-- The squared-error identity, including equal estimates and negative inputs. -/
theorem squared_error_factorization (a b t : ℝ) :
    (a - t) ^ 2 - (b - t) ^ 2 = (a - b) * (a + b - 2 * t) := by
  ring

/-- A target at or below the midpoint is no farther from the lower estimate. -/
theorem lower_no_worse_at_midpoint (a b t : ℝ) (hab : a ≤ b)
    (ht : 2 * t ≤ a + b) : |a - t| ≤ |b - t| := by
  have hleft : a - b ≤ 0 := sub_nonpos.mpr hab
  have hright : 0 ≤ a + b - 2 * t := by linarith
  have hdiff : (a - t) ^ 2 - (b - t) ^ 2 ≤ 0 := by
    rw [squared_error_factorization]
    exact mul_nonpos_of_nonpos_of_nonneg hleft hright
  exact sq_le_sq.mp (sub_nonpos.mp hdiff)

/-- A target at or above the midpoint is no farther from the higher estimate. -/
theorem higher_no_worse_at_midpoint (a b t : ℝ) (hab : a ≤ b)
    (ht : a + b ≤ 2 * t) : |b - t| ≤ |a - t| := by
  have hleft : a - b ≤ 0 := sub_nonpos.mpr hab
  have hright : a + b - 2 * t ≤ 0 := by linarith
  have hdiff : 0 ≤ (a - t) ^ 2 - (b - t) ^ 2 := by
    rw [squared_error_factorization]
    exact mul_nonneg_of_nonpos_of_nonpos hleft hright
  exact sq_le_sq.mp (sub_nonneg.mp hdiff)

/-- The endpoint guard used by the claim builder implies the midpoint guard. -/
theorem lower_no_worse_below_both (a b t : ℝ) (hab : a ≤ b)
    (ht : t ≤ a) : |a - t| ≤ |b - t| := by
  apply lower_no_worse_at_midpoint a b t hab
  linarith

/-- The upper endpoint guard used by the claim builder implies the midpoint guard. -/
theorem higher_no_worse_above_both (a b t : ℝ) (hab : a ≤ b)
    (ht : b ≤ t) : |b - t| ≤ |a - t| := by
  apply higher_no_worse_at_midpoint a b t hab
  linarith

/-- At the exact midpoint both estimates have equal absolute error. -/
theorem midpoint_tie (a b t : ℝ) (ht : 2 * t = a + b) :
    |a - t| = |b - t| := by
  have hright : a + b - 2 * t = 0 := by linarith
  have hdiff : (a - t) ^ 2 - (b - t) ^ 2 = 0 := by
    rw [squared_error_factorization, hright, mul_zero]
  exact (sq_eq_sq_iff_abs_eq_abs (a - t) (b - t)).mp (sub_eq_zero.mp hdiff)

/-!
The implications above say when one estimate is no farther. For distinct
estimates, the converses locate the *only* crossover. This makes the target
partition exhaustive, rather than an inference from a few sampled targets.
-/

/-- If `a < b`, the lower estimate is no farther exactly up to the midpoint. -/
theorem lower_no_worse_iff_target_below_midpoint (a b t : ℝ) (hab : a < b) :
    |a - t| ≤ |b - t| ↔ 2 * t ≤ a + b := by
  constructor
  · intro herror
    have hsq : (a - t) ^ 2 ≤ (b - t) ^ 2 := sq_le_sq.mpr herror
    have hproduct : (a - b) * (a + b - 2 * t) ≤ 0 := by
      rw [← squared_error_factorization]
      exact sub_nonpos.mpr hsq
    by_contra htarget
    have hleft : a - b < 0 := sub_neg.mpr hab
    have hright : a + b - 2 * t < 0 := by linarith
    have hpositive : 0 < (a - b) * (a + b - 2 * t) :=
      mul_pos_of_neg_of_neg hleft hright
    linarith
  · exact lower_no_worse_at_midpoint a b t (le_of_lt hab)

/-- If `a < b`, the higher estimate is no farther exactly from the midpoint. -/
theorem higher_no_worse_iff_target_above_midpoint (a b t : ℝ) (hab : a < b) :
    |b - t| ≤ |a - t| ↔ a + b ≤ 2 * t := by
  constructor
  · intro herror
    have hsq : (b - t) ^ 2 ≤ (a - t) ^ 2 := sq_le_sq.mpr herror
    have hproduct : 0 ≤ (a - b) * (a + b - 2 * t) := by
      rw [← squared_error_factorization]
      exact sub_nonneg.mpr hsq
    by_contra htarget
    have hleft : a - b < 0 := sub_neg.mpr hab
    have hright : 0 < a + b - 2 * t := by linarith
    have hnegative : (a - b) * (a + b - 2 * t) < 0 :=
      mul_neg_of_neg_of_pos hleft hright
    linarith
  · exact higher_no_worse_at_midpoint a b t (le_of_lt hab)

/-- For distinct estimates, equal absolute error occurs only at the midpoint. -/
theorem distinct_estimates_tie_iff_midpoint (a b t : ℝ) (hab : a < b) :
    |a - t| = |b - t| ↔ 2 * t = a + b := by
  constructor
  · intro heq
    have hlo := (lower_no_worse_iff_target_below_midpoint a b t hab).mp (le_of_eq heq)
    have hhi := (higher_no_worse_iff_target_above_midpoint a b t hab).mp (le_of_eq heq.symm)
    linarith
  · exact midpoint_tie a b t

/-- When estimates coincide, every target is an equal-error target. -/
theorem coincident_estimates_tie (a b t : ℝ) (hab : a = b) :
    |a - t| = |b - t| := by
  rw [hab]

/-!
The v6 counterexamples use sorted samples with one endpoint appearing once.
These definitions deliberately expose the same central-order-statistics rule
used by the independent receipt verifiers. The function `orderedMedian` expects
its input to be sorted and nonempty; the theorems below only apply to the two
explicit sorted families of length at least three.
-/

/-- The mean of a nonempty finite reading list. -/
noncomputable def sampleMean (xs : List ℝ) : ℝ := xs.sum / xs.length

/-- The average of the two central entries of an ordered list (the same entry
twice for odd length). Its zero fallback is irrelevant for the samples below. -/
noncomputable def orderedMedian (xs : List ℝ) : ℝ :=
  (xs[(xs.length - 1) / 2]?.getD 0 + xs[xs.length / 2]?.getD 0) / 2

/-- A sorted sample with one high endpoint. -/
def oneHigh (n : ℕ) : List ℝ := List.replicate (n - 1) 0 ++ [100]

/-- A sorted sample with one low endpoint. -/
def oneLow (n : ℕ) : List ℝ := 0 :: List.replicate (n - 1) 100

private theorem oneHigh_length (n : ℕ) (hn : 3 ≤ n) :
    (oneHigh n).length = n := by
  simp [oneHigh]; omega

private theorem oneLow_length (n : ℕ) (hn : 3 ≤ n) :
    (oneLow n).length = n := by
  simp [oneLow]; omega

/-- The one-high sample has the exact mean `100/n`. -/
theorem oneHigh_mean (n : ℕ) (hn : 3 ≤ n) :
    sampleMean (oneHigh n) = 100 / (n : ℝ) := by
  have hlen := oneHigh_length n hn
  unfold sampleMean
  rw [hlen]
  simp [oneHigh]

/-- The one-low sample has the exact mean `100 - 100/n`. -/
theorem oneLow_mean (n : ℕ) (hn : 3 ≤ n) :
    sampleMean (oneLow n) = 100 - 100 / (n : ℝ) := by
  have hlen := oneLow_length n hn
  have hsub : (↑(n - 1) : ℝ) = (n : ℝ) - 1 := by
    rw [Nat.cast_sub (by omega : 1 ≤ n)]
    norm_num
  have hnzero : (n : ℝ) ≠ 0 := by exact_mod_cast (by omega : n ≠ 0)
  unfold sampleMean
  rw [hlen]
  simp only [oneLow, List.sum_cons, List.sum_replicate,
    nsmul_eq_mul, zero_add]
  rw [hsub]
  field_simp [hnzero]

private theorem oneHigh_middle (n i : ℕ) (hi : i < n - 1) :
    (oneHigh n)[i]? = some 0 := by
  unfold oneHigh
  rw [List.getElem?_append_left (by simpa using hi)]
  exact List.getElem?_replicate_of_lt hi

private theorem oneLow_middle (n i : ℕ) (hpos : 0 < i) (hi : i < n) :
    (oneLow n)[i]? = some 100 := by
  unfold oneLow
  rw [List.getElem?_cons, if_neg (by omega : i ≠ 0)]
  exact List.getElem?_replicate_of_lt (by omega : i - 1 < n - 1)

/-- Both central entries of the one-high sample are zero, for odd and even sizes. -/
theorem oneHigh_median (n : ℕ) (hn : 3 ≤ n) :
    orderedMedian (oneHigh n) = 0 := by
  have hlen := oneHigh_length n hn
  have hleft : (n - 1) / 2 < n - 1 := by omega
  have hright : n / 2 < n - 1 := by omega
  unfold orderedMedian
  rw [hlen, oneHigh_middle n _ hleft, oneHigh_middle n _ hright]
  norm_num

/-- Both central entries of the one-low sample are 100, for odd and even sizes. -/
theorem oneLow_median (n : ℕ) (hn : 3 ≤ n) :
    orderedMedian (oneLow n) = 100 := by
  have hlen := oneLow_length n hn
  have hleft : 0 < (n - 1) / 2 := by omega
  have hright : 0 < n / 2 := by omega
  have hleft' : (n - 1) / 2 < n := by omega
  have hright' : n / 2 < n := by omega
  unfold orderedMedian
  rw [hlen, oneLow_middle n _ hleft hleft', oneLow_middle n _ hright hright']
  norm_num

/-- The sample means lie strictly between the endpoint values. -/
theorem endpoint_means_interior (n : ℕ) (hn : 3 ≤ n) :
    0 < sampleMean (oneHigh n) ∧ sampleMean (oneHigh n) < 100 ∧
    0 < sampleMean (oneLow n) ∧ sampleMean (oneLow n) < 100 := by
  have hnreal : (2 : ℝ) < (n : ℝ) := by exact_mod_cast (by omega : 2 < n)
  rw [oneHigh_mean n hn, oneLow_mean n hn]
  have hpos : 0 < 100 / (n : ℝ) := by positivity
  have hlt : 100 / (n : ℝ) < 100 := by
    apply (div_lt_iff₀ (by linarith : (0 : ℝ) < n)).2
    nlinarith
  constructor
  · exact hpos
  constructor
  · exact hlt
  constructor
  · linarith
  · linarith

/-- The two families strictly favor opposite estimators at opposite targets.
These are exactly the four endpoint choices used to refute the other pairs. -/
theorem endpoint_strict_wins (n : ℕ) (hn : 3 ≤ n) :
    |orderedMedian (oneHigh n) - 0| < |sampleMean (oneHigh n) - 0| ∧
    |sampleMean (oneHigh n) - 100| < |orderedMedian (oneHigh n) - 100| ∧
    |sampleMean (oneLow n) - 0| < |orderedMedian (oneLow n) - 0| ∧
    |orderedMedian (oneLow n) - 100| < |sampleMean (oneLow n) - 100| := by
  rcases endpoint_means_interior n hn with ⟨hhigh0, hhigh100, hlow0, hlow100⟩
  have hhighNeg : sampleMean (oneHigh n) - 100 < 0 := by linarith
  have hlowNeg : sampleMean (oneLow n) - 100 < 0 := by linarith
  refine ⟨?_, ?_, ?_, ?_⟩
  · rw [oneHigh_median n hn]
    simp only [sub_zero, abs_zero]
    rw [abs_of_pos hhigh0]
    exact hhigh0
  · have hright : |orderedMedian (oneHigh n) - 100| = (100 : ℝ) := by
      rw [oneHigh_median n hn]
      norm_num
    rw [hright, abs_of_neg hhighNeg]
    linarith
  · have hright : |orderedMedian (oneLow n) - 0| = (100 : ℝ) := by
      rw [oneLow_median n hn]
      norm_num
    rw [hright]
    simp only [sub_zero]
    rw [abs_of_pos hlow0]
    exact hlow100
  · have hleft : |orderedMedian (oneLow n) - 100| = (0 : ℝ) := by
      rw [oneLow_median n hn]
      norm_num
    rw [hleft, abs_of_neg hlowNeg]
    linarith

/-!
The registered language has five target guards and four predictions. Keeping
these constructors explicit makes the classification theorem exhaustive by
case analysis, while preserving a narrow and inspectable mathematical scope.
The mean and median arguments are arbitrary real estimates in `universal`;
the refutations below instantiate them with the actual sample calculations.
-/

namespace RegisteredClaim

inductive Condition where
  | any | belowMidpoint | aboveMidpoint | belowBoth | aboveBoth
  deriving DecidableEq

inductive Prediction where
  | lower | higher | mean | median
  deriving DecidableEq

noncomputable def guard : Condition → ℝ → ℝ → ℝ → Prop
  | .any, _, _, _ => True
  | .belowMidpoint, m, d, t => 2 * t ≤ min m d + max m d
  | .aboveMidpoint, m, d, t => min m d + max m d ≤ 2 * t
  | .belowBoth, m, d, t => t ≤ min m d
  | .aboveBoth, m, d, t => max m d ≤ t

noncomputable def conclusion : Prediction → ℝ → ℝ → ℝ → Prop
  | .lower, m, d, t => |min m d - t| ≤ |max m d - t|
  | .higher, m, d, t => |max m d - t| ≤ |min m d - t|
  | .mean, m, d, t => |m - t| ≤ |d - t|
  | .median, m, d, t => |d - t| ≤ |m - t|

/-- The midpoint guard has exactly the form used by the receipt verifiers. -/
theorem belowMidpoint_iff (m d t : ℝ) :
    guard .belowMidpoint m d t ↔ t ≤ (m + d) / 2 := by
  change (2 * t ≤ min m d + max m d) ↔ t ≤ (m + d) / 2
  rw [min_add_max]
  constructor <;> intro h <;> linarith

theorem aboveMidpoint_iff (m d t : ℝ) :
    guard .aboveMidpoint m d t ↔ (m + d) / 2 ≤ t := by
  change (min m d + max m d ≤ 2 * t) ↔ (m + d) / 2 ≤ t
  rw [min_add_max]
  constructor <;> intro h <;> linarith

theorem belowBoth_iff (m d t : ℝ) :
    guard .belowBoth m d t ↔ t ≤ m ∧ t ≤ d := by
  change t ≤ min m d ↔ t ≤ m ∧ t ≤ d
  exact le_min_iff

theorem aboveBoth_iff (m d t : ℝ) :
    guard .aboveBoth m d t ↔ m ≤ t ∧ d ≤ t := by
  change max m d ≤ t ↔ m ≤ t ∧ d ≤ t
  exact max_le_iff

def universal (c : Condition) (p : Prediction) : Prop :=
  ∀ m d t : ℝ, guard c m d t → conclusion p m d t

inductive Endpoint where
  | highZero | highHundred | lowZero | lowHundred

def sample (e : Endpoint) (n : ℕ) : List ℝ :=
  match e with
  | .highZero | .highHundred => oneHigh n
  | .lowZero | .lowHundred => oneLow n

def target : Endpoint → ℝ
  | .highZero | .lowZero => 0
  | .highHundred | .lowHundred => 100

def refutedByEndpoint (n : ℕ) (c : Condition) (p : Prediction) : Prop :=
  ∃ e : Endpoint,
    guard c (sampleMean (sample e n)) (orderedMedian (sample e n)) (target e) ∧
    ¬conclusion p (sampleMean (sample e n)) (orderedMedian (sample e n)) (target e)

/-- Each registered endpoint refutation disproves the corresponding universal
statement with its actual sample mean, median, and target. -/
theorem refutation_disproves_universal (n : ℕ) (c : Condition) (p : Prediction)
    (h : refutedByEndpoint n c p) : ¬universal c p := by
  intro hall
  rcases h with ⟨e, hg, hp⟩
  exact hp (hall _ _ _ hg)

private theorem valid_belowMidpoint : universal .belowMidpoint .lower := by
  intro m d t h
  exact lower_no_worse_at_midpoint (min m d) (max m d) t (min_le_max) h

private theorem valid_aboveMidpoint : universal .aboveMidpoint .higher := by
  intro m d t h
  exact higher_no_worse_at_midpoint (min m d) (max m d) t (min_le_max) h

private theorem valid_belowBoth : universal .belowBoth .lower := by
  intro m d t h
  exact lower_no_worse_below_both (min m d) (max m d) t (min_le_max) h

private theorem valid_aboveBoth : universal .aboveBoth .higher := by
  intro m d t h
  exact higher_no_worse_above_both (min m d) (max m d) t (min_le_max) h

private theorem guardsAtZero (m d : ℝ) (hm : 0 ≤ m) (hd : 0 ≤ d) :
    guard .any m d 0 ∧ guard .belowMidpoint m d 0 ∧ guard .belowBoth m d 0 := by
  have hmin : 0 ≤ min m d := le_min hm hd
  have hmax : 0 ≤ max m d := le_trans hm (le_max_left m d)
  refine ⟨trivial, ?_, ?_⟩
  · simpa [guard] using add_nonneg hmin hmax
  · exact hmin

private theorem guardsAtHundred (m d : ℝ) (hm : m ≤ 100) (hd : d ≤ 100) :
    guard .any m d 100 ∧ guard .aboveMidpoint m d 100 ∧
    guard .aboveBoth m d 100 := by
  have hmin : min m d ≤ 100 := le_trans (min_le_left m d) hm
  have hmax : max m d ≤ 100 := max_le hm hd
  refine ⟨trivial, ?_, ?_⟩
  · change min m d + max m d ≤ 2 * (100 : ℝ)
    linarith
  · exact hmax

private theorem highZeroGuards (n : ℕ) (hn : 3 ≤ n) :
    guard .any (sampleMean (oneHigh n)) (orderedMedian (oneHigh n)) 0 ∧
    guard .belowMidpoint (sampleMean (oneHigh n)) (orderedMedian (oneHigh n)) 0 ∧
    guard .belowBoth (sampleMean (oneHigh n)) (orderedMedian (oneHigh n)) 0 := by
  have hm := (endpoint_means_interior n hn).1
  simpa [oneHigh_median n hn] using
    (guardsAtZero (sampleMean (oneHigh n)) 0 (le_of_lt hm) (le_refl 0))

private theorem highHundredGuards (n : ℕ) (hn : 3 ≤ n) :
    guard .any (sampleMean (oneHigh n)) (orderedMedian (oneHigh n)) 100 ∧
    guard .aboveMidpoint (sampleMean (oneHigh n)) (orderedMedian (oneHigh n)) 100 ∧
    guard .aboveBoth (sampleMean (oneHigh n)) (orderedMedian (oneHigh n)) 100 := by
  have hm := (endpoint_means_interior n hn).2.1
  simpa [oneHigh_median n hn] using
    (guardsAtHundred (sampleMean (oneHigh n)) 0 (le_of_lt hm) (by norm_num))

private theorem lowZeroGuards (n : ℕ) (hn : 3 ≤ n) :
    guard .any (sampleMean (oneLow n)) (orderedMedian (oneLow n)) 0 ∧
    guard .belowMidpoint (sampleMean (oneLow n)) (orderedMedian (oneLow n)) 0 ∧
    guard .belowBoth (sampleMean (oneLow n)) (orderedMedian (oneLow n)) 0 := by
  have hm := (endpoint_means_interior n hn).2.2.1
  simpa [oneLow_median n hn] using
    (guardsAtZero (sampleMean (oneLow n)) 100 (le_of_lt hm) (by norm_num))

private theorem lowHundredGuards (n : ℕ) (hn : 3 ≤ n) :
    guard .any (sampleMean (oneLow n)) (orderedMedian (oneLow n)) 100 ∧
    guard .aboveMidpoint (sampleMean (oneLow n)) (orderedMedian (oneLow n)) 100 ∧
    guard .aboveBoth (sampleMean (oneLow n)) (orderedMedian (oneLow n)) 100 := by
  have hm := (endpoint_means_interior n hn).2.2.2
  simpa [oneLow_median n hn] using
    (guardsAtHundred (sampleMean (oneLow n)) 100 (le_of_lt hm) (le_refl 100))

private theorem highZeroBad (n : ℕ) (hn : 3 ≤ n) :
    ¬conclusion .higher (sampleMean (oneHigh n)) (orderedMedian (oneHigh n)) 0 ∧
    ¬conclusion .mean (sampleMean (oneHigh n)) (orderedMedian (oneHigh n)) 0 := by
  have hwin := (endpoint_strict_wins n hn).1
  have hord : orderedMedian (oneHigh n) ≤ sampleMean (oneHigh n) := by
    rw [oneHigh_median n hn]
    exact le_of_lt (endpoint_means_interior n hn).1
  constructor
  · dsimp only [conclusion]
    rw [max_eq_left hord, min_eq_right hord]
    exact not_le_of_gt hwin
  · exact not_le_of_gt hwin

private theorem highHundredBad (n : ℕ) (hn : 3 ≤ n) :
    ¬conclusion .lower (sampleMean (oneHigh n)) (orderedMedian (oneHigh n)) 100 ∧
    ¬conclusion .median (sampleMean (oneHigh n)) (orderedMedian (oneHigh n)) 100 := by
  have hwin := (endpoint_strict_wins n hn).2.1
  have hord : orderedMedian (oneHigh n) ≤ sampleMean (oneHigh n) := by
    rw [oneHigh_median n hn]
    exact le_of_lt (endpoint_means_interior n hn).1
  constructor
  · dsimp only [conclusion]
    rw [min_eq_right hord, max_eq_left hord]
    exact not_le_of_gt hwin
  · exact not_le_of_gt hwin

private theorem lowZeroBad (n : ℕ) (hn : 3 ≤ n) :
    ¬conclusion .higher (sampleMean (oneLow n)) (orderedMedian (oneLow n)) 0 ∧
    ¬conclusion .median (sampleMean (oneLow n)) (orderedMedian (oneLow n)) 0 := by
  have hwin := (endpoint_strict_wins n hn).2.2.1
  have hord : sampleMean (oneLow n) ≤ orderedMedian (oneLow n) := by
    rw [oneLow_median n hn]
    exact le_of_lt (endpoint_means_interior n hn).2.2.2
  constructor
  · dsimp only [conclusion]
    rw [max_eq_right hord, min_eq_left hord]
    exact not_le_of_gt hwin
  · exact not_le_of_gt hwin

private theorem lowHundredBad (n : ℕ) (hn : 3 ≤ n) :
    ¬conclusion .lower (sampleMean (oneLow n)) (orderedMedian (oneLow n)) 100 ∧
    ¬conclusion .mean (sampleMean (oneLow n)) (orderedMedian (oneLow n)) 100 := by
  have hwin := (endpoint_strict_wins n hn).2.2.2
  have hord : sampleMean (oneLow n) ≤ orderedMedian (oneLow n) := by
    rw [oneLow_median n hn]
    exact le_of_lt (endpoint_means_interior n hn).2.2.2
  constructor
  · dsimp only [conclusion]
    rw [min_eq_left hord, max_eq_right hord]
    exact not_le_of_gt hwin
  · exact not_le_of_gt hwin

/-- The four true cells of the registered 5-by-4 table. -/
def established : Condition → Prediction → Bool
  | .belowMidpoint, .lower | .belowBoth, .lower => true
  | .aboveMidpoint, .higher | .aboveBoth, .higher => true
  | _, _ => false

/-- An explicit, inspectable witness for each false cell. `none` means the
registered prediction is universal. The route's mathematical soundness is
proved below, and CI compares the exported table with both implementations. -/
def endpointRoute : Condition → Prediction → Option Endpoint
  | .any, .lower => some .highHundred
  | .any, .higher => some .highZero
  | .any, .mean => some .highZero
  | .any, .median => some .highHundred
  | .belowMidpoint, .lower => none
  | .belowMidpoint, .higher => some .highZero
  | .belowMidpoint, .mean => some .highZero
  | .belowMidpoint, .median => some .lowZero
  | .aboveMidpoint, .lower => some .highHundred
  | .aboveMidpoint, .higher => none
  | .aboveMidpoint, .mean => some .lowHundred
  | .aboveMidpoint, .median => some .highHundred
  | .belowBoth, .lower => none
  | .belowBoth, .higher => some .highZero
  | .belowBoth, .mean => some .highZero
  | .belowBoth, .median => some .lowZero
  | .aboveBoth, .lower => some .highHundred
  | .aboveBoth, .higher => none
  | .aboveBoth, .mean => some .lowHundred
  | .aboveBoth, .median => some .highHundred

theorem route_agrees_with_established (c : Condition) (p : Prediction) :
    established c p = (endpointRoute c p).isNone := by
  cases c <;> cases p <;> rfl

/-- The route is sound for every integer size at least three. In a `some`
branch the selected sample satisfies the guard and strictly defeats the
prediction; the `none` branches are universal over all real estimates. -/
theorem endpointRoute_sound (n : ℕ) (hn : 3 ≤ n)
    (c : Condition) (p : Prediction) :
    match endpointRoute c p with
    | none => universal c p
    | some e =>
        guard c (sampleMean (sample e n)) (orderedMedian (sample e n)) (target e) ∧
        ¬conclusion p (sampleMean (sample e n)) (orderedMedian (sample e n)) (target e) := by
  cases c <;> cases p <;> simp only [endpointRoute]
  · exact ⟨(highHundredGuards n hn).1, (highHundredBad n hn).1⟩
  · exact ⟨(highZeroGuards n hn).1, (highZeroBad n hn).1⟩
  · exact ⟨(highZeroGuards n hn).1, (highZeroBad n hn).2⟩
  · exact ⟨(highHundredGuards n hn).1, (highHundredBad n hn).2⟩
  · exact valid_belowMidpoint
  · exact ⟨(highZeroGuards n hn).2.1, (highZeroBad n hn).1⟩
  · exact ⟨(highZeroGuards n hn).2.1, (highZeroBad n hn).2⟩
  · exact ⟨(lowZeroGuards n hn).2.1, (lowZeroBad n hn).2⟩
  · exact ⟨(highHundredGuards n hn).2.1, (highHundredBad n hn).1⟩
  · exact valid_aboveMidpoint
  · exact ⟨(lowHundredGuards n hn).2.1, (lowHundredBad n hn).2⟩
  · exact ⟨(highHundredGuards n hn).2.1, (highHundredBad n hn).2⟩
  · exact valid_belowBoth
  · exact ⟨(highZeroGuards n hn).2.2, (highZeroBad n hn).1⟩
  · exact ⟨(highZeroGuards n hn).2.2, (highZeroBad n hn).2⟩
  · exact ⟨(lowZeroGuards n hn).2.2, (lowZeroBad n hn).2⟩
  · exact ⟨(highHundredGuards n hn).2.2, (highHundredBad n hn).1⟩
  · exact valid_aboveBoth
  · exact ⟨(lowHundredGuards n hn).2.2, (lowHundredBad n hn).2⟩
  · exact ⟨(highHundredGuards n hn).2.2, (highHundredBad n hn).2⟩

/-- Every other cell has one of the two explicit sorted endpoint samples as a
strict counterexample at target 0 or 100, for every integer size at least 3. -/
theorem classify (n : ℕ) (hn : 3 ≤ n) (c : Condition) (p : Prediction) :
    if established c p then universal c p else refutedByEndpoint n c p := by
  rw [route_agrees_with_established]
  cases h : endpointRoute c p with
  | none =>
      simpa [h] using endpointRoute_sound n hn c p
  | some e =>
      have hw := endpointRoute_sound n hn c p
      simp only [h] at hw
      simpa [h] using (show refutedByEndpoint n c p from ⟨e, hw⟩)

/-- Exactly four cells of this registered language are universal. A false cell
is refuted at every `n ≥ 3`, so it cannot be an overlooked general theorem. -/
theorem universal_iff_established (n : ℕ) (hn : 3 ≤ n)
    (c : Condition) (p : Prediction) :
    universal c p ↔ established c p = true := by
  cases h : established c p with
  | true =>
      simpa [h] using classify n hn c p
  | false =>
      have hw : refutedByEndpoint n c p := by simpa [h] using classify n hn c p
      simpa [h] using (refutation_disproves_universal n c p hw)

end RegisteredClaim

/-!
The continuous-movement receipts partition the domain at roots of affine
error factors. These elementary lemmas justify using one interior reading to
determine each nonzero factor's sign throughout a root-free open cell. They
apply equally to odd and even sample medians, once the median cell is fixed.
-/
namespace AffinePartition

/-- Opposite strict signs of an affine function force an explicit interior
zero. This avoids a grid or an appeal to numerical sampling. -/
theorem zero_between_of_opposite (A B x y : ℝ) (hxy : x < y)
    (hx : A + B * x < 0) (hy : 0 < A + B * y) :
    ∃ z, x < z ∧ z < y ∧ A + B * z = 0 := by
  have hB : 0 < B := by
    by_contra h
    have hnonpos : B ≤ 0 := le_of_not_gt h
    have hprod : B * (y - x) ≤ 0 :=
      mul_nonpos_of_nonpos_of_nonneg hnonpos (by linarith)
    nlinarith
  refine ⟨-A / B, ?_, ?_, ?_⟩
  · exact (lt_div_iff₀ hB).2 (by nlinarith)
  · exact (div_lt_iff₀ hB).2 (by nlinarith)
  · field_simp [ne_of_gt hB]
    ring

/-- A nonconstant affine factor cannot vanish in a cell whose exact root lies
at or outside one of its boundaries. -/
theorem no_zero_if_root_outside (A B left right : ℝ) (hB : B ≠ 0)
    (hroot : -A / B ≤ left ∨ right ≤ -A / B) :
    ∀ x, left < x → x < right → A + B * x ≠ 0 := by
  intro x hlx hxr hzero
  have hx : x = -A / B := by
    apply (eq_div_iff hB).2
    nlinarith
  rcases hroot with hleft | hright
  · rw [hx] at hlx
    linarith
  · rw [hx] at hxr
    linarith

/-- The strict sign at one point holds at every point of a root-free cell. -/
theorem positive_from_anchor (A B left right anchor x : ℝ)
    (hla : left < anchor) (har : anchor < right)
    (hlx : left < x) (hxr : x < right)
    (hno : ∀ z, left < z → z < right → A + B * z ≠ 0)
    (ha : 0 < A + B * anchor) : 0 < A + B * x := by
  rcases lt_trichotomy (A + B * x) 0 with hneg | hzero | hpos
  · rcases lt_trichotomy x anchor with hxa | heq | hax
    · obtain ⟨z, hxz, hza, hz⟩ := zero_between_of_opposite A B x anchor hxa hneg ha
      exact False.elim ((hno z (lt_trans hlx hxz) (lt_trans hza har)) hz)
    · subst x
      exact ha
    · obtain ⟨z, haz, hzx, hz⟩ := zero_between_of_opposite (-A) (-B) anchor x hax
        (by nlinarith) (by nlinarith)
      have hz' : A + B * z = 0 := by nlinarith
      exact False.elim ((hno z (lt_trans hla haz) (lt_trans hzx hxr)) hz')
  · exact False.elim ((hno x hlx hxr) hzero)
  · exact hpos

theorem negative_from_anchor (A B left right anchor x : ℝ)
    (hla : left < anchor) (har : anchor < right)
    (hlx : left < x) (hxr : x < right)
    (hno : ∀ z, left < z → z < right → A + B * z ≠ 0)
    (ha : A + B * anchor < 0) : A + B * x < 0 := by
  have h : 0 < -A + -B * x := positive_from_anchor (-A) (-B) left right anchor x
    hla har hlx hxr (by
      intro z hlz hzr hz
      apply hno z hlz hzr
      nlinarith) (by nlinarith)
  nlinarith

/-- An interior midpoint carries the factor's exact sign on a root-free cell. -/
theorem sign_agrees_with_midpoint (A B left right x : ℝ)
    (hlr : left < right) (hlx : left < x) (hxr : x < right)
    (hno : ∀ z, left < z → z < right → A + B * z ≠ 0) :
    (0 < A + B * x ↔ 0 < A + B * ((left + right) / 2)) ∧
    (A + B * x < 0 ↔ A + B * ((left + right) / 2) < 0) := by
  have hlm : left < (left + right) / 2 := by linarith
  have hmr : (left + right) / 2 < right := by linarith
  constructor
  · constructor
    · intro hx
      exact positive_from_anchor A B left right x _ hlx hxr hlm hmr hno hx
    · intro hm
      exact positive_from_anchor A B left right _ x hlm hmr hlx hxr hno hm
  · constructor
    · intro hx
      exact negative_from_anchor A B left right x _ hlx hxr hlm hmr hno hx
    · intro hm
      exact negative_from_anchor A B left right _ x hlm hmr hlx hxr hno hm

/-- The midpoint also determines the winner encoded by two affine factors.
The factors' roots must already have been excluded from this open cell. -/
theorem product_negative_iff_midpoint (A B C D left right x : ℝ)
    (hlr : left < right) (hlx : left < x) (hxr : x < right)
    (hfirst : ∀ z, left < z → z < right → A + B * z ≠ 0)
    (hsecond : ∀ z, left < z → z < right → C + D * z ≠ 0) :
    (A + B * x) * (C + D * x) < 0 ↔
      (A + B * ((left + right) / 2)) *
        (C + D * ((left + right) / 2)) < 0 := by
  have hf := sign_agrees_with_midpoint A B left right x hlr hlx hxr hfirst
  have hg := sign_agrees_with_midpoint C D left right x hlr hlx hxr hsecond
  constructor
  · intro hproduct
    rcases lt_trichotomy (A + B * x) 0 with hneg | hzero | hpos
    · have hother : 0 < C + D * x := by
        by_contra h
        have hnonpos : C + D * x ≤ 0 := le_of_not_gt h
        have hnonneg := mul_nonneg_of_nonpos_of_nonpos (le_of_lt hneg) hnonpos
        exact (not_le_of_gt hproduct) hnonneg
      exact mul_neg_of_neg_of_pos (hf.2.mp hneg) (hg.1.mp hother)
    · simp [hzero] at hproduct
    · have hother : C + D * x < 0 := by
        by_contra h
        have hnonneg : 0 ≤ C + D * x := le_of_not_gt h
        have hnonnegProduct := mul_nonneg (le_of_lt hpos) hnonneg
        exact (not_le_of_gt hproduct) hnonnegProduct
      exact mul_neg_of_pos_of_neg (hf.1.mp hpos) (hg.2.mp hother)
  · intro hproduct
    rcases lt_trichotomy (A + B * ((left + right) / 2)) 0 with hneg | hzero | hpos
    · have hother : 0 < C + D * ((left + right) / 2) := by
        by_contra h
        have hnonpos : C + D * ((left + right) / 2) ≤ 0 := le_of_not_gt h
        have hnonneg := mul_nonneg_of_nonpos_of_nonpos (le_of_lt hneg) hnonpos
        exact (not_le_of_gt hproduct) hnonneg
      exact mul_neg_of_neg_of_pos (hf.2.mpr hneg) (hg.1.mpr hother)
    · simp [hzero] at hproduct
    · have hother : C + D * ((left + right) / 2) < 0 := by
        by_contra h
        have hnonneg : 0 ≤ C + D * ((left + right) / 2) := le_of_not_gt h
        have hnonnegProduct := mul_nonneg (le_of_lt hpos) hnonneg
        exact (not_le_of_gt hproduct) hnonnegProduct
      exact mul_neg_of_pos_of_neg (hf.1.mpr hpos) (hg.2.mpr hother)

/-- Supplying both exact roots outside the cell is enough to justify the
midpoint's winner classification for the entire open cell. -/
theorem product_negative_iff_midpoint_of_roots_outside
    (A B C D left right x : ℝ)
    (hlr : left < right) (hlx : left < x) (hxr : x < right)
    (hB : B ≠ 0) (hD : D ≠ 0)
    (hfirst : -A / B ≤ left ∨ right ≤ -A / B)
    (hsecond : -C / D ≤ left ∨ right ≤ -C / D) :
    (A + B * x) * (C + D * x) < 0 ↔
      (A + B * ((left + right) / 2)) *
        (C + D * ((left + right) / 2)) < 0 := by
  exact product_negative_iff_midpoint A B C D left right x hlr hlx hxr
    (no_zero_if_root_outside A B left right hB hfirst)
    (no_zero_if_root_outside C D left right hD hsecond)

/-- If an affine factor vanishes at two distinct points, it ties everywhere. -/
theorem zero_at_two_points (A B p q x : ℝ) (hpq : p ≠ q)
    (hp : A + B * p = 0) (hq : A + B * q = 0) : A + B * x = 0 := by
  have hproduct : B * (p - q) = 0 := by nlinarith
  have hB : B = 0 := by
    rcases mul_eq_zero.mp hproduct with hb | heq
    · exact hb
    · exact False.elim (hpq (sub_eq_zero.mp heq))
  have hA : A = 0 := by simpa [hB] using hp
  simp [hA, hB]

end AffinePartition

/-!
The v4 Joint Reading Box verifier checks each proposed affine lower-envelope
piece against every finite candidate at both endpoints. These lemmas prove
that those endpoint inequalities cover every real target on the piece and
that a listed attaining line is its exact finite minimum. They assume the
candidate list is complete; the arbitrary-interval ordering-cell argument
that supplies that list is not formalized here.
-/
namespace AffineEnvelope

/-- Endpoint dominance between two affine lines persists on the entire
closed interval, including both boundaries. -/
theorem below_between_endpoints (s b u v left right t : ℝ)
    (hspan : left < right) (hleft : left ≤ t) (hright : t ≤ right)
    (hstart : s * left + b ≤ u * left + v)
    (hstop : s * right + b ≤ u * right + v) :
    s * t + b ≤ u * t + v := by
  have hfirst : 0 ≤ ((u * left + v) - (s * left + b)) * (right - t) :=
    mul_nonneg (sub_nonneg.mpr hstart) (sub_nonneg.mpr hright)
  have hsecond : 0 ≤ ((u * right + v) - (s * right + b)) * (t - left) :=
    mul_nonneg (sub_nonneg.mpr hstop) (sub_nonneg.mpr hleft)
  have hid :
      ((u * left + v) - (s * left + b)) * (right - t) +
        ((u * right + v) - (s * right + b)) * (t - left) =
          (right - left) * ((u * t + v) - (s * t + b)) := by
    ring
  have hsum : 0 ≤ (right - left) * ((u * t + v) - (s * t + b)) := by
    rw [← hid]
    exact add_nonneg hfirst hsecond
  by_contra h
  have hgap : (u * t + v) - (s * t + b) < 0 := by linarith
  have hproduct : (right - left) * ((u * t + v) - (s * t + b)) < 0 :=
    mul_neg_of_pos_of_neg (sub_pos.mpr hspan) hgap
  exact (not_lt_of_ge hsum) hproduct

/-- Endpoint comparisons against every listed line, together with an
attaining line in the list, prove an exact finite minimum at every real
target in the piece. -/
theorem attained_minimum_from_endpoint_checks
    (lines : List (ℝ × ℝ)) (s b left right : ℝ) (hspan : left < right)
    (hwitness : (s, b) ∈ lines)
    (hstart : ∀ line ∈ lines, s * left + b ≤ line.1 * left + line.2)
    (hstop : ∀ line ∈ lines, s * right + b ≤ line.1 * right + line.2) :
    ∀ t, left ≤ t → t ≤ right →
      (∀ line ∈ lines, s * t + b ≤ line.1 * t + line.2) ∧
      (∃ line ∈ lines, s * t + b = line.1 * t + line.2) := by
  intro t hleft hright
  constructor
  · intro line hline
    exact below_between_endpoints s b line.1 line.2 left right t
      hspan hleft hright (hstart line hline) (hstop line hline)
  · exact ⟨(s, b), hwitness, rfl⟩

/-- On a decreasing affine gap, an attained threshold is met exactly at
and to the left of its cutoff, within the audited piece. -/
theorem decreasing_threshold_region (s b q cutoff t : ℝ)
    (hs : s < 0) (hcut : s * cutoff + b = q) :
    q ≤ s * t + b ↔ t ≤ cutoff := by
  constructor
  · intro h
    by_contra hnot
    have ht : cutoff < t := not_le.mp hnot
    have hproduct : s * (t - cutoff) < 0 :=
      mul_neg_of_neg_of_pos hs (sub_pos.mpr ht)
    nlinarith
  · intro ht
    have hproduct : 0 ≤ s * (t - cutoff) :=
      mul_nonneg_of_nonpos_of_nonpos (le_of_lt hs) (sub_nonpos.mpr ht)
    nlinarith

/-- On an increasing affine gap, an attained threshold is met exactly at
and to the right of its cutoff, within the audited piece. -/
theorem increasing_threshold_region (s b q cutoff t : ℝ)
    (hs : 0 < s) (hcut : s * cutoff + b = q) :
    q ≤ s * t + b ↔ cutoff ≤ t := by
  constructor
  · intro h
    by_contra hnot
    have ht : t < cutoff := not_le.mp hnot
    have hproduct : s * (t - cutoff) < 0 :=
      mul_neg_of_pos_of_neg hs (sub_neg.mpr ht)
    nlinarith
  · intro ht
    have hproduct : 0 ≤ s * (t - cutoff) :=
      mul_nonneg (le_of_lt hs) (sub_nonneg.mpr ht)
    nlinarith

end AffineEnvelope

/-!
The sharp v3/v4 squared-error lead is the product of two nonnegative affine
factors on each fixed median-ordering cell. Its minimum on a segment cannot
fall below both endpoint products. Iterating this segment fact over a convex
combination of cell vertices is the algebraic part of the finite-candidate
argument; identifying and enumerating all cell vertices is a separate step.
-/
namespace AffineProduct

private theorem min_le_affine_average (p q u : ℝ)
    (hu : 0 ≤ u) (hu1 : u ≤ 1) :
    min p q ≤ (1 - u) * p + u * q := by
  have hleft : 0 ≤ (1 - u) * (p - min p q) :=
    mul_nonneg (by linarith) (sub_nonneg.mpr (min_le_left p q))
  have hright : 0 ≤ u * (q - min p q) :=
    mul_nonneg hu (sub_nonneg.mpr (min_le_right p q))
  nlinarith

/-- A product of two nonnegative affine factors on a segment is no smaller
than the lesser endpoint product, even when the factors move in opposite
directions. This is the sharp-gap step, with no sampling of interior points. -/
theorem product_above_endpoint_min (a b c d u : ℝ)
    (ha : 0 ≤ a) (hb : 0 ≤ b) (hc : 0 ≤ c) (hd : 0 ≤ d)
    (hu : 0 ≤ u) (hu1 : u ≤ 1) :
    min (a * c) (b * d) ≤
      ((1 - u) * a + u * b) * ((1 - u) * c + u * d) := by
  let x := (1 - u) * a + u * b
  let y := (1 - u) * c + u * d
  have hzero : 0 ≤ 1 - u := by linarith
  have opposite (hcross : 0 ≤ (b - a) * (c - d)) :
      min (a * c) (b * d) ≤ x * y := by
    have hweight : 0 ≤ (u * (1 - u)) * ((b - a) * (c - d)) :=
      mul_nonneg (mul_nonneg hu hzero) hcross
    have hid : x * y - ((1 - u) * (a * c) + u * (b * d)) =
        (u * (1 - u)) * ((b - a) * (c - d)) := by
      dsimp [x, y]
      ring
    exact (min_le_affine_average (a * c) (b * d) u hu hu1).trans (by linarith)
  change min (a * c) (b * d) ≤ x * y
  rcases le_total a b with hab | hba
  · rcases le_total c d with hcd | hdc
    · have hxa : 0 ≤ x - a := by
        have hid : x - a = u * (b - a) := by dsimp [x]; ring
        rw [hid]
        exact mul_nonneg hu (sub_nonneg.mpr hab)
      have hyc : 0 ≤ y - c := by
        have hid : y - c = u * (d - c) := by dsimp [y]; ring
        rw [hid]
        exact mul_nonneg hu (sub_nonneg.mpr hcd)
      have h1 := mul_nonneg hxa hyc
      have h2 := mul_nonneg ha hyc
      have h3 := mul_nonneg hc hxa
      exact (min_le_left (a * c) (b * d)).trans (by nlinarith)
    · exact opposite (mul_nonneg (sub_nonneg.mpr hab) (sub_nonneg.mpr hdc))
  · rcases le_total c d with hcd | hdc
    · exact opposite (mul_nonneg_of_nonpos_of_nonpos
        (sub_nonpos.mpr hba) (sub_nonpos.mpr hcd))
    · have hxb : 0 ≤ x - b := by
        have hid : x - b = (1 - u) * (a - b) := by dsimp [x]; ring
        rw [hid]
        exact mul_nonneg hzero (sub_nonneg.mpr hba)
      have hyd : 0 ≤ y - d := by
        have hid : y - d = (1 - u) * (c - d) := by dsimp [y]; ring
        rw [hid]
        exact mul_nonneg hzero (sub_nonneg.mpr hdc)
      have h1 := mul_nonneg hxb hyd
      have h2 := mul_nonneg hb hyd
      have h3 := mul_nonneg hd hxb
      exact (min_le_right (a * c) (b * d)).trans (by nlinarith)

/-- Endpoint margins on both affine factors certify the same margin at
every point of their segment. -/
theorem endpoint_margin_lower_bound (a b c d u margin : ℝ)
    (ha : 0 ≤ a) (hb : 0 ≤ b) (hc : 0 ≤ c) (hd : 0 ≤ d)
    (hu : 0 ≤ u) (hu1 : u ≤ 1)
    (hfirst : margin ≤ a * c) (hlast : margin ≤ b * d) :
    margin ≤ ((1 - u) * a + u * b) * ((1 - u) * c + u * d) := by
  exact (le_min hfirst hlast).trans
    (product_above_endpoint_min a b c d u ha hb hc hd hu hu1)

/-- Every finite convex combination can be built from singleton vertices
and binary blends. The pair records the two affine factor values, not the
original reading vector. -/
inductive FiniteBlends (vertices : Set (ℝ × ℝ)) : ℝ × ℝ → Prop where
  | vertex (p : ℝ × ℝ) (hp : p ∈ vertices) : FiniteBlends vertices p
  | blend (p q : ℝ × ℝ) (u : ℝ)
      (hp : FiniteBlends vertices p) (hq : FiniteBlends vertices q)
      (hu : 0 ≤ u) (hunit : u ≤ 1) :
      FiniteBlends vertices
        ((1 - u) * p.1 + u * q.1, (1 - u) * p.2 + u * q.2)

/-- A margin verified at every candidate vertex holds throughout every
finite convex combination of their affine-factor pairs. -/
theorem finite_blends_preserve_margin
    (vertices : Set (ℝ × ℝ)) (margin : ℝ)
    (hvertices : ∀ p ∈ vertices,
      0 ≤ p.1 ∧ 0 ≤ p.2 ∧ margin ≤ p.1 * p.2)
    {p : ℝ × ℝ} (hp : FiniteBlends vertices p) :
    0 ≤ p.1 ∧ 0 ≤ p.2 ∧ margin ≤ p.1 * p.2 := by
  induction hp with
  | vertex p hmem => exact hvertices p hmem
  | blend p q u hp hq hu hunit ihp ihq =>
      rcases ihp with ⟨hpa, hpc, hpm⟩
      rcases ihq with ⟨hqb, hqd, hqm⟩
      dsimp only [Prod.fst, Prod.snd]
      have hzero : 0 ≤ 1 - u := by linarith
      exact ⟨add_nonneg (mul_nonneg hzero hpa) (mul_nonneg hu hqb),
        add_nonneg (mul_nonneg hzero hpc) (mul_nonneg hu hqd),
        endpoint_margin_lower_bound p.1 q.1 p.2 q.2 u margin
          hpa hqb hpc hqd hu hunit hpm hqm⟩

/-- If one listed vertex attains the checked bound, that bound is the
exact attained minimum over all finite convex combinations. -/
theorem attained_minimum_of_finite_blends
    (vertices : Set (ℝ × ℝ)) (witness : ℝ × ℝ) (margin : ℝ)
    (hvertices : ∀ p ∈ vertices,
      0 ≤ p.1 ∧ 0 ≤ p.2 ∧ margin ≤ p.1 * p.2)
    (hwitness : witness ∈ vertices)
    (hattain : witness.1 * witness.2 = margin) :
    (∀ p, FiniteBlends vertices p → margin ≤ p.1 * p.2) ∧
      (∃ p, FiniteBlends vertices p ∧ p.1 * p.2 = margin) := by
  constructor
  · intro p hp
    exact (finite_blends_preserve_margin vertices margin hvertices hp).2.2
  · exact ⟨witness, FiniteBlends.vertex witness hwitness, hattain⟩

/-- A fixed ordering cell makes each estimator factor a linear combination
of its readings plus a constant. The coefficients are supplied by that cell. -/
def readingAffine {n : ℕ} (coeff : Fin n → ℝ) (bias : ℝ)
    (readings : Fin n → ℝ) : ℝ :=
  (∑ i : Fin n, coeff i * readings i) + bias

/-- An affine factor evaluated at a blend of reading vectors is exactly the
same blend of its endpoint factor values. -/
theorem readingAffine_blend {n : ℕ} (coeff : Fin n → ℝ) (bias u : ℝ)
    (p q : Fin n → ℝ) :
    readingAffine coeff bias (fun i => (1 - u) * p i + u * q i) =
      (1 - u) * readingAffine coeff bias p +
        u * readingAffine coeff bias q := by
  have hterm (i : Fin n) :
      coeff i * ((1 - u) * p i + u * q i) =
        (1 - u) * (coeff i * p i) + u * (coeff i * q i) := by
    ring
  simp only [readingAffine]
  simp_rw [hterm]
  rw [Finset.sum_add_distrib, ← Finset.mul_sum, ← Finset.mul_sum]
  ring

def readingFactors {n : ℕ} (first second : Fin n → ℝ)
    (firstBias secondBias : ℝ) (readings : Fin n → ℝ) : ℝ × ℝ :=
  (readingAffine first firstBias readings,
    readingAffine second secondBias readings)

theorem readingFactors_blend {n : ℕ} (first second : Fin n → ℝ)
    (firstBias secondBias u : ℝ) (p q : Fin n → ℝ) :
    readingFactors first second firstBias secondBias
        (fun i => (1 - u) * p i + u * q i) =
      ((1 - u) * (readingFactors first second firstBias secondBias p).1 +
          u * (readingFactors first second firstBias secondBias q).1,
        (1 - u) * (readingFactors first second firstBias secondBias p).2 +
          u * (readingFactors first second firstBias secondBias q).2) := by
  apply Prod.ext
  · exact readingAffine_blend first firstBias u p q
  · exact readingAffine_blend second secondBias u p q

/-- Reading vectors formed by finitely many binary convex blends of
listed candidate vectors. -/
inductive ReadingBlends {n : ℕ} (vertices : Set (Fin n → ℝ)) :
    (Fin n → ℝ) → Prop where
  | vertex (p : Fin n → ℝ) (hp : p ∈ vertices) : ReadingBlends vertices p
  | blend (p q : Fin n → ℝ) (u : ℝ)
      (hp : ReadingBlends vertices p) (hq : ReadingBlends vertices q)
      (hu : 0 ≤ u) (hunit : u ≤ 1) :
      ReadingBlends vertices (fun i => (1 - u) * p i + u * q i)

/-- The explicit affine-factor map takes each finite blend of readings to
a finite blend of the corresponding factor pairs. -/
theorem reading_blends_map {n : ℕ} (vertices : Set (Fin n → ℝ))
    (first second : Fin n → ℝ) (firstBias secondBias : ℝ)
    {readings : Fin n → ℝ} (hreadings : ReadingBlends vertices readings) :
    FiniteBlends
      {v | ∃ r ∈ vertices,
        v = readingFactors first second firstBias secondBias r}
      (readingFactors first second firstBias secondBias readings) := by
  induction hreadings with
  | vertex p hp =>
      exact FiniteBlends.vertex _ ⟨p, hp, rfl⟩
  | blend p q u hp hq hu hunit ihp ihq =>
      rw [readingFactors_blend]
      exact FiniteBlends.blend
        (readingFactors first second firstBias secondBias p)
        (readingFactors first second firstBias secondBias q) u
        ihp ihq hu hunit

/-- A checked vertex margin for explicit affine functions of the readings
holds for every reading vector generated by finite convex blends. -/
theorem reading_blends_preserve_margin {n : ℕ}
    (vertices : Set (Fin n → ℝ))
    (first second : Fin n → ℝ) (firstBias secondBias margin : ℝ)
    (hvertices : ∀ r ∈ vertices,
      0 ≤ (readingFactors first second firstBias secondBias r).1 ∧
      0 ≤ (readingFactors first second firstBias secondBias r).2 ∧
      margin ≤ (readingFactors first second firstBias secondBias r).1 *
        (readingFactors first second firstBias secondBias r).2)
    {readings : Fin n → ℝ} (hreadings : ReadingBlends vertices readings) :
    margin ≤ (readingFactors first second firstBias secondBias readings).1 *
      (readingFactors first second firstBias secondBias readings).2 := by
  have hpairs : ∀ v ∈ {v | ∃ r ∈ vertices,
        v = readingFactors first second firstBias secondBias r},
      0 ≤ v.1 ∧ 0 ≤ v.2 ∧ margin ≤ v.1 * v.2 := by
    intro v hv
    rcases hv with ⟨r, hr, rfl⟩
    exact hvertices r hr
  exact (finite_blends_preserve_margin _ margin hpairs
    (reading_blends_map vertices first second firstBias secondBias hreadings)).2.2

/-- A candidate reading vector attaining the checked margin establishes
the exact minimum over all permitted finite reading blends. -/
theorem reading_blends_attained_minimum {n : ℕ}
    (vertices : Set (Fin n → ℝ))
    (first second : Fin n → ℝ) (firstBias secondBias margin : ℝ)
    (hvertices : ∀ r ∈ vertices,
      0 ≤ (readingFactors first second firstBias secondBias r).1 ∧
      0 ≤ (readingFactors first second firstBias secondBias r).2 ∧
      margin ≤ (readingFactors first second firstBias secondBias r).1 *
        (readingFactors first second firstBias secondBias r).2)
    (witness : Fin n → ℝ) (hwitness : witness ∈ vertices)
    (hattain : (readingFactors first second firstBias secondBias witness).1 *
        (readingFactors first second firstBias secondBias witness).2 = margin) :
    (∀ r, ReadingBlends vertices r →
      margin ≤ (readingFactors first second firstBias secondBias r).1 *
        (readingFactors first second firstBias secondBias r).2) ∧
      (∃ r, ReadingBlends vertices r ∧
        (readingFactors first second firstBias secondBias r).1 *
          (readingFactors first second firstBias secondBias r).2 = margin) := by
  constructor
  · intro r hr
    exact reading_blends_preserve_margin vertices first second
      firstBias secondBias margin hvertices hr
  · exact ⟨witness, ReadingBlends.vertex witness hwitness, hattain⟩

end AffineProduct

/-!
For one fixed reading order, the median is one coordinate for odd samples
or the average of the central two for even samples. The indices below are
parameters: proving that they are central for each ordering cell is a
separate task. The formulas apply to any positive finite sample size.
-/
namespace FixedMedianCell

open AffineProduct

noncomputable def mean (n : ℕ) (x : Fin n → ℝ) : ℝ :=
  (∑ i : Fin n, x i) / (n : ℝ)

noncomputable def median {n : ℕ} (low high : Fin n) (x : Fin n → ℝ) : ℝ :=
  (x low + x high) / 2

noncomputable def meanCoeff (n : ℕ) : Fin n → ℝ := fun _ => 1 / (n : ℝ)

noncomputable def medianCoeff {n : ℕ} (low high : Fin n) : Fin n → ℝ :=
  fun i => (if i = low then (1 / 2 : ℝ) else 0) +
    (if i = high then (1 / 2 : ℝ) else 0)

theorem mean_is_affine {n : ℕ} (x : Fin n → ℝ) :
    readingAffine (meanCoeff n) 0 x = mean n x := by
  simp only [readingAffine, meanCoeff, mean, add_zero]
  rw [← Finset.mul_sum]
  ring

theorem median_is_affine {n : ℕ} (low high : Fin n) (x : Fin n → ℝ) :
    readingAffine (medianCoeff low high) 0 x = median low high x := by
  classical
  simp only [readingAffine, medianCoeff, median, add_zero]
  have hterm (i : Fin n) :
      ((if i = low then (1 / 2 : ℝ) else 0) +
        (if i = high then (1 / 2 : ℝ) else 0)) * x i =
        (if i = low then x i / 2 else 0) +
          (if i = high then x i / 2 else 0) := by
    split_ifs <;> ring
  simp_rw [hterm]
  simp [Finset.sum_add_distrib]
  ring

private theorem readingAffine_combo {n : ℕ} (a b : Fin n → ℝ)
    (aBias bBias u v : ℝ) (x : Fin n → ℝ) :
    readingAffine (fun i => u * a i + v * b i)
        (u * aBias + v * bBias) x =
      u * readingAffine a aBias x + v * readingAffine b bBias x := by
  have hterm (i : Fin n) :
      (u * a i + v * b i) * x i =
        u * (a i * x i) + v * (b i * x i) := by ring
  simp only [readingAffine]
  simp_rw [hterm]
  rw [Finset.sum_add_distrib, ← Finset.mul_sum, ← Finset.mul_sum]
  ring

noncomputable def differenceCoeff {n : ℕ} (low high : Fin n) (sign : ℝ) :
    Fin n → ℝ :=
  fun i => sign * meanCoeff n i - sign * medianCoeff low high i

noncomputable def midpointCoeff {n : ℕ} (low high : Fin n) (side : ℝ) : Fin n → ℝ :=
  fun i => (side / 2) * meanCoeff n i +
    (side / 2) * medianCoeff low high i

theorem difference_is_affine {n : ℕ} (low high : Fin n)
    (sign : ℝ) (x : Fin n → ℝ) :
    readingAffine (differenceCoeff low high sign) 0 x =
      sign * (mean n x - median low high x) := by
  calc
    readingAffine (differenceCoeff low high sign) 0 x =
        sign * readingAffine (meanCoeff n) 0 x +
          (-sign) * readingAffine (medianCoeff low high) 0 x := by
      unfold differenceCoeff
      simpa only [neg_mul, sub_eq_add_neg, mul_zero, add_zero] using
        readingAffine_combo (meanCoeff n) (medianCoeff low high)
          0 0 sign (-sign) x
    _ = sign * (mean n x - median low high x) := by
      rw [mean_is_affine, median_is_affine]
      ring

theorem midpoint_is_affine {n : ℕ} (low high : Fin n)
    (side target : ℝ) (x : Fin n → ℝ) :
    readingAffine (midpointCoeff low high side) (-side * target) x =
      side * ((mean n x + median low high x) / 2 - target) := by
  have hcombo : readingAffine (midpointCoeff low high side) 0 x =
      (side / 2) * readingAffine (meanCoeff n) 0 x +
        (side / 2) * readingAffine (medianCoeff low high) 0 x := by
    unfold midpointCoeff
    simpa only [mul_zero, add_zero] using
      readingAffine_combo (meanCoeff n) (medianCoeff low high)
        0 0 (side / 2) (side / 2) x
  have hbias : readingAffine (midpointCoeff low high side) (-side * target) x =
      readingAffine (midpointCoeff low high side) 0 x - side * target := by
    simp only [readingAffine, add_zero, neg_mul, sub_eq_add_neg]
  rw [hbias, hcombo, mean_is_affine, median_is_affine]
  ring

/-- On a stipulated median-ordering cell, the product of the explicit
affine reading factors is exactly half of the doubly oriented squared-error
lead. The two orientations handle either side of the midpoint. -/
theorem signed_gap_factors {n : ℕ} (low high : Fin n)
    (sign side target : ℝ) (x : Fin n → ℝ) :
    2 * (readingFactors (differenceCoeff low high sign)
        (midpointCoeff low high side) 0 (-side * target) x).1 *
      (readingFactors (differenceCoeff low high sign)
        (midpointCoeff low high side) 0 (-side * target) x).2 =
      sign * side * ((mean n x - target) ^ 2 -
        (median low high x - target) ^ 2) := by
  simp only [readingFactors, difference_is_affine, midpoint_is_affine]
  ring

/-- A verified affine-product margin becomes a squared-error guarantee
for every reading vector generated from the stipulated cell candidates. -/
theorem signed_gap_margin {n : ℕ} (vertices : Set (Fin n → ℝ))
    (low high : Fin n) (sign side target margin : ℝ)
    (hvertices : ∀ r ∈ vertices,
      0 ≤ (readingFactors (differenceCoeff low high sign)
        (midpointCoeff low high side) 0 (-side * target) r).1 ∧
      0 ≤ (readingFactors (differenceCoeff low high sign)
        (midpointCoeff low high side) 0 (-side * target) r).2 ∧
      margin ≤ (readingFactors (differenceCoeff low high sign)
        (midpointCoeff low high side) 0 (-side * target) r).1 *
        (readingFactors (differenceCoeff low high sign)
          (midpointCoeff low high side) 0 (-side * target) r).2)
    {x : Fin n → ℝ} (hx : ReadingBlends vertices x) :
    2 * margin ≤ sign * side * ((mean n x - target) ^ 2 -
      (median low high x - target) ^ 2) := by
  have hmargin := reading_blends_preserve_margin vertices
    (differenceCoeff low high sign) (midpointCoeff low high side)
    0 (-side * target) margin hvertices hx
  rw [← signed_gap_factors low high sign side target x]
  linarith

end FixedMedianCell

/-!
On a fixed movement cell the mean and median are affine in the moved reading.
The mean has positive slope, and the median has nonnegative slope. These
lemmas justify the v6 target-horizon interpolation and the strict guarantees
outside its midpoint range. Cell boundaries and the global extrema must still
be supplied by the receipt verifier; this module does not parse v6 JSON.
-/
namespace TargetHorizon

def affineMean (slope intercept x : ℝ) : ℝ := slope * x + intercept

def affineMedian (slope intercept x : ℝ) : ℝ := slope * x + intercept

noncomputable def midpointTarget
    (meanSlope meanIntercept medianSlope medianIntercept x : ℝ) : ℝ :=
  (affineMean meanSlope meanIntercept x +
    affineMedian medianSlope medianIntercept x) / 2

/-- Affine interpolation exactly reconstructs every point of a median cell. -/
theorem midpoint_target_affine (a b c d p q u : ℝ) :
    midpointTarget a b c d (p + (q - p) * u) =
      midpointTarget a b c d p +
        (midpointTarget a b c d q - midpointTarget a b c d p) * u := by
  dsimp [midpointTarget, affineMean, affineMedian]
  ring

/-- A positive mean slope makes the midpoint target strictly increasing,
even when the median is constant on the cell. -/
theorem midpoint_target_strict (a b c d p q : ℝ)
    (ha : 0 < a) (hc : 0 ≤ c) (hpq : p < q) :
    midpointTarget a b c d p < midpointTarget a b c d q := by
  have hs : 0 < a + c := by linarith
  have hq : 0 < q - p := sub_pos.mpr hpq
  have hdiff : midpointTarget a b c d q - midpointTarget a b c d p =
      (a + c) * (q - p) / 2 := by
    dsimp [midpointTarget, affineMean, affineMedian]
    ring
  have hpositive : 0 < (a + c) * (q - p) / 2 :=
    div_pos (mul_pos hs hq) (by norm_num)
  exact sub_pos.mp (by rw [hdiff]; exact hpositive)

/-- The exact rational interpolation formula gives an in-cell reading for
every target between the cell's endpoint midpoint targets. -/
theorem midpoint_target_interpolation (a b c d p q t : ℝ)
    (ha : 0 < a) (hc : 0 ≤ c) (hpq : p < q)
    (hpt : midpointTarget a b c d p ≤ t)
    (htq : t ≤ midpointTarget a b c d q) :
    ∃ x, p ≤ x ∧ x ≤ q ∧ midpointTarget a b c d x = t := by
  have hden : 0 < midpointTarget a b c d q - midpointTarget a b c d p :=
    sub_pos.mpr (midpoint_target_strict a b c d p q ha hc hpq)
  let u : ℝ := (t - midpointTarget a b c d p) /
    (midpointTarget a b c d q - midpointTarget a b c d p)
  have hu0 : 0 ≤ u := by
    dsimp [u]
    exact div_nonneg (sub_nonneg.mpr hpt) (le_of_lt hden)
  have hu1 : u ≤ 1 := by
    dsimp [u]
    apply (div_le_iff₀ hden).2
    linarith
  have hprod0 : 0 ≤ (q - p) * u :=
    mul_nonneg (sub_nonneg.mpr (le_of_lt hpq)) hu0
  have hprod1 : (q - p) * u ≤ q - p := by
    have h := mul_le_mul_of_nonneg_left hu1 (sub_nonneg.mpr (le_of_lt hpq))
    nlinarith
  have hratio : (midpointTarget a b c d q - midpointTarget a b c d p) * u =
      t - midpointTarget a b c d p := by
    dsimp [u]
    field_simp [ne_of_gt hden]
  refine ⟨p + (q - p) * u, ?_, ?_, ?_⟩
  · linarith
  · linarith
  · rw [midpoint_target_affine a b c d p q u]
    linarith

/-- Interpolation locates an actual equal-error reading, not just a sampled
or approximately plotted target value. -/
theorem interpolated_error_tie (a b c d p q t : ℝ)
    (ha : 0 < a) (hc : 0 ≤ c) (hpq : p < q)
    (hpt : midpointTarget a b c d p ≤ t)
    (htq : t ≤ midpointTarget a b c d q) :
    ∃ x, p ≤ x ∧ x ≤ q ∧
      |affineMean a b x - t| = |affineMedian c d x - t| := by
  obtain ⟨x, hpx, hxq, hx⟩ :=
    midpoint_target_interpolation a b c d p q t ha hc hpq hpt htq
  refine ⟨x, hpx, hxq, ?_⟩
  rw [← hx]
  apply midpoint_tie
  dsimp [midpointTarget]
  ring

/-- Two adjacent affine cells cover every target between their outer
midpoints, even when the target lies exactly at the shared knot. The
agreement hypothesis states that the two cell formulas describe the same
midpoint at the knot. -/
theorem two_cell_error_tie
    (a₁ b₁ c₁ d₁ a₂ b₂ c₂ d₂ low knot high t : ℝ)
    (ha₁ : 0 < a₁) (hc₁ : 0 ≤ c₁) (ha₂ : 0 < a₂) (hc₂ : 0 ≤ c₂)
    (hlk : low < knot) (hkh : knot < high)
    (hjoin : midpointTarget a₁ b₁ c₁ d₁ knot =
      midpointTarget a₂ b₂ c₂ d₂ knot)
    (hlo : midpointTarget a₁ b₁ c₁ d₁ low ≤ t)
    (hhi : t ≤ midpointTarget a₂ b₂ c₂ d₂ high) :
    (∃ x, low ≤ x ∧ x ≤ knot ∧
      |affineMean a₁ b₁ x - t| = |affineMedian c₁ d₁ x - t|) ∨
    (∃ x, knot ≤ x ∧ x ≤ high ∧
      |affineMean a₂ b₂ x - t| = |affineMedian c₂ d₂ x - t|) := by
  rcases le_total t (midpointTarget a₁ b₁ c₁ d₁ knot) with hleft | hright
  · left
    exact interpolated_error_tie a₁ b₁ c₁ d₁ low knot t
      ha₁ hc₁ hlk hlo hleft
  · right
    apply interpolated_error_tie a₂ b₂ c₂ d₂ knot high t ha₂ hc₂ hkh
    · rw [← hjoin]
      exact hright
    · exact hhi

/-- A finite chain of adjoining midpoint cells. A leaf supplies its own
interval coverage; `append` glues any two chains at a shared reading.
This structure is independent of how a concrete receipt enumerates cells. -/
inductive MidpointPath (h : ℝ → ℝ) : ℝ → ℝ → Prop where
  | cell (p q : ℝ) (ordered : p ≤ q) (rising : h p ≤ h q)
      (covers : ∀ target, h p ≤ target → target ≤ h q →
        ∃ x, p ≤ x ∧ x ≤ q ∧ h x = target) : MidpointPath h p q
  | append {p q r : ℝ} (left : MidpointPath h p q)
      (right : MidpointPath h q r) : MidpointPath h p r

/-- Any finite chain of adjoining cells covers all midpoint targets between
its outer endpoints. This closes the no-gap step for any number of cells. -/
theorem midpoint_path_covers {h : ℝ → ℝ} {p q : ℝ}
    (path : MidpointPath h p q) :
    p ≤ q ∧ h p ≤ h q ∧
      ∀ target, h p ≤ target → target ≤ h q →
        ∃ x, p ≤ x ∧ x ≤ q ∧ h x = target := by
  induction path with
  | cell p q ordered rising covers =>
      exact ⟨ordered, rising, covers⟩
  | @append p q r left right ihleft ihright =>
      obtain ⟨hpq, hphq, hleft⟩ := ihleft
      obtain ⟨hqr, hqhr, hright⟩ := ihright
      refine ⟨le_trans hpq hqr, le_trans hphq hqhr, ?_⟩
      intro target hpt htr
      rcases le_total target (h q) with htq | hqt
      · obtain ⟨x, hpx, hxq, hx⟩ := hleft target hpt htq
        exact ⟨x, hpx, le_trans hxq hqr, hx⟩
      · obtain ⟨x, hqx, hxr, hx⟩ := hright target hqt htr
        exact ⟨x, le_trans hpq hqx, hxr, hx⟩

/-- A cell with positive mean slope and nonnegative median slope supplies
a leaf of the path, provided the actual route midpoint agrees with its
affine formula throughout that cell. -/
theorem affine_cell_path (h : ℝ → ℝ) (a b c d p q : ℝ)
    (ha : 0 < a) (hc : 0 ≤ c) (hpq : p < q)
    (hagrees : ∀ x, p ≤ x → x ≤ q →
      h x = midpointTarget a b c d x) : MidpointPath h p q := by
  apply MidpointPath.cell p q (le_of_lt hpq)
  · rw [hagrees p (le_refl p) (le_of_lt hpq),
      hagrees q (le_of_lt hpq) (le_refl q)]
    exact le_of_lt (midpoint_target_strict a b c d p q ha hc hpq)
  · intro target hpt htq
    rw [hagrees p (le_refl p) (le_of_lt hpq)] at hpt
    rw [hagrees q (le_of_lt hpq) (le_refl q)] at htq
    obtain ⟨x, hpx, hxq, hx⟩ :=
      midpoint_target_interpolation a b c d p q target ha hc hpq hpt htq
    exact ⟨x, hpx, hxq, (hagrees x hpx hxq).trans hx⟩

/-- The common original sample joins the midpoint ranges of different
reading routes. If the reported lower and upper endpoints are attained by
routes at the movement limits, and each route interpolates all targets
between its own endpoint midpoints, then *every* target in the global
horizon has an exact equal-error witness. The endpoint routes can differ.

Route interpolation is an explicit hypothesis: the verifier must enumerate
and glue every affine median cell for the concrete input. This theorem does
not infer that hypothesis or the global extrema from a JSON receipt. -/
theorem common_anchor_horizon_tie (Route : Type*)
    (mean median : Route → ℝ → ℝ)
    (low original high lower upper anchor t : ℝ)
    (hlow : low ≤ original) (hhigh : original ≤ high)
    (hmin : ∃ r, (mean r low + median r low) / 2 = lower)
    (hmax : ∃ r, (mean r high + median r high) / 2 = upper)
    (hanchor : ∀ r, (mean r original + median r original) / 2 = anchor)
    (hinterpolate : ∀ r p q target, low ≤ p → p ≤ q → q ≤ high →
      (mean r p + median r p) / 2 ≤ target →
      target ≤ (mean r q + median r q) / 2 →
      ∃ x, p ≤ x ∧ x ≤ q ∧
        (mean r x + median r x) / 2 = target)
    (hlt : lower ≤ t) (htu : t ≤ upper) :
    ∃ r x, low ≤ x ∧ x ≤ high ∧
      |mean r x - t| = |median r x - t| := by
  rcases le_total t anchor with hleft | hright
  · obtain ⟨r, hr⟩ := hmin
    obtain ⟨x, hlowx, hxoriginal, hx⟩ :=
      hinterpolate r low original t (le_refl low) hlow hhigh
        (by rw [hr]; exact hlt)
        (by rw [hanchor r]; exact hleft)
    refine ⟨r, x, hlowx, le_trans hxoriginal hhigh, ?_⟩
    apply midpoint_tie (mean r x) (median r x) t
    linarith
  · obtain ⟨r, hr⟩ := hmax
    obtain ⟨x, horiginalx, hxhigh, hx⟩ :=
      hinterpolate r original high t hlow hhigh (le_refl high)
        (by rw [hanchor r]; exact hright)
        (by rw [hr]; exact htu)
    refine ⟨r, x, le_trans hlow horiginalx, hxhigh, ?_⟩
    apply midpoint_tie (mean r x) (median r x) t
    linarith

/-- With finite affine-cell paths on each side of the shared original
reading, global horizon coverage follows without assuming route-level
interpolation separately. `affine_cell_path` and `MidpointPath.append`
can construct the two paths from every verified cell on a route. -/
theorem cell_paths_horizon_tie (Route : Type*)
    (mean median : Route → ℝ → ℝ)
    (low original high lower upper anchor t : ℝ)
    (hlow : low ≤ original) (hhigh : original ≤ high)
    (hmin : ∃ r, (mean r low + median r low) / 2 = lower)
    (hmax : ∃ r, (mean r high + median r high) / 2 = upper)
    (hanchor : ∀ r, (mean r original + median r original) / 2 = anchor)
    (hpaths : ∀ r,
      MidpointPath (fun x => (mean r x + median r x) / 2) low original ∧
      MidpointPath (fun x => (mean r x + median r x) / 2) original high)
    (hlt : lower ≤ t) (htu : t ≤ upper) :
    ∃ r x, low ≤ x ∧ x ≤ high ∧
      |mean r x - t| = |median r x - t| := by
  rcases le_total t anchor with hleft | hright
  · obtain ⟨r, hr⟩ := hmin
    obtain ⟨_, _, hcover⟩ := midpoint_path_covers (hpaths r).1
    obtain ⟨x, hlowx, hxoriginal, hx⟩ :=
      hcover t (by rw [hr]; exact hlt)
        (by rw [hanchor r]; exact hleft)
    refine ⟨r, x, hlowx, le_trans hxoriginal hhigh, ?_⟩
    apply midpoint_tie (mean r x) (median r x) t
    linarith
  · obtain ⟨r, hr⟩ := hmax
    obtain ⟨_, _, hcover⟩ := midpoint_path_covers (hpaths r).2
    obtain ⟨x, horiginalx, hxhigh, hx⟩ :=
      hcover t (by rw [hanchor r]; exact hright)
        (by rw [hr]; exact htu)
    refine ⟨r, x, le_trans hlow horiginalx, hxhigh, ?_⟩
    apply midpoint_tie (mean r x) (median r x) t
    linarith

/-- Strictly below the midpoint target, the lower estimate strictly wins. -/
theorem lower_strict_below_midpoint (m d t : ℝ)
    (hmd : m < d) (ht : 2 * t < m + d) : |m - t| < |d - t| := by
  have hle := lower_no_worse_at_midpoint m d t (le_of_lt hmd) (le_of_lt ht)
  rcases lt_or_eq_of_le hle with hlt | heq
  · exact hlt
  · have hmid := (distinct_estimates_tie_iff_midpoint m d t hmd).mp heq
    linarith

/-- Strictly above the midpoint target, the higher estimate strictly wins. -/
theorem higher_strict_above_midpoint (m d t : ℝ)
    (hmd : m < d) (ht : m + d < 2 * t) : |d - t| < |m - t| := by
  have hle := higher_no_worse_at_midpoint m d t (le_of_lt hmd) (le_of_lt ht)
  rcases lt_or_eq_of_le hle with hlt | heq
  · exact hlt
  · have hmid := (distinct_estimates_tie_iff_midpoint m d t hmd).mp heq.symm
    linarith

/-- Once the endpoint bounds and common strict ordering have been checked,
the outside winner follows for every route, including infinitely many real
movement positions. `Route` need not be finite. -/
theorem strict_outside_horizon (Route : Type*)
    (mean median : Route → ℝ) (lower upper t : ℝ)
    (horder : ∀ r, mean r < median r)
    (hlower : ∀ r, lower ≤ (mean r + median r) / 2)
    (hupper : ∀ r, (mean r + median r) / 2 ≤ upper) :
    (t < lower → ∀ r, |mean r - t| < |median r - t|) ∧
      (upper < t → ∀ r, |median r - t| < |mean r - t|) := by
  constructor
  · intro ht r
    apply lower_strict_below_midpoint (mean r) (median r) t (horder r)
    have h := hlower r
    linarith
  · intro ht r
    apply higher_strict_above_midpoint (mean r) (median r) t (horder r)
    have h := hupper r
    linarith

/-- An exact open radius around a target outside the horizon preserves the
universal strict result. The estimator called `mean` here is the lower one;
swapping the functions covers the opposite ordering. -/
theorem strict_outside_horizon_open_margin (Route : Type*)
    (mean median : Route → ℝ) (lower upper base : ℝ)
    (horder : ∀ r, mean r < median r)
    (hlower : ∀ r, lower ≤ (mean r + median r) / 2)
    (hupper : ∀ r, (mean r + median r) / 2 ≤ upper) :
    (base < lower → 0 < lower - base ∧
      ∀ u, |u - base| < lower - base →
        ∀ r, |mean r - u| < |median r - u|) ∧
    (upper < base → 0 < base - upper ∧
      ∀ u, |u - base| < base - upper →
        ∀ r, |median r - u| < |mean r - u|) := by
  constructor
  · intro hbase
    constructor
    · linarith
    · intro u hu r
      have hright := (abs_lt.mp hu).2
      exact (strict_outside_horizon Route mean median lower upper u
        horder hlower hupper).1 (by linarith) r
  · intro hbase
    constructor
    · linarith
    · intro u hu r
      have hleft := (abs_lt.mp hu).1
      exact (strict_outside_horizon Route mean median lower upper u
        horder hlower hupper).2 (by linarith) r

/-- If the boundary midpoint is attained, the reported open margin is sharp:
the boundary itself is an exact tie. -/
theorem target_margin_boundary_tie (m d boundary : ℝ)
    (hmid : (m + d) / 2 = boundary) :
    |m - boundary| = |d - boundary| := by
  apply midpoint_tie m d boundary
  linarith

/-- The same outside-horizon guarantee with the median below the mean. -/
theorem strict_outside_horizon_reverse (Route : Type*)
    (mean median : Route → ℝ) (lower upper t : ℝ)
    (horder : ∀ r, median r < mean r)
    (hlower : ∀ r, lower ≤ (mean r + median r) / 2)
    (hupper : ∀ r, (mean r + median r) / 2 ≤ upper) :
    (t < lower → ∀ r, |median r - t| < |mean r - t|) ∧
      (upper < t → ∀ r, |mean r - t| < |median r - t|) := by
  exact strict_outside_horizon Route median mean lower upper t horder
    (by intro r; have h := hlower r; linarith)
    (by intro r; have h := hupper r; linarith)

/-- If one permitted reading makes the estimates equal, neither estimator
can strictly win on every route at any target. -/
theorem equal_estimates_block_global_strict (Route : Type*)
    (mean median : Route → ℝ) (r : Route) (heq : mean r = median r) (t : ℝ) :
    (¬ ∀ s, |mean s - t| < |median s - t|) ∧
      (¬ ∀ s, |median s - t| < |mean s - t|) := by
  constructor
  · intro h
    have hr := h r
    rw [heq] at hr
    exact (lt_irrefl _) hr
  · intro h
    have hr := h r
    rw [heq] at hr
    exact (lt_irrefl _) hr

/-- Explicitly sorted sample after replacing the first `8` in the v6
example `[8,6,8,7,0,8]` by `4`. -/
def sixReadingTieSample : List ℝ := [0, 4, 6, 7, 8, 8]

theorem six_reading_mean : sampleMean sixReadingTieSample = 11 / 2 := by
  norm_num [sampleMean, sixReadingTieSample]

theorem six_reading_median : orderedMedian sixReadingTieSample = 13 / 2 := by
  norm_num [orderedMedian, sixReadingTieSample]

theorem six_reading_target_six_tie :
    |sampleMean sixReadingTieSample - 6| =
      |orderedMedian sixReadingTieSample - 6| := by
  rw [six_reading_mean, six_reading_median]
  norm_num

/-- The first route at movement low `0`. The six-route theorem below proves
that its midpoint is the global lower bound in the permitted movement box. -/
def sixReadingLowEndpoint : List ℝ := [0, 0, 6, 7, 8, 8]

theorem six_reading_low_endpoint_midpoint :
    (sampleMean sixReadingLowEndpoint + orderedMedian sixReadingLowEndpoint) / 2 =
      17 / 3 := by
  norm_num [sampleMean, orderedMedian, sixReadingLowEndpoint]

/-- The fifth route at movement high `10`. The six-route theorem below proves
that its midpoint is the global upper bound in the permitted movement box. -/
def sixReadingHighEndpoint : List ℝ := [6, 7, 8, 8, 8, 10]

theorem six_reading_high_endpoint_midpoint :
    (sampleMean sixReadingHighEndpoint + orderedMedian sixReadingHighEndpoint) / 2 =
      95 / 12 := by
  norm_num [sampleMean, orderedMedian, sixReadingHighEndpoint]

/-!
The v6 example's lower endpoint is reached by moving the first `8` in
`[8,6,8,7,0,8]`; the upper endpoint is reached by moving the fifth `0`.
These two explicit piecewise formulas model those routes. The receipt
verifiers separately check that its knots and route formulas match sorting
the moved sample. The following Lean proof checks every real target in the
reported inner interval, not just the receipt's one target-6 probe.
-/
noncomputable def sixLowRouteMean (x : ℝ) : ℝ := (x + 29) / 6

noncomputable def sixLowRouteMedian (x : ℝ) : ℝ :=
  if x ≤ 6 then 13 / 2 else if x ≤ 8 then (x + 7) / 2 else 15 / 2

noncomputable def sixHighRouteMean (x : ℝ) : ℝ := (x + 37) / 6

noncomputable def sixHighRouteMedian (x : ℝ) : ℝ :=
  if x ≤ 7 then 15 / 2 else if x ≤ 8 then (x + 8) / 2 else 8

/-- The route mean formulas come directly from replacing the indicated
reading in the original six-element sample. -/
theorem six_low_route_mean_from_sample (x : ℝ) :
    sampleMean [x, 6, 8, 7, 0, 8] = sixLowRouteMean x := by
  norm_num [sampleMean, sixLowRouteMean]

theorem six_high_route_mean_from_sample (x : ℝ) :
    sampleMean [8, 6, 8, 7, x, 8] = sixHighRouteMean x := by
  norm_num [sampleMean, sixHighRouteMean] <;> ring

private theorem six_low_route_path :
    MidpointPath (fun x => (sixLowRouteMean x + sixLowRouteMedian x) / 2)
      0 8 := by
  have first : MidpointPath
      (fun x => (sixLowRouteMean x + sixLowRouteMedian x) / 2) 0 6 := by
    apply affine_cell_path _ (1 / 6) (29 / 6) 0 (13 / 2) 0 6
      (by norm_num) (by norm_num) (by norm_num)
    intro x _ hx6
    simp only [sixLowRouteMean, sixLowRouteMedian, if_pos hx6,
      midpointTarget, affineMean, affineMedian]
    ring
  have second : MidpointPath
      (fun x => (sixLowRouteMean x + sixLowRouteMedian x) / 2) 6 8 := by
    apply affine_cell_path _ (1 / 6) (29 / 6) (1 / 2) (7 / 2) 6 8
      (by norm_num) (by norm_num) (by norm_num)
    intro x hx6 hx8
    by_cases hfirst : x ≤ 6
    · have heq : x = 6 := le_antisymm hfirst hx6
      subst x
      norm_num [sixLowRouteMean, sixLowRouteMedian, midpointTarget,
        affineMean, affineMedian]
    · simp only [sixLowRouteMean, sixLowRouteMedian, if_neg hfirst,
        if_pos hx8, midpointTarget, affineMean, affineMedian]
      ring
  exact MidpointPath.append first second

private theorem six_high_route_path :
    MidpointPath (fun x => (sixHighRouteMean x + sixHighRouteMedian x) / 2)
      0 10 := by
  have first : MidpointPath
      (fun x => (sixHighRouteMean x + sixHighRouteMedian x) / 2) 0 7 := by
    apply affine_cell_path _ (1 / 6) (37 / 6) 0 (15 / 2) 0 7
      (by norm_num) (by norm_num) (by norm_num)
    intro x _ hx7
    simp only [sixHighRouteMean, sixHighRouteMedian, if_pos hx7,
      midpointTarget, affineMean, affineMedian]
    ring
  have second : MidpointPath
      (fun x => (sixHighRouteMean x + sixHighRouteMedian x) / 2) 7 8 := by
    apply affine_cell_path _ (1 / 6) (37 / 6) (1 / 2) 4 7 8
      (by norm_num) (by norm_num) (by norm_num)
    intro x hx7 hx8
    by_cases hfirst : x ≤ 7
    · have heq : x = 7 := le_antisymm hfirst hx7
      subst x
      norm_num [sixHighRouteMean, sixHighRouteMedian, midpointTarget,
        affineMean, affineMedian]
    · simp only [sixHighRouteMean, sixHighRouteMedian, if_neg hfirst,
        if_pos hx8, midpointTarget, affineMean, affineMedian]
      ring
  have third : MidpointPath
      (fun x => (sixHighRouteMean x + sixHighRouteMedian x) / 2) 8 10 := by
    apply affine_cell_path _ (1 / 6) (37 / 6) 0 8 8 10
      (by norm_num) (by norm_num) (by norm_num)
    intro x hx8 _
    by_cases hlast : x ≤ 8
    · have heq : x = 8 := le_antisymm hlast hx8
      subst x
      norm_num [sixHighRouteMean, sixHighRouteMedian, midpointTarget,
        affineMean, affineMedian]
    · have hfirst : ¬ x ≤ 7 := by
        intro h
        linarith
      simp only [sixHighRouteMean, sixHighRouteMedian, if_neg hfirst,
        if_neg hlast, midpointTarget, affineMean, affineMedian]
      ring
  exact MidpointPath.append (MidpointPath.append first second) third

/-- For every real target in the example's reported horizon, one of two
explicit permitted reading routes yields an exact equal-error tie. This
checks the full inner interval; it does not certify the six-route global
extrema or the JSON parser. -/
theorem six_reading_inner_horizon_tie (t : ℝ)
    (hlt : 17 / 3 ≤ t) (htu : t ≤ 95 / 12) :
    (∃ x, 0 ≤ x ∧ x ≤ 8 ∧
      |sixLowRouteMean x - t| = |sixLowRouteMedian x - t|) ∨
    (∃ x, 0 ≤ x ∧ x ≤ 10 ∧
      |sixHighRouteMean x - t| = |sixHighRouteMedian x - t|) := by
  have hlow :
      (sixLowRouteMean 0 + sixLowRouteMedian 0) / 2 = 17 / 3 := by
    norm_num [sixLowRouteMean, sixLowRouteMedian]
  have hanchorLow :
      (sixLowRouteMean 8 + sixLowRouteMedian 8) / 2 = 41 / 6 := by
    norm_num [sixLowRouteMean, sixLowRouteMedian]
  have hanchorHigh :
      (sixHighRouteMean 0 + sixHighRouteMedian 0) / 2 = 41 / 6 := by
    norm_num [sixHighRouteMean, sixHighRouteMedian]
  have hhigh :
      (sixHighRouteMean 10 + sixHighRouteMedian 10) / 2 = 95 / 12 := by
    norm_num [sixHighRouteMean, sixHighRouteMedian]
  rcases le_total t (41 / 6 : ℝ) with hleft | hright
  · left
    obtain ⟨_, _, hcover⟩ := midpoint_path_covers six_low_route_path
    obtain ⟨x, hx0, hx8, hx⟩ :=
      hcover t (by rw [hlow]; exact hlt)
        (by rw [hanchorLow]; exact hleft)
    refine ⟨x, hx0, hx8, ?_⟩
    apply midpoint_tie (sixLowRouteMean x) (sixLowRouteMedian x) t
    linarith
  · right
    obtain ⟨_, _, hcover⟩ := midpoint_path_covers six_high_route_path
    obtain ⟨x, hx0, hx10, hx⟩ :=
      hcover t (by rw [hanchorHigh]; exact hright)
        (by rw [hhigh]; exact htu)
    refine ⟨x, hx0, hx10, ?_⟩
    apply midpoint_tie (sixHighRouteMean x) (sixHighRouteMedian x) t
    linarith

/-!
Each route function above agrees with the median of the moved six-element
sample. The witnesses below exhibit an ordered permutation on each cell,
including the cell boundaries; no sorting routine is assumed by the proof.
-/
private theorem six_entries_sorted (a b c d e f : ℝ)
    (hab : a ≤ b) (hbc : b ≤ c) (hcd : c ≤ d)
    (hde : d ≤ e) (hef : e ≤ f) :
    List.Pairwise (· ≤ ·) [a, b, c, d, e, f] := by
  apply List.Pairwise.cons_cons_of_trans hab
  apply List.Pairwise.cons_cons_of_trans hbc
  apply List.Pairwise.cons_cons_of_trans hcd
  apply List.Pairwise.cons_cons_of_trans hde
  apply List.Pairwise.cons_cons_of_trans hef
  simp

private theorem six_low_base_permutation (x : ℝ) :
    [0, x, 6, 7, 8, 8].Perm [x, 6, 8, 7, 0, 8] := by
  have moveZero : [x, 6, 8, 7, 0, 8].Perm [0, x, 6, 8, 7, 8] := by
    simpa using (List.perm_middle (a := (0 : ℝ))
      (l₁ := [x, 6, 8, 7]) (l₂ := [8]))
  have swapMiddle : [0, x, 6, 8, 7, 8].Perm [0, x, 6, 7, 8, 8] := by
    exact List.Perm.cons 0 (List.Perm.cons x
      (List.Perm.cons 6 (List.Perm.swap 7 8 [8])))
  exact (moveZero.trans swapMiddle).symm

private theorem six_high_base_permutation (x : ℝ) :
    [x, 6, 7, 8, 8, 8].Perm [8, 6, 8, 7, x, 8] := by
  have moveX : [8, 6, 8, 7, x, 8].Perm [x, 8, 6, 8, 7, 8] := by
    simpa using (List.perm_middle (a := x)
      (l₁ := [8, 6, 8, 7]) (l₂ := [8]))
  have moveSix : [(8 : ℝ), 6, 8, 7, 8].Perm [6, 8, 8, 7, 8] := by
    simpa using (List.perm_middle (a := (6 : ℝ))
      (l₁ := [8]) (l₂ := [8, 7, 8]))
  have moveSeven : [(8 : ℝ), 8, 7, 8].Perm [7, 8, 8, 8] := by
    simpa using (List.perm_middle (a := (7 : ℝ))
      (l₁ := [8, 8]) (l₂ := [8]))
  have sortFixed : [(8 : ℝ), 6, 8, 7, 8].Perm [6, 7, 8, 8, 8] :=
    moveSix.trans (List.Perm.cons 6 moveSeven)
  exact (moveX.trans (List.Perm.cons x sortFixed)).symm

/-- The low-end route's median comes from a sorted permutation of the
original sample after moving its first reading to any `x ∈ [0,8]`. -/
theorem six_low_route_sorted_median (x : ℝ) (hx0 : 0 ≤ x) (hx8 : x ≤ 8) :
    ∃ ys : List ℝ, ys.Perm [x, 6, 8, 7, 0, 8] ∧
      List.Pairwise (· ≤ ·) ys ∧ orderedMedian ys = sixLowRouteMedian x := by
  by_cases hx6 : x ≤ 6
  · refine ⟨[0, x, 6, 7, 8, 8], six_low_base_permutation x,
      six_entries_sorted 0 x 6 7 8 8 hx0 hx6 (by norm_num)
        (by norm_num) (by norm_num), ?_⟩
    norm_num [orderedMedian, sixLowRouteMedian, hx6]
  · by_cases hx7 : x ≤ 7
    · have hx6le : 6 ≤ x := by linarith
      have p : [0, x, 6, 7, 8, 8].Perm [0, 6, x, 7, 8, 8] :=
        List.Perm.cons 0 (List.Perm.swap 6 x [7, 8, 8])
      refine ⟨[0, 6, x, 7, 8, 8],
        p.symm.trans (six_low_base_permutation x),
        six_entries_sorted 0 6 x 7 8 8 (by norm_num) hx6le hx7
          (by norm_num) (by norm_num), ?_⟩
      have hx8' : x ≤ 8 := le_trans hx7 (by norm_num)
      simp [orderedMedian, sixLowRouteMedian, hx6, hx8']
    · have hx7le : 7 ≤ x := by linarith
      have p : [0, x, 6, 7, 8, 8].Perm [0, 6, x, 7, 8, 8] :=
        List.Perm.cons 0 (List.Perm.swap 6 x [7, 8, 8])
      have q : [0, 6, x, 7, 8, 8].Perm [0, 6, 7, x, 8, 8] :=
        List.Perm.cons 0 (List.Perm.cons 6 (List.Perm.swap 7 x [8, 8]))
      refine ⟨[0, 6, 7, x, 8, 8],
        q.symm.trans (p.symm.trans (six_low_base_permutation x)),
        six_entries_sorted 0 6 7 x 8 8 (by norm_num) (by norm_num)
          hx7le hx8 (by norm_num), ?_⟩
      simp [orderedMedian, sixLowRouteMedian, hx6, hx8] <;> ring

/-- The high-end route's median comes from a sorted permutation after
moving the original sample's fifth reading to any `x ∈ [0,10]`. -/
theorem six_high_route_sorted_median (x : ℝ) (hx0 : 0 ≤ x) (hx10 : x ≤ 10) :
    ∃ ys : List ℝ, ys.Perm [8, 6, 8, 7, x, 8] ∧
      List.Pairwise (· ≤ ·) ys ∧ orderedMedian ys = sixHighRouteMedian x := by
  by_cases hx6 : x ≤ 6
  · have hx7 : x ≤ 7 := by linarith
    refine ⟨[x, 6, 7, 8, 8, 8], six_high_base_permutation x,
      six_entries_sorted x 6 7 8 8 8 hx6 (by norm_num)
        (by norm_num) (by norm_num) (by norm_num), ?_⟩
    norm_num [orderedMedian, sixHighRouteMedian, hx7]
  · have hx6le : 6 ≤ x := by linarith
    have p : [x, 6, 7, 8, 8, 8].Perm [6, x, 7, 8, 8, 8] :=
      List.Perm.swap 6 x [7, 8, 8, 8]
    by_cases hx7 : x ≤ 7
    · refine ⟨[6, x, 7, 8, 8, 8],
        p.symm.trans (six_high_base_permutation x),
        six_entries_sorted 6 x 7 8 8 8 hx6le hx7 (by norm_num)
          (by norm_num) (by norm_num), ?_⟩
      norm_num [orderedMedian, sixHighRouteMedian, hx7]
    · have hx7le : 7 ≤ x := by linarith
      have q : [6, x, 7, 8, 8, 8].Perm [6, 7, x, 8, 8, 8] :=
        List.Perm.cons 6 (List.Perm.swap 7 x [8, 8, 8])
      by_cases hx8 : x ≤ 8
      · refine ⟨[6, 7, x, 8, 8, 8],
          q.symm.trans (p.symm.trans (six_high_base_permutation x)),
          six_entries_sorted 6 7 x 8 8 8 (by norm_num) hx7le hx8
            (by norm_num) (by norm_num), ?_⟩
        simp [orderedMedian, sixHighRouteMedian, hx7, hx8]
      · have hx8le : 8 ≤ x := by linarith
        have pLast : [6, 7, 8, 8, 8, x].Perm [x, 6, 7, 8, 8, 8] := by
          simpa using (List.perm_append_singleton x [6, 7, 8, 8, 8])
        refine ⟨[6, 7, 8, 8, 8, x],
          pLast.trans (six_high_base_permutation x),
          six_entries_sorted 6 7 8 8 8 x (by norm_num)
            (by norm_num) (by norm_num) (by norm_num) hx8le, ?_⟩
        simp [orderedMedian, sixHighRouteMedian, hx7, hx8]

/-- Every target in the reported inner horizon has an exact tie from a
one-reading move on the original sample and its exhibited sorted median. -/
theorem six_reading_sorted_sample_horizon_tie (t : ℝ)
    (hlt : 17 / 3 ≤ t) (htu : t ≤ 95 / 12) :
    (∃ (x : ℝ) (ys : List ℝ), 0 ≤ x ∧ x ≤ 8 ∧
      ys.Perm [x, 6, 8, 7, 0, 8] ∧ List.Pairwise (· ≤ ·) ys ∧
      |sampleMean [x, 6, 8, 7, 0, 8] - t| = |orderedMedian ys - t|) ∨
    (∃ (x : ℝ) (ys : List ℝ), 0 ≤ x ∧ x ≤ 10 ∧
      ys.Perm [8, 6, 8, 7, x, 8] ∧ List.Pairwise (· ≤ ·) ys ∧
      |sampleMean [8, 6, 8, 7, x, 8] - t| = |orderedMedian ys - t|) := by
  rcases six_reading_inner_horizon_tie t hlt htu with
    ⟨x, hx0, hx8, htie⟩ | ⟨x, hx0, hx10, htie⟩
  · obtain ⟨ys, hperm, hsorted, hmedian⟩ :=
      six_low_route_sorted_median x hx0 hx8
    left
    refine ⟨x, ys, hx0, hx8, hperm, hsorted, ?_⟩
    rw [six_low_route_mean_from_sample, hmedian]
    exact htie
  · obtain ⟨ys, hperm, hsorted, hmedian⟩ :=
      six_high_route_sorted_median x hx0 hx10
    right
    refine ⟨x, ys, hx0, hx10, hperm, hsorted, ?_⟩
    rw [six_high_route_mean_from_sample, hmedian]
    exact htie

/-!
The two routes above give every inner tie. The remaining four index choices
must also be controlled before either outside winner is a global guarantee.
Three positions contain `8`, so they share the same median formula, but the
model records all six original indices rather than silently dropping routes.
-/
inductive SixReadingMove where
  | firstEight | six | thirdEight | seven | zero | lastEight
  deriving DecidableEq

def sixMovedSample : SixReadingMove → ℝ → List ℝ
  | .firstEight, x => [x, 6, 8, 7, 0, 8]
  | .six, x => [8, x, 8, 7, 0, 8]
  | .thirdEight, x => [8, 6, x, 7, 0, 8]
  | .seven, x => [8, 6, 8, x, 0, 8]
  | .zero, x => [8, 6, 8, 7, x, 8]
  | .lastEight, x => [8, 6, 8, 7, 0, x]

noncomputable def sixMoveMean : SixReadingMove → ℝ → ℝ
  | .firstEight, x => (x + 29) / 6
  | .six, x => (x + 31) / 6
  | .thirdEight, x => (x + 29) / 6
  | .seven, x => (x + 30) / 6
  | .zero, x => (x + 37) / 6
  | .lastEight, x => (x + 29) / 6

noncomputable def sixMoveMedian : SixReadingMove → ℝ → ℝ
  | .firstEight, x => sixLowRouteMedian x
  | .six, x => if x ≤ 7 then 15 / 2 else if x ≤ 8 then (x + 8) / 2 else 8
  | .thirdEight, x => sixLowRouteMedian x
  | .seven, x => if x ≤ 6 then 7 else if x ≤ 8 then (x + 8) / 2 else 8
  | .zero, x => sixHighRouteMedian x
  | .lastEight, x => sixLowRouteMedian x

theorem six_move_mean_from_sample (r : SixReadingMove) (x : ℝ) :
    sampleMean (sixMovedSample r x) = sixMoveMean r x := by
  cases r <;> norm_num [sixMovedSample, sixMoveMean, sampleMean] <;> ring

private theorem six_six_base_permutation (x : ℝ) :
    [0, x, 7, 8, 8, 8].Perm [8, x, 8, 7, 0, 8] := by
  have moveZero : [8, x, 8, 7, 0, 8].Perm [0, 8, x, 8, 7, 8] := by
    simpa using (List.perm_middle (a := (0 : ℝ))
      (l₁ := [8, x, 8, 7]) (l₂ := [8]))
  have moveSeven : [8, x, 8, 7, 8].Perm [7, 8, x, 8, 8] := by
    simpa using (List.perm_middle (a := (7 : ℝ))
      (l₁ := [8, x, 8]) (l₂ := [8]))
  have moveX : [8, x, 8, 8].Perm [x, 8, 8, 8] := by
    simpa using (List.perm_middle (a := x)
      (l₁ := [8]) (l₂ := [8, 8]))
  have swapSeven : [0, 7, x, 8, 8, 8].Perm [0, x, 7, 8, 8, 8] :=
    List.Perm.cons 0 (List.Perm.swap x 7 [8, 8, 8])
  have rearrange : [0, 8, x, 8, 7, 8].Perm [0, 7, x, 8, 8, 8] :=
    List.Perm.cons 0 (moveSeven.trans (List.Perm.cons 7 moveX))
  exact (moveZero.trans (rearrange.trans swapSeven)).symm

private theorem six_seven_base_permutation (x : ℝ) :
    [0, x, 6, 8, 8, 8].Perm [8, 6, 8, x, 0, 8] := by
  have moveZero : [8, 6, 8, x, 0, 8].Perm [0, 8, 6, 8, x, 8] := by
    simpa using (List.perm_middle (a := (0 : ℝ))
      (l₁ := [8, 6, 8, x]) (l₂ := [8]))
  have moveSix : [8, 6, 8, x, 8].Perm [6, 8, 8, x, 8] := by
    simpa using (List.perm_middle (a := (6 : ℝ))
      (l₁ := [8]) (l₂ := [8, x, 8]))
  have moveX : [8, 8, x, 8].Perm [x, 8, 8, 8] := by
    simpa using (List.perm_middle (a := x)
      (l₁ := [8, 8]) (l₂ := [8]))
  have swapSix : [0, 6, x, 8, 8, 8].Perm [0, x, 6, 8, 8, 8] :=
    List.Perm.cons 0 (List.Perm.swap x 6 [8, 8, 8])
  have rearrange : [0, 8, 6, 8, x, 8].Perm [0, 6, x, 8, 8, 8] :=
    List.Perm.cons 0 (moveSix.trans (List.Perm.cons 6 moveX))
  exact (moveZero.trans (rearrange.trans swapSix)).symm

private theorem six_eight_sorted_median (x : ℝ) (hx0 : 0 ≤ x)
    (hx10 : x ≤ 10) :
    ∃ ys : List ℝ, ys.Perm [x, 6, 8, 7, 0, 8] ∧
      List.Pairwise (· ≤ ·) ys ∧ orderedMedian ys = sixLowRouteMedian x := by
  by_cases hx8 : x ≤ 8
  · exact six_low_route_sorted_median x hx0 hx8
  · have hx8le : 8 ≤ x := by linarith
    have hx6 : ¬ x ≤ 6 := by linarith
    have moveLast : [0, 6, 7, 8, 8, x].Perm [x, 0, 6, 7, 8, 8] := by
      simpa using (List.perm_append_singleton x [0, 6, 7, 8, 8])
    have swapZero : [x, 0, 6, 7, 8, 8].Perm [0, x, 6, 7, 8, 8] :=
      List.Perm.swap 0 x [6, 7, 8, 8]
    refine ⟨[0, 6, 7, 8, 8, x],
      (moveLast.trans swapZero).trans (six_low_base_permutation x),
      six_entries_sorted 0 6 7 8 8 x (by norm_num) (by norm_num)
        (by norm_num) (by norm_num) hx8le, ?_⟩
    norm_num [orderedMedian, sixLowRouteMedian, hx6, hx8]

private theorem six_six_sorted_median (x : ℝ) (hx0 : 0 ≤ x)
    (hx10 : x ≤ 10) :
    ∃ ys : List ℝ, ys.Perm [8, x, 8, 7, 0, 8] ∧
      List.Pairwise (· ≤ ·) ys ∧
        orderedMedian ys = sixMoveMedian .six x := by
  by_cases hx7 : x ≤ 7
  · refine ⟨[0, x, 7, 8, 8, 8], six_six_base_permutation x,
      six_entries_sorted 0 x 7 8 8 8 hx0 hx7 (by norm_num)
        (by norm_num) (by norm_num), ?_⟩
    norm_num [orderedMedian, sixMoveMedian, hx7]
  · have hx7le : 7 ≤ x := by linarith
    have p : [0, x, 7, 8, 8, 8].Perm [0, 7, x, 8, 8, 8] :=
      List.Perm.cons 0 (List.Perm.swap 7 x [8, 8, 8])
    by_cases hx8 : x ≤ 8
    · refine ⟨[0, 7, x, 8, 8, 8],
        p.symm.trans (six_six_base_permutation x),
        six_entries_sorted 0 7 x 8 8 8 (by norm_num) hx7le hx8
          (by norm_num) (by norm_num), ?_⟩
      simp [orderedMedian, sixMoveMedian, hx7, hx8]
    · have hx8le : 8 ≤ x := by linarith
      have moveLast : [0, 7, 8, 8, 8, x].Perm [x, 0, 7, 8, 8, 8] := by
        simpa using (List.perm_append_singleton x [0, 7, 8, 8, 8])
      have swapZero : [x, 0, 7, 8, 8, 8].Perm [0, x, 7, 8, 8, 8] :=
        List.Perm.swap 0 x [7, 8, 8, 8]
      refine ⟨[0, 7, 8, 8, 8, x],
        (moveLast.trans swapZero).trans (six_six_base_permutation x),
        six_entries_sorted 0 7 8 8 8 x (by norm_num)
          (by norm_num) (by norm_num) (by norm_num) hx8le, ?_⟩
      simp [orderedMedian, sixMoveMedian, hx7, hx8]

private theorem six_seven_sorted_median (x : ℝ) (hx0 : 0 ≤ x)
    (hx10 : x ≤ 10) :
    ∃ ys : List ℝ, ys.Perm [8, 6, 8, x, 0, 8] ∧
      List.Pairwise (· ≤ ·) ys ∧
        orderedMedian ys = sixMoveMedian .seven x := by
  by_cases hx6 : x ≤ 6
  · refine ⟨[0, x, 6, 8, 8, 8], six_seven_base_permutation x,
      six_entries_sorted 0 x 6 8 8 8 hx0 hx6 (by norm_num)
        (by norm_num) (by norm_num), ?_⟩
    norm_num [orderedMedian, sixMoveMedian, hx6]
  · have hx6le : 6 ≤ x := by linarith
    have p : [0, x, 6, 8, 8, 8].Perm [0, 6, x, 8, 8, 8] :=
      List.Perm.cons 0 (List.Perm.swap 6 x [8, 8, 8])
    by_cases hx8 : x ≤ 8
    · refine ⟨[0, 6, x, 8, 8, 8],
        p.symm.trans (six_seven_base_permutation x),
        six_entries_sorted 0 6 x 8 8 8 (by norm_num) hx6le hx8
          (by norm_num) (by norm_num), ?_⟩
      simp [orderedMedian, sixMoveMedian, hx6, hx8]
    · have hx8le : 8 ≤ x := by linarith
      have moveLast : [0, 6, 8, 8, 8, x].Perm [x, 0, 6, 8, 8, 8] := by
        simpa using (List.perm_append_singleton x [0, 6, 8, 8, 8])
      have swapZero : [x, 0, 6, 8, 8, 8].Perm [0, x, 6, 8, 8, 8] :=
        List.Perm.swap 0 x [6, 8, 8, 8]
      refine ⟨[0, 6, 8, 8, 8, x],
        (moveLast.trans swapZero).trans (six_seven_base_permutation x),
        six_entries_sorted 0 6 8 8 8 x (by norm_num)
          (by norm_num) (by norm_num) (by norm_num) hx8le, ?_⟩
      simp [orderedMedian, sixMoveMedian, hx6, hx8]

/-- Every permitted index move has a concrete sorted permutation whose
order-statistic median agrees with its exact route formula. -/
theorem six_move_sorted_median (r : SixReadingMove) (x : ℝ)
    (hx0 : 0 ≤ x) (hx10 : x ≤ 10) :
    ∃ ys : List ℝ, ys.Perm (sixMovedSample r x) ∧
      List.Pairwise (· ≤ ·) ys ∧ orderedMedian ys = sixMoveMedian r x := by
  cases r with
  | firstEight => simpa [sixMovedSample, sixMoveMedian] using
      six_eight_sorted_median x hx0 hx10
  | six => simpa [sixMovedSample] using six_six_sorted_median x hx0 hx10
  | thirdEight =>
      obtain ⟨ys, hp, hs, hm⟩ := six_eight_sorted_median x hx0 hx10
      have swapEight : [x, 6, 8, 7, 0, 8].Perm [8, 6, x, 7, 0, 8] := by
        simpa using (List.cons_append_cons_perm
          (a := x) (b := (8 : ℝ)) (as := [6]) (bs := [7, 0, 8]))
      exact ⟨ys, by simpa [sixMovedSample] using hp.trans swapEight,
        hs, by simpa [sixMoveMedian] using hm⟩
  | seven => simpa [sixMovedSample] using six_seven_sorted_median x hx0 hx10
  | zero => simpa [sixMovedSample, sixMoveMedian] using
      six_high_route_sorted_median x hx0 hx10
  | lastEight =>
      obtain ⟨ys, hp, hs, hm⟩ := six_eight_sorted_median x hx0 hx10
      have swapEight : [x, 6, 8, 7, 0, 8].Perm [8, 6, 8, 7, 0, x] := by
        simpa using (List.cons_append_cons_perm
          (a := x) (b := (8 : ℝ)) (as := [6, 8, 7, 0]) (bs := []))
      exact ⟨ys, by simpa [sixMovedSample] using hp.trans swapEight,
        hs, by simpa [sixMoveMedian] using hm⟩

private theorem six_eight_bounds (x : ℝ) (hx0 : 0 ≤ x) (hx10 : x ≤ 10) :
    (x + 29) / 6 < sixLowRouteMedian x ∧
    17 / 3 ≤ ((x + 29) / 6 + sixLowRouteMedian x) / 2 ∧
    ((x + 29) / 6 + sixLowRouteMedian x) / 2 ≤ 95 / 12 := by
  by_cases hx6 : x ≤ 6
  · simp only [sixLowRouteMedian, if_pos hx6]
    constructor
    · linarith
    constructor <;> linarith
  · by_cases hx8 : x ≤ 8
    · simp only [sixLowRouteMedian, if_neg hx6, if_pos hx8]
      constructor
      · linarith
      constructor <;> linarith
    · simp only [sixLowRouteMedian, if_neg hx6, if_neg hx8]
      constructor
      · linarith
      constructor <;> linarith

private theorem six_six_bounds (x : ℝ) (hx0 : 0 ≤ x) (hx10 : x ≤ 10) :
    (x + 31) / 6 < sixMoveMedian .six x ∧
    17 / 3 ≤ ((x + 31) / 6 + sixMoveMedian .six x) / 2 ∧
    ((x + 31) / 6 + sixMoveMedian .six x) / 2 ≤ 95 / 12 := by
  by_cases hx7 : x ≤ 7
  · simp only [sixMoveMedian, if_pos hx7]
    constructor
    · linarith
    constructor <;> linarith
  · by_cases hx8 : x ≤ 8
    · simp only [sixMoveMedian, if_neg hx7, if_pos hx8]
      constructor
      · linarith
      constructor <;> linarith
    · simp only [sixMoveMedian, if_neg hx7, if_neg hx8]
      constructor
      · linarith
      constructor <;> linarith

private theorem six_seven_bounds (x : ℝ) (hx0 : 0 ≤ x) (hx10 : x ≤ 10) :
    (x + 30) / 6 < sixMoveMedian .seven x ∧
    17 / 3 ≤ ((x + 30) / 6 + sixMoveMedian .seven x) / 2 ∧
    ((x + 30) / 6 + sixMoveMedian .seven x) / 2 ≤ 95 / 12 := by
  by_cases hx6 : x ≤ 6
  · simp only [sixMoveMedian, if_pos hx6]
    constructor
    · linarith
    constructor <;> linarith
  · by_cases hx8 : x ≤ 8
    · simp only [sixMoveMedian, if_neg hx6, if_pos hx8]
      constructor
      · linarith
      constructor <;> linarith
    · simp only [sixMoveMedian, if_neg hx6, if_neg hx8]
      constructor
      · linarith
      constructor <;> linarith

private theorem six_zero_bounds (x : ℝ) (hx0 : 0 ≤ x) (hx10 : x ≤ 10) :
    (x + 37) / 6 < sixHighRouteMedian x ∧
    17 / 3 ≤ ((x + 37) / 6 + sixHighRouteMedian x) / 2 ∧
    ((x + 37) / 6 + sixHighRouteMedian x) / 2 ≤ 95 / 12 := by
  by_cases hx7 : x ≤ 7
  · simp only [sixHighRouteMedian, if_pos hx7]
    constructor
    · linarith
    constructor <;> linarith
  · by_cases hx8 : x ≤ 8
    · simp only [sixHighRouteMedian, if_neg hx7, if_pos hx8]
      constructor
      · linarith
      constructor <;> linarith
    · simp only [sixHighRouteMedian, if_neg hx7, if_neg hx8]
      constructor
      · linarith
      constructor <;> linarith

/-- All six moves keep Mean strictly below Median. Their midpoint targets
stay within the exact closed horizon, for every real move `x ∈ [0,10]`. -/
theorem six_move_global_bounds (r : SixReadingMove) (x : ℝ)
    (hx0 : 0 ≤ x) (hx10 : x ≤ 10) :
    sixMoveMean r x < sixMoveMedian r x ∧
    17 / 3 ≤ (sixMoveMean r x + sixMoveMedian r x) / 2 ∧
    (sixMoveMean r x + sixMoveMedian r x) / 2 ≤ 95 / 12 := by
  cases r with
  | firstEight => simpa [sixMoveMean, sixMoveMedian] using
      six_eight_bounds x hx0 hx10
  | six => simpa [sixMoveMean] using six_six_bounds x hx0 hx10
  | thirdEight => simpa [sixMoveMean, sixMoveMedian] using
      six_eight_bounds x hx0 hx10
  | seven => simpa [sixMoveMean] using six_seven_bounds x hx0 hx10
  | zero => simpa [sixMoveMean, sixMoveMedian] using
      six_zero_bounds x hx0 hx10
  | lastEight => simpa [sixMoveMean, sixMoveMedian] using
      six_eight_bounds x hx0 hx10

private theorem six_sorted_permutation_unique (ys zs : List ℝ)
    (hy : List.Pairwise (· ≤ ·) ys) (hz : List.Pairwise (· ≤ ·) zs)
    (hp : ys.Perm zs) : ys = zs := by
  exact List.Perm.eq_of_pairwise
    (by intro a b _ _ hab hba; exact le_antisymm hab hba) hy hz hp

/-- The reported horizon is exact for the original sample and **all six**
possible one-reading moves in `[0,10]`: universal strict Mean on the left,
an attained tie at every inner target, and universal strict Median on the
right. The statement works with any sorted permutation of each moved sample. -/
theorem six_reading_full_horizon (t : ℝ) :
    (t < 17 / 3 → ∀ (r : SixReadingMove) (x : ℝ), 0 ≤ x → x ≤ 10 →
      ∀ ys : List ℝ, ys.Perm (sixMovedSample r x) →
        List.Pairwise (· ≤ ·) ys →
        |sampleMean (sixMovedSample r x) - t| < |orderedMedian ys - t|) ∧
    (17 / 3 ≤ t → t ≤ 95 / 12 →
      ∃ (r : SixReadingMove) (x : ℝ) (ys : List ℝ),
        0 ≤ x ∧ x ≤ 10 ∧ ys.Perm (sixMovedSample r x) ∧
        List.Pairwise (· ≤ ·) ys ∧
        |sampleMean (sixMovedSample r x) - t| = |orderedMedian ys - t|) ∧
    (95 / 12 < t → ∀ (r : SixReadingMove) (x : ℝ), 0 ≤ x → x ≤ 10 →
      ∀ ys : List ℝ, ys.Perm (sixMovedSample r x) →
        List.Pairwise (· ≤ ·) ys →
        |orderedMedian ys - t| < |sampleMean (sixMovedSample r x) - t|) := by
  have hmeans (r : SixReadingMove) (x : ℝ) (hx0 : 0 ≤ x) (hx10 : x ≤ 10)
      (ys : List ℝ) (hp : ys.Perm (sixMovedSample r x))
      (hs : List.Pairwise (· ≤ ·) ys) :
      sampleMean (sixMovedSample r x) = sixMoveMean r x ∧
        orderedMedian ys = sixMoveMedian r x := by
    obtain ⟨zs, hzp, hzs, hzm⟩ := six_move_sorted_median r x hx0 hx10
    have heq : ys = zs :=
      six_sorted_permutation_unique ys zs hs hzs (hp.trans hzp.symm)
    exact ⟨six_move_mean_from_sample r x, by rw [heq]; exact hzm⟩
  constructor
  · intro ht r x hx0 hx10 ys hp hs
    obtain ⟨hm, hd⟩ := hmeans r x hx0 hx10 ys hp hs
    rw [hm, hd]
    obtain ⟨horder, hlower, _⟩ := six_move_global_bounds r x hx0 hx10
    apply lower_strict_below_midpoint (sixMoveMean r x) (sixMoveMedian r x) t
      horder
    linarith
  constructor
  · intro hlt htu
    rcases six_reading_sorted_sample_horizon_tie t hlt htu with
      ⟨x, ys, hx0, hx8, hp, hs, htie⟩ |
      ⟨x, ys, hx0, hx10, hp, hs, htie⟩
    · exact ⟨.firstEight, x, ys, hx0, le_trans hx8 (by norm_num),
        by simpa [sixMovedSample] using hp, hs,
        by simpa [sixMovedSample] using htie⟩
    · exact ⟨.zero, x, ys, hx0, hx10,
        by simpa [sixMovedSample] using hp, hs,
        by simpa [sixMovedSample] using htie⟩
  · intro ht r x hx0 hx10 ys hp hs
    obtain ⟨hm, hd⟩ := hmeans r x hx0 hx10 ys hp hs
    rw [hm, hd]
    obtain ⟨horder, _, hupper⟩ := six_move_global_bounds r x hx0 hx10
    apply higher_strict_above_midpoint (sixMoveMean r x) (sixMoveMedian r x) t
      horder
    linarith
/-- The five-reading v6 obstruction after replacing the first `48` by `15`. -/
def fiveReadingEqualSample : List ℝ := [15, 49, 50, 51, 85]

theorem five_reading_all_target_tie (t : ℝ) :
    |sampleMean fiveReadingEqualSample - t| =
      |orderedMedian fiveReadingEqualSample - t| := by
  have h : sampleMean fiveReadingEqualSample =
      orderedMedian fiveReadingEqualSample := by
    norm_num [sampleMean, orderedMedian, fiveReadingEqualSample]
  rw [h]

end TargetHorizon

/-!
A positive affine change of units sends each estimate and target from `v` to
`scale * v + shift`. The comparison sign is unchanged. The executable
certificate implementations are separately tested for the stronger claim
that their route knots, thresholds, witnesses, and distances transform too.
-/
namespace AffineEquivariance

/-- Change the units of every reading in a list without changing its position. -/
noncomputable def rebase (scale shift : ℝ) (xs : List ℝ) : List ℝ :=
  xs.map (fun value => scale * value + shift)

private theorem sum_rebase (xs : List ℝ) (scale shift : ℝ) :
    (rebase scale shift xs).sum = scale * xs.sum + (xs.length : ℝ) * shift := by
  induction xs with
  | nil => simp [rebase]
  | cons value rest ih =>
    simp only [rebase, List.map_cons, List.sum_cons, List.length_cons,
      Nat.cast_add, Nat.cast_one] at ih ⊢
    rw [ih]
    ring

/-- The usual mean changes units exactly, for every nonempty reading list. -/
theorem sampleMean_rebase (xs : List ℝ) (scale shift : ℝ)
    (hxs : 0 < xs.length) :
    sampleMean (rebase scale shift xs) = scale * sampleMean xs + shift := by
  have hn : (xs.length : ℝ) ≠ 0 := by exact_mod_cast (ne_of_gt hxs)
  have hsum := sum_rebase xs scale shift
  simp only [rebase] at hsum
  simp only [sampleMean, rebase, List.length_map]
  rw [hsum]
  field_simp [hn]

private theorem getD_rebase (xs : List ℝ) (scale shift : ℝ) (i : ℕ)
    (hi : i < xs.length) :
    (rebase scale shift xs)[i]?.getD 0 =
      scale * (xs[i]?.getD 0) + shift := by
  have hget : xs[i]? = some xs[i] := getElem?_pos xs i hi
  simp [rebase, hget]

/-- Both central order statistics change units exactly, for odd or even size.
The input is already ordered when this expression represents a median. -/
theorem orderedMedian_rebase (xs : List ℝ) (scale shift : ℝ)
    (hxs : 0 < xs.length) :
    orderedMedian (rebase scale shift xs) =
      scale * orderedMedian xs + shift := by
  have hlo : (xs.length - 1) / 2 < xs.length := by omega
  have hhi : xs.length / 2 < xs.length := by omega
  have hlow := getD_rebase xs scale shift ((xs.length - 1) / 2) hlo
  have hhigh := getD_rebase xs scale shift (xs.length / 2) hhi
  simp only [rebase] at hlow hhigh
  unfold orderedMedian rebase
  simp only [List.length_map]
  rw [hlow, hhigh]
  ring

/-- A positive unit change preserves the ordering of an already sorted list. -/
theorem sorted_rebase (xs : List ℝ) (scale shift : ℝ) (hs : 0 < scale)
    (hordered : List.Pairwise (· ≤ ·) xs) :
    List.Pairwise (· ≤ ·) (rebase scale shift xs) := by
  induction xs with
  | nil => exact List.Pairwise.nil
  | cons value rest ih =>
    obtain ⟨hhead, htail⟩ := List.pairwise_cons.mp hordered
    change List.Pairwise (· ≤ ·) ((scale * value + shift) :: rebase scale shift rest)
    apply List.Pairwise.cons
    · intro converted hconverted
      have hmember : converted ∈ rest.map (fun v => scale * v + shift) := by
        simpa only [rebase] using hconverted
      obtain ⟨original, horiginal, rfl⟩ := List.mem_map.mp hmember
      have hle := mul_le_mul_of_nonneg_left (hhead original horiginal) (le_of_lt hs)
      linarith
    · exact ih htail

theorem squared_error_scales (mean median target scale shift : ℝ) :
    ((scale * mean + shift) - (scale * target + shift)) ^ 2 -
      ((scale * median + shift) - (scale * target + shift)) ^ 2 =
      scale ^ 2 * ((mean - target) ^ 2 - (median - target) ^ 2) := by
  ring

theorem factor_product_scales (mean median target scale shift : ℝ) :
    ((scale * mean + shift) - (scale * median + shift)) *
      ((scale * mean + shift) + (scale * median + shift) -
        2 * (scale * target + shift)) =
      scale ^ 2 * ((mean - median) * (mean + median - 2 * target)) := by
  ring

/-- A positive change of units preserves which estimate strictly wins. -/
theorem mean_wins_iff (mean median target scale shift : ℝ) (hs : 0 < scale) :
    ((scale * mean + shift) - (scale * median + shift)) *
      ((scale * mean + shift) + (scale * median + shift) -
        2 * (scale * target + shift)) < 0 ↔
      (mean - median) * (mean + median - 2 * target) < 0 := by
  rw [factor_product_scales]
  have hs2 : 0 < scale ^ 2 := sq_pos_of_pos hs
  constructor
  · intro h
    by_contra hn
    have hnonneg : 0 ≤ (mean - median) * (mean + median - 2 * target) :=
      le_of_not_gt hn
    exact (not_le_of_gt h) (mul_nonneg (le_of_lt hs2) hnonneg)
  · intro h
    exact mul_neg_of_pos_of_neg hs2 h

/-- The exact equality case is preserved as well. -/
theorem tie_iff (mean median target scale shift : ℝ) (hs : 0 < scale) :
    ((scale * mean + shift) - (scale * median + shift)) *
      ((scale * mean + shift) + (scale * median + shift) -
        2 * (scale * target + shift)) = 0 ↔
      (mean - median) * (mean + median - 2 * target) = 0 := by
  rw [factor_product_scales]
  have hs2 : scale ^ 2 ≠ 0 := ne_of_gt (sq_pos_of_pos hs)
  constructor
  · intro h
    rcases mul_eq_zero.mp h with hscale | hproduct
    · exact False.elim (hs2 hscale)
    · exact hproduct
  · intro h
    simp [h]

/-- For any nonempty ordered sample, a positive unit change preserves a
strict mean win after recomputing the mean and central-pair median. -/
theorem sample_mean_wins_iff (xs : List ℝ) (target scale shift : ℝ)
    (hxs : 0 < xs.length) (hs : 0 < scale) :
    (sampleMean (rebase scale shift xs) - orderedMedian (rebase scale shift xs)) *
      (sampleMean (rebase scale shift xs) + orderedMedian (rebase scale shift xs) -
        2 * (scale * target + shift)) < 0 ↔
      (sampleMean xs - orderedMedian xs) *
        (sampleMean xs + orderedMedian xs - 2 * target) < 0 := by
  rw [sampleMean_rebase xs scale shift hxs,
    orderedMedian_rebase xs scale shift hxs]
  exact mean_wins_iff (sampleMean xs) (orderedMedian xs) target scale shift hs

/-- The same list calculation preserves exact ties, including coincident
mean and median. -/
theorem sample_tie_iff (xs : List ℝ) (target scale shift : ℝ)
    (hxs : 0 < xs.length) (hs : 0 < scale) :
    (sampleMean (rebase scale shift xs) - orderedMedian (rebase scale shift xs)) *
      (sampleMean (rebase scale shift xs) + orderedMedian (rebase scale shift xs) -
        2 * (scale * target + shift)) = 0 ↔
      (sampleMean xs - orderedMedian xs) *
        (sampleMean xs + orderedMedian xs - 2 * target) = 0 := by
  rw [sampleMean_rebase xs scale shift hxs,
    orderedMedian_rebase xs scale shift hxs]
  exact tie_iff (sampleMean xs) (orderedMedian xs) target scale shift hs

end AffineEquivariance

/-!
The moving-reading calculation for an even sample is piecewise affine. On its
middle cell the central-pair median is `(c + x) / 2`; on either outer cell it
is constant. These lemmas establish the factor equations and their *only*
roots over the reals. They do not formalize the sorting algorithm or prove
that a particular JSON receipt enumerates every cell.
-/
namespace EvenSample

/-- `S` is the sum of the other `n - 1` readings. -/
noncomputable def movingMean (n S x : ℝ) : ℝ := (S + x) / n

/-- The median in the middle cell, with fixed central reading `c`. -/
noncomputable def middleMedian (c x : ℝ) : ℝ := (c + x) / 2

theorem middle_first_factor (n S c x : ℝ) (hn : n ≠ 0) :
    movingMean n S x - middleMedian c x =
      (2 * S - n * c - (n - 2) * x) / (2 * n) := by
  dsimp [movingMean, middleMedian]
  field_simp [hn]
  ring

theorem middle_second_factor (n S c t x : ℝ) (hn : n ≠ 0) :
    movingMean n S x + middleMedian c x - 2 * t =
      (2 * S + n * c + (n + 2) * x - 4 * n * t) / (2 * n) := by
  dsimp [movingMean, middleMedian]
  field_simp [hn]
  ring

/-- The first and only middle-cell root when `n > 2`. -/
theorem middle_first_root (n S c x : ℝ) (hn : 2 < n) :
    movingMean n S x = middleMedian c x ↔
      x = (2 * S - n * c) / (n - 2) := by
  have hn0 : n ≠ 0 := by linarith
  have hden : n - 2 ≠ 0 := by linarith
  dsimp [movingMean, middleMedian]
  constructor
  · intro h
    field_simp [hn0] at h
    apply (eq_div_iff hden).2
    nlinarith
  · intro h
    have hnum := (eq_div_iff hden).mp h
    field_simp [hn0] at ⊢
    nlinarith

/-- The other and only middle-cell root when `n > 2`. -/
theorem middle_second_root (n S c t x : ℝ) (hn : 2 < n) :
    movingMean n S x + middleMedian c x = 2 * t ↔
      x = (4 * n * t - 2 * S - n * c) / (n + 2) := by
  have hn0 : n ≠ 0 := by linarith
  have hden : n + 2 ≠ 0 := by linarith
  dsimp [movingMean, middleMedian]
  constructor
  · intro h
    field_simp [hn0] at h
    apply (eq_div_iff hden).2
    nlinarith
  · intro h
    have hnum := (eq_div_iff hden).mp h
    field_simp [hn0] at ⊢
    nlinarith

/-- The first and only root in an outer cell with constant median `c`. -/
theorem outer_first_root (n S c x : ℝ) (hn : n ≠ 0) :
    movingMean n S x = c ↔ x = n * c - S := by
  dsimp [movingMean]
  constructor <;> intro h
  · field_simp [hn] at h
    linarith
  · field_simp [hn]
    linarith

/-- The other and only root in an outer cell with constant median `c`. -/
theorem outer_second_root (n S c t x : ℝ) (hn : n ≠ 0) :
    movingMean n S x + c = 2 * t ↔ x = n * (2 * t - c) - S := by
  dsimp [movingMean]
  constructor <;> intro h
  · field_simp [hn] at h
    nlinarith
  · field_simp [hn]
    nlinarith

/-- The exact product used by the even-sample middle-cell partition. -/
theorem middle_squared_error_product (n S c t x : ℝ) (hn : n ≠ 0) :
    (movingMean n S x - t) ^ 2 - (middleMedian c x - t) ^ 2 =
      ((2 * S - n * c - (n - 2) * x) *
        (2 * S + n * c + (n + 2) * x - 4 * n * t)) / (4 * n ^ 2) := by
  rw [squared_error_factorization]
  rw [middle_first_factor n S c x hn, middle_second_factor n S c t x hn]
  field_simp [hn]
  ring

/-- The actual ordered four-reading example when `40 ≤ x ≤ 50`. -/
def fourReadingSample (x : ℝ) : List ℝ := [40, x, 50, 80]

theorem four_reading_mean (x : ℝ) :
    sampleMean (fourReadingSample x) = (170 + x) / 4 := by
  simp [sampleMean, fourReadingSample] <;> ring

theorem four_reading_median (x : ℝ) :
    orderedMedian (fourReadingSample x) = (x + 50) / 2 := by
  simp [orderedMedian, fourReadingSample]

/-- On this sorted middle cell the mean wins exactly below the claimed tie. -/
theorem four_reading_middle_mean_wins_iff (x : ℝ) (h40 : 40 ≤ x) (h50 : x ≤ 50) :
    |sampleMean (fourReadingSample x) - 50| <
      |orderedMedian (fourReadingSample x) - 50| ↔ x < 130 / 3 := by
  rw [four_reading_mean, four_reading_median]
  have hm : 0 < (170 + x) / 4 - 50 := by nlinarith
  have hd : (x + 50) / 2 - 50 ≤ 0 := by nlinarith
  rw [abs_of_pos hm, abs_of_nonpos hd]
  constructor <;> intro h <;> nlinarith

/-- The checked example starts with the median strictly closer at `x = 45`. -/
theorem four_reading_baseline :
    |orderedMedian (fourReadingSample 45) - 50| <
      |sampleMean (fourReadingSample 45) - 50| := by
  rw [four_reading_mean, four_reading_median]
  norm_num

/-- The exact boundary is a tie, rather than an attained strict reversal. -/
theorem four_reading_threshold_tie :
    |sampleMean (fourReadingSample (130 / 3)) - 50| =
      |orderedMedian (fourReadingSample (130 / 3)) - 50| := by
  rw [four_reading_mean, four_reading_median]
  norm_num

/-- The receipt's `125/3` witness lies on the strictly opposing side. -/
theorem four_reading_witness :
    |sampleMean (fourReadingSample (125 / 3)) - 50| <
      |orderedMedian (fourReadingSample (125 / 3)) - 50| := by
  exact (four_reading_middle_mean_wins_iff (125 / 3)
    (by norm_num) (by norm_num)).2 (by norm_num)

/-- Any strict reversal on this middle cell moves farther than `5/3`. -/
theorem four_reading_middle_strict_distance (x : ℝ) (h40 : 40 ≤ x) (h50 : x ≤ 50)
    (hwin : |sampleMean (fourReadingSample x) - 50| <
      |orderedMedian (fourReadingSample x) - 50|) :
    5 / 3 < |x - 45| := by
  have hx := (four_reading_middle_mean_wins_iff x h40 h50).mp hwin
  have hneg : x - 45 < 0 := by nlinarith
  rw [abs_of_neg hneg]
  nlinarith

end EvenSample

end InwardFormal
