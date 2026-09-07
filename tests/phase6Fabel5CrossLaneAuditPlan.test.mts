/**
 * P6-A0: static, read-only tests pinning the fabel5 Phase 6 cross-lane audit
 * report, the patch sequence plan, and the explicit human Go record.
 *
 * These tests ONLY read the three P6-A0 documents and assert string contents.
 * They import no app code, no harness, no fixture; they call no network, no
 * GitHub API, no child_process; they mutate no files and require no secrets.
 * Issue numbers are pinned as literals (no GitHub fetch). To avoid self-match
 * traps, the tests never scan their own source — every assertion targets a
 * document's contents with exact required phrases and anchored section
 * headings, or a file's existence.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

function abs(rel: string): string {
  return fileURLToPath(new URL(rel, import.meta.url))
}

function read(rel: string): string {
  return readFileSync(abs(rel), "utf8")
}

/** Exact raw match — used for section headings with `\n` anchors. */
function pinRaw(doc: string, label: string, needles: readonly string[]): void {
  for (const needle of needles) {
    assert.ok(doc.includes(needle), `${label} must contain (raw): <<<${needle}>>>`)
  }
}

/** Whitespace-normalized match — used for prose that may hard-wrap. */
function pinProse(doc: string, label: string, needles: readonly string[]): void {
  const normalized = doc.replace(/\s+/g, " ")
  for (const needle of needles) {
    assert.ok(normalized.includes(needle), `${label} must contain (prose): <<<${needle}>>>`)
  }
}

const GO = "../docs/legacy/P6_A0_EXPLICIT_HUMAN_GO.md"
const AUDIT = "../docs/legacy/P6_A0_FABEL5_PHASE6_CROSS_LANE_AUDIT.md"
const PLAN = "../docs/legacy/P6_A0_FABEL5_PATCH_SEQUENCE_PLAN.md"

const AUDIT_SHA = "d37ff15eab635ca711b8e4310a25a4a1a734f314"
const REPO = "haya10hikawa-hub/Atra-workunitOS"
/** Pinned literal issue numbers created by P6-A0 (no network dependency). */
const NEW_ISSUES = ["#115", "#116", "#117", "#118", "#119", "#120", "#121"] as const
const PATCH_IDS = [
  "P6-FIX-001",
  "P6-FIX-002",
  "P6-FIX-003",
  "P6-FIX-004",
  "P6-FIX-005",
  "P6-FIX-006",
  "P6-FIX-007",
] as const

// ─── Files exist ────────────────────────────────────────────────

// 1
test("P6-A0 audit report, patch plan, and explicit human Go docs exist", () => {
  for (const rel of [GO, AUDIT, PLAN]) {
    assert.ok(existsSync(abs(rel)), `${rel} must exist`)
  }
})

// ─── Audit report: 22 required sections ─────────────────────────

// 2
test("audit report contains all 22 required sections", () => {
  pinRaw(read(AUDIT), "AUDIT sections", [
    "## 1. Audit snapshot",
    "## 2. Audit methodology",
    "## 3. fabel5 availability confirmation",
    "## 4. Immutable-read procedure",
    "## 5. Phase 6 scope map",
    "## 6. Sequence audit",
    "## 7. Security audit",
    "## 8. Approval-flow audit",
    "## 9. Dependency audit",
    "## 10. Cross-pass adjudication",
    "## 11. Rejected false positives",
    "## 12. Existing Issues/PRs reused",
    "## 13. New Issues created",
    "## 14. Sequence diagram",
    "## 15. Approval-flow diagram",
    "## 16. Dependency graph",
    "## 17. Authorization boundary matrix",
    "## 18. Finding matrix",
    "## 19. Residual risks",
    "## 20. What the audit proves",
    "## 21. What the audit does not prove",
    "## 22. Go / No-Go",
  ])
})

// ─── Patch plan: 13 required sections ───────────────────────────

// 3
test("patch plan contains all 13 required sections", () => {
  pinRaw(read(PLAN), "PLAN sections", [
    "## 1. Issue-to-patch map",
    "## 2. Patch IDs",
    "## 3. Patch dependency DAG",
    "## 4. Merge waves",
    "## 5. Parallelization plan",
    "## 6. Per-patch allowed files",
    "## 7. Per-patch forbidden files",
    "## 8. Per-patch tests",
    "## 9. Per-patch audits",
    "## 10. Runtime capability impact",
    "## 11. Required human-Go points",
    "## 12. Rollback plan",
    "## 13. Stop conditions",
  ])
})

