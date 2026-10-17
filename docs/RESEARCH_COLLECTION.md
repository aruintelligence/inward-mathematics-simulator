# Portable research collections v1 and v2

The [Local Research Archive](../research-archive.html) can export its checked Target Box certificates, conditional claims, and sample reversal certificates as one JSON file. Collections containing only the original two types retain `inward-research-collection-v1`; a collection containing a sample reversal uses `inward-research-collection-v2`. The same page imports either version on another device. An [independent Python verifier](../tools/verify_research_collection.py) rechecks every embedded mathematical receipt without trusting the browser's archived status:

```sh
python3 tools/verify_research_collection.py inward-research-collection-v2.json
```

The file is a portable backup, **not** an assertion that an input was measured, a result was created at a particular time, or a claim was made by the person named in a label. Sharing the file also shares all embedded readings and labels. Keep sensitive work in an appropriate private location.

## Exact format and verification

```json
{
  "format": "inward-research-collection-v1",
  "records": [
    {
      "digest": "SHA-256 of the exact UTF-8 source bytes, lowercase hex",
      "kind": "target-box, conditional-claim, or sample-reversal (v2 only)",
      "label": "convenience label",
      "source": "complete original receipt JSON text"
    }
  ]
}
```

This is a schema illustration, not a valid receipt. Replace the illustrated `format` with `inward-research-collection-v2` when a sample reversal is included; v1 rejects that kind. The actual file contains 1–100 entries strictly sorted by digest, with no duplicate fingerprints. `source` is the original JSON **text**, not a reserialized object. JSON string escaping in the collection preserves the decoded text; the checker hashes its UTF-8 bytes and compares them with `digest`, checks `kind` against the embedded format, rejects duplicate JSON keys, and runs the format's independent verifier. It rejects malformed labels, extra fields, unsorted or repeated digests, altered proof data, false witnesses, and files over 10 MB. Conditional claims have a 1 MB per-receipt limit; Target Box and sample reversal certificates have a 2 MB per-receipt limit. The browser uses the existing strict format checkers; the Python script uses separate rational arithmetic and enumeration code.

Export rechecks every item currently in IndexedDB. If any item cannot be verified, the collection is **not** produced, so a backup never silently omits or blesses damaged data. A user can export a valid individual record or remove a damaged local item. Import verifies **all** entries before opening one read/write transaction; the transaction either adds all missing entries or adds none if the 100-record limit would be exceeded. Existing identical bytes keep their local labels and are counted as duplicates. Imported labels are convenience metadata. The file carries no timestamp, signature, encryption, user account, synchronization, or authentication.

Target Box receipts can be odd v1, central-pair even v2, quantified gap v3, first-failure stability v4, or exact decision-region atlas v5 in either collection version. The exact rectangle verifiers check the complete median transition and factor-root partition and every listed witness. V3 additionally checks the attained minimum and maximum signed squared-error gap on each route and globally. V4 checks the nearest left and right strict-verdict failure from each original reading, an exact tie witness at each excluded boundary, and the global least movement. V5 checks linear tie-target endpoints, both strict winners, target-endpoint verdicts, and all-target tie columns on every open reading strip. Older v1–v4 receipt bytes remain unchanged.

Conditional claim receipts may be v1, theorem-bound v2, universally
classified v3, odd-sample v4, central-order-statistics v5, or constructed
endpoint v6 in the same collection. V2–v6 verify the embedded theorem mapping
for proof-bearing claims. V3–v5 independently check fixed-basis
counterexamples for all other claims; v6 checks a deterministic endpoint
construction. V4 binds an odd count (3, 5, or 7); v5 and v6 bind a count from
3 through 7 and the central-pair average rule for even medians. Earlier bytes
remain unchanged and verifiable.

Sample reversal receipts may be odd v1, signed bounded odd v2, or central-pair even v3. Their checker recomputes each exact factor-root partition, interval winner, tie threshold, strict witness, and global best route. A tied starting outcome has no strict reversal route. The stored record is a conditional result under its chosen readings, target, and movement bounds.

The collection format is versioned. Existing v1 bundles remain readable and v1 exports stay byte-for-byte stable for the original kinds. Future receipt kinds or manifest fields require a new version and explicit verifier support. The independently checked statuses remain distinct: an elementary general algebraic implication, an exact counterexample to a universal claim, an unrefuted finite search, and a conditional reversal analysis do not express the same level of evidence.
