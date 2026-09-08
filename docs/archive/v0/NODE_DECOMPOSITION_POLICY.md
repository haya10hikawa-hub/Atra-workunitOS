# docs/archive/v0/NODE_DECOMPOSITION_POLICY.md

## 1. Purpose

この文書は、Atra / WorkUnit OS における Node 分解の判断基準を固定する。

対象は、散らばった情報を次のいずれかへ分類するPolicyである。

```txt
Formal Node
Pending Node
Evidence
Subtask
Noise
Merge Candidate
Split Candidate
Human Review Required
AI Silent Processing
```

この文書は実装仕様ではない。
UI詳細、Action Field詳細、LLM呼び出し、外部実行は扱わない。

## 2. Product Position

Atra は通知ツールではない。
Atra はタスク一覧ではない。
Atra はAIチャットではない。

Atra は、散らばった情報を作業単位へ分解し、判断材料を整理し、人間に必要な判断だけを残す作業OSである。

固定する立場:

```txt
AI decomposes by default.
Human review is exceptional.
Pending Node is mostly AI-side processing state.
Pending Node must not become user homework.
AI creates candidates.
Humans make final decisions.
```

## 3. Core Principles

```txt
Manage by Node.
Work through Action Field.
AI creates candidates.
Humans make final decisions.
```

固定原則:

- AIは分解を既定で行う。
- 人間確認は例外にする。
- Pending Nodeは原則AI側の処理状態にする。
- Pending Nodeをユーザーの宿題一覧にしない。
- Evidenceは作業ではない。
- Subtaskは親Node内の手順である。
- Vector検索は候補を出すだけで、mergeを確定しない。
- AIはFormal Node、merge、approval、executionを確定しない。

## 4. AI Role and Human Role

AIの役割:

```txt
分類候補を作る
Formal Node candidateを作る
DoneConditionDraftを作る
missingFieldsを抽出する
Evidence候補を紐づける
Subtask候補を親Node内に整理する
Noise候補を圧縮する
Merge / Split候補を提示する
risk flagsを出す
```

AIがしてはいけないこと:

```txt
Formal Node確定
done扱い
approved扱い
executable扱い
merge確定
split確定
Priority確定
owner / verifier / tenant / role / userId 決定
Approval
Execution
```

人間の役割:

```txt
責任判断
高リスクmerge / splitの確定
Done Conditionの承認
Approval
外部影響の最終確認
PM判断が必要な例外処理
```

## 5. Decomposition Targets

| Target | 意味 |
---|---|
| Formal Node | 独立した作業単位の候補 |
| Pending Node | 安全に分解しきれていない処理状態 |
| Evidence | Node判断を支える根拠 |
| Subtask | 親NodeのDone達成手順 |
| Noise | 作業価値も根拠価値もない情報 |
| Merge Candidate | 既存Nodeへ統合する候補 |
| Split Candidate | 複数Nodeへ分割する候補 |
| Human Review Required | 人間判断が必要な状態 |
| AI Silent Processing | AIが人間に見せず処理してよい低リスク処理 |

## 6. Formal Node Policy

定義:

Formal Nodeは、独立したDone Conditionを持ち、Action Fieldへ展開できる作業単位である。

条件:

```txt
one clear Done Condition
outcome
verifier
acceptanceCriteria
sourceRef or humanInputRef
independent Action Field expansion
not Evidence
not Subtask
not Noise
Rule Gate passed
Human Review boundary respected
```

AI may do:

```txt
Formal Node candidate作成
DoneConditionDraft作成
missingFields抽出
risk flags作成
blocker candidates作成
```

AI must not do:

```txt
Formal Node確定
done扱い
approved扱い
executable扱い
```

human visibility:

```txt
原則表示する。
ただし表示名はFormal NodeではなくFormal Node candidateとする。
```

promotion rule:

```txt
Done Condition、sourceRef、人間境界が揃い、Rule GateとHuman Reviewを通った場合のみFormal Nodeへ昇格できる。
```

demotion rule:

```txt
Done Conditionが不完全ならPending。
単独作業でなければEvidenceまたはSubtask。
作業価値がなければNoise。
```

## 7. Pending Node Policy

定義:

