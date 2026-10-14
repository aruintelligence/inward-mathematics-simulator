/* Integer-grid certificate for the closest strict one-reading reversal. */
(() => {
  "use strict";
  const SCALE=10000,LIMIT=100*SCALE;
  const units=value=>Math.round(value*SCALE);
  function difference(fixed,target,reading) {
    const middle=Math.max(fixed[1],Math.min(fixed[2],reading));
    return Math.abs(fixed.sum+reading-5*target)-5*Math.abs(middle-target);
  }
  function strictRange(low,high,opposes) {
    const first=opposes(low),last=opposes(high);
    if(!first&&!last) return null;
    if(first&&last) return [low,high];
    if(last) {
      let left=low,right=high;
      while(left<right) {const mid=Math.floor((left+right)/2);if(opposes(mid)) right=mid;else left=mid+1;}
      return [left,high];
    }
    let left=low,right=high;
    while(left<right) {const mid=Math.ceil((left+right)/2);if(opposes(mid)) left=mid;else right=mid-1;}
    return [low,left];
  }
  function proveMinimum(values,target) {
    if(!Array.isArray(values)||values.length!==5||[...values,target].some(value=>
      !Number.isFinite(value)||value<0||value>100||Math.abs(value*SCALE-units(value))>1e-7))
      throw new RangeError("Five four-decimal readings and a target from 0 to 100 are required.");
    const readings=values.map(units),targetUnits=units(target);
    const routes=readings.map((original,index)=>{
      const fixed=readings.filter((_,i)=>i!==index).sort((a,b)=>a-b);
      fixed.sum=fixed.reduce((sum,value)=>sum+value,0);
      const at=reading=>difference(fixed,targetUnits,reading);
      const initial=at(original);
      const knots=[0,LIMIT,fixed[1],fixed[2],targetUnits,5*targetUnits-fixed.sum]
        .filter(value=>value>=0&&value<=LIMIT).sort((a,b)=>a-b)
        .filter((value,i,array)=>i===0||value!==array[i-1]);
      const opposes=initial<0?reading=>at(reading)>0:reading=>at(reading)<0;
      let best=null;
      const segments=[];
      for(let i=0;i<knots.length-1;i++) {
        const low=knots[i],high=knots[i+1],range=initial===0?null:strictRange(low,high,opposes);
        segments.push({fromUnits:low,toUnits:high,fromDifference:at(low),toDifference:at(high),
          opposingFromUnits:range?.[0]??null,opposingToUnits:range?.[1]??null});
        if(!range) continue;
        const candidate=Math.max(range[0],Math.min(range[1],original));
        const distance=Math.abs(candidate-original);
        if(!best||distance<best.distanceUnits||distance===best.distanceUnits&&candidate<best.toUnits)
          best={toUnits:candidate,distanceUnits:distance};
      }
      const nearMiss=best?best.toUnits+(best.toUnits>original?-1:1):null;
      return {index,fromUnits:original,initialDifference:initial,segments,
        toUnits:best?.toUnits??null,distanceUnits:best?.distanceUnits??null,
        nearMissUnits:nearMiss,nearMissDifference:nearMiss===null?null:at(nearMiss),
        winnerDifference:best?at(best.toUnits):null};
    });
    const winner=routes[0].initialDifference<0?"Mean":routes[0].initialDifference>0?"Median":"Equal";
    const best=routes.filter(route=>route.toUnits!==null)
      .sort((a,b)=>a.distanceUnits-b.distanceUnits||a.index-b.index)[0]??null;
    return {winner,best,routes,positions:5*(LIMIT+1),pieces:routes.reduce((sum,route)=>sum+route.segments.length,0)};
  }
  const api={difference,proveMinimum};
  if(typeof module==="object"&&module.exports) module.exports=api;
  if(typeof window!=="undefined") window.InwardMathProof=api;
})();
