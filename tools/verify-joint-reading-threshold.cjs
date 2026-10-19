#!/usr/bin/env node
/* Independently verify a derived margin-region answer against its v4 source. */
const {readFileSync} = require('node:fs');
const {createHash} = require('node:crypto');
const {isDeepStrictEqual} = require('node:util');
const {parseReceipt, verify} = require('../joint-reading-box-verifier.js');
const {regions} = require('../joint-reading-threshold.js');

try {
  if (process.argv.length !== 4) {
    throw new Error('Usage: node tools/verify-joint-reading-threshold.cjs sweep-v4.json regions.json');
  }
  const sourceBytes = readFileSync(process.argv[2]);
  const answerBytes = readFileSync(process.argv[3]);
  if (sourceBytes.length > 2_000_000 || answerBytes.length > 2_000_000) {
    throw new Error('Receipt exceeds 2 MB');
  }
  const decode = bytes => new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  const receipt = parseReceipt(decode(sourceBytes));
  const checked = verify(receipt);
  const answer = parseReceipt(decode(answerBytes));
  if (!checked.isSweep || !answer || answer.format !== 'inward-joint-reading-margin-regions-v1') {
    throw new Error('Expected a v4 sweep and a margin-region answer');
  }
  const calculated = regions(checked, receipt.inputs, answer.threshold);
  const expected = {format: 'inward-joint-reading-margin-regions-v1',
    sourceReceiptSha256: createHash('sha256').update(sourceBytes).digest('hex'),
    ...calculated};
  if (!isDeepStrictEqual(answer, expected)) throw new Error('Margin regions or boundary witness do not match the checked sweep');
  console.log(`Verified required lead: ${calculated.threshold}`);
  for (const region of calculated.guaranteedRegions) {
    console.log(`[${region.from}, ${region.to}]: ${region.verdict} guarantees at least ${calculated.threshold}`);
  }
  if (!calculated.guaranteedRegions.length) console.log('No target meets the required lead');
  console.log(`Source receipt SHA-256: ${expected.sourceReceiptSha256}`);
} catch (error) {
  console.error(`Margin region answer rejected: ${error.message}`);
  process.exitCode = 1;
}
