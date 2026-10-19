#!/usr/bin/env python3
"""Render a portable target-horizon report from independently verified v6 JSON."""
import argparse
import base64
from fractions import Fraction
import hashlib
from html import escape
import json
from pathlib import Path

from verify_odd_target_box import HORIZON_FORMAT, estimators, no_duplicates, verify

ROOT = Path(__file__).resolve().parent.parent
EXAMPLE = ROOT / "examples/target-horizon-v6.json"
REPORT = ROOT / "target-horizon-report.html"
SOURCE = "https://github.com/aruintelligence/inward-mathematics-simulator"
# Pinned to the checked six-reading theorem. A different receipt is never
# described as having been parsed or proven by Lean.
FORMAL_COMMIT = "8ea5c661b0cb2495a0d2358c3427b314d340a49e"


def safe(value):
    return escape(str(value), quote=True)


def position(value, low, high):
    """Only SVG geometry is approximate; the adjacent fraction labels are exact."""
    return f"{20 + 880 * float((Fraction(value) - low) / (high - low)):.3f}"


def route_card(route, original, movement, low, high, common, low_routes, high_routes):
    index = route["index"]
    first = route["targetHorizon"]["atMovementLow"]
    last = route["targetHorizon"]["atMovementHigh"]
    start, finish, anchor = (position(value, low, high) for value in (first, last, common))
    labels = []
    if index in low_routes:
        labels.append('<span class="tag">Lower boundary</span>')
    if index in high_routes:
        labels.append('<span class="tag">Upper boundary</span>')
    tie = route["targetHorizon"]["allTargetTie"]
    if tie is not None:
        labels.append('<span class="tag tie-tag">Equal estimates</span>')
    equality = (f'<p class="route-note">At moved reading <strong>{safe(tie)}</strong>, '
                'Mean equals Median for every target.</p>' if tie is not None else '')
    aria = (f'Reading {index + 1}, midpoint target from {first} to {last}; '
            f'common original-sample midpoint {common}.')
    return f'''<article class="route">
<div class="route-title"><div><span class="overline">Route {index + 1:02d} / starts at {safe(original)}</span>
<h3>Move reading {index + 1}</h3></div><div class="tags">{''.join(labels)}</div></div>
<figure><svg viewBox="0 0 920 40" role="img" aria-label="{safe(aria)}">
<line x1="20" x2="900" y1="20" y2="20" stroke="var(--track)" stroke-width="8" stroke-linecap="round"/>
<line x1="{start}" x2="{finish}" y1="20" y2="20" stroke="var(--mint)" stroke-width="9" stroke-linecap="round"/>
<line x1="{anchor}" x2="{anchor}" y1="4" y2="36" stroke="var(--gold)" stroke-width="2"/>
<circle cx="{start}" cy="20" r="5" fill="var(--mint)"/>
<circle cx="{finish}" cy="20" r="5" fill="var(--mint)"/></svg>
<figcaption><span>At x = {safe(movement['low'])}: <strong>{safe(first)}</strong></span>
<span>At x = {safe(movement['high'])}: <strong>{safe(last)}</strong></span></figcaption></figure>{equality}</article>'''


