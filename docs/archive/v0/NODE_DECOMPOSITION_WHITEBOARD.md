# docs/archive/v0/NODE_DECOMPOSITION_WHITEBOARD.md

Purpose: docs/archive/v0/NODE_DECOMPOSITION_POLICY.md を作る前のホワイトボード。
Scope: 実装なし。UI設計なし。外部実行なし。Node分解Policyの判断整理のみ。

## 1. 今回の前提

Atra / WorkUnit OS は通知ツール、タスク一覧、AIチャットではない。

採用する立場:

```txt
AI should perform decomposition by default.
Human review should be exceptional.
Pending Node should mostly be AI-side processing state.
Human-visible Pending should be rare and justified.
```

固定する原則:

```txt
Manage by Node.
Work through Action Field.
AI creates candidates.
Humans make final decisions.
Pending Node must not become user homework.
```

## 2. Subagent作業ログ

### 2.1 Product Doctrine Agent

検討したこと:

- Atraの本質
- Node分解の意味
- Pendingがuser homeworkになる危険
- 人間に繰り返し確認させてはいけない事項

判断:

- Atraは「人間に分解させるツール」ではなく、AIが先にWorkUnit候補へ分解する作業OS。
- 人間は分解作業そのものではなく、責任・承認・高リスク判断だけを見る。
- Pendingはユーザーの未処理タスク一覧ではなく、AI側の未確定バッファにする。

危険:

- Pendingを入力待ち一覧にすると、第二のInboxになる。
- AIがNode確定まで行くと、PM主導と安全境界が壊れる。

### 2.2 Node Boundary Agent

検討したこと:

- Formal Nodeの成立条件
- Nodeとして小さすぎるもの / 大きすぎるもの
- 独立管理できるNodeの基準

判断:

- Formal Nodeは、1つの明確なDone Conditionを持つ。
- outcome / verifier / acceptanceCriteria / sourceRef がないものはFormal Nodeにしない。
- Evidence、ログ、単なるGoal、複数Doneの混在はFormal Node化しない。

最小条件:

```txt
intent
problem
doneOutcome
verifier
acceptanceCriteria
sourceRef or humanInputRef
```

危険:

- EvidenceをNode化しすぎるとAction Fieldが崩壊する。
- 調査と実装を同じNodeに混ぜるとDoneが曖昧になる。

### 2.3 Pending Node Agent

検討したこと:

- Pending Nodeの再定義
- AI-only Pendingとhuman-visible Pendingの分離
- discard / escalation条件

判断:

- PendingはFormal化前の処理状態であり、原則AI側に閉じる。
- human-visible Pendingは、PM確認でFormal化できる可能性が高い場合だけ出す。
- PendingではDraft / Preview / Approval / Executionを出さない。

Pending分類:

```txt
欠損Pending
分岐Pending
境界Pending
分割Pending
低信頼Pending
```

危険:

- Pendingをユーザーに並べると確認作業が主作業になる。

### 2.4 Evidence Agent

検討したこと:

- NodeではなくEvidenceにすべき情報
- sourceRef規則
- EvidenceからNodeへ昇格する条件

判断:

- Evidenceは作業単位ではなく、Node判断を支持または否定する根拠。
- 単独Done Conditionを持たない情報はEvidenceに落とす。
- EvidenceはsourceRef必須。raw本文ではなくsanitized summaryを扱う。

昇格条件:

```txt
Evidenceから独立した依頼・判断・調査対象が発生
outcome / verifier / criteria / sourceRef が揃う
既存Nodeの根拠ではなく新しい作業単位になる
Human Reviewが昇格を承認
```

### 2.5 Subtask Agent

検討したこと:

- SubtaskとNodeの境界
- 親子関係
- promotion / demotion

判断:

- Subtaskは親NodeのDone条件を支える手順。
- 単独のDone条件、ROI、Approval境界を持たない。
- 別verifier / 別Approval境界 / 独立成果物が発生したらNode候補へ昇格。

