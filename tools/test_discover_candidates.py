"""Independent checks of saved counterexamples and reproducible search output."""
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import unittest

from discover_candidates import points, scan

ROOT = Path(__file__).resolve().parent.parent
ARCHIVE = ROOT / "examples/discovery-scan-v1.json"


def independent_winner(witness):
    readings = [Fraction(value) for value in witness["readings"]]
    target = Fraction(witness["target"])
    assert Fraction(witness["mean"]) == sum(readings) / 5
    assert Fraction(witness["median"]) == sorted(readings)[2]
    difference = abs(sum(readings) / 5 - target) - abs(sorted(readings)[2] - target)
    return "tie" if difference == 0 else "mean" if difference < 0 else "median"


class DiscoveryTests(unittest.TestCase):
    def test_archive_replays_exactly(self):
        archive = json.loads(ARCHIVE.read_text(encoding="utf-8"))
        self.assertEqual(archive, scan(points("0,25,50,75,100", 6),
                                       points("0,25,50,75,100", 12)))
        self.assertEqual(archive["sourceSha256"], hashlib.sha256(
            (ROOT / "tools/discover_candidates.py").read_bytes()).hexdigest())
        self.assertEqual(archive["domain"]["readingMultisets"], 126)
        self.assertEqual([item["status"] for item in archive["candidates"]],
                         ["counterexample-found"] * 3 + ["unrefuted-on-finite-grid"] * 2)

    def test_reported_counterexamples_actually_reverse_claims(self):
        archive = json.loads(ARCHIVE.read_text(encoding="utf-8"))
        median_claim, mean_claim, target_claim = archive["candidates"][:3]
        for candidate, expected in ((median_claim, "mean"), (mean_claim, "median")):
            witness = candidate["counterexample"]
            self.assertEqual(independent_winner(witness), expected)
            self.assertEqual(witness["actualWinner"], expected)
        first, second = (target_claim["counterexample"][key] for key in ("first", "second"))
        self.assertEqual(first["readings"], second["readings"])
        self.assertEqual({independent_winner(first), independent_winner(second)},
                         {"mean", "median"})

    def test_fractional_custom_grid_keeps_finite_scope(self):
        report = scan(points("0,1/2,1", 6), points("0,1/2,1", 12))
        self.assertEqual(report["domain"]["readingMultisets"], 21)
        self.assertEqual(report["candidates"][3]["status"], "unrefuted-on-finite-grid")
        with self.assertRaises(ValueError):
            points("0,0", 6)


if __name__ == "__main__":
    unittest.main()
