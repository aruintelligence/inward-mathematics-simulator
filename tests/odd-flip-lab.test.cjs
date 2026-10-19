const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {mkdtempSync, writeFileSync, rmSync, readFileSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const core = require('../odd-flip-core.js');
const independent = require('../odd-flip-verifier.js');
const archive = require('../research-archive-core.js');
const strictJson = require('../tools/target-lens-proof-core.js').parseReceipt;

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

test('even central-pair medians yield exact reversible routes across supported sizes', () => {
  const example = core.certificate(['40', '45', '50', '80'], '50');
  assert.equal(example.format, 'inward-even-sample-flip-v3');
  assert.deepEqual(example.inputs.bounds, {low: '0', high: '100'});
  assert.deepEqual(example.claim.best,
    {index: 1, threshold: '130/3', distance: '5/3', witness: '125/3'});
  assert.deepEqual(example, python(['40', '45', '50', '80'], '50'));
  let seed = 0x6e8e4c2d;
  const next = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0;};
  for (let i = 0; i < 28; i++) {
    const count = 4 + 2 * (i % 9);
    const low = i % 3 === 0 ? '-20' : '0', high = i % 3 === 0 ? '60' : '100';
    const readings = Array.from({length: count}, (_, index) => {
      const value = (i % 3 === 0 ? -20 : 0) + next() % 71;
      return index % 4 === 0 ? `${2 * value + 1}/2` : String(value);
    });
    const target = i % 3 === 0 ? String(-30 + next() % 90) : String(next() % 101);
    const actual = i % 3 === 0 ? core.certificate(readings, target, low, high) :
      core.certificate(readings, target);
    const expected = i % 3 === 0 ? python(readings, target, low, high) :
      python(readings, target);
    assert.deepEqual(actual, expected, `even case ${i} at n=${count}`);
  }
  assert.equal(core.certificate(['40','45','55','60'], '50').claim.kind, 'baseline-tie');
});

test('positive affine unit changes preserve every exact certificate route', () => {
  const rational = (numerator, denominator) => {
    const abs = value => value < 0n ? -value : value;
    let a = abs(numerator), b = denominator;
    while (b) [a, b] = [b, a % b];
    const divisor = a;
    const n = numerator / divisor, d = denominator / divisor;
    return d === 1n ? String(n) : `${n}/${d}`;
  };
  const converted = (raw, factor = 3n, shift = -7n) => {
    const [n, d = '1'] = raw.split('/');
    return rational(factor * BigInt(n) + shift * BigInt(d), BigInt(d));
  };
  const image = original => {
    const result = JSON.parse(JSON.stringify(original));
    result.inputs.readings = result.inputs.readings.map(value => converted(value));
    result.inputs.target = converted(result.inputs.target);
    for (const key of ['low', 'high']) result.inputs.bounds[key] = converted(result.inputs.bounds[key]);
    for (const route of result.claim.routes) {
      route.knots = route.knots.map(value => converted(value));
      if (route.threshold !== null) {
        route.threshold = converted(route.threshold);
        route.witness = converted(route.witness);
        route.distance = converted(route.distance, 3n, 0n);
      }
    }
    if (result.claim.best !== null) {
      result.claim.best.threshold = converted(result.claim.best.threshold);
      result.claim.best.witness = converted(result.claim.best.witness);
      result.claim.best.distance = converted(result.claim.best.distance, 3n, 0n);
    }
    return result;
  };
  let seed = 0x37bd29a1;
  const next = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0;};
  for (const count of [3, 4, 5, 6, 20, 21]) {
    const readings = Array.from({length: count}, (_, index) => {
      const value = -10 + next() % 41;
      return index % 3 === 0 ? `${2 * value + 1}/2` : String(value);
    });
    const target = String(-20 + next() % 61);
    const original = core.certificate(readings, target, '-20', '40');
    const changedReadings = readings.map(value => converted(value));
    const changedTarget = converted(target), low = converted('-20'), high = converted('40');
    const changed = core.certificate(changedReadings, changedTarget, low, high);
    assert.deepEqual(changed, image(original), `n=${count}`);
    assert.deepEqual(changed, python(changedReadings, changedTarget, low, high), `Python n=${count}`);
  }
});

