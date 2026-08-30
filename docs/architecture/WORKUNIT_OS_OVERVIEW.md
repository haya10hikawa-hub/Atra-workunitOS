# WorkUnit OS 概要

## 0. プロジェクト名

**WorkUnit OS — AI-Powered Decision Engine**

## 1. 目的

WorkUnit OS は、情報過多とアプリケーション分断によって発生する知識労働者の判断負荷を下げるためのプロダクトである。

目的は単なるタスク管理ではない。  
`情報 -> 判断 -> 計画 -> 実行` の流れを、AIとユーザー編集権の組み合わせで再設計することにある。

## 2. 現行スコープ

現行プロダクトは、候補のみを扱い、人間がレビューするWorkUnit OSである。UIと権限境界の正本は、[Canonical Decision Index](../CANONICAL_DECISION_INDEX.md) と [Atra Doctrine](../ATRA_DOCTRINE.md) に置く。

旧Hopper/MVPロードマップ、n8n、ライブ提供元、ランキングの前提は [Hopper MVP Roadmap](../research/HOPPER_MVP_ROADMAP.md) に隔離する。これは歴史的な研究資料であり、現行機能の主張ではない。

## 3. UI 構成

WorkUnit OS のUIは、添付UI案を正とする。

- `WorkUnit Launcher` : WorkUnit検索、ROI、状態、Source / Urgency / Next Step確認
- `WorkUnit Graph` : Node関係、依存、作業流れの操作面
- `Action Field` : 選択Nodeに紐づく右側の作業面
- `Command Palette` : 移動とコマンド発見。外部実行はしない
- `Safety Protocol / Finalization Queue / System Logs` : 安全状態と監査状態

旧来の `Inbox / Tasks / Studio` 3カラム構造は採用しない。
Dashboard中心のUIも採用しない。

### 3A. Launcher の操作モデル

想定動作:

- `Search WorkUnits` からWorkUnitを検索する
- 各行には、Source、タイトル、説明、ROI、状態を出す
- 右側詳細には、Source、Urgency、Next Stepを出す
- `Enter` でWorkUnitを開く
- 開いたWorkUnitはWorkUnit Graphへ展開する

必要条件は、低遅延かつ連続して処理できること。  
タイムライン型の閲覧体験は避ける。

現在の提供元連携は、UIの前提ではなく、個別の安全ゲートで判断する。過去の入力経路案は [Hopper MVP Roadmap](../research/HOPPER_MVP_ROADMAP.md) に隔離する。