def render(raw):
    """Verify the very bytes embedded in the report before producing HTML."""
    if len(raw) > 2_000_000:
        raise ValueError("Certificate too large")
    record = json.loads(raw.decode("utf-8"), object_pairs_hook=no_duplicates,
                        parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Invalid JSON constant")))
    if type(record) is not dict or record.get("format") != HORIZON_FORMAT:
        raise ValueError("A v6 target-horizon certificate is required")
    verified = verify(record)
    inputs, claim = record["inputs"], record["claim"]
    horizon = verified["targetHorizon"]
    low, high = Fraction(horizon["low"]), Fraction(horizon["high"])
    readings = list(map(Fraction, inputs["readings"]))
    mean, median = estimators(readings[1:], readings[0])
    common = (mean + median) / 2
    movement = inputs["movement"]
    low_routes = {route["index"] for route in claim["routes"]
                  if Fraction(route["targetHorizon"]["atMovementLow"]) == low}
    high_routes = {route["index"] for route in claim["routes"]
                   if Fraction(route["targetHorizon"]["atMovementHigh"]) == high}
    cards = "\n".join(route_card(route, inputs["readings"][route["index"]],
                                 movement, low, high, common, low_routes, high_routes)
                      for route in claim["routes"])
    blocked = horizon["allTargetTie"]
    if blocked is None:
        conclusion = (f'''<div class="outcomes" aria-label="Complete target classification">
<div class="outcome"><small>t &lt; {safe(horizon['low'])}</small><strong>{safe(horizon['below'])}</strong>
<span>Strictly closer for every permitted one-reading move</span></div>
<div class="outcome center"><small>{safe(horizon['low'])} ≤ t ≤ {safe(horizon['high'])}</small>
<strong>Tie attainable</strong><span>At least one permitted move ties at each real target, including both endpoints</span></div>
<div class="outcome"><small>t &gt; {safe(horizon['high'])}</small><strong>{safe(horizon['above'])}</strong>
<span>Strictly closer for every permitted one-reading move</span></div></div>''')
        explanation = ("The boundaries belong to the tie region. The finite route intervals overlap "
                       "at the original sample’s midpoint, so they cover the whole region without gaps.")
    else:
        conclusion = (f'''<div class="blocked"><strong>No strict target guarantee</strong><p>Move reading
{blocked['index'] + 1} to <code>{safe(blocked['reading'])}</code>. Mean equals Median for every real
target at that permitted setting. The finite span [{safe(horizon['low'])},
{safe(horizon['high'])}] is only the midpoint range; it is <em>not</em> the set of all tied targets.</p></div>''')
        explanation = ("At this one permitted movement the two estimators coincide, so their "
                       "absolute errors agree for every real target, including outside the displayed span.")
    probe = horizon["probe"]
    witness = probe["witness"]
    if witness is not None:
        probe_detail = (f"Move reading {witness['index'] + 1} to {safe(witness['reading'])}; "
                        "its two absolute errors are exactly equal.")
    else:
        probe_detail = "The stated strict winner holds across every permitted one-reading move."
    formal = (inputs["readings"] == ["8", "6", "8", "7", "0", "8"] and
              movement == {"low": "0", "high": "10"} and
              horizon["low"] == "17/3" and horizon["high"] == "95/12" and blocked is None)
    if formal:
        formal_card = (f'''<div class="proof"><strong>Lean checked worked model</strong><p>The
<a href="{SOURCE}/blob/{FORMAL_COMMIT}/formal/InwardFormal.lean#L1603">six_reading_full_horizon theorem</a>
proves this full classification for the six displayed readings and movement [0,10],
including all six movable indices and every real target. Lean checks its explicit
model; it does not parse this JSON or certify the source of the readings.</p></div>''')
    else:
        formal_card = ('''<div class="proof"><strong>Independent receipt check</strong><p>The Python verifier
recomputes the exact routes and target classification for these supplied inputs. This report
does not claim a Lean proof of an arbitrary receipt.</p></div>''')
    digest = hashlib.sha256(raw).hexdigest()
    download = base64.b64encode(raw).decode("ascii")
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Exact, independently checked target-horizon research report and portable certificate.">
<title>Target Horizon / Research Report | INWARD Mathematics™</title>
<style>
:root{{--bg:#071827;--panel:#102b3c;--ink:#f3f9f6;--muted:#bed2d6;--line:#708e9b;--mint:#75e8c4;--gold:#ffd18a;--track:#375163;color-scheme:dark light}}
*{{box-sizing:border-box}}html{{scroll-behavior:smooth}}body{{margin:0;min-width:320px;background:radial-gradient(circle at 83% 0%,#204c61 0%,transparent 33%),var(--bg);color:var(--ink);font:16px/1.55 system-ui,sans-serif}}
.wrap{{width:min(1100px,calc(100% - 36px));margin-inline:auto}}a{{color:var(--mint);text-underline-offset:3px}}a:focus-visible,button:focus-visible{{outline:3px solid var(--gold);outline-offset:4px}}button{{font:inherit;cursor:pointer}}
header{{border-bottom:1px solid var(--line);padding:19px 0}}header .wrap{{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center}}.brand{{font-size:.77rem;letter-spacing:.13em;font-weight:850}}header span:last-child{{color:var(--muted);font-size:.8rem}}
.hero{{padding:clamp(55px,7vw,91px) 0 43px}}.eyebrow{{font-size:.75rem;font-weight:850;letter-spacing:.17em;text-transform:uppercase;color:var(--mint)}}h1{{font-size:clamp(2.65rem,7vw,6rem);line-height:1.02;letter-spacing:-.065em;max-width:760px;margin:14px 0 22px}}.lede{{color:var(--muted);max-width:750px;font-size:1.15rem}}.hero .number{{font-size:clamp(2.6rem,6vw,5.5rem);font-weight:800;letter-spacing:-.07em;line-height:1;color:var(--gold);margin:33px 0 5px}}.hero .number small{{font-size:.36em;letter-spacing:0;color:var(--muted)}}
.section{{border-top:1px solid var(--line);padding:42px 0}}h2{{font-size:clamp(1.7rem,3.5vw,2.7rem);letter-spacing:-.045em;line-height:1.12;margin:5px 0 13px}}h3{{font-size:1.1rem;margin:2px 0 0}}p{{overflow-wrap:anywhere}}.intro{{color:var(--muted);max-width:850px}}.facts{{display:flex;flex-wrap:wrap;gap:9px;margin:23px 0}}.facts span{{border:1px solid var(--line);border-radius:9px;background:var(--panel);padding:9px 13px;overflow-wrap:anywhere}}
.outcomes{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:26px 0}}.outcome,.blocked{{border:1px solid var(--line);border-radius:17px;background:var(--panel);padding:22px;min-width:0}}.outcome small,.outcome strong,.outcome span{{display:block}}.outcome small{{color:var(--gold);font-weight:850;font-size:.9rem}}.outcome strong{{font-size:clamp(1.45rem,2.6vw,2rem);margin:11px 0;letter-spacing:-.035em}}.outcome span{{color:var(--muted);font-size:.88rem}}.outcome.center{{border-color:var(--gold)}}.blocked{{border-color:var(--gold);max-width:850px}}.blocked strong{{font-size:1.6rem;color:var(--gold)}}.blocked p{{margin-bottom:0}}
.route-grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px;margin:26px 0}}.route{{min-width:0;padding:20px;border:1px solid var(--line);border-radius:16px;background:var(--panel);break-inside:avoid}}.route-title{{display:flex;justify-content:space-between;gap:10px;align-items:start}}.overline{{color:var(--muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.1em}}.tags{{display:flex;flex-wrap:wrap;justify-content:end;gap:5px}}.tag{{font-size:.66rem;font-weight:800;color:var(--gold);border:1px solid var(--gold);border-radius:18px;padding:3px 7px;white-space:nowrap}}.tie-tag{{color:var(--mint);border-color:var(--mint)}}figure{{margin:19px 0 0}}svg{{width:100%;height:auto;display:block;background:#0a2032;border:1px solid var(--line);border-radius:8px}}figcaption{{display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px 14px;color:var(--muted);font-size:.78rem;margin-top:8px}}figcaption strong{{color:var(--ink);font-family:ui-monospace,monospace}}.route-note{{font-size:.82rem;color:var(--muted);margin:12px 0 0}}.key{{color:var(--muted);font-size:.84rem}}.key b{{color:var(--gold)}}
.two{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}.proof,.evidence{{border:1px solid var(--line);border-radius:15px;background:var(--panel);padding:21px;min-width:0}}.proof strong,.evidence strong{{display:block;font-size:1.1rem}}.proof p,.evidence p{{color:var(--muted);font-size:.91rem;margin-bottom:0}}.evidence code{{display:block;margin:12px 0;overflow-wrap:anywhere;color:var(--mint)}}code{{font-family:ui-monospace,SFMono-Regular,monospace}}.actions{{display:flex;gap:10px;flex-wrap:wrap;margin:23px 0}}.button{{border:1px solid var(--mint);border-radius:9px;background:var(--mint);color:#082d2a;text-decoration:none;min-height:46px;padding:10px 16px;font-weight:850;display:inline-flex;align-items:center}}.button.secondary{{background:transparent;color:var(--mint)}}footer{{padding:26px 0;border-top:1px solid var(--line);color:var(--muted);font-size:.82rem}}
@media(max-width:760px){{.outcomes,.route-grid,.two{{grid-template-columns:1fr}}.hero{{padding:44px 0}}.section{{padding:30px 0}}}}
@media(prefers-color-scheme:light){{:root{{--bg:#f4f8f6;--panel:#fff;--ink:#173341;--muted:#3d5962;--line:#879fa7;--mint:#006750;--gold:#765019;--track:#a5b7bb}}body{{background:radial-gradient(circle at 85% 0%,#dceeea 0%,transparent 33%),var(--bg)}}svg{{background:#eff5f3}}.button{{color:#fff}}}}
@media print{{:root{{color-scheme:light;--bg:#fff;--panel:#fff;--ink:#173341;--muted:#405762;--line:#9aaeb2;--mint:#075b49;--gold:#71501e;--track:#b3c1c4}}body{{background:#fff}}svg{{background:#fff;print-color-adjust:exact}}.hero{{padding:20px 0}}.section{{padding:20px 0}}.actions{{display:none}}.route{{break-inside:avoid}}footer{{font-size:.72rem}}}}
</style></head><body>
<header><div class="wrap"><span class="brand">ĀRU INTELLIGENCE / INWARD MATHEMATICS™</span><span>Exact research report · v6</span></div></header>
<main class="wrap"><section class="hero"><p class="eyebrow">Target horizon / independently checked</p><h1>Where does the winner change?</h1>
<p class="lede">Move any one reading through [{safe(movement['low'])}, {safe(movement['high'])}], holding the rest fixed. This report classifies every real target under that stipulated model.</p>
<div class="number">[{safe(horizon['low'])}, {safe(horizon['high'])}] <small>exact midpoint span</small></div>
<p class="intro">{explanation}</p></section>
<section class="section"><p class="eyebrow">01 / Decision boundary</p><h2>The complete target line</h2>{conclusion}
<p class="intro">The midpoint range shown above is independent of the input target interval. A strict result means one estimator has a smaller absolute error for <em>every</em> allowed one-reading move; it is conditional on these inputs.</p></section>
<section class="section"><p class="eyebrow">02 / Exact model</p><h2>Readings and a concrete probe</h2>
<div class="facts">{''.join(f'<span>r<sub>{i + 1}</sub> = <strong>{safe(v)}</strong></span>' for i, v in enumerate(inputs['readings']))}</div>
<p class="intro">Permitted moved reading: [{safe(movement['low'])}, {safe(movement['high'])}]. Supplied target interval: [{safe(inputs['target']['low'])}, {safe(inputs['target']['high'])}]. At its midpoint t = <strong>{safe(probe['target'])}</strong>: <strong>{safe(probe['verdict'])}</strong>. {probe_detail}</p>
<p class="intro">Original sample midpoint of the two estimators: <strong>{safe(common)}</strong>. Every route passes through this anchor at its unchanged reading.</p></section>
<section class="section"><p class="eyebrow">03 / All movements</p><h2>{verified['routes']} exhaustive routes</h2>
<p class="intro">Each segment maps the exact target midpoints reached while moving that reading from the movement lower bound to its upper bound. The gold tick is the common original-sample midpoint. Diagram position is approximate; fractions and the JSON are exact.</p>
<div class="route-grid">{cards}</div><p class="key"><b>Boundary labels</b> identify routes attaining the global endpoints. A route’s midpoint segment is not itself a strict-winner guarantee.</p></section>
<section class="section"><p class="eyebrow">04 / Evidence and scope</p><h2>Verify independently</h2>
<div class="two">{formal_card}<div class="evidence"><strong>Checked JSON bytes</strong><p>The independent Python verifier recomputes all route partitions, endpoint midpoints, side winners, and exact tie witnesses before this page is rendered. SHA-256 identifies matching bytes; it does not authenticate their author.</p><code>{digest}</code></div></div>
<div class="actions"><a class="button" href="data:application/json;base64,{download}" download="target-horizon-v6.json">Download exact certificate</a>
<button class="button secondary" type="button" onclick="window.print()">Print / save PDF</button></div>
<p class="intro">Replay with <code>python3 tools/verify_odd_target_box.py target-horizon-v6.json</code>
using the <a href="{SOURCE}/blob/{FORMAL_COMMIT}/tools/verify_odd_target_box.py">independent checker</a>.
The report remains readable offline. Neither this certificate nor its diagram establishes that the supplied readings came from real measurements, or which estimator is generally appropriate.</p></section></main>
<footer><div class="wrap">Created by Daniel Jacob Read IV / ĀRU Intelligence Inc. with Shane Travis Horman. MIT license. Conditional mathematical model; no empirical validation claimed.</div></footer></body></html>
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
        page = render(args.certificate.read_bytes())
        if args.check:
            if args.output.read_text(encoding="utf-8") != page:
                raise ValueError("Report is stale; regenerate it from the checked certificate")
            print("Report matches independently checked certificate")
        else:
            args.output.write_text(page, encoding="utf-8")
            print(f"Wrote {args.output}")
    except (OSError, ValueError, TypeError, KeyError, UnicodeError,
            ArithmeticError, RecursionError) as error:
        parser.exit(1, f"Report failed: {error}\n")


if __name__ == "__main__":
    main()