test('invalid inputs produce no certificate and the UI keeps values local', () => {
  for (const readings of [['1','2'], ['1','2','-3'],
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
  assert.match(html, /id="even-example"/);
  assert.match(script, /Median: average of central pair/);
  for (const scriptName of ['odd-flip-core.js', 'odd-flip-verifier.js',
    'tools/target-lens-proof-core.js', 'research-archive-core.js', 'odd-flip-lab.js']) {
    const version = html.match(new RegExp(`${scriptName.replaceAll('.', '\\.') }\\?v=([0-9a-f]{12})`));
    assert.ok(version, `${scriptName} must have a content fingerprint`);
    assert.equal(version[1], crypto.createHash('sha256').update(readFileSync(scriptName))
      .digest('hex').slice(0, 12));
  }
  assert.match(html, /role="alert"/);
  assert.match(html, /id="low".*id="high"/s);
  assert.match(script, /textContent/);
  assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|location\.search/);
});

test('lab independently checks before direct local save and clears stale results on edits', async () => {
  function element(tag) {
    return {tag, children: [], handlers: {}, textContent: '', disabled: false, value: '',
      append(...items) { this.children.push(...items); },
      replaceChildren(...items) { this.children = [...items]; },
      setAttribute() {}, addEventListener(event, handler) { this.handlers[event] = handler; }};
  }
  const ids = ['flip-form', 'readings', 'target', 'low', 'high', 'input-facts',
    'result-label', 'result-value', 'result-explanation', 'result-summary', 'routes',
    'download', 'save-local', 'save-status', 'print', 'even-example', 'mean-example',
    'tie-example', 'signed-example', 'input-error'];
  const fields = Object.fromEntries(ids.map(id => [id, element(id)]));
  Object.assign(fields.readings, {value: '48, 49, 50, 51, 85'});
  Object.assign(fields.target, {value: '50'});
  Object.assign(fields.low, {value: '0'});
  Object.assign(fields.high, {value: '100'});
  const saves = [];
  let closed = 0;
  const mockArchive = {
    open: async () => ({close() { closed++; }}),
    add: async (_db, source, label, checkers, cryptoApi) => {
      assert.equal(label, '');
      assert.equal(checkers.sampleReversal, independent);
      assert.equal(checkers.strictJson, strictJson);
      const checked = await archive.inspect(source, null, checkers, cryptoApi);
      saves.push(checked);
      return {created: true, digest: checked.digest};
    }
  };
  vm.runInNewContext(readFileSync('odd-flip-lab.js', 'utf8'), {
    InwardOddFlip: core, InwardOddFlipVerifier: independent,
    InwardResearchArchive: mockArchive, TargetLensVerifier: {parseReceipt: strictJson},
    document: {getElementById: id => fields[id], createElement: element,
      createElementNS: (_ns, tag) => element(tag), body: element('body')},
    crypto: crypto.webcrypto, URL: {createObjectURL: () => 'blob:test', revokeObjectURL() {}},
    Blob, setTimeout: callback => callback(), window: {print() {}}
  }, {timeout: 5000});
  assert.equal(fields.download.disabled, false);
  assert.equal(fields['save-local'].disabled, false);
  await fields['save-local'].handlers.click();
  assert.equal(saves.length, 1);
  assert.equal(saves[0].record.claim.best.threshold, '22');
  assert.match(fields['save-status'].textContent, /Independently checked and saved locally/);
  assert.equal(closed, 1);
  fields.readings.value = '1, 2, 3';
  fields.readings.handlers.input();
  assert.equal(fields.download.disabled, true);
  assert.equal(fields['save-local'].disabled, true);
  assert.equal(fields.routes.children.length, 0);
  await fields['save-local'].handlers.click();
  assert.equal(saves.length, 1);
  fields['flip-form'].handlers.submit({preventDefault() {}});
  assert.equal(fields.download.disabled, false);
  await fields['save-local'].handlers.click();
  assert.equal(saves.length, 2);
  assert.deepEqual(Array.from(saves[1].record.inputs.readings), ['1', '2', '3']);
  let resolveOpen;
  mockArchive.open = () => new Promise(resolve => { resolveOpen = resolve; });
  const pending = fields['save-local'].handlers.click();
  fields.target.value = '4';
  fields.target.handlers.input();
  resolveOpen({close() { closed++; }});
  await pending;
  assert.equal(saves.length, 2, 'changed inputs must not save a waiting action');
  assert.equal(closed, 3);
  assert.equal(fields['save-status'].textContent, '');
  assert.equal(fields['save-local'].disabled, true);
});
