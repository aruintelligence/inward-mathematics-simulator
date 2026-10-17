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
STABILITY_FORMAT = "inward-target-box-stability-v4"
ATLAS_FORMAT = "inward-target-box-atlas-v5"
HORIZON_FORMAT = "inward-target-horizon-v6"
RATIONAL = re.compile(r"(?:0|-?[1-9][0-9]{0,256})(?:/[1-9][0-9]{0,256})?\Z")
DECIMAL_TARGET = re.compile(r"-?(?:0|[1-9][0-9]{0,256})\.[0-9]{1,6}\Z")
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


def query_target(raw):
    if type(raw) is not str:
        raise ValueError("Enter an exact target as an integer, fraction, or decimal")
    value = raw.strip()
    if RATIONAL.fullmatch(value):
        try:
            return rational(value, "query target")
        except ZeroDivisionError as error:
            raise ValueError("Query target has a zero denominator") from error
    if DECIMAL_TARGET.fullmatch(value):
        return Fraction(value)
    raise ValueError("Enter an exact target as an integer, reduced fraction, or decimal with up to six places")


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


def check_stability(stability, fixed, start, roots, low, high, target_low, target_high, index):
    fields(stability, {"baseline", "left", "right"}, "route stability")
    endpoints = (outcome(fixed, start, target_low), outcome(fixed, start, target_high))
    baseline = endpoints[0] if endpoints[0] == endpoints[1] and endpoints[0] != "Tie" else None
    if stability["baseline"] != baseline:
        raise ValueError(f"Incorrect baseline on route {index + 1}")
    failures = []
    for side, edge in (("left", low), ("right", high)):
        detail = stability[side]
        fields(detail, {"limit", "included", "witness"}, "stability boundary")
        candidates = ([start] + sorted((x for x in roots if x < start), reverse=True)
                      if side == "left" else [start] + sorted(x for x in roots if x > start))
        first = next((x for x in candidates if baseline is None or
                      outcome(fixed, x, target_low) != baseline or
                      outcome(fixed, x, target_high) != baseline), None)
        limit = rational(detail["limit"], "stability limit", low, high)
        if first is None:
            if limit != edge or detail["included"] is not True or detail["witness"] is not None:
                raise ValueError(f"Incorrect safe {side} boundary on route {index + 1}")
            continue
        if limit != first or detail["included"] is not False:
            raise ValueError(f"Incorrect first {side} failure on route {index + 1}")
        witness = detail["witness"]
        fields(witness, {"reading", "target"}, "failure witness")
        moved = rational(witness["reading"], "failure reading", low, high)
        target = rational(witness["target"], "failure target", target_low, target_high)
        if moved != first or outcome(fixed, moved, target) != "Tie":
            raise ValueError(f"False {side} tie witness on route {index + 1}")
        failures.append((abs(first - start), index, 0 if side == "left" else 1, side, first))
    return baseline, failures


def check_region(region, fixed, roots, target_low, target_high, index):
    fields(region, {"stripes", "verticalTies"}, "region")
    stripes = region["stripes"]
    if type(stripes) is not list or len(stripes) != len(roots) - 1:
        raise ValueError(f"Incomplete region stripes on route {index + 1}")

    def crossing(moved):
        mean, median = estimators(fixed, moved)
        return (mean + median) / 2

    for i, stripe in enumerate(stripes):
        left, right = roots[i:i + 2]
        fields(stripe, {"from", "to", "tieFrom", "tieTo", "below", "above",
                        "atTargetLow", "atTargetHigh"}, "region stripe")
        if rational(stripe["from"], "stripe start") != left or \
                rational(stripe["to"], "stripe end") != right or \
                rational(stripe["tieFrom"], "first tie target", -LIMIT, LIMIT) != crossing(left) or \
                rational(stripe["tieTo"], "last tie target", -LIMIT, LIMIT) != crossing(right):
            raise ValueError(f"Incorrect region geometry on route {index + 1}")
        midpoint = (left + right) / 2
        tie = crossing(midpoint)
        below = outcome(fixed, midpoint, tie - 1)
        above = outcome(fixed, midpoint, tie + 1)
        if stripe["below"] != below or stripe["above"] != above or below == above or \
                stripe["atTargetLow"] != outcome(fixed, midpoint, target_low) or \
                stripe["atTargetHigh"] != outcome(fixed, midpoint, target_high):
            raise ValueError(f"Incorrect region winner on route {index + 1}")
    vertical_ties = [str(moved) for moved in roots if
                     estimators(fixed, moved)[0] == estimators(fixed, moved)[1]]
    if type(region["verticalTies"]) is not list or region["verticalTies"] != vertical_ties:
        raise ValueError(f"Incorrect all-target tie columns on route {index + 1}")