Pending Nodeは、AIがまだ安全に分解しきれていない処理状態である。
ユーザーのタスク一覧ではない。

Pendingの意味:

```txt
Formal Node conditions are incomplete.
The item is still being processed, clarified, attached, split, merged, or discarded.
```

種類:

```txt
missing-field Pending
branching Pending
boundary Pending
split Pending
low-trust Pending
```

条件:

```txt
intentはあるがFormal条件が不足
Node / Evidence / Subtask / Noise の分岐が未確定
merge / split にリスクがある
sourceRefはあるがDone条件が不足
外部境界やownerが不明
```

AI may do:

```txt
追加context探索
missingFields抽出
Evidence候補化
Noise候補化
Merge / Split候補化
確認質問の圧縮
```

AI must not do:

```txt
PendingをFormal扱いする
Draftを出す
Previewを出す
Approvalを出す
Executionを出す
```

human visibility:

```txt
原則非表示。
表示するのは、高影響または人間意図が必要で、1つの明確な質問で解決できる場合のみ。
```

promotion rule:

```txt
outcome / verifier / acceptanceCriteria / sourceRef が揃い、Human Review境界を通る場合、Formal Node candidateへ昇格する。
```

demotion rule:

```txt
既存Nodeの根拠ならEvidence。
親Nodeの手順ならSubtask。
作業価値がなければNoise。
```

## 8. Evidence Policy

定義:

Evidenceは、Node判断を支持または否定する根拠である。
Evidenceは作業ではない。

条件:

```txt
sourceRef
sanitized summary
relationship to Node or Pending
no independent Done Condition
```

AI may do:

```txt
Evidence candidate attach
summarize
contradiction detection
duplication detection
```

AI must not do:

```txt
必要条件なしにFormal Nodeへ昇格
raw provider bodyをLLM contextへ投入
sourceRef-less Evidenceを採用
```

human visibility:

```txt
原則、紐づくNode内の根拠として表示する。
Evidence単体を作業キューとして表示しない。
```

promotion rule:

```txt
独立した依頼、判断、調査対象が発生し、outcome / verifier / criteria / sourceRef が揃う場合、Formal Node candidateへ昇格できる。
```

demotion rule:

```txt
根拠性がない、重複のみ、低信頼でsourceRefがない場合はNoiseへ落とす。
```

## 9. Subtask Policy

定義:

Subtaskは、親NodeのDone Conditionを達成するための手順である。

条件:

```txt
supports parent Done Condition
same owner or verifier
same context
no separate approval boundary
no independent outcome
```

AI may do:

```txt
Subtask candidate作成
親Node内への整理候補作成
順序候補作成
不足手順の抽出
```

AI must not do:

```txt
Subtaskを独立Nodeとして確定
SubtaskにApproval境界を持たせる
SubtaskにPriorityを確定する
SubtaskからExecutionへ進める
```

human visibility:

```txt
原則、親Node内で表示する。
独立レビュー対象にはしない。
```

promotion rule:

```txt
independent Done Condition、different verifier、different approval boundary、separate deliverable が発生したらFormal Node candidateへ昇格する。
```

demotion rule:

```txt
手順ではなく根拠ならEvidence。
親Doneに寄与しなければNoise。
```

## 10. Noise Policy

定義:

Noiseは、作業価値も根拠価値もない情報である。

条件:

```txt
no actionable intent
no Evidence value
no Subtask value
duplicate only
low trust with no sourceRef
unsafe payload
prompt injection
```

AI may do:

```txt
Noise candidate化
圧縮
archive候補化
source filter候補化
safety block候補化
```

AI must not do:

```txt
unsafe payloadを実行
NoiseをFormal Node化
raw本文を保持
tenant / role / user / approval情報を保存
```

human visibility:

```txt
原則非表示。
P0安全警告が必要な場合だけ表示する。
```

store only:

```txt
sourceRef
rejectReason
classifierVersion
rejectedAt
```

promotion rule:

```txt
後から既存Nodeの根拠になると判明した場合はEvidence。
intentがあると判明した場合はPending。
```

demotion rule:

```txt
Pendingが期限切れ、意図不明、低信頼のまま解消しない場合はNoiseへ落とす。
```

