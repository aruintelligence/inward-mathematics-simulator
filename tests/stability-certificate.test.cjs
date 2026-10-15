"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const {test}=require("node:test");
const {proofReceipt}=require("../target-lens.js");
const {create}=require("../tools/create-stability-certificate.cjs");

const root=path.join(__dirname,"..");
const clone=value=>JSON.parse(JSON.stringify(value));
const source=JSON.parse(fs.readFileSync(path.join(root,"examples/stability-case-a.json"),"utf8"));

function check(text) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"inward-edge-certificate-"));
  try {
    const file=path.join(dir,"certificate.json");
    fs.writeFileSync(file,text);
    return spawnSync("python3",["tools/verify_stability_certificate.py",file],{cwd:root,encoding:"utf8"});
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
}

test("checked-in example is reproducible and has two independently checked tie routes",()=>{
  const file=path.join(root,"examples/stability-edge-certificate-a.json");
  const expected=create(source);
  assert.deepEqual(JSON.parse(fs.readFileSync(file,"utf8")),expected);
  assert.equal(expected.claim.radius.numerator,"16");
  assert.equal(expected.claim.radius.denominator,"3");
  assert.equal(expected.claim.firstTieUnits,5333334);
  assert.equal(expected.claim.routes.reference.radius.numerator,"75");
  const checked=check(fs.readFileSync(file,"utf8"));
  assert.equal(checked.status,0,checked.stderr);
  assert.match(checked.stdout,/Verified edge · first tie at 16\/3/);
  const generated=spawnSync("node",["tools/create-stability-certificate.cjs",
    "examples/stability-case-a.json"],{cwd:root,encoding:"utf8"});
  assert.equal(generated.status,0,generated.stderr);
  assert.deepEqual(JSON.parse(generated.stdout),expected);
  const masked=spawnSync("node",["tools/create-stability-certificate.cjs",
    "examples/stability-case-a.json","--mask","5"],{cwd:root,encoding:"utf8"});
  assert.equal(masked.status,0,masked.stderr);
  assert.equal(JSON.parse(masked.stdout).mask,5);
  const badMask=spawnSync("node",["tools/create-stability-certificate.cjs",
    "examples/stability-case-a.json","--mask","32"],{cwd:root,encoding:"utf8"});
  assert.equal(badMask.status,1);
});

test("verifier rejects altered first and later routes, witnesses, masks and receipts",()=>{
  const valid=create(source);
  const variants=[];
  const alter=(name,change)=>{const certificate=clone(valid);change(certificate);variants.push([name,certificate]);};
  alter("first radius",c=>{c.claim.radius.numerator="17";});
  alter("later route",c=>{c.claim.routes.reference.radius.numerator="74";});
  alter("first selectable setting",c=>{c.claim.firstTieUnits--;});
  alter("witness reading",c=>{c.claim.routes.estimate.witness.readingsNumerators[0]="0";});
  alter("later witness target",c=>{c.claim.routes.reference.witness.targetNumerator="0";});
  alter("mask",c=>{c.mask=0;});
  alter("source claim",c=>{c.sourceReceipt.claim.referenceRange[0]++;});
  alter("negative numerator",c=>{c.claim.routes.estimate.radius.numerator="-16";});
  alter("additional claim",c=>{c.claim.proven="unconditionally";});
  for(const [name,certificate] of variants) {
    const result=check(JSON.stringify(certificate));
    assert.equal(result.status,1,`${name}: ${result.stdout}`);
    assert.match(result.stderr,/Verification failed:/,name);
  }
  const duplicate=JSON.stringify(valid).replace('"mask":31,','"mask":31,"mask":0,');
  const result=check(duplicate);
  assert.equal(result.status,1);
  assert.match(result.stderr,/Duplicate JSON key/);
});

test("witness verification checks mathematical values, not one prescribed encoding",()=>{
  const alternative=clone(create(source));
  const witness=alternative.claim.routes.reference.witness;
  witness.readingsNumerators=witness.readingsNumerators.map(n=>(BigInt(n)*2n).toString());
  witness.targetNumerator=(BigInt(witness.targetNumerator)*2n).toString();
  witness.denominator=(BigInt(witness.denominator)*2n).toString();
  const checked=check(JSON.stringify(alternative));
  assert.equal(checked.status,0,checked.stderr);
});

test("baseline ties, unreachable masks, reference-first cases and varied masks cross-check",()=>{
  const baseline=create(proofReceipt([0,0,50,100,100],48,52,0,50));
  assert.equal(baseline.claim.kind,"no-baseline");
  const frozen=create(source,0);
  assert.equal(frozen.claim.kind,"unreachable");
  const reference=create(proofReceipt([48,49,50,51,85],48,52,1,50));
  assert.equal(reference.claim.firstRoute,"reference");
  const cases=[baseline,frozen,reference];
  let seed=49161;
  const next=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let i=0;i<20;i++) {
    const values=Array.from({length:5},()=>Math.floor(next()*1000001)/10000);
    const low=Math.floor(next()*100000001)/1000000;
    const high=Math.floor(next()*100000001)/1000000;
    const min=Math.min(low,high),max=Math.max(low,high);
    cases.push(create(proofReceipt(values,min,max,0,min),Math.floor(next()*32)));
  }
  // One Python interpreter verifies the batch; each audit recomputes both roots.
  const python=`import json,sys\nsys.path.insert(0,'tools')\nfrom verify_stability_certificate import verify\nfor case in json.load(sys.stdin):\n    try:\n        print(json.dumps({'ok':True,'result':verify(case)}))\n    except Exception as error:\n        print(json.dumps({'ok':False,'error':str(error)}))`;
  const run=spawnSync("python3",["-c",python],{cwd:root,input:JSON.stringify(cases),
    encoding:"utf8",maxBuffer:1024*1024});
  assert.equal(run.status,0,run.stderr);
  const outcomes=run.stdout.trim().split("\n").map(JSON.parse);
  assert.equal(outcomes.length,cases.length);
  for(let i=0;i<cases.length;i++) {
    assert.equal(outcomes[i].ok,true,`case ${i}: ${outcomes[i].error}`);
    assert.equal(outcomes[i].result.kind,cases[i].claim.kind);
  }
});
