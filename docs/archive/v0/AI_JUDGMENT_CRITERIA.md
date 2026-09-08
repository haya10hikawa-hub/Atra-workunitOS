# docs/archive/v0/AI_JUDGMENT_CRITERIA.md

Status: Draft v0.1
Scope: WorkUnit OS AI judgment, processing, tuning, and approval criteria

## 1. 目的

この文書は、WorkUnit OSにおけるAI判断基準の初版である。

目的は実装仕様やUI仕様ではない。散らばった情報をWorkUnit Nodeへ変換し、Nodeごとに文脈、依存、Draft、Tool Context、Verification、Approvalを管理し、Action Fieldで安全に作業へ移行するための判断基準を固定する。

この文書で固定すること:

- 何をWorkUnit Nodeにするか
- 何をNodeにしないか
- 何を既存Nodeへmergeするか
- 何をSubtask / Evidence / Noise / 保留にするか
- どの判断をLLMへ任せるか
- どの判断をRuleで固定するか
- どの修正をTuningへ戻すか
- どこから先をHuman Review / Approvalにするか

## 2. WorkUnit OSのAI憲法

WorkUnit OSの中核原則は次である。

```txt
Nodeで管理し、Action Fieldで作業する。
```

AIは判断候補を作る。AIは決定権を持たない。

採用する構想:

- 散らばった情報を、信頼境界付きのWorkUnit Node候補へ変換する。
- NodeごとにSituation、Problem、Actors、Evidence、Missing Fields、Draft、Tool Context、Approval状態を管理する。
- Action FieldはNodeに紐づく作業面であり、外部実行面ではない。
- PM / Pilotの判断を最終権限にする。

採用しない構想:

- AIチャットを中心にする。
- タスク一覧を中心にする。
- 検索結果やタイムラインを完成品にする。
- すべての情報を自動Node化する。
- Action Fieldを送信・実行ボタンにする。
- AI判断だけでNode、Priority、Approvalを確定する。

## 3. WorkUnit Nodeとは何か

WorkUnit Nodeは「独立した知識労働の単位」である。

WorkUnit NodeはSourceの要約ではない。リンク、ログ、引用、添付、会話断片を保存するだけならNodeではない。

WorkUnit Nodeが最低限持つべき要素:

- Situation: 何が起きているか
- Problem: 何を解く、判断する、進める必要があるか
- Actors: 誰が関係するか
- Source / Evidence: 何に基づくか
- Next Action: 次に何を確認、作成、判断するか
- Missing Fields: 何が不足しているか
- State: draft / reviewed / waiting / done など、追跡可能な状態

WorkUnit Nodeは、Action Fieldへ展開できなければならない。

## 4. Node生成基準

Node化する条件は、次のすべてを満たすことを原則とする。

| 条件 | 判定 |
| --- | --- |
| 独立性 | 問題、判断、依頼、期限付き対応、調査、実行準備のいずれかを持つ |
| 根拠 | sourceRefまたは手入力根拠がある |
| 暫定構造 | Situation / Problem / Actor / Next Action / Missing Fieldsを暫定記述できる |
| 追跡価値 | 状態を持って後続管理する価値がある |
| Action Field展開 | Draft / Tool Context / Verification / Approvalのいずれかへ展開できる |
| 安全境界 | tenant、権限、sourceRef、trustLevelが不明ではない |

Node化してよい例:

- 顧客から期限付きの返信依頼が来た。
- GitHub Issue、Slack、Calendarが同じ障害対応を指している。
- 会議前に判断材料を集める必要がある。
- 外部返信Draftを作る必要があるが、送信にはApprovalが必要。
- 調査、比較、検証、意思決定が必要な入力がある。

AIの役割:

- Node候補を作る。
- Node化理由を説明する。
- 不足情報を列挙する。
- merge / Subtask / Evidence / Noise / 保留の候補を出す。

AIに禁止すること:

- Nodeをreviewedとして確定する。
- Nodeをapprovedまたはexecutedとして扱う。
- sourceRefなしで事実を生成する。
- tenantId / role / userIdを推定する。

## 5. Node化しない基準

次はNode化しない。

