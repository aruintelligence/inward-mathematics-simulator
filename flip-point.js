/* Exact piecewise solution for a fifth reading, plus the local interface. */
(() => {
  "use strict";
  const PRESETS={
    a:{fixed:[48,49,50,51],fifth:85,target:50,label:"Case A / high reading"},
    b:{fixed:[40,42,50,60],fifth:68,target:52,label:"Case B / mean wins"},
    c:{fixed:[0,0,50,100],fifth:100,target:50,label:"Case C / edge tie"}
  };
  const fixedPattern=/^(?:0|[1-9]\d?|100)(?:\.\d{1,4})?$/;
  const fifthPattern=/^(?:0|[1-9]\d?|100)(?:\.\d{1,8})?$/;
  function number(raw,pattern) {
    if(!pattern.test(raw)) return null;
    const value=Number(raw);
    return Number.isFinite(value)&&value>=0&&value<=100?value:null;
  }
  function parseView(search) {
    const params=new URLSearchParams(search);
    if(!params.has("fixed")&&!params.has("fifth")&&!params.has("target")) return null;
    if(["fixed","fifth","target"].some(key=>params.getAll(key).length!==1)) return false;
    const parts=params.get("fixed").split(",");
    if(parts.length!==4) return false;
    const fixed=parts.map(part=>number(part,fixedPattern));
    const fifth=number(params.get("fifth"),fifthPattern);
    const target=number(params.get("target"),fixedPattern);
    return fixed.some(value=>value===null)||fifth===null||target===null?false:{fixed,fifth,target,label:"Shared experiment"};
  }
  function evaluate(fixed,target,fifth) {
    const sorted=[...fixed].sort((a,b)=>a-b);
    const mean=(fixed.reduce((sum,value)=>sum+value,0)+fifth)/5;
    const median=Math.max(sorted[1],Math.min(sorted[2],fifth));
    const meanError=Math.abs(mean-target),medianError=Math.abs(median-target);
    const winner=Math.abs(meanError-medianError)<1e-8?"Equal":meanError<medianError?"Mean":"Median";
    return {mean,median,meanError,medianError,winner};
  }
  function solve(fixed,target) {
    const sorted=[...fixed].sort((a,b)=>a-b);
    const intercept=fixed.reduce((sum,value)=>sum+value,0)/5;
    const pieces=[0,sorted[1],sorted[2],100];
    const roots=[];
    for(let i=0;i<pieces.length-1;i++) {
      const low=pieces[i],high=pieces[i+1];
      if(high-low<1e-10) continue;
      const mid=(low+high)/2;
      const slope=mid>sorted[1]&&mid<sorted[2]?1:0;
      const base=slope===1?0:mid<sorted[1]?sorted[1]:sorted[2];
      // |mean-target| = |median-target| has two branches:
      // mean = median, or mean + median = 2*target.
      for(const root of [(base-intercept)/(.2-slope),(2*target-intercept-base)/(.2+slope)]) {
        if(root>=low-1e-8&&root<=high+1e-8&&root>=-1e-8&&root<=100+1e-8)
          roots.push(Math.max(0,Math.min(100,root)));
      }
    }
    roots.sort((a,b)=>a-b);
    const unique=roots.filter((root,index)=>index===0||Math.abs(root-roots[index-1])>1e-7);
    const positions=[0,...unique.filter(root=>root>1e-8&&root<100-1e-8),100];
    const regions=[];
    for(let i=0;i<positions.length-1;i++) {
      if(positions[i+1]-positions[i]<1e-8) continue;
      regions.push({from:positions[i],to:positions[i+1],winner:evaluate(fixed,target,(positions[i]+positions[i+1])/2).winner});
    }
    const boundaries=unique.map(value=>{
      const left=regions.find(region=>Math.abs(region.to-value)<1e-7)?.winner??null;
      const right=regions.find(region=>Math.abs(region.from-value)<1e-7)?.winner??null;
      return {value,left,right,reversal:!!left&&!!right&&left!==right};
    });
    return {regions,boundaries};
  }
  function nearestReversal(solution,fifth) {
    return solution.boundaries.filter(item=>item.reversal)
      .sort((a,b)=>{
        const difference=Math.abs(a.value-fifth)-Math.abs(b.value-fifth);
        return Math.abs(difference)<1e-8?a.value-b.value:difference;
      })[0]??null;
  }

  if(typeof module==="object"&&module.exports) module.exports={PRESETS,parseView,evaluate,solve,nearestReversal};
  if(typeof document==="undefined") return;

  const $=id=>document.getElementById(id);
  const fmt=value=>String(Number(value.toFixed(8)));
  const approximate=value=>Math.abs(value-Number(value.toFixed(8)))>1e-10?"≈"+fmt(value):fmt(value);
  const x=value=>58+value*7.12;
  let chartCeiling=100;
  const y=error=>220-error*190/chartCeiling;
  let current={...PRESETS.b,fixed:[...PRESETS.b.fixed],key:"b"};
  const shared=parseView(window.location.search);
  if(shared) current=shared;
  if(shared===false) $("input-error").textContent="That shared experiment is invalid. Case B is loaded instead.";

  function viewUrl() {
    return "flip-point.html?fixed="+encodeURIComponent(current.fixed.map(fmt).join(","))+
      "&fifth="+fmt(current.fifth)+"&target="+fmt(current.target);
  }
  function updateAddress() {
    try {window.history.replaceState(null,"",viewUrl());} catch (_) { /* Local files remain usable. */ }
  }
  function chartPath(estimateAt) {
    const fixed=current.fixed,sorted=[...fixed].sort((a,b)=>a-b);
    const sum=fixed.reduce((total,value)=>total+value,0);
    const pivots=[0,sorted[1],sorted[2],100,5*current.target-sum];
    if(current.target>=sorted[1]&&current.target<=sorted[2]) pivots.push(current.target);
    const points=pivots.filter(value=>value>=0&&value<=100).sort((a,b)=>a-b)
      .filter((value,index,array)=>index===0||value-array[index-1]>1e-8);
    return points.map((value,index)=>(index?"L ":"M ")+x(value)+" "+y(Math.abs(estimateAt(value)-current.target))).join(" ");
  }
  function drawChart(result) {
    const fixed=current.fixed,sorted=[...fixed].sort((a,b)=>a-b),sum=fixed.reduce((a,b)=>a+b,0);
    const anchors=[0,sorted[1],sorted[2],100];
    const largest=Math.max(...anchors.flatMap(value=>[
      Math.abs((sum+value)/5-current.target),
      Math.abs(Math.max(sorted[1],Math.min(sorted[2],value))-current.target)
    ]));
    chartCeiling=Math.max(5,Math.ceil(largest/5)*5);
    $("error-maximum").textContent=fmt(chartCeiling);
    $("error-midpoint").textContent=fmt(chartCeiling/2);
    $("mean-path").setAttribute("d",chartPath(value=>(sum+value)/5));
    $("median-path").setAttribute("d",chartPath(value=>Math.max(sorted[1],Math.min(sorted[2],value))));
    $("cursor-line").setAttribute("x1",x(current.fifth));
    $("cursor-line").setAttribute("x2",x(current.fifth));
    $("mean-dot").setAttribute("cx",x(current.fifth));
    $("mean-dot").setAttribute("cy",y(result.meanError));
    $("median-dot").setAttribute("cx",x(current.fifth));
    $("median-dot").setAttribute("cy",y(result.medianError));
    $("error-plot").setAttribute("aria-label","At fifth reading "+fmt(current.fifth)+", mean "+fmt(result.mean)+
      " has error "+fmt(result.meanError)+" and median "+fmt(result.median)+" has error "+fmt(result.medianError)+
      " against target "+fmt(current.target)+".");
  }
  function render() {
    const result=evaluate(current.fixed,current.target,current.fifth);
    const solution=solve(current.fixed,current.target);
    const nearest=nearestReversal(solution,current.fifth);
    $("case-label").textContent=current.label;
    [...$("fixed-readings").children].slice(0,4).forEach((item,index)=>{item.textContent=fmt(current.fixed[index]);});
    $("fifth-display").textContent=fmt(current.fifth);
    $("target-display").textContent=fmt(current.target);
    $("fifth-range").value=fmt(current.fifth);
    $("fifth-input").value=fmt(current.fifth);
    $("verdict-card").dataset.winner=result.winner;
    $("verdict").textContent=result.winner==="Equal"?"Both estimates tie.":result.winner+" is closer.";
    $("verdict-detail").textContent="Mean error "+fmt(result.meanError)+" · median error "+fmt(result.medianError)+".";
    $("mean-readout").textContent=fmt(result.mean)+" / "+fmt(result.meanError);
    $("median-readout").textContent=fmt(result.median)+" / "+fmt(result.medianError);
    const sorted=[...current.fixed].sort((a,b)=>a-b);
    $("median-rule").textContent="median = clamp(fifth reading, "+fmt(sorted[1])+", "+fmt(sorted[2])+")";
    $("mean-rule").textContent="mean = ("+current.fixed.map(fmt).join(" + ")+" + fifth reading) ÷ 5";
    const summary=nearest
      ?Math.abs(nearest.value-current.fifth)<1e-8
        ?"You are on a reversal boundary at "+approximate(nearest.value)+". Step across to change the winner."
        :"Move "+fmt(Math.abs(nearest.value-current.fifth))+" to reach the nearest reversal boundary at "+approximate(nearest.value)+". Step across it to change the winner."
      :"No winner reversal occurs while the fifth reading stays from 0 to 100.";
    $("distance-display").textContent=nearest?fmt(Math.abs(nearest.value-current.fifth)):"—";
    $("distance-caption").textContent=nearest?"to nearest reversal boundary":"no reversal in 0–100";
    $("nearest-summary").textContent=summary;
    $("jump-boundary").disabled=!nearest;
    $("cross-boundary").disabled=!nearest;
    $("jump-boundary").textContent=nearest?"Jump to "+approximate(nearest.value):"No reversal boundary";

    const map=$("decision-map");
    map.replaceChildren();
    for(const region of solution.regions) {
      const band=document.createElement("span");
      band.className="band "+region.winner.toLowerCase();
      band.style.left=region.from+"%";
      band.style.width=(region.to-region.from)+"%";
      band.title=region.winner+" closer: "+approximate(region.from)+" to "+approximate(region.to);
      map.append(band);
    }
    for(const boundary of solution.boundaries) {
      const tick=document.createElement("span");
      tick.className="boundary"+(boundary.reversal?" flip":" touch");
      tick.style.left=boundary.value+"%";
      tick.title=(boundary.reversal?"Reversal":"Tie without reversal")+" at "+approximate(boundary.value);
      map.append(tick);
    }
    const marker=document.createElement("span");
    marker.className="current-marker";
    marker.style.left=current.fifth+"%";
    map.append(marker);
    $("boundary-list").textContent=solution.boundaries.length
      ?solution.boundaries.map(item=>approximate(item.value)+" "+(item.reversal?"reversal":"tie without reversal")).join(" · ")
      :"No ties occur within the 0–100 range.";
    map.setAttribute("aria-label","From fifth reading 0 to 100: "+solution.regions.map(item=>item.winner+" closer from "+approximate(item.from)+" to "+approximate(item.to)).join("; ")+". "+$("boundary-list").textContent);
    drawChart(result);
    document.querySelectorAll(".preset").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.case===current.key)));
    $("open-view").href=viewUrl();
    $("share-status").textContent="";
    updateAddress();
  }
  function setFifth(raw) {
    const parsed=number(String(raw),fifthPattern);
    if(parsed===null) {$("input-error").textContent="Use a fifth reading from 0 to 100 with at most eight decimal places.";return;}
    $("input-error").textContent="";
    current.fifth=parsed;
    render();
  }
  $("fifth-range").addEventListener("input",event=>setFifth(fmt(Number(event.target.value))));
  $("fifth-input").addEventListener("input",event=>setFifth(event.target.value));
  $("fifth-input").addEventListener("change",event=>{
    if(number(event.target.value,fifthPattern)===null) event.target.value=fmt(current.fifth);
  });
  $("jump-boundary").addEventListener("click",()=>{
    const nearest=nearestReversal(solve(current.fixed,current.target),current.fifth);
    if(nearest) setFifth(fmt(nearest.value));
  });
  $("cross-boundary").addEventListener("click",()=>{
    const solution=solve(current.fixed,current.target);
    const nearest=nearestReversal(solution,current.fifth);
    if(!nearest) return;
    const direction=current.fifth<nearest.value?1:current.fifth>nearest.value?-1:1;
    const neighbor=solution.boundaries.filter(item=>direction===1?item.value>nearest.value:item.value<nearest.value)
      .sort((a,b)=>direction*(a.value-b.value))[0]?.value??(direction===1?100:0);
    const step=Math.min(.1,Math.abs(neighbor-nearest.value)/2);
    setFifth(fmt(nearest.value+direction*step));
  });
  document.querySelectorAll(".preset").forEach(button=>button.addEventListener("click",()=>{
    const key=button.dataset.case;
    current={...PRESETS[key],fixed:[...PRESETS[key].fixed],key};
    $("input-error").textContent="";
    render();
  }));
  $("copy-view").addEventListener("click",async()=>{
    try {
      await navigator.clipboard.writeText(new URL(viewUrl(),window.location.href).href);
      $("share-status").textContent="Exact experiment copied. Paste it into a message.";
    } catch (_) {
      $("share-status").textContent="Copy unavailable here. Open the exact view and copy its address.";
    }
  });
  render();
})();
