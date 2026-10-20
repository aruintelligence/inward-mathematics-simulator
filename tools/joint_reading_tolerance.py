#!/usr/bin/env python3
"""Independent exact target-tolerance answer and checker for a verified v4 sweep."""
import argparse
from fractions import Fraction
from hashlib import sha256
import json
from pathlib import Path
import re

from joint_reading_threshold import margin_regions
from verify_joint_reading_sweep import audit, unique_object

FORMAT = "inward-joint-reading-target-tolerance-v1"
TARGET = re.compile(r"^(?:0|-?[1-9][0-9]{0,256})(?:/[1-9][0-9]{0,256})?$|"
                    r"^-?(?:0|[1-9][0-9]{0,8})\.[0-9]{1,6}$")


def target_value(raw):
    if type(raw) is not str or len(raw) > 520 or not TARGET.fullmatch(raw):
        raise ValueError("Use an exact integer or fraction, or a decimal with up to six places")
    return Fraction(raw)


def answer(raw, raw_target, raw_threshold):
    # The Python auditor checks the full v4 sweep directly from its original bytes.
    audit(raw)
    receipt = json.loads(raw.decode("utf-8"), object_pairs_hook=unique_object)
    intervals = receipt["inputs"]["targetInterval"]
    t = target_value(raw_target)
    if not Fraction(intervals[0]) <= t <= Fraction(intervals[1]):
        raise ValueError("Target outside the verified sweep interval")
    calculation = margin_regions(raw, raw_threshold)
    required = Fraction(calculation["threshold"])
    pieces = receipt["claim"]["strictPieces"]

    def value(piece, point):
        return Fraction(piece["slope"]) * point + Fraction(piece["intercept"])

    def contains(piece, point):
        return Fraction(piece["from"]) <= point <= Fraction(piece["to"])

    piece = next((item for item in pieces if contains(item, t)), None)
    lead = value(piece, t) if piece else Fraction(0)
    region = next((item for item in calculation["guaranteedRegions"] if
                   Fraction(item["from"]) <= t <= Fraction(item["to"])), None)
    guarantee = None
    if region:
        left, right = Fraction(region["from"]), Fraction(region["to"])
        left_reach, right_reach = t - left, right - t
        radius = min(left_reach, right_reach)

        def cutoff(point):
            match = next((item for item in pieces if item["verdict"] == region["verdict"] and
                          contains(item, point) and value(item, point) == required), None)
            return {"target": str(point), "readings": match["readings"]} if match else None

        guarantee = {"verdict": region["verdict"],
                     "region": {"from": region["from"], "to": region["to"]},
                     "leftReach": str(left_reach), "rightReach": str(right_reach),
                     "symmetricRadius": str(radius),
                     "symmetricInterval": [str(t - radius), str(t + radius)],
                     "leftCutoff": cutoff(left), "rightCutoff": cutoff(right)}
    return {"format": FORMAT, "sourceReceiptSha256": sha256(raw).hexdigest(),
            "target": str(t), "threshold": calculation["threshold"],
            "attainedLead": str(lead), "winner": piece["verdict"] if lead else None,
            "guarantee": guarantee}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt", type=Path, help="verified v4 target sweep")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--target", help="target to inspect; also requires --threshold")
    group.add_argument("--verify", type=Path, help="recheck an exported tolerance answer")
    parser.add_argument("--threshold", help="required positive squared-error lead")
    args = parser.parse_args()
    try:
        raw = args.receipt.read_bytes()
        if len(raw) > 2_000_000:
            raise ValueError("Receipt exceeds 2 MB")
        if args.verify:
            if args.threshold is not None:
                raise ValueError("--threshold is only used with --target")
            answer_bytes = args.verify.read_bytes()
            if len(answer_bytes) > 2_000_000:
                raise ValueError("Answer exceeds 2 MB")
            submitted = json.loads(answer_bytes.decode("utf-8"), object_pairs_hook=unique_object)
            if type(submitted) is not dict or submitted.get("format") != FORMAT:
                raise ValueError("Expected a target-tolerance answer")
            expected = answer(raw, submitted.get("target"), submitted.get("threshold"))
            if submitted != expected:
                raise ValueError("Tolerance, cutoff witness, or source fingerprint does not match")
            print("Exact target tolerance independently verified")
        else:
            if args.threshold is None:
                raise ValueError("--threshold is required with --target")
            print(json.dumps(answer(raw, args.target, args.threshold), indent=2))
    except (OSError, ValueError, TypeError, KeyError, ArithmeticError, RecursionError) as error:
        parser.exit(1, f"Target tolerance rejected: {error}\n")


if __name__ == "__main__":
    main()
