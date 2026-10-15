#!/usr/bin/env python3
"""Independent rational audit of the first Target Lens reading-drift tie.

Input is a validated Target Lens v1 receipt. The edge is derived afresh from
its readings and target interval; the receipt's selected drift is not used.
"""
import argparse
from fractions import Fraction
import json
from pathlib import Path
import sys

from verify_target_lens import verify

SCALE = 1_000_000
MAXIMUM = 100 * SCALE


def median(readings):
    return sorted(readings)[2]


def display(value):
    """Reduce a rational in millionth units to ordinary reading units."""
    fraction = value / SCALE
    return str(fraction.numerator) + ("/" + str(fraction.denominator) if fraction.denominator != 1 else "")


def audit_edge(readings, low, high, mask=31):
    """Return exact first roots of both factors under a clipped L-infinity box."""
    if (len(readings) != 5 or any(type(r) is not int or r < 0 or r > MAXIMUM for r in readings)
            or type(low) is not int or type(high) is not int or not 0 <= low <= high <= MAXIMUM
            or type(mask) is not int or not 0 <= mask <= 31):
        raise ValueError("Invalid audit inputs")

    total = sum(readings)
    estimate = total - 5 * median(readings)
    reference_low = total + 5 * median(readings) - 10 * high
    reference_high = total + 5 * median(readings) - 10 * low
    if estimate == 0 or reference_low <= 0 <= reference_high:
        return {"kind": "no-baseline"}
    signs = {"estimate": 1 if estimate > 0 else -1,
             "reference": 1 if reference_low > 0 else -1}
    winner = "Median" if signs["estimate"] == signs["reference"] else "Mean"

    movable = [bool(mask & (1 << i)) for i in range(5)]
    stops = {Fraction(0), Fraction(MAXIMUM)}
    for i, reading in enumerate(readings):
        if movable[i]:
            stops.update((Fraction(reading), Fraction(MAXIMUM - reading)))
        for j in range(i):
            if movable[i] or movable[j]:
                stops.add(Fraction(abs(reading - readings[j]), 2 if movable[i] and movable[j] else 1))
    stops = sorted(stops)

    def box(radius):
        return ([max(Fraction(0), r - radius) if moves else Fraction(r)
                 for r, moves in zip(readings, movable)],
                [min(Fraction(MAXIMUM), r + radius) if moves else Fraction(r)
                 for r, moves in zip(readings, movable)])

    groups = []
    for middle in range(5):
        other = [index for index in range(5) if index != middle]
        for a in range(3):
            for b in range(a + 1, 4):
                below = (other[a], other[b])
                groups.append((middle, below, tuple(i for i in other if i not in below)))

    def signed_estimate(bounds, group):
        lower, upper = bounds
        middle, below, above = group
        floor = max(lower[i] for i in (middle, *below))
        ceiling = min(upper[i] for i in (middle, *above))
        if floor > ceiling:
            return None
        if signs["estimate"] > 0:
            # Minimum of sum(x)-5m: below at lower bounds, above at
            # max(lower,m), and the largest feasible median m.
            return sum(lower[i] for i in below) + sum(max(lower[i], ceiling) for i in above) - 4 * ceiling
        # Maximum of sum(x)-5m, negated to give a positive baseline margin.
        return -(sum(upper[i] for i in above) + sum(min(upper[i], floor) for i in below) - 4 * floor)

    def signed_reference(bounds):
        lower, upper = bounds
        if signs["reference"] > 0:
            return sum(lower) + 5 * median(lower) - 10 * high
        return -(sum(upper) + 5 * median(upper) - 10 * low)

    roots = {"estimate": None, "reference": None}

    def consider(kind, group, left, right, at_left, at_right):
        if at_left is None or at_right is None:
            return
        if at_left <= 0:
            root = left
        elif at_right <= 0:
            root = left + (right - left) * at_left / (at_left - at_right)
        else:
            return
        if roots[kind] is None or root < roots[kind][0]:
            roots[kind] = (root, group)

    for left, right in zip(stops, stops[1:]):
        first, last = box(left), box(right)
        consider("reference", None, left, right, signed_reference(first), signed_reference(last))
        for group in groups:
            consider("estimate", group, left, right,
                     signed_estimate(first, group), signed_estimate(last, group))

    def witness(kind, route):
        radius, group = route
        lower, upper = box(radius)
        if kind == "reference":
            arrangement = lower if signs[kind] > 0 else upper
            target = Fraction(high if signs[kind] > 0 else low)
        else:
            middle, below, above = group
            if signs[kind] > 0:
                pivot = min(upper[i] for i in (middle, *above))
                arrangement = [pivot if i == middle else max(lower[i], pivot) if i in above else lower[i]
                               for i in range(5)]
            else:
                pivot = max(lower[i] for i in (middle, *below))
                arrangement = [pivot if i == middle else min(upper[i], pivot) if i in below else upper[i]
                               for i in range(5)]
            target = Fraction(low)
        mean = sum(arrangement) / 5
        middle_value = median(arrangement)
        error = abs(mean - target)
        if error != abs(middle_value - target) or any(x < a or x > b for x, a, b in zip(arrangement, lower, upper)):
            raise ArithmeticError("Computed boundary witness is not admissible")
        return {"readings": [display(x) for x in arrangement], "target": display(target),
                "mean": display(mean), "median": display(middle_value), "equalError": display(error)}

    if not any(roots.values()):
        return {"kind": "unreachable", "winner": winner, "mask": mask,
                "routes": {"estimate": None, "reference": None}}
    first_kind = min((kind for kind in ("reference", "estimate") if roots[kind] is not None),
                     key=lambda kind: roots[kind][0])
    radius = roots[first_kind][0]
    routes = {kind: None if route is None else
              {"radius": display(route[0]), "witness": witness(kind, route)}
              for kind, route in roots.items()}
    return {"kind": "edge", "winner": winner, "mask": mask, "firstRoute": first_kind,
            "radius": display(radius), "firstTieUnits": -(-radius.numerator // radius.denominator),
            "routes": routes}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt", type=Path, help="Target Lens v1 JSON receipt")
    parser.add_argument("--mask", type=int, default=31, help="movable reading bitmask 0–31 (default: all five)")
    parser.add_argument("--json", action="store_true", help="emit machine-readable result")
    args = parser.parse_args()
    try:
        if args.receipt.stat().st_size > 1_000_000:
            raise ValueError("Receipt too large")
        receipt = json.loads(args.receipt.read_text(encoding="utf-8"))
        verify(receipt)
        inputs = receipt["inputs"]
        result = audit_edge(inputs["readings"], inputs["low"], inputs["high"], args.mask)
        if args.json:
            print(json.dumps(result, separators=(",", ":")))
        elif result["kind"] == "edge":
            print(f"First tie at ε = {result['radius']} (route: {result['firstRoute']}); "
                  f"first selectable setting {result['firstTieUnits'] / SCALE:.6f}")
            for kind, route in result["routes"].items():
                if route is not None:
                    proof = route["witness"]
                    print(f"{kind}: ε = {route['radius']}; readings {proof['readings']}; "
                          f"target {proof['target']}; mean {proof['mean']}; median {proof['median']}; "
                          f"both errors {proof['equalError']}")
        else:
            print(result["kind"] + (" · " + result.get("winner", "") if result.get("winner") else ""))
    except (OSError, ValueError, KeyError, TypeError, ArithmeticError) as error:
        print(f"Audit failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
