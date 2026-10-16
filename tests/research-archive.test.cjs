const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const checker = require('../odd-target-box-verifier.js');
const claimChecker = require('../tools/conditional-claim-verifier.js');
const reversalChecker = require('../odd-flip-verifier.js');
const strictJson = require('../tools/target-lens-proof-core.js').parseReceipt;
const maker = require('../conjecture-lab-core.js');
const archive = require('../research-archive-core.js');
const {mkdtempSync, writeFileSync, rmSync} = require('node:fs');
const {join} = require('node:path');
const {tmpdir} = require('node:os');
const {spawnSync} = require('node:child_process');
const checkers = {targetBox: checker, conditionalClaim: claimChecker,
  sampleReversal: reversalChecker, strictJson};

const source = readFileSync('examples/odd-target-box-v1.json', 'utf8');
const digest = crypto.createHash('sha256').update(source).digest('hex');
const evenSource = readFileSync('examples/even-sample-flip-v3.json', 'utf8');
const oddSource = readFileSync('examples/odd-sample-flip-v1.json', 'utf8');
const signedSource = readFileSync('examples/odd-sample-flip-v2.json', 'utf8');

// A minimal asynchronous IndexedDB transaction double checks the archive's
// request ordering, duplicate handling, and commit/abort behavior in Node.
function memoryDB() {
  const rows = new Map();
  return {rows, close() {}, transaction() {
    let pending = 0, aborted = false;
    const tx = {error: null, abort() {
      aborted = true;
      queueMicrotask(() => tx.onabort?.());
    }};
    function request(operation) {
      pending++;
      const req = {};
      queueMicrotask(() => {
        if (aborted) return;
        try { req.result = operation(); req.onsuccess?.(); }
        catch (error) { tx.error = error; aborted = true; tx.onerror?.(); }
        finally {
          pending--;
          if (!pending && !aborted) queueMicrotask(() => {
            if (!pending && !aborted) tx.oncomplete?.();
          });
        }
      });
      return req;
    }
    tx.objectStore = () => ({
      get: key => request(() => rows.get(key)),
      count: () => request(() => rows.size),
      add: value => request(() => {
        if (rows.has(value.digest)) throw new Error('Duplicate key');
        rows.set(value.digest, value);
        return value.digest;
      }),
      getAll: () => request(() => [...rows.values()]),
      delete: key => request(() => rows.delete(key)),
    });
    return tx;
  }};
}

test('archive verifies original bytes, checks exact fingerprint, and rejects forged claims', async () => {
  const checked = await archive.inspect(source, digest, checker, crypto.webcrypto);
  assert.equal(checked.digest, digest);
  assert.deepEqual(checked.result, {routes: 5, reachable: ['Mean', 'Median', 'Tie'], guarantee: null});
  await assert.rejects(archive.inspect(source, '0'.repeat(64), checker, crypto.webcrypto), /fingerprint/);
  const forged = JSON.parse(source);
  forged.claim.routes[0].knots.splice(1, 1);
  await assert.rejects(archive.inspect(JSON.stringify(forged), null, checker, crypto.webcrypto), /partition/);
  await assert.rejects(archive.inspect('{"format":1,"format":2}', null, checker, crypto.webcrypto), /Duplicate/);
  assert.throws(() => archive.labelText('x'.repeat(101), 'fallback'), /100/);
  assert.equal(archive.labelText('  ', 'fallback'), 'fallback');
  assert.equal(archive.labelText('', 'x'.repeat(200)).length, 100);
  assert.equal(archive.shortSummary(checked.record), '5 readings · target 48–52');
});

test('store deduplicates bytes and rechecks storage before showing mathematical results', async () => {
  const db = memoryDB();
  const first = await archive.add(db, source, 'Experiment A', checker, crypto.webcrypto);
  assert.equal(first.created, true);
  assert.equal(first.digest, digest);
  const second = await archive.add(db, source, 'Different label', checker, crypto.webcrypto);
  assert.equal(second.created, false);
  assert.equal(db.rows.size, 1);
  assert.equal(db.rows.get(digest).label, 'Experiment A');
  let listed = await archive.list(db, checker, crypto.webcrypto);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].valid, true);
  db.rows.get(digest).source = source.replace('"knots": [\n          "0",\n          "15"',
    '"knots": [\n          "0",\n          "16"');
  listed = await archive.list(db, checker, crypto.webcrypto);
  assert.equal(listed[0].valid, false);
  assert.equal(listed[0].result, undefined);
  assert.match(listed[0].error, /partition/);
  await archive.remove(db, digest);
  assert.equal((await archive.list(db, checker, crypto.webcrypto)).length, 0);
});

