"""Check the constructive family at sizes beyond the UI's finite grid limit."""
from fractions import Fraction
import unittest

from verify_conditional_claim import endpoint_refutation


class EndpointFamilyTests(unittest.TestCase):
    def test_all_refutable_pairs_at_odd_even_and_large_sizes(self):
        routes = {
            "any-target": ("lower-no-worse", "higher-no-worse", "mean-no-worse", "median-no-worse"),
            "target-at-or-below-midpoint": ("higher-no-worse", "mean-no-worse", "median-no-worse"),
            "target-at-or-above-midpoint": ("lower-no-worse", "mean-no-worse", "median-no-worse"),
            "target-at-or-below-both": ("higher-no-worse", "mean-no-worse", "median-no-worse"),
            "target-at-or-above-both": ("lower-no-worse", "mean-no-worse", "median-no-worse"),
        }
        for n in (3, 4, 5, 6, 7, 8, 21, 101):
            for condition, predictions in routes.items():
                for prediction in predictions:
                    with self.subTest(n=n, condition=condition, prediction=prediction):
                        result = endpoint_refutation(condition, prediction, n)
                        construction = result["construction"]
                        witness = result["counterexample"]
                        readings = list(map(Fraction, witness["readings"]))
                        self.assertEqual(len(readings), n)
                        self.assertEqual(readings, sorted(readings))
                        self.assertEqual(Fraction(witness["mean"]), sum(readings) / n)
                        self.assertEqual(Fraction(witness["median"]),
                                         Fraction(0) if construction["family"] == "one-high" else Fraction(100))
                        self.assertIn(Fraction(witness["target"]), (Fraction(0), Fraction(100)))
                        self.assertIn(witness["actualWinner"], ("mean", "median"))


if __name__ == "__main__":
    unittest.main()
