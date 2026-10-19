/* Exact constructor for independent rational reading intervals. The verifier is separate. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.InwardJointBox = api;
})(globalThis, function () {
  "use strict";
  const FORMAT = "inward-joint-reading-box-v1";
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
  function extrema(intervals) {
    // On every ordering cell, the difference is affine. Its vertices have
    // endpoint-valued equality groups, so the finite candidate set is exact.
    const endpoints = new Map(intervals.flat().map(value => [notation(value), value]));
    const choices = intervals.map(([low, high]) => [...endpoints.values()].filter(value =>
      cmp(low, value) <= 0 && cmp(value, high) <= 0).sort(cmp));
    if (choices.reduce((total, row) => total * row.length, 1) > 100_000) {
      throw new RangeError("Joint box exceeds exact candidate budget.");
    }
    const sample = [];
    let minimum = null, maximum = null;
    function visit(index) {
      if (index === choices.length) {
        const difference = factors(sample).difference;
        if (minimum === null || cmp(difference, minimum.value) < 0) {
          minimum = {value: difference, readings: [...sample]};
        }
        if (maximum === null || cmp(difference, maximum.value) > 0) {
          maximum = {value: difference, readings: [...sample]};
        }
        return;
      }
      for (const value of choices[index]) { sample[index] = value; visit(index + 1); }
    }
    visit(0);
    return [minimum, maximum];
  }
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
  function certificate(rawIntervals, rawTarget) {
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
    const [minimum, maximum] = extrema(intervals);
    const lower = intervals.map(pair => pair[0]), upper = intervals.map(pair => pair[1]);
    const hlow = factors(lower).midpoint, hhigh = factors(upper).midpoint;
    let witness = null;
    if (cmp(minimum.value, ZERO) <= 0 && cmp(ZERO, maximum.value) <= 0) {
      witness = interpolateRoot(minimum.readings, maximum.readings, "estimate");
    } else if (cmp(hlow, target) <= 0 && cmp(target, hhigh) <= 0) {
      witness = interpolateRoot(lower, upper, "midpoint", target);
    }
    let verdict, margin;
    if (witness) {
      const {difference, midpoint} = factors(witness);
      if (mul(difference, sub(midpoint, target)).n !== 0n) throw new Error("Constructed readings do not tie");
      verdict = "Tie possible"; margin = null;
    } else {
      verdict = cmp(mul(minimum.value, sub(hlow, target)), ZERO) < 0 ? "Mean" : "Median";
      const nearD = cmp(absQ(minimum.value), absQ(maximum.value)) < 0 ?
        absQ(minimum.value) : absQ(maximum.value);
      const nearH = cmp(absQ(sub(hlow, target)), absQ(sub(hhigh, target))) < 0 ?
        absQ(sub(hlow, target)) : absQ(sub(hhigh, target));
      margin = notation(mul(TWO, mul(nearD, nearH)));
    }
    function absQ(value) { return q(abs(value.n), value.d); }
    const extremum = item => ({value: notation(item.value), readings: item.readings.map(notation)});
    return {format: FORMAT,
      inputs: {intervals: intervals.map(pair => pair.map(notation)), target: notation(target)},
      claim: {estimateRange: {min: extremum(minimum), max: extremum(maximum)},
        midpointRange: {min: notation(hlow), max: notation(hhigh)},
        verdict, squaredGapLowerBound: margin, tieWitness: witness ? witness.map(notation) : null}};
  }
  return {certificate};
});
