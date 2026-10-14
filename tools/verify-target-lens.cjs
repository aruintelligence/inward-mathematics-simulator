#!/usr/bin/env node
"use strict";
const fs=require("node:fs");
const {verify}=require("./target-lens-proof-core.js");
if(require.main===module) {
  try {
    if(process.argv.length!==3) throw new Error("Usage: node tools/verify-target-lens.cjs receipt.json");
    const file=fs.readFileSync(process.argv[2],"utf8");
    if(file.length>1000000) throw new Error("Receipt too large");
    const result=verify(JSON.parse(file));
    console.log(`Verified ${result.kind}${result.winner?` · ${result.winner} throughout`:""}`);
  } catch(error) { console.error(`Verification failed: ${error.message}`); process.exitCode=1; }
}
module.exports={verify};
