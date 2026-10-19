#!/usr/bin/env python3
"""Render a standalone, independently verified v4 target-sweep report."""
import argparse
import base64
from fractions import Fraction
import hashlib
from html import escape
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
EXAMPLE = ROOT / "examples/joint-reading-box-sweep-v4.json"
REPORT = ROOT / "joint-reading-sweep-report.html"
VERIFIER = ROOT / "joint-reading-box-verifier.js"
THRESHOLD_CORE = ROOT / "joint-reading-threshold.js"
TIE_CORE = ROOT / "joint-reading-tie-witness.js"
PROOF_URL = ("https://github.com/aruintelligence/inward-mathematics-simulator/"
             "blob/main/docs/JOINT_READING_BOX.md")
NODE_CHECK = """const fs=require('node:fs');
const {parseReceipt,verify}=require('./joint-reading-box-verifier.js');
const source=new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(0));
const result=verify(parseReceipt(source));
if (!result.isSweep) throw new Error('A v4 target sweep is required');
process.stdout.write(JSON.stringify(result));"""


def safe(value):
    return escape(str(value), quote=True)


def check(raw):
    """Ask the separate exact BigInt checker to replay the original bytes."""
    if len(raw) > 2_000_000:
        raise ValueError("Certificate exceeds 2 MB")
    result = subprocess.run(["node", "-e", NODE_CHECK], input=raw,
                            cwd=ROOT, capture_output=True, check=False)
    if result.returncode:
        raise ValueError("Independent verifier rejected receipt: " +
                         result.stderr.decode("utf-8", "replace").strip()[:500])
    receipt = json.loads(raw.decode("utf-8"))
    return receipt, json.loads(result.stdout)


def chart(receipt):
    claim = receipt["claim"]
    left, right = map(Fraction, receipt["inputs"]["targetInterval"])
    points = []
    for piece in claim["strictPieces"]:
        m, b = Fraction(piece["slope"]), Fraction(piece["intercept"])
        for t in map(Fraction, (piece["from"], piece["to"])):
            points.append((t, m * t + b))
    if claim["tieTargetInterval"]:
        points.extend((Fraction(t), Fraction(0)) for t in claim["tieTargetInterval"])
    points.sort(key=lambda point: point[0])
    if not points:
        raise ValueError("Sweep has no chartable points")
    ceiling = max(value for _, value in points)
    if ceiling < 0:
        raise ValueError("Gap cannot be negative")

    def x(t):
        return f"{52 + 856 * float((t - left) / (right - left)):.3f}"

    def y(value):
        return f"{218 - 180 * float(value / ceiling):.3f}" if ceiling else "218.000"

    path = " ".join(f"{x(t)},{y(gap)}" for t, gap in points)
    tie = claim["tieTargetInterval"]
    band = ""
    if tie and Fraction(tie[0]) < Fraction(tie[1]):
        start, end = map(Fraction, tie)
        band = f'<rect x="{x(start)}" y="29" width="{856 * float((end - start) / (right - left)):.3f}" height="189" class="tie-band"/>'
    marks = []
    for t, gap in points:
        marks.append(f'<circle cx="{x(t)}" cy="{y(gap)}" r="4" class="point"/>')
    return (f'<svg id="curve" viewBox="0 0 960 270" role="img" '
            f'aria-label="Exact piecewise worst-case gap across target interval [{safe(left)}, {safe(right)}]; SVG positions approximate, rational labels exact.">'
            f'<line x1="52" y1="218" x2="908" y2="218" class="axis"/>{band}'
            f'<polyline points="{path}" class="curve"/>{"".join(marks)}'
            f'<circle id="probe-marker" cx="52" cy="218" r="8" class="marker"/>'
            f'<text x="52" y="248" class="svg-label">{safe(left)}</text>'
            f'<text x="908" y="248" text-anchor="end" class="svg-label">{safe(right)}</text>'
            f'</svg>')


