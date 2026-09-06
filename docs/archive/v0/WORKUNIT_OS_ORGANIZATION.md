# WorkUnit OS 組織運営設計

## 0. 完成定義

WorkUnit OS は単一チャットでも単なる検索UIでもない。

完成形は、PM兼パイロットであるユーザーの下に、複数の SubAgents が組織として配置され、Slack / Notion / Google Workspace などの入力を source 別に無害化し、WorkUnit Graph / Action Field 上で WorkUnit に変換し、Draft / Preview / Approval まで接続する運営システムである。

ユーザーの役割:

- 最終決定権者
- 設計主導者
- 優先順位の承認者
- 実行判断のパイロット

AI組織の役割:

- 情報収集
- 構造化
- 判断材料生成
- 実行接続
- 品質検証
- 運用改善

## 1. 参照するGoogle型組織構造

Google / Alphabet から直接コピーするのではなく、以下の構造だけを採用する。

- `Mission First`: 使命が組織判断を上書きする
- `Product Areas`: プロダクト領域ごとに責任を分ける
- `Shared AI Core`: モデル・研究・評価を共通基盤に集約する
- `Trust and Safety`: 安全性・評価・権限を独立機能として持つ
- `Cloud / Infrastructure`: 全Product Areaを支える実行基盤を別管理する
- `Other Bets`: 本流外の実験を分離して、本体を壊さない

参考情報:

- Alphabet は Google Services / Google Cloud / Other Bets を主要セグメントとして報告している。
- Google は AI 推進のため、モデル構築を Google DeepMind に集約し、Platforms & Devices を統合し、Trust and Safety / Responsible AI を強化した。
- Google DeepMind は Google Brain と DeepMind を統合したAI研究・モデル中核として位置づく。

参照URL:

- Alphabet FY2025 10-K: https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm
- Google "Building for our AI future": https://blog.google/company-news/inside-google/company-announcements/building-ai-future-april-2024/
- Google DeepMind About: https://deepmind.google/about/

## 2. WorkUnit OS の組織原則

### 2.1 Mission

人間を Pull の奴隷から解放し、散らばった情報を判断・計画・実行単位へ変換する。

### 2.2 Operating Model

```txt
External Sources
  -> Source Hoppers
  -> Sanitized Context Index
  -> WorkUnit Graph / Action Field
  -> WorkUnit candidates / Draft / Preview / Approval
  -> Judgment Logs
  -> Adaptive Filter
```

### 2.3 組織上の禁止事項

- Core に raw data を直接渡さない
- 1つのAgentに全責任を集中させない
- 検索結果一覧を完成品とみなさない
- チャット返答をプロダクト本体にしない
- PM判断をAIが上書きしない

## 3. 組織図

```txt
PM / Pilot
  |
  +-- Chief of Staff Agent
  |
  +-- Product Areas
  |     +-- Source Hopper PA
  |     +-- WorkUnit Graph / Action Field PA
  |     +-- Execution Prep PA
  |     +-- Voice Push PA
  |
  +-- Shared AI Core
  |     +-- WorkUnit Schema Agent
  |     +-- ROI / Adaptive Filter Agent
  |     +-- Memory / Judgment Agent
  |     +-- Model / Prompt Agent
  |
  +-- Trust, Safety, Privacy
  |     +-- Privacy Sandbox Agent
  |     +-- Security Review Agent
  |     +-- Eval / Red Team Agent
  |
  +-- Infra / Ops
  |     +-- Data Platform Agent
  |     +-- Integration Ops Agent
  |     +-- Release / QA Agent
  |
  +-- Business / GTM
        +-- Market Strategy Agent
        +-- Enterprise Workflow Agent
        +-- Partnership Agent
```

## 4. SubAgents 配置

### 4.1 Chief of Staff Agent

責任:

- PM意図をWorkUnit OS全体の運営方針に変換する
- SubAgentsへのタスク分解を行う
- 成果物を統合する
- PMに確認すべき論点だけを抽出する

