# INWARD mathematical evidence and release gates

This checklist distinguishes **mathematical correctness**, **software reliability**, and **empirical validity**. Passing one does not establish the others.

## Release gates

1. **Exact arithmetic:** Verify all receipt calculations with integer/rational arithmetic, including ties and clipping boundaries. Reject nonfinite input and malformed receipts.
2. **Independent implementation:** Compare the browser/Node verifier with the Python verifier on the same versioned fixtures; both must reject modified witnesses.
3. **Property testing:** Generate seeded random five-reading boxes and target intervals; check monotonicity, nested reachable sets, witness feasibility, and invariance under permutations.
4. **Boundary testing:** Include coincident mean/median, singleton target intervals, epsilon zero and 100, all readings zero or 100, and equality at a clipping breakpoint.
5. **Reproducibility:** Pin toolchain versions, publish deterministic commands, fixture hashes, and CI logs for each release.
6. **Security:** Treat imported JSON as untrusted; bound file size, array lengths, and numeric precision. Never execute receipt content. Keep local-only analysis local.
7. **Claims:** Label every result as theorem under stated assumptions, numerical demonstration, conjecture, or externally validated observation. No claim about consciousness, healing, or physical reality follows from toy-model calculations.
8. **Product quality:** Provide keyboard navigation, readable mobile contrast, accessible graph alternatives, and offline export.
9. **Commercial readiness:** Confirm licenses and ownership of all assets; document API boundaries, privacy, pricing assumptions, and support obligations before selling.

## Next engineering milestone

Implement a deterministic cross-language differential-test runner that generates seeded valid and adversarial receipts, invokes both existing verifiers, and reports disagreements with a minimal reproduction fixture. Run it in CI on every pull request. Keep existing public demonstrations unchanged until the test gate passes.

## Evidence ledger template

| Claim | Assumptions | Proof or test | Independent check | Status |
| --- | --- | --- | --- | --- |
| Target crossover is midpoint of distinct estimates | Absolute-error comparison; fixed estimates | Algebraic identity | Independent symbolic derivation | Established under assumptions |
| Joint-uncertainty receipt verifies claimed verdict | Five clipped independent intervals; stated target bounds | Exact verifier | Independent Python checker | Test per receipt |
| Model predicts real-world outcomes | Requires empirical observations and prospective protocol | Not supplied | Not supplied | Unvalidated |

**Policy:** Never describe an unvalidated hypothesis as a scientific breakthrough or a commercial performance guarantee.
