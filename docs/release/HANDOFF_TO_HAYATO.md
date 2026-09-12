# 樋川隼人さんへ：実装・修正内容の引き継ぎ

こちらの作業で変更した内容と、確認するファイルをまとめます。
アプリ本体の修正と外部データ基盤はGitHubへpush済みです。分類器・Qwen/AWS関連にはローカルのみの実装が残っています。
この文書の追加で、ローカルのみのコードまで公開されるわけではありません。

## GitHubで確認できる変更

- ブランチ：`codex/gold-candidate-v0-pipeline`
- アプリ修正：[e6f2704](https://github.com/haya10hikawa-hub/Atra-workunitOS/commit/e6f27049b869dd7fbf895fe8203b257f9d015191)
- 外部データ基盤：[a770aa7](https://github.com/haya10hikawa-hub/Atra-workunitOS/commit/a770aa71fefadd0605618425be4bea910ce917c4)
- どちらもmainには未統合です。以下のリンクはこのブランチのファイルを指します。

## 1. アプリの画面操作を修正

| やったこと | 変更箇所 |
| --- | --- |
| Action Fieldの閉じるボタンを動作させ、閉じたときに2列表示へ切り替える | [AtraWorkspace.tsx](../../app/components/atra/AtraWorkspace.tsx)、[Atra.module.css](../../app/components/atra/Atra.module.css) |
| ノード・WorkUnit・パレット結果を選ぶとAction Fieldを再表示する | [WorkUnitLauncher.tsx](../../app/components/workunit-os/launcher/WorkUnitLauncher.tsx)、[atraWorkspaceModel.ts](../../app/lib/application/atra/atraWorkspaceModel.ts) |
| 候補を読み取り専用と明示。編集ボタン・偽のカーソル・編集できるように見える文言を除去 | [AtraWorkspace.tsx](../../app/components/atra/AtraWorkspace.tsx) |
| 未実装ボタンを無効化。固定のプロバイダー表示を実際の候補に合わせる | [AtraWorkspace.tsx](../../app/components/atra/AtraWorkspace.tsx)、[deriveAtraWorkspaceViewModel.ts](../../app/lib/application/atra/deriveAtraWorkspaceViewModel.ts) |
| パレットの存在しない操作案内を除き、Enterの説明を実際の動作に合わせる | [CommandPaletteView.tsx](../../app/components/workunit-os/launcher/CommandPaletteView.tsx) |

確認用テスト：`tests/atraWorkspace.test.mts`、`tests/atraWorkspaceConnection.test.mts`、`tests/workUnitLauncherSelection.test.mts`。

## 2. GitHubデータとAI出力の検証を強化

| やったこと | 変更箇所 |
| --- | --- |
| Issueとして受け取ったデータにPR専用フィールドがあれば拒否する | [recordedIssueCapture.ts](../../app/lib/infrastructure/external/github/recordedIssueCapture.ts) |
| PRのhead/base・merge_commit_sha・changed_filesの型を確認し、IssueとPRの取り違えを拒否する | [recordedPullRequestCapture.ts](../../app/lib/infrastructure/external/github/recordedPullRequestCapture.ts) |
| AI出力の任意項目にも型・サイズ制限を追加。未知のリスクフラグや不正な配列を拒否する | [validateLlmOutput.ts](../../app/lib/llm/validateLlmOutput.ts) |
| 不正な候補・タイトルしかないドラフトを受け入れない | [extractCandidate.ts](../../app/lib/llm/extractCandidate.ts)、[generateWorkUnitDraft.ts](../../app/lib/llm/generateWorkUnitDraft.ts) |
| AIが実行不可・未完了の判断を上書きしない。不足項目や警告を消さず、リスクは厳しい側を採用する | [evaluateWorkUnit.ts](../../app/lib/llm/evaluateWorkUnit.ts) |

確認用テスト：`tests/recordedPullRequestSourceSlice.test.mts`、`tests/llmPipeline.test.mts`。
保存済みのGitHubレスポンスを扱う処理の検証であり、本番接続や任意のレスポンスの真正性を証明したものではありません。

## 3. ビルド・テスト・保守を修正

| やったこと | 変更箇所 |
| --- | --- |
| 依存関係を更新し、CIに依存監査を追加 | [package-lock.json](../../package-lock.json)、[ci.yml](../../.github/workflows/ci.yml) |
| 開発サーバーによるAGENTS.mdの書き換えを抑止し、回帰テストを追加 | [next.config.ts](../../next.config.ts)、[securityRefactorCriteriaRatchet.test.mts](../../tests/securityRefactorCriteriaRatchet.test.mts) |
| ID・readonly・テナント解決結果などの型にテスト用データを合わせ、型検証を修復 | `tests/actionDraftModel.test.mts`、`tests/tenantRepositoryAuthority.test.mts`、`tests/phase6PersistenceTargetDecisionValidators.test.mts`ほか。全対象はe6f2704の差分を参照 |

## 4. 外部データの取得・独立レビュー・採用判定を実装

基点：[eval/classifier/scripts/](../../eval/classifier/scripts/)

| やったこと | 具体的なファイル（基点からの相対パス） |
| --- | --- |
| 公開ソース・GitHubレスポンスの取得と取得履歴の保存 | `import/fetch_public.py`、`import/fetch_github.py` |
| ZIP内XMLの安全な抽出と出典確認 | `import/xml_snapshot.py` |
| GitHub・チャット記録の正規化、作者の仮名化、機密情報検出 | `normalize/github.mjs`、`normalize/chat.mjs`、`normalize/sanitize.mjs` |
| 原文を隔離領域で扱い、パス逸脱や意図しない上書きを防ぐ | `io.mjs` |
| 再構成・批評プロンプト、別コンテキストの実モデル実行 | `annotate/prompts.mjs`、`annotate/codex-reconstruct.mjs`、`annotate/codex-critic.mjs` |
| 実行記録とレビュー対象をダイジェストで結び付ける | `annotate/receipts.mjs` |
| スキーマ、引用位置、出典、関係、レビュー対象の一致を検証し、不適切な候補を拒否 | `validate/schema.mjs`、`validate/integrity.mjs` |
| 件数・品質・構成比の集計と原文を含まない参照情報の出力 | `report/report.mjs`、`report/reference.mjs` |
| 準備・採用・検証・レポートを実行するCLI | `cli.mjs` |

取得結果は203候補・3,472記録。再構成ドラフト2件、完了した独立批評4回、採用済みGold Candidateは1件です。人間が確定したFinal Goldは0件です。
不適切な断定やタグ不一致は採用せず止めています。1,000件の目標は未達です。

- データの扱い：[DATASET_CARD.md](../../eval/classifier/gold_candidate_v0/DATASET_CARD.md)
- 公開している候補の参照情報：[GC-000001.json](../../eval/classifier/gold_candidate_v0/references/GC-000001.json)
- 取得一覧：[ACQUISITION_INDEX.json](../../eval/classifier/external_sources/ACQUISITION_INDEX.json)
- 進捗：[RUN_STATE.json](../classifier/gold-candidate-v0/RUN_STATE.json)
- テスト：`tests/goldCandidateIO.test.mts`、`tests/goldCandidatePipeline.test.mts`、`tests/test_gold_fetch_public.py`

原文、完全なローカルエピソード、モデルのプロンプト・実行ログはGitHubには含めていません。

## 5. ローカルのみ：分類器の実装

以下は未コミットのため、GitHub上のリンクは付けていません。ファイルの存在とローカル検証記録に基づきます。

| やったこと | ローカルの対象ファイル |
| --- | --- |
| 入力検証→サニタイズ→抽出→検索→関係判定→グループ化→候補生成を接続 | `classifier-workspace/app/lib/application/classifierPipeline/classifyWorkEpisode.ts` |
| サニタイズと意味単位抽出を明示的な処理として分離 | `classifier-workspace/app/lib/application/classifierSanitization/sanitizeSourceRecords.ts`、`classifier-workspace/app/lib/application/classifierExtraction/extractSemanticAtoms.ts` |
| 型・スキーマ・入力検証・Golden Set契約を定義 | `app/lib/domain/classifier/types.ts`、`schemas.ts`、`validate.ts`、`goldenSet.ts` |
| 候補検索、関係判定、グループ形成を実装 | `app/lib/application/classifierRetrieval/retrieveCandidates.ts`、`classifierRelations/judgeRelation.ts`、`classifierRelations/createStructuredRelationJudge.ts`、`classifierGrouping/formClassifierGroups.ts` |
| 修正処理と評価を実装 | `app/lib/application/classifierCorrections/applyCorrection.ts`、`classifierBenchmark/runClassifierBenchmark.ts` |
| 正解データの準備・裁定手順と評価経路を追加 | `classifier-workspace/app/lib/application/classifierGoldenSet/workflow.ts`、`classifierEvaluation/evaluate.ts` |

明示参照や類似度だけで「同じ仕事」と断定せず、不正出力・時間切れ時は保留や代替処理に移る設計です。
ローカル記録では92テストと型検証が成功し、行カバレッジ94.69%。日本語・英語・混在の合成24エピソードで処理を確認しています。実データでの分類品質は未証明です。

## 6. ローカルのみ：Qwen/vLLM・AWSの接続準備

| やったこと | ローカルの対象ファイル |
| --- | --- |
| vLLM互換APIへの接続と環境設定の検証 | `app/lib/infrastructure/classifierModel/vllmClassifierModelGateway.ts`、`qwenVllmEnvironment.ts` |
| モデル・検索の接続契約を定義 | `app/lib/ports/classifierModel/types.ts`、`app/lib/ports/classifierRetrieval/types.ts` |
| 接続確認スクリプトと説明を追加 | `classifier-workspace/scripts/qwen-connection-smoke.mts`、`QWEN_CONNECTION_GUIDE.md` |
| AWS環境テンプレート・モデル設定を用意 | `infra/qwen-ec2/stack.json`、`infra/qwen-ec2/models.json` |
| セットアップ・リモート起動の処理を追加 | `scripts/qwenAwsSetup.mjs`、`scripts/qwen-aws-setup.mjs`、`scripts/qwen-aws-remote-bootstrap.sh` |
| セットアップのテストを追加 | `tests/qwenAwsSetup.test.mts`、`tests/qwenEc2Stack.test.mts` |

コードと手順の準備までです。AWS上で実モデル評価が成功したという証拠は、この確認では得られていません。認証情報や設定値の秘密は文書に含めていません。

## 検証済みの範囲と残件

push済み実装チェックポイントでは、全体テスト5,257成功・失敗0・1スキップ、lint・本番用ビルドが成功しています。
既存の子プロセスタイムアウトテストが不安定だったため、全体テストの並列数を2に下げて再実行しました。テストは省略していません。
外部データ基盤単体はJS37件・Python7件が成功し、JS行カバレッジ83.07%です。
これらは、未コミットの分類器・Qwen関連まで含めた統合成功や、本番運用の証明ではありません。

残っていること：

- ローカルのみの分類器・Qwen/AWS実装をレビューしてGitHubへ保存する。
- 最新mainとの整合を確認する。実装チェックポイントはmain固有9コミットと分岐している。
- 分類器の修正後の独立レビュー、人間の正解データ、実モデル評価を完了する。
- Gold Candidateを増やす。採用済みは1件で、取得候補数とは別。
- 新しい製品方針に対し、どの資産を使うか整理する。旧V0の機能を全部完成させる前提にはしない。
- 本番接続・デプロイ・実利用での効果測定を行う。現時点では未完了。

この文書は、こちら側の変更の引き継ぎです。樋川さん側のV0凍結・文書整理・新方針PRを、こちらの実装成果には含めていません。
