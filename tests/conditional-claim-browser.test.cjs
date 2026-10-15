const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync, writeFileSync, mkdtempSync, rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const {spawnSync} = require('node:child_process');
const crypto = require('node:crypto');
const vm = require('node:vm');
const maker = require('../conjecture-lab-core.js');
const checker = require('../tools/conditional-claim-verifier.js');
const clone = x => JSON.parse(JSON.stringify(x));
function python(record, dir) {
  const path = join(dir, 'claim.json');
  writeFileSync(path, typeof record === 'string' ? record : JSON.stringify(record) + '\n');
  return spawnSync('python3', ['tools/verify_conditional_claim.py', path], {encoding: 'utf8'});
}

test('independent browser and Python check all choices and fractional boundary grids', () => {
  const conditions = ['any-target', 'target-at-or-below-midpoint', 'target-at-or-above-midpoint',
    'target-at-or-below-both', 'target-at-or-above-both'];
  const predictions = ['lower-no-worse', 'higher-no-worse', 'mean-no-worse', 'median-no-worse'];
  const grids = [
    ['0,25,50,75,100', '0,25,50,75,100'],
    ['0,1/4,1/2,1,3/2,2', '0,1/4,1/2,1,3/2,2'],
    ['50,100', '0,1'],
  ];
  const dir = mkdtempSync(join(tmpdir(), 'browser-claim-'));
  try {
    for (const [readings, targets] of grids) for (const condition of conditions) for (const prediction of predictions) {
      const receipt = maker.compose(readings, targets, condition, prediction);
      const browser = checker.verify(checker.parseClaim(JSON.stringify(receipt)));
      const separate = python(receipt, dir);
      assert.equal(separate.status, 0, `${condition}/${prediction}: ${separate.stderr}`);
      assert.equal(browser.status, receipt.search.status);
      assert.equal(browser.casesChecked, receipt.search.casesChecked);
      assert.deepEqual(browser.counterexample, receipt.search.counterexample);
    }
  } finally {rmSync(dir, {recursive:true, force:true});}
});

test('browser checker rejects malformed, duplicate-key, forged proof, counts, and witnesses', () => {
  const proved = maker.compose('0,25,50,75,100', '0,25,50,75,100',
    'target-at-or-below-midpoint', 'lower-no-worse');
  const refuted = maker.compose('0,25,50,75,100', '0,25,50,75,100',
    'any-target', 'mean-no-worse');
  for (const [base, mutate] of [
    [proved, x => {x.proof.identity.expanded['a^2'] = true;}],
    [proved, x => {x.proof.factorSigns[1] = 'nonpositive';}],
    [proved, x => {x.claim.condition = 'any-target';}],
    [proved, x => {x.domain.readingMultisets++;}],
    [refuted, x => {x.search.counterexample.target = '100';}],
    [refuted, x => {x.search.status = 'proved-by-algebra';}],
    [refuted, x => {x.proof = clone(proved.proof);}],
  ]) {
    const modified = clone(base); mutate(modified);
    assert.throws(() => checker.verify(checker.parseClaim(JSON.stringify(modified))));
  }
  const duplicate = JSON.stringify(proved).replace('"format":', '"format":"other","format":');
  assert.throws(() => checker.parseClaim(duplicate), /Duplicate JSON key/);
  const floating = JSON.stringify(proved).replace('"a^2":1', '"a^2":1.0');
  assert.throws(() => checker.verify(checker.parseClaim(floating)), /Noninteger/);
  assert.throws(() => checker.parseClaim('{'), /JSON/);
});

test('browser inspector refuses stale results when source changes and fingerprints exact bytes', async () => {
  function element() {
    const classes = new Set();
    return {children: [], handlers: {}, value: '', textContent: '', hidden: false, files: [],
      classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)},
      addEventListener(name,fn){this.handlers[name]=fn;}};
  }
  const ids=['claim-file','claim-json','file-name','verify-button','status','verdict','verdict-note',
    'result','badge','statement','count','explanation','witness','fingerprint','print-report'];
  const nodes=Object.fromEntries(ids.map(id=>[id,element()]));
  const context={document:{getElementById:id=>nodes[id]},InwardConditionalClaimVerifier:checker,
    crypto:crypto.webcrypto,TextDecoder,TextEncoder,Uint8Array,window:{print(){}}};
  vm.runInNewContext(readFileSync('verify-conditional-claim.js','utf8'),context,{timeout:5000});
  const proof=maker.compose('0,25,50,75,100','0,25,50,75,100',
    'target-at-or-below-midpoint','lower-no-worse');
  const source=JSON.stringify(proof,null,2)+'\n';
  nodes['claim-json'].value=source;
  nodes['claim-json'].handlers.input();
  await nodes['verify-button'].handlers.click();
  assert.equal(nodes.result.hidden,false);
  assert.equal(nodes.badge.textContent,'General algebraic proof');
  assert.equal(nodes.fingerprint.textContent,
    crypto.createHash('sha256').update(source).digest('hex'));
  nodes['claim-json'].value='{"format":"forged"}';
  nodes['claim-json'].handlers.input();
  assert.equal(nodes.result.hidden,true);
  await nodes['verify-button'].handlers.click();
  assert.equal(nodes.verdict.textContent,'Record rejected');
  assert.equal(nodes.result.hidden,true);
});

test('published inspector fingerprints scripts and links to the claim builder', () => {
  const page=readFileSync('verify-conditional-claim.html','utf8');
  for (const script of ['tools/target-lens-proof-core.js','tools/conditional-claim-verifier.js','verify-conditional-claim.js']) {
    const version=page.match(new RegExp(`${script.replaceAll('.', '\\.')}\\?v=([0-9a-f]{12})`));
    assert.ok(version,script);
    assert.equal(version[1],crypto.createHash('sha256').update(readFileSync(script)).digest('hex').slice(0,12));
  }
  assert.match(page,/prefers-color-scheme:light/);
  assert.match(page,/conjecture-lab\.html#compose/);
  assert.match(readFileSync('conjecture-lab.html','utf8'),/href="verify-conditional-claim\.html"/);
});
