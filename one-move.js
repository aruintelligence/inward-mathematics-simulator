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
  function parsePuzzle(search) {
    const params=new URLSearchParams(search),shared=core.parseView(search);
    if(shared===false) return {puzzle:ROUNDS[0],round:0,error:"That link has invalid readings or target. Round 1 is loaded."};
    if(shared) {
      if(!core.rankLevers(shared.values,shared.target).ranked.length)
        return {puzzle:ROUNDS[0],round:0,error:"That arrangement has no strict single-reading reversal in 0–100. Round 1 is loaded."};
      return {puzzle:{...shared,title:"Your shared puzzle",cue:"Move one reading to give the other estimate the lead."},round:null,error:""};
    }
    const requested=params.get("round");
    const round=params.getAll("round").length<=1&&/^[123]$/.test(requested??"")?Number(requested)-1:0;
    return {puzzle:ROUNDS[round],round,error:requested!==null&&round===0&&requested!=="1"?"Unknown round. Round 1 is loaded.":""};
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
  const api={ROUNDS,parsePuzzle,scoreAttempt,valid};
  if(typeof module==="object"&&module.exports) module.exports=api;
  if(typeof document==="undefined") return;

  const $=id=>document.getElementById(id);
  let {puzzle,round,error}=parsePuzzle(window.location.search);
  let selected=2,proposed=puzzle.values[selected],attempts=0,best=null;
  const choiceButtons=[...document.querySelectorAll(".reading")];
  const sourceUrl=()=>round===null
    ?"one-move.html?values="+encodeURIComponent(puzzle.values.map(fmt).join(","))+"&target="+fmt(puzzle.target)
    :"one-move.html?round="+(round+1);
  function setAddress() {try{window.history.replaceState(null,"",sourceUrl());}catch(_){/* Downloaded pages still play. */}}
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
    $("round-name").textContent=round===null?"Shared puzzle":"Round "+(round+1)+" / 3";
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
    $("play-again").hidden=true;
    $("puzzle-link").href="flip-levers.html?values="+encodeURIComponent(puzzle.values.map(fmt).join(","))+"&target="+fmt(puzzle.target);
    $("share-link").href=sourceUrl();
    setAddress();updateProposal();
  }
  function choose(index) {selected=index;proposed=puzzle.values[index];updateProposal();}
  function load(next,number) {
    puzzle=next;round=number;selected=2;proposed=puzzle.values[selected];attempts=0;best=null;
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
    $("benchmark").hidden=!flipped;
    $("next").hidden=!flipped;
    $("play-again").hidden=!flipped;
    if(flipped) {
      if(best===null||moveUnits<best) best=moveUnits;
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
  for(const button of document.querySelectorAll("[data-round]")) button.addEventListener("click",()=>load(ROUNDS[Number(button.dataset.round)],Number(button.dataset.round)));
  $("copy").addEventListener("click",async()=>{
    try{await navigator.clipboard.writeText(new URL(sourceUrl(),window.location.href).href);$("share-status").textContent="Puzzle link copied. Your attempts are not included.";}
    catch(_){$("share-status").textContent="Copy unavailable here. Open the puzzle link and copy its address.";}
  });
  $("link-error").textContent=error;
  render();
})();
