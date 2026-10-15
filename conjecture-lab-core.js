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
  // Keep the five-reading mean as an exact fraction, with one pass over the input.
  function pair(readings) {
    const sum = readings.reduce((total, x) => add(total, x), rat(0n));
    return [rat(sum.n, sum.d * 5n), readings[2]];
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
  return {scan, parseGrid, FORMAT, SCOPE, CLAIMS};
});
