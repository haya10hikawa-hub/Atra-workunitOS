# WorkUnit OS 概要

## 0. プロジェクト名

**WorkUnit OS — AI-Powered Decision Engine**

## 1. 目的

WorkUnit OS は、情報過多とアプリケーション分断によって発生する知識労働者の判断負荷を下げるためのプロダクトである。

目的は単なるタスク管理ではない。  
`情報 -> 判断 -> 計画 -> 実行` の流れを、AIとユーザー編集権の組み合わせで再設計することにある。

## 2. 開発方針

開発は段階的に進める。

- 短期 (`0 -> 1`) : `Hopper` を先行プロダクトとして立ち上げる
- 中期 (`1 -> 10`) : 保持された信号を `WorkUnit` と優先度付きタスクへ変換する
- 長期 (`10 -> 100`) : `WorkUnit OS` を意思決定と実行の統合基盤へ拡張する

`Hopper` は別構想ではない。  
`WorkUnit OS` の上流にある、判断データ取得レイヤーとして位置づける。

## 3. 対象ユーザー

WorkUnit OS 全体の対象は広いが、短期 `0 -> 1` の Hopper は以下に絞る。

- 先端エンジニア
- リサーチャー
- ディープテック起業家

理由は明確である。

- 日常的に技術情報の入力量が多い
- モバイルとデスクトップをまたいだ情報の持ち運びが多い
- 「保存はするが再読しない」情報が大量に発生する
- 高速な一次選別そのものに価値がある

中長期では対象を広げうるが、Hopper の初期設計はこのユーザー群の行動に最適化する。

## 4. コアコンセプト

従来の知識労働では、ユーザー自身が複数ツールを横断し、情報を探し、読み、優先順位を判断し、実行可能な単位へ変換する必要がある。

WorkUnit OS ではこの役割を分担する。

- AI が情報を収集・整理する
- AI が要約し、ノイズを圧縮する
- AI が判断候補や作業候補を生成する
- ユーザーは編集権と最終判断権を持つ
- システムは判断と実行を支援する

## 5. Hopper の位置づけ

`Hopper` は短期 `0 -> 1` の先行プロダクトであり、役割は「高速な情報取り込みと一次判断」である。

コアループは次の通り。

`Capture -> Summarize -> Triage -> Store -> Learn`

Hopper が担うこと:

- 候補情報を低摩擦で取り込む
- AI が少数の候補だけを前面に出す
- ユーザーが `open / defer / archive` を高速に判断する
- その判断結果を学習データとして保存する

Hopper の知能コアは、`Understand -> Merge -> Rank` の3段階で構成する。

- `Understand`: 入力内容の文脈理解
- `Merge`: 重複排除とマルチソース統合
- `Rank`: 行動ログに基づく表示順位決定

Hopper は、広すぎる初期構想をそのまま実装する代わりに、最初に必要な「判断データ」を集めるための導入レイヤーである。

ベクトル処理と判断学習の詳細仕様は [HOPPER_VECTOR_ALGORITHM.md](../../research/HOPPER_VECTOR_ALGORITHM.md) を参照する。

## 6. WorkUnit モデル

`WorkUnit` は、判断と実行の最小単位である。

各 WorkUnit は以下の要素を持つ。

- `Situation` : 現在の状況
- `Actors` : 関係者
- `Problem` : 対処すべき問題
- `Deadline` : 期限
- `Impact` : 期待される影響
- `Effort` : 必要な時間やコスト

目的は、曖昧な入力情報をレビュー可能な作業単位へ変換することにある。

## 7. MVP 範囲

MVP では以下を対象とする。

- モバイル共有、X ブックマーク、GitHub Star、RSS を中心とした情報収集
- AI による要約とノイズ圧縮
- WorkUnit Launcher上での少数候補の高速トリアージ
- `open / defer / archive` の明示的な判断操作
- 判断ログの構造化保存
- Web アプリケーション上での表示と編集

### 7A. Hopper MVP

初期の Hopper は長期構想より狭く設計する。

必須機能:

- モバイルブラウザ共有シートからの1タップ保存
- X ブックマーク連携
- GitHub Star 連携
- RSS / ニュースレター更新の取り込み
- LLM による3行要約とタグ生成
- 重要度スコアの付与
- WorkUnit Launcher候補リスト
- `open / defer / archive` 操作
- D1 への判断ログ保存

