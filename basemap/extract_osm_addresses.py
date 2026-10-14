#!/usr/bin/env python3
# SPDX-License-Identifier: EUPL-1.2
"""
Εξάγει από το αρχείο OpenStreetMap της Ελλάδας (.osm.pbf) τις διευθύνσεις και τους
δρόμους που βρίσκονται μέσα στον Δήμο Αθηναίων (με μικρό περιθώριο).

Χρήση:  python3 basemap/extract_osm_addresses.py /διαδρομή/greece-latest.osm.pbf
Έξοδος: basemap/build/osm_addresses.json   (ενδιάμεσο αρχείο για το build_geocoder.py)
"""
import json, sys
from pathlib import Path

import osmium

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "basemap" / "build" / "osm_addresses.json"
W, S_, E, N = 23.665, 37.940, 23.805, 38.042        # όρια Δήμου + ~500 m

ROAD = {"motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
        "living_street", "pedestrian", "service", "footway", "steps", "path", "cycleway",
        "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link"}
NAME_KEYS = ("name", "name:el", "alt_name", "old_name", "official_name", "name:en", "short_name")


def inside(lon, lat):
    return W <= lon <= E and S_ <= lat <= N


class H(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.addr, self.streets = [], []

    def _addr(self, tags, lon, lat):
        st, hn = tags.get("addr:street"), tags.get("addr:housenumber")
        if st and hn and inside(lon, lat):
            self.addr.append({"street": st, "number": hn, "postcode": tags.get("addr:postcode", ""),
                              "lon": round(lon, 6), "lat": round(lat, 6)})

    def node(self, n):
        if "addr:housenumber" in n.tags and n.location.valid():
            self._addr(n.tags, n.location.lon, n.location.lat)

    def way(self, w):
        t = w.tags
        coords = [(nd.lon, nd.lat) for nd in w.nodes if nd.location.valid()]
        if not coords:
            return
        if "addr:housenumber" in t and w.is_closed() and len(coords) > 2:
            lon = sum(c[0] for c in coords[:-1]) / (len(coords) - 1)
            lat = sum(c[1] for c in coords[:-1]) / (len(coords) - 1)
            self._addr(t, lon, lat)
        hw = t.get("highway")
        if (hw in ROAD or t.get("place") == "square") and "name" in t:
            if any(inside(lon, lat) for lon, lat in coords):
                names = list(dict.fromkeys(t[k] for k in NAME_KEYS if k in t))
                self.streets.append({"names": names, "kind": hw or "square",
                                     "coords": [[round(x, 6), round(y, 6)] for x, y in coords]})


def main():
    if len(sys.argv) < 2:
        sys.exit("Δώστε τη διαδρομή του .osm.pbf")
    h = H()
    h.apply_file(sys.argv[1], locations=True, idx="flex_mem")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"addresses": h.addr, "streets": h.streets}, ensure_ascii=False), encoding="utf-8")
    print(f"OK → {OUT.relative_to(ROOT)}: {len(h.addr)} διευθύνσεις, {len(h.streets)} τμήματα δρόμων")


if __name__ == "__main__":
    main()
