# Codex Automation 代替プロンプト集

## 0. 対象Markdown概要

| File | 状態 | 概要 | Automation代替可否 |
| --- | --- | --- | --- |
| `README.md` | 空 | 現時点で実質情報なし。プロジェクト入口としては未整備。 | 可。定期的なREADME再生成対象にできる。 |
| `WORKUNIT_OS_OVERVIEW.md` | 有効 | WorkUnit OSの全体構想。Hopperを上流の判断データ取得レイヤーとして置き、`情報 -> 判断 -> 計画 -> 実行` を統合する。MVPではShare Sheet / X / GitHub Star / RSSをHopperに集約し、判断ログをWorkUnit生成と優先度学習へ接続する。 | 一部可。仕様レビュー、Issue/Task/Research Note Draft生成、README同期は代替可能。実データ取り込みとD1保存は不可。 |
| `HOPPER_VECTOR_ALGORITHM.md` | 有効 | Hopperの知能コア仕様。`Understand -> Merge -> Rank`、分離メモリ `V_short / V_work / V_long / M_reject / M_open`、source/project別の動的しきい値、duplicate penalty、reject penalty cap、最大5件表示を定義する。 | 一部可。仕様と実装の乖離検査、テスト計画生成、しきい値設計レビューは代替可能。リアルタイムランキング処理は不可。 |

## 1. Automationで代替できる領域

Codex Automationで代替できるのは「非リアルタイムの知的処理」である。

- Markdown仕様の要約・再生成
- 仕様と実装の乖離チェック
- Hopper入力候補からのDraft生成
- GitHub Issue / Task / Research Note用の文章生成
- テスト観点の抽出
- 競合・市場メモのResearch Note化
- READMEやロードマップの同期

## 2. Automationで代替できない領域

以下はCodex Automationでは代替しない。

- Share Sheet / Browser Extension / X / GitHub / RSSの常時イベント受信
- D1への永続保存
- n8nのWebhook・外部API接続・認証済み同期
- スマホTUIの即時フリック操作
- 60fps UI更新
- リアルタイムのHopperランキング
- 実行ログの完全なDB反映
- ユーザーの明示判断なしのWorkUnit本昇格

Automationは「上流処理の一部をバッチ的に代替する」だけで、Hopper EngineやWorkUnit OSの作業基盤そのものにはならない。

## 3. 代替用プロンプト

### A01. Markdown仕様サマリー更新

目的: 全Markdownの概要を定期的に再作成し、空READMEや古い仕様を検出する。

推奨頻度: 週1回

```text
リポジトリ内の全`.md`を走査し、各ファイルについて以下を出力せよ。

1. 役割
2. 現在の仕様上の重要ポイント
3. 実装と接続すべきファイル
4. 古くなっている可能性がある記述
5. READMEへ反映すべき要点

制約:
- 表面的な要約は禁止。
- WorkUnit OSとHopperの責務分離を崩すな。
- Hopperを単なるread-laterやROI UIとして扱うな。
- 出力はMarkdownで、最後に「README更新案」を付けろ。
```

### A02. Hopper仕様と実装の乖離チェック

目的: `HOPPER_VECTOR_ALGORITHM.md` と `app/lib/hopperAdaptiveFilter.ts` / `app/lib/hopperEngine.ts` / `tests/` の差分を検出する。

推奨頻度: 週1回、またはHopper関連ファイル変更後

