#!/usr/bin/env python3
"""Cross-check independent INWARD proof verifiers against receipt fixtures.

Usage: python3 tools/differential_verify.py path/to/receipt.json [more.json ...]
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
MAX_BYTES = 1_000_000


def run(command, receipt):
    return subprocess.run(command + [str(receipt)], cwd=ROOT, capture_output=True,
                          text=True, timeout=30, check=False)


def check(receipt):
    receipt = Path(receipt).resolve()
    if not receipt.is_file() or receipt.stat().st_size > MAX_BYTES:
        raise ValueError("Missing or oversized receipt")
    raw = receipt.read_bytes()
    raw.decode("utf-8", errors="strict")
    expected_hash = hashlib.sha256(raw).hexdigest()
    node = run(["node", "tools/verify-target-lens.cjs"], receipt)
    python = run([sys.executable, "tools/verify_target_lens.py"], receipt)
    if (node.returncode == 0) != (python.returncode == 0):
        raise AssertionError(f"Verifier acceptance disagreement: {receipt}\nNODE: {node.stderr}\nPY: {python.stderr}")
    if node.returncode == 0:
        for result in (node, python):
            if expected_hash not in result.stdout:
                raise AssertionError(f"Missing matching fingerprint: {receipt}")
        verdict_node = node.stdout.splitlines()[0]
        verdict_python = python.stdout.splitlines()[0]
        if verdict_node != verdict_python:
            raise AssertionError(f"Verdict mismatch: {verdict_node!r} != {verdict_python!r}")
    print(f"{'PASS' if node.returncode == 0 else 'REJECT'} {receipt.name} {expected_hash[:12]}")


def main():
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    try:
        for name in sys.argv[1:]:
            check(name)
    except (OSError, ValueError, AssertionError, subprocess.TimeoutExpired) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
