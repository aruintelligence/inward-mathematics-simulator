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
  const DEFAULT_RADIUS=2;
  const DEFAULT_DRIFT=1;

  function validNumber(raw,pattern) {
    if(!pattern.test(raw)) return null;
    const value=Number(raw);
    return Number.isFinite(value)&&value>=0&&value<=100?value:null;
  }
  function defaultInterval(target) {
    return {low:Math.round(Math.max(0,target-DEFAULT_RADIUS)*TARGET_SCALE)/TARGET_SCALE,
      high:Math.round(Math.min(100,target+DEFAULT_RADIUS)*TARGET_SCALE)/TARGET_SCALE};
  }
  function parseView(search) {
    const params=new URLSearchParams(search);
    if(!["values","target","lo","hi","eps"].some(key=>params.has(key))) return null;
    if(params.getAll("values").length!==1||params.getAll("target").length!==1) return false;
    const hasLow=params.has("lo"),hasHigh=params.has("hi");
    if(hasLow!==hasHigh||params.getAll("lo").length>1||params.getAll("hi").length>1||params.getAll("eps").length>1) return false;
    const raw=params.get("values").split(",");
    if(raw.length!==5) return false;
    const values=raw.map(part=>validNumber(part,readingPattern));
    const target=validNumber(params.get("target"),targetPattern);
    if(values.some(value=>value===null)||target===null) return false;
    const interval=hasLow?{low:validNumber(params.get("lo"),targetPattern),high:validNumber(params.get("hi"),targetPattern)}:defaultInterval(target);
    const epsilon=params.has("eps")?validNumber(params.get("eps"),targetPattern):DEFAULT_DRIFT;
    return interval.low===null||interval.high===null||interval.low>interval.high||epsilon===null?false:
      {values,target,...interval,epsilon,label:"Shared case"};
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
  function certifyInterval(values,low,high) {
    if(!Number.isFinite(low)||!Number.isFinite(high)||low<0||high>100||low>high) throw new RangeError("Invalid target interval");
    const {meanUnits,medianUnits}=estimateUnits(values);
    const boundaryUnits=(meanUnits+medianUnits)/2;
    const lower=evaluate(values,low).winner,upper=evaluate(values,high).winner;
    const sameEstimate=meanUnits===medianUnits;
    const kind=sameEstimate?"all-tie":lower===upper?(lower==="Equal"?"tie-only":"robust"):
      lower==="Equal"||upper==="Equal"?"touches":"crosses";
    const winner=kind==="robust"?lower:kind==="touches"?(lower==="Equal"?upper:lower):null;
    const margin=kind==="robust"?Math.min(Math.abs(Math.round(low*TARGET_SCALE)-boundaryUnits),
      Math.abs(Math.round(high*TARGET_SCALE)-boundaryUnits))/TARGET_SCALE:0;
    return {kind,winner,lower,upper,low,high,boundary:boundaryUnits/TARGET_SCALE,margin,sameEstimate};
  }
  function certifyReadingDrift(values,low,high,epsilon) {
    const interval=certifyInterval(values,low,high);
    if(!Number.isFinite(epsilon)||epsilon<0||epsilon>100) throw new RangeError("Invalid reading drift");
    const epsilonUnits=Math.round(epsilon*TARGET_SCALE);
    if(interval.kind!=="robust") return {kind:"no-baseline",winner:null,gap:0,allowance:2*epsilonUnits/TARGET_SCALE,remaining:0};
    const {meanUnits,medianUnits}=estimateUnits(values);
    const gapAt=target=>{
      const t=Math.round(target*TARGET_SCALE);
      return Math.abs(Math.abs(meanUnits-t)-Math.abs(medianUnits-t));
    };
    // The absolute-error lead is monotone toward the unique crossover and flat beyond either estimate.
    const gapUnits=Math.min(gapAt(low),gapAt(high));
    const allowanceUnits=2*epsilonUnits;
    return {kind:gapUnits>allowanceUnits?"certified":"inconclusive",winner:interval.winner,
      gap:gapUnits/TARGET_SCALE,allowance:allowanceUnits/TARGET_SCALE,
      remaining:(gapUnits-allowanceUnits)/TARGET_SCALE};
  }

  function interpolateTiePath(from,to,targetFromUnits,targetToUnits,factor) {
    const delta=from.map((value,index)=>value-to[index]);
    const fraction=(numerator,denominator)=>{
      if(denominator<0n) { numerator=-numerator; denominator=-denominator; }
      let a=numerator<0n?-numerator:numerator,b=denominator;
      while(b!==0n) { const remainder=a%b; a=b; b=remainder; }
      return {numerator:numerator/a,denominator:denominator/a};
    };
    const compare=(a,b)=>a.numerator*b.denominator-b.numerator*a.denominator;
    const stops=[fraction(0n,1n),fraction(1n,1n)];
    // The box and target interval are convex, so the whole segment is allowed.
    // Its median changes affine branch only where two reading lines meet.
    for(let i=0;i<5;i++) for(let j=i+1;j<5;j++) {
      const slope=BigInt(delta[i]-delta[j]);
      if(slope===0n) continue;
      const stop=fraction(BigInt(from[i]-from[j]),slope);
      if(compare(stop,stops[0])>0n&&compare(stop,stops[1])<0n) stops.push(stop);
    }
    stops.sort((a,b)=>Number(compare(a,b)));
    const medianWeight=factor==="estimate"?-5:5;
    const targetWeight=factor==="estimate"?0:-10;
    for(let index=1;index<stops.length;index++) {
      const left=stops[index-1],right=stops[index];
      if(compare(left,right)===0n) continue;
      const middle=fraction(left.numerator*right.denominator+right.numerator*left.denominator,
        2n*left.denominator*right.denominator);
      const order=[0,1,2,3,4].sort((a,b)=>{
        const aUnits=BigInt(from[a])*middle.denominator-BigInt(delta[a])*middle.numerator;
        const bUnits=BigInt(from[b])*middle.denominator-BigInt(delta[b])*middle.numerator;
        return Number(aUnits-bUnits);
      });
      const medianIndex=order[2];
      const atStart=from.reduce((sum,value)=>sum+value,0)+medianWeight*from[medianIndex]+targetWeight*targetFromUnits;
      const slope=-delta.reduce((sum,value)=>sum+value,0)-medianWeight*delta[medianIndex]+
        targetWeight*(targetToUnits-targetFromUnits);
      if(slope===0) continue;
      const root=fraction(-BigInt(atStart),BigInt(slope));
      if(compare(root,left)<0n||compare(root,right)>0n) continue;
      // A common denominator retains the exact rational witness even when
      // the tie reading has more than six decimal places.
      return {from,to,targetFromUnits,targetToUnits,
        numerator:root.numerator.toString(),denominator:root.denominator.toString()};
    }
    throw new Error("No tie on the continuous extremizer path");
  }

  function certifyJointUncertainty(values,low,high,epsilon,movableMask=31) {
    certifyInterval(values,low,high);
    if(!Number.isFinite(epsilon)||epsilon<0||epsilon>100) throw new RangeError("Invalid reading drift");
    if(!Number.isInteger(movableMask)||movableMask<0||movableMask>31) throw new RangeError("Invalid movable readings");
    const driftUnits=Math.round(epsilon*TARGET_SCALE);
    const lower=values.map((value,index)=>Math.max(0,Math.round(value*TARGET_SCALE)-
      ((movableMask>>index)&1)*driftUnits));
    const upper=values.map((value,index)=>Math.min(100*TARGET_SCALE,Math.round(value*TARGET_SCALE)+
      ((movableMask>>index)&1)*driftUnits));
    const median=readings=>[...readings].sort((a,b)=>a-b)[2];
    const sum=readings=>readings.reduce((total,value)=>total+value,0);
    let minEstimate=null,maxEstimate=null;
    // Every five-reading order has one median, two lower and two upper positions.
    // For a chosen order, sum(x)-5m decreases as m rises even when the two
    // lower/upper readings are pushed to the favorable limits of their boxes.
    for(let middle=0;middle<5;middle++) {
      const other=[0,1,2,3,4].filter(index=>index!==middle);
      for(let a=0;a<3;a++) for(let b=a+1;b<4;b++) {
        const below=[other[a],other[b]],above=other.filter(index=>!below.includes(index));
        const smallestMedian=Math.max(lower[middle],...below.map(index=>lower[index]));
        const largestMedian=Math.min(upper[middle],...above.map(index=>upper[index]));
        if(smallestMedian>largestMedian) continue;
        const maximize=[...upper];
        maximize[middle]=smallestMedian;
        below.forEach(index=>{maximize[index]=Math.min(upper[index],smallestMedian);});
        const maxUnits=sum(maximize)-5*smallestMedian;
        if(maxEstimate===null||maxUnits>maxEstimate.units) maxEstimate={units:maxUnits,readings:maximize};
        const minimize=[...lower];
        minimize[middle]=largestMedian;
        above.forEach(index=>{minimize[index]=Math.max(lower[index],largestMedian);});
        const minUnits=sum(minimize)-5*largestMedian;
        if(minEstimate===null||minUnits<minEstimate.units) minEstimate={units:minUnits,readings:minimize};
      }
    }
    const minReference=sum(lower)+5*median(lower)-10*Math.round(high*TARGET_SCALE);
    const maxReference=sum(upper)+5*median(upper)-10*Math.round(low*TARGET_SCALE);
    const estimateRangeUnits=[minEstimate.units,maxEstimate.units];
    const referenceRangeUnits=[minReference,maxReference];
    const estimateCanTie=minEstimate.units<=0&&maxEstimate.units>=0;
    const referenceCanTie=minReference<=0&&maxReference>=0;
    // Midpoint(x)=(sum(x)+5*median(x))/10 is continuous and monotone in
    // every reading. The image of a connected reading box is therefore the
    // entire interval between its all-low and all-high midpoint values.
    // If mean=median is attainable, that one configuration ties every target.
    const tieTargets={kind:estimateCanTie?"all":"band",
      lowerNumerator:sum(lower)+5*median(lower),
      upperNumerator:sum(upper)+5*median(upper),denominator:10*TARGET_SCALE};
    const kind=minEstimate.units===0&&maxEstimate.units===0?"all-tie":
      estimateCanTie||referenceCanTie?"tie-possible":"strict";
    const winner=kind==="strict"?
      (Math.sign(minEstimate.units)===Math.sign(minReference)?"Median":"Mean"):null;
    let witness=kind==="tie-possible"?
      minEstimate.units===0?{readings:minEstimate.readings,targetUnits:Math.round(low*TARGET_SCALE)}:
      maxEstimate.units===0?{readings:maxEstimate.readings,targetUnits:Math.round(low*TARGET_SCALE)}:
      minReference===0?{readings:lower,targetUnits:Math.round(high*TARGET_SCALE)}:
      maxReference===0?{readings:upper,targetUnits:Math.round(low*TARGET_SCALE)}:null:null;
    if(kind==="tie-possible"&&!witness) witness={path:estimateCanTie?
      interpolateTiePath(minEstimate.readings,maxEstimate.readings,Math.round(low*TARGET_SCALE),Math.round(low*TARGET_SCALE),"estimate"):
      interpolateTiePath(lower,upper,Math.round(high*TARGET_SCALE),Math.round(low*TARGET_SCALE),"reference")};
    return {kind,winner,estimateRangeUnits,referenceRangeUnits,tieTargets,
      tieFactor:estimateCanTie?"estimate":referenceCanTie?"reference":null,
      estimateExtremizers:{minimum:minEstimate.readings,maximum:maxEstimate.readings},
      lowerReadings:lower,upperReadings:upper,lowUnits:Math.round(low*TARGET_SCALE),highUnits:Math.round(high*TARGET_SCALE),witness};
  }

  function proofReceipt(values,low,high,epsilon,target) {
    const certificate=certifyJointUncertainty(values,low,high,epsilon);
    return {format:"inward-target-lens-proof-v1",scale:TARGET_SCALE,
      inputs:{readings:values.map(value=>Math.round(value*TARGET_SCALE)),
        low:Math.round(low*TARGET_SCALE),high:Math.round(high*TARGET_SCALE),
        drift:Math.round(epsilon*TARGET_SCALE),selectedTarget:Math.round(target*TARGET_SCALE)},
      claim:{kind:certificate.kind,winner:certificate.winner,
        estimateRange:certificate.estimateRangeUnits,
        referenceRange:certificate.referenceRangeUnits,
        tieTargets:certificate.tieTargets,witness:certificate.witness}};
  }

  function minimumTieSupport(values,low,high,epsilon) {
    // Enumerate all 2^5 choices. Each call certifies an entire continuous
    // box, so a strict result excludes every real perturbation of that subset.
    // Increasing support order proves minimality without assuming that the
    // extremal witness moves every reading in its chosen box.
    let strictBelow=0;
    for(let count=0;count<=5;count++) {
      let checkedAtCount=0;
      for(let mask=0;mask<32;mask++) {
        let bits=mask,population=0;
        while(bits) { population+=bits&1; bits>>=1; }
        if(population!==count) continue;
        checkedAtCount++;
        const certificate=certifyJointUncertainty(values,low,high,epsilon,mask);
        if(certificate.kind!=="strict") return {kind:"tie",count,mask,strictBelow,
          checkedAtCount,certificate};
      }
      strictBelow+=checkedAtCount;
    }
    return {kind:"unreachable",strictBelow,checkedAtCount:0,count:null,mask:null,certificate:null};
  }

  function supportTieAtlas(values,epsilon) {
    if(!Number.isFinite(epsilon)||epsilon<0||epsilon>100) throw new RangeError("Invalid reading drift");
    const denominator=10*TARGET_SCALE;
    const rows=Array.from({length:6},(_,count)=>({count,kind:"band",
      lowerNumerator:Infinity,upperNumerator:-Infinity,denominator}));
    // Every subset box contains the unperturbed readings. Its continuous
    // midpoint image is an interval through the baseline midpoint, so the
    // union for a support budget has no gaps. A coincident-estimate witness
    // anywhere in that union extends its tie set to every target.
    for(let mask=0;mask<32;mask++) {
      let bits=mask,count=0;
      while(bits) {count+=bits&1; bits>>=1;}
      const tie=certifyJointUncertainty(values,0,0,epsilon,mask).tieTargets;
      const row=rows[count];
      row.lowerNumerator=Math.min(row.lowerNumerator,tie.lowerNumerator);
      row.upperNumerator=Math.max(row.upperNumerator,tie.upperNumerator);
      if(tie.kind==="all") row.kind="all";
    }
    // A box with fewer than k movable readings is contained in a box with
    // exactly k, giving the same attainable set for "at most k".
    for(let count=1;count<=5;count++) {
      const previous=rows[count-1],row=rows[count];
      if(row.lowerNumerator>previous.lowerNumerator||row.upperNumerator<previous.upperNumerator||
        previous.kind==="all"&&row.kind!=="all")
        throw new Error("Support tie sets must be nested");
    }
    return rows;
  }

  function supportFrontier(values,low,high) {
    // A k-reading box contains every smaller-support box after adding fixed
    // readings to its mask. Checking every mask of size k therefore certifies
    // the first tie with at most k movable readings.
    const baseline=certifyJointUncertainty(values,low,high,0,0);
    if(baseline.kind!=="strict") return {kind:"baseline-tie",rows:[]};
    const rows=[];
    let previous=100*TARGET_SCALE;
    for(let count=1;count<=5;count++) {
      let best=null,bestMask=null;
      for(let mask=1;mask<32;mask++) {
        let bits=mask,population=0;
        while(bits) {population+=bits&1; bits>>=1;}
        if(population!==count) continue;
        const canTie=units=>certifyJointUncertainty(values,low,high,units/TARGET_SCALE,mask).kind!=="strict";
        const upper=best===null?previous:best;
        if(!canTie(upper)) continue;
        let strict=0,tie=upper;
        while(tie-strict>1) {
          const middle=Math.floor((strict+tie)/2);
          if(canTie(middle)) tie=middle;
          else strict=middle;
        }
        if(best===null||tie<best) {best=tie; bestMask=mask;}
      }
      rows.push({count,firstTieUnits:best,mask:bestMask});
      if(best!==null) previous=best;
    }
    return {kind:"frontier",rows};
  }

  function continuousStabilityThreshold(values,low,high,movableMask=31) {
    const baseline=certifyJointUncertainty(values,low,high,0,movableMask);
    if(baseline.kind!=="strict") return {kind:"no-baseline"};
    const readings=values.map(value=>Math.round(value*TARGET_SCALE));
    const max=100*TARGET_SCALE,scale=2*max;
    const stops=new Set([0,scale]);
    for(let i=0;i<5;i++) if(movableMask&(1<<i)) {
      stops.add(2*readings[i]); stops.add(2*(max-readings[i]));
    }
    for(let i=0;i<5;i++) for(let j=i+1;j<5;j++) {
      const a=!!(movableMask&(1<<i)),b=!!(movableMask&(1<<j));
      if(a||b) stops.add(Math.abs(readings[i]-readings[j])*(a&&b?1:2));
    }
    const landmarks=[...stops].sort((a,b)=>a-b);
    const signEstimate=Math.sign(baseline.estimateRangeUnits[0]);
    const signReference=Math.sign(baseline.referenceRangeUnits[0]);
    const lowTarget=2*Math.round(low*TARGET_SCALE),highTarget=2*Math.round(high*TARGET_SCALE);
    const median=readings=>[...readings].sort((a,b)=>a-b)[2];
    const sum=readings=>readings.reduce((total,value)=>total+value,0);
    const bounds=h=>({lower:readings.map((value,index)=>Math.max(0,2*value-
      ((movableMask>>index)&1)*h)),
      upper:readings.map((value,index)=>Math.min(scale,2*value+
        ((movableMask>>index)&1)*h))});
    const groups=[];
    for(let middle=0;middle<5;middle++) {
      const other=[0,1,2,3,4].filter(index=>index!==middle);
      for(let a=0;a<3;a++) for(let b=a+1;b<4;b++) {
        const below=[other[a],other[b]];
        groups.push({middle,below,above:other.filter(index=>!below.includes(index))});
      }
    }
    const estimateAt=(box,group)=>{
      const {lower,upper}=box,{middle,below,above}=group;
      const lowest=Math.max(lower[middle],...below.map(index=>lower[index]));
      const highest=Math.min(upper[middle],...above.map(index=>upper[index]));
      if(lowest>highest) return null;
      if(signEstimate>0) return signEstimate*(below.reduce((total,index)=>total+lower[index],0)+
        above.reduce((total,index)=>total+Math.max(lower[index],highest),0)-4*highest);
      return signEstimate*(above.reduce((total,index)=>total+upper[index],0)+
        below.reduce((total,index)=>total+Math.min(upper[index],lowest),0)-4*lowest);
    };
    const referenceAt=box=>signReference*(signReference>0
      ?sum(box.lower)+5*median(box.lower)-10*highTarget
      :sum(box.upper)+5*median(box.upper)-10*lowTarget);
    const firstByFactor={estimate:null,reference:null};
    const consider=(h0,h1,f0,f1,factor,group=null)=>{
      if(f0===null||f1===null) return;
      let numerator,denominator;
      if(f0<=0) { numerator=BigInt(h0); denominator=1n; }
      else if(f1<=0) {
        numerator=BigInt(h0)*BigInt(f0-f1)+BigInt(h1-h0)*BigInt(f0);
        denominator=BigInt(f0-f1);
      } else return;
      const previous=firstByFactor[factor];
      if(previous===null||numerator*previous.denominator<previous.numerator*denominator)
        firstByFactor[factor]={numerator,denominator,factor,group};
    };
    // Work in half-millionth reading units: every clipping, ordering, and
    // median feasibility change lies at a reading endpoint or a half-gap.
    // Within consecutive landmarks each of the 30 order assignments and
    // each reference extreme is affine in the drift radius.
    for(let index=1;index<landmarks.length;index++) {
      const h0=landmarks[index-1],h1=landmarks[index];
      const box0=bounds(h0),box1=bounds(h1);
      consider(h0,h1,referenceAt(box0),referenceAt(box1),"reference");
      for(const group of groups)
        consider(h0,h1,estimateAt(box0,group),estimateAt(box1,group),"estimate",group);
    }
    if(!firstByFactor.estimate&&!firstByFactor.reference)
      return {kind:"unreachable",winner:baseline.winner};
    const physicalFraction=root=>{
      let numerator=root.numerator,denominator=root.denominator*BigInt(2*TARGET_SCALE);
      let a=numerator,b=denominator;
      while(b!==0n) { const remainder=a%b; a=b; b=remainder; }
      return {numerator:(numerator/a).toString(),denominator:(denominator/a).toString()};
    };
    const routes={estimate:firstByFactor.estimate?physicalFraction(firstByFactor.estimate):null,
      reference:firstByFactor.reference?physicalFraction(firstByFactor.reference):null};
    // The reference route wins an exact simultaneous tie, matching the scan order.
    const reference=firstByFactor.reference,estimate=firstByFactor.estimate;
    const first=!estimate?reference:!reference?estimate:
      reference.numerator*estimate.denominator<=estimate.numerator*reference.denominator?reference:estimate;
    const witnessAt=root=>{
      let divisor=root.numerator,rest=root.denominator;
      while(rest!==0n) { const remainder=divisor%rest; divisor=rest; rest=remainder; }
      const h=root.numerator/divisor,d=root.denominator/divisor,full=BigInt(scale)*d;
      const lower=readings.map((value,index)=>{
        const raw=2n*BigInt(value)*d-((movableMask>>index)&1? h:0n);
        return raw<0n?0n:raw;
      });
      const upper=readings.map((value,index)=>{
        const raw=2n*BigInt(value)*d+((movableMask>>index)&1? h:0n);
        return raw>full?full:raw;
      });
      let tieReadings,targetNumerator;
      if(root.factor==="reference") {
        tieReadings=signReference>0?lower:upper;
        targetNumerator=BigInt(signReference>0?highTarget:lowTarget)*d;
      } else {
        const {middle,below,above}=root.group;
        if(signEstimate>0) {
          const m=[middle,...above].reduce((value,index)=>upper[index]<value?upper[index]:value,full);
          tieReadings=lower.map((value,index)=>index===middle?m:above.includes(index)&&value<m?m:value);
        } else {
          const m=[middle,...below].reduce((value,index)=>lower[index]>value?lower[index]:value,0n);
          tieReadings=upper.map((value,index)=>index===middle?m:below.includes(index)&&value>m?m:value);
        }
        targetNumerator=BigInt(lowTarget)*d;
      }
      const tieSum=tieReadings.reduce((total,value)=>total+value,0n);
      const tieMedian=[...tieReadings].sort((a,b)=>a<b?-1:a>b?1:0)[2];
      const tiedFactor=root.factor==="estimate"?tieSum-5n*tieMedian:
        tieSum+5n*tieMedian-10n*targetNumerator;
      if(tiedFactor!==0n) throw new Error("A factor boundary lacks an exact witness");
      return {readingsNumerators:tieReadings.map(value=>value.toString()),
        targetNumerator:targetNumerator.toString(),denominator:(d*BigInt(2*TARGET_SCALE)).toString()};
    };
    const routeWitnesses={estimate:estimate?witnessAt(estimate):null,
      reference:reference?witnessAt(reference):null};
    const {numerator,denominator}=routes[first.factor];
    const firstTieUnits=Number((BigInt(numerator)*BigInt(TARGET_SCALE)+BigInt(denominator)-1n)/BigInt(denominator));
    return {kind:"edge",winner:baseline.winner,factor:first.factor,
      numerator,denominator,firstTieUnits,routes,routeWitnesses,
      witness:routeWitnesses[first.factor]};
  }

  function continuousSupportFrontier(values,low,high) {
    if(certifyJointUncertainty(values,low,high,0,0).kind!=="strict")
      return {kind:"baseline-tie",rows:[]};
    const rows=[];
    for(let count=1;count<=5;count++) {
      let best=null;
      for(let mask=1;mask<32;mask++) {
        let bits=mask,population=0;
        while(bits) {population+=bits&1; bits>>=1;}
        if(population!==count) continue;
        const edge=continuousStabilityThreshold(values,low,high,mask);
        if(edge.kind!=="edge") continue;
        const numerator=BigInt(edge.numerator),denominator=BigInt(edge.denominator);
        if(best===null||numerator*BigInt(best.denominator)<BigInt(best.numerator)*denominator)
          best={count,mask,...edge};
      }
      rows.push(best??{count,kind:"unreachable",mask:null});
    }
    return {kind:"frontier",rows};
  }

  function singleReadingThresholds(values,low,high) {
    if(certifyJointUncertainty(values,low,high,0,0).kind!=="strict")
      return {kind:"baseline-tie",rows:[]};
    const rows=values.map((value,index)=>{
      const mask=1<<index;
      const exact=continuousStabilityThreshold(values,low,high,mask);
      const canTie=units=>certifyJointUncertainty(values,low,high,units/TARGET_SCALE,mask).kind!=="strict";
      let firstTieUnits=null;
      if(canTie(100*TARGET_SCALE)) {
        let strict=0,tie=100*TARGET_SCALE;
        while(tie-strict>1) {
          const midpoint=Math.floor((strict+tie)/2);
          if(canTie(midpoint)) tie=midpoint;
          else strict=midpoint;
        }
        firstTieUnits=tie;
      }
      if((exact.kind==="edge")!==(firstTieUnits!==null)||
        exact.kind==="edge"&&exact.firstTieUnits!==firstTieUnits)
        throw new Error("Single-reading continuous and selectable thresholds disagree");
      return {index,mask,value,firstTieUnits,exact};
    });
    return {kind:"frontier",rows};
  }

  function tieReachabilityEnvelope(values,selectedEpsilon) {
    if(!Number.isFinite(selectedEpsilon)||selectedEpsilon<0||selectedEpsilon>100)
      throw new RangeError("Invalid reading drift");
    const {meanUnits,medianUnits}=estimateUnits(values);
    // Distinct nonnegative estimates are strictly ordered at target zero,
    // allowing the exact estimate-factor root to be found independently of
    // the selected target interval.
    const estimateRoute=meanUnits===medianUnits?null:
      continuousStabilityThreshold(values,0,0).routes.estimate;
    if(meanUnits!==medianUnits&&!estimateRoute)
      throw new Error("Free readings must be able to make the estimates meet");
    const switchEpsilon=estimateRoute?
      Number(estimateRoute.numerator)/Number(estimateRoute.denominator):0;
    const maxEpsilon=Math.min(100,Math.max(10,selectedEpsilon*1.15,switchEpsilon*1.15));
    const stops=new Set([0,switchEpsilon]);
    for(const value of values) for(const stop of [value,100-value])
      if(stop>0&&stop<switchEpsilon) stops.add(stop);
    const midpointBand=epsilon=>{
      const low=values.map(value=>Math.max(0,value-epsilon));
      const high=values.map(value=>Math.min(100,value+epsilon));
      const midpoint=readings=>(readings.reduce((sum,value)=>sum+value,0)/5+
        [...readings].sort((a,b)=>a-b)[2])/2;
      return {epsilon,lower:midpoint(low),upper:midpoint(high)};
    };
    return {switchEpsilon,switchExact:estimateRoute,maxEpsilon,
      knots:[...stops].sort((a,b)=>a-b).map(midpointBand)};
  }

  function classifyReachMap(values,low,high,certificate) {
    const {meanUnits,medianUnits}=estimateUnits(values);
    const belowWinner=meanUnits===medianUnits?null:meanUnits>medianUnits?"Median":"Mean";
    const aboveWinner=belowWinner==="Median"?"Mean":belowWinner==="Mean"?"Median":null;
    const band=certificate.tieTargets;
    // Below the first estimate-factor zero, its sign cannot change inside the
    // connected reading box. The reference factor is positive below every
    // attainable midpoint and negative above every attainable midpoint.
    const side=band.kind==="all"?null:
      10*Math.round(high*TARGET_SCALE)<band.lowerNumerator?"below":
      10*Math.round(low*TARGET_SCALE)>band.upperNumerator?"above":null;
    const selectedWinner=side==="below"?belowWinner:side==="above"?aboveWinner:null;
    if((certificate.kind==="strict")!==!!selectedWinner||
      selectedWinner&&selectedWinner!==certificate.winner)
      throw new Error("Winner regions disagree with the exact certificate");
    return {belowWinner,aboveWinner,side,selectedWinner};
  }

  function stabilityEdge(values,low,high) {
    const baseline=certifyJointUncertainty(values,low,high,0);
    if(baseline.kind!=="strict") return {kind:"no-baseline",winner:null,lastStrictUnits:null,firstTieUnits:0};
    // Allowed reading boxes are nested as epsilon grows. Once a tie is possible,
    // it remains possible. Search the input's integer millionth grid, while
    // each fixed-epsilon certificate covers all real readings in its boxes.
    let lastStrictUnits=0,firstTieUnits=100*TARGET_SCALE;
    while(firstTieUnits-lastStrictUnits>1) {
      const mid=Math.floor((lastStrictUnits+firstTieUnits)/2);
      if(certifyJointUncertainty(values,low,high,mid/TARGET_SCALE).kind==="strict") lastStrictUnits=mid;
      else firstTieUnits=mid;
    }
    return {kind:"edge",winner:baseline.winner,lastStrictUnits,firstTieUnits};
  }

  if(typeof module==="object"&&module.exports) module.exports={PRESETS,parseView,evaluate,targetWitnesses,certifyInterval,certifyReadingDrift,certifyJointUncertainty,proofReceipt,minimumTieSupport,supportTieAtlas,supportFrontier,continuousSupportFrontier,singleReadingThresholds,tieReachabilityEnvelope,classifyReachMap,stabilityEdge,continuousStabilityThreshold};
  if(typeof document==="undefined") return;

  const $=id=>document.getElementById(id);
  const fmt=value=>String(Number(value.toFixed(6)));
  const fmtFactor=units=>(units/(5*TARGET_SCALE)).toFixed(7).replace(/0+$/g,"").replace(/\.$/,"");
  const fmtTieTarget=n=>{
    const value=BigInt(n),scale=10000000n;
    const fraction=String(value%scale).padStart(7,"0").replace(/0+$/g,"");
    return value/scale+(fraction?"."+fraction:"");
  };
  function fmtRational(rawNumerator,rawDenominator) {
    let numerator=BigInt(rawNumerator),denominator=BigInt(rawDenominator);
    if(numerator*BigInt(TARGET_SCALE)%denominator===0n)
      return fmt(Number(numerator*BigInt(TARGET_SCALE)/denominator)/TARGET_SCALE);
    let a=numerator,b=denominator;
    while(b!==0n) { const remainder=a%b; a=b; b=remainder; }
    numerator/=a; denominator/=a;
    return numerator+"/"+denominator;
  }
  function describeRouteWitness(route,witness) {
    const denominator=BigInt(witness.denominator),target=BigInt(witness.targetNumerator);
    const readings=witness.readingsNumerators.map(BigInt);
    const sum=readings.reduce((total,value)=>total+value,0n);
    const median=[...readings].sort((a,b)=>a<b?-1:a>b?1:0)[2];
    const meanError=sum-5n*target,medianError=median-target;
    const abs=value=>value<0n?-value:value;
    if(abs(meanError)!==5n*abs(medianError)) throw new Error("A route witness does not tie errors");
    return "At ε = "+route.numerator+(route.denominator==="1"?"":"/"+route.denominator)+
      ": readings ["+readings.map(value=>fmtRational(value,denominator)).join(", ")+
      "]; target "+fmtRational(target,denominator)+". Mean "+fmtRational(sum,5n*denominator)+
      " · median "+fmtRational(median,denominator)+" · both absolute errors "+
      fmtRational(abs(meanError),5n*denominator)+".";
  }
  function fmtThresholdApprox(numerator,denominator) {
    const n=BigInt(numerator),d=BigInt(denominator),digits=1000000000n;
    const scaled=n*digits/d;
    const decimal=scaled/digits+"."+String(scaled%digits).padStart(9,"0");
    return n*digits%d===0n?"= "+decimal.replace(/0+$/g,"").replace(/\.$/,""):"≈ "+decimal+"…";
  }
  function sparseWitness(result,values) {
    const certificate=result.certificate,witness=certificate.witness;
    let readings,target,denominator;
    if(witness?.path) {
      const {from,to,targetFromUnits,targetToUnits}=witness.path;
      const n=BigInt(witness.path.numerator),d=BigInt(witness.path.denominator);
      readings=from.map((value,index)=>BigInt(value)*d+BigInt(to[index]-value)*n);
      target=BigInt(targetFromUnits)*d+BigInt(targetToUnits-targetFromUnits)*n;
      denominator=d*BigInt(TARGET_SCALE);
    } else if(witness) {
      readings=witness.readings.map(BigInt);
      target=BigInt(witness.targetUnits);
      denominator=BigInt(TARGET_SCALE);
    } else {
      // A permanent tie at zero drift has no stored path to interpolate.
      const {meanUnits,medianUnits}=estimateUnits(values);
      readings=values.map(value=>BigInt(Math.round(value*TARGET_SCALE)));
      target=BigInt(meanUnits===medianUnits?certificate.lowUnits:(meanUnits+medianUnits)/2);
      denominator=BigInt(TARGET_SCALE);
    }
    const sum=readings.reduce((total,value)=>total+value,0n);
    const middle=[...readings].sort((a,b)=>a<b?-1:a>b?1:0)[2];
    if((sum-5n*middle)*(sum+5n*middle-10n*target)!==0n)
      throw new Error("Sparse witness does not tie absolute errors");
    return {readings,target,denominator,sum,middle};
  }
  const x=value=>58+value*7.12;
  const y=error=>220-error*1.9;
  let current={...PRESETS.a,...defaultInterval(PRESETS.a.target),epsilon:DEFAULT_DRIFT,values:[...PRESETS.a.values],key:"a"};
  let witnesses=targetWitnesses(current.values);
  let cachedEdge={key:null,result:null};
  let cachedPoint={key:null,result:null};
  let cachedDepth={key:null,rows:null};
  let edgeProofCopy="";
  let sparseProofCopy="";
  const supplied=parseView(window.location.search);
  if(supplied) current=supplied;
  if(supplied===false) $("input-error").textContent="That shared view is invalid. Case A is loaded instead.";

  function viewUrl() {
    return "target-lens.html?values="+encodeURIComponent(current.values.map(fmt).join(","))+"&target="+fmt(current.target)+
      "&lo="+fmt(current.low)+"&hi="+fmt(current.high)+"&eps="+fmt(current.epsilon);
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

    const certificate=certifyInterval(current.values,current.low,current.high);
    if(document.activeElement!==$("interval-low")) $("interval-low").value=fmt(current.low);
    if(document.activeElement!==$("interval-high")) $("interval-high").value=fmt(current.high);
    $("interval-span").disabled=sameEstimate;
    $("interval-badge").dataset.kind=certificate.kind;
    $("interval-badge").textContent=certificate.kind==="all-tie"?"Every target ties":
      certificate.kind==="tie-only"?"Exact tie only":certificate.kind==="crosses"?"Both winners possible":
        certificate.kind==="touches"?certificate.winner+" or tie":certificate.winner+" throughout";
    const ruler=$("interval-ruler");
    ruler.dataset.kind=certificate.kind;
    ruler.dataset.left=left;
    ruler.style.setProperty("--break",certificate.boundary+"%");
    ruler.style.setProperty("--low",current.low+"%");
    ruler.style.setProperty("--high",current.high+"%");
    ruler.setAttribute("aria-label","Possible target range "+fmt(current.low)+" to "+fmt(current.high)+
      "; "+$("interval-badge").textContent+". "+(sameEstimate?"Mean and median coincide.":"Exact crossover "+fmt(boundary)+"."));
    $("interval-tie-mark").hidden=sameEstimate;
    $("interval-tie-label").textContent=sameEstimate?"Estimates coincide":"Tie at "+fmt(boundary);
    $("interval-endpoints").textContent=current.low===current.high
      ?"At "+fmt(current.low)+": "+certificate.lower+"."
      :"At "+fmt(current.low)+": "+certificate.lower+". At "+fmt(current.high)+": "+certificate.upper+".";
    $("interval-proof-text").textContent=certificate.kind==="all-tie"
      ?"The mean and median are the same, so every target in this entire range ties."
      :certificate.kind==="tie-only"
        ?"This single target is the exact crossover. Both errors tie here."
        :certificate.kind==="robust"
          ?"The entire range stays on one side of the only crossover at "+fmt(boundary)+
            ". "+certificate.winner+" is strictly closer at every target in it; the nearest endpoint is "+fmt(certificate.margin)+" from a tie."
          :certificate.kind==="touches"
            ?"The range touches the crossover at "+fmt(boundary)+". "+certificate.winner+" is strictly closer at every other target in it."
            :"The range crosses "+fmt(boundary)+". Its endpoints prove a strict "+certificate.lower.toLowerCase()+
              " win and a strict "+certificate.upper.toLowerCase()+" win, with a tie between them. No one strict winner covers the range.";

    const drift=certifyReadingDrift(current.values,current.low,current.high,current.epsilon);
    const exact=certifyJointUncertainty(current.values,current.low,current.high,current.epsilon);
    const edgeKey=current.values.map(value=>Math.round(value*TARGET_SCALE)).join(",")+"|"+
      Math.round(current.low*TARGET_SCALE)+"|"+Math.round(current.high*TARGET_SCALE);
    if(cachedEdge.key!==edgeKey) cachedEdge={key:edgeKey,
      result:stabilityEdge(current.values,current.low,current.high),
      threshold:continuousStabilityThreshold(current.values,current.low,current.high),
      frontier:supportFrontier(current.values,current.low,current.high),
      exactFrontier:continuousSupportFrontier(current.values,current.low,current.high),
      singleReading:singleReadingThresholds(current.values,current.low,current.high)};
    const edge=cachedEdge.result;
    const threshold=cachedEdge.threshold;
    const frontier=cachedEdge.frontier;
    const exactFrontier=cachedEdge.exactFrontier;
    const pointKey=current.values.map(fmt).join(",")+"|"+fmt(current.target);
    if(cachedPoint.key!==pointKey) cachedPoint={key:pointKey,
      result:continuousStabilityThreshold(current.values,current.target,current.target)};
    const pointEdge=cachedPoint.result;
    if(pointEdge.kind!=="edge"&&pointEdge.kind!=="no-baseline")
      throw new Error("Every target must tie when all five readings can move by 100");
    const singleReading=cachedEdge.singleReading;
    if(document.activeElement!==$("drift-input")) $("drift-input").value=fmt(current.epsilon);
    $("drift-badge").dataset.kind=exact.kind;
    $("drift-badge").textContent=exact.kind==="strict"?exact.winner+" guaranteed":
      exact.kind==="all-tie"?"Every setting ties":"A tie can occur";
    $("drift-estimate-range").textContent="["+exact.estimateRangeUnits.map(fmtFactor).join(", ")+"]";
    $("drift-reference-range").textContent="["+exact.referenceRangeUnits.map(fmtFactor).join(", ")+"]";
    const factorName=exact.tieFactor==="estimate"?"mean − median":"mean + median − 2×target";
    $("drift-exact-text").textContent=exact.kind==="strict"
      ?"Neither factor can reach zero. Their signs stay "+(exact.estimateRangeUnits[0]>0?"positive":"negative")+
        " and "+(exact.referenceRangeUnits[0]>0?"positive":"negative")+
        ", so their product keeps "+exact.winner.toLowerCase()+" strictly closer for every allowed reading configuration and every target in the interval."
      :exact.kind==="all-tie"
        ?"Mean and median coincide for every allowed set of readings, so every target ties."
        :"The factor "+factorName+" reaches zero within the allowed continuous ranges. Its extremes occur at allowed readings and targets; moving between them passes through an exact tie. A strict winner cannot cover every configuration.";
    $("drift-witness").hidden=!exact.witness;
    if(exact.witness) $("drift-witness").textContent=exact.witness.path
      ?"Exact tie construction: interpolate the readings from ["+
        exact.witness.path.from.map(units=>fmt(units/TARGET_SCALE)).join(", ")+"] to ["+
        exact.witness.path.to.map(units=>fmt(units/TARGET_SCALE)).join(", ")+"], with "+
        (exact.witness.path.targetFromUnits===exact.witness.path.targetToUnits
          ?"target fixed at "+fmt(exact.witness.path.targetFromUnits/TARGET_SCALE)
          :"target moving from "+fmt(exact.witness.path.targetFromUnits/TARGET_SCALE)+" to "+
            fmt(exact.witness.path.targetToUnits/TARGET_SCALE))+", at fraction "+
        exact.witness.path.numerator+"/"+exact.witness.path.denominator+
        " of the path. At that exact fraction the "+(exact.tieFactor==="estimate"?"mean equals the median":"target is the mean–median midpoint")+"; both errors tie."
      :"Exact tie witness: readings "+exact.witness.readings.map(units=>fmt(units/TARGET_SCALE)).join(", ")+
        "; target "+fmt(exact.witness.targetUnits/TARGET_SCALE)+". Both estimates have equal absolute error.";
    const sparse=minimumTieSupport(current.values,current.low,current.high,current.epsilon);
    const sparseReachable=sparse.kind==="tie";
    const depthKey=current.values.map(value=>Math.round(value*TARGET_SCALE)).join(",")+"|"+
      Math.round(current.epsilon*TARGET_SCALE);
    if(cachedDepth.key!==depthKey) cachedDepth={key:depthKey,
      rows:supportTieAtlas(current.values,current.epsilon)};
    const depth=cachedDepth.rows;
    const intersects=row=>row.kind==="all"||
      Math.round(current.low*TARGET_SCALE)*10<=row.upperNumerator&&
      Math.round(current.high*TARGET_SCALE)*10>=row.lowerNumerator;
    const firstDepth=depth.find(intersects);
    if((!!firstDepth)!==sparseReachable||firstDepth&&firstDepth.count!==sparse.count||
      depth[5].kind!==exact.tieTargets.kind||
      depth[5].lowerNumerator!==exact.tieTargets.lowerNumerator||
      depth[5].upperNumerator!==exact.tieTargets.upperNumerator)
      throw new Error("Tie depth atlas disagrees with the exact certificates");
    for(const row of depth) {
      const low=fmtTieTarget(row.lowerNumerator),high=fmtTieTarget(row.upperNumerator);
      const track=$("depth-track-"+row.count),label=$("depth-label-"+row.count);
      track.dataset.kind=row.kind;
      track.style.setProperty("--tie-start",(row.kind==="all"?0:row.lowerNumerator/row.denominator)+"%");
      track.style.setProperty("--tie-end",(row.kind==="all"?100:row.upperNumerator/row.denominator)+"%");
      track.style.setProperty("--range-start",current.low+"%");
      track.style.setProperty("--range-end",current.high+"%");
      track.setAttribute("aria-label","At most "+row.count+" "+(row.count===1?"reading":"readings")+
        " may move by ε = "+fmt(current.epsilon)+
        ". "+(row.kind==="all"?"Every target can tie":"Tie targets "+low+" to "+high)+
        ". Selected range "+fmt(current.low)+" to "+fmt(current.high)+
        (intersects(row)?" intersects.":" is outside."));
      label.textContent=row.kind==="all"?"Every target can tie":
        low===high?"Tie at "+low:"Tie: "+low+"–"+high;
      $("depth-row-"+row.count).dataset.first=String(firstDepth===row);
    }
    $("depth-conclusion").textContent=firstDepth?
      "The selected range first reaches a tie with at most "+firstDepth.count+
        " movable reading"+(firstDepth.count===1?"":"s")+". Every smaller budget is strictly excluded.":
      "The selected range cannot tie even when all five readings may move by this drift.";
    $("sparse-count").textContent=sparseReachable?String(sparse.count):"—";
    $("sparse-status").textContent=sparseReachable?
      sparse.count===0?"Already ties without moving readings":
        sparse.count+" of 5 readings can force a tie":
      "No tie within this drift";
    $("sparse-proof").textContent=sparseReachable?
      sparse.count===0?"The fixed readings already admit an exact tie for a target in this interval. Zero moved readings is minimal.":
        "Every subset with fewer than "+sparse.count+
        " movable readings keeps a strict winner for every real adjustment in its box and every target in the range ("+
        "checked: "+sparse.strictBelow+"). The witness below uses the first successful subset of size "+sparse.count+".":
      "All 32 subsets of the five readings keep a strict winner at this drift, including the box where all five can move. Increase the drift or change the target range to find a tie.";
    $("sparse-witness").hidden=!sparseReachable;
    $("sparse-copy").disabled=!sparseReachable;
    if(sparseReachable) {
      const proof=sparseWitness(sparse,current.values),{readings,target,denominator,sum,middle}=proof;
      const moves=readings.map((value,index)=>{
        const original=BigInt(Math.round(current.values[index]*TARGET_SCALE))*
          denominator/BigInt(TARGET_SCALE);
        const delta=value-original;
        const move=fmt(current.values[index])+" → "+fmtRational(value,denominator)+
          (delta===0n?" · fixed":" · "+(delta<0n?"−":"+")+fmtRational(delta<0n?-delta:delta,denominator));
        const item=$("sparse-changes").children[index];
        item.textContent=move;
        item.dataset.moved=String(delta!==0n);
        return "Reading "+(index+1)+": "+move;
      });
      const error=sum-5n*target,absError=error<0n?-error:error;
      const outcome="Target "+fmtRational(target,denominator)+" · mean "+
        fmtRational(sum,5n*denominator)+" · median "+fmtRational(middle,denominator)+
        " · equal absolute errors "+fmtRational(absError,5n*denominator)+".";
      $("sparse-outcome").textContent=outcome;
      sparseProofCopy=["Target Lens / minimum moved readings certificate",
        "Starting readings: "+current.values.map(fmt).join(", "),
        "Possible target range: ["+fmt(current.low)+", "+fmt(current.high)+"]",
        "Maximum change per movable reading ε = "+fmt(current.epsilon),
        "Model: selected readings may change continuously and independently within ε and [0, 100]; other readings remain fixed; target may be any real in the range.",
        "Minimum movable readings: "+sparse.count+" of 5",
        "All smaller subsets certified strict: "+sparse.strictBelow,
        "Selected reading indices: "+(sparse.count?Array.from({length:5},(_,index)=>index+1).filter(index=>sparse.mask&(1<<(index-1))).join(", "):"none"),
        "Tie factor: "+(sparse.certificate.tieFactor==="estimate"||sparse.certificate.kind==="all-tie"
          ?"mean − median":"mean + median − 2×target"),
        ...moves,outcome,
        "Reproduce view: "+new URL(viewUrl(),window.location.href).href].join("\n");
    } else sparseProofCopy="";
    $("sparse-copy-status").textContent="";
    $("frontier-rows").hidden=frontier.kind!=="frontier";
    $("frontier-proof").textContent=frontier.kind==="baseline-tie"
      ?"The fixed readings already tie at a target in this range. No reading change is needed."
      :"For every subset, the two tie factors are affine between finitely many reading clipping and median-order landmarks. Their first exact rational zero gives a boundary witness; all earlier real drifts stay strict. Independent six-decimal box checks find the adjacent selectable settings. Unreachable rows stay strict through ε = 100. More movable readings can only bring the first tie earlier.";
    if(frontier.kind==="frontier") for(const row of frontier.rows) {
      const {count,firstTieUnits}=row,reachable=firstTieUnits!==null;
      const exactRow=exactFrontier.rows[count-1];
      if(reachable!==(exactRow.kind==="edge")||reachable&&firstTieUnits!==exactRow.firstTieUnits)
        throw new Error("Continuous and selectable support frontiers disagree");
      const selected=reachable&&Math.round(current.epsilon*TARGET_SCALE)>=firstTieUnits;
      const item=$("frontier-row-"+count);
      item.dataset.reached=String(selected);
      item.dataset.current=String(selected&&count===sparse.count);
      $("frontier-exact-"+count).textContent=reachable?
        "Exact ε = "+exactRow.numerator+(exactRow.denominator==="1"?"":"/"+exactRow.denominator):"No continuous tie";
      $("frontier-threshold-"+count).textContent=reachable?
        "First selectable ε = "+fmt(firstTieUnits/TARGET_SCALE):"No tie through ε = 100";
      $("frontier-selection-"+count).textContent=reachable?
        "Exact witness subset: "+Array.from({length:5},(_,index)=>index+1).filter(index=>exactRow.mask&(1<<(index-1))).join(", "):
        "No subset of this size can force a tie";
      $("frontier-detail-"+count).hidden=!reachable;
      $("frontier-witness-"+count).textContent=reachable?
        (exactRow.factor==="estimate"?"Mean meets median. ":"Target meets the mean–median midpoint. ")+
        describeRouteWitness(exactRow,exactRow.witness)+
        " All smaller real ε are strict for every subset of this size.":"";
      $("frontier-button-"+count).disabled=!reachable;
    }
    $("single-rows").hidden=singleReading.kind!=="frontier";
    $("single-proof").textContent=singleReading.kind==="baseline-tie"
      ?"The fixed readings already admit a tie for a target in this range. No reading change is needed."
      :"Each row freezes the other four readings. The exact box proof excludes every smaller real drift for that reading; a separate six-decimal search checks the first selectable setting. These are possible changes, not evidence that a reading is wrong.";
    if(singleReading.kind==="frontier") for(const row of singleReading.rows) {
      const number=row.index+1,reachable=row.firstTieUnits!==null;
      $("single-reading-"+number).textContent="Reading "+number+" · "+fmt(row.value);
      $("single-row-"+number).dataset.reached=String(reachable&&
        Math.round(current.epsilon*TARGET_SCALE)>=row.firstTieUnits);
      $("single-exact-"+number).textContent=reachable?
        "Exact ε = "+row.exact.numerator+(row.exact.denominator==="1"?"":"/"+row.exact.denominator):
        "No tie through ε = 100";
      $("single-grid-"+number).textContent=reachable?
        "First selectable ε = "+fmt(row.firstTieUnits/TARGET_SCALE):
        "This reading alone cannot force a tie";
      $("single-detail-"+number).hidden=!reachable;
      $("single-witness-"+number).textContent=reachable?
        (row.exact.factor==="estimate"?"Mean meets median. ":"Target meets the mean–median midpoint. ")+
        describeRouteWitness(row.exact,row.exact.witness)+
        " The other four readings stay fixed. Every smaller real ε is strict for this one-reading box.":"";
      $("single-button-"+number).disabled=!reachable;
    }
    const tieTargets=exact.tieTargets,allTieTargets=tieTargets.kind==="all";
    const bandLow=fmtTieTarget(tieTargets.lowerNumerator),bandHigh=fmtTieTarget(tieTargets.upperNumerator);
    const targetOverlap=allTieTargets||
      Math.round(current.low*TARGET_SCALE)*10<=tieTargets.upperNumerator&&
      Math.round(current.high*TARGET_SCALE)*10>=tieTargets.lowerNumerator;
    $("tie-window-range").textContent=allTieTargets?"Every target from 0 to 100 can tie":
      bandLow===bandHigh?"Only target "+bandLow+" can tie":"Tie targets: "+bandLow+" to "+bandHigh;
    $("tie-window-proof").textContent=allTieTargets
      ?"At least one allowed reading arrangement has mean = median, so that arrangement ties at every target. The attainable midpoint band is ["+bandLow+", "+bandHigh+"], but the coincident estimates extend ties to all targets."
      :"The midpoint of the mean and median ranges continuously from "+bandLow+" with all readings at their allowed lows to "+bandHigh+
        " with all readings at their allowed highs. "+(targetOverlap
          ?"Your selected target range meets this band, so a tie is attainable."
          :"Your selected target range stays outside this band, so no tie is attainable at this drift.");
    const track=$("tie-track");
    track.style.setProperty("--tie-start",(allTieTargets?0:tieTargets.lowerNumerator/tieTargets.denominator)+"%");
    track.style.setProperty("--tie-end",(allTieTargets?100:tieTargets.upperNumerator/tieTargets.denominator)+"%");
    track.style.setProperty("--range-start",current.low+"%");
    track.style.setProperty("--range-end",current.high+"%");
    track.setAttribute("aria-label",$("tie-window-range").textContent+
      "; selected target range "+fmt(current.low)+" to "+fmt(current.high)+" on a 0 to 100 scale. "+
      (targetOverlap?"A tie is attainable.":"No tie is attainable at this drift."));
    if((exact.kind!=="strict")!==targetOverlap) throw new Error("Tie target band disagrees with the exact certificate");
    const reach=tieReachabilityEnvelope(current.values,current.epsilon);
    const winnerMap=classifyReachMap(current.values,current.low,current.high,exact);
    const plotX=value=>60+9.1*value;
    const plotY=value=>320-280*value/reach.maxEpsilon;
    const point=record=>plotX(record.target).toFixed(3)+" "+plotY(record.epsilon).toFixed(3);
    const lowerPoints=reach.knots.map(knot=>({target:knot.lower,epsilon:knot.epsilon}));
    const upperPoints=[...reach.knots].reverse().map(knot=>({target:knot.upper,epsilon:knot.epsilon}));
    $("reach-map-band").setAttribute("d",reach.switchEpsilon===0?"":
      "M "+point(lowerPoints[0])+" L "+[...lowerPoints.slice(1),...upperPoints].map(point).join(" L ")+" Z");
    for(const [side,edge,axisTarget,winner] of [["below","lower",0,winnerMap.belowWinner],
      ["above","upper",100,winnerMap.aboveWinner]]) {
      const path=reach.switchEpsilon===0?"":
        "M "+point({target:axisTarget,epsilon:0})+" L "+
        reach.knots.map(knot=>point({target:knot[edge],epsilon:knot.epsilon})).join(" L ")+
        " L "+point({target:axisTarget,epsilon:reach.switchEpsilon})+" Z";
      $("reach-map-"+side).setAttribute("d",path);
      $("reach-map-"+side).setAttribute("data-winner",winner||"");
      $("reach-map-"+side+"-label").textContent=winner?
        winner+" guaranteed · "+side+" tie band":"No strict region · "+side;
      $("reach-map-"+side+"-label").setAttribute("data-winner",winner||"");
    }
    const switchY=plotY(reach.switchEpsilon),currentY=plotY(current.epsilon);
    $("reach-map-all").setAttribute("y","40");
    $("reach-map-all").setAttribute("height",Math.max(0,switchY-40).toFixed(3));
    for(const [id,yPosition] of [["reach-map-switch-line",switchY],["reach-map-current-line",currentY],
      ["reach-map-selection",currentY]]) {
      $(id).setAttribute("y1",yPosition.toFixed(3));
      $(id).setAttribute("y2",yPosition.toFixed(3));
    }
    $("reach-map-switch-line").setAttribute("visibility",reach.switchExact?"visible":"hidden");
    $("reach-map-selection").setAttribute("x1",plotX(current.low).toFixed(3));
    $("reach-map-selection").setAttribute("x2",plotX(current.high).toFixed(3));
    const pointEpsilon=pointEdge.kind==="edge"?
      Number(pointEdge.numerator)/Number(pointEdge.denominator):0;
    const pointX=plotX(current.target).toFixed(3),pointY=plotY(pointEpsilon).toFixed(3);
    for(const id of ["reach-map-point-line","reach-map-point-dot"])
      $(id).setAttribute(id.endsWith("line")?"x1":"cx",pointX);
    $("reach-map-point-line").setAttribute("x2",pointX);
    $("reach-map-point-line").setAttribute("y1","320");
    $("reach-map-point-line").setAttribute("y2",pointY);
    $("reach-map-point-dot").setAttribute("cy",pointY);
    $("reach-map-max").textContent=fmt(reach.maxEpsilon);
    const switchLabel=reach.switchExact?reach.switchExact.numerator+
      (reach.switchExact.denominator==="1"?"":"/"+reach.switchExact.denominator):"0";
    $("reach-map-verdict").textContent=winnerMap.selectedWinner?
      winnerMap.selectedWinner+" is guaranteed for every allowed reading arrangement and target in your selected range at ε = "+
        fmt(current.epsilon)+".":
      "A tie is attainable in your selected range at ε = "+fmt(current.epsilon)+".";
    $("reach-map-verdict").setAttribute("data-winner",winnerMap.selectedWinner||"Equal");
    $("reach-map-caption").textContent="The gold all-target region begins at exact ε = "+switchLabel+
      ". The white line marks current ε = "+fmt(current.epsilon)+"; its rose segment is your "+
      fmt(current.low)+"–"+fmt(current.high)+" target range. "+(targetOverlap?
        "This range reaches a tie.":"The full range lies "+winnerMap.side+" the tie band, where "+
          winnerMap.selectedWinner.toLowerCase()+" is strictly closer.")+
      " Vertical scale: ε = 0 to "+fmt(reach.maxEpsilon)+".";
    $("reach-map").setAttribute("aria-label","Target versus drift from ε 0 to "+fmt(reach.maxEpsilon)+
      ". "+(winnerMap.belowWinner?winnerMap.belowWinner+" is guaranteed below the midpoint tie band; "+
        winnerMap.aboveWinner+" is guaranteed above it. ":"")+"Midpoint ties fill a band until exact ε "+switchLabel+
      "; from that drift onward every target can tie. Selected target range "+fmt(current.low)+
      " to "+fmt(current.high)+" at ε "+fmt(current.epsilon)+". "+
      (targetOverlap?"A tie is attainable.":winnerMap.selectedWinner+
        " is guaranteed throughout the selected range. No tie is attainable at this setting.")+
      " The first tie at exact target "+fmt(current.target)+" is at ε "+
      (pointEdge.kind==="edge"?pointEdge.numerator+"/"+pointEdge.denominator:"0")+".");
    $("point-target").textContent=fmt(current.target);
    $("point-exact").textContent=pointEdge.kind==="edge"?
      pointEdge.numerator+"/"+pointEdge.denominator:"0 · already tied";
    $("point-grid").textContent="First selectable ε = "+
      (pointEdge.kind==="edge"?fmt(pointEdge.firstTieUnits/TARGET_SCALE):"0");
    const rangeExact=threshold.kind==="edge"?
      threshold.numerator+"/"+threshold.denominator:"0";
    const inside=current.target>=current.low&&current.target<=current.high;
    $("point-proof").textContent=(pointEdge.kind==="edge"
      ?"Every smaller continuous drift keeps "+pointEdge.winner.toLowerCase()+
        " strictly closer at target "+fmt(current.target)+". At the exact threshold, "+
        (pointEdge.factor==="estimate"?"mean can meet median":"that target can meet the mean–median midpoint")+"."
      :"The fixed readings already tie at this exact target.")+
      " Your selected "+fmt(current.low)+"–"+fmt(current.high)+
      " range first ties at ε = "+rangeExact+". "+(inside
        ?"It can use any target inside the range, so it can tie no later than this single target."
        :"That range does not contain this exact target.");
    $("point-witness").hidden=pointEdge.kind!=="edge";
    $("point-witness-text").textContent=pointEdge.kind==="edge"?
      describeRouteWitness({numerator:pointEdge.numerator,denominator:pointEdge.denominator},pointEdge.witness):"";
    $("edge-last-strict").textContent=edge.kind==="edge"?fmt(edge.lastStrictUnits/TARGET_SCALE):"—";
    $("edge-exact-fraction").textContent=threshold.kind==="edge"?
      threshold.numerator+"/"+threshold.denominator:"—";
    $("edge-exact-decimal").textContent=threshold.kind==="edge"?
      fmtThresholdApprox(threshold.numerator,threshold.denominator):"";
    for(const factor of ["estimate","reference"]) {
      const route=threshold.kind==="edge"?threshold.routes[factor]:null;
      $("edge-"+factor+"-threshold").textContent=route?
        route.numerator+(route.denominator==="1"?"":"/"+route.denominator):"—";
      $("edge-"+factor+"-route").dataset.active=String(!!route&&
        BigInt(route.numerator)*BigInt(threshold.denominator)===
          BigInt(threshold.numerator)*BigInt(route.denominator));
      $("edge-"+factor+"-detail").hidden=!route;
      $("edge-"+factor+"-witness").textContent=route?
        describeRouteWitness(route,threshold.routeWitnesses[factor]):"";
    }
    $("edge-first-tie").textContent=fmt(edge.firstTieUnits/TARGET_SCALE);
    $("edge-last-button").disabled=edge.kind!=="edge";
    $("edge-first-button").disabled=edge.kind!=="edge";
    $("edge-status").textContent=edge.kind==="edge"
      ?"For every allowed set of readings and target, "+edge.winner+" is strictly closer through "+fmt(edge.lastStrictUnits/TARGET_SCALE)+
        ". The exact continuous threshold is "+threshold.numerator+"/"+threshold.denominator+
        "; "+(threshold.factor==="estimate"?"mean − median":"mean + median − 2×target")+
        " reaches zero there"+(threshold.routes.estimate.numerator===threshold.routes.reference.numerator&&
          threshold.routes.estimate.denominator===threshold.routes.reference.denominator?" alongside the other factor":" first")+
        ". The first selectable tie setting is "+fmt(edge.firstTieUnits/TARGET_SCALE)+"."
      :"The target range already permits a tie at zero drift. Narrow it to find a strict stability edge.";
    $("edge-proof").hidden=threshold.kind!=="edge";
    if(threshold.kind==="edge") {
      const proof=threshold.witness;
      const denominator=BigInt(proof.denominator),target=BigInt(proof.targetNumerator);
      const readingNumerators=proof.readingsNumerators.map(BigInt);
      const meanNumerator=readingNumerators.reduce((total,value)=>total+value,0n);
      const medianNumerator=[...readingNumerators].sort((a,b)=>a<b?-1:a>b?1:0)[2];
      const meanError=meanNumerator-5n*target,medianError=medianNumerator-target;
      if((meanError<0n?-meanError:meanError)!==5n*(medianError<0n?-medianError:medianError))
        throw new Error("The threshold witness does not tie absolute errors");
      const equalError=fmtRational(meanError<0n?-meanError:meanError,5n*denominator);
      const targetText=fmtRational(target,denominator);
      const moves=readingNumerators.map((value,index)=>{
        const starting=BigInt(Math.round(current.values[index]*TARGET_SCALE))*denominator/BigInt(TARGET_SCALE);
        const change=value-starting;
        const move=fmt(current.values[index])+" → "+fmtRational(value,denominator)+
          " · "+(change<0n?"−":"+")+fmtRational(change<0n?-change:change,denominator);
        $("edge-changes").children[index].textContent=move;
        return "Reading "+(index+1)+": "+move;
      });
      $("edge-proof-text").textContent="At exact drift "+threshold.numerator+"/"+threshold.denominator+
        ", the five admissible changes below tie at target "+targetText+". Every smaller drift box keeps a strict "+
        threshold.winner.toLowerCase()+" win.";
      $("edge-outcome").textContent="Mean "+fmtRational(meanNumerator,5n*denominator)+
        " · median "+fmtRational(medianNumerator,denominator)+" · both absolute errors "+equalError+".";
      const proofUrl=new URL(viewUrl(),window.location.href);
      proofUrl.searchParams.set("eps",fmt(edge.firstTieUnits/TARGET_SCALE));
      edgeProofCopy=["Target Lens / exact continuous stability certificate",
        "Starting readings: "+current.values.map(fmt).join(", "),
        "Possible target range: ["+fmt(current.low)+", "+fmt(current.high)+"]",
        "Model: each reading independently changes by at most ε within [0, 100]; target may be any real value in the range.",
        "Strict winner below threshold: "+threshold.winner,
        "Exact threshold ε = "+threshold.numerator+"/"+threshold.denominator,
        "Mean meets median at ε = "+$("edge-estimate-threshold").textContent,
        "Target meets mean–median midpoint at ε = "+$("edge-reference-threshold").textContent,
        "Estimate route witness: "+$("edge-estimate-witness").textContent,
        "Reference route witness: "+$("edge-reference-witness").textContent,
        "First zero factor: "+(threshold.factor==="estimate"?"mean − median":"mean + median − 2×target"),
        ...moves,"Tie target: "+targetText,$("edge-outcome").textContent,
        "Last six-decimal strict setting: "+fmt(edge.lastStrictUnits/TARGET_SCALE),
        "First six-decimal tie setting: "+fmt(edge.firstTieUnits/TARGET_SCALE),
        "Reproduce selectable setting: "+proofUrl.href].join("\n");
    } else {
      edgeProofCopy="";
    }
    $("edge-copy-status").textContent="";
    $("drift-shortcut-status").textContent=drift.kind==="certified"?"Shortcut certifies "+drift.winner:
      drift.kind==="inconclusive"?"Shortcut inconclusive":"No strict baseline";
    $("drift-gap").textContent=drift.kind==="no-baseline"?"—":fmt(drift.gap);
    $("drift-allowance").textContent=fmt(drift.allowance);
    $("drift-remaining").textContent=drift.kind==="no-baseline"?"—":fmt(drift.remaining);
    $("drift-remaining").dataset.kind=drift.kind;
    $("drift-proof-text").textContent=drift.kind==="no-baseline"
      ?"The chosen target range has no strict winner throughout even before readings move. Narrow the range to one side of the tie to test stability."
      :drift.kind==="certified"
        ?"Every target in the range still favors "+drift.winner.toLowerCase()+" after any allowed adjustment of the five readings. The worst starting lead is "+fmt(drift.gap)+
          "; moving each reading by at most "+fmt(current.epsilon)+" can reduce that lead by at most "+fmt(drift.allowance)+". A positive lead of at least "+fmt(drift.remaining)+" remains."
        :"The starting lead can be as small as "+fmt(drift.gap)+", while this bound allows a drop of "+fmt(drift.allowance)+
          ". The bound cannot certify a strict winner; it does not prove that a reversal is possible.";

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
  function setIntervalEnd(key,raw) {
    const parsed=validNumber(String(raw),targetPattern);
    if(parsed===null||key==="low"&&parsed>current.high||key==="high"&&parsed<current.low) {
      $("interval-error").textContent="Use bounds from 0 to 100, at most six decimal places, with low ≤ high.";
      return;
    }
    $("interval-error").textContent="";
    current[key]=parsed;
    render();
  }
  for(const [id,key] of [["interval-low","low"],["interval-high","high"]]) {
    $(id).addEventListener("input",event=>setIntervalEnd(key,event.target.value));
    $(id).addEventListener("change",event=>{
      event.target.value=fmt(current[key]);
    });
  }
  $("drift-input").addEventListener("input",event=>{
    const parsed=validNumber(event.target.value,targetPattern);
    if(parsed===null) {
      $("drift-error").textContent="Use a reading drift from 0 to 100 with at most six decimal places.";
      return;
    }
    $("drift-error").textContent="";
    current.epsilon=parsed;
    render();
  });
  $("drift-input").addEventListener("change",event=>{event.target.value=fmt(current.epsilon);});
  for(const [id,key] of [["edge-last-button","lastStrictUnits"],["edge-first-button","firstTieUnits"]]) {
    $(id).addEventListener("click",()=>{
      if(cachedEdge.result.kind!=="edge") return;
      current.epsilon=cachedEdge.result[key]/TARGET_SCALE;
      $("drift-error").textContent="";
      render();
    });
  }
  $("point-open").addEventListener("click",()=>{
    const point=cachedPoint.result;
    current.low=current.target;
    current.high=current.target;
    current.epsilon=point.kind==="edge"?point.firstTieUnits/TARGET_SCALE:0;
    $("interval-error").textContent="";
    $("drift-error").textContent="";
    render();
    if(point.kind==="edge") {
      $("edge-proof").open=true;
      $("edge-proof").scrollIntoView({block:"center"});
    } else $("tie-window").scrollIntoView({block:"center"});
  });
  for(let count=1;count<=5;count++) $("frontier-button-"+count).addEventListener("click",()=>{
    const row=cachedEdge.frontier.rows[count-1];
    if(row?.firstTieUnits===null||!row) return;
    current.epsilon=row.firstTieUnits/TARGET_SCALE;
    $("drift-error").textContent="";
    render();
    $("sparse-witness").scrollIntoView({block:"center"});
  });
  for(let number=1;number<=5;number++) $("single-button-"+number).addEventListener("click",()=>{
    const row=cachedEdge.singleReading.rows[number-1];
    if(!row||row.firstTieUnits===null) return;
    current.epsilon=row.firstTieUnits/TARGET_SCALE;
    $("drift-error").textContent="";
    render();
    $("single-detail-"+number).open=true;
    $("single-row-"+number).scrollIntoView({block:"center"});
  });
  $("edge-copy").addEventListener("click",async()=>{
    if(!edgeProofCopy) return;
    try {
      await navigator.clipboard.writeText(edgeProofCopy);
      $("edge-copy-status").textContent="Exact certificate copied.";
    } catch (_) {
      $("edge-copy-status").textContent="Copy unavailable here. Use the witness above and the exact view link below.";
    }
  });
  $("sparse-copy").addEventListener("click",async()=>{
    if(!sparseProofCopy) return;
    try {
      await navigator.clipboard.writeText(sparseProofCopy);
      $("sparse-copy-status").textContent="Minimum-support certificate copied.";
    } catch (_) {
      $("sparse-copy-status").textContent="Copy unavailable here. Use the witness and exact view link below.";
    }
  });
  $("drift-example").addEventListener("click",()=>{
    current={...PRESETS.a,values:[...PRESETS.a.values],target:0.5,low:0,high:1,epsilon:4,
      label:"Exact-proof example",key:null};
    $("input-error").textContent="";
    $("interval-error").textContent="";
    $("drift-error").textContent="";
    render();
  });
  $("interval-span").addEventListener("click",()=>{
    const {mean,median}=evaluate(current.values,current.target);
    current.low=Math.min(mean,median);
    current.high=Math.max(mean,median);
    $("interval-error").textContent="";
    render();
  });
  document.querySelectorAll(".preset").forEach(button=>button.addEventListener("click",()=>{
    const selected=button.dataset.case;
    current={...PRESETS[selected],...defaultInterval(PRESETS[selected].target),epsilon:DEFAULT_DRIFT,values:[...PRESETS[selected].values],key:selected};
    $("input-error").textContent="";
    $("interval-error").textContent="";
    $("drift-error").textContent="";
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
  $("download-proof").addEventListener("click",()=>{
    const receipt=proofReceipt(current.values,current.low,current.high,current.epsilon,current.target);
    const blob=new Blob([JSON.stringify(receipt,null,2)+"\n"],{type:"application/json"});
    const link=document.createElement("a");
    const url=URL.createObjectURL(blob);
    link.href=url;
    link.download="inward-target-lens-proof.json";
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    $("share-status").textContent="Proof receipt downloaded. Verify it with node tools/verify-target-lens.cjs inward-target-lens-proof.json.";
  });
  render();
})();