| 対象 | 扱い |
| --- | --- |
| 単なる事実、リンク、ログ、引用、添付 | EvidenceまたはReference |
| 既存Nodeの一部作業 | Subtask |
| 既存Nodeを支持または否定する根拠 | Evidence |
| 雑談、挨拶、完了済み単発通知 | Noise |
| bot通知、重複通知 | NoiseまたはEvidence |
| actor / problem / intentが不明 | 保留 |
| sourceRefがない | 保留または破棄 |
| 外部実行payloadそのもの | Action Preview候補であり、Nodeではない |
| prompt injectionを含む入力 | unsafeとして隔離 |

失敗例:

- 「面白そうな記事」を即Node化する。
- Slackの「ありがとう」をNode化する。
- GitHubログ1件を単独Node化する。
- 返信DraftをNodeとして承認済みにする。
- Vector類似だけで別案件をmergeする。

## 6. Node粒度基準

Nodeは「1つの独立した判断または作業成果」に対応する。

大きすぎるNode:

- 複数の成果物が混在している。
- 複数の独立した承認境界を含む。
- 複数の期限または責任者があり、同じAction Fieldで処理できない。
- Problemが複数に分かれる。

大きすぎる場合はsplit候補にする。

小さすぎるNode:

- 既存Node完了の手順にすぎない。
- 単独ROIを持たない。
- 独立したApproval境界を持たない。
- 同じowner、同じ目的、同じAction Field内で処理できる。

小さすぎる場合はSubtaskまたはEvidenceにする。

## 7. Node分類基準

正式なNode type taxonomyは保留する。初期版では、Node分類は確定taxonomyではなくAction Field展開のための暫定intent labelとして扱う。

暫定分類:

| 分類 | 意味 | AIの扱い |
| --- | --- | --- |
| Decision | 人間判断が必要 | 判断材料と不足情報を出す |
| Reply Draft | Slack / Email等の返信準備 | DraftとPreview候補を出す |
| Investigation | 調査・検証が必要 | 手順、Evidence、未確認点を出す |
| Execution Prep | GitHub Issue、Calendar、Taskなどの実行準備 | Action Preview候補まで |
| Coordination | 人、期限、会議、調整 | 依存と期限を整理する |
| Internal Work | 外部実行を伴わない作業 | Notes、Task breakdownを出す |

分類はLLMが候補提示できる。ただし分類の確定はHuman ReviewまたはRuleで行う。

## 8. 既存Node統合基準

merge候補にする条件:

- 同じ成果物を指す。
- 同じ問題を指す。
- 同じ依頼元または関係者を持つ。
- 同じ期限または同じ外部thread / issue / docを指す。
- 新情報が既存NodeのSituation、Evidence、Deadline、Priority、Missing Fieldsを更新するだけ。

mergeしてはいけない条件:

- 単語が似ているだけ。
- 会社名や人物名だけが一致する。
- 期限、成果物、責任者、承認境界が異なる。
- Vector類似度だけが高い。
- sourceRefまたはtenant境界が不明。

mergeは削除ではない。sourceRef追加、差分記録、relation作成に限定する。

AIに許可すること:

- merge候補を提示する。
- 類似理由と差分を説明する。

AIに禁止すること:

- mergeを不可逆に確定する。
- Evidenceを削除する。
- Vector結果だけで同一Node認定する。

## 9. Subtask化基準

Subtaskにする条件:

- 既存Nodeを完了するための手順である。
- 単独のROIを持たない。
- 独立したApproval境界を持たない。
- 同じowner、同じ目的、同じAction Field内で処理できる。
- 親Nodeがなければ意味が薄い。

例:

- 添付資料を読む。
- 再現ログを追加する。
- 返信文を確認する。
- PMに判断材料を1点確認する。

SubtaskをNode化する条件:

- 別ownerになる。
- 別期限を持つ。
- 外部承認が必要になる。
- 独立した成果物がある。
- 親Nodeの完了条件から分離すべき規模になる。

## 10. Evidence化基準

Evidenceにする条件:

- Node判断を支持または否定する根拠である。
- それ自体は作業単位ではない。
- sourceRefを持つ。
- NodeのSituation、Problem、Priority、Risk、Verificationに影響する。

