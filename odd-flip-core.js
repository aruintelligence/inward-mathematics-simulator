/* Exact arithmetic for the local sample reversal lab. The independent Python
   verifier in tools/verify_odd_sample_flip.py checks exported certificates. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.InwardOddFlip = api;
})(globalThis, function () {
  "use strict";
  const FORMAT = "inward-odd-sample-flip-v1";
  const BOUNDED_FORMAT = "inward-odd-sample-flip-v2";
  const EVEN_FORMAT = "inward-even-sample-flip-v3";
  const INPUT = /^(?:-?(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,6})?|-?(?:0|[1-9][0-9]{0,8})\/[1-9][0-9]{0,8})$/;
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
  const LIMIT = q(1000000n);
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
  function exact(raw, low = ZERO, high = HUNDRED) {
    if (typeof raw !== "string" || !INPUT.test(raw)) {
      throw new Error("Use decimals (up to six places) or fractions with at most nine digits per part.");
    }
    let value;
    if (raw.includes("/")) {
      const [n, d] = raw.split("/");
      value = q(BigInt(n), BigInt(d));
    } else if (raw.includes(".")) {
      const [whole, decimal] = raw.split(".");
      value = q(BigInt(whole + decimal), 10n ** BigInt(decimal.length));
    } else value = q(BigInt(raw));
    if (cmp(value, low) < 0 || cmp(value, high) > 0) {
      throw new Error(`Value must be between ${string(low)} and ${string(high)}.`);
    }
    return value;
  }
  function winner(readings, target) {
    const ordered = [...readings].sort(cmp);
    const mean = div(readings.reduce(add, ZERO), q(BigInt(readings.length)));
    const median = div(add(ordered[Math.floor((readings.length - 1) / 2)],
      ordered[Math.floor(readings.length / 2)]), q(2n));
    const factorA = sub(mean, median);
    const factorB = sub(add(mean, median), mul(q(2n), target));
    const sign = factorA.n * factorB.n;
    return sign < 0n ? "Mean" : sign > 0n ? "Median" : "Tie";
  }
  function partitions(fixed, target, low = ZERO, high = HUNDRED) {
    const n = fixed.length + 1;
    const ordered = [...fixed].sort(cmp);
    const even = n % 2 === 0, k = Math.floor(n / 2);
    const lower = even ? ordered[k - 2] : ordered[k - 1];
    const upper = ordered[k];
    const center = even ? ordered[k - 1] : ZERO;
    const leftMedian = even ? div(add(lower, center), q(2n)) : lower;
    const rightMedian = even ? div(add(center, upper), q(2n)) : upper;
    const middleIntercept = even ? div(center, q(2n)) : ZERO;
    const middleSlope = even ? div(ONE, q(2n)) : ONE;
    const total = fixed.reduce(add, ZERO);
    const unit = div(ONE, q(BigInt(n)));
    const base = div(total, q(BigInt(n)));
    const segments = [[low, lower, leftMedian, ZERO],
      [lower, upper, middleIntercept, middleSlope], [upper, high, rightMedian, ZERO]];
    const knots = new Map([low, high, lower, upper].map(x => [string(x), x]));
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
  function route(readings, index, target, baseline, low = ZERO, high = HUNDRED) {
    const fixed = readings.filter((_, i) => i !== index);
    const original = readings[index];
    const knots = partitions(fixed, target, low, high);
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
  function certificate(rawReadings, rawTarget, rawLow, rawHigh) {
    if (!Array.isArray(rawReadings) || rawReadings.length < 3 ||
        rawReadings.length > 21) {
      throw new Error("Supply 3 through 21 readings.");
    }
    const custom = rawLow !== undefined || rawHigh !== undefined;
    if (custom && (rawLow === undefined || rawHigh === undefined)) {
      throw new Error("Supply both movement bounds.");
    }
    const low = custom ? exact(rawLow, neg(LIMIT), LIMIT) : ZERO;
    const high = custom ? exact(rawHigh, neg(LIMIT), LIMIT) : HUNDRED;
    if (cmp(low, high) >= 0) throw new Error("Movement bounds must have positive width.");
    const readings = rawReadings.map(value => exact(value, low, high));
    const target = exact(rawTarget, custom ? neg(LIMIT) : ZERO, custom ? LIMIT : HUNDRED);
    const even = readings.length % 2 === 0;
    const format = even ? EVEN_FORMAT : custom ? BOUNDED_FORMAT : FORMAT;
    const inputs = {readings: readings.map(string), target: string(target)};
    if (custom || even) inputs.bounds = {low: string(low), high: string(high)};
    const baseline = winner(readings, target);
    if (baseline === "Tie") return {format, inputs,
      claim: {kind: "baseline-tie", baseline, routes: [], best: null}};
    const routes = readings.map((_, index) => route(readings, index, target, baseline, low, high));
    const feasible = routes.filter(item => item.threshold !== null);
    feasible.sort((a, b) => cmp(canonical(a.distance), canonical(b.distance)) || a.index - b.index);
    const bestRoute = feasible[0];
    const best = bestRoute ? {index: bestRoute.index, threshold: bestRoute.threshold,
      distance: bestRoute.distance, witness: bestRoute.witness} : null;
    return {format, inputs,
      claim: {kind: "strict-baseline", baseline, routes, best}};
  }
  const position = (value, low, high) => {
    const ratio = div(sub(canonical(value), canonical(low)), sub(canonical(high), canonical(low)));
    return Number(ratio.n * 1000000000000n / ratio.d) / 1e12;
  };
  return {certificate, exact, number, position};
});
