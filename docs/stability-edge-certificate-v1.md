# Portable stability edge certificate v1

This format records the first **real** drift radius at which a tie becomes possible, both factor routes when reachable, and exact rational witnesses. It applies only to the stipulated five-reading Target Lens model with independent clipped reading drift and a closed target interval. The original input values and the selected target are assumptions, not authenticated measurements.

## Create and check

From the repository root (Node 22+ and Python 3.12+):

```sh
node tools/create-stability-certificate.cjs examples/stability-case-a.json > edge.json
python3 tools/verify_stability_certificate.py edge.json
node tools/create-stability-certificate.cjs examples/stability-case-a.json --mask 5 > edge-mask-5.json
python3 tools/verify_stability_certificate.py edge-mask-5.json
```

The [checked-in example](../examples/stability-edge-certificate-a.json) works offline. A Target Lens v1 proof receipt from the [browser lab](../target-lens.html) can replace the example. Mask bits `1, 2, 4, 8, 16` choose which of the five readings may move; the default `31` moves all five. The source receipt's selected drift and selected target give context; the edge uses its original readings and target interval.

In the [Target Lens browser](../target-lens.html), choose your readings and target range, then use **Download verifiable JSON** in the exact stability threshold panel. The download is generated locally and uses mask `31`. It includes the currently selected drift and target in the embedded receipt for context. A zero-drift tie still produces a `no-baseline` certificate. Use the CLI `--mask` option for a chosen subset of movable readings.

The generator uses the JavaScript threshold and witness constructor. The Python checker first validates the embedded Target Lens receipt with its independent v1 checker, then recomputes both threshold routes using rational arithmetic and a separate 30-ordering-cell scan. It checks the claimed first radius and the first selectable six-decimal setting, and evaluates *each supplied witness* as exact rational readings and target inside the appropriate drift box. It checks equality of mean and median errors and the zero of the named factor. It does not require identical witness coordinates to the audit's own construction.

The verifier rejects duplicate JSON keys, noncanonical radius fractions, malformed fields and integers, oversized files, changed receipts, false radii, or invalid witnesses. It prints a SHA-256 of the exact certificate file bytes for local comparison. That digest identifies bytes; it does not sign the result or authenticate the input source. Neither script requires network access.

## Fields and interpretation

| Field | Meaning |
| --- | --- |
| `format` | Literal `inward-stability-edge-certificate-v1`. |
| `sourceReceipt` | Complete, independently checked `inward-target-lens-proof-v1` object. |
| `mask` | Integer bitmask from 0 through 31. |
| `claim.kind` | `no-baseline`, `unreachable`, or `edge`. |
| `claim.winner` | Strict zero-drift winner when there is one. |
| `claim.firstRoute` | `estimate` or `reference`, the earliest factor to attain zero. A simultaneous tie chooses `reference`. |
| `claim.radius` | Reduced nonnegative fraction in ordinary 0–100 reading units, encoded as decimal integer strings `numerator` and `denominator`. |
| `claim.firstTieUnits` | Smallest six-decimal drift setting at or above the first exact radius, as an integer in millionth units. |
| `claim.routes` | Each reachable factor has its own reduced radius and rational tie witness; an unreachable factor is `null`. |
| `witness` | Five `readingsNumerators`, one `targetNumerator`, and a shared positive `denominator`; dividing gives ordinary 0–100 units. |

`no-baseline` means the source readings already allow a tie at zero drift within the target interval. `unreachable` means that even drift 100 cannot make the selected readings yield a tie. For `edge`, every smaller real radius retains the strict baseline winner for every permitted reading configuration and target, while the witness proves a tie is possible at the reported radius and every larger drift radius. The two factor routes can differ; a later route remains mathematically meaningful after the first guarantee ends.

For the example with readings `[48,49,50,51,85]` and target interval `[0,1]`, the first route is `estimate` at `16/3`; the `reference` route first occurs at `75`. The first six-decimal selectable tie setting is `5.333334`. These statements are exact consequences of the stated uncertainty model. See the [exhaustiveness argument](stability-edge-audit.md) for the finite landmark scan. The two implementations and tests reduce implementation risk, but this is not a formal proof-assistant certificate or evidence that the example models real observations.