```text
`HOPPER_VECTOR_ALGORITHM.md`を基準仕様として読み、以下の実装と照合せよ。

- `app/lib/hopperAdaptiveFilter.ts`
- `app/lib/hopperEngine.ts`
- `app/lib/hopperActionRouter.ts`
- `tests/*.test.mts`

検査項目:
- `V_short`, `V_work`, `V_long`, `M_reject`, `M_open` が分離されているか
- raw embeddingに移動平均をかけていないか
- scalar scoreとthresholdにのみEWMA/quantile/pass-rateが適用されているか
- source/project別統計が守られているか
- duplicate penaltyが存在するか
- reject penaltyにcapがあるか
- `decision_ms` / `dwell_ms` を直接重要度ラベルにしていないか
- 表示件数が最大5件で固定表示ではないか

出力:
- 重大な仕様違反
- 軽微な乖離
- 未実装項目
- 追加すべきテスト
- 最小修正案
```

### A03. Hopper接続先Draft生成

目的: Hopperの候補入力を `Issue / Task / Research Note / Note / Drop` に分類し、外部API接続なしでDraftを生成する。

推奨頻度: 手動実行または1日1回

```text
以下のHopper候補リストを、WorkUnit OSの上流ゲートとして処理せよ。

入力形式:
`{ id, sourceType, projectId, title, summary, sourceUrl, score, threshold }[]`

分類ルール:
- `github_star` / repo / 実装技術 / ライブラリ / ベンチマーク系 -> `Issue`
- `rss` / `news` / 論点 / 戦略 / 競合情報 -> `Research Note`
- `sns` / `share_sheet` / `slack` / `gmail` / 単発アクション -> `Task`
- 価値はあるが実行不能 -> `Note`
- 明示的に不要 -> `Drop`

出力:
- 各候補の `targetSurface`
- `Issue`なら `problem`, `acceptanceCriteria`, `implementationHint`, `sourceUrl`
- `Task`なら `nextAction`, `ownerHint`, `blocker`, `deadlineHint`
- `Research Note`なら `claim`, `whyItMatters`, `decisionImpact`, `followUpQuestion`
- `Note`なら `reentryCondition`
- `Drop`なら `rejectReason`

制約:
- WorkUnit型への本昇格はしない。
- Draftまでに止める。
- 不確実なものを無理にCREATE扱いしない。
```

### A04. GitHub Star -> Issue Draft生成

目的: GitHub Star由来の技術情報をIssue Draftへ変換する。

推奨頻度: 1日1回

```text
GitHub Star由来のHopper候補だけを対象に、GitHub Issue Draftを生成せよ。

各候補について以下を出力:
- title
- problem
- acceptanceCriteria
- implementationHint
- sourceUrl
- WorkUnit化判定: `create_ready` / `deferred` / `note_only`

判定条件:
- 次のコード変更または検証作業が明確なら `create_ready`
- 有用だが検証条件が曖昧なら `deferred`
- 実装に接続しないなら `note_only`

制約:
- Issue作成APIは呼ばない。
- Draftのみ生成する。
- ライブラリ紹介だけでIssue化しない。
```

### A05. RSS / News -> Research Note生成

目的: RSSやニュースを、即時タスクではなく意思決定材料として保存する。

推奨頻度: 毎朝

```text
RSS / News由来のHopper候補をResearch Noteとして整理せよ。

各候補について以下を出力:
- claim
- whyItMatters
- decisionImpact
- followUpQuestion
- promoteCondition

判定基準:
- 現在のプロダクト判断、技術選定、競合認識を変えるなら残す
- 単なる一般論や流行記事ならDrop候補にする
- すぐ実装に接続できる場合のみIssue/Task候補として注記する

制約:
- ニュース要約で終わるな。
- 「何の意思決定が変わるか」を必ず書け。
```

### A06. Share / SNS / Slack / Gmail -> Task Draft生成

目的: 単発アクション型のPush情報をTask Draftへ変換する。

推奨頻度: 1日2回、または手動実行

```text
Share Sheet / SNS / Slack / Gmail相当のHopper候補をTask Draftに変換せよ。

各候補について以下を出力:
- nextAction
- ownerHint
- blocker
- deadlineHint
- WorkUnit化判定: `create_ready` / `deferred` / `note_only` / `drop`

判定条件:
- 実行者と次アクションが明確なら `create_ready`
- blockerが大きいが後で処理すべきなら `deferred`
- 情報として残すだけなら `note_only`
- 行動も判断材料もないなら `drop`

制約:
- 長く見た、迷った、返信が遅れた、だけで重要扱いしない。
- owner不明のものを実行可能Task扱いしない。
```

### A07. Hopper通過率・しきい値ヘルスチェック

目的: 動的しきい値が全拒否または低品質通過に崩れていないか検査する。

推奨頻度: 週1回

```text
Hopperのテスト、実装、利用可能なログを確認し、動的しきい値の健全性をレビューせよ。

検査項目:
- target pass rateが1%から10%の範囲にあるか
- MVP defaultが3%になっているか
- `theta_min`を下回る低品質通過を防いでいるか
- `theta_max`張り付きによる全拒否を防いでいるか
- recent pass rate feedbackで`k`が上下するか
- cold start時に厳しすぎる閾値になっていないか

出力:
- 健全 / 注意 / 危険 の判定
- 根拠
- 修正すべきコード位置
- 追加テスト案
```

### A08. WorkUnit昇格候補レビュー

目的: HopperのDraft群から、既存WorkUnit型へ昇格してよいものだけを抽出する。

推奨頻度: 毎日または開発セッション開始時

```text
HopperのDraft出力を読み、既存WorkUnit型へ昇格してよい候補だけを抽出せよ。

対象:
- `workunit_draft.status = create_ready`
- `targetSurface = issue | task | research_note`

判定基準:
- `Situation`, `Actors`, `Problem`, `Deadline`, `Impact`, `Effort` に変換できるか
- 次の実行手順が明確か
- Issue / Task / Research Noteの接続先が明確か
- 現在のWorkUnit OSロードマップに接続するか

出力:
- 昇格対象
- 昇格しない対象
- 昇格後のWorkUnit Draft
- 不足フィールド

制約:
- 価値があるだけで昇格しない。
- 実行可能性がないものはNoteかResearch Noteに戻す。
```

### A09. README再生成

目的: 空のREADMEを、現行Markdown仕様からプロジェクト入口として再生成する。

推奨頻度: 仕様更新後

```text
`WORKUNIT_OS_OVERVIEW.md`と`HOPPER_VECTOR_ALGORITHM.md`を読み、`README.md`の更新案を生成せよ。

READMEに含めるもの:
- WorkUnit OSとは何か
- Hopperの位置づけ
- MVP範囲
- 現在の実装ファイル
- ローカル起動方法
- テスト方法
- まだ実装しない範囲

制約:
- マーケティング文にしない。
- 技術者がリポジトリを理解するための入口にする。
- 長期ビジョンより、現在の実装境界を優先する。
```

### A10. 実装ロードマップ再整列

目的: 仕様・実装・テストの次ステップを、現在のWorkUnit OS思想に沿って再整列する。

推奨頻度: 週1回、または大きな設計変更後

```text
現行のMarkdown仕様と実装状態を読み、次の実装ロードマップを生成せよ。

出力:
- 今完了しているもの
- 次に実装すべきもの
- まだ実装してはいけないもの
- 技術的依存関係
- テスト追加順
- WorkUnit OS思想から外れている危険な方向

制約:
- Hopperを単独プロダクトとして肥大化させるな。
- Hopper = Push情報の一次仕分け、WorkUnit OS = 手順提示 / Approval管理、の分離を守れ。
- 外部API接続より先にDraft型と接続先境界を固定せよ。
```

## 4. Automation化の優先順位

1. `A02. Hopper仕様と実装の乖離チェック`
2. `A03. Hopper接続先Draft生成`
3. `A04. GitHub Star -> Issue Draft生成`
4. `A05. RSS / News -> Research Note生成`
5. `A09. README再生成`

理由:

- 仕様乖離チェックは、WorkUnit OS思想から外れる事故を最も早く検出する。
- Draft生成は、n8n/D1未接続でも価値を出せる。
- GitHub StarとRSSは、Hopperの初期対象として情報密度が高い。
- READMEは空なので、早期にプロジェクト入口を作る必要がある。

## 5. 厳格な結論

Codex Automationで置き換えられるのは、Hopperの「知的バッチ処理」と「仕様監査」である。

置き換えられないのは、Hopperの本質である「低摩擦入力」「即時判断」「判断ログの永続学習」である。

したがってAutomationは本体代替ではなく、MVP前段の暫定処理、または開発運用の監査装置として使うべきである。
