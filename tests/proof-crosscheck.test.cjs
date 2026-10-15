"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const {test}=require("node:test");
const {proofReceipt}=require("../target-lens.js");
const {verify}=require("../tools/target-lens-proof-core.js");
const root=path.join(__dirname,"..");
const python=`import json,sys
sys.path.insert(0,"tools")
from verify_target_lens import verify
for receipt in json.load(sys.stdin):
    try:
        print(json.dumps({"ok":True,"result":verify(receipt)}))
    except (ValueError,TypeError,KeyError) as e:
        print(json.dumps({"ok":False,"reason":str(e)}))`;
const clone=value=>JSON.parse(JSON.stringify(value));

test("independent JavaScript and Python verifiers agree across bounded cases and tampering",()=>{
  let seed=620810;
  const next=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  const cases=[
    proofReceipt([48,49,50,51,85],0,1,4,.5),
    proofReceipt([48,49,50,51,85],48,52,1.3,50),
    proofReceipt([48,49,50,51,85],48,52,4,50),
    proofReceipt([0,0,50,100,100],48,52,0,50),
    proofReceipt([100,100,100,100,100],0,100,100,100),
  ];
  for(let i=0;i<120;i++) {
    const readings=Array.from({length:5},()=>Math.floor(next()*1000001)/10000);
    const a=Math.floor(next()*100000001)/1000000;
    const b=Math.floor(next()*100000001)/1000000;
    const drift=Math.floor(next()*100000001)/1000000;
    cases.push(proofReceipt(readings,Math.min(a,b),Math.max(a,b),drift,a));
  }
  const changedBounds=clone(cases[0]); changedBounds.claim.estimateRange[1]++;
  const changedWinner=clone(cases[0]); changedWinner.claim.winner="Mean";
  const changedWitness=clone(cases[2]); changedWitness.claim.witness.path.numerator="10";
  const outside=clone(cases[1]); outside.claim.witness.readings[0]=0;
  const changedBand=clone(cases[0]); changedBand.claim.tieTargets.upperNumerator++;
  const receipts=[...cases,changedBounds,changedWinner,changedWitness,outside,changedBand];
  const run=spawnSync("python3",["-c",python],{cwd:root,input:JSON.stringify(receipts),encoding:"utf8",maxBuffer:1024*1024});
  assert.equal(run.status,0,run.stderr);
  const results=run.stdout.trim().split("\n").map(JSON.parse);
  assert.equal(results.length,receipts.length);
  for(let i=0;i<receipts.length;i++) {
    const expected=i<cases.length;
    assert.equal(results[i].ok,expected,`Python result for case ${i}: ${results[i].reason}`);
    if(expected) assert.deepEqual(results[i].result,verify(receipts[i]),`case ${i}`);
    else assert.throws(()=>verify(receipts[i]),undefined,`JavaScript accepted mutation ${i}`);
  }
});

test("Python CLI verifies a receipt file and fails for altered evidence",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"inward-proof-"));
  try {
    const receipt=proofReceipt([48,49,50,51,85],48,52,4,50);
    const file=path.join(dir,"receipt.json");
    fs.writeFileSync(file,JSON.stringify(receipt));
    const good=spawnSync("python3",["tools/verify_target_lens.py",file],{cwd:root,encoding:"utf8"});
    assert.equal(good.status,0,good.stderr);
    assert.match(good.stdout,/Verified tie-possible/);
    receipt.claim.witness.path.numerator="10";
    fs.writeFileSync(file,JSON.stringify(receipt));
    const bad=spawnSync("python3",["tools/verify_target_lens.py",file],{cwd:root,encoding:"utf8"});
    assert.equal(bad.status,1);
    assert.match(bad.stderr,/Witness does not tie/);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
