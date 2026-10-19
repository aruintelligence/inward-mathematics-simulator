const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {readFileSync, writeFileSync, mkdtempSync, rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const {createHash} = require('node:crypto');
const sweepVerifier = require('../joint-reading-box-verifier.js');
const {regions} = require('../joint-reading-threshold.js');

const source = readFileSync('examples/joint-reading-box-sweep-v4.json');
const example = sweepVerifier.parseReceipt(source.toString('utf8'));
const checked = sweepVerifier.verify(example);
const number = raw => raw.includes('/') ? Number(raw.split('/')[0]) / Number(raw.split('/')[1]) : Number(raw);

function run(args) {
  return spawnSync(args[0], args.slice(1), {encoding: 'utf8'});
}

test('inverse query has sharp, inclusive rational threshold boundaries', () => {
  const answer = JSON.parse(readFileSync('examples/joint-reading-box-margin-100-v1.json', 'utf8'));
  assert.equal(answer.sourceReceiptSha256, createHash('sha256').update(source).digest('hex'));
  assert.deepEqual(regions(checked, example.inputs, '100'),
    {threshold: answer.threshold, guaranteedRegions: answer.guaranteedRegions});
  assert.deepEqual(answer.guaranteedRegions.map(item => [item.from, item.to, item.verdict]),
    [['0', '13131/290', 'Median'], ['18131/290', '80', 'Mean']]);
  for (const region of answer.guaranteedRegions) {
    const {target, readings} = region.thresholdBoundary;
    assert.ok(readings.every((reading, i) =>
      number(reading) >= number(example.inputs.intervals[i][0]) &&
      number(reading) <= number(example.inputs.intervals[i][1])));
    const values = readings.map(number).sort((a, b) => a - b);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const median = values[2];
    assert.ok(Math.abs(Math.abs((mean - number(target)) ** 2 -
      (median - number(target)) ** 2) - 100) < 1e-9);
  }
  assert.deepEqual(regions(checked, example.inputs, '15631/25').guaranteedRegions[0],
    {from: '0', to: '0', verdict: 'Median',
      thresholdBoundary: {target: '0', readings: ['48', '49', '51', '51', '85']}});
  assert.deepEqual(regions(checked, example.inputs, '1000000').guaranteedRegions, []);
  assert.throws(() => regions(checked, example.inputs, '0'), /positive/);
  assert.throws(() => regions(checked, example.inputs, '-1'));
  assert.throws(() => regions({isSweep: false}, example.inputs, '100'));
});

test('Python and JS agree on seeded odd/even boxes and sampled target membership', () => {
  const dir = mkdtempSync(join(tmpdir(), 'inward-threshold-'));
  let seed = 0x6da497a;
  const next = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0;};
  try {
    const path = join(dir, 'sweep.json');
    for (let k = 0; k < 30; k++) {
      const intervals = Array.from({length: 3 + k % 3}, () => {
        const low = -5 + next() % 11;
        return [low, low + next() % 4];
      });
      const generated = run(['python3', 'tools/joint_reading_box.py',
        `--intervals=${intervals.map(pair => pair.join(':')).join(',')}`,
        '--target=-8', '--target-high=9', '--target-sweep']);
      assert.equal(generated.status, 0, generated.stderr);
      writeFileSync(path, generated.stdout);
      const receipt = sweepVerifier.parseReceipt(generated.stdout);
      const verified = sweepVerifier.verify(receipt);
      const required = ['1/2', '1', '2', '5', '10'][k % 5];
      const query = run(['python3', 'tools/joint_reading_threshold.py', path, `--threshold=${required}`]);
      assert.equal(query.status, 0, query.stderr);
      const answer = JSON.parse(query.stdout);
      assert.deepEqual(regions(verified, receipt.inputs, required),
        {threshold: answer.threshold, guaranteedRegions: answer.guaranteedRegions});
      assert.ok(answer.guaranteedRegions.length <= 2);
      for (let t = -8; t <= 9; t += 0.5) {
        const tie = answer.guaranteedRegions.some(region =>
          number(region.from) <= t + 1e-9 && t <= number(region.to) + 1e-9);
        const piece = verified.strictPieces.find(item => number(item.from) <= t && t <= number(item.to));
        const gap = piece ? number(piece.slope) * t + number(piece.intercept) : 0;
        assert.equal(tie, gap >= number(required) - 1e-9,
          JSON.stringify({k, t, required, gap, answer}));
      }
    }
  } finally {rmSync(dir, {recursive: true, force: true});}
});

test('offline checker rejects forged regions, witnesses, and mismatched source bytes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'inward-threshold-verify-'));
  try {
    const receiptPath = join(dir, 'sweep.json'), answerPath = join(dir, 'answer.json');
    writeFileSync(receiptPath, source);
    const answer = JSON.parse(readFileSync('examples/joint-reading-box-margin-100-v1.json', 'utf8'));
    writeFileSync(answerPath, JSON.stringify(answer));
    const command = () => run(['node', 'tools/verify-joint-reading-threshold.cjs', receiptPath, answerPath]);
    assert.equal(command().status, 0);
    for (const change of [
      x => {x.guaranteedRegions[0].to = '46';},
      x => {x.guaranteedRegions[1].thresholdBoundary.target = '63';},
      x => {x.guaranteedRegions[0].thresholdBoundary.readings[0] = '49';},
      x => {x.sourceReceiptSha256 = '0'.repeat(64);},
      x => {x.guaranteedRegions.pop();},
      x => {x.threshold = '0';}
    ]) {
      const forged = JSON.parse(JSON.stringify(answer));
      change(forged);
      writeFileSync(answerPath, JSON.stringify(forged));
      assert.notEqual(command().status, 0);
    }
    writeFileSync(answerPath, JSON.stringify(answer));
    const other = JSON.parse(source);
    other.inputs.targetInterval[0] = '-1';
    writeFileSync(receiptPath, JSON.stringify(other));
    assert.notEqual(command().status, 0);
  } finally {rmSync(dir, {recursive: true, force: true});}
});
