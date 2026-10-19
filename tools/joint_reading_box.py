#!/usr/bin/env python3
"""Exact conditional Mean/Median guarantee for independent rational reading intervals."""
import argparse
from fractions import Fraction
from itertools import product
import json

from odd_sample_flip import LIMIT, exact

FORMAT = "inward-joint-reading-box-v1"
RANGE_FORMAT = "inward-joint-reading-box-v2"
SHARP_FORMAT = "inward-joint-reading-box-v3"
MAX_CANDIDATES = 100_000


def estimators(readings):
    ordered = sorted(readings)
    n = len(readings)
    return sum(readings) / n, (ordered[(n - 1) // 2] + ordered[n // 2]) / 2


def factors(readings):
    mean, median = estimators(readings)
    return mean - median, (mean + median) / 2


def exact_extrema(intervals, gap_target=None):
    """A vertex of each ordering cell uses only original interval endpoints.

    Within a fixed weak ordering, mean-minus-median is affine. At a vertex,
    every equality-connected group of readings is pinned to at least one
    interval endpoint. Enumerating endpoint-valued feasible vectors is thus
    exhaustive; no real-number discretization assumption is made.
    """
    endpoints = sorted({v for interval in intervals for v in interval})
    choices = [[v for v in endpoints if low <= v <= high] for low, high in intervals]
    count = 1
    for values in choices:
        count *= len(values)
    if count > MAX_CANDIDATES:
        raise ValueError("Joint box exceeds exact candidate budget")
    smallest = largest = sharp_gap = None
    for readings in product(*choices):
        difference, midpoint = factors(readings)
        if smallest is None or difference < smallest[0]:
            smallest = (difference, readings)
        if largest is None or difference > largest[0]:
            largest = (difference, readings)
        if gap_target is not None:
            gap = 2 * abs(difference * (midpoint - gap_target))
            if sharp_gap is None or gap < sharp_gap[0]:
                sharp_gap = (gap, readings)
    return smallest, largest, sharp_gap


def interpolate_root(start, end, factor, target=Fraction(0)):
    """Find an exact zero along a segment by splitting at all ordering changes."""
    delta = [b - a for a, b in zip(start, end)]
    stops = {Fraction(0), Fraction(1)}
    for i in range(len(start)):
        for j in range(i):
            slope = delta[i] - delta[j]
            if slope:
                crossing = (start[j] - start[i]) / slope
                if 0 < crossing < 1:
                    stops.add(crossing)

    def at(position):
        readings = tuple(a + position * d for a, d in zip(start, delta))
        difference, midpoint = factors(readings)
        return readings, (difference if factor == "estimate" else midpoint - target)

    previous_position = None
    previous_value = None
    for position in sorted(stops):
        readings, value = at(position)
        if value == 0:
            return readings
        if previous_value is not None and previous_value * value < 0:
            root = previous_position - previous_value * (position - previous_position) / (value - previous_value)
            readings, value = at(root)
            if value:
                raise ArithmeticError("Interpolated root is not exact")
            return readings
        previous_position, previous_value = position, value
    raise ArithmeticError("A bracketed continuous factor has no root")


def certificate(raw_intervals, raw_target, raw_target_high=None, exact_gap=False):
    if type(raw_intervals) is not list or not 3 <= len(raw_intervals) <= 5:
        raise ValueError("Supply 3 through 5 independent reading intervals")
    intervals = []
    for pair in raw_intervals:
        if type(pair) is not list or len(pair) != 2:
            raise ValueError("Each reading needs a lower and upper bound")
        low, high = (exact(value, -LIMIT, LIMIT) for value in pair)
        if low > high:
            raise ValueError("Reading bounds must be ordered")
        intervals.append((low, high))
    target = exact(raw_target, -LIMIT, LIMIT)
    target_high = (exact(raw_target_high, -LIMIT, LIMIT)
                   if raw_target_high is not None else target)
    if target > target_high:
        raise ValueError("Target bounds must be ordered")
    ranged = raw_target_high is not None or exact_gap
    lower = tuple(pair[0] for pair in intervals)
    upper = tuple(pair[1] for pair in intervals)
    hlow, hhigh = factors(lower)[1], factors(upper)[1]
    gap_target = (target_high if hlow > target_high else target
                  if hhigh < target else None)
    minimum, maximum, sharp = exact_extrema(intervals, gap_target if exact_gap else None)
    if minimum[0] <= 0 <= maximum[0]:
        witness = interpolate_root(minimum[1], maximum[1], "estimate")
        tie_target = target
    elif max(hlow, target) <= min(hhigh, target_high):
        tie_target = max(hlow, target)
        witness = interpolate_root(lower, upper, "midpoint", tie_target)
    else:
        witness = None
        tie_target = None
    if witness is not None:
        d, h = factors(witness)
        if d * (h - tie_target):
            raise ArithmeticError("Constructed readings do not tie")
        verdict, margin = "Tie possible", None
    else:
        verdict = "Mean" if minimum[0] * (hlow - target) < 0 else "Median"
        if exact_gap:
            margin = str(sharp[0])
        else:
            distance_d = min(abs(minimum[0]), abs(maximum[0]))
            distance_h = hlow - target_high if hlow > target_high else target - hhigh
            margin = str(2 * distance_d * distance_h)

    extremum = lambda item: {"value": str(item[0]),
                             "readings": list(map(str, item[1]))}
    inputs = {"intervals": [[str(a), str(b)] for a, b in intervals]}
    inputs.update({"targetInterval": [str(target), str(target_high)]} if ranged
                  else {"target": str(target)})
    claim = {"estimateRange": {"min": extremum(minimum), "max": extremum(maximum)},
             "midpointRange": {"min": str(hlow), "max": str(hhigh)},
             "verdict": verdict, "squaredGapLowerBound": margin,
             "tieWitness": list(map(str, witness)) if witness is not None else None}
    if ranged:
        claim["tieTarget"] = str(tie_target) if tie_target is not None else None
    if exact_gap:
        claim["gapWitness"] = ({"readings": list(map(str, sharp[1])),
                                "target": str(gap_target)} if witness is None else None)
    return {"format": SHARP_FORMAT if exact_gap else RANGE_FORMAT if ranged else FORMAT,
            "inputs": inputs, "claim": claim}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--intervals", required=True,
                        help="comma-separated LOW:HIGH pairs, e.g. -4:-3,-1:4,1:2")
    parser.add_argument("--target", required=True, help="fixed target or lower target bound")
    parser.add_argument("--target-high", help="upper target bound; enables interval receipt")
    parser.add_argument("--exact-gap", action="store_true",
                        help="emit v3 receipt with attained exact worst-case squared-error gap")
    args = parser.parse_args()
    try:
        intervals = [item.split(":") for item in args.intervals.split(",")]
        print(json.dumps(certificate(intervals, args.target, args.target_high,
                                     exact_gap=args.exact_gap),
                         indent=2, ensure_ascii=False))
    except (ValueError, TypeError, ArithmeticError, ZeroDivisionError) as error:
        parser.exit(1, f"Joint reading box failed: {error}\n")


if __name__ == "__main__":
    main()
