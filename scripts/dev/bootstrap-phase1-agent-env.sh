#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This bootstrap is intentionally scoped to macOS for the Phase-1 sprint." >&2
  exit 1
fi

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

if ! need_cmd brew; then
  echo "Homebrew is required. Install it from https://brew.sh, then rerun." >&2
  exit 1
fi

if ! need_cmd node; then
  brew install node
fi

if ! need_cmd uv; then
  brew install uv
fi

if ! need_cmd opencode; then
  brew install anomalyco/tap/opencode
fi

if ! need_cmd herdr; then
  curl -fsSL https://herdr.dev/install.sh | sh
fi

if ! need_cmd headroom; then
  uv tool install --python 3.13 "headroom-ai[all]"
fi

mkdir -p "$HOME/.config/opencode"
herdr integration install opencode

if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
  echo "OPENROUTER_API_KEY is not set. Export it in your shell before starting the proxy/OpenCode." >&2
else
  echo "OPENROUTER_API_KEY configured = YES"
fi

export PONYTAIL_DEFAULT_MODE="${PONYTAIL_DEFAULT_MODE:-off}"

echo ""
echo "Installed / detected:"
printf '  opencode: '; command -v opencode
printf '  herdr:    '; command -v herdr
printf '  headroom: '; command -v headroom
printf '  node:     '; command -v node
printf '  uv:       '; command -v uv

echo ""
echo "Herdr OpenCode integration installed."
echo "Ponytail default for this sprint: ${PONYTAIL_DEFAULT_MODE}"
echo ""
echo "Next:"
echo "  1. export OPENROUTER_API_KEY=...   # do not commit it"
echo "  2. ./scripts/dev/start-headroom-openrouter.sh"
echo "  3. herdr"
echo "  4. inside a Herdr-managed worktree: ./scripts/dev/start-opencode-phase1.sh"
