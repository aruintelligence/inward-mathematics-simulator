const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const checker = require('../odd-target-box-verifier.js');
const claimChecker = require('../tools/conditional-claim-verifier.js');
const maker = require('../conjecture-lab-core.js');
const archive = require('../research-archive-core.js');
const checkers = {targetBox: checker, conditionalClaim: claimChecker};

const source = readFileSync('examples/odd-target-box-v1.json', 'utf8');
const digest = crypto.createHash('sha256').update(source).digest('hex');

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
  const third = await archive.add(db, JSON.stringify(unresolved), 'Finite case A', checkers, crypto.webcrypto);
  assert.equal(third.result.status, 'unrefuted-on-finite-grid');
  assert.equal(third.result.proof, false);
  assert.ok(third.result.casesChecked > 0);
  assert.equal((await archive.add(db, proofSource, 'Changed', checkers, crypto.webcrypto)).created, false);
  let items = await archive.list(db, checkers, crypto.webcrypto);
  assert.deepEqual(items.map(x => [x.kind, x.valid]).sort(),
    [['conditional-claim', true], ['conditional-claim', true],
      ['conditional-claim', true], ['target-box', true]]);
  assert.match(items.find(x => x.digest === first.digest).label, /five real readings/);
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

test('page filters rechecked records and never promotes a damaged stored claim', async () => {
  function element(tag) {
    const classes = new Set();
    return {tag, children: [], handlers: {}, dataset: {}, textContent: '', value: '', hidden: false,
      disabled: false, files: [], classList: {toggle(x, on) { if (on) classes.add(x); else classes.delete(x); }},
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = [...children]; },
      addEventListener(name, handler) { this.handlers[name] = handler; }};
  }
  const ids = ['certificate-file', 'certificate-label', 'import-button', 'status',
    'archive-search', 'archive-filter', 'refresh-button', 'archive-count',
    'archive-cards', 'archive-empty', 'verified-count', 'count-note'];
  const fields = Object.fromEntries(ids.map(id => [id, element(id)]));
  fields['archive-filter'].value = 'all';
  const checked = await archive.inspect(source, digest, checker, crypto.webcrypto);
  const claim = maker.compose('0,25,50,75,100', '0,25,50,75,100',
    'target-at-or-below-midpoint', 'lower-no-worse');
  const claimChecked = await archive.inspect(JSON.stringify(claim), null, checkers, crypto.webcrypto);
  let records = [{...checked, valid: true, label: 'Calibration A', savedAt: Date.now()},
    {...claimChecked, valid: true, label: 'Midpoint A', savedAt: Date.now()},
    {valid: false, digest: '1'.repeat(64), error: 'Fingerprint mismatch'}];
  const mockArchive = {open: async () => ({}), list: async () => records,
    add: async () => { records = [records[0], records[1], records[2],
      {...checked, digest: '2'.repeat(64), valid: true, label: 'Second run', savedAt: Date.now()}];
      return {created: true, digest}; }};
  vm.runInNewContext(readFileSync('research-archive.js', 'utf8'),
    {document: {getElementById: id => fields[id], createElement: element, body: element('body')},
      InwardResearchArchive: mockArchive, InwardTargetBoxVerifier: checker,
      InwardConditionalClaimVerifier: claimChecker,
      TextDecoder, crypto: crypto.webcrypto, window: {confirm: () => false},
      URL: {createObjectURL: () => 'blob:test', revokeObjectURL() {}}, Blob, setTimeout},
    {timeout: 5000});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fields['verified-count'].textContent, '2');
  assert.equal(fields['archive-cards'].children.length, 3);
  assert.equal(fields['archive-cards'].children[2].dataset.valid, 'false');
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
});

test('published archive scripts are content fingerprinted and use local file APIs', () => {
  const html = readFileSync('research-archive.html', 'utf8');
  const app = readFileSync('research-archive.js', 'utf8');
  const inspector = readFileSync('verify-odd-target-box.html', 'utf8');
  for (const script of ['odd-target-box-verifier.js', 'tools/target-lens-proof-core.js',
    'tools/conditional-claim-verifier.js', 'research-archive-core.js', 'research-archive.js']) {
    const version = html.match(new RegExp(`${script.replace('.', '\\.') }\\?v=([0-9a-f]{12})`));
    assert.ok(version, `${script} needs a content fingerprint`);
    assert.equal(version[1], crypto.createHash('sha256').update(readFileSync(script))
      .digest('hex').slice(0, 12));
  }
  assert.match(inspector, /research-archive\.html/);
  assert.match(app, /TextDecoder\("utf-8", \{fatal: true, ignoreBOM: true\}\)/);
  assert.doesNotMatch(app, /fetch\(|XMLHttpRequest|location\.search/);
});
