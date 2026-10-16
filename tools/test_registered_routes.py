"""Failure-mode checks for the formal/runtime parity gate."""
from pathlib import Path
import subprocess
import unittest

from check_registered_routes import compare, parse_routes


ROOT = Path(__file__).resolve().parent.parent


class RouteParityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.export = subprocess.check_output(
            ["node", str(ROOT / "tools/export_browser_routes.cjs"), "3"],
            cwd=ROOT, text=True)

    def test_missing_and_duplicate_cells_are_rejected(self):
        lines = self.export.splitlines()
        with self.assertRaisesRegex(ValueError, "missing"):
            parse_routes("\n".join(lines[1:]), "test")
        with self.assertRaisesRegex(ValueError, "duplicate"):
            parse_routes("\n".join(lines + [lines[0]]), "test")

    def test_changed_witness_is_rejected_even_if_status_is_unchanged(self):
        correct = parse_routes(self.export, "test")
        forged = parse_routes(self.export.replace("one-high:100", "one-low:100", 1), "forged")
        with self.assertRaisesRegex(ValueError, "differs from Lean"):
            compare(correct, forged, "forged")


if __name__ == "__main__":
    unittest.main()
