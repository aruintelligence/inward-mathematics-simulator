"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const crypto=require("node:crypto");
const os=require("node:os");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const {test}=require("node:test");
const {proofReceipt,continuousStabilityThreshold}=require("../target-lens.js");
const {verify,parseReceipt}=require("../tools/target-lens-proof-core.js");
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

test("seeded permutation and nested uncertainty preserve exact receipt invariants",()=>{
  let seed=7012026;
  const next=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  const receipts=[];
  for(let i=0;i<32;i++) {
    const values=Array.from({length:5},()=>Math.floor(next()*1000001)/10000);
    const ends=[Math.floor(next()*100000001)/1000000,Math.floor(next()*100000001)/1000000];
    const [low,high]=ends.sort((a,b)=>a-b),epsilon=Math.floor(next()*25000001)/1000000;
    const base=proofReceipt(values,low,high,epsilon,low);
    const permuted=proofReceipt([...values].reverse(),low,high,epsilon,low);
    const expanded=proofReceipt(values,Math.max(0,low-5),Math.min(100,high+5),epsilon+5,low);
    for(const field of ["kind","winner","estimateRange","referenceRange","tieTargets"])
      assert.deepEqual(permuted.claim[field],base.claim[field],`permutation ${i}: ${field}`);
    for(const field of ["estimateRange","referenceRange"]) {
      assert.ok(expanded.claim[field][0]<=base.claim[field][0],`nested ${i}: ${field} lower`);
      assert.ok(expanded.claim[field][1]>=base.claim[field][1],`nested ${i}: ${field} upper`);
    }
    assert.ok(expanded.claim.tieTargets.lowerNumerator<=base.claim.tieTargets.lowerNumerator);
    assert.ok(expanded.claim.tieTargets.upperNumerator>=base.claim.tieTargets.upperNumerator);
    if(base.claim.kind!=="strict") assert.notEqual(expanded.claim.kind,"strict",`nested ${i}: tie remains possible`);
    receipts.push(base,permuted,expanded);
  }
  const run=spawnSync("python3",["-c",python],{cwd:root,input:JSON.stringify(receipts),encoding:"utf8",maxBuffer:1024*1024});
  assert.equal(run.status,0,run.stderr);
  const checked=run.stdout.trim().split("\n").map(JSON.parse);
  assert.equal(checked.length,receipts.length);
  for(let i=0;i<checked.length;i++) {
    assert.equal(checked[i].ok,true,`independent verification ${i}: ${checked[i].reason}`);
    assert.deepEqual(checked[i].result,verify(receipts[i]));
  }
});

test("Node and Python CLIs agree on the exact receipt fingerprint and reject altered evidence",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"inward-proof-"));
  try {
    const receipt=proofReceipt([48,49,50,51,85],48,52,4,50);
    const file=path.join(dir,"receipt.json");
    const source="\n"+JSON.stringify(receipt,null,2)+"\n";
    for(const text of [source,source.replace(/\n/g,"\r\n")]) {
      fs.writeFileSync(file,text);
      const expected=crypto.createHash("sha256").update(text).digest("hex");
      for(const [command,script] of [["node","tools/verify-target-lens.cjs"],["python3","tools/verify_target_lens.py"]]) {
        const good=spawnSync(command,[script,file],{cwd:root,encoding:"utf8"});
        assert.equal(good.status,0,good.stderr);
        assert.match(good.stdout,/Verified tie-possible/);
        assert.match(good.stdout,new RegExp(`Receipt SHA-256: ${expected}\\n`));
      }
    }
    receipt.claim.witness.path.numerator="10";
    fs.writeFileSync(file,JSON.stringify(receipt));
    for(const [command,script] of [["node","tools/verify-target-lens.cjs"],["python3","tools/verify_target_lens.py"]]) {
      const bad=spawnSync(command,[script,file],{cwd:root,encoding:"utf8"});
      assert.equal(bad.status,1);
      assert.match(bad.stderr,/Witness does not tie/);
      assert.doesNotMatch(bad.stdout,/Receipt SHA-256/);
    }
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test("receipt parsers reject repeated keys, including escaped and nested names",()=>{
  const receipt=proofReceipt([48,49,50,51,85],48,52,4,50);
  const valid=JSON.stringify(receipt);
  assert.deepEqual(parseReceipt(valid),receipt);
  const swapped=valid.replace('"scale":1000000', '"\\u0073cale":1000000');
  assert.deepEqual(parseReceipt(swapped),receipt,"one escaped spelling is unambiguous");
  const invalid=[
    valid.replace('"scale":1000000', '"scale":1000000,"scale":1000000'),
    valid.replace('"scale":1000000', '"scale":1000000,"\\u0073cale":1000000'),
    valid.replace('"selectedTarget":50000000', '"selectedTarget":50000000,"selectedTarget":50000000'),
    valid.replace('"estimateRange":', '"estimateRange":[1,2],"estimateRange":'),
  ];
  for(const [index,source] of invalid.entries()) {
    assert.throws(()=>parseReceipt(source),/Duplicate JSON key/,`raw case ${index}`);
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),"inward-duplicate-"));
    try {
      const file=path.join(dir,"receipt.json");fs.writeFileSync(file,source);
      for(const [command,script] of [["node","tools/verify-target-lens.cjs"],["python3","tools/verify_target_lens.py"]]) {
        const result=spawnSync(command,[script,file],{cwd:root,encoding:"utf8"});
        assert.equal(result.status,1,`${command}, case ${index}: ${result.stdout}`);
        assert.match(result.stderr,/Duplicate JSON key/);
        assert.doesNotMatch(result.stdout,/Receipt SHA-256/);
      }
    } finally {fs.rmSync(dir,{recursive:true,force:true});}
  }
  const html=fs.readFileSync(path.join(root,"verify-proof.html"),"utf8");
  assert.match(html,/TargetLensVerifier\.parseReceipt\(source\)/);
});

