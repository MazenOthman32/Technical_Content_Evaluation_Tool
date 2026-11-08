# Start Instant Plus video processor with Supabase env loaded from root .env
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Import-DotEnv($path) {
  if (-not (Test-Path $path)) { return }
  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $key = $line.Substring(0, $idx).Trim()
    $val = $line.Substring($idx + 1).Trim()
    if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($key, $val, "Process")
  }
}

Import-DotEnv (Join-Path $Root ".env")
Import-DotEnv (Join-Path $Root "web\.env.local")

if (-not $env:SUPABASE_URL -and $env:NEXT_PUBLIC_SUPABASE_URL) {
  $env:SUPABASE_URL = $env:NEXT_PUBLIC_SUPABASE_URL
}

Write-Host "SUPABASE_URL=$($env:SUPABASE_URL)"
Write-Host "Starting video-reviewer on http://127.0.0.1:8765 ..."
python -m video_reviewer.cli ui --host 0.0.0.0 --port 8765
