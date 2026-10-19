#!/usr/bin/env python3
"""Independent exact audit of a v4 Joint Reading Box target sweep.

Checks the claimed lower envelope by inequalities at every piece endpoint,
without importing the certificate generator or reconstructing its hull.
An affine line that is no larger than every candidate at both endpoints is
no larger throughout the closed piece; an in-box witness attains that line.
"""
import argparse
from fractions import Fraction
from hashlib import sha256
from itertools import product
import json
from pathlib import Path
import re

FORMAT = "inward-joint-reading-box-v4"
RATIONAL = re.compile(r"(?:0|-[1-9][0-9]{0,256}|[1-9][0-9]{0,256})(?:/[1-9][0-9]{0,256})?\Z")
MAX_BYTES = 2_000_000
MAX_CANDIDATES = 100_000
MAX_ENDPOINT_CHECKS = 2_000_000


def fail(message):
    raise ValueError(message)


def fields(value, names, label):
    if type(value) is not dict or set(value) != set(names):
        fail(f"Invalid {label} fields")


def unique_object(pairs):
    result = {}
    for name, value in pairs:
        if name in result:
            fail(f"Duplicate JSON key: {name}")
        result[name] = value
    return result


def forbidden_constant(value):
    fail(f"Non-JSON number: {value}")


def rational(raw, label, bounded=False):
    if type(raw) is not str or len(raw) > 520 or not RATIONAL.fullmatch(raw):
        fail(f"Invalid {label} rational")
    numerator, _, denominator = raw.partition("/")
    if bounded and (len(numerator.lstrip("-")) > 18 or len(denominator) > 18):
        fail(f"Input {label} exceeds rational precision limit")
    value = Fraction(int(numerator), int(denominator) if denominator else 1)
    if str(value) != raw or bounded and abs(value) > 1_000_000:
        fail(f"Noncanonical or out-of-range {label}")
    return value


