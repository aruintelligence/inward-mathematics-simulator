const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
const {test} = require("node:test");

test("Target Lens asset URL changes whenever its script bytes change", () => {
  const html=fs.readFileSync(path.join(__dirname,"..","target-lens.html"),"utf8");
  const script=fs.readFileSync(path.join(__dirname,"..","target-lens.js"));
  const version=html.match(/<script src="target-lens\.js\?v=([a-f0-9]{12})"><\/script>/);
  assert.ok(version,"Target Lens needs a content-derived script cache key");
  assert.equal(version[1],crypto.createHash("sha256").update(script).digest("hex").slice(0,12));
});

test("portable Target Lens receipts verify offline and reject altered mathematics", () => {
  const {proofReceipt}=require("../target-lens.js");
  const {verify}=require("../tools/verify-target-lens.cjs");
  const values=[48,49,50,51,85];
  const strict=proofReceipt(values,0,1,4,0.5);
  assert.deepEqual(verify(strict),{kind:"strict",winner:"Median"});
  const endpoint=proofReceipt(values,48,52,1.3,50);
  assert.deepEqual(verify(endpoint),{kind:"tie-possible",winner:null});
  assert.equal(endpoint.claim.witness.targetUnits,52000000);
  const path=proofReceipt(values,48,52,4,50);
  assert.deepEqual(verify(path),{kind:"tie-possible",winner:null});
  assert.equal(path.claim.witness.path.denominator,"40");
  assert.deepEqual(verify(proofReceipt([0,0,50,100,100],48,52,0,50)),{kind:"all-tie",winner:null});
  const altered=receipt=>JSON.parse(JSON.stringify(receipt));
  const badBounds=altered(strict); badBounds.claim.referenceRange[0]++;
  assert.throws(()=>verify(badBounds),/Incorrect reference factor range/);
  const badVerdict=altered(strict); badVerdict.claim.winner="Mean";
  assert.throws(()=>verify(badVerdict),/Incorrect winner/);
  const badWitness=altered(path); badWitness.claim.witness.path.numerator="10";
  assert.throws(()=>verify(badWitness),/Witness does not tie/);
  const badRange=altered(endpoint); badRange.claim.witness.readings[0]=0;
  assert.throws(()=>verify(badRange),/outside drift box/);
});

test("browser proof inspector uses the same verifier and refuses a changed witness", async () => {
  const html=fs.readFileSync(path.join(__dirname,"..","verify-proof.html"),"utf8");
  const exampleSource=html.match(/<script id="proof-examples" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(exampleSource,"the inspector must include worked receipts");
  const examples=JSON.parse(exampleSource[1]);
  const {proofReceipt}=require("../target-lens.js");
  assert.deepEqual(examples.strict,proofReceipt([48,49,50,51,85],0,1,4,0.5));
  assert.deepEqual(examples.path,proofReceipt([48,49,50,51,85],48,52,4,50));
  assert.deepEqual(examples.all,proofReceipt([0,0,50,100,100],48,52,0,50));
  const core=fs.readFileSync(path.join(__dirname,"..","tools","target-lens-proof-core.js"));
  const version=html.match(/<script src="tools\/target-lens-proof-core\.js\?v=([a-f0-9]{12})"><\/script>/);
  assert.ok(version,"the inspector must load its verifier with a content-derived key");
  assert.equal(version[1],crypto.createHash("sha256").update(core).digest("hex").slice(0,12));
  const elements=new Map(),buttons=["strict","path","all"].map(name=>({dataset:{example:name},attributes:{},handlers:{},
    addEventListener(type,callback){this.handlers[type]=callback;},setAttribute(key,value){this.attributes[key]=value;}}));
  const element=id=>{
    if(!elements.has(id)) elements.set(id,{value:"",textContent:"",dataset:{},hidden:false,handlers:{},
      addEventListener(type,callback){this.handlers[type]=callback;},scrollIntoView(){}});
    return elements.get(id);
  };
  element("proof-examples").textContent=exampleSource[1];
  let printed=0;
  const window={print(){printed++;}};
  const context={window,document:{getElementById:element,querySelectorAll(selector){return selector===".example"?buttons:[];}},BigInt,Number,JSON};
  vm.runInNewContext(core.toString(),context,{timeout:1000});
  const script=html.match(/<script>\s*([\s\S]*?)<\/script>/);
  assert.ok(script,"the inspector must initialize its controls");
  vm.runInNewContext(script[1],context,{timeout:1000});
  const receipt=proofReceipt([48,49,50,51,85],48,52,4,50);
  element("receipt-json").value=JSON.stringify(receipt);
  element("receipt-json").handlers.input();
  element("verify-button").handlers.click();
  assert.equal(element("result").hidden,false);
  assert.equal(element("conclusion").textContent,"A tie is attainable");
  assert.match(element("witness-note").textContent,/9\/40/);
  assert.match(element("witness-detail").textContent,/target 51\.1.*Mean 54\.4.*median 47\.8/s);
  assert.match(element("tie-targets").textContent,/49\.3 to 57\.3/);
  assert.equal(element("status").dataset.state,"success");
  element("print-report").handlers.click();
  assert.equal(printed,1);
  receipt.claim.witness.path.numerator="10";
  element("receipt-json").value=JSON.stringify(receipt);
  element("receipt-json").handlers.input();
  element("verify-button").handlers.click();
  assert.equal(element("result").hidden,true);
  assert.equal(element("status").dataset.state,"error");
  assert.match(element("status").textContent,/Witness does not tie/);
  element("print-report").handlers.click();
  assert.equal(printed,1,"invalid receipts must not print a verified sheet");
  const strict=proofReceipt([48,49,50,51,85],0,1,4,0.5);
  await element("receipt-file").handlers.change({target:{files:[{name:"strict.json",size:900,async text(){return JSON.stringify(strict);}}]}});
  element("verify-button").handlers.click();
  assert.equal(element("conclusion").textContent,"Median wins throughout");
  assert.equal(element("status").dataset.state,"success");
  buttons[0].handlers.click();
  assert.equal(element("conclusion").textContent,"Median wins throughout");
  assert.equal(buttons[0].attributes["aria-pressed"],"true");
  buttons[2].handlers.click();
  assert.equal(element("conclusion").textContent,"Every configuration ties");
  assert.match(element("tie-targets").textContent,/every value from 0 to 100/);
  buttons[1].handlers.click();
  assert.equal(element("conclusion").textContent,"A tie is attainable");
  assert.equal(element("case-origin").textContent,"Worked example 02 · rational tie");
});

function loadLab(search="",hash="") {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script, "the single-file lab must contain its model script");

  const initial = {"alpha":"1.5","future-alpha":"2.5","future-horizon":"60","trace-step":"0","shock-strength":"60","seed":"42","outlier":"85","dataset":"48, 49, 50, 51, 85","known-target":"50"};
  const elements = new Map();
  const download = {clicked:false,blob:null,filename:null,type:null,labels:[]};
  const share = {copied:null,scrolled:null};
  const context = new Proxy({}, {get: (_target, key) => {
    if (key === "canvas") return undefined;
    if (key === "createLinearGradient") return () => ({addColorStop(){}});
    if (key === "fillText") return label => download.labels.push(label);
    return () => {};
  }});
  function element(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        value: initial[id] ?? "", textContent: "", handlers: {}, attributes:{},
        addEventListener(name, handler) {this.handlers[name] = handler;},
        setAttribute(name,value) {this.attributes[name]=value;},
        scrollIntoView() {share.scrolled=id;},
        getContext() {return context;},
        toBlob(callback,type) {download.type=type;callback(new Blob(["PNG"],{type}));},
      });
    }
    return elements.get(id);
  }
  const window = {matchMedia: () => ({matches:false}),location:{search,hash,href:"https://aruintelligence.github.io/inward-mathematics-simulator/"+search+hash}};
  const navigator = {clipboard:{async writeText(value) {share.copied=value;}}};
  const document = {
    getElementById:element,
    body:{append(){}},
    createElement() {
      return {
        set download(value) {download.filename=value;},
        click() {download.clicked=true;},
        remove() {},
      };
    },
  };
  vm.runInNewContext(script[1], {
    document,window,navigator,URLSearchParams,requestAnimationFrame:()=>{},
    URL:{createObjectURL(blob) {download.blob=blob;return "blob:mock";},revokeObjectURL(){}},
    Blob,setTimeout:()=>{},
  }, {timeout:3000});
  return {window,element,html,download,share};
}

function click(element) {return element.handlers.click();}
function input(element, value) {element.value=String(value);element.handlers.input();}
function snapshot(lab) {return JSON.parse(JSON.stringify(lab.window.InwardMathLab.snapshot()));}

function loadChallenge(search="",options={}) {
  const html=fs.readFileSync(path.join(__dirname,"..","challenge.html"),"utf8");
  const script=html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script,"the challenge must contain its model script");
  const elements=new Map(),share={copied:null,sent:null},classes=new Set();
  const download={clicked:false,blob:null,filename:null,type:null,revoked:null,labels:[]};
  const context=new Proxy({}, {get:(_target,key)=>key==="fillText"?(label)=>download.labels.push(label):()=>{}});
  function element(id) {
    if(!elements.has(id)) elements.set(id,{
      textContent:"",value:"",href:"",hidden:id==="result"||id==="counterfactual"||id==="result-card-kit"||id==="share-data-note",disabled:false,style:{},attributes:{},handlers:{},
      addEventListener(name,handler){this.handlers[name]=handler;},
      setAttribute(name,value){this.attributes[name]=value;},
      getContext(){return context;},
      toBlob(callback,type){download.type=type;callback(new Blob(["PNG"],{type}));},
    });
    return elements.get(id);
  }
  const window={location:{search,href:"https://aruintelligence.github.io/inward-mathematics-simulator/challenge.html"+search}};
  const navigator={clipboard:{async writeText(value){share.copied=value;}}};
  if(options.nativeShare) navigator.share=async value=>{
    share.sent=value;
    if(options.nativeShare==="cancel") throw Object.assign(new Error("Canceled"),{name:"AbortError"});
  };
  const document={getElementById:element,body:{classList:{add(name){classes.add(name);}},append(){}},createElement(){return {set download(value){download.filename=value;},click(){download.clicked=true;},remove(){}};}};
  const URL={createObjectURL(blob){download.blob=blob;return "blob:mock";},revokeObjectURL(url){download.revoked=url;}};
  vm.runInNewContext(script[1],{window,document,navigator,URLSearchParams,URL,Blob,setTimeout:callback=>callback()},{timeout:3000});
  return {window,element,share,classes,html,download};
}

function loadAtlas(search="") {
  const html=fs.readFileSync(path.join(__dirname,"..","atlas.html"),"utf8");
  const script=html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script,"the atlas must contain its model script");
  const elements=new Map(),share={copied:null};
  const context=new Proxy({}, {get:()=>()=>{}});
  function element(id) {
    if(!elements.has(id)) elements.set(id,{
      textContent:"",value:"",href:"",disabled:false,handlers:{},
      addEventListener(name,handler){this.handlers[name]=handler;},
      getContext(){return context;},
      getBoundingClientRect(){return {left:0,top:0,width:808,height:768};},
    });
    return elements.get(id);
  }
  const window={location:{search,href:"https://aruintelligence.github.io/inward-mathematics-simulator/atlas.html"+search}};
  const navigator={clipboard:{async writeText(value){share.copied=value;}}};
  vm.runInNewContext(script[1],{window,document:{getElementById:element},navigator,URLSearchParams},{timeout:2000});
  return {window,element,share};
}

test("same seed and same shock timing replay the exact model state", () => {
  const lab=loadLab();
  assert.equal(snapshot(lab).step,0);
  click(lab.element("step"));
  click(lab.element("shock"));
  const first=snapshot(lab);
  assert.equal(first.shocks.length,1);
  assert.equal(first.shocks[0].step,1);
  click(lab.element("reset"));
  click(lab.element("step"));
  click(lab.element("shock"));
  assert.deepEqual(snapshot(lab),first);
});

test("distance falls under the damped pull and no shock is invented", () => {
  const lab=loadLab();
  const before=snapshot(lab).distance;
  for(let i=0;i<150;i++) click(lab.element("step"));
  const after=snapshot(lab);
  assert.ok(after.distance<before);
  assert.equal(after.shocks.length,0);
  assert.equal(after.step,150);
  assert.equal(after.coherenceProxy,Math.exp(-after.distance/120));
});

test("one-step forecast matches the next exact state after a parameter change and shock", () => {
  const lab=loadLab(),lens=lab.element("step-lens");
  lens.open=true;lens.handlers.toggle();
  const predicted=()=>lab.element("step-preview-position").textContent.split(", ").map(Number);
  const first=predicted();
  assert.equal(snapshot(lab).step,0,"opening the forecast must not advance the model");
  assert.match(lab.element("step-preview-outcome").textContent,/After step 1: distance .*closer by/);
  click(lab.element("step"));
  assert.ok(Math.abs(snapshot(lab).position.x-first[0])<0.00005);
  assert.ok(Math.abs(snapshot(lab).position.y-first[1])<0.00005);
  input(lab.element("alpha"),2.4);
  click(lab.element("shock"));
  const afterShock=predicted(),before=snapshot(lab);
  assert.equal(before.step,1);
  assert.equal(before.shocks.length,1);
  click(lab.element("step"));
  assert.ok(Math.abs(snapshot(lab).position.x-afterShock[0])<0.00005);
  assert.ok(Math.abs(snapshot(lab).position.y-afterShock[1])<0.00005);
  assert.match(lab.element("step-preview-outcome").textContent,/After step 3:/);
  click(lab.element("run"));
  assert.match(lab.element("step-preview-outcome").textContent,/live run is moving; pause it/);
  click(lab.element("run"));
  assert.match(lab.element("step-preview-outcome").textContent,/choose Step once to apply it/);
});

test("future fork compares pull strengths without changing the current run", () => {
  const lab=loadLab(),lens=lab.element("future-lens"),start=snapshot(lab);
  lens.open=true;lens.handlers.toggle();
  const current=Number(lab.element("future-current-distance").textContent);
  const alternative=Number(lab.element("future-alternate-distance").textContent);
  assert.ok(current>20&&current<25);
  assert.ok(alternative>4&&alternative<6);
  assert.match(lab.element("future-summary").textContent,/Alternative pull is .* closer at update 60/);
  assert.match(lab.element("future-leads").textContent,/17, 30, 44, 57/);
  assert.match(lab.element("future-tally").textContent,/current nearer at 26, alternative at 34, nearly equal at 0/);
  assert.match(lab.element("future-ribbon").attributes["aria-label"],/Selected update 60 is outlined/);
  click(lab.element("future-next-lead"));
  assert.equal(lab.element("future-horizon").value,"17");
  assert.equal(snapshot(lab).step,0);
  input(lab.element("future-horizon"),20);
  assert.equal(lab.element("future-horizon-value").textContent,"20");
  assert.equal(lab.element("future-current-caption").textContent,"Current α 1.5 · update 20");
  assert.ok(Number(lab.element("future-current-distance").textContent)<Number(lab.element("future-alternate-distance").textContent));
  assert.match(lab.element("future-summary").textContent,/Current pull is .* closer at update 20/);
  click(lab.element("future-next-lead"));
  assert.equal(lab.element("future-horizon").value,"30");
  input(lab.element("future-horizon"),60);
  input(lab.element("future-alpha"),1.5);
  assert.equal(lab.element("future-current-distance").textContent,lab.element("future-alternate-distance").textContent);
  assert.match(lab.element("future-summary").textContent,/strengths match/);
  assert.match(lab.element("future-tally").textContent,/current nearer at 0, alternative at 0, nearly equal at 60/);
  assert.equal(lab.element("future-apply").disabled,true);
  assert.equal(lab.element("future-next-lead").disabled,true);
  assert.match(lab.element("future-leads").textContent,/No lead change/);
  input(lab.element("future-alpha"),0.5);
  assert.equal(lab.element("future-alpha-value").textContent,"0.5");
  assert.equal(lab.element("future-apply").disabled,false);
  assert.equal(Number(lab.element("future-current-distance").textContent),current);
  assert.deepEqual(snapshot(lab).position,start.position);
  assert.deepEqual(snapshot(lab).velocity,start.velocity);
  click(lab.element("shock"));
  assert.equal(snapshot(lab).step,0);
  assert.equal(snapshot(lab).shocks.length,1);
  assert.notEqual(Number(lab.element("future-current-distance").textContent),current);
  assert.match(lab.element("future-chart").attributes["aria-label"],/with no new shocks.*At update 60/);
  const beforeApply=snapshot(lab);
  click(lab.element("future-apply"));
  const applied=snapshot(lab);
  assert.equal(lab.element("alpha").value,"0.5");
  assert.equal(lab.element("future-apply").disabled,true);
  assert.deepEqual(applied.position,beforeApply.position);
  assert.deepEqual(applied.velocity,beforeApply.velocity);
  assert.equal(applied.parameterChanges.length,1);
  assert.equal(applied.parameterChanges[0].value,0.5);
  assert.match(lab.element("event").textContent,/Applied alternative α 0.5 at step 0/);
  click(lab.element("step"));
  assert.equal(snapshot(lab).step,1);
  assert.notEqual(snapshot(lab).position.x,applied.position.x);
});