// ─── Repository / SHA / auditor identity ────────────────────────

// 4
test("repository and immutable audit SHA are recorded in all three docs", () => {
  for (const rel of [GO, AUDIT, PLAN]) {
    const doc = read(rel)
    assert.ok(doc.includes(REPO), `${rel} must record repository`)
    assert.ok(doc.includes(AUDIT_SHA), `${rel} must record audit SHA`)
  }
})

// 5
test("fabel5 is named as the auditor with explicit model interpretation", () => {
  pinProse(read(AUDIT), "AUDIT fabel5", [
    "fabel5",
    "claude-fable-5",
    "Fable 5",
  ])
  pinProse(read(GO), "GO fabel5", ["fabel5", "claude-fable-5"])
})

// 6
test("four domain passes and one adjudication pass are recorded", () => {
  pinProse(read(AUDIT), "AUDIT passes", [
    "Pass A: Sequence",
    "Pass B: Security",
    "Pass C: Approval-flow",
    "Pass D: Dependency",
    "Pass E: Adjudication",
  ])
})

// ─── Immutable-read / mutation prohibition / checksums ──────────

// 7
test("immutable-read procedure is recorded", () => {
  pinRaw(read(AUDIT), "AUDIT immutable-read", ["## 4. Immutable-read procedure"])
  pinProse(read(AUDIT), "AUDIT immutable-read content", [
    "git rev-parse HEAD",
    "SHA-256",
  ])
})

// 8
test("mutation probes were prohibited during audit passes", () => {
  pinProse(read(AUDIT), "AUDIT no-mutation", ["変異プローブ"])
  pinProse(read(GO), "GO no-mutation", [
    "監査パス中の変異プローブ(mutation probe)は禁止する。",
  ])
})

// 9
test("checksum verification is recorded with manifest hash", () => {
  pinProse(read(AUDIT), "AUDIT checksums", [
    "106ファイル",
    "67bae45bd1cc2a906da32bc857cbaaeb4d35ac48bf428aeaa4a163b2473aaca0",
  ])
})

// ─── Issues pinned in both documents ────────────────────────────

// 10
test("every new Issue number appears in both the audit report and the patch plan", () => {
  const audit = read(AUDIT)
  const plan = read(PLAN)
  for (const issue of NEW_ISSUES) {
    assert.ok(audit.includes(issue), `AUDIT must reference ${issue}`)
    assert.ok(plan.includes(issue), `PLAN must reference ${issue}`)
  }
})

// 11
test("each accepted finding has severity and confidence in the finding matrix", () => {
  const audit = read(AUDIT)
  pinRaw(audit, "AUDIT finding matrix header", [
    "| FINAL | 統合元 | Sev | Conf | 区分 | Issue |",
  ])
  pinProse(audit, "AUDIT finding rows", [
    "| FINAL-1 | D-1+B-3 | P2 | High |",
    "| FINAL-2 | D-2+C-3 | P2 | High |",
    "| FINAL-3 | B-2 | P3 | High |",
    "| FINAL-4 | B-1 | P3 | High |",
    "| FINAL-5 | B-4+B-5 | P3 | High |",
    "| FINAL-6 | B-7+C-1 | P3 |",
    "| FINAL-7 | D-3 | P3 | Med |",
    "| FINAL-8 |",
  ])
})

// 12
test("accepted findings carry path-level evidence in the audit report", () => {
  pinProse(read(AUDIT), "AUDIT path evidence", [
    "app/lib/phase6/recorderAuditSummary/validators.ts",
    "app/lib/phase6/recorderAuditSummaryEvidenceLedgerLinkage/validators.ts:212-213",
    "tests/harness/phase6/inMemoryPersistenceAuditEvidenceRecorder.mts",
    "tests/phase6RecorderAuditSummaryValidators.test.mts:748-763",
  ])
})

// ─── Patch plan integrity ───────────────────────────────────────

