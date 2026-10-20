#!/usr/bin/env python3
# SPDX-License-Identifier: EUPL-1.2
"""
Ενημερώνει τις εκδόσεις (?v=...) στις σελίδες του public/ με βάση το περιεχόμενο των αρχείων.
Τρέξτε το μετά από κάθε αλλαγή σε app.js, geocoder.js, styles.css ή data/athens-data.js,
ώστε οι browsers των πολιτών να φορτώσουν αμέσως τη νέα έκδοση.

Χρήση: python3 scripts/bump_versions.py
"""
import hashlib, re
from pathlib import Path

PUB = Path(__file__).resolve().parent.parent / "public"
PAGES = ["index.html", "sources.html"]
FILES = ["styles.css", "data/athens-data.js", "geocoder.js", "app.js"]

versions = {f: hashlib.sha1((PUB / f).read_bytes()).hexdigest()[:8] for f in FILES}
for page in PAGES:
    html = (PUB / page).read_text(encoding="utf-8")
    found = []
    for f, v in versions.items():
        html, n = re.subn(r'(href|src)="' + re.escape(f) + r'(\?v=[0-9a-f]+)?"', lambda m: f'{m.group(1)}="{f}?v={v}"', html)
        if n:
            found.append(f"{f}?v={v}")
    (PUB / page).write_text(html, encoding="utf-8")
    print(f"{page}: " + (", ".join(found) or "χωρίς αρχεία με έκδοση"))