test("replay link restores exact state and future shock sequence", async () => {
  const lab=loadLab();
  lab.element("seed").value="12345";click(lab.element("reset"));
  input(lab.element("outlier"),37);
  click(lab.element("step"));
  input(lab.element("alpha"),2.2);
  input(lab.element("shock-strength"),75);
  click(lab.element("shock"));
  click(lab.element("step"));
  input(lab.element("alpha"),0.8);
  click(lab.element("shock"));
  const original=snapshot(lab);
  await click(lab.element("copy-run"));
  const link=lab.share.copied;
  assert.match(link,/\?run=/);
  assert.match(link,/#rc-title$/);
  assert.equal(lab.element("run-link").href,link);
  assert.equal(lab.element("run-link").hidden,false);
  assert.match(lab.element("run-link").textContent,/saved replay from step 2/);
  const replay=loadLab(new URL(link).search);
  assert.deepEqual(snapshot(replay),original);
  assert.match(replay.element("event").textContent,/Replayed 2 steps and 2 shocks/);
  click(lab.element("shock"));click(replay.element("shock"));
  assert.deepEqual(snapshot(replay).shocks,snapshot(lab).shocks,"the next seeded shock also agrees after replay");
});

test("invalid replay parameters leave the fresh example intact", () => {
  for(const payload of ["not-json",JSON.stringify({v:1,s:42,a:1.5,n:3601,f:85,k:60,p:[],q:[]}),JSON.stringify({v:1,s:42,a:1.5,n:1,f:85,k:60,p:[],q:[[0,999]]})]) {
    const lab=loadLab("?run="+encodeURIComponent(payload));
    assert.equal(snapshot(lab).step,0);
    assert.equal(snapshot(lab).seed,42);
    assert.equal(snapshot(lab).shocks.length,0);
    assert.match(lab.element("event").textContent,/Invalid replay link/);
  }
});

test("replay link falls back to JSON when control history is too long", async () => {
  const lab=loadLab();
  for(let i=0;i<81;i++) input(lab.element("alpha"),i%2?1.5:1.6);
  await click(lab.element("copy-run"));
  assert.equal(lab.share.copied,null);
  assert.equal(lab.element("run-link").hidden,true);
  assert.match(lab.element("run-share-status").textContent,/too long.*Export its JSON/);
});

test("captured-step link replays the frozen selection and opens its trace", async () => {
  const lab=loadLab(),lens=lab.element("trace-lens");
  click(lab.element("step"));click(lab.element("step"));
  input(lab.element("alpha"),2);click(lab.element("shock"));
  const atTwo=snapshot(lab);
  click(lab.element("step"));input(lab.element("shock-strength"),75);
  lens.open=true;lens.handlers.toggle();
  input(lab.element("trace-step"),2);
  click(lab.element("step"));click(lab.element("shock"));
  input(lab.element("alpha"),2.5);input(lab.element("outlier"),99);
  await click(lab.element("trace-copy"));
  const link=lab.share.copied,url=new URL(link);
  assert.equal(url.searchParams.get("inspect"),"trace");
  assert.equal(url.hash,"#trace-lens");
  assert.equal(JSON.parse(url.searchParams.get("run")).n,2);
  assert.equal(lab.element("trace-link").href,link);
  assert.match(lab.element("trace-export-status").textContent,/captured step 2 copied/);
  const replay=loadLab(url.search,url.hash);
  assert.deepEqual(snapshot(replay),atTwo,"later live changes cannot leak into a frozen step link");
  assert.equal(replay.element("trace-lens").open,true);
  assert.equal(replay.element("trace-step").value,"2");
  assert.equal(replay.element("trace-step").max,"2");
  assert.match(replay.element("trace-map").attributes["aria-label"],/selected step 2/);
  input(lab.element("trace-step"),3);
  assert.equal(lab.element("trace-link").hidden,true,"a link for a prior selection is hidden");
  click(lab.element("reset"));
  assert.equal(new URL(link).searchParams.get("run"),url.searchParams.get("run"),"the copied link survives a reset");
});

test("trace remains inspectable when its captured run exceeds replay limits", async () => {
  const lab=loadLab();
  for(let i=0;i<81;i++) input(lab.element("alpha"),i%2?1.5:1.6);
  const lens=lab.element("trace-lens");lens.open=true;lens.handlers.toggle();
  await click(lab.element("trace-copy"));
  assert.equal(lab.share.copied,null);
  assert.equal(lab.element("trace-link").hidden,true);
  assert.match(lab.element("trace-export-status").textContent,/too long for a link/);
  click(lab.element("trace-export"));
  assert.equal(lab.download.blob.type,"text/csv");
});

test("visual receipt captures a fixed step and downloads that PNG", () => {
  const lab=loadLab(),receipt=lab.element("receipt");
  click(lab.element("step"));click(lab.element("shock"));
  receipt.open=true;receipt.handlers.toggle();
  assert.match(lab.element("receipt-canvas").attributes["aria-label"],/step 1.*shocks 1/);
  assert.ok(lab.download.labels.includes("Inward Mathematics™"));
  click(lab.element("step"));
  click(lab.element("receipt-save"));
  assert.equal(lab.download.type,"image/png");
  assert.equal(lab.download.filename,"inward-math-run-seed-42-step-1.png");
  click(lab.element("receipt-refresh"));
  assert.match(lab.element("receipt-canvas").attributes["aria-label"],/step 2.*shocks 1/);
  click(lab.element("receipt-save"));
  assert.equal(lab.download.filename,"inward-math-run-seed-42-step-2.png");
});

test("observed trace scrubs and exports a frozen path with event history", async () => {
  const lab=loadLab(),lens=lab.element("trace-lens");
  lens.open=true;lens.handlers.toggle();
  assert.equal(lab.element("trace-step").disabled,true);
  assert.equal(lab.element("trace-closest").disabled,true);
  assert.equal(lab.element("trace-jump").disabled,true);
  assert.equal(lab.element("trace-next-pull").disabled,true);
  click(lab.element("step"));click(lab.element("step"));
  const atTwo=snapshot(lab);
  input(lab.element("alpha"),2.0);click(lab.element("shock"));click(lab.element("step"));
  click(lab.element("trace-refresh"));
  assert.equal(lab.element("trace-step").max,"3");
  assert.equal(lab.element("trace-closest").disabled,false);
  assert.equal(lab.element("trace-jump").disabled,false);
  assert.equal(lab.element("trace-next-pull").disabled,false);
  input(lab.element("trace-step"),2);
  assert.equal(lab.element("trace-distance").textContent,atTwo.distance.toFixed(2));
  assert.match(lab.element("trace-event").textContent,/1 shock impulse was added/);
  assert.match(lab.element("trace-event").textContent,/Pull α set to 2\.0 at this step/);
  assert.match(lab.element("trace-chart").attributes["aria-label"],/selected step 2/);
  assert.match(lab.element("trace-chart").attributes["aria-label"],/1 pull change at this step/);
  assert.match(lab.element("trace-map").attributes["aria-label"],/selected step 2.*position/);
  assert.match(lab.element("trace-map").attributes["aria-label"],/Rose squares mark 1 shock position; lavender rings mark 1 pull-change position/);
  assert.equal(lab.element("trace-jump").disabled,true,"the only shock is already selected");
  assert.equal(lab.element("trace-next-pull").disabled,true,"the only pull change is already selected");
  click(lab.element("trace-export"));
  assert.equal(lab.download.blob.type,"text/csv");
  assert.equal(lab.download.filename,"inward-math-trace-seed-42-steps-0-3.csv");
  const csv=(await lab.download.blob.text()).trim().split("\n");
  assert.equal(csv.length,5);
  assert.equal(csv[0],"step,x,y,distance,shock_count,pull_alpha_changes");
  const eventRow=csv[3].split(",");
  assert.equal(eventRow[0],"2");
  assert.ok(Math.abs(Number(eventRow[1])-atTwo.position.x)<1e-12);
  assert.equal(eventRow[4],"1");
  assert.equal(eventRow[5],'"2"');
  const before=snapshot(lab);
  input(lab.element("trace-step"),3);
  click(lab.element("trace-closest"));
  assert.equal(lab.element("trace-step").value,"2","closest approach selects the minimum in the frozen capture");
  assert.equal(lab.element("trace-closest").disabled,true,"the closest captured point is already selected");
  input(lab.element("trace-step"),1);
  assert.equal(lab.element("trace-jump").disabled,false);
  click(lab.element("trace-jump"));
  assert.equal(lab.element("trace-step").value,"2");
  assert.deepEqual(snapshot(lab),before);
  click(lab.element("step"));
  click(lab.element("shock"));
  assert.equal(lab.element("trace-step").max,"3","the captured path stays frozen");
  click(lab.element("trace-export"));
  assert.equal(lab.download.filename,"inward-math-trace-seed-42-steps-0-3.csv","export remains tied to the capture");
  click(lab.element("trace-refresh"));
  assert.equal(lab.element("trace-step").max,"4");
  click(lab.element("trace-export"));
  assert.equal(lab.download.filename,"inward-math-trace-seed-42-steps-0-4.csv");
  assert.match(lab.element("trace-map").attributes["aria-label"],/steps 0 to 4/);
  click(lab.element("trace-jump"));
  assert.equal(lab.element("trace-step").value,"2","jump wraps to the first captured shock");
  click(lab.element("trace-jump"));
  assert.equal(lab.element("trace-step").value,"4");
  input(lab.element("alpha"),2.5);
  click(lab.element("trace-next-pull"));
  assert.equal(lab.element("trace-step").value,"2","the frozen capture does not include the later change yet");
  assert.equal(lab.element("trace-next-pull").disabled,true);
  click(lab.element("trace-refresh"));
  assert.equal(lab.element("trace-next-pull").disabled,false);
  assert.match(lab.element("trace-map").attributes["aria-label"],/lavender rings mark 2 pull-change positions/);
  click(lab.element("trace-next-pull"));
  assert.equal(lab.element("trace-step").value,"2","pull navigation wraps to the earliest captured change");
  click(lab.element("trace-next-pull"));
  assert.equal(lab.element("trace-step").value,"4");
  assert.equal(lab.element("trace-next-pull").disabled,false,"other pull changes remain reachable");
  for(let i=4;i<155;i++) lab.window.InwardMathLab.step();
  click(lab.element("trace-refresh"));
  assert.equal(lab.element("trace-step").max,"155");
  assert.equal(lab.element("trace-step").min,"6","only the most recent 150 positions are retained");
  assert.equal(lab.element("trace-next-pull").disabled,true,"changes outside the retained window are excluded");
  assert.match(lab.element("trace-map").attributes["aria-label"],/lavender rings mark 0 pull-change positions/);
});

test("observer comparison uses the same four values under outlier changes", () => {
  const lab=loadLab();
  input(lab.element("outlier"),50);
  const center=snapshot(lab).witnesses;
  input(lab.element("outlier"),100);
  const extreme=snapshot(lab).witnesses;
  assert.deepEqual(extreme.seeded,center.seeded);
  assert.ok(Math.abs(extreme.mean-center.mean-10)<1e-10);
  assert.ok(extreme.medianAbsoluteError<extreme.meanAbsoluteError);
});

test("first-screen control finds an opposing result and stays synchronized with the lab", () => {
  const lab=loadLab();
  assert.equal(lab.element("hero-range").value,"85");
  assert.match(lab.element("hero-verdict").textContent,/At 85, median is closer by 5\.26/);
  assert.equal(lab.element("hero-challenge").href,"challenge.html?seed=42&fifth=85");
  assert.equal(lab.element("hero-flip").hidden,false);
  assert.match(lab.element("hero-flip").textContent,/See a mean win at \d+/);
  const opposite=Number(lab.element("hero-flip").textContent.match(/at (\d+)/)[1]);
  click(lab.element("hero-flip"));
  assert.equal(snapshot(lab).witnesses.adjustable,opposite);
  assert.equal(lab.element("outlier").value,String(opposite));
  assert.equal(lab.element("hero-range").value,String(opposite));
  assert.equal(lab.element("hero-instrument").attributes["data-winner"],"Mean");
  assert.equal(lab.element("hero-challenge").href,"challenge.html?seed=42&fifth="+opposite);
  input(lab.element("hero-range"),50);
  assert.equal(snapshot(lab).witnesses.adjustable,50);
  assert.equal(lab.element("sample-current-value").textContent,"50");
  assert.equal(lab.element("cohort-current-value").textContent,"50");
  assert.equal(lab.element("outlier").value,"50");
  input(lab.element("outlier"),85);
  assert.equal(lab.element("hero-range").value,"85");
  assert.equal(lab.element("hero-fifth").textContent,"85");
});

test("sensitivity sweep exposes both winning regions and agrees with selected telemetry", () => {
  const lab=loadLab();
  const sweep=snapshot(lab).witnessSensitivity;
  assert.deepEqual(sweep.grid,{min:0,max:100,step:1});
  assert.equal(sweep.points.length,101);
  assert.equal(sweep.summary.medianLowerErrorCount,84);
  assert.equal(sweep.summary.meanLowerErrorCount,17);
  assert.equal(sweep.summary.equalErrorCount,0);
  assert.ok(sweep.points[0].medianAbsoluteError<sweep.points[0].meanAbsoluteError);
  assert.ok(sweep.points[40].meanAbsoluteError<sweep.points[40].medianAbsoluteError);
  assert.equal(lab.element("sample-0-winner").textContent,"Median");
  input(lab.element("outlier"),40);
  const selected=snapshot(lab).witnesses;
  assert.equal(selected.meanAbsoluteError,sweep.points[40].meanAbsoluteError);
  assert.equal(selected.medianAbsoluteError,sweep.points[40].medianAbsoluteError);
  assert.equal(lab.element("sample-current-winner").textContent,"Mean");
  assert.equal(lab.element("sample-current-value").textContent,"40");
  assert.equal(lab.element("mean-wins").textContent,"17 / 101");
});

test("resetting a new seed recomputes the full sensitivity sweep", () => {
  const lab=loadLab();
  const first=snapshot(lab).witnessSensitivity;
  lab.element("seed").value="43";
  click(lab.element("reset"));
  const second=snapshot(lab).witnessSensitivity;
  assert.notDeepEqual(second.points,first.points);
  assert.equal(second.points.length,101);
  assert.equal(second.summary.meanLowerErrorCount+second.summary.medianLowerErrorCount+second.summary.equalErrorCount,101);
  assert.equal(second.points[85].mean,(snapshot(lab).witnesses.seeded.reduce((sum,value)=>sum+value,85))/5);
});

test("seed cohort distinguishes average error from win frequency", () => {
  const lab=loadLab();
  const cohort=snapshot(lab).witnessCohort;
  assert.equal(cohort.startSeed,42);
  assert.equal(cohort.count,128);
  assert.equal(cohort.members.length,128);
  assert.equal(cohort.points.length,101);
  assert.deepEqual(cohort.members[0].observers,snapshot(lab).witnesses.seeded);
  assert.equal(cohort.points[50].meanLowerErrorCount,53);
  assert.equal(cohort.points[50].medianLowerErrorCount,75);
  assert.ok(cohort.points[50].meanAverageAbsoluteError<cohort.points[50].medianAverageAbsoluteError);
  assert.ok(Math.abs(cohort.points[50].meanAverageAbsoluteError-1.4300321095623072)<1e-10);
  input(lab.element("outlier"),50);
  assert.equal(lab.element("cohort-50-winner").textContent,"Mean");
  assert.equal(lab.element("cohort-50-count").textContent,"75 / 128");
  assert.match(lab.element("cohort-summary").textContent,/More individual seeds favor Median/);
  assert.equal(cohort.points[85].meanLowerErrorCount,2);
  assert.equal(cohort.points[85].medianLowerErrorCount,126);
});

test("seed cohort wraps at the unsigned 32-bit boundary", () => {
  const lab=loadLab();
  lab.element("seed").value="4294967295";
  click(lab.element("reset"));
  const cohort=snapshot(lab).witnessCohort;
  assert.equal(cohort.members[0].seed,4294967295);
  assert.equal(cohort.members[1].seed,0);
  lab.element("seed").value="0";
  click(lab.element("reset"));
  assert.deepEqual(cohort.members[1].observers,snapshot(lab).witnesses.seeded);
  for(const point of cohort.points) assert.equal(point.meanLowerErrorCount+point.medianLowerErrorCount+point.equalErrorCount,128);
});

test("guided cases load reproducible settings and reveal the intended chart", () => {
  const lab=loadLab();
  lab.element("seed").value="99";
  click(lab.element("reset"));
  click(lab.element("scene-mean"));
  assert.equal(snapshot(lab).seed,42);
  assert.equal(snapshot(lab).witnesses.adjustable,40);
  assert.equal(lab.element("scene-mean").attributes["aria-pressed"],"true");
  assert.equal(lab.share.scrolled,"sensitivity-title");
  assert.ok(snapshot(lab).witnesses.meanAbsoluteError<snapshot(lab).witnesses.medianAbsoluteError);
  click(lab.element("step"));
  click(lab.element("scene-reversal"));
  assert.equal(snapshot(lab).witnesses.adjustable,50);
  assert.equal(snapshot(lab).step,1);
  assert.equal(lab.share.scrolled,"cohort-title");
  assert.equal(lab.element("scene-mean").attributes["aria-pressed"],"false");
  assert.match(lab.element("journey-outcome").textContent,/median wins in 75 individual cases/);
  input(lab.element("outlier"),85);
  assert.equal(lab.element("scene-reversal").attributes["aria-pressed"],"false");
  assert.equal(lab.element("hero-fifth").textContent,"85");
});

test("shared case links restore validated inputs and can be copied", async () => {
  const lab=loadLab("?seed=43&fifth=40");
  assert.equal(snapshot(lab).seed,43);
  assert.equal(snapshot(lab).witnesses.adjustable,40);
  const expected="https://aruintelligence.github.io/inward-mathematics-simulator/?seed=43&fifth=40#start";
  assert.equal(lab.element("share-link").href,expected);
  assert.equal(lab.element("challenge-link").href,"challenge.html?seed=43&fifth=40");
  await click(lab.element("copy-link"));
  assert.equal(lab.share.copied,expected);
  assert.equal(lab.element("share-status").textContent,"Exact case link copied.");
  const invalid=loadLab("?seed=4294967296&fifth=101");
  assert.equal(snapshot(invalid).seed,42);
  assert.equal(snapshot(invalid).witnesses.adjustable,85);
});

test("challenge matches the lab's exact seeded observations and answer", () => {
  for(const fifth of [40,50,85]) {
    const challenge=loadChallenge("?seed=42&fifth="+fifth);
    const lab=loadLab("?seed=42&fifth="+fifth);
    const actual=challenge.window.InwardMathChallenge.statsAt(42,fifth);
    const expected=snapshot(lab).witnesses;
    assert.deepEqual(JSON.parse(JSON.stringify(actual.values)),[...expected.seeded,fifth]);
    assert.equal(actual.mean,expected.mean);
    assert.equal(actual.median,expected.median);
    assert.equal(actual.meanError,expected.meanAbsoluteError);
    assert.equal(actual.medianError,expected.medianAbsoluteError);
    assert.equal(challenge.element("lab-link").href,"index.html?seed=42&fifth="+fifth+"#start");
    assert.equal(challenge.element("result").hidden,true);
  }
});

test("challenge reveals the first prediction and keeps a reproducible share link", async () => {
  const challenge=loadChallenge("?seed=42&fifth=40");
  const link="https://aruintelligence.github.io/inward-mathematics-simulator/challenge.html?seed=42&fifth=40";
  assert.equal(challenge.element("share-link").href,link);
  await click(challenge.element("copy"));
  assert.equal(challenge.share.copied,link);
  click(challenge.element("guess-median"));
  assert.equal(challenge.element("result").hidden,false);
  assert.match(challenge.element("verdict").textContent,/mean gets closer/);
  assert.equal(challenge.element("guess-median").attributes["aria-pressed"],"true");
  assert.equal(challenge.element("guess-mean").disabled,true);
  assert.equal(challenge.element("mean-result").textContent,"46.38 / 3.62");
  const correct=loadChallenge("?seed=42&fifth=85");
  click(correct.element("guess-median"));
  assert.equal(correct.element("verdict").textContent,"You called it.");
});

test("blind invitation copies a useful prompt and the exact link without revealing the answer", async () => {
  const challenge=loadChallenge("?seed=42&fifth=40");
  assert.equal(challenge.element("result").hidden,true);
  assert.equal(challenge.element("share-data-note").hidden,true);
  await click(challenge.element("share-invite"));
  assert.match(challenge.share.copied,/^Five readings, one stated target\. Which gets closer: mean, median, or equal error\?/);
  assert.ok(challenge.share.copied.endsWith("challenge.html?seed=42&fifth=40"));
  assert.doesNotMatch(challenge.share.copied,/46\.38|Mean is closer|Surprise/);
  assert.equal(challenge.element("share-status").textContent,"Invitation copied. Paste it into a message.");
  click(challenge.element("guess-median"));
  await click(challenge.element("share-invite"));
  assert.doesNotMatch(challenge.share.copied,/46\.38|Mean is closer|Surprise/);
});

test("native share sends the blind custom invitation and cancellation does not copy it", async () => {
  const query="?values=40%2C42%2C50%2C60%2C68&target=52";
  const challenge=loadChallenge(query,{nativeShare:true});
  assert.equal(challenge.element("share-data-note").hidden,false);
  await click(challenge.element("share-invite"));
  assert.equal(challenge.share.sent.url,"https://aruintelligence.github.io/inward-mathematics-simulator/challenge.html"+query);
  assert.match(challenge.share.sent.text,/before the answer appears/);
  assert.equal(challenge.share.copied,null);
  assert.equal(challenge.element("share-status").textContent,"Invitation shared.");
  const canceled=loadChallenge(query,{nativeShare:"cancel"});
  await click(canceled.element("share-invite"));
  assert.equal(canceled.share.copied,null);
  assert.equal(canceled.element("share-status").textContent,"Sharing canceled.");
});

test("result PNG stays behind the reveal and reflects the original generated answer", () => {
  const challenge=loadChallenge("?seed=42&fifth=40");
  assert.equal(challenge.element("result-card-kit").hidden,true);
  click(challenge.element("download-card"));
  assert.equal(challenge.download.clicked,false);
  click(challenge.element("guess-median"));
  assert.equal(challenge.element("result-card-kit").hidden,false);
  assert.ok(challenge.download.labels.includes("I picked Median."));
  assert.ok(challenge.download.labels.includes("Closer: Mean"));
  assert.ok(challenge.download.labels.includes("DETERMINISTIC TOY READINGS · SEED 42 · FIFTH 40"));
  assert.match(challenge.element("result-card").attributes["aria-label"],/mean 46\.38 with error 3\.62/);
  input(challenge.element("fifth-sweep"),85);
  click(challenge.element("download-card"));
  assert.equal(challenge.download.type,"image/png");
  assert.equal(challenge.download.filename,"inward-math-result-seed-42-fifth-40.png");
  assert.equal(challenge.download.clicked,true);
  assert.equal(challenge.download.blob.type,"image/png");
  assert.equal(challenge.download.revoked,"blob:mock");
});

test("reader-supplied PNG labels the unverified target and ties honestly", () => {
  const supplied=loadChallenge("?values=40%2C42%2C50%2C60%2C68&target=52");
  click(supplied.element("guess-mean"));
  assert.ok(supplied.download.labels.includes("READER-SUPPLIED VALUES + TARGET · NOT INDEPENDENTLY VERIFIED"));
  assert.ok(supplied.download.labels.includes("STATED TARGET  52"));
  click(supplied.element("download-card"));
  assert.equal(supplied.download.filename,"inward-math-result-custom.png");
  const tie=loadChallenge("?values=0%2C0%2C50%2C100%2C100&target=50");
  click(tie.element("guess-equal"));
  assert.ok(tie.download.labels.includes("I picked Equal error."));
  assert.ok(tie.download.labels.includes("MEAN  ·  TIED"));
  assert.ok(tie.download.labels.includes("MEDIAN  ·  TIED"));
  assert.match(tie.element("result-card").attributes["aria-label"],/the errors tie/);
});

test("challenge rejects malformed link settings and does not leak a selected answer in the URL", () => {
  const challenge=loadChallenge("?seed=4294967296&fifth=101&guess=median");
  assert.equal(challenge.element("value-5").textContent,"40");
  assert.equal(challenge.window.InwardMathChallenge.challengeUrl(),"https://aruintelligence.github.io/inward-mathematics-simulator/challenge.html?seed=42&fifth=40");
  assert.equal(challenge.element("result").hidden,true);
});

test("embeddable challenge preserves the exact case and leaves answer collection local", async () => {
  const challenge=loadChallenge("?seed=43&fifth=85&embed=1&guess=mean");
  assert.equal(challenge.classes.has("embedded"),true);
  assert.equal(challenge.element("result").hidden,true);
  const link="https://aruintelligence.github.io/inward-mathematics-simulator/challenge.html?seed=43&fifth=85";
  assert.equal(challenge.window.InwardMathChallenge.challengeUrl(),link);
  assert.equal(challenge.element("full-challenge").href,link);
  const code=challenge.element("embed-code").value;
  assert.match(code,/^<iframe title="Mean or median prediction challenge"/);
  assert.ok(code.includes('src="'+link+'&embed=1"'));
  assert.ok(!code.includes("guess="));
  await click(challenge.element("copy-embed"));
  assert.equal(challenge.share.copied,code);
  click(challenge.element("guess-median"));
  assert.equal(challenge.element("result").hidden,false);
  assert.equal(challenge.element("lab-link").href,"index.html?seed=43&fifth=85#start");
  assert.match(challenge.html,/\.embedded \.actions #next,[^}]*\.embedded \.actions #share-invite[^}]*\{ display:none; \}/);
});

test("reader-supplied challenge keeps the answer hidden, computes the target, and carries exact values into the workbench", () => {
  const query="?values=40%2C42%2C50%2C60%2C68&target=52";
  const challenge=loadChallenge(query+"&embed=1&guess=median");
  assert.equal(challenge.element("result").hidden,true);
  assert.equal(challenge.element("target-badge").textContent,"Target 52");
  assert.match(challenge.element("plot").style.background,/52%/);
  assert.equal(challenge.element("atlas-link").hidden,true);
  assert.equal(challenge.element("value-5").textContent,"68");
  assert.equal(challenge.window.InwardMathChallenge.challengeUrl(),"https://aruintelligence.github.io/inward-mathematics-simulator/challenge.html"+query);
  assert.ok(challenge.element("embed-code").value.includes(query.slice(1)+"&embed=1"));
  assert.equal(challenge.element("lab-link").href,"index.html?dataset=40%2C42%2C50%2C60%2C68&target=52#workbench-title");
  click(challenge.element("guess-mean"));
  assert.equal(challenge.element("verdict").textContent,"You called it.");
  assert.equal(challenge.element("mean-result").textContent,"52.00 / 0.00");
  assert.equal(challenge.element("median-result").textContent,"50.00 / 2.00");
  const lab=loadLab("?dataset=40%2C42%2C50%2C60%2C68&target=52");
  assert.equal(lab.element("dataset").value,"40,42,50,60,68");
  assert.equal(lab.element("known-target").value,"52");
  assert.match(lab.element("workbench-summary").textContent,/mean is closer/);
});

test("custom builder validates five readings and target before creating a public link", () => {
  const challenge=loadChallenge("?seed=42&fifth=40");
  challenge.element("builder-values").value="48, 49, 50, 51, 85";
  challenge.element("builder-target").value="50";
  click(challenge.element("build"));
  assert.equal(challenge.window.location.href,"https://aruintelligence.github.io/inward-mathematics-simulator/challenge.html?values=48%2C49%2C50%2C51%2C85&target=50");
  const median=loadChallenge("?values=48%2C49%2C50%2C51%2C85&target=50");
  click(median.element("guess-median"));
  assert.equal(median.element("verdict").textContent,"You called it.");
  assert.equal(median.element("median-result").textContent,"50.00 / 0.00");
  const tie=loadChallenge("?values=0%2C0%2C50%2C100%2C100&target=50");
  click(tie.element("guess-equal"));
  assert.equal(tie.element("verdict").textContent,"You called it.");
  const invalid=loadChallenge("?values=1%2C2%2C3%2C4%2C101&target=50&guess=median");
  assert.match(invalid.element("link-warning").textContent,/invalid readings/);
  assert.equal(invalid.element("result").hidden,true);
  assert.equal(invalid.element("value-5").textContent,"40");
  invalid.element("builder-values").value="0,1,2,3,4.12345";
  click(invalid.element("build"));
  assert.match(invalid.element("builder-error").textContent,/up to four decimal places/);
});

test("post-answer sweep agrees with the lab while preserving the original seeded receipt", () => {
  const challenge=loadChallenge("?seed=42&fifth=40");
  assert.equal(challenge.element("counterfactual").hidden,true);
  assert.equal(challenge.element("result").hidden,true);
  click(challenge.element("guess-mean"));
  assert.equal(challenge.element("counterfactual").hidden,false);
  assert.equal(challenge.element("sweep-counts").textContent,"Across 101 positions: mean closer at 17, median closer at 84, equal error at 0.");
  assert.match(challenge.element("sweep-map").style.background,/linear-gradient/);
  assert.match(challenge.element("sweep-map").attributes["aria-label"],/mean closer at 17/);
  const receipt=challenge.element("mean-result").textContent;
  input(challenge.element("fifth-sweep"),85);
  const at85=challenge.window.InwardMathChallenge.statsAt(42,85);
  assert.match(challenge.element("sweep-reading").textContent,/Median is closer\./);
  assert.match(challenge.element("sweep-reading").textContent,new RegExp("mean "+at85.mean.toFixed(2).replace(".","\\.")+" \\(error "+at85.meanError.toFixed(2).replace(".","\\.")+"\\)"));
  assert.equal(challenge.element("sweep-marker").style.left,"85%");
  assert.equal(challenge.element("sweep-link").href,"challenge.html?seed=42&fifth=85");
  assert.equal(challenge.element("mean-result").textContent,receipt);
  assert.equal(challenge.element("share-link").href,"https://aruintelligence.github.io/inward-mathematics-simulator/challenge.html?seed=42&fifth=40");
  const next=loadChallenge("?seed=42&fifth=85");
  assert.equal(next.element("result").hidden,true);
  assert.equal(next.element("counterfactual").hidden,true);
  assert.match(challenge.html,/\.embedded header,[^}]*\.embedded \.counterfactual,\.embedded \.result-card-kit[^}]*\{ display:none; \}/);
});

