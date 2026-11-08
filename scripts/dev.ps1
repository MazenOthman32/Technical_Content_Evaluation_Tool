# One-command local stack: processor + Next.js web
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "== Instant+ Technical Content Evaluation ==" -ForegroundColor Cyan
Write-Host "Starting processor on :8765 and web on :3000 ..." -ForegroundColor Green

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-File", (Join-Path $PSScriptRoot "start-processor.ps1")
)

Start-Sleep -Seconds 2
Set-Location (Join-Path $Root "web")

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing web dependencies..."
  npm install
}

npm run dev
