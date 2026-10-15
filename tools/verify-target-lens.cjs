#!/usr/bin/env node
"use strict";
const fs=require("node:fs");
const crypto=require("node:crypto");
const {verify,parseReceipt}=require("./target-lens-proof-core.js");
if(require.main===module) {
  try {
    if(process.argv.length!==3) throw new Error("Usage: node tools/verify-target-lens.cjs receipt.json");
    const bytes=fs.readFileSync(process.argv[2]);
    if(bytes.length>1000000) throw new Error("Receipt too large");
    const file=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes);
    const result=verify(parseReceipt(file));
    console.log(`Verified ${result.kind}${result.winner?` · ${result.winner} throughout`:""}`);
    console.log(`Receipt SHA-256: ${crypto.createHash("sha256").update(Buffer.from(file,"utf8")).digest("hex")}`);
  } catch(error) { console.error(`Verification failed: ${error.message}`); process.exitCode=1; }
}
module.exports={verify};
