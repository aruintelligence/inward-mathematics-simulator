/* Exact piecewise reversals for each of five independently movable readings. */
(() => {
  "use strict";
  const PRESETS={
    a:{values:[48,49,50,51,85],target:50,label:"A / one high reading"},
    b:{values:[40,42,50,60,68],target:52,label:"B / mean wins"},
    c:{values:[0,0,50,100,100],target:50,label:"C / every-target tie"}
  };
  const pattern=/^(?:0|[1-9]\d?|100)(?:\.\d{1,4})?$/;
  const number=raw=>pattern.test(raw)&&Number(raw)<=100?Number(raw):null;
  const fmt=value=>String(Number(value.toFixed(4)));
  const boundaryLabel=value=>Math.abs(value-Number(value.toFixed(8)))>1e-10?"≈"+String(Number(value.toFixed(8))):fmt(value);
  function parseView(search) {
    const query=new URLSearchParams(search);
    if(!query.has("values")&&!query.has("target")) return null;
    if(query.getAll("values").length!==1||query.getAll("target").length!==1) return false;
    const parts=query.get("values").split(",");
    if(parts.length!==5) return false;
    const values=parts.map(number),target=number(query.get("target"));
    return values.some(value=>value===null)||target===null?false:{values,target,label:"Shared arrangement"};
  }
  function evaluate(values,target) {
    const units=values.map(value=>Math.round(value*10000));
    const targetUnits=Math.round(target*10000);
    const sorted=[...units].sort((a,b)=>a-b),sum=units.reduce((a,b)=>a+b,0);
    const meanErrorUnits=Math.abs(sum-5*targetUnits);
    const medianErrorUnits=Math.abs(5*sorted[2]-5*targetUnits);
    return {
      mean:sum/50000,median:sorted[2]/10000,
      meanError:meanErrorUnits/50000,medianError:medianErrorUnits/50000,
      winner:meanErrorUnits===medianErrorUnits?"Equal":meanErrorUnits<medianErrorUnits?"Mean":"Median"
    };
  }
  function solveOne(values,target,index) {
    const fixed=values.filter((_,i)=>i!==index);
    const sorted=[...fixed].sort((a,b)=>a-b),sum=fixed.reduce((a,b)=>a+b,0);
    const intercept=sum/5,pieces=[0,sorted[1],sorted[2],100],roots=[];
    for(let i=0;i<pieces.length-1;i++) {
      const low=pieces[i],high=pieces[i+1];
      if(high-low<1e-10) continue;
      const mid=(low+high)/2;
      const slope=mid>sorted[1]&&mid<sorted[2]?1:0;
      const base=slope?0:mid<sorted[1]?sorted[1]:sorted[2];
      // |mean-target| = |median-target| factors into
      // mean = median or mean + median = 2*target.
      for(const root of [(base-intercept)/(.2-slope),(2*target-intercept-base)/(.2+slope)]) {
        if(root>=low-1e-8&&root<=high+1e-8&&root>=-1e-8&&root<=100+1e-8)
          roots.push(Math.max(0,Math.min(100,root)));
      }
    }
    roots.sort((a,b)=>a-b);
    const unique=roots.filter((root,i)=>i===0||root-roots[i-1]>1e-7);
    const positions=[0,...unique.filter(root=>root>1e-8&&root<100-1e-8),100];
    const regionWinner=value=>{
      const mean=(sum+value)/5,median=Math.max(sorted[1],Math.min(sorted[2],value));
      const difference=Math.abs(mean-target)-Math.abs(median-target);
      return Math.abs(difference)<1e-10?"Equal":difference<0?"Mean":"Median";
    };
    const regions=[];
    for(let i=0;i<positions.length-1;i++) if(positions[i+1]-positions[i]>1e-8)
      regions.push({from:positions[i],to:positions[i+1],winner:regionWinner((positions[i]+positions[i+1])/2)});
    const boundaries=unique.map(value=>{
      const left=regions.find(region=>Math.abs(region.to-value)<1e-7)?.winner??null;
      const right=regions.find(region=>Math.abs(region.from-value)<1e-7)?.winner??null;
      return {value,left,right,reversal:!!left&&!!right&&left!==right&&left!=="Equal"&&right!=="Equal"};
    });
    return {regions,boundaries};
  }
  function crossingCandidate(boundary,currentWinner,values,target,index) {
    if(!boundary.reversal) return null;
    const direction=boundary.left===currentWinner?1:boundary.right===currentWinner?-1:0;
    if(!direction) return null;
    const rootUnits=boundary.value*10000;
    const nearInteger=Math.abs(rootUnits-Math.round(rootUnits))<1e-6;
    let unit=direction===1
      ?(nearInteger?Math.round(rootUnits)+1:Math.floor(rootUnits)+1)
      :(nearInteger?Math.round(rootUnits)-1:Math.ceil(rootUnits)-1);
    // The candidate is the first four-decimal reading strictly across the tie.
    for(let attempt=0;attempt<3&&unit>=0&&unit<=1000000;attempt++,unit+=direction) {
      const candidate=unit/10000,changed=[...values];changed[index]=candidate;
      if(evaluate(changed,target).winner!==currentWinner&&evaluate(changed,target).winner!=="Equal")
        return {value:candidate,boundary:boundary.value,distance:Math.abs(candidate-values[index]),winner:evaluate(changed,target).winner};
    }
    return null;
  }
  function rankLevers(values,target) {
    const current=evaluate(values,target);
    const levers=values.map((value,index)=>{
      const solution=solveOne(values,target,index);
      const possibilities=current.winner==="Equal"?[]:solution.boundaries
        .map(boundary=>crossingCandidate(boundary,current.winner,values,target,index))
        .filter(Boolean).sort((a,b)=>a.distance-b.distance||a.value-b.value);
      return {index,value,solution,flip:possibilities[0]??null};
    });
    const ranked=levers.filter(item=>item.flip).sort((a,b)=>a.flip.distance-b.flip.distance||a.index-b.index);
    return {current,levers,ranked};
  }
  const api={PRESETS,parseView,evaluate,solveOne,rankLevers};
  if(typeof module==="object"&&module.exports) module.exports=api;
  if(typeof window!=="undefined") window.InwardMathLevers=api;
  if(typeof document==="undefined"||!document.getElementById("rack")) return;

  const $=id=>document.getElementById(id);
  const shared=parseView(window.location.search);
  const clone=data=>({values:[...data.values],target:data.target,label:data.label,key:data.key});
  let starting=shared&&shared!==false?clone(shared):{...clone(PRESETS.b),key:"b"};
  let current=clone(starting);
  if(shared===false) $("input-error").textContent="That shared arrangement is invalid. Case B is loaded instead.";

  function viewUrl() {return "flip-levers.html?values="+encodeURIComponent(current.values.map(fmt).join(","))+"&target="+fmt(current.target);}
  function updateAddress() {try{window.history.replaceState(null,"",viewUrl());}catch(_){/* Local file views still work. */}}
  function render() {
    const {current:stats,levers,ranked}=rankLevers(current.values,current.target);
    $("case-label").textContent=current.label;
    $("winner-card").dataset.winner=stats.winner;
    $("winner").textContent=stats.winner==="Equal"?"Equal error.":stats.winner+" is closer.";
    $("current-detail").textContent="Mean "+fmt(stats.mean)+" (error "+fmt(stats.meanError)+") · median "+fmt(stats.median)+" (error "+fmt(stats.medianError)+") against target "+fmt(current.target)+".";
    $("best-reading").textContent=stats.winner==="Equal"?"Current tie":ranked.length?"Reading "+(ranked[0].index+1):"No flip";
    $("best-distance").textContent=stats.winner==="Equal"?"Move off the tie to create a winner.":ranked.length
      ?"Move "+fmt(ranked[0].flip.distance)+" from "+fmt(ranked[0].value)+" to "+fmt(ranked[0].flip.value)+" to make "+ranked[0].flip.winner.toLowerCase()+" closer."
      :"No single reading can reverse the winner within 0–100.";
    const rack=$("rack");rack.replaceChildren();
    const ordered=[...ranked,...levers.filter(item=>!item.flip)];
    ordered.forEach((lever,position)=>{
      const row=document.createElement("article");row.className="lever"+(position===0&&lever.flip?" best":"");
      const top=document.createElement("div");top.className="lever-head";
      const title=document.createElement("h3");title.textContent="Reading "+(lever.index+1)+" · "+fmt(lever.value);
      const amount=document.createElement("strong");amount.className="distance";
      amount.textContent=lever.flip?"Move "+fmt(lever.flip.distance):stats.winner==="Equal"?"Current tie":"No reversal";
      top.append(title,amount);
      const track=document.createElement("div");track.className="track";
      track.setAttribute("role","img");
      track.setAttribute("aria-label","Reading "+(lever.index+1)+" from 0 to 100. Current "+fmt(lever.value)+". "+lever.solution.regions.map(region=>region.winner+" closer from "+boundaryLabel(region.from)+" to "+boundaryLabel(region.to)).join("; ")+". "+(lever.flip?"First opposing winner at "+fmt(lever.flip.value)+".":"No ranked flip."));
      for(const region of lever.solution.regions) {
        const band=document.createElement("span");band.className="region "+region.winner.toLowerCase();
        band.style.left=region.from+"%";band.style.width=(region.to-region.from)+"%";
        band.title=region.winner+" closer from "+boundaryLabel(region.from)+" to "+boundaryLabel(region.to);
        track.append(band);
      }
      for(const boundary of lever.solution.boundaries) {
        const tick=document.createElement("span");tick.className="boundary"+(boundary.reversal?" reversal":" touch");tick.style.left=boundary.value+"%";
        tick.title=(boundary.reversal?"Winner reversal":"Tie without reversal")+" at "+boundaryLabel(boundary.value);track.append(tick);
      }
      const marker=document.createElement("span");marker.className="marker";marker.style.left=lever.value+"%";track.append(marker);
      if(lever.flip) {const goal=document.createElement("span");goal.className="goal";goal.style.left=lever.flip.value+"%";track.append(goal);}
      const bottom=document.createElement("div");bottom.className="lever-bottom";
      const description=document.createElement("span");description.textContent=lever.flip
        ?"Cross the tie at "+boundaryLabel(lever.flip.boundary)+"; first four-decimal value with "+lever.flip.winner.toLowerCase()+" closer is "+fmt(lever.flip.value)+"."
        :stats.winner==="Equal"?"The current result ties. Change a reading to create a winner, then rank flips.":"No true reversal in this reading's 0–100 range.";
      bottom.append(description);
      if(lever.flip) {
        const button=document.createElement("button");button.type="button";button.className="try";button.textContent="Try this flip ↗";
        button.setAttribute("aria-label","Change reading "+(lever.index+1)+" to "+fmt(lever.flip.value)+" and recalculate");
        button.addEventListener("click",()=>{current.values[lever.index]=lever.flip.value;current.key=undefined;current.label="Your arrangement";render();$("rack-title").scrollIntoView({block:"start"});});
        bottom.append(button);
      }
      row.append(top,track,bottom);rack.append(row);
    });
    $("rack-summary").textContent=stats.winner==="Equal"?"The present arrangement ties. Set a different reading or target to compare strict winners."
      :ranked.length?ranked.length+" of 5 readings can reverse this winner within 0–100 when moved alone.":"No reading can produce an opposing winner within 0–100 while the other four and target stay fixed.";
    current.values.forEach((value,index)=>{$("reading-"+(index+1)).value=fmt(value);});
    $("target-input").value=fmt(current.target);
    for(const button of document.querySelectorAll(".preset")) button.setAttribute("aria-pressed",String(button.dataset.case===current.key));
    const values=current.values.map(fmt).join(","),target=fmt(current.target);
    $("shape-link").href="shape-the-data.html?values="+encodeURIComponent(values)+"&target="+target;
    $("field-link").href="decision-field.html?fixed="+encodeURIComponent(current.values.slice(0,4).map(fmt).join(","))+"&fifth="+fmt(current.values[4])+"&target="+target;
    $("puzzle-link").hidden=ranked.length===0;
    $("puzzle-link").href="one-move.html?values="+encodeURIComponent(values)+"&target="+target;
    $("open-view").href=viewUrl();updateAddress();
  }
  function setValue(index,raw) {
    const value=number(String(raw));
    if(value===null) {$("input-error").textContent="Use 0 to 100 with at most four decimal places.";return;}
    $("input-error").textContent="";
    if(index===5) current.target=value;else current.values[index]=value;
    current.key=undefined;current.label="Your arrangement";render();
  }
  for(let index=0;index<5;index++) {
    const input=$("reading-"+(index+1));
    input.addEventListener("change",()=>setValue(index,input.value));
    input.addEventListener("blur",()=>{if(number(input.value)===null) input.value=fmt(current.values[index]);});
  }
  $("target-input").addEventListener("change",event=>setValue(5,event.target.value));
  $("target-input").addEventListener("blur",event=>{if(number(event.target.value)===null) event.target.value=fmt(current.target);});
  $("reset").addEventListener("click",()=>{current=clone(starting);$("input-error").textContent="";render();});
  for(const button of document.querySelectorAll(".preset")) button.addEventListener("click",()=>{starting={...clone(PRESETS[button.dataset.case]),key:button.dataset.case};current=clone(starting);$("input-error").textContent="";render();});
  $("copy-view").addEventListener("click",async()=>{
    try {await navigator.clipboard.writeText(new URL(viewUrl(),window.location.href).href);$("share-status").textContent="Exact lever view copied.";}
    catch (_) {$("share-status").textContent="Copy unavailable. Open the exact view and copy its address.";}
  });
  render();
})();
