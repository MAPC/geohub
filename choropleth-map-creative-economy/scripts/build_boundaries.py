#!/usr/bin/env python3
"""
build_boundaries.py
Converts the official MAPC-provided geojson files in data/ into the three
boundary assets build_map.py inlines into mapc-choropleth-map.html:

  data/MAPC_Towns_poly_2025.geojson            -> assets/mapc-101-boundaries.topojson
  data/MAPC_Boundary__(single_outline).geojson -> assets/mapc-region-outline.geojson
  data/MAPC_Towns_poly_2025.geojson
    + data/MAPC_Subregional_Boundaries.geojson -> assets/mapc-lookup.json

Each town's subregion is resolved by a spatial join (centroid-in-polygon)
against the subregion boundaries, not by name lookup — the official
subregion file's labels (e.g. "ICC / TRIC") are used verbatim, including
the handful of towns with compound dual-subregion membership.

There is no Census GEOID in the official town file, so muni_id (MAPC's own
identifier) is the join key between boundary geometry, the lookup table, and
matched spreadsheet rows.

Usage:
    python build_boundaries.py
"""

import json
import os
import re

import geopandas as gpd
import topojson as tp

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(REPO, "data")
ASSETS = os.path.join(REPO, "assets")

TOWNS_SRC = os.path.join(DATA, "MAPC_Towns_poly_2025.geojson")
SUBREGIONS_SRC = os.path.join(DATA, "MAPC_Subregional_Boundaries.geojson")
OUTLINE_SRC = os.path.join(DATA, "MAPC_Boundary__(single_outline).geojson")

SIMPLIFY_TOLERANCE = 0.001  # ~111m, matches the tolerance used for the prior TIGER/Line boundaries
OUTLINE_SIMPLIFY_TOLERANCE = 0.0007


def normalize(name: str) -> str:
    n = name.strip().lower()
    n = re.sub(r"^(town of |city of |the )", "", n)
    n = re.sub(r"[^a-z0-9\s-]", "", n)
    n = re.sub(r"\s+", " ", n).strip()
    return n


def main():
    towns = gpd.read_file(TOWNS_SRC)
    print(f"Loaded {len(towns)} towns from {TOWNS_SRC}")

    # ---- 1. mapc-101-boundaries.topojson ----
    # Simplify via toposimplify (post shared-arc extraction), NOT geometry.simplify()
    # per-feature beforehand — independent per-polygon simplification moves each
    # town's shared border differently on either side, opening up gaps/slivers
    # between neighbors that don't exist in the official file. toposimplify
    # simplifies each shared arc once, so adjacent towns stay glued together.
    for_topo = towns.rename(columns={"municipal": "NAME"})[["muni_id", "NAME", "geometry"]]
    topo = tp.Topology(
        for_topo, prequantize=True, toposimplify=SIMPLIFY_TOLERANCE, object_name="municipalities"
    )
    boundaries_out = os.path.join(ASSETS, "mapc-101-boundaries.topojson")
    with open(boundaries_out, "w") as f:
        f.write(topo.to_json())
    print(f"Wrote {boundaries_out} ({os.path.getsize(boundaries_out) / 1024:.1f} KB, {len(for_topo)} municipalities)")

    # ---- 2. mapc-lookup.json (spatial join for subregion) ----
    subs = gpd.read_file(SUBREGIONS_SRC)
    # representative_point() (unlike centroid) is guaranteed to fall inside the
    # polygon — matters for concave coastal towns like Hull and Gloucester/Cape Ann.
    points = gpd.GeoDataFrame(
        towns[["municipal", "muni_id"]], geometry=towns.geometry.representative_point(), crs=towns.crs
    )
    joined = gpd.sjoin(
        points, subs[["Subregion_abbrev", "geometry"]], how="left", predicate="within"
    )
    if joined["Subregion_abbrev"].isna().any():
        missing = joined[joined["Subregion_abbrev"].isna()]["municipal"].tolist()
        raise ValueError(f"No subregion match for: {missing}")
    if joined["municipal"].duplicated().any():
        dupes = joined[joined["municipal"].duplicated(keep=False)]["municipal"].tolist()
        raise ValueError(f"Town centroid matched multiple subregions: {dupes}")

    lookup = {}
    for _, row in joined.iterrows():
        key = normalize(row["municipal"])
        lookup[key] = {
            "muniId": row["muni_id"],
            "canonical": row["municipal"],
            "subregion": row["Subregion_abbrev"],
        }
    # The official file calls it "Manchester"; spreadsheets (and the Census) commonly
    # use the full "Manchester-by-the-Sea" — alias the long form to the same entry.
    lookup[normalize("Manchester-by-the-Sea")] = lookup[normalize("Manchester")]

    lookup_out = os.path.join(ASSETS, "mapc-lookup.json")
    with open(lookup_out, "w") as f:
        json.dump(lookup, f)
    print(f"Wrote {lookup_out} ({len(lookup)} entries, {len(joined)} towns + alias)")

    # ---- 3. mapc-region-outline.geojson ----
    outline = gpd.read_file(OUTLINE_SRC)
    geom = outline.geometry.iloc[0].simplify(tolerance=OUTLINE_SIMPLIFY_TOLERANCE, preserve_topology=True)
    outline_geojson = {
        "type": "Feature",
        "properties": {"name": "MAPC Region (Greater Boston)"},
        "geometry": json.loads(gpd.GeoSeries([geom], crs=outline.crs).to_json())["features"][0]["geometry"],
    }
    outline_out = os.path.join(ASSETS, "mapc-region-outline.geojson")
    with open(outline_out, "w") as f:
        json.dump(outline_geojson, f)
    print(f"Wrote {outline_out} ({os.path.getsize(outline_out) / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
