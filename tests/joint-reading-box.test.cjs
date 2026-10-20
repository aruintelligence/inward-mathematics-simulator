const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {readFileSync} = require('node:fs');
const {createHash, webcrypto} = require('node:crypto');
const vm = require('node:vm');
const browserCore = require('../joint-reading-box-core.js');
const verifier = require('../joint-reading-box-verifier.js');
const thresholdCore = require('../joint-reading-threshold.js');
const tieWitness = require('../joint-reading-tie-witness.js');
const targetLens = require('../target-lens.js');

test('browser lab pins its exact computation assets to their SHA-256 versions', () => {
  const html = readFileSync('joint-reading-box.html', 'utf8');
  for (const path of ['joint-reading-box-core.js', 'joint-reading-box-verifier.js',
    'joint-reading-threshold.js', 'joint-reading-tie-witness.js', 'joint-reading-portable-report.js']) {
    const hash = createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 12);
    assert.ok(html.includes(`<script src="${path}?v=${hash}"></script>`));
  }
  assert.ok(html.includes(createHash('sha256').update(readFileSync('tools/joint-reading-portable-template.html')).digest('hex')));
});

function generate(intervals, target, targetHigh = null, sharp = false) {
  const command = spawnSync('python3', ['tools/joint_reading_box.py',
    `--intervals=${intervals.map(pair => pair.join(':')).join(',')}`, `--target=${target}`,
    ...(targetHigh === null ? [] : [`--target-high=${targetHigh}`]),
    ...(sharp ? ['--exact-gap'] : [])],
  {encoding: 'utf8'});
  assert.equal(command.status, 0, command.stderr);
  const receipt = verifier.parseReceipt(command.stdout);
  assert.equal(verifier.verify(receipt).verdict, receipt.claim.verdict);
  return receipt;
}
function generateSweep(intervals, from, to) {
  const command = spawnSync('python3', ['tools/joint_reading_box.py',
    `--intervals=${intervals.map(pair => pair.join(':')).join(',')}`,
    `--target=${from}`, `--target-high=${to}`, '--target-sweep'], {encoding: 'utf8'});
  assert.equal(command.status, 0, command.stderr);
  const receipt = verifier.parseReceipt(command.stdout);
  assert.equal(verifier.verify(receipt).isSweep, true);
  return receipt;
}
const clone = value => JSON.parse(JSON.stringify(value));
const numeric = raw => raw.includes('/') ? Number(raw.split('/')[0]) / Number(raw.split('/')[1]) : Number(raw);
function rationalMidpoint(left, right) {
  const [a, b = '1'] = left.split('/'), [c, d = '1'] = right.split('/');
  let top = BigInt(a) * BigInt(d) + BigInt(c) * BigInt(b);
  let bottom = 2n * BigInt(b) * BigInt(d);
  let x = top < 0n ? -top : top, y = bottom;
  while (y) [x, y] = [y, x % y];
  top /= x; bottom /= x;
  return bottom === 1n ? String(top) : `${top}/${bottom}`;
}
function at(readings) {
  const ordered = [...readings].sort((a, b) => a - b), n = readings.length;
  const mean = readings.reduce((a, b) => a + b, 0) / n;
  return [mean - (ordered[(n - 1) >> 1] + ordered[n >> 1]) / 2,
    (mean + (ordered[(n - 1) >> 1] + ordered[n >> 1]) / 2) / 2];
}

test('browser constructor matches Python receipts and an independent BigInt checker', () => {
  const cases = [
    [[['48', '49'], ['49', '50'], ['50', '51'], ['51', '52'], ['85', '86']], '0'],
    [[['-4', '-3'], ['-1', '4'], ['1', '2']], '-2'],
    [[['0.5', '1'], ['1/3', '2/3'], ['-1/2', '0'], ['2/3', '5/6']], '1/3'],
    [[['-0.500000', '-0.25'], ['-1/4', '0'], ['0', '0.5']], '-0.125'],
    [[['0', '0'], ['1', '1'], ['2', '2'], ['3', '3']], '-100'],
    [[['-1000000', '-1000000'], ['0', '0'], ['1000000', '1000000']], '1000000']
  ];
  let seed = 0x2ec57a1;
  const next = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  for (let k = 0; k < 24; k++) {
    const n = 3 + k % 3;
    const intervals = Array.from({length: n}, (_, i) => {
      const low = -7 + next() % 15, high = low + next() % 5;
      return i % 2 ? [`${2 * low + 1}/2`, `${2 * high + 1}/2`] :
        [String(low), String(high)];
    });
    cases.push([intervals, String(-8 + next() % 18)]);
  }
  for (const [intervals, target] of cases) {
    const browser = browserCore.certificate(intervals, target);
    const python = generate(intervals, target);
    assert.deepEqual(browser, python, JSON.stringify({intervals, target}));
    assert.equal(verifier.verify(browser).verdict, browser.claim.verdict);
  }
  for (const [intervals, target] of [
    [[['5', '4'], ['0', '1'], ['2', '3']], '2'],
    [[['0', '1'], ['0', '1']], '0'],
    [[['0', '1'], ['0', '1'], ['0', '1']], '1/0'],
    [[['0', '1'], ['0', '1'], ['0', '1000001']], '0']
  ]) assert.throws(() => browserCore.certificate(intervals, target));
});

