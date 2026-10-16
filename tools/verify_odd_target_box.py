#!/usr/bin/env python3
"""Independent exact verifier for odd, even, and quantified target-box certificates."""
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import re
import sys

FORMAT = "inward-odd-target-box-v1"
EVEN_FORMAT = "inward-even-target-box-v2"
GAP_FORMAT = "inward-target-box-gap-v3"
RATIONAL = re.compile(r"(?:0|-?[1-9][0-9]{0,256})(?:/[1-9][0-9]{0,256})?\Z")
LIMIT = Fraction(1_000_000)
ORDER = ("Mean", "Median", "Tie")


def fields(obj, expected, label):
    if type(obj) is not dict or obj.keys() != expected:
        raise ValueError(f"Invalid {label} fields")


def rational(raw, label, low=None, high=None):
    if type(raw) is not str or RATIONAL.fullmatch(raw) is None:
        raise ValueError(f"Invalid {label} rational")
    value = Fraction(raw)
    if str(value) != raw or low is not None and value < low or high is not None and value > high:
        raise ValueError(f"Noncanonical or out-of-range {label}")
    return value


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def estimators(fixed, moved):
    values = sorted([*fixed, moved])
    return sum(values) / len(values), (values[(len(values) - 1) // 2] + values[len(values) // 2]) / 2


def outcome(fixed, moved, target):
    mean, median = estimators(fixed, moved)
    difference = (mean - target) ** 2 - (median - target) ** 2
    return "Mean" if difference < 0 else "Median" if difference > 0 else "Tie"


def all_roots(fixed, low, high, target_low, target_high):
    """Solve linear factors separately on the three median cells."""
    n = len(fixed) + 1
    ordered = sorted(fixed)
    even, k = n % 2 == 0, n // 2
    lower, upper = ordered[k - 2 if even else k - 1], ordered[k]
    center = ordered[k - 1] if even else Fraction(0)
    left_median = (lower + center) / 2 if even else lower
    right_median = (center + upper) / 2 if even else upper
    total = sum(fixed)
    roots = {low, high, lower, upper}
    for start, end, median in ((low, lower, left_median), (upper, high, right_median)):
        for root in (n * median - total,
                     *(n * (2 * target - median) - total
                       for target in (target_low, target_high))):
            if start <= root <= end:
                roots.add(root)
    middle = ((2 * total - n * center) / (n - 2),
              *((4 * n * target - 2 * total - n * center) / (n + 2)
                for target in (target_low, target_high))) if even else (
              total / (n - 1),
              *((2 * n * target - total) / (n + 1)
                for target in (target_low, target_high)))
    for root in middle:
        if lower <= root <= upper:
            roots.add(root)
    return sorted(roots)


def all_outcomes(fixed, knots, target_low, target_high):
    """For each x cell, endpoint signs and the in-range target crossing suffice."""
    samples = [knots[0]]
    for left, right in zip(knots, knots[1:]):
        samples.extend(((left + right) / 2, right))
    found = set()
    for moved in samples:
        mean, median = estimators(fixed, moved)
        found.add(outcome(fixed, moved, target_low))
        found.add(outcome(fixed, moved, target_high))
        if target_low <= (mean + median) / 2 <= target_high:
            found.add("Tie")
    return [name for name in ORDER if name in found]


def gap_at(fixed, moved, target):
    mean, median = estimators(fixed, moved)
    return (mean - target) ** 2 - (median - target) ** 2


def extrema(fixed, knots, target_low, target_high):
    values = []
    for target in (target_low, target_high):
        for left, right in zip(knots, knots[1:]):
            values.extend((gap_at(fixed, left, target), gap_at(fixed, right, target)))
            count = len(fixed) + 1
            _, median_left = estimators(fixed, left)
            _, median_right = estimators(fixed, right)
            median_slope = (median_right - median_left) / (right - left)
            median_base = median_left - median_slope * left
            mean_slope, mean_base = Fraction(1, count), sum(fixed) / count
            quadratic = mean_slope ** 2 - median_slope ** 2
            linear = 2 * ((mean_base - target) * mean_slope -
                          (median_base - target) * median_slope)
            if quadratic:
                vertex = -linear / (2 * quadratic)
                if left < vertex < right:
                    values.append(gap_at(fixed, vertex, target))
    return {"min": min(values), "max": max(values)}


def check_gap(gap, expected, fixed, low, high, target_low, target_high, label):
    fields(gap, {"min", "max"}, label)
    for extreme in ("min", "max"):
        point = gap[extreme]
        fields(point, {"value", "reading", "target"}, f"{label} {extreme}")
        value = rational(point["value"], f"{label} {extreme} value")
        moved = rational(point["reading"], f"{label} {extreme} reading", low, high)
        target = rational(point["target"], f"{label} {extreme} target", target_low, target_high)
        if value != expected[extreme] or gap_at(fixed, moved, target) != value:
            raise ValueError(f"Incorrect {label} {extreme} or unattained witness")


def verify(record):
    fields(record, {"format", "inputs", "claim"}, "certificate")
    if record["format"] not in (FORMAT, EVEN_FORMAT, GAP_FORMAT):
        raise ValueError("Unknown certificate format")
    inputs = record["inputs"]
    fields(inputs, {"readings", "movement", "target"}, "inputs")
    fields(inputs["movement"], {"low", "high"}, "movement")
    fields(inputs["target"], {"low", "high"}, "target")
    low = rational(inputs["movement"]["low"], "movement lower", -LIMIT, LIMIT)
    high = rational(inputs["movement"]["high"], "movement upper", -LIMIT, LIMIT)
    target_low = rational(inputs["target"]["low"], "target lower", -LIMIT, LIMIT)
    target_high = rational(inputs["target"]["high"], "target upper", -LIMIT, LIMIT)
    if low >= high or target_low > target_high:
        raise ValueError("Invalid interval order")
    raw = inputs["readings"]
    if type(raw) is not list or not 3 <= len(raw) <= 21 or \
            record["format"] != GAP_FORMAT and (len(raw) % 2 == 0) != (record["format"] == EVEN_FORMAT):
        raise ValueError("Reading count must match certificate format, between 3 and 21")
    readings = [rational(value, "reading", low, high) for value in raw]
    claim = record["claim"]
    quantified = record["format"] == GAP_FORMAT
    fields(claim, {"routes", "reachable", "guarantee", "gap"} if quantified else
           {"routes", "reachable", "guarantee"}, "claim")
    routes = claim["routes"]
    if type(routes) is not list or len(routes) != len(readings):
        raise ValueError("Missing one-reading routes")
    overall = set()
    route_extrema = []
    for index, route in enumerate(routes):
        fields(route, {"index", "knots", "reachable", "guarantee", "witnesses", "gap"} if quantified else
               {"index", "knots", "reachable", "guarantee", "witnesses"}, "route")
        if type(route["index"]) is not int or route["index"] != index:
            raise ValueError("Incorrect route index")
        fixed = readings[:index] + readings[index + 1:]
        expected = all_roots(fixed, low, high, target_low, target_high)
        knots = route["knots"]
        if type(knots) is not list or len(knots) != len(expected) or \
                [rational(value, "knot", low, high) for value in knots] != expected:
            raise ValueError(f"Incomplete partition on route {index}")
        reachable = all_outcomes(fixed, expected, target_low, target_high)
        if route["reachable"] != reachable:
            raise ValueError(f"Incorrect reachable outcomes on route {index}")
        strict = reachable[0] if len(reachable) == 1 and reachable[0] != "Tie" else None
        if route["guarantee"] != strict:
            raise ValueError(f"Incorrect strict guarantee on route {index}")
        witnesses = route["witnesses"]
        fields(witnesses, set(reachable), "witnesses")
        for name in reachable:
            witness = witnesses[name]
            fields(witness, {"reading", "target"}, "witness")
            moved = rational(witness["reading"], "witness reading", low, high)
            target = rational(witness["target"], "witness target", target_low, target_high)
            if outcome(fixed, moved, target) != name:
                raise ValueError(f"False {name} witness on route {index}")
        if quantified:
            expected_gap = extrema(fixed, expected, target_low, target_high)
            check_gap(route["gap"], expected_gap, fixed, low, high,
                      target_low, target_high, f"route {index + 1} gap")
            if route["guarantee"] == "Mean" and expected_gap["max"] >= 0 or \
                    route["guarantee"] == "Median" and expected_gap["min"] <= 0:
                raise ValueError(f"Gap contradicts route {index + 1} guarantee")
            route_extrema.append(expected_gap)
        overall.update(reachable)
    expected = [name for name in ORDER if name in overall]
    guarantee = expected[0] if len(expected) == 1 and expected[0] != "Tie" else None
    if claim["reachable"] != expected or claim["guarantee"] != guarantee:
        raise ValueError("Incorrect global outcomes or strict guarantee")
    if quantified:
        fields(claim["gap"], {"min", "max"}, "global gap")
        for extreme in ("min", "max"):
            expected_value = (min if extreme == "min" else max)(
                item[extreme] for item in route_extrema)
            point = claim["gap"][extreme]
            fields(point, {"value", "index", "reading", "target"}, f"global gap {extreme}")
            index = point["index"]
            if type(index) is not int or not 0 <= index < len(readings):
                raise ValueError("Invalid global gap route index")
            value = rational(point["value"], f"global {extreme} value")
            moved = rational(point["reading"], f"global {extreme} reading", low, high)
            target = rational(point["target"], f"global {extreme} target", target_low, target_high)
            fixed = readings[:index] + readings[index + 1:]
            if value != expected_value or gap_at(fixed, moved, target) != value:
                raise ValueError(f"Incorrect global {extreme} or unattained witness")
    result = {"routes": len(readings), "reachable": expected, "guarantee": guarantee}
    if quantified:
        result["gap"] = claim["gap"]
    return result


def main():
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: python3 tools/verify_odd_target_box.py certificate.json")
        path = Path(sys.argv[1])
        if path.stat().st_size > 2_000_000:
            raise ValueError("Certificate too large")
        data = path.read_bytes()
        record = json.loads(data.decode("utf-8"), object_pairs_hook=no_duplicates,
                            parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Invalid JSON constant")))
        result = verify(record)
        print(f"Verified {result['routes']} exhaustive routes: {', '.join(result['reachable'])}; "
              f"strict guarantee: {result['guarantee'] or 'none'}")
        if "gap" in result:
            lower, upper = result["gap"]["min"], result["gap"]["max"]
            print(f"Exact attained squared-error gap D: [{lower['value']}, {upper['value']}]; "
                  f"min route {lower['index'] + 1} at x={lower['reading']}, t={lower['target']}; "
                  f"max route {upper['index'] + 1} at x={upper['reading']}, t={upper['target']}")
        print("Certificate SHA-256: " + hashlib.sha256(data).hexdigest())
    except (OSError, ValueError, TypeError, KeyError, ArithmeticError, RecursionError, UnicodeError) as error:
        print(f"Verification failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