def piece_cards(receipt):
    pieces = receipt["claim"]["strictPieces"]
    if not pieces:
        return '<p class="muted">No strict region: Mean and Median can tie for every target in this interval.</p>'
    cards = []
    for i, piece in enumerate(pieces, 1):
        formula = f'({piece["slope"]})t + ({piece["intercept"]})'
        cards.append(f'''<article class="piece">
<div class="piece-head"><span class="eyebrow">Piece {i:02d}</span><strong>{safe(piece['verdict'])} on the interior</strong></div>
<p class="piece-range">[{safe(piece['from'])}, {safe(piece['to'])}]</p>
<p>Exact smallest lead: <code>G(t) = {safe(formula)}</code></p>
<p class="muted">Attained at readings <code>[{safe(', '.join(piece['readings']))}]</code>.</p>
<button type="button" class="small" data-target="{safe(piece['from'])}">Inspect start</button>
<button type="button" class="small" data-target="{safe(piece['to'])}">Inspect end</button></article>''')
    return "\n".join(cards)


def render(raw):
    receipt, verified = check(raw)
    claim = receipt["claim"]
    inputs = receipt["inputs"]
    low, high = inputs["targetInterval"]
    tie = claim["tieTargetInterval"]
    summary = (f'Tie attainable for every target in [{safe(tie[0])}, {safe(tie[1])}].'
               if tie else 'No target in the selected interval permits a tie.')
    if tie:
        tie_note = (f'At target <strong>{safe(claim["tieWitness"]["target"])}</strong>, '
                    f'readings <code>[{safe(", ".join(claim["tieWitness"]["readings"]))}]</code> '
                    'attain a tie. The full tie interval follows from the continuity of the '
                    'estimator midpoint, or from an equal-estimator reading when applicable.')
    else:
        tie_note = 'Every target in this interval has a strict winner under the supplied bounds.'
    digest = hashlib.sha256(raw).hexdigest()
    encoded = base64.b64encode(raw).decode("ascii")
    # Source inclusion lets the standalone HTML recheck the embedded receipt
    # offline. The checked-in renderer gate also detects stale HTML or scripts.
    verifier_source = VERIFIER.read_text(encoding="utf-8")
    threshold_source = THRESHOLD_CORE.read_text(encoding="utf-8")
    tie_source = TIE_CORE.read_text(encoding="utf-8")
    if any("</script" in source.lower() for source in (verifier_source, threshold_source, tie_source)):
        raise ValueError("Exact scripts cannot be safely embedded")
    bounds = ", ".join(f'[{safe(a)}, {safe(b)}]' for a, b in inputs["intervals"])
    pieces = piece_cards(receipt)
    plot = chart(receipt)
    return rf'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Portable, independently checked exact target sweep for INWARD Mathematics.">