test("reader-supplied sweep keeps four values and target in its exact new challenge", () => {
  const challenge=loadChallenge("?values=40%2C42%2C50%2C60%2C68&target=52");
  click(challenge.element("guess-mean"));
  assert.equal(challenge.element("mean-result").textContent,"52.00 / 0.00");
  assert.match(challenge.element("sweep-reading").textContent,/Mean is closer\./);
  input(challenge.element("fifth-sweep"),100);
  assert.equal(challenge.element("sweep-link").href,"challenge.html?values=40%2C42%2C50%2C60%2C100&target=52");
  assert.equal(challenge.element("sweep-reading").textContent,"At fifth reading 100: mean 58.40 (error 6.40); median 50.00 (error 2.00). Median is closer.");
  assert.equal(challenge.element("mean-result").textContent,"52.00 / 0.00");
  const next=loadChallenge("?values=40%2C42%2C50%2C60%2C100&target=52");
  assert.equal(next.element("result").hidden,true);
  assert.equal(next.element("value-5").textContent,"100");
  const decimal=loadChallenge("?values=10.5%2C20.25%2C50%2C60.75%2C68.5&target=52.5");
  click(decimal.element("guess-median"));
  assert.equal(decimal.element("fifth-sweep").value,"69");
  assert.match(decimal.element("sweep-context").textContent,/Original fifth reading: 68\.5\. The explorer starts at 69/);
  assert.equal(decimal.element("sweep-link").href,"challenge.html?values=10.5%2C20.25%2C50%2C60.75%2C69&target=52.5");
});

