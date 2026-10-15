#!/usr/bin/env python3
"""Independent finite replay and algebraic check of conditional five-reading claims."""
from fractions import Fraction
from itertools import combinations_with_replacement
from math import comb
from pathlib import Path
import hashlib
import json
import re
import sys

FORMAT = "inward-conditional-claim-v2"
LEGACY_FORMAT = "inward-conditional-claim-v1"
FORMATS = (LEGACY_FORMAT, FORMAT)
FORMAL_COMMIT = "59a7e9dccd3cc328f855fc1fce1d6b6d55fdd705"
FORMAL_THEOREMS = {
    "target-at-or-below-midpoint": "InwardFormal.lower_no_worse_at_midpoint",
    "target-at-or-above-midpoint": "InwardFormal.higher_no_worse_at_midpoint",
    "target-at-or-below-both": "InwardFormal.lower_no_worse_below_both",
    "target-at-or-above-both": "InwardFormal.higher_no_worse_above_both",
}
CONDITIONS = {
    "any-target": "at any target",
    "target-at-or-below-midpoint": "if the target is at or below the estimates' midpoint",
    "target-at-or-above-midpoint": "if the target is at or above the estimates' midpoint",
    "target-at-or-below-both": "if the target is at or below both estimates",
    "target-at-or-above-both": "if the target is at or above both estimates",
}
PREDICTIONS = {
    "lower-no-worse": "the lower estimate is no farther than the higher estimate",
    "higher-no-worse": "the higher estimate is no farther than the lower estimate",
    "mean-no-worse": "the mean is no farther than the median",
    "median-no-worse": "the median is no farther than the mean",
}
RATIONAL = re.compile(r"(?:0|[1-9][0-9]{0,8})(?:/[1-9][0-9]{0,8})?\Z")


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def fields(value, expected, name):
    if type(value) is not dict or value.keys() != expected:
        raise ValueError(f"Invalid {name} fields")


def grid(entries, maximum, name):
    if type(entries) is not list or not 2 <= len(entries) <= maximum:
        raise ValueError(f"Invalid {name} size")
    values = []
    for raw in entries:
        if type(raw) is not str or RATIONAL.fullmatch(raw) is None:
            raise ValueError(f"Invalid {name} rational")
        value = Fraction(raw)
        if str(value) != raw or not 0 <= value <= 100:
            raise ValueError(f"Noncanonical or out-of-range {name} rational")
        values.append(value)
    if values != sorted(set(values)):
        raise ValueError(f"{name} must be sorted and distinct")
    return values


def polynomial_identity():
    # Exponent tuples are (a,b,t). Expand both sides without trusting the record.
    a, b, t = ({power: 1} for power in ((1, 0, 0), (0, 1, 0), (0, 0, 1)))

    def add(*terms):
        result = {}
        for term, scale in terms:
            for power, coefficient in term.items():
                result[power] = result.get(power, 0) + scale * coefficient
        return {power: coefficient for power, coefficient in result.items() if coefficient}

    def multiply(left, right):
        result = {}
        for left_power, x in left.items():
            for right_power, y in right.items():
                power = tuple(i + j for i, j in zip(left_power, right_power))
                result[power] = result.get(power, 0) + x * y
        return {power: coefficient for power, coefficient in result.items() if coefficient}

    first = add((a, 1), (t, -1))
    second = add((b, 1), (t, -1))
    difference = add((multiply(first, first), 1), (multiply(second, second), -1))
    product = multiply(add((a, 1), (b, -1)), add((a, 1), (b, 1), (t, -2)))
    if difference != product:
        raise ValueError("Squared-distance identity failed")
    names = {(2, 0, 0): "a^2", (0, 2, 0): "b^2", (1, 0, 1): "a*t", (0, 1, 1): "b*t"}
    return {names[power]: coefficient for power, coefficient in difference.items()}


def algebraic_proof(condition, prediction):
    side = "below" if condition in ("target-at-or-below-midpoint", "target-at-or-below-both") else \
           "above" if condition in ("target-at-or-above-midpoint", "target-at-or-above-both") else None
    if side is None or (side == "below" and prediction != "lower-no-worse") or \
       (side == "above" and prediction != "higher-no-worse"):
        return None
    # a <= b. A target below a is below (a+b)/2; a target above b is above it.
    # So (a-b) <= 0 and (a+b-2t) has the indicated sign. Their product gives
    # the squared-error ordering, equivalent to absolute-error ordering.
    target_bound = ("t<=a" if side == "below" else "t>=b") if condition.endswith("both") else \
                   ("t<=(a+b)/2" if side == "below" else "t>=(a+b)/2")
    return {"method": "squared-error-factor-sign-v1",
            "identity": {"difference": "(a-t)^2-(b-t)^2", "product": "(a-b)(a+b-2t)",
                         "expanded": polynomial_identity()},
            "assumptions": ["a<=b", target_bound],
            "factorSigns": ["nonpositive", "nonnegative" if side == "below" else "nonpositive"],
            "result": "(a-t)^2<=(b-t)^2" if side == "below" else "(b-t)^2<=(a-t)^2"}


