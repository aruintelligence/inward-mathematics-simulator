const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync, writeFileSync, mkdtempSync, rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const {spawnSync} = require('node:child_process');
const crypto = require('node:crypto');
const vm = require('node:vm');
const lab = require('../conjecture-lab-core.js');

function check(report, dir) {
  const path = join(dir, 'experiment.json');
  writeFileSync(path, typeof report === 'string' ? report : JSON.stringify(report, null, 2) + '\n');
  return spawnSync('python3', ['tools/verify_conjecture_experiment.py', path], {encoding: 'utf8'});
}
function checkClaim(report, dir) {
  const path = join(dir, 'claim.json');
  writeFileSync(path, typeof report === 'string' ? report : JSON.stringify(report, null, 2) + '\n');
  return spawnSync('python3', ['tools/verify_conditional_claim.py', path], {encoding: 'utf8'});
}
const clone = value => JSON.parse(JSON.stringify(value));

test('default browser search agrees with independently checked public discovery results', () => {
  const report = lab.scan('100,75,50,25,0', '100,75,50,25,0');
  const publicArchive = JSON.parse(readFileSync('examples/discovery-scan-v1.json', 'utf8'));
  assert.equal(report.domain.readingMultisets, 126);
  assert.deepEqual(report.candidates, publicArchive.candidates.slice(0, 4));
  assert.deepEqual(report.candidates.map(x => x.status), [
    'counterexample-found', 'counterexample-found',
    'counterexample-found', 'unrefuted-on-finite-grid']);
  const dir = mkdtempSync(join(tmpdir(), 'conjecture-check-'));
  try { assert.equal(check(report, dir).status, 0); }
  finally { rmSync(dir, {recursive: true, force: true}); }
});

