#!/usr/bin/env python3
"""Independently check a portable stability edge and both rational witnesses."""
from fractions import Fraction
from pathlib import Path
import hashlib
import json
import re
import sys

from audit_stability_edge import audit_edge
from verify_target_lens import verify as verify_source

SCALE = 1_000_000
NUMBER = re.compile(r"(?:0|[1-9][0-9]{0,29})\Z")


def fields(value, expected, name):
    if type(value) is not dict or value.keys() != expected:
        raise ValueError(f"Invalid {name} fields")


def unsigned(value, name):
    if type(value) is not str or NUMBER.fullmatch(value) is None:
        raise ValueError(f"Invalid {name} integer")
    return int(value)


def rational(value, name):
    fields(value, {"numerator", "denominator"}, name)
    numerator = unsigned(value["numerator"], name + " numerator")
    denominator = unsigned(value["denominator"], name + " denominator")
    if denominator == 0:
        raise ValueError(f"Zero {name} denominator")
    fraction = Fraction(numerator, denominator)
    if fraction.numerator != numerator or fraction.denominator != denominator:
        raise ValueError(f"Non-reduced {name}")
    return fraction


def check_witness(witness, factor, radius, readings, low, high, mask):
    fields(witness, {"readingsNumerators", "targetNumerator", "denominator"}, "witness")
    divisor = unsigned(witness["denominator"], "witness denominator")
    if divisor == 0:
        raise ValueError("Zero witness denominator")
    numerators = witness["readingsNumerators"]
    if type(numerators) is not list or len(numerators) != 5:
        raise ValueError("Witness must have five readings")
    values = [Fraction(unsigned(value, "witness reading"), divisor) for value in numerators]
    target = Fraction(unsigned(witness["targetNumerator"], "witness target"), divisor)
    if not Fraction(low, SCALE) <= target <= Fraction(high, SCALE):
        raise ValueError("Witness target outside interval")
    for index, (value, original) in enumerate(zip(values, readings)):
        start = Fraction(original, SCALE)
        movement = radius if mask & (1 << index) else 0
        if not max(Fraction(0), start - movement) <= value <= min(Fraction(100), start + movement):
            raise ValueError("Witness reading outside drift box")
    middle = sorted(values)[2]
    mean = sum(values) / 5
    if abs(mean - target) != abs(middle - target):
        raise ValueError("Witness does not tie")
    if factor == "estimate" and mean != middle:
        raise ValueError("Estimate route witness does not meet its factor")
    if factor == "reference" and mean + middle != 2 * target:
        raise ValueError("Reference route witness does not meet its factor")


def verify(certificate):
    fields(certificate, {"format", "sourceReceipt", "mask", "claim"}, "certificate")
    if certificate["format"] != "inward-stability-edge-certificate-v1":
        raise ValueError("Unknown certificate format")
    source = certificate["sourceReceipt"]
    verify_source(source)
    mask = certificate["mask"]
    if type(mask) is not int or not 0 <= mask <= 31:
        raise ValueError("Invalid movable reading mask")
    inputs = source["inputs"]
    # Normalize integer-valued inputs only after the v1 receipt checker has
    # validated them. This also works with v1 checkers accepting 48000000.0.
    readings = [int(value) for value in inputs["readings"]]
    low, high = int(inputs["low"]), int(inputs["high"])
    expected = audit_edge(readings, low, high, mask)
    claim = certificate["claim"]
    if expected["kind"] == "no-baseline":
        fields(claim, {"kind"}, "no-baseline claim")
    elif expected["kind"] == "unreachable":
        fields(claim, {"kind", "winner"}, "unreachable claim")
        if claim["winner"] != expected["winner"]:
            raise ValueError("Incorrect baseline winner")
    else:
        fields(claim, {"kind", "winner", "firstRoute", "radius", "firstTieUnits", "routes"}, "edge claim")
        if claim["winner"] != expected["winner"] or claim["firstRoute"] != expected["firstRoute"]:
            raise ValueError("Incorrect winner or first route")
        if rational(claim["radius"], "first radius") != Fraction(expected["radius"]):
            raise ValueError("Incorrect first radius")
        if type(claim["firstTieUnits"]) is not int or claim["firstTieUnits"] != expected["firstTieUnits"]:
            raise ValueError("Incorrect first selectable setting")
        routes = claim["routes"]
        fields(routes, {"estimate", "reference"}, "routes")
        for factor in ("estimate", "reference"):
            route, independently_computed = routes[factor], expected["routes"][factor]
            if independently_computed is None:
                if route is not None:
                    raise ValueError(f"Unexpected {factor} route")
                continue
            fields(route, {"radius", "witness"}, factor + " route")
            radius = rational(route["radius"], factor + " radius")
            if radius != Fraction(independently_computed["radius"]):
                raise ValueError(f"Incorrect {factor} radius")
            check_witness(route["witness"], factor, radius, readings, low, high, mask)
        if claim["radius"] != routes[claim["firstRoute"]]["radius"]:
            raise ValueError("First radius differs from its route")
    if claim["kind"] != expected["kind"]:
        raise ValueError("Incorrect edge kind")
    return {"kind": expected["kind"], "winner": expected.get("winner"),
            "radius": expected.get("radius"), "firstTieUnits": expected.get("firstTieUnits")}


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def main():
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: python3 tools/verify_stability_certificate.py certificate.json")
        path = Path(sys.argv[1])
        if path.stat().st_size > 1_000_000:
            raise ValueError("Certificate too large")
        data = path.read_bytes()
        certificate = json.loads(data.decode("utf-8"), object_pairs_hook=no_duplicates,
                                 parse_constant=lambda value: (_ for _ in ()).throw(ValueError("Invalid JSON constant")))
        result = verify(certificate)
        print("Verified " + result["kind"] +
              (f" · first tie at {result['radius']}" if result["radius"] else ""))
        print("Certificate SHA-256: " + hashlib.sha256(data).hexdigest())
    except (OSError, ValueError, TypeError, KeyError, UnicodeError, ArithmeticError, RecursionError) as error:
        print(f"Verification failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
