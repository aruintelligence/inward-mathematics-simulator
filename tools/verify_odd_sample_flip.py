#!/usr/bin/env python3
"""Independently check exhaustive piecewise-affine odd-sample flip certificates."""
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import re
import sys

FORMAT = "inward-odd-sample-flip-v1"
BOUNDED_FORMAT = "inward-odd-sample-flip-v2"
RATIONAL = re.compile(r"(?:0|-?[1-9][0-9]{0,256})(?:/[1-9][0-9]{0,256})?\Z")
LIMIT = Fraction(1_000_000)


def fields(obj, expected, name):
    if type(obj) is not dict or obj.keys() != expected:
        raise ValueError(f"Invalid {name} fields")


def rational(value, name, low=None, high=None):
    if type(value) is not str or RATIONAL.fullmatch(value) is None:
        raise ValueError(f"Invalid {name} rational")
    number = Fraction(value)
    if str(number) != value or low is not None and number < low or high is not None and number > high:
        raise ValueError(f"Noncanonical or out-of-range {name}")
    return number


def outcome(fixed, moved, target):
    values = sorted([*fixed, moved])
    middle = values[len(values) // 2]
    total = sum(values)
    # Directly compare squared absolute errors; no generator code is imported.
    delta = (total / len(values) - target) ** 2 - (middle - target) ** 2
    return "Mean" if delta < 0 else "Median" if delta > 0 else "Tie"


def all_roots(fixed, target, low=Fraction(0), high=Fraction(100)):
    """Closed-form roots of each factor on the three possible median cells."""
    n = len(fixed) + 1
    ordered = sorted(fixed)
    lower, upper = ordered[n // 2 - 1], ordered[n // 2]
    total = sum(fixed)
    roots = {low, high, lower, upper}
    for start, end, median in ((low, lower, lower), (upper, high, upper)):
        for root in (n * median - total, n * (2 * target - median) - total):
            if start <= root <= end:
                roots.add(root)
    for root in (total / (n - 1), (2 * n * target - total) / (n + 1)):
        if lower <= root <= upper:
            roots.add(root)
    return sorted(roots)


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def verify(record):
    fields(record, {"format", "inputs", "claim"}, "certificate")
    version = record["format"]
    if version not in (FORMAT, BOUNDED_FORMAT):
        raise ValueError("Unknown certificate format")
    inputs = record["inputs"]
    fields(inputs, {"readings", "target", "bounds"} if version == BOUNDED_FORMAT
           else {"readings", "target"}, "inputs")
    if version == BOUNDED_FORMAT:
        fields(inputs["bounds"], {"low", "high"}, "bounds")
        low = rational(inputs["bounds"]["low"], "lower bound", -LIMIT, LIMIT)
        high = rational(inputs["bounds"]["high"], "upper bound", -LIMIT, LIMIT)
        if low >= high:
            raise ValueError("Movement bounds must have positive width")
        target_low, target_high = -LIMIT, LIMIT
    else:
        low, high = Fraction(0), Fraction(100)
        target_low, target_high = low, high
    raw = inputs["readings"]
    if type(raw) is not list or not 3 <= len(raw) <= 21 or len(raw) % 2 != 1:
        raise ValueError("Reading count must be odd and between 3 and 21")
    values = [rational(value, "reading", low, high) for value in raw]
    target = rational(inputs["target"], "target", target_low, target_high)
    claim = record["claim"]
    fields(claim, {"kind", "baseline", "routes", "best"}, "claim")
    baseline = outcome(values[:-1], values[-1], target)
    if claim["baseline"] != baseline:
        raise ValueError("Incorrect initial winner")
    if baseline == "Tie":
        if claim["kind"] != "baseline-tie" or claim["routes"] != [] or claim["best"] is not None:
            raise ValueError("A tied baseline has no strict reversal claim")
        return {"kind": "baseline-tie", "routes": 0, "best": None}
    if claim["kind"] != "strict-baseline" or type(claim["routes"]) is not list or len(claim["routes"]) != len(values):
        raise ValueError("Incorrect strict baseline routes")
    opposite = "Median" if baseline == "Mean" else "Mean"
    optimal = []
    for index, route in enumerate(claim["routes"]):
        fields(route, {"index", "knots", "pointWinners", "intervalWinners", "threshold", "distance", "witness"}, "route")
        if type(route["index"]) is not int or route["index"] != index:
            raise ValueError("Incorrect route index")
        fixed = values[:index] + values[index + 1:]
        original = values[index]
        expected_knots = all_roots(fixed, target, low, high)
        knots = route["knots"]
        if type(knots) is not list or len(knots) != len(expected_knots) or [rational(k, "knot", low, high) for k in knots] != expected_knots:
            raise ValueError(f"Incomplete factor-root partition in route {index}")
        point_winners = [outcome(fixed, x, target) for x in expected_knots]
        interval_winners = [outcome(fixed, (a + b) / 2, target)
                            for a, b in zip(expected_knots, expected_knots[1:])]
        if route["pointWinners"] != point_winners or route["intervalWinners"] != interval_winners:
            raise ValueError(f"Incorrect exact interval signs in route {index}")
        candidates = []
        for left, right, result in zip(expected_knots, expected_knots[1:], interval_winners):
            if result == opposite:
                if original < left:
                    edge = left
                elif original > right:
                    edge = right
                else:
                    raise ArithmeticError("Baseline falls in an opposing interval")
                candidates.append((abs(original - edge), edge, left, right))
        if not candidates:
            if any(route[key] is not None for key in ("threshold", "distance", "witness")):
                raise ValueError(f"Unreachable route {index} claims a reversal")
            continue
        distance, threshold, _, _ = min(candidates)
        if rational(route["threshold"], "threshold", low, high) != threshold or \
                rational(route["distance"], "distance", Fraction(0), high - low) != distance:
            raise ValueError(f"Incorrect optimal threshold in route {index}")
        if outcome(fixed, threshold, target) != "Tie":
            raise ArithmeticError("The claimed strict reversal infimum is not a tie")
        witness = rational(route["witness"], "witness", low, high)
        if not any(left < witness < right and edge == threshold
                   for _, edge, left, right in candidates):
            raise ValueError(f"Witness not on the optimal opposing side in route {index}")
        if outcome(fixed, witness, target) != opposite:
            raise ValueError(f"Witness fails to reverse the winner in route {index}")
        optimal.append((distance, index, route))
    best = claim["best"]
    if not optimal:
        if best is not None:
            raise ValueError("No route has a strict reversal")
    else:
        chosen = min(optimal)[2]
        fields(best, {"index", "threshold", "distance", "witness"}, "best")
        if best != {key: chosen[key] for key in ("index", "threshold", "distance", "witness")}:
            raise ValueError("Incorrect globally nearest route")
    return {"kind": "strict-baseline", "routes": len(values), "best": best}


def main():
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: python3 tools/verify_odd_sample_flip.py certificate.json")
        path = Path(sys.argv[1])
        if path.stat().st_size > 2_000_000:
            raise ValueError("Certificate too large")
        data = path.read_bytes()
        record = json.loads(data.decode("utf-8"), object_pairs_hook=no_duplicates,
                            parse_constant=lambda value: (_ for _ in ()).throw(ValueError("Invalid JSON constant")))
        result = verify(record)
        print(f"Verified {result['kind']} across {result['routes']} one-reading routes")
        print("Certificate SHA-256: " + hashlib.sha256(data).hexdigest())
    except (OSError, ValueError, TypeError, KeyError, ArithmeticError, RecursionError, UnicodeError) as error:
        print(f"Verification failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
