import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";

const RECORD_PATH = "docs/PHASE6_IMPLEMENTATION_DECISION_RECORD.md";
const PLAYBOOK_PATH = "docs/PHASE6_LOOP_ENGINEERING_PLAYBOOK.md";

const record = existsSync(RECORD_PATH) ? readFileSync(RECORD_PATH, "utf8") : "";
const playbook = existsSync(PLAYBOOK_PATH) ? readFileSync(PLAYBOOK_PATH, "utf8") : "";

function requireAll(doc: string, label: string, needles: string[]): void {
  for (const needle of needles) {
    assert.ok(doc.includes(needle), `${label} must contain: ${JSON.stringify(needle)}`);
  }
}

test("P6.15 docs exist", () => {
  assert.ok(existsSync(RECORD_PATH), `${RECORD_PATH} must exist`);
  assert.ok(existsSync(PLAYBOOK_PATH), `${PLAYBOOK_PATH} must exist`);
  assert.ok(record.length > 0, "record doc must be non-empty");
  assert.ok(playbook.length > 0, "playbook doc must be non-empty");
});

test("DECISION_RECORD contains all required sections", () => {
  requireAll(record, "record", [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of Phase 6 Implementation Decision Record",
    "## 4. What This Record Is Not",
    "## 5. Product and Safety Invariants",
    "## 6. Phase 6 Capability Inventory",
    "## 7. Implementation Decision Summary",
    "## 8. Runtime Artifact Boundary Decisions",
    "## 9. Lineage, ID, and Hash Decisions",
    "## 10. Tenant Scope and Authorization Boundary Decisions",
    "## 11. Validation and Schema Strategy",
    "## 12. Storage, Migration, and Persistence Decisions",
    "## 13. Query, D1, and SQL Execution Decisions",
    "## 14. LLM, GraphRAG, and Vector Decisions",
    "## 15. Evidence, Judgment, and Human Decision Decisions",
    "## 16. Approval, Promotion, and Execution Boundary Decisions",
    "## 17. Loop Engineering Readiness Decision",
    "## 18. No-Go Conditions",
    "## 19. Recommended Implementation Sequence",
    "## 20. Non-authorization Statement",
  ]);
});

test("DECISION_RECORD contains the definition sentence and Japanese conceptual sentence", () => {
  requireAll(record, "record", [
    "The Phase 6 Implementation Decision Record decides how the documented Phase 6 query, evidence, judgment, and human decision spine may be implemented through gated, non-authorizing, validation-first loops without enabling SQL execution, D1 access, real LLM, GraphRAG, approval, promotion, or external action execution.",
    "Phase 6 Implementation Decision Recordとは、Phase 6で定義されたquery・evidence・judgment・human decision spineを、SQL実行・D1アクセス・real LLM・GraphRAG・approval・promotion・external action executionを有効化せずに、gated・non-authorizing・validation-firstなloopで実装するための決定記録である。",
    "Phase 6 runtime implementation must begin with non-authorizing, tenant-scoped, validation-first artifact construction. No loop may execute SQL, access D1, call real LLMs, authorize approval, promote WorkUnits, or execute external actions until the corresponding future gate explicitly permits it.",
    "Phase 6 runtime implementationは、非認可・tenant-scoped・validation-firstなartifact constructionから開始しなければならない。対応するfuture gateが明示的に許可するまで、SQL実行・D1アクセス・real LLM呼び出し・approval認可・WorkUnit昇格・external action実行を行ってはならない。",
  ]);
});

test("DECISION_RECORD contains all not-record items", () => {
  requireAll(record, "record", [
    "- runtime implementation\n",
    "- runtime query execution\n",
    "- D1 access\n",
    "- SQL execution\n",
    "- real LLM enablement\n",
    "- GraphRAG implementation\n",
    "- vector storage\n",
    "- ApprovalStore integration\n",
    "- external action enablement\n",
    "- Formal WorkUnit promotion\n",
    "- deployment approval\n",
    "- production readiness by itself\n",
  ]);
});

