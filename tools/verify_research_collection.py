#!/usr/bin/env python3
"""Independently recheck every exact receipt in an INWARD research collection."""
import hashlib
import json
from pathlib import Path
import re
import sys

import verify_conditional_claim as claim
import verify_odd_target_box as box

FORMAT = "inward-research-collection-v1"
MAX_BYTES = 10_000_000
FINGERPRINT = re.compile(r"[0-9a-f]{64}\Z")


def reject_constant(_value):
    raise ValueError("Invalid JSON number")


def reject_float(_value):
    raise ValueError("Noninteger JSON number")


def parse(source):
    return json.loads(source, object_pairs_hook=box.no_duplicates,
                      parse_constant=reject_constant, parse_float=reject_float)


def fields(value, names, label):
    if type(value) is not dict or value.keys() != names:
        raise ValueError(f"Invalid {label} fields")


def verify(data):
    if type(data) is not bytes or len(data) > MAX_BYTES:
        raise ValueError("Collection must be UTF-8 JSON no larger than 10 MB")
    bundle = parse(data.decode("utf-8"))
    fields(bundle, {"format", "records"}, "collection")
    if bundle["format"] != FORMAT or type(bundle["records"]) is not list or \
            not 1 <= len(bundle["records"]) <= 100:
        raise ValueError("Invalid collection format or record count")
    previous = ""
    results = []
    for item in bundle["records"]:
        fields(item, {"digest", "kind", "label", "source"}, "collection entry")
        digest, kind, label, source = (item[name] for name in ("digest", "kind", "label", "source"))
        if type(digest) is not str or FINGERPRINT.fullmatch(digest) is None or \
                digest <= previous or type(label) is not str or \
                not label.strip() or len(label.encode("utf-16-le", "surrogatepass")) // 2 > 100 or \
                kind not in ("target-box", "conditional-claim") or type(source) is not str:
            raise ValueError("Invalid or unsorted collection entry")
        raw = source.encode("utf-8")
        if len(raw) > (1_000_000 if kind == "conditional-claim" else 2_000_000):
            raise ValueError("Embedded receipt exceeds its format limit")
        if hashlib.sha256(raw).hexdigest() != digest:
            raise ValueError("Embedded receipt fingerprint mismatch")
        receipt = parse(source)
        accepted = claim.FORMATS if kind == "conditional-claim" else (box.FORMAT,)
        if type(receipt) is not dict or receipt.get("format") not in accepted:
            raise ValueError("Stored kind does not match receipt format")
        if kind == "conditional-claim":
            status, count = claim.verify(receipt)
            results.append((digest, kind, status, count))
        else:
            result = box.verify(receipt)
            results.append((digest, kind, "/".join(result["reachable"]), result["routes"]))
        previous = digest
    return results


def main():
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: python3 tools/verify_research_collection.py collection.json")
        path = Path(sys.argv[1])
        if path.stat().st_size > MAX_BYTES:
            raise ValueError("Collection exceeds 10 MB")
        data = path.read_bytes()
        results = verify(data)
        for digest, kind, status, count in results:
            print(f"{digest} {kind}: {status}; {count} " +
                  ("eligible exact cases" if kind == "conditional-claim" else "exact routes"))
        print(f"Verified {len(results)} research records")
        print("Collection SHA-256: " + hashlib.sha256(data).hexdigest())
    except (OSError, ValueError, TypeError, KeyError, UnicodeError, ArithmeticError,
            RecursionError) as error:
        print(f"Collection verification failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
