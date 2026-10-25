#!/bin/bash
# Build 70: on the Mac that builds a release, Send to a slicer finds an app in ~/Applications and
# hands it the file. A stand-in PreForm.app is made for it; the real slicers are not needed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAKE_HOME="$(mktemp -d)"
APP="$FAKE_HOME/Applications/PreForm.app"
mkdir -p "$APP/Contents/MacOS"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>PreForm</string>
<key>CFBundleIdentifier</key><string>org.pare3d.check.preform</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleName</key><string>PreForm</string>
</dict></plist>
PLIST
printf '#!/bin/sh\nexit 0\n' > "$APP/Contents/MacOS/PreForm"
chmod +x "$APP/Contents/MacOS/PreForm"
PORT=47295 HOME="$FAKE_HOME" PARE3D_RELEASES_API="http://127.0.0.1:9/none" node "$ROOT/mac/serve.mjs" > /dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true; rm -rf "$FAKE_HOME"' EXIT
for _ in $(seq 1 100); do curl -fs "http://127.0.0.1:47295/__pare3d" > /dev/null && break; sleep 0.1; done
SLICERS="$(curl -fs "http://127.0.0.1:47295/__slicers")"
echo "slicers: $SLICERS"
echo "$SLICERS" | grep -q '"installed":\[[^]]*"preform"' || { echo "::error::Send to a slicer did not find PreForm.app in ~/Applications"; exit 1; }
SENT="$(printf 'abc' | curl -fs -X POST -H 'x-pare3d-send: 1' -H 'content-type: application/octet-stream' --data-binary @- "http://127.0.0.1:47295/__send-to-slicer?app=preform&name=check.stl")"
echo "sent: $SENT"
[ -f "$FAKE_HOME/Documents/Pare 3D Exports/check.stl" ] || { echo "::error::the file sent to PreForm was not saved"; exit 1; }
echo "$SENT" | grep -q '"opened":true' || echo "::warning::open -a did not start the stand-in PreForm.app on this machine: $SENT"
echo "Send to a slicer: ok on macOS"
