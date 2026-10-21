# Pare 3D Windows check, run on a GitHub Windows machine after the downloads are built.
#   1. the bundled server serves the app;
#   2. the updater downloads and unpacks an update (with Windows' own tar);
#   3. "Pare 3D.exe" opens its window, starts the server, loads the app (checked through
#      WebView2's debugging port) and stops the server when the window closes.
param([string]$Dist = "dist", [string]$Out = "windows-check-output", [string]$Exe = "")
$ErrorActionPreference = "Stop"
# Any failure is reported as an annotation (readable from the run's summary), with where it happened.
trap {
  $where = $_.InvocationInfo.ScriptLineNumber
  Write-Host "::error::Windows check failed at line ${where}: $($_.Exception.Message)"
  $log = Join-Path $env:LOCALAPPDATA "Pare 3D\launcher.log"
  if (Test-Path $log) { Write-Host "::warning::launcher.log: $((Get-Content $log -Tail 8) -join ' | ')" }
  exit 1
}
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$Out = (Resolve-Path $Out).Path
$Dist = (Resolve-Path $Dist).Path
$Build = (Get-Content (Join-Path $Dist "pare3d-update.json") | ConvertFrom-Json).build
Write-Host "Checking build $Build"

function Get-Text($url) {
  try { return (Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 $url).Content } catch { return $null }
}
function Wait-For($what, $seconds, [scriptblock]$test) {
  $until = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $until) { if (& $test) { Write-Host "ok: $what"; return } ; Start-Sleep -Milliseconds 500 }
  throw "timed out: $what"
}

$Root = "C:\pare3d-check"
Remove-Item -Recurse -Force $Root -ErrorAction SilentlyContinue
Expand-Archive -Path (Join-Path $Dist "Pare-3D-Windows.zip") -DestinationPath $Root
$App = Join-Path $Root "Pare 3D"
if ($Exe) { Copy-Item -Force $Exe (Join-Path $App "Pare 3D.exe"); Write-Host "using the window program from $Exe" }
Get-ChildItem $App | Format-Table Name, Length | Out-String | Write-Host
foreach ($name in @("Pare 3D.exe", "bun.exe", "serve.mjs", "app\index.html", "app\pare-build.txt", "LICENSE.txt", "Pare 3D (browser).vbs")) {
  if (-not (Test-Path (Join-Path $App $name))) { throw "missing from the download: $name" }
}

