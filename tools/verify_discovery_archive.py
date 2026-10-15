#!/usr/bin/env python3
"""Independently replay the finite domain of a discovery-scan-v1 archive."""
from fractions import Fraction
import hashlib
from itertools import combinations_with_replacement, product
import json
from math import comb
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
GENERATOR = ROOT / "tools/discover_candidates.py"
MAX_BYTES = 1_000_000
SCOPE = "Exact rational arithmetic over this finite grid only; unrefuted is not proved."
CLAIMS = (
    ("median-never-worse", "Median is at least as close as mean for every chosen target."),
    ("mean-never-worse", "Mean is at least as close as median for every chosen target."),
    ("target-independent", "Changing the target cannot reverse a strict winner for fixed readings."),
    ("midpoint-tie", "For distinct estimates, their exact midpoint is an equal-error target."),
    ("permutation-invariant", "Permuting the five readings cannot change the winner at a fixed target."),
)
RATIONAL = re.compile(r"(?:0|[1-9][0-9]*)(?:/[1-9][0-9]*)?\Z")


def fields(value, expected, name):
    if type(value) is not dict or value.keys() != expected:
        raise ValueError(f"Invalid {name} fields")


def grid(raw, limit, name):
    if type(raw) is not list or not 1 <= len(raw) <= limit:
        raise ValueError(f"Invalid {name} size")
    result = []
    for entry in raw:
        if type(entry) is not str or len(entry) > 40 or RATIONAL.fullmatch(entry) is None:
            raise ValueError(f"Invalid {name} rational")
        value = Fraction(entry)
        if str(value) != entry or not 0 <= value <= 100:
            raise ValueError(f"Noncanonical or out-of-range {name} rational")
        result.append(value)
    if result != sorted(set(result)):
        raise ValueError(f"{name} must be strictly increasing")
    return result


def verdict(readings, target):
    mean, median = sum(readings) / 5, sorted(readings)[2]
    mean_error, median_error = abs(mean - target), abs(median - target)
    return "tie" if mean_error == median_error else "mean" if mean_error < median_error else "median"


def point(readings, target):
    return {"readings": [str(value) for value in readings], "target": str(target),
            "mean": str(sum(readings) / 5), "median": str(sorted(readings)[2]),
            "actualWinner": verdict(readings, target)}


def replay(values, targets):
    """Enumerate the registered predicates independently of the generator."""
    checked = {identifier: 0 for identifier, _ in CLAIMS}
    found = {identifier: None for identifier, _ in CLAIMS}
    for readings in combinations_with_replacement(values, 5):
        seen = {}
        for target in targets:
            result = verdict(readings, target)
            for identifier, forbidden in (("median-never-worse", "mean"),
                                           ("mean-never-worse", "median")):
                if found[identifier] is None:
                    checked[identifier] += 1
                    if result == forbidden:
                        found[identifier] = point(readings, target)
            identifier = "target-independent"
            if found[identifier] is None and result != "tie":
                checked[identifier] += 1
                opposite = "median" if result == "mean" else "mean"
                if opposite in seen:
                    found[identifier] = {"readings": [str(value) for value in readings],
                                         "first": point(readings, seen[opposite]),
                                         "second": point(readings, target)}
                seen[result] = target
        mean, median = sum(readings) / 5, sorted(readings)[2]
        identifier = "midpoint-tie"
        if mean != median and found[identifier] is None:
            checked[identifier] += 1
            middle_target = (mean + median) / 2
            if verdict(readings, middle_target) != "tie":
                found[identifier] = point(readings, middle_target)

    # Ordered tuples visit every distinct permutation exactly once overall.
    # This is deliberately a different enumeration from permutations of each
    # sorted multiset in the archive generator.
    identifier = "permutation-invariant"
    for ordered in product(values, repeat=5):
        if found[identifier] is not None:
            break
        baseline = tuple(sorted(ordered))
        for target in targets:
            checked[identifier] += 1
            if verdict(ordered, target) != verdict(baseline, target):
                found[identifier] = {"original": point(baseline, target),
                                     "permuted": point(ordered, target)}
                break
    return [{"id": identifier, "claim": statement,
             "status": "counterexample-found" if found[identifier] else "unrefuted-on-finite-grid",
             "casesChecked": checked[identifier], "counterexample": found[identifier]}
            for identifier, statement in CLAIMS]


def verify(archive):
    fields(archive, {"format", "scope", "sourceSha256", "domain", "candidates"}, "archive")
    if archive["format"] != "inward-discovery-scan-v1" or archive["scope"] != SCOPE:
        raise ValueError("Unsupported archive format or scope")
    if archive["sourceSha256"] != hashlib.sha256(GENERATOR.read_bytes()).hexdigest():
        raise ValueError("Archive generator fingerprint differs from local source")
    domain = archive["domain"]
    fields(domain, {"readingValues", "targetValues", "readingMultisets"}, "domain")
    values = grid(domain["readingValues"], 6, "reading grid")
    targets = grid(domain["targetValues"], 12, "target grid")
    count = comb(len(values) + 4, 5)
    if type(domain["readingMultisets"]) is not int or domain["readingMultisets"] != count:
        raise ValueError("Incorrect reading multiset count")
    candidates = archive["candidates"]
    if type(candidates) is not list or len(candidates) != len(CLAIMS):
        raise ValueError("Incorrect candidate registry")
    expected = replay(values, targets)
    for item, reconstructed in zip(candidates, expected):
        fields(item, {"id", "claim", "status", "casesChecked", "counterexample"}, "candidate")
        if item != reconstructed:
            raise ValueError(f"Candidate {reconstructed['id']} differs from independent finite replay")
    return {"candidates": len(candidates), "readingMultisets": count,
            "statuses": {item["id"]: item["status"] for item in expected}}


def no_duplicates(pairs):
    output = {}
    for key, value in pairs:
        if key in output:
            raise ValueError(f"Duplicate JSON key: {key}")
        output[key] = value
    return output


def main():
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: python3 tools/verify_discovery_archive.py archive.json")
        path = Path(sys.argv[1])
        if path.stat().st_size > MAX_BYTES:
            raise ValueError("Archive too large")
        data = path.read_bytes()
        archive = json.loads(data.decode("utf-8"), object_pairs_hook=no_duplicates,
                             parse_constant=lambda value: (_ for _ in ()).throw(ValueError("Invalid JSON constant")))
        result = verify(archive)
        print(f"Verified {result['candidates']} candidates over {result['readingMultisets']} reading multisets")
        print("Archive SHA-256: " + hashlib.sha256(data).hexdigest())
    except (OSError, ValueError, TypeError, KeyError, UnicodeError, RecursionError) as error:
        print(f"Archive verification failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
