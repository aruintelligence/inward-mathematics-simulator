/* Construct exact readings attaining a tie at any target in a verified v4 tie band. */
(function (root, factory) {
  const verifier = typeof module === 'object' && module.exports ?
    require('./joint-reading-box-verifier.js') : root.InwardJointBoxVerifier;
  const api = factory(verifier);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.InwardJointTieWitness = api;
})(globalThis, function (verifier) {
  'use strict';
  const abs = x => x < 0n ? -x : x;
  function q(n, d = 1n) {
    if (!d) throw new Error('Zero denominator');
    if (d < 0n) [n, d] = [-n, -d];
    let a = abs(n), b = d;
    while (b) [a, b] = [b, a % b];
    return {n: n / a, d: d / a};
  }
  const ZERO = q(0n), ONE = q(1n);
  const add = (a, b) => q(a.n * b.d + b.n * a.d, a.d * b.d);
  const sub = (a, b) => q(a.n * b.d - b.n * a.d, a.d * b.d);
  const mul = (a, b) => q(a.n * b.n, a.d * b.d);
  const div = (a, b) => q(a.n * b.d, a.d * b.n);
  const cmp = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
  const show = a => a.d === 1n ? String(a.n) : `${a.n}/${a.d}`;
  function fraction(raw) {
    if (typeof raw !== 'string' || raw.length > 520) throw new Error('Invalid exact target');
    if (/^(?:0|-?[1-9][0-9]{0,256})(?:\/[1-9][0-9]{0,256})?$/.test(raw)) {
      const [top, bottom = '1'] = raw.split('/');
      return q(BigInt(top), BigInt(bottom));
    }
    if (/^-?(?:0|[1-9][0-9]{0,8})\.[0-9]{1,6}$/.test(raw)) {
      const [whole, digits] = raw.split('.');
      return q(BigInt(whole + digits), 10n ** BigInt(digits.length));
    }
    throw new Error('Use an exact integer or fraction, or a decimal with up to six places.');
  }
  function estimators(readings) {
    const ordered = [...readings].sort(cmp), n = readings.length;
    const mean = div(readings.reduce(add, ZERO), q(BigInt(n)));
    const median = div(add(ordered[(n - 1) >> 1], ordered[n >> 1]), q(2n));
    return {mean, median, midpoint: div(add(mean, median), q(2n))};
  }
  function witnessAt(receipt, rawTarget) {
    if (!verifier || typeof verifier.verify !== 'function') throw new Error('Independent verifier unavailable');
    const checked = verifier.verify(receipt);
    if (!checked.isSweep || !checked.tieTargetInterval) throw new Error('This v4 sweep has no tie target');
    const target = fraction(rawTarget);
    const [tieLow, tieHigh] = checked.tieTargetInterval.map(fraction);
    if (cmp(target, tieLow) < 0 || cmp(target, tieHigh) > 0) {
      throw new Error(`Target must be inside the tie interval [${show(tieLow)}, ${show(tieHigh)}].`);
    }
    const intervals = receipt.inputs.intervals.map(pair => pair.map(fraction));
    const example = checked.tieWitness.readings.map(fraction);
    let readings;
    const exampleEstimates = estimators(example);
    if (cmp(exampleEstimates.mean, exampleEstimates.median) === 0) {
      // One equal-estimator reading vector ties for every possible target.
      readings = example;
    } else {
      const low = intervals.map(pair => pair[0]), high = intervals.map(pair => pair[1]);
      const delta = low.map((value, i) => sub(high[i], value));
      const at = position => low.map((value, i) => add(value, mul(position, delta[i])));
      // The median can change formula only when two moving readings cross.
      const stops = [ZERO, ONE];
      for (let i = 0; i < low.length; i++) for (let j = 0; j < i; j++) {
        const speed = sub(delta[i], delta[j]);
        if (speed.n === 0n) continue;
        const cross = div(sub(low[j], low[i]), speed);
        if (cmp(cross, ZERO) > 0 && cmp(cross, ONE) < 0) stops.push(cross);
      }
      stops.sort(cmp);
      const distinct = stops.filter((value, i) => i === 0 || cmp(value, stops[i - 1]) !== 0);
      for (let i = 1; i < distinct.length; i++) {
        const from = distinct[i - 1], to = distinct[i];
        const hFrom = estimators(at(from)).midpoint, hTo = estimators(at(to)).midpoint;
        if (cmp(hFrom, target) > 0 || cmp(hTo, target) < 0) continue;
        const position = cmp(hFrom, hTo) === 0 ? from :
          add(from, mul(sub(to, from), div(sub(target, hFrom), sub(hTo, hFrom))));
        readings = at(position);
        break;
      }
      if (!readings) throw new Error('No exact interpolation reaches the target');
    }
    if (readings.some((value, i) => cmp(value, intervals[i][0]) < 0 ||
        cmp(value, intervals[i][1]) > 0)) throw new Error('Constructed reading outside its interval');
    const {mean, median, midpoint} = estimators(readings);
    if (cmp(mul(sub(mean, median), sub(midpoint, target)), ZERO) !== 0) {
      throw new Error('Constructed readings do not attain a tie');
    }
    // Replay the new witness through the independent receipt verifier as well.
    const replay = {...receipt, claim: {...receipt.claim,
      tieWitness: {target: show(target), readings: readings.map(show)}}};
    verifier.verify(replay);
    return {target: show(target), readings: readings.map(show),
      mean: show(mean), median: show(median), receipt: replay};
  }
  return {witnessAt};
});
