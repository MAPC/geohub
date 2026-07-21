#!/usr/bin/env python3
"""
build_boundaries.py
Converts the official MAPC-provided geojson files in data/ into the three
boundary assets build_map.py inlines into mapc-choropleth-map.html:

"""

import json
import os
import re

import geopandas as gpd
import topojson as tp
from shapely.geometry import Polygon
from shapely.ops import unary_union
from shapely.validation import make_valid

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(REPO, "data")
ASSETS = os.path.join(REPO, "assets")

TOWNS_SRC = os.path.join(DATA, "MAPC_Towns_poly_2025.geojson")
SUBREGIONS_SRC = os.path.join(DATA, "MAPC_Subregional_Boundaries.geojson")
# data/MAPC_Boundary__(single_outline).geojson is no longer read -- the region outline is
# now derived from the municipality boundaries themselves (see main()) so it can't diverge
# from the fill polygons it's drawn on top of.

SIMPLIFY_TOLERANCE = 0.00005  # ~6m
# The old value (0.001, ~111m) was carried over from the prior TIGER/Line-derived boundaries,
# which are themselves already generalized at roughly that scale. MAPC_Towns_poly_2025.geojson
# is much higher-fidelity and genuinely resolves urban waterfront detail (small wharves/points/
# river bends on the order of tens of meters) down to a few meters between vertices. Simplifying
# THAT data at 111m compresses those real small features past the point of validity -- toposimplify
# doesn't just round them off, it can fold a small loop/point back on itself, producing a
# self-intersecting ring. repair_invalid()'s make_valid() call then makes that valid again, but
# only by lopping the tangle into a sharp spike/triangle -- a real reported bug, not a display
# quirk (visually confirmed against the pristine source with a matplotlib render: at 0.001 a real
# rounded ~100m point near Boston's Long Wharf collapsed into one jutting spike; 0.00005 preserves
# it as the rounded point it actually is). 0.00005 was the finest tolerance where going any finer
# stopped reducing the remaining self-intersection count (2 residual, both pre-existing pinch/
# near-touch points in the pristine data itself, e.g. Wayland -- not over-simplification), so
# anything finer than this just grows the file for no further correctness benefit. Trade-off:
# ~5x larger boundaries file (82KB -> ~424KB) for correct, non-self-intersecting coastal detail.


def repair_invalid(geom):
    """Fix self-intersections that topojson's toposimplify introduces on complex coastal
    multi-polygons (narrow river mouths/inlets where a simplified arc crosses another arc
    of the same feature). make_valid() can return a GeometryCollection mixing in degenerate
    line/point slivers from the crossing point -- those aren't real geography, so keep only
    the polygonal parts."""
    if geom.is_valid:
        return geom
    fixed = make_valid(geom)
    if fixed.geom_type == "GeometryCollection":
        polys = [g for g in fixed.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
        fixed = unary_union(polys) if polys else Polygon()
    return fixed


def as_topology(geom, object_name):
    """Wrap a single (Multi)Polygon into a one-row Topology, quantized at the same finer
    1e6 grid as simplify_and_repair's re-derive step for a comparable size/precision
    tradeoff."""
    gdf = gpd.GeoDataFrame({"geometry": [geom]}, crs="EPSG:4326")
    return tp.Topology(gdf, prequantize=1e6, toposimplify=False, object_name=object_name)


def simplify_and_repair(gdf, toposimplify, object_name):
    """toposimplify (Visvalingam-Whyatt via the topojson package) doesn't check whether its
    output is still a valid, non-self-intersecting ring -- narrow coastal inlets are the
    classic failure case (spiky self-crossing artifacts). Repairing per-feature after the
    fact is safe here because the self-intersections are internal to a single feature's own
    arcs (e.g. a mainland arc crossing a small inlet/island arc of the same town), not at the
    shared border with a neighbor -- so re-deriving the topology from the repaired shapes
    (no further toposimplify needed, they're already at final precision) keeps adjacent
    towns glued together. See CLAUDE.md for the underlying rationale.

    The re-derive step still quantizes (at a much finer 1e6 grid than the default 1e4) --
    skipping quantization entirely balloons the file ~3x (measured: 82KB->258KB for the
    boundaries, 32KB->113KB for the outline) for no validity benefit; 1e6 was the finest
    default-adjacent setting that stayed at 0 invalid geometries in testing, while 1e4/1e5
    reintroduced 2 of the same self-intersections."""
    topo = tp.Topology(gdf, prequantize=True, toposimplify=toposimplify, object_name=object_name)
    repaired = topo.to_gdf()
    repaired["geometry"] = repaired.geometry.apply(repair_invalid)
    return tp.Topology(repaired, prequantize=1e6, toposimplify=False, object_name=object_name)


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
    topo = simplify_and_repair(for_topo, SIMPLIFY_TOLERANCE, "municipalities")
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
    town_union = unary_union(topo.to_gdf().geometry.values)
    town_union = repair_invalid(town_union)
    outline_topo = as_topology(town_union, "outline")
    outline_out = os.path.join(ASSETS, "mapc-region-outline.topojson")
    with open(outline_out, "w") as f:
        f.write(outline_topo.to_json())
    print(f"Wrote {outline_out} ({os.path.getsize(outline_out) / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
