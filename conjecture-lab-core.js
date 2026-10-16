/* Exact finite rational search. A surviving candidate is never called proven. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.InwardConjectureLab = api;
})(globalThis, function () {
  "use strict";
  const FORMAT = "inward-conjecture-experiment-v1";
  const SCOPE = "Exact rational finite-grid search only; unrefuted is not proved.";
  const CLAIMS = [
    ["median-never-worse", "Median is at least as close as mean for every chosen target."],
    ["mean-never-worse", "Mean is at least as close as median for every chosen target."],
    ["target-independent", "Changing the target cannot reverse a strict winner for fixed readings."],
    ["midpoint-tie", "For distinct estimates, their exact midpoint is an equal-error target."],
  ];
  const CLAIM_FORMAT = "inward-conditional-claim-v5";
  const READING_COUNTS = [3, 4, 5, 6, 7];
  const MEDIAN_RULE = "central-order-statistics-v1";
  // Immutable source revision containing the four Lean declarations below.
  const FORMAL_COMMIT = "59a7e9dccd3cc328f855fc1fce1d6b6d55fdd705";
  const FORMAL_THEOREMS = {
    "target-at-or-below-midpoint": "InwardFormal.lower_no_worse_at_midpoint",
    "target-at-or-above-midpoint": "InwardFormal.higher_no_worse_at_midpoint",
    "target-at-or-below-both": "InwardFormal.lower_no_worse_below_both",
    "target-at-or-above-both": "InwardFormal.higher_no_worse_above_both",
  };
  const CONDITIONS = {
    "any-target": "at any target",
    "target-at-or-below-midpoint": "if the target is at or below the estimates' midpoint",
    "target-at-or-above-midpoint": "if the target is at or above the estimates' midpoint",
    "target-at-or-below-both": "if the target is at or below both estimates",
    "target-at-or-above-both": "if the target is at or above both estimates",
  };
  const PREDICTIONS = {
    "lower-no-worse": "the lower estimate is no farther than the higher estimate",
    "higher-no-worse": "the higher estimate is no farther than the lower estimate",
    "mean-no-worse": "the mean is no farther than the median",
    "median-no-worse": "the median is no farther than the mean",
  };
  const fail = message => { throw new Error(message); };
  const abs = n => n < 0n ? -n : n;
  function gcd(a, b) {
    a = abs(a);
    while (b) [a, b] = [b, a % b];
    return a;
  }
  function rat(n, d = 1n) {
    if (!d) fail("Zero denominator");
    if (d < 0n) [n, d] = [-n, -d];
    const g = gcd(n, d);
    return {n: n / g, d: d / g};
  }
  const add = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
  const half = a => rat(a.n, a.d * 2n);
  const compare = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
  const notation = x => x.d === 1n ? String(x.n) : `${x.n}/${x.d}`;
  function rational(raw) {
    if (!/^(?:0|[1-9][0-9]{0,8})(?:\/[1-9][0-9]{0,8})?$/.test(raw)) fail(`Invalid rational: ${raw}`);
    const [top, bottom = "1"] = raw.split("/");
    const value = rat(BigInt(top), BigInt(bottom));
    if (notation(value) !== raw || compare(value, rat(100n)) > 0) fail(`Noncanonical or out-of-range rational: ${raw}`);
    return value;
  }
  function parseGrid(text, maximum, label) {
    if (typeof text !== "string" || text.length > 512) fail(`${label} is too long`);
    const parts = text.split(",").map(part => part.trim());
    if (parts.length < 2 || parts.length > maximum) fail(`${label} needs 2–${maximum} distinct values`);
    const values = parts.map(rational).sort(compare);
    if (values.some((value, index) => index && compare(value, values[index - 1]) === 0)) {
      fail(`${label} contains a duplicate`);
    }
    return values;
  }
  // For even samples the median is the exact average of the central pair.
  function pair(readings) {
    const sum = readings.reduce((total, x) => add(total, x), rat(0n));
    const middle = readings.length / 2;
    const median = readings.length % 2 ? readings[Math.floor(middle)] :
      half(add(readings[middle - 1], readings[middle]));
    return [rat(sum.n, sum.d * BigInt(readings.length)), median];
  }
  function winner(meanValue, medianValue, target) {
    const m = rat(abs(meanValue.n * target.d - target.n * meanValue.d), meanValue.d * target.d);
    const d = rat(abs(medianValue.n * target.d - target.n * medianValue.d), medianValue.d * target.d);
    const sign = compare(m, d);
    return sign < 0 ? "mean" : sign > 0 ? "median" : "tie";
  }
  function* multisets(values, length = 5, start = 0, prefix = []) {
    if (!length) { yield prefix; return; }
    for (let i = start; i < values.length; i++) {
      yield* multisets(values, length - 1, i, [...prefix, values[i]]);
    }
  }
  function scan(readingGrid, targetGrid) {
    const values = parseGrid(readingGrid, 6, "Reading grid");
    const targets = parseGrid(targetGrid, 12, "Target grid");
    const candidates = CLAIMS.map(([id, claim]) =>
      ({id, claim, status: "unrefuted-on-finite-grid", casesChecked: 0, counterexample: null}));
    let readingMultisets = 0;
    for (const readings of multisets(values)) {
      readingMultisets++;
      const [average, middle] = pair(readings);
      const sample = target => ({readings: readings.map(notation), target: notation(target),
        mean: notation(average), median: notation(middle), actualWinner: winner(average, middle, target)});
      const firstStrict = {};
      for (const target of targets) {
        const outcome = winner(average, middle, target);
        for (const [index, forbidden] of [[0, "mean"], [1, "median"]]) {
          const claim = candidates[index];
          if (claim.counterexample !== null) continue;
          claim.casesChecked++;
          if (outcome === forbidden) {
            claim.status = "counterexample-found";
            claim.counterexample = sample(target);
          }
        }
        const stable = candidates[2];
        if (stable.counterexample === null && outcome !== "tie") {
          stable.casesChecked++;
          const opposite = outcome === "mean" ? "median" : "mean";
          if (firstStrict[opposite]) {
            stable.status = "counterexample-found";
            stable.counterexample = {readings: readings.map(notation),
              first: sample(firstStrict[opposite]), second: sample(target)};
          }
          firstStrict[outcome] = target;
        }
      }
      const midpoint = candidates[3];
      if (midpoint.counterexample === null && compare(average, middle) !== 0) {
        midpoint.casesChecked++;
        const target = half(add(average, middle));
        if (winner(average, middle, target) !== "tie") {
          midpoint.status = "counterexample-found";
          midpoint.counterexample = sample(target);
        }
      }
    }
    return {format: FORMAT, scope: SCOPE,
      domain: {readingValues: values.map(notation), targetValues: targets.map(notation), readingMultisets},
      candidates};
  }
  function conditionHolds(condition, meanValue, medianValue, target) {
    const lower = compare(meanValue, medianValue) <= 0 ? meanValue : medianValue;
    const higher = compare(meanValue, medianValue) <= 0 ? medianValue : meanValue;
    const midpoint = half(add(meanValue, medianValue));
    if (condition === "any-target") return true;
    if (condition === "target-at-or-below-midpoint") return compare(target, midpoint) <= 0;
    if (condition === "target-at-or-above-midpoint") return compare(target, midpoint) >= 0;
    if (condition === "target-at-or-below-both") return compare(target, lower) <= 0;
    return compare(target, higher) >= 0;
  }
  function predicted(condition, prediction) {
    if (prediction === "lower-no-worse") return condition.endsWith("below-midpoint") || condition.endsWith("below-both");
    if (prediction === "higher-no-worse") return condition.endsWith("above-midpoint") || condition.endsWith("above-both");
    return false;
  }
  function proofFor(condition, prediction) {
    if (!predicted(condition, prediction)) return null;
    const left = prediction === "lower-no-worse";
    return {method: "squared-error-factor-sign-v1",
      identity: {difference: "(a-t)^2-(b-t)^2", product: "(a-b)(a+b-2t)",
        expanded: {"a^2": 1, "b^2": -1, "a*t": -2, "b*t": 2}},
      assumptions: ["a<=b", condition.endsWith("midpoint") ?
        (left ? "t<=(a+b)/2" : "t>=(a+b)/2") : (left ? "t<=a" : "t>=b")],
      factorSigns: ["nonpositive", left ? "nonnegative" : "nonpositive"],
      result: left ? "(a-t)^2<=(b-t)^2" : "(b-t)^2<=(a-t)^2"};
  }
  function searchCases(values, targets, condition, prediction, readingCount) {
    let readingMultisets = 0, casesChecked = 0, counterexample = null;
    for (const readings of multisets(values, readingCount)) {
      readingMultisets++;
      if (counterexample) continue;
      const [meanValue, medianValue] = pair(readings);
      const lower = compare(meanValue, medianValue) <= 0 ? meanValue : medianValue;
      const higher = compare(meanValue, medianValue) <= 0 ? medianValue : meanValue;
      for (const target of targets) {
        if (!conditionHolds(condition, meanValue, medianValue, target)) continue;
        casesChecked++;
        const actualWinner = winner(meanValue, medianValue, target);
        const expectedWinner = prediction.startsWith("lower") ?
          (compare(meanValue, medianValue) <= 0 ? "mean" : "median") :
          prediction.startsWith("higher") ?
            (compare(meanValue, medianValue) >= 0 ? "mean" : "median") : prediction.split("-")[0];
        if (actualWinner !== "tie" && actualWinner !== expectedWinner) {
          counterexample = {readings: readings.map(notation), target: notation(target),
            mean: notation(meanValue), median: notation(medianValue),
            lower: notation(lower), higher: notation(higher), actualWinner};
          break;
        }
      }
    }
    return {readingMultisets, casesChecked, counterexample};
  }
  function compose(readingGrid, targetGrid, condition, prediction, readingCount = 5) {
    if (!Object.hasOwn(CONDITIONS, condition) || !Object.hasOwn(PREDICTIONS, prediction)) fail("Unknown claim choice");
    if (!READING_COUNTS.includes(readingCount)) fail("Reading count must be between 3 and 7");
    const values = parseGrid(readingGrid, 6, "Reading grid");
    const targets = parseGrid(targetGrid, 12, "Target grid");
    const claim = {condition, prediction,
      statement: `For any ${readingCount} real readings, ${CONDITIONS[condition]}, ${PREDICTIONS[prediction]}.`};
    const {readingMultisets, casesChecked, counterexample} = searchCases(values, targets, condition, prediction, readingCount);
    const proof = proofFor(condition, prediction);
    if (proof && counterexample) fail("An algebraic theorem disagrees with exact enumeration");
    // A fixed, independent search basis settles the other 16 universal statements.
    // One exact counterexample is valid regardless of the visitor's chosen grid.
    const basis = [rat(0n), rat(50n), rat(100n)];
    const witness = proof ? null : searchCases(basis, basis, condition, prediction, readingCount).counterexample;
    if (!proof && !witness) fail("Claim language classification is incomplete");
    const classification = {status: proof ? "proved-by-algebra" : "refuted-by-exact-witness",
      counterexample: witness};
    const formal = proof ? {system: "Lean 4/Mathlib", declaration: FORMAL_THEOREMS[condition],
      sourceCommit: FORMAL_COMMIT} : null;
    return {format: CLAIM_FORMAT, claim,
      domain: {readingCount, medianRule: MEDIAN_RULE, readingValues: values.map(notation),
        targetValues: targets.map(notation), readingMultisets},
      search: {casesChecked, status: counterexample ? "counterexample-found" :
        proof ? "proved-by-algebra" : "unrefuted-on-finite-grid", counterexample}, proof, formal,
      classification};
  }
  return {scan, compose, parseGrid, FORMAT, SCOPE, CLAIMS, CLAIM_FORMAT};
});
