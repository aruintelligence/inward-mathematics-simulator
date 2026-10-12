/* A local, direct-manipulation experiment for five readings and a chosen target. */
(() => {
  "use strict";

  const PRESETS = {
    a:{values:[48,49,50,51,85],target:50,label:"A / one high reading"},
    b:{values:[40,42,50,60,68],target:52,label:"B / mean wins"},
    c:{values:[0,0,50,100,100],target:50,label:"C / estimates coincide"}
  };
  const pattern=/^(?:0|[1-9]\d?|100)(?:\.\d{1,4})?$/;
  const valid=raw=>pattern.test(raw)&&Number(raw)<=100?Number(raw):null;
  const fmt=value=>String(Number(value.toFixed(4)));
  const clone=caseData=>({values:[...caseData.values],target:caseData.target,label:caseData.label,key:caseData.key});

  function parseView(search) {
    const params=new URLSearchParams(search);
    if(!params.has("values")&&!params.has("target")) return null;
    if(params.getAll("values").length!==1||params.getAll("target").length!==1) return false;
    const parts=params.get("values").split(",");
    if(parts.length!==5) return false;
    const values=parts.map(valid),target=valid(params.get("target"));
    return values.some(value=>value===null)||target===null?false:{values,target,label:"Shared arrangement"};
  }

  function evaluate(values,target) {
    const units=values.map(value=>Math.round(value*10000));
    const targetUnits=Math.round(target*10000);
    const sorted=[...units].sort((a,b)=>a-b);
    const sum=units.reduce((total,value)=>total+value,0);
    const meanErrorUnits=Math.abs(sum-5*targetUnits);
    const medianErrorUnits=Math.abs(5*sorted[2]-5*targetUnits);
    return {
      mean:sum/50000,median:sorted[2]/10000,
      meanError:meanErrorUnits/50000,medianError:medianErrorUnits/50000,
      winner:meanErrorUnits===medianErrorUnits?"Equal":meanErrorUnits<medianErrorUnits?"Mean":"Median",
      sameEstimate:sum===5*sorted[2]
    };
  }

  if(typeof module==="object"&&module.exports) module.exports={PRESETS,parseView,evaluate};
  if(typeof document==="undefined") return;

  const $=id=>document.getElementById(id);
  const svgNS="http://www.w3.org/2000/svg";
  const node=(tag,attrs={},content)=>{
    const item=document.createElementNS(svgNS,tag);
    for(const [key,value] of Object.entries(attrs)) item.setAttribute(key,String(value));
    if(content!==undefined) item.textContent=content;
    return item;
  };
  const x=value=>90+value*8.1;
  const rows=[100,160,220,280,340];
  const supplied=parseView(window.location.search);
  let starting=supplied&&supplied!==false?clone(supplied):{...clone(PRESETS.a),key:"a"};
  let current=clone(starting),anchor=clone(starting),selected=4,dragging=null;
  const controls=[];
  if(supplied===false) $("input-error").textContent="That shared arrangement is invalid. Case A is loaded instead.";

  function drawStatic() {
    const group=$("plot-static");
    for(const tick of [0,25,50,75,100]) {
      const px=x(tick);
      group.append(node("line",{class:"grid",x1:px,x2:px,y1:56,y2:450}));
      group.append(node("text",{class:"axis-text",x:px,y:485,"text-anchor":"middle"},String(tick)));
    }
    for(const y of [...rows,406,451]) group.append(node("line",{class:"lane",x1:90,x2:900,y1:y,y2:y}));
    group.append(node("text",{class:"axis-text",x:500,y:507,"text-anchor":"middle"},"READING VALUE →"));
  }
  function draw() {
    const group=$("plot-dynamic"),stats=evaluate(current.values,current.target);
    const targetX=x(current.target);
    const parts=[node("line",{class:"reference",x1:targetX,x2:targetX,y1:58,y2:458})];
    const targetGroup=node("g",{"data-target":"true"});
    targetGroup.append(node("circle",{class:"target-dot",cx:targetX,cy:51,r:17}));
    targetGroup.append(node("text",{class:"target-text",x:targetX>805?targetX-26:targetX+26,y:57,"text-anchor":targetX>805?"end":"start"},"TARGET "+fmt(current.target)));
    parts.push(targetGroup);
    current.values.forEach((value,index)=>{
      const px=x(value),y=rows[index],item=node("g",{"data-reading":index,class:index===selected?"selected":""});
      parts.push(node("text",{class:"row-name",x:22,y:y+6},String(index+1).padStart(2,"0")));
      item.append(node("circle",{class:"halo",cx:px,cy:y,r:24}));
      item.append(node("circle",{class:"dot",cx:px,cy:y,r:17}));
      item.append(node("text",{class:"value-text",x:px,y:y+6,"text-anchor":"middle",fill:"#0c2831","font-size":"12"},String(index+1)));
      item.append(node("text",{class:"value-text",x:px>832?px-28:px+28,y:y+6,"text-anchor":px>832?"end":"start"},fmt(value)));
      parts.push(item);
    });
    for(const [label,value,y,className] of [["MEAN",stats.mean,406,"mean"],["MEDIAN",stats.median,451,"median"]]) {
      const px=x(value);
      parts.push(node("text",{class:"row-name "+className+"-text",x:8,y:y+6},label));
      parts.push(node("circle",{class:className+"-dot",cx:px,cy:y,r:12}));
      parts.push(node("text",{class:"value-text "+className+"-text",x:px>832?px-22:px+22,y:y+6,"text-anchor":px>832?"end":"start"},fmt(value)));
    }
    group.replaceChildren(...parts);
    $("plot").setAttribute("aria-label","Readings "+current.values.map(fmt).join(", ")+"; chosen target "+fmt(current.target)+"; mean "+fmt(stats.mean)+"; median "+fmt(stats.median)+". Use the labeled range and number inputs below to change them.");
  }
  function makeControls() {
    const grid=$("control-grid");
    for(let index=0;index<6;index++) {
      const isTarget=index===5,id=isTarget?"target":"reading-"+(index+1);
      const item=document.createElement("div");
      item.className="control-item";
      const label=document.createElement("label");
      label.setAttribute("for",id+"-range");
      label.textContent=isTarget?"Chosen target":"Reading "+(index+1);
      const range=document.createElement("input");
      range.type="range";range.id=id+"-range";range.min="0";range.max="100";range.step="any";
      range.setAttribute("aria-label",isTarget?"Chosen target":"Reading "+(index+1));
      const exact=document.createElement("input");
      exact.type="number";exact.id=id+"-exact";exact.min="0";exact.max="100";exact.step="any";exact.inputMode="decimal";
      exact.setAttribute("aria-label",(isTarget?"Exact chosen target":"Exact reading "+(index+1))+", 0 to 100");
      range.addEventListener("input",()=>setValue(index,fmt(Math.round(Number(range.value)*10)/10)));
      exact.addEventListener("input",()=>setValue(index,exact.value));
      exact.addEventListener("change",()=>{if(valid(exact.value)===null) {exact.value=fmt(isTarget?current.target:current.values[index]);$("input-error").textContent="";}});
      item.append(label,range,exact);grid.append(item);
      controls.push({item,range,exact});
    }
  }
  function viewUrl() {
    return "shape-the-data.html?values="+encodeURIComponent(current.values.map(fmt).join(","))+"&target="+fmt(current.target);
  }
  function updateAddress() {
    try { window.history.replaceState(null,"",viewUrl()); } catch (_) { /* File:// viewing remains usable. */ }
  }
  function render() {
    const stats=evaluate(current.values,current.target),before=evaluate(anchor.values,anchor.target);
    $("case-label").textContent=current.label;
    $("hero-card").dataset.winner=stats.winner;
    $("winner").textContent=stats.winner==="Equal"?"Equal error.":stats.winner+" is closer.";
    $("winner-detail").textContent=stats.sameEstimate
      ?"Mean and median both equal "+fmt(stats.mean)+". Every target ties."
      :stats.winner==="Equal"?"Both estimates are "+fmt(stats.meanError)+" from the chosen target "+fmt(current.target)+"."
      :"At target "+fmt(current.target)+", the "+stats.winner.toLowerCase()+" has "+fmt(Math.abs(stats.meanError-stats.medianError))+" less absolute error.";
    $("estimates").textContent="Mean "+fmt(stats.mean)+" · median "+fmt(stats.median)+" · chosen target "+fmt(current.target)+".";
    $("mean-error").textContent=fmt(stats.meanError);
    $("median-error").textContent=fmt(stats.medianError);
    const scale=Math.max(stats.meanError,stats.medianError,0.1);
    $("mean-bar").style.width=(stats.meanError/scale*100)+"%";
    $("median-bar").style.width=(stats.medianError/scale*100)+"%";
    const changed=current.values.map((value,index)=>Math.abs(value-anchor.values[index])>1e-9?index:-1).filter(index=>index>=0);
    const targetChanged=Math.abs(current.target-anchor.target)>1e-9;
    const signed=value=>(value>0?"+":"")+fmt(value);
    if(changed.length===1) {
      const index=changed[0],delta=current.values[index]-anchor.values[index];
      $("move-title").textContent="Reading "+(index+1)+" moved "+signed(delta)+".";
      $("move-detail").textContent="From the anchor: mean "+signed(stats.mean-before.mean)+" (one fifth of that reading's move); median "+signed(stats.median-before.median)+"."+(targetChanged?" The target also moved "+signed(current.target-anchor.target)+".":"");
    } else if(changed.length>1) {
      $("move-title").textContent=changed.length+" readings moved from the anchor.";
      $("move-detail").textContent="Mean "+signed(stats.mean-before.mean)+"; median "+signed(stats.median-before.median)+". The mean uses every reading; the median follows the middle sorted value.";
    } else if(targetChanged) {
      $("move-title").textContent="The target moved "+signed(current.target-anchor.target)+".";
      $("move-detail").textContent="The mean and median stayed put; only their distances to the chosen target changed.";
    } else {
      $("move-title").textContent="Move any reading.";
      $("move-detail").textContent="Compare the new arrangement with the anchored starting case.";
    }
    controls.forEach(({item,range,exact},index)=>{
      const value=index===5?current.target:current.values[index];
      item.className="control-item"+(index===5?" target":index===selected?" selected":"");
      range.value=fmt(value);
      if(document.activeElement!==exact||valid(exact.value)!==null) exact.value=fmt(value);
    });
    for(const button of document.querySelectorAll(".preset")) button.setAttribute("aria-pressed",String(button.dataset.case===current.key));
    const values=current.values.map(fmt).join(","),target=fmt(current.target);
    $("challenge-link").href="challenge.html?values="+encodeURIComponent(values)+"&target="+target;
    $("levers-link").href="flip-levers.html?values="+encodeURIComponent(values)+"&target="+target;
    $("field-link").href="decision-field.html?fixed="+encodeURIComponent(current.values.slice(0,4).map(fmt).join(","))+"&fifth="+fmt(current.values[4])+"&target="+target;
    $("workbench-link").href="index.html?dataset="+encodeURIComponent(values)+"&target="+target+"#workbench-title";
    $("open-view").href=viewUrl();
    draw();updateAddress();
  }
  function setValue(index,raw) {
    const value=valid(String(raw));
    if(value===null) {$("input-error").textContent="Use 0 to 100 with at most four decimal places.";return;}
    $("input-error").textContent="";
    if(index===5) current.target=value;
    else {selected=index;current.values[index]=value;}
    current.key=undefined;current.label="Your arrangement";
    $("share-status").textContent="";
    render();
  }
  function load(data,key) {
    starting={...clone(data),key};
    current=clone(starting);anchor=clone(starting);selected=4;
    $("input-error").textContent="";$("share-status").textContent="";
    render();
  }
  function dragValue(event) {
    const bounds=$("plot").getBoundingClientRect();
    const px=(event.clientX-bounds.left)/bounds.width*1000;
    const value=Math.round(Math.max(0,Math.min(100,(px-90)/8.1))*10)/10;
    setValue(dragging,value);
  }
  $("plot").addEventListener("pointerdown",event=>{
    const reading=event.target.closest("[data-reading]"),target=event.target.closest("[data-target]");
    if(!reading&&!target) return;
    event.preventDefault();
    dragging=target?5:Number(reading.getAttribute("data-reading"));
    $("plot").setPointerCapture(event.pointerId);
    dragValue(event);
  });
  $("plot").addEventListener("pointermove",event=>{if(dragging!==null) dragValue(event);});
  for(const type of ["pointerup","pointercancel","lostpointercapture"]) $("plot").addEventListener(type,()=>{dragging=null;});
  $("anchor").addEventListener("click",()=>{anchor=clone(current);render();$("share-status").textContent="Current arrangement anchored for comparison.";});
  $("reset").addEventListener("click",()=>{current=clone(starting);anchor=clone(starting);selected=4;render();});
  for(const button of document.querySelectorAll(".preset")) button.addEventListener("click",()=>load(PRESETS[button.dataset.case],button.dataset.case));
  $("copy-view").addEventListener("click",async()=>{
    try {await navigator.clipboard.writeText(new URL(viewUrl(),window.location.href).href);$("share-status").textContent="Exact view copied. Paste it into a message.";}
    catch (_) {$("share-status").textContent="Copy unavailable here. Open the exact view and copy its address.";}
  });
  drawStatic();makeControls();render();
})();
