#!/usr/bin/env bash
# Start Instant Plus video processor (macOS/Linux)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="/opt/homebrew/bin:$HOME/.local/node/bin:$PATH"

load_env() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}

load_env "$ROOT/.env"
load_env "$ROOT/web/.env.local"

if [[ -z "${SUPABASE_URL:-}" && -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ]]; then
  export SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL"
fi

# shellcheck disable=SC1091
source "$ROOT/.venv/bin/activate"

echo "SUPABASE_URL=${SUPABASE_URL:-unset}"
echo "Starting video-reviewer on http://0.0.0.0:8765 ..."
exec python -m video_reviewer.cli ui --host 0.0.0.0 --port 8765
