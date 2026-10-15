#!/usr/bin/env python3
"""Render the static Discovery Archive only from independently checked data."""
import argparse
from fractions import Fraction
import hashlib
from html import escape
import json
from pathlib import Path
import sys

from verify_discovery_archive import verify
from verify_estimator_identities import load_record as load_identities, verify as verify_identities

ROOT = Path(__file__).resolve().parent.parent
ARCHIVE = ROOT / "examples/discovery-scan-v1.json"
IDENTITIES = ROOT / "examples/estimator-identities-v1.json"
TEMPLATE = ROOT / "tools/discovery-page.template.html"
OUTPUT = ROOT / "discovery.html"


def safe(value):
    return escape(str(value), quote=True)


def position(value):
    """SVG placement only; exact values are printed separately."""
    return f"{30 + 9.4 * float(Fraction(value)):.3f}"


def point_panel(witness, label):
    readings = witness["readings"]
    stacked = {}
    dots = []
    for value in readings:
        height = stacked.get(value, 0)
        dots.append(f'<circle cx="{position(value)}" cy="{83 - 10 * height}" r="6" fill="#fa9fab"/>')
        stacked[value] = height + 1
    markers = "".join(
        f'<line x1="{position(witness[key])}" x2="{position(witness[key])}" '
        f'y1="13" y2="74" stroke="{color}" stroke-width="3"/>'
        for key, color in (("mean", "#91daf0"), ("median", "#65e7c0"), ("target", "#f8ca80")))
    description = (f"Readings {', '.join(readings)}; mean {witness['mean']}; "
                   f"median {witness['median']}; target {witness['target']}")
    winner = witness["actualWinner"]
    outcome = "Both errors are equal" if winner == "tie" else winner.capitalize() + " is strictly closer"
    return (f'<div class="witness"><h3>{safe(label)}</h3>'
            '<ol class="reading-list" aria-label="Five exact readings">' +
            "".join(f"<li>{safe(value)}</li>" for value in readings) + "</ol>" +
            f'<svg class="plot" viewBox="0 0 1000 100" role="img" aria-label="{safe(description)}">'
            '<line x1="30" y1="83" x2="970" y2="83" stroke="#7aa7ab" stroke-width="2"/>'
            + markers + "".join(dots) + '</svg><div class="legend"><span><i></i>Readings</span>'
            '<span class="mean"><i></i>Mean</span><span class="median"><i></i>Median</span>'
            '<span class="target"><i></i>Target</span></div><div class="facts">'
            + "".join(f'<span>{safe(key.capitalize())}<strong>{safe(witness[key])}</strong></span>'
                      for key in ("target", "mean", "median")) +
            f'</div><p class="verdict">{safe(outcome)} at target {safe(witness["target"])}.</p></div>')


def candidate_card(item, index):
    counterexample = item["counterexample"]
    status = item["status"]
    label = "Counterexample found" if counterexample else "Unrefuted on finite grid"
    if item["id"] == "target-independent":
        evidence = ('<p>The same five readings reverse the strict winner when only the target changes.</p>'
                    '<div class="witnesses">' + point_panel(counterexample["first"], "First target") +
                    point_panel(counterexample["second"], "Second target") + '</div>')
    elif counterexample:
        evidence = ('<p>One exact witness disproves this universal claim in the five-reading model.</p>'
                    '<div class="witnesses">' + point_panel(counterexample, "Exact counterexample") + '</div>')
    else:
        detail = ("For each distinct-estimate multiset, the exact midpoint was checked. "
                  "The separate squared-error factorization supplies a general mathematical argument."
                  if item["id"] == "midpoint-tie" else
                  "Every ordered five-reading tuple on this grid was compared with its sorted readings at each target.")
        evidence = ('<div class="finite"><strong>No counterexample on this grid.</strong>'
                    f'<p>{safe(detail)} This status alone is not a proof over all real values.</p></div>')
    return (f'<details class="candidate" id="{safe(item["id"])}" '
            f'data-status="{safe(status)}"{(" open" if index == 0 else "")}> '
            f'<summary><small>Candidate {index+1:02d} · {item["casesChecked"]:,} cases checked</small>'
            f'<strong>{safe(item["claim"])}</strong><span class="badge">{safe(label)}</span></summary>'
            f'<div class="candidate-body">{evidence}</div></details>')


def render_page(archive):
    verify(archive)
    # The general-proof panel must never be published from unchecked proof data.
    proof_record, proof_bytes = load_identities(IDENTITIES)
    verified_identities = verify_identities(proof_record)
    template = TEMPLATE.read_text(encoding="utf-8")
    substitutions = {
        "@@MULTISETS@@": str(archive["domain"]["readingMultisets"]),
        "@@READINGS@@": ", ".join(map(safe, archive["domain"]["readingValues"])),
        "@@TARGETS@@": ", ".join(map(safe, archive["domain"]["targetValues"])),
        "@@SOURCE_SHA@@": safe(archive["sourceSha256"]),
        "@@PERMUTATIONS@@": str(verified_identities["formalIndexPermutations"]),
        "@@IDENTITY_SHA@@": hashlib.sha256(proof_bytes).hexdigest(),
        "@@CARDS@@": "\n".join(candidate_card(item, index)
                               for index, item in enumerate(archive["candidates"])),
    }
    for marker, content in substitutions.items():
        if template.count(marker) != 1:
            raise ValueError(f"Missing or repeated template marker: {marker}")
        template = template.replace(marker, content)
    return template


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if the checked-in HTML differs from the archive")
    args = parser.parse_args()
    try:
        if ARCHIVE.stat().st_size > 1_000_000:
            raise ValueError("Archive too large")
        output = render_page(json.loads(ARCHIVE.read_text(encoding="utf-8")))
        if args.check:
            if OUTPUT.read_text(encoding="utf-8") != output:
                raise ValueError("Discovery page is stale; rerun python3 tools/render_discovery_page.py")
            print("Discovery page matches independently verified archive and identity record")
        else:
            OUTPUT.write_text(output, encoding="utf-8")
            print(f"Wrote {OUTPUT.name} from five checked candidates and an identity record")
    except (OSError, ValueError, KeyError, TypeError, UnicodeError) as error:
        parser.exit(1, f"Discovery page failed: {error}\n")


if __name__ == "__main__":
    main()
