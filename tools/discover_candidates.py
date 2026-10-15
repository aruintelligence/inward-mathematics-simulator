#!/usr/bin/env python3
"""Finite, exact search for counterexamples to five-reading model claims.

Example: python3 tools/discover_candidates.py --output examples/discovery-scan-v1.json
The scan can falsify a universal claim on its grid. Exhausting a finite grid
does not prove the claim over real readings or targets.
"""
import argparse
from fractions import Fraction
import hashlib
from itertools import combinations_with_replacement, permutations
import json
from pathlib import Path

DEFAULT_VALUES = "0,25,50,75,100"
DEFAULT_TARGETS = DEFAULT_VALUES


def points(source, maximum):
    parts = source.split(",")
    if not 1 <= len(parts) <= maximum or any(len(part) > 40 for part in parts):
        raise ValueError(f"Expected between 1 and {maximum} short rational values")
    values = sorted({Fraction(part.strip()) for part in parts})
    if len(values) != len(parts) or any(value < 0 or value > 100 for value in values):
        raise ValueError("Values must be unique rational numbers from 0 to 100")
    return values


def fraction(value):
    return str(value)


def estimates(readings):
    return sum(readings) / 5, sorted(readings)[2]


def winner(readings, target):
    mean, median = estimates(readings)
    a, b = abs(mean - target), abs(median - target)
    return "tie" if a == b else "mean" if a < b else "median"


def point_witness(readings, target):
    mean, median = estimates(readings)
    return {"readings": list(map(fraction, readings)), "target": fraction(target),
            "mean": fraction(mean), "median": fraction(median),
            "actualWinner": winner(readings, target)}


def scan(values, targets):
    boxes = list(combinations_with_replacement(values, 5))
    claims = [
        {"id": "median-never-worse", "claim": "Median is at least as close as mean for every chosen target."},
        {"id": "mean-never-worse", "claim": "Mean is at least as close as median for every chosen target."},
        {"id": "target-independent", "claim": "Changing the target cannot reverse a strict winner for fixed readings."},
        {"id": "midpoint-tie", "claim": "For distinct estimates, their exact midpoint is an equal-error target."},
        {"id": "permutation-invariant", "claim": "Permuting the five readings cannot change the winner at a fixed target."},
    ]
    for item in claims:
        item.update(status="unrefuted-on-finite-grid", casesChecked=0, counterexample=None)

    for readings in boxes:
        mean, median = estimates(readings)
        strict_seen = {}
        for target in targets:
            result = winner(readings, target)
            for index, forbidden in ((0, "mean"), (1, "median")):
                item = claims[index]
                if item["counterexample"] is None:
                    item["casesChecked"] += 1
                    if result == forbidden:
                        item["status"] = "counterexample-found"
                        item["counterexample"] = point_witness(readings, target)
            item = claims[2]
            if item["counterexample"] is None and result != "tie":
                item["casesChecked"] += 1
                opposite = "median" if result == "mean" else "mean"
                if opposite in strict_seen:
                    first_target = strict_seen[opposite]
                    item["status"] = "counterexample-found"
                    item["counterexample"] = {
                        "readings": list(map(fraction, readings)),
                        "first": point_witness(readings, first_target),
                        "second": point_witness(readings, target),
                    }
                strict_seen[result] = target

        if mean != median and claims[3]["counterexample"] is None:
            item = claims[3]
            item["casesChecked"] += 1
            midpoint = (mean + median) / 2
            if winner(readings, midpoint) != "tie":
                item["status"] = "counterexample-found"
                item["counterexample"] = point_witness(readings, midpoint)

        item = claims[4]
        if item["counterexample"] is None:
            for arrangement in set(permutations(readings)):
                for target in targets:
                    item["casesChecked"] += 1
                    if winner(arrangement, target) != winner(readings, target):
                        item["status"] = "counterexample-found"
                        item["counterexample"] = {
                            "original": point_witness(readings, target),
                            "permuted": point_witness(arrangement, target),
                        }
                        break
                if item["counterexample"] is not None:
                    break

    return {"format": "inward-discovery-scan-v1",
            "scope": "Exact rational arithmetic over this finite grid only; unrefuted is not proved.",
            "sourceSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "domain": {"readingValues": list(map(fraction, values)),
                       "targetValues": list(map(fraction, targets)),
                       "readingMultisets": len(boxes)},
            "candidates": claims}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--values", default=DEFAULT_VALUES, help="Up to six distinct rational reading values")
    parser.add_argument("--targets", default=DEFAULT_TARGETS, help="Up to twelve distinct rational targets")
    parser.add_argument("--output", type=Path, help="Write deterministic JSON archive")
    args = parser.parse_args()
    try:
        report = scan(points(args.values, 6), points(args.targets, 12))
    except (ValueError, ZeroDivisionError) as error:
        parser.error(str(error))
    document = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.write_text(document, encoding="utf-8")
        print(f"Wrote {args.output}: {len(report['candidates'])} candidates, "
              f"{report['domain']['readingMultisets']} reading multisets")
    else:
        print(document, end="")


if __name__ == "__main__":
    main()
