# 方法論ツリー（イシュー/Why/対象分割/打ち手/調査）設計 — 改訂版

- 日付: 2026-06-09（改訂）
- ブランチ: feat/methodology-pipeline
- 状態: 設計合意済み（実装着手）。本書は初版「型廃止・3種別統合」を**全面上書き**。

## 背景

教材 `~/iplot-hp/shanai_kyoiku/イシューツリー/編集用/03_ツリーパターン早見表.md` では用途別に複数のツリー型が定義されているが、イシューツリー/Whyツリー/調査ツリーの関係が混在している。これを整理し、ツールで「型をテンプレ選択 + ノード種別は混在可・強制しない」形で扱えるようにする。あわせて現状の作成エラーを解消する。

## ツリーパターン（作成時に選ぶテンプレ）

1. **イシューツリー（論点・調査）** — 課題→**論点(疑問形)** にMECE分解（**論点はサブ論点・サブサブ論点へ再帰分解可**）→各論点に**仮説**→各仮説に**検証(アクション)**→末端に**検証結果(○×△＋結果メモ)**。発散→収束で結論。（教材の「論点ツリー＝調査ツリー＋仮説検証」を統合）
2. **Whyツリー（原因究明）** — 課題→なぜ?(CAUSE 再帰)→根本原因。○×△検証。
3. **Whatツリー（対象分割）** — 対象→構成要素(ELEMENT 再帰)。単純（仕掛けなし）。
4. **Howツリー（打ち手・発散）** — 課題→解決候補(OPTION 再帰)。採用/保留/不採用。
5. **MECEアクションツリー（打ち手・網羅）** — ゴール→「ために」→行動(ACTION 再帰)。タスク化。
6. **KPIツリー** — KPI→構成KPI(METRIC 再帰)。数値。

- すべて「開始テンプレ」。**ノード種別は混在可・配置は強制しない**（種別は後から変更可）。
- **GAP起点で How / MECEアクション を直接作成可**（＝なぜ無しで打ち手から）。GapItem.issueTreeId リンク維持。

## ノード種別（kind）と仕掛け

既存 `IssueNodeKind`(ISSUE/CAUSE/COUNTERMEASURE) を拡張:
- `ISSUE` 課題/ゴール/対象（汎用ルート） / `POINT` 論点(疑問形・再帰) / `HYPOTHESIS` 仮説 / `VERIFICATION` 検証アクション / `RESULT` 検証結果
- `CAUSE` 原因(なぜ・再帰。○確定で根本原因扱い)
- `ELEMENT` 構成要素(What) / `OPTION` 解決候補(How) / `ACTION` 行動(MECE) / `METRIC` KPI
- 互換: 既存 `COUNTERMEASURE` は残置（OPTION相当として表示）。
- 仕掛け（種別連動・強制しない）:
  - `CAUSE`/`POINT`/`HYPOTHESIS`/`VERIFICATION`/`RESULT` → ○CONFIRMED/×REJECTED/△UNKNOWN/要ヒアリング の `verification` ＋ 根拠/結果メモ(evidence)
  - `OPTION`/`COUNTERMEASURE` → `recommendation` 採用/保留/不採用
  - `ACTION` → タスク化(Task.issueNodeId)
  - `METRIC` → 数値(metadata 値)
  - 種別ごとに色分け（ISSUE/POINT=ネイビー系、CAUSE=アンバー、OPTION/ACTION=エメラルド、HYPOTHESIS=紫、VERIFICATION/RESULT=シアン、ELEMENT=グレー、METRIC=青）

## 種別連動ガイド（強制しない）

選択ノードの kind に応じた追加ボタン:
- イシュー(ISSUE)→「論点を追加」(POINT) /（任意で他種別も）
- 論点(POINT)→「サブ論点を追加」(POINT 再帰) / 「仮説を追加」(HYPOTHESIS)
- 仮説(HYPOTHESIS)→「検証を追加」(VERIFICATION)
- 検証(VERIFICATION)→「検証結果を追加」(RESULT, ○×△)
- Why: ISSUE→「なぜ?」(CAUSE)→さらに「なぜ?」(CAUSE 再帰)
- What: 「構成要素を追加」(ELEMENT 再帰)
- How: 「打ち手候補を追加」(OPTION 再帰)
- MECE: 「『ために』で行動を追加」(ACTION 再帰)
- KPI: 「子KPIを追加」(METRIC 再帰)
- どのノードも種別を後から変更可。配置の強制バリデーションはしない。

## 発散→収束（イシューツリー）

- 発散: 課題→論点(再帰)→仮説→検証。
- 収束: 検証結果(RESULT, ○×△＋結果)が上位の論点へロールアップ表示 → 最初の課題(イシュー)に結論が組み上がる。論点ノードは配下の RESULT を集約した判定を表示（○が揃う/×がある等）。ルートに「結論」テキスト。
- 同一ツリー内（1本）で発散も収束も完結（ユーザー選択）。

## データモデル（要 db push）

- `IssueNodeKind` enum を上記 kind に拡張（既存値は残置）。
- `IssueTree` に `pattern` 列追加（ISSUE_POINT/WHY/WHAT/HOW/MECE_ACTION/KPI）。旧 `type`(WHY/SOLUTION) は互換残置・UI から外す。
- `RESULT`/`METRIC` の値は既存 `verification`/`evidence`/`metadata` で表現（新規列は最小限）。
- 既存ツリーは壊さず（kind 既定 + 表示で吸収）。

## 作成フロー（型→パターン）

作成ダイアログ: **パターン選択(6)** + ツリー名 + ルートの問い(任意) + GAP起点(任意)。作成時に**パターン対応の kind でルートノードを自動生成**（現状の作成エラーを解消）。

## 影響範囲

- backend: schema(IssueNodeKind/IssueTree.pattern)、create-issue-tree(pattern + ルート自動生成 + エラー除去)、issue-node create/update(既に kind/verification/recommendation 対応)。DTO enum 拡張。
- frontend: `issue-trees/page.tsx`(パターン picker)、`issue-trees/[treeId]/page.tsx`(KIND/PATTERN config 駆動の guided add・色・○×△/採用/数値/タスク化・種別変更・再帰論点・発散収束ロールアップ)、lib。

## 段階実装

- **Ph1（今回）**: schema 全 kind/pattern 追加 + backend + 作成パターン picker + イシューツリー(論点→仮説→検証→結果→収束, 再帰論点) + Whyツリー を完全実装。What/How/MECE/KPI は作成・追加・基本仕掛けまで（config 駆動なので同時に動く）。
- 以降: What/How/MECE/KPI の磨き込み、AI(発想アシスト/Claude)候補生成。

## 検証

- backend tsc 0 / frontend tsc 0 / vitest 維持。
- ライブ smoke: 各パターンで作成 201（ルート自動生成）、論点→サブ論点→仮説→検証→結果(○×△)追加、Why の CAUSE 追加、How の OPTION+採用、種別変更、いずれも per-node API 200。既存ツリーが開ける。
