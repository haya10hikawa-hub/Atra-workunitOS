# Prompt: Atra Gold Set 設計を実装可能になるまで批判・修正してください

あなたは **ML Researcher / Data Annotation System Architect / Information Retrieval Engineer / Product Systems Reviewer** の4役を兼ねるレビュー担当です。

以下の資料を読んでください。

- `ATRA_GOLDSET_REVIEW_HANDOFF.md`
- 既存の `docs/DESIGN.md`
- 既存の `AGENTS.md`
- Gold Set / correlation / SourceRecord / WorkUnit に関係する既存設計
- 実装済みコードがある場合はそのコード

目的は、設計を褒めることではありません。

**この設計が本当に壊れないかを徹底的に疑い、重大な懸念を1つずつ潰し、実装に入ってよい状態まで設計を更新してください。**

---

## 前提

Atraで最終的に知りたいのは、

> 「異なるProvider・異なる文章・異なる表現の証拠が、同じunderlying Work completion unitを指しているか」

です。

Primary relation:

```text
SAME_WORK
RELATED
DIFFERENT_WORK
UNKNOWN
```

Work Type:

```text
INITIATIVE
PROJECT
TASK
SUBTASK
MILESTONE
NOT_WORK
UNKNOWN
```

構造関係:

```text
PART_OF
BLOCKS
DEPENDS_ON
SUPERSEDES
DELIVERS
NONE
UNKNOWN
```

これらを混同しないでください。

Gold Setは **evaluation-only** です。Gold label、Gold由来特徴、adjudicated answerを retrieval / reranking / runtime grouping / model inputへ漏らしてはいけません。

---

# STEP 1 — 設計を再構築する

まず現在の設計を以下の観点から短く再構築してください。

- Goal
- Inputs
- Source model
- Chunk model
- Candidate generation
- Retrieval
- Reranking
- Annotation
- Adjudication
- Gold freeze
- Evaluation
- Work Type
- Group-level extension

誤解がある状態で批判を始めないでください。

---

# STEP 2 — Failure-first Review

「どうすれば成功するか」より先に、**どういう現実データでこの設計が壊れるか**を考えてください。

最低限レビューする項目:

### Semantics

- SAME_WORK定義は再現可能か
- RELATEDとの境界
- Project/Taskの相対性
- parent-child
- investigation vs fix
- review vs implementation
- status message
- meeting/context
- superseded requirements

### Retrieval

- secondary mentionの見落とし
- long document
- distributed evidence
- multilingual
- no explicit ID
- misleading explicit ID
- candidate recall
- retrieval-generated evaluation bias

### Data

- QMSum
- Public Jira
- OpenTelemetry GitHub ↔ Google Docs
- SmartSHARK
- AMI
- ECB+
- MAVEN-ERE

各datasetについて:

- Atraの問題を代表するか
- label mappingは妥当か
- domain shiftは何か
- leakageはないか

### Annotation

- 短いpassageだけで判定できるか
- 追加contextが必要な割合
- annotation time
- disagreement
- adjudication
- UNKNOWN率
- annotator bias

### Evaluation

- Gold distribution
- natural prevalence
- challenge set
- full-document recall audit
- false merge
- calibration
- group consistency

### Engineering

- PostgreSQL/pgvector構成
- source/chunk/candidate/gold schema
- idempotent ingestion
- provenance
- versioning
- reproducibility
- model caching
- reranking cost
- privacy/licensing

---

# STEP 3 — Risk Registerを作る

必ず以下の表で出してください。

| ID | Severity | Risk | Concrete Failure Example | Why it matters | Mitigation | Validation | Fallback | Status |
|---|---|---|---|---|---|---|---|---|

Severity:

```text
CRITICAL
HIGH
MEDIUM
LOW
```

抽象論だけでなく、実際の入力例を入れてください。

---

# STEP 4 — Critical Riskを1つずつ潰す

各CRITICAL Riskについて:

1. なぜ発生するか
2. 必要な設計変更
3. 変更による新しい副作用
4. 検証experiment
5. fallback

を書いてください。

変更後、**もう一度設計全体をRed Teamしてください。**

---

# STEP 5 — 再レビューを繰り返す

1回で終えないでください。