初期段階では、全件を自動で WorkUnit 化しない。  
まず必要なのは、判断の教師データである。

補助機能:

- スクリーンショット起点の取り込み

ただし、スクリーンショット起点は OS 制約の影響を受けやすいため、MVP の主経路には置かない。

## 8. UI 構成

WorkUnit OS のUIは、添付UI案を正とする。

- `WorkUnit Launcher` : WorkUnit検索、ROI、状態、Source / Urgency / Next Step確認
- `WorkUnit Graph` : Node関係、依存、作業流れの操作面
- `Action Field` : 選択Nodeに紐づく右側の作業面
- `Command Palette` : 移動とコマンド発見。外部実行はしない
- `Safety Protocol / Finalization Queue / System Logs` : 安全状態と監査状態

旧来の `Inbox / Tasks / Studio` 3カラム構造は採用しない。
Dashboard中心のUIも採用しない。

### 8A. Launcher の操作モデル

想定動作:

- `Search WorkUnits` からWorkUnitを検索する
- 各行には、Source、タイトル、説明、ROI、状態を出す
- 右側詳細には、Source、Urgency、Next Stepを出す
- `Enter` でWorkUnitを開く
- 開いたWorkUnitはWorkUnit Graphへ展開する

必要条件は、低遅延かつ連続して処理できること。  
タイムライン型の閲覧体験は避ける。

入力インターフェースは以下を前提とする。

- iOS / Android の共有シート
- ブラウザ拡張またはブックマークレット
- X ブックマーク同期
- GitHub Star 同期
- RSS / ニュースレター同期

スクリーンショット由来の入力は補助ルートとして扱う。主要導線は共有シートと既存行動同期である。

## 9. 優先度エンジン

初期の優先度は ROI モデルを用いて算出する。

`Priority = Impact x Urgency x ActorWeight / Effort`

ただし、`ActorWeight` を固定値で扱うと誤判定を起こしやすいため、将来的には学習対象として扱う。
Hopper 側では、単純な平均ベクトルではなく、`短期文脈 / 作業文脈 / 長期文脈 / reject メモリ` を分離して扱う。

## 10. 技術アーキテクチャ

- Frontend: Web UI
- バックグラウンド処理: n8n
- AI 処理: LLM
- データ層: Cloudflare D1
- 連携対象: モバイル共有シート / ブラウザ拡張 / X / GitHub / RSS
- 実行連携: Git

## 11. 全体ワークフロー

全体フローは以下を基本とする。

`Share Sheet / Browser Extension / X / GitHub / RSS -> n8n -> LLM -> D1 -> WorkUnit Launcher -> WorkUnit Graph -> Action Field`

### Step 1. 情報取り込み

入力元:

- `Share Sheet` : モバイルブラウザやアプリからのURL共有
- `Browser Extension` : デスクトップブラウザ上の軽量保存
- `X` : ブックマーク済みポスト
- `GitHub` : Star したリポジトリ、後続では Issue / PR / Review も対象
- `RSS / Newsletter` : 購読中フィードや技術更新
- `Screenshot` : 補助的な画像起点入力

### Step 2. n8n によるバックグラウンド処理

n8n は次を担う。

- 各ソースからのイベント受信または定期取得
- 共通スキーマへの正規化
- 重複排除
- `source / actor / timestamp / thread / repository` などのメタデータ付与
- URL 取得、記事抽出、本文フェッチ
- OCR または画像由来メタデータ処理
- LLM 処理へのルーティング
- D1 への保存

### Step 3. LLM による解析

LLM は次を担う。

- 要約生成
- ノイズ圧縮
- 現在の関心文脈との関連度判定
- 意図抽出
- 技術タグ生成
- 重要度スコアリング
- 後続段階での WorkUnit 候補生成
- 後続段階での期限、影響度、工数の推定

### Step 4. D1 への保存

D1 は以下の状態を保持する。

- 生イベント
- 正規化済みメッセージ
- 要約
- Hopper の判断ログ
- WorkUnit
- タスク
- 優先度スコア
- フィードバックと判断履歴

### Step 5. ユーザー向け表示

処理済みデータは以下に表示する。

- `WorkUnit Launcher` : 検索と選択
- `WorkUnit Graph` : Node構造と依存
- `Action Field` : Draft、Linked Context、Verification、Approval状態

### Step 6. 実行接続

受理された WorkUnit は次段の実行に接続する。