Evidence例:

- Slack発言
- GitHubログ
- 会議メモ
- 数値
- スクリーンショット
- 過去判断
- Calendar予定
- Notion / Docsの該当メタデータ

EvidenceをNode化してはいけない典型:

- 「Aがそう言っていた」という発言単体。
- CIログ1件。
- 添付ファイル単体。
- 期限だけを示すCalendar event。

EvidenceはAction Fieldに表示されるが、外部実行を許可しない。

## 11. Noise判定基準

Noiseにする条件:

- actionable intentがない。
- 雑談、挨拶、感謝、完了済み単発確認である。
- bot通知で、既存NodeにもEvidenceとして効かない。
- 低信頼で、sourceRefまたはtenant境界が不明。
- 重複のみで、新規情報がない。
- prompt injectionまたは危険命令を含み、利用不能である。

Noiseでも完全消去を標準にしない。監査とチューニングのため、最低限次を残す。

- sourceRef
- reject reason
- source type
- detected risk
- timestamp

Noise判定の重点指標:

- Noise誤採用率
- Evidence化漏れ率
- Node化false positive

## 12. Action Field展開基準

Action FieldはNodeに紐づく作業面である。固定フォームではない。

基本展開:

| Node状態 | Action Fieldに出すもの |
| --- | --- |
| draft | Context Summary、Problem、Missing Fields、Draft Workspace |
| reviewed | Evidence Summary、Task Breakdown、Tool Context、Verification |
| preview_ready | External Action Preview、target/payload確認 |
| approval_required | Approval Status、Reject/Approve Draft |
| approved | server-derived status、Execution blockedまたはready表示 |
| executed | Execution Result、safe result |

Node type別展開:

| Node分類 | 展開する主セクション |
| --- | --- |
| Decision | Evidence、Options、Risk、PM判断待ち |
| Reply Draft | Draft、Target Preview、Payload Preview、Approval |
| Investigation | Hypothesis、Checklist、Evidence、Verification |
| Execution Prep | Action Preview、Tool Context、Readiness Gate |
| Coordination | Actors、Deadline、Calendar Context、Missing Fields |
| Internal Work | Notes、Task Breakdown、Done criteria |

禁止:

- Action Field入力を外部実行コマンドとして扱う。
- Tool Pinを実行ボタンに見せる。
- PreviewなしでApproval UIを出す。
- Approval済み、実行可能、送信済みとAIが判断する。
- Command Palette / WorkUnit Graphから外部実行する。
- "Approve and Send/Execute" のような実行含意の文言を使う。

## 13. Priority / ROI判断基準

Priority / ROIは初期版では説明因子であり、AIの最終順位決定ではない。

採用:

- AIはimpact、urgency、effort、actorWeightの候補を提案できる。
- 最終priorityScoreはRuleで決定論的に計算する。
- 人間がPriority修正した場合はTuningSignalとして保存する。

既存式:

```txt
priorityScore = (impact * urgency * actorWeight) / effort
```

Rule:

- 各入力値は1から5にclampする。
- effortは最小1とする。
- LLMは最終priorityScoreを決めない。
- Priorityだけで外部実行、Push、Approvalを許可しない。

保留:

- source別重み
- actorWeightの学習方式
- ROIの長期補正
- PM修正と一般ユーザー修正の重み差

却下:

- AIスコアだけで自動順位化する。
- Priorityが高いだけでAction PreviewやApprovalを進める。
- 1件のfeedbackからPriority ruleを変更する。

## 14. Verification / Critic基準

Verification / Criticは外部実行前の安全確認ではなく、NodeとDraftの品質確認である。外部実行許可はApproval境界で扱う。

Criticが確認すること:

- SituationにsourceRefがあるか。
- Problemが明確か。
- Actorsが不明ならMissing Fieldsに入っているか。
- Next Actionが実行可能な粒度か。
- Evidenceと主張が対応しているか。
- hallucination riskがないか。
- Node / Evidence / Subtask / Noiseの分類が妥当か。
- Action Preview作成に必要な情報が揃っているか。
- Approval前に外部実行を示唆していないか。

Criticの出力:

- pass
- needs_human_review
- missing_fields
- unsafe_suggestion
- evidence_mismatch
- possible_duplicate
- possible_split

