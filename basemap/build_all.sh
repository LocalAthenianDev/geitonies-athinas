#!/usr/bin/env bash
# SPDX-License-Identifier: EUPL-1.2
# Ξαναφτιάχνει υπόβαθρο, ευρετήριο διευθύνσεων και glyphs από νέο αρχείο OpenStreetMap.
#
# Απαιτήσεις: Java 21+, Python 3.10+ (pip install -r scripts/requirements.txt)
# Χρήση:      ./basemap/build_all.sh /διαδρομή/greece-latest.osm.pbf
set -euo pipefail
cd "$(dirname "$0")/.."
PBF="${1:?Δώστε τη διαδρομή του greece-latest.osm.pbf (https://download.geofabrik.de/europe/greece.html)}"
PLANETILER_VERSION=v0.9.3
JAR="basemap/build/planetiler-${PLANETILER_VERSION}.jar"
mkdir -p basemap/build public/tiles

if [ ! -f "$JAR" ]; then
  echo "→ Λήψη Planetiler ${PLANETILER_VERSION} (Apache-2.0)"
  curl -fsSL -o "$JAR" "https://github.com/onthegomap/planetiler/releases/download/${PLANETILER_VERSION}/planetiler.jar"
fi

echo "→ 1/4 Όρια κοινοτήτων, συνοικιών, γειτονιών"
python3 scripts/build_data.py

echo "→ 2/4 Υπόβαθρο (vector tiles)"
java -Xmx4g -jar "$JAR" generate-custom --schema=basemap/athens-basemap.yml --osm_path="$PBF" \
  --bounds=23.655,37.932,23.815,38.048 --minzoom=11 --maxzoom=15 \
  --output=public/tiles/athens.pmtiles --force --download=false --tmpdir=basemap/build/tmp

echo "→ 3/4 Ευρετήριο διευθύνσεων"
python3 basemap/extract_osm_addresses.py "$PBF"
python3 basemap/build_geocoder.py

echo "→ 4/4 Γραμματοσειρές χάρτη (glyphs)"
python3 basemap/build_glyphs.py

echo "OK"
