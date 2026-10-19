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
  if (result.isSweep) {
    console.log(`Verified exact target sweep: ${result.strictPieces.length} strict pieces`);
    console.log(`Tie target interval: ${result.tieTargetInterval ? result.tieTargetInterval.join(' through ') : 'none'}`);
    for (const piece of result.strictPieces) {
      console.log(`[${piece.from}, ${piece.to}]: ${piece.verdict}; gap(t) = (${piece.slope})t + (${piece.intercept}); readings [${piece.readings.join(', ')}]`);
    }
  } else {
    console.log(`Verified conditional verdict: ${result.verdict}`);
    if (result.squaredGapLowerBound !== null) {
      if (result.isSharp) {
        console.log(`Exact worst-case squared-error lead: ${result.squaredGapLowerBound}`);
        console.log(`Attained at readings: ${result.gapWitness.readings.join(', ')}; target: ${result.gapWitness.target}`);
      } else console.log(`Conservative squared-error lead: at least ${result.squaredGapLowerBound}`);
    } else {
      console.log(`Exact tie readings: ${result.tieWitness.join(', ')}`);
      console.log(`Exact tie target: ${result.tieTarget}`);
    }
  }
  console.log(`Receipt SHA-256: ${createHash('sha256').update(raw).digest('hex')}`);
} catch (error) {
  console.error(`Joint reading box rejected: ${error.message}`);
  process.exitCode = 1;
}
