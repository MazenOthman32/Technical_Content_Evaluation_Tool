# Instant+ — start local processor + Cloudflare tunnel for Vercel
$ErrorActionPreference = "Stop"

$candidates = @(
  (Join-Path $env:USERPROFILE "OneDrive\Desktop\Final Evaluation Tool"),
  (Join-Path $env:USERPROFILE "Desktop\Final Evaluation Tool"),
  "C:\Users\omaze\OneDrive\Desktop\Final Evaluation Tool"
)

$Root = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Root) {
  $Root = Read-Host "Enter full path to Final Evaluation Tool folder"
}
if (-not (Test-Path $Root)) {
  throw "Project folder not found: $Root"
}

$processor = Join-Path $Root "scripts\start-processor.ps1"
$tunnel = Join-Path $Root "scripts\start-tunnel.ps1"
if (-not (Test-Path $processor)) { throw "Missing $processor" }
if (-not (Test-Path $tunnel)) { throw "Missing $tunnel" }

Write-Host "== Instant+ Vercel Processor ==" -ForegroundColor Cyan
Write-Host "Project: $Root"
Write-Host "Starting processor on :8765 ..."
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-File", $processor
)

Start-Sleep -Seconds 2
Write-Host "Starting Cloudflare tunnel..."
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-File", $tunnel
)

Write-Host ""
Write-Host "Next:" -ForegroundColor Green
Write-Host "1) Copy the https://....trycloudflare.com URL from the tunnel window"
Write-Host "2) Vercel → Settings → Environment Variables → set PROCESS_API_URL"
Write-Host "3) Redeploy, then click Check Connection in Settings"
Write-Host ""
Write-Host "Keep both windows open while using the Vercel site."
Pause