def reading_factors(readings):
    n = len(readings)
    ordered = sorted(readings)
    mean = sum(readings) / n
    median = (ordered[(n - 1) // 2] + ordered[n // 2]) / 2
    return mean - median, (mean + median) / 2


def vector(raw, intervals, label):
    if type(raw) is not list or len(raw) != len(intervals):
        fail(f"Invalid {label} readings")
    readings = tuple(rational(value, label) for value in raw)
    if any(not low <= value <= high for value, (low, high) in zip(readings, intervals)):
        fail(f"{label} outside reading interval")
    return readings


def audit(data):
    """Recompute and prove the sweep from its original UTF-8 JSON bytes."""
    if type(data) is not bytes or len(data) > MAX_BYTES:
        fail("Certificate must be UTF-8 JSON no larger than 2 MB")
    try:
        receipt = json.loads(data.decode("utf-8"), object_pairs_hook=unique_object,
                             parse_constant=forbidden_constant)
    except (UnicodeError, json.JSONDecodeError, RecursionError) as error:
        fail(f"Invalid UTF-8 JSON: {error}")
    fields(receipt, ("format", "inputs", "claim"), "certificate")
    if receipt["format"] != FORMAT:
        fail("Expected a v4 target sweep")
    inputs, claim = receipt["inputs"], receipt["claim"]
    fields(inputs, ("intervals", "targetInterval"), "inputs")
    raw_intervals = inputs["intervals"]
    if type(raw_intervals) is not list or not 3 <= len(raw_intervals) <= 5:
        fail("Supply 3 through 5 intervals")
    intervals = []
    for i, pair in enumerate(raw_intervals, 1):
        if type(pair) is not list or len(pair) != 2:
            fail(f"Invalid interval {i}")
        low, high = (rational(value, f"interval {i}", bounded=True) for value in pair)
        if low > high:
            fail("Reversed reading interval")
        intervals.append((low, high))
    targets = inputs["targetInterval"]
    if type(targets) is not list or len(targets) != 2:
        fail("Invalid target interval")
    start, stop = (rational(value, "target", bounded=True) for value in targets)
    if start >= stop:
        fail("Target sweep requires an increasing target interval")

    endpoints = sorted({value for pair in intervals for value in pair})
    options = [[value for value in endpoints if low <= value <= high]
               for low, high in intervals]
    count = 1
    for choices in options:
        count *= len(choices)
    if count > MAX_CANDIDATES:
        fail("Joint box exceeds exact candidate budget")
    candidates = []
    smallest = largest = None
    for readings in product(*options):
        difference, midpoint = reading_factors(readings)
        candidates.append((2 * abs(difference), midpoint))
        smallest = difference if smallest is None else min(smallest, difference)
        largest = difference if largest is None else max(largest, difference)

    fields(claim, ("estimateRange", "midpointRange", "tieTargetInterval",
                   "tieWitness", "strictPieces"), "sweep claim")
    estimates = claim["estimateRange"]
    fields(estimates, ("min", "max"), "estimate range")
    for side, expected in (("min", smallest), ("max", largest)):
        entry = estimates[side]
        fields(entry, ("value", "readings"), f"{side} extremum")
        value = rational(entry["value"], f"{side} estimate")
        witness = vector(entry["readings"], intervals, f"{side} witness")
        if value != expected or reading_factors(witness)[0] != expected:
            fail(f"Incorrect {side} estimate extremum")
    midpoint_range = claim["midpointRange"]
    fields(midpoint_range, ("min", "max"), "midpoint range")
    hlow = reading_factors(tuple(pair[0] for pair in intervals))[1]
    hhigh = reading_factors(tuple(pair[1] for pair in intervals))[1]
    if (rational(midpoint_range["min"], "lower midpoint") != hlow or
            rational(midpoint_range["max"], "upper midpoint") != hhigh):
        fail("Incorrect midpoint range")

    global_tie = smallest <= 0 <= largest
    tie_low, tie_high = (start, stop) if global_tie else (max(start, hlow), min(stop, hhigh))
    has_tie = tie_low <= tie_high
    if has_tie:
        raw_tie = claim["tieTargetInterval"]
        if (type(raw_tie) is not list or len(raw_tie) != 2 or
                rational(raw_tie[0], "tie start") != tie_low or
                rational(raw_tie[1], "tie end") != tie_high):
            fail("Incorrect tie target interval")
        tie_witness = claim["tieWitness"]
        fields(tie_witness, ("readings", "target"), "tie witness")
        target = rational(tie_witness["target"], "tie target", bounded=True)
        if not tie_low <= target <= tie_high:
            fail("Tie witness target outside tie interval")
        difference, midpoint = reading_factors(vector(tie_witness["readings"], intervals,
                                                        "tie witness"))
        if difference * (midpoint - target):
            fail("Unattained tie")
    elif claim["tieTargetInterval"] is not None or claim["tieWitness"] is not None:
        fail("False tie claim")

    pieces = claim["strictPieces"]
    if type(pieces) is not list or len(pieces) > MAX_CANDIDATES:
        fail("Invalid strict pieces")
    regions = []
    if not global_tie:
        if start < min(stop, hlow):
            regions.append((start, min(stop, hlow), "below",
                            "Mean" if smallest < 0 else "Median"))
        if max(start, hhigh) < stop:
            regions.append((max(start, hhigh), stop, "above",
                            "Median" if smallest < 0 else "Mean"))
    # Each candidate difference is affine relative to the claimed line. A
    # nonnegative difference at both endpoints is nonnegative everywhere.
    if len(candidates) * 2 * len(pieces) > MAX_ENDPOINT_CHECKS:
        fail("Independent endpoint audit exceeds comparison budget")
    index = 0
    for left, right, side, verdict in regions:
        cursor, previous_line = left, None
        while index < len(pieces):
            entry = pieces[index]
            fields(entry, ("from", "to", "slope", "intercept", "readings", "verdict"),
                   "strict piece")
            lower = rational(entry["from"], "piece start")
            upper = rational(entry["to"], "piece end")
            if lower != cursor or not lower < upper <= right or entry["verdict"] != verdict:
                break
            slope = rational(entry["slope"], "piece slope")
            intercept = rational(entry["intercept"], "piece intercept")
            if slope == 0 or (side == "below" and slope >= 0) or (side == "above" and slope <= 0):
                fail("Incorrect strict piece slope")
            line = (slope, intercept)
            if line == previous_line:
                fail("Redundant strict piece breakpoint")
            difference, midpoint = reading_factors(vector(entry["readings"], intervals,
                                                           "piece witness"))
            weight = 2 * abs(difference)
            claimed_line = ((-weight, weight * midpoint) if side == "below"
                            else (weight, -weight * midpoint))
            if line != claimed_line:
                fail("Piece witness does not attain its line")
            for target in (lower, upper):
                claimed_gap = slope * target + intercept
                if claimed_gap < 0:
                    fail("Negative squared-error lead")
                exact_minimum = min(
                    weight * (midpoint - target) if side == "below"
                    else weight * (target - midpoint)
                    for weight, midpoint in candidates)
                if claimed_gap != exact_minimum:
                    fail("Claimed piece is not the exact lower envelope")
            cursor, previous_line = upper, line
            index += 1
            if cursor == right:
                break
        if cursor != right:
            fail("Incomplete target sweep")
    if index != len(pieces):
        fail("Extra or misplaced strict piece")
    return {"sourceReceiptSha256": sha256(data).hexdigest(), "tieTargetInterval":
            claim["tieTargetInterval"], "strictPieces": len(pieces),
            "candidates": len(candidates)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt", type=Path, help="v4 JSON receipt to audit")
    args = parser.parse_args()
    try:
        result = audit(args.receipt.read_bytes())
    except (OSError, ValueError) as error:
        parser.exit(1, f"Joint reading sweep rejected: {error}\n")
    print("Independent exact v4 sweep audit passed")
    print(f"Candidate configurations: {result['candidates']}; strict pieces: {result['strictPieces']}")
    print(f"Source receipt SHA-256: {result['sourceReceiptSha256']}")


if __name__ == "__main__":
    main()