test('joint box catches an interior order-cell vertex missed by all 8 corners', () => {
  const intervals = [[-4, -3], [-1, 4], [1, 2]];
  const receipt = generate(intervals, -2);
  assert.equal(receipt.claim.estimateRange.min.value, '-2');
  assert.deepEqual(receipt.claim.estimateRange.min.readings, ['-4', '2', '2']);
  assert.equal(receipt.claim.verdict, 'Tie possible');
  const corners = [];
  for (const a of intervals[0]) for (const b of intervals[1]) for (const c of intervals[2]) {
    corners.push(at([a, b, c])[0]);
  }
  assert.ok(Math.min(...corners) > -2);
});

test('strict guarantee includes a positive exact squared-error lower bound', () => {
  const intervals = [[48, 49], [49, 50], [50, 51], [51, 52], [85, 86]];
  const receipt = generate(intervals, 0);
  assert.equal(receipt.claim.verdict, 'Median');
  const bound = numeric(receipt.claim.squaredGapLowerBound);
  assert.ok(bound > 0);
  for (const a of intervals[0]) for (const b of intervals[1]) for (const c of intervals[2]) {
    for (const d of intervals[3]) for (const e of intervals[4]) {
      const readings = [a, b, c, d, e], ordered = [...readings].sort((x, y) => x - y);
      const mean = readings.reduce((x, y) => x + y) / 5, median = ordered[2];
      assert.ok(mean * mean - median * median >= bound - 1e-9);
    }
  }
  const tied = generate(intervals, 54);
  assert.equal(tied.claim.verdict, 'Tie possible');
  assert.ok(tied.claim.tieWitness);
});

test('v2 certifies every target in an interval and gives an attained interior tie', () => {
  const intervals = [['48', '49'], ['49', '50'], ['50', '51'], ['51', '52'], ['85', '86']];
  const strict = generate(intervals, '0', '45');
  assert.deepEqual(strict, JSON.parse(readFileSync('examples/joint-reading-box-strict-v2.json', 'utf8')));
  assert.deepEqual(browserCore.certificateRange(intervals, '0', '45'), strict);
  assert.equal(strict.claim.verdict, 'Median');
  assert.equal(strict.claim.squaredGapLowerBound, '2407/25');
  const mean = generate(intervals, '60', '65');
  assert.equal(mean.claim.verdict, 'Mean');
  for (const target of ['0', '22', '45']) {
    assert.equal(generate(intervals, target).claim.verdict, 'Median');
  }
  const tie = generate(intervals, '54', '55');
  assert.deepEqual(tie, JSON.parse(readFileSync('examples/joint-reading-box-tie-v2.json', 'utf8')));
  assert.deepEqual(browserCore.certificateRange(intervals, '54', '55'), tie);
  assert.equal(tie.claim.tieTarget, '54');
  assert.deepEqual(tie.claim.tieWitness, ['487/10', '497/10', '507/10', '517/10', '857/10']);
  assert.equal(verifier.verify(tie).tieTarget, '54');
  assert.equal(generate(intervals, '0', '100').claim.verdict, 'Tie possible');
  assert.equal(generate(intervals, '0').claim.verdict, 'Median');
  assert.equal(generate(intervals, '100').claim.verdict, 'Mean');
});

test('v2 handles coincident estimates, touching targets, equal bounds, and rational inputs', () => {
  const samples = [
    [[['-4', '-3'], ['-1', '4'], ['1', '2']], '-100', '-99'],
    [[['0', '0'], ['0', '0'], ['0', '0'], ['10', '10']], '5/4', '5/4'],
    [[['0.5', '1'], ['1/3', '2/3'], ['-1/2', '0'], ['2/3', '5/6']], '1/3', '4/3']
  ];
  for (const [intervals, low, high] of samples) {
    const receipt = generate(intervals, low, high);
    assert.deepEqual(browserCore.certificateRange(intervals, low, high), receipt);
    assert.equal(verifier.verify(receipt).verdict, receipt.claim.verdict);
  }
  const coincident = generate(samples[0][0], '-100', '-99');
  assert.equal(coincident.claim.verdict, 'Tie possible');
  assert.equal(coincident.claim.tieTarget, '-100');
  const touch = generate(samples[1][0], '5/4', '5/4');
  assert.equal(touch.claim.tieTarget, '5/4');
  assert.throws(() => browserCore.certificateRange(samples[0][0], '1', '0'), /Target bounds/);
  const primes = [100000007, 100000037, 100000039, 100000049, 100000073];
  const longIntervals = primes.map(p => [`1/${p}`, `1/${p}`]);
  const longTie = generate(longIntervals, '-1', '1');
  assert.ok(longTie.claim.tieTarget.length > 18);
  assert.deepEqual(browserCore.certificateRange(longIntervals, '-1', '1'), longTie);
  assert.equal(verifier.verify(longTie).verdict, 'Tie possible');
});