# 1. The server on its own.
$env:PORT = "47290"
$server = Start-Process -FilePath (Join-Path $App "bun.exe") -ArgumentList "`"$(Join-Path $App 'serve.mjs')`"" -WorkingDirectory $App -PassThru -WindowStyle Hidden
Wait-For "server answers" 30 { (Get-Text "http://127.0.0.1:47290/__pare3d") -eq "pare3d" }
$homePage = Get-Text "http://127.0.0.1:47290/"
if ($homePage -notmatch "Pare 3D") { throw "the home page does not look like Pare 3D" }
$state = Get-Text "http://127.0.0.1:47290/__pare3d/update" | ConvertFrom-Json
if ($state.bundled -ne $Build) { throw "the server reports build $($state.bundled), expected $Build" }
$chunk = [regex]::Match($homePage, '/_next/static/[^"]+\.js').Value
if (-not $chunk) { throw "no script found in the home page" }
$response = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:47290$chunk"
if ($response.Headers["Content-Type"] -notmatch "javascript") { throw "scripts are served as $($response.Headers['Content-Type'])" }
$wasm = Get-ChildItem -Recurse -Filter *.wasm (Join-Path $App "app") | Select-Object -First 1
if ($wasm) {
  $rel = $wasm.FullName.Substring((Join-Path $App "app").Length).Replace("\", "/")
  $response = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:47290$rel"
  if ($response.Headers["Content-Type"] -notmatch "wasm") { throw "wasm is served as $($response.Headers['Content-Type'])" }
  Write-Host "ok: wasm served as application/wasm"
}
Stop-Process -Id $server.Id -Force
Write-Host "::notice::PASS 1: the server serves the app"

# 2. The updater: the installed copy pretends to be build 1, a stand-in for GitHub offers this build.
$OldApp = Join-Path $Root "old"
Copy-Item -Recurse $App $OldApp
Set-Content -Path (Join-Path $OldApp "app\pare-build.txt") -Value "1" -NoNewline
$env:LOCALAPPDATA_SAVED = $env:LOCALAPPDATA
$env:LOCALAPPDATA = Join-Path $Root "localappdata"
New-Item -ItemType Directory -Force -Path $env:LOCALAPPDATA | Out-Null
$fake = Start-Process -FilePath (Join-Path $App "bun.exe") -ArgumentList "`"$PSScriptRoot\fake-github.mjs`" `"$Dist`" 47300" -PassThru -WindowStyle Hidden
Wait-For "stand-in for GitHub answers" 30 { (Get-Text "http://127.0.0.1:47300/latest") -ne $null }
$env:PORT = "47291"
$env:PARE3D_RELEASES_API = "http://127.0.0.1:47300/latest"
$env:PARE3D_TEST_ORIGIN = "http://127.0.0.1:47300"
$old = Start-Process -FilePath (Join-Path $OldApp "bun.exe") -ArgumentList "`"$(Join-Path $OldApp 'serve.mjs')`"" -WorkingDirectory $OldApp -PassThru -WindowStyle Hidden
Wait-For "old copy answers" 30 { (Get-Text "http://127.0.0.1:47291/__pare3d") -eq "pare3d" }
Wait-For "update downloaded and unpacked" 120 {
  $s = Get-Text "http://127.0.0.1:47291/__pare3d/update" | ConvertFrom-Json
  if ($s.error) { throw "update failed: $($s.error)" }
  $s.ready -eq $Build -and $s.serving -eq $Build
}
Stop-Process -Id $old.Id -Force
Stop-Process -Id $fake.Id -Force
Remove-Item Env:PARE3D_RELEASES_API, Env:PARE3D_TEST_ORIGIN
$env:LOCALAPPDATA = $env:LOCALAPPDATA_SAVED
Write-Host "::notice::PASS 2: the updater works on Windows"

# 3. The real app window.
$webview = Get-ItemProperty -Path "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" -ErrorAction SilentlyContinue
if (-not $webview) {
  Write-Host "Installing the WebView2 runtime"
  Invoke-WebRequest -UseBasicParsing "https://go.microsoft.com/fwlink/p/?LinkId=2124703" -OutFile "$Root\webview2.exe"
  Start-Process -FilePath "$Root\webview2.exe" -ArgumentList "/silent /install" -Wait
}
Remove-Item Env:PORT
$env:PARE3D_DEBUG_PORT = "9222"
$appProcess = Start-Process -FilePath (Join-Path $App "Pare 3D.exe") -WorkingDirectory $App -PassThru
Wait-For "the app started its server" 90 { (Get-Text "http://127.0.0.1:47177/__pare3d") -eq "pare3d" }
Wait-For "the window's debugging port is open" 60 { (Get-Text "http://127.0.0.1:9222/json/version") -ne $null }
$tools = if ($env:PARE_CHECK_TOOLS) { $env:PARE_CHECK_TOOLS } else { $PSScriptRoot }
node (Join-Path $tools "cdp-check.mjs") $Out
if ($LASTEXITCODE -ne 0) { throw "the app window check failed" }
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
[System.Drawing.Graphics]::FromImage($bitmap).CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bitmap.Save((Join-Path $Out "windows-desktop.png"))
$null = $appProcess.CloseMainWindow()
Wait-For "the window closed" 30 { $appProcess.HasExited }
Wait-For "the server stopped with it" 15 { (Get-Text "http://127.0.0.1:47177/__pare3d") -eq $null }
Write-Host "::notice::PASS 3: the app window opens Pare 3D and closes cleanly"
$log = Join-Path $env:LOCALAPPDATA "Pare 3D\launcher.log"
if (Test-Path $log) { Copy-Item $log $Out }
Write-Host "::notice::All Windows checks passed for build $Build"