test('archive limit is explicit and a duplicate still resolves when full', async () => {
  const db = memoryDB();
  await archive.add(db, source, '', checker, crypto.webcrypto);
  for (let i = 1; i < archive.MAX_ENTRIES; i++) {
    db.rows.set(String(i).padStart(64, '0'), {digest: String(i).padStart(64, '0'),
      source, label: 'test', savedAt: Date.now()});
  }
  assert.equal((await archive.add(db, source, '', checker, crypto.webcrypto)).created, false);
  await assert.rejects(archive.add(db, source + '\n', '', checker, crypto.webcrypto), /limit of 100/);
  assert.equal(db.rows.size, archive.MAX_ENTRIES);
});

test('mixed archive preserves legacy Target Box entries and independently rechecks conditional claims', async () => {
  const db = memoryDB();
  await archive.add(db, source, 'Legacy calibration', checker, crypto.webcrypto);
  delete db.rows.get(digest).kind; // Simulates a record written by the original archive.
  const proof = maker.compose('0,25,50,75,100', '0,25,50,75,100',
    'target-at-or-below-midpoint', 'lower-no-worse');
  const refuted = maker.compose('0,25,50,75,100', '0,25,50,75,100',
    'any-target', 'mean-no-worse');
  const unresolved = maker.compose('0,100', '0,1',
    'any-target', 'lower-no-worse');
  const proofSource = JSON.stringify(proof) + '\n';
  const refutedSource = JSON.stringify(refuted) + '\n';
  const first = await archive.add(db, proofSource, '', checkers, crypto.webcrypto);
  assert.equal(first.created, true);
  assert.equal(first.kind, 'conditional-claim');
  assert.equal(first.result.status, 'proved-by-algebra');
  const second = await archive.add(db, refutedSource, 'Counterexample A', checkers, crypto.webcrypto);
  assert.equal(second.result.status, 'counterexample-found');
  assert.equal(second.result.classification.status, 'refuted-by-exact-witness');
  const third = await archive.add(db, JSON.stringify(unresolved), 'Finite case A', checkers, crypto.webcrypto);
  assert.equal(third.result.status, 'unrefuted-on-finite-grid');
  assert.equal(third.result.classification.status, 'refuted-by-exact-witness');
  assert.equal(third.result.proof, false);
  assert.ok(third.result.casesChecked > 0);
  assert.equal((await archive.add(db, proofSource, 'Changed', checkers, crypto.webcrypto)).created, false);
  let items = await archive.list(db, checkers, crypto.webcrypto);
  assert.deepEqual(items.map(x => [x.kind, x.valid]).sort(),
    [['conditional-claim', true], ['conditional-claim', true],
      ['conditional-claim', true], ['target-box', true]]);
  assert.match(items.find(x => x.digest === first.digest).label, /5 real readings/);
  assert.equal(items.find(x => x.digest === digest).label, 'Legacy calibration');

  db.rows.get(first.digest).kind = 'target-box';
  items = await archive.list(db, checkers, crypto.webcrypto);
  const wrongType = items.find(x => x.digest === first.digest);
  assert.equal(wrongType.valid, false);
  assert.equal(wrongType.result, undefined);
  assert.match(wrongType.error, /type/);
  db.rows.get(first.digest).kind = 'conditional-claim';
  db.rows.get(second.digest).source = refutedSource.replace('"counterexample-found"', '"proved-by-algebra"');
  items = await archive.list(db, checkers, crypto.webcrypto);
  assert.equal(items.find(x => x.digest === second.digest).valid, false);
  assert.equal(items.find(x => x.digest === second.digest).result, undefined);
  assert.equal(items.find(x => x.digest === first.digest).valid, true);
});

