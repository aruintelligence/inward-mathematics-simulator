# Portable research collection v1

The [Local Research Archive](../research-archive.html) can export all its checked Target Box certificates and conditional claims as one `inward-research-collection-v1` JSON file. The same page imports this file on another device. An [independent Python verifier](../tools/verify_research_collection.py) rechecks every embedded mathematical receipt without trusting the browser's archived status:

```sh
python3 tools/verify_research_collection.py inward-research-collection-v1.json
```

The file is a portable backup, **not** an assertion that an input was measured, a result was created at a particular time, or a claim was made by the person named in a label. Sharing the file also shares all embedded readings and labels. Keep sensitive work in an appropriate private location.

## Exact format and verification

```json
{
  "format": "inward-research-collection-v1",
  "records": [
    {
      "digest": "SHA-256 of the exact UTF-8 source bytes, lowercase hex",
      "kind": "target-box or conditional-claim",
      "label": "convenience label",
      "source": "complete original receipt JSON text"
    }
  ]
}
```

This is a schema illustration, not a valid receipt. The actual file contains 1–100 entries strictly sorted by digest, with no duplicate fingerprints. `source` is the original JSON **text**, not a reserialized object. JSON string escaping in the collection preserves the decoded text; the checker hashes its UTF-8 bytes and compares them with `digest`, checks `kind` against the embedded format, rejects duplicate JSON keys, and runs the format's independent verifier. It rejects malformed labels, extra fields, unsorted or repeated digests, altered proof data, false witnesses, and files over 10 MB. Conditional claims have a 1 MB per-receipt limit; Target Box certificates have a 2 MB per-receipt limit. The browser uses the existing strict format checkers; the Python script uses separate rational arithmetic and enumeration code.

Export rechecks every item currently in IndexedDB. If any item cannot be verified, the collection is **not** produced, so a backup never silently omits or blesses damaged data. A user can export a valid individual record or remove a damaged local item. Import verifies **all** entries before opening one read/write transaction; the transaction either adds all missing entries or adds none if the 100-record limit would be exceeded. Existing identical bytes keep their local labels and are counted as duplicates. Imported labels are convenience metadata. The file carries no timestamp, signature, encryption, user account, synchronization, or authentication.

Conditional claim receipts may be v1, theorem-bound v2, or universally
classified v3 in the same collection. V2 and v3 verify the embedded theorem
mapping for proof-bearing claims. V3 also independently checks its fixed-basis
counterexample for every other claim. Earlier bytes remain unchanged and
verifiable.

The collection format is versioned. Future receipt kinds or manifest fields require a new version and explicit verifier support. The independently checked statuses remain distinct: an elementary general algebraic implication, an exact counterexample to a universal claim, and an unrefuted finite search do not express the same level of evidence.
