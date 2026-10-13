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
  function dailyPuzzle(day) {
    if(!validDay(day)) return null;
    let seed=2166136261;
    for(const character of day) {seed^=character.charCodeAt(0);seed=Math.imul(seed,16777619);}
    seed>>>=0;
    const roll=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
    for(let attempt=0;attempt<500;attempt++) {
      const values=Array.from({length:5},()=>8+Math.floor(roll()*85));
      const target=20+Math.floor(roll()*61);
      if(new Set(values).size!==5||Math.max(...values)-Math.min(...values)<25) continue;
      const ranked=core.rankLevers(values,target),distance=ranked.ranked[0]?.flip.distance;
      if(ranked.ranked.length<3||distance<.75||distance>12||Math.abs(ranked.current.meanError-ranked.current.medianError)<.4) continue;
      return {values,target,date:day,title:"The daily flip",cue:"A fresh generated arrangement for "+day+". Everyone opening this date gets the same puzzle."};
    }
    return null;
  }
  function parsePuzzle(search,today=new Date()) {
    const params=new URLSearchParams(search),shared=core.parseView(search);
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
    const edition=puzzle.date?"Daily Flip / "+puzzle.date:"One Move";
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
  const api={ROUNDS,parsePuzzle,scoreAttempt,dailyPuzzle,validDay,valid,duelInvitation,recentDays,hintFor,verdictShift};
  if(typeof module==="object"&&module.exports) module.exports=api;
  if(typeof document==="undefined") return;

  const $=id=>document.getElementById(id);
  let {puzzle,round,error}=parsePuzzle(window.location.search);
  let selected=2,proposed=puzzle.values[selected],attempts=0,best=null,hintLevel=0;
  const choiceButtons=[...document.querySelectorAll(".reading")];
  const sourceUrl=()=>puzzle.date?"one-move.html?daily="+puzzle.date:round===null
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
    $("round-name").textContent=puzzle.date?"Daily edition / "+puzzle.date:round===null?"Shared puzzle":"Round "+(round+1)+" / 3";
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
    $("next").textContent=puzzle.date||round===null?"Try round 1 ↗":"Next puzzle ↗";
    $("play-again").hidden=true;
    if($("duel")) {$("duel").hidden=true;$("duel-status").textContent="";}
    if($("verdict-shift")) $("verdict-shift").hidden=true;
    $("puzzle-link").href="flip-levers.html?values="+encodeURIComponent(puzzle.values.map(fmt).join(","))+"&target="+fmt(puzzle.target);
    $("share-link").href=sourceUrl();
    updateDailyStatus();
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
    $("benchmark").hidden=!flipped;
    $("next").hidden=!flipped;
    $("play-again").hidden=!flipped;
    if($("duel")) $("duel").hidden=!flipped;
    if(flipped) {
      if(best===null||moveUnits<best) best=moveUnits;
      if(puzzle.date) {saveDailyBest(puzzle.date,moveUnits);updateDailyStatus();}
      if($("duel")) {
        $("duel-score").textContent=fmt(best/10000);
        $("duel-edition").textContent=puzzle.date?"Daily Flip / "+puzzle.date:round===null?"One Move / shared puzzle":"One Move / round "+(round+1);
      }
      $("personal-move").textContent=fmt(moveUnits/10000);
      $("minimum-move").textContent=fmt(minimumUnits/10000);
      $("move-comparison").textContent=judged.optimal?"Exact minimum. You found the shortest strict flip!"
        :"Your move is "+fmt(excessUnits/10000)+" above the shortest strict flip.";
      $("optimal-example").textContent="One shortest answer: move reading "+(solution.index+1)+" from "+fmt(solution.value)+" to "+fmt(solution.flip.value)+".";
      $("your-bar").style.width="100%";
      $("minimum-bar").style.width=Math.max(3,minimumUnits/moveUnits*100)+"%";
    }
    $("attempt-count").textContent="Attempts this puzzle: "+attempts+(best===null?"":" · Best strict flip: "+fmt(best/10000));
  });
  $("next").addEventListener("click",()=>load(ROUNDS[round===null?0:(round+1)%ROUNDS.length],round===null?0:(round+1)%ROUNDS.length));
  $("play-again").addEventListener("click",()=>{$("result").hidden=true;$("proposed").focus();});
  $("duel-share")?.addEventListener("click",async()=>{
    const url=new URL(sourceUrl(),window.location.href).href;
    const title=puzzle.date?"Daily Flip / "+puzzle.date:"One Move challenge";
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
