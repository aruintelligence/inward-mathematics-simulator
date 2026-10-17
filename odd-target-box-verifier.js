/* Independent checker for target-box certificates. No constructor code is imported. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.InwardTargetBoxVerifier = api;
})(globalThis, function () {
  "use strict";
  const FORMAT = "inward-odd-target-box-v1";
  const EVEN_FORMAT = "inward-even-target-box-v2";
  const GAP_FORMAT = "inward-target-box-gap-v3";
  const STABILITY_FORMAT = "inward-target-box-stability-v4";
  const ATLAS_FORMAT = "inward-target-box-atlas-v5";
  const RATIONAL = /^(?:0|-?[1-9][0-9]{0,256})(?:\/[1-9][0-9]{0,256})?$/;
  const ORDER = ["Mean", "Median", "Tie"];
  const fail = message => { throw new Error(message); };
  const abs = n => n < 0n ? -n : n;
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
  const ZERO = fraction(0n), TWO = fraction(2n), LIMIT = fraction(1_000_000n);
  const NEGATIVE_LIMIT = fraction(-1_000_000n);
  const add = (a, b) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
  const subtract = (a, b) => fraction(a.n * b.d - b.n * a.d, a.d * b.d);
  const multiply = (a, b) => fraction(a.n * b.n, a.d * b.d);
  const divide = (a, b) => fraction(a.n * b.d, a.d * b.n);
  const compare = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
  const notation = a => a.d === 1n ? String(a.n) : `${a.n}/${a.d}`;
  function rational(raw, label, low, high) {
    if (typeof raw !== "string" || !RATIONAL.test(raw)) fail(`Invalid ${label} rational`);
    const [top, bottom = "1"] = raw.split("/");
    const value = fraction(BigInt(top), BigInt(bottom));
    if (notation(value) !== raw || low && compare(value, low) < 0 ||
        high && compare(value, high) > 0) fail(`Noncanonical or out-of-range ${label}`);
    return value;
  }
  function fields(object, names, label) {
    if (object === null || typeof object !== "object" || Array.isArray(object) ||
        Object.keys(object).length !== names.length ||
        names.some(name => !Object.hasOwn(object, name))) fail(`Invalid ${label} fields`);
  }
  function sameList(actual, expected, label) {
    if (!Array.isArray(actual) || actual.length !== expected.length ||
        actual.some((item, index) => item !== expected[index])) fail(`Incorrect ${label}`);
  }

  // JSON.parse silently accepts duplicate names. Scan the already syntax-checked
  // source, decoding each key, so escaped and literal spellings collide too.
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
          space(); cursor++; // Colon was checked by JSON.parse.
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

  function estimators(fixed, moved) {
    const sorted = [...fixed, moved].sort(compare);
    const mean = divide(sorted.reduce(add, ZERO), fraction(BigInt(sorted.length)));
    const median = divide(add(sorted[Math.floor((sorted.length - 1) / 2)],
      sorted[Math.floor(sorted.length / 2)]), TWO);
    return [mean, median];
  }
  function outcome(fixed, moved, target) {
    const [mean, median] = estimators(fixed, moved);
    const meanError = subtract(mean, target), medianError = subtract(median, target);
    const difference = subtract(multiply(meanError, meanError),
      multiply(medianError, medianError));
    const sign = compare(difference, ZERO);
    return sign < 0 ? "Mean" : sign > 0 ? "Median" : "Tie";
  }
  function allRoots(fixed, low, high, targetLow, targetHigh) {
    const n = fixed.length + 1;
    const ordered = [...fixed].sort(compare);
    const even = n % 2 === 0, k = Math.floor(n / 2);
    const lower = ordered[even ? k - 2 : k - 1], upper = ordered[k];
    const center = even ? ordered[k - 1] : ZERO;
    const leftMedian = even ? divide(add(lower, center), TWO) : lower;
    const rightMedian = even ? divide(add(center, upper), TWO) : upper;
    const sum = fixed.reduce(add, ZERO), count = fraction(BigInt(n));
    const candidates = new Map([low, high, lower, upper].map(x => [notation(x), x]));
    for (const [start, end, median] of [[low, lower, leftMedian], [upper, high, rightMedian]]) {
      const roots = [subtract(multiply(count, median), sum),
        ...[targetLow, targetHigh].map(target =>
          subtract(multiply(count, subtract(multiply(TWO, target), median)), sum))];
      for (const root of roots) {
        if (compare(start, root) <= 0 && compare(root, end) <= 0) {
          candidates.set(notation(root), root);
        }
      }
    }
    const middle = even ? [
      divide(subtract(multiply(TWO, sum), multiply(count, center)), fraction(BigInt(n - 2))),
      ...[targetLow, targetHigh].map(target => divide(subtract(
        subtract(multiply(fraction(BigInt(4 * n)), target), multiply(TWO, sum)),
        multiply(count, center)), fraction(BigInt(n + 2))))
    ] : [divide(sum, fraction(BigInt(n - 1))),
      ...[targetLow, targetHigh].map(target =>
        divide(subtract(multiply(multiply(TWO, count), target), sum), fraction(BigInt(n + 1))))];
    for (const root of middle) {
      if (compare(lower, root) <= 0 && compare(root, upper) <= 0) {
        candidates.set(notation(root), root);
      }
    }
    return [...candidates.values()].sort(compare);
  }
  function allOutcomes(fixed, knots, targetLow, targetHigh) {
    const found = new Set();
    const samples = [knots[0]];
    for (let i = 1; i < knots.length; i++) {
      samples.push(divide(add(knots[i - 1], knots[i]), TWO), knots[i]);
    }
    for (const moved of samples) {
      found.add(outcome(fixed, moved, targetLow));
      found.add(outcome(fixed, moved, targetHigh));
      const [mean, median] = estimators(fixed, moved);
      const crossing = divide(add(mean, median), TWO);
      if (compare(targetLow, crossing) <= 0 && compare(crossing, targetHigh) <= 0) found.add("Tie");
    }
    return ORDER.filter(name => found.has(name));
  }
  function strictWinner(reachable) {
    return reachable.length === 1 && reachable[0] !== "Tie" ? reachable[0] : null;
  }
  function gapAt(fixed, moved, target) {
    const [mean, median] = estimators(fixed, moved);
    const meanError = subtract(mean, target), medianError = subtract(median, target);
    return subtract(multiply(meanError, meanError), multiply(medianError, medianError));
  }
  function extrema(fixed, knots, targetLow, targetHigh) {
    const values = [];
    for (const target of [targetLow, targetHigh]) {
      for (let i = 0; i < knots.length - 1; i++) {
        const left = knots[i], right = knots[i + 1];
        values.push(gapAt(fixed, left, target), gapAt(fixed, right, target));
        const [meanLeft, medianLeft] = estimators(fixed, left);
        const [, medianRight] = estimators(fixed, right);
        const medianSlope = divide(subtract(medianRight, medianLeft), subtract(right, left));
        const medianBase = subtract(medianLeft, multiply(medianSlope, left));
        const meanSlope = divide(fraction(1n), fraction(BigInt(fixed.length + 1)));
        const meanBase = subtract(meanLeft, multiply(meanSlope, left));
        const a = subtract(multiply(meanSlope, meanSlope), multiply(medianSlope, medianSlope));
        if (compare(a, ZERO) === 0) continue;
        const b = multiply(TWO, subtract(
          multiply(subtract(meanBase, target), meanSlope),
          multiply(subtract(medianBase, target), medianSlope)));
        const vertex = divide(subtract(ZERO, b), multiply(TWO, a));
        if (compare(left, vertex) < 0 && compare(vertex, right) < 0) {
          values.push(gapAt(fixed, vertex, target));
        }
      }
    }
    values.sort(compare);
    return {min: values[0], max: values[values.length - 1]};
  }
  function checkGap(gap, expected, fixed, low, high, targetLow, targetHigh, label) {
    fields(gap, ["min", "max"], label);
    for (const extreme of ["min", "max"]) {
      const point = gap[extreme];
      fields(point, ["value", "reading", "target"], `${label} ${extreme}`);
      const value = rational(point.value, `${label} ${extreme} value`);
      const reading = rational(point.reading, `${label} ${extreme} reading`, low, high);
      const target = rational(point.target, `${label} ${extreme} target`, targetLow, targetHigh);
      if (compare(value, expected[extreme]) !== 0 ||
          compare(value, gapAt(fixed, reading, target)) !== 0) {
        fail(`Incorrect ${label} ${extreme} or unattained witness`);
      }
    }
  }
  function checkStability(stability, fixed, start, roots, low, high, targetLow, targetHigh, index) {
    fields(stability, ["baseline", "left", "right"], `route ${index + 1} stability`);
    const atStart = [outcome(fixed, start, targetLow), outcome(fixed, start, targetHigh)];
    const baseline = atStart[0] === atStart[1] && atStart[0] !== "Tie" ? atStart[0] : null;
    if (stability.baseline !== baseline) fail(`Incorrect route ${index + 1} baseline`);
    const failures = [];
    for (const [side, edge] of [["left", low], ["right", high]]) {
      const detail = stability[side];
      fields(detail, ["limit", "included", "witness"], `${side} stability boundary`);
      const candidates = [start, ...roots.filter(x => side === "left" ?
        compare(x, start) < 0 : compare(x, start) > 0)].sort((a, b) =>
          side === "left" ? -compare(a, b) : compare(a, b));
      const first = candidates.find(x => baseline === null ||
        outcome(fixed, x, targetLow) !== baseline || outcome(fixed, x, targetHigh) !== baseline);
      const limit = rational(detail.limit, `${side} stability limit`, low, high);
      if (first === undefined) {
        if (compare(limit, edge) !== 0 || detail.included !== true || detail.witness !== null) {
          fail(`Incorrect safe ${side} boundary on route ${index + 1}`);
        }
        continue;
      }
      if (compare(limit, first) !== 0 || detail.included !== false) {
        fail(`Incorrect first ${side} failure on route ${index + 1}`);
      }
      fields(detail.witness, ["reading", "target"], `${side} failure witness`);
      const moved = rational(detail.witness.reading, "failure reading", low, high);
      const target = rational(detail.witness.target, "failure target", targetLow, targetHigh);
      if (compare(moved, first) !== 0 || outcome(fixed, moved, target) !== "Tie") {
        fail(`False ${side} tie witness on route ${index + 1}`);
      }
      failures.push({distance: side === "left" ? subtract(start, first) : subtract(first, start),
        index, side, reading: first, target});
    }
    return {baseline, failures};
  }
  function checkRegion(region, fixed, roots, targetLow, targetHigh, index) {
    fields(region, ["stripes", "verticalTies"], `route ${index + 1} region`);
    if (!Array.isArray(region.stripes) || region.stripes.length !== roots.length - 1) {
      fail(`Incomplete region stripes on route ${index + 1}`);
    }
    const crossing = moved => {
      const [mean, median] = estimators(fixed, moved);
      return divide(add(mean, median), TWO);
    };
    for (let i = 0; i < region.stripes.length; i++) {
      const stripe = region.stripes[i], left = roots[i], right = roots[i + 1];
      fields(stripe, ["from", "to", "tieFrom", "tieTo", "below", "above",
        "atTargetLow", "atTargetHigh"], `route ${index + 1} stripe ${i + 1}`);
      if (compare(rational(stripe.from, "stripe start"), left) !== 0 ||
          compare(rational(stripe.to, "stripe end"), right) !== 0 ||
          compare(rational(stripe.tieFrom, "first tie target", NEGATIVE_LIMIT, LIMIT), crossing(left)) !== 0 ||
          compare(rational(stripe.tieTo, "last tie target", NEGATIVE_LIMIT, LIMIT), crossing(right)) !== 0) {
        fail(`Incorrect region geometry on route ${index + 1}`);
      }
      const midpoint = divide(add(left, right), TWO), tie = crossing(midpoint);
      const below = outcome(fixed, midpoint, subtract(tie, fraction(1n)));
      const above = outcome(fixed, midpoint, add(tie, fraction(1n)));
      if (stripe.below !== below || stripe.above !== above || below === above ||
          stripe.atTargetLow !== outcome(fixed, midpoint, targetLow) ||
          stripe.atTargetHigh !== outcome(fixed, midpoint, targetHigh)) {
        fail(`Incorrect region winner on route ${index + 1}`);
      }
    }
    const ties = roots.filter(moved => {
      const [mean, median] = estimators(fixed, moved);
      return compare(mean, median) === 0;
    }).map(notation);
    sameList(region.verticalTies, ties, `all-target tie columns on route ${index + 1}`);
  }
  function verify(record) {
    fields(record, ["format", "inputs", "claim"], "certificate");
    if (![FORMAT, EVEN_FORMAT, GAP_FORMAT, STABILITY_FORMAT, ATLAS_FORMAT].includes(record.format)) fail("Unknown certificate format");
    fields(record.inputs, ["readings", "movement", "target"], "inputs");
    fields(record.inputs.movement, ["low", "high"], "movement");
    fields(record.inputs.target, ["low", "high"], "target");
    const {inputs, claim} = record;
    const low = rational(inputs.movement.low, "movement lower", NEGATIVE_LIMIT, LIMIT);
    const high = rational(inputs.movement.high, "movement upper", NEGATIVE_LIMIT, LIMIT);
    const targetLow = rational(inputs.target.low, "target lower", NEGATIVE_LIMIT, LIMIT);
    const targetHigh = rational(inputs.target.high, "target upper", NEGATIVE_LIMIT, LIMIT);
    if (compare(low, high) >= 0 || compare(targetLow, targetHigh) > 0) fail("Invalid interval order");
    if (!Array.isArray(inputs.readings) || inputs.readings.length < 3 ||
        inputs.readings.length > 21 || ![GAP_FORMAT, STABILITY_FORMAT, ATLAS_FORMAT].includes(record.format) &&
        (inputs.readings.length % 2 === 0) !== (record.format === EVEN_FORMAT)) {
      fail("Reading count must match certificate format and be between 3 and 21");
    }
    const readings = inputs.readings.map((item, index) =>
      rational(item, `reading ${index + 1}`, low, high));
    const quantified = record.format === GAP_FORMAT;
    const stable = record.format === STABILITY_FORMAT;
    const atlas = record.format === ATLAS_FORMAT;
    fields(claim, ["routes", "reachable", "guarantee",
      ...(quantified ? ["gap"] : stable ? ["stability"] : [])], "claim");
    if (!Array.isArray(claim.routes) || claim.routes.length !== readings.length) {
      fail("Missing one-reading routes");
    }
    const overall = new Set();
    const routeExtrema = [];
    const failures = [];
    let baseline = null;
    claim.routes.forEach((route, index) => {
      fields(route, ["index", "knots", "reachable", "guarantee", "witnesses",
        ...(quantified ? ["gap"] : stable ? ["stability"] : atlas ? ["region"] : [])], `route ${index + 1}`);
      if (!Number.isInteger(route.index) || route.index !== index) fail("Incorrect route index");
      const fixed = readings.filter((_, i) => i !== index);
      const roots = allRoots(fixed, low, high, targetLow, targetHigh);
      if (!Array.isArray(route.knots) || route.knots.length !== roots.length ||
          route.knots.some((raw, i) =>
            compare(rational(raw, "knot", low, high), roots[i]) !== 0)) {
        fail(`Incomplete partition on route ${index + 1}`);
      }
      const reachable = allOutcomes(fixed, roots, targetLow, targetHigh);
      sameList(route.reachable, reachable, `reachable outcomes on route ${index + 1}`);
      if (route.guarantee !== strictWinner(reachable)) fail(`Incorrect guarantee on route ${index + 1}`);
      fields(route.witnesses, reachable, `witnesses on route ${index + 1}`);
      for (const name of reachable) {
        const witness = route.witnesses[name];
        fields(witness, ["reading", "target"], `${name} witness`);
        const moved = rational(witness.reading, "witness reading", low, high);
        const target = rational(witness.target, "witness target", targetLow, targetHigh);
        if (outcome(fixed, moved, target) !== name) fail(`False ${name} witness on route ${index + 1}`);
      }
      if (quantified) {
        const expected = extrema(fixed, roots, targetLow, targetHigh);
        checkGap(route.gap, expected, fixed, low, high, targetLow, targetHigh,
          `route ${index + 1} gap`);
        if (route.guarantee === "Mean" && compare(expected.max, ZERO) >= 0 ||
            route.guarantee === "Median" && compare(expected.min, ZERO) <= 0) {
          fail(`Gap contradicts route ${index + 1} guarantee`);
        }
        routeExtrema.push(expected);
      }
      if (stable) {
        const checked = checkStability(route.stability, fixed, readings[index], roots,
          low, high, targetLow, targetHigh, index);
        if (index === 0) baseline = checked.baseline;
        else if (baseline !== checked.baseline) fail("Baseline differs across routes");
        failures.push(...checked.failures);
      }
      if (atlas) checkRegion(route.region, fixed, roots, targetLow, targetHigh, index);
      reachable.forEach(name => overall.add(name));
    });
    const reachable = ORDER.filter(name => overall.has(name));
    sameList(claim.reachable, reachable, "global reachable outcomes");
    const guarantee = strictWinner(reachable);
    if (claim.guarantee !== guarantee) fail("Incorrect global guarantee");
    if (quantified) {
      fields(claim.gap, ["min", "max"], "global gap");
      for (const extreme of ["min", "max"]) {
        const expected = routeExtrema.map(item => item[extreme]).sort(compare)[
          extreme === "min" ? 0 : routeExtrema.length - 1];
        const point = claim.gap[extreme];
        fields(point, ["value", "index", "reading", "target"], `global gap ${extreme}`);
        if (!Number.isInteger(point.index) || point.index < 0 || point.index >= readings.length) {
          fail("Invalid global gap route index");
        }
        const value = rational(point.value, `global ${extreme} value`);
        const reading = rational(point.reading, `global ${extreme} reading`, low, high);
        const target = rational(point.target, `global ${extreme} target`, targetLow, targetHigh);
        const fixed = readings.filter((_, i) => i !== point.index);
        if (compare(value, expected) !== 0 ||
            compare(value, gapAt(fixed, reading, target)) !== 0) {
          fail(`Incorrect global ${extreme} or unattained witness`);
        }
      }
    }
    if (stable) {
      fields(claim.stability, ["baseline", "nearestFailure"], "global stability");
      if (claim.stability.baseline !== baseline) fail("Incorrect global baseline");
      failures.sort((a, b) => compare(a.distance, b.distance) || a.index - b.index ||
        (a.side === b.side ? 0 : a.side === "left" ? -1 : 1));
      const nearest = failures[0];
      if (!nearest) {
        if (claim.stability.nearestFailure !== null) fail("False global failure");
      } else {
        const reported = claim.stability.nearestFailure;
        fields(reported, ["distance", "index", "side", "reading", "target"], "nearest failure");
        const distance = rational(reported.distance, "nearest failure distance", ZERO);
        const reading = rational(reported.reading, "nearest failure reading", low, high);
        const target = rational(reported.target, "nearest failure target", targetLow, targetHigh);
        if (compare(distance, nearest.distance) !== 0 || reported.index !== nearest.index ||
            reported.side !== nearest.side || compare(reading, nearest.reading) !== 0 ||
            outcome(readings.filter((_, i) => i !== nearest.index), reading, target) !== "Tie") {
          fail("Incorrect global nearest failure or witness");
        }
      }
    }
    return {routes: readings.length, reachable, guarantee,
      ...(quantified ? {gap: claim.gap} : stable ? {stability: claim.stability} : atlas ? {atlas: true} : {})};
  }
  return {parseReceipt, verify};
});
