/* Target Lens is a self-contained, local teaching instrument. */
(() => {
  "use strict";

  const PRESETS = {
    a:{values:[48,49,50,51,85],target:50,label:"Case A"},
    b:{values:[40,42,50,60,68],target:52,label:"Case B"},
    c:{values:[0,0,50,100,100],target:50,label:"Case C"}
  };
  const readingPattern=/^(?:0|[1-9]\d?|100)(?:\.\d{1,4})?$/;
  const targetPattern=/^(?:0|[1-9]\d?|100)(?:\.\d{1,6})?$/;
  const TARGET_SCALE=1000000;

  function validNumber(raw,pattern) {
    if(!pattern.test(raw)) return null;
    const value=Number(raw);
    return Number.isFinite(value)&&value>=0&&value<=100?value:null;
  }
  function parseView(search) {
    const params=new URLSearchParams(search);
    if(!params.has("values")&&!params.has("target")) return null;
    if(params.getAll("values").length!==1||params.getAll("target").length!==1) return false;
    const raw=params.get("values").split(",");
    if(raw.length!==5) return false;
    const values=raw.map(part=>validNumber(part,readingPattern));
    const target=validNumber(params.get("target"),targetPattern);
    return values.some(value=>value===null)||target===null?false:{values,target,label:"Shared case"};
  }
  function estimateUnits(values) {
    const readings=values.map(value=>Math.round(value*10000));
    const sorted=[...readings].sort((a,b)=>a-b);
    // The mean and median are exact on the six-decimal target grid.
    return {meanUnits:readings.reduce((sum,value)=>sum+value,0)*20,medianUnits:sorted[2]*100};
  }
  function evaluate(values,target) {
    const {meanUnits,medianUnits}=estimateUnits(values),targetUnits=Math.round(target*TARGET_SCALE);
    const meanErrorUnits=Math.abs(meanUnits-targetUnits),medianErrorUnits=Math.abs(medianUnits-targetUnits);
    const sameEstimate=meanUnits===medianUnits;
    return {mean:meanUnits/TARGET_SCALE,median:medianUnits/TARGET_SCALE,
      boundary:(meanUnits+medianUnits)/(2*TARGET_SCALE),
      meanError:meanErrorUnits/TARGET_SCALE,medianError:medianErrorUnits/TARGET_SCALE,
      winner:meanErrorUnits===medianErrorUnits?"Equal":meanErrorUnits<medianErrorUnits?"Mean":"Median",
      sameEstimate,estimateGap:(meanUnits-medianUnits)/TARGET_SCALE,
      referenceGap:(meanUnits+medianUnits-2*targetUnits)/TARGET_SCALE};
  }
  function targetWitnesses(values) {
    const {meanUnits,medianUnits}=estimateUnits(values);
    if(meanUnits===medianUnits) return {sameEstimate:true,estimate:meanUnits/TARGET_SCALE,targets:[]};
    const midpointUnits=(meanUnits+medianUnits)/2;
    const targets=[meanUnits,midpointUnits,medianUnits].sort((a,b)=>a-b).map(targetUnits=>{
      const target=targetUnits/TARGET_SCALE;
      return {target,...evaluate(values,target)};
    });
    return {sameEstimate:false,targets};
  }

  if(typeof module==="object"&&module.exports) module.exports={PRESETS,parseView,evaluate,targetWitnesses};
  if(typeof document==="undefined") return;

  const $=id=>document.getElementById(id);
  const fmt=value=>String(Number(value.toFixed(6)));
  const x=value=>58+value*7.12;
  const y=error=>220-error*1.9;
  let current={...PRESETS.a,values:[...PRESETS.a.values],key:"a"};
  let witnesses=targetWitnesses(current.values);
  const supplied=parseView(window.location.search);
  if(supplied) current=supplied;
  if(supplied===false) $("input-error").textContent="That shared view is invalid. Case A is loaded instead.";

  function viewUrl() {
    return "target-lens.html?values="+encodeURIComponent(current.values.map(fmt).join(","))+"&target="+fmt(current.target);
  }
  function updateAddress() {
    try { window.history.replaceState(null,"",viewUrl()); } catch (_) { /* Local file views still work. */ }
  }
  function render() {
    const result=evaluate(current.values,current.target);
    const {mean,median,boundary,meanError,medianError,winner,sameEstimate}=result;
    witnesses=targetWitnesses(current.values);
    $("case-label").textContent=current.label;
    [...$("readings").children].forEach((item,index)=>{item.textContent=fmt(current.values[index]);});
    $("target-range").value=fmt(current.target);
    $("target-input").value=fmt(current.target);
    $("hero-target").textContent=fmt(current.target);
    $("verdict-card").dataset.winner=winner;
    $("verdict").textContent=winner==="Equal"?"Equal absolute error.":winner+" is closer.";
    $("verdict-detail").textContent=winner==="Equal"
      ?(sameEstimate?"Both estimates are "+fmt(mean)+", so every target ties.":"Each estimate is "+fmt(meanError)+" away from this target.")
      :"The "+winner.toLowerCase()+" is closer by "+fmt(Math.abs(meanError-medianError))+".";
    $("mean-readout").textContent=fmt(mean)+" / "+fmt(meanError);
    $("median-readout").textContent=fmt(median)+" / "+fmt(medianError);
    $("boundary-readout").textContent=sameEstimate?"Every target":fmt(boundary);
    $("formula-equation").textContent="("+fmt(mean)+" + "+fmt(median)+") ÷ 2 = "+fmt(boundary);

    const left=sameEstimate?"Equal":evaluate(current.values,0).winner;
    const right=sameEstimate?"Equal":evaluate(current.values,100).winner;
    const leftRegion=$("left-region"),rightRegion=$("right-region"),decision=$("decision");
    decision.style.setProperty("--break",boundary+"%");
    decision.style.setProperty("--target",current.target+"%");
    leftRegion.className="region "+left.toLowerCase();
    leftRegion.textContent=left==="Equal"?"Every target ties":left+" closer";
    rightRegion.className="region "+right.toLowerCase();
    rightRegion.textContent=right+" closer";
    rightRegion.hidden=sameEstimate;
    $("tie-line").hidden=sameEstimate;
    $("tie-label").hidden=sameEstimate;
    $("tie-label").textContent="Exact tie "+fmt(boundary);
    $("map-summary").textContent=sameEstimate
      ?"Mean and median coincide. Changing the target cannot separate their errors."
      :left+" is closer below "+fmt(boundary)+"; "+right+" is closer above it. Exactly at "+fmt(boundary)+", they tie.";
    $("jump-tie").disabled=sameEstimate;
    $("jump-tie").textContent=sameEstimate?"Every target ties":"Jump to exact tie";
    document.querySelectorAll(".preset").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.case===current.key)));

    function errorPath(estimate) {
      return "M "+x(0)+" "+y(estimate)+" L "+x(estimate)+" "+y(0)+" L "+x(100)+" "+y(100-estimate);
    }
    $("mean-path").setAttribute("d",errorPath(mean));
    $("median-path").setAttribute("d",errorPath(median));
    $("cursor-line").setAttribute("x1",x(current.target));
    $("cursor-line").setAttribute("x2",x(current.target));
    $("mean-dot").setAttribute("cx",x(current.target));
    $("mean-dot").setAttribute("cy",y(meanError));
    $("median-dot").setAttribute("cx",x(current.target));
    $("median-dot").setAttribute("cy",y(medianError));
    $("error-plot").setAttribute("aria-label","Mean "+fmt(mean)+" has absolute error "+fmt(meanError)+
      "; median "+fmt(median)+" has absolute error "+fmt(medianError)+" against hypothetical target "+fmt(current.target)+
      ". "+(sameEstimate?"Both estimates coincide.":"They tie at target "+fmt(boundary)+"."));

    $("witness-title").textContent=sameEstimate?"One estimate. Every target ties.":"Three targets. Three exact verdicts.";
    $("witness-intro").textContent=sameEstimate
      ?"Mean and median both equal "+fmt(mean)+". No target in 0–100 can favor one over the other while the readings stay fixed."
      :"The readings stay fixed. Set the target exactly at either estimate to make it win, or at their midpoint to force a tie.";
    $("witness-grid").hidden=sameEstimate;
    $("witness-all-tie").hidden=!sameEstimate;
    if(sameEstimate) $("witness-all-tie").textContent="For every target t, |"+fmt(mean)+" − t| = |"+fmt(median)+" − t|. Even moving the reference to 0 or 100 preserves the tie.";
    else witnesses.targets.forEach((step,index)=>{
      const button=$("witness-"+index);
      button.dataset.winner=step.winner;
      button.setAttribute("aria-pressed",String(Math.round(current.target*TARGET_SCALE)===Math.round(step.target*TARGET_SCALE)));
      button.setAttribute("aria-label","Set hypothetical target to "+fmt(step.target)+" for "+(step.winner==="Equal"?"an exact tie":step.winner.toLowerCase()+" closer"));
      button.querySelector("small").textContent=step.winner==="Equal"?"Exact midpoint tie":step.winner+" wins at its value";
      button.querySelector("strong").textContent=fmt(step.target);
      button.querySelector("span").textContent="Mean error "+fmt(step.meanError)+" · median error "+fmt(step.medianError);
    });
    $("proof-factors").textContent=sameEstimate
      ?"Mean − median = 0, so the squared-error difference is zero for every target."
      :"At target "+fmt(current.target)+": (mean − median) = "+fmt(result.estimateGap)+
        ", and (mean + median − 2×target) = "+fmt(result.referenceGap)+
        ". Their product is "+(winner==="Equal"?"zero (a tie).":winner==="Mean"?"negative (mean closer).":"positive (median closer).");

    $("open-view").href=viewUrl();
    $("share-status").textContent="";
    updateAddress();
  }
  function setTarget(raw) {
    const parsed=validNumber(String(raw),targetPattern);
    if(parsed===null) {
      $("input-error").textContent="Enter a target from 0 to 100 with at most six decimal places.";
      return;
    }
    $("input-error").textContent="";
    current.target=parsed;
    render();
  }
  $("target-range").addEventListener("input",event=>setTarget(fmt(Number(event.target.value))));
  $("target-input").addEventListener("input",event=>setTarget(event.target.value));
  $("target-input").addEventListener("change",event=>{
    if(validNumber(event.target.value,targetPattern)===null) event.target.value=fmt(current.target);
  });
  $("jump-tie").addEventListener("click",()=>setTarget(fmt(evaluate(current.values,current.target).boundary)));
  document.querySelectorAll(".witness").forEach((button,index)=>button.addEventListener("click",()=>setTarget(fmt(witnesses.targets[index].target))));
  document.querySelectorAll(".preset").forEach(button=>button.addEventListener("click",()=>{
    const selected=button.dataset.case;
    current={...PRESETS[selected],values:[...PRESETS[selected].values],key:selected};
    $("input-error").textContent="";
    render();
  }));
  $("copy-view").addEventListener("click",async()=>{
    try {
      await navigator.clipboard.writeText(new URL(viewUrl(),window.location.href).href);
      $("share-status").textContent="Exact view copied. Paste it into a message.";
    } catch (_) {
      $("share-status").textContent="Copy unavailable here. Use Open exact view and copy its address.";
    }
  });
  render();
})();
