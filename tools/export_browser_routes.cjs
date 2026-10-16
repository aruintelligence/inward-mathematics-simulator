#!/usr/bin/env node
// Exercise the actual claim builder for every supported choice and sample size.
const {compose} = require('../conjecture-lab-core.js');

const count = Number(process.argv[2]);
if (!Number.isInteger(count) || count < 3 || count > 7) {
  throw new Error('Expected a supported reading count (3 through 7)');
}
const conditions = ['any-target', 'target-at-or-below-midpoint',
  'target-at-or-above-midpoint', 'target-at-or-below-both', 'target-at-or-above-both'];
const predictions = ['lower-no-worse', 'higher-no-worse', 'mean-no-worse', 'median-no-worse'];
for (const condition of conditions) for (const prediction of predictions) {
  const classification = compose('0,100', '0,100', condition, prediction, count).classification;
  const route = classification.status === 'proved-by-algebra' ? 'proved' :
    `${classification.construction.family}:${classification.construction.target}`;
  process.stdout.write(`${condition}\t${prediction}\t${route}\n`);
}
