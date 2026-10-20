#!/usr/bin/env bash
# Builds the Pare 3D downloads from the static export (run `node scripts/build-static-export.mjs` first):
#   dist/Pare-3D-Mac.zip       Pare 3D.app for Apple silicon and Intel Macs
#   dist/Pare-3D-Windows.zip   a folder with "Pare 3D.vbs" for Windows 10/11 (64-bit)
#   dist/Pare-3D-app.tar.gz    just the app files, which installed copies update themselves from
#   dist/pare3d-update.json    the build number and checksum of that package
# The JavaScript runtime (Bun) comes from npm, so nothing else needs installing.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXPORT="$ROOT/apps/web/.next-export"
BUN_VERSION="${BUN_VERSION:-1.4.3}"
OUT="$ROOT/dist"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
[ -f "$EXPORT/index.html" ] || { echo "No static export in $EXPORT"; exit 1; }
BUILD="${PARE_BUILD:-$(tr -dc '0-9' < "$ROOT/PARE_BUILD" 2>/dev/null || true)}"
BUILD="${BUILD:-0}"
# Raise together with RUNTIME_VERSION in mac/serve.mjs when app files need a newer launcher.
MIN_RUNTIME="${MIN_RUNTIME:-1}"

fetch_bun() { # package name -> path of its extracted folder
  local pkg="$1"
  (cd "$WORK" && npm pack --silent "@oven/$pkg@$BUN_VERSION" >/dev/null)
  mkdir -p "$WORK/$pkg" && tar -xzf "$WORK"/oven-"$pkg"-"$BUN_VERSION".tgz -C "$WORK/$pkg"
  echo "$WORK/$pkg/package/bin"
}
copy_app() { # destination
  cp -R "$EXPORT" "$1"
  rm -f "$1/store.php" "$1/sitemap.xml" "$1/robots.txt"
  echo "$BUILD" > "$1/pare-build.txt"
}

rm -rf "$OUT" && mkdir -p "$OUT"

# Mac
APP="$WORK/mac/Pare 3D.app/Contents"
mkdir -p "$APP/MacOS" "$APP/Resources"
cp "$ROOT/mac/Info.plist" "$APP/"
cp "$ROOT/mac/Pare3D" "$APP/MacOS/" && chmod +x "$APP/MacOS/Pare3D"
cp "$ROOT/mac/serve.mjs" "$ROOT/mac/AppIcon.icns" "$ROOT/mac/NOTICE.txt" "$APP/Resources/"
cp "$ROOT/LICENSE" "$APP/Resources/LICENSE.txt"
cp "$(fetch_bun bun-darwin-aarch64)/bun" "$APP/Resources/bun-arm64"
cp "$(fetch_bun bun-darwin-x64)/bun" "$APP/Resources/bun-x64"
chmod +x "$APP/Resources/bun-arm64" "$APP/Resources/bun-x64"
copy_app "$APP/Resources/app"
(cd "$WORK/mac" && zip -qry -9 "$OUT/Pare-3D-Mac.zip" "Pare 3D.app")

# Windows
WIN="$WORK/win/Pare 3D"
mkdir -p "$WIN"
cp "$ROOT/mac/serve.mjs" "$ROOT/mac/launch.mjs" "$ROOT/mac/Pare 3D.vbs" "$ROOT/mac/NOTICE.txt" "$WIN/"
cp "$ROOT/mac/READ ME FIRST.txt" "$WIN/"
cp "$ROOT/LICENSE" "$WIN/LICENSE.txt"
cp "$(fetch_bun bun-windows-x64)/bun.exe" "$WIN/"
copy_app "$WIN/app"
(cd "$WORK/win" && zip -qr -9 "$OUT/Pare-3D-Windows.zip" "Pare 3D")

# Update package: the app folder's contents at the top of the archive.
copy_app "$WORK/update"
tar -czf "$OUT/Pare-3D-app.tar.gz" -C "$WORK/update" .
SHA=$(sha256sum "$OUT/Pare-3D-app.tar.gz" | cut -d' ' -f1)
VERSION=$(node -p "require('$ROOT/package.json').version")
printf '{"build":%s,"version":"%s","minRuntime":%s,"sha256":"%s"}\n' "$BUILD" "$VERSION" "$MIN_RUNTIME" "$SHA" > "$OUT/pare3d-update.json"
cat "$OUT/pare3d-update.json"

ls -lh "$OUT"
