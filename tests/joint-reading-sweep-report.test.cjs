const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const {webcrypto} = require('node:crypto');
const vm = require('node:vm');
const verifier = require('../joint-reading-box-verifier.js');

async function openReport(html) {
  const scripts = [...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 5);
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {textContent: '', value: '', hidden: true,
      className: '', attributes: {}, handlers: {},
      addEventListener(type, callback) {this.handlers[type] = callback;},
      setAttribute(name, value) {this.attributes[name] = value;},
      removeAttribute(name) {delete this.attributes[name];}});
    return nodes.get(id);
  }
  node('receipt-bytes').textContent = scripts[0][1];
  node('target-input').value = html.match(/id="target-input"[^>]*value="([^"]+)"/)[1];
  node('threshold-input').value = html.match(/id="threshold-input"[^>]*value="([^"]+)"/)[1];
  const context = {document: {getElementById: node, querySelectorAll() {return [];}},
    atob: raw => Buffer.from(raw, 'base64').toString('binary'),
    TextDecoder, TextEncoder, Uint8Array, BigInt, crypto: webcrypto, window: {print() {}}};
  vm.runInNewContext(scripts[1][1], context, {timeout: 2000});
  vm.runInNewContext(scripts[2][1], context, {timeout: 2000});
  vm.runInNewContext(scripts[3][1], context, {timeout: 2000});
  await vm.runInNewContext(scripts[4][1], context, {timeout: 2000});
  return {node, source: scripts[0][1], scripts, context};
}

test('standalone report rechecks the exact JSON and probes strict and tie targets', async () => {
  const check = spawnSync('python3', ['tools/render_joint_reading_sweep_report.py', '--check'],
    {encoding: 'utf8'});
  assert.equal(check.status, 0, check.stderr);
  const html = readFileSync('joint-reading-sweep-report.html', 'utf8');
  const {node} = await openReport(html);
  assert.equal(node('report').hidden, false);
  assert.match(node('status').textContent, /independently rechecked/);
  assert.match(node('probe-result').textContent, /15631\/25/);
  assert.match(node('probe-result').textContent, /Median wins/);
  assert.match(node('threshold-result').textContent, /13131\/290.*18131\/290/s);
  assert.equal(node('margin-download').hidden, false);
  const answer = JSON.parse(decodeURIComponent(node('margin-download').href.split(',')[1]));
  assert.deepEqual(answer, JSON.parse(readFileSync('examples/joint-reading-box-margin-100-v1.json', 'utf8')));
  for (const [target, expected] of [
    ['45', /2581\/25.*48, 49, 51, 51, 85/],
    ['979/20', /Median wins.*2871\/50/],
    ['533/10', /an exact tie is attained at readings/],
    ['54', /an exact tie is attained at readings/],
    ['286/5', /Mean wins.*957\/25/],
    ['80', /Mean wins.*7569\/25/]
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
    }
  }
  node('target-input').value = '81';
  node('probe-form').handlers.submit({preventDefault() {}});
  assert.match(node('probe-result').textContent, /Cannot inspect target/);
  node('target-input').value = '1/0';
  node('probe-form').handlers.submit({preventDefault() {}});
  assert.match(node('probe-result').textContent, /Use an exact integer/);
  assert.ok(Number(node('probe-marker').attributes.cx) >= 52);
  node('threshold-input').value = '700';
  node('threshold-form').handlers.submit({preventDefault() {}});
  assert.match(node('threshold-result').textContent, /No target/);
  node('threshold-input').value = '0';
  node('threshold-form').handlers.submit({preventDefault() {}});
  assert.match(node('threshold-result').textContent, /Required lead must be positive/);
  assert.equal(node('margin-download').hidden, true);
});

test('report refuses changed bytes even if the replacement receipt is valid', async () => {
  const html = readFileSync('joint-reading-sweep-report.html', 'utf8');
  const certificate = JSON.parse(readFileSync('examples/joint-reading-box-sweep-v4.json', 'utf8'));
  certificate.claim.strictPieces[0].readings = ['48', '49', '51', '51', '85'];
  const forged = Buffer.from(JSON.stringify(certificate)).toString('base64');
  const tampered = html.replace(/(<script id="receipt-bytes"[^>]*>)[\s\S]*?(<\/script>)/,
    (_, opening, closing) => opening + forged + closing);
  const {node} = await openReport(tampered);
  assert.equal(node('report').hidden, true);
  assert.match(node('status').textContent, /Certificate rejected: Embedded JSON does not match/);
});

test('renderer rejects forged evidence and handles all-target ties and custom receipts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'inward-sweep-report-'));
  try {
    const receiptPath = join(dir, 'receipt.json'), outputPath = join(dir, 'report.html');
    const original = JSON.parse(readFileSync('examples/joint-reading-box-sweep-v4.json', 'utf8'));
    original.claim.strictPieces[0].slope = '-1';
    writeFileSync(receiptPath, JSON.stringify(original));
    const forged = spawnSync('python3', ['tools/render_joint_reading_sweep_report.py',
      receiptPath, '--output', outputPath], {encoding: 'utf8'});
    assert.notEqual(forged.status, 0);
    assert.match(forged.stderr, /Independent verifier rejected/);
    assert.equal(existsSync(outputPath), false);

    const generator = spawnSync('python3', ['tools/joint_reading_box.py',
      '--intervals=-4:-3,-1:4,1:2', '--target=-10', '--target-high=10', '--target-sweep'],
    {encoding: 'utf8'});
    assert.equal(generator.status, 0, generator.stderr);
    writeFileSync(receiptPath, generator.stdout);
    const rendered = spawnSync('python3', ['tools/render_joint_reading_sweep_report.py',
      receiptPath, '--output', outputPath], {encoding: 'utf8'});
    assert.equal(rendered.status, 0, rendered.stderr);
    const {node} = await openReport(readFileSync(outputPath, 'utf8'));
    assert.equal(node('report').hidden, false);
    assert.match(node('probe-result').textContent, /an exact tie is attained/);
    assert.match(node('threshold-result').textContent, /No target/);
    assert.match(readFileSync(outputPath, 'utf8'), /No strict region/);
  } finally {rmSync(dir, {recursive: true, force: true});}
});
