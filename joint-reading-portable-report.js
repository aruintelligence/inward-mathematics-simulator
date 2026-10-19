/* Fill the portable report template with exact, independently checked source bytes. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.InwardJointPortableReport = api;
})(globalThis, function () {
  'use strict';
  const placeholders = {
    '@@SOURCE_BYTES@@': 'base64',
    '@@DIGEST@@': 'sha256',
    '@@VERIFIER_SOURCE@@': 'verifierSource',
    '@@THRESHOLD_SOURCE@@': 'thresholdSource',
    '@@THRESHOLD_DEFAULT@@': 'thresholdDefault'
  };
  function render(template, parts) {
    if (typeof template !== 'string' || template.length > 100000 ||
        !parts || typeof parts !== 'object') throw new Error('Invalid portable report template');
    const {base64, sha256, verifierSource, thresholdSource, thresholdDefault} = parts;
    if (typeof base64 !== 'string' || base64.length > 2700000 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64) ||
        !base64) throw new Error('Invalid source encoding');
    if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)) {
      throw new Error('Invalid source fingerprint');
    }
    if (typeof thresholdDefault !== 'string' || thresholdDefault.length > 520 ||
        !/^[1-9][0-9]*(?:\/[1-9][0-9]*)?$/.test(thresholdDefault)) {
      throw new Error('Invalid default threshold');
    }
    for (const source of [verifierSource, thresholdSource]) {
      if (typeof source !== 'string' || source.length > 200000 ||
          /<\/script/i.test(source)) throw new Error('Invalid embedded verifier script');
    }
    const values = {base64, sha256, verifierSource, thresholdSource, thresholdDefault};
    for (const [placeholder, name] of Object.entries(placeholders)) {
      const count = template.split(placeholder).length - 1;
      if (count < 1 || count > (name === 'sha256' ? 2 : 1)) {
        throw new Error('Portable report template is missing or duplicates ' + name);
      }
      template = template.replaceAll(placeholder, values[name]);
    }
    if (Object.keys(placeholders).some(key => template.includes(key))) {
      throw new Error('Incomplete portable report');
    }
    return template;
  }
  return {render};
});