test('independent Python replay accepts deterministic fractional and seeded finite grids', () => {
  const pool = ['0', '1/4', '1/2', '1', '3/2', '2', '25', '50', '100'];
  const dir = mkdtempSync(join(tmpdir(), 'conjecture-grids-'));
  let state = 1607;
  const random = () => (state = (state * 1664525 + 1013904223) >>> 0);
  const shuffled = () => {
    const values = [...pool];
    for (let k = values.length - 1; k > 0; k--) {
      const j = random() % (k + 1);
      [values[k], values[j]] = [values[j], values[k]];
    }
    return values;
  };
  try {
    for (let i = 0; i < 12; i++) {
      const values = shuffled().slice(0, 2 + random() % 5);
      const targets = shuffled().slice(0, 2 + random() % 8);
      const report = lab.scan(values.join(','), targets.join(','));
      const python = check(report, dir);
      assert.equal(python.status, 0, `${i}: ${python.stderr}`);
      assert.match(python.stdout, /Experiment SHA-256: [0-9a-f]{64}/);
    }
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('independent replay rejects invented proof, forged witness, altered count, and duplicate names', () => {
  const base = lab.scan('0,25,50,75,100', '0,25,50,75,100');
  const dir = mkdtempSync(join(tmpdir(), 'conjecture-forge-'));
  try {
    for (const mutation of [
      x => { x.candidates[3].status = 'proved'; },
      x => { x.candidates[0].counterexample.actualWinner = 'median'; },
      x => { x.candidates[2].counterexample.second.target = '0'; },
      x => { x.candidates[1].casesChecked++; },
      x => { x.domain.targetValues[0] = '0/2'; },
      x => { x.domain.readingMultisets = true; },
    ]) {
      const forged = clone(base); mutation(forged);
      assert.notEqual(check(forged, dir).status, 0);
    }
    const duplicate = JSON.stringify(base).replace('"format":', '"format":"fake","format":');
    assert.match(check(duplicate, dir).stderr, /Duplicate JSON key/);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('invalid or oversized grids are rejected before a mathematical claim is shown', () => {
  for (const [readings, targets] of [
    ['0', '0,1'], ['0,0,1', '0,1'], ['0,1/2', '0,1/2,1/2'],
    ['0,101', '0,1'], ['0,1/0', '0,1'], ['0,2/4', '0,1'],
    ['0,1.5', '0,1'], ['0,1,2,3,4,5,6', '0,1'],
  ]) assert.throws(() => lab.scan(readings, targets));
});

test('every supported condition and prediction has an independently replayed status', () => {
  const conditions = ['any-target', 'target-at-or-below-midpoint', 'target-at-or-above-midpoint',
    'target-at-or-below-both', 'target-at-or-above-both'];
  const predictions = ['lower-no-worse', 'higher-no-worse', 'mean-no-worse', 'median-no-worse'];
  const dir = mkdtempSync(join(tmpdir(), 'conditional-claims-'));
  try {
    let proved = 0, refuted = 0;
    for (const readingCount of [3, 4, 5, 6, 7]) for (const condition of conditions) for (const prediction of predictions) {
      const report = lab.compose('0,25,50,75,100', '0,25,50,75,100', condition, prediction, readingCount);
      const verified = checkClaim(report, dir);
      assert.equal(verified.status, 0, `${readingCount}/${condition}/${prediction}: ${verified.stderr}`);
      assert.equal(report.domain.readingCount, readingCount);
      assert.equal(report.domain.medianRule, 'central-order-statistics-v1');
      assert.equal(report.classification.counterexample?.readings.length || readingCount, readingCount);
      if (report.proof) {
        assert.equal(report.search.status, 'proved-by-algebra');
        assert.equal(report.search.counterexample, null);
        assert.match(report.formal.declaration, /^InwardFormal\./);
        assert.deepEqual(report.classification, {status: 'proved-by-algebra', counterexample: null});
        proved++;
      } else {
        assert.equal(report.formal, null);
        assert.equal(report.search.status, 'counterexample-found');
        assert.equal(report.classification.status, 'refuted-by-exact-witness');
        assert.ok(report.classification.counterexample);
        refuted++;
      }
    }
    assert.equal(proved, 20, 'only four sign arguments for each supported count may claim a general proof');
    assert.equal(refuted, 80, 'each remaining universal pair has a concrete exact witness for every count');
    const narrow = lab.compose('0,100', '0,1', 'target-at-or-above-both', 'mean-no-worse');
    assert.equal(checkClaim(narrow, dir).status, 0);
    assert.equal(narrow.search.status, 'unrefuted-on-finite-grid');
    assert.equal(narrow.classification.status, 'refuted-by-exact-witness');
    const noCases = lab.compose('50,100', '0,1', 'target-at-or-above-both', 'mean-no-worse');
    assert.equal(checkClaim(noCases, dir).status, 0);
    assert.equal(noCases.search.casesChecked, 0);
    assert.equal(noCases.classification.status, 'refuted-by-exact-witness');
    const proofWithoutGridCases = lab.compose('50,100', '0,1',
      'target-at-or-above-both', 'higher-no-worse');
    assert.equal(proofWithoutGridCases.search.casesChecked, 0);
    assert.equal(proofWithoutGridCases.search.status, 'proved-by-algebra');
    assert.equal(checkClaim(proofWithoutGridCases, dir).status, 0);
    const pool = ['0', '1/4', '1/2', '1', '3/2', '2', '25', '50', '100'];
    for (let index = 0; index < 8; index++) {
      const readings = pool.filter((_, i) => i % 3 !== index % 3);
      const targets = pool.filter((_, i) => i % 4 !== index % 4);
      const report = lab.compose(readings.join(','), targets.join(','),
        conditions[(index * 3) % conditions.length], predictions[(index * 7) % predictions.length],
        [3, 4, 5, 6, 7][index % 5]);
      const verified = checkClaim(report, dir);
      assert.equal(verified.status, 0, `fractional case ${index}: ${verified.stderr}`);
    }
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('published v5 examples reproduce exact bytes while v2/v3/v4 examples remain checkable', () => {
  const regenerated = lab.compose('0,25,50,75,100', '0,25,50,75,100',
    'target-at-or-below-midpoint', 'lower-no-worse', 6);
  const source = JSON.stringify(regenerated, null, 2) + '\n';
  assert.equal(readFileSync('examples/conditional-claim-v5.json', 'utf8'), source);
  const dir = mkdtempSync(join(tmpdir(), 'theorem-bound-example-'));
  try {
    const verified = checkClaim(source, dir);
    assert.equal(verified.status, 0, verified.stderr);
    assert.match(verified.stdout, /Verified proved-by-algebra; [0-9]+ exact eligible cases/);
    const refuted = lab.compose('0,1,2', '1/4,1/2', 'any-target', 'mean-no-worse', 4);
    const refutedSource = JSON.stringify(refuted, null, 2) + '\n';
    assert.equal(readFileSync('examples/conditional-claim-v5-even-witness.json', 'utf8'), refutedSource);
    assert.equal(refuted.search.counterexample.median, '1/2');
    assert.equal(refuted.search.counterexample.mean, '3/4');
    assert.match(checkClaim(refutedSource, dir).stdout, /Verified refuted-by-exact-witness/);
    assert.equal(checkClaim(readFileSync('examples/conditional-claim-v2.json', 'utf8'), dir).status, 0);
    for (const name of ['conditional-claim-v3.json', 'conditional-claim-v3-grid-miss.json',
      'conditional-claim-v4.json', 'conditional-claim-v4-grid-miss.json']) {
      assert.equal(checkClaim(readFileSync(`examples/${name}`, 'utf8'), dir).status, 0);
    }
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('independent checker rejects forged universal proof, witness, status, inputs, and duplicate keys', () => {
  const proved = lab.compose('0,25,50,75,100', '0,25,50,75,100',
    'target-at-or-below-midpoint', 'lower-no-worse');
  const refuted = lab.compose('0,25,50,75,100', '0,25,50,75,100',
    'any-target', 'mean-no-worse');
  const dir = mkdtempSync(join(tmpdir(), 'claim-forge-'));
  try {
    for (const [base, mutate] of [
      [proved, x => { x.proof.identity.expanded['a*t'] = -3; }],
      [proved, x => { x.proof.identity.expanded['a^2'] = true; }],
      [proved, x => { x.proof.factorSigns[1] = 'nonpositive'; }],
      [proved, x => { x.claim.condition = 'any-target'; }],
      [proved, x => { x.search.status = 'unrefuted-on-finite-grid'; }],
      [proved, x => { x.formal.declaration = 'InwardFormal.higher_no_worse_at_midpoint'; }],
      [proved, x => { x.formal.sourceCommit = '0'.repeat(40); }],
      [proved, x => { delete x.formal; }],
      [proved, x => { x.classification.status = 'refuted-by-exact-witness'; }],
      [proved, x => { x.classification.counterexample = clone(refuted.classification.counterexample); }],
      [refuted, x => { x.proof = clone(proved.proof); }],
      [refuted, x => { x.formal = clone(proved.formal); }],
      [refuted, x => { x.classification.counterexample.target = '100'; }],
      [refuted, x => { delete x.classification; }],
      [refuted, x => { x.search.counterexample.target = '100'; }],
      [refuted, x => { x.domain.readingMultisets = true; }],
      [refuted, x => { x.domain.readingCount = 4; }],
      [refuted, x => { x.domain.readingCount = '5'; }],
      [refuted, x => { x.domain.readingCount = 7; }],
      [refuted, x => { delete x.domain.readingCount; }],
      [refuted, x => { x.domain.medianRule = 'upper-central'; }],
      [refuted, x => { delete x.domain.medianRule; }],
      [refuted, x => { x.claim.statement = x.claim.statement.replace('5 real', 'seven real'); }],
    ]) {
      const forged = clone(base); mutate(forged);
      assert.notEqual(checkClaim(forged, dir).status, 0);
    }
    const duplicate = JSON.stringify(proved).replace('"format":', '"format":"fake","format":');
    assert.match(checkClaim(duplicate, dir).stderr, /Duplicate JSON key/);
    const floating = JSON.stringify(proved).replace('"a^2":1', '"a^2":1.0');
    assert.match(checkClaim(floating, dir).stderr, /coefficients must be integers/);
    const legacy = clone(proved);
    legacy.format = 'inward-conditional-claim-v1';
    delete legacy.domain.readingCount;
    delete legacy.domain.medianRule;
    legacy.claim.statement = legacy.claim.statement.replace('5 real', 'five real');
    delete legacy.formal;
    delete legacy.classification;
    assert.equal(checkClaim(legacy, dir).status, 0, 'existing v1 receipts remain checkable');
    legacy.formal = clone(proved.formal);
    assert.notEqual(checkClaim(legacy, dir).status, 0, 'v1 does not silently accept new fields');
    const even = lab.compose('0,1,2', '1/4,1/2', 'any-target', 'mean-no-worse', 4);
    const forgedV4 = clone(even);
    forgedV4.format = 'inward-conditional-claim-v4';
    delete forgedV4.domain.medianRule;
    assert.notEqual(checkClaim(forgedV4, dir).status, 0, 'v4 retains its odd-only interpretation');
    const wrongMedian = clone(even);
    wrongMedian.search.counterexample.median = '1';
    assert.notEqual(checkClaim(wrongMedian, dir).status, 0, 'central-pair average is replayed independently');
    for (const count of [0, 2, 8, '7', null, true]) {
      assert.throws(() => lab.compose('0,1', '0,1', 'any-target', 'mean-no-worse', count));
    }
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('browser view renders exact counterexample maps and clears stale evidence on edit', async () => {
  function element(tag) {
    const classes = new Set();
    return {tag, children: [], handlers: {}, value: '', textContent: '', hidden: false,
      disabled: false, attrs: {}, classList: {add: x => classes.add(x), remove: x => classes.delete(x),
        toggle: (x, enabled) => enabled ? classes.add(x) : classes.delete(x)},
      setAttribute(name, value) { this.attrs[name] = value; },
      append(...items) { this.children.push(...items); },
      replaceChildren(...items) { this.children = items; },
      addEventListener(name, handler) { this.handlers[name] = handler; },
      focus() {}, click() {}, remove() {}};
  }
  const ids = ['download', 'results', 'headline', 'headline-note', 'search-status',
    'search-form', 'reading-values', 'target-values', 'fraction-example',
    'scope-note', 'ledger', 'cards', 'fingerprint', 'claim-form', 'claim-condition', 'claim-reading-count',
    'claim-prediction', 'claim-download', 'claim-results', 'claim-status', 'claim-title',
    'claim-badge', 'claim-count', 'claim-summary', 'claim-proof', 'claim-plot', 'claim-crossover', 'claim-fingerprint',
    'claim-formal-link', 'claim-formal-ref'];
  const fields = Object.fromEntries(ids.map(id => [id, element(id)]));
  fields['reading-values'].value = '0,25,50,75,100';
  fields['target-values'].value = '0,25,50,75,100';
  fields['claim-condition'].value = 'target-at-or-below-midpoint';
  fields['claim-prediction'].value = 'lower-no-worse';
  fields['claim-reading-count'].value = '5';
  vm.runInNewContext(readFileSync('conjecture-lab.js', 'utf8'),
    {document: {getElementById: id => fields[id], createElement: element,
      createElementNS: (_uri, tag) => element(tag), body: element('body')},
    InwardConjectureLab: lab, crypto: crypto.webcrypto, TextEncoder, Uint8Array,
    URL: {createObjectURL: () => 'blob:test', revokeObjectURL() {}}, Blob, setTimeout},
    {timeout: 5000});
  await fields['search-form'].handlers.submit({preventDefault() {}});
  assert.equal(fields.headline.textContent, '3 / 4');
  assert.equal(fields.cards.children.length, 4);
  assert.equal(fields.cards.children[0].children.filter(x => x.tag === 'figure').length, 1);
  assert.equal(fields.cards.children[2].children.filter(x => x.tag === 'figure').length, 2);
  assert.match(fields.fingerprint.textContent, /SHA-256 of exported JSON bytes: [0-9a-f]{64}/);
  assert.equal(fields.results.hidden, false);
  await fields['claim-form'].handlers.submit({preventDefault() {}});
  assert.equal(fields['claim-badge'].textContent, 'General algebraic proof');
  assert.match(fields['claim-proof'].textContent, /a−b ≤ 0/);
  assert.match(fields['claim-summary'].textContent, /proved in Lean/);
  assert.equal(fields['claim-formal-link'].hidden, false);
  assert.match(fields['claim-formal-ref'].textContent, /InwardFormal\.lower_no_worse_at_midpoint/);
  assert.match(fields['claim-formal-link'].href, /blob\/59a7e9dccd3cc328f855fc1fce1d6b6d55fdd705/);
  assert.equal(fields['claim-crossover'].hidden, true);
  assert.match(fields['claim-fingerprint'].textContent, /[0-9a-f]{64}/);
  fields['claim-reading-count'].value = '7';
  fields['claim-reading-count'].handlers.change();
  assert.equal(fields['claim-results'].hidden, true);
  await fields['claim-form'].handlers.submit({preventDefault() {}});
  assert.match(fields['claim-title'].textContent, /For any 7 real readings/);
  assert.match(fields['claim-count'].textContent, /7-reading multisets/);
  fields['claim-reading-count'].value = '4';
  fields['claim-reading-count'].handlers.change();
  await fields['claim-form'].handlers.submit({preventDefault() {}});
  assert.match(fields['claim-title'].textContent, /For any 4 real readings/);
  assert.match(fields['claim-count'].textContent, /4-reading multisets/);
  fields['claim-reading-count'].value = '5';
  fields['claim-prediction'].value = 'higher-no-worse';
  fields['claim-prediction'].handlers.change();
  assert.equal(fields['claim-results'].hidden, true);
  assert.equal(fields['claim-formal-link'].hidden, true);
  assert.equal(fields['claim-formal-ref'].hidden, true);
  await fields['claim-form'].handlers.submit({preventDefault() {}});
  assert.equal(fields['claim-badge'].textContent, 'Universal claim refuted');
  assert.equal(fields['claim-formal-link'].hidden, true);
  assert.equal(fields['claim-plot'].children.length, 1);
  assert.equal(fields['claim-crossover'].hidden, false);
  const crossover = fields['claim-crossover'].children[0];
  assert.match(crossover.children[0].textContent, /crossover for these readings: 5\/2/);
  assert.deepEqual(crossover.children[1].children.map(region => region.children.map(x => x.textContent)), [
    ['t < 5/2', 'Median strictly closer'],
    ['t = 5/2', 'Equal error'],
    ['t > 5/2', 'Mean strictly closer'],
  ]);
  fields['fraction-example'].handlers.click();
  assert.equal(fields['claim-crossover'].hidden, true);
  fields['claim-condition'].value = 'any-target';
  fields['claim-prediction'].value = 'mean-no-worse';
  await fields['claim-form'].handlers.submit({preventDefault() {}});
  assert.match(fields['claim-crossover'].children[0].children[0].textContent, /crossover for these readings: 1\/20/);
  await fields['search-form'].handlers.submit({preventDefault() {}});
  const figure = fields.cards.children[0].children.find(x => x.tag === 'figure');
  const svg = figure.children.find(x => x.tag === 'svg');
  const target = svg.children.find(x => x.tag === 'line' && x.attrs.stroke === '#ffca73');
  assert.equal(Number(target.attrs.x1), 90, 'target 1/4 spans one eighth of the chosen 0–2 domain');
  assert.equal(svg.children.at(-1).textContent, '2');
  fields['reading-values'].value = '50,100';
  fields['target-values'].value = '0,1';
  fields['claim-condition'].value = 'target-at-or-above-both';
  fields['claim-prediction'].value = 'mean-no-worse';
  await fields['claim-form'].handlers.submit({preventDefault() {}});
  assert.equal(fields['claim-badge'].textContent, 'Universal claim refuted');
  assert.match(fields['claim-count'].textContent, /0 eligible exact cases/);
  assert.match(fields['claim-summary'].textContent, /fixed 0, 50, 100 witness basis/);
  assert.match(fields['claim-proof'].textContent, /chosen grid missed/);
  assert.equal(fields['claim-plot'].children.length, 1);
  assert.equal(fields['claim-crossover'].hidden, false);
  fields['reading-values'].value = '0,1/2';
  fields['reading-values'].handlers.input();
  assert.equal(fields.results.hidden, true);
  assert.equal(fields.download.disabled, true);
  fields['reading-values'].value = '0,0,1';
  await fields['search-form'].handlers.submit({preventDefault() {}});
  assert.match(fields['search-status'].textContent, /duplicate/);
  assert.equal(fields.results.hidden, true);
});

test('published page fingerprints exact scripts and explains finite evidence limits', () => {
  const html = readFileSync('conjecture-lab.html', 'utf8');
  for (const script of ['conjecture-lab-core.js', 'conjecture-lab.js']) {
    const version = html.match(new RegExp(`${script.replace('.', '\\.') }\\?v=([0-9a-f]{12})`));
    assert.ok(version);
    assert.equal(version[1], crypto.createHash('sha256').update(readFileSync(script)).digest('hex').slice(0, 12));
  }
  assert.match(html, /unrefuted on that finite grid/i);
  assert.match(html, /tools\/verify_conjecture_experiment\.py/);
  assert.match(html, /tools\/verify_conditional_claim\.py/);
  assert.match(html, /id="claim-formal-link"[^>]+hidden/);
  assert.match(html, /id="claim-crossover" hidden/);
  assert.match(html, /id="claim-formal-ref"[^>]+hidden/);
  assert.match(html, /id="claim-reading-count"/);
  assert.match(html, /prefers-color-scheme:light/);
  assert.match(readFileSync('discovery.html', 'utf8'), /href="conjecture-lab\.html"/);
  assert.match(readFileSync('index.html', 'utf8'), /href="conjecture-lab\.html"/);
});