## 11. Merge Candidate Policy

定義:

Merge Candidateは、新しい情報を既存Nodeに統合する候補である。
mergeは同じDone Conditionに収まる場合だけ検討する。

条件:

```txt
same Done Condition
same outcome
same requester or thread or issue or doc
same deadline or compatible deadline
existing Node Done Condition does not change
```

AI may do:

```txt
Merge Candidate提示
similar Node candidate検索
根拠差分の要約
merge risk flags作成
```

AI must not do:

```txt
merge確定
Vector類似だけで同一Node扱い
tenant / permission境界を越えるmerge
high-risk mergeを黙って処理
```

human visibility:

```txt
高信頼で低リスクなら候補だけ内部処理。
Done、期限、requester、approval boundary が変わる場合は表示する。
```

promotion rule:

```txt
Human Reviewで承認された場合のみmergeできる。
exact source一致で低リスクの場合も、確定ではなくattach candidateに留める。
```

demotion rule:

```txt
同じDone Conditionに収まらない場合は新規Formal Node candidateまたはSplit Candidateへ戻す。
```

Human Review required:

```txt
Done Condition changes
Node type changes
approval boundary changes
deadline changes
requester changes
deliverable changes
priority changes significantly
```

## 12. Split Candidate Policy

定義:

Split Candidateは、1つの入力またはNodeが複数の作業単位に分かれる候補である。
splitは Done / verifier / approval boundary が分かれるかで判定する。

条件:

```txt
multiple Done Conditions
multiple owners
multiple verifiers
multiple approval boundaries
research + implementation + reply mixed
Action Field would become too large
```

AI may do:

```txt
Split Candidate提示
分割案作成
親子関係候補作成
Subtaskへのdemotion候補作成
```

AI must not do:

```txt
split確定
分割後のFormal Node確定
over-splitting
Approval境界の自動決定
```

human visibility:

```txt
原則表示する。
ただし明らかに親Node内の手順ならSubtask候補として内部処理できる。
```

promotion rule:

```txt
Human Reviewで承認された場合のみ、分割後のNode candidateへ進める。
```

demotion rule:

```txt
親NodeのDone達成手順に過ぎない場合はSubtaskへ落とす。
```

## 13. Human Review Policy

定義:

Human Review Requiredは、人間の責任判断が必要な状態である。
人間確認は例外であり、分解作業そのものを人間に戻してはいけない。

Human Review required:

```txt
high responsibility
high impact
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

Human Review not required:

```txt
basic classification
simple Evidence attachment
obvious duplicate candidate
low-risk summary
low-value Noise filtering
minor Subtask grouping
routine context cleanup
```

AI may do:

```txt
判断材料の整理
選択肢の圧縮
推奨理由の提示
リスクの提示
1つの確認質問への圧縮
```

AI must not do:

```txt
人間判断の代替
責任者の決定
approval decision
external consequenceの確定
```

human visibility:

```txt
必ず表示する。
ただし質問は最小化し、判断点だけに圧縮する。
```

promotion rule:

```txt
人間が承認した場合のみ、対象のNode / merge / split / approval境界へ進める。
```

demotion rule:

```txt
人間判断が不要と判明した場合は、AI Silent ProcessingまたはPending内処理へ戻す。
```

## 14. AI Silent Processing Policy

定義:

AI Silent Processingは、人間に見せずにAIが進めてよい低リスク処理である。
これは最終決定ではなく、整理・候補化・圧縮に限る。

AI may silently process:

```txt
Evidence candidate attach
Noise compression
Subtask grouping
missingFields extraction
DoneConditionDraft creation
similar Node candidate search
low-risk summary
```

AI must not silently process:

```txt
Formal Node finalization
high-risk merge finalization
split finalization
Priority finalization
Approval
Execution
owner / verifier / tenant / role / userId decision
```

human visibility:

```txt
原則非表示。
ただし高影響、矛盾、外部影響、安全境界に触れた時点でHuman Reviewへ上げる。
```

promotion rule:

```txt
低リスク処理が高影響または責任判断に変わった場合、Human Review Requiredへ昇格する。
```

demotion rule:

```txt
作業価値がない場合はNoiseへ落とす。
根拠だけならEvidenceへ落とす。
```

## 15. Promotion / Demotion Rules

```txt
Pending -> Formal Node candidate:
  Done Condition / sourceRef / verifier / acceptanceCriteria が揃う

