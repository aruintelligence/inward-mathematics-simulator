#!/usr/bin/env python3
"""Render a self-contained, printable report only from an independently checked certificate."""
import argparse
import base64
from fractions import Fraction
import hashlib
from html import escape
import json
from pathlib import Path

from verify_odd_sample_flip import no_duplicates, verify

ROOT = Path(__file__).resolve().parent.parent
EXAMPLE = ROOT / "examples/odd-sample-flip-v1.json"
REPORT = ROOT / "odd-flip-report.html"
COLORS = {"Mean": "#6ce4c4", "Median": "#8dc8f8", "Tie": "#f6c477"}


def safe(value):
    return escape(str(value), quote=True)


def coordinate(value, low="0", high="100"):
    """Approximate screen position; rational labels remain the authority."""
    if low != "0" or high != "100":
        return f"{20 + float((Fraction(value)-Fraction(low))/(Fraction(high)-Fraction(low))) * 960:.3f}"
    return f"{20 + float(Fraction(value)) * 9.6:.3f}"


def card(route, readings, best_index, low="0", high="100"):
    index = route["index"]
    original = readings[index]
    knots = route["knots"]
    width = lambda a, b: (float(Fraction(b)-Fraction(a))*9.6 if low == "0" and high == "100"
                          else float((Fraction(b)-Fraction(a))/(Fraction(high)-Fraction(low)))*960)
    rectangles = "".join(
        f'<rect x="{coordinate(a, low, high)}" y="20" width="{width(a, b):.3f}" '
        f'height="17" fill="{COLORS[status]}"/>'
        for a, b, status in zip(knots, knots[1:], route["intervalWinners"]))
    marker = (f'<line x1="{coordinate(original, low, high)}" x2="{coordinate(original, low, high)}" y1="6" y2="43" '
              'stroke="#fff" stroke-width="3"/>')
    if route["threshold"] is not None:
        marker += (f'<circle cx="{coordinate(route["threshold"], low, high)}" cy="28.5" r="7" '
                   'fill="#f6c477" stroke="#11283a" stroke-width="2"/>')
    intervals = "".join(
        f'<li><code>({safe(a)}, {safe(b)})</code> — {safe(status)} throughout</li>'
        for a, b, status in zip(knots, knots[1:], route["intervalWinners"]))
    verdict = (f'<strong>{safe(route["distance"])} units to tie</strong>'
               f'<span>Boundary {safe(route["threshold"])} · strict opposing witness {safe(route["witness"])}</span>'
               if route["threshold"] is not None else
               f'<strong>No reversal in {safe(low)}–{safe(high)}</strong><span>This reading alone cannot reverse the strict winner.</span>')
    badge = '<span class="best">Nearest route</span>' if index == best_index else ''
    label = (f'Reading {index + 1} starts at {original}. '
             + (f'Tie at {route["threshold"]}; opposing witness {route["witness"]}.'
                if route["threshold"] is not None else 'No strict reversal within the allowed domain.'))
    return (f'<article class="route"><div class="route-head"><div><small>Reading {index + 1:02d} / start {safe(original)}</small>'
            f'<h3>Move reading {index + 1}</h3></div>{badge}</div><div class="route-verdict">{verdict}</div>'
            f'<svg viewBox="0 0 1000 48" role="img" aria-label="{safe(label)}">'
            '<rect x="20" y="20" width="960" height="17" fill="#223a48"/>' + rectangles + marker + '</svg>'
            f'<div class="axis"><span>{safe(low)}</span><span>{safe(high)}</span></div>'
            '<details><summary>Inspect exact winning intervals</summary><ol>' + intervals + '</ol>'
            '<p>Intervals are open. Winner at each boundary is recorded in the downloadable certificate.</p>'
            '</details></article>')