test('legacy v1–v5 claims remain readable and portable beside v6 claims', async () => {
  const db = memoryDB();
  const current = maker.compose('0,25,50,75,100', '0,25,50,75,100',
    'target-at-or-below-midpoint', 'lower-no-worse');
  const legacy = JSON.parse(JSON.stringify(current));
  legacy.format = 'inward-conditional-claim-v1';
  delete legacy.domain.readingCount;
  delete legacy.domain.medianRule;
  legacy.claim.statement = legacy.claim.statement.replace('5 real', 'five real');
  delete legacy.formal;
  delete legacy.classification;
  const previous = JSON.parse(JSON.stringify(current));
  previous.format = 'inward-conditional-claim-v2';
  delete previous.domain.readingCount;
  delete previous.domain.medianRule;
  previous.claim.statement = previous.claim.statement.replace('5 real', 'five real');
  delete previous.classification;
  await archive.add(db, JSON.stringify(legacy), 'Earlier proof', checkers, crypto.webcrypto);
  await archive.add(db, JSON.stringify(previous), 'Theorem bound proof', checkers, crypto.webcrypto);
  await archive.add(db, readFileSync('examples/conditional-claim-v3.json', 'utf8'),
    'Five-reading classified proof', checkers, crypto.webcrypto);
  await archive.add(db, readFileSync('examples/conditional-claim-v4.json', 'utf8'),
    'Seven-reading proof', checkers, crypto.webcrypto);
  await archive.add(db, readFileSync('examples/conditional-claim-v5.json', 'utf8'),
    'Six-reading proof', checkers, crypto.webcrypto);
  await archive.add(db, JSON.stringify(current), 'Classified proof', checkers, crypto.webcrypto);
  const listed = await archive.list(db, checkers, crypto.webcrypto);
  assert.equal(listed.length, 6);
  assert.ok(listed.every(item => item.valid && item.result.status === 'proved-by-algebra'));
  assert.equal(listed.find(item => item.record.format.endsWith('-v1')).result.formal, null);
  assert.equal(listed.find(item => item.record.format.endsWith('-v2')).result.formal.declaration,
    'InwardFormal.lower_no_worse_at_midpoint');
  assert.equal(listed.find(item => item.record.format.endsWith('-v3')).result.classification.status,
    'proved-by-algebra');
  assert.equal(listed.find(item => item.record.format.endsWith('-v4')).result.readingCount, 7);
  assert.equal(listed.find(item => item.record.format.endsWith('-v5')).record.domain.medianRule,
    'central-order-statistics-v1');
  assert.equal(listed.find(item => item.record.format.endsWith('-v6')).result.classification.construction, null);
  const exported = await archive.exportCollection(db, checkers, crypto.webcrypto);
  const dir = mkdtempSync(join(tmpdir(), 'inward-legacy-collection-'));
  try {
    const path = join(dir, 'collection.json');
    writeFileSync(path, exported.source);
    const checked = spawnSync('python3', ['tools/verify_research_collection.py', path],
      {encoding: 'utf8'});
    assert.equal(checked.status, 0, checked.stderr);
    assert.match(checked.stdout, /Verified 6 research records/);
  } finally {rmSync(dir, {recursive:true, force:true});}
});

test('unsupported formats and altered claim certificates are rejected before storage', async () => {
  const db = memoryDB();
  const proof = maker.compose('0,25,50,75,100', '0,25,50,75,100',
    'target-at-or-below-midpoint', 'lower-no-worse');
  proof.proof.factorSigns[1] = 'nonpositive';
  await assert.rejects(archive.add(db, JSON.stringify(proof), '', checkers, crypto.webcrypto));
  await assert.rejects(archive.add(db, '{"format":"unknown"}', '', checkers, crypto.webcrypto), /Unsupported/);
  await assert.rejects(archive.add(db, '{"format":"__proto__"}', '', checkers, crypto.webcrypto), /Unsupported/);
  await assert.rejects(archive.add(db, '{"format":"inward-conditional-claim-v1","format":"unknown"}',
    '', checkers, crypto.webcrypto), /Duplicate/);
  assert.equal(db.rows.size, 0);
});

