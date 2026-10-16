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

/-- Every other cell has one of the two explicit sorted endpoint samples as a
strict counterexample at target 0 or 100, for every integer size at least 3. -/
theorem classify (n : ℕ) (hn : 3 ≤ n) (c : Condition) (p : Prediction) :
    if established c p then universal c p else refutedByEndpoint n c p := by
  cases c <;> cases p <;> simp [established]
  · exact ⟨.highHundred, (highHundredGuards n hn).1, (highHundredBad n hn).1⟩
  · exact ⟨.highZero, (highZeroGuards n hn).1, (highZeroBad n hn).1⟩
  · exact ⟨.highZero, (highZeroGuards n hn).1, (highZeroBad n hn).2⟩
  · exact ⟨.highHundred, (highHundredGuards n hn).1, (highHundredBad n hn).2⟩
  · exact valid_belowMidpoint
  · exact ⟨.highZero, (highZeroGuards n hn).2.1, (highZeroBad n hn).1⟩
  · exact ⟨.highZero, (highZeroGuards n hn).2.1, (highZeroBad n hn).2⟩
  · exact ⟨.lowZero, (lowZeroGuards n hn).2.1, (lowZeroBad n hn).2⟩
  · exact ⟨.highHundred, (highHundredGuards n hn).2.1, (highHundredBad n hn).1⟩
  · exact valid_aboveMidpoint
  · exact ⟨.lowHundred, (lowHundredGuards n hn).2.1, (lowHundredBad n hn).2⟩
  · exact ⟨.highHundred, (highHundredGuards n hn).2.1, (highHundredBad n hn).2⟩
  · exact valid_belowBoth
  · exact ⟨.highZero, (highZeroGuards n hn).2.2, (highZeroBad n hn).1⟩
  · exact ⟨.highZero, (highZeroGuards n hn).2.2, (highZeroBad n hn).2⟩
  · exact ⟨.lowZero, (lowZeroGuards n hn).2.2, (lowZeroBad n hn).2⟩
  · exact ⟨.highHundred, (highHundredGuards n hn).2.2, (highHundredBad n hn).1⟩
  · exact valid_aboveBoth
  · exact ⟨.lowHundred, (lowHundredGuards n hn).2.2, (lowHundredBad n hn).2⟩
  · exact ⟨.highHundred, (highHundredGuards n hn).2.2, (highHundredBad n hn).2⟩

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

end InwardFormal
