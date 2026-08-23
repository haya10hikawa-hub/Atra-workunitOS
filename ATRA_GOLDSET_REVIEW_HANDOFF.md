# Atra Gold Set Platform — Design Handoff & Critical Risk Review

## 0. 目的

この文書は、Atra の Gold Set 作成基盤について、初見の開発者・研究者・AI Agent が以下を理解できる状態にするためのもの。

1. 何を作るのか
2. なぜこの設計なのか
3. どこが危ういのか
4. 何を検証すれば実装に進めるのか
5. どの条件を満たしたら「実現可能」と判断するのか

重要なのは設計を肯定することではない。**壊れる可能性を先に洗い出し、反証し、必要なら設計を変更し、重大な未解決リスクが残らない状態まで持っていくこと**を目的とする。

---

# 1. 何を作るのか

Atra は、GitHub / Google Docs / Jira / Meeting Transcript / Slack / Gmail などに分散した情報から、

> 「これらは同じ1つの仕事を指しているのか？」

を判定し、最終的に WorkUnit としてまとめることを目指している。

今回まず作るのは本体の自動 WorkUnit 生成ではなく、**その判定能力を正しく評価するための高品質な Gold Set 作成基盤**である。

```text
異種データ取得
    ↓
共通 SourceRecord 化
    ↓
長文 Chunk 化
    ↓
明示参照抽出
    ↓
意味検索
    ↓
再順位付け
    ↓
難例・逆例を含む候補生成
    ↓
人間2名が独立判定
    ↓
不一致を裁定
    ↓
Gold Set を version freeze
```

---

# 2. 絶対に分離する4層

## Evidence

外部に存在する元情報。GitHub Issue、PR、Review、Jira Issue、Google Docs、Meeting Transcript、Email、Slack messageなど。

元情報は不変。要約・翻訳・embedding・抽出結果で上書きしない。

## Retrieval

「何と何を比較する価値があるか」を探す。

```text
gte / embedding retrieval
    ↓
Ettin / cross-encoder reranking
```

Retrieval は候補生成だけを担当する。**関連度が高い = SAME_WORK ではない。**

## Human Gold Judgment

人間が最終的に以下を判定する。

```text
SAME_WORK
RELATED
DIFFERENT_WORK
UNKNOWN
```

別軸として Work Type:

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

## Evaluation

Frozen Gold Set に対して Atra のモデルを評価する。

Gold は評価専用。Gold label 自体や Gold 由来特徴を runtime の grouping 判断に流さない。

---

# 3. SAME_WORK の定義

単なる文章類似ではない。

中心的な問いは:

> **A と B は、同じ underlying work completion unit を指しているか？**

補助的な判断:

> A の underlying work を完了したとき、独立した追加作業なしに B も満たされたと考えられるか？

例:

```text
A: OAuth 500 の原因を調査する
B: OAuth 500 を修正する
```

対象は同じだが完了条件が違うため、原則 DIFFERENT_WORK または親子/依存関係候補。

---

# 4. Relation の意味

## SAME_WORK

同じ完了単位。

## RELATED

同じ Work に関係しているが、その情報自体は同じ完了単位ではない。会議、status確認、説明、review、decision contextなど。

## DIFFERENT_WORK

話題、担当者、Issue、時間、repository が近くても、独立して完了できる別仕事。

## UNKNOWN

証拠不足。推測しない。

---

# 5. Work Type と Relation を混同しない

以下は別問題。

```text
SAME_WORK / RELATED / DIFFERENT
```

と

```text
PROJECT / TASK / MILESTONE
```

と

```text
PART_OF / BLOCKS / DEPENDS_ON
```

例:

```text
OAuth刷新 PROJECT
└ #341 callback fix TASK
```

これは SAME_WORK ではなく、`relation = DIFFERENT_WORK` + `structure = PART_OF` になり得る。

---

# 6. Source は 1文書 = 1仕事ではない

長い Docs や会議には複数Workが混在する。

```text
1 SourceRecord
    ↓
N SourceChunks / WorkMentions
```

比較単位は `GitHub Issue ↔ Google Docs全文` ではなく、`GitHub Issue ↔ Google Docsの関連 passage` を基本とする。

---

# 7. 人間に全文を読ませない

人間には `Anchor + Candidate Evidence の短い passage` を表示する。

必要なら前後文脈を段階的に展開する。

例:

```text
Anchor
────────────────────
GitHub Issue #341
OAuth callback returns HTTP 500

Candidate Evidence
────────────────────
Google Docs
Specification Meeting 8/20
Lines 212–218

"...callback issue appears to be caused by
 the token refresh. Alex will submit a fix..."

Human Annotation
────────────────────
SAME_WORK
RELATED
DIFFERENT_WORK
UNKNOWN
```

---

# 8. MVPデータ

最優先:

