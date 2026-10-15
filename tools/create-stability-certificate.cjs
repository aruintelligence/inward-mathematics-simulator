#!/usr/bin/env node
"use strict";

// Produce a portable claim with the JavaScript threshold implementation.
// The Python checker recomputes the threshold without calling this module.
const fs=require("node:fs");
const {verify}=require("./target-lens-proof-core.js");
const {stabilityCertificate}=require("../target-lens.js");

function create(receipt,mask=31) {
  verify(receipt);
  return stabilityCertificate(receipt,mask);
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