test("DECISION_RECORD contains product and safety invariants", () => {
  requireAll(record, "record", [
    "AI proposes. Rules guard. Humans decide.",
    "Phase 6 implementation must be non-authorizing by default.",
    "No Phase 6 implementation loop may authorize approval.",
    "No Phase 6 implementation loop may authorize action.",
    "No Phase 6 implementation loop may promote a WorkUnit Candidate into a Formal WorkUnit.",
    "No Phase 6 implementation loop may execute SQL without a separate gate.",
    "No Phase 6 implementation loop may access D1 without a separate gate.",
    "No Phase 6 implementation loop may call real LLM without a separate gate.",
    "No Phase 6 implementation loop may use GraphRAG without a separate gate.",
    "No Phase 6 implementation loop may execute external actions.",
  ]);
});

test("DECISION_RECORD contains the Phase 6 capability inventory", () => {
  requireAll(record, "record", [
    "- Query Intent\n",
    "- Safe Query Plan\n",
    "- Compiled SQL Artifact\n",
    "- Rule Review Record\n",
    "- Query Result Record\n",
    "- Evidence Review Record\n",
    "- LLM Judgment Record\n",
    "- Human Decision Record\n",
    "- Evidence Acceptance state\n",
    "- Decision Impact Scope\n",
    "- ready_for_future_gate_review\n",
    "- Approval seam\n",
    "- Promotion seam\n",
    "- Execution seam\n",
    "- Ledger linkage seam\n",
    "- Graph linkage seam\n",
  ]);
});

test("DECISION_RECORD contains implementation decision summary", () => {
  requireAll(record, "record", [
    "First implementation loop must implement shared TypeScript types and validators only.",
    "Second implementation loop may implement pure artifact constructors with no storage.",
    "Third implementation loop may implement fixture-based in-memory pipeline tests.",
    "Runtime persistence requires a separate persistence gate.",
    "D1 execution requires a separate D1 execution implementation gate.",
    "SQL execution requires a separate SQL execution gate.",
    "Real LLM requires a separate real LLM enablement gate.",
    "GraphRAG requires a separate GraphRAG gate.",
    "ApprovalStore wiring remains blocked.",
    "External action execution remains blocked.",
    "Formal WorkUnit promotion remains blocked.",
  ]);
});

test("DECISION_RECORD contains runtime artifact boundary decisions", () => {
  requireAll(record, "record", [
    "Each Phase 6 artifact must have a runtime type before it has storage.",
    "Each Phase 6 artifact must have a validator before it has a constructor.",
    "Each Phase 6 artifact must have fixture tests before runtime integration.",
    "Artifact constructors must be pure functions in the first implementation loops.",
    "Artifact constructors must not perform network, database, D1, SQL, LLM, ApprovalStore, or external action calls.",
  ]);
});

test("DECISION_RECORD contains lineage, ID, and hash decisions", () => {
  requireAll(record, "record", [
    "All artifacts must carry tenant_id.",
    "All artifacts must carry stable artifact ids.",
    "All downstream artifacts must reference upstream artifact ids.",
    "All hash fields must use 64-character lowercase hex SHA-256 unless a later gate explicitly changes the algorithm.",
    "Content integrity references must use sha256:<64 lowercase hex>.",
    "Lineage mismatch must fail closed.",
    "Missing lineage ids must fail closed.",
  ]);
});

test("DECISION_RECORD contains tenant scope and authorization boundary decisions", () => {
  requireAll(record, "record", [
    "tenant_id is required on every runtime artifact.",
    "Cross-tenant lineage is No-Go.",
    "Tenant scope must be validated before artifact construction succeeds.",
    "Artifact validity is not authorization.",
    "Artifact construction is not approval.",
    "Artifact construction is not action authorization.",
    "Artifact construction is not execution.",
  ]);
});

test("DECISION_RECORD contains validation and schema strategy", () => {
  requireAll(record, "record", [
    "Validators must be implemented before constructors.",
    "Validators must return structured pass/fail results.",
    "Validation errors must be explicit and stable.",
    "Validation must fail closed on unknown critical fields.",
    "Validation must distinguish missing fields from null fields.",
    "Validation must preserve explicit nulls where allowed.",
    "Validation must reject no_go_flags unless the artifact type explicitly allows blocked states.",
  ]);
});

test("DECISION_RECORD contains storage, migration, and persistence decisions", () => {
  requireAll(record, "record", [
    "No persistence in the first implementation loop.",
    "No D1 migrations in the first implementation loop.",
    "No runtime storage backend in the first implementation loop.",
    "Persistence requires a separate storage gate.",
    "Migration requires a separate migration gate.",
    "Runtime audit storage requires a separate audit implementation gate.",
  ]);
});