- QMSum — long meetingからrelevant span検索を評価
- Public Jira Dataset — issue relation / hard negative候補
- OpenTelemetry GitHub — 実際のIssue / PR / Review / Comment
- OpenTelemetry Google Docs — 最初のGitHub↔Docs cross-provider Gold

後から:

- SmartSHARK
- AMI Meeting Corpus
- ECB+
- MAVEN-ERE

---

# 9. 候補生成

```text
Source
 ↓
明示Anchor
 ↓
gte retrieval
 ↓
Top 20-50
 ↓
Ettin reranking
 ↓
Top 3-8
 ↓
Candidate Sampler
```

候補生成理由は内部保存する。

```text
EXPLICIT_REFERENCE
SEMANTIC_HIGH
SEMANTIC_MEDIUM
SAME_WORKSPACE
SAME_TIME
SAME_PERSON
HARD_NEGATIVE
COUNTEREXAMPLE
RANDOM_CONTROL
MODEL_DISAGREEMENT
```

Annotatorには見せない。

---

# 10. 必ず入れる逆例

| 表面的シグナル | 普通の誤解 | 必須逆例 |
|---|---|---|
| Issue ID同じ | SAME | 同じIssueについて別成果物を作る |
| 意味が近い | SAME | 調査 vs 修正 |
| 人物同じ | SAME | 同じ担当者の別仕事 |
| 時間が近い | RELATED | 同時期の別仕事 |
| IDがない | DIFFERENT | 表現違いの同一Work |
| 日時が離れる | DIFFERENT | 長期間継続した同一Work |
| Project配下 | SAME | Project vs child Task |
| Meeting mention | SAME | 単なる会議・status確認 |
| 数値が近い | SAME | 30→60 と 30→45 |
| 同じtopic | SAME | 独立して完了可能な2 Task |

---

# 11. Annotation

最低2人が独立して判定。

```text
Annotator A
+
Annotator B
 ↓
一致?
├ YES → provisional Gold
└ NO  → adjudication
```

Annotator に見せない:

- gte score
- Ettin score
- model prediction
- candidate generation bucket
- expected label
- weak label
- 他Annotatorの回答

---

# 12. Gold Freeze

Gold version は immutable。

```text
atra-cross-provider-gold-v0.1
atra-cross-provider-gold-v0.2
```

修正は新version。Canonical formatはJSONL。

---

# 13. 現時点で危ういポイント

## RISK 1 — SAME_WORK の定義が人によってズレる

**Severity: CRITICAL**

`Investigate OAuth bug` と `Fix OAuth bug` を1 taskの工程と見るか、2 taskと見るかで割れる。

対策:
- Annotation Policy / Casebookを先に作る
- 50〜100個の境界ケース
- pilot annotation
- UNKNOWNを許容

Gate:
- disagreement pattern分析
- Casebook v1.0 freeze

## RISK 2 — Retrieval が見つけられないものは Gold に入らない

**Severity: CRITICAL**

現在のretrieverが見つけられる問題だけが評価setに入り、retrieval改善を正しく測れない。

対策:
- retrieval-generated stream
- structure-generated stream
- random/control stream
- small full-document audit

Gate:
- Candidate Recallを計測可能

## RISK 3 — Gold と Training のリーク

**Severity: CRITICAL**

Goldから学習したモデルをGoldで評価すると意味がない。

対策:
- `training_annotations` と `gold_annotations` を分離
- permission / dataset ID分離
- leakage test

Gate:
- automated leakage test

## RISK 4 — 既存dataset labelをAtra labelと誤同一視

**Severity: HIGH**

Jira `duplicate`、MAVEN coreference等はAtra Work identityと同義ではない。

対策:
- candidate-generation signalとして使う
- 直接Gold truthにしない
- datasetごとにmapping policyを作る

## RISK 5 — Chunkingで証拠が分断される

**Severity: HIGH**

Evidenceが複数箇所に散らばる場合がある。

対策:
- heading-aware chunking
- overlap
- multi-passage evidence
- context expansion UI

Gate:
- QMSumでspan recall測定

## RISK 6 — 明示IDに依存しすぎる

**Severity: HIGH**

`#341 ↔ #341`ばかりだと意味理解を評価できない。

対策:
- IDあり/なしでstratify
- no-ID SAMEを意図的に収集

## RISK 7 — RELATED と SAME の境界

**Severity: CRITICAL**

status / meeting / review / decision contextがSAMEに混ざりやすい。

対策:
- Source membership と context relation を分離
- CasebookにRELATED例を多く入れる

Gate:
- RELATEDのinter-annotator agreementを単独測定

## RISK 8 — Project / Task は文面だけでは決められない

**Severity: HIGH**

`決済機能を実装する` がProjectかTaskかは組織・Work graph依存。

