# Atra Public Repository Inventory

Generated projection of the authoritative allowlist manifest
[`config/public-repository-manifest.json`](../../config/public-repository-manifest.json).
Regenerate after any classification change; the manifest, not this file, decides.

- **Base commit:** `c3655f3511551d618243988396ec1453d81e0ec9` (verified `origin/main`)
- **Tracked paths:** 1008
- **Public:** 780 · **Private:** 228 · **Unclassified:** 0
- **Selected architecture:** private-canonical-plus-public-mirror
- **Public history classification:** `PUBLIC_HISTORY_UNSAFE`

## Classification totals

| Classification | Paths |
| --- | ---: |
| `PUBLIC_REQUIRED` | 740 |
| `PRIVATE_DEVELOPMENT` | 224 |
| `PUBLIC_OPTIONAL` | 20 |
| `THIRD_PARTY_VERIFIED` | 16 |
| `THIRD_PARTY_UNRESOLVED` | 4 |
| `PRIVATE_OPERATIONS` | 3 |
| `SENSITIVE` | 1 |

## Rule coverage

Rules are ordered; the **first** match wins. Every tracked path matches exactly one.

| # | Pattern | Disposition | Classification | Action | Paths | Binaries | Reason |
| ---: | --- | --- | --- | --- | ---: | ---: | --- |
| 1 | `.hermes/**` | exclude | `PRIVATE_DEVELOPMENT` | `REMOVE_FROM_TRACKING` | 0 | 0 | Agent-local planning state. Proven to have zero runtime, build, test, CI, or documentation consumers (the only repository matches for 'hermes' are the unrelated `hermes-parser` npm package in package-lock.json). Removed from tracking and ignored. |
| 2 | `app/**` | include | `PUBLIC_REQUIRED` | `KEEP` | 393 | 2 | Application, domain, and UI source required to build Atra. |
| 3 | `electron/**` | include | `PUBLIC_REQUIRED` | `KEEP` | 3 | 0 | Electron desktop shell source; gated by `npm run electron:build:check` in CI. |
| 4 | `migrations/**` | include | `PUBLIC_REQUIRED` | `KEEP` | 8 | 0 | Canonical schema definitions, lane manifest, and schema contract. These are the only reproducible definition of the database schema and must never be deleted. |
| 5 | `contracts/**` | include | `PUBLIC_REQUIRED` | `KEEP` | 1 | 0 | Public operational evidence SCHEMA (not evidence instances). |
| 6 | `scripts/loop/**` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 4 | 0 | Self-described local developer tooling: collects phase/PR status for the internal engineering loop. Not product, not referenced by build or CI. |
| 7 | `scripts/report-legacy-surface.mjs` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Internal refactor-programme reporting; referenced only by internal architecture documents. |
| 8 | `scripts/**` | include | `PUBLIC_REQUIRED` | `KEEP` | 66 | 1 | Build, migration, deployment, and safety-gate tooling invoked by package.json scripts and .github/workflows/ci.yml. Removing any of these breaks a declared npm script. |
| 9 | `tests/alphaEvidenceLedger.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 10 | `tests/alphaExitCriteriaGate.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 11 | `tests/alphaOperatorRunbook.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 12 | `tests/alphaReleaseCandidateDryRun.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 13 | `tests/alphaReleaseReadinessConsolidation.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 14 | `tests/alphaReleaseReadinessGate.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 15 | `tests/alphaReleaseSafetyChecklist.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 16 | `tests/alphaSafetyGateValidation.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 17 | `tests/approvalStoreDualReadWiringPreSpec.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 18 | `tests/architectureBoundaries.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 19 | `tests/atraDoctrineIntakeRubric.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 20 | `tests/canonicalApprovalPayloadGate.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 21 | `tests/d1ReadOnlyExecutionGate.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 22 | `tests/d1RepositoryInvariantEnforcement.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 23 | `tests/d1SchemaIndexConstraintHardening.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 24 | `tests/d1SchemaIntegrityInventory.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 25 | `tests/d1SchemaReadOnlyQueryPlanningGate.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 26 | `tests/decompositionEvaluationHarnessSpecGate.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 27 | `tests/decompositionStandardGate.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 28 | `tests/electronDependencyPolicy.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 29 | `tests/evidenceProvenanceStandard.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 30 | `tests/evidenceReviewGate.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 31 | `tests/humanDecisionGate.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 32 | `tests/llmJudgmentEvaluationGate.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 33 | `tests/nl2sqlPlanningGate.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 34 | `tests/phase6Fabel5CrossLaneAuditPlan.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 35 | `tests/phase6ImplementationReadinessGate.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 36 | `tests/phase6PersistenceAuditEvidenceSpec.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 37 | `tests/phase6PersistenceImplementationGate.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 38 | `tests/phase6PersistenceTargetDecisionSpec.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 39 | `tests/phase6RecorderAuditSummaryEvidenceLedgerLinkageGateSpec.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 40 | `tests/phase6RecorderAuditSummaryEvidenceLedgerStaticContractNoAppendValidatorSpec.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 41 | `tests/phase6RecorderAuditSummaryLaneReadinessReview.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 42 | `tests/phase6RecorderAuditSummarySpec.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 43 | `tests/phase6RevisionReference.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 44 | `tests/phase6StorageGateSpec.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 45 | `tests/phase6TemporalAssociation.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 46 | `tests/phase6TemporalContract.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 47 | `tests/relationshipGraphModelGate.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 48 | `tests/ruleReviewGate.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 49 | `tests/safeQueryPlanGenerationGate.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 50 | `tests/sqlCompilationGate.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 51 | `tests/tenantSecretProviderDesignGate.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Documentation-contract test: it asserts on the CONTENT of internal governance documents that the boundary keeps private. It verifies process artifacts, not public product behaviour, so it moves with its subject. |
| 52 | `tests/publicRepositoryBoundary.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `KEEP` | 1 | 0 | Governs the PRIVATE canonical repository's boundary (tracked-path digest, ignore contract). The generated public mirror has a different tracked set, so this test belongs to the canonical repository only. |
| 53 | `config/public-repository-manifest.json` | exclude | `PRIVATE_DEVELOPMENT` | `KEEP` | 1 | 0 | The boundary definition for the private canonical repository. The public mirror is a product repository and does not carry its own export machinery. |
| 54 | `scripts/lib/publicRepositoryManifest.mjs` | exclude | `PRIVATE_DEVELOPMENT` | `KEEP` | 0 | 0 | Boundary tooling of the private canonical repository. |
| 55 | `scripts/verify-public-repository.mjs` | exclude | `PRIVATE_DEVELOPMENT` | `KEEP` | 0 | 0 | Boundary tooling of the private canonical repository. |
| 56 | `scripts/export-public-repository.mjs` | exclude | `PRIVATE_DEVELOPMENT` | `KEEP` | 0 | 0 | Boundary tooling of the private canonical repository. |
| 57 | `docs/release/PUBLIC_REPOSITORY_POLICY.md` | exclude | `PRIVATE_DEVELOPMENT` | `KEEP` | 1 | 0 | Describes what the private canonical repository withholds; it is a maintainer document, not part of the public product contract. |
| 58 | `tests/loopStatusCollector.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Covers scripts/loop/**. Must move with its subject: `npm test` globs tests/*.test.mts, so keeping the test without its subject would break the public test contract. |
| 59 | `tests/proactiveVoiceSecretary.test.mts` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Covers prototypes/proactive-voice-secretary/**. Must move with its subject for the same reason. |
| 60 | `tests/**` | include | `PUBLIC_REQUIRED` | `KEEP` | 257 | 3 | Tests needed to verify public code, including the security fixtures that prove tenant isolation, approval binding, CSRF, and redaction behaviour. Deliberately public: they are the evidence the security claims are real. |
| 61 | `prototypes/**` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 4 | 0 | Unreleased research prototype (proactive voice secretary). Not part of the public product contract. |
| 62 | `public/Photos/**` | include | `THIRD_PARTY_UNRESOLVED` | `BLOCK_PUBLICATION` | 4 | 4 | Raster third-party brand marks (Slack, Gmail, Google Calendar, Salesforce) rendered by the WorkUnit UI. No provenance or licence is recorded anywhere in the repository. Retained because removing them is a product-UI change outside this WorkUnit's scope; publication is blocked until the licensing WorkUnit resolves redistribution rights. |
| 63 | `public/workunit-source-icons/**` | include | `THIRD_PARTY_VERIFIED` | `KEEP` | 16 | 0 | Vendored Simple Icons SVGs; provenance recorded in public/workunit-source-icons/SOURCES.md. The icon files themselves are CC0, but the depicted marks remain third-party trademarks — trademark-use review belongs to the licensing WorkUnit. |
| 64 | `public/**` | include | `PUBLIC_REQUIRED` | `KEEP` | 1 | 1 | First-party Atra assets (workunit-logo.png) referenced by the launcher stylesheet. |
| 65 | `docs/release/PUBLIC_REPOSITORY_INVENTORY.md` | exclude | `PRIVATE_DEVELOPMENT` | `KEEP` | 1 | 0 | Private review artifact: it enumerates what is deliberately withheld, which is internal information. |
| 66 | `docs/release/PRIVATE_ASSET_MIGRATION_MANIFEST.md` | exclude | `PRIVATE_OPERATIONS` | `KEEP` | 1 | 0 | Private migration ledger for assets leaving the repository. |
| 67 | `docs/release/**` | exclude | `PRIVATE_OPERATIONS` | `MOVE_TO_PRIVATE_REPOSITORY` | 2 | 0 | Alpha release readiness matrices and summaries — internal release process state. |
| 68 | `docs/security/REDTEAM_2026-06-29.md` | exclude | `SENSITIVE` | `BLOCK_PUBLICATION` | 1 | 0 | Red-team assessment naming residual unfixed weaknesses, the private sandbox worktree, and the private hardening branch. Publishing an attack-surface map with open gaps is a direct security exposure. |
| 69 | `docs/security/**` | include | `PUBLIC_OPTIONAL` | `KEEP` | 3 | 0 | Security model, trust boundaries, and the contributor security checklist — the public security contract. |
| 70 | `docs/specs/**` | include | `PUBLIC_OPTIONAL` | `KEEP` | 7 | 0 | Public product/API contracts: API, data model, error model, domain model, action fields, LLM processing, MVP use cases. |
| 71 | `docs/architecture/CANONICAL_WORKUNIT_PIPELINE_REFACTOR_PROGRAM.md` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Internal refactor programme plan with phase ratchets and workstream sequencing. |
| 72 | `docs/architecture/**` | include | `PUBLIC_OPTIONAL` | `KEEP` | 4 | 0 | Public architecture documentation: system overview, organisation, SaaS architecture, persistence contract. |
| 73 | `docs/operations/CODEX_AUTOMATION_PROMPTS.md` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Internal agent automation prompt library and unreleased roadmap commentary. |
| 74 | `docs/operations/**` | include | `PUBLIC_OPTIONAL` | `KEEP` | 4 | 0 | Operator-facing setup and deployment contracts needed to actually run Atra. Contain placeholders only — no real account, database, or tenant identifiers. |
| 75 | `docs/research/**` | include | `PUBLIC_OPTIONAL` | `KEEP` | 1 | 0 | Hopper vector algorithm specification, referenced by the public architecture overview. |
| 76 | `docs/README.md` | include | `PUBLIC_OPTIONAL` | `KEEP` | 1 | 0 | Documentation index. |
| 77 | `docs/DIRECTORY_STRUCTURE.md` | exclude | `PRIVATE_DEVELOPMENT` | `REPLACE_WITH_PUBLIC_EQUIVALENT` | 1 | 0 | Describes the full private repository layout, including directories that do not exist in the public mirror. |
| 78 | `docs/**` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 159 | 0 | Default-private: internal engineering process records — phase gates (P6_*, P7_*, PHASE_*), EXPLICIT_HUMAN_GO approval records, alpha release process, decision/risk/evidence ledgers, branch protection policy, doctrine, and go-to-market models. None is part of the public product contract. |
| 79 | `AGENTS.md` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Internal agent operating instructions and PM/assistant working contract. |
| 80 | `AI_JUDGMENT_CRITERIA.md` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Internal judgment rubric used to steer the assistant engineering organisation. |
| 81 | `NODE_DECOMPOSITION_POLICY.md` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Internal working policy, not a product contract. |
| 82 | `NODE_DECOMPOSITION_WHITEBOARD.md` | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | 1 | 0 | Working whiteboard — explicitly in-progress internal thinking. |
| 83 | `README.md` | include | `PUBLIC_REQUIRED` | `KEEP` | 1 | 0 | Public entry point. |
| 84 | `.github/workflows/**` | include | `PUBLIC_REQUIRED` | `KEEP` | 1 | 0 | CI Safety Gate. Reviewed: `permissions: contents: read`, no secrets, no deployment, no external execution. |
| 85 | `.gitignore` | include | `PUBLIC_REQUIRED` | `KEEP` | 1 | 0 | Security contract. Must never be deleted; the public mirror needs the same protections. |
| 86 | `wrangler.json` | include | `PUBLIC_REQUIRED` | `KEEP` | 1 | 0 | Safe deployment template. Contains REPLACE_WITH_* placeholders only — verified across all history that no concrete D1 database id was ever committed. |
| 87 | `package.json` | include | `PUBLIC_REQUIRED` | `KEEP` | 1 | 0 | Package manifest. License metadata is owned by the parallel licensing WorkUnit and was not modified here. |
| 88 | `package-lock.json` | include | `PUBLIC_REQUIRED` | `KEEP` | 1 | 0 | Lockfile required for reproducible installs. |
| 89 | `tsconfig.json` | include | `PUBLIC_REQUIRED` | `KEEP` | 1 | 0 | TypeScript configuration. |
| 90 | `next.config.ts` | include | `PUBLIC_REQUIRED` | `KEEP` | 1 | 0 | Next.js build configuration. |
| 91 | `open-next.config.ts` | include | `PUBLIC_REQUIRED` | `KEEP` | 1 | 0 | OpenNext/Cloudflare build configuration. |
| 92 | `postcss.config.mjs` | include | `PUBLIC_REQUIRED` | `KEEP` | 1 | 0 | PostCSS/Tailwind configuration. |
| 93 | `eslint.config.mjs` | include | `PUBLIC_REQUIRED` | `KEEP` | 1 | 0 | Lint configuration used by `npm run lint`. |

## Binary and third-party inventory

Every retained binary, with its provenance decision.

| Path | Bytes | Classification | Source / owner | Necessary to build or demonstrate Atra |
| --- | ---: | --- | --- | --- |
| `app/favicon.ico` | 25931 | `PUBLIC_REQUIRED` | First-party Atra asset | Yes — Next.js app icon |
| `app/lib/security/approvalMac/tenantSecretProvider.ts` | 2144 | `PUBLIC_REQUIRED` | — | — |
| `public/Photos/icon/gmail.png` | 2454 | `THIRD_PARTY_UNRESOLVED` | **UNRESOLVED** — no recorded provenance or licence | Yes — rendered by WorkUnitExplorerPane / ActionFieldEntryPanel |
| `public/Photos/icon/google-calendar.png` | 2872 | `THIRD_PARTY_UNRESOLVED` | **UNRESOLVED** — no recorded provenance or licence | Yes — rendered by WorkUnitExplorerPane / ActionFieldEntryPanel |
| `public/Photos/icon/salesforce.jpeg` | 201249 | `THIRD_PARTY_UNRESOLVED` | **UNRESOLVED** — no recorded provenance or licence | Yes — rendered by WorkUnitExplorerPane / ActionFieldEntryPanel |
| `public/Photos/icon/slack.png` | 85562 | `THIRD_PARTY_UNRESOLVED` | **UNRESOLVED** — no recorded provenance or licence | Yes — rendered by WorkUnitExplorerPane / ActionFieldEntryPanel |
| `public/workunit-ui-icons/workunit-logo.png` | 3082 | `PUBLIC_REQUIRED` | First-party Atra logo | Yes — referenced by WorkUnitLauncher.module.css |
| `scripts/lib/d1MigrationRunner.mjs` | 22185 | `PUBLIC_REQUIRED` | — | — |
| `tests/cloudflareDeployHarness.mts` | 7231 | `PUBLIC_REQUIRED` | — | — |
| `tests/d1MigrationRunner.test.mts` | 18446 | `PUBLIC_REQUIRED` | — | — |
| `tests/securityP1FourEyesAudit.test.mts` | 14408 | `PUBLIC_REQUIRED` | — | — |

> `app/lib/security/approvalMac/tenantSecretProvider.ts` and
> `tests/cloudflareDeployHarness.mts` are reported as binary by `file(1)` and by Git
> because they embed literal NUL bytes. These are **intentional**: NUL is used as an
> unambiguous separator in composite key strings (`${tenant_id}\0${key_id}`) to prevent
> delimiter-injection collisions. They are ordinary TypeScript source and are classified
> `PUBLIC_REQUIRED`.

## Complete tracked path index

| Path | Bytes | Disposition | Classification | Action | First | Last |
| --- | ---: | --- | --- | --- | --- | --- |
| `.github/workflows/ci.yml` | 1771 | include | `PUBLIC_REQUIRED` | `KEEP` | `66c334f1` | `6a2bc849` |
| `.gitignore` | 3068 | include | `PUBLIC_REQUIRED` | `KEEP` | `80a63485` | `1680b561` |
| `AGENTS.md` | 1564 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `fc3a785c` | `67a9774b` |
| `AI_JUDGMENT_CRITERIA.md` | 20763 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `67a9774b` | `67a9774b` |
| `NODE_DECOMPOSITION_POLICY.md` | 21518 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `67a9774b` | `67a9774b` |
| `NODE_DECOMPOSITION_WHITEBOARD.md` | 19322 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `67a9774b` | `67a9774b` |
| `README.md` | 21111 | include | `PUBLIC_REQUIRED` | `KEEP` | `80a63485` | `48808cb6` |
| `app/api/audit/recent/route.ts` | 3704 | include | `PUBLIC_REQUIRED` | `KEEP` | `d9f86bbf` | `519d85e1` |
| `app/api/integrations/status/route.ts` | 3674 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `519d85e1` |
| `app/api/workunit/[id]/action-preview/route.ts` | 9229 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `6a8d26d6` |
| `app/api/workunit/[id]/approval/route.ts` | 11528 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `6a8d26d6` |
| `app/api/workunit/[id]/approval/status/route.ts` | 7012 | include | `PUBLIC_REQUIRED` | `KEEP` | `b13dc0b1` | `6a8d26d6` |
| `app/api/workunit/[id]/execution/dry-run/route.ts` | 14904 | include | `PUBLIC_REQUIRED` | `KEEP` | `ccd5d310` | `21997eed` |
| `app/api/workunit/[id]/feedback/route.ts` | 4075 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `6a8d26d6` |
| `app/api/workunit/inbox/route.ts` | 6995 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `519d85e1` |
| `app/api/workunit/tools/route.ts` | 23460 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `21997eed` |
| `app/components/atra/Atra.module.css` | 10468 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `app/components/atra/AtraWorkspace.tsx` | 12723 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `app/components/common/DetailField.tsx` | 365 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `d086a294` |
| `app/components/common/Header.tsx` | 9054 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `9ee4e4ee` |
| `app/components/decision/ContextStudioColumn.tsx` | 4677 | include | `PUBLIC_REQUIRED` | `KEEP` | `9ee4e4ee` | `9ee4e4ee` |
| `app/components/decision/DecisionColumn.tsx` | 2395 | include | `PUBLIC_REQUIRED` | `KEEP` | `9ee4e4ee` | `9ee4e4ee` |
| `app/components/decision/SignalColumn.tsx` | 2159 | include | `PUBLIC_REQUIRED` | `KEEP` | `9ee4e4ee` | `9ee4e4ee` |
| `app/components/decision/WrongModal.tsx` | 3221 | include | `PUBLIC_REQUIRED` | `KEEP` | `9ee4e4ee` | `9ee4e4ee` |
| `app/components/hopper/HopperMobileTui.tsx` | 25288 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/components/inbox/EventCard.tsx` | 1619 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `9ee4e4ee` |
| `app/components/inbox/InboxColumn.tsx` | 3870 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `9ee4e4ee` |
| `app/components/legacy/workunitInbox/README.md` | 260 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `defae92e` |
| `app/components/legacy/workunitInbox/WorkUnitActionField.tsx` | 8351 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `d9f86bbf` |
| `app/components/legacy/workunitInbox/WorkUnitDetail.tsx` | 2937 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/components/legacy/workunitInbox/WorkUnitInbox.tsx` | 6089 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/components/studio/FlowIndicator.tsx` | 887 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `d086a294` |
| `app/components/studio/StudioColumn.tsx` | 3037 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `d086a294` |
| `app/components/studio/StudioEditor.tsx` | 1485 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `d086a294` |
| `app/components/studio/StudioTabs.tsx` | 1276 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `d086a294` |
| `app/components/workunit-os/ActionFieldEntryPanel.tsx` | 6072 | include | `PUBLIC_REQUIRED` | `KEEP` | `d9f86bbf` | `d9f86bbf` |
| `app/components/workunit-os/AuditLogPanel.tsx` | 3245 | include | `PUBLIC_REQUIRED` | `KEEP` | `d9f86bbf` | `7281dda9` |
| `app/components/workunit-os/DecisionTracePanel.tsx` | 2390 | include | `PUBLIC_REQUIRED` | `KEEP` | `d9f86bbf` | `d9f86bbf` |
| `app/components/workunit-os/DecompositionConsole.tsx` | 3336 | include | `PUBLIC_REQUIRED` | `KEEP` | `d9f86bbf` | `d9f86bbf` |
| `app/components/workunit-os/ExternalActionApprovalDrawer.tsx` | 11028 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/components/workunit-os/FeedbackModal.tsx` | 4064 | include | `PUBLIC_REQUIRED` | `KEEP` | `9ee4e4ee` | `9ee4e4ee` |
| `app/components/workunit-os/IntegrationStatusPanel.tsx` | 3008 | include | `PUBLIC_REQUIRED` | `KEEP` | `d9f86bbf` | `d9f86bbf` |
| `app/components/workunit-os/ROIIndicator.tsx` | 524 | include | `PUBLIC_REQUIRED` | `KEEP` | `9ee4e4ee` | `9ee4e4ee` |
| `app/components/workunit-os/WorkUnitCard.tsx` | 4072 | include | `PUBLIC_REQUIRED` | `KEEP` | `9ee4e4ee` | `fc3a785c` |
| `app/components/workunit-os/WorkUnitDetail.tsx` | 9971 | include | `PUBLIC_REQUIRED` | `KEEP` | `9ee4e4ee` | `fc3a785c` |
| `app/components/workunit-os/WorkUnitExplorerPane.tsx` | 3431 | include | `PUBLIC_REQUIRED` | `KEEP` | `d9f86bbf` | `d9f86bbf` |
| `app/components/workunit-os/WorkUnitOSDashboard.tsx` | 370 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `650d1391` |
| `app/components/workunit-os/adopted/AdoptedActionApprovalDrawer.tsx` | 6642 | include | `PUBLIC_REQUIRED` | `KEEP` | `68584e2f` | `160ffe5e` |
| `app/components/workunit-os/adopted/AdoptedActionFieldPanel.tsx` | 38389 | include | `PUBLIC_REQUIRED` | `KEEP` | `49e87f33` | `31774322` |
| `app/components/workunit-os/adopted/AdoptedWorkUnitDashboard.module.css` | 34613 | include | `PUBLIC_REQUIRED` | `KEEP` | `d9f86bbf` | `f4d3dd38` |
| `app/components/workunit-os/adopted/AdoptedWorkUnitDashboard.tsx` | 25346 | include | `PUBLIC_REQUIRED` | `KEEP` | `d9f86bbf` | `31774322` |
| `app/components/workunit-os/adopted/README.md` | 1257 | include | `PUBLIC_REQUIRED` | `KEEP` | `60e3f3bf` | `67a9774b` |
| `app/components/workunit-os/launcher/ActionFieldEditor.tsx` | 8673 | include | `PUBLIC_REQUIRED` | `KEEP` | `70bcd86a` | `6caf1d57` |
| `app/components/workunit-os/launcher/ActionFieldView.tsx` | 2752 | include | `PUBLIC_REQUIRED` | `KEEP` | `70bcd86a` | `7281dda9` |
| `app/components/workunit-os/launcher/CommandPaletteView.tsx` | 5835 | include | `PUBLIC_REQUIRED` | `KEEP` | `650d1391` | `31774322` |
| `app/components/workunit-os/launcher/ReadinessCards.tsx` | 805 | include | `PUBLIC_REQUIRED` | `KEEP` | `70bcd86a` | `e693271e` |
| `app/components/workunit-os/launcher/SourceAppIcon.tsx` | 2434 | include | `PUBLIC_REQUIRED` | `KEEP` | `46f4a678` | `31774322` |
| `app/components/workunit-os/launcher/WorkUnitLauncher.module.css` | 19939 | include | `PUBLIC_REQUIRED` | `KEEP` | `650d1391` | `7281dda9` |
| `app/components/workunit-os/launcher/WorkUnitLauncher.tsx` | 5052 | include | `PUBLIC_REQUIRED` | `KEEP` | `650d1391` | `7281dda9` |
| `app/components/workunit-os/launcher/WorkUnitTreeMap.tsx` | 4314 | include | `PUBLIC_REQUIRED` | `KEEP` | `70bcd86a` | `7281dda9` |
| `app/components/workunit/TaskItem.tsx` | 481 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `d086a294` |
| `app/components/workunit/WorkUnitCard.tsx` | 2798 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `d086a294` |
| `app/components/workunit/WorkUnitColumn.tsx` | 15208 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `9ee4e4ee` |
| `app/components/workunit/WorkUnitDetail.tsx` | 7705 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `9ee4e4ee` |
| `app/components/workunitInbox/WorkUnitActionField.tsx` | 60 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/components/workunitInbox/WorkUnitDetail.tsx` | 55 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/components/workunitInbox/WorkUnitInbox.tsx` | 54 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/data/mockHopperInputs.ts` | 2814 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/data/mockInbox.ts` | 954 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `d086a294` |
| `app/data/mockSourceHopperResults.ts` | 1709 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/data/mockStudio.ts` | 1579 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `d086a294` |
| `app/data/mockWorkUnits.ts` | 4015 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `fc3a785c` |
| `app/favicon.ico` | 25931 | include | `PUBLIC_REQUIRED` | `KEEP` | `80a63485` | `80a63485` |
| `app/globals.css` | 2471 | include | `PUBLIC_REQUIRED` | `KEEP` | `80a63485` | `fc3a785c` |
| `app/hooks/useDecisionLogs.ts` | 384 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `d086a294` |
| `app/hooks/useStudio.ts` | 989 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `d086a294` |
| `app/hooks/useWorkUnits.ts` | 1724 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `9ee4e4ee` |
| `app/layout.tsx` | 377 | include | `PUBLIC_REQUIRED` | `KEEP` | `80a63485` | `d086a294` |
| `app/lib/actionField/dashboardPreviewClient.ts` | 200 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `defae92e` |
| `app/lib/actionField/errorState.ts` | 176 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/application/README.md` | 294 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `defae92e` |
| `app/lib/application/actionField/README.md` | 788 | include | `PUBLIC_REQUIRED` | `KEEP` | `60e3f3bf` | `67a9774b` |
| `app/lib/application/actionField/actionDraftModel.ts` | 6893 | include | `PUBLIC_REQUIRED` | `KEEP` | `160ffe5e` | `2be6d9f7` |
| `app/lib/application/actionField/adoptedApprovalDrawerModel.ts` | 6607 | include | `PUBLIC_REQUIRED` | `KEEP` | `68584e2f` | `a73f094a` |
| `app/lib/application/actionField/dashboardPreviewClient.ts` | 3729 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `defae92e` |
| `app/lib/application/actionField/errorState.ts` | 2240 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `ee2ac992` |
| `app/lib/application/actionField/toolRequirementModel.ts` | 6117 | include | `PUBLIC_REQUIRED` | `KEEP` | `160ffe5e` | `2be6d9f7` |
| `app/lib/application/atra/atraWorkspaceModel.ts` | 3529 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `app/lib/application/atra/deriveAtraWorkspaceViewModel.ts` | 4508 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `app/lib/application/audit/auditLogDisplayModel.ts` | 1817 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `app/lib/application/auth/README.md` | 852 | include | `PUBLIC_REQUIRED` | `KEEP` | `60e3f3bf` | `60e3f3bf` |
| `app/lib/application/auth/authAdapter.ts` | 442 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `defae92e` |
| `app/lib/application/auth/devAuthAdapter.ts` | 796 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `21997eed` |
| `app/lib/application/auth/jwtAuthAdapter.ts` | 5021 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `21997eed` |
| `app/lib/application/auth/noopProductionAuthAdapter.ts` | 283 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `defae92e` |
| `app/lib/application/auth/resolveAuthAdapter.ts` | 1275 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `21997eed` |
| `app/lib/application/auth/sessionResolver.ts` | 8505 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `21997eed` |
| `app/lib/application/candidate/candidateWorkUnitBridge.ts` | 7821 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `app/lib/application/candidate/devGatedLlmCandidatePipeline.ts` | 4075 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `app/lib/application/candidate/safeWorkUnitCandidate.ts` | 5370 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `app/lib/application/dashboard/adoptedDashboardViewModel.ts` | 18632 | include | `PUBLIC_REQUIRED` | `KEEP` | `60e3f3bf` | `b91b6a59` |
| `app/lib/application/dashboard/approvalDecisionTraceModel.ts` | 7057 | include | `PUBLIC_REQUIRED` | `KEEP` | `d6316b36` | `d6316b36` |
| `app/lib/application/dashboard/dashboardApprovalStatusClient.ts` | 3665 | include | `PUBLIC_REQUIRED` | `KEEP` | `b13dc0b1` | `c3e36f3c` |
| `app/lib/application/dashboard/dashboardDataClient.ts` | 5344 | include | `PUBLIC_REQUIRED` | `KEEP` | `60e3f3bf` | `60e3f3bf` |
| `app/lib/application/dashboard/dashboardExecutionDryRunClient.ts` | 3813 | include | `PUBLIC_REQUIRED` | `KEEP` | `87d92ce1` | `e062ed80` |
| `app/lib/application/dashboard/dashboardStatusClient.ts` | 159 | include | `PUBLIC_REQUIRED` | `KEEP` | `d9f86bbf` | `60e3f3bf` |
| `app/lib/application/dashboard/executionCommandModel.ts` | 3191 | include | `PUBLIC_REQUIRED` | `KEEP` | `d6316b36` | `d6316b36` |
| `app/lib/application/dashboard/executionReadinessModel.ts` | 6499 | include | `PUBLIC_REQUIRED` | `KEEP` | `d6316b36` | `d6316b36` |
| `app/lib/application/dashboard/executionResultViewerModel.ts` | 4480 | include | `PUBLIC_REQUIRED` | `KEEP` | `e062ed80` | `e062ed80` |
| `app/lib/application/dashboard/mockExecutionModel.ts` | 5801 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `app/lib/application/dashboard/requestedActionTypeModel.ts` | 2261 | include | `PUBLIC_REQUIRED` | `KEEP` | `b91b6a59` | `6ffbde3b` |
| `app/lib/application/dashboard/selectedWorkUnitPreviewModel.ts` | 6407 | include | `PUBLIC_REQUIRED` | `KEEP` | `6ae70e06` | `b13dc0b1` |
| `app/lib/application/dashboard/workUnitDashboardModel.ts` | 4671 | include | `PUBLIC_REQUIRED` | `KEEP` | `d9f86bbf` | `6ae70e06` |
| `app/lib/application/decomposition/decompositionClassifier.ts` | 9662 | include | `PUBLIC_REQUIRED` | `KEEP` | `b378663b` | `b378663b` |
| `app/lib/application/decomposition/decompositionEvalHarness.ts` | 4838 | include | `PUBLIC_REQUIRED` | `KEEP` | `c516d79b` | `c516d79b` |
| `app/lib/application/decomposition/decompositionGoldenRunner.ts` | 2833 | include | `PUBLIC_REQUIRED` | `KEEP` | `c516d79b` | `c516d79b` |
| `app/lib/application/decomposition/decompositionLatencyModel.ts` | 1485 | include | `PUBLIC_REQUIRED` | `KEEP` | `c516d79b` | `c516d79b` |
| `app/lib/application/decomposition/decompositionOrchestrator.ts` | 8764 | include | `PUBLIC_REQUIRED` | `KEEP` | `c7b54ad3` | `7281dda9` |
| `app/lib/application/decomposition/doneConditionGate.ts` | 4294 | include | `PUBLIC_REQUIRED` | `KEEP` | `67150bd7` | `67150bd7` |
| `app/lib/application/decomposition/mockDecompositionLlm.ts` | 3733 | include | `PUBLIC_REQUIRED` | `KEEP` | `c7b54ad3` | `c7b54ad3` |
| `app/lib/application/decomposition/pmCorrectionTaxonomy.ts` | 956 | include | `PUBLIC_REQUIRED` | `KEEP` | `b378663b` | `b378663b` |
| `app/lib/application/decomposition/promotionRules.ts` | 3644 | include | `PUBLIC_REQUIRED` | `KEEP` | `67150bd7` | `67150bd7` |
| `app/lib/application/decomposition/ruleGate.ts` | 2772 | include | `PUBLIC_REQUIRED` | `KEEP` | `67150bd7` | `67150bd7` |
| `app/lib/application/decomposition/types.ts` | 7015 | include | `PUBLIC_REQUIRED` | `KEEP` | `67150bd7` | `67150bd7` |
| `app/lib/application/launcher/actionFieldEditorDraftModel.ts` | 3594 | include | `PUBLIC_REQUIRED` | `KEEP` | `70bcd86a` | `7281dda9` |
| `app/lib/application/launcher/candidateToLauncherWorkUnit.ts` | 1634 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `app/lib/application/launcher/deriveWorkspaceModel.ts` | 3341 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `app/lib/application/launcher/forbiddenCommandFilter.ts` | 1636 | include | `PUBLIC_REQUIRED` | `KEEP` | `70bcd86a` | `70bcd86a` |
| `app/lib/application/launcher/keyboardNavigationModel.ts` | 1439 | include | `PUBLIC_REQUIRED` | `KEEP` | `70bcd86a` | `31774322` |
| `app/lib/application/launcher/paletteCommandRegistry.ts` | 1653 | include | `PUBLIC_REQUIRED` | `KEEP` | `70bcd86a` | `70bcd86a` |
| `app/lib/application/launcher/sourceAppIconModel.ts` | 5113 | include | `PUBLIC_REQUIRED` | `KEEP` | `46f4a678` | `46f4a678` |
| `app/lib/application/launcher/workUnitSelectionModel.ts` | 8424 | include | `PUBLIC_REQUIRED` | `KEEP` | `650d1391` | `31774322` |
| `app/lib/application/launcher/workUnitTreeModel.ts` | 5165 | include | `PUBLIC_REQUIRED` | `KEEP` | `70bcd86a` | `7281dda9` |
| `app/lib/application/llmContext/buildLlmContextPack.ts` | 1703 | include | `PUBLIC_REQUIRED` | `KEEP` | `67150bd7` | `67150bd7` |
| `app/lib/application/llmContext/exclusionScanner.ts` | 1339 | include | `PUBLIC_REQUIRED` | `KEEP` | `67150bd7` | `67150bd7` |
| `app/lib/application/llmContext/types.ts` | 1031 | include | `PUBLIC_REQUIRED` | `KEEP` | `67150bd7` | `67150bd7` |
| `app/lib/application/llmProvider/blockedDiagnosticRedaction.ts` | 1870 | include | `PUBLIC_REQUIRED` | `KEEP` | `75a35d61` | `75a35d61` |
| `app/lib/application/llmProvider/blockedProviderAdapter.ts` | 1081 | include | `PUBLIC_REQUIRED` | `KEEP` | `edbbdbf5` | `edbbdbf5` |
| `app/lib/application/llmProvider/candidateOnlyContextPackExclusionGuard.ts` | 5511 | include | `PUBLIC_REQUIRED` | `KEEP` | `151fcd4c` | `151fcd4c` |
| `app/lib/application/llmProvider/candidateOnlyDecompositionClassifier.ts` | 4514 | include | `PUBLIC_REQUIRED` | `KEEP` | `3bf45a8b` | `3bf45a8b` |
| `app/lib/application/llmProvider/candidateOnlyDecompositionRuleGate.ts` | 7895 | include | `PUBLIC_REQUIRED` | `KEEP` | `ad4c5eb8` | `ad4c5eb8` |
| `app/lib/application/llmProvider/candidateOnlyMockBoundaryHarness.ts` | 3816 | include | `PUBLIC_REQUIRED` | `KEEP` | `2e4969ee` | `2e4969ee` |
| `app/lib/application/llmProvider/disabledLlmProvider.ts` | 239 | include | `PUBLIC_REQUIRED` | `KEEP` | `d3e54428` | `d3e54428` |
| `app/lib/application/llmProvider/dryRunProviderAdapter.ts` | 1937 | include | `PUBLIC_REQUIRED` | `KEEP` | `782c8525` | `782c8525` |
| `app/lib/application/llmProvider/dryRunProviderAdapterDesignGate.ts` | 5711 | include | `PUBLIC_REQUIRED` | `KEEP` | `7b5368c1` | `97488d9d` |
| `app/lib/application/llmProvider/fakeDryRunLlmProvider.ts` | 3460 | include | `PUBLIC_REQUIRED` | `KEEP` | `3e2fadf7` | `86f6d97e` |
| `app/lib/application/llmProvider/guardedCandidateOnlyMockBoundaryChain.ts` | 4588 | include | `PUBLIC_REQUIRED` | `KEEP` | `bf428cd8` | `bf428cd8` |
| `app/lib/application/llmProvider/guardedLlmProvider.ts` | 507 | include | `PUBLIC_REQUIRED` | `KEEP` | `d3e54428` | `d3e54428` |
| `app/lib/application/llmProvider/liveProviderProposalGate.ts` | 6252 | include | `PUBLIC_REQUIRED` | `KEEP` | `a16e0985` | `a16e0985` |
| `app/lib/application/llmProvider/liveProviderReadinessScorecard.ts` | 5966 | include | `PUBLIC_REQUIRED` | `KEEP` | `d66cd259` | `d66cd259` |
| `app/lib/application/llmProvider/llmProviderBoundary.ts` | 6858 | include | `PUBLIC_REQUIRED` | `KEEP` | `d3e54428` | `d3e54428` |
| `app/lib/application/llmProvider/offlineProviderFixtureGate.ts` | 2347 | include | `PUBLIC_REQUIRED` | `KEEP` | `13ea4988` | `13ea4988` |
| `app/lib/application/llmProvider/offlineProviderFixtures.ts` | 4022 | include | `PUBLIC_REQUIRED` | `KEEP` | `13ea4988` | `13ea4988` |
| `app/lib/application/llmProvider/providerAdapterBoundary.ts` | 1375 | include | `PUBLIC_REQUIRED` | `KEEP` | `edbbdbf5` | `782c8525` |
| `app/lib/application/llmProvider/providerAdapterRoutingGate.ts` | 3745 | include | `PUBLIC_REQUIRED` | `KEEP` | `b081dc16` | `b081dc16` |
| `app/lib/application/llmProvider/providerDryRunContract.ts` | 3555 | include | `PUBLIC_REQUIRED` | `KEEP` | `3e2fadf7` | `3e2fadf7` |
| `app/lib/application/llmProvider/providerSecretPolicy.ts` | 745 | include | `PUBLIC_REQUIRED` | `KEEP` | `2fe2f0f4` | `2fe2f0f4` |
| `app/lib/application/llmProvider/providerTransportPolicy.ts` | 897 | include | `PUBLIC_REQUIRED` | `KEEP` | `c1e7cabb` | `c1e7cabb` |
| `app/lib/application/llmProvider/sealedProviderAdapter.ts` | 2185 | include | `PUBLIC_REQUIRED` | `KEEP` | `5d9ec1c8` | `5d9ec1c8` |
| `app/lib/application/llmProvider/shadowProviderHarness.ts` | 926 | include | `PUBLIC_REQUIRED` | `KEEP` | `2b707db7` | `c709e720` |
| `app/lib/application/llmReadiness/realLlmProviderPolicy.ts` | 1764 | include | `PUBLIC_REQUIRED` | `KEEP` | `2a3b0ede` | `2a3b0ede` |
| `app/lib/application/llmReadiness/realLlmReadinessGate.ts` | 3808 | include | `PUBLIC_REQUIRED` | `KEEP` | `2a3b0ede` | `2a3b0ede` |
| `app/lib/application/memory/coldMemoryPolicy.ts` | 334 | include | `PUBLIC_REQUIRED` | `KEEP` | `67150bd7` | `67150bd7` |
| `app/lib/application/memory/hotMemorySelector.ts` | 621 | include | `PUBLIC_REQUIRED` | `KEEP` | `67150bd7` | `67150bd7` |
| `app/lib/application/memory/types.ts` | 486 | include | `PUBLIC_REQUIRED` | `KEEP` | `67150bd7` | `67150bd7` |
| `app/lib/application/memory/warmMemorySelector.ts` | 719 | include | `PUBLIC_REQUIRED` | `KEEP` | `67150bd7` | `67150bd7` |
| `app/lib/application/safety/p0Policy.ts` | 1448 | include | `PUBLIC_REQUIRED` | `KEEP` | `67150bd7` | `67150bd7` |
| `app/lib/application/workunitInbox/README.md` | 861 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `60e3f3bf` |
| `app/lib/application/workunitInbox/actionPreviewMapping.ts` | 2877 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/application/workunitInbox/mockSignals.ts` | 2814 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/application/workunitInbox/persistenceMapping.ts` | 1627 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `defae92e` |
| `app/lib/application/workunitInbox/transform.ts` | 3771 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/application/workunitInbox/types.ts` | 2020 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/config/README.md` | 134 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `defae92e` |
| `app/lib/constants.ts` | 585 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `d086a294` |
| `app/lib/domain/README.md` | 194 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `defae92e` |
| `app/lib/domain/auth/types.ts` | 1110 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `defae92e` |
| `app/lib/domain/tenant/types.ts` | 306 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `defae92e` |
| `app/lib/domain/types.ts` | 9404 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `00f995b1` |
| `app/lib/domain/workUnitLifecycle.ts` | 7263 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `00f995b1` |
| `app/lib/externalToolClients.ts` | 7792 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/hopperActionRouter.ts` | 10515 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/hopperAdaptiveFilter.ts` | 16147 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/hopperEngine.ts` | 14821 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/infrastructure/README.md` | 228 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `defae92e` |
| `app/lib/infrastructure/external/README.md` | 718 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `60e3f3bf` |
| `app/lib/infrastructure/external/calendar/fakeCalendarSource.ts` | 1157 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/infrastructure/external/calendar/toNormalizedToolSignal.ts` | 2033 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/infrastructure/external/calendar/types.ts` | 873 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/infrastructure/external/github/client.ts` | 882 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/infrastructure/external/github/fakeGitHubClient.ts` | 1777 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/infrastructure/external/github/fakeGitHubSource.ts` | 1522 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/infrastructure/external/github/realGitHubClient.ts` | 5146 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/infrastructure/external/github/resolveGitHubSource.ts` | 1956 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `7281dda9` |
| `app/lib/infrastructure/external/github/toNormalizedToolSignal.ts` | 2760 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/infrastructure/external/github/types.ts` | 1151 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/infrastructure/external/slack/fakeSlackSource.ts` | 1419 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/infrastructure/external/slack/toNormalizedToolSignal.ts` | 1717 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/infrastructure/external/slack/types.ts` | 889 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/infrastructure/persistence/README.md` | 216 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `defae92e` |
| `app/lib/infrastructure/persistence/control/authIdentityRepository.ts` | 1985 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `defae92e` |
| `app/lib/infrastructure/persistence/control/controlRepositoryResolver.ts` | 1718 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `21997eed` |
| `app/lib/infrastructure/persistence/control/membershipRepository.ts` | 2946 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `defae92e` |
| `app/lib/infrastructure/persistence/control/tenantRepository.ts` | 1802 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `7281dda9` |
| `app/lib/infrastructure/persistence/control/types.ts` | 830 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `7281dda9` |
| `app/lib/infrastructure/persistence/control/userRepository.ts` | 1715 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `defae92e` |
| `app/lib/integrations/types.ts` | 2949 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `app/lib/llm/README.md` | 863 | include | `PUBLIC_REQUIRED` | `KEEP` | `60e3f3bf` | `60e3f3bf` |
| `app/lib/llm/budget.ts` | 3809 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `app/lib/llm/deepseekProvider.ts` | 5926 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `d175311b` |
| `app/lib/llm/evaluateWorkUnit.ts` | 3922 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `app/lib/llm/extractCandidate.ts` | 4507 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `7281dda9` |
| `app/lib/llm/generateWorkUnitDraft.ts` | 5044 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `app/lib/llm/mockProvider.ts` | 2712 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `app/lib/llm/modelRouter.ts` | 2897 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `app/lib/llm/processWorkSignal.ts` | 6838 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `7281dda9` |
| `app/lib/llm/prompts.ts` | 4834 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `app/lib/llm/providerConfig.ts` | 2589 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `7281dda9` |
| `app/lib/llm/sanitize.ts` | 6178 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `d175311b` |
| `app/lib/llm/scoreWorkUnit.ts` | 1371 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `app/lib/llm/types.ts` | 4751 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `7281dda9` |
| `app/lib/llm/validateLlmOutput.ts` | 3315 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `d175311b` |
| `app/lib/persistence/README.md` | 840 | include | `PUBLIC_REQUIRED` | `KEEP` | `60e3f3bf` | `60e3f3bf` |
| `app/lib/persistence/approvalStoreAdapter.ts` | 3474 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `902a40fc` |
| `app/lib/persistence/cloudflareBindings.ts` | 2358 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `app/lib/persistence/d1/actionPreviewRepository.ts` | 5085 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `519d85e1` |
| `app/lib/persistence/d1/approvalRecordRepository.ts` | 7661 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `519d85e1` |
| `app/lib/persistence/d1/auditLogRepository.ts` | 2295 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `519d85e1` |
| `app/lib/persistence/d1/integrationConnectionRepository.ts` | 4206 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `7281dda9` |
| `app/lib/persistence/d1/rowHelpers.ts` | 2669 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `28caed0f` |
| `app/lib/persistence/d1/types.ts` | 1697 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `7281dda9` |
| `app/lib/persistence/d1/usageRepository.ts` | 2909 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `519d85e1` |
| `app/lib/persistence/d1/workUnitFeedbackRepository.ts` | 1760 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `519d85e1` |
| `app/lib/persistence/d1/workUnitRepository.ts` | 4940 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `519d85e1` |
| `app/lib/persistence/d1/writeGuards.ts` | 2637 | include | `PUBLIC_REQUIRED` | `KEEP` | `519d85e1` | `f117f4a0` |
| `app/lib/persistence/inMemoryRepositories.ts` | 10736 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `9ae48b46` |
| `app/lib/persistence/mappers.ts` | 1961 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `app/lib/persistence/persistenceConfig.ts` | 2003 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `app/lib/persistence/relationshipEnforcedRepositories.ts` | 5395 | include | `PUBLIC_REQUIRED` | `KEEP` | `f117f4a0` | `f117f4a0` |
| `app/lib/persistence/repositories.ts` | 12260 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `473900c0` |
| `app/lib/persistence/repositoryResolver.ts` | 17338 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `184847a6` |
| `app/lib/persistence/routeRepositories.ts` | 3857 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `519d85e1` |
| `app/lib/persistence/sharedInMemoryStores.ts` | 2376 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `app/lib/persistence/tenantDbResolver.ts` | 9299 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `bdb6bbef` |
| `app/lib/persistence/tenantSchemaVersion.ts` | 1718 | include | `PUBLIC_REQUIRED` | `KEEP` | `473900c0` | `473900c0` |
| `app/lib/persistence/types.ts` | 6757 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `ee2ac992` |
| `app/lib/phase6/approvalLinkage/audit.ts` | 6580 | include | `PUBLIC_REQUIRED` | `KEEP` | `61feb06c` | `4c467afe` |
| `app/lib/phase6/approvalLinkage/canonical.ts` | 8189 | include | `PUBLIC_REQUIRED` | `KEEP` | `61feb06c` | `61feb06c` |
| `app/lib/phase6/approvalLinkage/constructors.ts` | 8355 | include | `PUBLIC_REQUIRED` | `KEEP` | `61feb06c` | `4c467afe` |
| `app/lib/phase6/approvalLinkage/index.ts` | 1616 | include | `PUBLIC_REQUIRED` | `KEEP` | `61feb06c` | `61feb06c` |
| `app/lib/phase6/approvalLinkage/sourceEvaluation.ts` | 32638 | include | `PUBLIC_REQUIRED` | `KEEP` | `61feb06c` | `4c467afe` |
| `app/lib/phase6/approvalLinkage/types.ts` | 11295 | include | `PUBLIC_REQUIRED` | `KEEP` | `61feb06c` | `61feb06c` |
| `app/lib/phase6/approvalLinkage/validation.ts` | 10263 | include | `PUBLIC_REQUIRED` | `KEEP` | `61feb06c` | `61feb06c` |
| `app/lib/phase6/approvalLinkage/verifier.ts` | 7742 | include | `PUBLIC_REQUIRED` | `KEEP` | `61feb06c` | `4c467afe` |
| `app/lib/phase6/artifacts/construction.ts` | 6960 | include | `PUBLIC_REQUIRED` | `KEEP` | `640e5ea7` | `640e5ea7` |
| `app/lib/phase6/artifacts/constructors.ts` | 10713 | include | `PUBLIC_REQUIRED` | `KEEP` | `640e5ea7` | `c16d5978` |
| `app/lib/phase6/artifacts/index.ts` | 625 | include | `PUBLIC_REQUIRED` | `KEEP` | `27b9d07b` | `640e5ea7` |
| `app/lib/phase6/artifacts/types.ts` | 13392 | include | `PUBLIC_REQUIRED` | `KEEP` | `27b9d07b` | `c16d5978` |
| `app/lib/phase6/artifacts/validation.ts` | 7740 | include | `PUBLIC_REQUIRED` | `KEEP` | `27b9d07b` | `c16d5978` |
| `app/lib/phase6/artifacts/validators.ts` | 22280 | include | `PUBLIC_REQUIRED` | `KEEP` | `27b9d07b` | `c16d5978` |
| `app/lib/phase6/canonicalIdentity/constructors.ts` | 14284 | include | `PUBLIC_REQUIRED` | `KEEP` | `354fe0c5` | `354fe0c5` |
| `app/lib/phase6/canonicalIdentity/index.ts` | 960 | include | `PUBLIC_REQUIRED` | `KEEP` | `354fe0c5` | `354fe0c5` |
| `app/lib/phase6/canonicalIdentity/types.ts` | 5311 | include | `PUBLIC_REQUIRED` | `KEEP` | `354fe0c5` | `354fe0c5` |
| `app/lib/phase6/canonicalIdentity/validation.ts` | 11471 | include | `PUBLIC_REQUIRED` | `KEEP` | `354fe0c5` | `354fe0c5` |
| `app/lib/phase6/identityIndependence/audit.ts` | 8504 | include | `PUBLIC_REQUIRED` | `KEEP` | `354fe0c5` | `354fe0c5` |
| `app/lib/phase6/identityIndependence/index.ts` | 1307 | include | `PUBLIC_REQUIRED` | `KEEP` | `354fe0c5` | `354fe0c5` |
| `app/lib/phase6/identityIndependence/types.ts` | 4550 | include | `PUBLIC_REQUIRED` | `KEEP` | `354fe0c5` | `354fe0c5` |
| `app/lib/phase6/identityIndependence/validation.ts` | 2067 | include | `PUBLIC_REQUIRED` | `KEEP` | `354fe0c5` | `354fe0c5` |
| `app/lib/phase6/identityIndependence/verifier.ts` | 15906 | include | `PUBLIC_REQUIRED` | `KEEP` | `354fe0c5` | `354fe0c5` |
| `app/lib/phase6/persistenceAuditEvidence/construction.ts` | 3166 | include | `PUBLIC_REQUIRED` | `KEEP` | `3d9a6f99` | `3d9a6f99` |
| `app/lib/phase6/persistenceAuditEvidence/constructors.ts` | 8919 | include | `PUBLIC_REQUIRED` | `KEEP` | `3d9a6f99` | `3d9a6f99` |
| `app/lib/phase6/persistenceAuditEvidence/index.ts` | 691 | include | `PUBLIC_REQUIRED` | `KEEP` | `202d5b6e` | `3d9a6f99` |
| `app/lib/phase6/persistenceAuditEvidence/types.ts` | 8118 | include | `PUBLIC_REQUIRED` | `KEEP` | `202d5b6e` | `d30e3b56` |
| `app/lib/phase6/persistenceAuditEvidence/validators.ts` | 20285 | include | `PUBLIC_REQUIRED` | `KEEP` | `202d5b6e` | `e7d0bf5a` |
| `app/lib/phase6/persistenceTargetDecision/construction.ts` | 2916 | include | `PUBLIC_REQUIRED` | `KEEP` | `1d2ec870` | `1d2ec870` |
| `app/lib/phase6/persistenceTargetDecision/constructors.ts` | 8667 | include | `PUBLIC_REQUIRED` | `KEEP` | `1d2ec870` | `1d2ec870` |
| `app/lib/phase6/persistenceTargetDecision/index.ts` | 662 | include | `PUBLIC_REQUIRED` | `KEEP` | `56394e75` | `1d2ec870` |
| `app/lib/phase6/persistenceTargetDecision/types.ts` | 6424 | include | `PUBLIC_REQUIRED` | `KEEP` | `56394e75` | `56394e75` |
| `app/lib/phase6/persistenceTargetDecision/validators.ts` | 16792 | include | `PUBLIC_REQUIRED` | `KEEP` | `56394e75` | `e7d0bf5a` |
| `app/lib/phase6/recorderAuditSummary/construction.ts` | 3206 | include | `PUBLIC_REQUIRED` | `KEEP` | `f0fc1618` | `f0fc1618` |
| `app/lib/phase6/recorderAuditSummary/constructors.ts` | 13259 | include | `PUBLIC_REQUIRED` | `KEEP` | `f0fc1618` | `47280a5f` |
| `app/lib/phase6/recorderAuditSummary/index.ts` | 941 | include | `PUBLIC_REQUIRED` | `KEEP` | `e301f5a7` | `f0fc1618` |
| `app/lib/phase6/recorderAuditSummary/types.ts` | 8571 | include | `PUBLIC_REQUIRED` | `KEEP` | `e301f5a7` | `d30e3b56` |
| `app/lib/phase6/recorderAuditSummary/validators.ts` | 27868 | include | `PUBLIC_REQUIRED` | `KEEP` | `e301f5a7` | `e7d0bf5a` |
| `app/lib/phase6/recorderAuditSummaryEvidenceLedgerLinkage/index.ts` | 771 | include | `PUBLIC_REQUIRED` | `KEEP` | `d37ff15e` | `d37ff15e` |
| `app/lib/phase6/recorderAuditSummaryEvidenceLedgerLinkage/types.ts` | 5907 | include | `PUBLIC_REQUIRED` | `KEEP` | `d37ff15e` | `23af067f` |
| `app/lib/phase6/recorderAuditSummaryEvidenceLedgerLinkage/validators.ts` | 9922 | include | `PUBLIC_REQUIRED` | `KEEP` | `d37ff15e` | `23af067f` |
| `app/lib/phase6/reviewEvidence/audit.ts` | 7195 | include | `PUBLIC_REQUIRED` | `KEEP` | `c28eb646` | `06f3d275` |
| `app/lib/phase6/reviewEvidence/constructors.ts` | 18525 | include | `PUBLIC_REQUIRED` | `KEEP` | `c28eb646` | `354fe0c5` |
| `app/lib/phase6/reviewEvidence/index.ts` | 1272 | include | `PUBLIC_REQUIRED` | `KEEP` | `c28eb646` | `c28eb646` |
| `app/lib/phase6/reviewEvidence/types.ts` | 6451 | include | `PUBLIC_REQUIRED` | `KEEP` | `c28eb646` | `354fe0c5` |
| `app/lib/phase6/reviewEvidence/validation.ts` | 4634 | include | `PUBLIC_REQUIRED` | `KEEP` | `c28eb646` | `354fe0c5` |
| `app/lib/phase6/reviewEvidence/validators.ts` | 8584 | include | `PUBLIC_REQUIRED` | `KEEP` | `c28eb646` | `c28eb646` |
| `app/lib/phase6/reviewEvidence/verifier.ts` | 7865 | include | `PUBLIC_REQUIRED` | `KEEP` | `c28eb646` | `c28eb646` |
| `app/lib/phase6/revisionReference/evaluate.ts` | 13916 | include | `PUBLIC_REQUIRED` | `KEEP` | `fe2fffcc` | `fe2fffcc` |
| `app/lib/phase6/revisionReference/types.ts` | 6582 | include | `PUBLIC_REQUIRED` | `KEEP` | `fe2fffcc` | `fe2fffcc` |
| `app/lib/phase6/runtimeAuthorization/audit.ts` | 3566 | include | `PUBLIC_REQUIRED` | `KEEP` | `94ad961d` | `cc4fa777` |
| `app/lib/phase6/runtimeAuthorization/canonical.ts` | 5337 | include | `PUBLIC_REQUIRED` | `KEEP` | `94ad961d` | `94ad961d` |
| `app/lib/phase6/runtimeAuthorization/eligibility.ts` | 14479 | include | `PUBLIC_REQUIRED` | `KEEP` | `94ad961d` | `902a40fc` |
| `app/lib/phase6/runtimeAuthorization/humanDecisionPolicy.ts` | 5396 | include | `PUBLIC_REQUIRED` | `KEEP` | `94ad961d` | `94ad961d` |
| `app/lib/phase6/runtimeAuthorization/index.ts` | 2159 | include | `PUBLIC_REQUIRED` | `KEEP` | `94ad961d` | `902a40fc` |
| `app/lib/phase6/runtimeAuthorization/types.ts` | 10435 | include | `PUBLIC_REQUIRED` | `KEEP` | `94ad961d` | `94ad961d` |
| `app/lib/phase6/runtimeAuthorization/validation.ts` | 5828 | include | `PUBLIC_REQUIRED` | `KEEP` | `94ad961d` | `cc4fa777` |
| `app/lib/phase6/shared/forbiddenGrantFields.ts` | 2584 | include | `PUBLIC_REQUIRED` | `KEEP` | `f3344ae5` | `f3344ae5` |
| `app/lib/phase6/shared/isoUtcTimestamp.ts` | 3100 | include | `PUBLIC_REQUIRED` | `KEEP` | `8a51e1a0` | `8a51e1a0` |
| `app/lib/phase6/temporalAssociation/evaluate.ts` | 15577 | include | `PUBLIC_REQUIRED` | `KEEP` | `2dd858ec` | `2dd858ec` |
| `app/lib/phase6/temporalAssociation/types.ts` | 6421 | include | `PUBLIC_REQUIRED` | `KEEP` | `2dd858ec` | `2dd858ec` |
| `app/lib/phase6/temporalContract/evaluate.ts` | 13363 | include | `PUBLIC_REQUIRED` | `KEEP` | `a52bd028` | `be8d1768` |
| `app/lib/phase6/temporalContract/types.ts` | 4750 | include | `PUBLIC_REQUIRED` | `KEEP` | `a52bd028` | `a52bd028` |
| `app/lib/roi.ts` | 189 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `d086a294` |
| `app/lib/runtime/cloudflareRuntimeEnv.ts` | 1669 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `21997eed` |
| `app/lib/runtime/localFallbackAuthority.ts` | 2296 | include | `PUBLIC_REQUIRED` | `KEEP` | `519d85e1` | `519d85e1` |
| `app/lib/runtime/requestRuntimeConfig.ts` | 15744 | include | `PUBLIC_REQUIRED` | `KEEP` | `21997eed` | `6a8d26d6` |
| `app/lib/runtime/requestRuntimeEnvInjection.ts` | 2803 | include | `PUBLIC_REQUIRED` | `KEEP` | `21997eed` | `21997eed` |
| `app/lib/runtime/validatedRuntimeEnv.ts` | 5140 | include | `PUBLIC_REQUIRED` | `KEEP` | `b09a6804` | `b09a6804` |
| `app/lib/security/README.md` | 852 | include | `PUBLIC_REQUIRED` | `KEEP` | `60e3f3bf` | `60e3f3bf` |
| `app/lib/security/actionApproval.ts` | 2597 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `app/lib/security/approvalMac/approvalMac.ts` | 6930 | include | `PUBLIC_REQUIRED` | `KEEP` | `727244f2` | `727244f2` |
| `app/lib/security/approvalMac/canonicalApprovalPayload.ts` | 8560 | include | `PUBLIC_REQUIRED` | `KEEP` | `727244f2` | `727244f2` |
| `app/lib/security/approvalMac/tenantSecretProvider.ts` | 2144 | include | `PUBLIC_REQUIRED` | `KEEP` | `727244f2` | `727244f2` |
| `app/lib/security/approvalPreviewBinding.ts` | 6347 | include | `PUBLIC_REQUIRED` | `KEEP` | `706b9701` | `7281dda9` |
| `app/lib/security/approvalStore.ts` | 10386 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `902a40fc` |
| `app/lib/security/approvalStoreResolver.ts` | 4282 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `60e3f3bf` |
| `app/lib/security/auditLog.ts` | 3592 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `94ad961d` |
| `app/lib/security/auditPersistence.ts` | 4220 | include | `PUBLIC_REQUIRED` | `KEEP` | `ee2ac992` | `ee2ac992` |
| `app/lib/security/csrfProtection.ts` | 1440 | include | `PUBLIC_REQUIRED` | `KEEP` | `eea05130` | `7281dda9` |
| `app/lib/security/externalActions.ts` | 1342 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `21997eed` |
| `app/lib/security/hash.ts` | 8348 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `d09f325d` |
| `app/lib/security/policy.ts` | 2563 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `eea05130` |
| `app/lib/security/rateLimitGate.ts` | 2403 | include | `PUBLIC_REQUIRED` | `KEEP` | `eea05130` | `7281dda9` |
| `app/lib/security/rbac.ts` | 3448 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/security/requestBody.ts` | 3948 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `app/lib/security/routeGuards.ts` | 2797 | include | `PUBLIC_REQUIRED` | `KEEP` | `d175311b` | `ee2ac992` |
| `app/lib/security/runtimeAuthorizationEvidenceResolver.ts` | 7047 | include | `PUBLIC_REQUIRED` | `KEEP` | `94ad961d` | `902a40fc` |
| `app/lib/security/runtimeAuthorizationGate.ts` | 22042 | include | `PUBLIC_REQUIRED` | `KEEP` | `94ad961d` | `21997eed` |
| `app/lib/security/runtimeAuthorizationReceipt.ts` | 3471 | include | `PUBLIC_REQUIRED` | `KEEP` | `94ad961d` | `902a40fc` |
| `app/lib/security/safeErrors.ts` | 4068 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `ee2ac992` |
| `app/lib/security/session.ts` | 2310 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `21997eed` |
| `app/lib/security/tenantAccess.ts` | 1444 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `defae92e` |
| `app/lib/security/tenantSecret.ts` | 1402 | include | `PUBLIC_REQUIRED` | `KEEP` | `d09f325d` | `d09f325d` |
| `app/lib/security/textNormalize.ts` | 3202 | include | `PUBLIC_REQUIRED` | `KEEP` | `d175311b` | `d175311b` |
| `app/lib/sourceHoppers.ts` | 4712 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `e768dee8` |
| `app/lib/subagents/calendarScheduleAgent.ts` | 776 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/subagents/chiefOfStaffAgent.ts` | 1792 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/subagents/contextMergeAgent.ts` | 1495 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/subagents/correctionAgent.ts` | 2430 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/subagents/evalRedTeamAgent.ts` | 735 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/subagents/githubIssueAgent.ts` | 499 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/subagents/gmailHopperAgent.ts` | 727 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/subagents/googleCalendarHopperAgent.ts` | 950 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/subagents/googleDriveHopperAgent.ts` | 746 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/subagents/interruptibilityAgent.ts` | 508 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/subagents/notionHopperAgent.ts` | 702 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/subagents/privacySandboxAgent.ts` | 1105 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/subagents/registry.ts` | 2639 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/subagents/replyDraftAgent.ts` | 380 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/subagents/slackHopperAgent.ts` | 664 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/subagents/sourceNormalizationAgent.ts` | 728 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/subagents/taskAgent.ts` | 445 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/subagents/voicePromptAgent.ts` | 471 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/subagents/workUnitDraftAgent.ts` | 1268 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/tenant/types.ts` | 1938 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/toolBackend.ts` | 6395 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `a1810809` |
| `app/lib/toolBackendValidation.ts` | 5604 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `7281dda9` |
| `app/lib/trustBoundaries.ts` | 3105 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `app/lib/workUnitDrafts.ts` | 5491 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `e768dee8` |
| `app/lib/workUnitExecution.ts` | 8675 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `e768dee8` |
| `app/lib/workUnitRanking.ts` | 2351 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/workUnitSafety.ts` | 5092 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/workUnitVoicePush.ts` | 4260 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/lib/workunitInbox/actionFieldClient.ts` | 2706 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/workunitInbox/actionPreviewMapping.ts` | 193 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/workunitInbox/mockSignals.ts` | 175 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/workunitInbox/persistenceMapping.ts` | 189 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `defae92e` |
| `app/lib/workunitInbox/sources/calendar/fakeCalendarSource.ts` | 80 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/workunitInbox/sources/calendar/toNormalizedToolSignal.ts` | 84 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/workunitInbox/sources/calendar/types.ts` | 67 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/workunitInbox/sources/github/client.ts` | 66 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/workunitInbox/sources/github/fakeGitHubClient.ts` | 76 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/workunitInbox/sources/github/fakeGitHubSource.ts` | 76 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/workunitInbox/sources/github/realGitHubClient.ts` | 76 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/workunitInbox/sources/github/resolveGitHubSource.ts` | 79 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/workunitInbox/sources/github/toNormalizedToolSignal.ts` | 82 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/workunitInbox/sources/github/types.ts` | 65 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/workunitInbox/sources/slack/fakeSlackSource.ts` | 74 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/workunitInbox/sources/slack/toNormalizedToolSignal.ts` | 81 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/workunitInbox/sources/slack/types.ts` | 64 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/workunitInbox/transform.ts` | 171 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/lib/workunitInbox/types.ts` | 163 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `app/page.tsx` | 166 | include | `PUBLIC_REQUIRED` | `KEEP` | `80a63485` | `defae92e` |
| `app/styles/layoutStyles.ts` | 22008 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `9ee4e4ee` |
| `app/styles/theme.ts` | 874 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `d086a294` |
| `app/types/cloudflare-env.ts` | 1607 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `21997eed` |
| `app/types/decision.ts` | 297 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `d086a294` |
| `app/types/inbox.ts` | 216 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `d086a294` |
| `app/types/sourceHopper.ts` | 1581 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `app/types/studio.ts` | 177 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `d086a294` |
| `app/types/toolBackend.ts` | 1250 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `e768dee8` |
| `app/types/ui.ts` | 202 | include | `PUBLIC_REQUIRED` | `KEEP` | `9ee4e4ee` | `9ee4e4ee` |
| `app/types/workunit.ts` | 588 | include | `PUBLIC_REQUIRED` | `KEEP` | `d086a294` | `9ee4e4ee` |
| `config/public-repository-manifest.json` | 43729 | exclude | `PRIVATE_DEVELOPMENT` | `KEEP` | `-` | `-` |
| `contracts/operations/d1-operational-evidence.v1.json` | 5647 | include | `PUBLIC_REQUIRED` | `KEEP` | `664b1726` | `57473375` |
| `docs/ALPHA_EVIDENCE_LEDGER.md` | 5745 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `cf24ca32` | `cf24ca32` |
| `docs/ALPHA_EXIT_CRITERIA.md` | 5178 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `287515ca` | `287515ca` |
| `docs/ALPHA_OPERATOR_RUNBOOK.md` | 5782 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `8a8d078b` | `8a8d078b` |
| `docs/ALPHA_PACKAGE_VERIFICATION.md` | 4478 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `158c074a` | `158c074a` |
| `docs/ALPHA_RC_DRY_RUN.md` | 6551 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `158c074a` | `158c074a` |
| `docs/ALPHA_RELEASE_READINESS.md` | 13750 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `c6582586` | `c828ab72` |
| `docs/ALPHA_SIGNOFF_TEMPLATE.md` | 2983 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `8a8d078b` | `8a8d078b` |
| `docs/APPROVALSTORE_DUAL_READ_WIRING_PRE_SPEC.md` | 16240 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `dcf6007a` | `dcf6007a` |
| `docs/APPROVAL_CHAIN_LINKAGE_CONTRACT.md` | 12856 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `61feb06c` | `61feb06c` |
| `docs/APPROVAL_HASH_KEYING_PLAN.md` | 5887 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `227df324` | `227df324` |
| `docs/APPROVAL_MAC_ROLLOUT_CONTRACT.md` | 8918 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `dcf6007a` | `dcf6007a` |
| `docs/APPROVAL_SECRET_THREAT_MODEL.md` | 4796 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `227df324` | `227df324` |
| `docs/ATRA_DOCTRINE.md` | 4788 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `99f1d440` | `99f1d440` |
| `docs/ATRA_PAIN_INCENTIVE_AND_OBJECTION_MODEL.md` | 8255 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `59c03314` | `59c03314` |
| `docs/BRANCH_PROTECTION_POLICY.md` | 3629 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `c65589cf` | `c65589cf` |
| `docs/CANONICAL_APPROVAL_PAYLOAD_SPEC.md` | 10302 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `fcc67a1d` | `fcc67a1d` |
| `docs/CANONICAL_DECISION_INDEX.md` | 5901 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `67a9774b` | `59c03314` |
| `docs/CANONICAL_IDENTITY_INDEPENDENCE_CONTRACT.md` | 13694 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `354fe0c5` | `61feb06c` |
| `docs/CI_SAFETY_GATE.md` | 1268 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `66c334f1` | `66c334f1` |
| `docs/COMPILED_SQL_ARTIFACT_CONTRACT.md` | 8700 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `0fe6d60b` | `0fe6d60b` |
| `docs/CONTEXT_INDEX.md` | 5374 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `c3e36f3c` | `67a9774b` |
| `docs/D1_READ_ONLY_EXECUTION_GATE.md` | 11704 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `1c2c9201` | `1c2c9201` |
| `docs/D1_SCHEMA_CATALOG.md` | 7103 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `c2d73fec` | `c2d73fec` |
| `docs/DECISION_RUBRIC.md` | 5761 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `99f1d440` | `99f1d440` |
| `docs/DECOMPOSITION_EVALUATION_HARNESS_SPEC.md` | 8268 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `651ff8e5` | `651ff8e5` |
| `docs/DECOMPOSITION_EVALUATION_RUBRIC.md` | 6112 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `651ff8e5` | `651ff8e5` |
| `docs/DECOMPOSITION_STANDARD.md` | 6775 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `17df0e39` | `17df0e39` |
| `docs/DEPENDENCY_MAP.md` | 15005 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `defae92e` | `67a9774b` |
| `docs/DIRECTORY_STRUCTURE.md` | 8590 | exclude | `PRIVATE_DEVELOPMENT` | `REPLACE_WITH_PUBLIC_EQUIVALENT` | `defae92e` | `67a9774b` |
| `docs/DOCS_CONSISTENCY_AUDIT.md` | 4113 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `67a9774b` | `67a9774b` |
| `docs/EVIDENCE_REVIEW_GATE.md` | 13494 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `45975b44` | `45975b44` |
| `docs/EVIDENCE_REVIEW_RECORD_CONTRACT.md` | 10981 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `45975b44` | `45975b44` |
| `docs/EVIDENCE_STANDARD.md` | 5604 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `eac1f507` | `eac1f507` |
| `docs/FOUR_EYES_REVIEW_EVIDENCE_CONTRACT.md` | 11627 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `c28eb646` | `61feb06c` |
| `docs/GRAPH_MODEL.md` | 5800 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `e229cdfd` | `e229cdfd` |
| `docs/HTPE_H1A_TEMPORAL_CONTRACT.md` | 10209 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `a52bd028` | `2dd858ec` |
| `docs/HTPE_H1B1_REVISION_REFERENCE_CONTRACT.md` | 7897 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `fe2fffcc` | `2dd858ec` |
| `docs/HTPE_H1B2A_DECLARED_TEMPORAL_ASSOCIATION_CONTRACT.md` | 10976 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `2dd858ec` | `2dd858ec` |
| `docs/HUMAN_DECISION_GATE.md` | 12871 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `e9bf2885` | `e9bf2885` |
| `docs/HUMAN_DECISION_RECORD_CONTRACT.md` | 16023 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `e9bf2885` | `61feb06c` |
| `docs/INFORMATION_INTAKE_POLICY.md` | 5675 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `99f1d440` | `99f1d440` |
| `docs/LLM_JUDGMENT_EVALUATION_GATE.md` | 13180 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `1c343756` | `1c343756` |
| `docs/LLM_JUDGMENT_RECORD_CONTRACT.md` | 10545 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `1c343756` | `1c343756` |
| `docs/LOOP_I0_AUTOMATION_SIGNOFF.md` | 1904 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `d969adf4` | `d969adf4` |
| `docs/LOOP_STATUS_COLLECTOR_RUNBOOK.md` | 7512 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `d969adf4` | `d969adf4` |
| `docs/MANUAL_REVIEW_PROTOCOL.md` | 4834 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `8a8d078b` | `8a8d078b` |
| `docs/NEXT_CAPABILITY_GATE.md` | 5813 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `287515ca` | `287515ca` |
| `docs/NL2SQL_PLANNING_GATE.md` | 7284 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `d6945870` | `d6945870` |
| `docs/P6_A0_EXPLICIT_HUMAN_GO.md` | 3639 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `c2968cff` | `c2968cff` |
| `docs/P6_A0_FABEL5_PATCH_SEQUENCE_PLAN.md` | 8934 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `c2968cff` | `c2968cff` |
| `docs/P6_A0_FABEL5_PHASE6_CROSS_LANE_AUDIT.md` | 19238 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `c2968cff` | `c2968cff` |
| `docs/P6_FIX_001_EXPLICIT_HUMAN_GO.md` | 3706 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `36d146d0` | `36d146d0` |
| `docs/P6_FIX_002_EXPLICIT_HUMAN_GO.md` | 3546 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `47280a5f` | `47280a5f` |
| `docs/P6_FIX_003_EXPLICIT_HUMAN_GO.md` | 3673 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `cda3b8c3` | `cda3b8c3` |
| `docs/P6_FIX_004_EXPLICIT_HUMAN_GO.md` | 3868 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `8a51e1a0` | `8a51e1a0` |
| `docs/P6_I0_EXPLICIT_HUMAN_GO.md` | 1945 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `27b9d07b` | `27b9d07b` |
| `docs/P6_I0_SHARED_TYPES_VALIDATORS.md` | 8836 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `27b9d07b` | `c16d5978` |
| `docs/P6_I1_EXPLICIT_HUMAN_GO.md` | 1834 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `640e5ea7` | `640e5ea7` |
| `docs/P6_I1_PURE_ARTIFACT_CONSTRUCTORS.md` | 10104 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `640e5ea7` | `c16d5978` |
| `docs/P6_I2_EXPLICIT_HUMAN_GO.md` | 1758 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `437276cf` | `437276cf` |
| `docs/P6_I2_FIXTURE_BASED_SPINE_TESTS.md` | 8075 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `437276cf` | `437276cf` |
| `docs/P6_I3_EXPLICIT_HUMAN_GO.md` | 1861 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `5a5b6162` | `5a5b6162` |
| `docs/P6_I3_IN_MEMORY_NON_PERSISTENT_HARNESS.md` | 7833 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `5a5b6162` | `5a5b6162` |
| `docs/P6_I4_EXPLICIT_HUMAN_GO.md` | 2066 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `de830061` | `de830061` |
| `docs/P6_I4_STORAGE_GATE_RECORD_CONTRACT.md` | 6734 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `de830061` | `de830061` |
| `docs/P6_I4_STORAGE_GATE_SPEC.md` | 12904 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `de830061` | `de830061` |
| `docs/P6_I5A_EXPLICIT_HUMAN_GO.md` | 2800 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `106e7731` | `106e7731` |
| `docs/P6_I5A_PERSISTENCE_TARGET_DECISION.md` | 10881 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `106e7731` | `106e7731` |
| `docs/P6_I5A_TARGET_DECISION_RECORD_CONTRACT.md` | 6027 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `106e7731` | `106e7731` |
| `docs/P6_I5B_EXPLICIT_HUMAN_GO.md` | 2615 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `56394e75` | `56394e75` |
| `docs/P6_I5B_PERSISTENCE_TARGET_TYPES_VALIDATORS.md` | 7648 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `56394e75` | `56394e75` |
| `docs/P6_I5C_EXPLICIT_HUMAN_GO.md` | 2896 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `1d2ec870` | `1d2ec870` |
| `docs/P6_I5C_PURE_TARGET_DECISION_CONSTRUCTORS.md` | 8522 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `1d2ec870` | `1d2ec870` |
| `docs/P6_I5D_EXPLICIT_HUMAN_GO.md` | 2808 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `9733a03b` | `9733a03b` |
| `docs/P6_I5D_TEST_ONLY_TARGET_DECISION_FIXTURE.md` | 7535 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `9733a03b` | `9733a03b` |
| `docs/P6_I5E_EXPLICIT_HUMAN_GO.md` | 2993 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `25ce876a` | `25ce876a` |
| `docs/P6_I5E_IN_MEMORY_TEST_ONLY_TARGET_DECISION_ADAPTER.md` | 8548 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `25ce876a` | `25ce876a` |
| `docs/P6_I5F_EXPLICIT_HUMAN_GO.md` | 2745 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `a508d898` | `a508d898` |
| `docs/P6_I5F_PERSISTENCE_AUDIT_EVENT_CONTRACT.md` | 6149 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `a508d898` | `a508d898` |
| `docs/P6_I5F_PERSISTENCE_AUDIT_EVIDENCE_SPEC.md` | 12195 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `a508d898` | `a508d898` |
| `docs/P6_I5G_EXPLICIT_HUMAN_GO.md` | 3148 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `202d5b6e` | `202d5b6e` |
| `docs/P6_I5G_PERSISTENCE_AUDIT_EVIDENCE_TYPES_VALIDATORS.md` | 9959 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `202d5b6e` | `202d5b6e` |
| `docs/P6_I5H_EXPLICIT_HUMAN_GO.md` | 3856 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `3d9a6f99` | `3d9a6f99` |
| `docs/P6_I5H_PURE_PERSISTENCE_AUDIT_EVIDENCE_CONSTRUCTORS.md` | 9809 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `3d9a6f99` | `3d9a6f99` |
| `docs/P6_I5I_EXPLICIT_HUMAN_GO.md` | 3857 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `3910233c` | `3910233c` |
| `docs/P6_I5I_TEST_ONLY_PERSISTENCE_AUDIT_EVIDENCE_FIXTURE.md` | 8902 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `3910233c` | `3910233c` |
| `docs/P6_I5J_EXPLICIT_HUMAN_GO.md` | 3568 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `c42db9d6` | `c42db9d6` |
| `docs/P6_I5J_IN_MEMORY_TEST_ONLY_PERSISTENCE_AUDIT_EVIDENCE_RECORDER.md` | 9075 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `c42db9d6` | `c42db9d6` |
| `docs/P6_I5K_EXPLICIT_HUMAN_GO.md` | 3370 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `c7dd55cd` | `c7dd55cd` |
| `docs/P6_I5K_RECORDER_AUDIT_SUMMARY_CONTRACT.md` | 9173 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `c7dd55cd` | `2a7cd430` |
| `docs/P6_I5K_RECORDER_AUDIT_SUMMARY_SPEC.md` | 14909 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `c7dd55cd` | `2a7cd430` |
| `docs/P6_I5L_EXPLICIT_HUMAN_GO.md` | 4342 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `e301f5a7` | `e301f5a7` |
| `docs/P6_I5L_RECORDER_AUDIT_SUMMARY_TYPES_VALIDATORS.md` | 13963 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `e301f5a7` | `2a7cd430` |
| `docs/P6_I5M_EXPLICIT_HUMAN_GO.md` | 4798 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `f0fc1618` | `f0fc1618` |
| `docs/P6_I5M_PURE_RECORDER_AUDIT_SUMMARY_CONSTRUCTORS.md` | 11702 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `f0fc1618` | `f0fc1618` |
| `docs/P6_I5N_EXPLICIT_HUMAN_GO.md` | 4786 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `68c74c4a` | `68c74c4a` |
| `docs/P6_I5N_TEST_ONLY_RECORDER_AUDIT_SUMMARY_FIXTURE.md` | 9799 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `68c74c4a` | `68c74c4a` |
| `docs/P6_I5O_EXPLICIT_HUMAN_GO.md` | 4499 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `e3cf1d60` | `e3cf1d60` |
| `docs/P6_I5O_TEST_ONLY_RECORDER_AUDIT_SUMMARY_HARNESS.md` | 7578 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `e3cf1d60` | `e3cf1d60` |
| `docs/P6_I5P_EXPLICIT_HUMAN_GO.md` | 4104 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `53c00663` | `53c00663` |
| `docs/P6_I5P_RECORDER_AUDIT_SUMMARY_LANE_READINESS_REVIEW.md` | 15065 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `53c00663` | `53c00663` |
| `docs/P6_I5Q_EXPLICIT_HUMAN_GO.md` | 4418 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `cb7f104f` | `cb7f104f` |
| `docs/P6_I5Q_RECORDER_AUDIT_SUMMARY_EVIDENCE_LEDGER_LINKAGE_GATE_SPEC.md` | 17280 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `cb7f104f` | `cb7f104f` |
| `docs/P6_I5R_EXPLICIT_HUMAN_GO.md` | 4733 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `b24f1c14` | `b24f1c14` |
| `docs/P6_I5R_RECORDER_AUDIT_SUMMARY_EVIDENCE_LEDGER_STATIC_CONTRACT_NO_APPEND_VALIDATOR_SPEC.md` | 18909 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `b24f1c14` | `b24f1c14` |
| `docs/P6_I5S_EXPLICIT_HUMAN_GO.md` | 4138 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `d37ff15e` | `d37ff15e` |
| `docs/P6_I5S_NO_APPEND_LINKAGE_CONTRACT_TYPES_AND_PURE_VALIDATOR.md` | 11930 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `d37ff15e` | `d37ff15e` |
| `docs/P6_I5_EXPLICIT_HUMAN_GO.md` | 2380 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `48ab8d8c` | `48ab8d8c` |
| `docs/P6_I5_PERSISTENCE_IMPLEMENTATION_GATE.md` | 13806 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `48ab8d8c` | `48ab8d8c` |
| `docs/P6_I5_PERSISTENCE_RECORD_CONTRACT.md` | 7947 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `48ab8d8c` | `48ab8d8c` |
| `docs/P7_1_RUNTIME_SECURITY_SIGNOFF.md` | 2136 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `727244f2` | `727244f2` |
| `docs/P7_1_TSP_MINIMAL_RUNTIME_IMPLEMENTATION.md` | 12367 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `727244f2` | `727244f2` |
| `docs/PHASE6_IMPLEMENTATION_DECISION_RECORD.md` | 14627 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `00ca406d` | `00ca406d` |
| `docs/PHASE6_LOOP_ENGINEERING_PLAYBOOK.md` | 8556 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `00ca406d` | `00ca406d` |
| `docs/PHASE_2A_LLM_PROVIDER_BOUNDARY.md` | 906 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `d3e54428` | `d3e54428` |
| `docs/PHASE_2B_FIRST_PROVIDER_ADAPTER_ENTRY_CRITERIA.md` | 8627 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `b6d36f47` | `b6d36f47` |
| `docs/PHASE_2C_PROVIDER_DRY_RUN_CONTRACT.md` | 1803 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `3e2fadf7` | `3e2fadf7` |
| `docs/PHASE_2D_BLOCKED_DIAGNOSTIC_REDACTION.md` | 2120 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `75a35d61` | `75a35d61` |
| `docs/PHASE_2E_OFFLINE_PROVIDER_FIXTURE_GATE.md` | 2256 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `13ea4988` | `13ea4988` |
| `docs/PHASE_2F_PROVIDER_CANDIDATE_DECISION_RFC.md` | 2315 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `1303e947` | `1303e947` |
| `docs/PHASE_3E_LIVE_PROVIDER_READINESS_SCORECARD.md` | 2617 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `d66cd259` | `d66cd259` |
| `docs/PHASE_4A_LIVE_PROVIDER_PROPOSAL_GATE.md` | 1914 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `a16e0985` | `a16e0985` |
| `docs/PHASE_4B_PROVIDER_ADAPTER_BOUNDARY.md` | 1463 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `edbbdbf5` | `edbbdbf5` |
| `docs/PHASE_4C_DRY_RUN_PROVIDER_ADAPTER_DESIGN_GATE.md` | 1816 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `7b5368c1` | `7b5368c1` |
| `docs/PHASE_4D_DRY_RUN_PROVIDER_ADAPTER.md` | 1070 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `782c8525` | `782c8525` |
| `docs/PHASE_4E_DRY_RUN_PROVIDER_ADAPTER_ROUTING_GATE.md` | 1883 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `b081dc16` | `b081dc16` |
| `docs/PHASE_4F_CANDIDATE_ONLY_MOCK_BOUNDARY_HARNESS.md` | 1666 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `2e4969ee` | `2e4969ee` |
| `docs/PHASE_4G_CANDIDATE_ONLY_CONTEXT_PACK_EXCLUSION_GUARD.md` | 1582 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `151fcd4c` | `151fcd4c` |
| `docs/PHASE_4H_GUARDED_CANDIDATE_ONLY_MOCK_BOUNDARY_CHAIN.md` | 2274 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `bf428cd8` | `bf428cd8` |
| `docs/PHASE_4I_CANDIDATE_ONLY_DECOMPOSITION_CLASSIFIER.md` | 2124 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `3bf45a8b` | `3bf45a8b` |
| `docs/PHASE_4J_CANDIDATE_ONLY_DECOMPOSITION_RULE_GATE.md` | 2154 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `ad4c5eb8` | `ad4c5eb8` |
| `docs/PHASE_5A_SAAS_P0_ROUTE_AUTH_HARDENING.md` | 3173 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `eea05130` | `eea05130` |
| `docs/PHASE_5B_APPROVAL_MARKUSED_CAS.md` | 5397 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `a1810809` | `a1810809` |
| `docs/PHASE_5C_APPROVAL_PREVIEW_EXPLICIT_BINDING.md` | 5187 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `706b9701` | `706b9701` |
| `docs/PHASE_5D_ACTION_PREVIEW_D1_MAPROW_JSON.md` | 4496 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `28caed0f` | `28caed0f` |
| `docs/PHASE_5E_TENANT_SECRET_HMAC_HASH_BINDING.md` | 5193 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `d09f325d` | `d09f325d` |
| `docs/PHASE_6A_D1_SCHEMA_INTEGRITY_INVENTORY.md` | 14939 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `87467ec9` | `87467ec9` |
| `docs/PHASE_6B_D1_SCHEMA_INDEX_CONSTRAINT_HARDENING.md` | 8218 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `199a8e32` | `199a8e32` |
| `docs/PHASE_6C_D1_REPOSITORY_INVARIANT_ENFORCEMENT.md` | 7645 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `52eb7519` | `52eb7519` |
| `docs/PHASE_7A_ALPHA_RELEASE_SAFETY_CHECKLIST.md` | 11404 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `81b8a484` | `81b8a484` |
| `docs/PHASE_7B_ALPHA_SAFETY_GATE_VALIDATION.md` | 8057 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `dc6a2742` | `dc6a2742` |
| `docs/PROVENANCE_CLAIM_CONTRACT.md` | 45614 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `e91dd673` | `02938a5b` |
| `docs/PROVENANCE_MODEL.md` | 5203 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `eac1f507` | `eac1f507` |
| `docs/QUERY_INTENT_CONTRACT.md` | 6391 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `d6945870` | `d6945870` |
| `docs/QUERY_RESULT_RECORD_CONTRACT.md` | 8874 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `1c2c9201` | `1c2c9201` |
| `docs/README.md` | 1780 | include | `PUBLIC_OPTIONAL` | `KEEP` | `76e97d2b` | `6af7fe8e` |
| `docs/READ_ONLY_QUERY_PLANNING_SPEC.md` | 6426 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `c2d73fec` | `c2d73fec` |
| `docs/REAL_LLM_READINESS_GATE.md` | 3334 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `2a3b0ede` | `7281dda9` |
| `docs/RELATIONSHIP_SCHEMA.md` | 7144 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `e229cdfd` | `e229cdfd` |
| `docs/RELEASE_CANDIDATE_GATE.md` | 4100 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `c828ab72` | `c828ab72` |
| `docs/RELEASE_DECISION_RECORD.md` | 5511 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `cf24ca32` | `cf24ca32` |
| `docs/RISK_REGISTER.md` | 6655 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `c828ab72` | `c828ab72` |
| `docs/RULE_REVIEW_GATE.md` | 11192 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `5fda7489` | `5fda7489` |
| `docs/RULE_REVIEW_RECORD_CONTRACT.md` | 8503 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `5fda7489` | `5fda7489` |
| `docs/RUNTIME_AUTHORIZATION_GATE_CONTRACT.md` | 9332 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `94ad961d` | `cc4fa777` |
| `docs/SAFE_QUERY_PLAN_CONTRACT.md` | 7951 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `bf90ff45` | `bf90ff45` |
| `docs/SAFE_QUERY_PLAN_GENERATION_GATE.md` | 8473 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `bf90ff45` | `bf90ff45` |
| `docs/SQL_COMPILATION_GATE.md` | 10160 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `0fe6d60b` | `0fe6d60b` |
| `docs/TENANT_SECRET_PROVIDER_DESIGN.md` | 6976 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `227df324` | `227df324` |
| `docs/TSP_DESIGN_REVIEW_CLOSURE.md` | 10822 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `fcc67a1d` | `fcc67a1d` |
| `docs/TYPED_DECOMPOSITION_OBJECT.md` | 5642 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `17df0e39` | `17df0e39` |
| `docs/architecture/CANONICAL_WORKUNIT_PIPELINE_REFACTOR_PROGRAM.md` | 28087 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `6a2bc849` | `00f995b1` |
| `docs/architecture/PERSISTENCE_CONTRACT.md` | 14460 | include | `PUBLIC_OPTIONAL` | `KEEP` | `bdb6bbef` | `8b5d13a3` |
| `docs/architecture/SAAS_ARCHITECTURE.md` | 14341 | include | `PUBLIC_OPTIONAL` | `KEEP` | `e768dee8` | `67a9774b` |
| `docs/architecture/WORKUNIT_OS_ORGANIZATION.md` | 14599 | include | `PUBLIC_OPTIONAL` | `KEEP` | `fc3a785c` | `67a9774b` |
| `docs/architecture/WORKUNIT_OS_OVERVIEW.md` | 12904 | include | `PUBLIC_OPTIONAL` | `KEEP` | `fc3a785c` | `67a9774b` |
| `docs/operations/CLOUDFLARE_D1_SETUP.md` | 61522 | include | `PUBLIC_OPTIONAL` | `KEEP` | `e768dee8` | `8b5d13a3` |
| `docs/operations/CLOUDFLARE_RUNTIME_DEPLOYMENT.md` | 27382 | include | `PUBLIC_OPTIONAL` | `KEEP` | `b09a6804` | `85b40fd4` |
| `docs/operations/CODEX_AUTOMATION_PROMPTS.md` | 11793 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `fc3a785c` | `67a9774b` |
| `docs/operations/D1_OPERATIONAL_EVIDENCE.md` | 18034 | include | `PUBLIC_OPTIONAL` | `KEEP` | `27b81d60` | `85b40fd4` |
| `docs/operations/ENVIRONMENT_CONFIG.md` | 8096 | include | `PUBLIC_OPTIONAL` | `KEEP` | `e768dee8` | `21997eed` |
| `docs/release/ALPHA_READINESS_SUMMARY.json` | 1750 | exclude | `PRIVATE_OPERATIONS` | `MOVE_TO_PRIVATE_REPOSITORY` | `c6582586` | `c6582586` |
| `docs/release/ALPHA_RELEASE_MATRIX.json` | 2065 | exclude | `PRIVATE_OPERATIONS` | `MOVE_TO_PRIVATE_REPOSITORY` | `81b8a484` | `81b8a484` |
| `docs/release/PRIVATE_ASSET_MIGRATION_MANIFEST.md` | 6432 | exclude | `PRIVATE_OPERATIONS` | `KEEP` | `-` | `-` |
| `docs/release/PUBLIC_REPOSITORY_INVENTORY.md` | 155025 | exclude | `PRIVATE_DEVELOPMENT` | `KEEP` | `-` | `-` |
| `docs/release/PUBLIC_REPOSITORY_POLICY.md` | 10627 | exclude | `PRIVATE_DEVELOPMENT` | `KEEP` | `-` | `-` |
| `docs/research/HOPPER_VECTOR_ALGORITHM.md` | 14405 | include | `PUBLIC_OPTIONAL` | `KEEP` | `fc3a785c` | `67a9774b` |
| `docs/security/DEVELOPMENT_SECURITY_CHECKLIST.md` | 2487 | include | `PUBLIC_OPTIONAL` | `KEEP` | `e768dee8` | `6af7fe8e` |
| `docs/security/REDTEAM_2026-06-29.md` | 7108 | exclude | `SENSITIVE` | `BLOCK_PUBLICATION` | `d175311b` | `d175311b` |
| `docs/security/SECURITY_MODEL.md` | 15357 | include | `PUBLIC_OPTIONAL` | `KEEP` | `e768dee8` | `67a9774b` |
| `docs/security/TRUST_BOUNDARIES.md` | 6786 | include | `PUBLIC_OPTIONAL` | `KEEP` | `e768dee8` | `6af7fe8e` |
| `docs/specs/ACTION_FIELD_SPEC.md` | 28265 | include | `PUBLIC_OPTIONAL` | `KEEP` | `e768dee8` | `67a9774b` |
| `docs/specs/API_CONTRACT.md` | 30518 | include | `PUBLIC_OPTIONAL` | `KEEP` | `e768dee8` | `67a9774b` |
| `docs/specs/DATA_MODEL.md` | 18853 | include | `PUBLIC_OPTIONAL` | `KEEP` | `e768dee8` | `6af7fe8e` |
| `docs/specs/ERROR_MODEL.md` | 30989 | include | `PUBLIC_OPTIONAL` | `KEEP` | `e768dee8` | `6af7fe8e` |
| `docs/specs/LLM_PROCESSING_MODEL.md` | 4952 | include | `PUBLIC_OPTIONAL` | `KEEP` | `e768dee8` | `6af7fe8e` |
| `docs/specs/MVP_USECASE_SPEC.md` | 6312 | include | `PUBLIC_OPTIONAL` | `KEEP` | `e768dee8` | `67a9774b` |
| `docs/specs/WORKUNIT_DOMAIN_MODEL.md` | 16206 | include | `PUBLIC_OPTIONAL` | `KEEP` | `e768dee8` | `6af7fe8e` |
| `electron/main.ts` | 2919 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `electron/preload.ts` | 794 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `electron/types.d.ts` | 444 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `eslint.config.mjs` | 486 | include | `PUBLIC_REQUIRED` | `KEEP` | `80a63485` | `e768dee8` |
| `migrations/0001_control_db.sql` | 984 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `migrations/0002_tenant_core.sql` | 1799 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `migrations/0003_tenant_persistence_foundation.sql` | 4898 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `defae92e` |
| `migrations/0004_control_auth_workspace.sql` | 2005 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `defae92e` |
| `migrations/0005_tenant_scoped_indexes.sql` | 3050 | include | `PUBLIC_REQUIRED` | `KEEP` | `199a8e32` | `199a8e32` |
| `migrations/0006_action_preview_creator.sql` | 572 | include | `PUBLIC_REQUIRED` | `KEEP` | `ee2ac992` | `ee2ac992` |
| `migrations/manifest.json` | 4967 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `c4f99dd9` |
| `migrations/schema-contract.json` | 12122 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `5d30f353` |
| `next.config.ts` | 1102 | include | `PUBLIC_REQUIRED` | `KEEP` | `80a63485` | `7281dda9` |
| `open-next.config.ts` | 490 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `package-lock.json` | 413528 | include | `PUBLIC_REQUIRED` | `KEEP` | `80a63485` | `fd700f54` |
| `package.json` | 4219 | include | `PUBLIC_REQUIRED` | `KEEP` | `80a63485` | `6a2bc849` |
| `postcss.config.mjs` | 94 | include | `PUBLIC_REQUIRED` | `KEEP` | `80a63485` | `80a63485` |
| `prototypes/proactive-voice-secretary/README.md` | 683 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `fc3a785c` | `fc3a785c` |
| `prototypes/proactive-voice-secretary/engine.mts` | 1407 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `fc3a785c` | `fc3a785c` |
| `prototypes/proactive-voice-secretary/mockEvents.mts` | 686 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `fc3a785c` | `fc3a785c` |
| `prototypes/proactive-voice-secretary/voiceLoop.mts` | 1254 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `fc3a785c` | `fc3a785c` |
| `public/Photos/icon/gmail.png` | 2454 | include | `THIRD_PARTY_UNRESOLVED` | `BLOCK_PUBLICATION` | `fc3a785c` | `fc3a785c` |
| `public/Photos/icon/google-calendar.png` | 2872 | include | `THIRD_PARTY_UNRESOLVED` | `BLOCK_PUBLICATION` | `fc3a785c` | `fc3a785c` |
| `public/Photos/icon/salesforce.jpeg` | 201249 | include | `THIRD_PARTY_UNRESOLVED` | `BLOCK_PUBLICATION` | `fc3a785c` | `fc3a785c` |
| `public/Photos/icon/slack.png` | 85562 | include | `THIRD_PARTY_UNRESOLVED` | `BLOCK_PUBLICATION` | `fc3a785c` | `fc3a785c` |
| `public/workunit-source-icons/SOURCES.md` | 880 | include | `THIRD_PARTY_VERIFIED` | `KEEP` | `46f4a678` | `46f4a678` |
| `public/workunit-source-icons/figma.svg` | 1058 | include | `THIRD_PARTY_VERIFIED` | `KEEP` | `46f4a678` | `46f4a678` |
| `public/workunit-source-icons/github.svg` | 787 | include | `THIRD_PARTY_VERIFIED` | `KEEP` | `46f4a678` | `46f4a678` |
| `public/workunit-source-icons/gmail.svg` | 304 | include | `THIRD_PARTY_VERIFIED` | `KEEP` | `46f4a678` | `46f4a678` |
| `public/workunit-source-icons/google-calendar.svg` | 1175 | include | `THIRD_PARTY_VERIFIED` | `KEEP` | `46f4a678` | `46f4a678` |
| `public/workunit-source-icons/google-chat.svg` | 289 | include | `THIRD_PARTY_VERIFIED` | `KEEP` | `46f4a678` | `46f4a678` |
| `public/workunit-source-icons/google-docs.svg` | 343 | include | `THIRD_PARTY_VERIFIED` | `KEEP` | `46f4a678` | `46f4a678` |
| `public/workunit-source-icons/google-drive.svg` | 564 | include | `THIRD_PARTY_VERIFIED` | `KEEP` | `46f4a678` | `46f4a678` |
| `public/workunit-source-icons/google-meet.svg` | 581 | include | `THIRD_PARTY_VERIFIED` | `KEEP` | `46f4a678` | `46f4a678` |
| `public/workunit-source-icons/google-sheets.svg` | 409 | include | `THIRD_PARTY_VERIFIED` | `KEEP` | `46f4a678` | `46f4a678` |
| `public/workunit-source-icons/google-slides.svg` | 329 | include | `THIRD_PARTY_VERIFIED` | `KEEP` | `46f4a678` | `46f4a678` |
| `public/workunit-source-icons/jira.svg` | 443 | include | `THIRD_PARTY_VERIFIED` | `KEEP` | `46f4a678` | `46f4a678` |
| `public/workunit-source-icons/linear.svg` | 418 | include | `THIRD_PARTY_VERIFIED` | `KEEP` | `46f4a678` | `46f4a678` |
| `public/workunit-source-icons/notion.svg` | 943 | include | `THIRD_PARTY_VERIFIED` | `KEEP` | `46f4a678` | `46f4a678` |
| `public/workunit-source-icons/salesforce.svg` | 509 | include | `THIRD_PARTY_VERIFIED` | `KEEP` | `46f4a678` | `46f4a678` |
| `public/workunit-source-icons/slack.svg` | 1088 | include | `THIRD_PARTY_VERIFIED` | `KEEP` | `46f4a678` | `46f4a678` |
| `public/workunit-ui-icons/workunit-logo.png` | 3082 | include | `PUBLIC_REQUIRED` | `KEEP` | `e693271e` | `e693271e` |
| `scripts/alpha-safety-gate.mjs` | 11954 | include | `PUBLIC_REQUIRED` | `KEEP` | `dc6a2742` | `1680b561` |
| `scripts/cf-d1-bootstrap-apply.d.mts` | 2357 | include | `PUBLIC_REQUIRED` | `KEEP` | `5d30f353` | `c8403250` |
| `scripts/cf-d1-bootstrap-apply.mjs` | 28106 | include | `PUBLIC_REQUIRED` | `KEEP` | `5d30f353` | `282a5780` |
| `scripts/cf-d1-bootstrap-jwt-local.mjs` | 16902 | include | `PUBLIC_REQUIRED` | `KEEP` | `bc58dbeb` | `48808cb6` |
| `scripts/cf-d1-bootstrap-local.d.mts` | 601 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `1680b561` |
| `scripts/cf-d1-bootstrap-local.mjs` | 3946 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `1680b561` |
| `scripts/cf-d1-bootstrap-prepare.d.mts` | 2325 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `5ba2de79` |
| `scripts/cf-d1-bootstrap-prepare.mjs` | 13561 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `5ba2de79` |
| `scripts/cf-d1-evidence-init.d.mts` | 397 | include | `PUBLIC_REQUIRED` | `KEEP` | `57473375` | `282a5780` |
| `scripts/cf-d1-evidence-init.mjs` | 3600 | include | `PUBLIC_REQUIRED` | `KEEP` | `57473375` | `282a5780` |
| `scripts/cf-d1-evidence-verify.d.mts` | 949 | include | `PUBLIC_REQUIRED` | `KEEP` | `664b1726` | `cbadd347` |
| `scripts/cf-d1-evidence-verify.mjs` | 13038 | include | `PUBLIC_REQUIRED` | `KEEP` | `664b1726` | `cbadd347` |
| `scripts/cf-d1-evidence.d.mts` | 1160 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `5d30f353` |
| `scripts/cf-d1-evidence.mjs` | 6191 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `5d30f353` |
| `scripts/cf-d1-migrate.mjs` | 6049 | include | `PUBLIC_REQUIRED` | `KEEP` | `bdb6bbef` | `8b5d13a3` |
| `scripts/cf-d1-migrations-apply.d.mts` | 1198 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `c8403250` |
| `scripts/cf-d1-migrations-apply.mjs` | 18026 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `282a5780` |
| `scripts/cf-d1-migrations-check.d.mts` | 159 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `1680b561` |
| `scripts/cf-d1-migrations-check.mjs` | 5870 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `282a5780` |
| `scripts/cf-d1-migrations-plan.d.mts` | 326 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `1680b561` |
| `scripts/cf-d1-migrations-plan.mjs` | 1963 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `5d30f353` |
| `scripts/cf-d1-schema-verify-local.d.mts` | 332 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `1680b561` |
| `scripts/cf-d1-schema-verify-local.mjs` | 1993 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `1680b561` |
| `scripts/cf-d1-schema-verify-remote.d.mts` | 1145 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `85b40fd4` |
| `scripts/cf-d1-schema-verify-remote.mjs` | 12094 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `85b40fd4` |
| `scripts/cloudflare-deploy-dry-run.mjs` | 2766 | include | `PUBLIC_REQUIRED` | `KEEP` | `b09a6804` | `b09a6804` |
| `scripts/cloudflare-deploy-preflight.mjs` | 8677 | include | `PUBLIC_REQUIRED` | `KEEP` | `b09a6804` | `282a5780` |
| `scripts/cloudflare-deploy-prepare.mjs` | 3249 | include | `PUBLIC_REQUIRED` | `KEEP` | `b09a6804` | `21997eed` |
| `scripts/cloudflare-deploy.d.mts` | 1415 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `85b40fd4` |
| `scripts/cloudflare-deploy.mjs` | 20186 | include | `PUBLIC_REQUIRED` | `KEEP` | `b09a6804` | `85b40fd4` |
| `scripts/electron-build-check.mjs` | 4422 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `scripts/electron-runtime-smoke.mjs` | 3558 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `scripts/electronDependencyPolicy.mjs` | 3411 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `scripts/export-public-repository.mjs` | 6444 | include | `PUBLIC_REQUIRED` | `KEEP` | `-` | `-` |
| `scripts/generate-local-jwt.mjs` | 892 | include | `PUBLIC_REQUIRED` | `KEEP` | `bc58dbeb` | `bc58dbeb` |
| `scripts/lib/cfDeployConfig.mjs` | 14728 | include | `PUBLIC_REQUIRED` | `KEEP` | `b09a6804` | `c4f99dd9` |
| `scripts/lib/cfDeployConfigAuthority.d.mts` | 2353 | include | `PUBLIC_REQUIRED` | `KEEP` | `c8403250` | `1a97b3a8` |
| `scripts/lib/cfDeployConfigAuthority.mjs` | 11547 | include | `PUBLIC_REQUIRED` | `KEEP` | `c8403250` | `1a97b3a8` |
| `scripts/lib/d1AtomicBatch.d.mts` | 850 | include | `PUBLIC_REQUIRED` | `KEEP` | `5d30f353` | `5d30f353` |
| `scripts/lib/d1AtomicBatch.mjs` | 2988 | include | `PUBLIC_REQUIRED` | `KEEP` | `5d30f353` | `5d30f353` |
| `scripts/lib/d1BootstrapFixture.d.mts` | 1116 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `1680b561` |
| `scripts/lib/d1BootstrapFixture.mjs` | 5245 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `473900c0` |
| `scripts/lib/d1BootstrapVerify.d.mts` | 1468 | include | `PUBLIC_REQUIRED` | `KEEP` | `5d30f353` | `5ba2de79` |
| `scripts/lib/d1BootstrapVerify.mjs` | 5415 | include | `PUBLIC_REQUIRED` | `KEEP` | `5d30f353` | `5ba2de79` |
| `scripts/lib/d1EvidenceReceipts.d.mts` | 4962 | include | `PUBLIC_REQUIRED` | `KEEP` | `57473375` | `cbadd347` |
| `scripts/lib/d1EvidenceReceipts.mjs` | 33608 | include | `PUBLIC_REQUIRED` | `KEEP` | `57473375` | `85b40fd4` |
| `scripts/lib/d1LocalBootstrap.d.mts` | 1020 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `5d30f353` |
| `scripts/lib/d1LocalBootstrap.mjs` | 2646 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `5d30f353` |
| `scripts/lib/d1MigrationLedger.d.mts` | 3101 | include | `PUBLIC_REQUIRED` | `KEEP` | `5d30f353` | `5d30f353` |
| `scripts/lib/d1MigrationLedger.mjs` | 14621 | include | `PUBLIC_REQUIRED` | `KEEP` | `5d30f353` | `5d30f353` |
| `scripts/lib/d1MigrationManifest.d.mts` | 4008 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `c4f99dd9` |
| `scripts/lib/d1MigrationManifest.mjs` | 17711 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `c4f99dd9` |
| `scripts/lib/d1MigrationRunner.d.mts` | 4524 | include | `PUBLIC_REQUIRED` | `KEEP` | `bdb6bbef` | `8b5d13a3` |
| `scripts/lib/d1MigrationRunner.mjs` | 22185 | include | `PUBLIC_REQUIRED` | `KEEP` | `bdb6bbef` | `8b5d13a3` |
| `scripts/lib/d1OperationalEvidence.d.mts` | 7927 | include | `PUBLIC_REQUIRED` | `KEEP` | `664b1726` | `85b40fd4` |
| `scripts/lib/d1OperationalEvidence.mjs` | 43722 | include | `PUBLIC_REQUIRED` | `KEEP` | `664b1726` | `85b40fd4` |
| `scripts/lib/d1SchemaContract.d.mts` | 3004 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `5d30f353` |
| `scripts/lib/d1SchemaContract.mjs` | 9838 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `5d30f353` |
| `scripts/lib/localJwt.mjs` | 12656 | include | `PUBLIC_REQUIRED` | `KEEP` | `bc58dbeb` | `fd700f54` |
| `scripts/lib/localJwtSmokeRunner.mjs` | 46011 | include | `PUBLIC_REQUIRED` | `KEEP` | `70dd7990` | `48808cb6` |
| `scripts/lib/publicRepositoryManifest.mjs` | 5131 | include | `PUBLIC_REQUIRED` | `KEEP` | `-` | `-` |
| `scripts/lib/typescriptModuleGraph.d.mts` | 999 | include | `PUBLIC_REQUIRED` | `KEEP` | `6a2bc849` | `6a2bc849` |
| `scripts/lib/typescriptModuleGraph.mjs` | 15740 | include | `PUBLIC_REQUIRED` | `KEEP` | `6a2bc849` | `6a2bc849` |
| `scripts/local-jwt-smoke-local.mjs` | 4290 | include | `PUBLIC_REQUIRED` | `KEEP` | `70dd7990` | `48808cb6` |
| `scripts/loop/index.mts` | 5454 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `d969adf4` | `d969adf4` |
| `scripts/loop/loopReportFormatter.mts` | 6933 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `d969adf4` | `d969adf4` |
| `scripts/loop/loopStatusCollector.mts` | 6135 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `d969adf4` | `d969adf4` |
| `scripts/loop/safeCommandPolicy.mts` | 8284 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `d969adf4` | `d969adf4` |
| `scripts/report-legacy-surface.mjs` | 2564 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `c3e36f3c` | `6a2bc849` |
| `scripts/verify-local-jwt.mjs` | 1046 | include | `PUBLIC_REQUIRED` | `KEEP` | `bc58dbeb` | `bc58dbeb` |
| `scripts/verify-public-repository.mjs` | 11011 | include | `PUBLIC_REQUIRED` | `KEEP` | `-` | `-` |
| `tests/actionDraftModel.test.mts` | 3214 | include | `PUBLIC_REQUIRED` | `KEEP` | `160ffe5e` | `160ffe5e` |
| `tests/actionFieldClient.test.mts` | 2980 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `tests/actionFieldErrorState.test.mts` | 3945 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `ee2ac992` |
| `tests/actionFieldViewerVariantRouting.test.mts` | 4190 | include | `PUBLIC_REQUIRED` | `KEEP` | `a73f094a` | `a73f094a` |
| `tests/actionPreviewApprovalSecurity.test.mts` | 8322 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `21997eed` |
| `tests/actionPreviewD1MapRowJsonHardening.test.mts` | 9142 | include | `PUBLIC_REQUIRED` | `KEEP` | `28caed0f` | `28caed0f` |
| `tests/alphaEvidenceLedger.test.mts` | 5594 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `cf24ca32` | `cf24ca32` |
| `tests/alphaExitCriteriaGate.test.mts` | 5912 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `287515ca` | `287515ca` |
| `tests/alphaOperatorRunbook.test.mts` | 4846 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `8a8d078b` | `8a8d078b` |
| `tests/alphaReleaseCandidateDryRun.test.mts` | 4186 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `158c074a` | `158c074a` |
| `tests/alphaReleaseReadinessConsolidation.test.mts` | 9640 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `c6582586` | `c6582586` |
| `tests/alphaReleaseReadinessGate.test.mts` | 4882 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `c828ab72` | `c828ab72` |
| `tests/alphaReleaseSafetyChecklist.test.mts` | 7525 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `81b8a484` | `81b8a484` |
| `tests/alphaSafetyGateValidation.test.mts` | 8345 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `dc6a2742` | `7281dda9` |
| `tests/approvalCorrectionRegression.test.mts` | 39106 | include | `PUBLIC_REQUIRED` | `KEEP` | `c3e36f3c` | `49e87f33` |
| `tests/approvalDecisionTraceModel.test.mts` | 12042 | include | `PUBLIC_REQUIRED` | `KEEP` | `d6316b36` | `d6316b36` |
| `tests/approvalMarkUsedCas.test.mts` | 8887 | include | `PUBLIC_REQUIRED` | `KEEP` | `a1810809` | `a1810809` |
| `tests/approvalPreviewExplicitBinding.test.mts` | 10581 | include | `PUBLIC_REQUIRED` | `KEEP` | `706b9701` | `7281dda9` |
| `tests/approvalRecordTenantIsolation.test.mts` | 5003 | include | `PUBLIC_REQUIRED` | `KEEP` | `c3e36f3c` | `c3e36f3c` |
| `tests/approvalStatusClient.test.mts` | 6719 | include | `PUBLIC_REQUIRED` | `KEEP` | `c3e36f3c` | `c3e36f3c` |
| `tests/approvalStatusRouteP0.test.mts` | 3718 | include | `PUBLIC_REQUIRED` | `KEEP` | `67150bd7` | `f117f4a0` |
| `tests/approvalStoreDualReadWiringPreSpec.test.mts` | 21578 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `dcf6007a` | `dcf6007a` |
| `tests/approvalStoreResolver.test.mts` | 7080 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `tests/architectureBoundaries.test.mts` | 41826 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `defae92e` | `00f995b1` |
| `tests/architectureLegacySurface.test.mts` | 5833 | include | `PUBLIC_REQUIRED` | `KEEP` | `c3e36f3c` | `6a2bc849` |
| `tests/atraDoctrineIntakeRubric.test.mts` | 10385 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `99f1d440` | `99f1d440` |
| `tests/atraWorkspace.test.mts` | 9586 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `tests/atraWorkspaceConnection.test.mts` | 6682 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `tests/auditLogPanelSafety.test.mts` | 3464 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `6a2bc849` |
| `tests/authAdapter.test.mts` | 6155 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `21997eed` |
| `tests/blockedDiagnosticRedaction.test.mts` | 2786 | include | `PUBLIC_REQUIRED` | `KEEP` | `75a35d61` | `75a35d61` |
| `tests/blockedProviderAdapter.test.mts` | 4077 | include | `PUBLIC_REQUIRED` | `KEEP` | `edbbdbf5` | `edbbdbf5` |
| `tests/calendarNormalizedSignalSource.test.mts` | 3496 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `tests/candidateOnlyContextPackExclusionGuard.test.mts` | 10229 | include | `PUBLIC_REQUIRED` | `KEEP` | `151fcd4c` | `151fcd4c` |
| `tests/candidateOnlyContextPackExclusionGuardP0.test.mts` | 2017 | include | `PUBLIC_REQUIRED` | `KEEP` | `151fcd4c` | `151fcd4c` |
| `tests/candidateOnlyDecompositionClassifier.test.mts` | 11327 | include | `PUBLIC_REQUIRED` | `KEEP` | `3bf45a8b` | `3bf45a8b` |
| `tests/candidateOnlyDecompositionClassifierP0.test.mts` | 1765 | include | `PUBLIC_REQUIRED` | `KEEP` | `151fcd4c` | `3bf45a8b` |
| `tests/candidateOnlyDecompositionRuleGate.test.mts` | 10505 | include | `PUBLIC_REQUIRED` | `KEEP` | `ad4c5eb8` | `ad4c5eb8` |
| `tests/candidateOnlyDecompositionRuleGateP0.test.mts` | 1871 | include | `PUBLIC_REQUIRED` | `KEEP` | `151fcd4c` | `ad4c5eb8` |
| `tests/candidateOnlyMockBoundaryHarness.test.mts` | 11626 | include | `PUBLIC_REQUIRED` | `KEEP` | `2e4969ee` | `2e4969ee` |
| `tests/candidateOnlyMockBoundaryHarnessP0.test.mts` | 1909 | include | `PUBLIC_REQUIRED` | `KEEP` | `2e4969ee` | `2e4969ee` |
| `tests/candidateWorkUnitBridge.test.mts` | 5696 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `tests/canonicalApprovalPayloadGate.test.mts` | 18458 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `fcc67a1d` | `fcc67a1d` |
| `tests/canonicalHash.test.mts` | 10407 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `tests/ciSafetyGateWorkflow.test.mts` | 2651 | include | `PUBLIC_REQUIRED` | `KEEP` | `66c334f1` | `b09a6804` |
| `tests/cloudflareBinding.test.mts` | 2368 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `tests/cloudflareDeployConfig.test.mts` | 24189 | include | `PUBLIC_REQUIRED` | `KEEP` | `b09a6804` | `85b40fd4` |
| `tests/cloudflareDeployHarness.mts` | 7231 | include | `PUBLIC_REQUIRED` | `KEEP` | `85b40fd4` | `85b40fd4` |
| `tests/cloudflareRemoteGateBoundaries.test.mts` | 18824 | include | `PUBLIC_REQUIRED` | `KEEP` | `85b40fd4` | `85b40fd4` |
| `tests/cloudflareRuntimeContextIsolation.test.mts` | 3731 | include | `PUBLIC_REQUIRED` | `KEEP` | `b09a6804` | `21997eed` |
| `tests/cloudflareRuntimeEnvArchitecture.test.mts` | 6299 | include | `PUBLIC_REQUIRED` | `KEEP` | `21997eed` | `6a8d26d6` |
| `tests/cloudflareRuntimeEnvValidation.test.mts` | 7339 | include | `PUBLIC_REQUIRED` | `KEEP` | `b09a6804` | `f117f4a0` |
| `tests/commercialSecurityBoundaryP0.test.mts` | 4490 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `f117f4a0` |
| `tests/controlRepositories.test.mts` | 3695 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `defae92e` |
| `tests/csrfProtection.test.mts` | 3018 | include | `PUBLIC_REQUIRED` | `KEEP` | `eea05130` | `7281dda9` |
| `tests/d1ApprovalTenantIsolation.test.mts` | 2670 | include | `PUBLIC_REQUIRED` | `KEEP` | `67150bd7` | `67150bd7` |
| `tests/d1Lifecycle.test.mts` | 7914 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `184847a6` |
| `tests/d1MigrationCli.test.mts` | 7423 | include | `PUBLIC_REQUIRED` | `KEEP` | `473900c0` | `8b5d13a3` |
| `tests/d1MigrationRunner.test.mts` | 18446 | include | `PUBLIC_REQUIRED` | `KEEP` | `bdb6bbef` | `8b5d13a3` |
| `tests/d1OperationalProof.test.mts` | 10251 | include | `PUBLIC_REQUIRED` | `KEEP` | `bdb6bbef` | `8b5d13a3` |
| `tests/d1ReadOnlyExecutionGate.test.mts` | 20705 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `1c2c9201` | `1c2c9201` |
| `tests/d1Repositories.test.mts` | 6909 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `tests/d1RepositoryInvariantEnforcement.test.mts` | 12981 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `52eb7519` | `7281dda9` |
| `tests/d1SchemaIndexConstraintHardening.test.mts` | 7656 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `199a8e32` | `199a8e32` |
| `tests/d1SchemaIntegrityInventory.test.mts` | 6798 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `87467ec9` | `87467ec9` |
| `tests/d1SchemaReadOnlyQueryPlanningGate.test.mts` | 13330 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `c2d73fec` | `c2d73fec` |
| `tests/d1bootstrapApplyGates.test.mts` | 46306 | include | `PUBLIC_REQUIRED` | `KEEP` | `5d30f353` | `1a97b3a8` |
| `tests/d1bootstrapArchitectureGuards.test.mts` | 35095 | include | `PUBLIC_REQUIRED` | `KEEP` | `5d30f353` | `1a97b3a8` |
| `tests/d1bootstrapAtomicity.test.mts` | 20317 | include | `PUBLIC_REQUIRED` | `KEEP` | `5d30f353` | `5ba2de79` |
| `tests/d1bootstrapLifecycle.test.mts` | 14432 | include | `PUBLIC_REQUIRED` | `KEEP` | `5d30f353` | `5d30f353` |
| `tests/d1configAuthority.test.mts` | 16384 | include | `PUBLIC_REQUIRED` | `KEEP` | `c8403250` | `1a97b3a8` |
| `tests/d1deployOrdering.test.mts` | 6732 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `85b40fd4` |
| `tests/d1evidenceCommandEmission.test.mts` | 6361 | include | `PUBLIC_REQUIRED` | `KEEP` | `282a5780` | `282a5780` |
| `tests/d1evidenceReceipts.test.mts` | 29109 | include | `PUBLIC_REQUIRED` | `KEEP` | `57473375` | `cbadd347` |
| `tests/d1evidenceRecorder.test.mts` | 23951 | include | `PUBLIC_REQUIRED` | `KEEP` | `664b1726` | `282a5780` |
| `tests/d1evidenceVerify.test.mts` | 30454 | include | `PUBLIC_REQUIRED` | `KEEP` | `664b1726` | `cbadd347` |
| `tests/d1migrationBootstrap.test.mts` | 12105 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `5d30f353` |
| `tests/d1migrationLedger.test.mts` | 13682 | include | `PUBLIC_REQUIRED` | `KEEP` | `5d30f353` | `5d30f353` |
| `tests/d1migrationManifest.test.mts` | 22661 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `c4f99dd9` |
| `tests/d1migrationOperatorGates.test.mts` | 17653 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `c8403250` |
| `tests/d1migrationOpsGuards.test.mts` | 13279 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `85b40fd4` |
| `tests/d1physicalDatabaseSeparation.test.mts` | 12142 | include | `PUBLIC_REQUIRED` | `KEEP` | `c4f99dd9` | `1a97b3a8` |
| `tests/d1remoteExecutionAuthority.test.mts` | 11190 | include | `PUBLIC_REQUIRED` | `KEEP` | `c8403250` | `85b40fd4` |
| `tests/d1schemaContract.test.mts` | 14442 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `5d30f353` |
| `tests/d1schemaSessionBootstrap.test.mts` | 7603 | include | `PUBLIC_REQUIRED` | `KEEP` | `1680b561` | `1680b561` |
| `tests/dashboardPreviewClient.test.mts` | 2656 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `defae92e` |
| `tests/decompositionEvalHarness.test.mts` | 3977 | include | `PUBLIC_REQUIRED` | `KEEP` | `c516d79b` | `c516d79b` |
| `tests/decompositionEvaluationHarnessSpecGate.test.mts` | 11877 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `651ff8e5` | `651ff8e5` |
| `tests/decompositionLatencyModel.test.mts` | 1464 | include | `PUBLIC_REQUIRED` | `KEEP` | `c516d79b` | `c516d79b` |
| `tests/decompositionNoRealProviderImport.test.mts` | 4863 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `tests/decompositionOrchestrator.test.mts` | 3459 | include | `PUBLIC_REQUIRED` | `KEEP` | `c7b54ad3` | `c7b54ad3` |
| `tests/decompositionOrchestratorP0.test.mts` | 3698 | include | `PUBLIC_REQUIRED` | `KEEP` | `c7b54ad3` | `c7b54ad3` |
| `tests/decompositionP0Harness.test.mts` | 2054 | include | `PUBLIC_REQUIRED` | `KEEP` | `c516d79b` | `c516d79b` |
| `tests/decompositionProviderBoundaryChokepoint.test.mts` | 5346 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `tests/decompositionStandardGate.test.mts` | 12701 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `17df0e39` | `17df0e39` |
| `tests/devGatedLlmCandidatePipeline.test.mts` | 4625 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `tests/domainLifecycle.test.mts` | 8653 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `tests/dryRunProviderAdapter.test.mts` | 7072 | include | `PUBLIC_REQUIRED` | `KEEP` | `782c8525` | `782c8525` |
| `tests/dryRunProviderAdapterDesignGate.test.mts` | 6230 | include | `PUBLIC_REQUIRED` | `KEEP` | `7b5368c1` | `7b5368c1` |
| `tests/dryRunProviderAdapterDesignGateP0.test.mts` | 1010 | include | `PUBLIC_REQUIRED` | `KEEP` | `7b5368c1` | `7b5368c1` |
| `tests/dryRunProviderAdapterP0.test.mts` | 1339 | include | `PUBLIC_REQUIRED` | `KEEP` | `782c8525` | `782c8525` |
| `tests/electronDependencyPolicy.test.mts` | 6848 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `7281dda9` | `7281dda9` |
| `tests/electronRuntimeDevShell.test.mts` | 6494 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `tests/electronSecurityInvariants.test.mts` | 7740 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `tests/evidenceProvenanceStandard.test.mts` | 10253 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `eac1f507` | `eac1f507` |
| `tests/evidenceReviewGate.test.mts` | 22483 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `45975b44` | `45975b44` |
| `tests/evidenceRootPermissions.test.mts` | 9986 | include | `PUBLIC_REQUIRED` | `KEEP` | `85b40fd4` | `85b40fd4` |
| `tests/evidenceTestRepo.mts` | 5619 | include | `PUBLIC_REQUIRED` | `KEEP` | `282a5780` | `cbadd347` |
| `tests/executionCommandModel.test.mts` | 6539 | include | `PUBLIC_REQUIRED` | `KEEP` | `d6316b36` | `b91b6a59` |
| `tests/executionDryRun.test.mts` | 12381 | include | `PUBLIC_REQUIRED` | `KEEP` | `87d92ce1` | `21997eed` |
| `tests/executionDryRunRoute.test.mts` | 27815 | include | `PUBLIC_REQUIRED` | `KEEP` | `ce272e15` | `6a2bc849` |
| `tests/executionReadinessModel.test.mts` | 9636 | include | `PUBLIC_REQUIRED` | `KEEP` | `d6316b36` | `d6316b36` |
| `tests/executionResultViewerModel.test.mts` | 5606 | include | `PUBLIC_REQUIRED` | `KEEP` | `e062ed80` | `e062ed80` |
| `tests/executionWireTest.test.mts` | 7128 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `tests/fixtures/architecture/current-pipeline-behavior.v1.json` | 12448 | include | `PUBLIC_REQUIRED` | `KEEP` | `6a2bc849` | `6a2bc849` |
| `tests/fixtures/architecture/declared-boundary-debt.v1.json` | 1805 | include | `PUBLIC_REQUIRED` | `KEEP` | `37b9411d` | `00f995b1` |
| `tests/fixtures/architecture/legacy-surface.v1.json` | 11877 | include | `PUBLIC_REQUIRED` | `KEEP` | `6a2bc849` | `6a2bc849` |
| `tests/fixtures/architecture/security-surface.v1.json` | 1902 | include | `PUBLIC_REQUIRED` | `KEEP` | `6a2bc849` | `6a2bc849` |
| `tests/fixtures/phase6/approvalLinkageFixture.mts` | 8836 | include | `PUBLIC_REQUIRED` | `KEEP` | `61feb06c` | `4c467afe` |
| `tests/fixtures/phase6/exampleSpineFixture.mts` | 14121 | include | `PUBLIC_REQUIRED` | `KEEP` | `437276cf` | `437276cf` |
| `tests/fixtures/phase6/persistenceAuditEvidenceFixture.mts` | 8973 | include | `PUBLIC_REQUIRED` | `KEEP` | `3910233c` | `3910233c` |
| `tests/fixtures/phase6/persistenceTargetDecisionFixture.mts` | 6036 | include | `PUBLIC_REQUIRED` | `KEEP` | `9733a03b` | `9733a03b` |
| `tests/fixtures/phase6/recorderAuditSummaryFixture.mts` | 15233 | include | `PUBLIC_REQUIRED` | `KEEP` | `68c74c4a` | `68c74c4a` |
| `tests/fixtures/phase6/runtimeAuthorizationFixture.mts` | 5613 | include | `PUBLIC_REQUIRED` | `KEEP` | `94ad961d` | `902a40fc` |
| `tests/frontendSelectionBridge.test.mts` | 6073 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `tests/githubClientSkeleton.test.mts` | 4213 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `7281dda9` |
| `tests/githubNormalizedSignalSource.test.mts` | 3960 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `tests/guardedCandidateOnlyMockBoundaryChain.test.mts` | 10136 | include | `PUBLIC_REQUIRED` | `KEEP` | `bf428cd8` | `bf428cd8` |
| `tests/guardedCandidateOnlyMockBoundaryChainP0.test.mts` | 2416 | include | `PUBLIC_REQUIRED` | `KEEP` | `bf428cd8` | `bf428cd8` |
| `tests/guardedLlmProviderP0.test.mts` | 4403 | include | `PUBLIC_REQUIRED` | `KEEP` | `d3e54428` | `d3e54428` |
| `tests/harness/phase6/inMemoryPersistenceAuditEvidenceRecorder.mts` | 12897 | include | `PUBLIC_REQUIRED` | `KEEP` | `c42db9d6` | `cda3b8c3` |
| `tests/harness/phase6/inMemoryPersistenceTargetDecisionAdapter.mts` | 12694 | include | `PUBLIC_REQUIRED` | `KEEP` | `25ce876a` | `cda3b8c3` |
| `tests/harness/phase6/inMemoryPhase6Harness.mts` | 9532 | include | `PUBLIC_REQUIRED` | `KEEP` | `5a5b6162` | `5a5b6162` |
| `tests/harness/phase6/recorderAuditSummaryHarness.mts` | 9198 | include | `PUBLIC_REQUIRED` | `KEEP` | `e3cf1d60` | `63e3c3d9` |
| `tests/helpers/fakeD1.ts` | 9201 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `28caed0f` |
| `tests/helpers/fakeDevServer.mjs` | 1633 | include | `PUBLIC_REQUIRED` | `KEEP` | `05186526` | `05186526` |
| `tests/helpers/jwt.ts` | 1122 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `7281dda9` |
| `tests/helpers/nodeSqlite.d.ts` | 741 | include | `PUBLIC_REQUIRED` | `KEEP` | `519d85e1` | `519d85e1` |
| `tests/helpers/registrySeed.ts` | 2633 | include | `PUBLIC_REQUIRED` | `KEEP` | `519d85e1` | `473900c0` |
| `tests/helpers/smokeSignalHarness.mjs` | 4151 | include | `PUBLIC_REQUIRED` | `KEEP` | `05186526` | `48808cb6` |
| `tests/helpers/sqliteD1.ts` | 4298 | include | `PUBLIC_REQUIRED` | `KEEP` | `519d85e1` | `8b5d13a3` |
| `tests/hopperActionRouter.test.mts` | 5021 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `tests/hopperEngine.test.mts` | 6291 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `tests/humanDecisionGate.test.mts` | 26898 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `e9bf2885` | `c16d5978` |
| `tests/internalAlphaFlowRegression.test.mts` | 19973 | include | `PUBLIC_REQUIRED` | `KEEP` | `2dcacd5d` | `7281dda9` |
| `tests/jwtAuthAdapter.test.mts` | 6033 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `21997eed` |
| `tests/lifecycleEndpoints.test.mts` | 11806 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `tests/lifecyclePersistence.test.mts` | 8113 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `f117f4a0` |
| `tests/liveProviderProposalGate.test.mts` | 5551 | include | `PUBLIC_REQUIRED` | `KEEP` | `a16e0985` | `a16e0985` |
| `tests/liveProviderReadinessScorecard.test.mts` | 8432 | include | `PUBLIC_REQUIRED` | `KEEP` | `d66cd259` | `d66cd259` |
| `tests/llmContextPack.test.mts` | 3249 | include | `PUBLIC_REQUIRED` | `KEEP` | `67150bd7` | `67150bd7` |
| `tests/llmDeepseekConfig.test.mts` | 3024 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `7281dda9` |
| `tests/llmDeepseekProvider.test.mts` | 6981 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `tests/llmJudgmentEvaluationGate.test.mts` | 23624 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `1c343756` | `1c343756` |
| `tests/llmModelRouter.test.mts` | 2752 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `tests/llmOrchestrator.test.mts` | 8926 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `tests/llmPipeline.test.mts` | 17836 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `7281dda9` |
| `tests/llmProviderBoundary.test.mts` | 2291 | include | `PUBLIC_REQUIRED` | `KEEP` | `d3e54428` | `d3e54428` |
| `tests/llmProviderConfig.test.mts` | 2616 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `tests/llmStageModelSelection.test.mts` | 5966 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `tests/localJwtAuthScripts.test.mts` | 5273 | include | `PUBLIC_REQUIRED` | `KEEP` | `bc58dbeb` | `bc58dbeb` |
| `tests/localJwtBootstrap.test.mts` | 1806 | include | `PUBLIC_REQUIRED` | `KEEP` | `bc58dbeb` | `bc58dbeb` |
| `tests/localJwtSmokeRunner.test.mts` | 26908 | include | `PUBLIC_REQUIRED` | `KEEP` | `70dd7990` | `48808cb6` |
| `tests/localJwtSmokeSignals.test.mts` | 6403 | include | `PUBLIC_REQUIRED` | `KEEP` | `05186526` | `05186526` |
| `tests/localJwtSmokeTimeouts.test.mts` | 8599 | include | `PUBLIC_REQUIRED` | `KEEP` | `48808cb6` | `48808cb6` |
| `tests/localJwtSourcePrecedence.test.mts` | 14414 | include | `PUBLIC_REQUIRED` | `KEEP` | `bc58dbeb` | `fd700f54` |
| `tests/loopStatusCollector.test.mts` | 16069 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `d969adf4` | `d969adf4` |
| `tests/mockExecutionModel.test.mts` | 7501 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `tests/mockLlmDecompositionBoundary.test.mts` | 4978 | include | `PUBLIC_REQUIRED` | `KEEP` | `c7b54ad3` | `c7b54ad3` |
| `tests/nl2sqlPlanningGate.test.mts` | 15314 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `d6945870` | `d6945870` |
| `tests/nodeDecompositionGoldLabels.test.mts` | 4157 | include | `PUBLIC_REQUIRED` | `KEEP` | `b378663b` | `b378663b` |
| `tests/nodeDecompositionP0Regression.test.mts` | 5209 | include | `PUBLIC_REQUIRED` | `KEEP` | `b378663b` | `b378663b` |
| `tests/nodeDecompositionPureModel.test.mts` | 4914 | include | `PUBLIC_REQUIRED` | `KEEP` | `b378663b` | `b378663b` |
| `tests/offlineProviderFixtureGate.test.mts` | 3228 | include | `PUBLIC_REQUIRED` | `KEEP` | `13ea4988` | `97488d9d` |
| `tests/persistenceConfig.test.mts` | 5912 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `9ae48b46` |
| `tests/persistencePhase2.test.mts` | 7004 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `defae92e` |
| `tests/phase1Wireup.test.mts` | 3265 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `defae92e` |
| `tests/phase1b.test.mts` | 6967 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `f117f4a0` |
| `tests/phase1cRoutes.test.mts` | 20836 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `21997eed` |
| `tests/phase6ApprovalLinkageArchitecture.test.mts` | 8335 | include | `PUBLIC_REQUIRED` | `KEEP` | `61feb06c` | `6a8d26d6` |
| `tests/phase6ApprovalLinkageAudit.test.mts` | 6998 | include | `PUBLIC_REQUIRED` | `KEEP` | `61feb06c` | `61feb06c` |
| `tests/phase6ApprovalLinkageCanonical.test.mts` | 7828 | include | `PUBLIC_REQUIRED` | `KEEP` | `61feb06c` | `61feb06c` |
| `tests/phase6ApprovalLinkageConstructors.test.mts` | 15077 | include | `PUBLIC_REQUIRED` | `KEEP` | `61feb06c` | `61feb06c` |
| `tests/phase6ApprovalLinkageHardening.test.mts` | 14478 | include | `PUBLIC_REQUIRED` | `KEEP` | `4c467afe` | `4c467afe` |
| `tests/phase6ApprovalLinkageVerifier.test.mts` | 11843 | include | `PUBLIC_REQUIRED` | `KEEP` | `61feb06c` | `61feb06c` |
| `tests/phase6CanonicalIdentity.test.mts` | 22609 | include | `PUBLIC_REQUIRED` | `KEEP` | `354fe0c5` | `354fe0c5` |
| `tests/phase6Fabel5CrossLaneAuditPlan.test.mts` | 11667 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `c2968cff` | `c2968cff` |
| `tests/phase6FixtureSpine.test.mts` | 21369 | include | `PUBLIC_REQUIRED` | `KEEP` | `437276cf` | `437276cf` |
| `tests/phase6IdentityIndependenceArchitecture.test.mts` | 11086 | include | `PUBLIC_REQUIRED` | `KEEP` | `354fe0c5` | `354fe0c5` |
| `tests/phase6IdentityIndependenceAudit.test.mts` | 19351 | include | `PUBLIC_REQUIRED` | `KEEP` | `354fe0c5` | `354fe0c5` |
| `tests/phase6IdentityIndependenceVerifier.test.mts` | 29367 | include | `PUBLIC_REQUIRED` | `KEEP` | `354fe0c5` | `354fe0c5` |
| `tests/phase6ImplementationReadinessGate.test.mts` | 21975 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `00ca406d` | `00ca406d` |
| `tests/phase6InMemoryHarness.test.mts` | 18495 | include | `PUBLIC_REQUIRED` | `KEEP` | `5a5b6162` | `5a5b6162` |
| `tests/phase6InMemoryPersistenceAuditEvidenceRecorder.test.mts` | 22597 | include | `PUBLIC_REQUIRED` | `KEEP` | `c42db9d6` | `cda3b8c3` |
| `tests/phase6InMemoryPersistenceTargetDecisionAdapter.test.mts` | 22225 | include | `PUBLIC_REQUIRED` | `KEEP` | `25ce876a` | `cda3b8c3` |
| `tests/phase6PersistenceAuditEvidenceConstructors.test.mts` | 16173 | include | `PUBLIC_REQUIRED` | `KEEP` | `3d9a6f99` | `3d9a6f99` |
| `tests/phase6PersistenceAuditEvidenceFixture.test.mts` | 13302 | include | `PUBLIC_REQUIRED` | `KEEP` | `3910233c` | `3910233c` |
| `tests/phase6PersistenceAuditEvidenceSpec.test.mts` | 26141 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `a508d898` | `a508d898` |
| `tests/phase6PersistenceAuditEvidenceValidators.test.mts` | 28774 | include | `PUBLIC_REQUIRED` | `KEEP` | `202d5b6e` | `d30e3b56` |
| `tests/phase6PersistenceImplementationGate.test.mts` | 28529 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `48ab8d8c` | `48ab8d8c` |
| `tests/phase6PersistenceTargetDecisionConstructors.test.mts` | 13349 | include | `PUBLIC_REQUIRED` | `KEEP` | `1d2ec870` | `1d2ec870` |
| `tests/phase6PersistenceTargetDecisionFixture.test.mts` | 10910 | include | `PUBLIC_REQUIRED` | `KEEP` | `9733a03b` | `9733a03b` |
| `tests/phase6PersistenceTargetDecisionSpec.test.mts` | 22753 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `106e7731` | `106e7731` |
| `tests/phase6PersistenceTargetDecisionValidators.test.mts` | 19665 | include | `PUBLIC_REQUIRED` | `KEEP` | `56394e75` | `e7d0bf5a` |
| `tests/phase6PureConstructors.test.mts` | 34645 | include | `PUBLIC_REQUIRED` | `KEEP` | `640e5ea7` | `c16d5978` |
| `tests/phase6RecorderAuditSummaryConstructors.test.mts` | 39461 | include | `PUBLIC_REQUIRED` | `KEEP` | `f0fc1618` | `47280a5f` |
| `tests/phase6RecorderAuditSummaryEvidenceLedgerLinkageGateSpec.test.mts` | 15063 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `cb7f104f` | `cb7f104f` |
| `tests/phase6RecorderAuditSummaryEvidenceLedgerNoAppendValidator.test.mts` | 27701 | include | `PUBLIC_REQUIRED` | `KEEP` | `d37ff15e` | `23af067f` |
| `tests/phase6RecorderAuditSummaryEvidenceLedgerStaticContractNoAppendValidatorSpec.test.mts` | 16697 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `b24f1c14` | `b24f1c14` |
| `tests/phase6RecorderAuditSummaryFixture.test.mts` | 18873 | include | `PUBLIC_REQUIRED` | `KEEP` | `68c74c4a` | `68c74c4a` |
| `tests/phase6RecorderAuditSummaryHarness.test.mts` | 16989 | include | `PUBLIC_REQUIRED` | `KEEP` | `e3cf1d60` | `63e3c3d9` |
| `tests/phase6RecorderAuditSummaryLaneReadinessReview.test.mts` | 11220 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `53c00663` | `53c00663` |
| `tests/phase6RecorderAuditSummarySpec.test.mts` | 32178 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `c7dd55cd` | `2a7cd430` |
| `tests/phase6RecorderAuditSummaryValidators.test.mts` | 48416 | include | `PUBLIC_REQUIRED` | `KEEP` | `e301f5a7` | `2a7cd430` |
| `tests/phase6ReviewEvidenceAudit.test.mts` | 16842 | include | `PUBLIC_REQUIRED` | `KEEP` | `c28eb646` | `354fe0c5` |
| `tests/phase6ReviewEvidenceCanonicalIdentity.test.mts` | 16252 | include | `PUBLIC_REQUIRED` | `KEEP` | `354fe0c5` | `354fe0c5` |
| `tests/phase6ReviewEvidenceConstructors.test.mts` | 27909 | include | `PUBLIC_REQUIRED` | `KEEP` | `c28eb646` | `61feb06c` |
| `tests/phase6ReviewEvidenceTypesValidators.test.mts` | 13266 | include | `PUBLIC_REQUIRED` | `KEEP` | `c28eb646` | `354fe0c5` |
| `tests/phase6ReviewEvidenceVerifier.test.mts` | 13938 | include | `PUBLIC_REQUIRED` | `KEEP` | `c28eb646` | `354fe0c5` |
| `tests/phase6RevisionReference.test.mts` | 31981 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `fe2fffcc` | `2dd858ec` |
| `tests/phase6RuntimeAuthorizationArchitecture.test.mts` | 13742 | include | `PUBLIC_REQUIRED` | `KEEP` | `94ad961d` | `cc4fa777` |
| `tests/phase6RuntimeAuthorizationAudit.test.mts` | 2593 | include | `PUBLIC_REQUIRED` | `KEEP` | `94ad961d` | `94ad961d` |
| `tests/phase6RuntimeAuthorizationCanonical.test.mts` | 4029 | include | `PUBLIC_REQUIRED` | `KEEP` | `94ad961d` | `902a40fc` |
| `tests/phase6RuntimeAuthorizationClaim.test.mts` | 8709 | include | `PUBLIC_REQUIRED` | `KEEP` | `94ad961d` | `902a40fc` |
| `tests/phase6RuntimeAuthorizationDecisionPolicy.test.mts` | 5954 | include | `PUBLIC_REQUIRED` | `KEEP` | `94ad961d` | `94ad961d` |
| `tests/phase6RuntimeAuthorizationDryRun.test.mts` | 14268 | include | `PUBLIC_REQUIRED` | `KEEP` | `94ad961d` | `f117f4a0` |
| `tests/phase6RuntimeAuthorizationEligibility.test.mts` | 14605 | include | `PUBLIC_REQUIRED` | `KEEP` | `94ad961d` | `902a40fc` |
| `tests/phase6RuntimeAuthorizationExecutorIdentity.test.mts` | 3514 | include | `PUBLIC_REQUIRED` | `KEEP` | `94ad961d` | `94ad961d` |
| `tests/phase6RuntimeAuthorizationGate.test.mts` | 21570 | include | `PUBLIC_REQUIRED` | `KEEP` | `94ad961d` | `cc4fa777` |
| `tests/phase6SharedTypesValidators.test.mts` | 61649 | include | `PUBLIC_REQUIRED` | `KEEP` | `27b9d07b` | `c16d5978` |
| `tests/phase6StorageGateSpec.test.mts` | 24262 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `de830061` | `de830061` |
| `tests/phase6TemporalAssociation.test.mts` | 32646 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `2dd858ec` | `2dd858ec` |
| `tests/phase6TemporalContract.test.mts` | 31676 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `a52bd028` | `2dd858ec` |
| `tests/proactiveVoiceSecretary.test.mts` | 1162 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `fc3a785c` | `fc3a785c` |
| `tests/providerAdapterBoundary.test.mts` | 902 | include | `PUBLIC_REQUIRED` | `KEEP` | `edbbdbf5` | `edbbdbf5` |
| `tests/providerAdapterRoutingGate.test.mts` | 7432 | include | `PUBLIC_REQUIRED` | `KEEP` | `b081dc16` | `b081dc16` |
| `tests/providerAdapterRoutingGateP0.test.mts` | 1247 | include | `PUBLIC_REQUIRED` | `KEEP` | `b081dc16` | `b081dc16` |
| `tests/providerDryRunContract.test.mts` | 4018 | include | `PUBLIC_REQUIRED` | `KEEP` | `3e2fadf7` | `97488d9d` |
| `tests/providerDryRunP0.test.mts` | 2980 | include | `PUBLIC_REQUIRED` | `KEEP` | `3e2fadf7` | `3e2fadf7` |
| `tests/providerSecretPolicy.test.mts` | 1327 | include | `PUBLIC_REQUIRED` | `KEEP` | `9665a588` | `9665a588` |
| `tests/providerTransportPolicy.test.mts` | 3077 | include | `PUBLIC_REQUIRED` | `KEEP` | `66fbd471` | `6520e38a` |
| `tests/publicRepositoryBoundary.test.mts` | 12907 | exclude | `PRIVATE_DEVELOPMENT` | `KEEP` | `-` | `-` |
| `tests/rateLimitGate.test.mts` | 2653 | include | `PUBLIC_REQUIRED` | `KEEP` | `eea05130` | `7281dda9` |
| `tests/realLlmReadinessGate.test.mts` | 1994 | include | `PUBLIC_REQUIRED` | `KEEP` | `2a3b0ede` | `2a3b0ede` |
| `tests/realLlmReadinessP0.test.mts` | 3145 | include | `PUBLIC_REQUIRED` | `KEEP` | `2a3b0ede` | `2a3b0ede` |
| `tests/redteamHardeningP0.test.mts` | 8355 | include | `PUBLIC_REQUIRED` | `KEEP` | `d175311b` | `d175311b` |
| `tests/relationshipGraphModelGate.test.mts` | 11362 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `e229cdfd` | `e229cdfd` |
| `tests/repoApprovalStore.test.mts` | 11752 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `tests/requestRuntimeConfig.test.mts` | 17948 | include | `PUBLIC_REQUIRED` | `KEEP` | `21997eed` | `6a8d26d6` |
| `tests/requestSecurityBoundary.test.mts` | 2146 | include | `PUBLIC_REQUIRED` | `KEEP` | `7281dda9` | `7281dda9` |
| `tests/requestedActionTypeModel.test.mts` | 4382 | include | `PUBLIC_REQUIRED` | `KEEP` | `b91b6a59` | `6ffbde3b` |
| `tests/roleNormalizationHardening.test.mts` | 1833 | include | `PUBLIC_REQUIRED` | `KEEP` | `eea05130` | `eea05130` |
| `tests/routeEnforcement.test.mts` | 6910 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `21997eed` |
| `tests/ruleGateP0.test.mts` | 2599 | include | `PUBLIC_REQUIRED` | `KEEP` | `67150bd7` | `67150bd7` |
| `tests/ruleReviewGate.test.mts` | 18898 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `5fda7489` | `5fda7489` |
| `tests/runtimeEnvBridge.test.mts` | 4221 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `21997eed` |
| `tests/saasApproval.test.mts` | 8876 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `tests/saasRbac.test.mts` | 5044 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `defae92e` |
| `tests/saasSecurity.test.mts` | 8487 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `ee2ac992` |
| `tests/safeQueryPlanGenerationGate.test.mts` | 17260 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `bf90ff45` | `bf90ff45` |
| `tests/sealedProviderAdapter.test.mts` | 2608 | include | `PUBLIC_REQUIRED` | `KEEP` | `78216d80` | `78216d80` |
| `tests/securityP1FourEyesAudit.test.mts` | 14408 | include | `PUBLIC_REQUIRED` | `KEEP` | `ee2ac992` | `f117f4a0` |
| `tests/securityP2AuditCoverageTenantWrite.test.mts` | 8651 | include | `PUBLIC_REQUIRED` | `KEEP` | `f4e2d734` | `21997eed` |
| `tests/securityRefactorCriteriaRatchet.test.mts` | 21056 | include | `PUBLIC_REQUIRED` | `KEEP` | `6a2bc849` | `6a2bc849` |
| `tests/sessionResolver.test.mts` | 14323 | include | `PUBLIC_REQUIRED` | `KEEP` | `defae92e` | `21997eed` |
| `tests/shadowProviderHarness.test.mts` | 4058 | include | `PUBLIC_REQUIRED` | `KEEP` | `c709e720` | `6520e38a` |
| `tests/slackNormalizedSignalSource.test.mts` | 2940 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `tests/sourceAppIconComponentSource.test.mts` | 1919 | include | `PUBLIC_REQUIRED` | `KEEP` | `46f4a678` | `46f4a678` |
| `tests/sourceAppIconModel.test.mts` | 2938 | include | `PUBLIC_REQUIRED` | `KEEP` | `46f4a678` | `46f4a678` |
| `tests/sqlCompilationGate.test.mts` | 18011 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `0fe6d60b` | `0fe6d60b` |
| `tests/tenantConstraintClassification.test.mts` | 7010 | include | `PUBLIC_REQUIRED` | `KEEP` | `f117f4a0` | `f117f4a0` |
| `tests/tenantDbResolver.test.mts` | 14437 | include | `PUBLIC_REQUIRED` | `KEEP` | `9ae48b46` | `473900c0` |
| `tests/tenantIsolationArchitecture.test.mts` | 16781 | include | `PUBLIC_REQUIRED` | `KEEP` | `9ae48b46` | `184847a6` |
| `tests/tenantIsolationRoutes.test.mts` | 7635 | include | `PUBLIC_REQUIRED` | `KEEP` | `9ae48b46` | `519d85e1` |
| `tests/tenantLocalFallbackAuthority.test.mts` | 9095 | include | `PUBLIC_REQUIRED` | `KEEP` | `519d85e1` | `519d85e1` |
| `tests/tenantNodeProductionFailClosed.test.mts` | 7081 | include | `PUBLIC_REQUIRED` | `KEEP` | `184847a6` | `184847a6` |
| `tests/tenantParentRelationship.test.mts` | 9934 | include | `PUBLIC_REQUIRED` | `KEEP` | `f117f4a0` | `f117f4a0` |
| `tests/tenantRegistryValidation.test.mts` | 5600 | include | `PUBLIC_REQUIRED` | `KEEP` | `519d85e1` | `519d85e1` |
| `tests/tenantRepositoryAuthority.test.mts` | 7590 | include | `PUBLIC_REQUIRED` | `KEEP` | `519d85e1` | `519d85e1` |
| `tests/tenantRepositoryParity.test.mts` | 13305 | include | `PUBLIC_REQUIRED` | `KEEP` | `9ae48b46` | `f117f4a0` |
| `tests/tenantSchemaCompatibility.test.mts` | 11244 | include | `PUBLIC_REQUIRED` | `KEEP` | `473900c0` | `8b5d13a3` |
| `tests/tenantSecretHmacHashBinding.test.mts` | 7527 | include | `PUBLIC_REQUIRED` | `KEEP` | `d09f325d` | `d09f325d` |
| `tests/tenantSecretProviderDesignGate.test.mts` | 7177 | exclude | `PRIVATE_DEVELOPMENT` | `MOVE_TO_PRIVATE_REPOSITORY` | `227df324` | `227df324` |
| `tests/tenantSharedD1SchemaContract.test.mts` | 9390 | include | `PUBLIC_REQUIRED` | `KEEP` | `519d85e1` | `f117f4a0` |
| `tests/toolRequirementModel.test.mts` | 1964 | include | `PUBLIC_REQUIRED` | `KEEP` | `160ffe5e` | `160ffe5e` |
| `tests/toolsRouteProductionCapability.test.mts` | 2831 | include | `PUBLIC_REQUIRED` | `KEEP` | `6a8d26d6` | `6a8d26d6` |
| `tests/tspMinimalRuntimeGate.test.mts` | 17598 | include | `PUBLIC_REQUIRED` | `KEEP` | `727244f2` | `727244f2` |
| `tests/workUnitExecutionPhase4.test.mts` | 3072 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `tests/workUnitLauncherPalettePolish.test.mts` | 7720 | include | `PUBLIC_REQUIRED` | `KEEP` | `31774322` | `31774322` |
| `tests/workUnitLauncherSelection.test.mts` | 4386 | include | `PUBLIC_REQUIRED` | `KEEP` | `650d1391` | `31774322` |
| `tests/workUnitLauncherShell.test.mts` | 8342 | include | `PUBLIC_REQUIRED` | `KEEP` | `650d1391` | `7281dda9` |
| `tests/workUnitOrganizationPhase3.test.mts` | 3480 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `tests/workUnitPhase6Integration.test.mts` | 2367 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `tests/workUnitSafetyPhase6.test.mts` | 2721 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `tests/workUnitSubagents.test.mts` | 3992 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `tests/workUnitToolBackend.test.mts` | 4319 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `e768dee8` |
| `tests/workUnitVoicePushPhase5.test.mts` | 2614 | include | `PUBLIC_REQUIRED` | `KEEP` | `fc3a785c` | `fc3a785c` |
| `tests/workunitInboxActionPreviewMapping.test.mts` | 3887 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `tests/workunitInboxApi.test.mts` | 1829 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `tests/workunitInboxSourceAll.test.mts` | 3688 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `tests/workunitInboxTransform.test.mts` | 4463 | include | `PUBLIC_REQUIRED` | `KEEP` | `e768dee8` | `e768dee8` |
| `tests/workunitPipelineBehaviorRatchet.test.mts` | 9127 | include | `PUBLIC_REQUIRED` | `KEEP` | `6a2bc849` | `6a2bc849` |
| `tests/workunitToolsRoutePhase5A.test.mts` | 4831 | include | `PUBLIC_REQUIRED` | `KEEP` | `eea05130` | `94ad961d` |
| `tsconfig.json` | 749 | include | `PUBLIC_REQUIRED` | `KEEP` | `80a63485` | `7281dda9` |
| `wrangler.json` | 752 | include | `PUBLIC_REQUIRED` | `KEEP` | `b09a6804` | `b09a6804` |