test('portable collection round trips mixed receipts and is independently replayed by Python', async () => {
  const original = memoryDB();
  const claim = maker.compose('0,25,50,75,100', '0,25,50,75,100',
    'target-at-or-below-midpoint', 'lower-no-worse');
  const refuted = maker.compose('0,25,50,75,100', '0,25,50,75,100',
    'any-target', 'mean-no-worse');
  const claimSource = JSON.stringify(claim, null, 2) + '\n';
  await archive.add(original, source, 'Target Box example', checkers, crypto.webcrypto);
  await archive.add(original, claimSource, 'Proved conditional case', checkers, crypto.webcrypto);
  await archive.add(original, JSON.stringify(refuted), 'Exact counterexample', checkers, crypto.webcrypto);
  const collection = await archive.exportCollection(original, checkers, crypto.webcrypto);
  assert.equal(collection.count, 3);
  assert.equal(collection.source, (await archive.exportCollection(original, checkers, crypto.webcrypto)).source);
  const parsed = JSON.parse(collection.source);
  assert.equal(parsed.format, 'inward-research-collection-v1');
  assert.deepEqual(parsed.records.map(x => x.digest), [...parsed.records.map(x => x.digest)].sort());
  assert.equal(parsed.records.find(x => x.kind === 'conditional-claim' && x.label.startsWith('Proved')).source,
    claimSource);
  const dir = mkdtempSync(join(tmpdir(), 'inward-collection-'));
  try {
    const path = join(dir, 'collection.json');
    writeFileSync(path, collection.source);
    const checked = spawnSync('python3', ['tools/verify_research_collection.py', path],
      {encoding: 'utf8'});
    assert.equal(checked.status, 0, checked.stderr);
    assert.match(checked.stdout, /Verified 3 research records/);
    assert.match(checked.stdout, /proved-by-algebra/);
    assert.match(checked.stdout, /refuted-by-exact-witness/);
  } finally {rmSync(dir, {recursive:true, force:true});}
  const restored = memoryDB();
  const imported = await archive.importCollection(restored, collection.source, checkers, crypto.webcrypto);
  assert.deepEqual(imported, {total:3, created:3, duplicates:0});
  assert.deepEqual(await archive.importCollection(restored, collection.source, checkers, crypto.webcrypto),
    {total:3, created:0, duplicates:3});
  assert.deepEqual((await archive.exportCollection(restored, checkers, crypto.webcrypto)).source,
    collection.source);
});

test('even Target Box receipts remain portable in v1 collections', async () => {
  const db = memoryDB();
  const evenBox = readFileSync('examples/even-target-box-v2.json', 'utf8');
  const added = await archive.add(db, evenBox, 'Four-reading rectangle', checkers, crypto.webcrypto);
  assert.equal(added.kind, 'target-box');
  const listed = await archive.list(db, checkers, crypto.webcrypto);
  assert.equal(listed[0].valid, true);
  assert.equal(listed[0].result.routes, 4);
  const exported = await archive.exportCollection(db, checkers, crypto.webcrypto);
  assert.equal(exported.format, 'inward-research-collection-v1');
  const dir = mkdtempSync(join(tmpdir(), 'inward-even-box-collection-'));
  try {
    const path = join(dir, 'collection.json');
    writeFileSync(path, exported.source);
    const checked = spawnSync('python3', ['tools/verify_research_collection.py', path],
      {encoding: 'utf8'});
    assert.equal(checked.status, 0, checked.stderr);
    assert.match(checked.stdout, /target-box: Mean\/Median\/Tie; 4 exact routes/);
  } finally {rmSync(dir, {recursive: true, force: true});}
  const restored = memoryDB();
  assert.equal((await archive.importCollection(restored, exported.source,
    checkers, crypto.webcrypto)).created, 1);
  assert.equal((await archive.exportCollection(restored, checkers, crypto.webcrypto)).source,
    exported.source);
});

test('quantified gap receipts replay in the archive and Python v1 collection checker', async () => {
  const db = memoryDB();
  const receipt = readFileSync('examples/target-box-gap-v3.json', 'utf8');
  await archive.add(db, receipt, 'Exact gap envelope', checkers, crypto.webcrypto);
  const listed = await archive.list(db, checkers, crypto.webcrypto);
  assert.equal(listed[0].result.gap.min.value, '-1435/16');
  const exported = await archive.exportCollection(db, checkers, crypto.webcrypto);
  assert.equal(exported.format, 'inward-research-collection-v1');
  const dir = mkdtempSync(join(tmpdir(), 'inward-gap-collection-'));
  try {
    const path = join(dir, 'collection.json');
    writeFileSync(path, exported.source);
    const checked = spawnSync('python3', ['tools/verify_research_collection.py', path],
      {encoding: 'utf8'});
    assert.equal(checked.status, 0, checked.stderr);
  } finally {rmSync(dir, {recursive: true, force: true});}
  const forged = JSON.parse(exported.source);
  const altered = JSON.parse(forged.records[0].source);
  altered.claim.gap.min.value = '-1';
  forged.records[0].source = JSON.stringify(altered);
  forged.records[0].digest = crypto.createHash('sha256').update(forged.records[0].source).digest('hex');
  await assert.rejects(archive.importCollection(memoryDB(), JSON.stringify(forged),
    checkers, crypto.webcrypto));
});

