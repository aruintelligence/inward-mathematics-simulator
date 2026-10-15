"""Collection verifier must reject altered or ambiguous embedded receipts."""
import hashlib
import json
from pathlib import Path
import unittest

import verify_research_collection as collection


BOX = Path(__file__).resolve().parents[1] / "examples/odd-target-box-v1.json"


def fixture():
    source = BOX.read_text(encoding="utf-8")
    return {"format": collection.FORMAT, "records": [{
        "digest": hashlib.sha256(source.encode("utf-8")).hexdigest(),
        "kind": "target-box", "label": "Fixture", "source": source}]}


class ResearchCollectionTests(unittest.TestCase):
    def test_exact_embedded_receipt(self):
        results = collection.verify(json.dumps(fixture()).encode())
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0][1], "target-box")
        self.assertEqual(results[0][3], 5)

    def test_tampering_metadata_or_source(self):
        for change in (
            lambda x: x["records"][0].update(digest="0" * 64),
            lambda x: x["records"][0].update(kind="conditional-claim"),
            lambda x: x["records"][0].update(label=" "),
            lambda x: x["records"][0].update(source=x["records"][0]["source"] + " "),
            lambda x: x.update(unexpected=True),
        ):
            with self.subTest(change=change):
                value = fixture()
                change(value)
                with self.assertRaises((ValueError, TypeError)):
                    collection.verify(json.dumps(value).encode())

    def test_duplicate_keys_and_noninteger_numbers(self):
        good = json.dumps(fixture())
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            collection.verify(good.replace('"format":', '"format": "fake", "format":', 1).encode())
        with self.assertRaisesRegex(ValueError, "Noninteger"):
            collection.verify(good.replace('"records":', '"float": 1.0, "records":', 1).encode())


if __name__ == "__main__":
    unittest.main()
