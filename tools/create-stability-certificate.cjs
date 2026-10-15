#!/usr/bin/env node
"use strict";

// Produce a portable claim with the JavaScript threshold implementation.
// The Python checker recomputes the threshold without calling this module.
const fs=require("node:fs");
const {verify}=require("./target-lens-proof-core.js");
const {continuousStabilityThreshold}=require("../target-lens.js");

function create(receipt,mask=31) {
  if(!Number.isInteger(mask)||mask<0||mask>31) throw new Error("Mask must be an integer from 0 to 31");
  verify(receipt);
  const {readings,low,high}=receipt.inputs;
  const edge=continuousStabilityThreshold(readings.map(value=>value/1000000),
    low/1000000,high/1000000,mask);
  let claim;
  if(edge.kind==="no-baseline") claim={kind:"no-baseline"};
  else if(edge.kind==="unreachable") claim={kind:"unreachable",winner:edge.winner};
  else if(edge.kind==="edge") {
    const routes={};
    for(const factor of ["estimate","reference"])
      routes[factor]=edge.routes[factor]===null?null:{
        radius:edge.routes[factor],witness:edge.routeWitnesses[factor]};
    claim={kind:"edge",winner:edge.winner,firstRoute:edge.factor,
      radius:{numerator:edge.numerator,denominator:edge.denominator},
      firstTieUnits:edge.firstTieUnits,routes};
  } else throw new Error("Unknown stability result");
  return {format:"inward-stability-edge-certificate-v1",sourceReceipt:receipt,mask,claim};
}

if(require.main===module) {
  try {
    if(process.argv.length!==3&&process.argv.length!==5)
      throw new Error("Usage: node tools/create-stability-certificate.cjs receipt.json [--mask 0..31]");
    if(process.argv.length===5&&process.argv[3]!=="--mask") throw new Error("Expected --mask");
    const mask=process.argv.length===5&&/^(?:[0-9]|[12][0-9]|3[01])$/.test(process.argv[4])
      ?Number(process.argv[4]):process.argv.length===3?31:NaN;
    const bytes=fs.readFileSync(process.argv[2]);
    if(bytes.length>1000000) throw new Error("Receipt too large");
    const source=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
    console.log(JSON.stringify(create(JSON.parse(source),mask),null,2));
  } catch(error) { console.error(`Certificate creation failed: ${error.message}`); process.exitCode=1; }
}

module.exports={create};
