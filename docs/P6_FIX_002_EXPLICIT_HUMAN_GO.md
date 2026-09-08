# P6-FIX-002 Explicit Human Go

**Patch:** P6-FIX-002 — Recorder Audit Summary Constructor Single-Read Snapshot Enforcement(constructor内部読取順序の是正のみ)
**Tracking Issue:** #117([Phase 6][P3][Security] precheck付きconstructorがbuildRecordで生入力を再読取(single-read宣言違反のgetter-TOCTOU))
**Source audit:** P6-A0(docs/P6_A0_FABEL5_PHASE6_CROSS_LANE_AUDIT.md FINAL-3 = B-2、docs/P6_A0_FABEL5_PATCH_SEQUENCE_PLAN.md Wave 2 / U3)
**Repository:** haya10hikawa-hub/Atra-workunitOS
**Base main:** 36d146d0d93c8bd76cb347567bc1daa806694bab(PR #123マージコミット)

本書はP6-FIX-002の永続的なhuman Go記録である。constructors.tsおよびテスト編集前に作成される。

## Sign-off statements

- P6-FIX-002 has explicit human Go.
- **Issue #117 is the only remediation target** — 本パッチはprecheck付きconstructorの二重読取(getter-TOCTOU)是正のみを行う。
- 変更してよいtrackedファイルは次の3件のみ:
  - docs/P6_FIX_002_EXPLICIT_HUMAN_GO.md(本書)
  - app/lib/phase6/recorderAuditSummary/constructors.ts
  - tests/phase6RecorderAuditSummaryConstructors.test.mts
- **constructor implementation and constructor tests only** — validators.ts・types.ts・index.ts・construction.ts・linkageモジュール・fixtures・harnessを一切変更しない。
- **public APIs remain unchanged** — 公開constructorシグネチャ・入力型・結果shape・index表面を変更しない。新規公開constructor・新規公開型・内部snapshot型のexportを追加しない。
- **existing validator semantics remain unchanged** — validatorの挙動・issue code定義・非echoエラー規約を変更しない。
- **no new runtime consumer** — ランタイム消費者を導入しない。呼び出し元はテストのみのまま(inert)。
- **no summary emitter** / **no persistence** / **no Evidence Ledger append** / **no Graph Model write** / **no D1 or SQL** / **no ApprovalStore integration** / **no StartHub runtime** / **no external action** / **no Formal WorkUnit promotion**。
- **constructor success remains descriptive and non-authorizing** — Constructor Success ≠ Truth ≠ Approval ≠ Execution Permission ≠ Recorder Summary Runtime。Test Success ≠ Authorization。
- 是正内容は「生入力 → 1回のtop-level snapshot → 同一snapshotに対するprecheck → 同一snapshotからのbuild → 最終validation」への内部フロー是正のみ。clock・randomness・I/O・deep clone・JSON serialization・structuredCloneを導入しない。
- throwing getterは既存の `constructor_exception` fail-closed規約で処理し、新issue codeを発明せず、thrown値をechoしない。
- **deeper nested getter protection is not granted** — コンテナ内部の遅延getterに対する深い防御は既存snapshot契約の範囲外であり、本パッチでは付与しない(「テストが証明しないこと」に記録する)。
- 非空虚性の証明はテストローカルの旧二重読取フローのエミュレーションで行い、実装ソースへの変異プローブは使用しない。トラックされた変異は一切残さない。
- migrations/・package.json・package-lock.json・.github/workflows/・UI・Electron・API routes・既存P6-A0監査文書・既存P6-I5実装文書・docs/ALPHA_EVIDENCE_LEDGER.md・docs/archive/v0/GRAPH_MODEL.mdを変更しない。
- If forbidden paths change, stop immediately.

## Product invariant

AI proposes. Rules guard. Humans decide.
