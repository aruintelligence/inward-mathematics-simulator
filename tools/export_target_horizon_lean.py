#!/usr/bin/env python3
"""Regenerate a Lean specialization of the independently checked six-reading v6 receipt."""
import argparse
import hashlib
import json
from pathlib import Path

from verify_odd_target_box import HORIZON_FORMAT, no_duplicates, verify

ROOT = Path(__file__).resolve().parent.parent
EXAMPLE = ROOT / "examples/target-horizon-v6.json"
EXPORT = ROOT / "formal/TargetHorizonReceipt.lean"
MODEL_READINGS = ["8", "6", "8", "7", "0", "8"]
MODEL_MOVEMENT = {"low": "0", "high": "10"}
ROUTES = ("firstEight", "six", "thirdEight", "seven", "zero", "lastEight")


def render(raw):
    """The checked data are emitted as Lean literals, then proved against the model."""
    if len(raw) > 2_000_000:
        raise ValueError("Certificate too large")
    receipt = json.loads(raw.decode("utf-8"), object_pairs_hook=no_duplicates,
                         parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Invalid JSON constant")))
    if type(receipt) is not dict or receipt.get("format") != HORIZON_FORMAT:
        raise ValueError("A v6 target-horizon receipt is required")
    checked = verify(receipt)
    inputs, horizon = receipt["inputs"], checked["targetHorizon"]
    if inputs["readings"] != MODEL_READINGS or inputs["movement"] != MODEL_MOVEMENT or \
            (horizon["low"], horizon["high"], horizon["below"], horizon["above"],
             horizon["allTargetTie"]) != ("17/3", "95/12", "Mean", "Median", None):
        raise ValueError("Only the fixed six-reading Lean model is supported")

    readings = inputs["readings"]
    branches = "\n".join(
        f"  | .{route}, x => [{', '.join('x' if j == i else v for j, v in enumerate(readings))}]"
        for i, route in enumerate(ROUTES))
    originals = "\n".join(f"  | .{route} => {readings[i]}" for i, route in enumerate(ROUTES))
    digest = hashlib.sha256(raw).hexdigest()
    return f'''import InwardFormal

/-!
Receipt-derived specialization of `six_reading_full_horizon`.
Generated from the independently checked v6 JSON bytes (SHA-256: {digest}).
Regenerate with `python3 tools/export_target_horizon_lean.py`.
The Lean kernel checks these literal inputs, route formulas, and bounds against
the fixed formal model. Lean does not parse JSON or authenticate its origin.
-/
namespace InwardFormal.TargetHorizon

def receiptReadings : List ℝ := [{', '.join(readings)}]
def receiptMovementLow : ℝ := {inputs['movement']['low']}
def receiptMovementHigh : ℝ := {inputs['movement']['high']}
def receiptHorizonLow : ℝ := {horizon['low']}
def receiptHorizonHigh : ℝ := {horizon['high']}

/-- All six choices of which original reading to move, extracted as literals. -/
def receiptMove : SixReadingMove → ℝ → List ℝ
{branches}

def receiptOriginal : SixReadingMove → ℝ
{originals}

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
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("certificate", nargs="?", type=Path, default=EXAMPLE)
    parser.add_argument("--output", type=Path, default=EXPORT)
    parser.add_argument("--check", action="store_true", help="reject a stale generated Lean file")
    args = parser.parse_args()
    try:
        if args.certificate.stat().st_size > 2_000_000:
            raise ValueError("Certificate too large")
        source = render(args.certificate.read_bytes())
        if args.check:
            if args.output.read_text(encoding="utf-8") != source:
                raise ValueError("Lean export is stale; regenerate from the checked receipt")
            print("Lean specialization matches checked v6 receipt")
        else:
            args.output.write_text(source, encoding="utf-8")
            print(f"Wrote {args.output}")
    except (OSError, ValueError, TypeError, KeyError, UnicodeError,
            ArithmeticError, RecursionError) as error:
        parser.exit(1, f"Lean export failed: {error}\n")


if __name__ == "__main__":
    main()
