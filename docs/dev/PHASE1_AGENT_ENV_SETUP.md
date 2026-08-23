# Phase-1 Coding Agent Environment Setup

Status: sprint execution setup for Issue #246 through 2026-08-28 JST.

## Topology

```text
Herdr                         orchestration / worktrees / lifecycle
  └─ OpenCode stable          coding-agent harness
       ├─ implementation      Headroom -> OpenRouter -> GPT-5.6 Luna
       └─ evidence review     direct OpenRouter -> Claude Sonnet 5

Ponytail                      scoped implementation minimizer
Tests / Gold Set              correctness authority
```

Herdr is **not** the LLM proxy. Headroom is the local LLM proxy. Herdr owns persistent panes, worktrees, lifecycle state, and session restore.

## Preconditions

- macOS
- Homebrew
- repository checkout
- an OpenRouter API key with the Issue #246 spend ceiling configured upstream

Never write the API key into this repository, `opencode.json`, shell history, logs, screenshots, or issue/PR bodies.

## 1. Bootstrap local tools

From the repository root:

```bash
bash scripts/dev/bootstrap-phase1-agent-env.sh
```

The bootstrap:

1. ensures Node.js and `uv` exist,
2. installs OpenCode from the recommended Homebrew tap when missing,
3. installs stable Herdr when missing,
4. installs the Headroom CLI/proxy when missing,
5. creates the OpenCode config directory,
6. installs Herdr's official OpenCode integration.

OpenCode's Herdr integration reports both lifecycle state and resumable session identity. Herdr can later resume the pane with OpenCode's session id.

## 2. Export the OpenRouter credential

Set the credential in the current shell or a secure shell-secret mechanism:

```bash
export OPENROUTER_API_KEY='...'
```

Only presence may be printed. Do not echo or persist the value through repository tooling.

## 3. Start the Headroom -> OpenRouter proxy

Use a dedicated terminal/Herdr pane:

```bash
bash scripts/dev/start-headroom-openrouter.sh
```

Frozen sprint posture:

```text
HEADROOM_SAVINGS_PROFILE=coding
HEADROOM_DISABLE_KOMPRESS=1
HEADROOM_PROTECT_RECENT=3
HEADROOM_MIN_TOKENS=1000
HEADROOM_OUTPUT_SHAPER=0
HEADROOM_MODEL_ROUTER_ENABLED=0
HEADROOM_TELEMETRY=on
host=127.0.0.1
port=8787
daily proxy budget=$12
code-aware AST compression=OFF
message logging=OFF
```

Verify without exposing credentials:

```bash
curl -fsS http://127.0.0.1:8787/health
curl -fsS http://127.0.0.1:8787/stats
```

## 4. Start Herdr

```bash
herdr
```

Herdr persists the panes in its background session. Detaching or closing the terminal does not terminate running agents.

The official OpenCode integration is installed by the bootstrap:

```bash
herdr integration install opencode
```

## 5. Create Phase-1 worktrees

After Herdr is running:

```bash
bash scripts/dev/create-phase1-herdr-worktrees.sh main
```

This creates/opens:

```text
phase1/mock-p1-2-correlation
phase1/mock-p1-3-candidate
phase1/mock-p1-4-launcher
phase1/mock-p1-5-correction
```

Herdr manages the checkouts as grouped workspaces. The lanes depend on the frozen C0 contract/fixtures rather than waiting for each other's completed implementation.

## 6. Start OpenCode in each lane

The project `opencode.json` defines two provider paths:

### Development provider

```text
headroom-openrouter/openai/gpt-5.6-luna
```

Flow:

```text
OpenCode -> 127.0.0.1:8787 -> Headroom -> OpenRouter -> GPT-5.6 Luna
```

Default reasoning effort is `high`; `medium`, `high`, and `xhigh` variants are declared for explicit escalation.

### Evidence/review provider

```text
openrouter-direct/anthropic/claude-sonnet-5
```

This path bypasses Headroom by design.

### Lane-specific Ponytail mode

Run the launcher in the matching worktree:

```bash
# P1-2 correlation semantics
PONYTAIL_DEFAULT_MODE=off bash scripts/dev/start-opencode-phase1.sh

# P1-3 Candidate
PONYTAIL_DEFAULT_MODE=lite bash scripts/dev/start-opencode-phase1.sh

# P1-4 Launcher / Context Preview
PONYTAIL_DEFAULT_MODE=full bash scripts/dev/start-opencode-phase1.sh

# P1-5 Correction / Measurement
PONYTAIL_DEFAULT_MODE=lite bash scripts/dev/start-opencode-phase1.sh
```

`ultra` is rejected by the launcher through the 2026-08-28 mock gate.

## 7. Evidence-mode review

Use the project custom agent:

```text
evidence-review
```

It is pinned to direct OpenRouter + Claude Sonnet 5 and denies:

- edit/write,
- external-directory access,
- web access,
- subagents,
- skills,
- mutation commands.

Only bounded Git inspection commands are allowed. A reviewer must never repair the object it certifies in the same session.

## OpenCode permission boundary

The project config defaults to ask/deny rather than broad auto-approval.

Allowed without confirmation include bounded repository inspection and normal test/lint/typecheck commands. `git push`, destructive Git commands, `rm -rf`, external-directory access, and `.env` reads are denied.

Do **not** run OpenCode with `--auto` for this sprint. Permission prompts are part of the control boundary.

## Headroom bypass rule

The following are evidence-mode tasks and must use the direct provider/reviewer rather than the Headroom development path:

- C0 contract freeze,
- Gold Set creation/labeling,
- final P1-2 semantic judgment,
- security/authority review,
- mutation-evidence judgment,
- final exact-head review,
- 2026-08-28 mock Value Gate judgment.

## Health checks

```bash
opencode --version
herdr --version
headroom --version
herdr status server
herdr agent list
curl -fsS http://127.0.0.1:8787/health
```

Inside OpenCode, verify that the default model resolves to:

```text
headroom-openrouter/openai/gpt-5.6-luna
```

and that the evidence reviewer resolves to:

```text
openrouter-direct/anthropic/claude-sonnet-5
```

## Fail closed

Stop the lane instead of silently bypassing the setup when any of these occur:

- Headroom health check fails for an implementation lane,
- `OPENROUTER_API_KEY` is absent,
- OpenCode falls back to an unintended model,
- a worktree points at the wrong branch/base,
- a reviewer has edit authority,
- Ponytail is `ultra`,
- the optimization layer changes or weakens deterministic evidence.

The recovery action is to repair the environment, not to weaken the evidence gate.