test("DECISION_RECORD contains query, D1, and SQL execution decisions", () => {
  requireAll(record, "record", [
    "Query Intent runtime type and validator may be implemented before NL2SQL runtime.",
    "Safe Query Plan runtime type and validator may be implemented before plan generation runtime.",
    "Compiled SQL Artifact runtime type and validator may be implemented before SQL compilation runtime.",
    "SQL string generation remains blocked until a separate SQL compilation implementation gate.",
    "D1 execution remains blocked until a separate D1 read-only execution implementation gate.",
    "No mutation SQL may be introduced.",
  ]);
});

test("DECISION_RECORD contains LLM, GraphRAG, and vector decisions", () => {
  requireAll(record, "record", [
    "Runtime LLM judgment remains blocked.",
    "Real LLM remains blocked.",
    "Mock-only fixture-based tests may be used if they do not call providers.",
    "GraphRAG remains blocked.",
    "Vectorization remains blocked.",
    "Model confidence must not authorize anything.",
    "LLM outputs must remain non-authorizing in future gates.",
  ]);
});

test("DECISION_RECORD contains evidence, judgment, and human decision decisions", () => {
  requireAll(record, "record", [
    "Evidence Review Record runtime types may be implemented before evidence storage.",
    "LLM Judgment Record runtime types may be implemented before runtime LLM.",
    "Human Decision Record runtime types may be implemented before runtime decision storage.",
    "Evidence Acceptance state may be represented in types before persistence.",
    "Human Decision Record may support future gates only.",
  ]);
});

test("DECISION_RECORD contains approval, promotion, and execution boundary decisions", () => {
  requireAll(record, "record", [
    "Approval seam remains future-gated.",
    "Promotion seam remains future-gated.",
    "Execution seam remains future-gated.",
    "ApprovalStore integration remains blocked.",
    "Canonical Approval Payload / TSP utility wiring remains blocked.",
    "External action execution remains blocked.",
    "Human Decision Record may be an input to future gates, but not an authorization by itself.",
  ]);
});

test("DECISION_RECORD contains loop engineering readiness decision", () => {
  requireAll(record, "record", [
    "Loop engineering may start only with type/validator loops.",
    "Each loop must have one narrow objective.",
    "Each loop must create one PR.",
    "Each loop must include isolated tests.",
    "Each loop must run full validation.",
    "Each loop must include security, test, architecture, and product audits.",
    "Each loop must stop on forbidden path changes.",
    "Each loop must stop on runtime authorization changes.",
  ]);
});

test("DECISION_RECORD contains all No-Go conditions", () => {
  requireAll(record, "record", [
    "- p6_14_not_merged\n",
    "- missing_foundation_file\n",
    "- missing_main_safety_gate\n",
    "- ruleset_weakened\n",
    "- runtime_behavior_change\n",
    "- approval_authorization_added\n",
    "- action_authorization_added\n",
    "- external_action_execution_added\n",
    "- formal_workunit_promotion_added\n",
    "- sql_execution_added\n",
    "- d1_access_added\n",
    "- real_llm_enabled\n",
    "- graphrag_added\n",
    "- vector_storage_added\n",
    "- runtime_storage_added_without_gate\n",
    "- migration_added_without_gate\n",
    "- approvalstore_wiring_added\n",
    "- p7_1_tsp_wiring_added\n",
    "- cross_tenant_lineage_allowed\n",
    "- lineage_mismatch_allowed\n",
    "- no_go_flags_ignored\n",
    "- validation_not_fail_closed\n",
    "- loop_without_tests\n",
    "- loop_without_full_validation\n",
    "- loop_without_audits\n",
  ]);
});

test("DECISION_RECORD contains recommended implementation sequence", () => {
  requireAll(record, "record", [
    "P6-I0 — Phase 6 shared type definitions and validators.",
    "P6-I1 — Pure artifact constructors with no storage.",
    "P6-I2 — Fixture-based end-to-end spine construction test.",
    "P6-I3 — In-memory non-persistent pipeline harness.",
    "P6-I4 — Storage gate spec.",
    "P6-I5 — Persistence implementation gate.",
    "P6-I6 — D1 read-only execution implementation gate.",
    "P6-I7 — Evidence / judgment / decision storage gate.",
    "P6-I8 — Ledger / graph linkage gate.",
    "P6-I9 — Query-lineage approval seam gate.",
    "P7.2B must remain blocked until P6-I0 through P6-I3 and approval seam requirements are stable.",
  ]);
});

