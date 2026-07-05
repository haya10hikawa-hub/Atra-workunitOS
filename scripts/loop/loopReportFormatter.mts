/**
 * Loop-I0 report formatter.
 *
 * Turns a LoopStatusSummary into a structured Markdown report and a JSON
 * summary. Output is candidate assistance only: the report never claims a
 * final Go, never approves anything, and always states the human review
 * boundary.
 */

import type { CommandResult, LoopStatusSummary } from "./loopStatusCollector.mts";

export type CandidateStatus =
  | "candidate_go_assistance"
  | "candidate_no_go_assistance"
  | "candidate_insufficient_data";

const HUMAN_REVIEW_BOUNDARY = [
  "This report is not human approval.",
  "This report is not CI approval.",
  "This report is not merge approval.",
  "A human reviewer must make the final Go / No-Go decision.",
] as const;

export function summarizeCommandResult(result: CommandResult): string {
  const status = result.ok ? "ok" : `failed (exit ${result.exitCode ?? "n/a"})`;
  return `${result.name}: ${status} — \`${result.commandLine}\``;
}

/**
 * Classify a candidate status from collected data. This is assistance only;
 * it is never a final decision.
 */
export function classifyCandidateStatus(summary: LoopStatusSummary): CandidateStatus {
  if (summary.commandResults.length === 0) return "candidate_insufficient_data";
  const anyFailure = summary.commandResults.some((r) => !r.ok);
  if (anyFailure) return "candidate_no_go_assistance";
  if (summary.validationRequested && summary.validationResults.length === 0) {
    return "candidate_insufficient_data";
  }
  return "candidate_go_assistance";
}

function collectCandidateRisks(summary: LoopStatusSummary): string[] {
  const risks: string[] = [];
  for (const result of summary.commandResults) {
    if (!result.ok) {
      risks.push(`Command failed: ${summarizeCommandResult(result)}`);
    }
  }
  if (!summary.validationRequested) {
    risks.push("Validation commands were not run in this collection (use --run-validation).");
  }
  if (summary.prNumber === null) {
    risks.push("No PR context was collected (use --pr <number>).");
  }
  if (summary.changedPaths.length === 0) {
    risks.push("No changed paths were detected relative to HEAD.");
  }
  return risks;
}

function codeBlock(text: string): string {
  const body = text.trimEnd();
  return body.length > 0 ? `\`\`\`\n${body}\n\`\`\`` : "_(empty)_";
}

function commandSection(results: readonly CommandResult[]): string {
  if (results.length === 0) return "_(not collected)_";
  return results
    .map((r) => {
      const parts = [`- ${summarizeCommandResult(r)}`];
      if (r.stdoutSnippet.trim().length > 0) {
        parts.push(`  - stdout:\n\n${codeBlock(r.stdoutSnippet)}`);
      }
      if (r.stderrSnippet.trim().length > 0) {
        parts.push(`  - stderr:\n\n${codeBlock(r.stderrSnippet)}`);
      }
      return parts.join("\n");
    })
    .join("\n");
}

export function formatLoopMarkdownReport(summary: LoopStatusSummary): string {
  const candidate = classifyCandidateStatus(summary);
  const risks = collectCandidateRisks(summary);

  const lines: string[] = [];
  lines.push(`# Loop Status Report — ${summary.phase}`);
  lines.push("");
  lines.push("## 1. Loop Summary");
  lines.push("");
  lines.push(`- Phase: ${summary.phase}`);
  lines.push(`- Generated at: ${summary.generatedAt}`);
  lines.push(`- Commands executed: ${summary.commandResults.length}`);
  lines.push(`- Candidate status: ${candidate}`);
  lines.push("");
  lines.push("## 2. Dependency / PR Context");
  lines.push("");
  if (summary.prNumber !== null) {
    lines.push(`- PR number: ${summary.prNumber}`);
    if (summary.prInfo) {
      lines.push(`- ${summarizeCommandResult(summary.prInfo)}`);
      lines.push("");
      lines.push(codeBlock(summary.prInfo.stdoutSnippet));
    }
  } else {
    lines.push("_(no PR context requested)_");
  }
  lines.push("");
  lines.push("## 3. Git Context");
  lines.push("");
  lines.push(`- Branch: ${summary.branch || "(unknown)"}`);
  lines.push(`- Head commit: ${summary.headCommit || "(unknown)"}`);
  lines.push(`- git status --short:`);
  lines.push("");
  lines.push(codeBlock(summary.gitStatus));
  lines.push("");
  lines.push("## 4. Changed Paths");
  lines.push("");
  if (summary.changedPaths.length > 0) {
    for (const p of summary.changedPaths) lines.push(`- ${p}`);
  } else {
    lines.push("_(none detected relative to HEAD)_");
  }
  lines.push("");
  lines.push("## 5. Validation Commands");
  lines.push("");
  if (summary.validationRequested) {
    lines.push(commandSection(summary.validationResults));
  } else {
    lines.push("_(validation not requested; pass --run-validation to include)_");
  }
  lines.push("");
  lines.push("## 6. PR Checks");
  lines.push("");
  if (summary.prChecks) {
    lines.push(`- ${summarizeCommandResult(summary.prChecks)}`);
    lines.push("");
    lines.push(codeBlock(summary.prChecks.stdoutSnippet));
  } else {
    lines.push("_(no PR checks collected)_");
  }
  lines.push("");
  lines.push("## 7. Candidate Risks");
  lines.push("");
  if (risks.length > 0) {
    for (const risk of risks) lines.push(`- ${risk}`);
  } else {
    lines.push("- No candidate risks detected by collection. Human review is still required.");
  }
  lines.push("");
  lines.push("## 8. Human Review Required");
  lines.push("");
  lines.push("A human reviewer must inspect this report, the diff, and the PR before any decision.");
  lines.push("Automation collects. Rules classify. Humans decide.");
  lines.push("AI proposes. Rules guard. Humans decide.");
  lines.push("");
  lines.push("## 9. Non-authorization Statement");
  lines.push("");
  for (const sentence of HUMAN_REVIEW_BOUNDARY) lines.push(sentence);
  lines.push("");
  lines.push("## 10. Candidate Go / No-Go Assistance");
  lines.push("");
  lines.push(`Candidate status: ${candidate}`);
  lines.push("");
  lines.push(
    "This candidate status is assistance only. It is never a final Go and never a final No-Go.",
  );
  lines.push("A human reviewer must make the final Go / No-Go decision.");
  lines.push("");
  return lines.join("\n");
}

export function formatLoopJsonReport(summary: LoopStatusSummary): string {
  const candidate = classifyCandidateStatus(summary);
  return JSON.stringify(
    {
      phase: summary.phase,
      generatedAt: summary.generatedAt,
      branch: summary.branch,
      headCommit: summary.headCommit,
      changedPaths: summary.changedPaths,
      prNumber: summary.prNumber,
      prInfoCollected: summary.prInfo !== null,
      prChecksCollected: summary.prChecks !== null,
      validationRequested: summary.validationRequested,
      commandResults: summary.commandResults.map((r) => ({
        name: r.name,
        commandLine: r.commandLine,
        exitCode: r.exitCode,
        ok: r.ok,
      })),
      candidateStatus: candidate,
      humanReviewBoundary: HUMAN_REVIEW_BOUNDARY,
      isHumanApproval: false,
      isCiApproval: false,
      isMergeApproval: false,
    },
    null,
    2,
  );
}