test("printable worksheet links three blind cases to the correct mean, median, and tie results", () => {
  const html=fs.readFileSync(path.join(__dirname,"..","worksheet.html"),"utf8");
  const examples=[
    {id:"a",values:[48,49,50,51,85],target:50,winner:"Median",mean:"56.60 / 6.60",median:"50.00 / 0.00"},
    {id:"b",values:[40,42,50,60,68],target:52,winner:"Mean",mean:"52.00 / 0.00",median:"50.00 / 2.00"},
    {id:"c",values:[0,0,50,100,100],target:50,winner:"Equal",mean:"50.00 / 0.00",median:"50.00 / 0.00"},
  ];
  for(const example of examples) {
    const card=html.match(new RegExp('<article class="case" aria-labelledby="case-'+example.id+'">([\\s\\S]*?)<\\/article>'));
    assert.ok(card,"case "+example.id+" exists");
    assert.deepEqual([...card[1].matchAll(/<li>(\d+)<\/li>/g)].map(match=>Number(match[1])),example.values);
    assert.match(card[1],new RegExp("Stated target: "+example.target));
    const link=card[1].match(/href="(challenge\.html\?[^"]+)"/);
    assert.ok(link,"case "+example.id+" has a check link");
    const query=link[1].replaceAll("&amp;","&").split("?")[1];
    const challenge=loadChallenge("?"+query);
    assert.equal(challenge.element("result").hidden,true);
    assert.equal(challenge.element("target-badge").textContent,"Target "+example.target);
    const guess=example.winner.toLowerCase()==="equal"?"equal":example.winner.toLowerCase();
    click(challenge.element("guess-"+guess));
    assert.equal(challenge.element("verdict").textContent,"You called it.");
    assert.equal(challenge.element("mean-result").textContent,example.mean);
    assert.equal(challenge.element("median-result").textContent,example.median);
  }
  assert.match(html,/@media print\s*\{/);
  assert.match(html,/\.teacher-key\s*\{ break-before:page;/);
  assert.match(html,/addEventListener\("beforeprint"/);
  assert.match(html,/href="output\/pdf\/mean-vs-median-worksheet\.pdf" download/);
  const pdf=fs.readFileSync(path.join(__dirname,"..","output","pdf","mean-vs-median-worksheet.pdf"));
  assert.equal(pdf.subarray(0,5).toString(),"%PDF-");
  assert.ok(pdf.length>10000);
  assert.match(fs.readFileSync(path.join(__dirname,"..","guide.html"),"utf8"),/href="worksheet\.html"/);
  assert.match(fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8"),/href="worksheet\.html"/);
});

test("workbench offers a challenge only for shareable data and clears it on invalid input", () => {
  const lab=loadLab();
  assert.equal(lab.element("workbench-challenge").hidden,false);
  assert.equal(lab.element("workbench-challenge").href,"challenge.html?values=48%2C49%2C50%2C51%2C85&target=50");
  assert.equal(lab.element("workbench-target-lens").hidden,false);
  assert.equal(lab.element("workbench-target-lens").href,"target-lens.html?values=48%2C49%2C50%2C51%2C85&target=50");
  assert.equal(lab.element("workbench-flip-point").hidden,false);
  assert.equal(lab.element("workbench-flip-point").href,"flip-point.html?fixed=48%2C49%2C50%2C51&fifth=85&target=50");
  assert.equal(lab.element("workbench-decision-field").hidden,false);
  assert.equal(lab.element("workbench-decision-field").href,"decision-field.html?fixed=48%2C49%2C50%2C51&fifth=85&target=50");
  lab.element("known-target").value="";
  click(lab.element("analyze"));
  assert.equal(lab.element("workbench-challenge").hidden,true);
  assert.equal(lab.element("workbench-target-lens").hidden,true);
  assert.equal(lab.element("workbench-flip-point").hidden,true);
  assert.equal(lab.element("workbench-decision-field").hidden,true);
  lab.element("known-target").value="50";
  lab.element("dataset").value="48,49,50,51,100.12345";
  click(lab.element("analyze"));
  assert.equal(lab.element("workbench-challenge").hidden,true);
  assert.equal(lab.element("workbench-target-lens").hidden,true);
  assert.equal(lab.element("workbench-flip-point").hidden,true);
  assert.equal(lab.element("workbench-decision-field").hidden,true);
  lab.element("dataset").value="bad input";
  click(lab.element("analyze"));
  assert.equal(lab.element("workbench-challenge").hidden,true);
  assert.equal(lab.element("workbench-target-lens").hidden,true);
  assert.equal(lab.element("workbench-flip-point").hidden,true);
  assert.equal(lab.element("workbench-decision-field").hidden,true);
});

test("decision field distinguishes a one-target tie from all-target tie rows", () => {
  const {PRESETS,parseView,evaluate,geometry,nearestEquality}=require("../decision-field.js");
  const b=PRESETS.b;
  assert.deepEqual(geometry(b.fixed).equalLines,[18,48,58]);
  assert.equal(nearestEquality(geometry(b.fixed).equalLines,68),58);
  assert.equal(evaluate(b.fixed,68,52).winner,"Mean");
  assert.equal(evaluate(b.fixed,68,51).winner,"Equal");
  assert.equal(evaluate(b.fixed,68,50).winner,"Median");
  for(const target of [0,25,52,100]) assert.equal(evaluate(b.fixed,58,target).winner,"Equal");
  assert.equal(evaluate(b.fixed,78,52).winner,"Equal");
  assert.equal(evaluate(b.fixed,78,0).winner,"Median");
  assert.deepEqual(geometry(PRESETS.a.fixed).equalLines,[47,49.5,52]);
  assert.deepEqual(geometry(PRESETS.c.fixed).equalLines,[37.5,100]);
  const shared=parseView("?fixed=40%2C42%2C50%2C60&fifth=68&target=51.000000001");
  assert.equal(shared.target,51.000000001);
  assert.equal(parseView("?fixed=40%2C42%2C50%2C60&fifth=101&target=52"),false);
  assert.equal(parseView("?fixed=40%2C42%2C50%2C60&fifth=68&target=52&target=53"),false);
  assert.match(fs.readFileSync(path.join(__dirname,"..","decision-field.html"),"utf8"),/src="decision-field\.js\?v=/);
  assert.match(fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8"),/href="decision-field\.html"/);
});

test("shape the data keeps mean movement exact and distinguishes target-only changes", () => {
  const {PRESETS,parseView,evaluate}=require("../shape-the-data.js");
  const start=evaluate(PRESETS.a.values,PRESETS.a.target);
  assert.equal(start.mean,56.6);
  assert.equal(start.median,50);
  assert.equal(start.winner,"Median");
  const moved=evaluate([48,49,50,51,95],50);
  assert.equal(moved.mean-start.mean,2);
  assert.equal(moved.median-start.median,0);
  assert.equal(evaluate([48,49,50,51,85],60).mean,start.mean);
  assert.equal(evaluate([48,49,50,51,85],60).winner,"Mean");
  assert.equal(evaluate(PRESETS.b.values,51).winner,"Equal");
  assert.equal(evaluate(PRESETS.c.values,0).sameEstimate,true);
  assert.equal(evaluate(PRESETS.c.values,100).winner,"Equal");
  assert.deepEqual(parseView("?values=48%2C49%2C50%2C51%2C85&target=50").values,PRESETS.a.values);
  assert.equal(parseView("?values=48%2C49%2C50%2C51%2C85&target=50&target=51"),false);
  assert.equal(parseView("?values=48%2C49%2C50%2C51%2C100.00001&target=50"),false);
  assert.equal(parseView("?values=48%2C49%2C50%2C51%2C85&target=-1"),false);
  const lab=loadLab();
  assert.equal(lab.element("workbench-shape").hidden,false);
  assert.match(lab.element("workbench-shape").href,/shape-the-data\.html\?values=48%2C49%2C50%2C51%2C85&target=50/);
  assert.match(fs.readFileSync(path.join(__dirname,"..","shape-the-data.html"),"utf8"),/src="shape-the-data\.js\?v=/);
});

test("flip levers ranks actual strict reversals for every movable reading", () => {
  const {PRESETS,parseView,evaluate,solveOne,rankLevers}=require("../flip-levers.js");
  const b=PRESETS.b,result=rankLevers(b.values,b.target);
  assert.equal(result.current.winner,"Mean");
  assert.equal(result.ranked.length,5);
  assert.equal(result.ranked[0].index,2);
  assert.equal(result.ranked[0].flip.value,51.6667);
  assert.equal(result.ranked[0].flip.winner,"Median");
  assert.deepEqual(solveOne(b.values,b.target,4).boundaries.filter(item=>item.reversal).map(item=>Math.round(item.value)),[18,48,58,78]);
  for(const lever of result.ranked) {
    const changed=[...b.values];changed[lever.index]=lever.flip.value;
    assert.equal(evaluate(changed,b.target).winner,"Median");
    assert.ok(lever.flip.distance>0);
    const nearer=[...changed];nearer[lever.index]=lever.flip.value+(lever.value>lever.flip.value?0.0001:-0.0001);
    if(nearer[lever.index]>=0&&nearer[lever.index]<=100) assert.notEqual(evaluate(nearer,b.target).winner,"Median");
  }
  const a=rankLevers(PRESETS.a.values,PRESETS.a.target);
  assert.equal(a.current.winner,"Median");
  assert.equal(a.ranked.length,3);
  assert.equal(a.levers[0].flip,null);
  assert.equal(rankLevers(PRESETS.c.values,PRESETS.c.target).ranked.length,0);
  assert.equal(parseView("?values=1%2C2%2C3%2C4%2C5&target=50&target=51"),false);
  assert.equal(parseView("?values=1%2C2%2C3%2C4%2C5.12345&target=50"),false);
  const lab=loadLab();
  assert.equal(lab.element("workbench-levers").hidden,false);
  assert.match(lab.element("workbench-levers").href,/flip-levers\.html\?values=48%2C49%2C50%2C51%2C85&target=50/);
  assert.match(fs.readFileSync(path.join(__dirname,"..","flip-levers.html"),"utf8"),/src="flip-levers\.js\?v=/);
});

test("One Move scores strict reversals against the exact four-decimal minimum", () => {
  const {ROUNDS,parsePuzzle,scoreAttempt,dailyPuzzle}=require("../one-move.js");
  const first=ROUNDS[0];
  assert.equal(scoreAttempt(first,2,"51.6666").flipped,false);
  const shortest=scoreAttempt(first,2,"51.6667");
  assert.equal(shortest.flipped,true);
  assert.equal(shortest.optimal,true);
  assert.equal(shortest.moveUnits,16667);
  assert.equal(shortest.minimumUnits,16667);
  assert.equal(shortest.result.winner,"Median");
  assert.equal(shortest.result.meanError,0.33334);
  assert.equal(shortest.result.medianError,0.3333);
  const longer=scoreAttempt(first,2,"52");
  assert.equal(longer.flipped,true);
  assert.equal(longer.excessUnits,3333);
  assert.equal(scoreAttempt(first,4,"58").result.winner,"Equal");
  assert.equal(scoreAttempt(first,4,"58").flipped,false);
  assert.match(scoreAttempt(first,2,"51.66666").error,/four decimal/);
  assert.match(scoreAttempt(first,5,"52").error,/Choose a reading/);
  for(const [round,index,value,winner] of [[ROUNDS[1],1,"52.4999","Mean"],[ROUNDS[2],3,"62.2499","Median"]]) {
    const result=scoreAttempt(round,index,value);
    assert.equal(result.optimal,true);
    assert.equal(result.result.winner,winner);
  }
  assert.equal(parsePuzzle("?round=2").round,1);
  assert.match(parsePuzzle("?round=1&round=2").error,/Unknown round/);
  assert.equal(parsePuzzle("?values=40%2C42%2C50%2C60%2C68&target=52").round,null);
  assert.equal(parsePuzzle("?values=0%2C0%2C50%2C100%2C100&target=50").round,0);
  assert.match(parsePuzzle("?values=0%2C0%2C50%2C100%2C100&target=50").error,/no strict/);
  assert.match(parsePuzzle("?values=1%2C2%2C3%2C4%2C5&target=101").error,/invalid/);
  const page=fs.readFileSync(path.join(__dirname,"..","one-move.html"),"utf8");
  assert.match(page,/src="flip-levers\.js\?v=3" defer/);
  assert.match(page,/src="one-move\.js\?v=37" defer/);
  assert.match(fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8"),/Play the three-round course/);
  assert.match(fs.readFileSync(path.join(__dirname,"..","flip-levers.html"),"utf8"),/id="puzzle-link"/);
});

test("integer certificate covers the full grid and proves every route's nearest strict reversal", () => {
  const {proveMinimum}=require("../minimum-proof.js");
  const {PRESETS,evaluate}=require("../flip-levers.js");
  const {values,target}=PRESETS.b,certificate=proveMinimum(values,target);
  assert.equal(certificate.positions,5000005);
  assert.equal(certificate.winner,"Mean");
  assert.deepEqual([certificate.best.index,certificate.best.toUnits,certificate.best.distanceUnits],[2,516667,16667]);
  const targetUnits=Math.round(target*10000);
  for(const route of certificate.routes) {
    assert.equal(route.segments[0].fromUnits,0);
    assert.equal(route.segments.at(-1).toUnits,1000000);
    for(let i=1;i<route.segments.length;i++)
      assert.equal(route.segments[i-1].toUnits,route.segments[i].fromUnits,"intervals cover the domain without gaps");
    const fixed=values.filter((_,i)=>i!==route.index).map(value=>Math.round(value*10000));
    const fixedSum=fixed.reduce((total,value)=>total+value,0);
    let nearest=null;
    // Separate exhaustive oracle: sort all five integer readings at every legal grid position.
    for(let reading=0;reading<=1000000;reading++) {
      const sorted=[...fixed,reading].sort((a,b)=>a-b);
      const gap=Math.abs(fixedSum+reading-5*targetUnits)-5*Math.abs(sorted[2]-targetUnits);
      if(gap<=0) continue;
      const distance=Math.abs(reading-route.fromUnits);
      if(!nearest||distance<nearest.distance||distance===nearest.distance&&reading<nearest.reading)
        nearest={reading,distance};
    }
    assert.equal(route.toUnits,nearest?.reading??null);
    assert.equal(route.distanceUnits,nearest?.distance??null);
    if(route.toUnits!==null) {
      const nearer=[...values];nearer[route.index]=route.nearMissUnits/10000;
      assert.notEqual(evaluate(nearer,target).winner,"Median");
    }
  }
  const html=fs.readFileSync(path.join(__dirname,"..","one-move.html"),"utf8");
  assert.match(html,/id="minimum-proof" hidden/);
  assert.match(html,/src="minimum-proof\.js\?v=1" defer/);
  assert.match(html,/id="proof-routes" aria-label="Independent minimum check for every reading"/);
});

test("integer proof handles ties, unreachable routes, and fractional near-misses", () => {
  const {proveMinimum}=require("../minimum-proof.js"),{PRESETS,rankLevers}=require("../flip-levers.js");
  const tied=proveMinimum(PRESETS.c.values,PRESETS.c.target);
  assert.equal(tied.winner,"Equal");
  assert.equal(tied.best,null);
  const unreachable=proveMinimum(PRESETS.a.values,PRESETS.a.target);
  assert.equal(unreachable.routes[0].toUnits,null);
  assert.equal(unreachable.routes.filter(route=>route.toUnits!==null).length,3);
  assert.throws(()=>proveMinimum([1,2,3,4,5.00001],50),/four-decimal/);
  let seed=7123001;
  const roll=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let trial=0;trial<500;trial++) {
    const values=Array.from({length:5},()=>Math.round(roll()*1000000)/10000);
    const target=Math.round(roll()*1000000)/10000;
    const proof=proveMinimum(values,target),solver=rankLevers(values,target);
    for(const route of proof.routes) {
      const flip=solver.levers[route.index].flip;
      assert.equal(route.toUnits,flip?Math.round(flip.value*10000):null,
        `solver disagreement in trial ${trial}, reading ${route.index+1}`);
      if(route.toUnits!==null) {
        const original=route.initialDifference;
        assert.ok(original<0?route.winnerDifference>0:route.winnerDifference<0);
        assert.ok(original<0?route.nearMissDifference<=0:route.nearMissDifference>=0);
      }
    }
  }
});

test("the result reveals the five-route certificate only after a strict flip", () => {
  const elements=new Map();
  function element(id) {
    if(["home-daily-preview","daily-trail","practice-run"].includes(id)) return null;
    if(!elements.has(id)) elements.set(id,{textContent:"",value:"",hidden:false,open:false,style:{},dataset:{},handlers:{},children:[],
      addEventListener(name,callback){this.handlers[name]=callback;},setAttribute(){},scrollIntoView(){},focus(){},
      append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},getContext(){return null;}});
    return elements.get(id);
  }
  const readings=Array.from({length:5},()=>({handlers:{},addEventListener(name,callback){this.handlers[name]=callback;},
    setAttribute(){},querySelector(){return {textContent:"",style:{}};}}));
  const document={getElementById:element,querySelectorAll(selector){return selector===".reading"?readings:[];},
    createElement(){return {textContent:"",style:{},dataset:{},children:[],append(...items){this.children.push(...items);},setAttribute(){}};}};
  const window={location:{search:"?round=1",hash:"",href:"https://example.test/one-move.html?round=1"},history:{replaceState(){}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,"..","one-move.js"),"utf8"),
    {module:{exports:{}},require:name=>require(path.join(__dirname,"..",name)),window,document,Date,URL,URLSearchParams},
    {timeout:2000});
  assert.equal(element("minimum-proof").hidden,true);
  element("proposed").value="51.6667";
  element("submit").handlers.click();
  assert.equal(element("minimum-proof").hidden,false);
  assert.equal(element("minimum-proof").open,true);
  assert.match(element("proof-summary").textContent,/5,000,005 possible final positions/);
  assert.match(element("proof-winner").textContent,/Reading 3 moves from 50 to 51\.6667/);
  assert.equal(element("proof-routes").children.length,5);
  assert.match(element("proof-routes").children[2].children[1].textContent,/51\.6666 is mean closer; 51\.6667 is median closer/);
  element("proposed").value="51.6666";
  element("submit").handlers.click();
  assert.equal(element("minimum-proof").hidden,true);
});

test("daily puzzle is reproducible by date and every generated edition has a real reversal", () => {
  const {dailyPuzzle,parsePuzzle,scoreAttempt}=require("../one-move.js");
  const {rankLevers}=require("../flip-levers.js");
  const day="2026-10-12",today=dailyPuzzle(day);
  assert.deepEqual(today.values,[40,67,92,43,84]);
  assert.equal(today.target,80);
  assert.deepEqual(dailyPuzzle(day),today);
  assert.notDeepEqual(dailyPuzzle("2026-10-13").values,today.values);
  assert.equal(parsePuzzle("?daily=today",new Date(2026,9,12,12)).puzzle.date,day);
  assert.deepEqual(parsePuzzle("?daily="+day).puzzle,today);
  assert.match(parsePuzzle("?daily=2026-02-30").error,/invalid/);
  assert.match(parsePuzzle("?daily="+day+"&daily="+day).error,/invalid/);
  const optimal=rankLevers(today.values,today.target).ranked[0];
  assert.equal(optimal.index,1);
  assert.equal(optimal.flip.value,64.7499);
  assert.equal(scoreAttempt(today,optimal.index,String(optimal.flip.value)).optimal,true);
  for(let i=0;i<366;i++) {
    const date=new Date(Date.UTC(2027,0,1+i)).toISOString().slice(0,10);
    const puzzle=dailyPuzzle(date);
    assert.ok(puzzle,"missing daily case for "+date);
    const ranked=rankLevers(puzzle.values,puzzle.target);
    assert.ok(ranked.ranked.length>=3);
    assert.ok(ranked.ranked[0].flip.distance>=.75&&ranked.ranked[0].flip.distance<=12);
  }
  const html=fs.readFileSync(path.join(__dirname,"..","one-move.html"),"utf8");
  assert.match(html,/href="one-move\.html\?daily=today"/);
  assert.match(html,/href="one-move\.html\?round=1#stage">Play the three-round course/);
  assert.match(fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8"),/Play today's puzzle/);
});

test("homepage previews and shares the exact local daily puzzle without a solution", async () => {
  const {dailyPreview,dailyPuzzle,dailyInvitation,initialReading,parsePuzzle,ROUNDS}=require("../one-move.js");
  const first=dailyPreview(new Date(2026,9,12,12));
  assert.equal(first.day,"2026-10-12");
  assert.deepEqual(first.puzzle,dailyPuzzle(first.day));
  assert.equal(first.winner,"Median");
  assert.equal(first.estimate,67);
  assert.equal(first.mean,65.2);
  assert.equal(first.median,67);
  assert.equal(first.href,"one-move.html?daily=2026-10-12#stage");
  assert.deepEqual(parsePuzzle("?daily=2026-10-12&pick=2").puzzle,first.puzzle);
  assert.equal(initialReading("?daily=2026-10-12&pick=2",first.puzzle),1);
  assert.equal(initialReading("?daily=2026-10-12&pick=2&pick=3",first.puzzle),2);
  assert.equal(initialReading("?daily=2026-10-12&pick=02",first.puzzle),2);
  assert.equal(initialReading("?round=1&pick=2",ROUNDS[0]),2);
  const invitation=dailyInvitation(first,"https://example.test/one-move.html?daily=2026-10-12#stage");
  assert.match(invitation,/2026-10-12/);
  assert.match(invitation,/https:\/\/example\.test\/one-move\.html\?daily=2026-10-12#stage/);
  assert.doesNotMatch(invitation,/Median|64\.7499|target 80/);

  let day=12;
  class LocalDate extends Date {
    constructor(...args) {super(...(args.length?args:[2026,9,day,12]));}
  }
  const readings=Array.from({length:5},()=>({textContent:""}));
  const choices=Array.from({length:5},()=>({attributes:{},handlers:{},setAttribute(name,value){this.attributes[name]=value;},addEventListener(name,handler){this.handlers[name]=handler;}}));
  const home={dataset:{},querySelectorAll:selector=>selector==="[data-preview-reading]"?readings:choices};
  const elements=new Map([["home-daily-preview",home],["stage",null]]);
  const makeNode=tagName=>({tagName,textContent:"",href:"",className:"",dataset:{},style:{},attributes:{},children:[],
    setAttribute(name,value){this.attributes[name]=value;},
    append(...children){this.children.push(...children);},
    replaceChildren(...children){this.children=children;}});
  const trail=makeNode("div");
  elements.set("home-daily-trail",trail);
  const cardLabels=[],card=makeNode("canvas"),cardKit={open:false,handlers:{},addEventListener(name,handler){this.handlers[name]=handler;}};
  card.getContext=()=>({fillRect(){},strokeRect(){},fillText(value){cardLabels.push(value);}});
  card.toBlob=callback=>callback({});
  elements.set("home-daily-card",card);
  elements.set("home-daily-card-kit",cardKit);
  elements.set("home-daily-card-status",{textContent:""});
  const cardDownload={handlers:{},addEventListener(name,handler){this.handlers[name]=handler;}};
  elements.set("home-daily-card-download",cardDownload);
  const cardCopy={handlers:{},addEventListener(name,handler){this.handlers[name]=handler;}};
  elements.set("home-daily-card-copy",cardCopy);
  const cardShare={hidden:true,disabled:true,handlers:{},addEventListener(name,handler){this.handlers[name]=handler;}};
  elements.set("home-daily-card-share",cardShare);
  const map=makeNode("div"),mapReadings=makeNode("div");
  elements.set("home-daily-map",map);
  elements.set("home-daily-map-readings",mapReadings);
  for(const name of ["target","mean","median"]) {
    elements.set("home-daily-map-"+name,makeNode("span"));
    elements.set("home-daily-map-"+name+"-value",makeNode("strong"));
    if(name!=="target") {
      elements.set("home-daily-map-"+name+"-target",makeNode("span"));
      elements.set("home-daily-map-"+name+"-distance",makeNode("span"));
    }
  }
  elements.set("home-daily-map-errors",makeNode("p"));
  elements.set("home-daily-trail-summary",{textContent:""});
  for(const id of ["home-daily-date","home-daily-target","home-daily-winner","home-daily-link","home-daily-share-status"])
    elements.set(id,{textContent:"",href:"",dateTime:""});
  elements.set("home-daily-progress",{hidden:true,textContent:""});
  elements.set("home-daily-draft",{hidden:true,textContent:""});
  elements.set("hero-daily-date",{dateTime:"",textContent:""});
  elements.set("hero-daily-status",{textContent:""});
  elements.set("hero-daily-link",makeNode("a"));
  const share={handlers:{},addEventListener(name,handler){this.handlers[name]=handler;}};
  elements.set("home-daily-share",share);
  const events={};
  let downloaded=null;
  const document={getElementById:id=>elements.get(id)??null,createElement:tag=>{
      const node=makeNode(tag);node.click=()=>{downloaded={href:node.href,filename:node.download};};node.remove=()=>{};return node;},
    body:{append(){}},addEventListener:(name,handler)=>events[name]=handler,hidden:false};
  const saved=new Map();
  const window={location:{href:"https://example.test/"},localStorage:{getItem:key=>saved.get(key)??null},addEventListener:(name,handler)=>events[name]=handler};
  let copied=null,sent=null;
  const timers=new Map();let nextTimer=0;
  const navigator={clipboard:{async writeText(value){copied=value;}},
    canShare:data=>Array.isArray(data.files)&&data.files[0]?.type==="image/png",
    async share(data){sent=data;}};
  class CardFile {constructor(parts,name,options){this.parts=parts;this.name=name;this.type=options.type;}}
  class CardURL extends URL {static createObjectURL(){return "blob:daily-card";}static revokeObjectURL(){}}
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,"..","one-move.js"),"utf8"),
    {module:{exports:{}},require:()=>require("../flip-levers.js"),window,document,navigator,File:CardFile,Date:LocalDate,URL:CardURL,URLSearchParams,
      setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)},{timeout:2000});
  assert.deepEqual(readings.map(item=>item.textContent),["40","67","92","43","84"]);
  assert.equal(elements.get("home-daily-target").textContent,"80");
  assert.equal(elements.get("home-daily-winner").textContent,"Median 67 is closer");
  assert.equal(elements.get("home-daily-link").href,first.href);
  assert.equal(elements.get("home-daily-link").textContent,"Play today's puzzle ↗");
  assert.equal(elements.get("home-daily-date").dateTime,first.day);
  assert.equal(elements.get("hero-daily-date").dateTime,first.day);
  assert.equal(elements.get("hero-daily-status").textContent,"Fresh puzzle ready");
  assert.match(elements.get("hero-daily-link").attributes["aria-label"],/2026-10-12.*Fresh puzzle ready/);
  assert.equal(elements.get("home-daily-progress").hidden,true);
  assert.equal(elements.get("home-daily-draft").hidden,true);
  assert.equal(mapReadings.children.length,5);
  assert.deepEqual(mapReadings.children.map(marker=>marker.style.left),["40%","67%","92%","43%","84%"]);
  assert.equal(elements.get("home-daily-map-target").style.left,"80%");
  assert.equal(elements.get("home-daily-map-mean").style.left,"65.2%");
  assert.equal(elements.get("home-daily-map-median").style.left,"67%");
  assert.equal(elements.get("home-daily-map-mean-value").textContent,"65.2");
  assert.equal(elements.get("home-daily-map-mean-target").style.left,"80%");
  assert.equal(elements.get("home-daily-map-mean-distance").style.left,"65.2%");
  assert.equal(elements.get("home-daily-map-mean-distance").style.width,"14.8%");
  assert.equal(elements.get("home-daily-map-median-distance").style.width,"13%");
  assert.equal(elements.get("home-daily-map-errors").textContent,"Shorter band = closer to target · Mean error 14.8 · Median error 13");
  assert.match(map.attributes["aria-label"],/Readings 40, 67, 92, 43, 84\. Target 80\. Mean 65\.2, error 14\.8\. Median 67, error 13\./);
  cardKit.open=true;cardKit.handlers.toggle({target:cardKit});
  assert.equal(cardShare.hidden,false);
  assert.equal(cardShare.disabled,false);
  assert.ok(cardLabels.includes("DAILY FLIP / 2026-10-12"));
  assert.ok(cardLabels.includes("aruintelligence.github.io/inward-mathematics-simulator/one-move.html?daily=2026-10-12"));
  assert.ok(cardLabels.includes("READING 05"));
  assert.ok(cardLabels.includes("80"));
  assert.doesNotMatch(cardLabels.join(" "),/MEDIAN|MEAN|WINNER|64\.7499|EXACT MINIMUM/);
  assert.match(card.attributes["aria-label"],/Readings 40, 67, 92, 43, 84\. Target 80\. Find a one-reading reversal\. Answer hidden\./);
  cardDownload.handlers.click();
  assert.deepEqual(downloaded,{href:"blob:daily-card",filename:"inward-math-daily-challenge-2026-10-12.png"});
  assert.equal(elements.get("home-daily-card-status").textContent,"Challenge PNG downloaded.");
  await cardShare.handlers.click();
  assert.equal(sent.files[0].name,"inward-math-daily-challenge-2026-10-12.png");
  assert.equal(sent.files[0].type,"image/png");
  assert.match(sent.text,/one-move\.html\?daily=2026-10-12#stage/);
  assert.doesNotMatch(sent.text,/Median|Mean 65\.2|target 80/);
  assert.equal(elements.get("home-daily-card-status").textContent,"Challenge image shared.");
  navigator.share=async()=>{throw Object.assign(new Error("Canceled"),{name:"AbortError"});};
  await cardShare.handlers.click();
  assert.equal(elements.get("home-daily-card-status").textContent,"Sharing canceled.");
  navigator.share=undefined;
  assert.equal(trail.children.length,7);
  assert.equal(trail.children[0].href,"one-move.html?daily=2026-10-12#stage");
  assert.equal(trail.children[0].attributes["aria-current"],"date");
  assert.equal(trail.children[6].href,"one-move.html?daily=2026-10-06#stage");
  assert.equal(elements.get("home-daily-trail-summary").textContent,"0 of 7 flipped · 0 exact on this device");
  saved.set("inward-math-daily-v1-2026-10-10","110000");
  events.pageshow();
  assert.equal(trail.children[2].dataset.state,"complete");
  assert.equal(trail.children[2].children[2].textContent,"Best 11");
  assert.equal(trail.children[2].attributes["aria-label"],"Open 2026-10-10 Daily Flip. Best move on this device: 11. A shorter move exists.");
  assert.equal(elements.get("home-daily-trail-summary").textContent,"1 of 7 flipped · 0 exact on this device");
  saved.set("inward-math-daily-v1-2026-10-12","50001");
  events.pageshow();
  assert.equal(elements.get("home-daily-link").textContent,"Beat your best ↗");
  assert.equal(elements.get("home-daily-progress").hidden,false);
  assert.equal(elements.get("home-daily-progress").textContent,"Flipped on this device · best move 5.0001");
  assert.equal(elements.get("hero-daily-status").textContent,"Shorter move still possible");
  assert.equal(elements.get("home-daily-trail-summary").textContent,"2 of 7 flipped · 0 exact on this device");
  saved.set("inward-math-daily-v1-2026-10-12","22501");
  events.pageshow();
  assert.equal(elements.get("home-daily-link").textContent,"Replay today's puzzle ↗");
  assert.equal(elements.get("home-daily-progress").textContent,"Exact minimum on this device · move 2.2501");
  assert.equal(elements.get("hero-daily-status").textContent,"Exact minimum saved");
  assert.equal(trail.children[0].dataset.state,"exact");
  assert.equal(trail.children[0].children[2].textContent,"Exact · 2.2501");
  assert.equal(trail.children[0].attributes["aria-label"],"Open 2026-10-12 Daily Flip. Exact minimum on this device: 2.2501.");
  assert.equal(elements.get("home-daily-trail-summary").textContent,"2 of 7 flipped · 1 exact on this device");
  saved.set("inward-math-draft-v1-2026-10-12",JSON.stringify({index:1,value:64.7499}));
  events.pageshow();
  assert.equal(elements.get("home-daily-link").textContent,"Resume your move ↗");
  assert.equal(elements.get("home-daily-draft").hidden,false);
  assert.equal(elements.get("home-daily-draft").textContent,"Draft on this device · Reading 2 → 64.7499");
  assert.equal(elements.get("hero-daily-status").textContent,"Exact minimum saved");
  choices[1].handlers.click();
  assert.equal(choices[1].attributes["aria-pressed"],"true");
  assert.equal(mapReadings.children[1].dataset.selected,"true");
  assert.equal(mapReadings.children[0].dataset.selected,"false");
  assert.match(map.attributes["aria-label"],/Reading 2 selected\./);
  assert.equal(choices[0].attributes["aria-pressed"],"false");
  assert.equal(choices[1].attributes["aria-label"],"Reading 2, 67. Choose this reading to move.");
  assert.equal(elements.get("home-daily-link").href,"one-move.html?daily=2026-10-12&pick=2#stage");
  assert.equal(elements.get("home-daily-link").textContent,"Try reading 2 ↗");
  elements.get("home-daily-share-status").textContent="Puzzle invitation copied.";
  const [midnightId,midnightTimer]=[...timers].find(([,timer])=>timer.ms>1000000);
  assert.ok(midnightTimer.ms>11*60*60*1000&&midnightTimer.ms<13*60*60*1000);
  day=13;timers.delete(midnightId);midnightTimer.fn();
  assert.equal(elements.get("home-daily-date").dateTime,"2026-10-13");
  assert.equal(elements.get("hero-daily-date").dateTime,"2026-10-13");
  assert.equal(elements.get("hero-daily-status").textContent,"Fresh puzzle ready");
  assert.equal(elements.get("home-daily-link").href,"one-move.html?daily=2026-10-13#stage");
  assert.equal(elements.get("home-daily-link").textContent,"Play today's puzzle ↗");
  assert.equal(elements.get("home-daily-progress").hidden,true);
  assert.equal(elements.get("home-daily-progress").textContent,"");
  assert.equal(elements.get("home-daily-draft").hidden,true);
  assert.equal(elements.get("home-daily-draft").textContent,"");
  assert.equal(elements.get("home-daily-share-status").textContent,"");
  assert.equal(choices[1].attributes["aria-pressed"],"false");
  assert.equal(mapReadings.children[1].style.left,"41%");
  assert.equal(mapReadings.children[1].dataset.selected,"false");
  assert.equal(elements.get("home-daily-map-target").style.left,"31%");
  assert.equal(elements.get("home-daily-map-mean").style.left,"36.6%");
  assert.equal(elements.get("home-daily-map-median").style.left,"41%");
  assert.ok(cardLabels.includes("DAILY FLIP / 2026-10-13"));
  assert.match(card.attributes["aria-label"],/Readings 53, 41, 44, 32, 13\. Target 31\./);
  assert.equal(cardShare.disabled,false);
  assert.equal(elements.get("home-daily-map-mean-distance").style.left,"31%");
  assert.equal(elements.get("home-daily-map-mean-distance").style.width,"5.6%");
  assert.equal(elements.get("home-daily-map-median-distance").style.width,"10%");
  assert.match(elements.get("home-daily-map-errors").textContent,/Mean error 5\.6 · Median error 10/);
  assert.equal(trail.children[0].href,"one-move.html?daily=2026-10-13#stage");
  assert.equal(trail.children[0].attributes["aria-current"],"date");
  assert.equal(trail.children[1].dataset.state,"exact");
  assert.equal(elements.get("home-daily-trail-summary").textContent,"2 of 7 flipped · 1 exact on this device");
  assert.deepEqual(readings.map(item=>Number(item.textContent)),dailyPuzzle("2026-10-13").values);
  choices[3].handlers.click();
  assert.equal(elements.get("home-daily-link").href,"one-move.html?daily=2026-10-13&pick=4#stage");
  await cardCopy.handlers.click();
  assert.equal(copied,"https://example.test/one-move.html?daily=2026-10-13#stage");
  assert.equal(elements.get("home-daily-card-status").textContent,"Dated puzzle link copied.");
  copied=null;
  await share.handlers.click();
  assert.match(copied,/one-move\.html\?daily=2026-10-13#stage/);
  assert.doesNotMatch(copied,/pick=/);
  assert.doesNotMatch(copied,/Mean \d|Median \d|64\.7499/);
  assert.match(elements.get("home-daily-share-status").textContent,/copied/);
  navigator.share=async data=>{sent=data;};
  await share.handlers.click();
  assert.equal(sent.url,"https://example.test/one-move.html?daily=2026-10-13#stage");
  assert.doesNotMatch(sent.text,/Mean \d|Median \d/);
  copied=null;
  navigator.share=async()=>{throw Object.assign(new Error("Canceled"),{name:"AbortError"});};
  await share.handlers.click();
  assert.equal(copied,null,"canceling native share must not copy an invitation");
  assert.equal(elements.get("home-daily-share-status").textContent,"Sharing canceled.");
  const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
  assert.match(html,/id="home-daily-preview"/);
  assert.match(html,/id="hero-daily-link" href="#home-daily-preview"/);
  assert.match(html,/id="home-daily-progress" role="status" hidden/);
  assert.match(html,/id="home-daily-draft" role="status" hidden/);
  assert.match(html,/id="home-daily-map" role="img" aria-label="Starting arrangement/);
  assert.match(html,/id="home-daily-map-readings"/);
  assert.match(html,/id="home-daily-map-mean-distance"/);
  assert.match(html,/id="home-daily-card-kit"/);
  assert.match(html,/id="home-daily-card-share" type="button" hidden disabled/);
  assert.match(html,/id="home-daily-card-download"/);
  assert.match(html,/id="home-daily-card-copy"/);
  assert.match(html,/data-preview-pick aria-pressed="false"/);
  assert.match(html,/id="home-daily-share"/);
  assert.match(html,/id="home-daily-trail"/);
  assert.match(html,/src="flip-levers\.js\?v=3" defer/);
  assert.match(html,/src="one-move\.js\?v=37" defer/);
});

test("numbered practice cases replay exactly and always have viable strict flips", () => {
  const {practicePuzzle,parsePuzzle,scoreAttempt,dailyPuzzle,duelInvitation}=require("../one-move.js");
  const {rankLevers}=require("../flip-levers.js");
  assert.deepEqual(practicePuzzle(1),practicePuzzle(1));
  assert.notDeepEqual(practicePuzzle(1).values,practicePuzzle(2).values);
  assert.notDeepEqual(practicePuzzle(1).values,dailyPuzzle("2026-10-12").values);
  assert.deepEqual(parsePuzzle("?practice=1").puzzle,practicePuzzle(1));
  for(const invalid of ["0","01","1000000","abc","1&practice=2","1&daily=2026-10-12","1&round=2","1&values=1,2,3,4,5&target=50"]) {
    assert.match(parsePuzzle("?practice="+invalid).error,/Round 1 is loaded/);
  }
  for(const seed of [1,2,3,10,42,99,100,999,1000,999999]) {
    const puzzle=practicePuzzle(seed),ranked=rankLevers(puzzle.values,puzzle.target);
    assert.equal(puzzle.practice,seed);
    assert.equal(new Set(puzzle.values).size,5);
    assert.ok(ranked.ranked.length>=3);
    assert.ok(ranked.ranked[0].flip.distance>=.75&&ranked.ranked[0].flip.distance<=12);
    const route=ranked.ranked[0];
    assert.equal(scoreAttempt(puzzle,route.index,String(route.flip.value)).optimal,true);
  }
  const invitation=duelInvitation(practicePuzzle(42),12345,"https://example.test/one-move.html?practice=42");
  assert.match(invitation,/Practice Flip \/ 42/);
  assert.doesNotMatch(invitation,/reading|target|solution/i);
  const html=fs.readFileSync(path.join(__dirname,"..","one-move.html"),"utf8");
  assert.match(html,/href="one-move\.html\?practice=1#stage">Start practice/);
  assert.match(html,/id="practice-title">The open run/);
});

test("practice run records one best result per case and upgrades exact wins", () => {
  const {recordPractice}=require("../one-move.js");
  const first=recordPractice([],1,35000,false);
  assert.deepEqual(first,[{seed:1,moveUnits:35000,optimal:false}]);
  const worse=recordPractice(first,1,42000,false);
  assert.deepEqual(worse,first);
  const exact=recordPractice(worse,1,22501,true);
  assert.deepEqual(exact,[{seed:1,moveUnits:22501,optimal:true}]);
  const second=recordPractice(exact,2,91001,false);
  assert.deepEqual(second.map(entry=>entry.seed),[1,2]);
  assert.equal(second.filter(entry=>entry.optimal).length,1);
  assert.deepEqual(first,[{seed:1,moveUnits:35000,optimal:false}],"previous run state remains independent");
  const html=fs.readFileSync(path.join(__dirname,"..","one-move.html"),"utf8");
  assert.match(html,/id="practice-run" hidden/);
  assert.match(html,/id="run-track" aria-label="Recent practice cases"/);
  assert.match(html,/id="run-resume" type="button" hidden/);
});

test("post-flip route atlas ranks all five readings and distinguishes unreachable routes", () => {
  const {routeAtlas,ROUNDS}=require("../one-move.js");
  const atlas=routeAtlas(ROUNDS[2],2);
  assert.equal(atlas.viable,4);
  assert.deepEqual(atlas.routes.map(route=>route.index),[3,4,0,1,2]);
  assert.equal(atlas.routes[0].best,true);
  assert.equal(atlas.routes[0].to,62.2499);
  assert.equal(atlas.routes[4].chosen,true);
  assert.equal(atlas.routes[4].distance,null);
  assert.equal(atlas.routes[4].width,0);
  assert.equal(atlas.routes[3].width,100);
  const html=fs.readFileSync(path.join(__dirname,"..","one-move.html"),"utf8");
  assert.match(html,/id="route-atlas" hidden/);
  assert.match(html,/id="route-list" role="list"/);
});

test("result PNG names identify the edition without embedding puzzle values", () => {
  const {resultCardFilename,ROUNDS,dailyPuzzle,practicePuzzle,parsePuzzle}=require("../one-move.js");
  assert.equal(resultCardFilename(ROUNDS[2]),"inward-math-one-move-round-3.png");
  assert.equal(resultCardFilename(dailyPuzzle("2026-10-12")),"inward-math-one-move-daily-2026-10-12.png");
  assert.equal(resultCardFilename(practicePuzzle(42)),"inward-math-one-move-case-42.png");
  assert.equal(resultCardFilename(parsePuzzle("?values=40%2C42%2C50%2C60%2C68&target=52").puzzle),"inward-math-one-move-shared.png");
  const html=fs.readFileSync(path.join(__dirname,"..","one-move.html"),"utf8");
  assert.match(html,/id="move-card-kit" hidden/);
  assert.match(html,/id="download-move-card" type="button"/);
});

test("the seven-day trail crosses months and leap days in local calendar order", () => {
  const {recentDays,nextOpenDaily,trailState,datedEdition}=require("../one-move.js");
  assert.deepEqual(recentDays(new Date(2028,2,2,12)).map(entry=>entry.day),[
    "2028-02-25","2028-02-26","2028-02-27","2028-02-28","2028-02-29","2028-03-01","2028-03-02"]);
  assert.deepEqual(recentDays(new Date(2027,0,2,12)).map(entry=>entry.day),[
    "2026-12-27","2026-12-28","2026-12-29","2026-12-30","2026-12-31","2027-01-01","2027-01-02"]);
  const today=new Date(2028,2,2,12),completed=new Set(["2028-03-02","2028-03-01","2028-02-29"]);
  const best=day=>completed.has(day)?10000:null;
  assert.equal(nextOpenDaily(today,"2028-02-28",best),"2028-02-27");
  assert.equal(nextOpenDaily(today,"2028-02-28",()=>10000),null);
  assert.equal(trailState("2026-10-12",null).state,"open");
  assert.equal(trailState("2026-10-12",22501).state,"exact");
  assert.equal(trailState("2026-10-12",32501).state,"complete");
  assert.match(trailState("2026-10-12",32501).aria,/shorter move exists/);
  const archived=datedEdition("2026-10-12",new Date(2026,9,13,12),()=>22501);
  assert.equal(archived.href,"one-move.html?daily=2026-10-12#stage");
  assert.match(archived.progress,/Exact minimum on this device: 2\.2501/);
  assert.equal(datedEdition("2028-02-29",new Date(2028,2,2,12),()=>null).day,"2028-02-29");
  assert.equal(datedEdition("2028-02-30",new Date(2028,2,2,12),()=>null),null);
  assert.equal(datedEdition("2026-10-14",new Date(2026,9,13,12),()=>null),null,"future daily puzzles stay out of the date explorer");
  assert.equal(datedEdition("1999-12-31",new Date(2026,9,13,12),()=>null),null);
  const html=fs.readFileSync(path.join(__dirname,"..","one-move.html"),"utf8");
  assert.match(html,/id="daily-trail" aria-label="Recent Daily Flip editions"/);
  assert.match(html,/id="date-explorer-input" type="date"/);
  assert.match(fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8"),/href="one-move\.html#date-explorer"/);
});

test("progressive hints teach the estimators and point to a viable direction without the value", () => {
  const {hintFor,ROUNDS,dailyPuzzle}=require("../one-move.js");
  const {rankLevers}=require("../flip-levers.js");
  const examples=[...ROUNDS,dailyPuzzle("2026-10-12"),dailyPuzzle("2026-10-13")];
  for(const puzzle of examples) {
    const insight=hintFor(puzzle,1),route=rankLevers(puzzle.values,puzzle.target).ranked[0];
    const nudge=hintFor(puzzle,2),direction=route.flip.value<route.value?"down":"up";
    assert.match(insight,/mean uses all five readings.*median is the middle/i);
    assert.match(nudge,new RegExp("Reading "+(route.index+1)+"\\. Move it "+direction));
    assert.equal(nudge.includes(String(route.flip.value)),false);
    assert.equal(hintFor(puzzle,0),"");
  }
  const html=fs.readFileSync(path.join(__dirname,"..","one-move.html"),"utf8");
  assert.match(html,/id="hint-button"[^>]+aria-controls="hint-panel"/);
  assert.match(html,/id="hint-panel" hidden aria-live="polite"/);
});

test("committed verdict shift explains a both-worse reversal, a tie, and an unchanged guess", () => {
  const {verdictShift,scoreAttempt,dailyPuzzle,ROUNDS}=require("../one-move.js");
  const puzzle=dailyPuzzle("2026-10-12");
  const shifted=verdictShift(puzzle,scoreAttempt(puzzle,1,"64.7499"));
  assert.equal(shifted.before.winner,"Median");
  assert.equal(shifted.after.winner,"Mean");
  assert.ok(shifted.after.meanError>shifted.before.meanError);
  assert.ok(shifted.after.medianError>shifted.before.medianError);
  assert.match(shifted.insight,/^Both errors grew\. The mean is closer by /);
  assert.equal(shifted.scale,Math.max(1,shifted.before.meanError,shifted.before.medianError,shifted.after.meanError,shifted.after.medianError));
  const tied=verdictShift(ROUNDS[0],scoreAttempt(ROUNDS[0],4,"58"));
  assert.equal(tied.after.winner,"Equal");
  assert.match(tied.insight,/tie, not a strict reversal/);
  const unchanged=verdictShift(ROUNDS[0],scoreAttempt(ROUNDS[0],2,"50"));
  assert.match(unchanged.insight,/^Neither error moved\./);
  const html=fs.readFileSync(path.join(__dirname,"..","one-move.html"),"utf8");
  assert.match(html,/id="verdict-shift" hidden/);
  for(const phase of ["before","after"]) for(const kind of ["mean","median"]) {
    assert.match(html,new RegExp('id="'+phase+'-'+kind+'-bar"'));
    assert.match(html,new RegExp('id="'+phase+'-'+kind+'-error"'));
  }
});

test("move anatomy tracks the changed reading through sorted order and one-fifth mean movement", () => {
  const {moveMechanism,scoreAttempt,ROUNDS}=require("../one-move.js");
  const puzzle=ROUNDS[0],attempt=scoreAttempt(puzzle,2,"51.6667");
  const anatomy=moveMechanism(puzzle,attempt);
  assert.deepEqual(anatomy.before.map(item=>item.value),[40,42,50,60,68]);
  assert.deepEqual(anatomy.after.map(item=>item.value),[40,42,51.6667,60,68]);
  assert.equal(anatomy.meanMove,.33334);
  assert.equal(anatomy.medianBefore,50);
  assert.equal(anatomy.medianAfter,51.6667);
  assert.match(anatomy.explanation,/mean moves \+0\.33334.*median moves from 50 to 51\.6667/i);
  const tie=moveMechanism(puzzle,scoreAttempt(puzzle,4,"58"));
  assert.equal(tie.meanMove,-2);
  assert.equal(tie.medianAfter,50);
  assert.match(tie.explanation,/median stays at 50/);
  const duplicates={values:[10,20,20,30,40]};
  const repeated=moveMechanism(duplicates,{index:1,value:35});
  assert.deepEqual(repeated.before.map(item=>item.index),[0,1,2,3,4]);
  assert.deepEqual(repeated.after.map(item=>item.index),[0,2,3,1,4]);
  assert.equal(repeated.medianAfter,30);
  const html=fs.readFileSync(path.join(__dirname,"..","one-move.html"),"utf8");
  assert.match(html,/id="mechanism" hidden/);
  assert.match(html,/id="before-sorted"[^>]+aria-label="Readings before, sorted"/);
  assert.match(html,/id="after-sorted"[^>]+aria-label="Readings after, sorted"/);
});

test("blind duel invitation shares a score and reproducible puzzle without the answer", () => {
  const {dailyPuzzle,duelInvitation,ROUNDS}=require("../one-move.js");
  const puzzle=dailyPuzzle("2026-10-12"),url="https://example.test/one-move.html?daily=2026-10-12";
  const text=duelInvitation(puzzle,32501,url);
  assert.match(text,/Daily Flip \/ 2026-10-12/);
  assert.match(text,/move of 3\.2501/);
  assert.match(text,/Can you beat my move\?/);
  assert.ok(text.endsWith(url));
  assert.doesNotMatch(text,/40|67|92|43|84|target|reading|64\.7499/i);
  assert.match(duelInvitation(ROUNDS[0],16667,"https://example.test/round=1"),/One Move · I flipped the verdict with a move of 1\.6667/);
  const html=fs.readFileSync(path.join(__dirname,"..","one-move.html"),"utf8");
  assert.match(html,/id="duel" hidden/);
  assert.match(html,/id="duel-share" type="button">Challenge a friend/);
});

test("a cached pre-duel page still initializes and scores with the new script", () => {
  const elements=new Map(),legacy=new Set(["duel","duel-status","duel-score","duel-edition","duel-share","daily-trail","trail-summary","hint-button","hint-panel","hint-one","hint-two","hint-progress","verdict-shift","mechanism","practice-run","run-resume","route-atlas","move-card-kit","download-move-card"]);
  function element(id) {
    if(legacy.has(id)) return null;
    if(!elements.has(id)) elements.set(id,{textContent:"",value:"",hidden:false,style:{},dataset:{},handlers:{},
      addEventListener(name,callback){this.handlers[name]=callback;},
      setAttribute(){},scrollIntoView(){},focus(){this.focused=true;}});
    return elements.get(id);
  }
  const readings=Array.from({length:5},()=>({handlers:{},addEventListener(name,callback){this.handlers[name]=callback;},
    setAttribute(){},querySelector(){return {textContent:"",style:{}};}}));
  const document={getElementById:element,querySelectorAll(selector){return selector===".reading"?readings:[];}};
  let address="",pushed=[];
  const historyEvents={};
  const saved=new Map(),key="inward-math-draft-v1-2026-10-12";
  class TestDate extends Date {constructor(...args){super(...(args.length?args:[2026,9,13,12]));}}
  saved.set(key,JSON.stringify({index:3,value:40}));
  const window={location:{search:"?daily=2026-10-12&pick=2",hash:"#stage",href:"https://example.test/one-move.html?daily=2026-10-12&pick=2#stage"},
    addEventListener(name,handler){historyEvents[name]=handler;},
    history:{replaceState(_state,_title,url){address=url;},pushState(_state,_title,url){address=url;pushed.push(url);}},localStorage:{getItem:key=>saved.get(key)??null,
      setItem(key,value){saved.set(key,value);},removeItem(key){saved.delete(key);}}};
  const script=fs.readFileSync(path.join(__dirname,"..","one-move.js"),"utf8");
  vm.runInNewContext(script,{module:{exports:{}},require:()=>require("../flip-levers.js"),window,document,Date:TestDate,
    navigator:{clipboard:{writeText:async()=>{}}},URL,URLSearchParams},{timeout:2000});
  assert.match(element("mission").textContent,/Make the mean strictly closer/);
  assert.equal(element("selected-reading").textContent,"2");
  assert.equal(element("proposed").value,"67");
  assert.equal(address,"one-move.html?daily=2026-10-12#stage");
  assert.deepEqual(JSON.parse(saved.get(key)),{index:1,value:67});
  readings[1].handlers.click();
  element("proposed").value="64.7499";
  element("proposed").handlers.input({target:element("proposed")});
  assert.deepEqual(JSON.parse(saved.get(key)),{index:1,value:64.7499});
  window.location.search="?daily=2026-10-12";
  window.location.href="https://example.test/one-move.html?daily=2026-10-12#stage";
  vm.runInNewContext(script,{module:{exports:{}},require:()=>require("../flip-levers.js"),window,document,Date:TestDate,
    navigator:{clipboard:{writeText:async()=>{}}},URL,URLSearchParams},{timeout:2000});
  assert.equal(element("selected-reading").textContent,"2");
  assert.equal(element("proposed").value,"64.7499");
  element("submit").handlers.click();
  assert.equal(element("result").hidden,false);
  assert.equal(element("result-title").textContent,"You flipped it.");
  assert.match(element("move-comparison").textContent,/Exact minimum/);
  assert.equal(element("play-again").textContent,"Try another route");
  assert.equal(saved.has(key),false);
  assert.equal(element("next").textContent,"Next daily · Oct 13 ↗");
  saved.set("inward-math-draft-v1-2026-10-13",JSON.stringify({index:4,value:15}));
  element("next").handlers.click();
  assert.equal(element("round-name").textContent,"Daily edition / 2026-10-13");
  assert.equal(element("selected-reading").textContent,"5");
  assert.equal(element("proposed").value,"15");
  assert.equal(address,"one-move.html?daily=2026-10-13#stage");
  assert.deepEqual(pushed,["one-move.html?daily=2026-10-13#stage"]);
  assert.equal(element("stage-title").focused,true);
  element("stage-title").focused=false;
  window.location.search="?daily=2026-10-12";
  historyEvents.popstate();
  assert.equal(element("round-name").textContent,"Daily edition / 2026-10-12");
  assert.equal(element("selected-reading").textContent,"3");
  assert.equal(element("stage-title").focused,true);
  assert.equal(address,"one-move.html?daily=2026-10-13#stage","Back must not replace its history entry");
  window.location.search="?daily=2026-10-13";
  historyEvents.popstate();
  assert.equal(element("round-name").textContent,"Daily edition / 2026-10-13");
  assert.equal(element("selected-reading").textContent,"5");
  assert.equal(element("proposed").value,"15");
  assert.deepEqual(pushed,["one-move.html?daily=2026-10-13#stage"],"Forward must not push another entry");
  assert.match(fs.readFileSync(path.join(__dirname,"..","one-move.html"),"utf8"),/id="stage-title" tabindex="-1"/);
});

test("flip point finds true reversals, touching ties, and a nearest movement", () => {
  const {PRESETS,parseView,evaluate,solve,nearestReversal}=require("../flip-point.js");
  const a=solve(PRESETS.a.fixed,PRESETS.a.target);
  assert.deepEqual(a.boundaries.map(item=>[Math.round(item.value*10)/10,item.reversal]),[[47,true],[49.5,true],[52,false]]);
  assert.equal(evaluate(PRESETS.a.fixed,50,51).winner,"Median");
  assert.equal(evaluate(PRESETS.a.fixed,50,52).winner,"Equal");
  assert.equal(evaluate(PRESETS.a.fixed,50,53).winner,"Median");
  assert.equal(nearestReversal(a,85).value,49.5);
  const b=solve(PRESETS.b.fixed,PRESETS.b.target);
  assert.deepEqual(b.boundaries.map(item=>Math.round(item.value)),[18,48,58,78]);
  assert.equal(Math.round(nearestReversal(b,68).value),58);
  assert.equal(evaluate(PRESETS.b.fixed,52,58).winner,"Equal");
  assert.equal(evaluate(PRESETS.b.fixed,52,58.1).winner,"Mean");
  const c=solve(PRESETS.c.fixed,PRESETS.c.target);
  assert.equal(c.boundaries.at(-1).value,100);
  assert.equal(c.boundaries.at(-1).reversal,false);
  const shared=parseView("?fixed=48%2C49%2C50%2C51&fifth=49.5&target=50");
  assert.equal(evaluate(shared.fixed,shared.target,shared.fifth).winner,"Equal");
  assert.equal(parseView("?fixed=48%2C49%2C50%2C51&fifth=101&target=50"),false);
  assert.equal(parseView("?fixed=48%2C49%2C50%2C51&fifth=85&target=50&target=51"),false);
  const page=fs.readFileSync(path.join(__dirname,"..","flip-point.html"),"utf8");
  assert.match(page,/src="flip-point\.js\?v=/);
  assert.match(fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8"),/href="flip-point\.html"/);
  assert.match(fs.readFileSync(path.join(__dirname,"..","guide.html"),"utf8"),/href="flip-point\.html\?fixed=/);
});

test("target lens finds the exact crossover and handles a permanent tie", () => {
  const {PRESETS,parseView,evaluate}=require("../target-lens.js");
  const a=PRESETS.a;
  assert.equal(evaluate(a.values,50).winner,"Median");
  assert.equal(evaluate(a.values,60).winner,"Mean");
  assert.equal(evaluate(a.values,53.3).winner,"Equal");
  assert.equal(evaluate(a.values,50).boundary,53.3);
  const b=PRESETS.b;
  assert.equal(evaluate(b.values,50).winner,"Median");
  assert.equal(evaluate(b.values,51).winner,"Equal");
  assert.equal(evaluate(b.values,52).winner,"Mean");
  const c=PRESETS.c;
  for(const target of [0,13.75,50,100]) {
    const result=evaluate(c.values,target);
    assert.equal(result.winner,"Equal");
    assert.equal(result.meanError,result.medianError);
  }
  const shared=parseView("?values=48%2C49%2C50%2C51%2C85&target=53.3");
  assert.deepEqual(shared.values,a.values);
  assert.equal(evaluate(shared.values,shared.target).winner,"Equal");
  assert.deepEqual([shared.low,shared.high],[51.3,55.3]);
  assert.equal(shared.epsilon,1);
  assert.deepEqual([parseView("?values=0%2C0%2C0%2C0%2C0.0001&target=0&lo=0&hi=0.00001").low,
    parseView("?values=0%2C0%2C0%2C0%2C0.0001&target=0&lo=0&hi=0.00001").high],[0,0.00001]);
  assert.equal(parseView("?values=1%2C2%2C3%2C4%2C5&target=3&lo=2&hi=4&eps=0.000001").epsilon,0.000001);
  assert.equal(parseView("?values=48%2C49%2C50%2C51%2C85&target=101"),false);
  assert.equal(parseView("?values=1%2C2%2C3%2C4%2C5&target=50&target=51"),false);
  assert.equal(parseView("?values=1%2C2%2C3%2C4%2C5.12345&target=50"),false);
  for(const suffix of ["&lo=52","&hi=52","&lo=53&hi=52","&lo=0&hi=0.0000001","&lo=0&lo=1&hi=2","&lo=-1&hi=2",
    "&eps=-1","&eps=100.000001","&eps=0.0000001","&eps=1&eps=2"]) {
    assert.equal(parseView("?values=1%2C2%2C3%2C4%2C5&target=3"+suffix),false);
  }
  assert.match(fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8"),/href="target-lens\.html"/);
  assert.match(fs.readFileSync(path.join(__dirname,"..","guide.html"),"utf8"),/href="target-lens\.html\?values=/);
  assert.match(fs.readFileSync(path.join(__dirname,"..","worksheet.html"),"utf8"),/href="target-lens\.html\?values=/);
});

test("target witnesses construct both strict winners and a tie with exact integer arithmetic", () => {
  const {PRESETS,evaluate,targetWitnesses}=require("../target-lens.js");
  for(const key of ["a","b"]) {
    const {values}=PRESETS[key],witness=targetWitnesses(values);
    assert.equal(witness.sameEstimate,false);
    assert.deepEqual(witness.targets.map(item=>item.winner),["Median","Equal","Mean"]);
    assert.ok(witness.targets[0].target<witness.targets[1].target&&witness.targets[1].target<witness.targets[2].target);
    for(const item of witness.targets) {
      assert.deepEqual([item.meanError,item.medianError],
        [evaluate(values,item.target).meanError,evaluate(values,item.target).medianError]);
      if(item.winner==="Mean") assert.equal(item.meanError,0);
      if(item.winner==="Median") assert.equal(item.medianError,0);
      if(item.winner==="Equal") assert.equal(item.meanError,item.medianError);
    }
  }
  const tied=targetWitnesses(PRESETS.c.values);
  assert.equal(tied.sameEstimate,true);
  assert.deepEqual(tied.targets,[]);
  for(const target of [0,31.000001,100]) assert.equal(evaluate(PRESETS.c.values,target).winner,"Equal");
  const meanBelowMedian=targetWitnesses([0,50,51,52,53]);
  assert.deepEqual(meanBelowMedian.targets.map(item=>item.winner),["Mean","Equal","Median"]);
  const narrow=[0,0,0,0,0.0001];
  assert.deepEqual(targetWitnesses(narrow).targets.map(item=>item.target),[0,0.00001,0.00002]);
  assert.equal(evaluate(narrow,0.000009).winner,"Median");
  assert.equal(evaluate(narrow,0.00001).winner,"Equal");
  assert.equal(evaluate(narrow,0.000011).winner,"Mean");
});

test("the target-lens factorization matches exact squared errors across fractional cases", () => {
  const {evaluate,targetWitnesses}=require("../target-lens.js");
  let seed=939391;
  const roll=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let trial=0;trial<1000;trial++) {
    const values=Array.from({length:5},()=>Math.floor(roll()*1000001)/10000);
    const target=Math.floor(roll()*100000001)/1000000;
    const result=evaluate(values,target),readings=values.map(value=>Math.round(value*10000));
    const meanUnits=readings.reduce((sum,value)=>sum+value,0)*20;
    const medianUnits=[...readings].sort((a,b)=>a-b)[2]*100,targetUnits=Math.round(target*1000000);
    const left=BigInt(meanUnits-targetUnits)**2n-BigInt(medianUnits-targetUnits)**2n;
    const right=BigInt(meanUnits-medianUnits)*BigInt(meanUnits+medianUnits-2*targetUnits);
    assert.equal(left,right);
    assert.equal(result.winner,left===0n?"Equal":left<0n?"Mean":"Median");
    const witnesses=targetWitnesses(values);
    if(witnesses.sameEstimate) assert.equal(meanUnits,medianUnits);
    else assert.deepEqual(new Set(witnesses.targets.map(item=>item.winner)),new Set(["Mean","Median","Equal"]));
  }
  const html=fs.readFileSync(path.join(__dirname,"..","target-lens.html"),"utf8");
  assert.match(html,/id="witness-grid" role="group"/);
  assert.match(html,/\.witness-grid\[hidden\],\.witness-all-tie\[hidden\] \{ display:none; \}/);
  assert.match(html,/id="interval-ruler" role="img"/);
  assert.match(html,/id="drift-input" type="number"/);
  assert.match(html,/id="drift-witness" hidden/);
  assert.match(html,/id="edge-first-button" type="button"/);
  assert.match(html,/id="edge-exact-fraction">13\/10/);
  assert.match(html,/id="edge-changes" aria-label="Five exact reading changes"/);
  assert.match(html,/id="edge-estimate-threshold">16\/3/);
  assert.match(html,/id="edge-reference-threshold">13\/10/);
  assert.match(html,/id="edge-estimate-detail"/);
  assert.match(html,/id="edge-reference-detail"/);
  assert.match(html,/id="sparse-changes" aria-label="Five readings in a minimum-support tie"/);
  assert.match(html,/id="tie-track" role="img"/);
});

test("whole-range certificates distinguish strict, touching, crossing, singleton, and permanent ties", () => {
  const {PRESETS,certifyInterval}=require("../target-lens.js");
  const a=PRESETS.a.values;
  assert.deepEqual([certifyInterval(a,48,52).kind,certifyInterval(a,48,52).winner,certifyInterval(a,48,52).margin],
    ["robust","Median",1.3]);
  assert.deepEqual([certifyInterval(a,52,53.3).kind,certifyInterval(a,52,53.3).winner],["touches","Median"]);
  assert.deepEqual([certifyInterval(a,53.3,56.6).kind,certifyInterval(a,53.3,56.6).winner],["touches","Mean"]);
  assert.deepEqual([certifyInterval(a,50,56.6).kind,certifyInterval(a,50,56.6).lower,
    certifyInterval(a,50,56.6).upper],["crosses","Median","Mean"]);
  assert.equal(certifyInterval(a,53.3,53.3).kind,"tie-only");
  assert.deepEqual([certifyInterval(a,54,60).kind,certifyInterval(a,54,60).margin],["robust",0.7]);
  assert.equal(certifyInterval(PRESETS.c.values,0,100).kind,"all-tie");
  assert.deepEqual([certifyInterval([0,50,51,52,53],40,51).kind,
    certifyInterval([0,50,51,52,53],40,51).lower,certifyInterval([0,50,51,52,53],40,51).upper],
    ["crosses","Mean","Median"]);
  const narrow=[0,0,0,0,0.0001];
  assert.deepEqual([certifyInterval(narrow,0,0.000009).kind,certifyInterval(narrow,0,0.000009).margin],
    ["robust",0.000001]);
  assert.equal(certifyInterval(narrow,0.000009,0.00001).kind,"touches");
  assert.equal(certifyInterval(narrow,0.000009,0.000011).kind,"crosses");
  assert.equal(certifyInterval(narrow,0.00001,0.00001).kind,"tie-only");
  for(const [low,high] of [[52,48],[-1,20],[20,101],[NaN,30]])
    assert.throws(()=>certifyInterval(a,low,high),RangeError);
});

test("range certificates agree with independent squared-error signs on sampled intervals", () => {
  const {certifyInterval}=require("../target-lens.js");
  let seed=714091;
  const roll=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let trial=0;trial<500;trial++) {
    const values=Array.from({length:5},()=>Math.floor(roll()*1000001)/10000);
    const ends=Array.from({length:2},()=>Math.floor(roll()*100000001));
    const lowUnits=Math.min(...ends),highUnits=Math.max(...ends);
    const certificate=certifyInterval(values,lowUnits/1000000,highUnits/1000000);
    const readings=values.map(value=>Math.round(value*10000));
    const meanUnits=readings.reduce((sum,value)=>sum+value,0)*20;
    const medianUnits=[...readings].sort((a,b)=>a-b)[2]*100;
    const boundaryUnits=(meanUnits+medianUnits)/2;
    const outcome=targetUnits=>{
      const difference=BigInt(meanUnits-targetUnits)**2n-BigInt(medianUnits-targetUnits)**2n;
      return difference===0n?"Equal":difference<0n?"Mean":"Median";
    };
    assert.equal(certificate.lower,outcome(lowUnits));
    assert.equal(certificate.upper,outcome(highUnits));
    for(const position of [lowUnits,Math.floor((lowUnits+highUnits)/2),highUnits]) {
      const label=outcome(position);
      if(certificate.kind==="robust") assert.equal(label,certificate.winner);
      if(certificate.kind==="all-tie") assert.equal(label,"Equal");
    }
    if(certificate.kind==="crosses") {
      assert.ok(lowUnits<boundaryUnits&&boundaryUnits<highUnits);
      assert.notEqual(certificate.lower,certificate.upper);
      assert.equal(outcome(boundaryUnits),"Equal");
    }
    if(certificate.kind==="touches") assert.ok(lowUnits===boundaryUnits||highUnits===boundaryUnits);
  }
});

test("reading-drift bound proves a strict verdict across simultaneous reading and target uncertainty", () => {
  const {PRESETS,certifyReadingDrift}=require("../target-lens.js");
  const a=PRESETS.a.values;
  assert.deepEqual([certifyReadingDrift(a,48,52,1).kind,certifyReadingDrift(a,48,52,1).winner,
    certifyReadingDrift(a,48,52,1).gap,certifyReadingDrift(a,48,52,1).remaining],
    ["certified","Median",2.6,0.6]);
  assert.equal(certifyReadingDrift(a,48,52,1.299999).kind,"certified");
  assert.equal(certifyReadingDrift(a,48,52,1.3).kind,"inconclusive");
  assert.equal(certifyReadingDrift(a,48,52,2).kind,"inconclusive");
  assert.equal(certifyReadingDrift(a,50,56.6,0).kind,"no-baseline");
  assert.equal(certifyReadingDrift(a,52,53.3,0).kind,"no-baseline");
  assert.equal(certifyReadingDrift(PRESETS.c.values,0,100,0).kind,"no-baseline");
  assert.deepEqual([certifyReadingDrift([0,0,0,0,0.0001],0,0.000009,0).gap,
    certifyReadingDrift([0,0,0,0,0.0001],0,0.000009,0.000001).kind],
    [0.000002,"inconclusive"]);
  for(const epsilon of [-1,101,NaN]) assert.throws(()=>certifyReadingDrift(a,48,52,epsilon),RangeError);

  let seed=81027;
  const roll=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let trial=0;trial<300;trial++) {
    const values=Array.from({length:5},()=>Math.floor(roll()*1000001)/10000);
    const a=Math.floor(roll()*100000001),b=Math.floor(roll()*100000001);
    const low=Math.min(a,b)/1000000,high=Math.max(a,b)/1000000;
    const epsilon=Math.floor(roll()*10000001)/1000000;
    const result=certifyReadingDrift(values,low,high,epsilon);
    if(result.kind!=="certified") continue;
    const readings=values.map(value=>Math.round(value*10000));
    const originalMean=readings.reduce((sum,value)=>sum+value,0)*20;
    const originalMedian=[...readings].sort((x,y)=>x-y)[2]*100;
    const endGap=t=>Math.abs(Math.abs(originalMean-t)-Math.abs(originalMedian-t));
    const lowUnits=Math.round(low*1000000),highUnits=Math.round(high*1000000);
    const gap=Math.min(endGap(lowUnits),endGap(highUnits));
    assert.ok(gap>2*Math.round(epsilon*1000000));
    for(let sample=0;sample<12;sample++) {
      const perturbed=values.map(value=>Math.min(100,Math.max(0,value+(roll()*2-1)*epsilon)));
      const ordered=[...perturbed].sort((x,y)=>x-y);
      const mean=perturbed.reduce((sum,value)=>sum+value,0)/5,median=ordered[2];
      const target=low+(high-low)*roll();
      const winner=Math.abs(mean-target)<Math.abs(median-target)?"Mean":"Median";
      assert.equal(winner,result.winner);
    }
  }
});

test("exact joint certificate matches exhaustive five-reading boxes and finds ties beyond the shortcut", () => {
  const {certifyJointUncertainty,certifyReadingDrift,PRESETS}=require("../target-lens.js");
  const values=PRESETS.a.values;
  const beyond=certifyJointUncertainty(values,0,1,4);
  assert.equal(certifyReadingDrift(values,0,1,4).kind,"inconclusive");
  assert.deepEqual([beyond.kind,beyond.winner,beyond.estimateRangeUnits.map(n=>n/5000000),
    beyond.referenceRangeUnits.map(n=>n/5000000)],
    ["strict","Median",[1.6,10.4],[96.6,114.6]]);
  const tie=certifyJointUncertainty(values,48,52,1.3);
  assert.deepEqual([tie.kind,tie.tieFactor,tie.witness.readings.map(n=>n/1000000),tie.witness.targetUnits/1000000],
    ["tie-possible","reference",[46.7,47.7,48.7,49.7,83.7],52]);
  assert.deepEqual([tie.tieTargets.kind,tie.tieTargets.lowerNumerator/tie.tieTargets.denominator,
    tie.tieTargets.upperNumerator/tie.tieTargets.denominator],["band",52,54.6]);
  const allTargets=certifyJointUncertainty(values,0,1,5.333334);
  assert.equal(allTargets.tieTargets.kind,"all");
  assert.equal(certifyJointUncertainty(values,0,1,4).tieTargets.kind,"band");
  assert.deepEqual(certifyJointUncertainty(values,48,52,0).tieTargets,
    {kind:"band",lowerNumerator:533000000,upperNumerator:533000000,denominator:10000000});
  assert.deepEqual(certifyJointUncertainty([0,0,0,0,0.000001],0,0.000001,0).tieTargets,
    {kind:"band",lowerNumerator:1,upperNumerator:1,denominator:10000000});
  assert.equal(certifyJointUncertainty(PRESETS.c.values,0,100,0).tieTargets.kind,"all");
  assert.equal(certifyJointUncertainty(PRESETS.c.values,0,100,0).kind,"all-tie");
  assert.equal(certifyJointUncertainty(values,0,100,0).kind,"tie-possible");
  assert.deepEqual(certifyJointUncertainty([0,0,0,0,0.0001],0,0.000001,0.000001).estimateRangeUnits,[96,102]);
  for(const epsilon of [-1,101,NaN]) assert.throws(()=>certifyJointUncertainty(values,0,1,epsilon),RangeError);

  let seed=59411;
  const roll=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let trial=0;trial<120;trial++) {
    const base=Array.from({length:5},()=>Math.floor(roll()*7));
    const epsilon=Math.floor(roll()*3);
    const a=Math.floor(roll()*11),b=Math.floor(roll()*11),low=Math.min(a,b),high=Math.max(a,b);
    const exact=certifyJointUncertainty(base,low,high,epsilon);
    const lo=base.map(value=>Math.max(0,value-epsilon));
    const hi=base.map(value=>value+epsilon);
    let minD=Infinity,maxD=-Infinity,minB=Infinity,maxB=-Infinity,minMidpoint=Infinity,maxMidpoint=-Infinity;
    const visit=(index,readings)=>{
      if(index<5) {
        for(let value=lo[index];value<=hi[index];value++) visit(index+1,[...readings,value]);
        return;
      }
      const total=readings.reduce((sum,value)=>sum+value,0);
      const middle=[...readings].sort((x,y)=>x-y)[2];
      const D=total-5*middle;
      minD=Math.min(minD,D);maxD=Math.max(maxD,D);
      const midpointNumerator=total+5*middle;
      minMidpoint=Math.min(minMidpoint,midpointNumerator);
      maxMidpoint=Math.max(maxMidpoint,midpointNumerator);
      for(const target of [low,high]) {
        const B=total+5*middle-10*target;
        minB=Math.min(minB,B);maxB=Math.max(maxB,B);
        if(exact.kind==="strict") assert.equal(D*B<0?"Mean":"Median",exact.winner);
      }
    };
    visit(0,[]);
    assert.deepEqual(exact.estimateRangeUnits.map(n=>n/1000000),[minD,maxD]);
    assert.deepEqual(exact.referenceRangeUnits.map(n=>n/1000000),[minB,maxB]);
    assert.deepEqual([exact.tieTargets.lowerNumerator/1000000,exact.tieTargets.upperNumerator/1000000],
      [minMidpoint,maxMidpoint]);
    assert.equal(exact.tieTargets.kind,(minD<=0&&maxD>=0)?"all":"band");
    for(const target of [0,low,high,10]) {
      const within=exact.tieTargets.kind==="all"||
        target*exact.tieTargets.denominator>=exact.tieTargets.lowerNumerator&&
        target*exact.tieTargets.denominator<=exact.tieTargets.upperNumerator;
      assert.equal(certifyJointUncertainty(base,target,target,epsilon).kind!=="strict",within);
    }
    assert.equal(exact.kind==="strict",(minD>0||maxD<0)&&(minB>0||maxB<0));
    if(exact.witness?.path) {
      const {from,to,targetFromUnits,targetToUnits,numerator,denominator}=exact.witness.path;
      const n=BigInt(numerator),d=BigInt(denominator);
      assert.ok(n>=0n&&n<=d&&d>0n);
      const readings=from.map((value,index)=>BigInt(value)*d+BigInt(to[index]-value)*n);
      const target=BigInt(targetFromUnits)*d+BigInt(targetToUnits-targetFromUnits)*n;
      for(let index=0;index<5;index++) {
        assert.ok(readings[index]>=BigInt(exact.lowerReadings[index])*d);
        assert.ok(readings[index]<=BigInt(exact.upperReadings[index])*d);
      }
      assert.ok(target>=BigInt(exact.lowUnits)*d&&target<=BigInt(exact.highUnits)*d);
      const total=readings.reduce((sum,value)=>sum+value,0n);
      const middle=[...readings].sort((a,b)=>a<b?-1:a>b?1:0)[2];
      assert.equal((total-5n*middle)*(total+5n*middle-10n*target),0n);
    } else if(exact.witness) {
      const readings=exact.witness.readings.map(n=>n/1000000),target=exact.witness.targetUnits/1000000;
      const mean=readings.reduce((sum,value)=>sum+value,0)/5;
      const median=[...readings].sort((x,y)=>x-y)[2];
      assert.ok(Math.abs(Math.abs(mean-target)-Math.abs(median-target))<1e-9);
    }
  }
});

test("stability edge brackets the first attainable tie on adjacent six-decimal drifts", () => {
  const {stabilityEdge,certifyJointUncertainty,PRESETS}=require("../target-lens.js");
  const values=PRESETS.a.values;
  const near=stabilityEdge(values,48,52);
  assert.deepEqual(near,{kind:"edge",winner:"Median",lastStrictUnits:1299999,firstTieUnits:1300000});
  assert.equal(certifyJointUncertainty(values,48,52,near.lastStrictUnits/1e6).kind,"strict");
  const first=certifyJointUncertainty(values,48,52,near.firstTieUnits/1e6);
  assert.equal(first.kind,"tie-possible");
  assert.deepEqual(first.witness.readings.map(n=>n/1e6),[46.7,47.7,48.7,49.7,83.7]);
  assert.deepEqual(stabilityEdge(values,0,1),
    {kind:"edge",winner:"Median",lastStrictUnits:5333333,firstTieUnits:5333334});
  const interior=certifyJointUncertainty(values,0,1,5.333334);
  assert.deepEqual([interior.tieFactor,interior.witness.path.numerator,interior.witness.path.denominator],
    ["estimate","1","14333335"]);
  assert.equal(certifyJointUncertainty(values,0,100,0).witness.path!==undefined,true);
  assert.deepEqual(stabilityEdge(values,0,100),
    {kind:"no-baseline",winner:null,lastStrictUnits:null,firstTieUnits:0});
  assert.equal(stabilityEdge(PRESETS.c.values,48,52).kind,"no-baseline");
  assert.throws(()=>stabilityEdge(values,10,0),RangeError);

  let seed=18477;
  const roll=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let trial=0;trial<36;trial++) {
    const readings=Array.from({length:5},()=>Math.round(roll()*100));
    const t=Math.round(roll()*100);
    const edge=stabilityEdge(readings,t,t);
    if(edge.kind==="no-baseline") {
      assert.notEqual(certifyJointUncertainty(readings,t,t,0).kind,"strict");
      continue;
    }
    assert.equal(edge.firstTieUnits-edge.lastStrictUnits,1);
    assert.equal(certifyJointUncertainty(readings,t,t,edge.lastStrictUnits/1e6).winner,edge.winner);
    assert.notEqual(certifyJointUncertainty(readings,t,t,edge.firstTieUnits/1e6).kind,"strict");
    assert.notEqual(certifyJointUncertainty(readings,t,t,100).kind,"strict");
  }
});

test("continuous threshold has an exact rational tie witness and matches the input grid", () => {
  const {continuousStabilityThreshold,stabilityEdge,certifyJointUncertainty,PRESETS}=require("../target-lens.js");
  const a=PRESETS.a.values;
  const near=continuousStabilityThreshold(a,48,52);
  assert.deepEqual([near.numerator,near.denominator,near.factor,near.firstTieUnits],
    ["13","10","reference",1300000]);
  assert.deepEqual(near.routes,{estimate:{numerator:"16",denominator:"3"},
    reference:{numerator:"13",denominator:"10"}});
  const far=continuousStabilityThreshold(a,0,1);
  assert.deepEqual([far.numerator,far.denominator,far.factor,far.firstTieUnits],
    ["16","3","estimate",5333334]);
  assert.deepEqual(far.routes,{estimate:near.routes.estimate,
    reference:{numerator:"75",denominator:"1"}});
  const simultaneous=continuousStabilityThreshold([0,0,0,0,100],7.5,7.5);
  assert.deepEqual(simultaneous.routes,{estimate:{numerator:"25",denominator:"1"},
    reference:{numerator:"25",denominator:"1"}});
  assert.equal(simultaneous.factor,"reference");
  assert.notDeepEqual(simultaneous.routeWitnesses.estimate,simultaneous.routeWitnesses.reference);
  assert.deepEqual([continuousStabilityThreshold([0,0,0,0,100],0,0).numerator,
    continuousStabilityThreshold([0,0,0,0,0.0001],0,0).denominator],["25","40000"]);
  assert.deepEqual(continuousStabilityThreshold(a,0,100),{kind:"no-baseline"});
  assert.throws(()=>continuousStabilityThreshold(a,10,0),RangeError);

  let seed=42217,certified=0;
  const roll=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let trial=0;trial<250;trial++) {
    const readings=Array.from({length:5},()=>Math.floor(roll()*1000001)/10000);
    const x=Math.floor(roll()*100000001)/1e6,y=Math.floor(roll()*100000001)/1e6;
    const low=Math.min(x,y),high=Math.max(x,y);
    const exact=continuousStabilityThreshold(readings,low,high);
    const grid=stabilityEdge(readings,low,high);
    assert.equal(exact.kind,grid.kind);
    if(exact.kind!=="edge") continue;
    certified++;
    assert.equal(exact.firstTieUnits,grid.firstTieUnits);
    const n=BigInt(exact.numerator),d=BigInt(exact.denominator);
    assert.ok(n>0n&&d>0n);
    assert.ok(BigInt(grid.lastStrictUnits)*d<n*1000000n);
    assert.ok(n*1000000n<=BigInt(grid.firstTieUnits)*d);
    for(const factor of ["estimate","reference"]) {
      const route=exact.routes[factor],routeN=BigInt(route.numerator),routeD=BigInt(route.denominator);
      assert.ok(routeN>0n&&routeD>0n);
      assert.ok(routeN*d>=n*routeD);
      const firstUnits=Number((routeN*1000000n+routeD-1n)/routeD);
      const before=certifyJointUncertainty(readings,low,high,(firstUnits-1)/1e6);
      const at=certifyJointUncertainty(readings,low,high,firstUnits/1e6);
      const rangeName=factor==="estimate"?"estimateRangeUnits":"referenceRangeUnits";
      assert.ok(before[rangeName][0]*before[rangeName][1]>0);
      assert.ok(at[rangeName][0]<=0&&at[rangeName][1]>=0);
      const routeWitness=exact.routeWitnesses[factor],wDen=BigInt(routeWitness.denominator);
      const values=routeWitness.readingsNumerators.map(BigInt),target=BigInt(routeWitness.targetNumerator);
      for(let index=0;index<5;index++) {
        assert.ok(values[index]>=0n&&values[index]<=100n*wDen);
        const original=BigInt(Math.round(readings[index]*1e6))*wDen/1000000n;
        const distance=values[index]>original?values[index]-original:original-values[index];
        assert.ok(distance*routeD<=routeN*wDen);
      }
      assert.ok(target>=BigInt(Math.round(low*1e6))*wDen/1000000n);
      assert.ok(target<=BigInt(Math.round(high*1e6))*wDen/1000000n);
      const sum=values.reduce((total,value)=>total+value,0n);
      const middle=[...values].sort((p,q)=>p<q?-1:p>q?1:0)[2];
      assert.equal(factor==="estimate"?sum-5n*middle:sum+5n*middle-10n*target,0n);
      const meanError=sum-5n*target,medianError=middle-target;
      assert.equal(meanError<0n?-meanError:meanError,5n*(medianError<0n?-medianError:medianError));
    }
    assert.deepEqual(exact.witness,exact.routeWitnesses[exact.factor]);
    const witness=exact.witness,wDen=BigInt(witness.denominator);
    const values=witness.readingsNumerators.map(BigInt),target=BigInt(witness.targetNumerator);
    for(let index=0;index<5;index++) {
      assert.ok(values[index]>=0n&&values[index]<=100n*wDen);
      const original=BigInt(Math.round(readings[index]*1000000))*wDen/1000000n;
      const distance=values[index]>original?values[index]-original:original-values[index];
      assert.ok(distance*d<=n*wDen);
    }
    assert.ok(target>=BigInt(Math.round(low*1000000))*wDen/1000000n);
    assert.ok(target<=BigInt(Math.round(high*1000000))*wDen/1000000n);
    const sum=values.reduce((total,value)=>total+value,0n);
    const median=[...values].sort((p,q)=>p<q?-1:p>q?1:0)[2];
    assert.equal(exact.factor==="estimate"?sum-5n*median:sum+5n*median-10n*target,0n);
  }
  assert.ok(certified>100);
});

test("interior tie paths produce exact rational witnesses within fractional reading boxes", () => {
  const {certifyJointUncertainty}=require("../target-lens.js");
  let seed=11235813,count=0;
  const roll=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let trial=0;trial<200;trial++) {
    const values=Array.from({length:5},()=>Math.floor(roll()*1000001)/10000);
    const a=Math.floor(roll()*100000001)/1e6,b=Math.floor(roll()*100000001)/1e6;
    const low=Math.min(a,b),high=Math.max(a,b),epsilon=Math.floor(roll()*10000001)/1e6;
    const exact=certifyJointUncertainty(values,low,high,epsilon);
    if(!exact.witness?.path) continue;
    count++;
    const {from,to,targetFromUnits,targetToUnits,numerator,denominator}=exact.witness.path;
    const n=BigInt(numerator),d=BigInt(denominator);
    assert.ok(n>=0n&&n<=d&&d>0n);
    const readings=from.map((value,index)=>BigInt(value)*d+BigInt(to[index]-value)*n);
    for(let index=0;index<5;index++) {
      assert.ok(readings[index]>=BigInt(exact.lowerReadings[index])*d);
      assert.ok(readings[index]<=BigInt(exact.upperReadings[index])*d);
    }
    const target=BigInt(targetFromUnits)*d+BigInt(targetToUnits-targetFromUnits)*n;
    assert.ok(target>=BigInt(exact.lowUnits)*d&&target<=BigInt(exact.highUnits)*d);
    const sum=readings.reduce((total,value)=>total+value,0n);
    const median=[...readings].sort((x,y)=>x<y?-1:x>y?1:0)[2];
    assert.equal((sum-5n*median)*(sum+5n*median-10n*target),0n);
  }
  assert.ok(count>100);
});

test("minimum movable readings has exact subset exclusions and admissible rational witnesses", () => {
  const {PRESETS,minimumTieSupport,certifyJointUncertainty}=require("../target-lens.js");
  const values=PRESETS.a.values;
  for(const [low,high,epsilon,kind,count,mask,strictBelow] of [
    [48,52,1,"unreachable",null,null,32],
    [48,52,1.3,"tie",5,31,31],
    [48,52,4,"tie",2,5,6],
    [48,52,10,"tie",1,4,1],
    [0,1,5.333334,"tie",5,31,31],
    [0,1,10,"tie",3,7,16],
    [0,100,0,"tie",0,0,0]
  ]) {
    const result=minimumTieSupport(values,low,high,epsilon);
    assert.deepEqual([result.kind,result.count,result.mask,result.strictBelow],[kind,count,mask,strictBelow]);
    if(kind==="unreachable") continue;
    const certificate=result.certificate,witness=certificate.witness;
    if(!witness) { assert.equal(count,0); continue; }
    let readingNumerators,targetNumerator,denominator;
    if(witness.path) {
      const {from,to,targetFromUnits,targetToUnits,numerator,denominator:rawDenominator}=witness.path;
      const n=BigInt(numerator),d=BigInt(rawDenominator);
      readingNumerators=from.map((value,index)=>BigInt(value)*d+BigInt(to[index]-value)*n);
      targetNumerator=BigInt(targetFromUnits)*d+BigInt(targetToUnits-targetFromUnits)*n;
      denominator=d;
    } else {
      readingNumerators=witness.readings.map(BigInt);
      targetNumerator=BigInt(witness.targetUnits);
      denominator=1n;
    }
    for(let index=0;index<5;index++) {
      const original=BigInt(Math.round(values[index]*1e6))*denominator;
      const delta=readingNumerators[index]-original;
      assert.ok((result.mask&(1<<index))||delta===0n,"frozen reading cannot change");
      assert.ok((delta<0n?-delta:delta)<=BigInt(Math.round(epsilon*1e6))*denominator);
      assert.ok(readingNumerators[index]>=0n&&readingNumerators[index]<=100000000n*denominator);
    }
    assert.ok(targetNumerator>=BigInt(Math.round(low*1e6))*denominator);
    assert.ok(targetNumerator<=BigInt(Math.round(high*1e6))*denominator);
    const sum=readingNumerators.reduce((a,b)=>a+b,0n);
    const median=[...readingNumerators].sort((a,b)=>a<b?-1:a>b?1:0)[2];
    assert.equal((sum-5n*median)*(sum+5n*median-10n*targetNumerator),0n);
  }
  let seed=72451;
  const roll=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let trial=0;trial<45;trial++) {
    const readings=Array.from({length:5},()=>Math.floor(roll()*101));
    const low=Math.floor(roll()*91),high=low+Math.floor(roll()*(101-low));
    const epsilon=Math.floor(roll()*21);
    const result=minimumTieSupport(readings,low,high,epsilon);
    for(let mask=0;mask<32;mask++) {
      const size=mask.toString(2).replace(/0/g,"").length;
      if(result.count!==null&&size>=result.count) continue;
      assert.equal(certifyJointUncertainty(readings,low,high,epsilon,mask).kind,"strict");
    }
  }
  assert.throws(()=>minimumTieSupport(values,48,52,-1),RangeError);
  assert.throws(()=>certifyJointUncertainty(values,48,52,1,32),RangeError);
});

test("reading–drift frontier certifies the first selectable tie for every support budget", () => {
  const {PRESETS,supportFrontier,certifyJointUncertainty,minimumTieSupport,stabilityEdge}=require("../target-lens.js");
  const values=PRESETS.a.values;
  for(const [low,high,expected] of [
    [48,52,[8000000,1857143,1625000,1444445,1300000]],
    [0,1,[33000000,10666667,8000000,6400000,5333334]]
  ]) {
    const frontier=supportFrontier(values,low,high);
    assert.equal(frontier.kind,"frontier");
    assert.deepEqual(frontier.rows.map(row=>row.firstTieUnits),expected);
    assert.equal(frontier.rows[4].firstTieUnits,stabilityEdge(values,low,high).firstTieUnits);
    for(const row of frontier.rows) {
      const {count,firstTieUnits,mask}=row;
      assert.equal(mask.toString(2).replace(/0/g,"").length,count);
      assert.notEqual(certifyJointUncertainty(values,low,high,firstTieUnits/1e6,mask).kind,"strict");
      for(let candidate=1;candidate<32;candidate++) {
        if(candidate.toString(2).replace(/0/g,"").length!==count) continue;
        assert.equal(certifyJointUncertainty(values,low,high,(firstTieUnits-1)/1e6,candidate).kind,"strict");
      }
      assert.equal(minimumTieSupport(values,low,high,firstTieUnits/1e6).count,count);
    }
  }
  assert.deepEqual(supportFrontier(values,0,100),{kind:"baseline-tie",rows:[]});
  // An otherwise fixed reading cannot force the mean to meet the median in
  // the far-target example, even when it has the full 0–100 movement budget.
  const unreachable=supportFrontier([84,7,14,10,27],0,0);
  assert.equal(unreachable.rows[0].firstTieUnits,null);
  assert.equal(unreachable.rows[0].mask,null);
  let seed=71307;
  const roll=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let trial=0;trial<20;trial++) {
    const readings=Array.from({length:5},()=>Math.floor(roll()*101));
    const low=Math.floor(roll()*91),high=low+Math.floor(roll()*(101-low));
    const frontier=supportFrontier(readings,low,high);
    if(frontier.kind==="baseline-tie") continue;
    let previous=Infinity;
    for(const row of frontier.rows) {
      if(row.firstTieUnits===null) continue;
      assert.ok(row.firstTieUnits<=previous);
      previous=row.firstTieUnits;
      for(const epsilon of [0,1,3,10,30,100]) {
        const expected=row.firstTieUnits<=epsilon*1e6;
        const actual=Array.from({length:31},(_,index)=>index+1).some(mask=>
          mask.toString(2).replace(/0/g,"").length<=row.count&&
          certifyJointUncertainty(readings,low,high,epsilon,mask).kind!=="strict");
        assert.equal(actual,expected);
      }
    }
  }
});

test("continuous support frontier has exact rational boundaries and admissible witnesses", () => {
  const {PRESETS,supportFrontier,continuousSupportFrontier,continuousStabilityThreshold,
    certifyJointUncertainty}=require("../target-lens.js");
  const values=PRESETS.a.values,exact=continuousSupportFrontier(values,48,52);
  assert.deepEqual(exact.rows.map(row=>[row.numerator,row.denominator,row.mask]),
    [["8","1",4],["13","7",6],["13","8",7],["13","9",15],["13","10",31]]);
  assert.deepEqual(continuousSupportFrontier(values,0,100),{kind:"baseline-tie",rows:[]});
  assert.equal(continuousStabilityThreshold(values,48,52,0).kind,"unreachable");
  assert.equal(continuousStabilityThreshold([0,0,0,0,100],0,0,1).kind,"unreachable");
  assert.equal(continuousStabilityThreshold(values,0,1,1).routes.reference,null);

  let seed=57217,checked=0;
  const roll=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let trial=0;trial<90;trial++) {
    const readings=Array.from({length:5},()=>Math.floor(roll()*1000001)/10000);
    const x=Math.floor(roll()*100000001)/1e6,y=Math.floor(roll()*100000001)/1e6;
    const low=Math.min(x,y),high=Math.max(x,y);
    const frontier=continuousSupportFrontier(readings,low,high);
    const grid=supportFrontier(readings,low,high);
    assert.equal(frontier.kind,grid.kind);
    if(frontier.kind!=="frontier") continue;
    let preceding=null;
    for(let index=0;index<5;index++) {
      const row=frontier.rows[index],selectable=grid.rows[index];
      assert.equal(row.firstTieUnits??null,selectable.firstTieUnits);
      if(row.kind!=="edge") continue;
      checked++;
      const n=BigInt(row.numerator),d=BigInt(row.denominator);
      if(preceding) assert.ok(n*preceding.denominator<=preceding.numerator*d);
      preceding={numerator:n,denominator:d};
      assert.ok(BigInt(row.firstTieUnits-1)*d<n*1000000n);
      assert.ok(n*1000000n<=BigInt(row.firstTieUnits)*d);
      assert.equal(certifyJointUncertainty(readings,low,high,(row.firstTieUnits-1)/1e6,row.mask).kind,"strict");
      assert.notEqual(certifyJointUncertainty(readings,low,high,row.firstTieUnits/1e6,row.mask).kind,"strict");
      const witness=row.witness,den=BigInt(witness.denominator);
      const moved=witness.readingsNumerators.map(BigInt),target=BigInt(witness.targetNumerator);
      for(let readingIndex=0;readingIndex<5;readingIndex++) {
        const original=BigInt(Math.round(readings[readingIndex]*1e6))*den/1000000n;
        const delta=moved[readingIndex]-original;
        assert.ok(row.mask&(1<<readingIndex)||delta===0n);
        assert.ok((delta<0n?-delta:delta)*d<=n*den);
        assert.ok(moved[readingIndex]>=0n&&moved[readingIndex]<=100n*den);
      }
      assert.ok(target>=BigInt(Math.round(low*1e6))*den/1000000n);
      assert.ok(target<=BigInt(Math.round(high*1e6))*den/1000000n);
      const sum=moved.reduce((a,b)=>a+b,0n);
      const median=[...moved].sort((a,b)=>a<b?-1:a>b?1:0)[2];
      assert.equal((sum-5n*median)*(sum+5n*median-10n*target),0n);
    }
  }
  assert.ok(checked>100);
});

test("individual-reading thresholds are exact, independently grid checked, and leave four readings fixed", () => {
  const {singleReadingThresholds,continuousSupportFrontier,certifyJointUncertainty,PRESETS}=require("../target-lens.js");
  const featured=singleReadingThresholds(PRESETS.a.values,48,52);
  assert.deepEqual(featured.rows.map(row=>[row.exact.numerator,row.exact.denominator,row.firstTieUnits]),
    [["13","1",13000000],["13","1",13000000],["8","1",8000000],
      ["8","1",8000000],["13","1",13000000]]);
  assert.equal(singleReadingThresholds(PRESETS.a.values,0,100).kind,"baseline-tie");
  assert.equal(singleReadingThresholds([0,0,0,0,100],0,0).rows[0].firstTieUnits,null);
  let seed=39281,checked=0;
  const roll=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let trial=0;trial<32;trial++) {
    const readings=Array.from({length:5},()=>Math.floor(roll()*1000001)/10000);
    const x=Math.floor(roll()*100000001)/1e6,y=Math.floor(roll()*100000001)/1e6;
    const low=Math.min(x,y),high=Math.max(x,y);
    const result=singleReadingThresholds(readings,low,high);
    if(result.kind==="baseline-tie") continue;
    const best=continuousSupportFrontier(readings,low,high).rows[0];
    const reachable=result.rows.filter(row=>row.exact.kind==="edge");
    if(best.kind==="edge") assert.ok(reachable.some(row=>
      BigInt(row.exact.numerator)*BigInt(best.denominator)===
        BigInt(best.numerator)*BigInt(row.exact.denominator)));
    else assert.equal(reachable.length,0);
    for(const row of result.rows) {
      const units=row.firstTieUnits;
      if(units===null) {
        assert.equal(row.exact.kind,"unreachable");
        assert.equal(certifyJointUncertainty(readings,low,high,100,row.mask).kind,"strict");
        continue;
      }
      checked++;
      assert.equal(certifyJointUncertainty(readings,low,high,(units-1)/1e6,row.mask).kind,"strict");
      assert.notEqual(certifyJointUncertainty(readings,low,high,units/1e6,row.mask).kind,"strict");
      const n=BigInt(row.exact.numerator),d=BigInt(row.exact.denominator);
      assert.ok(BigInt(units-1)*d<n*1000000n&&n*1000000n<=BigInt(units)*d);
      const witness=row.exact.witness,den=BigInt(witness.denominator);
      const moved=witness.readingsNumerators.map(BigInt),target=BigInt(witness.targetNumerator);
      for(let index=0;index<5;index++) {
        const original=BigInt(Math.round(readings[index]*1e6))*den/1000000n;
        const delta=moved[index]-original;
        assert.ok(index===row.index||delta===0n);
        assert.ok((delta<0n?-delta:delta)*d<=n*den);
      }
      const sum=moved.reduce((total,value)=>total+value,0n);
      const median=[...moved].sort((a,b)=>a<b?-1:a>b?1:0)[2];
      assert.equal((sum-5n*median)*(sum+5n*median-10n*target),0n);
    }
  }
  assert.ok(checked>50);
});

test("target-by-drift envelope follows exact midpoint bounds and the all-target switch", () => {
  const {tieReachabilityEnvelope,certifyJointUncertainty,PRESETS}=require("../target-lens.js");
  const values=PRESETS.a.values;
  const near=tieReachabilityEnvelope(values,1.3);
  assert.deepEqual(near.switchExact,{numerator:"16",denominator:"3"});
  assert.equal(near.maxEpsilon,10);
  assert.deepEqual(near.knots.map(knot=>knot.epsilon),[0,16/3]);
  assert.deepEqual([near.knots[0].lower,near.knots[0].upper],[53.3,53.3]);
  assert.equal(certifyJointUncertainty(values,0,1,5.333333).tieTargets.kind,"band");
  assert.equal(certifyJointUncertainty(values,0,1,5.333334).tieTargets.kind,"all");
  const clipped=tieReachabilityEnvelope([2,5,10,11,100],4);
  assert.deepEqual(clipped.knots.map(knot=>knot.epsilon),[0,2,5,10,11,17.5]);
  assert.deepEqual(tieReachabilityEnvelope(PRESETS.c.values,40).switchExact,null);
  assert.equal(tieReachabilityEnvelope(PRESETS.c.values,40).switchEpsilon,0);
  let seed=51397;
  const roll=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let trial=0;trial<65;trial++) {
    const readings=Array.from({length:5},()=>Math.floor(roll()*1000001)/10000);
    const envelope=tieReachabilityEnvelope(readings,Math.floor(roll()*101));
    assert.ok(envelope.maxEpsilon>=envelope.switchEpsilon);
    assert.equal(envelope.knots[0].epsilon,0);
    assert.equal(envelope.knots.at(-1).epsilon,envelope.switchEpsilon);
    for(const epsilon of [0,0.25,1,3,12,35,100]) {
      const exact=certifyJointUncertainty(readings,0,0,epsilon).tieTargets;
      if(epsilon+1e-8>=envelope.switchEpsilon) {
        assert.equal(exact.kind,"all");
        continue;
      }
      assert.equal(exact.kind,"band");
      const segment=envelope.knots.findIndex(knot=>knot.epsilon>=epsilon);
      const first=envelope.knots[Math.max(0,segment-1)],last=envelope.knots[segment];
      const fraction=first===last?0:(epsilon-first.epsilon)/(last.epsilon-first.epsilon);
      const lower=first.lower+(last.lower-first.lower)*fraction;
      const upper=first.upper+(last.upper-first.upper)*fraction;
      assert.ok(Math.abs(lower-exact.lowerNumerator/exact.denominator)<1e-6);
      assert.ok(Math.abs(upper-exact.upperNumerator/exact.denominator)<1e-6);
    }
  }
  assert.throws(()=>tieReachabilityEnvelope(values,-1),RangeError);
});

test("winner map certifies both open sides and excludes attainable tie boundaries", () => {
  const {classifyReachMap,certifyJointUncertainty,PRESETS}=require("../target-lens.js");
  const classify=(values,low,high,epsilon)=>
    classifyReachMap(values,low,high,certifyJointUncertainty(values,low,high,epsilon));
  const values=PRESETS.a.values;
  assert.deepEqual(classify(values,48,52,1),
    {belowWinner:"Median",aboveWinner:"Mean",side:"below",selectedWinner:"Median"});
  assert.deepEqual(classify(values,55,56,1),
    {belowWinner:"Median",aboveWinner:"Mean",side:"above",selectedWinner:"Mean"});
  for(const [low,high] of [[52.3,52.3],[54.3,54.3],[52.3,54.3],[52,52.3],[54.3,55]]) {
    const result=classify(values,low,high,1);
    assert.equal(result.side,null,`an attainable boundary at ${low}–${high} cannot be strict`);
    assert.equal(result.selectedWinner,null);
  }
  assert.deepEqual(classify([0,50,50,50,50],0,20,0),
    {belowWinner:"Mean",aboveWinner:"Median",side:"below",selectedWinner:"Mean"});
  assert.equal(classify([0,50,50,50,50],80,100,0).selectedWinner,"Median");
  assert.equal(classify(values,0,1,5.333334).selectedWinner,null);
  assert.deepEqual(classify(PRESETS.c.values,0,1,0),
    {belowWinner:null,aboveWinner:null,side:null,selectedWinner:null});

  let seed=23861;
  const roll=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let trial=0;trial<50;trial++) {
    const readings=Array.from({length:5},()=>Math.floor(roll()*1000001)/10000);
    const epsilon=Math.floor(roll()*10000001)/1000000;
    for(const [low,high] of [[0,0],[100,100],[25,75]]) {
      const certificate=certifyJointUncertainty(readings,low,high,epsilon);
      const result=classifyReachMap(readings,low,high,certificate);
      assert.equal(!!result.selectedWinner,certificate.kind==="strict");
      if(result.selectedWinner) assert.equal(result.selectedWinner,certificate.winner);
    }
  }
});

