#!/usr/bin/env python3
"""Exact target regions with a required Mean/Median squared-error lead."""
import argparse
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import re

from render_joint_reading_sweep_report import check

FORMAT = "inward-joint-reading-margin-regions-v1"
THRESHOLD = re.compile(r"^(?:0|[1-9][0-9]{0,18})(?:/[1-9][0-9]{0,18})?$|"
                       r"^(?:0|[1-9][0-9]{0,12})\.[0-9]{1,6}$")


def margin_regions(raw, raw_threshold):
    receipt, verified = check(raw)
    if type(raw_threshold) is not str or len(raw_threshold) > 520 or not THRESHOLD.fullmatch(raw_threshold):
        raise ValueError("Use a positive integer, fraction, or decimal with up to six places")
    threshold = Fraction(raw_threshold)
    if threshold <= 0:
        raise ValueError("Required lead must be positive")
    segments = verified["strictPieces"]
    spans = []
    for piece in segments:
        low, high = Fraction(piece["from"]), Fraction(piece["to"])
        slope, intercept = Fraction(piece["slope"]), Fraction(piece["intercept"])
        value = lambda t: slope * t + intercept
        if slope < 0:
            if value(low) < threshold:
                continue
            start = low
            end = high if value(high) >= threshold else (threshold - intercept) / slope
        else:
            if value(high) < threshold:
                continue
            start = low if value(low) >= threshold else (threshold - intercept) / slope
            end = high
        if spans and spans[-1]["verdict"] == piece["verdict"] and Fraction(spans[-1]["to"]) >= start:
            spans[-1]["to"] = str(max(Fraction(spans[-1]["to"]), end))
        else:
            spans.append({"from": str(start), "to": str(end), "verdict": piece["verdict"]})

    for span in spans:
        witness = None
        for endpoint in (span["from"], span["to"]):
            t = Fraction(endpoint)
            for piece in segments:
                if (piece["verdict"] == span["verdict"] and
                    Fraction(piece["from"]) <= t <= Fraction(piece["to"]) and
                    Fraction(piece["slope"]) * t + Fraction(piece["intercept"]) == threshold):
                    witness = {"target": endpoint, "readings": piece["readings"]}
                    break
            if witness is not None:
                break
        span["thresholdBoundary"] = witness
    return {"format": FORMAT, "sourceReceiptSha256": hashlib.sha256(raw).hexdigest(),
            "threshold": str(threshold), "guaranteedRegions": spans}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt", type=Path, help="independently verified v4 target sweep")
    parser.add_argument("--threshold", required=True, help="required positive squared-error lead")
    args = parser.parse_args()
    try:
        print(json.dumps(margin_regions(args.receipt.read_bytes(), args.threshold),
                         ensure_ascii=False, indent=2))
    except (OSError, ValueError, TypeError, KeyError, ArithmeticError) as error:
        parser.exit(1, f"Margin region query failed: {error}\n")


if __name__ == "__main__":
    main()
