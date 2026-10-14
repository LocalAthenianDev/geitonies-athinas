#!/usr/bin/env python3
# SPDX-License-Identifier: EUPL-1.2
"""
Ενημερώνει τις εκδόσεις (?v=...) στο public/index.html με βάση το περιεχόμενο των αρχείων.
Τρέξτε το μετά από κάθε αλλαγή σε app.js, geocoder.js, styles.css ή data/athens-data.js,
ώστε οι browsers των πολιτών να φορτώσουν αμέσως τη νέα έκδοση.

Χρήση: python3 scripts/bump_versions.py
"""
import hashlib, re
from pathlib import Path

PUB = Path(__file__).resolve().parent.parent / "public"
FILES = ["styles.css", "data/athens-data.js", "geocoder.js", "app.js"]

html = (PUB / "index.html").read_text(encoding="utf-8")
for f in FILES:
    v = hashlib.sha1((PUB / f).read_bytes()).hexdigest()[:8]
    html, n = re.subn(r'(href|src)="' + re.escape(f) + r'(\?v=[0-9a-f]+)?"', lambda m: f'{m.group(1)}="{f}?v={v}"', html)
    print(f"{f}: v={v}" + ("" if n else "  (δεν βρέθηκε στο index.html)"))
(PUB / "index.html").write_text(html, encoding="utf-8")