test("tie depth atlas has exact nested targets and agrees with minimal movable support", () => {
  const {supportTieAtlas,minimumTieSupport,certifyJointUncertainty,PRESETS}=require("../target-lens.js");
  const values=PRESETS.a.values;
  const atOne=supportTieAtlas(values,1);
  assert.deepEqual(atOne.map(row=>row.lowerNumerator/row.denominator),
    [53.3,52.7,52.6,52.5,52.4,52.3]);
  assert.deepEqual(atOne.map(row=>row.upperNumerator/row.denominator),
    [53.3,53.9,54,54.1,54.2,54.3]);
  assert.deepEqual(supportTieAtlas(values,10).map(row=>row.kind),
    ["band","band","band","all","all","all"]);
  assert.equal(supportTieAtlas(values,1.3)[5].lowerNumerator,52*10000000);
  assert.deepEqual(supportTieAtlas(PRESETS.c.values,0).map(row=>row.kind),
    ["all","all","all","all","all","all"]);
  assert.throws(()=>supportTieAtlas(values,-0.1),RangeError);

  let seed=51231;
  const roll=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let trial=0;trial<32;trial++) {
    const readings=Array.from({length:5},()=>Math.floor(roll()*1000001)/10000);
    const epsilon=Math.floor(roll()*20000001)/1000000;
    const low=Math.floor(roll()*95000001)/1000000;
    const high=Math.min(100,low+Math.floor(roll()*5000001)/1000000);
    const rows=supportTieAtlas(readings,epsilon);
    const first=rows.find(row=>row.kind==="all"||
      Math.round(low*1000000)*10<=row.upperNumerator&&
      Math.round(high*1000000)*10>=row.lowerNumerator);
    const certificate=minimumTieSupport(readings,low,high,epsilon);
    assert.equal(first?.count??null,certificate.kind==="tie"?certificate.count:null);
    const full=certifyJointUncertainty(readings,low,high,epsilon).tieTargets;
    assert.equal(rows[5].kind,full.kind);
    assert.equal(rows[5].lowerNumerator,full.lowerNumerator);
    assert.equal(rows[5].upperNumerator,full.upperNumerator);
  }
});

