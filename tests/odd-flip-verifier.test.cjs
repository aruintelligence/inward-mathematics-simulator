const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync, writeFileSync, mkdtempSync, rmSync} = require('node:fs');
const {spawnSync} = require('node:child_process');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const verifier = require('../odd-flip-verifier.js');

const source = readFileSync('examples/odd-sample-flip-v1.json', 'utf8');
const original = verifier.parseReceipt(source);
const clone = value => JSON.parse(JSON.stringify(value));
const python = (readings, target) => {
  const child = spawnSync('python3', ['tools/odd_sample_flip.py', '--readings', readings.join(','), '--target', target],
    {encoding: 'utf8'});
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
};

test('independent browser verifier accepts the checked-in example and flexible opposing witness', () => {
  assert.deepEqual(verifier.verify(original), {kind: 'strict-baseline', baseline: 'Median', routes: 5,
    best: {index: 2, threshold: '22', distance: '28', witness: '17'}});
  const alternate = clone(original);
  alternate.claim.routes[2].witness = '21';
  alternate.claim.best.witness = '21';
  assert.equal(verifier.verify(alternate).best.witness, '21');
  const shuffled = JSON.stringify({claim: original.claim, inputs: original.inputs, format: original.format});
  assert.equal(verifier.verify(verifier.parseReceipt(shuffled)).routes, 5);
});

test('browser and Python checkers agree across seeded samples, rational inputs, and tied baselines', () => {
  const folder = mkdtempSync(join(tmpdir(), 'odd-verifier-'));
  let seed = 0x5a3e19c7;
  const next = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0;};
  try {
    for (let caseIndex = 0; caseIndex < 30; caseIndex++) {
      const count = 3 + 2 * (caseIndex % 10);
      const readings = Array.from({length: count}, (_, index) => {
        const number = next() % 101;
        return index % 4 === 0 ? `${number}/${[2, 3, 7][caseIndex % 3]}` :
          index % 5 === 0 ? `${number % 100}.${String(next() % 1000000).padStart(6, '0')}` : String(number);
      });
      const target = caseIndex % 7 === 0 ? '0' : caseIndex % 11 === 0 ? '100' : `${next() % 101}/3`;
      const record = python(readings, target);
      assert.equal(verifier.verify(record).kind, record.claim.kind, `case ${caseIndex}`);
      const file = join(folder, `${caseIndex}.json`);
      writeFileSync(file, JSON.stringify(record));
      const checked = spawnSync('python3', ['tools/verify_odd_sample_flip.py', file], {encoding: 'utf8'});
      assert.equal(checked.status, 0, checked.stderr);
    }
    const tie = python(['40','45','50','55','60'], '50');
    assert.deepEqual(verifier.verify(tie), {kind:'baseline-tie', baseline:'Tie', routes:0, best:null});
  } finally {rmSync(folder, {recursive:true, force:true});}
});

test('forged roots, signs, thresholds, witnesses, best route, and input structure are rejected', () => {
  const attempts = [
    x => {x.claim.baseline = 'Mean';},
    x => {x.claim.routes[2].knots.splice(2,1);},
    x => {x.claim.routes[2].pointWinners[1] = 'Mean';},
    x => {x.claim.routes[2].intervalWinners[1] = 'Median';},
    x => {x.claim.routes[2].threshold = '21';},
    x => {x.claim.routes[2].distance = '27';},
    x => {x.claim.routes[2].witness = '22';},
    x => {x.claim.routes[2].witness = '11'; x.claim.best.witness = '11';},
    x => {x.claim.best.index = 4;},
    x => {x.inputs.readings[0] = '048';},
    x => {x.claim.routes[0].extra = true;},
    x => {x.claim.routes[0].index = '0';},
  ];
  attempts.forEach((alter, index) => {
    const forged = clone(original); alter(forged);
    assert.throws(() => verifier.verify(forged), `forgery ${index}`);
  });
});

test('duplicate decoded JSON keys and oversized sources fail before verification', () => {
  assert.throws(() => verifier.parseReceipt('{"format":"x","\\u0066ormat":"y"}'), /Duplicate JSON key/);
  assert.throws(() => verifier.parseReceipt('{"inputs":{"target":"50","target":"49"}}'), /Duplicate JSON key/);
  assert.throws(() => verifier.parseReceipt('{"claim":{"routes":[{"index":0,"index":1}]}}'), /Duplicate JSON key/);
  assert.throws(() => verifier.parseReceipt(' '.repeat(2_000_001)), /2 MB/);
  assert.throws(() => verifier.parseReceipt('not json'));
  const html = readFileSync('verify-odd-flip.html', 'utf8');
  const app = readFileSync('verify-odd-flip.js', 'utf8');
  assert.match(html, /<script src="odd-flip-verifier.js"><\/script><script src="verify-odd-flip.js"><\/script>/);
  assert.match(app, /TextDecoder\("utf-8", \{fatal: true\}\)/);
  assert.match(app, /crypto\.subtle\.digest\("SHA-256", bytes\)/);
  assert.doesNotMatch(app, /fetch\(|XMLHttpRequest|location\.search/);
});
