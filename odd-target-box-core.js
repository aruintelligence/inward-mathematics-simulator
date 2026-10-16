/* Exact target-box constructor. The independent Python verifier checks exports. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.InwardTargetBox = api;
})(globalThis, function () {
  "use strict";
  const FORMAT = "inward-odd-target-box-v1";
  const EVEN_FORMAT = "inward-even-target-box-v2";
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
    return {n: n / common, d: d / common};
  }
  const ZERO = q(0n), TWO = q(2n), LIMIT = q(1000000n);
  const add = (a, b) => q(a.n * b.d + b.n * a.d, a.d * b.d);
  const sub = (a, b) => add(a, q(-b.n, b.d));
  const mul = (a, b) => q(a.n * b.n, a.d * b.d);
  const div = (a, b) => q(a.n * b.d, a.d * b.n);
  const cmp = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
  const string = a => a.d === 1n ? String(a.n) : `${a.n}/${a.d}`;
  function parse(raw, low = q(-LIMIT.n), high = LIMIT) {
    if (typeof raw !== "string" || !INPUT.test(raw)) {
      throw new Error("Use decimals (up to six places) or fractions with at most nine digits per part.");
    }
    let value;
    if (raw.includes("/")) {
      const [n, d] = raw.split("/");
      value = q(BigInt(n), BigInt(d));
    } else if (raw.includes(".")) {
      const [whole, digits] = raw.split(".");
      value = q(BigInt(whole + digits), 10n ** BigInt(digits.length));
    } else value = q(BigInt(raw));
    if (cmp(value, low) < 0 || cmp(value, high) > 0) {
      throw new Error(`Value must be between ${string(low)} and ${string(high)}.`);
    }
    return value;
  }
  function estimators(fixed, moved) {
    const values = [...fixed, moved];
    const mean = div(values.reduce(add, ZERO), q(BigInt(values.length)));
    values.sort(cmp);
    const median = div(add(values[Math.floor((values.length - 1) / 2)],
      values[Math.floor(values.length / 2)]), TWO);
    return [mean, median];
  }
  function winner(fixed, moved, target) {
    const [mean, median] = estimators(fixed, moved);
    const delta = mul(sub(mean, median), sub(add(mean, median), mul(TWO, target)));
    return delta.n < 0n ? "Mean" : delta.n > 0n ? "Median" : "Tie";
  }
  function partitions(fixed, low, high, targetLow, targetHigh) {
    const n = fixed.length + 1;
    const ordered = [...fixed].sort(cmp);
    const even = n % 2 === 0, k = Math.floor(n / 2);
    const lower = ordered[even ? k - 2 : k - 1], upper = ordered[k];
    const center = even ? ordered[k - 1] : ZERO;
    const leftMedian = even ? div(add(lower, center), TWO) : lower;
    const rightMedian = even ? div(add(center, upper), TWO) : upper;
    const total = fixed.reduce(add, ZERO);
    const unit = div(q(1n), q(BigInt(n))), base = div(total, q(BigInt(n)));
    const knots = new Map([low, high, lower, upper].map(x => [string(x), x]));
    for (const [start, end, intercept, slope] of [
      [low, lower, leftMedian, ZERO],
      [lower, upper, even ? div(center, TWO) : ZERO, even ? div(q(1n), TWO) : q(1n)],
      [upper, high, rightMedian, ZERO]
    ]) {
      const first = [sub(base, intercept), sub(unit, slope)];
      const second = [targetLow, targetHigh].map(target =>
        [sub(add(base, intercept), mul(TWO, target)), add(unit, slope)]);
      for (const [constant, coefficient] of [first, ...second]) {
        if (coefficient.n === 0n) continue;
        const root = div(q(-constant.n, constant.d), coefficient);
        if (cmp(start, root) <= 0 && cmp(root, end) <= 0) knots.set(string(root), root);
      }
    }
    return [...knots.values()].sort(cmp);
  }
  function route(readings, index, low, high, targetLow, targetHigh) {
    const fixed = readings.filter((_, i) => i !== index);
    const knots = partitions(fixed, low, high, targetLow, targetHigh);
    const samples = [knots[0]];
    for (let i = 0; i < knots.length - 1; i++) {
      samples.push(div(add(knots[i], knots[i + 1]), TWO), knots[i + 1]);
    }
    const witnesses = {};
    for (const moved of samples) {
      const [mean, median] = estimators(fixed, moved);
      const crossing = div(add(mean, median), TWO);
      const targets = [targetLow, targetHigh];
      if (cmp(targetLow, crossing) <= 0 && cmp(crossing, targetHigh) <= 0) targets.push(crossing);
      for (const target of targets) {
        const name = winner(fixed, moved, target);
        if (!Object.hasOwn(witnesses, name)) witnesses[name] = {reading: string(moved), target: string(target)};
      }
    }
    const reachable = ["Mean", "Median", "Tie"].filter(name => Object.hasOwn(witnesses, name));
    const guarantee = reachable.length === 1 && reachable[0] !== "Tie" ? reachable[0] : null;
    return {index, knots: knots.map(string), reachable, guarantee,
      witnesses: Object.fromEntries(reachable.map(name => [name, witnesses[name]]))};
  }
  function certificate(rawReadings, rawLow, rawHigh, rawTargetLow, rawTargetHigh) {
    if (!Array.isArray(rawReadings) || rawReadings.length < 3 ||
        rawReadings.length > 21) {
      throw new Error("Supply 3 through 21 readings.");
    }
    const low = parse(rawLow), high = parse(rawHigh);
    if (cmp(low, high) >= 0) throw new Error("Movement bounds must have positive width.");
    const targetLow = parse(rawTargetLow), targetHigh = parse(rawTargetHigh);
    if (cmp(targetLow, targetHigh) > 0) throw new Error("Target bounds must be ordered.");
    const readings = rawReadings.map(raw => parse(raw, low, high));
    const routes = readings.map((_, index) => route(readings, index, low, high, targetLow, targetHigh));
    const reachable = ["Mean", "Median", "Tie"].filter(name => routes.some(r => r.reachable.includes(name)));
    const guarantee = reachable.length === 1 && reachable[0] !== "Tie" ? reachable[0] : null;
    return {format: readings.length % 2 ? FORMAT : EVEN_FORMAT, inputs: {readings: readings.map(string),
      movement: {low: string(low), high: string(high)},
      target: {low: string(targetLow), high: string(targetHigh)}},
    claim: {routes, reachable, guarantee}};
  }
  function position(raw, rawLow, rawHigh) {
    const canonical = value => {
      const [numerator, denominator = "1"] = value.split("/");
      return q(BigInt(numerator), BigInt(denominator));
    };
    const x = canonical(raw), low = canonical(rawLow), high = canonical(rawHigh);
    const ratio = div(sub(x, low), sub(high, low));
    return Number(ratio.n * 1000000000000n / ratio.d) / 1e12;
  }
  return {certificate, position};
});
