#!/usr/bin/env python3
"""Seeded cross-language verification for Target Lens proof receipts.

Usage: python3 tools/differential_verify.py --seed 620810 --cases 64
Pass receipt paths instead to compare the two CLI checkers on local files.
Any disagreement writes a single-receipt reproduction to artifacts/differential/.
"""
import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parent.parent
MAX_BYTES = 1_000_000
SCALE = 1_000_000
LIMIT = 100 * SCALE
GENERATOR = """
const fs = require('node:fs');
const {proofReceipt} = require('./target-lens.js');
const cases = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(cases.map(c => proofReceipt(
  c.readings.map(v => v / 1e6), c.low / 1e6, c.high / 1e6,
  c.drift / 1e6, c.target / 1e6))));
"""


def run(command, receipt):
    return subprocess.run(command + [str(receipt)], cwd=ROOT, capture_output=True,
                          text=True, timeout=30, check=False)


def generated_cases(seed, count):
    """Exercise clipping, singleton intervals, ties, and deterministic boxes."""
    def case(readings, low, high, drift, target):
        return dict(readings=[v * SCALE for v in readings],
                    low=low * SCALE, high=high * SCALE,
                    drift=drift * SCALE, target=target * SCALE)

    inputs = [
        case([0] * 5, 0, 0, 0, 0),
        case([100] * 5, 100, 100, 0, 100),
        case([48, 49, 50, 51, 85], 0, 1, 4, 0),
        case([48, 49, 50, 51, 85], 48, 52, 4, 50),
        case([0, 0, 50, 100, 100], 48, 52, 0, 50),
        case([0, 0, 50, 100, 100], 50, 50, 100, 50),
        case([0, 0, 0, 100, 100], 0, 100, 0, 50),
        case([25] * 5, 25, 25, 0, 25),
    ]
    state = seed & 0xFFFFFFFF

    def next_value():
        nonlocal state
        state = (1664525 * state + 1013904223) & 0xFFFFFFFF
        return state

    for _ in range(count):
        readings = [(next_value() % 1_000_001) * 100 for _ in range(5)]
        a, b = next_value() % (LIMIT + 1), next_value() % (LIMIT + 1)
        inputs.append(dict(readings=readings, low=min(a, b), high=max(a, b),
                           drift=next_value() % (LIMIT + 1),
                           target=next_value() % (LIMIT + 1)))

    result = subprocess.run(["node", "-e", GENERATOR], cwd=ROOT,
                            input=json.dumps(inputs), text=True, capture_output=True,
                            timeout=30, check=False)
    if result.returncode:
        raise RuntimeError("Receipt generator failed: " + result.stderr)
    receipts = json.loads(result.stdout)
    if len(receipts) != len(inputs):
        raise RuntimeError("Receipt generator returned the wrong number of cases")
    return receipts


def corrupt(receipt, index):
    item = deepcopy(receipt)
    inputs, claim = item["inputs"], item["claim"]
    mutation = index % 8
    if mutation == 0:
        claim["estimateRange"][0] -= 1
    elif mutation == 1:
        claim["referenceRange"][1] += 1
    elif mutation == 2:
        claim["tieTargets"]["upperNumerator"] += 1
    elif mutation == 3:
        claim["kind"] = "unproved"
    elif mutation == 4:
        inputs["readings"][0] = -1
    elif mutation == 5:
        inputs["low"], inputs["high"] = LIMIT, 0
    elif mutation == 6:
        claim["witness"] = {}
    else:
        item["format"] = "unknown-format"
    return item


def reproduction(raw, label, directory):
    directory.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(raw).hexdigest()[:16]
    location = directory / f"repro-{digest}.json"
    location.write_bytes(raw)
    print(f"Disagreement in {label}; one-case reproduction: {location}", file=sys.stderr)