test("DECISION_RECORD contains the non-authorization statement", () => {
  requireAll(record, "record", [
    "This Phase 6 Implementation Decision Record authorizes no runtime implementation, no SQL execution, no D1 access, no real LLM enablement, no GraphRAG implementation, no vectorization, no ApprovalStore integration, no external action execution, no Formal WorkUnit promotion, no deployment, and no automated decision-making.",
  ]);
});

test("PLAYBOOK contains all required sections", () => {
  requireAll(playbook, "playbook", [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of Loop Engineering for Phase 6",
    "## 4. What Loop Engineering Is Not",
    "## 5. Loop Principles",
    "## 6. Loop Types",
    "## 7. Standard Loop Template",
    "## 8. Required Loop Inputs",
    "## 9. Required Loop Outputs",
    "## 10. Validation Requirements",
    "## 11. Audit Requirements",
    "## 12. Stop Conditions",
    "## 13. PR Slicing Strategy",
    "## 14. Regression Protection Strategy",
    "## 15. Human Review and Merge Policy",
    "## 16. Loop Sequence for Phase 6 Implementation",
    "## 17. Non-authorization Statement",
  ]);
});

test("PLAYBOOK contains the definition sentence and Japanese conceptual sentence", () => {
  requireAll(playbook, "playbook", [
    "Loop Engineering for Phase 6 is the controlled practice of implementing one narrow, non-authorizing capability per loop, with explicit scope, isolated tests, full validation, audits, and stop conditions before the next loop begins.",
    "Phase 6のLoop Engineeringとは、各loopで一つの狭い非認可capabilityだけを実装し、scope・isolated tests・full validation・audits・stop conditionsを明示してから次のloopへ進む制御された実装手法である。",
  ]);
});

test("PLAYBOOK contains all not-playbook items", () => {
  requireAll(playbook, "playbook", [
    "- background autonomous implementation\n",
    "- unbounded agent execution\n",
    "- runtime authorization\n",
    "- external action execution\n",
    "- deployment automation\n",
    "- merge automation\n",
    "- bypass of human review\n",
    "- replacement for tests\n",
    "- replacement for audits\n",
  ]);
});

test("PLAYBOOK contains loop principles", () => {
  requireAll(playbook, "playbook", [
    "One loop, one objective.",
    "One loop, one PR.",
    "No mixed docs/runtime changes unless explicitly allowed.",
    "No storage before types and validators.",
    "No execution before validation.",
    "No real LLM before mockless readiness gates.",
    "No ApprovalStore wiring before approval seam gates.",
    "No external action before execution gates.",
    "Stop on ambiguity.",
    "Stop on forbidden path changes.",
    "Stop on validation failure.",
  ]);
});

test("PLAYBOOK contains all loop types", () => {
  requireAll(playbook, "playbook", [
    "- docs_only_spec_loop\n",
    "- type_validator_loop\n",
    "- pure_constructor_loop\n",
    "- fixture_pipeline_loop\n",
    "- in_memory_harness_loop\n",
    "- storage_gate_loop\n",
    "- persistence_implementation_loop\n",
    "- execution_gate_loop\n",
    "- approval_seam_loop\n",
    "- release_readiness_loop\n",
  ]);
});

test("PLAYBOOK contains standard loop template fields", () => {
  requireAll(playbook, "playbook", [
    "- loop_id\n",
    "- phase\n",
    "- objective\n",
    "- allowed_files\n",
    "- forbidden_files\n",
    "- dependencies\n",
    "- implementation_boundary\n",
    "- non_authorization_boundary\n",
    "- tests_required\n",
    "- validation_required\n",
    "- audits_required\n",
    "- rollback_plan\n",
    "- stop_conditions\n",
    "- PR_title\n",
    "- PR_body\n",
    "- final_report\n",
  ]);
});

test("PLAYBOOK contains required loop inputs", () => {
  requireAll(playbook, "playbook", [
    "- merged dependency PRs\n",
    "- foundation docs\n",
    "- existing runtime inventory\n",
    "- allowed file list\n",
    "- forbidden file list\n",
    "- expected test plan\n",
    "- expected validation commands\n",
    "- expected audit criteria\n",
    "- explicit Go / No-Go conditions\n",
  ]);
});