対策:
- Work Typeをsecondary labelにする
- text-only estimate / graph-supported / UNKNOWNを検討

Gate:
- agreementが低ければMVP Gold中心から外せる

## RISK 9 — Gold候補分布を人工的に作りすぎる

**Severity: HIGH**

Hard negativeだらけだと実運用自然分布と異なる。

対策:

```text
Natural Distribution Set
Challenge Set
```

を分離。

## RISK 10 — Cross-providerの本当の正解が確定できない

**Severity: CRITICAL**

GitHubとDocsが似ていても第三者には同じ仕事か断定不能なケースがある。

対策:
- explicit cross-reference
- multiple independent clues
- reasonable inference
- insufficient → UNKNOWN

## RISK 11 — 公開OSSと実企業Workの分布差

**Severity: HIGH**

OSSは英語・Issue-centric。企業はSlack/Gmail/private Docs/暗黙参照/日本語が多い。

対策:
- 公開datasetはPhase 1
- 最終的にはconsented real-team evaluation set

## RISK 12 — 日本語・英語・混在言語

**Severity: HIGH**

英語寄りretrieverではcross-lingual recallが落ちる可能性。

対策:
- multilingual retriever benchmark
- translation-derived representation benchmark
- 原文保存
- ID/URL/数値保護

## RISK 13 — 人間annotation cost

**Severity: HIGH**

2人annotation + adjudicationは高コスト。

対策:
- passageのみ表示
- keyboard UI
- candidate自動生成
- full-document auditは小subset

Gate:
- pilot 100件でmedian time / adjudication / cost per 1000を測る

## RISK 14 — Pair判定だけではGroup整合性がない

**Severity: HIGH**

```text
A=B
B=C
A≠C
```

が起こり得る。

対策:
- Pair Gold後にGroup Gold
- group consistency evaluator

## RISK 15 — gte → Ettin が本当に必要か未検証

**Severity: MEDIUM**

複雑さとlatencyを増やすだけの可能性。

対策:

```text
BM25
gte only
gte → Ettin
multilingual retriever
```

を比較する。

---

# 14. 実装前Pilot

## Pilot A — Label Policy

100 pair。SAME/RELATED/DIFFERENT/UNKNOWNが人間間で一致するか。

## Pilot B — Passage Retrieval

QMSumでBM25 / gte / gte→Ettin比較。Relevant Passage Recallを見る。

## Pilot C — Cross-provider

OpenTelemetryのGitHub Issue/PR ↔ Google Docs passageを100〜300 pair。

測る:
- UNKNOWN率
- annotation time
- context expansion rate

## Pilot D — Counterexamples

最低100件。

- same ID / different work
- no ID / same work
- same topic / different work
- context-only
- parent/child
- contradictory requirements

---

# 15. 実現可能性Gate

## Gate 1 — Semantics

- Annotation Policy v1.0
- 境界ケースCasebook
- UNKNOWN利用条件

## Gate 2 — Retrieval

- Relevant Passage Recallを計測可能
- random/full-document auditあり

## Gate 3 — Cross-provider

- GitHub↔Docsで100件以上実annotate可能
- 全文を毎回読まず判定可能

## Gate 4 — Human Cost

- median annotation time
- adjudication rate
- cost per 1000を見積可能

## Gate 5 — Bias

provider / language / explicit ID / relation / candidate strategy / work type / similarity bandを可視化。

## Gate 6 — Leakage

Goldがtraining/runtimeから隔離。Automated leakage testsあり。

## Gate 7 — Baseline

BM25 / gte / gte→Ettin比較済み。

## Gate 8 — Dataset Split

```text
Natural Distribution Set
Challenge Set
Full-document Recall Audit
```

を分離。

---

# 16. 「実装可能」の定義

完全なリスクゼロではなく、次を満たすこと。

> **Critical risk に mitigation と検証方法があり、未解決Critical blockerが0件で、残るHigh/Medium riskが監視可能であること。**

停止条件:

```text
OPEN_CRITICAL_RISKS = 0
```

High riskは最低でも以下を持つ。

- owner
- mitigation
- measurement
- fallback

---

# 17. Reviewerに要求する成果物

1. 設計理解
2. Risk Register
3. Critical / High / Medium分類
4. 各Riskの具体的failure scenario
5. mitigation
6. validation experiment
7. fallback
8. 修正版architecture
9. MVP scope
10. 実装順
11. feasibility gates
12. 最終判定: GO / CONDITIONAL GO / NO-GO
13. GOでない場合、何を満たせばGOになるか

---

# 18. 最終原則

```text
人間が全文を探さない
AIがGold truthを決めない
類似度を同一性とみなさない
Goldを学習に漏らさない
難例を意図的に含める
自然分布も別に持つ
UNKNOWNを許す
PairとGroupを分ける
Project/TaskとIdentityを分ける
Evidenceは不変
```
