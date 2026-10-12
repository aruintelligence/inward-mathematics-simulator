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
  function evaluate(values,target) {
    // The URL accepts at most four decimal places per reading. Integer units
    // retain the exact mean and midpoint through the sixth decimal place.
    const units=values.map(value=>Math.round(value*10000));
    const sorted=[...units].sort((a,b)=>a-b);
    const mean=units.reduce((sum,value)=>sum+value,0)/50000;
    const median=sorted[2]/10000;
    const boundary=(mean+median)/2;
    const meanError=Math.abs(mean-target),medianError=Math.abs(median-target);
    const sameEstimate=Math.abs(mean-median)<1e-9;
    const winner=sameEstimate||Math.abs(meanError-medianError)<1e-8?"Equal":meanError<medianError?"Mean":"Median";
    return {mean,median,boundary,meanError,medianError,winner,sameEstimate};
  }

  if(typeof module==="object"&&module.exports) module.exports={PRESETS,parseView,evaluate};
  if(typeof document==="undefined") return;

  const $=id=>document.getElementById(id);
  const fmt=value=>String(Number(value.toFixed(6)));
  const x=value=>58+value*7.12;
  const y=error=>220-error*1.9;
  let current={...PRESETS.a,values:[...PRESETS.a.values],key:"a"};
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
  $("target-input").addEventListener("change",event=>{
    const prior=current.target;
    setTarget(event.target.value);
    if(current.target===prior && $("input-error").textContent) event.target.value=fmt(prior);
  });
  $("jump-tie").addEventListener("click",()=>setTarget(fmt(evaluate(current.values,current.target).boundary)));
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
