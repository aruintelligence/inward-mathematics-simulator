"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const crypto=require("node:crypto");
const {test}=require("node:test");

const root=path.join(__dirname,"..");
const html=fs.readFileSync(path.join(root,"discovery.html"),"utf8");
const archive=JSON.parse(fs.readFileSync(path.join(root,"examples/discovery-scan-v1.json"),"utf8"));

test("research page exposes all five verified records and distinguishes finite evidence",()=>{
  assert.match(html,/<title>Discovery Archive \| Inward Mathematics™<\/title>/);
  assert.match(html,/href="examples\/discovery-scan-v1\.json" download/);
  assert.match(html,/href="examples\/estimator-identities-v1\.json" download/);
  assert.match(html,/Lean module proves the midpoint identity/);
  assert.match(html,/Reordering invariance has a symbolic check here, but is not formalized in Lean/);
  assert.match(html,/all 120 permutations of five formal positions/);
  const proofBytes=fs.readFileSync(path.join(root,"examples/estimator-identities-v1.json"));
  assert.ok(html.includes(crypto.createHash("sha256").update(proofBytes).digest("hex")));
  assert.match(html,/role="status">Showing 5 of 5 candidates/);
  assert.match(html,/This status alone is not a proof over all real values/);
  assert.match(html,/prefers-color-scheme:light/);
  assert.match(html,/max-width:760px/);
  assert.match(fs.readFileSync(path.join(root,"index.html"),"utf8"),/href="discovery\.html"/);
  for(const item of archive.candidates) {
    assert.match(html,new RegExp(`id="${item.id}" data-status="${item.status}"`));
    assert.ok(html.includes(item.claim));
  }
  assert.ok(html.includes(archive.sourceSha256));
  assert.equal((html.match(/<details class="candidate"/g)||[]).length,5);
  assert.match(html,/Mean is strictly closer at target 25/);
  assert.match(html,/Median is strictly closer at target 0/);
  assert.match(html,/<circle cx="30\.000" cy="53" r="6" fill="#fa9fab"\/>/,
    "four coincident readings must be shown as four stacked marks");
});

test("search, status filter, reset and printable report preserve the visible selection",()=>{
  const script=html.match(/<script>\s*([\s\S]*?)<\/script>/);
  assert.ok(script);
  const cards=archive.candidates.map(item=>({dataset:{status:item.status},
    textContent:JSON.stringify(item),hidden:false,open:false}));
  const elements=new Map();
  function element(id) {
    if(!elements.has(id)) elements.set(id,{value:id==="archive-filter"?"all":"",
      hidden:id==="archive-empty",textContent:"",handlers:{},focusCalled:false,
      addEventListener(type,handler){this.handlers[type]=handler;},focus(){this.focusCalled=true;}});
    return elements.get(id);
  }
  let printState=null,afterPrint=null;
  const window={addEventListener(type,handler){assert.equal(type,"afterprint");afterPrint=handler;},
    print(){printState=cards.map(card=>({hidden:card.hidden,open:card.open}));afterPrint();}};
  const document={querySelectorAll(selector){assert.equal(selector,".candidate");return cards;},getElementById:element};
  vm.runInNewContext(script[1],{document,window},{timeout:1000});
  element("archive-search").value="midpoint";
  element("archive-search").handlers.input();
  assert.equal(cards.filter(card=>!card.hidden).length,1);
  assert.equal(element("archive-count").textContent,"Showing 1 of 5 candidates");
  element("archive-filter").value="counterexample-found";
  element("archive-filter").handlers.change();
  assert.equal(element("archive-count").textContent,"Showing 0 of 5 candidates");
  assert.equal(element("archive-empty").hidden,false);
  element("archive-reset").handlers.click();
  assert.equal(element("archive-search").value,"");
  assert.equal(element("archive-filter").value,"all");
  assert.equal(element("archive-search").focusCalled,true);
  assert.equal(cards.filter(card=>!card.hidden).length,5);
  element("archive-filter").value="unrefuted-on-finite-grid";
  element("archive-filter").handlers.change();
  const before=cards.map(card=>({hidden:card.hidden,open:card.open}));
  assert.equal(cards.filter(card=>!card.hidden).length,2);
  element("archive-print").handlers.click();
  assert.deepEqual(printState,Array.from({length:5},()=>({hidden:false,open:true})));
  assert.deepEqual(cards.map(card=>({hidden:card.hidden,open:card.open})),before);
  assert.equal(element("archive-count").textContent,"Showing 2 of 5 candidates");
});
