/* Exact constructor for independent rational reading intervals. The verifier is separate. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.InwardJointBox = api;
})(globalThis, function () {
  "use strict";
  const FORMAT = "inward-joint-reading-box-v1";
  const RANGE_FORMAT = "inward-joint-reading-box-v2";
  const SHARP_FORMAT = "inward-joint-reading-box-v3";
  const SWEEP_FORMAT = "inward-joint-reading-box-v4";
  const INPUT = /^(?:-?(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,6})?|-?(?:0|[1-9][0-9]{0,8})\/[1-9][0-9]{0,8})$/;
  const abs = n => n < 0n ? -n : n;
  function gcd(a, b) {
    a = abs(a); b = abs(b);
    while (b) [a, b] = [b, a % b];
    return a;
  }
  function q(n, d = 1n) {
    if (d === 0n) throw new RangeError("Zero denominator");
    if (d < 0n) [n, d] = [-n, -d];
    const divisor = gcd(n, d);
    return {n: n / divisor, d: d / divisor};
  }
  const ZERO = q(0n), ONE = q(1n), TWO = q(2n), LIMIT = q(1_000_000n);
  const add = (a, b) => q(a.n * b.d + b.n * a.d, a.d * b.d);
  const sub = (a, b) => q(a.n * b.d - b.n * a.d, a.d * b.d);
  const mul = (a, b) => q(a.n * b.n, a.d * b.d);
  const div = (a, b) => q(a.n * b.d, a.d * b.n);
  const cmp = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
  const notation = value => value.d === 1n ? String(value.n) : `${value.n}/${value.d}`;
  function parse(raw) {
    if (typeof raw !== "string" || !INPUT.test(raw)) {
      throw new Error("Use an integer, a fraction with at most nine digits per part, or a decimal with up to six places.");
    }
    let value;
    if (raw.includes("/")) {
      const [top, bottom] = raw.split("/");
      value = q(BigInt(top), BigInt(bottom));
    } else if (raw.includes(".")) {
      const [whole, digits] = raw.split(".");
      value = q(BigInt(whole + digits), 10n ** BigInt(digits.length));
    } else value = q(BigInt(raw));
    if (cmp(value, q(-LIMIT.n)) < 0 || cmp(value, LIMIT) > 0) {
      throw new RangeError("Reading and target values must lie between -1000000 and 1000000.");
    }
    return value;
  }
  function factors(readings) {
    const ordered = [...readings].sort(cmp), n = readings.length;
    const mean = div(readings.reduce(add, ZERO), q(BigInt(n)));
    const median = div(add(ordered[Math.floor((n - 1) / 2)], ordered[Math.floor(n / 2)]), TWO);
    return {difference: sub(mean, median), midpoint: div(add(mean, median), TWO)};
  }
  function extrema(intervals, gapTarget = null) {
    // On every ordering cell, the difference is affine. Its vertices have
    // endpoint-valued equality groups, so the finite candidate set is exact.
    const endpoints = new Map(intervals.flat().map(value => [notation(value), value]));
    const choices = intervals.map(([low, high]) => [...endpoints.values()].filter(value =>
      cmp(low, value) <= 0 && cmp(value, high) <= 0).sort(cmp));
    if (choices.reduce((total, row) => total * row.length, 1) > 100_000) {
      throw new RangeError("Joint box exceeds exact candidate budget.");
    }
    const sample = [];
    let minimum = null, maximum = null, sharpGap = null;
    function visit(index) {
      if (index === choices.length) {
        const {difference, midpoint} = factors(sample);
        if (minimum === null || cmp(difference, minimum.value) < 0) {
          minimum = {value: difference, readings: [...sample]};
        }
        if (maximum === null || cmp(difference, maximum.value) > 0) {
          maximum = {value: difference, readings: [...sample]};
        }
        if (gapTarget !== null) {
          const gap = mul(TWO, absQ(mul(difference, sub(midpoint, gapTarget))));
          if (sharpGap === null || cmp(gap, sharpGap.value) < 0) {
            sharpGap = {value: gap, readings: [...sample]};
          }
        }
        return;
      }
      for (const value of choices[index]) { sample[index] = value; visit(index + 1); }
    }
    visit(0);
    return [minimum, maximum, sharpGap];
  }
  function absQ(value) { return q(abs(value.n), value.d); }
  function interpolateRoot(start, end, factor, target = ZERO) {
    const delta = start.map((a, i) => sub(end[i], a));
    const stops = new Map([["0", ZERO], ["1", ONE]]);
    for (let i = 0; i < start.length; i++) for (let j = 0; j < i; j++) {
      const slope = sub(delta[i], delta[j]);
      if (slope.n === 0n) continue;
      const crossing = div(sub(start[j], start[i]), slope);
      if (cmp(ZERO, crossing) < 0 && cmp(crossing, ONE) < 0) {
        stops.set(notation(crossing), crossing);
      }
    }
    const at = position => {
      const readings = start.map((a, i) => add(a, mul(position, delta[i])));
      const result = factors(readings);
      return {readings, value: factor === "estimate" ? result.difference : sub(result.midpoint, target)};
    };
    let previous = null;
    for (const position of [...stops.values()].sort(cmp)) {
      const current = at(position);
      if (current.value.n === 0n) return current.readings;
      if (previous && cmp(mul(previous.value, current.value), ZERO) < 0) {
        const root = sub(previous.position, div(mul(previous.value, sub(position, previous.position)),
          sub(current.value, previous.value)));
        const solved = at(root);
        if (solved.value.n !== 0n) throw new Error("Interpolated root is not exact");
        return solved.readings;
      }
      previous = {...current, position};
    }
    throw new Error("A bracketed continuous factor has no root");
  }
  function build(rawIntervals, rawTarget, rawTargetHigh, ranged, sharp = false) {
    if (!Array.isArray(rawIntervals) || rawIntervals.length < 3 || rawIntervals.length > 5) {
      throw new Error("Supply 3 through 5 independent reading intervals.");
    }
    const intervals = rawIntervals.map((pair, i) => {
      if (!Array.isArray(pair) || pair.length !== 2) throw new Error(`Reading ${i + 1} needs two bounds.`);
      const low = parse(pair[0]), high = parse(pair[1]);
      if (cmp(low, high) > 0) throw new RangeError(`Reading ${i + 1} has reversed bounds.`);
      return [low, high];
    });
    const target = parse(rawTarget);
    const targetHigh = ranged ? parse(rawTargetHigh) : target;
    if (cmp(target, targetHigh) > 0) throw new RangeError("Target bounds must be ordered.");
    const lower = intervals.map(pair => pair[0]), upper = intervals.map(pair => pair[1]);
    const hlow = factors(lower).midpoint, hhigh = factors(upper).midpoint;
    const gapTarget = cmp(hlow, targetHigh) > 0 ? targetHigh :
      cmp(hhigh, target) < 0 ? target : null;
    const [minimum, maximum, sharpGap] = extrema(intervals, sharp ? gapTarget : null);
    let witness = null, tieTarget = null;
    if (cmp(minimum.value, ZERO) <= 0 && cmp(ZERO, maximum.value) <= 0) {
      witness = interpolateRoot(minimum.readings, maximum.readings, "estimate");
      tieTarget = target;
    } else if (cmp(hlow, targetHigh) <= 0 && cmp(target, hhigh) <= 0) {
      tieTarget = cmp(hlow, target) > 0 ? hlow : target;
      witness = interpolateRoot(lower, upper, "midpoint", tieTarget);
    }
    let verdict, margin;
    if (witness) {
      const {difference, midpoint} = factors(witness);
      if (mul(difference, sub(midpoint, tieTarget)).n !== 0n) throw new Error("Constructed readings do not tie");
      verdict = "Tie possible"; margin = null;
    } else {
      verdict = cmp(mul(minimum.value, sub(hlow, target)), ZERO) < 0 ? "Mean" : "Median";
      if (sharp) margin = notation(sharpGap.value);
      else {
        const nearD = cmp(absQ(minimum.value), absQ(maximum.value)) < 0 ?
          absQ(minimum.value) : absQ(maximum.value);
        const nearH = cmp(hlow, targetHigh) > 0 ? sub(hlow, targetHigh) : sub(target, hhigh);
        margin = notation(mul(TWO, mul(nearD, nearH)));
      }
    }
    const extremum = item => ({value: notation(item.value), readings: item.readings.map(notation)});
    const inputs = {intervals: intervals.map(pair => pair.map(notation))};
    if (ranged) inputs.targetInterval = [notation(target), notation(targetHigh)];
    else inputs.target = notation(target);
    const claim = {estimateRange: {min: extremum(minimum), max: extremum(maximum)},
        midpointRange: {min: notation(hlow), max: notation(hhigh)},
        verdict, squaredGapLowerBound: margin, tieWitness: witness ? witness.map(notation) : null};
    if (ranged) claim.tieTarget = tieTarget ? notation(tieTarget) : null;
    if (sharp) claim.gapWitness = witness ? null :
      {readings: sharpGap.readings.map(notation), target: notation(gapTarget)};
    return {format: sharp ? SHARP_FORMAT : ranged ? RANGE_FORMAT : FORMAT, inputs, claim};
  }
  const certificate = (intervals, target) => build(intervals, target, target, false);
  const certificateRange = (intervals, targetLow, targetHigh) =>
    build(intervals, targetLow, targetHigh, true);
  const certificateSharp = (intervals, targetLow, targetHigh = targetLow) =>
    build(intervals, targetLow, targetHigh, true, true);
  function lowerEnvelope(lines, left, right) {
    if (cmp(left, right) >= 0) return [];
    const slopes = new Map();
    for (const line of lines) {
      const key = notation(line.slope), previous = slopes.get(key);
      if (!previous || cmp(line.intercept, previous.intercept) < 0) slopes.set(key, line);
    }
    const hull = [];
    for (const line of [...slopes.values()].sort((a, b) => -cmp(a.slope, b.slope))) {
      let start = null;
      while (hull.length) {
        const previous = hull[hull.length - 1];
        start = div(sub(line.intercept, previous.line.intercept),
          sub(previous.line.slope, line.slope));
        if (previous.start === null || cmp(start, previous.start) > 0) break;
        hull.pop();
      }
      hull.push({line, start: hull.length ? start : null});
    }
    const pieces = [];
    for (let i = 0; i < hull.length; i++) {
      const {line, start} = hull[i];
      const from = start !== null && cmp(left, start) < 0 ? start : left;
      const end = i + 1 < hull.length ? hull[i + 1].start : null;
      const to = end !== null && cmp(end, right) < 0 ? end : right;
      if (cmp(from, to) < 0) pieces.push({from: notation(from), to: notation(to),
        slope: notation(line.slope), intercept: notation(line.intercept),
        readings: line.readings.map(notation)});
    }
    return pieces;
  }
  function certificateSweep(rawIntervals, rawLow, rawHigh) {
    const base = build(rawIntervals, rawLow, rawHigh, true);
    const fromNotation = raw => {
      const [top, bottom = "1"] = raw.split("/");
      return q(BigInt(top), BigInt(bottom));
    };
    const intervals = base.inputs.intervals.map(pair => pair.map(fromNotation));
    const [a, b] = base.inputs.targetInterval.map(fromNotation);
    if (cmp(a, b) >= 0) throw new RangeError("Target sweep requires an increasing target range.");
    const {estimateRange, midpointRange} = base.claim;
    const hlow = fromNotation(midpointRange.min), hhigh = fromNotation(midpointRange.max);
    const dlow = fromNotation(estimateRange.min.value);
    const dhigh = fromNotation(estimateRange.max.value);
    const globalTie = cmp(dlow, ZERO) <= 0 && cmp(ZERO, dhigh) <= 0;
    const tieLow = globalTie ? a : cmp(a, hlow) > 0 ? a : hlow;
    const tieHigh = globalTie ? b : cmp(b, hhigh) < 0 ? b : hhigh;
    const tieTargetInterval = cmp(tieLow, tieHigh) <= 0 ?
      [notation(tieLow), notation(tieHigh)] : null;
    const tieWitness = tieTargetInterval ?
      {readings: base.claim.tieWitness, target: base.claim.tieTarget} : null;
    const strictPieces = [];
    if (!globalTie) {
      const endpoints = new Map(intervals.flat().map(value => [notation(value), value]));
      const options = intervals.map(([lo, hi]) => [...endpoints.values()].filter(value =>
        cmp(lo, value) <= 0 && cmp(value, hi) <= 0).sort(cmp));
      const candidates = [], sample = [];
      function visit(i) {
        if (i === options.length) {
          const {difference, midpoint} = factors(sample);
          candidates.push({weight: mul(TWO, absQ(difference)), midpoint, readings: [...sample]});
          return;
        }
        for (const value of options[i]) { sample[i] = value; visit(i + 1); }
      }
      visit(0);
      const belowEnd = cmp(b, hlow) < 0 ? b : hlow;
      if (cmp(a, belowEnd) < 0) {
        const lines = candidates.map(({weight, midpoint, readings}) =>
          ({slope: q(-weight.n, weight.d), intercept: mul(weight, midpoint), readings}));
        const pieces = lowerEnvelope(lines, a, belowEnd);
        pieces.forEach(piece => { piece.verdict = cmp(dlow, ZERO) < 0 ? "Mean" : "Median"; });
        strictPieces.push(...pieces);
      }
      const aboveStart = cmp(a, hhigh) > 0 ? a : hhigh;
      if (cmp(aboveStart, b) < 0) {
        const lines = candidates.map(({weight, midpoint, readings}) =>
          ({slope: weight, intercept: mul(q(-weight.n, weight.d), midpoint), readings}));
        const pieces = lowerEnvelope(lines, aboveStart, b);
        pieces.forEach(piece => { piece.verdict = cmp(dlow, ZERO) < 0 ? "Median" : "Mean"; });
        strictPieces.push(...pieces);
      }
    }
    return {format: SWEEP_FORMAT, inputs: base.inputs,
      claim: {estimateRange, midpointRange, tieTargetInterval, tieWitness, strictPieces}};
  }
  return {certificate, certificateRange, certificateSharp, certificateSweep};
});
