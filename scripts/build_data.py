#!/usr/bin/env python3
# SPDX-License-Identifier: EUPL-1.2
"""
Παράγει το public/data/athens-data.js από τα αρχεία του Δήμου Αθηναίων (data-source/).

Βήματα:
  1. διαβάζει κοινότητες, συνοικίες, γειτονιές (ΕΓΣΑ87 / EPSG:2100),
  2. ελέγχει εγκυρότητα, κενά, επικαλύψεις και εμφώλευση,
  3. συνδέει γειτονιά → συνοικία → κοινότητα γεωμετρικά (όχι από τα πεδία κειμένου),
  4. φτιάχνει εσωτερικά περιγράμματα (inset) για τα ομόκεντρα όρια,
  5. μετατρέπει σε WGS84 και γράφει ένα συμπαγές JavaScript αρχείο.

Χρήση:  pip install -r scripts/requirements.txt
        python3 scripts/build_data.py
"""
import json, sys, warnings
from pathlib import Path

import numpy as np
from pyproj import Transformer
from shapely import transform as shp_transform
from shapely.geometry import MultiPolygon, shape
from shapely.ops import unary_union

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / "data-source", ROOT / "public" / "data" / "athens-data.js"

INSET_SYNOIKIA = 11   # μέτρα
INSET_GEITONIA = 22   # μέτρα
SIMPLIFY = 1.2        # μέτρα

T = Transformer.from_crs(2100, 4326, always_xy=True)


def load(name):
    text = (SRC / name).read_text(encoding="utf-8")
    start = text.find('"FeatureCollection"')
    start = text.rfind("{", 0, start) if start > 0 else 0   # αγνοεί τυχόν «σκουπίδια» πριν το FeatureCollection
    if start > 0:
        print(f"  προσοχή: {name} είχε {start} χαρακτήρες πριν το FeatureCollection, αγνοήθηκαν")
    return json.loads(text[start:])["features"]


def to_ll(g):
    return shp_transform(g, lambda a: np.column_stack(T.transform(a[:, 0], a[:, 1])))


def rings(g):
    g = to_ll(g.simplify(SIMPLIFY, preserve_topology=True))
    parts = g.geoms if isinstance(g, MultiPolygon) else [g]
    return [[[round(x, 5), round(y, 5)] for x, y in p.exterior.coords] for p in parts if not p.is_empty]


def inset(g, d):
    """Εσωτερικό περίγραμμα. Σε στενές περιοχές μικραίνει το inset ώστε να μη χαθεί η περιοχή."""
    for dd in (d, d / 2, d / 4):
        b = g.buffer(-dd, join_style=2, mitre_limit=3)
        if not b.is_empty and b.area > 0.25 * g.area:
            return b
    return g


def parent(g, candidates):
    return max(candidates, key=lambda c: g.intersection(c[1]).area)


def main():
    K, S, G = load("koinotites.geojson"), load("synoikies.geojson"), load("geitonies.geojson")
    kg = [(f"k{f['properties']['no']}", shape(f["geometry"]), f["properties"]) for f in K]
    sg = [(f"s{f['properties']['qid']}", shape(f["geometry"]), f["properties"]) for f in S]
    gg = [(f"g{f['properties']['id']}", shape(f["geometry"]), f["properties"]) for f in G]

    # ---------- έλεγχοι ----------
    bad = [i for i, g, _ in kg + sg + gg if not g.is_valid]
    dimos = unary_union([g for _, g, _ in kg])
    for label, layer in (("συνοικίες", sg), ("γειτονιές", gg)):
        u = unary_union([g for _, g, _ in layer])
        gap, out = dimos.difference(u).area, u.difference(dimos).area
        print(f"  {label}: κενά {gap:.1f} m², εκτός ορίων {out:.1f} m²")
    nest_issues = 0
    for i, g, _ in sg:
        if g.intersection(parent(g, kg)[1]).area / g.area < 0.999: nest_issues += 1
    for i, g, _ in gg:
        if g.intersection(parent(g, sg)[1]).area / g.area < 0.999: nest_issues += 1
    print(f"  άκυρες γεωμετρίες: {len(bad)}, προβλήματα εμφώλευσης: {nest_issues}")
    if bad or nest_issues:
        sys.exit("Σφάλμα: διορθώστε τα δεδομένα πριν συνεχίσετε.")

    # ---------- έξοδος ----------
    out = {"k": [], "s": [], "g": []}
    for i, g, p in sorted(kg, key=lambda t: t[2]["no"]):
        c = to_ll(g.representative_point()).coords[0]
        out["k"].append({"id": i, "n": p["name"].replace(" ΔΚ", " Δημοτική Κοινότητα"), "r": rings(g),
                         "a": round(g.area / 1e6, 2), "c": [round(c[0], 5), round(c[1], 5)]})
    for i, g, p in sg:
        out["s"].append({"id": i, "n": p["name"], "k": parent(g, kg)[0], "pl": p["synoik_the"] == 0,
                         "r": rings(inset(g, INSET_SYNOIKIA)), "a": round(g.area / 1e6, 2)})
    fixes = []
    for i, g, p in sorted(gg, key=lambda t: t[2]["id"]):
        place = p["geitonia"] == "--"
        s_id, s_geom, s_p = parent(g, sg)
        if p["synoikia"] not in ("--", s_p["name"]):
            fixes.append(f"{p['geitonia']}: «{p['synoikia']}» → «{s_p['name']}»")
        out["g"].append({"id": i, "n": p["name_place"] if place else p["geitonia"], "s": s_id,
                         "k": parent(g, kg)[0], "pl": place, "r": rings(inset(g, INSET_GEITONIA)),
                         "f": rings(g), "a": round(g.area / 1e6, 3)})
    for f in fixes:
        print("  διόρθωση συνοικίας:", f)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("window.ATHENS=" + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";", encoding="utf-8")
    print(f"OK → {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB): "
          f"{len(out['k'])} κοινότητες, {len(out['s'])} συνοικίες, {len(out['g'])} γειτονιές")


if __name__ == "__main__":
    main()