def eligible(condition, mean, median, target):
    if condition == "any-target":
        return True
    if condition == "target-at-or-below-midpoint":
        return target <= (mean + median) / 2
    if condition == "target-at-or-above-midpoint":
        return target >= (mean + median) / 2
    if condition == "target-at-or-below-both":
        return target <= min(mean, median)
    return target >= max(mean, median)


def replay(values, targets, condition, prediction):
    count = 0
    for readings in combinations_with_replacement(values, 5):
        mean, median = sum(readings) / 5, readings[2]
        for target in targets:
            if not eligible(condition, mean, median, target):
                continue
            count += 1
            errors = {"mean": abs(mean - target), "median": abs(median - target)}
            actual_winner = "tie" if errors["mean"] == errors["median"] else \
                min(errors, key=errors.get)
            lower_label = "mean" if mean <= median else "median"
            higher_label = "mean" if mean >= median else "median"
            expected_winner = {"lower-no-worse": lower_label, "higher-no-worse": higher_label,
                               "mean-no-worse": "mean", "median-no-worse": "median"}[prediction]
            if actual_winner not in ("tie", expected_winner):
                return count, {"readings": [str(x) for x in readings], "target": str(target),
                               "mean": str(mean), "median": str(median),
                               "lower": str(min(mean, median)), "higher": str(max(mean, median)),
                               "actualWinner": actual_winner}
    return count, None


def verify(report):
    if type(report) is not dict or report.get("format") not in FORMATS:
        raise ValueError("Unknown claim format")
    current = report["format"] == FORMAT
    fields(report, {"format", "claim", "domain", "search", "proof", "formal"} if current else
           {"format", "claim", "domain", "search", "proof"}, "report")
    claim = report["claim"]
    fields(claim, {"condition", "prediction", "statement"}, "claim")
    condition, prediction = claim["condition"], claim["prediction"]
    if type(condition) is not str or condition not in CONDITIONS or \
       type(prediction) is not str or prediction not in PREDICTIONS:
        raise ValueError("Unsupported condition or prediction")
    expected_statement = f"For any five real readings, {CONDITIONS[condition]}, {PREDICTIONS[prediction]}."
    if claim["statement"] != expected_statement:
        raise ValueError("Claim statement does not match its meaning")
    domain = report["domain"]
    fields(domain, {"readingValues", "targetValues", "readingMultisets"}, "domain")
    values = grid(domain["readingValues"], 6, "reading grid")
    targets = grid(domain["targetValues"], 12, "target grid")
    total = comb(len(values) + 4, 5)
    if type(domain["readingMultisets"]) is not int or domain["readingMultisets"] != total:
        raise ValueError("Incorrect reading multiset count")
    count, witness = replay(values, targets, condition, prediction)
    proof = algebraic_proof(condition, prediction)
    search = report["search"]
    fields(search, {"casesChecked", "status", "counterexample"}, "search")
    status = "counterexample-found" if witness else "proved-by-algebra" if proof else "unrefuted-on-finite-grid"
    if type(search["casesChecked"]) is not int or search != \
       {"casesChecked": count, "status": status, "counterexample": witness}:
        raise ValueError("Incorrect independent finite replay")
    if witness and proof:
        raise ValueError("Universal argument contradicted by a finite case")
    if proof is not None and type(report["proof"]) is dict:
        identity = report["proof"].get("identity")
        expanded = identity.get("expanded") if type(identity) is dict else None
        if type(expanded) is not dict or any(type(value) is not int for value in expanded.values()):
            raise ValueError("Algebraic coefficients must be integers")
    if report["proof"] != proof:
        raise ValueError("Algebraic certificate is absent or inconsistent")
    formal = {"system": "Lean 4/Mathlib", "declaration": FORMAL_THEOREMS[condition],
              "sourceCommit": FORMAL_COMMIT} if proof is not None and current else None
    if current and report["formal"] != formal:
        raise ValueError("Formal theorem reference does not match the proved claim")
    return status, count


def main():
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: python3 tools/verify_conditional_claim.py claim.json")
        path = Path(sys.argv[1])
        if path.stat().st_size > 1_000_000:
            raise ValueError("Claim exceeds 1 MB")
        data = path.read_bytes()
        report = json.loads(data.decode("utf-8"), object_pairs_hook=no_duplicates,
                            parse_constant=lambda x: (_ for _ in ()).throw(ValueError("Invalid JSON constant")))
        status, count = verify(report)
        print(f"Verified {status}; {count} exact eligible cases checked")
        print("Claim SHA-256: " + hashlib.sha256(data).hexdigest())
    except (OSError, ValueError, TypeError, KeyError, UnicodeError, RecursionError) as error:
        print(f"Claim verification failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
