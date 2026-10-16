#!/usr/bin/env python3
"""Construct an exact continuous single-reading reversal certificate."""
import argparse
from fractions import Fraction
import json
from pathlib import Path
import re

FORMAT = "inward-odd-sample-flip-v1"
BOUNDED_FORMAT = "inward-odd-sample-flip-v2"
EVEN_FORMAT = "inward-even-sample-flip-v3"
INPUT = re.compile(r"(?:-?(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,6})?|"
                   r"-?(?:0|[1-9][0-9]{0,8})/[1-9][0-9]{0,8})\Z")
LOW, HIGH = Fraction(0), Fraction(100)
LIMIT = Fraction(1_000_000)


def exact(raw, low=LOW, high=HIGH):
    if type(raw) is not str or INPUT.fullmatch(raw) is None:
        raise ValueError("Use a decimal (up to six places) or rational with at most nine digits per part")
    value = Fraction(raw)
    if not low <= value <= high:
        raise ValueError(f"Value must be between {low} and {high}")
    return value


def winner(readings, target):
    mean = sum(readings) / len(readings)
    ordered = sorted(readings)
    median = (ordered[(len(readings) - 1) // 2] + ordered[len(readings) // 2]) / 2
    difference = (mean - median) * (mean + median - 2 * target)
    return "Mean" if difference < 0 else "Median" if difference > 0 else "Tie"


def at(fixed, value, target):
    return winner([*fixed, value], target)


def partitions(fixed, target, low=LOW, high=HIGH):
    """Split at every median transition and zero of either affine factor."""
    n = len(fixed) + 1
    ordered = sorted(fixed)
    if n % 2:
        lower, upper = ordered[n // 2 - 1], ordered[n // 2]
        middle_intercept, middle_slope = Fraction(0), Fraction(1)
        left_median, right_median = lower, upper
    else:
        k = n // 2
        lower, upper = ordered[k - 2], ordered[k]
        middle_intercept, middle_slope = ordered[k - 1] / 2, Fraction(1, 2)
        left_median = (ordered[k - 2] + ordered[k - 1]) / 2
        right_median = (ordered[k - 1] + ordered[k]) / 2
    total = sum(fixed)
    knots = {low, high, lower, upper}
    for start, end, intercept, slope in ((low, lower, left_median, 0),
                                         (lower, upper, middle_intercept, middle_slope),
                                         (upper, high, right_median, 0)):
        # mean(x) = (total+x)/n; median(x) = intercept+slope*x.
        factors = ((total / n - intercept, Fraction(1, n) - slope),
                   (total / n + intercept - 2 * target, Fraction(1, n) + slope))
        for constant, coefficient in factors:
            if coefficient:
                root = -constant / coefficient
                if start <= root <= end:
                    knots.add(root)
    return sorted(knots)


def route(readings, index, target, baseline, low=LOW, high=HIGH):
    fixed = readings[:index] + readings[index + 1:]
    original = readings[index]
    knots = partitions(fixed, target, low, high)
    point_winners = [at(fixed, value, target) for value in knots]
    interval_winners = [at(fixed, (a + b) / 2, target)
                        for a, b in zip(knots, knots[1:])]
    opposite = "Median" if baseline == "Mean" else "Mean"
    candidates = []
    for left, right, result in zip(knots, knots[1:], interval_winners):
        if result != opposite:
            continue
        if original < left:
            boundary = left
        elif original > right:
            boundary = right
        else:
            raise ArithmeticError("The original strict winner lies inside an opposing interval")
        candidates.append((abs(original - boundary), boundary, (left + right) / 2))
    result = min(candidates) if candidates else None
    if result and at(fixed, result[1], target) != "Tie":
        raise ArithmeticError("Nearest strict reversal boundary is not a tie")
    return {"index": index, "knots": list(map(str, knots)),
            "pointWinners": point_winners, "intervalWinners": interval_winners,
            "threshold": str(result[1]) if result else None,
            "distance": str(result[0]) if result else None,
            "witness": str(result[2]) if result else None}


def certificate(raw_readings, raw_target, raw_low=None, raw_high=None):
    if type(raw_readings) is not list or not 3 <= len(raw_readings) <= 21:
        raise ValueError("Supply 3 through 21 readings")
    custom = raw_low is not None or raw_high is not None
    if custom:
        if raw_low is None or raw_high is None:
            raise ValueError("Supply both movement bounds")
        low, high = exact(raw_low, -LIMIT, LIMIT), exact(raw_high, -LIMIT, LIMIT)
        if low >= high:
            raise ValueError("Movement bounds must have positive width")
        readings = [exact(value, low, high) for value in raw_readings]
        target = exact(raw_target, -LIMIT, LIMIT)
    else:
        low, high = LOW, HIGH
        readings = [exact(value) for value in raw_readings]
        target = exact(raw_target)
    even = len(readings) % 2 == 0
    inputs = {"readings": list(map(str, readings)), "target": str(target)}
    if custom or even:
        inputs["bounds"] = {"low": str(low), "high": str(high)}
    baseline = winner(readings, target)
    if baseline == "Tie":
        claim = {"kind": "baseline-tie", "baseline": baseline, "routes": [], "best": None}
    else:
        routes = [route(readings, index, target, baseline, low, high) for index in range(len(readings))]
        feasible = [item for item in routes if item["threshold"] is not None]
        best_route = min(feasible, key=lambda item: (Fraction(item["distance"]), item["index"])) if feasible else None
        best = ({key: best_route[key] for key in ("index", "threshold", "distance", "witness")}
                if best_route else None)
        claim = {"kind": "strict-baseline", "baseline": baseline, "routes": routes, "best": best}
    return {"format": EVEN_FORMAT if even else BOUNDED_FORMAT if custom else FORMAT,
            "inputs": inputs, "claim": claim}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--readings", required=True, help="comma-separated exact readings")
    parser.add_argument("--target", required=True, help="exact target")
    parser.add_argument("--low", help="inclusive lower bound for one-reading movement")
    parser.add_argument("--high", help="inclusive upper bound for one-reading movement")
    parser.add_argument("--output", type=Path, help="save deterministic JSON certificate")
    args = parser.parse_args()
    try:
        result = certificate([part.strip() for part in args.readings.split(",")], args.target,
                             args.low, args.high)
        output = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
        if args.output:
            args.output.write_text(output, encoding="utf-8")
        else:
            print(output, end="")
    except (ValueError, ArithmeticError, OSError) as error:
        parser.exit(1, f"Cannot construct certificate: {error}\n")


if __name__ == "__main__":
    main()
