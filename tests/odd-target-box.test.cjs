const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {mkdtempSync, writeFileSync, rmSync, readFileSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const vm = require('node:vm');
const core = require('../odd-target-box-core.js');

function python(values, low, high, targetLow, targetHigh) {
  const run = spawnSync('python3', ['tools/odd_target_box.py',
    `--readings=${values.join(',')}`, `--low=${low}`, `--high=${high}`,
    `--target-low=${targetLow}`, `--target-high=${targetHigh}`], {encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

test('browser and Python construct identical exact records', () => {
  const readings = ['48', '49', '50', '51', '85'];
  const cert = core.certificate(readings, '0', '100', '48', '52');
  assert.deepEqual(cert, python(readings, '0', '100', '48', '52'));
  assert.deepEqual(cert, JSON.parse(readFileSync('examples/odd-target-box-v1.json', 'utf8')));
  const dir = mkdtempSync(join(tmpdir(), 'inward-target-box-'));
  try {
    const file = join(dir, 'certificate.json');
    writeFileSync(file, JSON.stringify(cert));
    const check = spawnSync('python3', ['tools/verify_odd_target_box.py', file], {encoding: 'utf8'});
    assert.equal(check.status, 0, check.stderr);
    assert.match(check.stdout, /Verified 5 exhaustive routes/);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('seeded signed and rational cases match Python including singleton targets', () => {
  let seed = 0x5a7a2912;
  const next = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0;};
  for (let i = 0; i < 34; i++) {
    const low = -20 - next() % 30, high = 25 + next() % 30;
    const values = Array.from({length: 3 + 2 * (i % 10)}, (_, index) => {
      const value = low + next() % (high - low);
      return index % 4 === 0 ? `${2 * value + 1}/2` : String(value);
    });
    const targets = [String(-50 + next() % 100), String(-50 + next() % 100)].sort((a, b) => +a - +b);
    if (i % 5 === 0) targets[1] = targets[0];
    assert.deepEqual(core.certificate(values, String(low), String(high), ...targets),
      python(values, String(low), String(high), ...targets), `case ${i}`);
  }
  assert.equal(core.position('1999999999/2000', '999999999/1000', '1000000'), 0.5);
});

test('bad bounds, input, and browser disclosure patterns are rejected', () => {
  const base = ['0', '1', '2'];
  for (const args of [[base, '0', '0', '0', '1'], [base, '0', '2', '2', '1'],
    [base, '0', '2', '1000001', '1000001'], [base, '1', '2', '0', '1'],
    [['0', '1'], '0', '2', '0', '1'], [['0', '1', '2.1234567'], '0', '3', '0', '1']]) {
    assert.throws(() => core.certificate(...args));
  }
  const html = readFileSync('odd-target-box.html', 'utf8');
  const script = readFileSync('odd-target-box.js', 'utf8');
  assert.match(html, /role="alert"/);
  assert.match(html, /odd-target-box-core\.js/);
  assert.match(script, /textContent/);
  assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|location\.search/);
});

test('workbench renders every route and clears stale results on an invalid edit', () => {
  function element(tag) {
    return {tag, children: [], handlers: {}, textContent: '', disabled: false,
      append(...nodes) { this.children.push(...nodes); },
      replaceChildren(...nodes) { this.children = [...nodes]; },
      setAttribute() {},
      addEventListener(name, handler) { this.handlers[name] = handler; },
      scrollIntoView() {}, remove() {}, click() { this.handlers.click?.(); }};
  }
  const fields = Object.fromEntries(['box-form', 'readings', 'move-low', 'move-high',
    'target-low', 'target-high', 'input-error', 'headline', 'headline-detail',
    'summary-copy', 'facts', 'routes', 'download', 'print', 'locked-example',
    'signed-example', 'results'].map(id => [id, element(id)]));
  Object.assign(fields.readings, {value: '48, 49, 50, 51, 85'});
  Object.assign(fields['move-low'], {value: '0'});
  Object.assign(fields['move-high'], {value: '100'});
  Object.assign(fields['target-low'], {value: '48'});
  Object.assign(fields['target-high'], {value: '52'});
  const document = {getElementById: id => fields[id], createElement: element,
    createElementNS: (_, tag) => element(tag), createTextNode: text => element(`#text:${text}`),
    body: element('body')};
  vm.runInNewContext(readFileSync('odd-target-box.js', 'utf8'),
    {document, InwardTargetBox: core, setTimeout() {},
      window: {print() {}}, URL: {createObjectURL() {return 'blob:test';}, revokeObjectURL() {}},
      Blob}, {timeout: 5000});
  assert.equal(fields.routes.children.length, 5);
  assert.equal(fields.download.disabled, false);
  assert.equal(fields.headline.textContent, '3 reachable outcomes');
  assert.equal(fields['input-error'].textContent, '');
  fields['locked-example'].handlers.click();
  assert.match(fields['headline-detail'].textContent, /2 of 5 individual routes/);
  assert.equal(fields.routes.children.length, 5);
  fields['target-low'].value = '52'; fields['target-high'].value = '48';
  fields['box-form'].handlers.submit({preventDefault() {}});
  assert.equal(fields.routes.children.length, 0);
  assert.equal(fields.download.disabled, true);
  assert.match(fields['input-error'].textContent, /Target bounds must be ordered/);
});
