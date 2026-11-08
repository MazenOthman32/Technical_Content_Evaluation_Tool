# First-time setup for Instant+ Technical Content Evaluation Tool
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "== Setup: Instant+ Evaluation Tool ==" -ForegroundColor Cyan

if (-not (Test-Path ".venv")) {
  Write-Host "Creating Python venv..."
  python -m venv .venv
}

Write-Host "Activating venv + installing Python package..."
& .\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -e .

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env — fill API keys + Supabase values." -ForegroundColor Yellow
}

Set-Location (Join-Path $Root "web")
if (-not (Test-Path ".env.local")) {
  Copy-Item ".env.local.example" ".env.local"
  Write-Host "Created web/.env.local — fill Supabase values." -ForegroundColor Yellow
}

Write-Host "Installing npm packages..."
npm install

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Green
Write-Host "1) Run supabase/schema.sql (+ migration if needed) in Supabase SQL Editor"
Write-Host "2) node scripts/seed-super-admin.mjs   (from repo root)"
Write-Host "3) .\scripts\dev.ps1"
Write-Host "4) Open http://127.0.0.1:3000"
