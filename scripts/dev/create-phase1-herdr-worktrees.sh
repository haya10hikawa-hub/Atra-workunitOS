#!/usr/bin/env bash
set -euo pipefail

if ! command -v herdr >/dev/null 2>&1; then
  echo "herdr is not installed." >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
BASE_REF="${1:-main}"

# Herdr must have a running server/session. `herdr` starts or attaches to it.
if ! herdr status server >/dev/null 2>&1; then
  echo "Herdr server is not running. Start `herdr` once, detach, then rerun." >&2
  exit 1
fi

create_lane() {
  local branch="$1"
  local label="$2"
  herdr worktree create \
    --cwd "$REPO_ROOT" \
    --branch "$branch" \
    --base "$BASE_REF" \
    --label "$label" \
    --no-focus
}

create_lane "phase1/mock-p1-2-correlation" "P1-2 correlation"
create_lane "phase1/mock-p1-3-candidate" "P1-3 candidate"
create_lane "phase1/mock-p1-4-launcher" "P1-4 launcher"
create_lane "phase1/mock-p1-5-correction" "P1-5 correction"

echo "Created/opened four Herdr-managed Phase-1 worktrees from $BASE_REF."
echo "Start OpenCode inside each worktree with lane policy:"
echo "  P1-2: PONYTAIL_DEFAULT_MODE=off  ./scripts/dev/start-opencode-phase1.sh"
echo "  P1-3: PONYTAIL_DEFAULT_MODE=lite ./scripts/dev/start-opencode-phase1.sh"
echo "  P1-4: PONYTAIL_DEFAULT_MODE=full ./scripts/dev/start-opencode-phase1.sh"
echo "  P1-5: PONYTAIL_DEFAULT_MODE=lite ./scripts/dev/start-opencode-phase1.sh"
