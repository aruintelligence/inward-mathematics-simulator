/* Exact target-box constructor. The independent Python verifier checks exports. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.InwardTargetBox = api;
})(globalThis, function () {
  "use strict";
  const FORMAT = "inward-odd-target-box-v1";
  const EVEN_FORMAT = "inward-even-target-box-v2";
  const GAP_FORMAT = "inward-target-box-gap-v3";
  const STABILITY_FORMAT = "inward-target-box-stability-v4";
  const ATLAS_FORMAT = "inward-target-box-atlas-v5";
  const HORIZON_FORMAT = "inward-target-horizon-v6";
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
  function gapCertificate(rawReadings, rawLow, rawHigh, rawTargetLow, rawTargetHigh) {
    const record = certificate(rawReadings, rawLow, rawHigh, rawTargetLow, rawTargetHigh);
    const fromString = value => {
      const [n, d = "1"] = value.split("/");
      return q(BigInt(n), BigInt(d));
    };
    const readings = record.inputs.readings.map(fromString);
    const targets = [record.inputs.target.low, record.inputs.target.high].map(fromString);
    const square = value => mul(value, value);
    const gap = (fixed, x, t) => {
      const [mean, median] = estimators(fixed, x);
      return sub(square(sub(mean, t)), square(sub(median, t)));
    };
    const ordered = (a, b, extreme) => cmp(a.value, b.value) * (extreme === "min" ? 1 : -1) ||
      cmp(a.reading, b.reading) || cmp(a.target, b.target);
    for (const route of record.claim.routes) {
      const fixed = readings.filter((_, i) => i !== route.index);
      const knots = route.knots.map(fromString);
      const candidates = [];
      for (const target of targets) {
        for (let i = 0; i < knots.length - 1; i++) {
          const left = knots[i], right = knots[i + 1];
          const middle = div(add(left, right), TWO);
          const leftValue = gap(fixed, left, target);
          const middleValue = gap(fixed, middle, target);
          const rightValue = gap(fixed, right, target);
          for (const [reading, value] of [[left, leftValue], [right, rightValue]]) {
            candidates.push({value, reading, target});
          }
          // D(x,target) is quadratic on each median cell. Its only possible
          // interior extremum is its vertex. Recover its curvature exactly
          // from three rational evaluations rather than sampling a grid.
          const width = sub(right, left);
          const curvature = div(mul(TWO, add(sub(leftValue, mul(TWO, middleValue)), rightValue)),
            square(width));
          if (curvature.n === 0n) continue;
          const vertex = sub(middle, div(sub(rightValue, leftValue),
            mul(mul(TWO, curvature), width)));
          if (cmp(left, vertex) < 0 && cmp(vertex, right) < 0) {
            candidates.push({value: gap(fixed, vertex, target), reading: vertex, target});
          }
        }
      }
      const result = {};
      for (const extreme of ["min", "max"]) {
        const chosen = [...candidates].sort((a, b) => ordered(a, b, extreme))[0];
        result[extreme] = {value: string(chosen.value), reading: string(chosen.reading),
          target: string(chosen.target)};
      }
      route.gap = result;
    }
    const global = {};
    for (const extreme of ["min", "max"]) {
      const candidates = record.claim.routes.map(route => ({index: route.index,
        value: fromString(route.gap[extreme].value),
        reading: fromString(route.gap[extreme].reading),
        target: fromString(route.gap[extreme].target)}));
      const chosen = candidates.sort((a, b) => cmp(a.value, b.value) *
        (extreme === "min" ? 1 : -1) || a.index - b.index ||
        cmp(a.reading, b.reading) || cmp(a.target, b.target))[0];
      global[extreme] = {value: string(chosen.value), index: chosen.index,
        reading: string(chosen.reading), target: string(chosen.target)};
    }
    record.claim.gap = global;
    record.format = GAP_FORMAT;
    return record;
  }
  function stabilityCertificate(rawReadings, rawLow, rawHigh, rawTargetLow, rawTargetHigh) {
    const record = certificate(rawReadings, rawLow, rawHigh, rawTargetLow, rawTargetHigh);
    const fromString = value => {
      const [n, d = "1"] = value.split("/");
      return q(BigInt(n), BigInt(d));
    };
    const readings = record.inputs.readings.map(fromString);
    const low = fromString(record.inputs.movement.low);
    const high = fromString(record.inputs.movement.high);
    const targetLow = fromString(record.inputs.target.low);
    const targetHigh = fromString(record.inputs.target.high);
    const failures = [];
    let baseline = null;
    for (const route of record.claim.routes) {
      const start = readings[route.index];
      const fixed = readings.filter((_, index) => index !== route.index);
      const leftOutcome = winner(fixed, start, targetLow);
      const rightOutcome = winner(fixed, start, targetHigh);
      const current = leftOutcome === rightOutcome && leftOutcome !== "Tie" ? leftOutcome : null;
      if (route.index === 0) baseline = current;
      const tieTarget = moved => {
        const [mean, median] = estimators(fixed, moved);
        return cmp(mean, median) === 0 ? targetLow : div(add(mean, median), TWO);
      };
      const knots = route.knots.map(fromString);
      const sides = {};
      for (const [side, edge] of [["left", low], ["right", high]]) {
        const candidates = [start, ...knots.filter(x => side === "left" ?
          cmp(x, start) < 0 : cmp(x, start) > 0)].sort((a, b) =>
          side === "left" ? -cmp(a, b) : cmp(a, b));
        const failure = candidates.find(x => !current ||
          winner(fixed, x, targetLow) !== current || winner(fixed, x, targetHigh) !== current);
        if (failure) {
          const target = tieTarget(failure);
          sides[side] = {limit: string(failure), included: false,
            witness: {reading: string(failure), target: string(target)}};
          failures.push({distance: sub(side === "left" ? start : failure,
            side === "left" ? failure : start), index: route.index, side,
          reading: failure, target});
        } else sides[side] = {limit: string(edge), included: true, witness: null};
      }
      route.stability = {baseline: current, ...sides};
    }
    failures.sort((a, b) => cmp(a.distance, b.distance) || a.index - b.index ||
      (a.side === b.side ? 0 : a.side === "left" ? -1 : 1));
    const nearest = failures[0];
    record.claim.stability = {baseline, nearestFailure: nearest ? {
      distance: string(nearest.distance), index: nearest.index, side: nearest.side,
      reading: string(nearest.reading), target: string(nearest.target)} : null};
    record.format = STABILITY_FORMAT;
    return record;
  }
  function atlasCertificate(rawReadings, rawLow, rawHigh, rawTargetLow, rawTargetHigh) {
    const record = certificate(rawReadings, rawLow, rawHigh, rawTargetLow, rawTargetHigh);
    const fromString = value => {
      const [n, d = "1"] = value.split("/");
      return q(BigInt(n), BigInt(d));
    };
    const readings = record.inputs.readings.map(fromString);
    const targetLow = fromString(record.inputs.target.low);
    const targetHigh = fromString(record.inputs.target.high);
    for (const route of record.claim.routes) {
      const fixed = readings.filter((_, index) => index !== route.index);
      const knots = route.knots.map(fromString);
      const crossing = moved => {
        const [mean, median] = estimators(fixed, moved);
        return div(add(mean, median), TWO);
      };
      const stripes = [];
      for (let i = 0; i < knots.length - 1; i++) {
        const left = knots[i], right = knots[i + 1];
        const middle = div(add(left, right), TWO);
        const [mean, median] = estimators(fixed, middle);
        if (cmp(mean, median) === 0) throw new Error("Unexpected flat tie stripe");
        const below = cmp(mean, median) > 0 ? "Median" : "Mean";
        stripes.push({from: string(left), to: string(right),
          tieFrom: string(crossing(left)), tieTo: string(crossing(right)),
          below, above: below === "Mean" ? "Median" : "Mean",
          atTargetLow: winner(fixed, middle, targetLow),
          atTargetHigh: winner(fixed, middle, targetHigh)});
      }
      const verticalTies = knots.filter(moved => {
        const [mean, median] = estimators(fixed, moved);
        return cmp(mean, median) === 0;
      }).map(string);
      route.region = {stripes, verticalTies};
    }
    record.format = ATLAS_FORMAT;
    return record;
  }
  function horizonCertificate(rawReadings, rawLow, rawHigh, rawTargetLow, rawTargetHigh) {
    const record = certificate(rawReadings, rawLow, rawHigh, rawTargetLow, rawTargetHigh);
    const fromString = value => {
      const [n, d = "1"] = value.split("/");
      return q(BigInt(n), BigInt(d));
    };
    const readings = record.inputs.readings.map(fromString);
    const low = fromString(record.inputs.movement.low), high = fromString(record.inputs.movement.high);
    const targetLow = fromString(record.inputs.target.low);
    const targetHigh = fromString(record.inputs.target.high);
    const probe = div(add(targetLow, targetHigh), TWO);
    const crossing = (fixed, moved) => {
      const [mean, median] = estimators(fixed, moved);
      return div(add(mean, median), TWO);
    };
    let minimum = null, maximum = null, allTargetTie = null;
    for (const route of record.claim.routes) {
      const fixed = readings.filter((_, index) => index !== route.index);
      const start = crossing(fixed, low), end = crossing(fixed, high);
      if (minimum === null || cmp(start, minimum) < 0) minimum = start;
      if (maximum === null || cmp(end, maximum) > 0) maximum = end;
      const equality = route.knots.map(fromString).find(moved => {
        const [mean, median] = estimators(fixed, moved);
        return cmp(mean, median) === 0;
      });
      route.targetHorizon = {atMovementLow: string(start), atMovementHigh: string(end),
        allTargetTie: equality === undefined ? null : string(equality)};
      if (allTargetTie === null && equality !== undefined) {
        allTargetTie = {index: route.index, reading: string(equality)};
      }
    }
    let below = null, above = null;
    if (allTargetTie === null) {
      const fixed = readings.slice(1);
      const [mean, median] = estimators(fixed, readings[0]);
      below = cmp(mean, median) < 0 ? "Mean" : "Median";
      above = below === "Mean" ? "Median" : "Mean";
    }
    let verdict, witness = null;
    if (allTargetTie !== null) {
      verdict = "Tie";
      witness = allTargetTie;
    } else if (cmp(probe, minimum) < 0) verdict = below;
    else if (cmp(probe, maximum) > 0) verdict = above;
    else {
      verdict = "Tie";
      for (const route of record.claim.routes) {
        const fixed = readings.filter((_, index) => index !== route.index);
        const knots = route.knots.map(fromString);
        for (let i = 0; i < knots.length - 1; i++) {
          const left = knots[i], right = knots[i + 1];
          const first = crossing(fixed, left), last = crossing(fixed, right);
          if (cmp(first, probe) <= 0 && cmp(probe, last) <= 0) {
            const moved = add(left, div(mul(sub(probe, first), sub(right, left)),
              sub(last, first)));
            witness = {index: route.index, reading: string(moved)};
            break;
          }
        }
        if (witness) break;
      }
      if (!witness) throw new Error("No tie witness in target horizon");
    }
    record.claim.targetHorizon = {low: string(minimum), high: string(maximum),
      allTargetTie, below, above, probe: {target: string(probe), verdict, witness}};
    record.format = HORIZON_FORMAT;
    return record;
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
  return {certificate, gapCertificate, stabilityCertificate, atlasCertificate,
    horizonCertificate, position};
});
