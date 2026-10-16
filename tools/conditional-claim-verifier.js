/* Independent checker for conditional claims v1/v2/v3. Does not import the constructor. */
(function (root, factory) {
  const parser = typeof module === "object" && module.exports ?
    require("./target-lens-proof-core.js") : root.TargetLensVerifier;
  const api = factory(parser);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.InwardConditionalClaimVerifier = api;
})(globalThis, function (parser) {
  "use strict";
  const FORMAT = "inward-conditional-claim-v3";
  const PREVIOUS_FORMAT = "inward-conditional-claim-v2";
  const LEGACY_FORMAT = "inward-conditional-claim-v1";
  const FORMAL_COMMIT = "59a7e9dccd3cc328f855fc1fce1d6b6d55fdd705";
  const FORMAL_THEOREMS = {
    "target-at-or-below-midpoint": "InwardFormal.lower_no_worse_at_midpoint",
    "target-at-or-above-midpoint": "InwardFormal.higher_no_worse_at_midpoint",
    "target-at-or-below-both": "InwardFormal.lower_no_worse_below_both",
    "target-at-or-above-both": "InwardFormal.higher_no_worse_above_both",
  };
  const CONDITIONS = {
    "any-target": "at any target",
    "target-at-or-below-midpoint": "if the target is at or below the estimates' midpoint",
    "target-at-or-above-midpoint": "if the target is at or above the estimates' midpoint",
    "target-at-or-below-both": "if the target is at or below both estimates",
    "target-at-or-above-both": "if the target is at or above both estimates",
  };
  const PREDICTIONS = {
    "lower-no-worse": "the lower estimate is no farther than the higher estimate",
    "higher-no-worse": "the higher estimate is no farther than the lower estimate",
    "mean-no-worse": "the mean is no farther than the median",
    "median-no-worse": "the median is no farther than the mean",
  };
  const fail = message => { throw new Error(message); };
  const fields = (value, keys, label) => {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== keys.length ||
      keys.some(key => !Object.hasOwn(value, key))) fail(`Invalid ${label} fields`);
  };
  const same = (actual, expected) => {
    if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length &&
      actual.every((entry, i) => same(entry, expected[i]));
    if (expected && typeof expected === "object") return actual && typeof actual === "object" &&
      !Array.isArray(actual) && Object.keys(actual).length === Object.keys(expected).length &&
      Object.keys(expected).every(key => Object.hasOwn(actual, key) && same(actual[key], expected[key]));
    return actual === expected;
  };
  const abs = n => n < 0n ? -n : n;
  function fraction(n, d = 1n) {
    if (d === 0n) fail("Zero denominator");
    let x = abs(n), y = d;
    while (y) [x, y] = [y, x % y];
    return {n: n / x, d: d / x};
  }
  function rational(raw) {
    if (typeof raw !== "string" || !/^(?:0|[1-9][0-9]{0,8})(?:\/[1-9][0-9]{0,8})?$/.test(raw)) {
      fail("Invalid rational in grid");
    }
    const [n, d = "1"] = raw.split("/");
    const result = fraction(BigInt(n), BigInt(d));
    if (show(result) !== raw || compare(result, fraction(100n)) > 0) fail("Noncanonical or out-of-range rational");
    return result;
  }
  const show = q => q.d === 1n ? String(q.n) : `${q.n}/${q.d}`;
  const compare = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
  const sum = (a, b) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
  const divide = (a, n) => fraction(a.n, a.d * n);
  function grid(raw, max, label) {
    if (!Array.isArray(raw) || raw.length < 2 || raw.length > max) fail(`Invalid ${label} size`);
    const values = raw.map(rational);
    if (values.some((value, i) => i && compare(value, values[i - 1]) <= 0)) fail(`${label} must be sorted and distinct`);
    return values;
  }
  const poly = entries => new Map(entries.map(([power, coefficient]) => [power, BigInt(coefficient)]));
  function plus(terms) {
    const result = new Map();
    for (const [term, scalar] of terms) for (const [power, coefficient] of term) {
      result.set(power, (result.get(power) || 0n) + BigInt(scalar) * coefficient);
    }
    for (const [power, coefficient] of result) if (!coefficient) result.delete(power);
    return result;
  }
  function multiply(left, right) {
    const result = new Map();
    for (const [a, x] of left) for (const [b, y] of right) {
      const power = a.split(",").map((value, i) => Number(value) + Number(b.split(",")[i])).join(",");
      result.set(power, (result.get(power) || 0n) + x * y);
    }
    for (const [power, coefficient] of result) if (!coefficient) result.delete(power);
    return result;
  }
  function identityCoefficients() {
    const a = poly([["1,0,0", 1]]), b = poly([["0,1,0", 1]]), t = poly([["0,0,1", 1]]);
    const x = plus([[a, 1], [t, -1]]), y = plus([[b, 1], [t, -1]]);
    const expanded = plus([[multiply(x, x), 1], [multiply(y, y), -1]]);
    const product = multiply(plus([[a, 1], [b, -1]]), plus([[a, 1], [b, 1], [t, -2]]));
    if (expanded.size !== product.size || [...expanded].some(([key, value]) => product.get(key) !== value)) {
      fail("Squared-distance factorization failed");
    }
    const names = {"2,0,0": "a^2", "0,2,0": "b^2", "1,0,1": "a*t", "0,1,1": "b*t"};
    return Object.fromEntries([...expanded].map(([key, value]) => [names[key], Number(value)]));
  }
  function proofFor(condition, prediction) {
    const below = ["target-at-or-below-midpoint", "target-at-or-below-both"].includes(condition);
    const above = ["target-at-or-above-midpoint", "target-at-or-above-both"].includes(condition);
    if (!((below && prediction === "lower-no-worse") || (above && prediction === "higher-no-worse"))) return null;
    // With a<=b, endpoint bounds entail the corresponding midpoint bound.
    const targetBound = condition.endsWith("both") ? (below ? "t<=a" : "t>=b") :
      (below ? "t<=(a+b)/2" : "t>=(a+b)/2");
    return {method: "squared-error-factor-sign-v1",
      identity: {difference: "(a-t)^2-(b-t)^2", product: "(a-b)(a+b-2t)",
        expanded: identityCoefficients()},
      assumptions: ["a<=b", targetBound],
      factorSigns: ["nonpositive", below ? "nonnegative" : "nonpositive"],
      result: below ? "(a-t)^2<=(b-t)^2" : "(b-t)^2<=(a-t)^2"};
  }
  function eligible(condition, mean, median, target) {
    const order = compare(mean, median);
    const lo = order <= 0 ? mean : median, hi = order <= 0 ? median : mean;
    const midpoint = divide(sum(mean, median), 2n);
    if (condition === "any-target") return true;
    if (condition === "target-at-or-below-midpoint") return compare(target, midpoint) <= 0;
    if (condition === "target-at-or-above-midpoint") return compare(target, midpoint) >= 0;
    if (condition === "target-at-or-below-both") return compare(target, lo) <= 0;
    return compare(target, hi) >= 0;
  }
  function replay(values, targets, condition, prediction) {
    let checked = 0, witness = null, total = 0;
    const visit = (readings, start) => {
      if (readings.length < 5) {
        for (let i = start; i < values.length; i++) visit([...readings, values[i]], i);
        return;
      }
      total++;
      if (witness) return;
      const mean = divide(readings.reduce(sum, fraction(0n)), 5n), median = readings[2];
      const order = compare(mean, median);
      const lower = order <= 0 ? mean : median, higher = order <= 0 ? median : mean;
      for (const target of targets) {
        if (!eligible(condition, mean, median, target)) continue;
        checked++;
        const left = fraction(abs(mean.n * target.d - target.n * mean.d), mean.d * target.d);
        const right = fraction(abs(median.n * target.d - target.n * median.d), median.d * target.d);
        const outcome = compare(left, right) < 0 ? "mean" : compare(left, right) > 0 ? "median" : "tie";
        const requested = prediction === "lower-no-worse" ? (order <= 0 ? "mean" : "median") :
          prediction === "higher-no-worse" ? (order >= 0 ? "mean" : "median") :
            prediction === "mean-no-worse" ? "mean" : "median";
        if (outcome !== "tie" && outcome !== requested) {
          witness = {readings: readings.map(show), target: show(target), mean: show(mean),
            median: show(median), lower: show(lower), higher: show(higher), actualWinner: outcome};
          break;
        }
      }
    };
    visit([], 0);
    return {checked, witness, total};
  }
  function verify(report) {
    const current = report?.format === FORMAT;
    const previous = report?.format === PREVIOUS_FORMAT;
    if (!current && !previous && report?.format !== LEGACY_FORMAT) fail("Unsupported claim format");
    fields(report, current ? ["format", "claim", "domain", "search", "proof", "formal", "classification"] :
      previous ? ["format", "claim", "domain", "search", "proof", "formal"] :
      ["format", "claim", "domain", "search", "proof"], "claim record");
    fields(report.claim, ["condition", "prediction", "statement"], "claim");
    const {condition, prediction} = report.claim;
    if (typeof condition !== "string" || !Object.hasOwn(CONDITIONS, condition) ||
      typeof prediction !== "string" || !Object.hasOwn(PREDICTIONS, prediction)) fail("Unsupported claim choice");
    const statement = `For any five real readings, ${CONDITIONS[condition]}, ${PREDICTIONS[prediction]}.`;
    if (report.claim.statement !== statement) fail("Claim statement does not match choices");
    fields(report.domain, ["readingValues", "targetValues", "readingMultisets"], "domain");
    const values = grid(report.domain.readingValues, 6, "reading grid");
    const targets = grid(report.domain.targetValues, 12, "target grid");
    const {checked, witness, total} = replay(values, targets, condition, prediction);
    if (!Number.isSafeInteger(report.domain.readingMultisets) || report.domain.readingMultisets !== total) {
      fail("Incorrect reading multiset count");
    }
    fields(report.search, ["casesChecked", "status", "counterexample"], "search");
    const proof = proofFor(condition, prediction);
    const status = witness ? "counterexample-found" : proof ? "proved-by-algebra" : "unrefuted-on-finite-grid";
    if (!Number.isSafeInteger(report.search.casesChecked) || !same(report.search,
      {casesChecked: checked, status, counterexample: witness})) fail("Incorrect finite replay or witness");
    if (witness && proof) fail("Counterexample contradicts a general proof");
    if (proof) {
      const expanded = report.proof?.identity?.expanded;
      if (!expanded || Object.values(expanded).some(x => !Number.isSafeInteger(x))) {
        fail("Algebraic coefficients must be integers");
      }
    }
    if (!same(report.proof, proof)) fail("Algebraic proof does not follow from the condition");
    const formal = proof && (current || previous) ? {system: "Lean 4/Mathlib",
      declaration: FORMAL_THEOREMS[condition], sourceCommit: FORMAL_COMMIT} : null;
    if ((current || previous) && !same(report.formal, formal)) fail("Formal theorem reference does not match the proved claim");
    const basis = [fraction(0n), fraction(50n), fraction(100n)];
    const universalWitness = current && !proof ? replay(basis, basis, condition, prediction).witness : null;
    if (current && !proof && !universalWitness) fail("Claim language classification is incomplete");
    const classification = current ? {status: proof ? "proved-by-algebra" : "refuted-by-exact-witness",
      counterexample: universalWitness} : null;
    if (current && !same(report.classification, classification)) fail("Universal classification does not match exact witness");
    return {status, casesChecked: checked, readingMultisets: total, counterexample: witness,
      statement, proof: Boolean(proof), formal, classification};
  }
  function parseClaim(source) {
    const record = parser.parseReceipt(source);
    // This format has integer coefficients/counts and string rational values.
    // JSON.parse alone erases the distinction between 1 and 1.0.
    let quoted = false, escaped = false;
    for (let i = 0; i < source.length; i++) {
      const character = source[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
      } else if (character === '"') quoted = true;
      else if (character === "-" || /[0-9]/.test(character)) {
        const start = i;
        while (i < source.length && !/[\s,}\]:]/.test(source[i])) i++;
        const token = source.slice(start, i);
        if (!/^-?(?:0|[1-9][0-9]*)$/.test(token)) fail("Noninteger JSON number in claim record");
        i--;
      }
    }
    return record;
  }
  return {parseClaim, verify};
});
