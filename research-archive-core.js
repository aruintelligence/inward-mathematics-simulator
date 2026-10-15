/* Local storage for checked Target Box records. Mathematical verification lives
   in the independent odd-target-box-verifier.js, never in cached archive data. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.InwardResearchArchive = api;
})(globalThis, function () {
  "use strict";
  const DATABASE = "inward-mathematics-research-archive";
  const STORE = "target-box-certificates";
  const MAX_ENTRIES = 100;
  const fail = message => { throw new Error(message); };
  function labelText(raw, fallback) {
    if (typeof raw !== "string" || raw.length > 100) fail("Label must have at most 100 characters");
    const value = raw.trim() || fallback;
    return value.length > 100 ? `${value.slice(0, 99)}…` : value;
  }
  function shortSummary(record) {
    const {readings, target} = record.inputs;
    return `${readings.length} readings · target ${target.low}–${target.high}`;
  }
  async function inspect(source, expectedDigest, checker, cryptoApi = globalThis.crypto) {
    if (!checker || typeof checker.parseReceipt !== "function" ||
        typeof checker.verify !== "function") fail("Independent verifier unavailable");
    if (!cryptoApi?.subtle) fail("SHA-256 requires a secure browser context");
    if (expectedDigest !== null && expectedDigest !== undefined &&
        (typeof expectedDigest !== "string" || !/^[0-9a-f]{64}$/.test(expectedDigest))) {
      fail("Invalid stored fingerprint");
    }
    const record = checker.parseReceipt(source);
    const result = checker.verify(record);
    const bytes = new TextEncoder().encode(source);
    const hash = await cryptoApi.subtle.digest("SHA-256", bytes);
    const digest = [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, "0")).join("");
    if (expectedDigest && expectedDigest !== digest) fail("Stored certificate fingerprint does not match its bytes");
    return {source, digest, record, result};
  }
  function open(factory = globalThis.indexedDB) {
    if (!factory) return Promise.reject(new Error("Local archive storage is unavailable in this browser"));
    return new Promise((resolve, reject) => {
      const request = factory.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE, {keyPath: "digest"});
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Unable to open local archive"));
      request.onblocked = () => reject(new Error("Close another tab using the archive and try again"));
    });
  }
  function transaction(db, mode, action) {
    return new Promise((resolve, reject) => {
      let value, failure;
      const tx = db.transaction(STORE, mode);
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error || new Error("Local archive transaction failed"));
      tx.onabort = () => reject(failure || tx.error || new Error("Local archive transaction aborted"));
      action(tx.objectStore(STORE), result => { value = result; }, error => {
        failure = error; tx.abort();
      });
    });
  }
  async function add(db, source, rawLabel, checker, cryptoApi) {
    const checked = await inspect(source, null, checker, cryptoApi);
    const label = labelText(rawLabel, shortSummary(checked.record));
    const entry = {digest: checked.digest, source, label, savedAt: Date.now()};
    const created = await transaction(db, "readwrite", (store, done, abort) => {
      const existing = store.get(entry.digest);
      existing.onsuccess = () => {
        if (existing.result) { done(false); return; }
        const count = store.count();
        count.onsuccess = () => {
          if (count.result >= MAX_ENTRIES) {
            abort(new Error(`Archive limit of ${MAX_ENTRIES} certificates reached. Export and remove one first.`));
            return;
          }
          const insert = store.add(entry);
          insert.onsuccess = () => done(true);
        };
      };
    });
    return {created, digest: checked.digest, result: checked.result};
  }
  function stored(db) {
    return transaction(db, "readonly", (store, done) => {
      const request = store.getAll();
      request.onsuccess = () => done(request.result);
    });
  }
  async function list(db, checker, cryptoApi) {
    const rows = await stored(db);
    const checked = await Promise.all(rows.map(async entry => {
      try {
        if (typeof entry.label !== "string" || entry.label.length > 100 ||
            !Number.isSafeInteger(entry.savedAt) || entry.savedAt <= 0) {
          fail("Invalid local archive metadata");
        }
        const verified = await inspect(entry.source, entry.digest, checker, cryptoApi);
        return {...verified, label: entry.label, savedAt: entry.savedAt, valid: true};
      } catch (error) {
        return {digest: entry.digest, valid: false, error: error.message};
      }
    }));
    return checked.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  }
  function remove(db, digest) {
    if (typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest)) fail("Invalid fingerprint");
    return transaction(db, "readwrite", (store, done) => {
      const request = store.delete(digest);
      request.onsuccess = () => done(true);
    });
  }
  return {inspect, open, add, list, remove, labelText, shortSummary, MAX_ENTRIES};
});
