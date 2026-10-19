"""Exact exhaustion, adversarial certificates, and boundary cases."""
import copy
from fractions import Fraction
import base64
import hashlib
import json
from pathlib import Path
import random
import re
import unittest

from odd_target_box import (certificate, gap_certificate, stability_certificate,
                            atlas_certificate, horizon_certificate, winner)
from verify_odd_target_box import verify, query_target_horizon
from render_target_horizon_report import render


class TargetBoxTests(unittest.TestCase):
    def test_portable_horizon_report_embeds_exact_checked_bytes_and_scopes_formal_claim(self):
        raw = Path("examples/target-horizon-v6.json").read_bytes()
        page = render(raw)
        self.assertEqual(page, Path("target-horizon-report.html").read_text())
        self.assertIn(hashlib.sha256(raw).hexdigest(), page)
        encoded = re.search(r'href="data:application/json;base64,([A-Za-z0-9+/=]+)"', page)
        self.assertIsNotNone(encoded)
        self.assertEqual(base64.b64decode(encoded.group(1)), raw)
        self.assertIn("six_reading_full_horizon theorem", page)
        self.assertIn("17/3 ≤ t ≤ 95/12", page)
        self.assertIn("At x = 10: <strong>95/12</strong>", page)
        self.assertIn("Move reading 1 to 4", page)

        altered = json.loads(raw)
        altered["claim"]["targetHorizon"]["high"] = "8"
        with self.assertRaises(ValueError):
            render(json.dumps(altered).encode())
        with self.assertRaises(ValueError):
            render(raw.replace(b'"format":', b'"format":"other","format":', 1))
        with self.assertRaises(ValueError):
            render(Path("examples/odd-target-box-v1.json").read_bytes())

    def test_portable_horizon_report_handles_all_target_equality_without_false_winners(self):
        blocked = horizon_certificate(["48", "49", "50", "51", "85"],
                                      "0", "100", "48", "52")
        page = render(json.dumps(blocked).encode())
        self.assertIn("No strict target guarantee", page)
        self.assertIn("Move reading\n1 to <code>15</code>", page)
        self.assertNotIn("Complete target classification", page)
        self.assertIn("does not claim a Lean proof of an arbitrary receipt", page)

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

    def test_region_atlas_agrees_with_direct_errors_on_exact_points(self):
        readings = ["48", "49", "50", "51", "85"]
        record = atlas_certificate(readings, "0", "100", "48", "52")
        self.assertEqual(record, json.loads(Path("examples/target-box-atlas-v5.json").read_text()))
        self.assertTrue(verify(record)["atlas"])
        for route in record["claim"]["routes"]:
            fixed = list(map(Fraction, readings))
            fixed.pop(route["index"])
            for stripe in route["region"]["stripes"]:
                left, right = Fraction(stripe["from"]), Fraction(stripe["to"])
                x = (left + right) / 2
                tie = (Fraction(stripe["tieFrom"]) + Fraction(stripe["tieTo"])) / 2
                for target in (Fraction(48), Fraction(50), Fraction(52), tie - 1, tie, tie + 1):
                    expected = (stripe["below"] if target < tie else
                                stripe["above"] if target > tie else "Tie")
                    self.assertEqual(winner(fixed, x, target), expected)
            for raw in route["region"]["verticalTies"]:
                for target in (Fraction(48), Fraction(52), Fraction(-17)):
                    self.assertEqual(winner(fixed, Fraction(raw), target), "Tie")
        even = atlas_certificate(["40", "45", "50", "80"], "0", "100", "48", "52")
        singleton = atlas_certificate(["0", "1", "2"], "0", "2", "1", "1")
        verify(even)
        verify(singleton)
        for edit in (lambda c: c["claim"]["routes"][0]["region"]["stripes"].pop(),
                     lambda c: c["claim"]["routes"][0]["region"]["stripes"][0].update(below="Median"),
                     lambda c: c["claim"]["routes"][0]["region"]["verticalTies"].clear()):
            forged = copy.deepcopy(record)
            edit(forged)
            with self.assertRaises(ValueError):
                verify(forged)

    def test_target_horizon_constructs_ties_and_detects_all_target_equalities(self):
        readings = ["8", "6", "8", "7", "0", "8"]
        fixture = horizon_certificate(readings, "0", "10", "6", "6")
        self.assertEqual(fixture, json.loads(Path("examples/target-horizon-v6.json").read_text()))
        self.assertEqual(fixture["claim"]["targetHorizon"], {
            "low": "17/3", "high": "95/12", "allTargetTie": None,
            "below": "Mean", "above": "Median",
            "probe": {"target": "6", "verdict": "Tie",
                      "witness": {"index": 0, "reading": "4"}}})
        for i in range(25):
            t = Fraction(17, 3) + (Fraction(95, 12) - Fraction(17, 3)) * i / 24
            receipt = horizon_certificate(readings, "0", "10", str(t), str(t))
            probe = verify(receipt)["targetHorizon"]["probe"]
            self.assertEqual(probe["verdict"], "Tie")
            fixed = list(map(Fraction, readings))
            fixed.pop(probe["witness"]["index"])
            self.assertEqual(winner(fixed, Fraction(probe["witness"]["reading"]), t), "Tie")
        for t, name in (("5", "Mean"), ("8", "Median")):
            receipt = horizon_certificate(readings, "0", "10", t, t)
            self.assertEqual(verify(receipt)["targetHorizon"]["probe"],
                             {"target": t, "verdict": name, "witness": None})
            for index in range(len(readings)):
                fixed = list(map(Fraction, readings))
                fixed.pop(index)
                for step in range(17):
                    self.assertEqual(winner(fixed, Fraction(10 * step, 16), Fraction(t)), name)
        blocked = horizon_certificate(["48", "49", "50", "51", "85"],
                                      "0", "100", "48", "52")
        h = verify(blocked)["targetHorizon"]
        self.assertEqual(h["allTargetTie"], {"index": 0, "reading": "15"})
        for t in (Fraction(-999999), Fraction(0), Fraction(50), Fraction(999999)):
            self.assertEqual(winner([Fraction(49), Fraction(50), Fraction(51), Fraction(85)],
                                    Fraction(15), t), "Tie")
        even = horizon_certificate(["40", "45", "50", "80"],
                                   "0", "100", "48", "52")
        verify(even)
        for edit in (lambda c: c["claim"]["targetHorizon"].update(low="6"),
                     lambda c: c["claim"]["targetHorizon"]["probe"]["witness"].update(reading="5"),
                     lambda c: c["claim"]["routes"][0]["targetHorizon"].update(atMovementHigh="6")):
            forged = copy.deepcopy(fixture)
            edit(forged)
            with self.assertRaises(ValueError):
                verify(forged)

    def test_checked_horizon_answers_fresh_exact_targets(self):
        receipt = json.loads(Path("examples/target-horizon-v6.json").read_text())
        for raw, expected in (("5", {"target": "5", "verdict": "Mean", "witness": None}),
                              ("17/3", {"target": "17/3", "verdict": "Tie",
                                        "witness": {"index": 0, "reading": "0"}}),
                              ("5.75", {"target": "23/4", "verdict": "Tie",
                                        "witness": {"index": 0, "reading": "1"}}),
                              ("6", {"target": "6", "verdict": "Tie",
                                     "witness": {"index": 0, "reading": "4"}}),
                              ("95/12", {"target": "95/12", "verdict": "Tie",
                                         "witness": {"index": 4, "reading": "10"}}),
                              ("1000000000", {"target": "1000000000", "verdict": "Median",
                                              "witness": None})):
            self.assertEqual(query_target_horizon(receipt, raw), expected)
        blocked = horizon_certificate(["48", "49", "50", "51", "85"],
                                      "0", "100", "48", "52")
        self.assertEqual(query_target_horizon(blocked, "-2000000"),
                         {"target": "-2000000", "verdict": "Tie",
                          "witness": {"index": 0, "reading": "15"}})
        even = horizon_certificate(["40", "45", "50", "80"],
                                   "0", "100", "48", "52")
        self.assertEqual(query_target_horizon(even, "50")["verdict"], "Tie")
        for raw in ("2/4", "1.1234567", "1e6", "-0", "3/0"):
            with self.assertRaises(ValueError, msg=raw):
                query_target_horizon(receipt, raw)
        forged = copy.deepcopy(receipt)
        forged["claim"]["targetHorizon"]["high"] = "8"
        with self.assertRaises(ValueError):
            query_target_horizon(forged, "6")
        with self.assertRaises(ValueError):
            query_target_horizon(certificate(["0", "1", "2"], "0", "2", "1", "1"), "1")

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
