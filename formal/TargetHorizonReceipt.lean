import InwardFormal

/-!
Receipt-derived specialization of `six_reading_full_horizon`.
Generated from the independently checked v6 JSON bytes (SHA-256: 1ebfd5c70b9005311b25ca21506f0584b555bc9d2571501a4a64d38037cda1c8).
Regenerate with `python3 tools/export_target_horizon_lean.py`.
The Lean kernel checks these literal inputs, route formulas, and bounds against
the fixed formal model. Lean does not parse JSON or authenticate its origin.
-/
namespace InwardFormal.TargetHorizon

def receiptReadings : List ℝ := [8, 6, 8, 7, 0, 8]
def receiptMovementLow : ℝ := 0
def receiptMovementHigh : ℝ := 10
noncomputable def receiptHorizonLow : ℝ := 17/3
noncomputable def receiptHorizonHigh : ℝ := 95/12

/-- All six choices of which original reading to move, extracted as literals. -/
def receiptMove : SixReadingMove → ℝ → List ℝ
  | .firstEight, x => [x, 6, 8, 7, 0, 8]
  | .six, x => [8, x, 8, 7, 0, 8]
  | .thirdEight, x => [8, 6, x, 7, 0, 8]
  | .seven, x => [8, 6, 8, x, 0, 8]
  | .zero, x => [8, 6, 8, 7, x, 8]
  | .lastEight, x => [8, 6, 8, 7, 0, x]

def receiptOriginal : SixReadingMove → ℝ
  | .firstEight => 8
  | .six => 6
  | .thirdEight => 8
  | .seven => 7
  | .zero => 0
  | .lastEight => 8

/-- A changed reading or misplaced index breaks this proof. -/
theorem receipt_original_matches (r : SixReadingMove) :
    receiptMove r (receiptOriginal r) = receiptReadings := by
  cases r <;> rfl

/-- Every receipt route equals the concrete route used by the theorem. -/
theorem receipt_move_eq_model (r : SixReadingMove) (x : ℝ) :
    receiptMove r x = sixMovedSample r x := by
  cases r <;> rfl

/-- The four exported endpoints are exact, not rounded plot coordinates. -/
theorem receipt_bounds_match :
    receiptMovementLow = 0 ∧ receiptMovementHigh = 10 ∧
    receiptHorizonLow = 17 / 3 ∧ receiptHorizonHigh = 95 / 12 := by
  norm_num [receiptMovementLow, receiptMovementHigh,
    receiptHorizonLow, receiptHorizonHigh]

/-- The checked receipt's own readings, movement bounds, and target bounds
specialize the full six-route theorem for every real target. -/
theorem receipt_full_horizon (t : ℝ) :
    (t < receiptHorizonLow → ∀ (r : SixReadingMove) (x : ℝ),
      receiptMovementLow ≤ x → x ≤ receiptMovementHigh →
      ∀ ys : List ℝ, ys.Perm (receiptMove r x) →
        List.Pairwise (· ≤ ·) ys →
        |sampleMean (receiptMove r x) - t| < |orderedMedian ys - t|) ∧
    (receiptHorizonLow ≤ t → t ≤ receiptHorizonHigh →
      ∃ (r : SixReadingMove) (x : ℝ) (ys : List ℝ),
        receiptMovementLow ≤ x ∧ x ≤ receiptMovementHigh ∧
        ys.Perm (receiptMove r x) ∧ List.Pairwise (· ≤ ·) ys ∧
        |sampleMean (receiptMove r x) - t| = |orderedMedian ys - t|) ∧
    (receiptHorizonHigh < t → ∀ (r : SixReadingMove) (x : ℝ),
      receiptMovementLow ≤ x → x ≤ receiptMovementHigh →
      ∀ ys : List ℝ, ys.Perm (receiptMove r x) →
        List.Pairwise (· ≤ ·) ys →
        |orderedMedian ys - t| < |sampleMean (receiptMove r x) - t|) := by
  simpa only [receiptHorizonLow, receiptHorizonHigh,
    receiptMovementLow, receiptMovementHigh, receipt_move_eq_model]
    using (six_reading_full_horizon t)

end InwardFormal.TargetHorizon