test('seeded target intervals agree with an independent integer-grid oracle', () => {
  let seed = 0x29ad183;
  const next = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  for (let k = 0; k < 24; k++) {
    const n = 3 + k % 3;
    const intervals = Array.from({length: n}, () => {
      const low = -4 + next() % 8;
      return [low, low + next() % 4];
    });
    const targetLow = -6 + next() % 13, targetHigh = targetLow + next() % 5;
    const receipt = generate(intervals, targetLow, targetHigh);
    const samples = [];
    function walk(index, values) {
      if (index === n) { samples.push(at(values)); return; }
      for (let value = intervals[index][0]; value <= intervals[index][1]; value++) {
        walk(index + 1, [...values, value]);
      }
    }
    walk(0, []);
    const dmin = Math.min(...samples.map(v => v[0]));
    const dmax = Math.max(...samples.map(v => v[0]));
    const hLow = at(intervals.map(pair => pair[0]))[1];
    const hHigh = at(intervals.map(pair => pair[1]))[1];
    const possible = dmin <= 0 && dmax >= 0 || hLow <= targetHigh && targetLow <= hHigh;
    assert.equal(receipt.claim.verdict === 'Tie possible', possible);
    assert.deepEqual(browserCore.certificateRange(intervals.map(pair => pair.map(String)),
      String(targetLow), String(targetHigh)), receipt);
    if (!possible) {
      const bound = numeric(receipt.claim.squaredGapLowerBound);
      assert.ok(bound > 0);
      for (const [difference, midpoint] of samples) for (const t of [targetLow, targetHigh]) {
        assert.ok(2 * Math.abs(difference * (midpoint - t)) + 1e-9 >= bound);
      }
    } else assert.equal(verifier.verify(receipt).tieTarget, receipt.claim.tieTarget);
  }
});

test('v2 verifier rejects forged target witnesses, bounds, verdicts, and schemas', () => {
  const strict = generate([['48', '49'], ['49', '50'], ['50', '51'], ['51', '52'], ['85', '86']], '0', '45');
  const tie = generate([['48', '49'], ['49', '50'], ['50', '51'], ['51', '52'], ['85', '86']], '54', '55');
  for (const [original, change] of [
    [tie, x => { x.claim.tieTarget = '53'; }],
    [tie, x => { x.claim.tieTarget = '55'; }],
    [tie, x => { x.claim.tieWitness[0] = '49'; }],
    [tie, x => { x.claim.tieTarget = null; }],
    [strict, x => { x.claim.squaredGapLowerBound = '100'; }],
    [strict, x => { x.claim.tieTarget = '0'; }],
    [strict, x => { x.inputs.targetInterval = ['45', '0']; }],
    [strict, x => { x.inputs.targetInterval = ['0', '46']; }],
    [strict, x => { x.inputs.target = '0'; }],
    [tie, x => { x.format = 'inward-joint-reading-box-v1'; }]
  ]) {
    const forged = clone(original); change(forged);
    assert.throws(() => verifier.verify(forged));
  }
});

test('v3 proves and attains an exact gap stronger than the legacy bound', () => {
  const intervals = [['48', '49'], ['49', '50'], ['50', '51'], ['51', '52'], ['85', '86']];
  const strict = generate(intervals, '0', '45', true);
  assert.deepEqual(strict, JSON.parse(readFileSync('examples/joint-reading-box-strict-v3.json', 'utf8')));
  assert.deepEqual(browserCore.certificateSharp(intervals, '0', '45'), strict);
  assert.equal(strict.claim.squaredGapLowerBound, '2581/25');
  assert.deepEqual(strict.claim.gapWitness,
    {readings: ['48', '49', '51', '51', '85'], target: '45'});
  assert.equal(verifier.verify(strict).isSharp, true);
  assert.ok(numeric(strict.claim.squaredGapLowerBound) >
    numeric(generate(intervals, '0', '45').claim.squaredGapLowerBound));
  const fixed = generate(intervals, '0', null, true);
  assert.deepEqual(browserCore.certificateSharp(intervals, '0'), fixed);
  assert.deepEqual(fixed.inputs.targetInterval, ['0', '0']);
  const tied = generate(intervals, '54', '55', true);
  assert.deepEqual(tied, JSON.parse(readFileSync('examples/joint-reading-box-tie-v3.json', 'utf8')));
  assert.deepEqual(browserCore.certificateSharp(intervals, '54', '55'), tied);
  assert.equal(tied.claim.verdict, 'Tie possible');
  assert.equal(tied.claim.gapWitness, null);
  assert.equal(tied.claim.tieTarget, '54');
  const coincident = generate([['-4', '-3'], ['-1', '4'], ['1', '2']], '-100', '-99', true);
  assert.equal(coincident.claim.verdict, 'Tie possible');
  assert.equal(coincident.claim.squaredGapLowerBound, null);
  assert.equal(coincident.claim.gapWitness, null);
  assert.equal(verifier.verify(coincident).tieTarget, '-100');
  const evenSingleton = generate([['0', '0'], ['0', '0'], ['0', '0'], ['10', '10']], '1', null, true);
  assert.equal(evenSingleton.claim.squaredGapLowerBound, '5/4');
  assert.deepEqual(evenSingleton.claim.gapWitness,
    {readings: ['0', '0', '0', '10'], target: '1'});
  const fractional = [['1/3', '2/5'], ['1/2', '3/5'], ['2/3', '7/10'],
    ['3/4', '4/5'], ['5/3', '7/4']];
  const fractionReceipt = generate(fractional, '-2', '-1', true);
  assert.equal(fractionReceipt.claim.verdict, 'Median');
  assert.equal(fractionReceipt.claim.squaredGapLowerBound, '3141/10000');
  assert.deepEqual(browserCore.certificateSharp(fractional, '-2', '-1'), fractionReceipt);
});