Pending -> Evidence:
  作業単位ではなく既存Nodeの根拠だと判明

Pending -> Subtask:
  親NodeのDone達成手順だと判明

Pending -> Noise:
  intentなし、期限切れ、低信頼、根拠性なし

Evidence -> Formal Node candidate:
  独立した依頼、判断、調査対象が発生

Evidence -> Noise:
  根拠性が失われた

Subtask -> Formal Node candidate:
  独立Done、別verifier、別approval boundary、別deliverableが発生

Subtask -> Evidence:
  手順ではなく根拠資料だった

Noise -> Evidence:
  後から既存Nodeの根拠になると判明

Noise -> Pending:
  intentがあるが情報不足だったと判明

Merge Candidate -> merged:
  Human Reviewで承認

Split Candidate -> Node candidates:
  Human Reviewで承認
```

## 16. Examples

### Formal Node

| input | classification | reason | AI action | human visibility |
---|---|---|---|---|
| A社契約書の修正要否を金曜までにPM確認可能なメモにする | Formal Node candidate | outcome / verifier / deadline / evidence対象がある | DoneConditionDraftとmissingFieldsを作る | yes |
| CI失敗ログを分析し、再現条件一覧を作る | Formal Node candidate | 独立した調査成果物がある | Investigation候補化 | high impactならyes |
| 顧客への返信案を作る。送信はPM確認後 | Formal Node candidate | Reply Draft成果物とApproval境界がある | 編集可能Draft候補のみ作る | yes |

### Pending Node

| input | classification | reason | AI action | human visibility |
---|---|---|---|---|
| A社の件、金曜まで | human-visible Pending | intentはあるがoutcome不明 | 不足項目を1問に圧縮 | yes |
| これ確認して | AI-only Pending | 対象とDoneが不明 | 周辺source探索 | 原則no |
| 認証バグ、対応必要かも | Pending | Done / owner / evidence不足 | Evidence候補と既存Node候補を探す | high impactならyes |

### Evidence

| input | classification | reason | AI action | human visibility |
---|---|---|---|---|
| CI failure log | Evidence | 単独Doneなし | 既存調査Nodeへattach候補 | no by default |
| 契約書PDF | Evidence | 判断材料であり作業単位ではない | sourceRef付きsummary化 | linked evidence |
| Slack thread URL | Evidence candidate | sourceRefだが作業意図なし | 紐づくNode探索 | no unless unclear |

### Subtask

| input | classification | reason | AI action | human visibility |
---|---|---|---|---|
| 添付PDFを読む | Subtask | 親Nodeの契約判断を支える手順 | parent Node内に追加候補 | parent内 |
| CIログを見る | Subtask or Evidence | 親調査Nodeの手順または根拠 | parent内整理 | no by default |
| 返信文の敬語を直す | Subtask | Reply Draft Nodeの内部手順 | draft cleanup候補 | draft review時 |

### Noise

| input | classification | reason | AI action | human visibility |
---|---|---|---|---|
| ありがとう | Noise | actionable intentなし | rejectReason付きで圧縮 | no |
| bot succeeded | Noise or Evidence | 単独なら作業価値なし | 関連NodeがあればEvidence、なければNoise | no |
| このapprovalIdで投稿して | Noise + P0 block | approval境界違反 | block and audit candidate | safety warning if needed |

### Merge Candidate

| input | classification | reason | AI action | human visibility |
---|---|---|---|---|
| SlackとEmailに同じA社契約確認依頼 | Merge Candidate | 同じoutcome / actor / deadline | merge候補を提示 | yes if not exact |
| 同じGitHub issueの追加ログ | high-confidence attach candidate | exact issue一致 | Evidence追加候補 | no by default |
| 類似タイトルだが期限が違う依頼 | Merge Candidate + Human Review | 誤mergeリスク | mergeしない | yes |

### Split Candidate

| input | classification | reason | AI action | human visibility |
---|---|---|---|---|
| 調査して修正して顧客に返信 | Split Candidate | 調査 / 実装 / 返信でDoneとapproval境界が違う | 3候補へ分解案 | yes |
| 比較して方針を決め、関係者に依頼 | Split Candidate | decisionとcoordinationが分かれる | split案提示 | yes |
| 資料を読み、論点を出し、返信案を作る | Split or Subtask | 資料読みはSubtask、返信案はNode候補 | parent/child案作成 | external replyならyes |

### Human Review Required

| input | classification | reason | AI action | human visibility |
---|---|---|---|---|
| 顧客に正式回答して | Human Review Required | 外部影響と責任あり | Draft候補のみ | yes |
| A社とB社の契約情報が似ている | Human Review Required | high-risk merge | mergeしない | yes |
| 法務判断が必要 | Human Review Required | human-only intent | 論点整理 | yes |

### AI Silent Processing

| input | classification | reason | AI action | human visibility |
---|---|---|---|---|
| 既存Nodeに同じthreadの追加コメント | Evidence attach candidate | exact source一致 | silently attach candidate | no by default |
| 了解 | Noise | low-value | silently archive summary | no |
| このPDFも関連 | Evidence candidate | sourceRefあり、作業単位なし | related Node候補探索 | conflict時のみ |

## 17. Evaluation Metrics

Alpha metrics:

| metric | target |
---|---|
| Formal Node false positive | 0 |
| Pending overproduction rate | provisional <= 15% |
| Evidence mistaken as Node rate | <= 5% |
| Noise retention error | <= 5% |
| wrong merge candidate rate | provisional <= 10% |
| wrong split candidate rate | provisional <= 10% |
| human review burden rate | provisional <= 20% |
| AI silent success rate | provisional >= 80% |
| PM correction rate | tracked by category |

PM correction categories:

```txt
wrong Formal Node
wrong Pending
wrong Evidence
wrong Subtask
wrong Noise
wrong Merge Candidate
wrong Split Candidate
unnecessary Human Review
missed Human Review
```

## 18. P0 Fail Conditions

以下は即時fail。

```txt
AI finalized Formal Node
AI finalized merge
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

