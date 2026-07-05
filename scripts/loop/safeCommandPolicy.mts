/**
 * Loop-I0 safe command policy.
 *
 * Deny-by-default allowlist of exact command specs for the local loop status
 * collector. Only the configured argv arrays below may be executed; arbitrary
 * shell strings are never allowed, and commands are always run without a
 * shell (spawn/execFile-style argv arrays).
 *
 * This policy is local developer tooling. It authorizes no GitHub mutation,
 * no merge, no push, no deploy, no publish, no release, no tag, and no
 * artifact upload.
 */

export type SafeCommandName =
  | "git_status_short"
  | "git_rev_parse_head"
  | "git_branch_show_current"
  | "git_diff_name_only"
  | "git_diff_check"
  | "gh_pr_view"
  | "gh_pr_checks"
  | "npm_test"
  | "npm_alpha_safety_gate"
  | "npm_lint"
  | "npm_build"
  | "npm_cf_build"
  | "npm_electron_build_check";

export interface SafeCommandSpec {
  readonly name: SafeCommandName;
  readonly executable: string;
  readonly args: readonly string[];
  readonly kind: "read_only_git" | "read_only_gh" | "validation";
  readonly description: string;
  /**
   * When true, the spec accepts exactly one extra argument (a PR number)
   * appended after the configured args. Nothing else may be appended.
   */
  readonly acceptsPrNumber?: boolean;
}

export const SAFE_COMMANDS: Readonly<Record<SafeCommandName, SafeCommandSpec>> = {
  git_status_short: {
    name: "git_status_short",
    executable: "git",
    args: ["status", "--short"],
    kind: "read_only_git",
    description: "Collect local git status (read-only).",
  },
  git_rev_parse_head: {
    name: "git_rev_parse_head",
    executable: "git",
    args: ["rev-parse", "HEAD"],
    kind: "read_only_git",
    description: "Collect head commit (read-only).",
  },
  git_branch_show_current: {
    name: "git_branch_show_current",
    executable: "git",
    args: ["branch", "--show-current"],
    kind: "read_only_git",
    description: "Collect current branch (read-only).",
  },
  git_diff_name_only: {
    name: "git_diff_name_only",
    executable: "git",
    args: ["diff", "--name-only", "HEAD"],
    kind: "read_only_git",
    description: "Collect changed paths (read-only).",
  },
  git_diff_check: {
    name: "git_diff_check",
    executable: "git",
    args: ["diff", "--check"],
    kind: "read_only_git",
    description: "Check for whitespace errors (read-only).",
  },
  gh_pr_view: {
    name: "gh_pr_view",
    executable: "gh",
    args: [
      "pr",
      "view",
      "--json",
      "number,title,state,mergeable,mergeStateStatus,url,headRefName,baseRefName",
    ],
    kind: "read_only_gh",
    description: "Collect PR metadata (read-only).",
    acceptsPrNumber: true,
  },
  gh_pr_checks: {
    name: "gh_pr_checks",
    executable: "gh",
    args: ["pr", "checks"],
    kind: "read_only_gh",
    description: "Collect PR checks (read-only).",
    acceptsPrNumber: true,
  },
  npm_test: {
    name: "npm_test",
    executable: "npm",
    args: ["test"],
    kind: "validation",
    description: "Approved validation: full test suite.",
  },
  npm_alpha_safety_gate: {
    name: "npm_alpha_safety_gate",
    executable: "npm",
    args: ["run", "alpha:safety-gate"],
    kind: "validation",
    description: "Approved validation: alpha safety gate.",
  },
  npm_lint: {
    name: "npm_lint",
    executable: "npm",
    args: ["run", "lint"],
    kind: "validation",
    description: "Approved validation: lint.",
  },
  npm_build: {
    name: "npm_build",
    executable: "npm",
    args: ["run", "build"],
    kind: "validation",
    description: "Approved validation: build.",
  },
  npm_cf_build: {
    name: "npm_cf_build",
    executable: "npm",
    args: ["run", "cf:build"],
    kind: "validation",
    description: "Approved validation: Cloudflare build.",
  },
  npm_electron_build_check: {
    name: "npm_electron_build_check",
    executable: "npm",
    args: ["run", "electron:build:check"],
    kind: "validation",
    description: "Approved validation: Electron build check (static check only).",
  },
};

/**
 * Any command line containing one of these substrings is rejected, even if it
 * somehow matched an allowed spec. This is a defense-in-depth layer on top of
 * the deny-by-default allowlist.
 */
