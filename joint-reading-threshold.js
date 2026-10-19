/* Exact inverse query over an independently verified v4 target sweep. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.InwardJointThreshold = api;
})(globalThis, function () {
  "use strict";
  const abs = n => n < 0n ? -n : n;
  function q(n, d = 1n) {
    if (d === 0n) throw new Error("Zero denominator");
    if (d < 0n) [n, d] = [-n, -d];
    let x = abs(n), y = d;
    while (y) [x, y] = [y, x % y];
    return {n: n / x, d: d / x};
  }
  const add = (a, b) => q(a.n * b.d + b.n * a.d, a.d * b.d);
  const sub = (a, b) => q(a.n * b.d - b.n * a.d, a.d * b.d);
  const mul = (a, b) => q(a.n * b.n, a.d * b.d);
  const div = (a, b) => q(a.n * b.d, a.d * b.n);
  const cmp = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
  const show = a => a.d === 1n ? String(a.n) : `${a.n}/${a.d}`;
  function exact(raw) {
    if (typeof raw !== "string" || raw.length > 520 ||
        !/^(?:0|-?[1-9][0-9]{0,256})(?:\/[1-9][0-9]{0,256})?$/.test(raw)) {
      throw new Error("Expected an exact rational");
    }
    const [top, bottom = "1"] = raw.split("/");
    return q(BigInt(top), BigInt(bottom));
  }
  function threshold(raw) {
    if (typeof raw !== "string" || raw.length > 520) throw new Error("Invalid threshold");
    let value;
    if (/^(?:0|[1-9][0-9]{0,18})(?:\/[1-9][0-9]{0,18})?$/.test(raw)) {
      value = exact(raw);
    } else if (/^(?:0|[1-9][0-9]{0,12})\.[0-9]{1,6}$/.test(raw)) {
      const [whole, decimals] = raw.split(".");
      value = q(BigInt(whole + decimals), 10n ** BigInt(decimals.length));
    } else throw new Error("Use a positive integer, fraction, or decimal with up to six places.");
    if (value.n <= 0n) throw new Error("Required lead must be positive.");
    return value;
  }
  function regions(checked, inputs, rawThreshold) {
    if (!checked || checked.isSweep !== true || !Array.isArray(checked.strictPieces) ||
        !inputs || !Array.isArray(inputs.targetInterval) || inputs.targetInterval.length !== 2) {
      throw new Error("Independently verify a v4 sweep before the inverse query.");
    }
    const required = threshold(rawThreshold);
    const [domainLow, domainHigh] = inputs.targetInterval.map(exact);
    if (cmp(domainLow, domainHigh) >= 0) throw new Error("Invalid sweep domain");
    const spans = [];
    for (const piece of checked.strictPieces) {
      const low = exact(piece.from), high = exact(piece.to);
      const slope = exact(piece.slope), intercept = exact(piece.intercept);
      const gap = t => add(mul(slope, t), intercept);
      if (slope.n === 0n || cmp(low, high) >= 0) throw new Error("Invalid verified strict piece");
      let from, to;
      if (slope.n < 0n) {
        if (cmp(gap(low), required) < 0) continue;
        from = low;
        to = cmp(gap(high), required) >= 0 ? high : div(sub(required, intercept), slope);
      } else {
        if (cmp(gap(high), required) < 0) continue;
        from = cmp(gap(low), required) >= 0 ? low : div(sub(required, intercept), slope);
        to = high;
      }
      const previous = spans[spans.length - 1];
      if (previous && previous.verdict === piece.verdict && cmp(exact(previous.to), from) >= 0) {
        if (cmp(exact(previous.to), to) < 0) previous.to = show(to);
      } else spans.push({from: show(from), to: show(to), verdict: piece.verdict});
    }
    const at = (piece, target) =>
      add(mul(exact(piece.slope), target), exact(piece.intercept));
    const guaranteedRegions = spans.map(region => {
      let boundary = null;
      for (const endpoint of [region.from, region.to]) {
        const target = exact(endpoint);
        const piece = checked.strictPieces.find(item =>
          item.verdict === region.verdict && cmp(exact(item.from), target) <= 0 &&
          cmp(target, exact(item.to)) <= 0 && cmp(at(item, target), required) === 0);
        if (piece) {
          boundary = {target: endpoint, readings: piece.readings};
          break;
        }
      }
      return {...region, thresholdBoundary: boundary};
    });
    return {threshold: show(required), guaranteedRegions};
  }
  return {regions};
});
