#!/usr/bin/env bash
# Expose local processor publicly for Vercel (Cloudflare quick tunnel over HTTP/2)
set -euo pipefail
export PATH="/opt/homebrew/bin:$PATH"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Installing cloudflared via Homebrew..."
  brew install cloudflared
fi

echo "Starting Cloudflare tunnel to http://127.0.0.1:8765 (protocol=http2) ..."
# QUIC/UDP 7844 is often blocked; force HTTP/2
exec cloudflared tunnel --url http://127.0.0.1:8765 --protocol http2
