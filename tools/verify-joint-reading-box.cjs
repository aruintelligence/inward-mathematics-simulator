#!/usr/bin/env node
/* Independently check a joint reading-box receipt with exact BigInt fractions. */
const {readFileSync} = require('node:fs');
const {createHash} = require('node:crypto');
const {parseReceipt, verify} = require('../joint-reading-box-verifier.js');

try {
  if (process.argv.length !== 3) throw new Error('Usage: node tools/verify-joint-reading-box.cjs receipt.json');
  const raw = readFileSync(process.argv[2]);
  if (raw.length > 2_000_000) throw new Error('Certificate exceeds 2 MB');
  const text = new TextDecoder('utf-8', {fatal: true}).decode(raw);
  const result = verify(parseReceipt(text));
  console.log(`Verified conditional verdict: ${result.verdict}`);
  if (result.squaredGapLowerBound !== null) {
    console.log(`Conservative squared-error lead: at least ${result.squaredGapLowerBound}`);
  } else {
    console.log(`Exact tie readings: ${result.tieWitness.join(', ')}`);
    console.log(`Exact tie target: ${result.tieTarget}`);
  }
  console.log(`Receipt SHA-256: ${createHash('sha256').update(raw).digest('hex')}`);
} catch (error) {
  console.error(`Joint reading box rejected: ${error.message}`);
  process.exitCode = 1;
}
