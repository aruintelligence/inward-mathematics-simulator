"""Exact exhaustion, adversarial certificates, and boundary cases."""
import copy
from fractions import Fraction
import json
from pathlib import Path
import random
import unittest

from odd_target_box import certificate, gap_certificate, stability_certificate, winner
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

    def test_gap_envelope_interior_vertex_and_attained_witnesses(self):
        example = gap_certificate(["40", "45", "50", "80"], "0", "100", "48", "52")
        self.assertEqual(example,
                         json.loads(Path("examples/target-box-gap-v3.json").read_text()))
        self.assertEqual(verify(example)["gap"]["min"]["value"], "-1435/16")
        vertex = gap_certificate(["11", "20", "4", "2", "5"], "0", "20", "6", "9")
        self.assertEqual(vertex["claim"]["routes"][2]["gap"]["max"],
                         {"value": "49/6", "reading": "79/12", "target": "6"})
        self.assertNotIn("79/12", vertex["claim"]["routes"][2]["knots"])
        verify(vertex)
        for edit in (lambda c: c["claim"]["routes"][2]["gap"]["max"].update(value="8"),
                     lambda c: c["claim"]["gap"]["min"].update(index=0),
                     lambda c: c.update(format="inward-odd-target-box-v1")):
            forged = copy.deepcopy(vertex)
            edit(forged)
            with self.assertRaises(ValueError):
                verify(forged)
        rng = random.Random(20261016)
        for i in range(18):
            count = 3 + i
            readings = [str(Fraction(rng.randrange(-8, 9), rng.choice((1, 2, 3, 7))))
                        for _ in range(count)]
            low, high = min(map(Fraction, readings)) - 1, max(map(Fraction, readings)) + 1
            a, b = sorted((Fraction(rng.randrange(-9, 10), 2),
                           Fraction(rng.randrange(-9, 10), 3)))
            record = gap_certificate(readings, str(low), str(high), str(a), str(b))
            verify(record)
            for route in record["claim"]["routes"]:
                fixed = list(map(Fraction, readings))
                fixed.pop(route["index"])
                lower = Fraction(route["gap"]["min"]["value"])
                upper = Fraction(route["gap"]["max"]["value"])
                for x_index in range(11):
                    x = low + (high - low) * x_index / 10
                    values = sorted([*fixed, x])
                    mean = sum(values) / count
                    median = (values[(count - 1) // 2] + values[count // 2]) / 2
                    for t_index in range(11):
                        target = a + (b - a) * t_index / 10
                        d = (mean - target) ** 2 - (median - target) ** 2
                        self.assertLessEqual(lower, d)
                        self.assertLessEqual(d, upper)

    def test_exact_first_failure_and_strict_interior(self):
        record = stability_certificate(["48", "49", "50", "51", "85"], "0", "100", "48", "52")
        self.assertEqual(record, json.loads(Path("examples/target-box-stability-v4.json").read_text()))
        self.assertEqual(verify(record)["stability"]["nearestFailure"],
                         {"distance": "8", "index": 2, "side": "left", "reading": "42", "target": "52"})
        # Independent finite spot checks test the meaningful strict interior;
        # the root-completeness argument supplies the continuous guarantee.
        values = list(map(Fraction, [48, 49, 50, 51, 85]))
        for index in range(len(values)):
            fixed = values[:index] + values[index + 1:]
            for step in range(-15, 16):
                moved = values[index] + Fraction(step, 2)
                for target in (Fraction(48), Fraction(49), Fraction(52)):
                    self.assertEqual(winner(fixed, moved, target), "Median")
        fixed = values[:2] + values[3:]
        self.assertEqual(winner(fixed, Fraction(42), Fraction(52)), "Tie")
        protected = stability_certificate(["8", "6", "8", "7", "0", "8"],
                                          "0", "10", "30", "40")
        self.assertIsNone(verify(protected)["stability"]["nearestFailure"])
        initial_tie = stability_certificate(["40", "45", "50", "80"],
                                            "0", "100", "48", "52")
        self.assertEqual(verify(initial_tie)["stability"]["nearestFailure"]["distance"], "0")
        for edit in (lambda c: c["claim"]["routes"][2]["stability"]["left"].update(limit="41"),
                     lambda c: c["claim"]["routes"][2]["stability"]["left"].update(included=True),
                     lambda c: c["claim"]["routes"][2]["stability"]["left"]["witness"].update(target="48"),
                     lambda c: c["claim"]["stability"]["nearestFailure"].update(distance="7")):
            forged = copy.deepcopy(record)
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
