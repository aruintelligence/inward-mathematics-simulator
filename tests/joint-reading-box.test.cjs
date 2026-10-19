const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {readFileSync} = require('node:fs');
const {createHash, webcrypto} = require('node:crypto');
const vm = require('node:vm');
const browserCore = require('../joint-reading-box-core.js');
const verifier = require('../joint-reading-box-verifier.js');
const targetLens = require('../target-lens.js');

test('browser lab pins constructor and verifier assets to their SHA-256 versions', () => {
  const html = readFileSync('joint-reading-box.html', 'utf8');
  for (const path of ['joint-reading-box-core.js', 'joint-reading-box-verifier.js']) {
    const hash = createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 12);
    assert.ok(html.includes(`<script src="${path}?v=${hash}"></script>`));
  }
});

function generate(intervals, target) {
  const command = spawnSync('python3', ['tools/joint_reading_box.py',
    `--intervals=${intervals.map(pair => pair.join(':')).join(',')}`, `--target=${target}`],
  {encoding: 'utf8'});
  assert.equal(command.status, 0, command.stderr);
  const receipt = verifier.parseReceipt(command.stdout);
  assert.equal(verifier.verify(receipt).verdict, receipt.claim.verdict);
  return receipt;
}
const clone = value => JSON.parse(JSON.stringify(value));
const numeric = raw => raw.includes('/') ? Number(raw.split('/')[0]) / Number(raw.split('/')[1]) : Number(raw);
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
  const defaults = [[48, 49], [49, 50], [50, 51], [51, 52], [85, 86]];
  defaults.forEach(([low, high], i) => {
    node('low-' + (i + 1)).value = String(low);
    node('high-' + (i + 1)).value = String(high);
  });
  const fetch = async path => ({ok: true, arrayBuffer: async () =>
    Uint8Array.from(readFileSync(path)).buffer});
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
  }}, fetch, URL, Blob, setTimeout() {},
    InwardJointBox: browserCore, InwardJointBoxVerifier: verifier,
    TextEncoder, TextDecoder, Uint8Array, crypto: testCrypto},
  {timeout: 1000});
  let submitted = false;
  await node('builder-form').handlers.submit({preventDefault() {submitted = true;}});
  assert.equal(submitted, true);
  assert.equal(node('verdict').textContent, 'Median');
  assert.equal(node('download').disabled, false);
  assert.deepEqual(verifier.parseReceipt(node('receipt-json').value),
    JSON.parse(readFileSync('examples/joint-reading-box-strict-v1.json', 'utf8')));
  node('download').handlers.click();
  assert.equal(clicked, true);
  assert.deepEqual(verifier.parseReceipt(await exported.text()),
    JSON.parse(readFileSync('examples/joint-reading-box-strict-v1.json', 'utf8')));
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
  node('receipt-json').value = '{"invalid":true}';
  node('receipt-json').handlers.input();
  await node('verify').handlers.click();
  assert.equal(node('verdict').textContent, 'Unverified');
  assert.equal(node('fingerprint').textContent, '—');
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
