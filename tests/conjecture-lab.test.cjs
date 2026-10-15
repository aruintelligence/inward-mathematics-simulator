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

test('browser view renders exact counterexample maps and clears stale evidence on edit', async () => {
  function element(tag) {
    const classes = new Set();
    return {tag, children: [], handlers: {}, value: '', textContent: '', hidden: false,
      disabled: false, attrs: {}, classList: {add: x => classes.add(x), remove: x => classes.delete(x)},
      setAttribute(name, value) { this.attrs[name] = value; },
      append(...items) { this.children.push(...items); },
      replaceChildren(...items) { this.children = items; },
      addEventListener(name, handler) { this.handlers[name] = handler; },
      focus() {}, click() {}, remove() {}};
  }
  const ids = ['download', 'results', 'headline', 'headline-note', 'search-status',
    'search-form', 'reading-values', 'target-values', 'fraction-example',
    'scope-note', 'ledger', 'cards', 'fingerprint'];
  const fields = Object.fromEntries(ids.map(id => [id, element(id)]));
  fields['reading-values'].value = '0,25,50,75,100';
  fields['target-values'].value = '0,25,50,75,100';
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
  assert.match(html, /unrefuted on this finite grid/i);
  assert.match(html, /tools\/verify_conjecture_experiment\.py/);
  assert.match(html, /prefers-color-scheme:light/);
  assert.match(readFileSync('discovery.html', 'utf8'), /href="conjecture-lab\.html"/);
  assert.match(readFileSync('index.html', 'utf8'), /href="conjecture-lab\.html"/);
});
