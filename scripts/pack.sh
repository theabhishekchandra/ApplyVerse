#!/usr/bin/env bash
# Build a Chrome Web Store upload zip from extension/ — only runtime files.
# Usage: ./scripts/pack.sh   → dist/job-finder-<version>.zip
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/extension"
DIST="$ROOT/dist"
VERSION="$(node -e "process.stdout.write(require('$SRC/manifest.json').version)")"
OUT="$DIST/job-finder-$VERSION.zip"

mkdir -p "$DIST"
rm -f "$OUT"

cd "$SRC"
# Include only what the extension needs at runtime; drop dev/OS cruft.
zip -r -X "$OUT" . \
  -x "*.DS_Store" \
  -x "*/.*" \
  -x "scratchpad/*" \
  -x "*.zip"

echo "Built $OUT"
echo "Contents:"
unzip -l "$OUT" | tail -n +4 | awk '{print "  "$4}' | sed '/^\s*$/d'
