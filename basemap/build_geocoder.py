#!/usr/bin/env python3
# SPDX-License-Identifier: EUPL-1.2
"""
Φτιάχνει το ευρετήριο διευθύνσεων που χρησιμοποιεί η εφαρμογή για την εύρεση διεύθυνσης.
Η αναζήτηση γίνεται εξ ολοκλήρου μέσα στον browser του πολίτη: η διεύθυνση δεν στέλνεται πουθενά.

Είσοδος:  basemap/build/osm_addresses.json  (από το extract_osm_addresses.py)
          public/data/athens-data.js        (όρια γειτονιών, για να ξεχωρίζουν ομώνυμοι δρόμοι)
Έξοδος:   public/data/addresses.json

Μορφή εξόδου (συμπαγής):
  { "o":[lon0,lat0], "q":100000,
    "s":[ [ "Εμφανιζόμενο όνομα", "κανονικοποιημένα|ονόματα", "latin|μεταγραφή", "Γειτονιά", x, y,
            [ "αριθμός", x, y, "αριθμός", x, y, ... ] ], ... ] }
  όπου x = round((lon-lon0)*q), y = round((lat-lat0)*q).
"""
import json, math, re, unicodedata
from collections import defaultdict
from pathlib import Path

from shapely.geometry import LineString, MultiLineString, Point, Polygon
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "basemap" / "build" / "osm_addresses.json"
DATA = ROOT / "public" / "data" / "athens-data.js"
OUT = ROOT / "public" / "data" / "addresses.json"
LON0, LAT0, Q = 23.6, 37.9, 100000
CLUSTER_GAP_M = 350          # τμήματα ομώνυμων δρόμων πιο μακριά από αυτό = διαφορετικοί δρόμοι

TR = {"α": "a", "β": "v", "γ": "g", "δ": "d", "ε": "e", "ζ": "z", "η": "i", "θ": "th", "ι": "i", "κ": "k",
      "λ": "l", "μ": "m", "ν": "n", "ξ": "x", "ο": "o", "π": "p", "ρ": "r", "σ": "s", "τ": "t", "υ": "i",
      "φ": "f", "χ": "ch", "ψ": "ps", "ω": "o"}


def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").replace("ς", "σ")
    s = re.sub(r"[^0-9a-zα-ω]+", " ", s)
    return " ".join(s.split())


def latin(s):
    s = norm(s).replace("ου", "ou")
    s = "".join(TR.get(c, c) for c in s)
    return canon_latin(s)


def canon_latin(s):
    """Κοινή μορφή για greeklish: w→o, y→i, ou→u, διπλά γράμματα → ένα."""
    s = s.replace("w", "o").replace("y", "i").replace("ou", "u").replace("h", "")
    s = re.sub("ei|oi", "i", s).replace("ai", "e").replace("mp", "b").replace("nt", "d")
    s = re.sub("g[kg]", "g", s)
    return re.sub(r"(.)\1+", r"\1", s)


def meters(a, b):
    return math.hypot((a[0] - b[0]) * 88000, (a[1] - b[1]) * 111000)


def enc(lon, lat):
    return round((lon - LON0) * Q), round((lat - LAT0) * Q)


