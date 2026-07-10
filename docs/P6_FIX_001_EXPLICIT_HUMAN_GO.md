# P6-FIX-001 Explicit Human Go

**Patch:** P6-FIX-001 — Phase 6 Source Guard and Getter/TOCTOU Regression Hardening(test-hardening only)
**Tracking Issue:** #119([Phase 6][P3][Test])
**Source audit:** P6-A0(docs/P6_A0_FABEL5_PHASE6_CROSS_LANE_AUDIT.md FINAL-5 = B-4+B-5、docs/P6_A0_FABEL5_PATCH_SEQUENCE_PLAN.md Wave 0)
**Repository:** haya10hikawa-hub/Atra-workunitOS
**Base main:** c2968cffd5a0eafa79632a085922496aab2b87df(PR #122マージコミット)

本書はP6-FIX-001の永続的なhuman Go記録である。テストファイル編集前に作成される。

## Sign-off statements

- P6-FIX-001 has explicit human Go.
- 本パッチは **tests only** である。変更してよいtrackedファイルは次の3件のみ:
  - docs/P6_FIX_001_EXPLICIT_HUMAN_GO.md(本書)
  - tests/phase6RecorderAuditSummaryEvidenceLedgerNoAppendValidator.test.mts
  - tests/phase6RecorderAuditSummaryValidators.test.mts
- **no app changes** — `app/**` を一切変更しない。
- **no validator behavior changes** — validatorの挙動・実装は一切変更しない(着手前に実装の正しさを行動検証済み: `append_allowed: true` 拒否・`graph_write_allowed: true` 拒否・`human_review_required: false` 拒否・単一読取スナップショット読取1回)。
- **no runtime consumer** — ランタイム消費者を導入しない。
- **no Evidence Ledger append** / **no Graph Model write** / **no persistence** / **no D1 or SQL** / **no ApprovalStore integration** / **no external action** / **no Formal WorkUnit promotion**。
- fixtures・harness・migrations・package.json・package-lock.json・workflows・UI・Electron・既存P6-A0監査文書・既存P6-I5実装文書を変更しない。
- 追加するソースガードneedleはIssue #119に記載された具体的バイパス形態(`from "node:fs"`系・dynamic `import(`・`require(`・computed-global `globalThis[`)に1対1で対応し、数合わせの文字列追加を行わない。既存の禁止capability検出(Date.now・new Date・randomUUID・Math.random・fetch・child_process・process.env・D1・SQLクライアント・Evidence Ledger writer・Graph Model writer・ApprovalStore・StartHub runtime・外部アクションクライアント・LLMプロバイダ)はすべて保全する。
- 非空虚性の証明は**インメモリ合成ソース文字列**に対する純ヘルパーテストで行い、実リポジトリファイルへの変異プローブは使用しない。トラックされた変異は一切残さない。
- getter/TOCTOU回帰は、I5SではcanonicalなexportedフィールドリストLINKAGE_CANDIDATE_REQUIRED_FIELDS(+lineage variant)を用い、I5L(recorderAuditSummary)ではcanonical exportが存在しないためテストローカルに有効fixtureのキーから導出する(テストを楽にするためだけのproduction exportは追加しない)。各フィールドが**正確に1回**(0回でも複数回でもない)読まれることを検証する。
- テストは決定的・オフライン・環境変数非依存・実行順非依存であり、失敗時に生の秘密値を出力しない。
- **test hardening does not grant runtime or production-readiness permission** — テスト強化はランタイム許可・approval・execution・Evidence Ledger append・Graph Model write・persistence・production readinessのいかなる許可でもない。Test success ≠ Authorization。`ok: true` is descriptive only。
- 実装欠陥が発見された場合は即No-Goとし、P6-FIX-001の下でappコードを修理しない。
- If forbidden paths change, stop immediately.

## Product invariant

AI proposes. Rules guard. Humans decide.