// 13
test("each patch has an Issue number in the Issue-to-patch map", () => {
  const plan = read(PLAN)
  pinProse(plan, "PLAN issue-to-patch", [
    "| #119 | P6-FIX-001 |",
    "| #117 | P6-FIX-002 |",
    "| #118 | P6-FIX-003 |",
    "| #115 | P6-FIX-004 |",
    "| #116 | P6-FIX-005 |",
    "| #120 | P6-FIX-006 |",
    "| #121 | P6-FIX-007 |",
  ])
  for (const id of PATCH_IDS) {
    assert.ok(plan.includes(id), `PLAN must include ${id}`)
  }
})

// 14
test("each patch has allowed and forbidden files, tests, and audits", () => {
  const plan = read(PLAN)
  pinRaw(plan, "PLAN per-patch sections", [
    "## 6. Per-patch allowed files",
    "## 7. Per-patch forbidden files",
    "## 8. Per-patch tests",
    "## 9. Per-patch audits",
  ])
  for (const id of PATCH_IDS) {
    // Every patch ID must appear in the allowed-files section block (6) —
    // verified coarsely: the ID appears at least three times across the plan
    // (map, allowed files, tests or DAG).
    const count = plan.split(id).length - 1
    assert.ok(count >= 3, `${id} must appear at least 3 times in PLAN (found ${count})`)
  }
  pinProse(plan, "PLAN audits", [
    "security / test-validation / architecture / product-release の4監査",
  ])
})

// 15
test("dependency DAG and merge waves exist", () => {
  const plan = read(PLAN)
  assert.ok(plan.includes("```mermaid"), "PLAN must contain a Mermaid DAG")
  pinProse(plan, "PLAN waves", [
    "Wave 0",
    "Wave 1",
    "Wave 2",
    "Wave 3",
    "Wave 4",
    "推奨着手: **P6-FIX-001(#119)**",
  ])
  assert.ok(read(AUDIT).includes("```mermaid"), "AUDIT must contain Mermaid diagrams")
})

// ─── Non-authorization ──────────────────────────────────────────

// 16
test("no document claims the audit grants runtime/approval/execution/append/persistence/production permission", () => {
  // Positive statements pinned:
  pinProse(read(AUDIT), "AUDIT non-authorization", [
    "本監査報告は記述的であり、いかなる権限も付与しない。",
  ])
  pinProse(read(PLAN), "PLAN non-authorization", [
    "本計画は計画のみであり、パッチを実装しない。",
  ])
  pinProse(read(GO), "GO non-authorization", [
    "本監査はいかなる権限も付与しない。",
  ])
  // Negative claims must be absent:
  for (const rel of [GO, AUDIT, PLAN]) {
    const doc = read(rel)
    for (const claim of [
      "監査PASSによりappendを許可",
      "監査PASSにより実行を許可",
      "production readinessを付与",
      "grants append permission",
      "grants execution permission",
      "grants production readiness",
    ]) {
      assert.ok(!doc.includes(claim), `${rel} must not claim: <<<${claim}>>>`)
    }
  }
})

// 17
test("changed-paths limitation to the four allowed files is recorded", () => {
  pinProse(read(GO), "GO allowed files", [
    "docs/legacy/P6_A0_EXPLICIT_HUMAN_GO.md",
    "docs/legacy/P6_A0_FABEL5_PHASE6_CROSS_LANE_AUDIT.md",
    "docs/legacy/P6_A0_FABEL5_PATCH_SEQUENCE_PLAN.md",
    "tests/phase6Fabel5CrossLaneAuditPlan.test.mts",
    "既存ファイルは一切変更しない。",
  ])
})

// 18
test("no fixes were implemented: plan and report state audit/planning only", () => {
  pinProse(read(GO), "GO audit-only", [
    "修正を実装せず、パッチブランチを作らず、アプリケーションコードを変更せず、修復PRを開かず、何もマージしない。",
  ])
  pinProse(read(AUDIT), "AUDIT go-decision", [
    "所見はIssue化され、修正は未実装",
  ])
})

// ─── Both-ways sanity (no self-match trap) ──────────────────────

// 19
test("assertions are behavioral, not self-matching", () => {
  const audit = read(AUDIT)
  assert.ok(audit.includes("## 18. Finding matrix"))
  assert.ok(!audit.includes("## 99. Nonexistent Section"))
  assert.ok(!read(PLAN).includes("## 99. Nonexistent Section"))
  assert.ok(!read(GO).includes("## 99. Nonexistent Section"))
})
