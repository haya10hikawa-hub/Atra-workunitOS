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

# Phase-1 safety posture: cache-oriented, structural/lossless optimization only.
# Anonymous Headroom telemetry is disabled; local /stats metrics remain available.
# Anthropic Claude subscription polling is also disabled because this sprint routes
# implementation traffic through OpenRouter and does not use Claude subscription state.
export HEADROOM_SAVINGS_PROFILE="coding"
export HEADROOM_MODE="cache"
export HEADROOM_DISABLE_KOMPRESS="1"
export HEADROOM_DISABLE_KOMPRESS_FALLBACK="1"
export HEADROOM_CODE_AWARE_ENABLED="0"
export HEADROOM_PROTECT_RECENT="3"
export HEADROOM_MIN_TOKENS="1000"
export HEADROOM_OUTPUT_SHAPER="0"
export HEADROOM_MODEL_ROUTER_ENABLED="0"
export HEADROOM_TELEMETRY="off"
export HEADROOM_NO_SUBSCRIPTION_TRACKING="1"
export HEADROOM_LOG_LEVEL="warning"
export HEADROOM_BUDGET="12"
export HEADROOM_BUDGET_PERIOD="daily"

HELP="$(headroom proxy --help 2>&1)"

require_option() {
  local option="$1"
  if ! grep -Fq -- "$option" <<<"$HELP"; then
    echo "Headroom CLI does not support required option: $option" >&2
    echo "Run: headroom --version && headroom proxy --help" >&2
    exit 1
  fi
}

# These define the required routing / budget boundary. Fail closed if the installed
# CLI is too old to provide them.
require_option "--backend"
require_option "--host"
require_option "--port"
require_option "--budget"

args=(
  proxy
  --backend openrouter
  --host 127.0.0.1
  --port 8787
  --budget 12
)

if grep -Fq -- "--budget-period" <<<"$HELP"; then
  args+=(--budget-period daily)
fi

# Anonymous telemetry is not required for local savings metrics. Prefer the
# explicit privacy flag when the installed version supports it; the environment
# variable above remains the compatibility fallback.
if grep -Fq -- "--no-telemetry" <<<"$HELP"; then
  args+=(--no-telemetry)
fi

# OpenRouter-only Phase-1 operation must not poll Anthropic subscription usage.
# Use both env + CLI when available so current and older compatible Headroom
# versions converge on the same fail-closed behavior.
if grep -Fq -- "--no-subscription-tracking" <<<"$HELP"; then
  args+=(--no-subscription-tracking)
fi

# Prefer the strongest version-supported safety primitive: lossless compaction.
# Otherwise fall back to explicit Kompress/code-aware disabling via CLI/env.
if grep -Fq -- "--lossless" <<<"$HELP"; then
  args+=(--lossless)
else
  if grep -Fq -- "--disable-kompress" <<<"$HELP"; then
    args+=(--disable-kompress)
  fi
  if grep -Fq -- "--disable-kompress-fallback" <<<"$HELP"; then
    args+=(--disable-kompress-fallback)
  fi
  if grep -Fq -- "--no-code-aware" <<<"$HELP"; then
    args+=(--no-code-aware)
  fi
fi

# No --log-file and no --log-messages: prompt/message bodies must not be persisted.
exec headroom "${args[@]}"
