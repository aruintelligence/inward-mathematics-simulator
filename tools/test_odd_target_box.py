"""Exact exhaustion, adversarial certificates, and boundary cases."""
import copy
from fractions import Fraction
import json
from pathlib import Path
import random
import unittest

from odd_target_box import certificate, winner
from verify_odd_target_box import verify


class TargetBoxTests(unittest.TestCase):
    def test_example_and_sliced_target(self):
        case = certificate(["48", "49", "50", "51", "85"], "0", "100", "48", "52")
        self.assertEqual(case, json.loads(Path("examples/odd-target-box-v1.json").read_text()))
        self.assertEqual(case["claim"]["reachable"], ["Mean", "Median", "Tie"])
        self.assertIsNone(case["claim"]["guarantee"])
        self.assertEqual(verify(case)["routes"], 5)
        fixed = certificate(["24", "13", "45", "41", "38"], "13", "45", "49", "51")
        self.assertEqual([r["guarantee"] for r in fixed["claim"]["routes"][:2]], ["Median", "Median"])
        self.assertEqual(verify(fixed)["reachable"], ["Mean", "Median", "Tie"])

    def test_grid_and_random_rational_cases(self):
        rng = random.Random(20261015)
        for case_index in range(42):
            count = 3 + case_index % 19
            readings = [Fraction(rng.randrange(-7, 8), rng.choice((1, 2, 3, 7)))
                        for _ in range(count)]
            low, high = min(readings) - 1, max(readings) + 1
            a, b = sorted((Fraction(rng.randrange(-10, 11), 2),
                           Fraction(rng.randrange(-10, 11), 3)))
            cert = certificate(list(map(str, readings)), str(low), str(high), str(a), str(b))
            verify(cert)
            # This grid is a separate soundness check; only exact factor roots
            # establish that the certificate covers *every real* position.
            for route in cert["claim"]["routes"]:
                fixed = readings[:route["index"]] + readings[route["index"] + 1:]
                observed = {winner(fixed, low + (high - low) * j / 13,
                                   a + (b - a) * k / 13)
                            for j in range(14) for k in range(14)}
                self.assertTrue(observed <= set(route["reachable"]))

    def test_forged_claims_are_rejected(self):
        base = certificate(["48", "49", "50", "51", "85"], "0", "100", "48", "52")
        edits = [lambda c: c["claim"]["routes"][0]["knots"].pop(),
                 lambda c: c["claim"]["routes"][0]["reachable"].remove("Tie"),
                 lambda c: c["claim"]["routes"][0]["witnesses"]["Mean"].update(target="100"),
                 lambda c: c["claim"]["routes"][0].update(guarantee="Mean"),
                 lambda c: c["claim"].update(reachable=["Median"]),
                 lambda c: c["inputs"]["target"].update(low="53")]
        for edit in edits:
            forged = copy.deepcopy(base)
            edit(forged)
            with self.subTest(edit=edit), self.assertRaises(ValueError):
                verify(forged)

    def test_even_central_pair_and_format_binding(self):
        cert = certificate(["40", "45", "50", "80"], "0", "100", "48", "52")
        self.assertEqual(cert["format"], "inward-even-target-box-v2")
        self.assertEqual(cert, json.loads(Path("examples/even-target-box-v2.json").read_text()))
        self.assertEqual(verify(cert)["routes"], 4)
        for edit in (lambda c: c["claim"]["routes"][1]["knots"].pop(2),
                     lambda c: c.update(format="inward-odd-target-box-v1")):
            forged = copy.deepcopy(cert)
            edit(forged)
            with self.assertRaises(ValueError):
                verify(forged)

    def test_rejected_inputs_and_noncanonical_values(self):
        with self.assertRaises(ValueError):
            certificate(["0", "1"], "0", "2", "0", "1")
        with self.assertRaises(ValueError):
            certificate(["0", "1", "2"], "0", "2", "1", "0")
        with self.assertRaises(ValueError):
            certificate(["0", "1", "2"], "0", "0", "1", "1")
        with self.assertRaises(ValueError):
            certificate(["0", "1", "2"], "0", "2", "1000001", "1000001")
        case = certificate(["0", "1", "2"], "0", "2", "1", "1")
        case["claim"]["routes"][0]["knots"][0] = "0/1"
        with self.assertRaises(ValueError):
            verify(case)

    def test_file_parser_rejects_duplicate_keys(self):
        from verify_odd_target_box import no_duplicates
        with self.assertRaises(ValueError):
            json.loads('{"format": 1, "for\\u006dat": 2}', object_pairs_hook=no_duplicates)


if __name__ == "__main__":
    unittest.main()
