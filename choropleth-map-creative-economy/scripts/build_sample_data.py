#!/usr/bin/env python3
"""
build_sample_data.py
Converts the sample CSV in data/ into assets/sample-data.json, the preloaded
dataset build_map.py inlines into mapc-choropleth-map.html so the map renders
immediately without requiring an upload.

Usage:
    python build_sample_data.py [--input ../data/summary.dataaxle.ce.nefa.core.categories.mapc.by.town.estab.csv] [--output ../assets/sample-data.json]
"""

import argparse
import csv
import json
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_INPUT = os.path.join(
    REPO, "data", "summary.dataaxle.ce.nefa.core.categories.mapc.by.town.estab.csv"
)
DEFAULT_OUTPUT = os.path.join(REPO, "assets", "sample-data.json")


def main():
    parser = argparse.ArgumentParser(description="Convert the sample CSV to assets/sample-data.json")
    parser.add_argument("--input", default=DEFAULT_INPUT)
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    with open(args.input, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(rows, f)

    print(f"Wrote {args.output} ({os.path.getsize(args.output) / 1024:.1f} KB, {len(rows)} rows)")


if __name__ == "__main__":
    main()