- Draft生成
- Preview生成
- Human / Server Approval
- Dry-run verification

外部実行はこのUIから直接行わない。

## 12. 連携別ワークフロー

### Share Sheet / Browser Extension

`Share Sheet / Browser Extension -> n8n -> LLM -> D1 -> WorkUnit Launcher -> WorkUnit Graph -> Action Field`

### X

`X Bookmark -> n8n -> LLM -> D1 -> WorkUnit Launcher -> WorkUnit Graph -> Action Field`

### GitHub

`GitHub Star -> n8n -> Repo Fetch / README Extract / LLM -> D1 -> WorkUnit Launcher -> WorkUnit Graph -> Action Field`

### RSS / Newsletter

`RSS / Newsletter -> n8n -> Content Fetch -> LLM -> D1 -> WorkUnit Launcher -> WorkUnit Graph -> Action Field`

### Screenshot

`Screenshot -> OCR / Source Resolution -> n8n -> LLM -> D1 -> WorkUnit Launcher`

スクリーンショットは補助経路とし、共有シートより優先しない。

## 13. Hopper から WorkUnit OS への移行ロードマップ

移行パスは次の通り。

`判断データ -> 文脈ランキング -> WorkUnit生成候補 -> Action Field作業`

### Stage 1. 判断ログの蓄積

最低限保存する項目:

- `source`
- `actor`
- `topic` または `tag`
- `captured_at`
- `keep / discard`
- `opened_detail`
- `time_to_decision`
- `revisit_count`
- `task / issue / project` への後続接続有無

### Stage 2. 文脈学習

Hopper のログから次を推定する。

- トピック別の actor 信頼度
- 緊急度の過大申告傾向
- ソース別・actor 別のノイズ率
- 後続実行につながるタグ傾向
- 要約の偽陽性 / 偽陰性

### Stage 3. WorkUnit 昇格

高信頼で保持された情報のみを WorkUnit に昇格させる。

ここで生成対象となるのは以下である。

- `Situation`
- `Actors`
- `Problem`
- `Deadline`
- `Impact`
- `Effort`

### Stage 4. 優先度学習

固定ルール中心の優先度付けから、行動ログベースの優先度補正へ移行する。

学習に使う主な信号:

- 保持率
- 再訪率
- 実行転換率
- 下流での有用性

この段階で、単純な `ActorWeight` を文脈付きの期待価値へ置き換える。

## 14. Git 統合戦略

エンジニア向けフローは次を基本とする。

`WorkUnit Launcher -> WorkUnit Graph -> Action Field -> Draft / Preview / Approval`

これは、判断レイヤーと実行レイヤーを接続するための基盤である。

## 15. 長期ビジョン

WorkUnit OS は、知識労働のための意思決定 OS を目指す。

最終的には、人間の仕事を WorkUnit 単位で扱い、情報取得から判断、計画、実行までを一つの系として扱う。

---

## 設計上の主要リスク: ActorWeight

現行の ROI モデルで最も壊れやすいのは `ActorWeight` である。

送信者の重みを固定値で持つと、次の問題が起きる。

- 重要人物のノイズを過大評価する
- 目立たない人物の本質的情報を過小評価する
- 組織政治を優先度に埋め込んでしまう
- ユーザーがランキングを信頼しなくなる

## 16. ActorWeight の設計原則

`ActorWeight` は固定属性ではなく、文脈付きの期待価値として扱うべきである。

少なくとも次の軸で変動させる必要がある。

- `Actor x Topic`
- `Actor x Outcome`
- `Actor x UrgencyAccuracy`
- `Actor x NoiseRate`
- `Actor x RelationshipCost`

## 17. より安全な優先度モデル

単一の `ActorWeight` にまとめるのではなく、説明可能な因子へ分解する。

例:

`Priority = Impact x Urgency x ContextAuthority x FollowThroughScore x RelationshipCost / Effort`

この形にすると、

- なぜ順位が高いのかを説明できる
- 誤判定時にどの因子が壊れているかを追える

## 18. 設計上の要点

- 短期は `Hopper` を使って判断データを集める
- 中期はそのログを `WorkUnit` 生成と優先度学習へ接続する
- 長期は `WorkUnit OS` を判断と実行の統合基盤へ拡張する
- `ActorWeight` は最初から固定値で完成させようとしない

以上を前提に、Hopper は UI 施策ではなく、WorkUnit OS 全体の学習基盤として扱う。
