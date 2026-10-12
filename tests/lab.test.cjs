const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {test} = require("node:test");

function loadLab(search="") {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script, "the single-file lab must contain its model script");

  const initial = {"alpha":"1.5","shock-strength":"60","seed":"42","outlier":"85","dataset":"48, 49, 50, 51, 85","known-target":"50"};
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

function loadChallenge(search="") {
  const html=fs.readFileSync(path.join(__dirname,"..","challenge.html"),"utf8");
  const script=html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script,"the challenge must contain its model script");
  const elements=new Map(),share={copied:null},classes=new Set();
  function element(id) {
    if(!elements.has(id)) elements.set(id,{
      textContent:"",value:"",href:"",hidden:id==="result",disabled:false,style:{},attributes:{},handlers:{},
      addEventListener(name,handler){this.handlers[name]=handler;},
      setAttribute(name,value){this.attributes[name]=value;},
    });
    return elements.get(id);
  }
  const window={location:{search,href:"https://aruintelligence.github.io/inward-mathematics-simulator/challenge.html"+search}};
  const navigator={clipboard:{async writeText(value){share.copied=value;}}};
  vm.runInNewContext(script[1],{window,document:{getElementById:element,body:{classList:{add(name){classes.add(name);}}}},navigator,URLSearchParams},{timeout:1000});
  return {window,element,share,classes};
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

test("workbench offers a challenge only for shareable data and clears it on invalid input", () => {
  const lab=loadLab();
  assert.equal(lab.element("workbench-challenge").hidden,false);
  assert.equal(lab.element("workbench-challenge").href,"challenge.html?values=48%2C49%2C50%2C51%2C85&target=50");
  lab.element("known-target").value="";
  click(lab.element("analyze"));
  assert.equal(lab.element("workbench-challenge").hidden,true);
  lab.element("known-target").value="50";
  lab.element("dataset").value="48,49,50,51,100.12345";
  click(lab.element("analyze"));
  assert.equal(lab.element("workbench-challenge").hidden,true);
  lab.element("dataset").value="bad input";
  click(lab.element("analyze"));
  assert.equal(lab.element("workbench-challenge").hidden,true);
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
