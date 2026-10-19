const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {spawnSync} = require('node:child_process');
const verifier = require('../joint-reading-box-verifier.js');
const {witnessAt} = require('../joint-reading-tie-witness.js');

const example = verifier.parseReceipt(readFileSync('examples/joint-reading-box-sweep-v4.json', 'utf8'));
function sweep(intervals, low, high) {
  const generated = spawnSync('python3', ['tools/joint_reading_box.py',
    `--intervals=${intervals.map(pair => pair.join(':')).join(',')}`,
    `--target=${low}`, `--target-high=${high}`, '--target-sweep'], {encoding: 'utf8'});
  assert.equal(generated.status, 0, generated.stderr);
  return verifier.parseReceipt(generated.stdout);
}
function midpoint(a, b) {
  const [x, y = '1'] = a.split('/'), [z, w = '1'] = b.split('/');
  let n = BigInt(x) * BigInt(w) + BigInt(z) * BigInt(y);
  let d = 2n * BigInt(y) * BigInt(w), u = n < 0n ? -n : n, v = d;
  while (v) [u, v] = [v, u % v];
  n /= u; d /= u;
  return d === 1n ? String(n) : `${n}/${d}`;
}

test('specific interior tie target has exact, independently replayed readings', () => {
  const original = example.claim.tieWitness;
  const witness = witnessAt(example, '54');
  assert.equal(witness.target, '54');
  assert.equal(witness.readings.length, 5);
  assert.notDeepEqual(witness.readings, original.readings);
  assert.notEqual(witness.mean, witness.median);
  assert.equal(original.target, '533/10');
  const audit = spawnSync('python3', ['-c',
    'import sys; from tools.verify_joint_reading_sweep import audit; audit(sys.stdin.buffer.read())'],
  {input: JSON.stringify(witness.receipt), encoding: 'utf8'});
  assert.equal(audit.status, 0, audit.stderr);
  for (const t of ['533/10', '107/2', '54', '271/5', '543/10']) {
    const exact = witnessAt(example, t);
    const replay = structuredClone(example);
    replay.claim.tieWitness = {target: exact.target, readings: exact.readings};
    assert.equal(verifier.verify(replay).isSweep, true);
  }
});

test('all-target ties, singleton ties, even medians, and signed decimals', () => {
  const cases = [
    sweep([['0', '1'], ['0', '1'], ['0', '1']], '-10', '10'),
    sweep([['0', '0'], ['1', '1'], ['10', '10']], '0', '5'),
    sweep([['-3', '-1'], ['-2', '0'], ['1', '3'], ['4', '5']], '-6', '6'),
    sweep([['-4', '-3'], ['-1', '4'], ['1', '2']], '-8', '9')
  ];
  let seed = 0x1e7a91;
  const next = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0;};
  for (let k = 0; k < 18; k++) {
    const intervals = Array.from({length: 3 + k % 3}, () => {
      const low = -5 + next() % 11;
      return [String(low), String(low + next() % 5)];
    });
    cases.push(sweep(intervals, '-10', '10'));
  }
  const checked = [];
  for (const receipt of cases) {
    const tie = receipt.claim.tieTargetInterval;
    if (!tie) continue;
    for (const target of [tie[0], midpoint(...tie), tie[1]]) {
      const witness = witnessAt(receipt, target);
      checked.push({intervals: receipt.inputs.intervals, ...witness});
    }
  }
  const decimal = witnessAt(cases[0], '-0.125');
  assert.equal(decimal.target, '-1/8');
  assert.equal(decimal.mean, decimal.median);
  checked.push({intervals: cases[0].inputs.intervals, ...decimal});
  assert.ok(checked.length > 30, 'cover varied odd and even tie boxes');
  const python = spawnSync('python3', ['-c', `
import json,sys
from fractions import Fraction as Q
for case in json.load(sys.stdin):
    readings=list(map(Q,case['readings']))
    bounds=[[Q(v) for v in pair] for pair in case['intervals']]
    assert all(a <= x <= b for x,(a,b) in zip(readings,bounds))
    ordered=sorted(readings); n=len(readings)
    mean=sum(readings)/n
    median=(ordered[(n-1)//2]+ordered[n//2])/2
    t=Q(case['target'])
    assert (mean-t)**2 == (median-t)**2
    assert mean==Q(case['mean']) and median==Q(case['median'])
print('exact witnesses independently checked')
`], {input: JSON.stringify(checked), encoding: 'utf8'});
  assert.equal(python.status, 0, python.stderr);
  assert.match(python.stdout, /independently checked/);
});

test('witness constructor rejects missing ties, outside targets, and forged receipts', () => {
  for (const target of ['0', '80', '54.1234567', '1/0', '2e1', '']) {
    assert.throws(() => witnessAt(example, target));
  }
  const strict = sweep([['0', '0'], ['1', '1'], ['10', '10']], '-10', '-5');
  assert.throws(() => witnessAt(strict, '-7'), /no tie target/);
  const forged = structuredClone(example);
  forged.claim.strictPieces[0].slope = '-1';
  assert.throws(() => witnessAt(forged, '54'), /Incorrect target sweep/);
});
