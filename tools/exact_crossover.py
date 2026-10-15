#!/usr/bin/env python3
"""Exact crossover mathematics for competing point estimates.

For fixed rational estimates a,b and real target t:
|a-t|^2 - |b-t|^2 = (a-b)(a+b-2t).
Negative => a wins; positive => b wins; zero => tie.
No floating-point arithmetic is used.
"""
from fractions import Fraction
import argparse
import json


def rational(value):
    if isinstance(value, bool):
        raise ValueError("Boolean is not a number")
    return Fraction(str(value))


def compare(a, b, target):
    a, b, target = map(rational, (a, b, target))
    delta = (a - b) * (a + b - 2 * target)
    return "tie" if delta == 0 else "first" if delta < 0 else "second"


def certificate(a, b, lower, upper):
    """Exact classification over EVERY real target in a closed interval."""
    a, b, lower, upper = map(rational, (a, b, lower, upper))
    if lower > upper:
        raise ValueError("Lower bound exceeds upper bound")
    if a == b:
        return {"kind": "permanent-tie", "crossover": str(a),
                "winner": None, "endpoints": ["tie", "tie"]}
    left, right = compare(a, b, lower), compare(a, b, upper)
    midpoint = (a + b) / 2
    if left == right and left != "tie":
        kind = "strict-throughout"
        winner = left
    elif left == right == "tie":
        kind, winner = "singleton-tie", None
    elif "tie" in (left, right):
        kind, winner = "winner-and-endpoint-tie", left if left != "tie" else right
    else:
        kind, winner = "both-winners-and-tie", None
    return {"kind": kind, "crossover": str(midpoint),
            "winner": winner, "endpoints": [left, right]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("first", "second", "lower", "upper"):
        parser.add_argument(name, help="Exact decimal or fraction")
    args = parser.parse_args()
    print(json.dumps(certificate(args.first, args.second, args.lower, args.upper), indent=2))


if __name__ == "__main__":
    main()
