#!/usr/bin/env python3
"""Exact mean/median outcomes and optional gap bounds over one-reading target boxes."""
import argparse
from fractions import Fraction
import json
from pathlib import Path

from odd_sample_flip import exact

FORMAT = "inward-odd-target-box-v1"
EVEN_FORMAT = "inward-even-target-box-v2"
GAP_FORMAT = "inward-target-box-gap-v3"
STABILITY_FORMAT = "inward-target-box-stability-v4"
ATLAS_FORMAT = "inward-target-box-atlas-v5"
HORIZON_FORMAT = "inward-target-horizon-v6"
LIMIT = Fraction(1_000_000)
ORDER = ("Mean", "Median", "Tie")


def winner(fixed, moved, target):
    values = [*fixed, moved]
    mean = sum(values) / len(values)
    ordered = sorted(values)
    median = (ordered[(len(values) - 1) // 2] + ordered[len(values) // 2]) / 2
    difference = (mean - median) * (mean + median - 2 * target)
    return "Mean" if difference < 0 else "Median" if difference > 0 else "Tie"


def partitions(fixed, low, high, target_low, target_high):
    """Include all median transitions and factor roots at both target endpoints."""
    n = len(fixed) + 1
    ordered = sorted(fixed)
    even, k = n % 2 == 0, n // 2
    lower, upper = ordered[k - 2 if even else k - 1], ordered[k]
    center = ordered[k - 1] if even else Fraction(0)
    left_median = (lower + center) / 2 if even else lower
    right_median = (center + upper) / 2 if even else upper
    total = sum(fixed)
    knots = {low, high, lower, upper}
    for start, end, intercept, slope in ((low, lower, left_median, 0),
                                         (lower, upper, center / 2 if even else 0,
                                          Fraction(1, 2) if even else 1),
                                         (upper, high, right_median, 0)):
        first = (total / n - intercept, Fraction(1, n) - slope)
        second = [(total / n + intercept - 2 * target, Fraction(1, n) + slope)
                  for target in (target_low, target_high)]
        for constant, coefficient in (first, *second):
            if coefficient == 0:
                continue
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
        ordered = sorted([*fixed, moved])
        median = (ordered[(len(readings) - 1) // 2] + ordered[len(readings) // 2]) / 2
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
    if type(raw_readings) is not list or not 3 <= len(raw_readings) <= 21:
        raise ValueError("Supply 3 through 21 readings")
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
    return {"format": FORMAT if len(readings) % 2 else EVEN_FORMAT,
            "inputs": {"readings": list(map(str, readings)),
                       "movement": {"low": str(low), "high": str(high)},
                       "target": {"low": str(target_low), "high": str(target_high)}},
            "claim": {"routes": routes, "reachable": reachable, "guarantee": guarantee}}


def gap_certificate(raw_readings, raw_low, raw_high, raw_target_low, raw_target_high):
    record = certificate(raw_readings, raw_low, raw_high, raw_target_low, raw_target_high)
    readings = list(map(Fraction, record["inputs"]["readings"]))
    target_low = Fraction(record["inputs"]["target"]["low"])
    target_high = Fraction(record["inputs"]["target"]["high"])

    def gap(fixed, moved, target):
        values = sorted([*fixed, moved])
        mean = sum(values) / len(values)
        median = (values[(len(values) - 1) // 2] + values[len(values) // 2]) / 2
        return (mean - target) ** 2 - (median - target) ** 2

    for route in record["claim"]["routes"]:
        fixed = readings[:route["index"]] + readings[route["index"] + 1:]
        knots = list(map(Fraction, route["knots"]))
        candidates = []
        for target in (target_low, target_high):
            for left, right in zip(knots, knots[1:]):
                for moved in (left, right):
                    candidates.append((gap(fixed, moved, target), moved, target))
                # On this median cell m(x) is affine. The squared-error
                # difference is quadratic, so only its vertex can be an
                # interior extremum for this target endpoint.
                n = len(readings)
                median_left = sorted([*fixed, left])
                median_right = sorted([*fixed, right])
                m_left = (median_left[(n - 1) // 2] + median_left[n // 2]) / 2
                m_right = (median_right[(n - 1) // 2] + median_right[n // 2]) / 2
                median_slope = (m_right - m_left) / (right - left)
                median_base = m_left - median_slope * left
                mean_slope, mean_base = Fraction(1, n), sum(fixed) / n
                a = mean_slope ** 2 - median_slope ** 2
                b = 2 * ((mean_base - target) * mean_slope -
                         (median_base - target) * median_slope)
                if a:
                    vertex = -b / (2 * a)
                    if left < vertex < right:
                        candidates.append((gap(fixed, vertex, target), vertex, target))
        smallest = min(candidates, key=lambda item: item)
        largest = min(candidates, key=lambda item: (-item[0], item[1], item[2]))
        route["gap"] = {"min": dict(zip(("value", "reading", "target"), map(str, smallest))),
                        "max": dict(zip(("value", "reading", "target"), map(str, largest)))}

    global_gap = {}
    for extreme in ("min", "max"):
        candidates = [(Fraction(route["gap"][extreme]["value"]), route["index"],
                       Fraction(route["gap"][extreme]["reading"]),
                       Fraction(route["gap"][extreme]["target"]))
                      for route in record["claim"]["routes"]]
        value, index, moved, target = min(candidates, key=lambda item: (
            item[0] if extreme == "min" else -item[0], item[1], item[2], item[3]))
        global_gap[extreme] = {"value": str(value), "index": index,
                               "reading": str(moved), "target": str(target)}
    record["claim"]["gap"] = global_gap
    record["format"] = GAP_FORMAT
    return record


def stability_certificate(raw_readings, raw_low, raw_high, raw_target_low, raw_target_high):
    record = certificate(raw_readings, raw_low, raw_high, raw_target_low, raw_target_high)
    readings = list(map(Fraction, record["inputs"]["readings"]))
    low = Fraction(record["inputs"]["movement"]["low"])
    high = Fraction(record["inputs"]["movement"]["high"])
    target_low = Fraction(record["inputs"]["target"]["low"])
    target_high = Fraction(record["inputs"]["target"]["high"])
    failures = []
    baseline = None
    for route in record["claim"]["routes"]:
        index = route["index"]
        start = readings[index]
        fixed = readings[:index] + readings[index + 1:]
        outcomes = (winner(fixed, start, target_low), winner(fixed, start, target_high))
        current = outcomes[0] if outcomes[0] == outcomes[1] and outcomes[0] != "Tie" else None
        if index == 0:
            baseline = current
        stability = {"baseline": current}
        knots = list(map(Fraction, route["knots"]))
        for side, edge in (("left", low), ("right", high)):
            candidates = ([start] + sorted((x for x in knots if x < start), reverse=True)
                          if side == "left" else [start] + sorted(x for x in knots if x > start))
            failure = next((x for x in candidates if current is None or
                            winner(fixed, x, target_low) != current or
                            winner(fixed, x, target_high) != current), None)
            if failure is None:
                stability[side] = {"limit": str(edge), "included": True, "witness": None}
                continue
            values = sorted([*fixed, failure])
            mean = sum(values) / len(values)
            median = (values[(len(values) - 1) // 2] + values[len(values) // 2]) / 2
            target = target_low if mean == median else (mean + median) / 2
            stability[side] = {"limit": str(failure), "included": False,
                               "witness": {"reading": str(failure), "target": str(target)}}
            failures.append((abs(failure - start), index, 0 if side == "left" else 1,
                             side, failure, target))
        route["stability"] = stability
    if failures:
        distance, index, _, side, moved, target = min(failures)
        nearest = {"distance": str(distance), "index": index, "side": side,
                   "reading": str(moved), "target": str(target)}
    else:
        nearest = None
    record["claim"]["stability"] = {"baseline": baseline, "nearestFailure": nearest}
    record["format"] = STABILITY_FORMAT
    return record


def atlas_certificate(raw_readings, raw_low, raw_high, raw_target_low, raw_target_high):
    record = certificate(raw_readings, raw_low, raw_high, raw_target_low, raw_target_high)
    readings = list(map(Fraction, record["inputs"]["readings"]))
    target_low = Fraction(record["inputs"]["target"]["low"])
    target_high = Fraction(record["inputs"]["target"]["high"])
    for route in record["claim"]["routes"]:
        fixed = readings[:route["index"]] + readings[route["index"] + 1:]
        knots = list(map(Fraction, route["knots"]))

        def estimates(moved):
            values = sorted([*fixed, moved])
            return (sum(values) / len(values),
                    (values[(len(values) - 1) // 2] + values[len(values) // 2]) / 2)

        def crossing(moved):
            mean, median = estimates(moved)
            return (mean + median) / 2

        stripes = []
        for left, right in zip(knots, knots[1:]):
            middle = (left + right) / 2
            mean, median = estimates(middle)
            if mean == median:
                raise ArithmeticError("Unexpected flat tie stripe")
            below = "Median" if mean > median else "Mean"
            stripes.append({"from": str(left), "to": str(right),
                            "tieFrom": str(crossing(left)), "tieTo": str(crossing(right)),
                            "below": below, "above": "Mean" if below == "Median" else "Median",
                            "atTargetLow": winner(fixed, middle, target_low),
                            "atTargetHigh": winner(fixed, middle, target_high)})
        vertical_ties = [str(moved) for moved in knots if
                         estimates(moved)[0] == estimates(moved)[1]]
        route["region"] = {"stripes": stripes, "verticalTies": vertical_ties}
    record["format"] = ATLAS_FORMAT
    return record


def horizon_certificate(raw_readings, raw_low, raw_high, raw_target_low, raw_target_high):
    record = certificate(raw_readings, raw_low, raw_high, raw_target_low, raw_target_high)
    readings = list(map(Fraction, record["inputs"]["readings"]))
    low = Fraction(record["inputs"]["movement"]["low"])
    high = Fraction(record["inputs"]["movement"]["high"])
    target_low = Fraction(record["inputs"]["target"]["low"])
    target_high = Fraction(record["inputs"]["target"]["high"])
    probe_target = (target_low + target_high) / 2

    def estimates(fixed, moved):
        values = sorted([*fixed, moved])
        return (sum(values) / len(values),
                (values[(len(values) - 1) // 2] + values[len(values) // 2]) / 2)

    def crossing(fixed, moved):
        mean, median = estimates(fixed, moved)
        return (mean + median) / 2

    lower, upper, all_target_tie = None, None, None
    for route in record["claim"]["routes"]:
        index = route["index"]
        fixed = readings[:index] + readings[index + 1:]
        first, last = crossing(fixed, low), crossing(fixed, high)
        lower = first if lower is None else min(lower, first)
        upper = last if upper is None else max(upper, last)
        equality = next((x for x in map(Fraction, route["knots"])
                         if estimates(fixed, x)[0] == estimates(fixed, x)[1]), None)
        route["targetHorizon"] = {"atMovementLow": str(first), "atMovementHigh": str(last),
                                  "allTargetTie": str(equality) if equality is not None else None}
        if all_target_tie is None and equality is not None:
            all_target_tie = {"index": index, "reading": str(equality)}

    below, above = None, None
    if all_target_tie is None:
        mean, median = estimates(readings[1:], readings[0])
        below = "Mean" if mean < median else "Median"
        above = "Median" if below == "Mean" else "Mean"
    witness = None
    if all_target_tie is not None:
        verdict, witness = "Tie", all_target_tie
    elif probe_target < lower:
        verdict = below
    elif probe_target > upper:
        verdict = above
    else:
        verdict = "Tie"
        for route in record["claim"]["routes"]:
            fixed = readings[:route["index"]] + readings[route["index"] + 1:]
            knots = list(map(Fraction, route["knots"]))
            for left, right in zip(knots, knots[1:]):
                first, last = crossing(fixed, left), crossing(fixed, right)
                if first <= probe_target <= last:
                    moved = left + (probe_target - first) * (right - left) / (last - first)
                    witness = {"index": route["index"], "reading": str(moved)}
                    break
            if witness is not None:
                break
        if witness is None:
            raise ArithmeticError("No tie witness in target horizon")
    record["claim"]["targetHorizon"] = {
        "low": str(lower), "high": str(upper), "allTargetTie": all_target_tie,
        "below": below, "above": above,
        "probe": {"target": str(probe_target), "verdict": verdict, "witness": witness}}
    record["format"] = HORIZON_FORMAT
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--readings", required=True, help="comma-separated rational readings")
    parser.add_argument("--low", required=True, help="inclusive lower movement bound")
    parser.add_argument("--high", required=True, help="inclusive upper movement bound")
    parser.add_argument("--target-low", required=True)
    parser.add_argument("--target-high", required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--gap-envelope", action="store_true",
                        help="include exact global and per-route squared-error gap extrema (v3)")
    parser.add_argument("--stability-radius", action="store_true",
                        help="include exact first-failure thresholds from each original reading (v4)")
    parser.add_argument("--region-atlas", action="store_true",
                        help="include exact Mean/Median region strip rules (v5)")
    parser.add_argument("--target-horizon", action="store_true",
                        help="solve exact target ranges with global strict guarantees (v6)")
    args = parser.parse_args()
    try:
        if sum((args.gap_envelope, args.stability_radius, args.region_atlas,
                args.target_horizon)) > 1:
            raise ValueError("Choose one certificate mode at a time")
        constructor = (horizon_certificate if args.target_horizon else
                       atlas_certificate if args.region_atlas else
                       stability_certificate if args.stability_radius else
                       gap_certificate if args.gap_envelope else certificate)
        result = constructor([part.strip() for part in args.readings.split(",")],
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
