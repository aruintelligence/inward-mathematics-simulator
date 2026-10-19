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
function queryPython(record, directory, target) {
  const path = join(directory, 'certificate.json');
  writeFileSync(path, JSON.stringify(record));
  return spawnSync('python3', ['tools/verify_odd_target_box.py', path,
    '--query-target', target], {encoding: 'utf8'});
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

test('v3 exact gap extrema and their attaining witnesses are independently checked', () => {
  const record = core.gapCertificate(['40', '45', '50', '80'], '0', '100', '48', '52');
  const dir = mkdtempSync(join(tmpdir(), 'target-box-gap-verify-'));
  try {
    assert.equal(checkPython(record, dir).status, 0);
    assert.equal(verifier.verify(record).gap.min.value, '-1435/16');
    const edits = [
      x => { x.claim.routes[0].gap.min.value = '0'; },
      x => { x.claim.routes[0].gap.min.reading = '99'; },
      x => { x.claim.routes[0].gap.max.target = '52'; },
      x => { x.claim.gap.min.value = '-1'; },
      x => { x.claim.gap.max.index = 2; },
      x => { x.claim.gap.max.reading = '100'; },
      x => { delete x.claim.routes[0].gap; },
      x => { x.format = 'inward-even-target-box-v2'; }
    ];
    for (const edit of edits) {
      const forged = clone(record); edit(forged);
      assert.throws(() => verifier.verify(forged));
      assert.notEqual(checkPython(forged, dir).status, 0);
    }
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('v4 exact first-failure thresholds reject forged distances, inclusions, and witnesses', () => {
  const record = core.stabilityCertificate(['48', '49', '50', '51', '85'], '0', '100', '48', '52');
  const dir = mkdtempSync(join(tmpdir(), 'target-box-stability-verify-'));
  try {
    assert.equal(checkPython(record, dir).status, 0);
    assert.equal(verifier.verify(record).stability.nearestFailure.distance, '8');
    const edits = [
      x => { x.claim.routes[2].stability.left.limit = '41'; },
      x => { x.claim.routes[2].stability.left.included = true; },
      x => { x.claim.routes[2].stability.left.witness.target = '48'; },
      x => { x.claim.routes[2].stability.left.witness.reading = '43'; },
      x => { x.claim.routes[2].stability.right.limit = '95'; },
      x => { x.claim.routes[2].stability.baseline = 'Mean'; },
      x => { x.claim.stability.nearestFailure.distance = '7'; },
      x => { x.claim.stability.nearestFailure.index = 1; },
      x => { x.claim.stability.nearestFailure.side = 'right'; },
      x => { x.claim.stability.nearestFailure.target = '48'; },
      x => { x.format = 'inward-odd-target-box-v1'; }
    ];
    for (const edit of edits) {
      const changed = clone(record); edit(changed);
      assert.throws(() => verifier.verify(changed));
      assert.notEqual(checkPython(changed, dir).status, 0);
    }
  } finally {rmSync(dir, {recursive: true, force: true});}
});

test('v5 region atlas rejects missing strips, false crossover lines and forged winner sides', () => {
  const record = core.atlasCertificate(['48', '49', '50', '51', '85'], '0', '100', '48', '52');
  const dir = mkdtempSync(join(tmpdir(), 'target-box-atlas-verify-'));
  try {
    assert.equal(checkPython(record, dir).status, 0);
    assert.equal(verifier.verify(record).atlas, true);
    const edits = [
      x => { x.claim.routes[0].region.stripes.pop(); },
      x => { x.claim.routes[0].region.stripes[0].from = '1'; },
      x => { x.claim.routes[0].region.stripes[0].tieFrom = '49'; },
      x => { x.claim.routes[0].region.stripes[0].tieTo = '49'; },
      x => { x.claim.routes[0].region.stripes[0].below = 'Median'; },
      x => { x.claim.routes[0].region.stripes[0].atTargetLow = 'Tie'; },
      x => { x.claim.routes[0].region.verticalTies.pop(); },
      x => { x.claim.routes[0].region.extra = true; },
      x => { x.format = 'inward-odd-target-box-v1'; }
    ];
    for (const edit of edits) {
      const forged = clone(record); edit(forged);
      assert.throws(() => verifier.verify(forged));
      assert.notEqual(checkPython(forged, dir).status, 0);
    }
  } finally {rmSync(dir, {recursive: true, force: true});}
});

test('v6 target horizon rejects false bounds, strict sides, and unattained tie probes', () => {
  const record = core.horizonCertificate(['8', '6', '8', '7', '0', '8'],
    '0', '10', '6', '6');
  const blocked = core.horizonCertificate(['48', '49', '50', '51', '85'],
    '0', '100', '48', '52');
  const dir = mkdtempSync(join(tmpdir(), 'target-horizon-forge-'));
  try {
    assert.equal(checkPython(record, dir).status, 0);
    assert.equal(checkPython(blocked, dir).status, 0);
    assert.equal(verifier.verify(record).targetHorizon.probe.verdict, 'Tie');
    const edits = [
      x => { x.claim.routes[0].targetHorizon.atMovementLow = '6'; },
      x => { x.claim.routes[0].targetHorizon.atMovementHigh = '6'; },
      x => { x.claim.routes[0].targetHorizon.allTargetTie = '4'; },
      x => { x.claim.targetHorizon.low = '6'; },
      x => { x.claim.targetHorizon.high = '8'; },
      x => { x.claim.targetHorizon.below = 'Median'; },
      x => { x.claim.targetHorizon.above = null; },
      x => { x.claim.targetHorizon.probe.target = '7'; },
      x => { x.claim.targetHorizon.probe.verdict = 'Mean'; },
      x => { x.claim.targetHorizon.probe.witness.reading = '5'; },
      x => { x.claim.targetHorizon.probe.witness.index = 99; },
      x => { x.claim.targetHorizon.probe.witness.extra = true; },
      x => { x.format = 'inward-even-target-box-v2'; }
    ];
    for (const edit of edits) {
      const forged = clone(record); edit(forged);
      assert.throws(() => verifier.verify(forged));
      assert.notEqual(checkPython(forged, dir).status, 0);
    }
    for (const edit of [
      x => {x.claim.targetHorizon.allTargetTie.reading = '16';},
      x => {x.claim.targetHorizon.below = 'Mean';},
      x => {x.claim.routes[0].targetHorizon.allTargetTie = null;},
      x => {x.claim.targetHorizon.probe.witness.reading = '16';}
    ]) {
      const forged = clone(blocked); edit(forged);
      assert.throws(() => verifier.verify(forged));
      assert.notEqual(checkPython(forged, dir).status, 0);
    }
  } finally {rmSync(dir, {recursive: true, force: true});}
});

test('a checked v6 receipt solves fresh exact targets beyond its original interval', () => {
  const record = verifier.parseReceipt(readFileSync('examples/target-horizon-v6.json', 'utf8'));
  const dir = mkdtempSync(join(tmpdir(), 'target-horizon-query-'));
  try {
    for (const [target, expected] of [
      ['5', {target: '5', verdict: 'Mean', witness: null}],
      ['17/3', {target: '17/3', verdict: 'Tie', witness: {index: 0, reading: '0'}}],
      ['5.75', {target: '23/4', verdict: 'Tie', witness: {index: 0, reading: '1'}}],
      ['6', {target: '6', verdict: 'Tie', witness: {index: 0, reading: '4'}}],
      ['95/12', {target: '95/12', verdict: 'Tie', witness: {index: 4, reading: '10'}}],
      ['1000000000', {target: '1000000000', verdict: 'Median', witness: null}]
    ]) {
      assert.deepEqual(verifier.queryTargetHorizon(record, target), expected);
      const python = queryPython(record, dir, target);
      assert.equal(python.status, 0, `${target}: ${python.stderr}`);
      assert.match(python.stdout, new RegExp(`Exact target query t=${expected.target.replace('/', '\\/')}:`));
      if (expected.witness) assert.match(python.stdout,
        new RegExp(`Tie; move reading ${expected.witness.index + 1} to ${expected.witness.reading}`));
      else assert.match(python.stdout, new RegExp(`strict ${expected.verdict} across every`));
    }
    const blocked = core.horizonCertificate(['48', '49', '50', '51', '85'],
      '0', '100', '48', '52');
    assert.deepEqual(verifier.queryTargetHorizon(blocked, '-2000000'),
      {target: '-2000000', verdict: 'Tie', witness: {index: 0, reading: '15'}});
    assert.equal(queryPython(blocked, dir, '-2000000').status, 0);
    const even = core.horizonCertificate(['40', '45', '50', '80'], '0', '100', '48', '52');
    assert.equal(verifier.queryTargetHorizon(even, '50').verdict, 'Tie');
    for (const invalid of ['2/4', '1.1234567', '1e6', '-0', '3/0']) {
      assert.throws(() => verifier.queryTargetHorizon(record, invalid), invalid);
      assert.notEqual(queryPython(record, dir, invalid).status, 0, invalid);
    }
    const forged = clone(record); forged.claim.targetHorizon.high = '8';
    assert.throws(() => verifier.queryTargetHorizon(forged, '6'));
    assert.notEqual(queryPython(forged, dir, '6').status, 0);
    assert.throws(() => verifier.queryTargetHorizon(original, '50'), /target-horizon certificate/);
  } finally {rmSync(dir, {recursive: true, force: true});}
});

test('exact target margin has an attained boundary tie and reversed-order coverage', () => {
  const record = verifier.parseReceipt(readFileSync('examples/target-horizon-v6.json', 'utf8'));
  const expected = [
    ['5', {target: '5', verdict: 'Mean', witness: null, margin: {
      radius: '2/3', toward: 'higher',
      boundary: {target: '17/3', witness: {index: 0, reading: '0'}}}}],
    ['8', {target: '8', verdict: 'Median', witness: null, margin: {
      radius: '1/12', toward: 'lower',
      boundary: {target: '95/12', witness: {index: 4, reading: '10'}}}}]
  ];
  const dir = mkdtempSync(join(tmpdir(), 'target-margin-'));
  try {
    for (const [target, result] of expected) {
      assert.deepEqual(verifier.queryTargetMargin(record, target), result);
      const python = queryPython(record, dir, target);
      assert.equal(python.status, 0, python.stderr);
      assert.match(python.stdout, new RegExp(`Maximal open target radius ${result.margin.radius.replace('/', '\\/')}`));
      assert.match(python.stdout, new RegExp(`at boundary t=${result.margin.boundary.target.replace('/', '\\/')}`));
    }
    for (const target of ['17/3', '6', '95/12']) {
      assert.equal(verifier.queryTargetMargin(record, target).margin, null);
    }
    const reversed = core.horizonCertificate(['0', '0', '0', '0', '0', '10', '10'],
      '0', '10', '0', '0');
    assert.equal(verifier.queryTargetMargin(reversed, '0').verdict, 'Median');
    assert.equal(verifier.queryTargetMargin(reversed, '0').margin.radius, '5/7');
    const blocked = core.horizonCertificate(['48', '49', '50', '51', '85'],
      '0', '100', '48', '52');
    assert.equal(verifier.queryTargetMargin(blocked, '-2000000').margin, null);
    const forged = clone(record); forged.claim.targetHorizon.low = '6';
    assert.throws(() => verifier.queryTargetMargin(forged, '5'));
  } finally {rmSync(dir, {recursive: true, force: true});}
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
    'save-status', 'archive-label', 'target-query-panel', 'query-target', 'query-button', 'query-result'];
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
  assert.equal(elements['target-query-panel'].hidden, true);
  await elements['save-to-archive'].handlers.click();
  assert.deepEqual(saved, [exampleText]);
  elements['receipt-json'].value = readFileSync('examples/target-box-gap-v3.json', 'utf8');
  elements['receipt-json'].handlers.input();
  await elements['verify-button'].handlers.click();
  assert.equal(elements.report.hidden, false);
  assert.match(elements['report-intro'].textContent, /\[-1435\/16, 3885\/16\]/);
  assert.match(elements.routes.children[0].children[3].textContent, /Exact D range/);
  elements['receipt-json'].value = readFileSync('examples/target-box-stability-v4.json', 'utf8');
  elements['receipt-json'].handlers.input();
  await elements['verify-button'].handlers.click();
  assert.match(elements['report-intro'].textContent, /movement of 8/);
  assert.match(elements.routes.children[2].children[3].textContent, /Left threshold/);
  elements['receipt-json'].value = readFileSync('examples/target-box-atlas-v5.json', 'utf8');
  elements['receipt-json'].handlers.input();
  await elements['verify-button'].handlers.click();
  assert.match(elements['report-intro'].textContent, /region strips/);
  assert.equal(elements.routes.children[0].children[3].children[0].textContent,
    'Exact region rules');
  elements['receipt-json'].value = readFileSync('examples/target-horizon-v6.json', 'utf8');
  elements['receipt-json'].handlers.input();
  await elements['verify-button'].handlers.click();
  assert.match(elements['report-intro'].textContent, /target horizon \[17\/3, 95\/12\]/i);
  assert.match(elements['report-intro'].textContent, /move reading 1 to 4/);
  assert.match(elements.routes.children[0].children.at(-2).textContent, /Tie-target endpoints/);
  assert.equal(elements['target-query-panel'].hidden, false);
  assert.equal(elements['query-target'].value, '6');
  elements['query-button'].handlers.click();
  assert.match(elements['query-result'].textContent, /move reading 1 to 4/i);
  elements['query-target'].value = '5.75';
  elements['query-target'].handlers.input();
  assert.doesNotMatch(elements['query-result'].textContent, /move reading/i);
  elements['query-button'].handlers.click();
  assert.match(elements['query-result'].textContent, /Exact target 23\/4.*move reading 1 to 1/i);
  elements['query-target'].value = '8';
  elements['query-button'].handlers.click();
  assert.match(elements['query-result'].textContent, /Median is strictly closer for every/);
  assert.match(elements['query-result'].textContent, /maximal open target margin is 1\/12/);
  assert.match(elements['query-result'].textContent, /move reading 5 to 10 for an exact tie/);
  elements['query-target'].value = '2/4';
  elements['query-button'].handlers.click();
  assert.equal(elements['query-result'].classList.contains('error'), true);
  elements['receipt-json'].value = '{"bad":true}';
  elements['receipt-json'].handlers.input();
  assert.equal(elements.report.hidden, true);
  assert.equal(elements['target-query-panel'].hidden, true);
  assert.equal(elements['query-target'].value, '');
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
