/* Local storage for checked mathematical records. Mathematical verification
   lives in the independent format-specific checkers, never in cached data. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.InwardResearchArchive = api;
})(globalThis, function () {
  "use strict";
  const DATABASE = "inward-mathematics-research-archive";
  const STORE = "target-box-certificates";
  const MAX_ENTRIES = 100;
  const COLLECTION_FORMAT = "inward-research-collection-v1";
  const COLLECTION_FORMAT_V2 = "inward-research-collection-v2";
  const MAX_COLLECTION_BYTES = 10_000_000;
  const FORMATS = {"inward-odd-target-box-v1": "target-box",
    "inward-even-target-box-v2": "target-box",
    "inward-target-box-gap-v3": "target-box",
    "inward-conditional-claim-v1": "conditional-claim",
    "inward-conditional-claim-v2": "conditional-claim",
    "inward-conditional-claim-v3": "conditional-claim",
    "inward-conditional-claim-v4": "conditional-claim",
    "inward-conditional-claim-v5": "conditional-claim",
    "inward-conditional-claim-v6": "conditional-claim",
    "inward-odd-sample-flip-v1": "sample-reversal",
    "inward-odd-sample-flip-v2": "sample-reversal",
    "inward-even-sample-flip-v3": "sample-reversal"};
  const fail = message => { throw new Error(message); };
  function labelText(raw, fallback) {
    if (typeof raw !== "string" || raw.length > 100) fail("Label must have at most 100 characters");
    const value = raw.trim() || fallback;
    return value.length > 100 ? `${value.slice(0, 99)}…` : value;
  }
  function shortSummary(record) {
    if (FORMATS[record.format] === "conditional-claim") return record.claim.statement;
    if (FORMATS[record.format] === "sample-reversal") {
      return `${record.inputs.readings.length} readings · reversal at target ${record.inputs.target}`;
    }
    const {readings, target} = record.inputs;
    return `${readings.length} readings · target ${target.low}–${target.high}`;
  }
  function verifierFor(source, checkers) {
    if (typeof source !== "string" || new TextEncoder().encode(source).length > 2_000_000) {
      fail("Record must be JSON text no larger than 2 MB");
    }
    // Dispatch after a strict syntax parse so duplicate keys cannot disguise
    // the format; the selected verifier then checks its entire schema.
    const preparse = checkers?.targetBox?.parseReceipt || checkers?.parseReceipt ||
      checkers?.strictJson || checkers?.conditionalClaim?.parseClaim ||
      checkers?.sampleReversal?.parseReceipt;
    if (typeof preparse !== "function") fail("Independent verifier unavailable");
    const format = preparse(source)?.format;
    const kind = typeof format === "string" && Object.hasOwn(FORMATS, format) ? FORMATS[format] : null;
    if (!kind) fail("Unsupported research record format");
    const checker = kind === "target-box" ? (checkers?.targetBox || checkers) :
      kind === "conditional-claim" ? checkers?.conditionalClaim : checkers?.sampleReversal;
    const parser = kind === "conditional-claim" ? checker?.parseClaim : checker?.parseReceipt;
    if (typeof parser !== "function" || typeof checker.verify !== "function") {
      fail("Independent verifier unavailable for this record format");
    }
    return {kind, checker, parser};
  }
  async function inspect(source, expectedDigest, checkers, cryptoApi = globalThis.crypto, expectedKind) {
    if (!cryptoApi?.subtle) fail("SHA-256 requires a secure browser context");
    if (expectedDigest !== null && expectedDigest !== undefined &&
        (typeof expectedDigest !== "string" || !/^[0-9a-f]{64}$/.test(expectedDigest))) {
      fail("Invalid stored fingerprint");
    }
    const {kind, checker, parser} = verifierFor(source, checkers);
    if (expectedKind !== undefined && expectedKind !== kind) fail("Stored record type does not match its bytes");
    const record = parser.call(checker, source);
    const result = checker.verify(record);
    const bytes = new TextEncoder().encode(source);
    const hash = await cryptoApi.subtle.digest("SHA-256", bytes);
    const digest = [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, "0")).join("");
    if (expectedDigest && expectedDigest !== digest) fail("Stored record fingerprint does not match its bytes");
    return {source, digest, kind, record, result};
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
  async function add(db, source, rawLabel, checkers, cryptoApi) {
    const checked = await inspect(source, null, checkers, cryptoApi);
    const label = labelText(rawLabel, shortSummary(checked.record));
    const entry = {digest: checked.digest, kind: checked.kind, source, label, savedAt: Date.now()};
    const created = await transaction(db, "readwrite", (store, done, abort) => {
      const existing = store.get(entry.digest);
      existing.onsuccess = () => {
        if (existing.result) { done(false); return; }
        const count = store.count();
        count.onsuccess = () => {
          if (count.result >= MAX_ENTRIES) {
            abort(new Error(`Archive limit of ${MAX_ENTRIES} records reached. Export and remove one first.`));
            return;
          }
          const insert = store.add(entry);
          insert.onsuccess = () => done(true);
        };
      };
    });
    return {created, digest: checked.digest, kind: checked.kind, result: checked.result};
  }
  function stored(db) {
    return transaction(db, "readonly", (store, done) => {
      const request = store.getAll();
      request.onsuccess = () => done(request.result);
    });
  }
  async function list(db, checkers, cryptoApi) {
    const rows = await stored(db);
    const checked = await Promise.all(rows.map(async entry => {
      try {
        if (typeof entry.label !== "string" || entry.label.length > 100 ||
            !Number.isSafeInteger(entry.savedAt) || entry.savedAt <= 0) {
          fail("Invalid local archive metadata");
        }
        // Version-1 entries predate the kind field and can only be Target Box.
        const kind = entry.kind === undefined ? "target-box" : entry.kind;
        if (!["target-box", "conditional-claim", "sample-reversal"].includes(kind)) {
          fail("Unknown stored record type");
        }
        const verified = await inspect(entry.source, entry.digest, checkers, cryptoApi, kind);
        return {...verified, label: entry.label, savedAt: entry.savedAt, valid: true};
      } catch (error) {
        return {digest: entry.digest, valid: false, error: error.message};
      }
    }));
    return checked.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  }
  async function exportCollection(db, checkers, cryptoApi) {
    const entries = await list(db, checkers, cryptoApi);
    if (!entries.length) fail("Archive has no records to export");
    if (entries.some(entry => !entry.valid)) {
      fail("Archive contains an unverified item. Remove it before exporting the collection");
    }
    const records = entries.map(({digest, kind, label, source}) => ({digest, kind, label, source}))
      .sort((a, b) => a.digest < b.digest ? -1 : a.digest > b.digest ? 1 : 0);
    // Metadata is intentionally limited to labels. The bundle asserts neither
    // a creation date nor ownership; every receipt remains byte-identical.
    const format = records.some(item => item.kind === "sample-reversal") ?
      COLLECTION_FORMAT_V2 : COLLECTION_FORMAT;
    const source = JSON.stringify({format, records}, null, 2) + "\n";
    if (new TextEncoder().encode(source).length > MAX_COLLECTION_BYTES) {
      fail("Collection exceeds 10 MB. Export individual records instead");
    }
    return {source, count: records.length, format};
  }
  async function parseCollection(source, checkers, cryptoApi = globalThis.crypto) {
    if (typeof source !== "string" || new TextEncoder().encode(source).length > MAX_COLLECTION_BYTES) {
      fail("Collection must be JSON text no larger than 10 MB");
    }
    if (typeof checkers?.strictJson !== "function") fail("Strict collection JSON parser unavailable");
    const bundle = checkers.strictJson(source);
    const exact = (value, keys) => value && typeof value === "object" &&
      !Array.isArray(value) && Object.keys(value).length === keys.length &&
      keys.every(key => Object.hasOwn(value, key));
    if (!exact(bundle, ["format", "records"]) ||
        ![COLLECTION_FORMAT, COLLECTION_FORMAT_V2].includes(bundle.format) ||
        !Array.isArray(bundle.records) || bundle.records.length < 1 ||
        bundle.records.length > MAX_ENTRIES) fail("Invalid research collection structure");
    const checked = [];
    let previous = "";
    for (const item of bundle.records) {
      if (!exact(item, ["digest", "kind", "label", "source"]) ||
          typeof item.digest !== "string" || !/^[0-9a-f]{64}$/.test(item.digest) ||
          item.digest <= previous || typeof item.label !== "string" ||
          !item.label.trim() || item.label.length > 100 ||
          !["target-box", "conditional-claim", ...(bundle.format === COLLECTION_FORMAT_V2 ?
            ["sample-reversal"] : [])].includes(item.kind)) {
        fail("Invalid or unsorted collection entry");
      }
      const verified = await inspect(item.source, item.digest, checkers, cryptoApi, item.kind);
      checked.push({...verified, label: item.label});
      previous = item.digest;
    }
    return checked;
  }
  async function importCollection(db, source, checkers, cryptoApi) {
    const checked = await parseCollection(source, checkers, cryptoApi);
    const created = await transaction(db, "readwrite", (store, done, abort) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const present = new Set(request.result.map(entry => entry.digest));
        const additions = checked.filter(entry => !present.has(entry.digest));
        if (request.result.length + additions.length > MAX_ENTRIES) {
          abort(new Error(`Archive limit of ${MAX_ENTRIES} records reached. Export and remove records first.`));
          return;
        }
        done(additions.length);
        for (const {digest, kind, source: bytes, label} of additions) {
          store.add({digest, kind, source: bytes, label, savedAt: Date.now()});
        }
      };
    });
    return {total: checked.length, created, duplicates: checked.length - created};
  }
  function remove(db, digest) {
    if (typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest)) fail("Invalid fingerprint");
    return transaction(db, "readwrite", (store, done) => {
      const request = store.delete(digest);
      request.onsuccess = () => done(true);
    });
  }
  return {inspect, open, add, list, remove, exportCollection, parseCollection,
    importCollection, labelText, shortSummary, MAX_ENTRIES, MAX_COLLECTION_BYTES};
});
