const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {test} = require("node:test");

function loadLab(search="") {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script, "the single-file lab must contain its model script");

  const initial = {"alpha":"1.5","shock-strength":"60","seed":"42","outlier":"85"};
  const elements = new Map();
  const download = {clicked:false,blob:null,filename:null};
  const share = {copied:null,scrolled:null};
  const context = new Proxy({}, {get: (_target, key) => {
    if (key === "canvas") return undefined;
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
      });
    }
    return elements.get(id);
  }
  const window = {matchMedia: () => ({matches:false}),location:{search,href:"https://aruintelligence.github.io/inward-mathematics-simulator/"+search}};
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
  }, {timeout:1000});
  return {window,element,html,download,share};
}

function click(element) {return element.handlers.click();}
function input(element, value) {element.value=String(value);element.handlers.input();}
function snapshot(lab) {return JSON.parse(JSON.stringify(lab.window.InwardMathLab.snapshot()));}

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
  await click(lab.element("copy-link"));
  assert.equal(lab.share.copied,expected);
  assert.equal(lab.element("share-status").textContent,"Exact case link copied.");
  const invalid=loadLab("?seed=4294967296&fifth=101");
  assert.equal(snapshot(invalid).seed,42);
  assert.equal(snapshot(invalid).witnesses.adjustable,85);
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
