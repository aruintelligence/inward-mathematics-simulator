/* Exact mean/median decision regions for four fixed readings and two moving axes. */
(() => {
  "use strict";
  const PRESETS={
    a:{fixed:[48,49,50,51],fifth:85,target:50,label:"A / high fifth reading"},
    b:{fixed:[40,42,50,60],fifth:68,target:52,label:"B / four target-specific reversals"},
    c:{fixed:[0,0,50,100],fifth:100,target:50,label:"C / edge tie"}
  };
  const fourPlaces=/^(?:0|[1-9]\d?|100)(?:\.\d{1,4})?$/;
  const eightPlaces=/^(?:0|[1-9]\d?|100)(?:\.\d{1,8})?$/;
  const ninePlaces=/^(?:0|[1-9]\d?|100)(?:\.\d{1,9})?$/;
  function number(raw,pattern) {
    if(!pattern.test(raw)) return null;
    const value=Number(raw);
    return Number.isFinite(value)&&value>=0&&value<=100?value:null;
  }
  function parseView(search) {
    const p=new URLSearchParams(search);
    if(!["fixed","fifth","target"].some(key=>p.has(key))) return null;
    if(["fixed","fifth","target"].some(key=>p.getAll(key).length!==1)) return false;
    const parts=p.get("fixed").split(",");
    if(parts.length!==4) return false;
    const fixed=parts.map(value=>number(value,fourPlaces));
    const fifth=number(p.get("fifth"),eightPlaces),target=number(p.get("target"),ninePlaces);
    return fixed.some(value=>value===null)||fifth===null||target===null?false:{fixed,fifth,target,label:"Shared experiment"};
  }
  function estimates(fixed,fifth) {
    const sorted=[...fixed].sort((a,b)=>a-b);
    return {mean:(fixed.reduce((a,b)=>a+b,0)+fifth)/5,median:Math.max(sorted[1],Math.min(sorted[2],fifth))};
  }
  function evaluate(fixed,fifth,target) {
    const {mean,median}=estimates(fixed,fifth);
    const meanError=Math.abs(mean-target),medianError=Math.abs(median-target);
    return {mean,median,meanError,medianError,midpoint:(mean+median)/2,
      winner:Math.abs(meanError-medianError)<1e-10?"Equal":meanError<medianError?"Mean":"Median"};
  }
  function geometry(fixed) {
    const sorted=[...fixed].sort((a,b)=>a-b),sum=fixed.reduce((a,b)=>a+b,0);
    const raw=[0,sorted[1],sorted[2],100];
    // On the lower plateau, moving middle, and upper plateau respectively,
    // solve mean(fifth) = median(fifth). These whole-row ties are not merely
    // the midpoint frontier that appears for distinct estimators.
    for(const value of [5*sorted[1]-sum,sum/4,5*sorted[2]-sum]) {
      if(value>=0&&value<=100) {
        const median=Math.max(sorted[1],Math.min(sorted[2],value));
        if(Math.abs((sum+value)/5-median)<1e-8) raw.push(value);
      }
    }
    raw.sort((a,b)=>a-b);
    const cuts=raw.filter((value,index)=>index===0||Math.abs(value-raw[index-1])>1e-8);
    const equalLines=cuts.filter(value=>Math.abs(estimates(fixed,value).mean-estimates(fixed,value).median)<1e-8);
    const regions=[];
    for(let i=0;i<cuts.length-1;i++) {
      const from=cuts[i],to=cuts[i+1];
      if(to-from<1e-8) continue;
      const e=estimates(fixed,(from+to)/2);
      regions.push({from,to,left:e.mean<e.median?"Mean":"Median",right:e.mean<e.median?"Median":"Mean",
        start:(estimates(fixed,from).mean+estimates(fixed,from).median)/2,
        end:(estimates(fixed,to).mean+estimates(fixed,to).median)/2});
    }
    return {cuts,equalLines,regions};
  }
  function nearestEquality(lines,fifth) {
    return [...lines].sort((a,b)=>{
      const difference=Math.abs(a-fifth)-Math.abs(b-fifth);
      return Math.abs(difference)<1e-8?a-b:difference;
    })[0]??null;
  }
  if(typeof module==="object"&&module.exports) module.exports={PRESETS,parseView,estimates,evaluate,geometry,nearestEquality};
  if(typeof document==="undefined") return;

  const $=id=>document.getElementById(id),ns="http://www.w3.org/2000/svg";
  const fmt=value=>String(Number(value.toFixed(9)));
  const x=target=>62+target*6.5,y=fifth=>490-fifth*4.45;
  const shared=parseView(window.location.search);
  let current=shared||{...PRESETS.b,fixed:[...PRESETS.b.fixed],key:"b"};
  if(shared===false) {
    current={...PRESETS.b,fixed:[...PRESETS.b.fixed],key:"b"};
    $("input-error").textContent="That shared experiment is invalid. Case B is loaded instead.";
  }
  let mapGeometry=geometry(current.fixed),dragging=false;
  function svgElement(tag,attributes) {
    const el=document.createElementNS(ns,tag);
    for(const [key,value] of Object.entries(attributes)) el.setAttribute(key,String(value));
    return el;
  }
  function polygon(points) {return "M "+points.map(point=>point[0]+" "+point[1]).join(" L ")+" Z";}
  function drawField() {
    mapGeometry=geometry(current.fixed);
    const regions=$("regions"),lines=$("equal-lines");
    regions.replaceChildren();lines.replaceChildren();
    for(const band of mapGeometry.regions) {
      const top=y(band.to),bottom=y(band.from),topMid=x(band.end),bottomMid=x(band.start);
      regions.append(svgElement("path",{class:"field-region "+band.left.toLowerCase(),d:polygon([[62,top],[topMid,top],[bottomMid,bottom],[62,bottom]])}));
      regions.append(svgElement("path",{class:"field-region "+band.right.toLowerCase(),d:polygon([[topMid,top],[712,top],[712,bottom],[bottomMid,bottom]])}));
    }
    const turns=[0,...[...current.fixed].sort((a,b)=>a-b).slice(1,3),100]
      .filter((value,index,array)=>index===0||Math.abs(value-array[index-1])>1e-8);
    $("frontier").setAttribute("d",turns.map((value,index)=>(index?"L ":"M ")+x(evaluate(current.fixed,value,0).midpoint)+" "+y(value)).join(" "));
    for(const value of mapGeometry.equalLines) {
      lines.append(svgElement("line",{x1:62,x2:712,y1:y(value),y2:y(value),class:"equal-line"}));
    }
    $("equality-count").textContent=String(mapGeometry.equalLines.length);
    $("equality-list").textContent=mapGeometry.equalLines.length
      ?mapGeometry.equalLines.map(fmt).join(" · ")
      :"None within 0–100";
    const sorted=[...current.fixed].sort((a,b)=>a-b);
    $("rule-mean").textContent="mean = ("+current.fixed.map(fmt).join(" + ")+" + moving reading) ÷ 5";
    $("rule-median").textContent="median = clamp(moving reading, "+fmt(sorted[1])+", "+fmt(sorted[2])+")";
    $("decision-field").setAttribute("aria-label","Exact decision field. Horizontal axis target 0 to 100; vertical axis fifth reading 0 to 100. White curve marks a target-specific tie; dashed cyan horizontal lines mark readings where both estimates agree for every target. Equal-estimate readings: "+$("equality-list").textContent+". Use the labeled controls for exact numbers.");
  }
  function viewUrl() {
    return "decision-field.html?fixed="+encodeURIComponent(current.fixed.map(fmt).join(","))+"&fifth="+fmt(current.fifth)+"&target="+fmt(current.target);
  }
  function render() {
    const result=evaluate(current.fixed,current.fifth,current.target),nearest=nearestEquality(mapGeometry.equalLines,current.fifth);
    $("case-label").textContent=current.label;
    [...$("fixed-readings").children].slice(0,4).forEach((item,index)=>{item.textContent=fmt(current.fixed[index]);});
    $("fifth-display").textContent=fmt(current.fifth);
    $("moving-value-label").textContent=fmt(current.fifth);
    $("target-display").textContent=fmt(current.target);
    $("fifth-range").value=fmt(current.fifth);
    $("target-range").value=fmt(current.target);
    $("fifth-input").value=fmt(current.fifth);
    $("target-input").value=fmt(current.target);
    $("winner-card").dataset.winner=result.winner;
    $("winner").textContent=result.winner==="Equal"?"A tie.":result.winner+" is closer.";
    $("winner-detail").textContent="Mean "+fmt(result.mean)+" (error "+fmt(result.meanError)+") · median "+fmt(result.median)+" (error "+fmt(result.medianError)+").";
    $("tie-target").textContent=fmt(result.midpoint);
    $("mean-readout").textContent=fmt(result.mean)+" / "+fmt(result.meanError);
    $("median-readout").textContent=fmt(result.median)+" / "+fmt(result.medianError);
    $("crosshair-x").setAttribute("x1",x(current.target));$("crosshair-x").setAttribute("x2",x(current.target));
    $("crosshair-y").setAttribute("y1",y(current.fifth));$("crosshair-y").setAttribute("y2",y(current.fifth));
    $("cursor-dot").setAttribute("cx",x(current.target));$("cursor-dot").setAttribute("cy",y(current.fifth));
    $("cursor-label").textContent="Target "+fmt(current.target)+" · fifth "+fmt(current.fifth)+" · "+(result.winner==="Equal"?"tie":result.winner+" closer");
    $("snap-equality").disabled=nearest===null;
    $("snap-equality").textContent=nearest===null?"No equal-estimate reading":"Jump to all-target tie at "+fmt(nearest);
    $("open-view").href=viewUrl();
    document.querySelectorAll(".preset").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.case===current.key)));
    $("share-status").textContent="";
    try {window.history.replaceState(null,"",viewUrl());} catch (_) { /* Local files still work. */ }
  }
  function update(axis,raw) {
    const parsed=number(String(raw),axis==="fifth"?eightPlaces:ninePlaces);
    if(parsed===null) {$("input-error").textContent="Use values from 0 to 100. Target allows nine decimal places; fifth reading allows eight.";return;}
    $("input-error").textContent="";
    current[axis]=parsed;
    render();
  }
  for(const axis of ["fifth","target"]) {
    $(axis+"-range").addEventListener("input",event=>update(axis,fmt(Number(event.target.value))));
    $(axis+"-input").addEventListener("input",event=>update(axis,event.target.value));
    $(axis+"-input").addEventListener("change",event=>{
      if(number(event.target.value,axis==="fifth"?eightPlaces:ninePlaces)===null) event.target.value=fmt(current[axis]);
    });
  }
  $("snap-frontier").addEventListener("click",()=>update("target",fmt(evaluate(current.fixed,current.fifth,current.target).midpoint)));
  $("snap-equality").addEventListener("click",()=>{
    const value=nearestEquality(mapGeometry.equalLines,current.fifth);
    if(value!==null) update("fifth",fmt(value));
  });
  document.querySelectorAll(".preset").forEach(button=>button.addEventListener("click",()=>{
    const key=button.dataset.case;
    current={...PRESETS[key],fixed:[...PRESETS[key].fixed],key};
    $("input-error").textContent="";
    drawField();render();
  }));
  function pointFromPointer(event) {
    const rect=$("decision-field").getBoundingClientRect();
    const px=(event.clientX-rect.left)*760/rect.width,py=(event.clientY-rect.top)*540/rect.height;
    return {target:Math.max(0,Math.min(100,(px-62)/6.5)),fifth:Math.max(0,Math.min(100,(490-py)/4.45))};
  }
  $("decision-field").addEventListener("pointerdown",event=>{
    const rect=$("decision-field").getBoundingClientRect();
    const px=(event.clientX-rect.left)*760/rect.width,py=(event.clientY-rect.top)*540/rect.height;
    if(px<62||px>712||py<45||py>490) return;
    dragging=true;$("decision-field").setPointerCapture(event.pointerId);
    const point=pointFromPointer(event);
    current.target=Number(point.target.toFixed(4));current.fifth=Number(point.fifth.toFixed(8));render();
  });
  $("decision-field").addEventListener("pointermove",event=>{
    if(!dragging) return;
    const point=pointFromPointer(event);
    current.target=Number(point.target.toFixed(4));current.fifth=Number(point.fifth.toFixed(8));render();
  });
  $("decision-field").addEventListener("pointerup",()=>{dragging=false;});
  $("decision-field").addEventListener("pointercancel",()=>{dragging=false;});
  $("copy-view").addEventListener("click",async()=>{
    try {
      await navigator.clipboard.writeText(new URL(viewUrl(),window.location.href).href);
      $("share-status").textContent="Exact field view copied. Paste it into a message.";
    } catch (_) {$("share-status").textContent="Copy unavailable here. Open the exact view and copy its address.";}
  });
  drawField();render();
})();