test('v3 catches an exact worst case that all box corners miss', () => {
  const intervals = [[-2, -2], [-4, -4], [8, 12], [-2, 0], [-3, 2]];
  const receipt = generate(intervals, '-20', null, true);
  assert.deepEqual(receipt, JSON.parse(readFileSync('examples/joint-reading-box-interior-v3.json', 'utf8')));
  assert.deepEqual(browserCore.certificateSharp(intervals.map(pair => pair.map(String)), '-20'), receipt);
  assert.equal(receipt.claim.squaredGapLowerBound, '404/25');
  assert.deepEqual(receipt.claim.gapWitness.readings, ['-2', '-4', '8', '0', '0']);
  const corners = [];
  for (const a of intervals[2]) for (const b of intervals[3]) for (const c of intervals[4]) {
    const [difference, midpoint] = at([-2, -4, a, b, c]);
    corners.push(2 * Math.abs(difference * (midpoint + 20)));
  }
  assert.ok(Math.abs(Math.min(...corners) - 816 / 25) < 1e-9);
  assert.ok(numeric(receipt.claim.squaredGapLowerBound) < Math.min(...corners));
});

test('v3 sharp gaps agree with independent exhaustive integer-grid calculations', () => {
  let seed = 0x23add61;
  const next = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  for (let k = 0; k < 24; k++) {
    const n = 3 + k % 3;
    const intervals = Array.from({length: n}, () => {
      const low = -5 + next() % 10;
      return [low, low + next() % 4];
    });
    const targetLow = -8 + next() % 17, targetHigh = targetLow + next() % 5;
    const receipt = generate(intervals, targetLow, targetHigh, true);
    assert.deepEqual(browserCore.certificateSharp(intervals.map(pair => pair.map(String)),
      String(targetLow), String(targetHigh)), receipt);
    const grid = [];
    function walk(index, values) {
      if (index === n) { grid.push(at(values)); return; }
      for (let value = intervals[index][0]; value <= intervals[index][1]; value++) {
        walk(index + 1, [...values, value]);
      }
    }
    walk(0, []);
    if (receipt.claim.verdict === 'Tie possible') {
      assert.equal(receipt.claim.gapWitness, null);
      assert.equal(receipt.claim.squaredGapLowerBound, null);
    } else {
      const observed = Math.min(...grid.flatMap(([d, h]) =>
        [targetLow, targetHigh].map(t => 2 * Math.abs(d * (h - t)))));
      assert.ok(Math.abs(numeric(receipt.claim.squaredGapLowerBound) - observed) < 1e-9);
      assert.equal(verifier.verify(receipt).isSharp, true);
    }
  }
});

test('v3 independently rejects forged minima and unattained witnesses', () => {
  const strict = generate([['48', '49'], ['49', '50'], ['50', '51'], ['51', '52'], ['85', '86']], '0', '45', true);
  const tie = generate([['48', '49'], ['49', '50'], ['50', '51'], ['51', '52'], ['85', '86']], '54', '55', true);
  for (const [original, change] of [
    [strict, x => { x.claim.squaredGapLowerBound = '2407/25'; }],
    [strict, x => { x.claim.squaredGapLowerBound = '2582/25'; }],
    [strict, x => { x.claim.gapWitness.readings[0] = '49'; }],
    [strict, x => { x.claim.gapWitness.target = '0'; }],
    [strict, x => { x.claim.gapWitness = null; }],
    [tie, x => { x.claim.gapWitness = {readings: x.claim.tieWitness, target: '54'}; }],
    [tie, x => { x.claim.squaredGapLowerBound = '0'; }],
    [strict, x => { x.format = 'inward-joint-reading-box-v2'; }]
  ]) {
    const forged = clone(original); change(forged);
    assert.throws(() => verifier.verify(forged));
  }
});

test('v4 maps the exact tie band and all changes of the worst-case readings', () => {
  const intervals = [['48', '49'], ['49', '50'], ['50', '51'], ['51', '52'], ['85', '86']];
  const receipt = generateSweep(intervals, '0', '80');
  assert.deepEqual(receipt, JSON.parse(readFileSync('examples/joint-reading-box-sweep-v4.json', 'utf8')));
  assert.deepEqual(browserCore.certificateSweep(intervals, '0', '80'), receipt);
  assert.deepEqual(receipt.claim.tieTargetInterval, ['533/10', '543/10']);
  assert.deepEqual(receipt.claim.strictPieces.map(piece => piece.to),
    ['979/20', '533/10', '286/5', '80']);
  for (const piece of receipt.claim.strictPieces) {
    const t = (numeric(piece.from) + numeric(piece.to)) / 2;
    const [d, h] = at(piece.readings.map(numeric));
    const claimed = numeric(piece.slope) * t + numeric(piece.intercept);
    assert.ok(Math.abs(2 * Math.abs(d * (h - t)) - claimed) < 1e-9);
    const sharp = generate(intervals, rationalMidpoint(piece.from, piece.to), null, true);
    assert.ok(Math.abs(numeric(sharp.claim.squaredGapLowerBound) - claimed) < 1e-9);
  }
  const allTie = generateSweep([['-4', '-3'], ['-1', '4'], ['1', '2']], '-10', '10');
  assert.deepEqual(allTie.claim.tieTargetInterval, ['-10', '10']);
  assert.deepEqual(allTie.claim.strictPieces, []);
  assert.deepEqual(browserCore.certificateSweep(allTie.inputs.intervals, '-10', '10'), allTie);
});