export const FORBIDDEN_COMMAND_PATTERNS: readonly string[] = [
  "gh pr merge",
  "gh pr close",
  "gh pr edit",
  "gh pr create",
  "gh release",
  "git push",
  "git tag",
  "git reset --hard",
  "git clean",
  "wrangler deploy",
  "npm publish",
  "electron publish",
  "d1 execute",
  "DROP TABLE",
  "DELETE FROM",
  "INSERT INTO",
  "UPDATE ",
  "ALTER TABLE",
  "CREATE TABLE",
  "external action",
  "approvalstore write",
  "deploy",
  "publish",
  "release",
  "upload",
];

function renderCommandLine(executable: string, args: readonly string[]): string {
  return [executable, ...args].join(" ");
}

function matchesForbiddenPattern(commandLine: string): string | null {
  const lower = commandLine.toLowerCase();
  for (const pattern of FORBIDDEN_COMMAND_PATTERNS) {
    if (lower.includes(pattern.toLowerCase())) {
      return pattern;
    }
  }
  return null;
}

function isValidPrNumber(value: string): boolean {
  return /^[0-9]{1,8}$/.test(value);
}

/**
 * Deny-by-default check. A command is allowed only when:
 *  - the name is a configured SafeCommandName,
 *  - the executable matches the spec exactly,
 *  - the args match the spec exactly (plus at most one PR number when the
 *    spec allows it),
 *  - the rendered command line matches no forbidden pattern.
 */
export function isCommandAllowed(
  name: string,
  executable: string,
  args: readonly string[],
): boolean {
  const spec = (SAFE_COMMANDS as Record<string, SafeCommandSpec | undefined>)[name];
  if (!spec) return false;
  if (executable !== spec.executable) return false;

  const base = spec.args;
  const matchesBase =
    args.length >= base.length && base.every((a, i) => args[i] === a);
  if (!matchesBase) return false;

  const extra = args.slice(base.length);
  if (extra.length > 0) {
    if (!spec.acceptsPrNumber) return false;
    if (extra.length !== 1) return false;
    if (!isValidPrNumber(extra[0])) return false;
  }

  return matchesForbiddenPattern(renderCommandLine(executable, args)) === null;
}

export function assertCommandAllowed(
  name: string,
  executable: string,
  args: readonly string[],
): void {
  if (!isCommandAllowed(name, executable, args)) {
    throw new Error(
      `Safe command policy violation (deny-by-default): ${JSON.stringify({
        name,
        executable,
        args,
      })}`,
    );
  }
}

export interface PlannedCommand {
  readonly name: SafeCommandName;
  readonly executable: string;
  readonly args: readonly string[];
  readonly kind: SafeCommandSpec["kind"];
}

function planFromSpec(spec: SafeCommandSpec, extraArgs: readonly string[] = []): PlannedCommand {
  const args = [...spec.args, ...extraArgs];
  assertCommandAllowed(spec.name, spec.executable, args);
  return { name: spec.name, executable: spec.executable, args, kind: spec.kind };
}

/**
 * The approved validation command set, in run order.
 */
export function buildValidationCommandPlan(): PlannedCommand[] {
  return [
    planFromSpec(SAFE_COMMANDS.npm_test),
    planFromSpec(SAFE_COMMANDS.npm_alpha_safety_gate),
    planFromSpec(SAFE_COMMANDS.npm_lint),
    planFromSpec(SAFE_COMMANDS.npm_build),
    planFromSpec(SAFE_COMMANDS.npm_cf_build),
    planFromSpec(SAFE_COMMANDS.npm_electron_build_check),
    planFromSpec(SAFE_COMMANDS.git_diff_check),
  ];
}

/**
 * The read-only status command set. When a PR number is provided, read-only
 * gh commands for that PR are included.
 */
export function buildReadOnlyStatusCommandPlan(prNumber?: number): PlannedCommand[] {
  const plan: PlannedCommand[] = [
    planFromSpec(SAFE_COMMANDS.git_status_short),
    planFromSpec(SAFE_COMMANDS.git_branch_show_current),
    planFromSpec(SAFE_COMMANDS.git_rev_parse_head),
    planFromSpec(SAFE_COMMANDS.git_diff_name_only),
  ];
  if (prNumber !== undefined) {
    if (!Number.isInteger(prNumber) || prNumber <= 0) {
      throw new Error(`Invalid PR number: ${prNumber}`);
    }
    plan.push(planFromSpec(SAFE_COMMANDS.gh_pr_view, [String(prNumber)]));
    plan.push(planFromSpec(SAFE_COMMANDS.gh_pr_checks, [String(prNumber)]));
  }
  return plan;
}
