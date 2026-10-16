#!/usr/bin/env python3
"""Compare the Lean-certified route table with the real builder and verifier.

Usage: python3 tools/check_registered_routes.py /path/to/lean-export.tsv
The table is emitted by `cd formal && lake env lean --run ExportRegisteredRoutes.lean`.
"""
from itertools import product
from pathlib import Path
import subprocess
import sys

from verify_conditional_claim import CONDITIONS, PREDICTIONS, algebraic_proof, endpoint_refutation

ROOT = Path(__file__).resolve().parent.parent
ALLOWED = {"proved", "one-high:0", "one-high:100", "one-low:0", "one-low:100"}
EXPECTED = set(product(CONDITIONS, PREDICTIONS))


def parse_routes(raw, source):
    routes = {}
    for line_number, line in enumerate(raw.splitlines(), 1):
        fields = line.split("\t")
        if len(fields) != 3:
            raise ValueError(f"{source} line {line_number}: expected three tab-separated fields")
        condition, prediction, route = fields
        key = condition, prediction
        if key not in EXPECTED or route not in ALLOWED or key in routes:
            raise ValueError(f"{source} line {line_number}: unknown, duplicate, or invalid route {line!r}")
        routes[key] = route
    if routes.keys() != EXPECTED:
        raise ValueError(f"{source}: missing {sorted(EXPECTED - routes.keys())}")
    return routes


def verifier_routes(count):
    routes = {}
    for condition, prediction in EXPECTED:
        if algebraic_proof(condition, prediction) is not None:
            routes[condition, prediction] = "proved"
        else:
            witness = endpoint_refutation(condition, prediction, count)["construction"]
            routes[condition, prediction] = f'{witness["family"]}:{witness["target"]}'
    return routes


def compare(expected, actual, source):
    differences = [(c, p, expected[c, p], actual[c, p]) for c, p in sorted(EXPECTED)
                   if expected[c, p] != actual[c, p]]
    if differences:
        raise ValueError(f"{source} differs from Lean (condition, prediction, Lean, runtime): {differences}")


def main(path):
    lean = parse_routes(path.read_text(encoding="utf-8"), "Lean export")
    if sum(route == "proved" for route in lean.values()) != 4:
        raise ValueError("Lean export must contain four established cells")
    for count in range(3, 8):
        result = subprocess.run(["node", str(ROOT / "tools/export_browser_routes.cjs"), str(count)],
                                cwd=ROOT, text=True, capture_output=True, check=True)
        browser = parse_routes(result.stdout, f"browser builder at n={count}")
        compare(lean, browser, f"browser builder at n={count}")
        compare(lean, verifier_routes(count), f"Python verifier at n={count}")
    print("20 formal routes agree with browser and Python for all five supported sizes (3–7).")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: check_registered_routes.py LEAN_EXPORT.tsv")
    try:
        main(Path(sys.argv[1]))
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit(f"Route parity failed: {error}") from error
