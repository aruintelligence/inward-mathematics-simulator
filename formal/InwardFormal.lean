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

end InwardFormal
