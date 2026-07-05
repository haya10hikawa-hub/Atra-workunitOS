import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * Loop-I0 loop status collector tests.
 *
 * These tests import only the new loop scripts and use fake CommandRunners.
 * They do NOT call real child_process, the network, the GitHub API, app
 * runtime, D1, SQL, LLM, ApprovalStore, or external actions, and they
 * require no secrets. No files are mutated.
 */

import {
  FORBIDDEN_COMMAND_PATTERNS,
  SAFE_COMMANDS,
  assertCommandAllowed,
  buildReadOnlyStatusCommandPlan,
  buildValidationCommandPlan,
  isCommandAllowed,
} from "../scripts/loop/safeCommandPolicy.mts";
import {
  collectLoopStatus,
  redactSecrets,
  type CommandRunner,
} from "../scripts/loop/loopStatusCollector.mts";
import {
  classifyCandidateStatus,
  formatLoopJsonReport,
  formatLoopMarkdownReport,
} from "../scripts/loop/loopReportFormatter.mts";
import { parseCliArgs, resolveSafeOutputPath } from "../scripts/loop/index.mts";

function makeFakeRunner(
  outputs: Partial<Record<string, { exitCode: number | null; stdout: string; stderr: string }>>,
): CommandRunner {
  return (executable, args) => {
    const line = [executable, ...args].join(" ");
    for (const [key, value] of Object.entries(outputs)) {
      if (line.startsWith(key) && value) return value;
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  };
}

const happyGitOutputs = {
  "git status --short": { exitCode: 0, stdout: " M docs/example.md\n", stderr: "" },
  "git branch --show-current": { exitCode: 0, stdout: "tooling/loop-status-collector\n", stderr: "" },
  "git rev-parse HEAD": { exitCode: 0, stdout: "00ca406d486b6a61c3a37e7448ace1f7f64fc13f\n", stderr: "" },
  "git diff --name-only HEAD": { exitCode: 0, stdout: "docs/a.md\nscripts/loop/index.mts\n", stderr: "" },
};

// 1. safe command policy allows known read-only git commands
test("safe command policy allows known read-only git commands", () => {
  assert.ok(isCommandAllowed("git_status_short", "git", ["status", "--short"]));
  assert.ok(isCommandAllowed("git_rev_parse_head", "git", ["rev-parse", "HEAD"]));
  assert.ok(isCommandAllowed("git_branch_show_current", "git", ["branch", "--show-current"]));
  assert.ok(isCommandAllowed("git_diff_name_only", "git", ["diff", "--name-only", "HEAD"]));
  assert.ok(isCommandAllowed("git_diff_check", "git", ["diff", "--check"]));
});

// 2. safe command policy allows known read-only gh commands
test("safe command policy allows known read-only gh commands", () => {
  const view = SAFE_COMMANDS.gh_pr_view;
  assert.ok(isCommandAllowed(view.name, view.executable, [...view.args, "87"]));
  const checks = SAFE_COMMANDS.gh_pr_checks;
  assert.ok(isCommandAllowed(checks.name, checks.executable, [...checks.args, "87"]));
  assert.doesNotThrow(() => assertCommandAllowed(view.name, view.executable, [...view.args, "87"]));
});

// 3. safe command policy allows approved validation commands
test("safe command policy allows approved validation commands", () => {
  const plan = buildValidationCommandPlan();
  const names = plan.map((p) => p.name);
  assert.deepEqual(names, [
    "npm_test",
    "npm_alpha_safety_gate",
    "npm_lint",
    "npm_build",
    "npm_cf_build",
    "npm_electron_build_check",
    "git_diff_check",
  ]);
  for (const planned of plan) {
    assert.ok(isCommandAllowed(planned.name, planned.executable, planned.args));
  }
});

// 4. safe command policy rejects gh pr merge
test("safe command policy rejects gh pr merge", () => {
  assert.equal(isCommandAllowed("gh_pr_view", "gh", ["pr", "merge", "87"]), false);
  assert.equal(isCommandAllowed("gh_pr_merge", "gh", ["pr", "merge", "87"]), false);
  assert.throws(() => assertCommandAllowed("gh_pr_view", "gh", ["pr", "merge", "87"]));
  assert.ok(FORBIDDEN_COMMAND_PATTERNS.includes("gh pr merge"));
});

// 5. safe command policy rejects git push
test("safe command policy rejects git push", () => {
  assert.equal(isCommandAllowed("git_status_short", "git", ["push"]), false);
  assert.equal(isCommandAllowed("git_push", "git", ["push", "origin", "main"]), false);
  assert.ok(FORBIDDEN_COMMAND_PATTERNS.includes("git push"));
});

// 6. safe command policy rejects deploy/publish/release/tag/upload commands
test("safe command policy rejects deploy/publish/release/tag/upload commands", () => {
  assert.equal(isCommandAllowed("wrangler_deploy", "wrangler", ["deploy"]), false);
  assert.equal(isCommandAllowed("npm_publish", "npm", ["publish"]), false);
  assert.equal(isCommandAllowed("gh_release", "gh", ["release", "create", "v1"]), false);
  assert.equal(isCommandAllowed("git_tag", "git", ["tag", "v1"]), false);
  assert.equal(isCommandAllowed("artifact_upload", "gh", ["upload", "artifact"]), false);
  for (const pattern of ["deploy", "publish", "release", "upload", "git tag", "d1 execute"]) {
    assert.ok(
      FORBIDDEN_COMMAND_PATTERNS.includes(pattern),
      `forbidden patterns must include ${pattern}`,
    );
  }
});

// 7. safe command policy is deny-by-default
test("safe command policy is deny-by-default", () => {
  assert.equal(isCommandAllowed("some_new_command", "echo", ["hello"]), false);
  assert.equal(isCommandAllowed("", "git", ["status", "--short"]), false);
  // exact spec match required: wrong executable
  assert.equal(isCommandAllowed("git_status_short", "sh", ["status", "--short"]), false);
  // exact spec match required: extra args on a non-PR command
  assert.equal(isCommandAllowed("git_status_short", "git", ["status", "--short", "--porcelain"]), false);
  // PR argument must be numeric
  assert.equal(
    isCommandAllowed("gh_pr_view", "gh", [...SAFE_COMMANDS.gh_pr_view.args, "87; git push"]),
    false,
  );
});

// 8. collector collects git context with fake runner
test("collector collects git context with fake runner", async () => {
  const summary = await collectLoopStatus({
    phase: "P6-I0",
    runner: makeFakeRunner(happyGitOutputs),
  });
  assert.equal(summary.phase, "P6-I0");
  assert.equal(summary.branch, "tooling/loop-status-collector");
  assert.equal(summary.headCommit, "00ca406d486b6a61c3a37e7448ace1f7f64fc13f");
  assert.ok(summary.gitStatus.includes("M docs/example.md"));
  assert.deepEqual(summary.changedPaths, ["docs/a.md", "scripts/loop/index.mts"]);
  assert.equal(summary.prNumber, null);
  assert.equal(summary.prInfo, null);
  assert.equal(summary.prChecks, null);
});

// 9. collector collects PR context with fake runner
test("collector collects PR context with fake runner", async () => {
  const summary = await collectLoopStatus({
    phase: "P6-I0",
    prNumber: 87,
    runner: makeFakeRunner({
      ...happyGitOutputs,
      "gh pr view": {
        exitCode: 0,
        stdout: '{"number":87,"title":"tooling: add loop status collector","state":"OPEN"}',
        stderr: "",
      },
      "gh pr checks": { exitCode: 0, stdout: "validate\tpass\t1m2s\n", stderr: "" },
    }),
  });
  assert.equal(summary.prNumber, 87);
  assert.ok(summary.prInfo);
  assert.ok(summary.prInfo?.stdoutSnippet.includes('"number":87'));
  assert.ok(summary.prChecks);
  assert.ok(summary.prChecks?.stdoutSnippet.includes("validate"));
});

// 10. collector skips validation unless --run-validation equivalent is true
test("collector skips validation unless runValidation is true", async () => {
  const executed: string[] = [];
  const runner: CommandRunner = (executable, args) => {
    executed.push([executable, ...args].join(" "));
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  const summary = await collectLoopStatus({ phase: "P6-I0", runner });
  assert.equal(summary.validationRequested, false);
  assert.equal(summary.validationResults.length, 0);
  assert.ok(!executed.some((line) => line.startsWith("npm")));
});

// 11. collector records validation command results when requested
test("collector records validation command results when requested", async () => {
  const summary = await collectLoopStatus({
    phase: "P6-I0",
    runValidation: true,
    runner: makeFakeRunner({
      ...happyGitOutputs,
      "npm test": { exitCode: 0, stdout: "tests 100 pass 100\n", stderr: "" },
      "npm run lint": { exitCode: 0, stdout: "clean\n", stderr: "" },
    }),
  });
  assert.equal(summary.validationRequested, true);
  assert.equal(summary.validationResults.length, 7);
  const testResult = summary.validationResults.find((r) => r.name === "npm_test");
  assert.ok(testResult);
  assert.equal(testResult?.ok, true);
  assert.ok(testResult?.stdoutSnippet.includes("tests 100 pass 100"));
});

// 12. collector handles failed command without throwing
test("collector handles failed command without throwing", async () => {
  const summary = await collectLoopStatus({
    phase: "P6-I0",
    prNumber: 87,
    runner: makeFakeRunner({
      ...happyGitOutputs,
      "gh pr view": { exitCode: 1, stdout: "", stderr: "GraphQL: Could not resolve" },
    }),
  });
  assert.equal(summary.prInfo?.ok, false);
  assert.equal(summary.prInfo?.exitCode, 1);
  assert.ok(summary.prInfo?.stderrSnippet.includes("Could not resolve"));

  const throwingRunner: CommandRunner = (executable) => {
    if (executable === "gh") throw new Error("gh not installed");
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  const summary2 = await collectLoopStatus({ phase: "P6-I0", prNumber: 87, runner: throwingRunner });
  assert.equal(summary2.prInfo?.ok, false);
  assert.equal(summary2.prInfo?.exitCode, null);
  assert.ok(summary2.prInfo?.stderrSnippet.includes("gh not installed"));
});

// 13. collector redacts likely secret-like output
test("collector redacts likely secret-like output", async () => {
  const leakyStdout = [
    "token=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456",
    "api_key=sk-abcdefghijklmnopqrstuvwxyz123456",
    "Authorization: Bearer abcdef1234567890abcdef",
    "AWS_SECRET=AKIAIOSFODNN7EXAMPLE",
  ].join("\n");
  const summary = await collectLoopStatus({
    phase: "P6-I0",
    runner: makeFakeRunner({
      ...happyGitOutputs,
      "git status --short": { exitCode: 0, stdout: leakyStdout, stderr: "" },
    }),
  });
  const snippet = summary.gitStatus;
  assert.ok(!snippet.includes("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456"), "gh token must be redacted");
  assert.ok(!snippet.includes("sk-abcdefghijklmnopqrstuvwxyz123456"), "api key must be redacted");
  assert.ok(!snippet.includes("AKIAIOSFODNN7EXAMPLE"), "aws key must be redacted");
  assert.ok(snippet.includes("[REDACTED]"));
  // unit-level check on the redactor as well
  assert.ok(!redactSecrets("password=hunter2secret").includes("hunter2secret"));
});

// 14. formatter includes required Markdown sections
test("formatter includes required Markdown sections", async () => {
  const summary = await collectLoopStatus({
    phase: "P6-I0",
    runner: makeFakeRunner(happyGitOutputs),
  });
  const markdown = formatLoopMarkdownReport(summary);
  for (const section of [
    "## 1. Loop Summary",
    "## 2. Dependency / PR Context",
    "## 3. Git Context",
    "## 4. Changed Paths",
    "## 5. Validation Commands",
    "## 6. PR Checks",
    "## 7. Candidate Risks",
    "## 8. Human Review Required",
    "## 9. Non-authorization Statement",
    "## 10. Candidate Go / No-Go Assistance",
  ]) {
    assert.ok(markdown.includes(section), `report must contain section ${section}`);
  }
});

// 15. formatter includes human review boundary
test("formatter includes human review boundary", async () => {
  const summary = await collectLoopStatus({
    phase: "P6-I0",
    runner: makeFakeRunner(happyGitOutputs),
  });
  const markdown = formatLoopMarkdownReport(summary);
  for (const sentence of [
    "This report is not human approval.",
    "This report is not CI approval.",
    "This report is not merge approval.",
    "A human reviewer must make the final Go / No-Go decision.",
    "Automation collects. Rules classify. Humans decide.",
    "AI proposes. Rules guard. Humans decide.",
  ]) {
    assert.ok(markdown.includes(sentence), `report must contain: ${sentence}`);
  }
});

// 16. formatter does not claim final Go
test("formatter does not claim final Go", async () => {
  const summary = await collectLoopStatus({
    phase: "P6-I0",
    runner: makeFakeRunner(happyGitOutputs),
  });
  const status = classifyCandidateStatus(summary);
  assert.ok(
    ["candidate_go_assistance", "candidate_no_go_assistance", "candidate_insufficient_data"].includes(
      status,
    ),
  );
  const markdown = formatLoopMarkdownReport(summary);
  // "final Go" may appear only when delegating to humans ("the final Go /
  // No-Go decision") or when denying it ("never a final Go"); the report
  // must never assert a final Go itself.
  const withoutAllowedPhrases = markdown
    .replace(/final Go \/ No-Go decision/gi, "")
    .replace(/never a final Go/gi, "");
  assert.ok(!/\bfinal\s+go\b/i.test(withoutAllowedPhrases), "report must not claim a final Go");
  assert.ok(markdown.includes("never a final Go"));
  assert.ok(!markdown.includes("Final decision: Go"));

  const failing = await collectLoopStatus({
    phase: "P6-I0",
    runner: makeFakeRunner({
      ...happyGitOutputs,
      "git status --short": { exitCode: 1, stdout: "", stderr: "boom" },
    }),
  });
  assert.equal(classifyCandidateStatus(failing), "candidate_no_go_assistance");
});

// 17. formatter produces JSON summary
test("formatter produces JSON summary", async () => {
  const summary = await collectLoopStatus({
    phase: "P6-I0",
    prNumber: 87,
    runner: makeFakeRunner(happyGitOutputs),
  });
  const parsed = JSON.parse(formatLoopJsonReport(summary));
  assert.equal(parsed.phase, "P6-I0");
  assert.equal(parsed.prNumber, 87);
  assert.equal(parsed.branch, "tooling/loop-status-collector");
  assert.ok(Array.isArray(parsed.changedPaths));
  assert.ok(Array.isArray(parsed.commandResults));
  assert.equal(parsed.isHumanApproval, false);
  assert.equal(parsed.isCiApproval, false);
  assert.equal(parsed.isMergeApproval, false);
  assert.ok(Array.isArray(parsed.humanReviewBoundary));
});

// 18. CLI argument parser rejects missing phase
test("CLI argument parser rejects missing phase", () => {
  assert.throws(() => parseCliArgs([]), /--phase/);
  assert.throws(() => parseCliArgs(["--pr", "87"]), /--phase/);
  assert.throws(() => parseCliArgs(["--phase"]), /Missing value/);
  const parsed = parseCliArgs(["--phase", "P6-I0", "--pr", "87", "--run-validation"]);
  assert.equal(parsed.phase, "P6-I0");
  assert.equal(parsed.prNumber, 87);
  assert.equal(parsed.runValidation, true);
  assert.throws(() => parseCliArgs(["--phase", "P6-I0", "--pr", "abc"]), /Invalid --pr/);
  assert.throws(() => parseCliArgs(["--phase", "P6-I0", "--frobnicate"]), /Unknown argument/);
});

// 19. output path guard rejects path traversal
test("output path guard rejects path traversal", () => {
  const root = "/repo/example";
  assert.throws(() => resolveSafeOutputPath(root, "../outside.md"), /Unsafe output path/);
  assert.throws(() => resolveSafeOutputPath(root, "/etc/passwd"), /Unsafe output path/);
  assert.throws(() => resolveSafeOutputPath(root, "a/../../outside.md"), /Unsafe output path/);
  assert.throws(() => resolveSafeOutputPath(root, "."), /must be a file inside/);
  const ok = resolveSafeOutputPath(root, ".loop-reports/p6-i0.md");
  assert.equal(ok, "/repo/example/.loop-reports/p6-i0.md");
});

// 20. no mutation commands appear in command plans
test("no mutation commands appear in command plans", () => {
  const plans = [
    ...buildReadOnlyStatusCommandPlan(87),
    ...buildReadOnlyStatusCommandPlan(),
    ...buildValidationCommandPlan(),
  ];
  const mutationFragments = [
    "merge",
    "push",
    "tag",
    "reset",
    "clean",
    "deploy",
    "publish",
    "release",
    "upload",
    "close",
    "edit",
    "create",
    "execute",
  ];
  for (const planned of plans) {
    const line = [planned.executable, ...planned.args].join(" ").toLowerCase();
    for (const fragment of mutationFragments) {
      assert.ok(
        !line.split(" ").includes(fragment),
        `plan must not contain mutation word ${fragment}: ${line}`,
      );
    }
  }
});
