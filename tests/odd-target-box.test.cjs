const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {mkdtempSync, writeFileSync, rmSync, readFileSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const core = require('../odd-target-box-core.js');
const verifier = require('../odd-target-box-verifier.js');

function python(values, low, high, targetLow, targetHigh, mode = '') {
  const run = spawnSync('python3', ['tools/odd_target_box.py', ...(mode ? [mode === 'gap' || mode === true ?
    '--gap-envelope' : mode === 'atlas' ? '--region-atlas' : mode === 'horizon' ?
      '--target-horizon' : '--stability-radius'] : []),
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

test('v5 decision-region atlas has exact cross-language strips for odd, even, and singleton targets', () => {
  const values = ['48', '49', '50', '51', '85'];
  const record = core.atlasCertificate(values, '0', '100', '48', '52');
  assert.deepEqual(record, JSON.parse(readFileSync('examples/target-box-atlas-v5.json')));
  assert.deepEqual(record, python(values, '0', '100', '48', '52', 'atlas'));
  assert.equal(verifier.verify(record).atlas, true);
  assert.ok(record.claim.routes.some(route => route.region.verticalTies.length));
  const singleton = core.atlasCertificate(['0', '1', '2'], '0', '2', '1', '1');
  assert.deepEqual(singleton, python(['0', '1', '2'], '0', '2', '1', '1', 'atlas'));
  assert.equal(verifier.verify(singleton).atlas, true);
  const even = core.atlasCertificate(['40', '45', '50', '80'], '0', '100', '48', '52');
  assert.deepEqual(even, python(['40', '45', '50', '80'], '0', '100', '48', '52', 'atlas'));
  assert.equal(verifier.verify(even).routes, 4);
  let seed = 0x8143ab76;
  const next = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0;};
  for (let i = 0; i < 18; i++) {
    const n = 3 + i % 19;
    const readings = Array.from({length: n}, (_, j) => j % 3 === 0 ?
      `${2 * (next() % 21) - 19}/2` : String(next() % 21 - 10));
    const [a, b] = [next() % 31 - 15, next() % 31 - 15].sort((x, y) => x - y);
    const tHigh = i % 4 === 0 ? a : b;
    const atlas = core.atlasCertificate(readings, '-12', '12', String(a), String(tHigh));
    assert.deepEqual(atlas, python(readings, '-12', '12', String(a), String(tHigh), 'atlas'), `case ${i}`);
    assert.equal(verifier.verify(atlas).atlas, true);
  }
});

test('v6 target horizon solves strict target sides and constructs exact tie probes', () => {
  const values = ['8', '6', '8', '7', '0', '8'];
  const cases = [['6', '6', 'Tie'], ['5', '5', 'Mean'], ['8', '8', 'Median'],
    ['17/3', '17/3', 'Tie'], ['95/12', '95/12', 'Tie']];
  for (const [a, b, expected] of cases) {
    const record = core.horizonCertificate(values, '0', '10', a, b);
    assert.deepEqual(record, python(values, '0', '10', a, b, 'horizon'));
    assert.deepEqual([record.claim.targetHorizon.low, record.claim.targetHorizon.high],
      ['17/3', '95/12']);
    assert.equal(record.claim.targetHorizon.probe.verdict, expected);
    assert.equal(verifier.verify(record).targetHorizon.probe.verdict, expected);
    if (expected === 'Tie') assert.ok(record.claim.targetHorizon.probe.witness);
  }
  const fixture = core.horizonCertificate(values, '0', '10', '6', '6');
  assert.deepEqual(fixture, JSON.parse(readFileSync('examples/target-horizon-v6.json')));
  assert.deepEqual(fixture.claim.targetHorizon.probe.witness, {index: 0, reading: '4'});
  const blocked = core.horizonCertificate(['48', '49', '50', '51', '85'],
    '0', '100', '48', '52');
  assert.deepEqual(blocked, python(['48', '49', '50', '51', '85'],
    '0', '100', '48', '52', 'horizon'));
  assert.deepEqual(blocked.claim.targetHorizon.allTargetTie, {index: 0, reading: '15'});
  assert.equal(blocked.claim.targetHorizon.below, null);
  assert.equal(verifier.verify(blocked).targetHorizon.probe.verdict, 'Tie');
  const even = core.horizonCertificate(['40', '45', '50', '80'], '0', '100', '48', '52');
  assert.deepEqual(even, python(['40', '45', '50', '80'], '0', '100', '48', '52', 'horizon'));
  assert.equal(verifier.verify(even).routes, 4);
  let seed = 0x6027a65a;
  const next = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0;};
  for (let i = 0; i < 20; i++) {
    const n = 3 + i % 19;
    const readings = Array.from({length: n}, (_, j) => j % 3 === 0 ?
      `${2 * (next() % 21) - 19}/2` : String(next() % 21 - 10));
    const [a, b] = [next() % 31 - 15, next() % 31 - 15].sort((x, y) => x - y);
    const high = i % 4 === 0 ? a : b;
    const record = core.horizonCertificate(readings, '-12', '12', String(a), String(high));
    assert.deepEqual(record, python(readings, '-12', '12', String(a), String(high), 'horizon'),
      `case ${i}`);
    assert.equal(verifier.verify(record).routes, n);
  }
});

test('v4 first-failure certificate agrees with Python for odd, even, and boundary cases', () => {
  const caseValues = ['48', '49', '50', '51', '85'];
  const record = core.stabilityCertificate(caseValues, '0', '100', '48', '52');
  assert.deepEqual(record, JSON.parse(readFileSync('examples/target-box-stability-v4.json')));
  assert.deepEqual(record, python(caseValues, '0', '100', '48', '52', 'stability'));
  assert.deepEqual(record.claim.stability, {baseline: 'Median', nearestFailure:
    {distance: '8', index: 2, side: 'left', reading: '42', target: '52'}});
  assert.deepEqual(record.claim.routes[2].stability.right,
    {limit: '100', included: true, witness: null});
  assert.equal(core.stabilityCertificate(caseValues, '0', '100', '49', '51')
    .claim.stability.nearestFailure.distance, '18');
  assert.equal(core.stabilityCertificate(caseValues, '0', '100', '50', '50')
    .claim.stability.nearestFailure.distance, '28');
  assert.equal(verifier.verify(record).stability.nearestFailure.distance, '8');
  const protectedCase = core.stabilityCertificate(['8', '6', '8', '7', '0', '8'],
    '0', '10', '30', '40');
  assert.deepEqual(protectedCase,
    python(['8', '6', '8', '7', '0', '8'], '0', '10', '30', '40', 'stability'));
  assert.equal(protectedCase.claim.stability.baseline, 'Median');
  assert.equal(protectedCase.claim.stability.nearestFailure, null);
  assert.equal(verifier.verify(protectedCase).routes, 6);
  const startingTie = core.stabilityCertificate(['40', '45', '50', '80'],
    '0', '100', '48', '52');
  assert.deepEqual(startingTie,
    python(['40', '45', '50', '80'], '0', '100', '48', '52', 'stability'));
  assert.equal(startingTie.claim.stability.nearestFailure.distance, '0');
  assert.equal(startingTie.claim.stability.nearestFailure.target, '405/8');
  assert.equal(verifier.verify(startingTie).routes, 4);
  let seed = 0x4e7379a2;
  const next = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0;};
  for (let i = 0; i < 24; i++) {
    const n = 3 + i % 19;
    const values = Array.from({length: n}, (_, j) => j % 3 === 0 ?
      `${2 * (next() % 41) - 39}/2` : String(next() % 41 - 20));
    const [a, b] = [next() % 41 - 20, next() % 41 - 20].sort((x, y) => x - y);
    const high = i % 5 === 0 ? a : b;
    const actual = core.stabilityCertificate(values, '-25', '25', String(a), String(high));
    assert.deepEqual(actual, python(values, '-25', '25', String(a), String(high), 'stability'),
      `case ${i}`);
    assert.equal(verifier.verify(actual).routes, n);
  }
});

test('v3 exact gap envelope agrees with Python and includes interior quadratic vertices', () => {
  const fixture = core.gapCertificate(['40', '45', '50', '80'], '0', '100', '48', '52');
  assert.equal(fixture.format, 'inward-target-box-gap-v3');
  assert.deepEqual(fixture, JSON.parse(readFileSync('examples/target-box-gap-v3.json', 'utf8')));
  assert.deepEqual(fixture, python(['40', '45', '50', '80'], '0', '100', '48', '52', true));
  assert.deepEqual(fixture.claim.gap, {
    min: {value: '-1435/16', index: 2, reading: '40', target: '52'},
    max: {value: '3885/16', index: 3, reading: '0', target: '52'}
  });
  const vertex = core.gapCertificate(['11', '20', '4', '2', '5'], '0', '20', '6', '9');
  assert.deepEqual(vertex, python(['11', '20', '4', '2', '5'], '0', '20', '6', '9', true));
  assert.deepEqual(vertex.claim.routes[2].gap.max,
    {value: '49/6', reading: '79/12', target: '6'});
  assert.ok(!vertex.claim.routes[2].knots.includes('79/12'));
  assert.equal(verifier.verify(vertex).routes, 5);
  const protectedCase = core.gapCertificate(['8', '6', '8', '7', '0', '8'],
    '0', '10', '30', '40');
  assert.equal(protectedCase.claim.guarantee, 'Median');
  assert.equal(protectedCase.claim.gap.min.value, '265/36');
  assert.deepEqual(protectedCase,
    python(['8', '6', '8', '7', '0', '8'], '0', '10', '30', '40', true));
  assert.equal(verifier.verify(protectedCase).guarantee, 'Median');
  let seed = 0x826c8a43;
  const next = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0;};
  for (let i = 0; i < 18; i++) {
    const count = 3 + i;
    const values = Array.from({length: count}, (_, j) => j % 3 === 0 ?
      `${2 * (next() % 21) + 1}/2` : String(next() % 21));
    const [a, b] = [next() % 25, next() % 25].sort((x, y) => x - y).map(String);
    const actual = core.gapCertificate(values, '0', '25', a, b);
    assert.deepEqual(actual, python(values, '0', '25', a, b, true), `case ${i}`);
    assert.equal(verifier.verify(actual).routes, count);
  }
});

