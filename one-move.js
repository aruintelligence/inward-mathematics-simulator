/* A one-reading reversal puzzle, scored against the exact four-decimal solver. */
(() => {
  "use strict";
  const core=typeof module==="object"&&module.exports?require("./flip-levers.js"):window.InwardMathLevers;
  const ROUNDS=[
    {values:[40,42,50,60,68],target:52,title:"The narrow crossing",cue:"The mean leads. Find a single reading that gives the median the lead."},
    {values:[43,55,37,62,68],target:61,title:"Turn the tide",cue:"The median leads this time. Move just one reading to make the mean closer."},
    {values:[77,40,58,67,74],target:48,title:"The long reach",cue:"The mean leads again. How little can you move to reverse it?"}
  ];
  const fmt=value=>String(Number(value.toFixed(4)));
  const errorFmt=value=>String(Number(value.toFixed(5)));
  const valid=raw=>/^(?:0|[1-9]\d?|100)(?:\.\d{1,4})?$/.test(String(raw))&&Number(raw)<=100?Number(raw):null;
  const units=value=>Math.round(value*10000);
  const localDay=date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
  function recentDays(today) {
    return Array.from({length:7},(_,index)=>{
      const date=new Date(today.getFullYear(),today.getMonth(),today.getDate()-6+index,12);
      return {date,day:localDay(date)};
    });
  }
  function validDay(day) {
    if(!/^20\d\d-\d\d-\d\d$/.test(day??"")) return false;
    const parsed=new Date(day+"T00:00:00Z");
    return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===day;
  }
  function generatedValues(key) {
    let seed=2166136261;
    for(const character of key) {seed^=character.charCodeAt(0);seed=Math.imul(seed,16777619);}
    seed>>>=0;
    const roll=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
    for(let attempt=0;attempt<500;attempt++) {
      const values=Array.from({length:5},()=>8+Math.floor(roll()*85));
      const target=20+Math.floor(roll()*61);
      if(new Set(values).size!==5||Math.max(...values)-Math.min(...values)<25) continue;
      const ranked=core.rankLevers(values,target),distance=ranked.ranked[0]?.flip.distance;
      if(ranked.ranked.length<3||distance<.75||distance>12||Math.abs(ranked.current.meanError-ranked.current.medianError)<.4) continue;
      return {values,target};
    }
    return null;
  }
  function dailyPuzzle(day) {
    if(!validDay(day)) return null;
    const generated=generatedValues(day);
    return generated?{...generated,date:day,title:"The daily flip",cue:"A fresh generated arrangement for "+day+". Everyone opening this date gets the same puzzle."}:null;
  }
  function dailyPreview(today=new Date()) {
    const day=localDay(today),puzzle=dailyPuzzle(day);
    if(!puzzle) return null;
    const current=core.evaluate(puzzle.values,puzzle.target);
    return {day,puzzle,winner:current.winner,
      estimate:current.winner==="Mean"?current.mean:current.winner==="Median"?current.median:null,
      href:"one-move.html?daily="+day+"#stage"};
  }
  function dailyInvitation(preview,url) {
    return "One Move / "+preview.day+" · Five readings. One target. Change one reading to flip the closer estimate. Can you find the smallest move?\n\n"+url;
  }
  function practicePuzzle(seed) {
    if(!Number.isInteger(seed)||seed<1||seed>999999) return null;
    const generated=generatedValues("practice:"+seed);
    return generated?{...generated,practice:seed,title:"The open run",cue:"Practice case "+seed+". Reopen this link for the same five readings and target."}:null;
  }
  function parsePuzzle(search,today=new Date()) {
    const params=new URLSearchParams(search);
    if(params.has("practice")&&["daily","round","values","target"].some(key=>params.has(key)))
      return {puzzle:ROUNDS[0],round:0,error:"Choose one puzzle link at a time. Round 1 is loaded."};
    const shared=core.parseView(search);
    if(shared===false) return {puzzle:ROUNDS[0],round:0,error:"That link has invalid readings or target. Round 1 is loaded."};
    if(shared) {
      if(!core.rankLevers(shared.values,shared.target).ranked.length)
        return {puzzle:ROUNDS[0],round:0,error:"That arrangement has no strict single-reading reversal in 0–100. Round 1 is loaded."};
      return {puzzle:{...shared,title:"Your shared puzzle",cue:"Move one reading to give the other estimate the lead."},round:null,error:""};
    }
    if(params.has("daily")) {
      const requested=params.get("daily");
      const day=requested==="today"?localDay(today):requested;
      const puzzle=params.getAll("daily").length===1?dailyPuzzle(day):null;
      return puzzle?{puzzle,round:null,error:""}
        :{puzzle:ROUNDS[0],round:0,error:"That daily date is invalid. Round 1 is loaded."};
    }
    if(params.has("practice")) {
      const requested=params.get("practice");
      const puzzle=params.getAll("practice").length===1&&/^[1-9]\d{0,5}$/.test(requested)&&!params.has("round")?practicePuzzle(Number(requested)):null;
      return puzzle?{puzzle,round:null,error:""}
        :{puzzle:ROUNDS[0],round:0,error:"That practice case is invalid. Round 1 is loaded."};
    }
    const requested=params.get("round");
    const invalidRound=requested!==null&&(params.getAll("round").length!==1||!/^[123]$/.test(requested));
    const round=requested!==null&&!invalidRound?Number(requested)-1:0;
    return {puzzle:ROUNDS[round],round,error:invalidRound?"Unknown round. Round 1 is loaded.":""};
  }
  function scoreAttempt(puzzle,index,raw) {
    const value=valid(raw);
    if(!Number.isInteger(index)||index<0||index>=5||value===null) return {error:"Choose a reading and enter 0–100 with at most four decimal places."};
    const ranked=core.rankLevers(puzzle.values,puzzle.target);
    if(ranked.current.winner==="Equal"||!ranked.ranked.length) return {error:"This case has no strict reversal to score."};
    const changed=[...puzzle.values];changed[index]=value;
    const result=core.evaluate(changed,puzzle.target);
    const moveUnits=Math.abs(units(value)-units(puzzle.values[index]));
    const minimumUnits=units(ranked.ranked[0].flip.distance);
    const flipped=result.winner!=="Equal"&&result.winner!==ranked.current.winner;
    return {index,value,result,flipped,moveUnits,minimumUnits,
      excessUnits:flipped?moveUnits-minimumUnits:null,optimal:flipped&&moveUnits===minimumUnits,
      solution:ranked.ranked[0]};
  }
  function duelInvitation(puzzle,moveUnits,url) {
    const edition=puzzle.date?"Daily Flip / "+puzzle.date:puzzle.practice?"Practice Flip / "+puzzle.practice:"One Move";
    return edition+" · I flipped the verdict with a move of "+fmt(moveUnits/10000)+". Can you beat my move?\n\n"+url;
  }
  function hintFor(puzzle,level) {
    if(level===1) return "The mean uses all five readings; the median is the middle after sorting. A strict flip only asks which error is smaller. Neither estimate has to improve.";
    if(level!==2) return "";
    const route=core.rankLevers(puzzle.values,puzzle.target).ranked[0];
    if(!route) return "This arrangement has no strict single-reading reversal in 0–100.";
    return "One shortest route starts with Reading "+(route.index+1)+". Move it "+(route.flip.value<route.value?"down":"up")+". The exact crossing is still yours to find.";
  }
  function verdictShift(puzzle,judged) {
    const before=core.evaluate(puzzle.values,puzzle.target),after=judged.result;
    const scale=Math.max(1,before.meanError,before.medianError,after.meanError,after.medianError);
    const meanDelta=after.meanError-before.meanError,medianDelta=after.medianError-before.medianError;
    const movement=meanDelta>1e-8&&medianDelta>1e-8?"Both errors grew. ":
      meanDelta< -1e-8&&medianDelta< -1e-8?"Both errors shrank. ":
      Math.abs(meanDelta)<1e-8&&Math.abs(medianDelta)<1e-8?"Neither error moved. ":"The errors changed differently. ";
    const lead=after.winner==="Equal"?"The final errors match: this is a tie, not a strict reversal.":
      "The "+after.winner.toLowerCase()+" is closer by "+errorFmt(Math.abs(after.meanError-after.medianError))+" error units.";
    return {before,after,scale,insight:movement+lead};
  }
  function moveMechanism(puzzle,judged) {
    const oldValue=puzzle.values[judged.index],differenceUnits=units(judged.value)-units(oldValue),difference=differenceUnits/10000;
    const before=puzzle.values.map((value,index)=>({value,index})).sort((a,b)=>a.value-b.value||a.index-b.index);
    const after=puzzle.values.map((value,index)=>({value:index===judged.index?judged.value:value,index})).sort((a,b)=>a.value-b.value||a.index-b.index);
    const meanMove=differenceUnits/50000,medianBefore=before[2].value,medianAfter=after[2].value;
    const direction=value=>value>0?"+"+errorFmt(value):errorFmt(value);
    const meanText=difference===0?"The mean stays put because the reading did not move.":
      "The mean moves "+direction(meanMove)+" because it absorbs one-fifth of the "+direction(difference)+" change.";
    const medianText=medianAfter===medianBefore?"The median stays at "+fmt(medianAfter)+": the middle value did not change.":
      "The median moves from "+fmt(medianBefore)+" to "+fmt(medianAfter)+" as the middle value changes.";
    return {before,after,meanMove,medianBefore,medianAfter,explanation:meanText+" "+medianText};
  }
  function recordPractice(entries,seed,moveUnits,optimal) {
    const prior=entries.find(entry=>entry.seed===seed);
    if(!prior) return [...entries,{seed,moveUnits,optimal}];
    return entries.map(entry=>entry.seed===seed?{seed,moveUnits:Math.min(prior.moveUnits,moveUnits),optimal:prior.optimal||optimal}:entry);
  }
  function routeAtlas(puzzle,chosenIndex) {
    const {levers,ranked}=core.rankLevers(puzzle.values,puzzle.target);
    const longest=Math.max(1,...ranked.map(lever=>lever.flip.distance));
    return {viable:ranked.length,routes:[...ranked,...levers.filter(lever=>!lever.flip)].map((lever,position)=>({
      index:lever.index,from:lever.value,to:lever.flip?.value??null,distance:lever.flip?.distance??null,
      width:lever.flip?lever.flip.distance/longest*100:0,best:position===0&&!!lever.flip,chosen:lever.index===chosenIndex
    }))};
  }
  function resultCardFilename(puzzle) {
    return "inward-math-one-move-"+(puzzle.date?"daily-"+puzzle.date:puzzle.practice?"case-"+puzzle.practice:
      ROUNDS.includes(puzzle)?"round-"+(ROUNDS.indexOf(puzzle)+1):"shared")+".png";
  }
  const api={ROUNDS,parsePuzzle,scoreAttempt,dailyPuzzle,dailyPreview,dailyInvitation,practicePuzzle,validDay,valid,duelInvitation,recentDays,hintFor,verdictShift,moveMechanism,recordPractice,routeAtlas,resultCardFilename};
  if(typeof module==="object"&&module.exports) module.exports=api;
  if(typeof document==="undefined") return;

  const $=id=>document.getElementById(id);
  const home=$("home-daily-preview");
  if(home&&!$("stage")) {
    const readings=[...home.querySelectorAll("[data-preview-reading]")];
    function renderDailyPreview() {
      const preview=dailyPreview(new Date());
      if(!preview) return;
      const {day,puzzle,winner,estimate,href}=preview;
      const date=$("home-daily-date");
      date.dateTime=day;
      date.textContent=new Date(Number(day.slice(0,4)),Number(day.slice(5,7))-1,Number(day.slice(8,10)),12)
        .toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"});
      readings.forEach((item,index)=>{item.textContent=fmt(puzzle.values[index]);});
      $("home-daily-target").textContent=fmt(puzzle.target);
      $("home-daily-winner").textContent=estimate===null?"Mean and median tie":winner+" "+fmt(estimate)+" is closer";
      $("home-daily-link").href=href;
      home.dataset.winner=winner.toLowerCase();
    }
    renderDailyPreview();
    document.addEventListener("visibilitychange",()=>{if(!document.hidden) renderDailyPreview();});
    window.addEventListener("focus",renderDailyPreview);
    const share=$("home-daily-share");
    if(share) share.addEventListener("click",async()=>{
      renderDailyPreview();
      const preview=dailyPreview(new Date()),status=$("home-daily-share-status");
      if(!preview) {status.textContent="Today's puzzle is unavailable. Try the dated puzzle link.";return;}
      const url=new URL(preview.href,window.location.href).href;
      const invitation=dailyInvitation(preview,url);
      if(typeof navigator.share==="function") {
        try {
          await navigator.share({title:"One Move / "+preview.day,text:invitation.split("\n\n")[0],url});
          status.textContent="Invitation shared.";
          return;
        } catch(error) {
          if(error?.name==="AbortError") {status.textContent="Sharing canceled.";return;}
        }
      }
      try {
        await navigator.clipboard.writeText(invitation);
        status.textContent="Puzzle invitation copied. The answer stays hidden.";
      } catch(_) {
        status.textContent="Sharing is unavailable here. Open the dated puzzle and copy its address.";
      }
    });
    return;
  }
  if(!$("stage")) return;
  let {puzzle,round,error}=parsePuzzle(window.location.search);
  let selected=2,proposed=puzzle.values[selected],attempts=0,best=null,hintLevel=0,runEntries=[],runFrontier=puzzle.practice??null,cardReady=false;
  const choiceButtons=[...document.querySelectorAll(".reading")];
  const sourceUrl=()=>puzzle.date?"one-move.html?daily="+puzzle.date:puzzle.practice?"one-move.html?practice="+puzzle.practice:round===null
    ?"one-move.html?values="+encodeURIComponent(puzzle.values.map(fmt).join(","))+"&target="+fmt(puzzle.target)
    :"one-move.html?round="+(round+1);
  function dailyBest(day) {
    try {
      const saved=Number(window.localStorage.getItem("inward-math-daily-v1-"+day));
      return Number.isInteger(saved)&&saved>0&&saved<=1000000?saved:null;
    } catch(_) {return null;}
  }
  function saveDailyBest(day,moveUnits) {
    try {
      const previous=dailyBest(day);
      if(previous===null||moveUnits<previous) window.localStorage.setItem("inward-math-daily-v1-"+day,String(moveUnits));
    } catch(_) { /* The puzzle works even when storage is unavailable. */ }
  }
  function updateDailyStatus() {
    const day=puzzle.date??localDay(new Date()),saved=dailyBest(day);
    $("daily-status").textContent=saved===null?"Edition "+day+" · complete a strict flip to keep your best move on this device."
      :"Edition "+day+" completed on this device. Best strict move: "+fmt(saved/10000)+".";
    const trail=$("daily-trail");
    if(!trail) return; // Older cached HTML remains playable during a deployment.
    const now=new Date(),today=localDay(now),days=recentDays(now);
    trail.replaceChildren();
    let completed=0;
    for(const entry of days) {
      const best=dailyBest(entry.day),link=document.createElement("a");
      if(best!==null) completed++;
      link.className="trail-day";
      link.dataset.state=best===null?"open":"complete";
      link.href="one-move.html?daily="+entry.day+"#stage";
      if(entry.day===today) link.setAttribute("aria-current","date");
      const weekday=document.createElement("span"),number=document.createElement("strong"),status=document.createElement("span");
      weekday.className="trail-weekday";weekday.textContent=entry.date.toLocaleDateString(undefined,{weekday:"short"});
      number.textContent=entry.date.toLocaleDateString(undefined,{month:"short",day:"numeric"});
      status.className="trail-state";status.textContent=best===null?entry.day===today?"Today · open":"Open edition":"Best "+fmt(best/10000);
      link.setAttribute("aria-label","Open "+entry.day+" Daily Flip. "+(best===null?"Unsolved on this device.":"Best move on this device: "+fmt(best/10000)+"."));
      link.append(weekday,number,status);trail.append(link);
    }
    $("trail-summary").textContent=completed+" of 7 editions flipped on this device.";
  }
  function updatePracticeRun() {
    if(!$("practice-run")) return;
    $("practice-run").hidden=!puzzle.practice;
    if(!puzzle.practice) return;
    const exact=runEntries.filter(entry=>entry.optimal).length;
    $("run-summary").textContent=runEntries.length+" flipped · "+exact+" exact minimum"+(exact===1?"":"s");
    const track=$("run-track");track.replaceChildren();
    const prior=runEntries.filter(entry=>entry.seed!==puzzle.practice).slice(-4);
    const current=runEntries.find(entry=>entry.seed===puzzle.practice);
    for(const entry of [...prior,current??{seed:puzzle.practice,moveUnits:null,optimal:false}]) {
      const replay=entry.seed!==puzzle.practice;
      const tile=document.createElement(replay?"button":"div"),number=document.createElement("strong"),status=document.createElement("span");
      tile.className="run-tile";
      if(replay) {
        tile.type="button";
        tile.setAttribute("aria-label","Replay practice case "+entry.seed+". Best move "+fmt(entry.moveUnits/10000)+".");
        tile.addEventListener("click",()=>load(practicePuzzle(entry.seed),null));
      }
      tile.dataset.state=entry.moveUnits===null?"current":entry.optimal?"exact":"flipped";
      if(entry.seed===puzzle.practice) tile.setAttribute("aria-current","step");
      number.textContent="#"+String(entry.seed).padStart(3,"0");
      status.textContent=entry.moveUnits===null?"In play":entry.optimal?"Exact · "+fmt(entry.moveUnits/10000):"Flip · "+fmt(entry.moveUnits/10000);
      tile.append(number,status);track.append(tile);
    }
    if($("run-resume")) {
      $("run-resume").hidden=runFrontier===null||runFrontier===puzzle.practice;
      if(!$("run-resume").hidden) $("run-resume").textContent="Return to case "+String(runFrontier).padStart(3,"0")+" ↗";
    }
  }
  function setAddress() {try{window.history.replaceState(null,"",sourceUrl());}catch(_){/* Downloaded pages still play. */}}
  function updateHints() {
    const button=$("hint-button");
    if(!button) return; // Cached prior pages still initialize with the new script.
    $("hint-panel").hidden=hintLevel===0;
    $("hint-one").hidden=hintLevel<1;
    $("hint-two").hidden=hintLevel<2;
    if(hintLevel>=1) $("hint-one").textContent=hintFor(puzzle,1);
    if(hintLevel>=2) $("hint-two").textContent=hintFor(puzzle,2);
    $("hint-progress").textContent=hintLevel+" / 2 nudges";
    button.textContent=hintLevel===0?"Reveal a nudge ↗":hintLevel===1?"Reveal one more ↗":"Both nudges revealed";
    button.disabled=hintLevel===2;
    button.setAttribute("aria-expanded",String(hintLevel>0));
  }
  function showVerdictShift(judged) {
    if(!$("verdict-shift")) return;
    const shift=verdictShift(puzzle,judged);
    $("verdict-shift").hidden=false;
    $("verdict-insight").textContent=shift.insight;
    for(const phase of ["before","after"]) {
      const stats=shift[phase];
      $(phase+"-lead").textContent=stats.winner==="Equal"?"Tie":stats.winner+" closer";
      for(const kind of ["mean","median"]) {
        const value=stats[kind+"Error"];
        $(phase+"-"+kind+"-error").textContent=errorFmt(value);
        $(phase+"-"+kind+"-bar").style.width=(value/shift.scale*100).toFixed(2)+"%";
        $(phase+"-"+kind+"-row").dataset.leading=String(stats.winner.toLowerCase()===kind);
      }
    }
  }
  function showMoveMechanism(judged) {
    if(!$("mechanism")) return;
    const mechanism=moveMechanism(puzzle,judged);
    $("mechanism").hidden=false;
    $("mechanism-explanation").textContent=mechanism.explanation;
    for(const phase of ["before","after"]) {
      const row=$(phase+"-sorted");
      row.replaceChildren();
      for(const [position,reading] of mechanism[phase].entries()) {
        const chip=document.createElement("span");
        chip.className="sorted-reading";
        chip.dataset.moved=String(reading.index===judged.index);
        chip.dataset.middle=String(position===2);
        chip.textContent=fmt(reading.value);
        chip.setAttribute("aria-label","Reading "+(reading.index+1)+": "+fmt(reading.value)+(position===2?", middle value":"")+(reading.index===judged.index?", moved reading":""));
        row.append(chip);
      }
    }
  }
  function showRouteAtlas(judged) {
    if(!$("route-atlas")) return;
    $("route-atlas").hidden=!judged.flipped;
    if(!judged.flipped) return;
    const atlas=routeAtlas(puzzle,judged.index),list=$("route-list");
    $("route-summary").textContent=atlas.viable+" of 5 readings have a strict reversal in 0–100. Shorter bars require less movement.";
    list.replaceChildren();
    for(const route of atlas.routes) {
      const row=document.createElement("div"),label=document.createElement("strong"),track=document.createElement("span"),bar=document.createElement("i"),amount=document.createElement("b"),detail=document.createElement("small");
      row.className="route-row";row.setAttribute("role","listitem");row.dataset.best=String(route.best);row.dataset.chosen=String(route.chosen);
      label.textContent="Reading "+(route.index+1)+(route.chosen?" · yours":"");
      track.className="route-track";bar.style.width=route.width.toFixed(2)+"%";track.append(bar);
      amount.textContent=route.distance===null?"No flip":fmt(route.distance);
      detail.textContent=route.to===null?"No strict reversal within 0–100":fmt(route.from)+" → "+fmt(route.to)+(route.best?" · shortest overall":"");
      row.append(label,track,amount,detail);list.append(row);
    }
  }
  function drawResultCard(judged) {
    if(!$("move-card-kit")) return;
    $("move-card-kit").hidden=false;
    cardReady=false;
    const canvas=$("move-card"),ctx=canvas.getContext("2d");
    if(!ctx) {$("move-card-status").textContent="Image preview is unavailable in this browser.";return;}
    const before=core.evaluate(puzzle.values,puzzle.target),after=judged.result;
    const edition=puzzle.date?"DAILY / "+puzzle.date:puzzle.practice?"OPEN RUN / CASE "+String(puzzle.practice).padStart(3,"0"):
      round===null?"SHARED PUZZLE":"ROUND "+(round+1)+" / 3";
    const block=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
    const label=(value,x,y,size,color,weight="700")=>{ctx.fillStyle=color;ctx.font=weight+" "+size+"px system-ui, sans-serif";ctx.fillText(value,x,y);};
    block(0,0,1200,630,"#071c2b");block(24,24,1152,582,"#102e3e");block(24,24,1152,9,"#70f0c9");
    label("ĀRU / INWARD MATHEMATICS",68,85,22,"#70f0c9","800");
    ctx.textAlign="right";label(edition,1130,85,20,"#ffd08b");ctx.textAlign="left";
    label("ONE MOVE. ONE REVERSAL.",68,157,45,"#f3f7f4","800");
    label("Reading "+(judged.index+1)+"   "+fmt(puzzle.values[judged.index])+" → "+fmt(judged.value),68,216,28,"#ffb3bc");
    ctx.textAlign="right";label("TARGET  "+fmt(puzzle.target),1130,211,27,"#ffd08b","800");ctx.textAlign="left";
    block(68,244,514,199,"#092634");block(598,244,532,199,"#123b3c");
    label("BEFORE",89,282,18,"#a6dffc","800");label("AFTER",619,282,18,"#70f0c9","800");
    label(before.winner.toUpperCase()+" CLOSER",89,328,27,"#f3f7f4","800");
    label(after.winner.toUpperCase()+" CLOSER",619,328,27,"#70f0c9","800");
    label("Mean error  "+errorFmt(before.meanError),89,376,23,"#d3e5e4");
    label("Median error  "+errorFmt(before.medianError),89,412,23,"#d3e5e4");
    label("Mean error  "+errorFmt(after.meanError),619,376,23,"#d3e5e4");
    label("Median error  "+errorFmt(after.medianError),619,412,23,"#d3e5e4");
    label("YOUR MOVE",68,490,19,"#b9d4d3","800");
    label(fmt(judged.moveUnits/10000),68,547,48,"#70f0c9","800");
    label(judged.optimal?"EXACT MINIMUM":"MINIMUM  "+fmt(judged.minimumUnits/10000),360,538,23,"#ffd08b","800");
    ctx.textAlign="right";label("aruintelligence.github.io/inward-mathematics-simulator",1130,540,16,"#b9d4d3");ctx.textAlign="left";
    label(round===null&&!puzzle.date&&!puzzle.practice?"READER-SUPPLIED READINGS + TARGET · NOT INDEPENDENTLY VERIFIED":"DETERMINISTIC WHAT-IF READINGS · NOT OBSERVED DATA",68,583,16,"#b9d4d3");
    canvas.setAttribute("aria-label","Result card for "+edition+": reading "+(judged.index+1)+" from "+fmt(puzzle.values[judged.index])+" to "+fmt(judged.value)+", move "+fmt(judged.moveUnits/10000)+". "+before.winner+" was closer before; "+after.winner+" is closer after. "+(judged.optimal?"Exact minimum.":"Shortest move "+fmt(judged.minimumUnits/10000)+"."));
    cardReady=true;
  }
  function updateProposal() {
    $("selected-reading").textContent=String(selected+1);
    $("selected-old").textContent=fmt(puzzle.values[selected]);
    $("proposal-value").textContent=fmt(proposed);
    $("proposed").value=fmt(proposed);
    $("slider").value=String(proposed);
    $("old-marker").style.left=puzzle.values[selected]+"%";
    $("new-marker").style.left=proposed+"%";
    $("proposal-summary").textContent="Reading "+(selected+1)+": "+fmt(puzzle.values[selected])+" → "+fmt(proposed)+". Proposed move "+fmt(Math.abs(proposed-puzzle.values[selected]))+".";
    $("result").hidden=true;
    $("input-error").textContent="";
    choiceButtons.forEach((button,index)=>button.setAttribute("aria-pressed",String(index===selected)));
  }
  function render() {
    const stats=core.evaluate(puzzle.values,puzzle.target),opposite=stats.winner==="Mean"?"median":"mean";
    $("round-name").textContent=puzzle.date?"Daily edition / "+puzzle.date:puzzle.practice?"Practice case / "+String(puzzle.practice).padStart(3,"0"):round===null?"Shared puzzle":"Round "+(round+1)+" / 3";
    $("round-title").textContent=puzzle.title;
    $("cue").textContent=puzzle.cue;
    $("current-winner").textContent=stats.winner+" closer";
    $("current-winner").dataset.winner=stats.winner;
    $("mission").textContent="Make the "+opposite+" strictly closer to the chosen target by moving only one reading.";
    $("current-stats").textContent="Mean "+errorFmt(stats.mean)+" (error "+errorFmt(stats.meanError)+") · median "+fmt(stats.median)+" (error "+errorFmt(stats.medianError)+").";
    $("target").textContent=fmt(puzzle.target);
    $("target-marker").style.left=puzzle.target+"%";
    choiceButtons.forEach((button,index)=>{
      button.querySelector("strong").textContent=fmt(puzzle.values[index]);
      button.querySelector("i").style.width=puzzle.values[index]+"%";
    });
    $("attempt-count").textContent="Attempts this puzzle: "+attempts+(best===null?"":" · Best strict flip: "+fmt(best/10000));
    $("next").hidden=true;
    $("next").textContent=puzzle.practice?"Next practice case ↗":puzzle.date||round===null?"Try round 1 ↗":"Next puzzle ↗";
    $("play-again").hidden=true;
    if($("duel")) {$("duel").hidden=true;$("duel-status").textContent="";}
    if($("verdict-shift")) $("verdict-shift").hidden=true;
    if($("mechanism")) $("mechanism").hidden=true;
    if($("route-atlas")) $("route-atlas").hidden=true;
    if($("move-card-kit")) {$("move-card-kit").hidden=true;$("move-card-status").textContent="";cardReady=false;}
    $("puzzle-link").href="flip-levers.html?values="+encodeURIComponent(puzzle.values.map(fmt).join(","))+"&target="+fmt(puzzle.target);
    $("share-link").href=sourceUrl();
    updateDailyStatus();
    updatePracticeRun();
    setAddress();updateProposal();updateHints();
  }
  function choose(index) {selected=index;proposed=puzzle.values[index];updateProposal();}
  function load(next,number) {
    puzzle=next;round=number;selected=2;proposed=puzzle.values[selected];attempts=0;best=null;hintLevel=0;
    $("share-status").textContent="";$("link-error").textContent="";render();
    $("stage-title").scrollIntoView({block:"start"});
  }
  choiceButtons.forEach((button,index)=>button.addEventListener("click",()=>choose(index)));
  $("slider").addEventListener("input",event=>{proposed=Number(event.target.value);updateProposal();});
  $("proposed").addEventListener("input",event=>{
    const parsed=valid(event.target.value);
    if(parsed!==null) {proposed=parsed;updateProposal();}
    else $("input-error").textContent="Enter 0–100 with at most four decimal places.";
  });
  $("proposed").addEventListener("blur",event=>{if(valid(event.target.value)===null) event.target.value=fmt(proposed);});
  $("hint-button")?.addEventListener("click",()=>{hintLevel=Math.min(2,hintLevel+1);updateHints();});
  $("run-resume")?.addEventListener("click",()=>{if(runFrontier!==null) load(practicePuzzle(runFrontier),null);});
  $("submit").addEventListener("click",()=>{
    const judged=scoreAttempt(puzzle,selected,$("proposed").value);
    if(judged.error){$("input-error").textContent=judged.error;return;}
    attempts++;
    const {result,flipped,moveUnits,minimumUnits,excessUnits,solution}=judged;
    const outcome=flipped?"You flipped it.":result.winner==="Equal"?"You reached a tie.":"The leader held on.";
    $("result").hidden=false;$("result").dataset.outcome=flipped?"success":"retry";
    $("result-title").textContent=outcome;
    $("result-detail").textContent=flipped
      ?"Reading "+(selected+1)+" moved from "+fmt(puzzle.values[selected])+" to "+fmt(proposed)+". "+result.winner+" is now closer: mean error "+errorFmt(result.meanError)+", median error "+errorFmt(result.medianError)+"."
      :result.winner==="Equal"?"Both estimates have equal error here. Cross the tie to give the opposing estimate a strict lead."
      :"The "+result.winner.toLowerCase()+" is still closer. Try a different value or reading.";
    showVerdictShift(judged);
    showMoveMechanism(judged);
    showRouteAtlas(judged);
    if($("move-card-kit")) $("move-card-kit").hidden=true;
    cardReady=false;
    $("benchmark").hidden=!flipped;
    $("next").hidden=!flipped;
    $("play-again").hidden=!flipped;
    if($("duel")) $("duel").hidden=!flipped;
    if(flipped) {
      if(best===null||moveUnits<best) best=moveUnits;
      if(puzzle.date) {saveDailyBest(puzzle.date,moveUnits);updateDailyStatus();}
      if(puzzle.practice) {runEntries=recordPractice(runEntries,puzzle.practice,moveUnits,judged.optimal);updatePracticeRun();}
      if($("duel")) {
        $("duel-score").textContent=fmt(best/10000);
        $("duel-edition").textContent=puzzle.date?"Daily Flip / "+puzzle.date:puzzle.practice?"Practice Flip / "+puzzle.practice:round===null?"One Move / shared puzzle":"One Move / round "+(round+1);
      }
      $("personal-move").textContent=fmt(moveUnits/10000);
      $("minimum-move").textContent=fmt(minimumUnits/10000);
      $("move-comparison").textContent=judged.optimal?"Exact minimum. You found the shortest strict flip!"
        :"Your move is "+fmt(excessUnits/10000)+" above the shortest strict flip.";
      $("optimal-example").textContent="One shortest answer: move reading "+(solution.index+1)+" from "+fmt(solution.value)+" to "+fmt(solution.flip.value)+".";
      $("your-bar").style.width="100%";
      $("minimum-bar").style.width=Math.max(3,minimumUnits/moveUnits*100)+"%";
      drawResultCard(judged);
    }
    $("attempt-count").textContent="Attempts this puzzle: "+attempts+(best===null?"":" · Best strict flip: "+fmt(best/10000));
  });
  $("next").addEventListener("click",()=>{
    if(puzzle.practice) {
      const nextSeed=puzzle.practice===999999?1:puzzle.practice+1;
      if(puzzle.practice===runFrontier) runFrontier=nextSeed;
      load(practicePuzzle(nextSeed),null);return;
    }
    load(ROUNDS[round===null?0:(round+1)%ROUNDS.length],round===null?0:(round+1)%ROUNDS.length);
  });
  $("play-again").addEventListener("click",()=>{$("result").hidden=true;$("proposed").focus();});
  $("download-move-card")?.addEventListener("click",()=>{
    if(!cardReady) return;
    $("move-card").toBlob(blob=>{
      if(!blob) {$("move-card-status").textContent="Could not create the PNG. Try another browser.";return;}
      const url=URL.createObjectURL(blob),link=document.createElement("a");
      link.href=url;link.download=resultCardFilename(puzzle);
      document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      $("move-card-status").textContent="Result PNG downloaded.";
    },"image/png");
  });
  $("duel-share")?.addEventListener("click",async()=>{
    const url=new URL(sourceUrl(),window.location.href).href;
    const title=puzzle.date?"Daily Flip / "+puzzle.date:puzzle.practice?"Practice Flip / "+puzzle.practice:"One Move challenge";
    const invitation=duelInvitation(puzzle,best,url);
    if(typeof navigator.share==="function") {
      try {
        await navigator.share({title,text:invitation.slice(0,-url.length).trim(),url});
        $("duel-status").textContent="Challenge shared. Your reading and solution stay hidden.";
        return;
      } catch(error) {
        if(error?.name==="AbortError") {$("duel-status").textContent="Share cancelled. Your puzzle is ready whenever you are.";return;}
      }
    }
    try {await navigator.clipboard.writeText(invitation);$("duel-status").textContent="Blind challenge copied. Your reading and solution stay hidden.";}
    catch(_) {$("duel-status").textContent="Sharing is unavailable here. Use the exact puzzle link below.";}
  });
  for(const button of document.querySelectorAll("[data-round]")) button.addEventListener("click",()=>load(ROUNDS[Number(button.dataset.round)],Number(button.dataset.round)));
  $("copy").addEventListener("click",async()=>{
    try{await navigator.clipboard.writeText(new URL(sourceUrl(),window.location.href).href);$("share-status").textContent="Puzzle link copied. Your attempts are not included.";}
    catch(_){$("share-status").textContent="Copy unavailable here. Open the puzzle link and copy its address.";}
  });
  $("link-error").textContent=error;
  render();
})();