def check_route_horizon(horizon, fixed, roots, low, high, index):
    fields(horizon, {"atMovementLow", "atMovementHigh", "allTargetTie"}, "route target horizon")

    def midpoint(moved):
        mean, median = estimators(fixed, moved)
        return (mean + median) / 2

    first, last = midpoint(low), midpoint(high)
    if first >= last or rational(horizon["atMovementLow"], "first tie target", -LIMIT, LIMIT) != first or \
            rational(horizon["atMovementHigh"], "last tie target", -LIMIT, LIMIT) != last:
        raise ValueError(f"Incorrect tie target bounds on route {index + 1}")
    equality = next((moved for moved in roots if
                     estimators(fixed, moved)[0] == estimators(fixed, moved)[1]), None)
    if horizon["allTargetTie"] != (str(equality) if equality is not None else None):
        raise ValueError(f"Incorrect all-target tie on route {index + 1}")
    return first, last, equality


def check_target_horizon(horizon, route_bounds, readings, low, high, target_low, target_high):
    fields(horizon, {"low", "high", "allTargetTie", "below", "above", "probe"},
           "global target horizon")
    first = min(item[0] for item in route_bounds)
    last = max(item[1] for item in route_bounds)
    if rational(horizon["low"], "horizon lower", -LIMIT, LIMIT) != first or \
            rational(horizon["high"], "horizon upper", -LIMIT, LIMIT) != last:
        raise ValueError("Incorrect global target horizon bounds")
    equality_index = next((i for i, item in enumerate(route_bounds) if item[2] is not None), None)
    if equality_index is not None:
        fields(horizon["allTargetTie"], {"index", "reading"}, "global all-target tie")
        equality = route_bounds[equality_index][2]
        if type(horizon["allTargetTie"]["index"]) is not int or \
                horizon["allTargetTie"]["index"] != equality_index or \
                horizon["allTargetTie"]["reading"] != str(equality) or \
                horizon["below"] is not None or horizon["above"] is not None:
            raise ValueError("Incorrect global all-target tie")
        below, above = None, None
    else:
        if horizon["allTargetTie"] is not None:
            raise ValueError("False global all-target tie")
        below = outcome(readings[1:], readings[0], first - 1)
        above = outcome(readings[1:], readings[0], last + 1)
        if below not in ("Mean", "Median") or horizon["below"] != below or \
                horizon["above"] != above or below == above:
            raise ValueError("Incorrect guaranteed target sides")
        for index in range(len(readings)):
            fixed = readings[:index] + readings[index + 1:]
            for moved in (low, high):
                if outcome(fixed, moved, first - 1) != below or \
                        outcome(fixed, moved, last + 1) != above:
                    raise ValueError("Target side guarantee contradicted by a movement endpoint")
    probe = horizon["probe"]
    fields(probe, {"target", "verdict", "witness"}, "target probe")
    target = (target_low + target_high) / 2
    if rational(probe["target"], "probe target", target_low, target_high) != target:
        raise ValueError("Incorrect target probe")
    expected = ("Tie" if equality_index is not None else below if target < first else
                above if target > last else "Tie")
    if probe["verdict"] != expected:
        raise ValueError("Incorrect target probe verdict")
    if expected == "Tie":
        witness = probe["witness"]
        fields(witness, {"index", "reading"}, "target probe tie witness")
        index = witness["index"]
        if type(index) is not int or not 0 <= index < len(readings):
            raise ValueError("Invalid target probe route")
        moved = rational(witness["reading"], "target probe reading", low, high)
        fixed = readings[:index] + readings[index + 1:]
        if outcome(fixed, moved, target) != "Tie":
            raise ValueError("False target probe tie witness")
    elif probe["witness"] is not None:
        raise ValueError("Unexpected target probe witness")


