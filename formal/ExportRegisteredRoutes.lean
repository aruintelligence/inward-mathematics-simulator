import InwardFormal

open InwardFormal.RegisteredClaim

/-! Emit the checked routing definition for the CI parity gate. This is a
tab-separated interchange format with fixed names, not a certificate parser. -/

private def conditions : List (Condition × String) :=
  [(.any, "any-target"),
   (.belowMidpoint, "target-at-or-below-midpoint"),
   (.aboveMidpoint, "target-at-or-above-midpoint"),
   (.belowBoth, "target-at-or-below-both"),
   (.aboveBoth, "target-at-or-above-both")]

private def predictions : List (Prediction × String) :=
  [(.lower, "lower-no-worse"), (.higher, "higher-no-worse"),
   (.mean, "mean-no-worse"), (.median, "median-no-worse")]

private def routeName : Option Endpoint → String
  | none => "proved"
  | some .highZero => "one-high:0"
  | some .highHundred => "one-high:100"
  | some .lowZero => "one-low:0"
  | some .lowHundred => "one-low:100"

def main : IO Unit := do
  for (condition, conditionName) in conditions do
    for (prediction, predictionName) in predictions do
      IO.println s!"{conditionName}\t{predictionName}\t{routeName (endpointRoute condition prediction)}"