```text
Design vN
  ↓
Find critical weakness
  ↓
Modify design
  ↓
Find new weakness caused by modification
  ↓
Modify again
  ↓
Re-evaluate
```

停止条件:

```text
OPEN_CRITICAL_RISKS = 0
```

さらに残るHIGH riskすべてに:

- owner
- mitigation
- measurable signal
- fallback

があること。

「たぶん大丈夫」は停止条件ではありません。

---

# STEP 6 — 不要な複雑さを疑う

最低でも以下を比較してください。

```text
BM25
gte only
gte → Ettin
multilingual retriever
```

問い:

- Ettinは本当に必要か
- gteは日本語/日英混在で十分か
- Cross-Encoderのコストに見合う改善があるか

モデル構成を前提にしないでください。

---

# STEP 7 — Gold Setの偏りを検証する

最低でも以下を別setとして評価してください。

```text
A. Natural Distribution Set
B. Challenge / Hard Case Set
C. Full-document Recall Audit Set
```

1つのbalanced datasetだけで全評価を済ませないでください。

---

# STEP 8 — 人間コストを数値化する

Pilot最低100件を想定し、以下を測る設計にしてください。

```text
median annotation time
P90 annotation time
agreement rate
adjudication rate
UNKNOWN rate
context expansion rate
cost per 1,000 items
```

実データがない場合は推測で成功判定しないでください。必要な計測計画を出してください。

---

# STEP 9 — 実装可能なArchitectureへ落とす

最終Architectureは最低限以下を含むこと。

```text
Data ingestion
SourceRecord
Chunking
Explicit references
Embedding retrieval
Reranking
Candidate sampling
Blind dual annotation
Adjudication
Gold version freeze
Gold export
Evaluation
```

それぞれについて:

- input
- output
- owner
- persistence
- failure handling
- test

を定義してください。

---

# STEP 10 — MVPを削る

「あると良い」ではなく、**Gold Set仮説を検証する最低限**まで削ってください。

優先候補:

```text
QMSum
Public Jira
OpenTelemetry GitHub
OpenTelemetry Google Docs
```

SmartSHARK / AMI / ECB+ / MAVEN-ERE がMVPに本当に必要か再評価してください。

---

# STEP 11 — Feasibility Gatesを定義する

最低限:

### Semantic Gate
SAME / RELATED / DIFFERENT / UNKNOWN のpolicyが安定。

### Retrieval Gate
relevant passage recallが測れる。

### Cross-provider Gate
GitHub ↔ Docsを人間が実際に判定できる。

### Human Cost Gate
annotation costを推定可能。

### Bias Gate
candidate distributionを監視できる。

### Leakage Gate
Goldが完全隔離。

### Baseline Gate
BM25 / gte / gte→Ettin比較済み。

### Group Gate
pairwise矛盾を検知可能。

---

# 最終回答フォーマット

## 1. Executive Verdict

```text
GO
CONDITIONAL GO
NO-GO
```

## 2. 最終Architecture

図付き。

## 3. 変更された重要設計

Before / After。

## 4. Final Risk Register

CRITICALが0であることを明示。

## 5. Remaining HIGH Risks

各項目に:

```text
Owner
Metric
Mitigation
Fallback
```

## 6. MVP Scope

「今作るもの」と「今作らないもの」。

## 7. Pilot Plan

100件 → 300件 → 1000件のように段階化。

## 8. Experiments

各仮説に対するexperiment。

## 9. Definition of Done

実装完了ではなく、**設計仮説が検証された条件**。

## 10. Implementation Plan

dependency順。

## 11. 最終質問

> この設計を失敗させる現実的なscenarioが、まだ未対策で残っているか？

YESならレビューを終了せず、Risk Registerへ戻ってください。

NOで、かつ `OPEN_CRITICAL_RISKS = 0` の場合のみ実装可能と判定してください。

---

# レビュー姿勢

禁止:

- 設計を前提として肯定する
- 「一般的には良い設計」で終える
- 抽象的なリスクだけ挙げる
- モデルスコアが高ければ成功とする
- Goldの偏りを無視する
- annotation costを無視する
- UNKNOWNを失敗扱いする
- Project/TaskとSAME_WORKを混同する

要求:

- 具体例
- 反例
- failure scenario
- measurable validation
- fallback
- stop condition

**目的は設計を守ることではなく、壊しても成立する設計にすることです。**
