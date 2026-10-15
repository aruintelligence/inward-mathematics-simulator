#!/usr/bin/env python3
"""Independently replay an inward-conjecture-experiment-v1 finite search."""
from fractions import Fraction
from itertools import combinations_with_replacement
import hashlib
import json
from math import comb
from pathlib import Path
import re
import sys

FORMAT = "inward-conjecture-experiment-v1"
SCOPE = "Exact rational finite-grid search only; unrefuted is not proved."
CLAIMS = (
    ("median-never-worse", "Median is at least as close as mean for every chosen target."),
    ("mean-never-worse", "Mean is at least as close as median for every chosen target."),
    ("target-independent", "Changing the target cannot reverse a strict winner for fixed readings."),
    ("midpoint-tie", "For distinct estimates, their exact midpoint is an equal-error target."),
)
RATIONAL = re.compile(r"(?:0|[1-9][0-9]{0,8})(?:/[1-9][0-9]{0,8})?\Z")


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def fields(value, names, label):
    if type(value) is not dict or value.keys() != names:
        raise ValueError(f"Invalid {label} fields")


def grid(raw, maximum, label):
    if type(raw) is not list or not 2 <= len(raw) <= maximum:
        raise ValueError(f"Invalid {label} size")
    values = []
    for entry in raw:
        if type(entry) is not str or RATIONAL.fullmatch(entry) is None:
            raise ValueError(f"Invalid {label} rational")
        value = Fraction(entry)
        if str(value) != entry or not 0 <= value <= 100:
            raise ValueError(f"Noncanonical or out-of-range {label} rational")
        values.append(value)
    if values != sorted(set(values)):
        raise ValueError(f"{label} must be sorted and distinct")
    return values


def verdict(mean, median, target):
    first, second = abs(mean - target), abs(median - target)
    return "tie" if first == second else "mean" if first < second else "median"


def replay(values, targets):
    checked = {identifier: 0 for identifier, _ in CLAIMS}
    found = {identifier: None for identifier, _ in CLAIMS}
    for readings in combinations_with_replacement(values, 5):
        mean, median = sum(readings) / 5, readings[2]

        def point(target):
            return {"readings": [str(x) for x in readings], "target": str(target),
                    "mean": str(mean), "median": str(median),
                    "actualWinner": verdict(mean, median, target)}

        strict_seen = {}
        for target in targets:
            outcome = verdict(mean, median, target)
            for identifier, forbidden in (("median-never-worse", "mean"),
                                           ("mean-never-worse", "median")):
                if found[identifier] is None:
                    checked[identifier] += 1
                    if outcome == forbidden:
                        found[identifier] = point(target)
            identifier = "target-independent"
            if found[identifier] is None and outcome != "tie":
                checked[identifier] += 1
                opposite = "median" if outcome == "mean" else "mean"
                if opposite in strict_seen:
                    found[identifier] = {"readings": [str(x) for x in readings],
                                         "first": point(strict_seen[opposite]),
                                         "second": point(target)}
                strict_seen[outcome] = target
        identifier = "midpoint-tie"
        if found[identifier] is None and mean != median:
            checked[identifier] += 1
            midpoint = (mean + median) / 2
            if verdict(mean, median, midpoint) != "tie":
                found[identifier] = point(midpoint)
    return [{"id": identifier, "claim": statement,
             "status": "counterexample-found" if found[identifier] else "unrefuted-on-finite-grid",
             "casesChecked": checked[identifier], "counterexample": found[identifier]}
            for identifier, statement in CLAIMS]


def verify(report):
    fields(report, {"format", "scope", "domain", "candidates"}, "experiment")
    if report["format"] != FORMAT or report["scope"] != SCOPE:
        raise ValueError("Unsupported experiment format or scope")
    domain = report["domain"]
    fields(domain, {"readingValues", "targetValues", "readingMultisets"}, "domain")
    values = grid(domain["readingValues"], 6, "reading grid")
    targets = grid(domain["targetValues"], 12, "target grid")
    count = comb(len(values) + 4, 5)
    if type(domain["readingMultisets"]) is not int or domain["readingMultisets"] != count:
        raise ValueError("Incorrect reading multiset count")
    actual = report["candidates"]
    if type(actual) is not list or len(actual) != len(CLAIMS):
        raise ValueError("Invalid candidate list")
    for candidate, expected in zip(actual, replay(values, targets)):
        fields(candidate, {"id", "claim", "status", "casesChecked", "counterexample"}, "candidate")
        if type(candidate["casesChecked"]) is not int or candidate != expected:
            raise ValueError(f"Incorrect independent replay for {expected['id']}")
    return {"readingMultisets": count, "counterexamples": sum(x["counterexample"] is not None for x in actual)}


def main():
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: python3 tools/verify_conjecture_experiment.py experiment.json")
        path = Path(sys.argv[1])
        if path.stat().st_size > 1_000_000:
            raise ValueError("Experiment exceeds 1 MB")
        data = path.read_bytes()
        report = json.loads(data.decode("utf-8"), object_pairs_hook=no_duplicates,
                            parse_constant=lambda x: (_ for _ in ()).throw(ValueError("Invalid JSON constant")))
        result = verify(report)
        print(f"Replayed {result['readingMultisets']} exact five-reading multisets; "
              f"{result['counterexamples']} counterexamples")
        print("Experiment SHA-256: " + hashlib.sha256(data).hexdigest())
    except (OSError, ValueError, TypeError, KeyError, UnicodeError, RecursionError) as error:
        print(f"Experiment verification failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
