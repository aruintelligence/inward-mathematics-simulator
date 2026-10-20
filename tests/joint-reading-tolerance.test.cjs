const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync, writeFileSync, mkdtempSync, rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const {spawnSync} = require('node:child_process');
const verifier = require('../joint-reading-box-verifier.js');
const {tolerance} = require('../joint-reading-threshold.js');

const exampleBytes = readFileSync('examples/joint-reading-box-sweep-v4.json');
const example = verifier.parseReceipt(exampleBytes.toString('utf8'));
const checked = verifier.verify(example);
const fixture = JSON.parse(readFileSync('examples/joint-reading-box-tolerance-40-v1.json', 'utf8'));
const run = (args, input) => spawnSync(args[0], args.slice(1), {encoding: 'utf8', input});

test('target tolerance has an exact maximal symmetric radius and tight cutoff', () => {
  const answer = tolerance(checked, example.inputs, '40', '100');
  assert.deepEqual(answer, (({format, sourceReceiptSha256, ...fields}) => fields)(fixture));
  assert.deepEqual(answer.guarantee.symmetricInterval, ['10069/290', '13131/290']);
  assert.equal(answer.guarantee.symmetricRadius, '1531/290');
  assert.deepEqual(answer.guarantee.rightCutoff,
    {target: '13131/290', readings: ['48', '49', '51', '51', '85']});
  // Move just beyond the exact cutoff: the required lead ceases to hold.
  assert.equal(tolerance(checked, example.inputs, '13132/290', '100').guarantee, null);
  assert.equal(tolerance(checked, example.inputs, '50', '100').attainedLead, '1089/25');
  assert.equal(tolerance(checked, example.inputs, '50', '100').guarantee, null);
  assert.deepEqual(tolerance(checked, example.inputs, '54', '100'),
    {target: '54', threshold: '100', attainedLead: '0', winner: null, guarantee: null});
  const right = tolerance(checked, example.inputs, '70', '100');
  assert.equal(right.guarantee.leftCutoff.target, '18131/290');
  assert.equal(right.guarantee.symmetricRadius, '2169/290');
  assert.equal(tolerance(checked, example.inputs, '0', '15631/25').guarantee.symmetricRadius, '0');
  for (const invalid of ['-1', '81', '40.1234567', '1/0', '']) {
    assert.throws(() => tolerance(checked, example.inputs, invalid, '100'));
  }
});

test('independent Python auditor reproduces odd, even, signed, and no-guarantee answers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'inward-tolerance-'));
  try {
    const sourcePath = join(dir, 'source.json'), answerPath = join(dir, 'tolerance.json');
    const saved = readFileSync('examples/joint-reading-box-tolerance-40-v1.json');
    writeFileSync(sourcePath, exampleBytes);
    writeFileSync(answerPath, saved);
    assert.equal(run(['python3', 'tools/joint_reading_tolerance.py', sourcePath,
      '--verify', answerPath]).status, 0);
    for (const [intervals, target, lead] of [
      ['-4:-3,-1:4,1:2', '-2.5', '1/2'],
      ['-3:-1,-2:0,1:3,4:5', '0', '2'],
      ['0:0,1:1,10:10', '4', '1'],
      ['0:1,0:1,0:1', '0', '1']
    ]) {
      const made = run(['python3', 'tools/joint_reading_box.py',
        `--intervals=${intervals}`, '--target=-8', '--target-high=9', '--target-sweep']);
      assert.equal(made.status, 0, made.stderr);
      writeFileSync(sourcePath, made.stdout);
      const receipt = verifier.parseReceipt(made.stdout);
      const js = tolerance(verifier.verify(receipt), receipt.inputs, target, lead);
      const python = run(['python3', 'tools/joint_reading_tolerance.py', sourcePath,
        `--target=${target}`, `--threshold=${lead}`]);
      assert.equal(python.status, 0, python.stderr);
      const answer = JSON.parse(python.stdout);
      assert.deepEqual(js, (({format, sourceReceiptSha256, ...fields}) => fields)(answer));
      writeFileSync(answerPath, python.stdout);
      assert.equal(run(['python3', 'tools/joint_reading_tolerance.py', sourcePath,
        '--verify', answerPath]).status, 0);
    }
  } finally {rmSync(dir, {recursive: true, force: true});}
});

test('Python checker rejects forged radius, cutoff readings, wrong source, and duplicate keys', () => {
  const dir = mkdtempSync(join(tmpdir(), 'inward-tolerance-forged-'));
  try {
    const source = join(dir, 'source.json'), answer = join(dir, 'answer.json');
    writeFileSync(source, exampleBytes);
    for (const mutate of [
      x => {x.guarantee.symmetricRadius = '6';},
      x => {x.guarantee.rightCutoff.readings[0] = '49';},
      x => {x.sourceReceiptSha256 = '0'.repeat(64);},
      x => {x.guarantee.rightReach = '0';},
      x => {x.extra = 'forged';}
    ]) {
      const forged = structuredClone(fixture); mutate(forged);
      writeFileSync(answer, JSON.stringify(forged));
      const rejected = run(['python3', 'tools/joint_reading_tolerance.py', source,
        '--verify', answer]);
      assert.notEqual(rejected.status, 0);
    }
    const original = JSON.stringify(fixture);
    const duplicate = original.replace('"target":"40"',
      '"target":"40","\\u0074arget":"40"');
    assert.notEqual(duplicate, original);
    writeFileSync(answer, duplicate);
    assert.notEqual(run(['python3', 'tools/joint_reading_tolerance.py', source,
      '--verify', answer]).status, 0);
  } finally {rmSync(dir, {recursive: true, force: true});}
});
