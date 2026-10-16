#!/usr/bin/env python3
"""Independent exact replay and algebraic check of conditional sample claims."""
from fractions import Fraction
from itertools import combinations_with_replacement
from math import comb
from pathlib import Path
import hashlib
import json
import re
import sys

FORMAT = "inward-conditional-claim-v6"
V5_FORMAT = "inward-conditional-claim-v5"
V4_FORMAT = "inward-conditional-claim-v4"
PREVIOUS_FORMAT = "inward-conditional-claim-v3"
EARLIER_FORMAT = "inward-conditional-claim-v2"
LEGACY_FORMAT = "inward-conditional-claim-v1"
FORMATS = (LEGACY_FORMAT, EARLIER_FORMAT, PREVIOUS_FORMAT, V4_FORMAT, V5_FORMAT, FORMAT)
MEDIAN_RULE = "central-order-statistics-v1"
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


def replay(values, targets, condition, prediction, reading_count):
    count = 0
    for readings in combinations_with_replacement(values, reading_count):
        mean = sum(readings) / reading_count
        median = readings[reading_count // 2] if reading_count % 2 else \
                 (readings[reading_count // 2 - 1] + readings[reading_count // 2]) / 2
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


def endpoint_refutation(condition, prediction, n):
    # This table chooses one of two sorted n-reading families and an endpoint.
    # The arithmetic and target guard are checked below, independently of the table.
    routes = {
        "any-target": {"lower-no-worse": ("one-high", 100),
                       "higher-no-worse": ("one-high", 0),
                       "mean-no-worse": ("one-high", 0),
                       "median-no-worse": ("one-high", 100)},
        "target-at-or-below-midpoint": {"higher-no-worse": ("one-high", 0),
                                        "mean-no-worse": ("one-high", 0),
                                        "median-no-worse": ("one-low", 0)},
        "target-at-or-above-midpoint": {"lower-no-worse": ("one-high", 100),
                                        "mean-no-worse": ("one-low", 100),
                                        "median-no-worse": ("one-high", 100)},
        "target-at-or-below-both": {"higher-no-worse": ("one-high", 0),
                                    "mean-no-worse": ("one-high", 0),
                                    "median-no-worse": ("one-low", 0)},
        "target-at-or-above-both": {"lower-no-worse": ("one-high", 100),
                                    "mean-no-worse": ("one-low", 100),
                                    "median-no-worse": ("one-high", 100)},
    }
    if n < 3 or prediction not in routes[condition]:
        raise ValueError("No endpoint construction for claim")
    family, endpoint = routes[condition][prediction]
    readings = ([Fraction(0)] * (n - 1) + [Fraction(100)]) if family == "one-high" else \
               ([Fraction(0)] + [Fraction(100)] * (n - 1))
    target = Fraction(endpoint)
    mean = sum(readings) / n
    median = readings[n // 2] if n % 2 else (readings[n // 2 - 1] + readings[n // 2]) / 2
    errors = {"mean": abs(mean - target), "median": abs(median - target)}
    actual = min(errors, key=errors.get) if errors["mean"] != errors["median"] else "tie"
    requested = {"lower-no-worse": "mean" if mean <= median else "median",
                 "higher-no-worse": "mean" if mean >= median else "median",
                 "mean-no-worse": "mean", "median-no-worse": "median"}[prediction]
    if not eligible(condition, mean, median, target) or actual in ("tie", requested):
        raise ValueError("Endpoint construction does not refute claim")
    return {"construction": {"method": "endpoint-family-v1", "family": family, "target": str(target)},
            "counterexample": {"readings": list(map(str, readings)), "target": str(target),
                               "mean": str(mean), "median": str(median),
                               "lower": str(min(mean, median)), "higher": str(max(mean, median)),
                               "actualWinner": actual}}


def verify(report):
    if type(report) is not dict or report.get("format") not in FORMATS:
        raise ValueError("Unknown claim format")
    current = report["format"] == FORMAT
    v5 = report["format"] == V5_FORMAT
    v4 = report["format"] == V4_FORMAT
    previous = report["format"] == PREVIOUS_FORMAT
    earlier = report["format"] == EARLIER_FORMAT
    fields(report, {"format", "claim", "domain", "search", "proof", "formal", "classification"}
           if current or v5 or v4 or previous else
           {"format", "claim", "domain", "search", "proof", "formal"} if earlier else
           {"format", "claim", "domain", "search", "proof"}, "report")
    claim = report["claim"]
    fields(claim, {"condition", "prediction", "statement"}, "claim")
    condition, prediction = claim["condition"], claim["prediction"]
    if type(condition) is not str or condition not in CONDITIONS or \
       type(prediction) is not str or prediction not in PREDICTIONS:
        raise ValueError("Unsupported condition or prediction")
    domain = report["domain"]
    reading_count = domain.get("readingCount") if (current or v5 or v4) and type(domain) is dict else 5
    if type(reading_count) is not int or reading_count not in ((3, 4, 5, 6, 7) if current or v5 else (3, 5, 7)):
        raise ValueError("Unsupported reading count")
    count_word = str(reading_count) if current or v5 or v4 else "five"
    expected_statement = f"For any {count_word} real readings, {CONDITIONS[condition]}, {PREDICTIONS[prediction]}."
    if claim["statement"] != expected_statement:
        raise ValueError("Claim statement does not match its meaning")
    fields(domain, {"readingCount", "medianRule", "readingValues", "targetValues", "readingMultisets"} if current or v5 else
           {"readingCount", "readingValues", "targetValues", "readingMultisets"} if v4 else
           {"readingValues", "targetValues", "readingMultisets"}, "domain")
    if (current or v5) and domain["medianRule"] != MEDIAN_RULE:
        raise ValueError("Unsupported median rule")
    values = grid(domain["readingValues"], 6, "reading grid")
    targets = grid(domain["targetValues"], 12, "target grid")
    total = comb(len(values) + reading_count - 1, reading_count)
    if type(domain["readingMultisets"]) is not int or domain["readingMultisets"] != total:
        raise ValueError("Incorrect reading multiset count")
    count, witness = replay(values, targets, condition, prediction, reading_count)
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
              "sourceCommit": FORMAL_COMMIT} if proof is not None and (current or v5 or v4 or previous or earlier) else None
    if (current or v5 or v4 or previous or earlier) and report["formal"] != formal:
        raise ValueError("Formal theorem reference does not match the proved claim")
    universal_witness = replay([Fraction(0), Fraction(50), Fraction(100)],
                               [Fraction(0), Fraction(50), Fraction(100)],
                               condition, prediction, reading_count)[1] if (v5 or v4 or previous) and proof is None else None
    if (v5 or v4 or previous) and proof is None and universal_witness is None:
        raise ValueError("Claim language classification is incomplete")
    construction = endpoint_refutation(condition, prediction, reading_count) if current and proof is None else None
    classification = {"status": "proved-by-algebra" if proof else "refuted-by-exact-witness",
                      "counterexample": construction["counterexample"] if current and construction else universal_witness}
    if current:
        classification["construction"] = construction["construction"] if construction else None
    if (current or v5 or v4 or previous) and report["classification"] != classification:
        raise ValueError("Universal classification does not match exact witness")
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
        if report["format"] in (FORMAT, V5_FORMAT, V4_FORMAT, PREVIOUS_FORMAT) and report["classification"]["status"] == "refuted-by-exact-witness":
            print(f"Verified refuted-by-exact-witness; selected grid {status}; "
                  f"{count} exact eligible cases checked")
        else:
            print(f"Verified {status}; {count} exact eligible cases checked")
        print("Claim SHA-256: " + hashlib.sha256(data).hexdigest())
    except (OSError, ValueError, TypeError, KeyError, UnicodeError, RecursionError) as error:
        print(f"Claim verification failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
