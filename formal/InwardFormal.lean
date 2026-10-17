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

/-- The first route at movement low `0`; the receipt separately checks that
this endpoint attains the minimum over every route. -/
def sixReadingLowEndpoint : List ℝ := [0, 0, 6, 7, 8, 8]

theorem six_reading_low_endpoint_midpoint :
    (sampleMean sixReadingLowEndpoint + orderedMedian sixReadingLowEndpoint) / 2 =
      17 / 3 := by
  norm_num [sampleMean, orderedMedian, sixReadingLowEndpoint]

/-- The fifth route at movement high `10`; the receipt separately checks
that this endpoint attains the maximum over every route. -/
def sixReadingHighEndpoint : List ℝ := [6, 7, 8, 8, 8, 10]

theorem six_reading_high_endpoint_midpoint :
    (sampleMean sixReadingHighEndpoint + orderedMedian sixReadingHighEndpoint) / 2 =
      95 / 12 := by
  norm_num [sampleMean, orderedMedian, sixReadingHighEndpoint]

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
