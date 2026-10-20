const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {spawnSync} = require('node:child_process');
const {createHash, webcrypto} = require('node:crypto');
const vm = require('node:vm');
const {render} = require('../joint-reading-portable-report.js');
const verifier = require('../joint-reading-box-verifier.js');

const template = readFileSync('tools/joint-reading-portable-template.html', 'utf8');
const verifierSource = readFileSync('joint-reading-box-verifier.js', 'utf8');
const thresholdSource = readFileSync('joint-reading-threshold.js', 'utf8');
const tieSource = readFileSync('joint-reading-tie-witness.js', 'utf8');
const source = readFileSync('examples/joint-reading-box-sweep-v4.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const make = (bytes, extra = {}) => render(template, {
  base64: Buffer.from(bytes).toString('base64'),
  sha256: sha(bytes), verifierSource, thresholdSource, tieSource,
  thresholdDefault: '100', ...extra
});

async function open(html) {
  const scripts = [...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 5);
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      textContent: '', value: '', hidden: true, className: '', href: '',
      handlers: {}, attributes: {}, children: [],
      addEventListener(type, fn) {this.handlers[type] = fn;},
      setAttribute(name, value) {this.attributes[name] = value;},
      removeAttribute(name) {delete this.attributes[name];},
      appendChild(child) {this.children.push(child);}
    });
    return nodes.get(id);
  }
  node('receipt-bytes').textContent = scripts[0][1];
  node('threshold-input').value = html.match(/id="threshold-input"[^>]*value="([^"]+)"/)[1];
  const context = {document: {getElementById: node, createElement() {
    return {textContent: '', className: '', children: [], appendChild(child) {this.children.push(child);}};
  }}, atob: raw => Buffer.from(raw, 'base64').toString('binary'),
    crypto: webcrypto, TextDecoder, TextEncoder, Uint8Array, BigInt,
    window: {print() {}}};
  vm.runInNewContext(scripts[1][1], context, {timeout: 2000});
  vm.runInNewContext(scripts[2][1], context, {timeout: 2000});
  vm.runInNewContext(scripts[3][1], context, {timeout: 2000});
  await vm.runInNewContext(scripts[4][1], context, {timeout: 2000});
  return {node, scripts};
}

test('portable custom report independently rechecks, probes, and exports exact regions', async () => {
  const html = make(source);
  assert.ok(!html.includes('@@SOURCE_BYTES@@'));
  const {node} = await open(html);
  assert.equal(node('report').hidden, false);
  assert.match(node('status').textContent, /independently rechecked/);
  assert.equal(node('fingerprint').textContent, sha(source));
  assert.match(node('tie-summary').textContent, /533\/10, 543\/10/);
  assert.equal(node('pieces').children.length, 4);
  assert.match(node('pieces').children[0].children[1].textContent, /15631\/25/);
  assert.equal(Buffer.from(node('source-download').href.split(',')[1], 'base64').toString(), source.toString());
  assert.match(node('probe-result').textContent, /15631\/25/);
  assert.match(node('threshold-result').textContent, /13131\/290.*18131\/290/s);
  const answer = JSON.parse(decodeURIComponent(node('margin-download').href.split(',')[1]));
  assert.deepEqual(answer, JSON.parse(readFileSync('examples/joint-reading-box-margin-100-v1.json', 'utf8')));
  for (const [target, expected] of [
    ['54', /exact tie is attained at readings/],
    ['80', /Mean wins.*7569\/25/],
    ['81', /outside the supplied interval/]
  ]) {
    node('target-input').value = target;
    node('probe-form').handlers.submit({preventDefault() {}});
    assert.match(node('probe-result').textContent, expected);
    if (target === '54') {
      assert.equal(node('tie-download').hidden, false);
      const retargeted = verifier.parseReceipt(decodeURIComponent(node('tie-download').href.split(',')[1]));
      assert.equal(retargeted.claim.tieWitness.target, '54');
      assert.equal(verifier.verify(retargeted).isSweep, true);
      node('target-input').value = '55';
      node('target-input').handlers.input();
      assert.equal(node('tie-download').hidden, true);
    } else assert.equal(node('tie-download').hidden, true);
  }
  node('target-input').value = '40';
  node('tolerance-button').handlers.click();
  assert.match(node('tolerance-result').textContent, /symmetric tolerance ±1531\/290/);
  assert.equal(node('tolerance-download').hidden, false);
  const tolerance = JSON.parse(decodeURIComponent(node('tolerance-download').href.split(',')[1]));
  assert.deepEqual(tolerance, JSON.parse(readFileSync('examples/joint-reading-box-tolerance-40-v1.json', 'utf8')));
  node('threshold-input').value = '101';
  node('threshold-input').handlers.input();
  assert.equal(node('tolerance-download').hidden, true);
  assert.equal(node('margin-download').hidden, true);
  node('threshold-input').value = '100';
  node('threshold-input').value = '0';
  node('threshold-form').handlers.submit({preventDefault() {}});
  assert.match(node('threshold-result').textContent, /Required lead must be positive/);
  assert.equal(node('margin-download').hidden, true);
  node('threshold-input').value = '700';
  node('threshold-form').handlers.submit({preventDefault() {}});
  assert.match(node('threshold-result').textContent, /No target/);
});

test('portable report refuses changed bytes and independently rejects forged claims', async () => {
  const html = make(source);
  const changedBytes = html.replace(/(<script id="receipt-bytes"[^>]*>)[\s\S]*?(<\/script>)/,
    (_, start, end) => start + Buffer.from('{"changed":true}').toString('base64') + end);
  const changed = await open(changedBytes);
  assert.equal(changed.node('report').hidden, true);
  assert.match(changed.node('status').textContent, /does not match this report SHA-256/);

  const forged = JSON.parse(source);
  forged.claim.strictPieces[0].slope = '-1';
  const checkedFingerprint = make(Buffer.from(JSON.stringify(forged)));
  const invalid = await open(checkedFingerprint);
  assert.equal(invalid.node('report').hidden, true);
  assert.match(invalid.node('status').textContent, /Certificate rejected/);
});

test('custom odd box, canonical threshold, and template validation', async () => {
  const generated = spawnSync('python3', ['tools/joint_reading_box.py',
    '--intervals=-4:-3,-1:4,1:2', '--target=-10', '--target-high=10', '--target-sweep'],
  {encoding: 'utf8'});
  assert.equal(generated.status, 0, generated.stderr);
  const {node} = await open(make(Buffer.from(generated.stdout), {thresholdDefault: '3/2'}));
  assert.equal(node('report').hidden, false);
  assert.match(node('reading-bounds').textContent, /\[-4, -3\]/);
  assert.equal(node('threshold-input').value, '3/2');
  assert.match(node('probe-result').textContent, /exact tie is attained|wins for every permitted reading/);
  assert.throws(() => make(source, {thresholdDefault: '"><script>'}), /Invalid default threshold/);
  assert.throws(() => make(source, {verifierSource: '</script>'}), /Invalid embedded verifier/);
  assert.throws(() => make(source, {tieSource: '</script>'}), /Invalid embedded verifier/);
  assert.throws(() => render(template.replace('@@DIGEST@@', 'bad'), {
    base64: source.toString('base64'), sha256: sha(source),
    verifierSource, thresholdSource, tieSource, thresholdDefault: '100'
  }), /missing or duplicates sha256/);
});