test('v4 seeded boxes match Python and the independent verifier', () => {
  let seed = 0x45de31a;
  const next = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  for (let k = 0; k < 30; k++) {
    const n = 3 + k % 3;
    const intervals = Array.from({length: n}, () => {
      const low = -6 + next() % 13;
      return [String(low), String(low + next() % 4)];
    });
    const from = String(-10 + next() % 12), to = String(5 + next() % 12);
    const receipt = generateSweep(intervals, from, to);
    assert.deepEqual(browserCore.certificateSweep(intervals, from, to), receipt);
    const verified = verifier.verify(receipt);
    assert.equal(verified.isSweep, true);
    for (const piece of receipt.claim.strictPieces) {
      const t = (numeric(piece.from) + numeric(piece.to)) / 2;
      const sharp = generate(intervals, rationalMidpoint(piece.from, piece.to), null, true);
      const expected = numeric(piece.slope) * t + numeric(piece.intercept);
      assert.ok(Math.abs(numeric(sharp.claim.squaredGapLowerBound) - expected) < 1e-8);
    }
  }
});

test('v4 rejects broken intervals, missing segments, forged lines and witnesses', () => {
  const sweep = generateSweep([['48', '49'], ['49', '50'], ['50', '51'], ['51', '52'],
    ['85', '86']], '0', '80');
  for (const change of [
    x => { x.claim.tieTargetInterval[0] = '53'; },
    x => { x.claim.tieWitness.target = '52'; },
    x => { x.claim.strictPieces.pop(); },
    x => { x.claim.strictPieces[0].to = '49'; },
    x => { x.claim.strictPieces[0].slope = '-1'; },
    x => { x.claim.strictPieces[0].readings[0] = '49'; },
    x => { x.claim.strictPieces[0].verdict = 'Mean'; },
    x => { x.claim.extra = 'unproved'; }
  ]) {
    const forged = clone(sweep); change(forged);
    assert.throws(() => verifier.verify(forged));
  }
  assert.throws(() => browserCore.certificateSweep(sweep.inputs.intervals, '10', '10'));
  const command = spawnSync('python3', ['tools/joint_reading_box.py',
    '--intervals=0:0,1:1,3:3', '--target=10', '--target-high=10', '--target-sweep'],
  {encoding: 'utf8'});
  assert.notEqual(command.status, 0);
});

test('even-sample central-pair median and singleton tie boundaries are exact', () => {
  const intervals = [[0, 0], [0, 0], [0, 0], [10, 10]];
  const tie = generate(intervals, '5/4');
  assert.equal(tie.claim.verdict, 'Tie possible');
  assert.deepEqual(tie.claim.tieWitness, ['0', '0', '0', '10']);
  assert.equal(tie.claim.estimateRange.min.value, '5/2');
  const strict = generate(intervals, '1');
  assert.equal(strict.claim.verdict, 'Median');
  assert.equal(strict.claim.squaredGapLowerBound, '5/4');
  const coincident = generate([[0, 0], [1, 1], [2, 2], [3, 3]], '-100');
  assert.equal(coincident.claim.verdict, 'Tie possible');
  assert.deepEqual(coincident.claim.tieWitness, ['0', '1', '2', '3']);
});

test('seeded odd and even integer boxes agree with a separate integer-grid oracle', () => {
  let seed = 0x6194ad7;
  const next = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  for (let k = 0; k < 22; k++) {
    const n = 3 + k % 3;
    const intervals = Array.from({length: n}, () => {
      const low = -4 + next() % 8;
      return [low, low + next() % 4];
    });
    const target = -4 + next() % 11;
    const receipt = generate(intervals.map(([a, b]) => [String(a), String(b)]), String(target));
    const samples = [];
    function visit(index, values) {
      if (index === n) { samples.push([...values]); return; }
      for (let x = intervals[index][0]; x <= intervals[index][1]; x++) visit(index + 1, [...values, x]);
    }
    visit(0, []);
    const values = samples.map(at);
    const min = Math.min(...values.map(x => x[0])), max = Math.max(...values.map(x => x[0]));
    assert.ok(Math.abs(numeric(receipt.claim.estimateRange.min.value) - min) < 1e-10);
    assert.ok(Math.abs(numeric(receipt.claim.estimateRange.max.value) - max) < 1e-10);
    const [hmin, hmax] = [at(intervals.map(p => p[0]))[1], at(intervals.map(p => p[1]))[1]];
    const tie = min <= 0 && max >= 0 || hmin <= target && target <= hmax;
    assert.equal(receipt.claim.verdict === 'Tie possible', tie);
  }
});

test('signed fractions, decimals, and an even median agree with a rational-grid oracle', () => {
  const receipt = generate([['0.5', '1'], ['1/3', '2/3'], ['-1/2', '0'],
    ['2/3', '5/6']], '1/3');
  const grid = [[3, 4, 5, 6], [2, 3, 4], [-3, -2, -1, 0], [4, 5]];
  const values = [];
  for (const a of grid[0]) for (const b of grid[1]) {
    for (const c of grid[2]) for (const d of grid[3]) {
      values.push(at([a, b, c, d].map(x => x / 6))[0]);
    }
  }
  assert.ok(Math.abs(numeric(receipt.claim.estimateRange.min.value) - Math.min(...values)) < 1e-10);
  assert.ok(Math.abs(numeric(receipt.claim.estimateRange.max.value) - Math.max(...values)) < 1e-10);
  assert.ok(receipt.inputs.intervals.some(pair => pair.some(value => value.includes('/'))));
});

