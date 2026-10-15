#!/usr/bin/env python3
"""Independent exact-arithmetic checker for Target Lens v1 proof receipts."""
from fractions import Fraction
from itertools import combinations
from pathlib import Path
import json
import re
import sys

SCALE = 1_000_000
LIMIT = 100 * SCALE


def checked_int(value, name):
    if type(value) is not int or not 0 <= value <= LIMIT:
        raise ValueError(f"Invalid {name}")
    return value


def five(values, name):
    if not isinstance(values, list) or len(values) != 5:
        raise ValueError(f"Invalid {name}")
    return [checked_int(value, f"{name} {index}") for index, value in enumerate(values)]


def median(values):
    return sorted(values)[2]


def factor_bounds(lower, upper):
    """Optimize sum(x)-5*median(x) over 30 ordered cells.

    At a fixed feasible median m, the other four coordinates move to box
    limits (or m). The resulting envelope is piecewise affine in m, with
    changes only at interval endpoints; check each feasible breakpoint.
    """
    extrema = []
    for pivot in range(5):
        others = [i for i in range(5) if i != pivot]
        for below in combinations(others, 2):
            above = [i for i in others if i not in below]
            floor = max(lower[i] for i in (pivot, *below))
            ceiling = min(upper[i] for i in (pivot, *above))
            if floor > ceiling:
                continue
            knots = {floor, ceiling}
            knots.update(v for v in (*lower, *upper) if floor <= v <= ceiling)
            for m in knots:
                max_sum = m + sum(min(upper[i], m) for i in below) + sum(upper[i] for i in above)
                min_sum = m + sum(lower[i] for i in below) + sum(max(lower[i], m) for i in above)
                extrema.extend((min_sum - 5 * m, max_sum - 5 * m))
    if not extrema:
        raise ValueError("No feasible reading configurations")
    return [min(extrema), max(extrema)]


def verify_witness(witness, lower, upper, low, high):
    if not isinstance(witness, dict):
        raise ValueError("Missing tie witness")
    if "path" in witness:
        path = witness["path"]
        if not isinstance(path, dict):
            raise ValueError("Invalid path")
        start = five(path.get("from"), "path start")
        end = five(path.get("to"), "path end")
        t0 = checked_int(path.get("targetFromUnits"), "path target start")
        t1 = checked_int(path.get("targetToUnits"), "path target end")
        n, d = path.get("numerator"), path.get("denominator")
        decimal = re.compile(r"(?:0|[1-9][0-9]{0,15})\Z")
        if not isinstance(n, str) or not isinstance(d, str) or not decimal.fullmatch(n) or not decimal.fullmatch(d):
            raise ValueError("Invalid path fraction")
        if int(d) == 0 or int(n) > int(d):
            raise ValueError("Path fraction outside segment")
        fraction = Fraction(int(n), int(d))
        if any(not lower[i] <= point[i] <= upper[i] for point in (start, end) for i in range(5)):
            raise ValueError("Path outside drift box")
        if not low <= t0 <= high or not low <= t1 <= high:
            raise ValueError("Path target outside interval")
        readings = [Fraction(a) + fraction * (b - a) for a, b in zip(start, end)]
        target = Fraction(t0) + fraction * (t1 - t0)
    else:
        readings = list(map(Fraction, five(witness.get("readings"), "witness readings")))
        target = Fraction(checked_int(witness.get("targetUnits"), "witness target"))
    if any(not lower[i] <= value <= upper[i] for i, value in enumerate(readings)):
        raise ValueError("Witness reading outside drift box")
    if not low <= target <= high:
        raise ValueError("Witness target outside interval")
    total, middle = sum(readings), median(readings)
    if (total - 5 * middle) * (total + 5 * middle - 10 * target):
        raise ValueError("Witness does not tie")


def verify(receipt):
    if not isinstance(receipt, dict) or receipt.get("format") != "inward-target-lens-proof-v1" or type(receipt.get("scale")) is not int or receipt["scale"] != SCALE:
        raise ValueError("Unknown receipt format")
    inputs, claim = receipt.get("inputs"), receipt.get("claim")
    if not isinstance(inputs, dict) or not isinstance(claim, dict):
        raise ValueError("Missing inputs or claim")
    readings = five(inputs.get("readings"), "readings")
    if any(value % 100 for value in readings):
        raise ValueError("Readings exceed four decimal places")
    low = checked_int(inputs.get("low"), "low")
    high = checked_int(inputs.get("high"), "high")
    drift = checked_int(inputs.get("drift"), "drift")
    checked_int(inputs.get("selectedTarget"), "selected target")
    if low > high:
        raise ValueError("Reversed target range")
    lower = [max(0, value - drift) for value in readings]
    upper = [min(LIMIT, value + drift) for value in readings]
    estimate = factor_bounds(lower, upper)
    reference = [sum(lower) + 5 * median(lower) - 10 * high,
                 sum(upper) + 5 * median(upper) - 10 * low]
    if type(claim.get("estimateRange")) is not list or any(type(x) is not int for x in claim["estimateRange"]) or claim["estimateRange"] != estimate:
        raise ValueError("Incorrect estimate factor range")
    if type(claim.get("referenceRange")) is not list or any(type(x) is not int for x in claim["referenceRange"]) or claim["referenceRange"] != reference:
        raise ValueError("Incorrect reference factor range")
    estimate_zero = estimate[0] <= 0 <= estimate[1]
    reference_zero = reference[0] <= 0 <= reference[1]
    kind = "all-tie" if estimate == [0, 0] else "tie-possible" if estimate_zero or reference_zero else "strict"
    winner = ("Median" if (estimate[0] > 0) == (reference[0] > 0) else "Mean") if kind == "strict" else None
    if claim.get("kind") != kind or claim.get("winner") != winner:
        raise ValueError("Incorrect verdict or winner")
    targets = {"kind": "all" if estimate_zero else "band",
               "lowerNumerator": sum(lower) + 5 * median(lower),
               "upperNumerator": sum(upper) + 5 * median(upper),
               "denominator": 10 * SCALE}
    if claim.get("tieTargets") != targets:
        raise ValueError("Incorrect tie target band")
    if kind == "tie-possible":
        verify_witness(claim.get("witness"), lower, upper, low, high)
    elif claim.get("witness") is not None:
        raise ValueError("Unexpected witness")
    return {"kind": kind, "winner": winner}


def main():
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: python3 tools/verify_target_lens.py receipt.json")
        path = Path(sys.argv[1])
        if path.stat().st_size > 1_000_000:
            raise ValueError("Receipt too large")
        result = verify(json.loads(path.read_text(encoding="utf-8")))
        print("Verified " + result["kind"] + (" · " + result["winner"] + " throughout" if result["winner"] else ""))
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"Verification failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
