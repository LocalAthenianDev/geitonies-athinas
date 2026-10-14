#!/usr/bin/env python3
# SPDX-License-Identifier: EUPL-1.2
"""
Φτιάχνει τα glyph PBF (signed distance fields) που χρειάζεται το MapLibre για τις
ετικέτες του χάρτη, από τις ίδιες ανοιχτές γραμματοσειρές της εφαρμογής (Commissioner, OFL).
Έτσι οι ονομασίες δρόμων εμφανίζονται στα ελληνικά χωρίς καμία κλήση σε τρίτο server.

Χρήση: python3 basemap/build_glyphs.py
Έξοδος: public/glyphs/<Fontstack>/<start>-<end>.pbf
"""
import io
from pathlib import Path

import freetype
import numpy as np
from fontTools.ttLib import TTFont
from scipy.ndimage import distance_transform_edt

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "public" / "fonts"
OUT = ROOT / "public" / "glyphs"

SIZE, BUFFER, RADIUS, CUTOFF, OVERSAMPLE = 24, 3, 8, 0.25, 4
STACKS = {
    "Commissioner-Regular": ["commissioner-greek-400-normal.woff2", "commissioner-latin-400-normal.woff2"],
    "Commissioner-SemiBold": ["commissioner-greek-600-normal.woff2", "commissioner-latin-600-normal.woff2"],
}


# ---------- ελάχιστος protobuf encoder ----------
def varint(n):
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def zigzag(n):
    return (n << 1) ^ (n >> 63)


def field(num, wire, payload):
    key = varint((num << 3) | wire)
    if wire == 0:
        return key + varint(payload)
    return key + varint(len(payload)) + payload


def glyph_msg(g):
    m = field(1, 0, g["id"])
    if g["bitmap"]:
        m += field(2, 2, g["bitmap"])
    m += field(3, 0, g["width"]) + field(4, 0, g["height"])
    m += field(5, 0, zigzag(g["left"])) + field(6, 0, zigzag(g["top"])) + field(7, 0, g["advance"])
    return m


def range_pbf(name, start, end, glyphs):
    fs = field(1, 2, name.encode()) + field(2, 2, f"{start}-{end}".encode())
    for g in glyphs:
        fs += field(3, 2, glyph_msg(g))
    return field(1, 2, fs)


# ---------- απόδοση SDF ----------
def load_faces(files):
    faces = []
    for fn in files:
        tt = TTFont(str(FONTS / fn))
        tt.flavor = None
        buf = io.BytesIO()
        tt.save(buf)
        face = freetype.Face(io.BytesIO(buf.getvalue()))
        face.set_char_size(SIZE * OVERSAMPLE * 64)
        faces.append(face)
    return faces


def render(face, cp, ascender):
    face.load_char(chr(cp), freetype.FT_LOAD_RENDER | freetype.FT_LOAD_NO_HINTING)
    s = face.glyph
    advance = int(round(s.advance.x / 64 / OVERSAMPLE))
    bm = s.bitmap
    if bm.width == 0 or bm.rows == 0:
        return dict(id=cp, bitmap=b"", width=0, height=0, left=0, top=-ascender, advance=advance)
    hi = np.array(bm.buffer, dtype=np.uint8).reshape(bm.rows, bm.pitch)[:, : bm.width]
    L, T = s.bitmap_left, s.bitmap_top                      # σε pixels υψηλής ανάλυσης
    left = int(np.floor(L / OVERSAMPLE))
    top = int(np.ceil(T / OVERSAMPLE))
    right = int(np.ceil((L + bm.width) / OVERSAMPLE))
    bottom = int(np.floor((T - bm.rows) / OVERSAMPLE))
    w, h = right - left, top - bottom
    W, H = w + 2 * BUFFER, h + 2 * BUFFER
    canvas = np.zeros((H * OVERSAMPLE, W * OVERSAMPLE), dtype=np.uint8)
    ox = (BUFFER - left) * OVERSAMPLE + L
    oy = (BUFFER + top) * OVERSAMPLE - T
    canvas[oy:oy + bm.rows, ox:ox + bm.width] = hi
    inside = canvas > 127
    d = (distance_transform_edt(~inside) - distance_transform_edt(inside)) / OVERSAMPLE
    d = d.reshape(H, OVERSAMPLE, W, OVERSAMPLE).mean(axis=(1, 3))
    sdf = np.clip(np.round(255 - 255 * (d / RADIUS + CUTOFF)), 0, 255).astype(np.uint8)
    return dict(id=cp, bitmap=sdf.tobytes(), width=w, height=h, left=left, top=top - ascender, advance=advance)


def main():
    for name, files in STACKS.items():
        faces = load_faces(files)
        ascender = int(round(faces[0].size.ascender / 64 / OVERSAMPLE))
        cmap = {}
        for f in reversed(faces):                            # η πρώτη γραμματοσειρά έχει προτεραιότητα
            for cp, _ in f.get_chars():
                cmap[cp] = f
        d = OUT / name
        d.mkdir(parents=True, exist_ok=True)
        ranges = sorted({cp // 256 for cp in cmap})
        for r in ranges:
            start, end = r * 256, r * 256 + 255
            glyphs = [render(cmap[cp], cp, ascender) for cp in range(start, end + 1) if cp in cmap]
            (d / f"{start}-{end}.pbf").write_bytes(range_pbf(name, start, end, glyphs))
        print(f"{name}: {len(cmap)} χαρακτήρες σε {len(ranges)} ranges")


if __name__ == "__main__":
    main()
