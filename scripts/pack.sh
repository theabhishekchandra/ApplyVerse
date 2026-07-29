#!/usr/bin/env bash
# Build a CHROME WEB STORE upload zip from extension/ — a FLAT archive of the
# runtime files (what the store expects).
#   Usage: ./scripts/pack.sh   → dist/applyverse-<version>-webstore.zip
#
# For the FRIEND / sideload zip instead (wrapped in an applyverse/ folder for
# "Load unpacked"), use  extension/scripts/pack.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/extension"
DIST="$ROOT/dist"
VERSION="$(node -e "process.stdout.write(require('$SRC/manifest.json').version)")"
OUT="$DIST/applyverse-$VERSION-webstore.zip"

mkdir -p "$DIST"
rm -f "$OUT"

cd "$SRC"
# Include only what the extension needs at runtime; drop dev/OS cruft.
zip -r -X "$OUT" . \
  -x "*.DS_Store" \
  -x "*/.*" \
  -x "scratchpad/*" \
  -x "tests/*" \
  -x "scripts/*" \
  -x "dist/*" \
  -x "*.zip" \
  -x "README.md" \
  -x "INSTALL.md"

echo "Built $OUT"
echo "Contents:"
unzip -l "$OUT" | tail -n +4 | awk '{print "  "$4}' | sed '/^\s*$/d'
