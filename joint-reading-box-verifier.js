/* Independent exact verifier for simultaneous reading-interval receipts. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.InwardJointBoxVerifier = api;
})(globalThis, function () {
  "use strict";
  const FORMAT = "inward-joint-reading-box-v1";
  const RANGE_FORMAT = "inward-joint-reading-box-v2";
  const SHARP_FORMAT = "inward-joint-reading-box-v3";
  const SWEEP_FORMAT = "inward-joint-reading-box-v4";
  const RATIONAL = /^(?:0|-?[1-9][0-9]{0,256})(?:\/[1-9][0-9]{0,256})?$/;
  const fail = message => { throw new Error(message); };
  const abs = n => n < 0n ? -n : n;
  function gcd(a, b) {
    a = abs(a); b = abs(b);
    while (b) [a, b] = [b, a % b];
    return a;
  }
  function q(n, d = 1n) {
    if (d === 0n) fail("Zero denominator");
    if (d < 0n) [n, d] = [-n, -d];
    const factor = gcd(n, d);
    return {n: n / factor, d: d / factor};
  }
  const ZERO = q(0n), TWO = q(2n), LIMIT = q(1_000_000n);
  const add = (a, b) => q(a.n * b.d + b.n * a.d, a.d * b.d);
  const sub = (a, b) => q(a.n * b.d - b.n * a.d, a.d * b.d);
  const mul = (a, b) => q(a.n * b.n, a.d * b.d);
  const div = (a, b) => q(a.n * b.d, a.d * b.n);
  const cmp = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
  const notation = a => a.d === 1n ? String(a.n) : `${a.n}/${a.d}`;
  function rational(raw, name, bound = null) {
    if (typeof raw !== "string" || !RATIONAL.test(raw)) fail(`Invalid ${name} rational`);
    const [n, d = "1"] = raw.split("/");
    if (bound && (n.replace("-", "").length > 18 || d.length > 18)) {
      fail(`Input ${name} exceeds rational precision limit`);
    }
    const value = q(BigInt(n), BigInt(d));
    if (notation(value) !== raw || bound && (cmp(value, q(-bound.n, bound.d)) < 0 ||
        cmp(value, bound) > 0)) fail(`Noncanonical or out-of-range ${name}`);
    return value;
  }
  function fields(object, names, name) {
    if (object === null || typeof object !== "object" || Array.isArray(object) ||
        Object.keys(object).length !== names.length ||
        names.some(field => !Object.hasOwn(object, field))) fail(`Invalid ${name} fields`);
  }
  function parseReceipt(source) {
    if (typeof source !== "string" || new TextEncoder().encode(source).length > 2_000_000) {
      fail("Certificate must be JSON no larger than 2 MB");
    }
    const parsed = JSON.parse(source);
    let cursor = 0;
    const space = () => { while (/[ \t\r\n]/.test(source[cursor] || "\0")) cursor++; };
    function quoted() {
      const start = cursor++;
      while (cursor < source.length) {
        const next = source[cursor++];
        if (next === '"') return JSON.parse(source.slice(start, cursor));
        if (next === "\\") cursor++;
      }
      fail("Unterminated JSON string");
    }
    function scan(depth) {
      if (depth > 32) fail("Certificate JSON nesting too deep");
      space();
      if (source[cursor] === "{") {
        cursor++; space();
        const keys = new Set();
        while (source[cursor] !== "}") {
          const key = quoted();
          if (keys.has(key)) fail(`Duplicate JSON key: ${key}`);
          keys.add(key);
          space(); cursor++;
          scan(depth + 1); space();
          if (source[cursor] === ",") { cursor++; space(); } else break;
        }
        cursor++;
      } else if (source[cursor] === "[") {
        cursor++; space();
        while (source[cursor] !== "]") {
          scan(depth + 1); space();
          if (source[cursor] === ",") { cursor++; space(); } else break;
        }
        cursor++;
      } else if (source[cursor] === '"') quoted();
      else while (cursor < source.length && !/[ \t\r\n,\]}]/.test(source[cursor])) cursor++;
    }
    scan(0);
    return parsed;
  }
  function factors(readings) {
    const ordered = [...readings].sort(cmp), n = readings.length;
    const mean = div(readings.reduce(add, ZERO), q(BigInt(n)));
    const median = div(add(ordered[Math.floor((n - 1) / 2)], ordered[Math.floor(n / 2)]), TWO);
    return {difference: sub(mean, median), midpoint: div(add(mean, median), TWO)};
  }
  function vector(values, intervals, label) {
    if (!Array.isArray(values) || values.length !== intervals.length) fail(`Invalid ${label} readings`);
    return values.map((raw, i) => {
      const value = rational(raw, label);
      if (cmp(value, intervals[i][0]) < 0 || cmp(value, intervals[i][1]) > 0) {
        fail(`${label} outside reading interval`);
      }
      return value;
    });
  }
  function envelope(lines, left, right) {
    if (cmp(left, right) >= 0) return [];
    const best = new Map();
    for (const line of lines) {
      const key = notation(line.m), old = best.get(key);
      if (!old || cmp(line.b, old.b) < 0) best.set(key, line);
    }
    const hull = [];
    for (const line of [...best.values()].sort((a, b) => -cmp(a.m, b.m))) {
      let cross = null;
      while (hull.length) {
        const last = hull[hull.length - 1];
        cross = div(sub(line.b, last.line.b), sub(last.line.m, line.m));
        if (last.start === null || cmp(cross, last.start) > 0) break;
        hull.pop();
      }
      hull.push({line, start: hull.length ? cross : null});
    }
    const pieces = [];
    hull.forEach(({line, start}, index) => {
      const next = hull[index + 1];
      const from = start !== null && cmp(start, left) > 0 ? start : left;
      const to = next && cmp(next.start, right) < 0 ? next.start : right;
      if (cmp(from, to) < 0) pieces.push({from, to, slope: line.m, intercept: line.b});
    });
    return pieces;
  }
  function verifySweep(receipt) {
    fields(receipt.inputs, ["intervals", "targetInterval"], "inputs");
    const raw = receipt.inputs.intervals;
    if (!Array.isArray(raw) || raw.length < 3 || raw.length > 5) fail("Supply 3 through 5 intervals");
    const intervals = raw.map((pair, index) => {
      if (!Array.isArray(pair) || pair.length !== 2) fail(`Invalid interval ${index + 1}`);
      const lo = rational(pair[0], `lower ${index + 1}`, LIMIT);
      const hi = rational(pair[1], `upper ${index + 1}`, LIMIT);
      if (cmp(lo, hi) > 0) fail("Reversed reading interval");
      return [lo, hi];
    });
    const targets = receipt.inputs.targetInterval;
    if (!Array.isArray(targets) || targets.length !== 2) fail("Invalid target interval");
    const a = rational(targets[0], "lower target", LIMIT);
    const b = rational(targets[1], "upper target", LIMIT);
    if (cmp(a, b) >= 0) fail("Target sweep requires an increasing target range");
    const hlow = factors(intervals.map(pair => pair[0])).midpoint;
    const hhigh = factors(intervals.map(pair => pair[1])).midpoint;
    const endpoints = new Map(intervals.flat().map(value => [notation(value), value]));
    const options = intervals.map(([lo, hi]) => [...endpoints.values()].filter(value =>
      cmp(lo, value) <= 0 && cmp(value, hi) <= 0));
    if (options.reduce((n, row) => n * row.length, 1) > 100_000) {
      fail("Joint box exceeds exact candidate budget");
    }
    let minimum = null, maximum = null;
    const candidates = [], sample = [];
    function walk(i) {
      if (i === options.length) {
        const {difference, midpoint} = factors(sample);
        if (minimum === null || cmp(difference, minimum) < 0) minimum = difference;
        if (maximum === null || cmp(difference, maximum) > 0) maximum = difference;
        candidates.push({difference, midpoint});
        return;
      }
      for (const value of options[i]) { sample[i] = value; walk(i + 1); }
    }
    walk(0);
    fields(receipt.claim, ["estimateRange", "midpointRange", "tieTargetInterval",
      "tieWitness", "strictPieces"], "sweep claim");
    fields(receipt.claim.estimateRange, ["min", "max"], "estimate range");
    for (const [side, expected] of [["min", minimum], ["max", maximum]]) {
      const part = receipt.claim.estimateRange[side];
      fields(part, ["value", "readings"], `${side} extremum`);
      if (cmp(rational(part.value, `${side} estimate`), expected) !== 0 ||
          cmp(factors(vector(part.readings, intervals, `${side} witness`)).difference, expected) !== 0) {
        fail(`Incorrect ${side} estimate extremum`);
      }
    }
    fields(receipt.claim.midpointRange, ["min", "max"], "midpoint range");
    if (cmp(rational(receipt.claim.midpointRange.min, "lower midpoint"), hlow) !== 0 ||
        cmp(rational(receipt.claim.midpointRange.max, "upper midpoint"), hhigh) !== 0) {
      fail("Incorrect midpoint range");
    }
    const globalTie = cmp(minimum, ZERO) <= 0 && cmp(maximum, ZERO) >= 0;
    const tieLo = globalTie || cmp(a, hlow) > 0 ? a : hlow;
    const tieHi = globalTie || cmp(b, hhigh) < 0 ? b : hhigh;
    const tie = cmp(tieLo, tieHi) <= 0;
    if (tie) {
      const targetInterval = receipt.claim.tieTargetInterval;
      if (!Array.isArray(targetInterval) || targetInterval.length !== 2 ||
          cmp(rational(targetInterval[0], "tie start"), tieLo) !== 0 ||
          cmp(rational(targetInterval[1], "tie end"), tieHi) !== 0) {
        fail("Incorrect tie target interval");
      }
      const witness = receipt.claim.tieWitness;
      fields(witness, ["readings", "target"], "tie witness");
      const t = rational(witness.target, "tie witness target", LIMIT);
      if (cmp(t, tieLo) < 0 || cmp(t, tieHi) > 0) fail("Tie target outside tie interval");
      const {difference, midpoint} = factors(vector(witness.readings, intervals, "tie witness"));
      if (cmp(mul(difference, sub(midpoint, t)), ZERO) !== 0) fail("Unattained tie");
    } else if (receipt.claim.tieTargetInterval !== null || receipt.claim.tieWitness !== null) {
      fail("False tie claim");
    }
    if (!Array.isArray(receipt.claim.strictPieces) ||
        receipt.claim.strictPieces.length > 100_000) fail("Invalid strict pieces");
    const expected = [];
    if (!globalTie) {
      const bottom = cmp(b, hlow) < 0 ? b : hlow;
      if (cmp(a, bottom) < 0) {
        const lines = candidates.map(({difference, midpoint}) => {
          const weight = mul(TWO, q(abs(difference.n), difference.d));
          return {m: q(-weight.n, weight.d), b: mul(weight, midpoint)};
        });
        for (const piece of envelope(lines, a, bottom)) {
          expected.push({...piece, verdict: cmp(minimum, ZERO) < 0 ? "Mean" : "Median"});
        }
      }
      const top = cmp(a, hhigh) > 0 ? a : hhigh;
      if (cmp(top, b) < 0) {
        const lines = candidates.map(({difference, midpoint}) => {
          const weight = mul(TWO, q(abs(difference.n), difference.d));
          return {m: weight, b: mul(q(-weight.n, weight.d), midpoint)};
        });
        for (const piece of envelope(lines, top, b)) {
          expected.push({...piece, verdict: cmp(minimum, ZERO) < 0 ? "Median" : "Mean"});
        }
      }
    }
    if (receipt.claim.strictPieces.length !== expected.length) fail("Incomplete target sweep");
    receipt.claim.strictPieces.forEach((piece, index) => {
      fields(piece, ["from", "to", "slope", "intercept", "readings", "verdict"], "strict piece");
      const actual = {from: rational(piece.from, "piece start"),
        to: rational(piece.to, "piece end"), slope: rational(piece.slope, "piece slope"),
        intercept: rational(piece.intercept, "piece intercept")};
      const wanted = expected[index];
      if (Object.keys(actual).some(key => cmp(actual[key], wanted[key]) !== 0) ||
          piece.verdict !== wanted.verdict) fail("Incorrect target sweep envelope");
      const {difference, midpoint} = factors(vector(piece.readings, intervals, "piece witness"));
      const lower = cmp(actual.to, hlow) <= 0;
      const weight = mul(TWO, q(abs(difference.n), difference.d));
      const slope = lower ? q(-weight.n, weight.d) : weight;
      const intercept = lower ? mul(weight, midpoint) : mul(q(-weight.n, weight.d), midpoint);
      if (cmp(slope, actual.slope) !== 0 || cmp(intercept, actual.intercept) !== 0) {
        fail("Piece witness does not attain its line");
      }
    });
    return {tieTargetInterval: receipt.claim.tieTargetInterval,
      tieWitness: receipt.claim.tieWitness, strictPieces: receipt.claim.strictPieces,
      midpointRange: receipt.claim.midpointRange, estimateRange: receipt.claim.estimateRange,
      isSweep: true};
  }
  function verify(receipt) {
    fields(receipt, ["format", "inputs", "claim"], "certificate");
    if (receipt.format === SWEEP_FORMAT) return verifySweep(receipt);
    const sharp = receipt.format === SHARP_FORMAT;
    const ranged = receipt.format === RANGE_FORMAT || sharp;
    if (!ranged && receipt.format !== FORMAT) fail("Unknown joint reading box format");
    fields(receipt.inputs, ["intervals", ranged ? "targetInterval" : "target"], "inputs");
    const raw = receipt.inputs.intervals;
    if (!Array.isArray(raw) || raw.length < 3 || raw.length > 5) fail("Supply 3 through 5 intervals");
    const intervals = raw.map((pair, i) => {
      if (!Array.isArray(pair) || pair.length !== 2) fail(`Invalid interval ${i + 1}`);
      const low = rational(pair[0], `lower ${i + 1}`, LIMIT);
      const high = rational(pair[1], `upper ${i + 1}`, LIMIT);
      if (cmp(low, high) > 0) fail("Reversed reading interval");
      return [low, high];
    });
    const targetBounds = ranged ? receipt.inputs.targetInterval : [receipt.inputs.target, receipt.inputs.target];
    if (!Array.isArray(targetBounds) || targetBounds.length !== 2) fail("Invalid target interval");
    const targetLow = rational(targetBounds[0], "lower target", LIMIT);
    const targetHigh = rational(targetBounds[1], "upper target", LIMIT);
    if (cmp(targetLow, targetHigh) > 0) fail("Reversed target interval");
    const low = factors(intervals.map(pair => pair[0])).midpoint;
    const high = factors(intervals.map(pair => pair[1])).midpoint;
    const gapTarget = cmp(low, targetHigh) > 0 ? targetHigh :
      cmp(high, targetLow) < 0 ? targetLow : null;
    const endpoints = new Map(intervals.flat().map(value => [notation(value), value]));
    const options = intervals.map(([low, high]) => [...endpoints.values()].filter(value =>
      cmp(low, value) <= 0 && cmp(value, high) <= 0));
    if (options.reduce((total, row) => total * row.length, 1) > 100_000) {
      fail("Joint box exceeds exact candidate budget");
    }
    let min = null, max = null, exactGap = null;
    const sample = [];
    function visit(index) {
      if (index === options.length) {
        const {difference, midpoint} = factors(sample);
        if (min === null || cmp(difference, min) < 0) min = difference;
        if (max === null || cmp(difference, max) > 0) max = difference;
        if (sharp && gapTarget !== null) {
          const product = mul(difference, sub(midpoint, gapTarget));
          const gap = mul(TWO, q(abs(product.n), product.d));
          if (exactGap === null || cmp(gap, exactGap) < 0) exactGap = gap;
        }
        return;
      }
      for (const value of options[index]) { sample[index] = value; visit(index + 1); }
    }
    visit(0);
    const claimFields = ["estimateRange", "midpointRange", "verdict",
      "squaredGapLowerBound", "tieWitness"];
    if (ranged) claimFields.push("tieTarget");
    if (sharp) claimFields.push("gapWitness");
    fields(receipt.claim, claimFields, "claim");
    fields(receipt.claim.estimateRange, ["min", "max"], "estimate range");
    for (const [side, expected] of [["min", min], ["max", max]]) {
      const part = receipt.claim.estimateRange[side];
      fields(part, ["value", "readings"], `${side} extremum`);
      if (cmp(rational(part.value, `${side} value`), expected) !== 0 ||
          cmp(factors(vector(part.readings, intervals, `${side} witness`)).difference, expected) !== 0) {
        fail(`Incorrect ${side} estimate extremum`);
      }
    }
    fields(receipt.claim.midpointRange, ["min", "max"], "midpoint range");
    if (cmp(rational(receipt.claim.midpointRange.min, "lower midpoint"), low) !== 0 ||
        cmp(rational(receipt.claim.midpointRange.max, "upper midpoint"), high) !== 0) {
      fail("Incorrect midpoint bounds");
    }
    const estimateTie = cmp(min, ZERO) <= 0 && cmp(max, ZERO) >= 0;
    const targetTie = cmp(low, targetHigh) <= 0 && cmp(targetLow, high) <= 0;
    if (estimateTie || targetTie) {
      if (receipt.claim.verdict !== "Tie possible" ||
          receipt.claim.squaredGapLowerBound !== null ||
          sharp && receipt.claim.gapWitness !== null) fail("False strict claim");
      const tieTarget = ranged ? rational(receipt.claim.tieTarget, "tie target") : targetLow;
      if (cmp(tieTarget, targetLow) < 0 || cmp(tieTarget, targetHigh) > 0) {
        fail("Tie target outside target interval");
      }
      const witness = vector(receipt.claim.tieWitness, intervals, "tie witness");
      const {difference, midpoint} = factors(witness);
      if (cmp(mul(difference, sub(midpoint, tieTarget)), ZERO) !== 0) fail("False tie witness");
    } else {
      const verdict = cmp(mul(min, sub(low, targetLow)), ZERO) < 0 ? "Mean" : "Median";
      if (receipt.claim.verdict !== verdict || receipt.claim.tieWitness !== null ||
          ranged && receipt.claim.tieTarget !== null) {
        fail("Incorrect strict winner");
      }
      let bound;
      if (sharp) {
        bound = exactGap;
        const witness = receipt.claim.gapWitness;
        fields(witness, ["readings", "target"], "exact gap witness");
        const t = rational(witness.target, "gap witness target", LIMIT);
        if (cmp(t, gapTarget) !== 0) fail("Wrong worst-case target");
        const readings = vector(witness.readings, intervals, "gap witness");
        const {difference, midpoint} = factors(readings);
        const product = mul(difference, sub(midpoint, t));
        const attained = mul(TWO, q(abs(product.n), product.d));
        if (cmp(attained, bound) !== 0) fail("Gap witness does not attain minimum");
      } else {
        const distanceD = cmp(min, ZERO) > 0 ? min : q(-max.n, max.d);
        const distanceH = cmp(low, targetHigh) > 0 ? sub(low, targetHigh) : sub(targetLow, high);
        bound = mul(TWO, mul(distanceD, distanceH));
      }
      if (cmp(rational(receipt.claim.squaredGapLowerBound, "squared gap"), bound) !== 0) {
        fail(sharp ? "Incorrect exact squared-gap minimum" : "Incorrect squared-gap lower bound");
      }
    }
    return {verdict: receipt.claim.verdict, squaredGapLowerBound: receipt.claim.squaredGapLowerBound,
      tieWitness: receipt.claim.tieWitness, tieTarget: ranged ? receipt.claim.tieTarget : receipt.inputs.target,
      gapWitness: sharp ? receipt.claim.gapWitness : null, isSharp: sharp};
  }
  return {parseReceipt, verify};
});