<title>Joint Reading Target Sweep / Research Report | INWARD Mathematics™</title>
<style>
:root{{--bg:#071827;--panel:#102b3c;--ink:#f3f9f6;--muted:#c1d4d8;--line:#7896a3;--mint:#75e8c4;--gold:#ffd18a;color-scheme:dark light}}
*{{box-sizing:border-box}}body{{margin:0;min-width:320px;background:radial-gradient(circle at 80% 0%,#204c61,transparent 36%),var(--bg);color:var(--ink);font:16px/1.55 system-ui,sans-serif}}
.wrap{{width:min(1060px,calc(100% - 36px));margin:auto}}header,footer{{padding:18px 0;border-bottom:1px solid var(--line)}}footer{{border-top:1px solid var(--line);border-bottom:0;color:var(--muted);font-size:.83rem}}
header .wrap{{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center}}.brand,.eyebrow{{text-transform:uppercase;letter-spacing:.15em;font-size:.74rem;font-weight:850;color:var(--mint)}}a{{color:var(--mint);text-underline-offset:3px}}a:focus-visible,button:focus-visible,input:focus-visible{{outline:3px solid var(--gold);outline-offset:3px}}
.hero{{padding:clamp(45px,7vw,80px) 0 36px}}h1{{font-size:clamp(2.7rem,7vw,5.8rem);line-height:1.02;letter-spacing:-.065em;max-width:850px;margin:12px 0 20px}}h2{{font-size:clamp(1.7rem,4vw,2.7rem);line-height:1.1;letter-spacing:-.04em}}.lede{{color:var(--muted);font-size:1.14rem;max-width:810px}}.band{{font-size:clamp(1.45rem,3.6vw,2.8rem);font-weight:800;color:var(--gold);letter-spacing:-.04em;margin:25px 0 9px}}
.section{{border-top:1px solid var(--line);padding:34px 0 44px}}.muted{{color:var(--muted)}}.panel,.piece{{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:21px;min-width:0}}.pair{{display:grid;grid-template-columns:1fr 1fr;gap:15px}}.piece-grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}}.piece-head{{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}}.piece-head strong{{color:var(--gold)}}.piece-range{{font-size:1.35rem;font-weight:800;margin:12px 0}}code{{font-family:ui-monospace,monospace;overflow-wrap:anywhere}}.piece p{{overflow-wrap:anywhere}}
form{{display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin:20px 0}}label{{display:block;font-weight:750}}input{{display:block;margin-top:5px;padding:10px 12px;min-height:46px;max-width:220px;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:9px;font:inherit}}button,.button{{min-height:46px;background:var(--mint);color:#082d2a;border:1px solid var(--mint);border-radius:9px;padding:10px 15px;font:inherit;font-weight:800;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}}button.small{{min-height:38px;padding:6px 10px;margin:3px 5px 0 0;background:transparent;color:var(--mint);font-size:.82rem}}.actions{{display:flex;flex-wrap:wrap;gap:11px;margin:20px 0}}.button.secondary{{background:transparent;color:var(--mint)}}#probe-result,#threshold-result{{font-size:1.08rem;overflow-wrap:anywhere;white-space:pre-wrap}}#margin-download[hidden]{{display:none}}#status{{font-size:.9rem}}#status.error{{color:#ffc5be}}.fingerprint{{overflow-wrap:anywhere;color:var(--mint);font:13px/1.5 ui-monospace,monospace}}
svg{{width:100%;height:auto;display:block;background:#0a2032;border:1px solid var(--line);border-radius:13px}}.axis{{stroke:var(--line);stroke-width:2}}.tie-band{{fill:var(--gold);opacity:.15}}.curve{{fill:none;stroke:var(--mint);stroke-width:4;stroke-linejoin:round}}.point{{fill:var(--mint)}}.marker{{fill:var(--gold);stroke:var(--bg);stroke-width:2}}.svg-label{{fill:var(--ink);font:19px ui-monospace,monospace}}.plot-note{{color:var(--muted);font-size:.85rem;margin-top:7px}}
@media(max-width:720px){{.pair,.piece-grid{{grid-template-columns:1fr}}.hero{{padding:37px 0 25px}}.section{{padding:25px 0 32px}}.panel,.piece{{padding:17px}}}}
@media(prefers-color-scheme:light){{:root{{--bg:#f4f8f6;--panel:#fff;--ink:#173341;--muted:#405d66;--line:#899fa7;--mint:#006750;--gold:#77501b}}body{{background:radial-gradient(circle at 80% 0%,#e0f0e9,transparent 36%),var(--bg)}}svg{{background:#eff5f3}}button,.button{{color:#fff}}}}
@media print{{:root{{color-scheme:light;--bg:#fff;--panel:#fff;--ink:#173341;--muted:#405d66;--line:#899fa7;--mint:#006750;--gold:#77501b}}body{{background:#fff}}.hero{{padding:20px 0}}.section{{padding:20px 0}}form,.actions,button.small{{display:none}}.piece{{break-inside:avoid}}}}
</style></head><body>
<header><div class="wrap"><span class="brand">ĀRU INTELLIGENCE / INWARD MATHEMATICS™</span><span class="muted">Verified research report · v4</span></div></header>
<div id="status" class="wrap" role="status">Rechecking the embedded certificate locally…</div>
<main id="report" class="wrap" hidden>
<section class="hero"><p class="eyebrow">Exact target landscape</p><h1>Where does the worst case change?</h1>
<p class="lede">For every real target in [{safe(low)}, {safe(high)}], this report maps the smallest attainable squared-error difference between Mean and Median as independent readings move within their bounds.</p>
<p class="band">{summary}</p><p class="muted">{tie_note}</p></section>
<section class="section"><p class="eyebrow">01 / The full curve</p><h2>Exact breakpoints. Attained margins.</h2>
{plot}<p class="plot-note">The connecting lines are exact between displayed rational breakpoints. Screen geometry is approximate; the receipt and fraction labels are exact.</p>
<form id="probe-form"><label for="target-input">Inspect an exact target<input id="target-input" type="text" inputmode="decimal" autocomplete="off" value="{safe(low)}"></label><button type="submit">Calculate</button></form>
<div id="probe-result" class="panel" aria-live="polite"></div><div class="actions"><a id="tie-download" class="button secondary" download="joint-reading-box-tie-target-v4.json" hidden>Download checked tie receipt</a></div></section>
<section class="section"><p class="eyebrow">02 / Inverse guarantee</p><h2>Where is a required lead guaranteed?</h2>
<p class="muted">Choose a positive minimum squared-error lead. The exact intervals include their endpoints, and a boundary witness shows when the guarantee is tight. The target and readings remain independent.</p>
<form id="threshold-form"><label for="threshold-input">Required lead<input id="threshold-input" type="text" inputmode="decimal" autocomplete="off" value="100"></label><button type="submit">Find target regions</button></form>
<div id="threshold-result" class="panel" aria-live="polite"></div>
<div class="actions"><a id="margin-download" class="button secondary" download="joint-reading-margin-regions-v1.json" hidden>Download checked region answer</a></div></section>
<section class="section"><p class="eyebrow">03 / Attaining readings</p><h2>Every strict piece</h2><p class="muted">A piece's interior has the stated strict winner. A closed endpoint that touches the tie band has gap zero. At other shared endpoints, adjacent formulas agree.</p><div class="piece-grid">{pieces}</div></section>
<section class="section"><p class="eyebrow">04 / Evidence and limits</p><h2>Replay the exact claim</h2>
<div class="pair"><div class="panel"><strong>Input assumptions</strong><p>Reading intervals: <code>{bounds}</code>.</p><p>Target interval: <code>[{safe(low)}, {safe(high)}]</code>. Each reading and the target vary independently. These bounds are stipulated; the report cannot establish how they were measured or which estimator is appropriate.</p></div>
<div class="panel"><strong>Independent checker</strong><p>The report was rendered only after a separate BigInt verifier recomputed the v4 claim from the certificate. This file embeds the original JSON bytes and verifier and checks again when opened. Its SHA-256 fingerprint identifies matching bytes; it does not authenticate their author.</p><p class="fingerprint">{digest}</p></div></div>
<div class="actions"><a class="button" href="data:application/json;base64,{encoded}" download="joint-reading-box-sweep-v4.json">Download checked JSON</a><button class="button secondary" type="button" id="print">Print / save PDF</button></div>
<p class="muted">Replay from the repository root: <code>node tools/verify-joint-reading-box.cjs joint-reading-box-sweep-v4.json</code>. The exact-envelope argument and its limits are in <a href="{PROOF_URL}">the proof notes</a>. The v4 argument is not Lean formalized.</p></section></main>
<footer><div class="wrap">Created by Daniel Jacob Read IV / ĀRU Intelligence Inc. with Shane Travis Horman. MIT license. Conditional mathematical model.</div></footer>
<script id="receipt-bytes" type="application/octet-stream">{encoded}</script>
<script>{verifier_source}</script>
<script>{threshold_source}</script>
<script>{tie_source}</script>
<script>
(async () => {{
  'use strict';
  const $ = id => document.getElementById(id);
  const abs = n => n < 0n ? -n : n;
  function q(n, d = 1n) {{
    if (!d) throw new Error('Zero denominator');
    if (d < 0n) [n, d] = [-n, -d];
    let x = abs(n), y = d;
    while (y) [x, y] = [y, x % y];
    return {{n: n / x, d: d / x}};
  }}
  const add = (a, b) => q(a.n * b.d + b.n * a.d, a.d * b.d);
  const sub = (a, b) => q(a.n * b.d - b.n * a.d, a.d * b.d);
  const mul = (a, b) => q(a.n * b.n, a.d * b.d);
  const cmp = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
  const show = value => value.d === 1n ? String(value.n) : `${{value.n}}/${{value.d}}`;
  function fraction(raw) {{
    if (typeof raw !== 'string' || !/^(?:0|-?[1-9][0-9]{{0,256}})(?:\/[1-9][0-9]{{0,256}})?$/.test(raw) &&
        !/^-?(?:0|[1-9][0-9]{{0,8}})\.[0-9]{{1,6}}$/.test(raw))
      throw new Error('Use an exact integer or fraction, or a decimal with up to six places.');
    if (raw.includes('/')) {{const [a, b] = raw.split('/'); return q(BigInt(a), BigInt(b));}}
    if (raw.includes('.')) {{const [a, b] = raw.split('.'); return q(BigInt(a + b), 10n ** BigInt(b.length));}}
    return q(BigInt(raw));
  }}
  function canonical(raw) {{const [a, b = '1'] = raw.split('/'); return q(BigInt(a), BigInt(b));}}
  function formatProbe(receipt, result, raw) {{
    const t = fraction(raw), [lo, hi] = receipt.inputs.targetInterval.map(canonical);
    if (cmp(t, lo) < 0 || cmp(t, hi) > 0) throw new Error(`Target must be between ${{show(lo)}} and ${{show(hi)}}.`);
    const tie = result.tieTargetInterval;
    if (tie && cmp(t, canonical(tie[0])) >= 0 && cmp(t, canonical(tie[1])) <= 0) {{
      const witness = InwardJointTieWitness.witnessAt(receipt, show(t));
      return {{text: `At target ${{witness.target}}, an exact tie is attained at readings [${{witness.readings.join(', ')}}]. Mean = ${{witness.mean}}; Median = ${{witness.median}}. Exact lead 0.`, gap: q(0n), t, witness}};
    }}
    const piece = result.strictPieces.find(item =>
      cmp(t, canonical(item.from)) >= 0 && cmp(t, canonical(item.to)) <= 0);
    if (!piece) throw new Error('Verified sweep has no piece for this target.');
    const gap = add(mul(canonical(piece.slope), t), canonical(piece.intercept));
    if (cmp(gap, q(0n)) <= 0) throw new Error('Strict piece gave a nonpositive lead.');
    return {{text: `At target ${{show(t)}}, ${{piece.verdict}} wins for every permitted reading configuration. Exact smallest squared-error lead: ${{show(gap)}}, attained at readings [${{piece.readings.join(', ')}}].`, gap, t}};
  }}
  try {{
    const binary = atob($('receipt-bytes').textContent.trim());
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    if (!globalThis.crypto?.subtle) throw new Error('SHA-256 requires a secure browser context.');
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    const fingerprint = [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
    if (fingerprint !== '{digest}') throw new Error('Embedded JSON does not match this report’s SHA-256.');
    const source = new TextDecoder('utf-8', {{fatal: true}}).decode(bytes);
    const receipt = InwardJointBoxVerifier.parseReceipt(source);
    const result = InwardJointBoxVerifier.verify(receipt);
    if (!result.isSweep) throw new Error('A v4 target sweep is required.');
    $('report').hidden = false;
    $('status').textContent = 'Exact certificate independently rechecked on this device.';
    $('status').className = 'wrap';
    function update(raw) {{
      $('tie-download').hidden = true;
      $('tie-download').removeAttribute('href');
      try {{
        const probe = formatProbe(receipt, result, raw);
        $('probe-result').textContent = probe.text;
        if (probe.witness) {{
          $('tie-download').href = 'data:application/json;charset=utf-8,' +
            encodeURIComponent(JSON.stringify(probe.witness.receipt, null, 2) + '\n');
          $('tie-download').hidden = false;
        }}
        const [lo, hi] = receipt.inputs.targetInterval.map(canonical);
        const ratio = q((probe.t.n * lo.d - lo.n * probe.t.d) * hi.d,
          probe.t.d * (hi.n * lo.d - lo.n * hi.d));
        const tPosition = 52 + 856 * Number(ratio.n) / Number(ratio.d);
        const maximum = Math.max(0, ...result.strictPieces.flatMap(piece =>
          [piece.from, piece.to].map(bound => {{
            const gap = add(mul(canonical(piece.slope), canonical(bound)), canonical(piece.intercept));
            return Number(gap.n) / Number(gap.d);
          }})));
        const gapValue = Number(probe.gap.n) / Number(probe.gap.d);
        $('probe-marker').setAttribute('cx', String(tPosition));
        $('probe-marker').setAttribute('cy', String(maximum ? 218 - 180 * gapValue / maximum : 218));
      }} catch (error) {{$('probe-result').textContent = `Cannot inspect target: ${{error.message}}`;}}
    }}
    function updateThreshold(raw) {{
      $('margin-download').hidden = true;
      $('margin-download').removeAttribute('href');
      try {{
        const calculation = InwardJointThreshold.regions(result, receipt.inputs, raw);
        const spans = calculation.guaranteedRegions;
        $('threshold-result').textContent = spans.length ? spans.map(region =>
          `[${{region.from}}, ${{region.to}}]: ${{region.verdict}} guarantees a lead ≥ ${{calculation.threshold}} for every permitted reading. ` +
          (region.thresholdBoundary ? `At target ${{region.thresholdBoundary.target}}, readings [${{region.thresholdBoundary.readings.join(', ')}}] attain exactly ${{calculation.threshold}}.` :
            'The threshold does not become tight within this target region.')).join('\n\n') :
          `No target in the selected range guarantees a lead of ${{calculation.threshold}}.`;
        const answer = {{format: 'inward-joint-reading-margin-regions-v1',
          sourceReceiptSha256: '{digest}', ...calculation}};
        $('margin-download').href = 'data:application/json;charset=utf-8,' +
          encodeURIComponent(JSON.stringify(answer, null, 2) + '\n');
        $('margin-download').hidden = false;
      }} catch (error) {{$('threshold-result').textContent = `Cannot calculate regions: ${{error.message}}`;}}
    }}
    $('probe-form').addEventListener('submit', event => {{event.preventDefault(); update($('target-input').value.trim());}});
    $('target-input').addEventListener('input', () => {{
      $('tie-download').hidden = true;
      $('tie-download').removeAttribute('href');
    }});
    $('threshold-form').addEventListener('submit', event => {{event.preventDefault(); updateThreshold($('threshold-input').value.trim());}});
    document.querySelectorAll('[data-target]').forEach(button => button.addEventListener('click', () => {{
      $('target-input').value = button.dataset.target;
      update(button.dataset.target);
    }}));
    $('print').addEventListener('click', () => window.print());
    update($('target-input').value);
    updateThreshold($('threshold-input').value);
  }} catch (error) {{
    $('report').hidden = true;
    $('status').textContent = `Certificate rejected: ${{error.message}}`;
    $('status').className = 'wrap error';
  }}
}})();
</script></body></html>
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("certificate", nargs="?", type=Path, default=EXAMPLE)
    parser.add_argument("--output", type=Path, default=REPORT)
    parser.add_argument("--check", action="store_true",
                        help="fail when output differs from regenerated checked report")
    args = parser.parse_args()
    try:
        raw = args.certificate.read_bytes()
        page = render(raw)
        if args.check:
            if args.output.read_text(encoding="utf-8") != page:
                raise ValueError("Report is stale; regenerate from the checked receipt")
            print("Report matches independently checked certificate")
        else:
            args.output.write_text(page, encoding="utf-8")
            print(f"Wrote {args.output}")
    except (OSError, ValueError, TypeError, KeyError, UnicodeError,
            ArithmeticError, RecursionError) as error:
        parser.exit(1, f"Report failed: {error}\n")


if __name__ == "__main__":
    main()
