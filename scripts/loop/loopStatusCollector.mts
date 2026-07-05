/**
 * Loop-I0 loop status collector.
 *
 * Collects local git context, changed paths, optional read-only PR context,
 * and optional approved validation results, and returns a structured summary
 * for the report formatter.
 *
 * The collector never mutates files, git state, or GitHub state. It never
 * merges, pushes, deploys, publishes, tags, releases, or uploads. It never
 * calls product runtime, D1, SQL, LLM, ApprovalStore, or external actions.
 *
 * All execution goes through an injected CommandRunner so tests use a fake
 * runner and never touch real child_process or the network.
 */

import {
  assertCommandAllowed,
  buildReadOnlyStatusCommandPlan,
  buildValidationCommandPlan,
  type PlannedCommand,
  type SafeCommandName,
} from "./safeCommandPolicy.mts";

export interface CommandResult {
  readonly name: SafeCommandName;
  readonly commandLine: string;
  readonly exitCode: number | null;
  readonly stdoutSnippet: string;
  readonly stderrSnippet: string;
  readonly ok: boolean;
}

export type CommandRunner = (
  executable: string,
  args: readonly string[],
) => Promise<{ exitCode: number | null; stdout: string; stderr: string }> |
  { exitCode: number | null; stdout: string; stderr: string };

export interface LoopStatusInput {
  readonly phase: string;
  readonly prNumber?: number;
  readonly runValidation?: boolean;
  readonly maxSnippetChars?: number;
  readonly runner: CommandRunner;
}

export interface LoopStatusSummary {
  readonly phase: string;
  readonly generatedAt: string;
  readonly branch: string;
  readonly headCommit: string;
  readonly gitStatus: string;
  readonly changedPaths: readonly string[];
  readonly prNumber: number | null;
  readonly prInfo: CommandResult | null;
  readonly prChecks: CommandResult | null;
  readonly validationRequested: boolean;
  readonly validationResults: readonly CommandResult[];
  readonly commandResults: readonly CommandResult[];
}

const DEFAULT_MAX_SNIPPET_CHARS = 4000;

/**
 * Redact likely secret-like values (tokens, keys, bearer headers, key=value
 * secrets) before any output lands in a report snippet.
 */
export function redactSecrets(text: string): string {
  return text
    // GitHub-style tokens (classic and fine-grained)
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "[REDACTED]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "[REDACTED]")
    // Anthropic/OpenAI-style API keys
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[REDACTED]")
    // AWS access key ids
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED]")
    // Bearer / Authorization headers
    .replace(/\b(Authorization|Bearer)\b\s*:?\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [REDACTED]")
    // key=value style secrets
    .replace(
      /\b([A-Za-z0-9_-]*(?:token|secret|password|passwd|api[_-]?key|private[_-]?key)[A-Za-z0-9_-]*)\s*[=:]\s*[^\s"']+/gi,
      "$1=[REDACTED]",
    )
    // Long high-entropy hex blobs (40+ chars) that are not obviously commits
    .replace(/\b[0-9a-f]{64,}\b/gi, "[REDACTED]");
}

function truncateSnippet(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n... [truncated ${text.length - maxChars} chars]`;
}

function sanitizeSnippet(text: string, maxChars: number): string {
  return truncateSnippet(redactSecrets(text), maxChars);
}

async function runPlanned(
  runner: CommandRunner,
  planned: PlannedCommand,
  maxChars: number,
): Promise<CommandResult> {
  // Re-assert at execution time: the policy itself is the last gate.
  assertCommandAllowed(planned.name, planned.executable, planned.args);
  const commandLine = [planned.executable, ...planned.args].join(" ");
  try {
    const result = await runner(planned.executable, planned.args);
    return {
      name: planned.name,
      commandLine,
      exitCode: result.exitCode,
      stdoutSnippet: sanitizeSnippet(result.stdout ?? "", maxChars),
      stderrSnippet: sanitizeSnippet(result.stderr ?? "", maxChars),
      ok: result.exitCode === 0,
    };
  } catch (error) {
    // A failing command must not abort collection; record it and continue.
    return {
      name: planned.name,
      commandLine,
      exitCode: null,
      stdoutSnippet: "",
      stderrSnippet: sanitizeSnippet(String(error), maxChars),
      ok: false,
    };
  }
}

function parseChangedPaths(diffNameOnlyStdout: string): string[] {
  return diffNameOnlyStdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function collectLoopStatus(input: LoopStatusInput): Promise<LoopStatusSummary> {
  const maxChars = input.maxSnippetChars ?? DEFAULT_MAX_SNIPPET_CHARS;
  const statusPlan = buildReadOnlyStatusCommandPlan(input.prNumber);

  const commandResults: CommandResult[] = [];
  const byName = new Map<SafeCommandName, CommandResult>();
  for (const planned of statusPlan) {
    const result = await runPlanned(input.runner, planned, maxChars);
    commandResults.push(result);
    byName.set(planned.name, result);
  }

  const validationResults: CommandResult[] = [];
  if (input.runValidation === true) {
    for (const planned of buildValidationCommandPlan()) {
      const result = await runPlanned(input.runner, planned, maxChars);
      commandResults.push(result);
      validationResults.push(result);
    }
  }

  const branchResult = byName.get("git_branch_show_current");
  const headResult = byName.get("git_rev_parse_head");
  const statusResult = byName.get("git_status_short");
  const diffResult = byName.get("git_diff_name_only");

  return {
    phase: input.phase,
    generatedAt: new Date().toISOString(),
    branch: branchResult?.ok ? branchResult.stdoutSnippet.trim() : "",
    headCommit: headResult?.ok ? headResult.stdoutSnippet.trim() : "",
    gitStatus: statusResult?.stdoutSnippet ?? "",
    changedPaths: diffResult?.ok ? parseChangedPaths(diffResult.stdoutSnippet) : [],
    prNumber: input.prNumber ?? null,
    prInfo: byName.get("gh_pr_view") ?? null,
    prChecks: byName.get("gh_pr_checks") ?? null,
    validationRequested: input.runValidation === true,
    validationResults,
    commandResults,
  };
}
