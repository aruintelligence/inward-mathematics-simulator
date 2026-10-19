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
    for (const [gridIndex, [readings, targets]] of grids.entries())
      for (const readingCount of gridIndex === 0 ? [3, 4, 5, 6, 7] : gridIndex === 1 ? [4, 6] : [5])
        for (const condition of conditions) for (const prediction of predictions) {
      const receipt = maker.compose(readings, targets, condition, prediction, readingCount);
      const browser = checker.verify(checker.parseClaim(JSON.stringify(receipt)));
      const separate = python(receipt, dir);
      assert.equal(separate.status, 0, `${readingCount}/${condition}/${prediction}: ${separate.stderr}`);
      assert.equal(browser.status, receipt.search.status);
      assert.equal(browser.readingCount, readingCount);
      assert.equal(browser.casesChecked, receipt.search.casesChecked);
      assert.deepEqual(browser.counterexample, receipt.search.counterexample);
      assert.deepEqual(browser.classification, receipt.classification);
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
    [proved, x => {x.domain.readingCount = 4;}],
    [proved, x => {x.domain.readingCount = true;}],
    [proved, x => {x.domain.readingCount = 7;}],
    [proved, x => {delete x.domain.readingCount;}],
    [proved, x => {x.domain.medianRule = 'lower-central';}],
    [proved, x => {delete x.domain.medianRule;}],
    [proved, x => {x.formal.declaration = 'InwardFormal.higher_no_worse_at_midpoint';}],
    [proved, x => {x.formal.sourceCommit = '0'.repeat(40);}],
    [proved, x => {delete x.formal;}],
    [proved, x => {x.classification.counterexample = clone(refuted.classification.counterexample);}],
    [refuted, x => {x.classification.counterexample.actualWinner = 'tie';}],
    [refuted, x => {x.classification.construction.target = '100';}],
    [refuted, x => {delete x.classification.construction;}],
    [refuted, x => {delete x.classification;}],
    [refuted, x => {x.search.counterexample.target = '100';}],
    [refuted, x => {x.search.status = 'proved-by-algebra';}],
    [refuted, x => {x.proof = clone(proved.proof);}],
    [refuted, x => {x.formal = clone(proved.formal);}],
  ]) {
    const modified = clone(base); mutate(modified);
    assert.throws(() => checker.verify(checker.parseClaim(JSON.stringify(modified))));
  }
  const duplicate = JSON.stringify(proved).replace('"format":', '"format":"other","format":');
  assert.throws(() => checker.parseClaim(duplicate), /Duplicate JSON key/);
  const floating = JSON.stringify(proved).replace('"a^2":1', '"a^2":1.0');
  assert.throws(() => checker.verify(checker.parseClaim(floating)), /Noninteger/);
  assert.throws(() => checker.parseClaim('{'), /JSON/);
  const legacy = clone(proved);
  legacy.format = 'inward-conditional-claim-v1';
  delete legacy.domain.readingCount;
  delete legacy.domain.medianRule;
  legacy.claim.statement = legacy.claim.statement.replace('5 real', 'five real');
  delete legacy.formal;
  delete legacy.classification;
  assert.equal(checker.verify(legacy).formal, null);
  const v2 = clone(proved);
  v2.format = 'inward-conditional-claim-v2';
  delete v2.domain.readingCount;
  delete v2.domain.medianRule;
  v2.claim.statement = v2.claim.statement.replace('5 real', 'five real');
  delete v2.classification;
  assert.equal(checker.verify(v2).classification, null);
  for (const name of ['conditional-claim-v3.json', 'conditional-claim-v3-grid-miss.json']) {
    assert.equal(checker.verify(checker.parseClaim(readFileSync(`examples/${name}`, 'utf8'))).readingCount, 5);
  }
  const dir = mkdtempSync(join(tmpdir(), 'legacy-claim-'));
  try { assert.equal(python(legacy, dir).status, 0); assert.equal(python(v2, dir).status, 0); }
  finally { rmSync(dir, {recursive:true, force:true}); }
});

