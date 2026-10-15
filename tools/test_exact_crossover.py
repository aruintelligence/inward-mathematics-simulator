"""Standard-library tests for exact crossover certificate."""
import sys
from pathlib import Path
import unittest
from fractions import Fraction
sys.path.insert(0, str(Path(__file__).resolve().parent))
from exact_crossover import certificate, compare


class CrossoverTests(unittest.TestCase):
    def test_point_witnesses(self):
        self.assertEqual(compare("20", "80", "20"), "first")
        self.assertEqual(compare("20", "80", "80"), "second")
        self.assertEqual(compare("20", "80", "50"), "tie")

    def test_permanent_tie(self):
        self.assertEqual(certificate("50", "50", "0", "100")["kind"], "permanent-tie")

    def test_strict(self):
        result = certificate("20", "80", "0", "49")
        self.assertEqual((result["kind"], result["winner"]), ("strict-throughout", "first"))

    def test_crossing(self):
        self.assertEqual(certificate("20", "80", "49", "51")["kind"], "both-winners-and-tie")

    def test_endpoint(self):
        self.assertEqual(certificate("20", "80", "50", "90")["kind"], "winner-and-endpoint-tie")

    def test_singleton(self):
        self.assertEqual(certificate("20", "80", "50", "50")["kind"], "singleton-tie")

    def test_reversed(self):
        with self.assertRaises(ValueError):
            certificate("20", "80", "9", "8")

    def test_rational(self):
        self.assertEqual(certificate("1/3", "2/3", "0", "1")["crossover"], "1/2")

    def test_identity_exhaustive_grid(self):
        for a in range(-4, 5):
            for b in range(-4, 5):
                for t in range(-4, 5):
                    direct = abs(Fraction(a)-t)**2 - abs(Fraction(b)-t)**2
                    factored = (a-b)*(a+b-2*t)
                    self.assertEqual(direct, factored)
                    expected = "tie" if direct == 0 else "first" if direct < 0 else "second"
                    self.assertEqual(compare(a, b, t), expected)


if __name__ == "__main__":
    unittest.main()
