import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ronix_erp.migration.analyzer import analyze_snapshot
from ronix_erp.migration.extractor import extract_initial_snapshot_file


def main():
    parser = argparse.ArgumentParser(
        description="Extract window.INITIAL_DB from a legacy RONIX HTML file."
    )
    parser.add_argument("html_file", type=Path)
    parser.add_argument("--output", type=Path, help="Optional JSON output path")
    parser.add_argument(
        "--allow-invalid",
        action="store_true",
        help="Write invalid data only when explicitly requested",
    )
    args = parser.parse_args()

    snapshot = extract_initial_snapshot_file(args.html_file)
    report = analyze_snapshot(snapshot)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))

    if args.output:
        if not report["valid"] and not args.allow_invalid:
            raise SystemExit("Snapshot is invalid; JSON output was blocked.")
        args.output.write_text(
            json.dumps(snapshot, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()