def check_bytes(raw, label, expected, directory, temporary):
    if len(raw) > MAX_BYTES:
        raise ValueError(f"Oversized receipt: {label}")
    receipt = temporary / "receipt.json"
    receipt.write_bytes(raw)
    node = run(["node", "tools/verify-target-lens.cjs"], receipt)
    python = run([sys.executable, "tools/verify_target_lens.py"], receipt)
    accepted = [node.returncode == 0, python.returncode == 0]
    digest = hashlib.sha256(raw).hexdigest()
    problem = None
    if accepted[0] != accepted[1]:
        problem = "verifier acceptance disagreement"
    elif expected is not None and accepted[0] != expected:
        problem = f"expected {'acceptance' if expected else 'rejection'}"
    elif accepted[0]:
        if any("Receipt SHA-256: " + digest not in result.stdout for result in (node, python)):
            problem = "fingerprint disagreement"
        elif node.stdout.splitlines()[0] != python.stdout.splitlines()[0]:
            problem = "verdict disagreement"
    if problem:
        reproduction(raw, label, directory)
        raise AssertionError(f"{problem}: {label}\nNode: {node.stdout}{node.stderr}\n"
                             f"Python: {python.stdout}{python.stderr}")
    return accepted[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipts", nargs="*", type=Path, help="Optional local JSON receipts")
    parser.add_argument("--seed", type=int, default=620810)
    parser.add_argument("--cases", type=int, default=64, help="Random boxes in addition to eight boundaries")
    parser.add_argument("--repro-dir", type=Path, default=ROOT / "artifacts/differential")
    args = parser.parse_args()
    if not 0 <= args.cases <= 5000:
        parser.error("--cases must be between 0 and 5000")
    try:
        with TemporaryDirectory(prefix="inward-differential-") as directory:
            temporary = Path(directory)
            if args.receipts:
                results = [check_bytes(path.read_bytes(), str(path), None,
                                       args.repro_dir, temporary) for path in args.receipts]
            else:
                receipts = generated_cases(args.seed, args.cases)
                results = []
                for index, receipt in enumerate(receipts):
                    source = (json.dumps(receipt, separators=(",", ":")) + "\n").encode("utf-8")
                    results.append(check_bytes(source, f"valid case {index}", True,
                                               args.repro_dir, temporary))
                    tampered = (json.dumps(corrupt(receipt, index), separators=(",", ":")) + "\n").encode("utf-8")
                    results.append(check_bytes(tampered, f"corrupt case {index}", False,
                                               args.repro_dir, temporary))
                crlf = (json.dumps(receipts[0], indent=2).replace("\n", "\r\n") + "\r\n").encode("utf-8")
                results.append(check_bytes(crlf, "CRLF fingerprint", True,
                                           args.repro_dir, temporary))
                canonical = json.dumps(receipts[0], separators=(",", ":"))
                numeric_scale = canonical.replace('"scale":1000000', '"scale":1000000.0', 1)
                numeric_range = canonical.replace('"estimateRange":[0,0]', '"estimateRange":[0.0,0]', 1)
                if numeric_scale == canonical or numeric_range == canonical:
                    raise RuntimeError("Missing numeric encoding regression fixture")
                reordered = deepcopy(receipts[0])
                reordered["claim"]["tieTargets"] = dict(reversed(list(reordered["claim"]["tieTargets"].items())))
                for label, source in (("integral decimal scale", numeric_scale),
                                      ("integral decimal range", numeric_range),
                                      ("reordered JSON keys", json.dumps(reordered))):
                    results.append(check_bytes(source.encode("utf-8"), label, True,
                                               args.repro_dir, temporary))
                nonfinite = canonical[:-1] + ',"metadata":NaN}'
                results.append(check_bytes(nonfinite.encode("utf-8"), "nonfinite JSON constant", False,
                                           args.repro_dir, temporary))
                for label, source in (("invalid UTF-8", b"\xff{}"), ("malformed JSON", b"{")):
                    results.append(check_bytes(source, label, False, args.repro_dir, temporary))
        print(f"Differential gate passed: {sum(results)} accepted, "
              f"{len(results) - sum(results)} rejected; seed={args.seed}")
    except (OSError, ValueError, AssertionError, RuntimeError, subprocess.TimeoutExpired) as error:
        print(f"Differential gate failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
