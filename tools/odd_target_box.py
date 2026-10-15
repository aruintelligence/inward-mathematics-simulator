#!/usr/bin/env python3
"""Exhaustive mean/median outcomes when one reading and the target range freely."""
import argparse
from fractions import Fraction
import json
from pathlib import Path

from odd_sample_flip import exact

FORMAT = "inward-odd-target-box-v1"
LIMIT = Fraction(1_000_000)
ORDER = ("Mean", "Median", "Tie")


def winner(fixed, moved, target):
    values = [*fixed, moved]
    mean = sum(values) / len(values)
    median = sorted(values)[len(values) // 2]
    difference = (mean - median) * (mean + median - 2 * target)
    return "Mean" if difference < 0 else "Median" if difference > 0 else "Tie"


def partitions(fixed, low, high, target_low, target_high):
    """Include all median transitions and factor roots at both target endpoints."""
    n = len(fixed) + 1
    ordered = sorted(fixed)
    lower, upper = ordered[n // 2 - 1], ordered[n // 2]
    total = sum(fixed)
    knots = {low, high, lower, upper}
    for start, end, intercept, slope in ((low, lower, lower, 0),
                                         (lower, upper, 0, 1),
                                         (upper, high, upper, 0)):
        first = (total / n - intercept, Fraction(1, n) - slope)
        second = [(total / n + intercept - 2 * target, Fraction(1, n) + slope)
                  for target in (target_low, target_high)]
        for constant, coefficient in (first, *second):
            root = -constant / coefficient
            if start <= root <= end:
                knots.add(root)
    return sorted(knots)


def route(readings, index, low, high, target_low, target_high):
    fixed = readings[:index] + readings[index + 1:]
    knots = partitions(fixed, low, high, target_low, target_high)
    samples = [knots[0]]
    for left, right in zip(knots, knots[1:]):
        samples.extend(((left + right) / 2, right))
    witnesses = {}
    for moved in samples:
        median = sorted([*fixed, moved])[len(readings) // 2]
        mean = (sum(fixed) + moved) / len(readings)
        crossing = (median + mean) / 2
        targets = [target_low, target_high]
        if target_low <= crossing <= target_high:
            targets.append(crossing)
        for target in targets:
            outcome = winner(fixed, moved, target)
            if outcome not in witnesses:
                witnesses[outcome] = {"reading": str(moved), "target": str(target)}
    reachable = [name for name in ORDER if name in witnesses]
    guarantee = reachable[0] if len(reachable) == 1 and reachable[0] != "Tie" else None
    return {"index": index, "knots": list(map(str, knots)), "reachable": reachable,
            "guarantee": guarantee,
            "witnesses": {name: witnesses[name] for name in reachable}}


def certificate(raw_readings, raw_low, raw_high, raw_target_low, raw_target_high):
    if type(raw_readings) is not list or not 3 <= len(raw_readings) <= 21 or len(raw_readings) % 2 != 1:
        raise ValueError("Supply an odd count of 3 through 21 readings")
    low, high = exact(raw_low, -LIMIT, LIMIT), exact(raw_high, -LIMIT, LIMIT)
    if low >= high:
        raise ValueError("Movement bounds must have positive width")
    target_low = exact(raw_target_low, -LIMIT, LIMIT)
    target_high = exact(raw_target_high, -LIMIT, LIMIT)
    if target_low > target_high:
        raise ValueError("Target bounds must be ordered")
    readings = [exact(value, low, high) for value in raw_readings]
    routes = [route(readings, i, low, high, target_low, target_high)
              for i in range(len(readings))]
    reachable = [name for name in ORDER if any(name in item["reachable"] for item in routes)]
    guarantee = reachable[0] if len(reachable) == 1 and reachable[0] != "Tie" else None
    return {"format": FORMAT,
            "inputs": {"readings": list(map(str, readings)),
                       "movement": {"low": str(low), "high": str(high)},
                       "target": {"low": str(target_low), "high": str(target_high)}},
            "claim": {"routes": routes, "reachable": reachable, "guarantee": guarantee}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--readings", required=True, help="comma-separated rational readings")
    parser.add_argument("--low", required=True, help="inclusive lower movement bound")
    parser.add_argument("--high", required=True, help="inclusive upper movement bound")
    parser.add_argument("--target-low", required=True)
    parser.add_argument("--target-high", required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        result = certificate([part.strip() for part in args.readings.split(",")],
                             args.low, args.high, args.target_low, args.target_high)
        output = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
        if args.output:
            args.output.write_text(output, encoding="utf-8")
        else:
            print(output, end="")
    except (ValueError, ArithmeticError, OSError) as error:
        parser.exit(1, f"Cannot construct certificate: {error}\n")


if __name__ == "__main__":
    main()
