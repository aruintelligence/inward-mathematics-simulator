"""Independent checks of saved counterexamples and reproducible search output."""
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import copy
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from discover_candidates import points, scan
from query_discovery import search
from verify_discovery_archive import verify
from render_discovery_page import render_page
import render_discovery_page
from verify_estimator_identities import verify as verify_identities

ROOT = Path(__file__).resolve().parent.parent
ARCHIVE = ROOT / "examples/discovery-scan-v1.json"
IDENTITIES = ROOT / "examples/estimator-identities-v1.json"


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

    def test_archive_search_filters_claim_and_status(self):
        archive = json.loads(ARCHIVE.read_text(encoding="utf-8"))
        result = search(archive, "midpoint", "unrefuted-on-finite-grid")
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["matches"][0]["id"], "midpoint-tie")
        self.assertEqual(search(archive, status="counterexample-found")["count"], 3)
        self.assertEqual(search(archive, "unknown")["count"], 0)

    def test_independent_archive_replay_checks_custom_exact_grid(self):
        values = points("0,1/2,1", 6)
        targets = points("0,1/2,1", 12)
        report = scan(values, targets)
        result = verify(report)
        self.assertEqual(result["readingMultisets"], 21)
        self.assertEqual(result["candidates"], 5)
        self.assertEqual(result["statuses"]["median-never-worse"], "counterexample-found")

    def test_query_rejects_forged_counterexamples_and_unchecked_claims(self):
        original = json.loads(ARCHIVE.read_text(encoding="utf-8"))
        edits = (
            lambda a: a["candidates"][0]["counterexample"].update(actualWinner="median"),
            lambda a: a["candidates"][1].update(casesChecked=126),
            lambda a: a["candidates"][3].update(status="counterexample-found"),
            lambda a: a["candidates"][4].update(casesChecked=1),
            lambda a: a["domain"].update(readingMultisets=125),
            lambda a: a.update(sourceSha256="0" * 64),
        )
        for edit in edits:
            altered = copy.deepcopy(original)
            edit(altered)
            with self.subTest(edit=edits.index(edit)), self.assertRaises(ValueError):
                search(altered)

    def test_cli_fingerprints_valid_bytes_and_rejects_duplicate_keys(self):
        good = subprocess.run(["python3", "tools/verify_discovery_archive.py", str(ARCHIVE)],
                              cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(good.returncode, 0, good.stderr)
        digest = hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()
        self.assertIn("Archive SHA-256: " + digest, good.stdout)
        duplicate = ARCHIVE.read_text(encoding="utf-8").replace(
            '"format": "inward-discovery-scan-v1",',
            '"format": "inward-discovery-scan-v1", "format": "inward-discovery-scan-v1",', 1)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "duplicate.json"
            path.write_text(duplicate, encoding="utf-8")
            for script in ("verify_discovery_archive.py", "query_discovery.py"):
                bad = subprocess.run(["python3", "tools/" + script, "--archive", str(path)]
                                     if script == "query_discovery.py" else
                                     ["python3", "tools/" + script, str(path)],
                                     cwd=ROOT, capture_output=True, text=True)
                self.assertNotEqual(bad.returncode, 0)
                self.assertIn("Duplicate JSON key", bad.stderr)

    def test_page_matches_only_independently_checked_archive(self):
        archive = json.loads(ARCHIVE.read_text(encoding="utf-8"))
        self.assertEqual((ROOT / "discovery.html").read_text(encoding="utf-8"), render_page(archive))
        altered = copy.deepcopy(archive)
        altered["candidates"][0]["counterexample"]["target"] = "0"
        with self.assertRaises(ValueError):
            render_page(altered)

    def test_symbolic_record_covers_general_identities_and_all_reorderings(self):
        record = json.loads(IDENTITIES.read_text(encoding="utf-8"))
        self.assertEqual(verify_identities(record),
                         {"symbolicIdentities": 2, "formalIndexPermutations": 120})
        mutations = (
            lambda r: r["factorization"]["expandedTerms"].update({"a*t": "-1"}),
            lambda r: r["midpoint"]["firstResidual"].update({"a": "1/3"}),
            lambda r: r["permutation"].update({"permutationsChecked": 119}),
            lambda r: r["permutation"].update({"medianRank": 2}),
            lambda r: r["permutation"].update({"statement": "Every estimator is invariant"}),
        )
        for index, mutate in enumerate(mutations):
            altered = copy.deepcopy(record)
            mutate(altered)
            with self.subTest(index=index), self.assertRaises(ValueError):
                verify_identities(altered)

    def test_symbolic_cli_rejects_duplicate_fields_and_fingerprints_checked_bytes(self):
        result = subprocess.run(["python3", "tools/verify_estimator_identities.py", str(IDENTITIES)],
                                cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Proof record SHA-256: " + hashlib.sha256(IDENTITIES.read_bytes()).hexdigest(),
                      result.stdout)
        duplicate = IDENTITIES.read_text(encoding="utf-8").replace(
            '"format": "inward-estimator-identities-v1",',
            '"format": "inward-estimator-identities-v1", "format": "inward-estimator-identities-v1",', 1)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "duplicate.json"
            path.write_text(duplicate, encoding="utf-8")
            bad = subprocess.run(["python3", "tools/verify_estimator_identities.py", str(path)],
                                 cwd=ROOT, capture_output=True, text=True)
            self.assertNotEqual(bad.returncode, 0)
            self.assertIn("Duplicate JSON key", bad.stderr)
            archive = json.loads(ARCHIVE.read_text(encoding="utf-8"))
            with patch.object(render_discovery_page, "IDENTITIES", path), self.assertRaises(ValueError):
                render_page(archive)

    def test_page_refuses_changed_symbolic_record(self):
        altered = json.loads(IDENTITIES.read_text(encoding="utf-8"))
        altered["midpoint"]["secondResidual"]["b"] = "-1/2"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "changed.json"
            path.write_text(json.dumps(altered), encoding="utf-8")
            archive = json.loads(ARCHIVE.read_text(encoding="utf-8"))
            with patch.object(render_discovery_page, "IDENTITIES", path), self.assertRaises(ValueError):
                render_page(archive)


if __name__ == "__main__":
    unittest.main()
