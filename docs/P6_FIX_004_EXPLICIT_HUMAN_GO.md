# P6-FIX-004 Explicit Human Go

**Patch:** P6-FIX-004 — Shared Semantic ISO-8601 UTC Timestamp Guard(Phase 6 検証正確性 + 依存重複排除のみ)
**Tracking Issue:** #115([Phase 6][P2][Dependency] ISO_8601_UTC正規表現が4モジュールに重複し意味検証を欠く(2026-99-99が通過))
**Source audit:** P6-A0(docs/P6_A0_FABEL5_PHASE6_CROSS_LANE_AUDIT.md FINAL-1 = B-3 + D-1、docs/P6_A0_FABEL5_PATCH_SEQUENCE_PLAN.md Wave 3 / U1)
**Repository:** haya10hikawa-hub/Atra-workunitOS
**Base main:** cda3b8c381b92d48e47436145dfe8014112a0574(PR #126マージコミット)

本書はP6-FIX-004の永続的なhuman Go記録である。実装およびテスト編集前に作成される。

## Sign-off statements

- P6-FIX-004 has explicit human Go.
- **Issue #115 is the only remediation target** — 本パッチは意味検証付き共有ISO-8601 UTCタイムスタンプガードの単一化と4重複定義の置換のみを行う。
- **one shared semantic ISO UTC guard** — `app/lib/phase6/shared/isoUtcTimestamp.ts` に意味検証付き `isIsoUtcTimestamp` を1実装する。
- **four local definitions are replaced** — 次の4モジュールのローカル `ISO_8601_UTC` 正規表現を共有ガードへの委譲に置換する:
  - app/lib/phase6/artifacts/validation.ts(`isIsoTimestampString`)
  - app/lib/phase6/persistenceTargetDecision/validators.ts(`isIsoTimestamp`)
  - app/lib/phase6/persistenceAuditEvidence/validators.ts(`isIsoTimestamp`)
  - app/lib/phase6/recorderAuditSummary/validators.ts(`isIsoTimestamp`)
- **public validator APIs remain unchanged** — 既存の公開述語名(`isIsoTimestampString`・各 `isIsoTimestamp`)とシグネチャ `(value: unknown) => value is string` を維持する。index.ts の export を変更しない。呼び出し元に共有モジュールのimportを要求しない。
- **issue codes and result shapes remain unchanged** — issue code union・result shape・issue順序・非echoメッセージ形式を変更しない。
- **compatibility change is limited to rejecting previously accepted invalid calendar values** — 従来受理していた非実在暦日時(月13・2月30・時25等)が拒否されるようになる厳格化のみ。妥当なタイムスタンプは引き続き合格する。
- **no constructor changes** / **no fixture or harness changes**。
- **no runtime consumer** / **no persistence** / **no D1 or SQL** / **no Evidence Ledger append** / **no Graph Model write** / **no ApprovalStore integration** / **no StartHub runtime** / **no external action** / **no Formal WorkUnit promotion**。
- **timestamp semantic validity does not establish timestamp authenticity** — 意味的に妥当であることは、その時刻に出来事が起きたこと・信頼できるクロック由来であることを証明しない。
- **validator success remains non-authorizing** — Validation Success ≠ Authorization ≠ Persistence Permission ≠ Evidence Ledger Append ≠ Graph Model Write。`ok: true` is descriptive only。
- **#116 deny-list consolidation is not included** / **#121 consistency umbrella is not included** — これらは各自のパッチで扱う。
- 共有ガードは `new Date` / `Date.parse` / `Temporal` / locale / timezone変換 / 外部日付ライブラリ / JSON serialization / 正規化を使用せず、純パース + 整数範囲検査のみ。clock・randomness・I/O・環境アクセスを持たない leaf。
- migrations/・package.json・package-lock.json・.github/workflows/・UI・Electron・API routes・linkageモジュール・fixtures・harnesses・types.ts・constructors・既存P6-A0/P6-I5/P6-FIX-001..003文書・docs/ALPHA_EVIDENCE_LEDGER.md・docs/GRAPH_MODEL.md を変更しない。
- If forbidden paths change, stop immediately.

## Product invariant

AI proposes. Rules guard. Humans decide.