禁止:

- PMの意思決定を代行する
- SubAgentsに曖昧な作業を投げる
- 根拠のない優先順位を確定する

主要タスク:

- 要件を `Goal / Current State / Decision / Next Action / Risk` に変換
- SubAgentごとの責任範囲を定義
- 作業の依存関係を整理
- 進捗を日次で圧縮報告
- PM判断が必要な点を1問に絞る

### 4.2 Source Hopper PA

責任:

- Slack / Notion / Google Workspace を source 別に隔離する
- raw data を無害化して WorkUnit Candidate に変換する
- Coreへ渡す情報量を最小化する

SubAgents:

- Slack Hopper Agent
- Notion Hopper Agent
- Gmail Hopper Agent
- Google Drive Hopper Agent
- Google Calendar Hopper Agent
- Source Normalization Agent

主要タスク:

- Slack message metadata を取得
- Slack thread / mention / reaction / deadline hint を抽出
- Slack本文全文を初期段階ではCoreへ渡さない
- Notion page title / DB property / status / owner / due date を取得
- Notion本文全文を初期段階ではCoreへ渡さない
- Gmail sender / subject / label / date / attachment有無を取得
- Drive file name / owner / modified_at / mime type を取得
- Calendar busy state / title / attendee / time range を取得
- sourceRef を保持する
- source別権限境界を明示する
- 候補を `SanitizedWorkUnitCandidate` に変換する

### 4.3 WorkUnit Graph / Action Field PA

責任:

- 検索結果や候補をWorkUnit Node候補とDraftへ変換する
- ユーザーが編集できる構造体として提示する
- WorkUnitをレビュー可能な単位へ整形する

SubAgents:

- WorkUnit Draft Agent
- Graph / Action Field UX Agent
- Correction Agent
- Context Merge Agent

主要タスク:

- `Situation` を生成
- `Actors` を生成
- `Problem` を生成
- `Deadline` を生成
- `Impact` を推定
- `Effort` を推定
- `Next Action` を生成
- 複数source候補をMerge Candidateへ統合
- ユーザー修正を構造化ログ化
- `accept / reject / defer / correct` を保存
- Draftと確定WorkUnitを分離

### 4.4 Execution Prep PA

責任:

- WorkUnitを外部実行候補のDraft / Previewへ接続する
- 検証結果をWorkUnitへ戻す
- 作業の完了条件を明示する

SubAgents:

- GitHub Issue Draft Agent
- Task Agent
- Calendar Schedule Candidate Agent
- Reply Draft Agent
- PR / Commit Agent

主要タスク:

- WorkUnitをGitHub Issue Draftへ変換
- WorkUnitをTaskへ変換
- Deadline付きWorkUnitをCalendar候補へ変換
- Slack / Gmail返信Draftを生成
- Commit / PRに紐づく検証ログを保存
- 実行失敗時のfallbackを定義
- 外部送信前にPM承認を要求

### 4.5 Voice Push PA

責任:

- PushすべきWorkUnitだけを音声で割り込ませる
- 音声入力を安全なIntentへ変換する
- 音声をチャット化させない

SubAgents:

- Voice Prompt Agent
- Voice Intent Agent
- Interruptibility Agent
- Defer Scheduler Agent

主要タスク:

- Push文を1文で生成
- `accept / reject / defer / correct` 以外を実行しない
- ROIとInterruptibilityからPushScoreを計算
- 会議中 / 集中中 / 夜間などの割り込み禁止条件を判定
- `defer` を再通知候補へ変換
- `correct` をCorrection Agentへ渡す

### 4.6 Shared AI Core

責任:

- WorkUnit OS全体の知能中核を管理する
- source別Hopperから来た候補だけを処理する
- 判断ログからAdaptive Filterを更新する

SubAgents:

- WorkUnit Schema Agent
- ROI Agent
- Adaptive Filter Agent
- Memory / Judgment Agent
- Model / Prompt Agent

主要タスク:

- WorkUnit schemaを管理
- ROI式を管理
- PushScore式を管理
- `V_short / V_work / V_long / M_reject / M_open` を分離管理
- Reject memoryをランキングへ反映
- 重複候補にペナルティを付与
- source別しきい値を管理
- PM修正を学習データに変換
- prompt contractを管理

### 4.7 Trust, Safety, Privacy

責任:

- raw data漏洩を防ぐ
- source別権限を検査する
- AI出力の危険な自動実行を止める

SubAgents:

- Privacy Sandbox Agent
- Security Review Agent
- Permission Agent
- Eval / Red Team Agent

主要タスク:

- Slack DM全文のCore流入を禁止
- Notion本文全文の無断流入を禁止
- Gmail本文全文の無断流入を禁止
- Drive/Docs本文の無断流入を禁止
- 外部送信系アクションを承認制にする
- prompt injectionを検査
- sourceRefと実データの分離を検査
- evalケースを作成
- 誤Push / 過Push / 未Pushを評価

### 4.8 Infra / Ops

責任:

- データ基盤、連携、テスト、リリースを維持する
- 組織全体が同じ状態を参照できるようにする

SubAgents:

- Data Platform Agent
- Integration Ops Agent
- Test Agent
- Release Agent
- Documentation Agent

主要タスク:

- D1 schemaを管理
- n8n workflowを管理
- source connectorの状態を監視
- mock dataを整備
- unit testを追加
- integration testを追加
- rollback手順を定義
- handoff documentを更新
- `README / SPEC / TASK_BOARD / AI_HANDOFF` を同期

### 4.9 Business / GTM

責任:

- WorkUnit OSを事業として成立させる
- 検索エンジンではなく構造化実行OSとして価値を定義する

SubAgents:

- Market Strategy Agent
- Enterprise Workflow Agent
- Pricing Agent
- Partnership Agent
- Competitive Intelligence Agent

主要タスク:

- Glean / Microsoft Copilot / Slack AI / Notion AIとの差分を整理
- 競争軸を検索からWorkUnit化へ移す
- 導入先の業務フローを定義
- 課金単位を定義
- lock-in要素を設計
- 連携先優先順位を決める
- M&A候補企業を分類
- PoCで測るKPIを定義

## 5. 全タスク台帳

### Phase 0: 組織OS化

- AGENTS.mdをWorkUnit OS用に更新する
- PM / Pilotの権限を明文化する
- SubAgent使用条件を明文化する
- Handoff形式を固定する
- Source of Truthファイルを決める
- タスク台帳を作る

### Phase 1: Source Hopper

- Slack Hopper schemaを作る
- Notion Hopper schemaを作る
- Gmail Hopper schemaを作る
- Drive Hopper schemaを作る
- Calendar Hopper schemaを作る
- SanitizedWorkUnitCandidate schemaを作る
- sourceRef形式を固定する
- raw data禁止ルールを実装する
- mock search resultを作る
- source別normalizerを実装する

### Phase 2: WorkUnit Graph / Action Field

- WorkUnit Draft schemaを作る
- CandidateからWorkUnit Draftへ変換する
- WorkUnit Graph / Action Field UIを整理する
- `accept / reject / defer / correct` を実装する
- Correction logを保存する
- Draftと確定WorkUnitを分離する
- 複数候補のMerge Candidateを実装する
- WorkUnitの不足項目を検出する

### Phase 3: Ranking / Adaptive Filter

- ROI式を実装する
- PushScore式を定義する
- source別thresholdを持たせる
- Reject memoryを反映する
- duplicate penaltyを反映する
- V_shortを更新する
- V_workを更新する
- V_longを更新する
- M_rejectを更新する
- M_openを更新する
- `This is wrong` を学習データ化する

### Phase 4: Execution

- GitHub Issue Draft変換を実装する
- Task変換を実装する
- Calendar Schedule Candidateを実装する
- Slack reply draftを実装する
- Gmail reply draftを実装する
- 実行前承認フローを実装する
- 実行結果ログを保存する
- WorkUnit完了条件を保存する