test('five-reading uniform drift agrees with the existing Target Lens factor optimizer', () => {
  for (const [values, drift, target] of [
    [[48, 49, 50, 51, 85], 1, 0],
    [[48, 49, 50, 51, 85], 3, 50],
    [[40, 42, 50, 60, 68], 2, 52],
    [[0, 0, 50, 100, 100], 5, 50]
  ]) {
    const intervals = values.map(value => [Math.max(0, value - drift), Math.min(100, value + drift)]);
    const receipt = generate(intervals, target);
    const existing = targetLens.certifyJointUncertainty(values, target, target, drift);
    assert.ok(Math.abs(numeric(receipt.claim.estimateRange.min.value) * 5 * 1e6 -
      existing.estimateRangeUnits[0]) < 1e-6);
    assert.ok(Math.abs(numeric(receipt.claim.estimateRange.max.value) * 5 * 1e6 -
      existing.estimateRangeUnits[1]) < 1e-6);
    assert.equal(receipt.claim.verdict === 'Tie possible', existing.kind !== 'strict');
    if (existing.kind === 'strict') assert.equal(receipt.claim.verdict, existing.winner);
  }
});

test('forged extrema, margin, witness, fields, and duplicate JSON keys are rejected', () => {
  const strict = generate([[48, 49], [49, 50], [50, 51], [51, 52], [85, 86]], 0);
  const tie = generate([[-4, -3], [-1, 4], [1, 2]], -2);
  for (const [original, change] of [
    [strict, x => { x.claim.estimateRange.min.value = '0'; }],
    [strict, x => { x.claim.estimateRange.min.readings[0] = '49'; }],
    [strict, x => { x.claim.midpointRange.max = '0'; }],
    [strict, x => { x.claim.squaredGapLowerBound = '1'; }],
    [strict, x => { x.claim.verdict = 'Mean'; }],
    [tie, x => { x.claim.tieWitness[0] = '-3'; }],
    [tie, x => { x.claim.tieWitness[0] = '100'; }],
    [tie, x => { x.claim.verdict = 'Median'; }],
    [tie, x => { x.inputs.intervals[0][0] = '2/2'; }],
    [tie, x => { x.claim.extra = 1; }]
  ]) {
    const forged = clone(original); change(forged);
    assert.throws(() => verifier.verify(forged));
  }
  const json = JSON.stringify(tie);
  assert.throws(() => verifier.parseReceipt(json.replace('"target":', '"target":"0","\\u0074arget":')),
    /Duplicate JSON key/);
  assert.throws(() => verifier.parseReceipt(json.replace('"tieWitness":', '"tieWitness":null,"tieWitness":')),
    /Duplicate JSON key/);
  assert.throws(() => verifier.verify({...tie, inputs: {...tie.inputs, intervals: [
    ...tie.inputs.intervals.slice(0, 1), ['1/10000000000000000000', '2'], ...tie.inputs.intervals.slice(2)
  ]}}), /precision limit/);
});