test('browser inspector refuses stale results when source changes and fingerprints exact bytes', async () => {
  function element() {
    const classes = new Set();
    return {children: [], handlers: {}, value: '', textContent: '', hidden: false, files: [],
      classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)},
      addEventListener(name,fn){this.handlers[name]=fn;}};
  }
  const ids=['claim-file','claim-json','file-name','verify-button','status','verdict','verdict-note',
    'result','badge','statement','count','explanation','witness','fingerprint','print-report',
    'save-to-archive','save-status','archive-label','formal-reference','formal-declaration','formal-source'];
  const nodes=Object.fromEntries(ids.map(id=>[id,element()]));
  const stored=[];
  const context={document:{getElementById:id=>nodes[id]},InwardConditionalClaimVerifier:checker,
    InwardResearchArchive:{open:async()=>({close(){}}),add:async(_db, source, label, checkers)=>{
      assert.equal(checkers.conditionalClaim,checker);
      const checked=await require('../research-archive-core.js').inspect(source,null,checkers,crypto.webcrypto);
      stored.push({source,label});
      return {created:true,digest:checked.digest};
    }},
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
  assert.equal(nodes['formal-reference'].hidden,false);
  assert.match(nodes['formal-declaration'].textContent,/InwardFormal\.lower_no_worse_at_midpoint/);
  assert.match(nodes['formal-source'].href,/blob\/59a7e9dccd3cc328f855fc1fce1d6b6d55fdd705/);
  assert.match(nodes.explanation.textContent,/Lean module proves/);
  assert.match(nodes.count.textContent,/5-reading multisets/);
  assert.equal(nodes.fingerprint.textContent,
    crypto.createHash('sha256').update(source).digest('hex'));
  assert.equal(nodes['save-to-archive'].disabled,false);
  nodes['archive-label'].value='Midpoint proof';
  await nodes['save-to-archive'].handlers.click();
  assert.deepEqual(stored,[{source,label:'Midpoint proof'}]);
  assert.match(nodes['save-status'].textContent,/saved locally/);
  const refuted=maker.compose('0,25,50,75,100','0,25,50,75,100',
    'any-target','mean-no-worse');
  nodes['claim-json'].value=JSON.stringify(refuted);
  nodes['claim-json'].handlers.input();
  await nodes['verify-button'].handlers.click();
  assert.equal(nodes.badge.textContent,'Universal claim refuted');
  assert.equal(nodes['formal-reference'].hidden,true);
  assert.equal(nodes['formal-source'].hidden,true);
  const missed=maker.compose('50,100','0,1','target-at-or-above-both','mean-no-worse');
  nodes['claim-json'].value=JSON.stringify(missed);
  nodes['claim-json'].handlers.input();
  await nodes['verify-button'].handlers.click();
  assert.equal(nodes.badge.textContent,'Universal claim refuted');
  assert.match(nodes.count.textContent,/0 eligible exact cases/);
  assert.match(nodes.explanation.textContent,/selected finite grid found none/);
  assert.match(nodes.witness.textContent,/Readings 0, 100, 100, 100, 100/);
  assert.match(nodes.explanation.textContent,/endpoint construction/);
  const legacy=clone(proof);
  legacy.format='inward-conditional-claim-v1';
  delete legacy.domain.readingCount;
  delete legacy.domain.medianRule;
  legacy.claim.statement = legacy.claim.statement.replace('5 real', 'five real');
  delete legacy.formal;
  delete legacy.classification;
  nodes['claim-json'].value=JSON.stringify(legacy);
  nodes['claim-json'].handlers.input();
  await nodes['verify-button'].handlers.click();
  assert.equal(nodes['formal-reference'].hidden,false);
  assert.equal(nodes['formal-source'].hidden,true);
  assert.match(nodes['formal-declaration'].textContent,/Legacy v1 record/);
  nodes['claim-json'].value='{"format":"forged"}';
  nodes['claim-json'].handlers.input();
  assert.equal(nodes.result.hidden,true);
  assert.equal(nodes['formal-reference'].hidden,true);
  assert.equal(nodes['save-to-archive'].disabled,true);
  await nodes['save-to-archive'].handlers.click();
  assert.equal(stored.length,1);
  await nodes['verify-button'].handlers.click();
  assert.equal(nodes.verdict.textContent,'Record rejected');
  assert.equal(nodes.result.hidden,true);
});

test('published inspector fingerprints scripts and links to the claim builder', () => {
  const page=readFileSync('verify-conditional-claim.html','utf8');
  for (const script of ['tools/target-lens-proof-core.js','tools/conditional-claim-verifier.js',
    'research-archive-core.js','verify-conditional-claim.js']) {
    const version=page.match(new RegExp(`${script.replaceAll('.', '\\.')}\\?v=([0-9a-f]{12})`));
    assert.ok(version,script);
    assert.equal(version[1],crypto.createHash('sha256').update(readFileSync(script)).digest('hex').slice(0,12));
  }
  assert.match(page,/prefers-color-scheme:light/);
  assert.match(page,/conjecture-lab\.html#compose/);
  assert.match(page,/id="formal-reference"[^>]+hidden/);
  assert.match(readFileSync('conjecture-lab.html','utf8'),/href="verify-conditional-claim\.html"/);
});
