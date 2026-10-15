#!/usr/bin/env python3
"""Search the versioned finite discovery archive by text and status."""
import argparse
import json
from pathlib import Path
from verify_discovery_archive import no_duplicates, verify

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ARCHIVE = ROOT / "examples/discovery-scan-v1.json"


def search(archive, term="", status=None):
    verify(archive)
    needle = term.casefold()
    matches = []
    for candidate in archive["candidates"]:
        if not isinstance(candidate, dict) or not all(key in candidate for key in ("id", "claim", "status")):
            raise ValueError("Malformed archive candidate")
        if status and candidate["status"] != status:
            continue
        if needle and not any(needle in str(candidate[key]).casefold() for key in ("id", "claim", "status")):
            continue
        matches.append(candidate)
    return {"archiveFormat": archive["format"], "matches": matches, "count": len(matches)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("term", nargs="?", default="", help="Text in candidate ID, claim, or status")
    parser.add_argument("--status", choices=("counterexample-found", "unrefuted-on-finite-grid"))
    parser.add_argument("--archive", type=Path, default=DEFAULT_ARCHIVE)
    args = parser.parse_args()
    try:
        if args.archive.stat().st_size > 1_000_000:
            raise ValueError("Archive too large")
        archive = json.loads(args.archive.read_text(encoding="utf-8"), object_pairs_hook=no_duplicates,
                             parse_constant=lambda value: (_ for _ in ()).throw(ValueError("Invalid JSON constant")))
        print(json.dumps(search(archive, args.term, args.status), indent=2))
    except (OSError, ValueError) as error:
        parser.exit(1, f"Archive search failed: {error}\n")


if __name__ == "__main__":
    main()
