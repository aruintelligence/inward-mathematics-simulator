#!/usr/bin/env python3
"""Check symbolic polynomial and permutation proof records without samples."""
from fractions import Fraction
from itertools import permutations
from pathlib import Path
import hashlib
import json
import sys

VARS = ("a", "b", "t")
ZERO = (0, 0, 0)


def polynomial(terms):
    return {powers: coefficient for powers, coefficient in terms.items() if coefficient}


def add(left, right):
    result = dict(left)
    for powers, coefficient in right.items():
        result[powers] = result.get(powers, Fraction(0)) + coefficient
    return polynomial(result)


def scale(value, scalar):
    return polynomial({powers: coefficient * scalar for powers, coefficient in value.items()})


def multiply(left, right):
    result = {}
    for powers_a, coefficient_a in left.items():
        for powers_b, coefficient_b in right.items():
            powers = tuple(a + b for a, b in zip(powers_a, powers_b))
            result[powers] = result.get(powers, Fraction(0)) + coefficient_a * coefficient_b
    return polynomial(result)


def names(value):
    result = {}
    for powers, coefficient in value.items():
        key = "*".join(name + ("^" + str(power) if power > 1 else "")
                       for name, power in zip(VARS, powers) if power)
        result[key or "1"] = str(coefficient)
    return result


def fields(value, expected, label):
    if type(value) is not dict or value.keys() != expected:
        raise ValueError(f"Invalid {label} fields")


def verify(record):
    fields(record, {"format", "model", "factorization", "midpoint", "permutation"}, "record")
    if record["format"] != "inward-estimator-identities-v1" or record["model"] != \
            "Five real readings, their mean and median, and any real target":
        raise ValueError("Unknown proof record format or model")
    a = {(1, 0, 0): Fraction(1)}
    b = {(0, 1, 0): Fraction(1)}
    t = {(0, 0, 1): Fraction(1)}
    subtract = lambda left, right: add(left, scale(right, -1))
    first = subtract(a, t)
    second = subtract(b, t)
    lhs = subtract(multiply(first, first), multiply(second, second))
    rhs = multiply(subtract(a, b), subtract(add(a, b), scale(t, 2)))
    if lhs != rhs:
        raise ArithmeticError("Squared-error factorization is false")
    factor = record["factorization"]
    fields(factor, {"statement", "expandedTerms"}, "factorization")
    if factor["statement"] != "(a-t)^2-(b-t)^2=(a-b)(a+b-2t)" or \
            factor["expandedTerms"] != names(lhs):
        raise ValueError("Incorrect factorization claim or polynomial coefficients")

    middle = scale(add(a, b), Fraction(1, 2))
    first_residual = subtract(a, middle)
    second_residual = subtract(b, middle)
    if first_residual != scale(second_residual, -1):
        raise ArithmeticError("Midpoint residuals are not negatives")
    midpoint = record["midpoint"]
    fields(midpoint, {"statement", "firstResidual", "secondResidual"}, "midpoint")
    if midpoint["statement"] != "At t=(a+b)/2, the two absolute errors are equal" or \
            midpoint["firstResidual"] != names(first_residual) or \
            midpoint["secondResidual"] != names(second_residual):
        raise ValueError("Incorrect midpoint identity")

    # Each permutation of five *indices* is checked as a formal relabeling.
    # The variable coefficients, not a grid of reading values, are compared.
    coefficient_vector = (Fraction(1, 5),) * 5
    count = 0
    for order in permutations(range(5)):
        permuted = [Fraction(0)] * 5
        for index in order:
            permuted[index] += Fraction(1, 5)
        if tuple(permuted) != coefficient_vector or sorted(order) != list(range(5)):
            raise ArithmeticError("Permutation changed sum or reading multiset")
        count += 1
    permutation = record["permutation"]
    fields(permutation, {"statement", "readingCount", "permutationsChecked", "meanCoefficients", "medianRank"}, "permutation")
    if permutation["statement"] != \
            "Reordering five readings preserves mean, median, and both absolute errors at every target" or \
            type(permutation["readingCount"]) is not int or permutation["readingCount"] != 5 or \
            type(permutation["permutationsChecked"]) is not int or permutation["permutationsChecked"] != count or \
            permutation["meanCoefficients"] != list(map(str, coefficient_vector)) or \
            type(permutation["medianRank"]) is not int or permutation["medianRank"] != 3:
        raise ValueError("Incorrect permutation identity")
    return {"symbolicIdentities": 2, "formalIndexPermutations": count}


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def load_record(file):
    """Load strict UTF-8 JSON and return both the claim and exact checked bytes."""
    file = Path(file)
    if file.stat().st_size > 100_000:
        raise ValueError("Proof record too large")
    data = file.read_bytes()
    record = json.loads(data.decode("utf-8"), object_pairs_hook=no_duplicates,
                        parse_constant=lambda value: (_ for _ in ()).throw(
                            ValueError("Invalid JSON constant")))
    return record, data


def main():
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: python3 tools/verify_estimator_identities.py record.json")
        record, data = load_record(sys.argv[1])
        checked = verify(record)
        print(f"Verified {checked['symbolicIdentities']} symbolic identities and "
              f"{checked['formalIndexPermutations']} index permutations")
        print("Proof record SHA-256: " + hashlib.sha256(data).hexdigest())
    except (OSError, ValueError, TypeError, KeyError, UnicodeError, ArithmeticError, RecursionError) as error:
        print(f"Proof record failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
