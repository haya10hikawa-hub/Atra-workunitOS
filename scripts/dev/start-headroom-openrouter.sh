#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
  echo "OPENROUTER_API_KEY configured = NO" >&2
  exit 1
fi

if ! command -v headroom >/dev/null 2>&1; then
  echo "headroom is not installed. Run scripts/dev/bootstrap-phase1-agent-env.sh first." >&2
  exit 1
fi

export HEADROOM_SAVINGS_PROFILE="coding"
export HEADROOM_DISABLE_KOMPRESS="1"
export HEADROOM_PROTECT_RECENT="3"
export HEADROOM_MIN_TOKENS="1000"
export HEADROOM_OUTPUT_SHAPER="0"
export HEADROOM_MODEL_ROUTER_ENABLED="0"
export HEADROOM_TELEMETRY="on"
export HEADROOM_LOG_LEVEL="warning"

# No --log-file and no --log-messages: prompt/message bodies must not be persisted by this launcher.
exec headroom proxy \
  --backend openrouter \
  --host 127.0.0.1 \
  --port 8787 \
  --budget 12 \
  --telemetry \
  --no-code-aware
