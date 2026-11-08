# Expose local processor publicly for Vercel via Cloudflare quick tunnel
$ErrorActionPreference = "Stop"
$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflared) {
  Write-Host "Installing cloudflared via winget..."
  winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
}
Write-Host "Starting Cloudflare tunnel to http://127.0.0.1:8765 ..."
cloudflared tunnel --url http://127.0.0.1:8765