test("exact point threshold inverts the reachability curves across targets", () => {
  const {tieReachabilityEnvelope,continuousStabilityThreshold,PRESETS}=require("../target-lens.js");
  const firstByCurve=(envelope,target)=>{
    if(envelope.switchEpsilon===0) return 0;
    const baseline=envelope.knots[0].lower;
    if(Math.abs(target-baseline)<1e-10) return 0;
    const side=target<baseline?"lower":"upper";
    for(let index=1;index<envelope.knots.length;index++) {
      const previous=envelope.knots[index-1],next=envelope.knots[index];
      if(side==="lower"?next.lower<=target:next.upper>=target)
        return previous.epsilon+(target-previous[side])*
          (next.epsilon-previous.epsilon)/(next[side]-previous[side]);
    }
    return envelope.switchEpsilon;
  };
  for(const [values,targets] of [[PRESETS.a.values,[0,1,48,50,52,53.3,54,100]],
    [PRESETS.c.values,[0,25,50,75,100]],[[2,5,10,11,100],[0,25,50,75,100]]]) {
    const envelope=tieReachabilityEnvelope(values,1);
    for(const target of targets) {
      const result=continuousStabilityThreshold(values,target,target);
      const exact=result.kind==="edge"?Number(result.numerator)/Number(result.denominator):0;
      assert.ok(Math.abs(firstByCurve(envelope,target)-exact)<1e-7,
        `point ${target} for ${values} should meet its curve`);
    }
  }
  let seed=97213;
  const roll=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let trial=0;trial<25;trial++) {
    const values=Array.from({length:5},()=>Math.floor(roll()*1000001)/10000);
    const envelope=tieReachabilityEnvelope(values,1);
    for(const target of [0,25,50,75,100]) {
      const result=continuousStabilityThreshold(values,target,target);
      const exact=result.kind==="edge"?Number(result.numerator)/Number(result.denominator):0;
      assert.ok(Math.abs(firstByCurve(envelope,target)-exact)<1e-7,
        `point ${target} for ${values} should meet its curve`);
    }
  }
});

