"use strict";
// Independent, integer-only verifier for Target Lens proof receipts.
const SCALE=1000000, LIMIT=100*SCALE;
const fail=message=>{throw new Error(message);};
const integer=(value,name,max=LIMIT)=>{
  if(!Number.isSafeInteger(value)||value<0||value>max) fail(`Invalid ${name}`);
  return value;
};
const array=(value,length,name)=>{
  if(!Array.isArray(value)||value.length!==length) fail(`Invalid ${name}`);
  return value;
};
const same=(actual,claimed)=>{
  if(Array.isArray(actual)) return Array.isArray(claimed)&&actual.length===claimed.length&&
    actual.every((value,index)=>same(value,claimed[index]));
  if(actual!==null&&typeof actual==="object") return claimed!==null&&typeof claimed==="object"&&
    !Array.isArray(claimed)&&Object.keys(actual).length===Object.keys(claimed).length&&
    Object.keys(actual).every(key=>Object.prototype.hasOwnProperty.call(claimed,key)&&same(actual[key],claimed[key]));
  return actual===claimed;
};
// JSON.parse keeps only the final occurrence of a repeated key. Check raw
// object keys first so portable receipts cannot have parser-dependent meaning.
function parseReceipt(source) {
  const parsed=JSON.parse(source);
  let index=0;
  const space=()=>{while(index<source.length&&/[ \t\r\n]/.test(source[index])) index++;};
  const string=()=>{
    const start=index++;
    while(index<source.length) {
      const character=source[index++];
      if(character==='"') return JSON.parse(source.slice(start,index));
      if(character==='\\') index++; // JSON.parse above validated the escape.
    }
    fail("Unterminated JSON string");
  };
  const value=depth=>{
    if(depth>64) fail("Receipt JSON nesting too deep");
    space();
    if(source[index]==='{') {
      index++;
      const keys=new Set();
      space();
      while(source[index]!=='}') {
        const key=string();
        if(keys.has(key)) fail(`Duplicate JSON key: ${key}`);
        keys.add(key);
        space();index++; // colon, validated by JSON.parse
        value(depth+1);
        space();
        if(source[index]===',') {index++;space();} else break;
      }
      index++; // closing brace
    } else if(source[index]==='[') {
      index++;
      space();
      while(source[index]!==']') {
        value(depth+1);
        space();
        if(source[index]===',') {index++;space();} else break;
      }
      index++; // closing bracket
    } else if(source[index]==='"') string();
    else while(index<source.length&&!/[ \t\r\n,\]}]/.test(source[index])) index++;
  };
  value(0);
  return parsed;
}
const equal=(actual,claimed,name)=>{
  if(!same(actual,claimed)) fail(`Incorrect ${name}`);
};
const median=values=>[...values].sort((a,b)=>a-b)[2];
const sum=values=>values.reduce((a,b)=>a+b,0);
const validPoint=(readings,target,lower,upper,lo,hi,denominator)=>{
  if(target<lo*denominator||target>hi*denominator) fail("Witness target outside interval");
  readings.forEach((value,i)=>{
    if(value<lower[i]*denominator||value>upper[i]*denominator) fail("Witness reading outside drift box");
  });
  const total=readings.reduce((a,b)=>a+b,0n);
  const middle=[...readings].sort((a,b)=>a<b?-1:a>b?1:0)[2];
  if((total-5n*middle)*(total+5n*middle-10n*target)!==0n) fail("Witness does not tie");
};
function verify(receipt) {
  if(!receipt||receipt.format!=="inward-target-lens-proof-v1"||receipt.scale!==SCALE) fail("Unknown receipt format");
  const input=receipt.inputs,claim=receipt.claim;
  if(!input||!claim) fail("Missing inputs or claim");
  const readings=array(input.readings,5,"readings").map((x,i)=>integer(x,`reading ${i}`));
  if(readings.some(x=>x%100!==0)) fail("Readings exceed four decimal places");
  const lo=integer(input.low,"low"),hi=integer(input.high,"high"),drift=integer(input.drift,"drift"),target=integer(input.selectedTarget,"selected target");
  if(lo>hi) fail("Reversed target range");
  const lower=readings.map(x=>Math.max(0,x-drift));
  const upper=readings.map(x=>Math.min(LIMIT,x+drift));
  // Partition by median index and the two indices at or below it. On each
  // ordered cell, sum(x)-5*median(x) is affine. The extrema occur when the
  // median reaches a limiting feasible value and all other coordinates hit
  // their allowed bounds or that median. Enumerating 30 cells covers the box.
  let least=Infinity,greatest=-Infinity;
  for(let mid=0;mid<5;mid++) for(let a=0;a<5;a++) for(let b=a+1;b<5;b++) {
    if(a===mid||b===mid) continue;
    const below=[a,b],above=[0,1,2,3,4].filter(i=>i!==mid&&i!==a&&i!==b);
    const floor=Math.max(lower[mid],lower[a],lower[b]);
    const ceiling=Math.min(upper[mid],upper[above[0]],upper[above[1]]);
    if(floor>ceiling) continue;
    const max=[...upper]; max[mid]=floor;
    for(const i of below) max[i]=Math.min(upper[i],floor);
    const min=[...lower]; min[mid]=ceiling;
    for(const i of above) min[i]=Math.max(lower[i],ceiling);
    greatest=Math.max(greatest,sum(max)-5*floor);
    least=Math.min(least,sum(min)-5*ceiling);
  }
  const referenceMin=sum(lower)+5*median(lower)-10*hi;
  const referenceMax=sum(upper)+5*median(upper)-10*lo;
  equal([least,greatest],claim.estimateRange,"estimate factor range");
  equal([referenceMin,referenceMax],claim.referenceRange,"reference factor range");
  const estimateZero=least<=0&&greatest>=0;
  const referenceZero=referenceMin<=0&&referenceMax>=0;
  const kind=least===0&&greatest===0?"all-tie":estimateZero||referenceZero?"tie-possible":"strict";
  const winner=kind==="strict"?(Math.sign(least)===Math.sign(referenceMin)?"Median":"Mean"):null;
  equal(kind,claim.kind,"verdict"); equal(winner,claim.winner,"winner");
  equal({kind:estimateZero?"all":"band",lowerNumerator:sum(lower)+5*median(lower),
    upperNumerator:sum(upper)+5*median(upper),denominator:10*SCALE},claim.tieTargets,"tie target band");
  const witness=claim.witness;
  if(kind==="strict"||kind==="all-tie") {
    if(witness!==null) fail("Unexpected witness");
  } else {
    if(!witness||typeof witness!=="object") fail("Missing tie witness");
    if(witness.path) {
      const path=witness.path;
      const from=array(path.from,5,"path start").map((x,i)=>integer(x,`path start ${i}`));
      const to=array(path.to,5,"path end").map((x,i)=>integer(x,`path end ${i}`));
      const start=integer(path.targetFromUnits,"path target start"),end=integer(path.targetToUnits,"path target end");
      const decimal=/^(0|[1-9][0-9]{0,15})$/;
      if(!decimal.test(path.numerator)||!decimal.test(path.denominator)) fail("Invalid path fraction");
      const n=BigInt(path.numerator),d=BigInt(path.denominator);
      if(d===0n||n>d) fail("Path fraction outside segment");
      from.forEach((x,i)=>{if(x<lower[i]||x>upper[i]||to[i]<lower[i]||to[i]>upper[i]) fail("Path outside drift box");});
      if(start<lo||start>hi||end<lo||end>hi) fail("Path target outside interval");
      const x=from.map((value,i)=>BigInt(value)*d+BigInt(to[i]-value)*n);
      validPoint(x,BigInt(start)*d+BigInt(end-start)*n,lower.map(BigInt),upper.map(BigInt),BigInt(lo),BigInt(hi),d);
    } else {
      const x=array(witness.readings,5,"witness readings").map((v,i)=>BigInt(integer(v,`witness reading ${i}`)));
      const t=BigInt(integer(witness.targetUnits,"witness target"));
      validPoint(x,t,lower.map(BigInt),upper.map(BigInt),BigInt(lo),BigInt(hi),1n);
    }
  }
  return {kind,winner};
}
if(typeof module==="object"&&module.exports) module.exports={verify,parseReceipt};
else if(typeof window!=="undefined") window.TargetLensVerifier={verify,parseReceipt};
