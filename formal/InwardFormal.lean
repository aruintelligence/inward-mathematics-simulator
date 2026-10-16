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

end InwardFormal