test("independent Python audit agrees on both exact drift routes across reading boxes",()=>{
  let seed=93661;
  const next=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  const cases=[
    {values:[48,49,50,51,85],low:48,high:52,mask:31},
    {values:[48,49,50,51,85],low:0,high:1,mask:31},
    {values:[48,49,50,51,85],low:50,high:50,mask:31},
    {values:[48,49,50,51,85],low:48,high:52,mask:3},
    {values:[48,49,50,51,85],low:48,high:52,mask:0},
    {values:[0,0,50,100,100],low:48,high:52,mask:31},
  ];
  for(let i=0;i<45;i++) {
    const values=Array.from({length:5},()=>Math.floor(next()*1000001)/10000);
    const sorted=[...values].sort((a,b)=>a-b),midpoint=(values.reduce((a,b)=>a+b,0)/5+sorted[2])/2;
    const mask=Math.floor(next()*32);
    if(i%2===0) cases.push({values,low:0,high:Math.max(0,Math.floor((midpoint-.5)*1e6)/1e6),mask});
    else cases.push({values,low:Math.min(100,Math.ceil((midpoint+.5)*1e6)/1e6),high:100,mask});
  }
  const input=cases.map(({values,low,high,mask})=>({readings:values.map(v=>Math.round(v*1e6)),
    low:Math.round(low*1e6),high:Math.round(high*1e6),mask}));
  const script=`import json,sys
sys.path.insert(0,'tools')
from audit_stability_edge import audit_edge
print(json.dumps([audit_edge(**case) for case in json.load(sys.stdin)]))`;
  const run=spawnSync("python3",["-c",script],{cwd:root,input:JSON.stringify(input),encoding:"utf8",maxBuffer:2*1024*1024});
  assert.equal(run.status,0,run.stderr);
  const audited=JSON.parse(run.stdout);
  assert.equal(audited.length,cases.length);
  const rational=route=>route.denominator==="1"?route.numerator:route.numerator+"/"+route.denominator;
  for(let i=0;i<cases.length;i++) {
    const {values,low,high,mask}=cases[i],expected=continuousStabilityThreshold(values,low,high,mask),actual=audited[i];
    assert.equal(actual.kind,expected.kind,`case ${i} kind`);
    if(expected.kind==="no-baseline") continue;
    assert.equal(actual.winner,expected.winner,`case ${i} winner`);
    if(expected.kind==="unreachable") continue;
    assert.equal(actual.radius,rational(expected),`case ${i} first radius`);
    assert.equal(actual.firstTieUnits,expected.firstTieUnits,`case ${i} first selectable radius`);
    assert.equal(actual.firstRoute,expected.factor,`case ${i} first factor`);
    for(const factor of ["estimate","reference"])
      assert.equal(actual.routes[factor]?.radius??null,expected.routes[factor]?rational(expected.routes[factor]):null,
        `case ${i} ${factor} route`);
  }
});

test("stability audit accepts a valid receipt and rejects a tampered claim",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"inward-edge-"));
  try {
    const file=path.join(dir,"receipt.json");
    const receipt=proofReceipt([48,49,50,51,85],0,1,4,.5);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,"examples","stability-case-a.json"),"utf8")),receipt);
    fs.writeFileSync(file,JSON.stringify(receipt));
    const good=spawnSync("python3",["tools/audit_stability_edge.py",file,"--json"],{cwd:root,encoding:"utf8"});
    assert.equal(good.status,0,good.stderr);
    const result=JSON.parse(good.stdout);
    assert.equal(result.radius,"16/3");
    assert.equal(result.routes.reference.radius,"75");
    assert.deepEqual(result.routes.estimate.witness.readings,["128/3","131/3","166/3","166/3","239/3"]);
    receipt.claim.referenceRange[0]++;
    fs.writeFileSync(file,JSON.stringify(receipt));
    const bad=spawnSync("python3",["tools/audit_stability_edge.py",file,"--json"],{cwd:root,encoding:"utf8"});
    assert.equal(bad.status,1);
    assert.match(bad.stderr,/Incorrect reference factor range/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
