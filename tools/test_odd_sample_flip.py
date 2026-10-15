"""Exact optimality and tamper checks for arbitrary odd sample sizes."""
import copy
import base64
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import random
import subprocess
import tempfile
import unittest

from odd_sample_flip import certificate, winner
from verify_odd_sample_flip import verify
from render_odd_flip_report import render

ROOT = Path(__file__).resolve().parent.parent
EXAMPLE = ROOT / "examples/odd-sample-flip-v1.json"
REPORT = ROOT / "odd-flip-report.html"


class OddFlipTests(unittest.TestCase):
    def test_exact_example_has_global_tie_threshold_and_strict_witness(self):
        record = json.loads(EXAMPLE.read_text(encoding="utf-8"))
        self.assertEqual(record, certificate(["48", "49", "50", "51", "85"], "50"))
        self.assertEqual(verify(record)["routes"], 5)
        self.assertEqual(record["claim"]["baseline"], "Median")
        self.assertEqual(record["claim"]["best"],
                         {"index": 2, "threshold": "22", "distance": "28", "witness": "17"})
        readings = list(map(Fraction, record["inputs"]["readings"]))
        readings[2] = Fraction(22)
        self.assertEqual(winner(readings, Fraction(50)), "Tie")
        readings[2] = Fraction(21999, 1000)
        self.assertEqual(winner(readings, Fraction(50)), "Mean")

    def test_fractional_inputs_and_boundary_baselines(self):
        for values, target in ((["1/2", "1", "3/2"], "3/4"),
                               (["0", "0", "0", "100", "100", "100", "100"], "1/3"),
                               (["0"] * 21, "50")):
            record = certificate(values, target)
            self.assertEqual(verify(record)["kind"], record["claim"]["kind"])
        tied = certificate(["0", "50", "100"], "25")
        self.assertEqual(verify(tied), {"kind": "baseline-tie", "routes": 0, "best": None})
        self.assertEqual(tied["claim"]["routes"], [])
        self.assertEqual(certificate(["0.5", "1.0", "1.5"], "0.75")["inputs"],
                         {"readings": ["1/2", "1", "3/2"], "target": "3/4"})

    def test_seeded_partition_and_sampled_strict_reversals(self):
        rng = random.Random(20261015)
        for n in (3, 5, 7, 9, 21):
            for _ in range(15):
                values = [str(rng.randrange(0, 101)) for _ in range(n)]
                target = str(rng.randrange(0, 101))
                record = certificate(values, target)
                verify(record)
                if record["claim"]["kind"] != "strict-baseline":
                    continue
                original = list(map(Fraction, values))
                baseline = record["claim"]["baseline"]
                for route in record["claim"]["routes"]:
                    fixed = original[:route["index"]] + original[route["index"] + 1:]
                    for unit in range(0, 401):
                        alternative = Fraction(unit, 4)
                        if winner([*fixed, alternative], Fraction(target)) != baseline and \
                                winner([*fixed, alternative], Fraction(target)) != "Tie":
                            self.assertIsNotNone(route["distance"])
                            self.assertGreater(abs(alternative - original[route["index"]]),
                                               Fraction(route["distance"]))

    def test_verifier_rejects_forged_partition_threshold_and_witness(self):
        original = json.loads(EXAMPLE.read_text(encoding="utf-8"))
        edits = (
            lambda c: c["claim"]["best"].update(distance="27"),
            lambda c: c["claim"]["routes"][2]["knots"].pop(1),
            lambda c: c["claim"]["routes"][2]["pointWinners"].__setitem__(0, "Tie"),
            lambda c: c["claim"]["routes"][2].update(threshold="21"),
            lambda c: c["claim"]["routes"][2].update(witness="22"),
            lambda c: c["inputs"].update(target="49"),
        )
        for index, edit in enumerate(edits):
            changed = copy.deepcopy(original)
            edit(changed)
            with self.subTest(index=index), self.assertRaises((ValueError, ArithmeticError)):
                verify(changed)

    def test_cli_rejects_duplicate_keys_and_fingerprints_valid_bytes(self):
        good = subprocess.run(["python3", "tools/verify_odd_sample_flip.py", str(EXAMPLE)],
                              cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(good.returncode, 0, good.stderr)
        self.assertIn("Certificate SHA-256: " + hashlib.sha256(EXAMPLE.read_bytes()).hexdigest(), good.stdout)
        duplicate = EXAMPLE.read_text(encoding="utf-8").replace(
            '"target": "50"', '"target": "50", "target": "50"', 1)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "duplicate.json"
            path.write_text(duplicate, encoding="utf-8")
            rejected = subprocess.run(["python3", "tools/verify_odd_sample_flip.py", str(path)],
                                      cwd=ROOT, capture_output=True, text=True)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn("Duplicate JSON key", rejected.stderr)

    def test_report_contains_exact_checked_bytes_and_refuses_forgery(self):
        raw = EXAMPLE.read_bytes()
        record = json.loads(raw)
        html = render(raw)
        self.assertEqual(REPORT.read_text(encoding="utf-8"), html)
        self.assertIn(hashlib.sha256(raw).hexdigest(), html)
        self.assertIn("28 units to tie", html)
        self.assertIn("(12, 22)", html)
        encoded = html.split('href="data:application/json;base64,', 1)[1].split('"', 1)[0]
        self.assertEqual(base64.b64decode(encoded), raw)
        tied = certificate(["0", "50", "100"], "25")
        self.assertIn("Baseline <span>tie</span>", render(json.dumps(tied).encode()))
        changed = copy.deepcopy(record)
        changed["claim"]["best"]["distance"] = "27"
        with self.assertRaises(ValueError):
            render(json.dumps(changed).encode())


if __name__ == "__main__":
    unittest.main()
