#!/usr/bin/env python3
"""Construct or independently check an exact failed-margin witness for a v4 sweep."""
import argparse
from fractions import Fraction
from hashlib import sha256
import json
from pathlib import Path

from joint_reading_threshold import THRESHOLD
from joint_reading_tolerance import target_value
from verify_joint_reading_sweep import (audit, fields, forbidden_constant, reading_factors,
                                        unique_object, vector)

FORMAT = "inward-joint-reading-margin-counterexample-v1"


def context(raw, raw_target, raw_threshold):
    # This independent audit checks the whole envelope, rather than trusting a
    # selected piece or the browser's reported minimum.
    audit(raw)
    receipt = json.loads(raw.decode("utf-8"), object_pairs_hook=unique_object,
                         parse_constant=forbidden_constant)
    target = target_value(raw_target)
    start, stop = map(Fraction, receipt["inputs"]["targetInterval"])
    if not start <= target <= stop:
        raise ValueError("Target outside the verified sweep interval")
    if (type(raw_threshold) is not str or len(raw_threshold) > 520 or
            not THRESHOLD.fullmatch(raw_threshold)):
        raise ValueError("Use a positive integer, fraction, or decimal with up to six places")
    threshold = Fraction(raw_threshold)
    if threshold <= 0:
        raise ValueError("Required lead must be positive")
    piece = next((item for item in receipt["claim"]["strictPieces"] if
                  Fraction(item["from"]) <= target <= Fraction(item["to"])), None)
    minimum = (Fraction(piece["slope"]) * target + Fraction(piece["intercept"])) if piece else Fraction(0)
    if minimum >= threshold:
        raise ValueError("The required lead is guaranteed at this target; no counterexample exists")
    return receipt, target, threshold, piece, minimum


def estimators(readings):
    ordered = sorted(readings)
    return (sum(readings) / len(readings),
            (ordered[(len(readings) - 1) // 2] + ordered[len(readings) // 2]) / 2)


def tie_at(receipt, target):
    """Independently interpolate the monotone lower-to-upper reading path."""
    bounds = [(Fraction(low), Fraction(high)) for low, high in receipt["inputs"]["intervals"]]
    example = tuple(map(Fraction, receipt["claim"]["tieWitness"]["readings"]))
    mean, median = estimators(example)
    if mean == median:
        return example
    low = [pair[0] for pair in bounds]
    speeds = [high - lower for lower, high in bounds]
    at = lambda u: tuple(lower + u * speed for lower, speed in zip(low, speeds))
    midpoint = lambda u: sum(estimators(at(u))) / 2
    stops = {Fraction(0), Fraction(1)}
    for i in range(len(low)):
        for j in range(i):
            relative_speed = speeds[i] - speeds[j]
            if relative_speed:
                crossing = (low[j] - low[i]) / relative_speed
                if 0 < crossing < 1:
                    stops.add(crossing)
    points = sorted(stops)
    for left, right in zip(points, points[1:]):
        hleft, hright = midpoint(left), midpoint(right)
        if hleft <= target <= hright:
            u = left if hleft == hright else left + (right - left) * (target - hleft) / (hright - hleft)
            return at(u)
    raise ValueError("No in-box readings attain the selected tie")


def record(raw, target, threshold, readings):
    mean, median = estimators(readings)
    mean_error, median_error = (mean - target) ** 2, (median - target) ** 2
    lead = abs(mean_error - median_error)
    winner = "Mean" if mean_error < median_error else "Median" if median_error < mean_error else None
    return {"format": FORMAT, "sourceReceiptSha256": sha256(raw).hexdigest(),
            "target": str(target), "threshold": str(threshold),
            "readings": [str(value) for value in readings], "mean": str(mean),
            "median": str(median), "meanSquaredError": str(mean_error),
            "medianSquaredError": str(median_error), "attainedLead": str(lead), "winner": winner}


def answer(raw, raw_target, raw_threshold):
    receipt, target, threshold, piece, minimum = context(raw, raw_target, raw_threshold)
    readings = (tuple(map(Fraction, piece["readings"])) if minimum else tie_at(receipt, target))
    result = record(raw, target, threshold, readings)
    if Fraction(result["attainedLead"]) != minimum:
        raise ValueError("Constructed witness does not attain the minimum")
    return result


def verify(raw, submitted):
    fields(submitted, ("format", "sourceReceiptSha256", "target", "threshold", "readings",
                       "mean", "median", "meanSquaredError", "medianSquaredError",
                       "attainedLead", "winner"), "counterexample")
    if submitted["format"] != FORMAT:
        raise ValueError("Expected a margin counterexample")
    receipt, target, threshold, piece, minimum = context(raw, submitted["target"],
                                                        submitted["threshold"])
    intervals = [(Fraction(low), Fraction(high)) for low, high in receipt["inputs"]["intervals"]]
    readings = vector(submitted["readings"], intervals, "counterexample")
    expected = record(raw, target, threshold, readings)
    if submitted != expected or Fraction(expected["attainedLead"]) != minimum:
        raise ValueError("Witness, squared errors, minimum lead, or source fingerprint does not match")
    return expected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt", type=Path, help="independently audited v4 target sweep")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--target", help="target to challenge; also requires --threshold")
    group.add_argument("--verify", type=Path, help="check an exported failure witness")
    parser.add_argument("--threshold", help="positive required squared-error lead")
    args = parser.parse_args()
    try:
        raw = args.receipt.read_bytes()
        if len(raw) > 2_000_000:
            raise ValueError("Receipt exceeds 2 MB")
        if args.verify:
            if args.threshold is not None:
                raise ValueError("--threshold is only used with --target")
            data = args.verify.read_bytes()
            if len(data) > 2_000_000:
                raise ValueError("Counterexample exceeds 2 MB")
            submitted = json.loads(data.decode("utf-8"), object_pairs_hook=unique_object,
                                   parse_constant=forbidden_constant)
            verify(raw, submitted)
            print("Exact failed-margin witness independently verified")
        else:
            if args.threshold is None:
                raise ValueError("--threshold is required with --target")
            print(json.dumps(answer(raw, args.target, args.threshold), indent=2))
    except (OSError, ValueError, TypeError, KeyError, ArithmeticError,
            UnicodeError, RecursionError) as error:
        parser.exit(1, f"Counterexample rejected: {error}\n")


if __name__ == "__main__":
    main()
