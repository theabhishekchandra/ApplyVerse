#!/usr/bin/env bash
# Package the ApplyVerse extension into a clean, shareable .zip.
#
# Produces  dist/applyverse-<version>.zip  containing ONLY the files Chrome
# needs at runtime — no README/docs/scripts, no .git, no OS junk. Your friends
# unzip it and load the folder via chrome://extensions -> "Load unpacked".
# (A packed .crx is intentionally NOT produced: Chrome blocks installing .crx
#  files that don't come from the Web Store, so unpacked is the only path that
#  works for a small group.)
#
# Usage:  bash scripts/pack.sh
set -euo pipefail

# repo/extension root = parent of this script's dir
EXT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$EXT_DIR"

VERSION="$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' manifest.json | head -1 | sed -E 's/.*"([0-9.]+)".*/\1/')"
[ -n "$VERSION" ] || { echo "✗ could not read version from manifest.json"; exit 1; }

# Runtime files only. Add new source files here as the extension grows.
FILES=(
  manifest.json
  ats.js background.js dorks.js filters.js options.js popup.js rank.js results.js sites.js store.js tour.js
  dorks.css options.css popup.css results.css tour.css
  dorks.html options.html popup.html results.html
  icons
)

# Fail early if anything referenced is missing.
for f in "${FILES[@]}"; do
  [ -e "$f" ] || { echo "✗ missing runtime file: $f"; exit 1; }
done

# ...and fail just as early if a file the extension actually LOADS was never
# added to FILES above. A hand-maintained list silently ships a broken zip the
# first time someone adds a source file and forgets this one — the runtime error
# only shows up on a user's machine, so catch it at build time instead.
MISSING=""
for asset in $(grep -ho -E '(src|href)="[^"]+\.(js|css)"' ./*.html | sed -E 's/.*"(.*)"/\1/' | sort -u); do
  case " ${FILES[*]} " in
    *" $asset "*) ;;
    *) MISSING="$MISSING $asset" ;;
  esac
done
# The service worker's importScripts() is not in any HTML — check it too.
for asset in $(grep -o -E 'importScripts\([^)]*\)' background.js | grep -o -E '[A-Za-z0-9_.-]+\.js'); do
  case " ${FILES[*]} " in
    *" $asset "*) ;;
    *) MISSING="$MISSING $asset" ;;
  esac
done
[ -z "$MISSING" ] || { echo "✗ loaded at runtime but not in pack.sh FILES:$MISSING"; exit 1; }

# Validate manifest is parseable JSON (node if available, else python3).
if command -v node >/dev/null 2>&1; then
  node -e 'JSON.parse(require("fs").readFileSync("manifest.json","utf8"))' \
    || { echo "✗ manifest.json is not valid JSON"; exit 1; }
elif command -v python3 >/dev/null 2>&1; then
  python3 -c 'import json,sys; json.load(open("manifest.json"))' \
    || { echo "✗ manifest.json is not valid JSON"; exit 1; }
fi

mkdir -p dist
OUT="$EXT_DIR/dist/applyverse-${VERSION}.zip"
rm -f "$OUT"

# Stage into a "applyverse/" folder so unzipping ALWAYS yields one clean folder
# to point "Load unpacked" at — regardless of which unzip tool the friend uses.
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/applyverse"
cp -R "${FILES[@]}" "$STAGE/applyverse/"
find "$STAGE" -name '.DS_Store' -delete

( cd "$STAGE" && zip -r -X "$OUT" applyverse >/dev/null )

echo "✓ built $OUT"
echo "  version $VERSION · $(du -h "$OUT" | cut -f1) · $(unzip -l "$OUT" | tail -1 | awk '{print $2}') files"
echo
echo "Share $OUT + INSTALL.md with your group."
