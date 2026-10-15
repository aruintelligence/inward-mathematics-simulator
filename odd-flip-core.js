/* Exact arithmetic for the local odd-sample research lab. The independent Python
   verifier in tools/verify_odd_sample_flip.py checks exported certificates. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.InwardOddFlip = api;
})(globalThis, function () {
  "use strict";
  const FORMAT = "inward-odd-sample-flip-v1";
  const INPUT = /^(?:(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,6})?|(?:0|[1-9][0-9]{0,8})\/[1-9][0-9]{0,8})$/;
  const abs = a => a < 0n ? -a : a;
  function gcd(a, b) {
    a = abs(a); b = abs(b);
    while (b) [a, b] = [b, a % b];
    return a;
  }
  function q(n, d = 1n) {
    if (d === 0n) throw new RangeError("Zero denominator");
    if (d < 0n) { n = -n; d = -d; }
    const common = gcd(n, d);
    return { n: n / common, d: d / common };
  }
  const ZERO = q(0n), ONE = q(1n), HUNDRED = q(100n);
  const add = (a, b) => q(a.n * b.d + b.n * a.d, a.d * b.d);
  const neg = a => q(-a.n, a.d);
  const sub = (a, b) => add(a, neg(b));
  const mul = (a, b) => q(a.n * b.n, a.d * b.d);
  const div = (a, b) => q(a.n * b.d, a.d * b.n);
  const cmp = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
  const string = a => a.d === 1n ? String(a.n) : `${a.n}/${a.d}`;
  const canonical = value => {
    const [n, d = "1"] = value.split("/");
    return q(BigInt(n), BigInt(d));
  };
  const number = value => { // Display coordinates only; certificates retain exact fractions.
    const a = typeof value === "string" ? canonical(value) : value;
    return Number(a.n) / Number(a.d);
  };
  function exact(raw) {
    if (typeof raw !== "string" || !INPUT.test(raw)) {
      throw new Error("Use nonnegative decimals (up to six places) or fractions such as 99/2.");
    }
    let value;
    if (raw.includes("/")) {
      const [n, d] = raw.split("/");
      value = q(BigInt(n), BigInt(d));
    } else if (raw.includes(".")) {
      const [whole, decimal] = raw.split(".");
      value = q(BigInt(whole + decimal), 10n ** BigInt(decimal.length));
    } else value = q(BigInt(raw));
    if (cmp(value, ZERO) < 0 || cmp(value, HUNDRED) > 0) {
      throw new Error("Readings and target must be between 0 and 100.");
    }
    return value;
  }
  function winner(readings, target) {
    const ordered = [...readings].sort(cmp);
    const mean = div(readings.reduce(add, ZERO), q(BigInt(readings.length)));
    const median = ordered[Math.floor(readings.length / 2)];
    const factorA = sub(mean, median);
    const factorB = sub(add(mean, median), mul(q(2n), target));
    const sign = factorA.n * factorB.n;
    return sign < 0n ? "Mean" : sign > 0n ? "Median" : "Tie";
  }
  function partitions(fixed, target) {
    const n = fixed.length + 1;
    const ordered = [...fixed].sort(cmp);
    const lower = ordered[(n - 1) / 2 - 1], upper = ordered[(n - 1) / 2];
    const total = fixed.reduce(add, ZERO);
    const unit = div(ONE, q(BigInt(n)));
    const base = div(total, q(BigInt(n)));
    const segments = [[ZERO, lower, lower, ZERO], [lower, upper, ZERO, ONE],
      [upper, HUNDRED, upper, ZERO]];
    const knots = new Map([ZERO, HUNDRED, lower, upper].map(x => [string(x), x]));
    for (const [start, end, intercept, slope] of segments) {
      const factors = [[sub(base, intercept), sub(unit, slope)],
        [sub(add(base, intercept), mul(q(2n), target)), add(unit, slope)]];
      for (const [constant, coefficient] of factors) {
        if (coefficient.n === 0n) continue;
        const root = div(neg(constant), coefficient);
        if (cmp(start, root) <= 0 && cmp(root, end) <= 0) knots.set(string(root), root);
      }
    }
    return [...knots.values()].sort(cmp);
  }
  function route(readings, index, target, baseline) {
    const fixed = readings.filter((_, i) => i !== index);
    const original = readings[index];
    const knots = partitions(fixed, target);
    const pointWinners = knots.map(value => winner([...fixed, value], target));
    const intervalWinners = knots.slice(1).map((value, i) =>
      winner([...fixed, div(add(knots[i], value), q(2n))], target));
    const opposite = baseline === "Mean" ? "Median" : "Mean";
    const candidates = [];
    intervalWinners.forEach((result, i) => {
      if (result !== opposite) return;
      const left = knots[i], right = knots[i + 1];
      let boundary;
      if (cmp(original, left) < 0) boundary = left;
      else if (cmp(original, right) > 0) boundary = right;
      else throw new Error("An opposing interval contains the original strict winner.");
      candidates.push({distance: absQ(sub(original, boundary)), boundary,
        witness: div(add(left, right), q(2n))});
    });
    candidates.sort((a, b) => cmp(a.distance, b.distance) ||
      cmp(a.boundary, b.boundary) || cmp(a.witness, b.witness));
    const best = candidates[0];
    if (best && winner([...fixed, best.boundary], target) !== "Tie") {
      throw new Error("A nearest strict reversal boundary must be a tie.");
    }
    return {index, knots: knots.map(string), pointWinners, intervalWinners,
      threshold: best ? string(best.boundary) : null,
      distance: best ? string(best.distance) : null,
      witness: best ? string(best.witness) : null};
  }
  const absQ = a => q(abs(a.n), a.d);
  function certificate(rawReadings, rawTarget) {
    if (!Array.isArray(rawReadings) || rawReadings.length < 3 ||
        rawReadings.length > 21 || rawReadings.length % 2 !== 1) {
      throw new Error("Supply an odd count of 3 through 21 readings.");
    }
    const readings = rawReadings.map(exact), target = exact(rawTarget);
    const inputs = {readings: readings.map(string), target: string(target)};
    const baseline = winner(readings, target);
    if (baseline === "Tie") return {format: FORMAT, inputs,
      claim: {kind: "baseline-tie", baseline, routes: [], best: null}};
    const routes = readings.map((_, index) => route(readings, index, target, baseline));
    const feasible = routes.filter(item => item.threshold !== null);
    feasible.sort((a, b) => cmp(canonical(a.distance), canonical(b.distance)) || a.index - b.index);
    const bestRoute = feasible[0];
    const best = bestRoute ? {index: bestRoute.index, threshold: bestRoute.threshold,
      distance: bestRoute.distance, witness: bestRoute.witness} : null;
    return {format: FORMAT, inputs,
      claim: {kind: "strict-baseline", baseline, routes, best}};
  }
  return {certificate, exact, number};
});
