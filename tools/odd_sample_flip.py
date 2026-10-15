#!/usr/bin/env python3
"""Construct an exact continuous single-reading reversal certificate for odd samples."""
import argparse
from fractions import Fraction
import json
from pathlib import Path
import re

FORMAT = "inward-odd-sample-flip-v1"
INPUT = re.compile(r"(?:(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,6})?|"
                   r"(?:0|[1-9][0-9]{0,8})/[1-9][0-9]{0,8})\Z")
LOW, HIGH = Fraction(0), Fraction(100)


def exact(raw):
    if type(raw) is not str or INPUT.fullmatch(raw) is None:
        raise ValueError("Use a nonnegative decimal (up to six places) or rational")
    value = Fraction(raw)
    if not LOW <= value <= HIGH:
        raise ValueError("Readings and target must be between 0 and 100")
    return value


def winner(readings, target):
    mean = sum(readings) / len(readings)
    median = sorted(readings)[len(readings) // 2]
    difference = (mean - median) * (mean + median - 2 * target)
    return "Mean" if difference < 0 else "Median" if difference > 0 else "Tie"


def at(fixed, value, target):
    return winner([*fixed, value], target)


def partitions(fixed, target):
    """Split at every median transition and zero of either affine factor."""
    n = len(fixed) + 1
    ordered = sorted(fixed)
    lower, upper = ordered[n // 2 - 1], ordered[n // 2]
    total = sum(fixed)
    knots = {LOW, HIGH, lower, upper}
    for start, end, intercept, slope in ((LOW, lower, lower, 0),
                                         (lower, upper, 0, 1),
                                         (upper, HIGH, upper, 0)):
        # mean(x) = (total+x)/n; median(x) = intercept+slope*x.
        factors = ((total / n - intercept, Fraction(1, n) - slope),
                   (total / n + intercept - 2 * target, Fraction(1, n) + slope))
        for constant, coefficient in factors:
            if coefficient:
                root = -constant / coefficient
                if start <= root <= end:
                    knots.add(root)
    return sorted(knots)


def route(readings, index, target, baseline):
    fixed = readings[:index] + readings[index + 1:]
    original = readings[index]
    knots = partitions(fixed, target)
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


def certificate(raw_readings, raw_target):
    if type(raw_readings) is not list or not 3 <= len(raw_readings) <= 21 or len(raw_readings) % 2 != 1:
        raise ValueError("Supply 3 through 21 readings, with an odd count")
    readings = [exact(value) for value in raw_readings]
    target = exact(raw_target)
    inputs = {"readings": list(map(str, readings)), "target": str(target)}
    baseline = winner(readings, target)
    if baseline == "Tie":
        claim = {"kind": "baseline-tie", "baseline": baseline, "routes": [], "best": None}
    else:
        routes = [route(readings, index, target, baseline) for index in range(len(readings))]
        feasible = [item for item in routes if item["threshold"] is not None]
        best_route = min(feasible, key=lambda item: (Fraction(item["distance"]), item["index"])) if feasible else None
        best = ({key: best_route[key] for key in ("index", "threshold", "distance", "witness")}
                if best_route else None)
        claim = {"kind": "strict-baseline", "baseline": baseline, "routes": routes, "best": best}
    return {"format": FORMAT, "inputs": inputs, "claim": claim}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--readings", required=True, help="comma-separated exact readings")
    parser.add_argument("--target", required=True, help="exact target")
    parser.add_argument("--output", type=Path, help="save deterministic JSON certificate")
    args = parser.parse_args()
    try:
        result = certificate([part.strip() for part in args.readings.split(",")], args.target)
        output = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
        if args.output:
            args.output.write_text(output, encoding="utf-8")
        else:
            print(output, end="")
    except (ValueError, ArithmeticError, OSError) as error:
        parser.exit(1, f"Cannot construct certificate: {error}\n")


if __name__ == "__main__":
    main()
