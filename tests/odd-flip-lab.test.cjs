const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {mkdtempSync, writeFileSync, rmSync, readFileSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const core = require('../odd-flip-core.js');

function python(readings, target) {
  const result = spawnSync('python3', ['tools/odd_sample_flip.py', '--readings', readings.join(','), '--target', target],
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

test('invalid inputs produce no certificate and the UI keeps values local', () => {
  for (const readings of [['1','2'], ['1','2','3','4'], ['1','2','-3'],
    ['1','2','101'], ['1','2','3.1234567'], ['1','2','1/0']]) {
    assert.throws(() => core.certificate(readings, '50'));
  }
  assert.throws(() => core.certificate(['1','2','3'], '101'));
  const html = readFileSync('odd-flip-lab.html', 'utf8');
  const script = readFileSync('odd-flip-lab.js', 'utf8');
  assert.match(html, /<script src="odd-flip-core.js"><\/script><script src="odd-flip-lab.js"><\/script>/);
  assert.match(html, /role="alert"/);
  assert.match(script, /textContent/);
  assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|location\.search/);
});