test('mobile lab generates, exports, verifies, and clears stale evidence', async () => {
  const html = readFileSync('joint-reading-box.html', 'utf8');
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/);
  assert.ok(script);
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {value: '', textContent: '', className: '', handlers: {},
      addEventListener(type, callback) { this.handlers[type] = callback; }});
    return nodes.get(id);
  }
  node('reading-count').value = '5';
  node('target').value = '0';
  node('margin-threshold').value = '100';
  const defaults = [[48, 49], [49, 50], [50, 51], [51, 52], [85, 86]];
  defaults.forEach(([low, high], i) => {
    node('low-' + (i + 1)).value = String(low);
    node('high-' + (i + 1)).value = String(high);
  });
  let alterReportAsset = '', holdReportTemplate = false, releaseReportTemplate;
  const fetch = async path => {
    const file = path.split('?')[0];
    const bytes = readFileSync(file);
    const content = alterReportAsset === file ? bytes.toString('utf8') + '\n// changed asset' : bytes.toString('utf8');
    return {ok: true, arrayBuffer: async () => Uint8Array.from(bytes).buffer,
      text: async () => holdReportTemplate && file === 'tools/joint-reading-portable-template.html' ?
        new Promise(resolve => { releaseReportTemplate = () => resolve(content); }) : content};
  };
  let exported = null, clicked = false, delayNextDigest = false, releaseDigest;
  const URL = {createObjectURL(blob) {exported = blob; return 'blob:receipt';}, revokeObjectURL() {}};
  const testCrypto = {subtle: {digest(...args) {
    if (delayNextDigest) {
      delayNextDigest = false;
      return new Promise(resolve => { releaseDigest = async () => resolve(await webcrypto.subtle.digest(...args)); });
    }
    return webcrypto.subtle.digest(...args);
  }}};
  vm.runInNewContext(script[1], {document: {getElementById: node, createElement(tag) {
    assert.equal(tag, 'a'); return {click() {clicked = true;}};
  }}, fetch, URL, Blob, setTimeout() {}, btoa: raw => Buffer.from(raw, 'binary').toString('base64'),
    InwardJointBox: browserCore, InwardJointBoxVerifier: verifier,
    InwardJointThreshold: thresholdCore, InwardJointTieWitness: tieWitness,
    InwardJointPortableReport: require('../joint-reading-portable-report.js'),
    TextEncoder, TextDecoder, Uint8Array, crypto: testCrypto},
  {timeout: 1000});
  let submitted = false;
  await node('builder-form').handlers.submit({preventDefault() {submitted = true;}});
  assert.equal(submitted, true);
  assert.equal(node('verdict').textContent, 'Median');
  assert.equal(node('download').disabled, false);
  const defaultSharp = browserCore.certificateSharp(defaults.map(pair => pair.map(String)), '0');
  assert.deepEqual(verifier.parseReceipt(node('receipt-json').value),
    defaultSharp);
  assert.match(node('detail').textContent, /Exact smallest squared-error lead = 15631\/25/);
  node('download').handlers.click();
  assert.equal(clicked, true);
  assert.deepEqual(verifier.parseReceipt(await exported.text()),
    defaultSharp);
  assert.equal(node('fingerprint').textContent,
    createHash('sha256').update(Buffer.from(await exported.arrayBuffer())).digest('hex'));
  node('reading-count').value = '4';
  node('reading-count').handlers.change();
  assert.equal(node('row-5').hidden, true);
  assert.equal(node('low-5').disabled, true);
  assert.equal(node('verdict').textContent, '—');
  assert.equal(node('download').disabled, true);
  await node('builder-form').handlers.submit({preventDefault() {}});
  assert.equal(node('verdict').textContent, 'Tie possible');
  node('low-1').value = '1000001';
  node('low-1').handlers.input();
  assert.equal(node('fingerprint').textContent, '—');
  await node('builder-form').handlers.submit({preventDefault() {}});
  assert.equal(node('verdict').textContent, 'Unverified');
  assert.equal(node('download').disabled, true);
  assert.match(node('builder-status').textContent, /between -1000000 and 1000000/);
  await node('strict-example').handlers.click();
  assert.equal(node('verdict').textContent, 'Median');
  assert.match(node('detail').textContent, /squared-error lead ≥ 15457\/25/);
  assert.match(node('fingerprint').textContent, /^[a-f0-9]{64}$/);
  await node('tie-example').handlers.click();
  assert.equal(node('verdict').textContent, 'Tie possible');
  assert.match(node('detail').textContent, /-22\/7/);
  await node('range-strict-example').handlers.click();
  assert.equal(node('verdict').textContent, 'Median');
  assert.match(node('detail').textContent, /2581\/25/);
  await node('interior-example').handlers.click();
  assert.match(node('detail').textContent, /404\/25/);
  await node('range-tie-example').handlers.click();
  assert.equal(node('verdict').textContent, 'Tie possible');
  assert.match(node('detail').textContent, /target 54/);
  await node('sweep-example').handlers.click();
  assert.equal(node('verdict').textContent, 'Target map with ties');
  assert.equal(node('sweep-view').hidden, false);
  assert.match(node('sweep-pieces').textContent, /979\/20/);
  assert.match(node('sweep-ties').textContent, /533\/10, 543\/10/);
  assert.equal(node('tie-form').hidden, false);
  node('tie-target').value = '54';
  node('tie-form').handlers.submit({preventDefault() {}});
  assert.match(node('tie-result').textContent, /At target 54, readings \[.*\] attain an exact tie/);
  assert.equal(node('tie-download').disabled, false);
  node('tie-download').handlers.click();
  const retargeted = verifier.parseReceipt(await exported.text());
  assert.equal(retargeted.claim.tieWitness.target, '54');
  assert.equal(verifier.verify(retargeted).isSweep, true);
  node('tie-target').value = '0';
  node('tie-target').handlers.input();
  assert.equal(node('tie-download').disabled, true);
  node('tie-form').handlers.submit({preventDefault() {}});
  assert.match(node('tie-result').textContent, /inside the tie interval/);
  assert.match(node('margin-result').textContent, /13131\/290.*18131\/290/s);
  assert.equal(node('margin-download').disabled, false);
  node('margin-download').handlers.click();
  assert.deepEqual(JSON.parse(await exported.text()),
    JSON.parse(readFileSync('examples/joint-reading-box-margin-100-v1.json', 'utf8')));
  node('tolerance-target').value = '40';
  node('tolerance-form').handlers.submit({preventDefault() {}});
  assert.match(node('tolerance-result').textContent, /symmetric tolerance is ±1531\/290/);
  assert.equal(node('tolerance-download').disabled, false);
  node('tolerance-download').handlers.click();
  assert.deepEqual(JSON.parse(await exported.text()),
    JSON.parse(readFileSync('examples/joint-reading-box-tolerance-40-v1.json', 'utf8')));
  node('tolerance-target').value = '54';
  node('tolerance-target').handlers.input();
  assert.equal(node('tolerance-download').disabled, true);
  node('tolerance-form').handlers.submit({preventDefault() {}});
  assert.match(node('tolerance-result').textContent, /a tie is attainable/);
  assert.equal(node('report-download').disabled, false);
  await node('report-download').handlers.click();
  assert.equal(exported.type, 'text/html;charset=utf-8');
  const downloadedReport = await exported.text();
  assert.match(downloadedReport, /Self-contained, exact Mean and Median/);
  assert.match(downloadedReport, /Construct exact readings attaining a tie/);
  assert.ok(downloadedReport.includes(Buffer.from(readFileSync('examples/joint-reading-box-sweep-v4.json')).toString('base64')));
  assert.ok(downloadedReport.includes(createHash('sha256').update(readFileSync('examples/joint-reading-box-sweep-v4.json')).digest('hex')));
  assert.match(node('report-status').textContent, /rechecks the original JSON/);
  alterReportAsset = 'tools/joint-reading-portable-template.html';
  await node('report-download').handlers.click();
  assert.match(node('report-status').textContent, /Report source changed/);
  alterReportAsset = 'joint-reading-tie-witness.js';
  await node('report-download').handlers.click();
  assert.match(node('report-status').textContent, /joint-reading-tie-witness\.js/);
  alterReportAsset = '';
  const priorExport = exported;
  holdReportTemplate = true;
  const staleReport = node('report-download').handlers.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof releaseReportTemplate, 'function');
  node('margin-threshold').value = '101';
  node('margin-threshold').handlers.input();
  releaseReportTemplate();
  holdReportTemplate = false;
  await staleReport;
  assert.equal(exported, priorExport);
  node('margin-threshold').value = '0';
  node('margin-threshold').handlers.input();
  assert.equal(node('margin-download').disabled, true);
  node('margin-form').handlers.submit({preventDefault() {}});
  assert.match(node('margin-result').textContent, /Required lead must be positive/);
  await node('report-download').handlers.click();
  assert.match(node('report-status').textContent, /Required lead must be positive/);
  node('margin-threshold').value = '700';
  node('margin-threshold').handlers.input();
  node('margin-form').handlers.submit({preventDefault() {}});
  assert.match(node('margin-result').textContent, /No target/);
  assert.equal(node('margin-download').disabled, false);
  node('margin-threshold').value = '100';
  node('margin-threshold').handlers.input();
  node('margin-form').handlers.submit({preventDefault() {}});
  assert.equal(node('margin-download').disabled, false);
  node('receipt-json').value = readFileSync('examples/joint-reading-box-strict-v2.json', 'utf8');
  node('receipt-json').handlers.input();
  assert.equal(node('margin-download').disabled, true);
  assert.equal(node('tie-form').hidden, true);
  assert.equal(node('report-download').disabled, true);
  await node('verify').handlers.click();
  assert.match(node('detail').textContent, /2407\/25.*conservative bound/);
  node('target-high').value = '45';
  node('target-high').handlers.input();
  assert.equal(node('download').disabled, true);
  node('reading-count').value = '5';
  node('reading-count').handlers.change();
  node('low-1').value = '48';
  await node('builder-form').handlers.submit({preventDefault() {}});
  assert.equal(node('verdict').textContent, 'Median');
  assert.equal(verifier.parseReceipt(node('receipt-json').value).format, 'inward-joint-reading-box-v3');
  assert.match(node('detail').textContent, /2581\/25/);
  assert.equal(node('download').disabled, false);
  node('target-high').value = '80';
  await node('sweep').handlers.click();
  assert.equal(node('verdict').textContent, 'Target map with ties');
  assert.equal(verifier.parseReceipt(node('receipt-json').value).format, 'inward-joint-reading-box-v4');
  assert.equal(node('sweep-view').hidden, false);
  assert.equal(node('download').disabled, false);
  node('margin-download').handlers.click();
  const customAnswer = JSON.parse(await exported.text());
  const customReceipt = verifier.parseReceipt(node('receipt-json').value);
  assert.deepEqual(customAnswer.guaranteedRegions,
    thresholdCore.regions(verifier.verify(customReceipt), customReceipt.inputs, '100').guaranteedRegions);
  assert.equal(customAnswer.sourceReceiptSha256,
    createHash('sha256').update(node('receipt-json').value).digest('hex'));
  node('reading-count').value = '3';
  node('reading-count').handlers.change();
  [[-4, -3], [-1, 4], [1, 2]].forEach(([low, high], i) => {
    node('low-' + (i + 1)).value = String(low);
    node('high-' + (i + 1)).value = String(high);
  });
  node('target').value = '-8';
  node('target-high').value = '9';
  node('margin-threshold').value = '1';
  node('margin-threshold').handlers.input();
  await node('sweep').handlers.click();
  assert.equal(node('margin-download').disabled, false);
  node('margin-download').handlers.click();
  const oddAnswer = JSON.parse(await exported.text());
  const oddReceipt = verifier.parseReceipt(node('receipt-json').value);
  assert.equal(oddAnswer.threshold, '1');
  assert.deepEqual(oddAnswer.guaranteedRegions,
    thresholdCore.regions(verifier.verify(oddReceipt), oddReceipt.inputs, '1').guaranteedRegions);
  assert.equal(oddAnswer.sourceReceiptSha256,
    createHash('sha256').update(node('receipt-json').value).digest('hex'));
  await node('report-download').handlers.click();
  const oddReport = await exported.text();
  assert.match(oddReport, /value="1"/);
  assert.ok(oddReport.includes(Buffer.from(node('receipt-json').value).toString('base64')));
  node('reading-count').value = '5';
  node('reading-count').handlers.change();
  defaults.forEach(([low, high], i) => {
    node('low-' + (i + 1)).value = String(low);
    node('high-' + (i + 1)).value = String(high);
  });
  node('target-high').value = '55';
  node('target-high').handlers.input();
  assert.equal(node('margin-download').disabled, true);
  node('target').value = '54';
  await node('builder-form').handlers.submit({preventDefault() {}});
  assert.equal(node('verdict').textContent, 'Tie possible');
  assert.match(node('detail').textContent, /target 54/);
  node('receipt-json').value = '{"invalid":true}';
  node('receipt-json').handlers.input();
  await node('verify').handlers.click();
  assert.equal(node('verdict').textContent, 'Unverified');
  assert.equal(node('fingerprint').textContent, '—');
  assert.equal(node('margin-download').disabled, true);
  assert.match(node('status').textContent, /^Rejected:/);
  node('receipt-json').value = readFileSync('examples/joint-reading-box-strict-v1.json', 'utf8');
  delayNextDigest = true;
  const oldCheck = node('verify').handlers.click();
  node('receipt-json').value = '{"edited":true}';
  node('receipt-json').handlers.input();
  await releaseDigest();
  await oldCheck;
  assert.equal(node('verdict').textContent, '—');
  assert.equal(node('fingerprint').textContent, '—');
  assert.match(node('status').textContent, /Receipt edited/);
});