test('even central-pair rectangles have reproducible exact certificates', () => {
  const values = ['40', '45', '50', '80'];
  const cert = core.certificate(values, '0', '100', '48', '52');
  assert.equal(cert.format, 'inward-even-target-box-v2');
  assert.deepEqual(cert, python(values, '0', '100', '48', '52'));
  assert.deepEqual(cert, JSON.parse(readFileSync('examples/even-target-box-v2.json', 'utf8')));
  const dir = mkdtempSync(join(tmpdir(), 'inward-even-target-box-'));
  try {
    const file = join(dir, 'certificate.json');
    writeFileSync(file, JSON.stringify(cert));
    const check = spawnSync('python3', ['tools/verify_odd_target_box.py', file], {encoding: 'utf8'});
    assert.equal(check.status, 0, check.stderr);
    assert.match(check.stdout, /Verified 4 exhaustive routes/);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('seeded signed and rational cases match Python including singleton targets', () => {
  let seed = 0x5a7a2912;
  const next = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0;};
  for (let i = 0; i < 34; i++) {
    const low = -20 - next() % 30, high = 25 + next() % 30;
    const values = Array.from({length: 3 + i % 19}, (_, index) => {
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

test('published scripts use their exact content fingerprints', () => {
  const html = readFileSync('odd-target-box.html', 'utf8');
  for (const script of ['odd-target-box-core.js', 'odd-target-box.js']) {
    const version = html.match(new RegExp(`${script.replace('.', '\\.') }\\?v=([0-9a-f]{12})`));
    assert.ok(version, `${script} must have a versioned URL`);
    const hash = crypto.createHash('sha256').update(readFileSync(script)).digest('hex').slice(0, 12);
    assert.equal(version[1], hash, `${script} URL must change with its bytes`);
  }
});

test('workbench renders every route and clears stale results on an invalid edit', () => {
  function element(tag) {
    return {tag, children: [], handlers: {}, attrs: {}, textContent: '', disabled: false,
      append(...nodes) { this.children.push(...nodes); },
      replaceChildren(...nodes) { this.children = [...nodes]; },
      setAttribute(name, value) { this.attrs[name] = value; },
      addEventListener(name, handler) { this.handlers[name] = handler; },
      scrollIntoView() {}, remove() {}, click() { this.handlers.click?.(); }};
  }
  const fields = Object.fromEntries(['box-form', 'readings', 'move-low', 'move-high',
    'target-low', 'target-high', 'input-error', 'headline', 'headline-detail',
    'summary-copy', 'gap-summary', 'stability-summary', 'horizon-summary', 'horizon-visual',
    'facts', 'routes', 'download', 'print', 'quantify',
    'first-failure', 'region-atlas', 'target-horizon', 'locked-example',
    'signed-example', 'even-example', 'results'].map(id => [id, element(id)]));
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
  fields.quantify.handlers.click();
  assert.match(fields['gap-summary'].textContent, /spans \[/);
  assert.match(fields.routes.children[0].children.at(-1).textContent, /Exact D range/);
  fields['first-failure'].handlers.click();
  assert.match(fields['stability-summary'].textContent, /movement of 8/);
  assert.match(fields.routes.children[2].children.at(-1).textContent, /safe region/);
  fields['region-atlas'].handlers.click();
  assert.equal(fields.routes.children[0].children[3].children[0].textContent,
    'Read exact region rules');
  assert.ok(fields.routes.children[0].children[2].children[0].children.some(node =>
    node.tag === 'polygon'));
  const drawn = fields.routes.children[0].children[2].children[0].children;
  const patches = drawn.filter(node => node.tag === 'polygon');
  assert.equal(patches[0].attrs.fill, 'var(--map-mean)');
  assert.equal(patches[1].attrs.fill, 'var(--map-median)');
  assert.match(patches[0].attrs.points, /^45,164 123,164 /);
  assert.ok(drawn.some(node => node.tag === 'line' && node.attrs.stroke === 'var(--map-tie)'));
  assert.ok(drawn.some(node => node.tag === 'circle' && node.attrs.fill === 'var(--map-tie)'));
  fields['target-horizon'].handlers.click();
  assert.match(fields['horizon-summary'].textContent, /Every real target ties/);
  assert.match(fields['horizon-visual'].children[0].textContent, /Move reading 1 to 15/);
  assert.match(fields.routes.children[0].children.at(-1).textContent, /Tie-target span/);
  fields.readings.value = '8,6,8,7,0,8';
  fields['move-low'].value = '0'; fields['move-high'].value = '10';
  fields['target-low'].value = '6'; fields['target-high'].value = '6';
  fields['target-horizon'].handlers.click();
  assert.match(fields['horizon-summary'].textContent, /17\/3/);
  assert.equal(fields['horizon-visual'].children[0].children.length, 3);
  assert.match(fields['horizon-visual'].children[2].textContent, /Move reading 1 to 4/);
  fields.readings.value = '0, 1, 2';
  fields['move-low'].value = '0'; fields['move-high'].value = '2';
  fields['target-low'].value = '1'; fields['target-high'].value = '1';
  fields['region-atlas'].handlers.click();
  const fixedTarget = fields.routes.children[0].children[2].children[0].children;
  assert.ok(fixedTarget.some(node => node.tag === 'line' && node.attrs['stroke-width'] === 78));
  assert.ok(!fixedTarget.some(node => node.tag === 'polygon'));
  fields.readings.value = '41, 45, 50, 80';
  fields.readings.handlers.input();
  assert.equal(fields.download.disabled, true);
  assert.equal(fields.routes.children.length, 0);
  assert.equal(fields['gap-summary'].textContent, '');
  assert.equal(fields['stability-summary'].textContent, '');
  assert.equal(fields['horizon-summary'].textContent, '');
  assert.equal(fields['horizon-visual'].children.length, 0);
  fields['even-example'].handlers.click();
  assert.equal(fields.routes.children.length, 4);
  assert.equal(fields.download.disabled, false);
  assert.equal(fields.facts.children[0].textContent, '4 readings');
  fields['locked-example'].handlers.click();
  assert.match(fields['headline-detail'].textContent, /2 of 5 individual routes/);
  assert.equal(fields.routes.children.length, 5);
  fields['target-low'].value = '52'; fields['target-high'].value = '48';
  fields['box-form'].handlers.submit({preventDefault() {}});
  assert.equal(fields.routes.children.length, 0);
  assert.equal(fields.download.disabled, true);
  assert.match(fields['input-error'].textContent, /Target bounds must be ordered/);
});
