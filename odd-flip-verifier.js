/* Independently check odd-sample flip certificates. This file does not import
   the constructor in odd-flip-core.js or the Python certificate generator. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.InwardOddFlipVerifier = api;
})(globalThis, function () {
  "use strict";
  const FORMAT = "inward-odd-sample-flip-v1";
  const RATIONAL = /^(?:0|[1-9][0-9]{0,256})(?:\/[1-9][0-9]{0,256})?$/;
  const fail = message => { throw new Error(message); };
  const abs = x => x < 0n ? -x : x;
  function gcd(a, b) {
    a = abs(a); b = abs(b);
    while (b !== 0n) [a, b] = [b, a % b];
    return a;
  }
  function fraction(n, d = 1n) {
    if (d === 0n) fail("Zero denominator");
    if (d < 0n) [n, d] = [-n, -d];
    const divisor = gcd(n, d);
    return {n: n / divisor, d: d / divisor};
  }
  const ZERO = fraction(0n), HUNDRED = fraction(100n);
  const plus = (a, b) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
  const minus = (a, b) => fraction(a.n * b.d - b.n * a.d, a.d * b.d);
  const times = (a, b) => fraction(a.n * b.n, a.d * b.d);
  const divide = (a, b) => fraction(a.n * b.d, a.d * b.n);
  const compare = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
  const notation = a => a.d === 1n ? String(a.n) : `${a.n}/${a.d}`;
  const magnitude = a => fraction(abs(a.n), a.d);
  function rational(value, label, bounded = false) {
    if (typeof value !== "string" || !RATIONAL.test(value)) fail(`Invalid ${label} rational`);
    const [top, bottom = "1"] = value.split("/");
    const result = fraction(BigInt(top), BigInt(bottom));
    if (notation(result) !== value || bounded && compare(result, HUNDRED) > 0) {
      fail(`Noncanonical or out-of-range ${label}`);
    }
    return result;
  }
  function fields(object, expected, label) {
    if (object === null || typeof object !== "object" || Array.isArray(object) ||
        Object.keys(object).length !== expected.length ||
        expected.some(name => !Object.hasOwn(object, name))) fail(`Invalid ${label} fields`);
  }
  function equal(actual, claimed, label) {
    if (Array.isArray(actual)) {
      if (!Array.isArray(claimed) || actual.length !== claimed.length ||
          actual.some((value, index) => value !== claimed[index])) fail(`Incorrect ${label}`);
    } else if (actual !== claimed) fail(`Incorrect ${label}`);
  }
  // JSON.parse accepts repeated keys and keeps the last value. Walk the
  // already syntax-validated source to reject repeated decoded names at every depth.
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
      if (depth > 64) fail("Certificate JSON nesting too deep");
      space();
      if (source[cursor] === "{") {
        cursor++; space();
        const keys = new Set();
        while (source[cursor] !== "}") {
          const key = quoted();
          if (keys.has(key)) fail(`Duplicate JSON key: ${key}`);
          keys.add(key);
          space(); cursor++; // Colon already syntax-validated.
          scan(depth + 1); space();
          if (source[cursor] === ",") {cursor++; space();} else break;
        }
        cursor++;
      } else if (source[cursor] === "[") {
        cursor++; space();
        while (source[cursor] !== "]") {
          scan(depth + 1); space();
          if (source[cursor] === ",") {cursor++; space();} else break;
        }
        cursor++;
      } else if (source[cursor] === '"') quoted();
      else while (cursor < source.length && !/[ \t\r\n,\]}]/.test(source[cursor])) cursor++;
    }
    scan(0);
    return parsed;
  }
  function outcome(fixed, moved, target) {
    const values = [...fixed, moved].sort(compare);
    const mean = divide(values.reduce(plus, ZERO), fraction(BigInt(values.length)));
    const median = values[Math.floor(values.length / 2)];
    const meanError = minus(mean, target), medianError = minus(median, target);
    const delta = minus(times(meanError, meanError), times(medianError, medianError));
    const sign = compare(delta, ZERO);
    return sign < 0 ? "Mean" : sign > 0 ? "Median" : "Tie";
  }
  function roots(fixed, target) {
    const n = fixed.length + 1;
    const sorted = [...fixed].sort(compare);
    const lower = sorted[(n - 1) / 2 - 1], upper = sorted[(n - 1) / 2];
    const sum = fixed.reduce(plus, ZERO), count = fraction(BigInt(n));
    const two = fraction(2n);
    const knots = new Map([ZERO, HUNDRED, lower, upper].map(x => [notation(x), x]));
    const left = [minus(times(count, lower), sum),
      minus(times(count, minus(times(two, target), lower)), sum)];
    const right = [minus(times(count, upper), sum),
      minus(times(count, minus(times(two, target), upper)), sum)];
    const middle = [divide(sum, fraction(BigInt(n - 1))),
      divide(minus(times(times(two, count), target), sum), fraction(BigInt(n + 1)))];
    for (const [start, end, candidates] of [[ZERO, lower, left], [lower, upper, middle],
      [upper, HUNDRED, right]]) {
      for (const point of candidates) {
        if (compare(start, point) <= 0 && compare(point, end) <= 0) knots.set(notation(point), point);
      }
    }
    return [...knots.values()].sort(compare);
  }
  function verify(record) {
    fields(record, ["format", "inputs", "claim"], "certificate");
    if (record.format !== FORMAT) fail("Unknown certificate format");
    fields(record.inputs, ["readings", "target"], "inputs");
    const raw = record.inputs.readings;
    if (!Array.isArray(raw) || raw.length < 3 || raw.length > 21 || raw.length % 2 !== 1) {
      fail("Reading count must be odd and between 3 and 21");
    }
    const values = raw.map((value, index) => rational(value, `reading ${index + 1}`, true));
    const target = rational(record.inputs.target, "target", true);
    fields(record.claim, ["kind", "baseline", "routes", "best"], "claim");
    const {claim} = record;
    const baseline = outcome(values.slice(0, -1), values.at(-1), target);
    equal(baseline, claim.baseline, "starting winner");
    if (baseline === "Tie") {
      if (claim.kind !== "baseline-tie" || !Array.isArray(claim.routes) ||
          claim.routes.length !== 0 || claim.best !== null) fail("Invalid tied baseline claim");
      return {kind: "baseline-tie", baseline, routes: 0, best: null};
    }
    if (claim.kind !== "strict-baseline" || !Array.isArray(claim.routes) ||
        claim.routes.length !== values.length) fail("Invalid strict baseline routes");
    const opposite = baseline === "Mean" ? "Median" : "Mean";
    const optimal = [];
    claim.routes.forEach((route, index) => {
      fields(route, ["index", "knots", "pointWinners", "intervalWinners",
        "threshold", "distance", "witness"], `route ${index + 1}`);
      if (!Number.isInteger(route.index) || route.index !== index) fail("Incorrect route index");
      const fixed = values.filter((_, i) => i !== index), original = values[index];
      const partition = roots(fixed, target);
      if (!Array.isArray(route.knots) || route.knots.length !== partition.length ||
          route.knots.some((value, i) => compare(rational(value, "knot", true), partition[i]) !== 0)) {
        fail(`Incomplete factor-root partition in route ${index + 1}`);
      }
      const points = partition.map(x => outcome(fixed, x, target));
      const intervals = partition.slice(1).map((x, i) =>
        outcome(fixed, divide(plus(partition[i], x), fraction(2n)), target));
      equal(points, route.pointWinners, "boundary winners");
      equal(intervals, route.intervalWinners, "interval winners");
      const candidates = [];
      intervals.forEach((winner, i) => {
        if (winner !== opposite) return;
        const left = partition[i], right = partition[i + 1];
        let edge;
        if (compare(original, left) < 0) edge = left;
        else if (compare(original, right) > 0) edge = right;
        else fail("Starting winner inside an opposing interval");
        candidates.push({distance: magnitude(minus(original, edge)), edge, left, right});
      });
      if (!candidates.length) {
        if ([route.threshold, route.distance, route.witness].some(x => x !== null)) {
          fail(`Unreachable route ${index + 1} claims a reversal`);
        }
        return;
      }
      candidates.sort((a, b) => compare(a.distance, b.distance) || compare(a.edge, b.edge) ||
        compare(a.left, b.left) || compare(a.right, b.right));
      const nearest = candidates[0];
      if (compare(rational(route.threshold, "threshold", true), nearest.edge) !== 0 ||
          compare(rational(route.distance, "distance", true), nearest.distance) !== 0) {
        fail(`Incorrect optimal threshold in route ${index + 1}`);
      }
      if (outcome(fixed, nearest.edge, target) !== "Tie") fail("Claimed boundary is not a tie");
      const witness = rational(route.witness, "witness", true);
      if (!candidates.some(candidate => compare(candidate.edge, nearest.edge) === 0 &&
          compare(candidate.left, witness) < 0 && compare(witness, candidate.right) < 0) ||
          outcome(fixed, witness, target) !== opposite) fail("Witness does not strictly reverse the winner");
      optimal.push({distance: nearest.distance, index, route});
    });
    if (optimal.length === 0) {
      if (claim.best !== null) fail("No route has a strict reversal");
    } else {
      optimal.sort((a, b) => compare(a.distance, b.distance) || a.index - b.index);
      const chosen = optimal[0].route;
      fields(claim.best, ["index", "threshold", "distance", "witness"], "best route");
      for (const key of ["index", "threshold", "distance", "witness"]) {
        equal(chosen[key], claim.best[key], `best ${key}`);
      }
    }
    return {kind: "strict-baseline", baseline, routes: values.length, best: claim.best};
  }
  return {parseReceipt, verify};
});