### Phase 5: Voice Push

- Proactive Voice promptを固定する
- `accept / reject / defer / correct` の音声Intentを実装する
- interruptibility判定を実装する
- cooldownを実装する
- defer scheduleを実装する
- 誤Pushログを保存する
- 過Push率を測る
- 未Push率を測る

### Phase 6: Trust / Safety

- source別権限表を作る
- raw data流入テストを作る
- prompt injectionテストを作る
- 外部送信承認テストを作る
- privacy regression testを作る
- eval datasetを作る
- red team checklistを作る

### Phase 7: Business

- ICPを定義する
- 検索エンジン競合との差分を定義する
- WorkUnit化KPIを定義する
- PoCシナリオを作る
- 課金モデルを作る
- enterprise security資料を作る
- integration roadmapを作る

## 6. KPI

Product KPI:

- WorkUnit draft生成数
- WorkUnit accept率
- reject理由の回収率
- draftからissue/task/scheduleへの変換率
- 判断時間削減量
- 過Push率
- 未Push率

Operational KPI:

- raw data漏洩ゼロ
- source別Hopper失敗率
- test pass率
- handoff欠落率
- PM確認回数
- SubAgent成果物統合率

Business KPI:

- PoC導入数
- 1ユーザーあたり削減判断時間
- 週次継続率
- enterprise connector数
- lock-in source数

## 7. 最初に作るべき成果物

優先順位:

1. `SanitizedWorkUnitCandidate` schema
2. Slack / Notion / Google Workspace mock Hopper
3. Candidate -> WorkUnit Draft converter
4. Action Field上のDraft表示
5. `accept / reject / defer / correct`
6. Reject memory反映
7. GitHub Issue Draft変換
8. Voice Push intent最小実装

## 8. 結論

WorkUnit OS は、検索エンジンでもブラウザでもチャット秘書でもない。

組織として見ると、Google型の `Mission First + Product Areas + Shared AI Core + Trust/Safety + Cloud/Infra` を、PM配下のAI組織に置き換えたものになる。

完成形は、SubAgentsが各Product Areaを担当し、source別処理で情報を無害化し、WorkUnit Graph / Action FieldでWorkUnitへ変換し、Draft / Preview / Approvalと判断学習まで回す運営OSである。

## 9. Phase 0-6 実装配置

実装済みSubAgents:

- Execution Prep PA: `app/lib/workUnitExecution.ts`
- Voice Push PA: `app/lib/workUnitVoicePush.ts`
- Trust, Safety, Privacy PA: `app/lib/workUnitSafety.ts`
- Source Hopper PA: `app/lib/sourceHoppers.ts`
- WorkUnit Graph / Action Field PA: `app/lib/workUnitDrafts.ts`
- Shared AI Core: `app/lib/workUnitRanking.ts`, `app/lib/hopperAdaptiveFilter.ts`, `app/lib/hopperEngine.ts`

検証ファイル:

- Phase 1-3: `tests/workUnitOrganizationPhase3.test.mts`
- Phase 4: `tests/workUnitExecutionPhase4.test.mts`
- Phase 5: `tests/workUnitVoicePushPhase5.test.mts`
- Phase 6: `tests/workUnitSafetyPhase6.test.mts`
- Phase 4-6 integration: `tests/workUnitPhase6Integration.test.mts`

Phase 4-6の実装境界:

- Phase 4 Execution Prepは、外部送信前にPM承認を要求し、GitHub Issue / Task / Calendar / Slack Reply / Gmail ReplyのDraftだけを生成する。
- Phase 5 Voice Pushは、音声Intentを `accept / reject / defer / correct` に限定し、interruptibility / cooldown / defer schedule / Push誤差KPIを扱う。
- Phase 6 Trust Safetyは、source別権限表、raw data流入検査、prompt injection検査、外部送信承認検査、privacy regression、red team checklistを持つ。
