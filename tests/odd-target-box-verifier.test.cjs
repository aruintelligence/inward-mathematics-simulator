const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync, writeFileSync, mkdtempSync, rmSync} = require('node:fs');
const {spawnSync} = require('node:child_process');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const core = require('../odd-target-box-core.js');
const verifier = require('../odd-target-box-verifier.js');

const exampleText = readFileSync('examples/odd-target-box-v1.json', 'utf8');
const original = verifier.parseReceipt(exampleText);
const clone = value => JSON.parse(JSON.stringify(value));
function checkPython(record, directory) {
  const path = join(directory, 'certificate.json');
  writeFileSync(path, JSON.stringify(record));
  return spawnSync('python3', ['tools/verify_odd_target_box.py', path], {encoding: 'utf8'});
}

test('independent JavaScript and Python verifiers accept exact examples and alternate valid witnesses', () => {
  assert.deepEqual(verifier.verify(original), {routes: 5,
    reachable: ['Mean', 'Median', 'Tie'], guarantee: null});
  const stable = core.certificate(['24', '13', '45', '41', '38'], '13', '45', '49', '51');
  assert.deepEqual(verifier.verify(stable), {routes: 5,
    reachable: ['Mean', 'Median', 'Tie'], guarantee: null});
  assert.equal(stable.claim.routes.filter(route => route.guarantee === 'Median').length, 2);
  // Witnesses are existential: another exact pair with the same outcome remains valid.
  const alternate = clone(original);
  const route = alternate.claim.routes[0];
  const name = route.reachable[0];
  route.witnesses[name] = {reading: '1', target: '48'};
  assert.equal(verifier.verify(alternate).routes, 5);
  const dir = mkdtempSync(join(tmpdir(), 'target-box-verify-'));
  try {
    assert.equal(checkPython(original, dir).status, 0);
    assert.equal(checkPython(stable, dir).status, 0);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('independent checkers agree across seeded signed, rational, and singleton cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'target-box-seeds-'));
  let seed = 0x1d7e50a3;
  const next = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  try {
    for (let i = 0; i < 24; i++) {
      const low = -60 - next() % 20, high = 70 + next() % 20;
      const readings = Array.from({length: 3 + i % 19}, (_, j) => {
        const value = low + next() % (high - low);
        return j % 3 === 0 ? `${2 * value + 1}/2` : String(value);
      });
      const a = -120 + next() % 241, b = i % 5 === 0 ? a : -120 + next() % 241;
      const [targetLow, targetHigh] = [a, b].sort((x, y) => x - y).map(String);
      const cert = core.certificate(readings, String(low), String(high), targetLow, targetHigh);
      assert.equal(verifier.verify(cert).routes, readings.length, `case ${i}`);
      const python = checkPython(cert, dir);
      assert.equal(python.status, 0, `case ${i}: ${python.stderr}`);
    }
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('even receipts reject forged middle-cell roots and mismatched format', () => {
  const originalEven = core.certificate(['40', '45', '50', '80'], '0', '100', '48', '52');
  assert.equal(originalEven.format, 'inward-even-target-box-v2');
  assert.equal(verifier.verify(originalEven).routes, 4);
  const dir = mkdtempSync(join(tmpdir(), 'even-box-forge-'));
  try {
    assert.equal(checkPython(originalEven, dir).status, 0);
    const edits = [
      x => { x.claim.routes[1].knots.splice(2, 1); },
      x => { x.claim.routes[1].knots[2] = '42'; },
      x => { x.inputs.readings[1] = '44'; },
      x => { x.format = 'inward-odd-target-box-v1'; },
      x => { x.claim.routes[1].witnesses.Mean.target = '100'; }
    ];
    for (const edit of edits) {
      const forged = clone(originalEven); edit(forged);
      assert.throws(() => verifier.verify(forged));
      assert.notEqual(checkPython(forged, dir).status, 0);
    }
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('forged partitions, guarantees, outcomes, and witnesses are rejected by both checkers', () => {
  const forgeries = [
    x => { x.claim.routes[0].knots.splice(1, 1); },
    x => { x.claim.routes[0].knots[1] = '99'; },
    x => { x.claim.routes[0].reachable = ['Tie']; },
    x => { x.claim.routes[0].guarantee = 'Mean'; },
    x => { x.claim.routes[0].witnesses.Mean.target = '100'; },
    x => { x.claim.routes[0].witnesses.Mean.target = '52'; },
    x => { x.claim.routes[0].witnesses.Mean.reading = '100'; },
    x => { delete x.claim.routes[0].witnesses.Median; },
    x => { x.claim.routes[0].index = 1; },
    x => { x.claim.routes.pop(); },
    x => { x.claim.reachable = ['Median']; },
    x => { x.claim.guarantee = 'Median'; },
    x => { x.inputs.movement.low = '0/1'; },
    x => { x.inputs.target.high = '47'; },
    x => { x.inputs.readings[0] = '1000001'; },
    x => { x.claim.routes[0].extra = true; },
  ];
  const dir = mkdtempSync(join(tmpdir(), 'target-box-forge-'));
  try {
    forgeries.forEach((edit, i) => {
      const forged = clone(original); edit(forged);
      assert.throws(() => verifier.verify(forged), `JavaScript accepted forgery ${i}`);
      const python = checkPython(forged, dir);
      assert.notEqual(python.status, 0, `Python accepted forgery ${i}`);
    });
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('duplicate decoded names, noncanonical fractions, extra fields, and oversized JSON fail', () => {
  assert.throws(() => verifier.parseReceipt('{"format":1,"\\u0066ormat":2}'), /Duplicate JSON key/);
  assert.throws(() => verifier.parseReceipt('{"claim":{"routes":[{"index":0,"index":1}]}}'), /Duplicate JSON key/);
  assert.throws(() => verifier.parseReceipt(' '.repeat(2_000_001)), /2 MB/);
  assert.throws(() => verifier.parseReceipt('\ufeff' + exampleText));
  assert.throws(() => verifier.parseReceipt('not json'));
  const malformed = [
    x => { x.inputs.readings[0] = '48/1'; },
    x => { x.inputs.target.high = '1000001'; },
    x => { x.claim.routes[0].knots[0] = '-0'; },
    x => { x.claim.routes[0].witnesses.Mean.extra = 1; },
    x => { x.inputs.readings[0] = 48; },
  ];
  for (const edit of malformed) {
    const changed = clone(original); edit(changed);
    assert.throws(() => verifier.verify(changed));
  }
});

test('browser inspector renders checked routes, fingerprints bytes, and clears rejected claims', async () => {
  function element(tag) {
    const classes = new Set();
    return {tag, children: [], handlers: {}, textContent: '', value: '', hidden: false,
      classList: {add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x)},
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = [...children]; },
      addEventListener(name, handler) { this.handlers[name] = handler; }};
  }
  const ids = ['receipt-file', 'receipt-json', 'file-name', 'report', 'routes', 'fingerprint',
    'seal-status', 'seal-note', 'status', 'verify-button', 'reachable', 'overall-note',
    'guarantee', 'guarantee-note', 'report-intro', 'print', 'save-to-archive',
    'save-status', 'archive-label'];
  const elements = Object.fromEntries(ids.map(id => [id, element(id)]));
  const document = {getElementById: id => elements[id], createElement: element};
  const saved = [];
  vm.runInNewContext(readFileSync('verify-odd-target-box.js', 'utf8'),
    {document, InwardTargetBoxVerifier: verifier, TextEncoder, TextDecoder, Uint8Array,
      InwardResearchArchive: {open: async () => ({close() {}}), add: async (_db, source) => {
        saved.push(source);
        return {created: true, digest: crypto.createHash('sha256').update(source).digest('hex')};
      }}, crypto: crypto.webcrypto, window: {print() {}}}, {timeout: 5000});
  elements['receipt-json'].value = exampleText;
  elements['receipt-json'].handlers.input();
  await elements['verify-button'].handlers.click();
  assert.equal(elements.report.hidden, false);
  assert.equal(elements.routes.children.length, 5);
  assert.equal(elements.fingerprint.textContent,
    crypto.createHash('sha256').update(exampleText).digest('hex'));
  assert.equal(elements['seal-status'].textContent, 'Mathematics verified');
  assert.equal(elements['save-to-archive'].disabled, false);
  await elements['save-to-archive'].handlers.click();
  assert.deepEqual(saved, [exampleText]);
  elements['receipt-json'].value = '{"bad":true}';
  elements['receipt-json'].handlers.input();
  assert.equal(elements.report.hidden, true);
  assert.equal(elements.routes.children.length, 0);
  assert.equal(elements.fingerprint.textContent, '');
  assert.equal(elements['save-to-archive'].disabled, true);
  await elements['verify-button'].handlers.click();
  assert.equal(elements.report.hidden, true);
  assert.equal(elements['seal-status'].textContent, 'Verification failed');
  await elements['save-to-archive'].handlers.click();
  assert.equal(saved.length, 1);
});

test('inspector assets are local, versioned, and do not send certificate contents', () => {
  const html = readFileSync('verify-odd-target-box.html', 'utf8');
  const app = readFileSync('verify-odd-target-box.js', 'utf8');
  for (const script of ['odd-target-box-verifier.js', 'research-archive-core.js',
    'verify-odd-target-box.js']) {
    const version = html.match(new RegExp(`${script.replace('.', '\\.') }\\?v=([0-9a-f]{12})`));
    assert.ok(version, `${script} needs a content fingerprint`);
    assert.equal(version[1], crypto.createHash('sha256').update(readFileSync(script))
      .digest('hex').slice(0, 12));
  }
  assert.match(app, /TextDecoder\("utf-8", \{fatal: true, ignoreBOM: true\}\)/);
  assert.match(app, /crypto\.subtle\.digest\("SHA-256", bytes\)/);
  assert.doesNotMatch(app, /fetch\(|XMLHttpRequest|location\.search/);
  assert.doesNotMatch(readFileSync('odd-target-box-verifier.js', 'utf8'), /require\(|InwardTargetBox\./);
});
