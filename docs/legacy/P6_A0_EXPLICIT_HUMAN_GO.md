# P6-A0 Explicit Human Go

**Loop:** P6-A0(fabel5_phase6_cross_lane_audit_loop / 監査・計画のみ)
**Repository:** haya10hikawa-hub/Atra-workunitOS
**Audit SHA:** d37ff15eab635ca711b8e4310a25a4a1a734f314(main、PR #113マージコミット)

本書はP6-A0の永続的なhuman Go記録である。P6-A0は監査と計画のフェーズであり、修正を実装せず、パッチブランチを作らず、アプリケーションコードを変更せず、修復PRを開かず、何もマージしない。

## Sign-off statements

- P6-A0 has explicit human Go.
- 本タスクは監査(audit)と計画(planning)のみである。
- 監査エージェント/モデルは `fabel5` を使用する。`fabel5` は本環境で利用可能なモデル **Fable 5(model ID: claude-fable-5、Agentツールの `model: "fable"` 指定)** を指すものと明示的に解釈し、サイレント代替は行わない。プローブによりモデル自己申告(claude-fable-5)とリポジトリ読取可能性を事前検証した。
- 監査は同一の不変コミット(上記Audit SHA)を対象とする。
- 監査パスは逐次実行し(並行禁止)、各パス後に `git status --short`・`git diff --exit-code`・Phase 6チェックサムマニフェスト・監査SHAを検証する。
- 監査パス中の変異プローブ(mutation probe)は禁止する。条件の一時的弱化・ソースガードマーカー注入・ソースを書き換えるテスト実行・ブランチ変更・stash・commitはすべて禁止する。
- いずれかのパスがファイルを変更した場合: 全監査を停止し、変異ウィンドウ中の所見を信頼せず、正確な監査コミットを復元し、No-Goを報告し、Issueを作成しない。
- GitHub Issue作成前に、open/closed Issue・open/直近mergedのPRを検索し、重複Issueを作成しない。
- Issue化はPass E(裁定)が検証した所見のみに限る。High-confidence P0–P3、またはMedium-confidence P0–P2のみをIssue化し、低確信・Observation・解決済み・変異プローブ痕跡・既追跡項目はIssue化しない。
- 新規Issueは最大15件までとする。
- 本タスクが作成してよいファイルは次の4件のみ:
  - docs/legacy/P6_A0_EXPLICIT_HUMAN_GO.md
  - docs/legacy/P6_A0_FABEL5_PHASE6_CROSS_LANE_AUDIT.md
  - docs/legacy/P6_A0_FABEL5_PATCH_SEQUENCE_PLAN.md
  - tests/phase6Fabel5CrossLaneAuditPlan.test.mts
- 既存ファイルは一切変更しない。
- 本監査はいかなる権限も付与しない。監査PASSは、runtime許可・approval・execution・Evidence Ledger append・Graph Model write・persistence・production readinessのいずれでもない。
- 是正パッチはそれぞれ、個別ブランチ・個別explicit human Go・個別PR・CI成功・4監査・人間のマージ判断を必要とする。
- If forbidden paths change, stop immediately.
- If context pressure becomes high, stop at a defined audit boundary and report the current state.

## Product invariant

AI proposes. Rules guard. Humans decide.

## 境界の再確認

Candidate ≠ Formal WorkUnit。Preview ≠ Approval。Approval ≠ Execution。Evidence ≠ Truth。Evidence ≠ Approval。Human Decision ≠ ApprovalStore Approval / External Action Execution / Automatic Formal WorkUnit Promotion。Test success ≠ Authorization。Fixture validity ≠ Runtime Permission。Harness success ≠ Production Readiness。Validator success ≠ Evidence Ledger Append / Graph Model Write / Approval / Execution Permission。`ok: true` is descriptive only。監査PASS ≠ いかなる能力の認可でもない。
