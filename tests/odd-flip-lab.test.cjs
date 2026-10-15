const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {mkdtempSync, writeFileSync, rmSync, readFileSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const core = require('../odd-flip-core.js');

function python(readings, target, low, high) {
  const args = ['tools/odd_sample_flip.py', `--readings=${readings.join(',')}`, `--target=${target}`];
  if (low !== undefined) args.push(`--low=${low}`, `--high=${high}`);
  const result = spawnSync('python3', args,
    {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('visitor case yields the exact independently checkable tie and strict witness', () => {
  const readings = ['48', '49', '50', '51', '85'];
  const result = core.certificate(readings, '50');
  assert.deepEqual(result, python(readings, '50'));
  assert.deepEqual(result.claim.best, {index: 2, threshold: '22', distance: '28', witness: '17'});
  const dir = mkdtempSync(join(tmpdir(), 'inward-odd-browser-'));
  try {
    const file = join(dir, 'certificate.json');
    writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
    const verification = spawnSync('python3', ['tools/verify_odd_sample_flip.py', file], {encoding: 'utf8'});
    assert.equal(verification.status, 0, verification.stderr);
    assert.match(verification.stdout, /Verified strict-baseline across 5 one-reading routes/);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('exact browser arithmetic agrees with Python across seeded odd samples and boundaries', () => {
  let seed = 0x71a7b5c3;
  const next = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0;};
  for (let i = 0; i < 36; i++) {
    const count = 3 + 2 * (i % 10);
    const readings = Array.from({length: count}, (_, index) => {
      const value = next() % 101;
      return index % 7 === 0 ? `${value}/${[2, 3, 7][i % 3]}` :
        index % 5 === 0 ? `${value % 100}.${String(next() % 1000000).padStart(6, '0')}` : String(value);
    });
    const target = i % 5 === 0 ? '0' : i % 7 === 0 ? '100' : `${next() % 101}/2`;
    assert.deepEqual(core.certificate(readings, target), python(readings, target),
      `case ${i}: ${readings.join(',')} versus ${target}`);
  }
  assert.equal(core.certificate(['40','45','50','55','60'], '50').claim.kind, 'baseline-tie');
});

test('custom signed movement bounds agree with Python and preserve exact SVG ratios', () => {
  const readings = ['-2', '-1', '0', '1', '35'];
  const wide = core.certificate(readings, '0', '-30', '40');
  const narrow = core.certificate(readings, '0', '-10', '40');
  assert.deepEqual(wide, python(readings, '0', '-30', '40'));
  assert.deepEqual(narrow, python(readings, '0', '-10', '40'));
  assert.deepEqual(narrow.claim.best,
    {index: 4, threshold: '-1/2', distance: '71/2', witness: '-3/4'});
  let seed = 0x6a32b142;
  const next = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0;};
  for (let i = 0; i < 20; i++) {
    const low = -100 - next() % 50, high = 10 + next() % 90;
    const values = Array.from({length: 3 + 2 * (i % 10)}, (_, index) => {
      const value = low + next() % (high - low);
      return index % 3 === 0 ? `${2 * value + 1}/2` : String(value);
    });
    const target = String(-150 + next() % 300);
    assert.deepEqual(core.certificate(values, target, String(low), String(high)),
      python(values, target, String(low), String(high)), `bounded case ${i}`);
  }
  assert.equal(core.position('1999999999/2000', '999999999/1000', '1000000'), 0.5);
  assert.equal(core.position('1000000', '999999999/1000', '1000000'), 1);
  assert.deepEqual(core.certificate(['-1.5', '-1/2', '0.5'], '-1', '-2', '1'),
    python(['-1.5', '-1/2', '0.5'], '-1', '-2', '1'));
});

test('invalid inputs produce no certificate and the UI keeps values local', () => {
  for (const readings of [['1','2'], ['1','2','3','4'], ['1','2','-3'],
    ['1','2','101'], ['1','2','3.1234567'], ['1','2','1/0']]) {
    assert.throws(() => core.certificate(readings, '50'));
  }
  assert.throws(() => core.certificate(['1','2','3'], '101'));
  for (const bounds of [['1','1'], ['3','2'], ['-1000001','100'], ['0','1000001']]) {
    assert.throws(() => core.certificate(['1','2','3'], '2', ...bounds));
  }
  assert.throws(() => core.certificate(['0','2','3'], '2', '1', '4'));
  assert.throws(() => core.certificate(['1','2','3'], '1000001', '1', '4'));
  const html = readFileSync('odd-flip-lab.html', 'utf8');
  const script = readFileSync('odd-flip-lab.js', 'utf8');
  assert.match(html, /<script src="odd-flip-core.js"><\/script><script src="odd-flip-lab.js"><\/script>/);
  assert.match(html, /role="alert"/);
  assert.match(html, /id="low".*id="high"/s);
  assert.match(script, /textContent/);
  assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|location\.search/);
});