P0は学習で解決しない。
Rule、block、regression testへ戻す。

## 19. Fixed Decisions

```txt
AI decomposes by default.
Human review is exceptional.
Pending is mostly AI-side.
Formal Node requires Done Condition.
Formal Node requires sourceRef or humanInputRef.
Evidence is not work.
Subtask stays inside parent Node.
Noise can be compressed or archived.
Vector never finalizes merge.
AI never finalizes Formal Node.
AI never approves.
AI never executes.
Pending must not show Draft / Preview / Approval / Execution.
Tool Pin is not execution.
```

## 20. Provisional Decisions

```txt
Pending retention duration
Pending overproduction threshold
human review burden rate
wrong merge/split acceptable rate
AI silent success target
Node taxonomy final labels
```

## 21. PM Decisions Required

```txt
definition of high responsibility
definition of high impact
when human-visible Pending is allowed
which merge/split risks PM wants to see
minimum Node taxonomy
acceptable PM correction rate
```

## 22. Not Implemented Yet

```txt
Formal Node auto-finalization
merge auto-finalization
split auto-finalization
AI approval
AI execution
Tool Pin execution
Cold Memory always-on injection
fine-tuning
Action Field detailed behavior
```

## 23. Phase 1 Safe Scope

Phase 1で許可する範囲:

```txt
pure decomposition classifier model
candidate schemas
forbidden promotion rules
gold-label eval cases
P0 regression tests
AI silent processing counters
PM correction taxonomy
```

Phase 1で許可しない範囲:

```txt
external execution
approval automation
Formal Node finalization
merge finalization
split finalization
Action Field detailed behavior
LLM live calls
fine-tuning
```

Final Judgment:

```txt
Ready to become docs/archive/v0/NODE_DECOMPOSITION_POLICY.md: yes

Fixed decisions:
  Section 19を固定する。

Provisional decisions:
  Section 20をalpha計測で調整する。

PM decisions required:
  Section 21をPMが決めるまで実装に進めない。

Not implemented yet:
  Section 22は未実装のまま維持する。

Phase 1 safe scope:
  Section 23に限定する。
```