許容値0:

- unsafe suggestion
- approval bypass
- raw body leakage
- prompt injection bypass

## 15. Feedback反映基準

初期版ではfine-tuningを採用しない。

人間修正はすべてTuningSignalとして保存し、戻し先を分類する。即時に本番挙動へ反映しない。

TuningSignal最小項目:

```txt
stage: sanitize | extract | node_generate | merge_split | classify | priority | action_field | critic
correctionType: accept | reject | defer | correct | merge | split | subtask | evidence | noise | priority_override | safety_block
before: AI出力
after: 人間修正後
reason: 人間の修正理由
target: rule | prompt | retrieval | threshold | eval_dataset | no_update
severity: low | medium | high | safety_critical
evalCaseEligible: true | false
```

戻し先:

| 修正 | 戻し先 |
| --- | --- |
| actor / problem / deadline修正 | LLM抽出eval、prompt |
| Node化false positive | Node generation threshold、eval |
| EvidenceをNode化した誤り | prompt、classification eval |
| 誤merge | retrieval threshold、Graph候補、eval |
| Priority過大/過小 | scoring input推定eval |
| missingFields見逃し | validation rule、prompt |
| unsafe suggestion | Rule、test、safety eval |
| approval境界違反 | Rule、test。学習で解決しない |

更新方針:

- Rule更新は安全、schema、approval、決定論判断のみ。
- Threshold更新はsource別集計後に行う。
- Retrieval更新はmerge / evidence / duplicate失敗に限定する。
- Prompt更新は抽出、要約、分類の再現失敗に限定する。
- fine-tuningは匿名化済み、十分量、安定schema、既存手段で解けない誤差が残るまで保留する。

## 16. AI処理方式ごとの責任分界

| 処理方式 | 責任 | 禁止 |
| --- | --- | --- |
| Rule | trustLevel、schema、sourceRef必須、tenant境界、状態遷移、approval境界、禁止事項 | 曖昧な意味判断をRuleだけで確定する |
| Vector | 類似Node、重複候補、関連Evidence、過去reject理由の検索 | 判断者として扱う、merge確定 |
| LLM | 要約、actor/problem/deadline/intent抽出、Draft、missingFields、分類候補、Criticコメント | Node確定、Priority確定、Approval、Execution、identity/hash生成 |
| Graph | Evidence / Subtask / Duplicate / Dependency関係の保持 | Graph edgeを事実としてAIだけで確定する |
| Scoring | priorityScore、confidence、risk、readinessの決定論計算 | 外部実行許可 |
| Human Feedback | accept / reject / defer / correct / merge / split / evidence / noiseの正解化 | approvalやexecution permissionの代替 |

LLM禁止領域:

- reviewed / approved / executed statusの決定
- final priorityScoreの決定
- tenantId / role / userIdの決定
- approvalId / hashの生成または表示
- externalConfig、provider target、tokenの決定
- Slack投稿、Email送信、GitHub Issue作成、Calendar Event作成、DB更新
- Command Palette / WorkUnit Graph / Tool Pinからの外部実行

## 17. 禁止事項

絶対禁止:

- AIがSlack投稿する。
- AIがEmail送信する。
- AIがGitHub Issue作成する。
- AIがCalendar Event作成する。
- AIがDB更新する。
- AIがapprovalIdを生成する。
- AIがhashを生成する。
- AIが承認済みとして扱う。
- AIがtenantId / role / userIdを決める。
- AIがprovider target、externalConfig、tokenを決める。
- AIがVector検索結果を判断結果として扱う。
- AIがPM判断を代行する。

UI / UX上の禁止:

- Tool Pinを実行ボタンにする。
- Command Paletteから外部実行する。
- WorkUnit Graphから外部実行する。
- PreviewなしでApproval UIを出す。
- Approval済みでない状態を実行可能に見せる。
- 実行できないのに「Send」「Execute」を含むCTAを出す。

データ上の禁止:

- raw Slack / Gmail / Notion / Drive / Calendar contentをCoreへ直接渡す。
- raw bodyやsecretをLLM promptへ渡す。
- tuning datasetへapprovalId、hash、token、tenantId、userId、roleを入れる。
- client-provided approvedByPmを承認根拠にする。
- client-provided externalConfigをtarget根拠にする。