def verify(record):
    fields(record, {"format", "inputs", "claim"}, "certificate")
    if record["format"] not in (FORMAT, EVEN_FORMAT, GAP_FORMAT, STABILITY_FORMAT,
                                ATLAS_FORMAT, HORIZON_FORMAT):
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
            record["format"] not in (GAP_FORMAT, STABILITY_FORMAT, ATLAS_FORMAT,
                                     HORIZON_FORMAT) and \
            (len(raw) % 2 == 0) != (record["format"] == EVEN_FORMAT):
        raise ValueError("Reading count must match certificate format, between 3 and 21")
    readings = [rational(value, "reading", low, high) for value in raw]
    claim = record["claim"]
    quantified = record["format"] == GAP_FORMAT
    stable = record["format"] == STABILITY_FORMAT
    atlas = record["format"] == ATLAS_FORMAT
    horizon = record["format"] == HORIZON_FORMAT
    fields(claim, {"routes", "reachable", "guarantee"} |
           ({"gap"} if quantified else {"stability"} if stable else
            {"targetHorizon"} if horizon else set()), "claim")
    routes = claim["routes"]
    if type(routes) is not list or len(routes) != len(readings):
        raise ValueError("Missing one-reading routes")
    overall = set()
    route_extrema = []
    failures = []
    route_bounds = []
    baseline = None
    for index, route in enumerate(routes):
        fields(route, {"index", "knots", "reachable", "guarantee", "witnesses"} |
               ({"gap"} if quantified else {"stability"} if stable else
                {"region"} if atlas else {"targetHorizon"} if horizon else set()), "route")
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
        if stable:
            checked, route_failures = check_stability(route["stability"], fixed, readings[index],
                                                      expected, low, high, target_low, target_high, index)
            if index == 0:
                baseline = checked
            elif checked != baseline:
                raise ValueError("Baseline differs across routes")
            failures.extend(route_failures)
        if atlas:
            check_region(route["region"], fixed, expected, target_low, target_high, index)
        if horizon:
            route_bounds.append(check_route_horizon(route["targetHorizon"], fixed, expected,
                                                    low, high, index))
        overall.update(reachable)
    expected = [name for name in ORDER if name in overall]
    guarantee = expected[0] if len(expected) == 1 and expected[0] != "Tie" else None
    if claim["reachable"] != expected or claim["guarantee"] != guarantee:
        raise ValueError("Incorrect global outcomes or strict guarantee")
    if horizon:
        check_target_horizon(claim["targetHorizon"], route_bounds, readings,
                             low, high, target_low, target_high)
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
    if stable:
        summary = claim["stability"]
        fields(summary, {"baseline", "nearestFailure"}, "global stability")
        if summary["baseline"] != baseline:
            raise ValueError("Incorrect global baseline")
        nearest = min(failures) if failures else None
        reported = summary["nearestFailure"]
        if nearest is None:
            if reported is not None:
                raise ValueError("False global failure")
        else:
            fields(reported, {"distance", "index", "side", "reading", "target"}, "nearest failure")
            distance = rational(reported["distance"], "failure distance", Fraction(0))
            moved = rational(reported["reading"], "failure reading", low, high)
            target = rational(reported["target"], "failure target", target_low, target_high)
            _, index, _, side, reading = nearest
            fixed = readings[:index] + readings[index + 1:]
            if distance != nearest[0] or type(reported["index"]) is not int or \
                    reported["index"] != index or reported["side"] != side or \
                    moved != reading or outcome(fixed, moved, target) != "Tie":
                raise ValueError("Incorrect global nearest failure or witness")
    result = {"routes": len(readings), "reachable": expected, "guarantee": guarantee}
    if quantified:
        result["gap"] = claim["gap"]
    if stable:
        result["stability"] = claim["stability"]
    if atlas:
        result["atlas"] = True
    if horizon:
        result["targetHorizon"] = claim["targetHorizon"]
    return result


