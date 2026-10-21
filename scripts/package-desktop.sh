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

# Mac. On a Mac the native window (mac/native/main.swift) is compiled for Apple silicon and Intel;
# elsewhere the script launcher (mac/Pare3D), which opens the app in Chrome or Edge, stands in.
VERSION=$(node -p "require('$ROOT/package.json').version")
APP="$WORK/mac/Pare 3D.app/Contents"
mkdir -p "$APP/MacOS" "$APP/Resources"
NATIVE=0
if [ "$(uname -s)" = "Darwin" ] && command -v swiftc >/dev/null 2>&1; then
  NATIVE=1
  for arch in arm64 x86_64; do
    if ! swiftc -O -target "$arch-apple-macos12" "$ROOT/mac/native/main.swift" -o "$WORK/pare3d-$arch" > "$WORK/swift-$arch.log" 2>&1; then
      # As annotations, so the failure is readable on GitHub.
      sed 's/^/::error::/' "$WORK/swift-$arch.log" | head -60
      exit 1
    fi
  done
  lipo -create "$WORK/pare3d-arm64" "$WORK/pare3d-x86_64" -output "$APP/MacOS/Pare 3D"
  sed -e "s/__BUILD__/$BUILD/" -e "s/__VERSION__/$VERSION/" "$ROOT/mac/native/Info.plist" > "$APP/Info.plist"
else
  cp "$ROOT/mac/Info.plist" "$APP/"
  cp "$ROOT/mac/Pare3D" "$APP/MacOS/" && chmod +x "$APP/MacOS/Pare3D"
fi
cp "$ROOT/mac/serve.mjs" "$ROOT/mac/AppIcon.icns" "$ROOT/mac/NOTICE.txt" "$APP/Resources/"
cp "$ROOT/LICENSE" "$APP/Resources/LICENSE.txt"
cp "$(fetch_bun bun-darwin-aarch64)/bun" "$APP/Resources/bun-arm64"
cp "$(fetch_bun bun-darwin-x64)/bun" "$APP/Resources/bun-x64"
chmod +x "$APP/Resources/bun-arm64" "$APP/Resources/bun-x64"
copy_app "$APP/Resources/app"
if [ "$NATIVE" = 1 ]; then
  # An ad-hoc signature holds the bundle together (Apple silicon needs one); still "Open Anyway" once.
  codesign --force --deep --sign - "$WORK/mac/Pare 3D.app"
  (cd "$WORK/mac" && ditto -c -k --keepParent "Pare 3D.app" "$OUT/Pare-3D-Mac.zip")
else
  (cd "$WORK/mac" && zip -qry -9 "$OUT/Pare-3D-Mac.zip" "Pare 3D.app")
fi

# Windows. With the .NET SDK at hand the native window (windows/Program.cs) is built; the
# browser launcher ("Pare 3D (browser).vbs", which opens Edge) always comes along as a fallback.
WIN="$WORK/win/Pare 3D"
mkdir -p "$WIN"
cp "$ROOT/mac/serve.mjs" "$ROOT/mac/launch.mjs" "$ROOT/mac/NOTICE.txt" "$WIN/"
cp "$ROOT/mac/Pare 3D.vbs" "$WIN/Pare 3D (browser).vbs"
cp "$ROOT/windows/READ ME FIRST.txt" "$WIN/"
if command -v dotnet >/dev/null 2>&1; then
  if ! dotnet publish "$ROOT/windows/Pare3D.csproj" -c Release -o "$WORK/winbuild" > "$WORK/dotnet.log" 2>&1; then
    grep -E "error|Error" "$WORK/dotnet.log" | sed 's/^/::error::/' | head -60
    exit 1
  fi
  cp "$WORK/winbuild/Pare3D.exe" "$WIN/Pare 3D.exe"
  cp "$ROOT/windows/Pare3D.ico" "$WIN/"
fi
cp "$ROOT/LICENSE" "$WIN/LICENSE.txt"
cp "$(fetch_bun bun-windows-x64)/bun.exe" "$WIN/"
copy_app "$WIN/app"
(cd "$WORK/win" && zip -qr -9 "$OUT/Pare-3D-Windows.zip" "Pare 3D")

# Update package: the app folder's contents at the top of the archive.
copy_app "$WORK/update"
COPYFILE_DISABLE=1 tar -czf "$OUT/Pare-3D-app.tar.gz" -C "$WORK/update" .
if command -v sha256sum >/dev/null 2>&1; then SHA=$(sha256sum "$OUT/Pare-3D-app.tar.gz" | cut -d' ' -f1); else SHA=$(shasum -a 256 "$OUT/Pare-3D-app.tar.gz" | cut -d' ' -f1); fi
printf '{"build":%s,"version":"%s","minRuntime":%s,"sha256":"%s"}\n' "$BUILD" "$VERSION" "$MIN_RUNTIME" "$SHA" > "$OUT/pare3d-update.json"
cat "$OUT/pare3d-update.json"

ls -lh "$OUT"