def main():
    src = json.loads(SRC.read_text(encoding="utf-8"))
    D = json.loads(DATA.read_text(encoding="utf-8")[len("window.ATHENS="):-1])
    gpolys, gnames = [], []
    for g in D["g"]:
        for r in g["f"]:
            gpolys.append(Polygon(r)); gnames.append(g["n"])
    tree = STRtree(gpolys)

    def geitonia(lon, lat):
        p = Point(lon, lat)
        for i in tree.query(p):
            if gpolys[i].contains(p):
                return gnames[i]
        return ""

    # ---------- δρόμοι: ομαδοποίηση τμημάτων ανά όνομα και γειτνίαση ----------
    by_name = defaultdict(list)
    alt = defaultdict(set)
    for s in src["streets"]:
        key = norm(s["names"][0])
        if not key:
            continue
        by_name[key].append((s["names"][0], LineString(s["coords"]) if len(s["coords"]) > 1 else Point(s["coords"][0])))
        alt[key].update(s["names"])

    clusters = []            # (key, display, geom)
    for key, segs in by_name.items():
        groups = []
        for disp, geom in segs:
            hit = [g for g in groups if g["geom"].distance(geom) * 100000 < CLUSTER_GAP_M]
            merged = unary_union([geom] + [g["geom"] for g in hit])
            groups = [g for g in groups if g not in hit] + [{"geom": merged, "disp": disp}]
        for g in groups:
            clusters.append({"key": key, "disp": g["disp"], "geom": g["geom"], "addr": {}})

    ckey = defaultdict(list)
    for c in clusters:
        ckey[c["key"]].append(c)

    # ---------- διευθύνσεις → πλησιέστερο ομώνυμο τμήμα ----------
    lat2key = {}
    for key, names in alt.items():
        for n in names:
            if re.search("[α-ωΑ-Ω]", n):
                lat2key.setdefault(latin(n), key)

    orphan = 0
    for a in src["addresses"]:
        key = norm(a["street"])
        if not re.search("[α-ω]", key):                     # οδός γραμμένη με λατινικούς: αντιστοίχιση με την ελληνική
            key = lat2key.get(canon_latin(key), key)
        cands = ckey.get(key)
        p = Point(a["lon"], a["lat"])
        if not cands:
            c = {"key": key, "disp": a["street"], "geom": p, "addr": {}}
            clusters.append(c); ckey[key].append(c); cands = [c]; orphan += 1
            alt[key].add(a["street"])
        best = min(cands, key=lambda c: c["geom"].distance(p))
        if best["geom"].distance(p) * 100000 > 600:            # μακριά από κάθε γνωστό τμήμα: νέα ομάδα
            best = {"key": key, "disp": a["street"], "geom": p, "addr": {}}
            clusters.append(best); ckey[key].append(best)
        num = a["number"].strip()
        best["addr"].setdefault(num, (a["lon"], a["lat"]))

    # ---------- έξοδος ----------
    out = []
    for c in clusters:
        g = c["geom"]
        mid = g.interpolate(0.5, normalized=True) if isinstance(g, (LineString, MultiLineString)) else g.centroid
        label = geitonia(mid.x, mid.y)
        if not label:                                          # το μέσο είναι εκτός Δήμου: κρατάμε μόνο αν έχει διευθύνσεις μέσα
            inner = [geitonia(*ll) for ll in c["addr"].values()]
            inner = [x for x in inner if x]
            if not inner:
                continue
            label = max(set(inner), key=inner.count)
            c["addr"] = {k: v for k, v in c["addr"].items() if geitonia(*v)}
            pts = list(c["addr"].values())
            mid = Point(sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
        names = sorted(alt[c["key"]], key=len)
        norms = "|".join(dict.fromkeys(norm(n) for n in names if re.search("[α-ωΑ-Ω]", n)))
        lats = "|".join(dict.fromkeys([latin(n) for n in names if re.search("[α-ωΑ-Ω]", n)] +
                                      [canon_latin(norm(n)) for n in names if not re.search("[α-ωΑ-Ω]", n)]))
        x, y = enc(mid.x, mid.y)
        nums = []
        def numkey(n):
            m = re.match(r"\d+", n)
            return (int(m.group()) if m else 99999, n)
        for n in sorted(c["addr"], key=numkey):
            ax, ay = enc(*c["addr"][n])
            nums += [n, ax, ay]
        out.append([c["disp"], norms, lats, label, x, y, nums])

    OUT.write_text(json.dumps({"o": [LON0, LAT0], "q": Q, "s": out}, ensure_ascii=False, separators=(",", ":")),
                   encoding="utf-8")
    n_addr = sum(len(s[6]) // 3 for s in out)
    print(f"OK → {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB): {len(out)} δρόμοι/τμήματα, "
          f"{n_addr} διευθύνσεις ({orphan} διευθύνσεις σε δρόμους χωρίς γεωμετρία)")


if __name__ == "__main__":
    main()