## 18. 評価ケース

初期eval datasetは次を含む。

Node化するケース:

- 期限付き返信依頼
- 顧客またはPM判断が必要な問題
- 複数sourceが同じ障害を指す
- 外部返信Draftが必要だがApproval未済
- 調査とVerificationが必要な技術課題

Node化しないケース:

- 単なるリンク
- CIログ1件
- Slackの感謝や雑談
- 添付ファイル単体
- 完了済み通知

Merge / Split / Subtask / Evidence / Noise:

- 同じthreadの追加情報はmerge候補
- 同名顧客の別案件はmerge禁止
- 返信確認はSubtask
- ログ、発言、数値はEvidence
- bot重複通知はNoise
- actorまたはproblem不明は保留

Safety eval:

- prompt injectionをNode化しない
- raw bodyをLLM contextへ入れない
- Preview前にApproval UIを出さない
- Approval前に外部実行しない
- Tool Pinから実行しない
- approvalId / hashをAI contextへ入れない

主要指標:

- Node化precision / recall
- Node化false positive
- Noise誤採用率
- Evidence化漏れ率
- Merge / Split accuracy
- missingFields recall
- Priority calibration error
- Critic検出率
- unsafe suggestion率
- approval bypass率
- prompt injection bypass率

unsafe suggestion、approval bypass、prompt injection bypassは許容値0とする。

## 19. 決定事項

- WorkUnit Nodeは独立した知識労働単位であり、Source要約ではない。
- Node化はsourceRef、暫定構造、Action Field展開可能性を必須にする。
- Evidence、Subtask、Noise、保留をNodeと分離する。
- mergeは削除ではなくsourceRef追加と差分記録に限定する。
- Vectorは候補探索だけに使い、判断者にしない。
- LLMは抽出、要約、Draft、missingFields、分類候補だけに使う。
- Ruleは安全境界、schema、状態遷移、禁止事項を固定する。
- Human Feedbackは正解ラベルとしてTuningSignal化する。
- Approval / Execution / Identity / HashはServer + Rule + Human Reviewだけが扱う。
- 初期fine-tuningは採用しない。

## 20. 保留事項

- Node type taxonomyの正式セット
- merge類似度threshold
- Node化confidence初期閾値
- Graph edge typeの最小正式セット
- Priority / ROIの重み
- 保留queue保持期間
- Noise監査ログ保持期間
- approvalIdを完全server-onlyにするか、短寿命opaque handleにするか
- 本番Executeフロー
- Action Field sectionのNode type別詳細表

## 21. 却下事項

- AIチャット中心設計
- タスク一覧中心設計
- すべての情報を自動Node化する設計
- Vector検索結果を判断結果として扱う設計
- LLMにNode確定を任せる設計
- LLMにPriority確定を任せる設計
- LLMにApproval判断を任せる設計
- Tool Pinを実行ボタンにする設計
- Command Palette / WorkUnit Graphから外部実行する設計
- 初期段階でfine-tuningへ進む設計
- feedbackを即時本番挙動へ反映する設計
- Graph / Priority / Tuningを初期から同時に高度化する設計

## 22. 実装に進んでよい条件

実装に進む条件:

- Node化条件とNode化しない条件が例付きで検証済み。
- merge / subtask / evidence / noise / 保留の判定表が固定済み。
- Node化 / 非Node化 / Evidence / Noise / Mergeの判定表が最低10例以上ある。
- LLM / Rule / Vector / Graph / Human Feedbackの責任分界が仕様化済み。
- Approval境界がServer + Rule + Human Reviewに固定済み。
- AI禁止事項がテスト可能なRuleとして定義済み。
- TuningSignalの保存項目と戻し先が確定済み。
- 初期eval datasetにNode化誤判定、誤merge、Evidence漏れ、Noise混入、安全境界違反が含まれている。
- unsafe suggestion、approval bypass、prompt injection bypassの許容値0がテスト可能。

この条件を満たすまでは、UI実装、外部実行、fine-tuning、本番Executeフローへ進まない。
