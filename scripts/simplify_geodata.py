#!/usr/bin/env python3
"""
Rounds coordinate precision of the source world/prefecture GeoJSON files to keep
the bundled file size reasonable for a GitHub Pages deployment.

- world.json geometries are rounded to 2 decimal places (~1.1km precision at the
  equator). This file is only used as distant visual context, so sub-km precision
  is not needed.
- prefectures.json features are rounded to 3 decimal places (~110m precision),
  which keeps prefecture boundary shapes visually accurate at country-view zoom
  levels while cutting file size by roughly 4x.

Usage:
    python3 scripts/simplify_geodata.py path/to/world.json path/to/prefectures.json

Writes rounded output to public/data/world.json and public/data/prefectures.json.
"""
import json
import sys
from pathlib import Path

WORLD_DECIMALS = 2
PREF_DECIMALS = 3

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "data"


def round_coords(node, ndigits):
    if isinstance(node[0], (int, float)):
        return [round(node[0], ndigits), round(node[1], ndigits)]
    return [round_coords(child, ndigits) for child in node]


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)

    world_path, pref_path = sys.argv[1], sys.argv[2]

    world = json.load(open(world_path, encoding="utf-8"))
    for geom in world["geometries"]:
        geom["coordinates"] = round_coords(geom["coordinates"], WORLD_DECIMALS)

    prefectures = json.load(open(pref_path, encoding="utf-8"))
    for feature in prefectures["features"]:
        feature["geometry"]["coordinates"] = round_coords(
            feature["geometry"]["coordinates"], PREF_DECIMALS
        )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUT_DIR / "world.json", "w", encoding="utf-8") as f:
        json.dump(world, f, separators=(",", ":"), ensure_ascii=False)
    with open(OUT_DIR / "prefectures.json", "w", encoding="utf-8") as f:
        json.dump(prefectures, f, separators=(",", ":"), ensure_ascii=False)

    print("Wrote", OUT_DIR / "world.json")
    print("Wrote", OUT_DIR / "prefectures.json")


if __name__ == "__main__":
    main()
