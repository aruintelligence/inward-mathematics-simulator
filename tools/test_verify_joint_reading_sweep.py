"""Adversarial checks for the independent Python v4 envelope audit."""
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import random
import subprocess
import sys
import unittest

from joint_reading_box import sweep_certificate
from verify_joint_reading_sweep import audit

ROOT = Path(__file__).resolve().parent.parent
EXAMPLE = (ROOT / "examples/joint-reading-box-sweep-v4.json").read_bytes()


def encoded(receipt):
    return (json.dumps(receipt, ensure_ascii=False) + "\n").encode("utf-8")


class IndependentSweepAudit(unittest.TestCase):
    def test_example_and_original_byte_fingerprint(self):
        result = audit(EXAMPLE)
        self.assertEqual(result["candidates"], 32)
        self.assertEqual(result["strictPieces"], 4)
        self.assertEqual(result["tieTargetInterval"], ["533/10", "543/10"])
        self.assertEqual(result["sourceReceiptSha256"], sha256(EXAMPLE).hexdigest())
        equivalent_json = encoded(json.loads(EXAMPLE))
        self.assertNotEqual(audit(equivalent_json)["sourceReceiptSha256"], result["sourceReceiptSha256"])
        command = subprocess.run([sys.executable, "tools/verify_joint_reading_sweep.py",
                                  "examples/joint-reading-box-sweep-v4.json"],
                                 cwd=ROOT, capture_output=True, text=True, check=True)
        self.assertIn(result["sourceReceiptSha256"], command.stdout)

    def test_tie_topologies_even_sample_and_seeded_boxes(self):
        cases = [
            ([["0", "1"], ["0", "1"], ["0", "1"]], "-10", "10"),
            ([["0", "0"], ["1", "1"], ["10", "10"]], "-10", "-5"),
            ([["0", "0"], ["1", "1"], ["10", "10"]], "0", "5"),
            ([["-3/2", "-1"], ["0", "1/2"], ["2", "5/2"], ["3", "4"]], "-4", "5"),
        ]
        randomizer = random.Random(0x1A7D17)
        for k in range(24):
            n = 3 + k % 3
            intervals = []
            for _ in range(n):
                low = randomizer.randrange(-6, 5)
                intervals.append([str(low), str(low + randomizer.randrange(0, 4))])
            cases.append((intervals, "-9", "10"))
        for intervals, start, stop in cases:
            with self.subTest(intervals=intervals, start=start, stop=stop):
                receipt = sweep_certificate(intervals, start, stop)
                checked = audit(encoded(receipt))
                self.assertEqual(checked["strictPieces"], len(receipt["claim"]["strictPieces"]))
        all_tie = sweep_certificate(cases[0][0], "-10", "10")
        self.assertEqual(all_tie["claim"]["strictPieces"], [])
        self.assertEqual(all_tie["claim"]["tieTargetInterval"], ["-10", "10"])
        singleton = sweep_certificate(cases[2][0], "0", "5")
        self.assertEqual(singleton["claim"]["tieTargetInterval"], ["7/3", "7/3"])

    def test_rejects_forged_envelope_coverage_and_witnesses(self):
        original = json.loads(EXAMPLE)
        changes = [
            (lambda x: x["claim"]["estimateRange"]["min"].__setitem__("value", "1"), "extremum"),
            (lambda x: x["claim"]["midpointRange"].__setitem__("max", "54"), "midpoint"),
            (lambda x: x["claim"].__setitem__("tieTargetInterval", ["53", "54"]), "tie target"),
            (lambda x: x["claim"]["tieWitness"].__setitem__("target", "0"), "Tie witness"),
            (lambda x: x["claim"]["strictPieces"].pop(0), "Incomplete"),
            (lambda x: x["claim"]["strictPieces"][0].__setitem__("to", "49"), "exact lower envelope"),
            (lambda x: x["claim"]["strictPieces"][0].__setitem__("slope", "-1"), "witness"),
            (lambda x: x["claim"]["strictPieces"][0]["readings"].__setitem__(0, "49"), "witness"),
            (lambda x: x["claim"]["strictPieces"][0].__setitem__("verdict", "Mean"), "Incomplete"),
            (lambda x: x["claim"]["strictPieces"][0].__setitem__("extra", 1), "fields"),
        ]
        for change, reason in changes:
            receipt = deepcopy(original)
            change(receipt)
            with self.subTest(reason=reason, receipt=receipt["claim"].get("strictPieces", [])[:1]):
                with self.assertRaisesRegex(ValueError, reason):
                    audit(encoded(receipt))

        # A feasible but nonminimal reading vector has a true line; the
        # endpoint inequality must still reject it as a false lower envelope.
        forged = deepcopy(original)
        forged["claim"]["strictPieces"][0].update({
            "readings": ["48", "49", "50", "51", "85"],
            "slope": "-66/5", "intercept": "17589/25"})
        with self.assertRaisesRegex(ValueError, "exact lower envelope"):
            audit(encoded(forged))

        # An artificial split with an unchanged line is not a breakpoint.
        split = deepcopy(original)
        first = split["claim"]["strictPieces"][0]
        second = deepcopy(first)
        first["to"], second["from"] = "1", "1"
        split["claim"]["strictPieces"].insert(1, second)
        with self.assertRaisesRegex(ValueError, "Redundant strict piece"):
            audit(encoded(split))

    def test_rejects_duplicate_keys_noncanonical_input_and_malformed_bytes(self):
        bad = EXAMPLE.replace(b'"format":', b'"format":"inward-joint-reading-box-v4","\\u0066ormat":', 1)
        with self.assertRaisesRegex(ValueError, "Duplicate JSON key"):
            audit(bad)
        receipt = json.loads(EXAMPLE)
        receipt["inputs"]["intervals"][0][0] = "48/1"
        with self.assertRaisesRegex(ValueError, "Noncanonical"):
            audit(encoded(receipt))
        for data in (b"\xff", b"{}", b' {"format": NaN}', EXAMPLE + b" " * 2_000_000):
            with self.subTest(data=data[:30]), self.assertRaises(ValueError):
                audit(data)


if __name__ == "__main__":
    unittest.main()
