#!/usr/bin/env bash
set -euo pipefail

MODE="${PONYTAIL_DEFAULT_MODE:-off}"
case "$MODE" in
  off|lite|full) ;;
  ultra)
    echo "Ponytail ultra is forbidden through the 2026-08-28 mock gate." >&2
    exit 1
    ;;
  *)
    echo "Unsupported PONYTAIL_DEFAULT_MODE=$MODE (allowed: off|lite|full)." >&2
    exit 1
    ;;
esac

if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
  echo "OPENROUTER_API_KEY configured = NO" >&2
  exit 1
fi

if ! command -v opencode >/dev/null 2>&1; then
  echo "opencode is not installed. Run scripts/dev/bootstrap-phase1-agent-env.sh first." >&2
  exit 1
fi

if ! curl -fsS http://127.0.0.1:8787/health >/dev/null; then
  echo "Headroom proxy is not healthy at http://127.0.0.1:8787." >&2
  echo "Start it with ./scripts/dev/start-headroom-openrouter.sh" >&2
  exit 1
fi

export PONYTAIL_DEFAULT_MODE="$MODE"

echo "HEADROOM_PROXY = HEALTHY"
echo "OPENROUTER_API_KEY configured = YES"
echo "PONYTAIL_DEFAULT_MODE = $MODE"
echo "OPENCODE_MODEL = headroom-openrouter/openai/gpt-5.6-luna (default high)"

exec opencode "$@"