def query_target_horizon(record, raw_target):
    """Recheck a v6 receipt, then solve a fresh exact target without its constructor."""
    if type(record) is not dict or record.get("format") != HORIZON_FORMAT:
        raise ValueError("A verified target-horizon certificate is required")
    horizon = verify(record)["targetHorizon"]
    target = query_target(raw_target)

    def answer(verdict, witness=None):
        return {"target": str(target), "verdict": verdict, "witness": witness}

    readings = list(map(Fraction, record["inputs"]["readings"]))
    if horizon["allTargetTie"] is not None:
        witness = horizon["allTargetTie"]
        index, moved = witness["index"], Fraction(witness["reading"])
        fixed = readings[:index] + readings[index + 1:]
        if outcome(fixed, moved, target) != "Tie":
            raise ArithmeticError("All-target tie contradicted by exact errors")
        return answer("Tie", {"index": index, "reading": str(moved)})
    if target < Fraction(horizon["low"]):
        return answer(horizon["below"])
    if target > Fraction(horizon["high"]):
        return answer(horizon["above"])

    low = Fraction(record["inputs"]["movement"]["low"])
    high = Fraction(record["inputs"]["movement"]["high"])
    target_low = Fraction(record["inputs"]["target"]["low"])
    target_high = Fraction(record["inputs"]["target"]["high"])
    for route in record["claim"]["routes"]:
        index = route["index"]
        fixed = readings[:index] + readings[index + 1:]
        knots = all_roots(fixed, low, high, target_low, target_high)

        def crossing(moved):
            mean, median = estimators(fixed, moved)
            return (mean + median) / 2

        for left, right in zip(knots, knots[1:]):
            first, last = crossing(left), crossing(right)
            if first <= target <= last:
                if first >= last:
                    raise ArithmeticError("Target-horizon cell is not increasing")
                moved = left + (right - left) * (target - first) / (last - first)
                if not left <= moved <= right or outcome(fixed, moved, target) != "Tie":
                    raise ArithmeticError("Exact query witness is not a tie")
                return answer("Tie", {"index": index, "reading": str(moved)})
    raise ArithmeticError("No exact tie witness in the checked target horizon")


def main():
    try:
        if len(sys.argv) not in (2, 4) or len(sys.argv) == 4 and sys.argv[2] != "--query-target":
            raise ValueError("Usage: python3 tools/verify_odd_target_box.py certificate.json [--query-target VALUE]")
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
        if "stability" in result:
            summary = result["stability"]
            point = summary["nearestFailure"]
            print(f"Baseline strict winner: {summary['baseline'] or 'none'}; " +
                  (f"nearest tie after exact movement {point['distance']} on route {point['index'] + 1} "
                   f"({point['side']}) at x={point['reading']}, t={point['target']}"
                   if point else "no failure within the stipulated movement range"))
        if result.get("atlas"):
            print("Exact Mean/Median region stripes and all-target tie columns checked")
        if "targetHorizon" in result:
            h = result["targetHorizon"]
            print(f"Target horizon [{h['low']}, {h['high']}]; " +
                  (f"all targets tie at route {h['allTargetTie']['index'] + 1}, "
                   f"x={h['allTargetTie']['reading']}" if h["allTargetTie"] else
                   f"strict {h['below']} below, strict {h['above']} above; "
                   f"probe t={h['probe']['target']}: {h['probe']['verdict']}"))
        if len(sys.argv) == 4:
            query = query_target_horizon(record, sys.argv[3])
            witness = query["witness"]
            print(f"Exact target query t={query['target']}: " +
                  (f"Tie; move reading {witness['index'] + 1} to {witness['reading']}"
                   if witness is not None else
                   f"strict {query['verdict']} across every permitted one-reading move"))
        print("Certificate SHA-256: " + hashlib.sha256(data).hexdigest())
    except (OSError, ValueError, TypeError, KeyError, ArithmeticError, RecursionError, UnicodeError) as error:
        print(f"Verification failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