test("target witnesses and interval controls update the verdict, certificate, and exact link", async () => {
  const elements=new Map(),address=[];
  let copied="",scrolled="";
  function element(id) {
    if(!elements.has(id)) elements.set(id,{value:"",textContent:"",hidden:false,disabled:false,dataset:{},attributes:{},handlers:{},
      style:{setProperty(){}},children:id==="readings"||id==="edge-changes"||id==="sparse-changes"?Array.from({length:5},()=>({textContent:"",dataset:{}})):[],parts:{},
      addEventListener(name,callback){this.handlers[name]=callback;},setAttribute(name,value){this.attributes[name]=value;},
      scrollIntoView(){scrolled=id;},
      querySelector(selector){return this.parts[selector]??=({textContent:""});}});
    return elements.get(id);
  }
  const witnesses=Array.from({length:3},(_,index)=>element("witness-"+index));
  const presets=["a","b","c"].map(key=>({...element("preset-"+key),dataset:{case:key}}));
  const document={getElementById:element,querySelectorAll(selector){return selector===".witness"?witnesses:selector===".preset"?presets:[];}};
  const window={location:{search:"",href:"https://example.test/target-lens.html"},history:{replaceState(_state,_title,url){address.push(url);}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,"..","target-lens.js"),"utf8"),
    {document,window,URL,URLSearchParams,navigator:{clipboard:{async writeText(value){copied=value;}}}},{timeout:1500});
  assert.equal(element("witness-grid").hidden,false);
  assert.equal(element("witness-0").parts.strong.textContent,"50");
  assert.equal(element("witness-1").parts.strong.textContent,"53.3");
  assert.equal(element("witness-2").parts.strong.textContent,"56.6");
  assert.equal(element("interval-badge").textContent,"Median throughout");
  assert.match(element("interval-proof-text").textContent,/nearest endpoint is 1\.3 from a tie/);
  assert.equal(element("drift-badge").textContent,"Median guaranteed");
  assert.equal(element("drift-estimate-range").textContent,"[5.2, 8]");
  assert.equal(element("tie-window-range").textContent,"Tie targets: 52.3 to 54.3");
  assert.match(element("tie-window-proof").textContent,/selected target range stays outside this band/);
  assert.match(element("tie-track").attributes["aria-label"],/No tie is attainable/);
  assert.match(element("reach-map-band").attributes.d,/^M /);
  assert.match(element("reach-map-below").attributes.d,/^M 60\.000 320\.000 L /);
  assert.match(element("reach-map-above").attributes.d,/^M 970\.000 320\.000 L /);
  assert.equal(element("reach-map-below").attributes["data-winner"],"Median");
  assert.equal(element("reach-map-above").attributes["data-winner"],"Mean");
  assert.equal(element("reach-map-below-label").textContent,"Median guaranteed · below tie band");
  assert.match(element("reach-map-verdict").textContent,/Median is guaranteed for every allowed reading arrangement/);
  assert.equal(element("depth-label-0").textContent,"Tie at 53.3");
  assert.equal(element("depth-label-1").textContent,"Tie: 52.7–53.9");
  assert.match(element("depth-track-1").attributes["aria-label"],/At most 1 reading may move/);
  assert.equal(element("depth-label-5").textContent,"Tie: 52.3–54.3");
  assert.equal(element("depth-track-5").dataset.kind,"band");
  assert.equal(element("depth-row-5").dataset.first,"false");
  assert.match(element("depth-conclusion").textContent,/cannot tie even when all five/);
  assert.equal(element("reach-map-max").textContent,"10");
  assert.match(element("reach-map-caption").textContent,/exact ε = 16\/3/);
  assert.match(element("reach-map").attributes["aria-label"],/No tie is attainable/);
  assert.equal(element("point-exact").textContent,"33/10");
  assert.equal(element("point-grid").textContent,"First selectable ε = 3.3");
  assert.match(element("point-proof").textContent,/range first ties at ε = 13\/10/);
  assert.match(element("point-witness-text").textContent,/At ε = 33\/10: readings \[44\.7, 45\.7, 46\.7, 47\.7, 81\.7\]; target 50/);
  assert.equal(element("reach-map-point-dot").attributes.cx,"515.000");
  assert.equal(element("reach-map-point-dot").attributes.cy,"227.600");
  assert.match(element("reach-map").attributes["aria-label"],/first tie at exact target 50 is at ε 33\/10/);
  assert.equal(element("drift-remaining").textContent,"0.6");
  assert.equal(element("edge-last-strict").textContent,"1.299999");
  assert.equal(element("edge-exact-fraction").textContent,"13/10");
  assert.equal(element("edge-estimate-threshold").textContent,"16/3");
  assert.equal(element("edge-reference-threshold").textContent,"13/10");
  assert.equal(element("edge-reference-route").dataset.active,"true");
  assert.equal(element("edge-estimate-route").dataset.active,"false");
  assert.match(element("edge-estimate-witness").textContent,/At ε = 16\/3: readings \[128\/3, 131\/3, 166\/3, 166\/3, 239\/3\]; target 48/);
  assert.match(element("edge-reference-witness").textContent,/At ε = 13\/10: readings \[46\.7, 47\.7, 48\.7, 49\.7, 83\.7\]; target 52/);
  assert.equal(element("edge-exact-decimal").textContent,"= 1.3");
  assert.match(element("edge-proof-text").textContent,/five admissible changes below tie at target 52/);
  assert.equal(element("edge-changes").children[0].textContent,"48 → 46.7 · −1.3");
  assert.equal(element("edge-outcome").textContent,"Mean 55.3 · median 48.7 · both absolute errors 3.3.");
  assert.equal(element("edge-first-tie").textContent,"1.3");
  assert.equal(element("sparse-status").textContent,"No tie within this drift");
  assert.match(element("sparse-proof").textContent,/All 32 subsets/);
  assert.equal(element("frontier-exact-1").textContent,"Exact ε = 8");
  assert.equal(element("frontier-threshold-1").textContent,"First selectable ε = 8");
  assert.equal(element("frontier-exact-2").textContent,"Exact ε = 13/7");
  assert.equal(element("frontier-threshold-2").textContent,"First selectable ε = 1.857143");
  assert.equal(element("frontier-selection-2").textContent,"Exact witness subset: 2, 3");
  assert.match(element("frontier-witness-2").textContent,/At ε = 13\/7: readings \[/);
  assert.equal(element("frontier-exact-5").textContent,"Exact ε = 13/10");
  assert.equal(element("frontier-threshold-5").textContent,"First selectable ε = 1.3");
  assert.equal(element("frontier-row-5").dataset.reached,"false");
  element("point-open").handlers.click();
  assert.equal(element("interval-low").value,"50");
  assert.equal(element("interval-high").value,"50");
  assert.equal(element("drift-input").value,"3.3");
  assert.equal(element("edge-exact-fraction").textContent,"33/10");
  assert.equal(element("edge-proof").open,true);
  assert.equal(scrolled,"edge-proof");
  assert.match(address.at(-1),/target=50&lo=50&hi=50&eps=3\.3$/);
  presets[0].handlers.click();
  assert.equal(element("single-reading-3").textContent,"Reading 3 · 50");
  assert.equal(element("single-exact-3").textContent,"Exact ε = 8");
  assert.equal(element("single-grid-3").textContent,"First selectable ε = 8");
  assert.equal(element("single-exact-1").textContent,"Exact ε = 13");
  assert.match(element("single-witness-3").textContent,/other four readings stay fixed/i);
  assert.equal(element("single-row-3").dataset.reached,"false");
  element("edge-first-button").handlers.click();
  assert.equal(element("drift-badge").textContent,"A tie can occur");
  assert.equal(element("sparse-count").textContent,"5");
  assert.match(element("sparse-proof").textContent,/\(checked: 31\)/);
  assert.deepEqual(element("sparse-changes").children.map(item=>item.dataset.moved),["true","true","true","true","true"]);
  assert.match(element("sparse-outcome").textContent,/Target 52 · mean 55\.3 · median 48\.7 · equal absolute errors 3\.3/);
  assert.equal(element("frontier-row-5").dataset.current,"true");
  element("frontier-button-2").handlers.click();
  assert.equal(element("drift-input").value,"1.857143");
  assert.equal(element("sparse-count").textContent,"2");
  assert.equal(element("frontier-row-2").dataset.current,"true");
  assert.equal(scrolled,"sparse-witness");
  assert.match(address.at(-1),/eps=1\.857143$/);
  await element("sparse-copy").handlers.click();
  assert.match(copied,/Minimum movable readings: 2 of 5/);
  assert.match(copied,/All smaller subsets certified strict: 6/);
  element("single-button-4").handlers.click();
  assert.equal(element("drift-input").value,"8");
  assert.equal(element("sparse-count").textContent,"1");
  assert.equal(element("single-row-4").dataset.reached,"true");
  assert.equal(element("single-row-1").dataset.reached,"false");
  assert.equal(element("single-detail-4").open,true);
  assert.equal(scrolled,"single-row-4");
  assert.match(address.at(-1),/eps=8$/);
  element("edge-last-button").handlers.click();
  assert.equal(element("drift-badge").textContent,"Median guaranteed");
  assert.match(address.at(-1),/eps=1\.299999$/);
  element("drift-input").handlers.input({target:{value:"1.3"}});
  assert.equal(element("drift-badge").textContent,"A tie can occur");
  assert.equal(element("tie-window-range").textContent,"Tie targets: 52 to 54.6");
  assert.match(element("tie-window-proof").textContent,/selected target range meets this band/);
  assert.match(element("drift-witness").textContent,/46\.7, 47\.7, 48\.7, 49\.7, 83\.7; target 52/);
  assert.equal(element("drift-shortcut-status").textContent,"Shortcut inconclusive");
  assert.match(element("drift-proof-text").textContent,/does not prove that a reversal is possible/);
  assert.match(address.at(-1),/eps=1\.3$/);
  element("drift-input").handlers.input({target:{value:"4"}});
  assert.equal(element("sparse-count").textContent,"2");
  assert.equal(element("depth-row-2").dataset.first,"true");
  assert.equal(element("depth-row-1").dataset.first,"false");
  assert.match(element("depth-conclusion").textContent,/at most 2 movable readings/);
  assert.deepEqual(element("sparse-changes").children.map(item=>item.dataset.moved),["true","false","true","false","false"]);
  assert.match(element("sparse-outcome").textContent,/Target 52 · mean 55 · median 49 · equal absolute errors 3/);
  element("drift-input").handlers.input({target:{value:"10"}});
  assert.equal(element("sparse-count").textContent,"1");
  assert.equal(element("depth-row-1").dataset.first,"true");
  assert.equal(element("depth-track-3").dataset.kind,"all");
  assert.deepEqual(element("sparse-changes").children.map(item=>item.dataset.moved),["false","false","true","false","false"]);
  assert.match(element("sparse-changes").children[2].textContent,/50 → 122\/3/);
  element("drift-input").handlers.input({target:{value:"0.9"}});
  assert.equal(element("drift-badge").textContent,"Median guaranteed");
  element("drift-input").handlers.input({target:{value:"0.0000001"}});
  assert.match(element("drift-error").textContent,/six decimal places/);
  assert.match(address.at(-1),/eps=0\.9$/);
  witnesses[2].handlers.click();
  assert.equal(element("hero-target").textContent,"56.6");
  assert.equal(element("verdict").textContent,"Mean is closer.");
  assert.equal(element("witness-2").attributes["aria-pressed"],"true");
  assert.match(address.at(-1),/target=56\.6&lo=48&hi=52&eps=0\.9$/);
  witnesses[1].handlers.click();
  assert.equal(element("verdict").textContent,"Equal absolute error.");
  assert.equal(element("point-exact").textContent,"0 · already tied");
  assert.equal(element("point-witness").hidden,true);
  assert.match(element("proof-factors").textContent,/zero \(a tie\)/);
  element("interval-span").handlers.click();
  assert.equal(element("interval-badge").textContent,"Both winners possible");
  assert.equal(element("interval-ruler").dataset.kind,"crosses");
  assert.match(address.at(-1),/target=53\.3&lo=50&hi=56\.6&eps=0\.9$/);
  assert.equal(element("drift-badge").textContent,"A tie can occur");
  assert.equal(element("drift-shortcut-status").textContent,"No strict baseline");
  element("interval-high").handlers.input({target:{value:"53.3"}});
  assert.equal(element("interval-badge").textContent,"Median or tie");
  element("interval-low").handlers.input({target:{value:"53.3"}});
  assert.equal(element("interval-badge").textContent,"Exact tie only");
  assert.equal(element("interval-endpoints").textContent,"At 53.3: Equal.");
  assert.match(address.at(-1),/lo=53\.3&hi=53\.3&eps=0\.9$/);
  element("interval-low").handlers.input({target:{value:"70"}});
  assert.match(element("interval-error").textContent,/low ≤ high/);
  assert.match(address.at(-1),/lo=53\.3&hi=53\.3&eps=0\.9$/);
  presets[2].handlers.click();
  assert.equal(element("reach-map-below").attributes.d,"");
  assert.equal(element("reach-map-above").attributes.d,"");
  assert.match(element("reach-map-verdict").textContent,/A tie is attainable/);
  assert.equal(element("depth-label-0").textContent,"Every target can tie");
  assert.equal(element("depth-row-0").dataset.first,"true");
  assert.equal(element("witness-grid").hidden,true);
  assert.equal(element("witness-all-tie").hidden,false);
  assert.match(element("witness-all-tie").textContent,/every target/);
  assert.match(element("proof-factors").textContent,/zero for every target/);
  assert.equal(element("interval-badge").textContent,"Every target ties");
  assert.match(element("interval-ruler").attributes["aria-label"],/Mean and median coincide\./);
  assert.equal(element("interval-span").disabled,true);
  assert.equal(element("interval-tie-mark").hidden,true);
  assert.equal(element("edge-last-strict").textContent,"—");
  assert.equal(element("edge-exact-fraction").textContent,"—");
  assert.equal(element("edge-estimate-threshold").textContent,"—");
  assert.equal(element("edge-reference-threshold").textContent,"—");
  assert.equal(element("edge-estimate-detail").hidden,true);
  assert.equal(element("edge-reference-detail").hidden,true);
  assert.equal(element("edge-proof").hidden,true);
  assert.equal(element("edge-first-tie").textContent,"0");
  assert.equal(element("edge-first-button").disabled,true);
  assert.equal(element("frontier-rows").hidden,true);
  assert.equal(element("single-rows").hidden,true);
  assert.match(element("single-proof").textContent,/No reading change is needed/);
  assert.match(element("frontier-proof").textContent,/No reading change is needed/);
  assert.equal(element("point-exact").textContent,"0 · already tied");
  element("point-open").handlers.click();
  assert.equal(element("drift-input").value,"0");
  assert.equal(element("interval-low").value,"50");
  assert.equal(scrolled,"tie-window");
  copied="";
  await element("edge-copy").handlers.click();
  assert.equal(copied,"");
  element("drift-example").handlers.click();
  assert.equal(element("drift-badge").textContent,"Median guaranteed");
  assert.equal(element("tie-window-range").textContent,"Tie targets: 49.3 to 57.3");
  assert.equal(element("drift-shortcut-status").textContent,"Shortcut inconclusive");
  assert.equal(element("drift-reference-range").textContent,"[96.6, 114.6]");
  assert.match(address.at(-1),/target=0\.5&lo=0&hi=1&eps=4$/);
  assert.equal(element("edge-last-strict").textContent,"5.333333");
  assert.equal(element("edge-exact-fraction").textContent,"16/3");
  assert.equal(element("edge-estimate-threshold").textContent,"16/3");
  assert.equal(element("edge-reference-threshold").textContent,"75");
  assert.equal(element("edge-estimate-route").dataset.active,"true");
  assert.equal(element("edge-estimate-detail").hidden,false);
  assert.equal(element("edge-reference-witness").textContent,
    "At ε = 75: readings [0, 0, 0, 0, 10]; target 1. Mean 2 · median 0 · both absolute errors 1.");
  assert.equal(element("edge-exact-decimal").textContent,"≈ 5.333333333…");
  assert.equal(element("edge-changes").children[0].textContent,"48 → 128/3 · −16/3");
  assert.equal(element("edge-changes").children[3].textContent,"51 → 166/3 · +13/3");
  assert.equal(element("edge-outcome").textContent,"Mean 166/3 · median 166/3 · both absolute errors 166/3.");
  assert.equal(element("edge-first-tie").textContent,"5.333334");
  element("edge-first-button").handlers.click();
  assert.equal(element("drift-badge").textContent,"A tie can occur");
  assert.equal(element("tie-window-range").textContent,"Every target from 0 to 100 can tie");
  assert.match(element("tie-window-proof").textContent,/coincident estimates extend ties to all targets/);
  assert.match(element("reach-map-caption").textContent,/This range reaches a tie/);
  assert.equal(element("drift-estimate-range").textContent,"[-0.0000008, 11.4666672]");
  assert.match(element("drift-witness").textContent,/Exact tie construction: interpolate the readings/);
  assert.match(element("drift-witness").textContent,/fraction 1\/14333335 of the path/);
  assert.match(address.at(-1),/eps=5\.333334$/);
  await element("edge-copy").handlers.click();
  assert.match(copied,/Exact threshold ε = 16\/3/);
  assert.match(copied,/Mean meets median at ε = 16\/3/);
  assert.match(copied,/Target meets mean–median midpoint at ε = 75/);
  assert.match(copied,/Reference route witness: At ε = 75: readings \[0, 0, 0, 0, 10\]; target 1/);
  assert.match(copied,/Reading 1: 48 → 128\/3 · −16\/3/);
  assert.match(copied,/First six-decimal tie setting: 5\.333334/);
  assert.match(copied,/Reproduce selectable setting: https:\/\/example\.test\/target-lens\.html\?.*&eps=5\.333334/);
  assert.equal(element("edge-copy-status").textContent,"Exact certificate copied.");
});