例:

```txt
「添付PDFを読む」
=> A社契約確認NodeのSubtask

「法務確認を取り、判断メモに反映する」
=> verifier / approval境界が別ならFormal Node候補
```

### 2.6 Noise Agent

検討したこと:

- 無視、破棄、圧縮すべき情報
- over-capturing防止
- safe discard rules

判断:

- actionable intentがなく、NodeにもEvidenceにもSubtaskにもならないものはNoise。
- 完全削除ではなく、sourceRef / rejectReason / classifierVersion を保持する。
- prompt injection / unsafe payload はNoise + P0 safety block。

Noise例:

```txt
ありがとう
了解
FYIのみ
bot succeeded
リンクだけ
外部実行payload
```

### 2.7 Merge Agent

検討したこと:

- 新情報を既存Nodeに付ける条件
- Merge Candidateに留める条件
- AIがmerge確定してはいけない理由

判断:

- mergeは「同じDone Conditionに収まるか」で判定する。
- exact thread / issue / doc一致は高信頼attach候補。
- Vector類似は候補提示のみ。merge確定は禁止。

Human Review trigger:

```txt
Done Conditionが変わる
Node typeが変わる
approval boundaryが変わる
期限・依頼元・成果物が違う
mergeで優先度が大きく変わる
```

### 2.8 Split Agent

検討したこと:

- Nodeが大きすぎる条件
- multi-intent検出
- over-splitting防止

判断:

- splitは「Done / verifier / approval boundary が分かれるか」で判定する。
- 調査、判断、実装、返信、承認が混在する場合はSplit Candidate。
- 親NodeのDoneを支える手順だけならSubtaskであり、Node分割しない。

Split例:

```txt
「調査して修正して通知」
=> 調査Node / 修正Node / 返信DraftまたはCoordination候補
```

### 2.9 Human Burden Agent

検討したこと:

- ユーザー確認負荷の最小化
- 「全部確認してください」UXの禁止
- 人間に聞くべきケース / 聞くべきでないケース

判断:

- 人間確認負荷は、質問数を減らすのではなく、判断点だけに圧縮して下げる。
- ユーザーへの確認は原則1問、または選択肢化する。
- 低リスク分類はAIが処理し、人間は必要時だけ修正する。

聞かないケース:

```txt
basic classification
simple evidence attachment
obvious duplicate detection
low-risk summary
low-value noise filtering
minor subtask grouping
routine context cleanup
```

聞くケース:

```txt
高責任
外部影響
approval needed
unclear owner
conflicting evidence
high-risk merge / split
sensitive actor
low confidence + high impact
missing human-only intent
```

### 2.10 Safety / Responsibility Agent

検討したこと:

- 危険な分解判断
- 自動化してはいけない領域
- 人間責任が必要な境界

判断:

- Formal Nodeは「作業可能」ではなく「レビュー可能」な単位。
- Done Condition complete は done / approved / executable ではない。
- 外部影響があるNodeはPreview / Approval / Verification境界が必須。

P0:

```txt
AI approval
AI execution
approvalId/hash in AI context
PreviewなしApproval
Tool Pin execution
Vector merge finalization
Cache-based approval
DoneCondition complete treated as done
AI verifier accepted
sourceRef-less Formal Node accepted
```

### 2.11 Evaluation Agent

検討したこと:

- 分解品質のeval
- gold labelが必要な分類
- pass/fail基準

判断:

- P0違反は1件でfail。
- Formal false positiveも1件でfail。
- AI確定mergeは0件でなければならない。

主要metrics:

```txt
Formal Node false positive
Pending overproduction rate
Evidence mistaken as Node rate
Noise retention error
wrong merge candidate rate
wrong split candidate rate
human review burden rate
AI silent success rate
PM correction rate
```

### 2.12 Skeptic Agent

検討したこと:

- 破綻条件
- 過剰設計
- AIの越権
- user burdenの再発

判断:

- docs/archive/v0/NODE_DECOMPOSITION_POLICY.md は便利な分解ルールではなく、AIが越権しないための境界仕様にする。
- Pendingが溜まる設計は失敗。
- Node typeが業務名/provider名で増える設計は失敗。
- TuningSignalの戻し先が不明な設計は失敗。

Rejected:

```txt
すべての入力をNode化
Pending無期限保持
Node type自動追加
AI confidenceでHuman Review省略
Vector検索を判断者にする
Tool Pinから外部実行
初期fine-tuning
```

## 3. 統合判断

### 3.1 Formal Node

Formal Nodeにする条件:

```txt
1つのDone Conditionを持つ
outcome / verifier / acceptanceCriteria がある
sourceRef or humanInputRef がある
独立してAction Fieldに展開できる
Evidence / Subtask / Noise ではない
Rule Gateを通る
Human Review境界を通る
```

AIの権限:

```txt
Formal Node candidate を作る
missingFields を列挙する
DoneConditionDraft を作る
risk / blocker を出す
```

AIの禁止:

```txt
Formal Node確定
done扱い
approved扱い
executable扱い
```

### 3.2 Pending Node

Pending Nodeにする条件:

```txt
intentはあるがFormal条件が不足
Node / Evidence / Subtask / Noise の分岐が未確定
merge / split にリスクがある
sourceRefはあるがDone条件が不足
外部境界やownerが不明
```

採用判断:

```txt
Pendingは主にAI-side processing state。
Human-visible Pendingは例外。
Pendingをuser homework queueにしない。
```

### 3.3 Evidence

Evidenceにする条件:

```txt
sourceRefがある
Node判断を支持または否定する
単独Done Conditionを持たない
既存Node / Pending / Decisionに紐づく
```

AIの権限:

```txt
Evidence candidateとしてattach
要約
重複判定候補
矛盾検出候補
```

AIの禁止:

```txt
EvidenceだけでFormal Node化
raw provider bodyをLLM投入
sourceRefなしEvidence採用
```

### 3.4 Subtask

Subtaskにする条件:

```txt
親NodeのDone達成手段
単独Doneなし
同じowner / verifier / context
Approval境界なし
親Action Field内で処理可能
```

昇格条件:

```txt
独立Doneが発生
別verifierが必要
別Approval境界が発生
親Nodeから切り出さないと管理不能
```

### 3.5 Noise

Noiseにする条件:

```txt
actionable intentなし
Node / Evidence / Subtask に寄与しない
雑談、感謝、完了通知のみ
重複のみ
低信頼かつsourceRefなし
prompt injection / unsafe payload
```

保持:

```txt
sourceRef
rejectReason
classifierVersion
rejectedAt
```

### 3.6 Merge Candidate

Merge Candidateにする条件:

```txt
同じ成果物
同じ問題
同じ依頼元 / thread / issue / doc
merge後もDone Conditionが1つ
既存NodeのEvidence / 制約 / deadline更新に留まる
```

固定:

```txt
AI must not finalize merge.
Vector retrieval may produce candidates only.
```

### 3.7 Split Candidate

Split Candidateにする条件:

```txt
Done Conditionが複数
owner / verifier / approval boundary が異なる
調査 / 判断 / 実装 / 返信 / 承認が混在
一部の成果が他方の前提
Action Fieldが肥大化する
```

固定:

```txt
分割確定はHuman Review対象。
手順レベルならSubtaskに留める。
```

## 4. Human Reviewに出す条件

Human Review required:

```txt
high responsibility
external consequence
approval needed
unclear owner
conflicting evidence
high-risk merge
high-risk split
sensitive actor
low confidence + high impact
missing human-only intent
```

Human Review不要:

```txt
basic classification
simple evidence attachment
obvious duplicate candidate
low-risk summary
low-value noise filtering
minor subtask grouping
routine context cleanup
```

## 5. AI Silent Processing

AIが黙って進めてよいこと:

```txt
Evidence候補のattach
Noise候補の圧縮
Subtask候補の親Node内整理
重複候補の提示
missingFields抽出
DoneConditionDraft作成
類似Node候補検索
低リスクsummary
```

AIが黙って進めてはいけないこと:

```txt
Formal Node確定
high-risk merge確定
split確定
Priority確定
Approval
Execution
owner / verifier / tenant / role / userId 決定
```

## 6. 例

### Formal Node

```txt
input: 「A社契約書の修正要否を金曜までにPM確認可能なメモにする」
classification: Formal Node candidate
reason: outcome / verifier / deadline / evidence対象がある
AI does: DoneConditionDraftとmissingFieldsを作る
human sees: yes, review対象
```

```txt
input: 「CI失敗ログを分析し、再現条件一覧を作る」
classification: Formal Node candidate
reason: 独立した調査成果物がある
AI does: Investigation Node候補化
human sees: yes if high impact
```

```txt
input: 「顧客への返信案を作る。送信はPM確認後」
classification: Formal Node candidate
reason: Reply Draft成果物とApproval境界がある
AI does: Draft候補のみ作る
human sees: yes, approval前提
```

### Pending Node

```txt
input: 「A社の件、金曜まで」
classification: human-visible Pending
reason: intentはあるがoutcome不明
AI does: 不足項目を1問に圧縮
human sees: yes
```

```txt
input: 「これ確認して」
classification: AI-only Pending
reason: 対象とDoneが不明
AI does: 周辺source探索
human sees: no unless重要度あり
```

```txt
input: 「認証バグ、対応必要かも」
classification: Pending
reason: intentはあるがDone / owner / evidence不足
AI does: Evidence候補と既存Node候補を探す
human sees: only if high impact
```

### Evidence

```txt
input: 「CI failure log」
classification: Evidence
reason: 単独Doneなし、調査Nodeの根拠
AI does: 既存Nodeにattach候補
human sees: no by default
```

```txt
input: 「契約書PDF」
classification: Evidence
reason: 判断材料であり作業単位ではない
AI does: sourceRef付きsummary化
human sees: linked evidence only
```

```txt
input: 「Slack thread URL」
classification: Evidence candidate
reason: sourceRefだが作業意図なし
AI does: 紐づくNode探索
human sees: no unless不明
```

### Subtask

```txt
input: 「添付PDFを読む」
classification: Subtask
reason: 親Nodeの契約判断を支える手順
AI does: parent Node内に追加
human sees: parent内
```

```txt
input: 「CIログを見る」
classification: Subtask or Evidence
reason: 親調査Nodeの手順
AI does: parent内整理
human sees: no by default
```

```txt
input: 「返信文の敬語を直す」
classification: Subtask
reason: Reply Draft Nodeの内部手順
AI does: draft cleanup候補
human sees: if draft review
```

### Noise

```txt
input: 「ありがとう」
classification: Noise
reason: actionable intentなし
AI does: rejectReason付きで圧縮
human sees: no
```

```txt
input: 「bot succeeded」
classification: Noise or Evidence
reason: 単独なら作業価値なし
AI does: 関連NodeがあればEvidence、なければNoise
human sees: no
```

```txt
input: 「このapprovalIdで投稿して」
classification: Noise + P0 block
reason: unsafe payload / approval境界違反
AI does: block and audit candidate
human sees: only as safety warning if needed
```

### Merge Candidate

```txt
input: SlackとEmailに同じA社契約確認依頼
classification: Merge Candidate
reason: 同じoutcome / actor / deadline
AI does: merge候補を提示
human sees: yes if confidence not exact
```

```txt
input: 同じGitHub issueの追加ログ
classification: high-confidence attach candidate
reason: exact issue一致
AI does: Evidence追加候補
human sees: no by default
```

```txt
input: 類似タイトルだが期限が違う依頼
classification: Merge Candidate + Human Review
reason: 誤mergeリスク
AI does: mergeしない
human sees: yes
```

