# P6-FIX-003 Explicit Human Go

**Patch:** P6-FIX-003 — In-Memory Phase 6 Harness Validate-the-Clone Enforcement(test-harnessのstate整合是正のみ)
**Tracking Issue:** #118([Phase 6][P3][Security] in-memory recorder/adapterがvalidate後にクローン再読取(validate-then-reclone TOCTOU))
**Source audit:** P6-A0(docs/P6_A0_FABEL5_PHASE6_CROSS_LANE_AUDIT.md FINAL-4 = B-1、docs/P6_A0_FABEL5_PATCH_SEQUENCE_PLAN.md Wave 2 / U4)
**Repository:** haya10hikawa-hub/Atra-workunitOS
**Base main:** 47280a5f037a1fe2482c41157ae5921d1c68ba3e(PR #125マージコミット)

本書はP6-FIX-003の永続的なhuman Go記録である。harness実装およびテスト編集前に作成される。

## Sign-off statements

- P6-FIX-003 has explicit human Go.
- **Issue #118 is the only remediation target** — 本パッチは2つのtest-only in-memory harnessの書込みパスをclone-first / validate-the-cloneへ是正することのみを行う。
- **tests/harness only** — 変更してよいtrackedファイルは次の5件のみ:
  - docs/P6_FIX_003_EXPLICIT_HUMAN_GO.md(本書)
  - tests/harness/phase6/inMemoryPersistenceAuditEvidenceRecorder.mts
  - tests/harness/phase6/inMemoryPersistenceTargetDecisionAdapter.mts
  - tests/phase6InMemoryPersistenceAuditEvidenceRecorder.test.mts
  - tests/phase6InMemoryPersistenceTargetDecisionAdapter.test.mts
- **no app changes** — `app/**` を一切変更しない。
- **no real persistence** / **no durable storage** / **no database** / **no D1 or SQL**。
- **no Evidence Ledger append** / **no Graph Model write** / **no ApprovalStore integration** / **no StartHub runtime** / **no external action** / **no Formal WorkUnit promotion**。
- **no runtime consumer** / **no production adapter** — ランタイム消費者・実アダプタを導入しない。harnessはtests/配下のtest-onlyのまま。appから参照しない。
- **public product APIs remain unchanged** — validator・型・公開関数シグネチャ・issue code・result shapeを変更しない。
- **harness success remains non-authorizing and does not establish production readiness** — Harness Success ≠ Production Readiness、Validation Success ≠ Authorization、Recorder/Adapter Success ≠ Real Persistence。Test Success ≠ Authorization。
- **future real adapters require a separate explicit Human Go and security review** — 将来の実アダプタは別ゲート・別セキュリティレビューを要する。本harness是正は実アダプタの安全性を証明しない。
- 是正内容は「生入力 → 1回のdeep clone → 同一cloneをdeep-freeze → frozen cloneを検証 → frozen cloneでtenant/key/duplicate/conflict照合 → 同一frozen cloneをstore → clone後に生入力を再読取しない」。clock・randomness・I/O・JSON serializationによるclone・structuredClone・第2 deep cloneを導入しない。
- throwing getterは既存の `recorder_exception` / `adapter_exception` fail-closed規約で処理し、新issue codeを発明せず、thrown値・secret・生payloadをechoしない。
- 非空虚性の証明はテストローカルの旧validate-then-recloneフローのエミュレーションで行い、実装ソースへの変異プローブは使用しない。トラックされた変異は一切残さない。
- migrations/・package.json・package-lock.json・.github/workflows/・UI・Electron・API routes・fixtures・他のharness・既存P6-A0/P6-I5/P6-FIX-001/002文書・docs/ALPHA_EVIDENCE_LEDGER.md・docs/GRAPH_MODEL.mdを変更しない。
- If forbidden paths change, stop immediately.

## Product invariant

AI proposes. Rules guard. Humans decide.