test("PLAYBOOK contains required loop outputs", () => {
  requireAll(playbook, "playbook", [
    "- changed files list\n",
    "- isolated test result\n",
    "- full validation result\n",
    "- audit matrix\n",
    "- risk summary\n",
    "- PR number\n",
    "- validate result\n",
    "- final Go / No-Go\n",
  ]);
});

test("PLAYBOOK contains validation requirements", () => {
  requireAll(playbook, "playbook", [
    "Every loop must run isolated tests.",
    "Every loop must run npm test.",
    "Every loop must run alpha:safety-gate.",
    "Every loop must run lint.",
    "Every loop must run build.",
    "Every loop must run cf:build.",
    "Every loop must run electron:build:check.",
    "Every loop must run git diff --check.",
    "Every loop must report git status --short.",
  ]);
});

test("PLAYBOOK contains audit requirements", () => {
  requireAll(playbook, "playbook", [
    "Every loop must run security-red-team-auditor.",
    "Every loop must run test-validation-auditor.",
    "Every loop must run architecture-mapper.",
    "Every loop must run product-release-auditor.",
    "If an auditor is unavailable, use the closest available agent and explicitly state the substitution.",
  ]);
});

test("PLAYBOOK contains stop conditions", () => {
  requireAll(playbook, "playbook", [
    "- dependency_not_merged\n",
    "- forbidden_path_changed\n",
    "- runtime_authorization_added\n",
    "- external_action_added\n",
    "- real_llm_enabled\n",
    "- d1_execution_added\n",
    "- sql_execution_added\n",
    "- storage_added_without_gate\n",
    "- migration_added_without_gate\n",
    "- validation_failed\n",
    "- audit_failed\n",
    "- unclear_mapping\n",
    "- tenant_boundary_ambiguous\n",
    "- lineage_boundary_ambiguous\n",
    "- rollback_missing\n",
  ]);
});

test("PLAYBOOK contains PR slicing strategy", () => {
  requireAll(playbook, "playbook", [
    "P6-I0 must contain only types, validators, docs, and tests.",
    "P6-I1 must contain only pure constructors and tests.",
    "P6-I2 must contain only fixtures and pipeline tests.",
    "P6-I3 must contain only in-memory harness code and tests.",
    "Storage must be a separate PR.",
    "D1 execution must be a separate PR.",
    "LLM runtime must be a separate PR.",
    "Approval seam must be a separate PR.",
    "External action execution must not be part of Phase 6 implementation loops.",
  ]);
});

test("PLAYBOOK contains regression protection strategy", () => {
  requireAll(playbook, "playbook", [
    "Static docs gates remain active.",
    "Existing P6 tests must remain passing.",
    "Existing P7.1 tests must remain passing.",
    "No loop may weaken Main Safety Gate.",
    "No loop may modify workflows without a separate gate.",
    "No loop may remove non-authorization statements.",
    "No loop may weaken tenant scope.",
    "No loop may weaken human review boundaries.",
  ]);
});

test("PLAYBOOK contains human review and merge policy", () => {
  requireAll(playbook, "playbook", [
    "No loop may merge itself.",
    "Human review is required before merge.",
    "SubAgent audit pass is not human approval.",
    "CI pass is not human approval.",
    "Claude Code final report is not human approval.",
  ]);
});

test("PLAYBOOK contains loop sequence for Phase 6 implementation", () => {
  requireAll(playbook, "playbook", [
    "1. P6-I0 shared type definitions and validators.",
    "2. P6-I1 pure artifact constructors.",
    "3. P6-I2 fixture-based spine construction.",
    "4. P6-I3 in-memory non-persistent pipeline harness.",
    "5. P6-I4 storage gate spec.",
    "6. P6-I5 persistence implementation gate.",
    "7. P6-I6 D1 read-only execution implementation gate.",
    "8. P6-I7 evidence / judgment / decision storage gate.",
    "9. P6-I8 ledger / graph linkage gate.",
    "10. P6-I9 query-lineage approval seam gate.",
  ]);
});

test("PLAYBOOK contains the non-authorization statement", () => {
  requireAll(playbook, "playbook", [
    "This Phase 6 Loop Engineering Playbook authorizes no runtime implementation by itself, no SQL execution, no D1 access, no real LLM enablement, no GraphRAG implementation, no vectorization, no ApprovalStore integration, no external action execution, no Formal WorkUnit promotion, no deployment, no merge automation, and no automated decision-making.",
  ]);
});