test("atlas covers the exact cohort grid and agrees with the full lab", () => {
  const atlas=loadAtlas("?start=42&offset=0&fifth=50");
  const lab=loadLab("?seed=42&fifth=50");
  const snapshot=atlas.window.InwardMathAtlas.snapshot();
  const counts=snapshot.counts;
  assert.equal(counts.Mean+counts.Median+counts.Equal,128*101);
  assert.equal(atlas.element("column-mean-wins").textContent,"53");
  assert.equal(atlas.element("column-median-wins").textContent,"75");
  assert.equal(atlas.window.InwardMathAtlas.columnSummary(50).meanAverage,lab.window.InwardMathLab.snapshot().witnessCohort.points[50].meanAverageAbsoluteError);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.cell.values)),[...lab.window.InwardMathLab.snapshot().witnesses.seeded,50]);
  for(const fifth of [0,40,85,100]) {
    const expected=lab.window.InwardMathLab.snapshot().witnessCohort.members[0].observers;
    const actual=atlas.window.InwardMathAtlas.statsAt(42,fifth);
    assert.deepEqual(JSON.parse(JSON.stringify(actual.values)),[...expected,fifth]);
  }
});

test("atlas selection and exact links preserve the case, including seed wrap", async () => {
  const atlas=loadAtlas("?start=4294967295&offset=1&fifth=85");
  assert.equal(atlas.window.InwardMathAtlas.snapshot().cell.seed,0);
  assert.equal(atlas.element("lab-link").href,"index.html?seed=0&fifth=85#start");
  assert.equal(atlas.element("challenge-link").href,"challenge.html?seed=0&fifth=85");
  atlas.window.InwardMathAtlas.select(2,50);
  assert.equal(atlas.element("share-link").href,"https://aruintelligence.github.io/inward-mathematics-simulator/atlas.html?start=4294967295&offset=2&fifth=50");
  await click(atlas.element("copy"));
  assert.equal(atlas.share.copied,atlas.element("share-link").href);
  assert.equal(atlas.element("share-status").textContent,"Exact atlas view copied.");
});

test("atlas rejects invalid links and offers numeric and map selection", () => {
  const atlas=loadAtlas("?start=4294967296&offset=128&fifth=101");
  assert.equal(atlas.window.InwardMathAtlas.snapshot().start,42);
  assert.equal(atlas.window.InwardMathAtlas.snapshot().fifth,50);
  atlas.element("map").handlers.click({clientX:40*8+3,clientY:3*6+2});
  assert.equal(atlas.window.InwardMathAtlas.snapshot().offset,3);
  assert.equal(atlas.window.InwardMathAtlas.snapshot().fifth,40);
  assert.equal(atlas.element("lab-link").href,"index.html?seed=45&fifth=40#start");
  atlas.element("fifth").value="-1";
  atlas.element("fifth").handlers.change();
  assert.equal(atlas.element("fifth").value,"40");
  assert.match(atlas.element("share-status").textContent,/whole number/);
  atlas.element("fifth-range").value="50";
  atlas.element("fifth-range").handlers.input();
  click(atlas.element("find-median"));
  assert.equal(atlas.window.InwardMathAtlas.snapshot().cell.winner,"Median");
  click(atlas.element("find-mean"));
  assert.equal(atlas.window.InwardMathAtlas.snapshot().cell.winner,"Mean");
});

test("own-data workbench computes the mean, median, and an explicit leave-one-out counterfactual", () => {
  const lab=loadLab();
  const analysis=lab.window.InwardMathLab.analyzeDataset("48, 49, 50, 51, 85","50");
  assert.equal(analysis.schema,"inward-math-dataset-v1");
  assert.equal(analysis.mean,56.6);
  assert.equal(analysis.median,50);
  assert.equal(analysis.errors.meanAbsoluteError,6.600000000000001);
  assert.equal(analysis.errors.medianAbsoluteError,0);
  assert.equal(analysis.leaveOneOut.removedIndex,4);
  assert.equal(analysis.leaveOneOut.mean,49.5);
  assert.equal(analysis.leaveOneOut.median,49.5);
  assert.match(lab.element("workbench-summary").textContent,/median is closer/);
  assert.match(lab.element("workbench-leaveout").textContent,/observation 5 \(85\)/);
  assert.equal(lab.element("workbench-result").hidden,false);
  assert.equal(lab.element("workbench-error").textContent,"");
});

test("workbench supports a mean-wins case, even-size medians, and no target", () => {
  const lab=loadLab();
  click(lab.element("example-mean"));
  assert.equal(lab.element("known-target").value,"52");
  assert.match(lab.element("workbench-summary").textContent,/mean is closer/);
  assert.equal(lab.element("workbench-mean").textContent,"52");
  const analysis=lab.window.InwardMathLab.analyzeDataset("-4, -2, 2, 10","");
  assert.equal(analysis.median,0);
  assert.equal(analysis.errors,null);
  lab.element("dataset").value="-4, -2, 2, 10";
  lab.element("known-target").value="";
  click(lab.element("analyze"));
  assert.match(lab.element("workbench-summary").textContent,/neither estimator is declared more accurate/);
  assert.match(lab.element("workbench-target-note").textContent,/No target supplied/);
});

test("workbench rejects invalid inputs instead of displaying stale results, and exports local analysis", async () => {
  const lab=loadLab();
  lab.element("dataset").value="2, 3, not-a-number";
  click(lab.element("analyze"));
  assert.equal(lab.element("workbench-result").hidden,true);
  assert.match(lab.element("workbench-error").textContent,/Observation 3/);
  assert.throws(()=>lab.window.InwardMathLab.analyzeDataset("1, 2, 3","Infinity"),/known target/);
  assert.throws(()=>lab.window.InwardMathLab.analyzeDataset("1, 2, 1000001",""),/Observation 3/);
  lab.element("dataset").value="1, 2, 3";
  lab.element("known-target").value="";
  click(lab.element("analyze"));
  click(lab.element("workbench-export"));
  assert.equal(lab.download.clicked,true);
  assert.equal(lab.download.filename,"inward-math-dataset-analysis.json");
  const saved=JSON.parse(await lab.download.blob.text());
  assert.deepEqual(saved.values,[1,2,3]);
  assert.equal(saved.target,null);
  assert.equal(saved.schema,"inward-math-dataset-v1");
  assert.match(lab.element("workbench-save-status").textContent,/saved on this device/);
});

test("export button downloads seed, parameter changes, and exact shock impulse", async () => {
  const lab=loadLab();
  input(lab.element("alpha"),2.1);
  input(lab.element("shock-strength"),75);
  click(lab.element("shock"));
  click(lab.element("export"));
  assert.equal(lab.download.clicked,true);
  assert.equal(lab.download.filename,"inward-math-seed-42-step-0.json");
  const report=JSON.parse(await lab.download.blob.text());
  assert.equal(report.seed,42);
  assert.equal(report.model.damping,0.92);
  assert.deepEqual(report.parameterChanges.map(change=>change.parameter),["alpha","shockStrength"]);
  assert.equal(report.shocks[0].selectedStrength,75);
  assert.equal(report.witnesses.target,50);
  assert.equal(report.schema,"inward-math-toy-v3");
  assert.equal(report.witnessSensitivity.points.length,101);
  assert.equal(report.witnessCohort.members.length,128);
  assert.equal(report.witnessCohort.points.length,101);
});

test("invalid seed uses the documented default", () => {
  const lab=loadLab();
  lab.element("seed").value="";
  click(lab.element("reset"));
  assert.equal(snapshot(lab).seed,42);
  assert.equal(lab.element("seed").value,"42");
});
