const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync, writeFileSync, mkdtempSync, rmSync} = require('node:fs');
const {join} = require('node:path');
const {tmpdir} = require('node:os');
const {spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const verifier = require('../joint-reading-box-verifier.js');
const {counterexample} = require('../joint-reading-threshold.js');
const {witnessAt} = require('../joint-reading-tie-witness.js');

const source = readFileSync('examples/joint-reading-box-sweep-v4.json');
const receipt = verifier.parseReceipt(source.toString());
const checked = verifier.verify(receipt);
const fixture = JSON.parse(readFileSync('examples/joint-reading-box-counterexample-46-v1.json'));
const run = args => spawnSync(args[0], args.slice(1), {encoding: 'utf8'});

test('a failing lead has attained readings, two exact errors, and source-bound evidence', () => {
  const answer = counterexample(checked, receipt, '46', '100', witnessAt);
  assert.deepEqual({format: 'inward-joint-reading-margin-counterexample-v1',
    sourceReceiptSha256: createHash('sha256').update(source).digest('hex'), ...answer}, fixture);
  assert.equal(answer.attainedLead, '2291/25');
  assert.equal(counterexample(checked, receipt, '40', '100', witnessAt), null);
  assert.equal(counterexample(checked, receipt, '13131/290', '100', witnessAt), null);
  assert.equal(counterexample(checked, receipt, '13132/290', '100', witnessAt).attainedLead,
    '2499/25');
  assert.equal(counterexample(checked, receipt, '54', '100', witnessAt).attainedLead, '0');
  assert.deepEqual(counterexample(checked, receipt, '54', '100', witnessAt).readings,
    ['487/10', '497/10', '507/10', '517/10', '857/10']);
  assert.throws(() => counterexample(checked, receipt, '81', '100', witnessAt), /Target must/);
  assert.throws(() => counterexample(checked, receipt, '46', '0', witnessAt), /positive/);
});

test('Python audits the source, constructs the same failure, and rejects forged proof fields', () => {
  const dir = mkdtempSync(join(tmpdir(), 'inward-failure-'));
  try {
    const sourcePath = join(dir, 'source.json'), answerPath = join(dir, 'answer.json');
    writeFileSync(sourcePath, source);
    writeFileSync(answerPath, JSON.stringify(fixture));
    const verify = () => run(['python3', 'tools/joint_reading_counterexample.py', sourcePath,
      '--verify', answerPath]);
    assert.equal(verify().status, 0);
    for (const [t, q] of [['46', '100'], ['54', '100'], ['50', '100'], ['80', '10000']]) {
      const created = run(['python3', 'tools/joint_reading_counterexample.py', sourcePath,
        `--target=${t}`, `--threshold=${q}`]);
      assert.equal(created.status, 0, created.stderr);
      const python = JSON.parse(created.stdout);
      const js = counterexample(checked, receipt, t, q, witnessAt);
      assert.deepEqual(python, {format: python.format,
        sourceReceiptSha256: python.sourceReceiptSha256, ...js});
      writeFileSync(answerPath, created.stdout);
      assert.equal(verify().status, 0);
    }
    assert.notEqual(run(['python3', 'tools/joint_reading_counterexample.py', sourcePath,
      '--target=40', '--threshold=100']).status, 0);
    // A different in-box tie is equally valid; verification checks truth, not
    // whether the submitted vector matches the generator's interpolation.
    const alternative = JSON.parse(run(['python3', 'tools/joint_reading_counterexample.py',
      sourcePath, '--target=54', '--threshold=100']).stdout);
    alternative.readings = ['48', '49', '51', '52', '85'];
    alternative.mean = '57';
    alternative.median = '51';
    alternative.meanSquaredError = '9';
    alternative.medianSquaredError = '9';
    writeFileSync(answerPath, JSON.stringify(alternative));
    assert.equal(verify().status, 0);
    for (const mutate of [
      x => {x.sourceReceiptSha256 = '0'.repeat(64);},
      x => {x.readings[0] = '49';},
      x => {x.meanSquaredError = '0';},
      x => {x.attainedLead = '100';},
      x => {x.threshold = '90';},
      x => {x.extra = 'forged';}
    ]) {
      const forged = structuredClone(fixture); mutate(forged);
      writeFileSync(answerPath, JSON.stringify(forged));
      assert.notEqual(verify().status, 0);
    }
    writeFileSync(answerPath, JSON.stringify(fixture).replace('"target":"46"',
      '"target":"46","\\u0074arget":"46"'));
    assert.notEqual(verify().status, 0);
    const changed = structuredClone(receipt);
    changed.claim.strictPieces[0].slope = '-1';
    writeFileSync(sourcePath, JSON.stringify(changed));
    writeFileSync(answerPath, JSON.stringify(fixture));
    assert.notEqual(verify().status, 0);
  } finally {rmSync(dir, {recursive: true, force: true});}
});

test('tie failures work for singleton ties, even samples, and all-target ties', () => {
  for (const [intervals, target] of [
    ['0:0,1:1,10:10', '7/3'],
    ['-3:-1,-2:0,1:3,4:5', '0'],
    ['0:1,0:1,0:1', '3/7']
  ]) {
    const made = run(['python3', 'tools/joint_reading_box.py',
      `--intervals=${intervals}`, '--target=-8', '--target-high=9', '--target-sweep']);
    assert.equal(made.status, 0, made.stderr);
    const original = verifier.parseReceipt(made.stdout);
    const result = verifier.verify(original);
    const js = counterexample(result, original, target, '1', witnessAt);
    assert.equal(js.attainedLead, '0');
    const dir = mkdtempSync(join(tmpdir(), 'inward-tie-failure-'));
    try {
      const path = join(dir, 'source.json'), answerPath = join(dir, 'answer.json');
      writeFileSync(path, made.stdout);
      const python = run(['python3', 'tools/joint_reading_counterexample.py', path,
        `--target=${target}`, '--threshold=1']);
      assert.equal(python.status, 0, python.stderr);
      const answer = JSON.parse(python.stdout);
      assert.deepEqual(js, (({format, sourceReceiptSha256, ...fields}) => fields)(answer));
      writeFileSync(answerPath, python.stdout);
      assert.equal(run(['python3', 'tools/joint_reading_counterexample.py', path,
        '--verify', answerPath]).status, 0);
    } finally {rmSync(dir, {recursive: true, force: true});}
  }
});