test('v2 collection preserves and independently rechecks odd, signed, and even reversal receipts', async () => {
  const db = memoryDB();
  await archive.add(db, source, 'Target Box', checkers, crypto.webcrypto);
  for (const [index, receipt] of [oddSource, signedSource, evenSource].entries()) {
    const saved = await archive.add(db, receipt, '', checkers, crypto.webcrypto);
    assert.equal(saved.kind, 'sample-reversal');
    assert.equal(saved.result.routes, index === 2 ? 4 : 5);
  }
  const items = await archive.list(db, checkers, crypto.webcrypto);
  assert.equal(items.length, 4);
  assert.ok(items.every(item => item.valid));
  assert.match(items.find(item => item.record.format === 'inward-even-sample-flip-v3').label,
    /4 readings · reversal at target 50/);
  const bundle = await archive.exportCollection(db, checkers, crypto.webcrypto);
  assert.equal(bundle.format, 'inward-research-collection-v2');
  const parsed = JSON.parse(bundle.source);
  assert.equal(parsed.records.filter(item => item.kind === 'sample-reversal').length, 3);
  const dir = mkdtempSync(join(tmpdir(), 'inward-reversal-collection-'));
  try {
    const path = join(dir, 'collection.json');
    writeFileSync(path, bundle.source);
    const result = spawnSync('python3', ['tools/verify_research_collection.py', path],
      {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Verified 4 research records/);
    assert.match(result.stdout, /sample-reversal: strict-baseline/);
  } finally {rmSync(dir, {recursive: true, force: true});}
  const restored = memoryDB();
  assert.deepEqual(await archive.importCollection(restored, bundle.source, checkers, crypto.webcrypto),
    {total: 4, created: 4, duplicates: 0});
  assert.equal((await archive.exportCollection(restored, checkers, crypto.webcrypto)).source, bundle.source);

  const changed = JSON.parse(bundle.source);
  changed.format = 'inward-research-collection-v1';
  await assert.rejects(archive.parseCollection(JSON.stringify(changed), checkers, crypto.webcrypto),
    /Invalid or unsorted collection entry/);
  const forged = JSON.parse(bundle.source);
  const reversal = forged.records.find(item => item.kind === 'sample-reversal');
  const receipt = JSON.parse(reversal.source);
  receipt.claim.routes[0].knots.pop();
  reversal.source = JSON.stringify(receipt);
  reversal.digest = crypto.createHash('sha256').update(reversal.source).digest('hex');
  forged.records.sort((a, b) => a.digest.localeCompare(b.digest));
  await assert.rejects(archive.parseCollection(JSON.stringify(forged), checkers, crypto.webcrypto),
    /partition/);
});

test('collection rejects forged or damaged receipts before storage and refuses partial capacity imports', async () => {
  const original = memoryDB();
  const claim = maker.compose('0,25,50,75,100', '0,25,50,75,100',
    'target-at-or-below-midpoint', 'lower-no-worse');
  await archive.add(original, source, 'Box', checkers, crypto.webcrypto);
  await archive.add(original, JSON.stringify(claim), 'Proof', checkers, crypto.webcrypto);
  const collection = await archive.exportCollection(original, checkers, crypto.webcrypto);
  const restored = memoryDB();
  const tamper = mutate => {
    const x = JSON.parse(collection.source); mutate(x); return JSON.stringify(x);
  };
  const invalid = [
    tamper(x => {x.records[0].digest = '0'.repeat(64);}),
    tamper(x => {x.records[0].kind = 'target-box';}),
    tamper(x => {const claim = x.records.find(item => item.kind === 'conditional-claim');
      claim.source = claim.source.replace('"factorSigns"', '"forged"');}),
    tamper(x => {x.records[0].label = ''; }),
    tamper(x => x.records.reverse()),
    tamper(x => {x.records.push(x.records[0]);}),
    tamper(x => {x.untrusted = 'extra';}),
    collection.source.replace('"format":', '"format":"other", "format":'),
  ];
  for (const bad of invalid) {
    await assert.rejects(archive.importCollection(restored, bad, checkers, crypto.webcrypto));
    assert.equal(restored.rows.size, 0);
  }
  const damaged = original.rows.values().next().value;
  damaged.source = damaged.source + ' ';
  await assert.rejects(archive.exportCollection(original, checkers, crypto.webcrypto), /unverified item/);
  assert.equal(original.rows.size, 2);
  for (let i=0;i<archive.MAX_ENTRIES-1;i++) {
    const digest = i.toString(16).padStart(64,'0');
    restored.rows.set(digest, {digest, source, kind:'target-box', label:'filler', savedAt:Date.now()});
  }
  const before = restored.rows.size;
  await assert.rejects(archive.importCollection(restored, collection.source, checkers, crypto.webcrypto),
    /limit of 100/);
  assert.equal(restored.rows.size, before);
});

test('page filters rechecked records and never promotes a damaged stored claim', async () => {
  const downloads = [];
  function element(tag) {
    const classes = new Set();
    return {tag, children: [], handlers: {}, dataset: {}, textContent: '', value: '', hidden: false,
      disabled: false, files: [], classList: {toggle(x, on) { if (on) classes.add(x); else classes.delete(x); }},
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = [...children]; },
      click() { downloads.push(this.download); }, remove() {},
      addEventListener(name, handler) { this.handlers[name] = handler; }};
  }
  const ids = ['certificate-file', 'certificate-label', 'import-button', 'status',
    'archive-search', 'archive-filter', 'refresh-button', 'archive-count',
    'archive-cards', 'archive-empty', 'verified-count', 'count-note',
    'export-collection', 'collection-status'];
  const fields = Object.fromEntries(ids.map(id => [id, element(id)]));
  fields['archive-filter'].value = 'all';
  const checked = await archive.inspect(source, digest, checker, crypto.webcrypto);
  const claim = maker.compose('0,25,50,75,100', '0,25,50,75,100',
    'target-at-or-below-midpoint', 'lower-no-worse');
  const claimChecked = await archive.inspect(JSON.stringify(claim), null, checkers, crypto.webcrypto);
  let records = [{...checked, valid: true, label: 'Calibration A', savedAt: Date.now()},
    {...claimChecked, valid: true, label: 'Midpoint A', savedAt: Date.now()},
    {valid: false, digest: '1'.repeat(64), error: 'Fingerprint mismatch'}];
  let importedCollection = '';
  const mockArchive = {MAX_COLLECTION_BYTES: 10_000_000, open: async () => ({}), list: async () => records,
    exportCollection: async () => ({source:'{"format":"inward-research-collection-v1"}', count:2,
      format: records[0]?.kind === 'sample-reversal' ? 'inward-research-collection-v2' : undefined}),
    importCollection: async (_db, source) => {importedCollection=source;
      return {created:1, duplicates:1};},
    add: async () => { records = [records[0], records[1], records[2],
      {...checked, digest: '2'.repeat(64), valid: true, label: 'Second run', savedAt: Date.now()}];
      return {created: true, digest}; }};
  vm.runInNewContext(readFileSync('research-archive.js', 'utf8'),
    {document: {getElementById: id => fields[id], createElement: element, body: element('body')},
      InwardResearchArchive: mockArchive, InwardTargetBoxVerifier: checker,
      InwardConditionalClaimVerifier: claimChecker, InwardOddFlipVerifier: reversalChecker,
      TargetLensVerifier: {parseReceipt:strictJson},
      TextDecoder, crypto: crypto.webcrypto, window: {confirm: () => false},
      URL: {createObjectURL: () => 'blob:test', revokeObjectURL() {}}, Blob,
      setTimeout: callback => callback()},
    {timeout: 5000});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fields['verified-count'].textContent, '2');
  assert.equal(fields['archive-cards'].children.length, 3);
  assert.equal(fields['archive-cards'].children[2].dataset.valid, 'false');
  await fields['export-collection'].handlers.click();
  assert.deepEqual(downloads, ['inward-research-collection-v1.json']);
  assert.match(fields['collection-status'].textContent, /2 independently checked records/);
  const bundle = '{"format":"inward-research-collection-v1","records":[]}';
  fields['certificate-file'].files = [{size: bundle.length,
    arrayBuffer: async () => new TextEncoder().encode(bundle).buffer}];
  await fields['import-button'].handlers.click();
  assert.equal(importedCollection, bundle);
  assert.match(fields.status.textContent, /1 imported, 1 already here/);
  fields['archive-filter'].value = 'strict';
  fields['archive-filter'].handlers.change();
  assert.equal(fields['archive-cards'].children.length, 0);
  fields['archive-filter'].value = 'Tie';
  fields['archive-filter'].handlers.change();
  assert.equal(fields['archive-cards'].children.length, 1);
  fields['archive-filter'].value = 'proved-by-algebra';
  fields['archive-filter'].handlers.change();
  assert.equal(fields['archive-cards'].children.length, 1);
  assert.equal(fields['archive-cards'].children[0].children[0].children[2].textContent,
    'General algebraic proof');
  const provedBody = fields['archive-cards'].children[0].children[1];
  assert.ok(provedBody.children.some(child => child.tag === 'a' &&
    child.href.endsWith('/formal/InwardFormal.lean')));
  fields['archive-filter'].value = 'conditional-claim';
  fields['archive-filter'].handlers.change();
  assert.equal(fields['archive-cards'].children.length, 1);
  fields['archive-search'].value = 'unfindable';
  fields['archive-search'].handlers.input();
  assert.equal(fields['archive-empty'].hidden, false);
  fields['archive-search'].value = 'Calibration';
  fields['archive-search'].handlers.input();
  assert.equal(fields['archive-cards'].children.length, 0);
  fields['archive-filter'].value = 'all';
  fields['archive-filter'].handlers.change();
  assert.equal(fields['archive-cards'].children.length, 1);
  const reversal = await archive.inspect(evenSource, null, checkers, crypto.webcrypto);
  records = [{...reversal, valid: true, label: 'Even calibration', savedAt: Date.now()}];
  fields['archive-search'].value = '';
  fields['archive-filter'].value = 'sample-reversal';
  await fields['refresh-button'].handlers.click();
  assert.equal(fields['archive-cards'].children.length, 1);
  const reversalCard = fields['archive-cards'].children[0];
  assert.equal(reversalCard.children[0].children[2].textContent, 'Strict reversal found');
  assert.match(reversalCard.children[1].children[1].textContent, /130\/3.*5\/3/);
  fields['archive-filter'].value = 'strict-reversal';
  fields['archive-filter'].handlers.change();
  assert.equal(fields['archive-cards'].children.length, 1);
  fields['archive-search'].value = '125/3';
  fields['archive-search'].handlers.input();
  assert.equal(fields['archive-cards'].children.length, 1);
  fields['archive-search'].value = 'unfindable';
  fields['archive-search'].handlers.input();
  assert.equal(fields['archive-cards'].children.length, 0);
  fields['archive-search'].value = '';
  await fields['export-collection'].handlers.click();
  assert.equal(downloads.at(-1), 'inward-research-collection-v2.json');
  const v2 = '{"format":"inward-research-collection-v2","records":[]}';
  fields['certificate-file'].files = [{size: v2.length,
    arrayBuffer: async () => new TextEncoder().encode(v2).buffer}];
  await fields['import-button'].handlers.click();
  assert.equal(importedCollection, v2);
});

test('published archive scripts are content fingerprinted and use local file APIs', () => {
  const html = readFileSync('research-archive.html', 'utf8');
  const app = readFileSync('research-archive.js', 'utf8');
  const inspector = readFileSync('verify-odd-target-box.html', 'utf8');
  for (const script of ['odd-target-box-verifier.js', 'odd-flip-verifier.js',
    'tools/target-lens-proof-core.js',
    'tools/conditional-claim-verifier.js', 'research-archive-core.js', 'research-archive.js']) {
    const version = html.match(new RegExp(`${script.replace('.', '\\.') }\\?v=([0-9a-f]{12})`));
    assert.ok(version, `${script} needs a content fingerprint`);
    assert.equal(version[1], crypto.createHash('sha256').update(readFileSync(script))
      .digest('hex').slice(0, 12));
  }
  assert.match(inspector, /research-archive\.html/);
  assert.match(app, /TextDecoder\("utf-8", \{fatal: true, ignoreBOM: true\}\)/);
  assert.match(app, /archive\.exportCollection/);
  assert.match(app, /archive\.importCollection/);
  assert.doesNotMatch(app, /fetch\(|XMLHttpRequest|location\.search/);
});