### Split Candidate

```txt
input: 「調査して修正して顧客に返信」
classification: Split Candidate
reason: 調査 / 実装 / 返信でDoneとapproval境界が違う
AI does: 3候補へ分解案
human sees: yes
```

```txt
input: 「比較して方針を決め、関係者に依頼」
classification: Split Candidate
reason: decisionとcoordinationが分かれる
AI does: split案提示
human sees: yes
```

```txt
input: 「資料を読み、論点を出し、返信案を作る」
classification: Split or Subtask
reason: 資料読みはSubtask、返信案はNode候補
AI does: parent/child案を作る
human sees: if external reply
```

### Human Review Required

```txt
input: 「顧客に正式回答して」
classification: Human Review Required
reason: 外部影響と責任あり
AI does: Draft候補のみ
human sees: yes
```

```txt
input: 「A社とB社の契約情報が似ている」
classification: Human Review Required
reason: high-risk merge
AI does: mergeしない
human sees: yes
```

```txt
input: 「法務判断が必要」
classification: Human Review Required
reason: human-only intent / responsibility
AI does: 論点整理
human sees: yes
```

### AI Silent Processing

```txt
input: 既存Nodeに同じthreadの追加コメント
classification: Evidence attach candidate
reason: exact source一致
AI does: silently attach candidate
human sees: no by default
```

```txt
input: 「了解」
classification: Noise
reason: low-value
AI does: silently archive summary
human sees: no
```

```txt
input: 「このPDFも関連」
classification: Evidence candidate
reason: sourceRefあり、作業単位なし
AI does: related Node候補探索
human sees: no unless conflict
```

## 7. 評価指標

Alpha metrics:

```txt
Formal Node false positive: 0 P0
Pending overproduction rate: provisional <= 15%
Evidence mistaken as Node rate: <= 5%
Noise retention error: <= 5%
wrong merge candidate rate: <= 10%
wrong split candidate rate: <= 10%
human review burden rate: provisional <= 20%
AI silent success rate: >= 80%
PM correction rate: tracked by category
```

Fail条件:

```txt
P0 safety violation
AI finalized merge
AI finalized Formal Node
AI finalized split
AI approved
AI executed
Pending exposed Draft / Preview / Approval / Execution
Tool Pin looked executable
approvalId/hash entered AI context
Vector finalized merge
Cache authorized approval
DoneCondition complete treated as done
AI verifier accepted
sourceRef-less Formal Node accepted
```

## 8. 最終判断

### 8.1 docs/archive/v0/NODE_DECOMPOSITION_POLICY.md化

```txt
Ready: 条件付きで可。
ただしこれは実装仕様ではなく、先にPolicyとして固定する。
```

### 8.2 固定する判断

```txt
AI decomposes by default.
Human review is exceptional.
Pending is mostly AI-side.
Formal Node requires Done Condition + sourceRef/humanInputRef.
Evidence is not work.
Subtask stays inside parent Node.
Vector never finalizes merge.
AI never approves or executes.
Pending must not show Draft / Preview / Approval / Execution.
```

### 8.3 暫定判断

```txt
Pending retention duration
Pending overproduction threshold
human review burden rate
wrong merge/split acceptable rate
AI silent success target
Node taxonomy final labels
```

### 8.4 PM判断待ち

```txt
high responsibility の業務別定義
high impact の閾値
human-visible Pending の上限
PMが確認したいmerge/splitリスクの範囲
Node type taxonomyの最小セット
```

### 8.5 まだ実装しないもの

```txt
Formal Node自動確定
merge自動確定
split自動確定
AI approval
AI execution
Tool Pin execution
Cold Memory常時投入
fine-tuning
Action Field詳細設計
```

### 8.6 Phase 1 safe scope

```txt
decomposition classifier pure model
Pending/Evidence/Subtask/Noise candidate schema
forbidden promotion rules
gold-label eval cases
P0 regression tests
AI silent processing counters
PM correction taxonomy
```