def render(raw):
    """Parse and verify the same exact bytes later embedded in the report."""
    record = json.loads(raw.decode("utf-8"), object_pairs_hook=no_duplicates,
                        parse_constant=lambda value: (_ for _ in ()).throw(ValueError("Invalid JSON constant")))
    verified = verify(record)
    claim, inputs = record["claim"], record["inputs"]
    bounds = inputs.get("bounds", {"low": "0", "high": "100"})
    low, high = bounds["low"], bounds["high"]
    custom = "bounds" in inputs
    best = claim["best"]
    best_index = best["index"] if best else None
    if best:
        headline = f'{safe(best["distance"])} <span>units</span>'
        finding = (f'Nearest tie: move reading {best_index + 1} from {safe(inputs["readings"][best_index])} '
                   f'toward {safe(best["threshold"])}. A strict reversal exists beyond the tie; '
                   f'{safe(best["witness"])} is one checked opposing value.')
    elif claim["kind"] == "baseline-tie":
        headline = 'Baseline <span>tie</span>'
        finding = 'Both estimators start with equal absolute error. No opposite strict baseline winner is defined.'
    else:
        headline = 'No <span>reversal</span>'
        finding = f'No single reading can reverse the current winner within the allowed {safe(low)}–{safe(high)} domain.'
    routes = "\n".join(card(route, inputs["readings"], best_index, low, high) for route in claim["routes"])
    domain_description = f"the interval [{safe(low)},{safe(high)}]" if custom else "every real setting from 0 to 100"
    domain_assumption = f"[{safe(low)},{safe(high)}]" if custom else "[0,100]"
    version = "v2" if custom else "v1"
    fingerprint = hashlib.sha256(raw).hexdigest()
    download = base64.b64encode(raw).decode("ascii")
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Exact odd-sample single-reading reversal certificate and checked research report.">
<title>Odd-Sample Flip | Inward Mathematics™</title>
<style>
:root{{color-scheme:dark light;--bg:#071b28;--panel:#102d3d;--ink:#f3faf7;--muted:#c4d8dc;--line:#668a93;--mint:#6ce4c4;--cyan:#8dc8f8;--gold:#f6c477}}
*{{box-sizing:border-box}}body{{margin:0;min-width:320px;background:radial-gradient(circle at 85% 3%,#1d5360,transparent 35%),var(--bg);color:var(--ink);font:16px/1.55 system-ui,sans-serif}}
.wrap{{width:min(1120px,calc(100% - 34px));margin:auto}}a{{color:var(--mint);text-underline-offset:3px}}a:focus-visible,summary:focus-visible{{outline:3px solid var(--gold);outline-offset:3px}}
header{{border-bottom:1px solid var(--line);padding:20px 0}}header strong{{font-size:.79rem;letter-spacing:.12em}}.hero{{padding:clamp(48px,7vw,88px) 0;display:grid;grid-template-columns:minmax(0,1.3fr) minmax(250px,.7fr);gap:25px;align-items:center}}
.eyebrow{{color:var(--mint);font-size:.73rem;font-weight:850;letter-spacing:.17em;text-transform:uppercase}}h1{{font-size:clamp(2.5rem,6vw,5rem);letter-spacing:-.06em;line-height:1.03;margin:12px 0}}.lede{{max-width:680px;color:var(--muted);font-size:1.08rem}}
.result{{padding:26px;border:1px solid var(--gold);border-radius:20px;background:linear-gradient(145deg,#204a4c,var(--panel))}}.result small{{color:var(--muted);text-transform:uppercase;letter-spacing:.09em;font-weight:800}}.result strong{{display:block;font-size:clamp(2.4rem,5vw,4rem);line-height:1.1;color:var(--gold);overflow-wrap:anywhere}}.result strong span{{font-size:.45em}}.result p{{margin-bottom:0;color:var(--muted)}}
.section{{border-top:1px solid var(--line);padding:42px 0}}h2{{font-size:clamp(1.6rem,3vw,2.4rem);letter-spacing:-.04em;margin:0 0 12px}}.intro{{max-width:830px;color:var(--muted)}}.facts{{display:flex;flex-wrap:wrap;gap:10px;margin:24px 0}}.facts span{{padding:10px 13px;border:1px solid var(--line);border-radius:9px;background:var(--panel);overflow-wrap:anywhere}}
.legend{{display:flex;flex-wrap:wrap;gap:12px 22px;color:var(--muted);font-size:.82rem}}.legend i{{display:inline-block;width:11px;height:11px;margin-right:6px;border-radius:3px;background:var(--mint)}}.legend .median i{{background:var(--cyan)}}.legend .tie i{{background:var(--gold)}}
.routes{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px;margin-top:22px}}.route{{min-width:0;padding:20px;border:1px solid var(--line);border-radius:16px;background:var(--panel)}}.route-head{{display:flex;align-items:start;justify-content:space-between;gap:12px}}.route-head small{{color:var(--muted);text-transform:uppercase;font-size:.71rem;letter-spacing:.1em}}h3{{margin:4px 0 12px;font-size:1.22rem}}.best{{color:#222710;background:var(--gold);border-radius:40px;padding:4px 9px;white-space:nowrap;font-size:.7rem;font-weight:850}}.route-verdict strong{{display:block;color:var(--mint);font-size:1.18rem}}.route-verdict span{{display:block;color:var(--muted);font-size:.82rem}}svg{{display:block;width:100%;height:auto;margin-top:17px;border:1px solid var(--line);border-radius:8px;background:#11283a}}.axis{{display:flex;justify-content:space-between;color:var(--muted);font-size:.72rem}}
details{{margin-top:18px;border-top:1px solid var(--line);padding-top:12px;color:var(--muted);font-size:.84rem}}summary{{cursor:pointer;color:var(--mint);font-weight:800}}details ol{{padding-left:24px}}details li{{padding:3px 0;overflow-wrap:anywhere}}code{{font-family:ui-monospace,SFMono-Regular,monospace}}.provenance{{padding:18px;border-left:3px solid var(--mint);background:var(--panel);overflow-wrap:anywhere}}.provenance code{{display:block;color:var(--mint);margin:7px 0}}footer{{padding:26px 0;border-top:1px solid var(--line);color:var(--muted);font-size:.8rem}}
@media(max-width:760px){{.hero,.routes{{grid-template-columns:1fr}}}}@media(prefers-color-scheme:light){{:root{{--bg:#f4f7f6;--panel:#fff;--ink:#163742;--muted:#405c62;--line:#859fa3;--mint:#006653;--cyan:#09617a;--gold:#745017}}body{{background:radial-gradient(circle at 90% 0%,#e0efea,transparent 38%),var(--bg)}}.result{{background:#f5efe1}}.best{{background:#f6c477}}}}
@media print{{:root{{color-scheme:light;--bg:#fff;--panel:#fff;--ink:#132b32;--muted:#304c51;--line:#9aadb0;--mint:#126153;--gold:#724c18}}body{{background:#fff}}.hero{{padding:18px 0}}.section{{padding:20px 0}}.route{{break-inside:avoid}}svg{{print-color-adjust:exact}}footer{{display:none}}}}
</style></head><body><header><div class="wrap"><strong>ĀRU INTELLIGENCE / INWARD MATHEMATICS™</strong></div></header>
<main class="wrap"><section class="hero"><div><p class="eyebrow">Exact research report / certificate {version}</p><h1>How close is a real reversal?</h1><p class="lede">One reading moves, the others stay fixed. An exact factor-root partition covers {domain_description} for this odd-sized sample.</p></div><aside class="result"><small>Strict reversal infimum</small><strong>{headline}</strong><p>{finding}</p></aside></section>
<section class="section"><p class="eyebrow">01 / Model assumptions</p><h2>Stipulated inputs</h2><p class="intro">{len(inputs["readings"])} readings. Chosen target {safe(inputs["target"])}. Starting winner: {safe(claim["baseline"])}. Only one reading may change at a time; the allowed domain is the continuous real interval {domain_assumption}.</p><div class="facts">{''.join(f'<span>r<sub>{i+1}</sub> = <strong>{safe(v)}</strong></span>' for i,v in enumerate(inputs["readings"]))}</div><p class="intro">A threshold is a tie, not a strict winning move. The exact infimum can be approached from the opposing interval; the recorded witness is an explicit strict reversal.</p></section>
<section class="section"><p class="eyebrow">02 / Exhaustive routes</p><h2>Every movable reading</h2><p class="intro">Colors summarize open intervals. Markers show the original reading (white line) and any nearest tie boundary (gold circle). Position is approximate; exact fractions below and in the certificate carry the result.</p><div class="legend"><span><i></i>Mean wins</span><span class="median"><i></i>Median wins</span><span class="tie"><i></i>Tie interval or boundary</span></div><div class="routes">{routes}</div></section>
<section class="section"><p class="eyebrow">03 / Reproduce</p><h2>Take the evidence with you</h2><p class="intro">The embedded download contains the exact bytes checked by the independent Python verifier. Its fingerprint identifies matching bytes; it does not authenticate their source or establish that the inputs reflect real measurements.</p><div class="provenance">Certificate SHA-256: <code>{fingerprint}</code><a href="data:application/json;base64,{download}" download="odd-sample-flip-certificate.json">Download checked JSON certificate</a><p>Run <code>python3 tools/verify_odd_sample_flip.py odd-sample-flip-certificate.json</code> using the repository checker. Verified status: {safe(verified["kind"])}.</p></div></section></main>
<footer><div class="wrap">Developed by Daniel Jacob Read IV / ĀRU Intelligence Inc. with Shane Travis Horman. MIT license. Exact result under stated assumptions; no empirical or commercial validation is claimed.</div></footer></body></html>
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("certificate", nargs="?", type=Path, default=EXAMPLE)
    parser.add_argument("--output", type=Path, default=REPORT)
    parser.add_argument("--check", action="store_true", help="fail if the saved report differs")
    args = parser.parse_args()
    try:
        if args.certificate.stat().st_size > 2_000_000:
            raise ValueError("Certificate too large")
        raw = args.certificate.read_bytes()
        page = render(raw)
        if args.check:
            if args.output.read_text(encoding="utf-8") != page:
                raise ValueError("Report is stale; regenerate it from the checked certificate")
            print("Report matches independently checked certificate")
        else:
            args.output.write_text(page, encoding="utf-8")
            print(f"Wrote {args.output}")
    except (OSError, ValueError, TypeError, KeyError, UnicodeError, ArithmeticError, RecursionError) as error:
        parser.exit(1, f"Report failed: {error}\n")


if __name__ == "__main__":
    main()
