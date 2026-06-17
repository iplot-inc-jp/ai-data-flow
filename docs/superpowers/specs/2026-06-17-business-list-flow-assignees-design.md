# 業務一覧（担当者＝複数ステークホルダー × ASIS × 対応TOBE/GAP）設計

作成日: 2026-06-17 / ブランチ: feat/methodology-pipeline / 承認済み

## 目的
ステークホルダーで設定した人を「業務の担当者」として業務フローに紐づけ、ASIS 業務を起点に
**担当者・ASIS業務フロー名・対応するTOBE・GAP** を1つの一覧で俯瞰できるサイドメニュー
「業務一覧」を新設する。担当者は **1業務に複数人**紐づけられる。

## 確定事項（AskUserQuestion）
- **担当者の紐付け = 業務フローに新規・多対多**。単一FKではなく join モデル（`MeetingStakeholder` と同型）。1フローに複数担当者。ASIS/TOBE 両方が担当者を持てる（一覧は ASIS 起点）。
- **一覧上で担当者を割当・変更できる**（複数選択）。`EditGate` で閲覧専用ユーザーは不可。
- **TOBE/GAP は「件数＋展開」**。セルに対応TOBE名/GAP件数、行を展開すると TOBE名一覧・GAP（説明/優先度）を表示し各ページへリンク。
- **サイドバー配置 = 現状把握グループ**（ASIS管理／業務イメージボード／業務定義シート の並び）。
- **集約エンドポイントは作らない** — 一覧は既存3エンドポイントをフロントで結合。
- DB は `prisma db push`（additive）。

---

## 1. データモデル（additive・新1モデル）

```prisma
// 業務フローの担当者（ステークホルダー多対多）。MeetingStakeholder と同型。
model FlowStakeholder {
  id           String   @id @default(uuid())
  flowId       String   @map("flow_id")
  stakeholderId String  @map("stakeholder_id")
  order        Int      @default(0)
  createdAt    DateTime @default(now()) @map("created_at")

  flow        BusinessFlow @relation(fields: [flowId], references: [id], onDelete: Cascade)
  stakeholder Stakeholder  @relation(fields: [stakeholderId], references: [id], onDelete: Cascade)

  @@unique([flowId, stakeholderId])
  @@index([flowId])
  @@index([stakeholderId])
  @@map("flow_stakeholders")
}
```
- `BusinessFlow` に `assignees FlowStakeholder[]` を追加。
- `Stakeholder` に `flowAssignments FlowStakeholder[]` を追加。
- 純 additive（新テーブル＋逆リレーション）→ 本番 build の plain `prisma db push` で作成。

## 2. バックエンド

### 2-1. 担当者の replace-all セッター
`SetMeetingStakeholdersUseCase` と同型の薄い実装。
- `PUT /api/business-flows/:flowId/stakeholders`、body `{ stakeholderIds: string[] }`。
- 認可: flow→projectId をロードして `assertProjectAccess(edit)`（業務フロー系の既存作法）。
- 各 stakeholderId が **同一プロジェクトの Stakeholder** か検証（クロステナント/誤紐付け防止。`Stakeholder.projectId` 一致）。不正は 400/404。
- `$transaction` で `flowStakeholder.deleteMany({ flowId })` → `createMany`（order は配列順）。
- 返却 = 更新後の `assignees`（後述の整形）。

### 2-2. 業務フローレスポンスに担当者を含める
業務フローの toResponse（`business-flows/:id` 単体・`project/:projectId/all` 一覧・tree）に
`assignees: { stakeholderId: string; name: string; order: number }[]` を追加。
- `assignees` は `FlowStakeholder` を `include: { stakeholder: { select: { id, name } } }` で読み、order 昇順。
- 既存フィールドは不変（additive）。`project/:projectId/all` は既に `asisFlowId` を返す（FlowSummary）。

> 既存の単体更新（PATCH/PUT business-flows/:id）は担当者を扱わない（担当者は専用セッターのみ）。
> これにより「業務フロー本体の保存」と「担当者の付け替え」を分離して衝突を避ける。

## 3. フロント

### 3-1. データ結合（クライアント側・新規 lib `lib/business-list.ts`）
3つの既存エンドポイントを取得して ASIS 起点に組み立てる純関数 `buildBusinessList(flows, gaps)`:
- `GET /api/business-flows/project/:projectId/all` → 全フロー（ASIS+TOBE、`asisFlowId`、`assignees`）。
- `GET /api/projects/:projectId/gap-items` → GAP（`asisFlowId`/`tobeFlowId`・`gapDescription`・`priority`・`status`）。
- `GET /api/projects/:projectId/stakeholders` → 担当者割当の候補（id/name）。

`buildBusinessList` は **純関数（vitest 対象）**：
- 行 = `kind === 'ASIS'` のフロー。
- 各行: `{ asis: {id,name,assignees[]}, tobes: Flow[]（asisFlowId === asis.id の TOBE）, gaps: GapItem[]（asisFlowId === asis.id）}`。
- TOBE件数・GAP件数を算出。担当者0件・TOBE0件・GAP0件も保持（空表示）。

### 3-2. ページ `/dashboard/projects/[projectId]/business-list`
- サイドバー「現状把握」に `{ name:'業務一覧', href:…/business-list, icon: ListChecks }`。
- テーブル（`useTableSort` + `SortableTh`、既存共有）:
  | 担当者 | ASIS業務フロー名 | 対応TOBE | GAP |
  - **担当者**: 割当済みステークホルダーを**チップ表示**。編集はチェックボックス付きポップオーバー（プロジェクトの Stakeholder 一覧から複数選択）→ `PUT business-flows/:flowId/stakeholders { stakeholderIds }` → 楽観更新（返却 assignees をローカル反映、失敗時のみ再取得）。`EditGate` で閲覧専用は不可。
  - **ASIS業務フロー名**: `…/flows/:asisId` へリンク。
  - **対応TOBE**: 件数バッジ。行展開で TOBE 名一覧＋各 `…/flows/:tobeId` リンク。
  - **GAP**: 件数バッジ。行展開で GAP（説明・優先度バッジ）＋ `…/gap-items` リンク。
  - 担当者ソートキー＝先頭担当者名（order 昇順の1人目。無割当は末尾）。昇順→降順→解除。
- 行展開は per-row のローカル開閉状態（TOBE/GAP 詳細）。
- 空状態: ASIS フローが無ければ「ASIS管理でフローを作成」導線。

## 4. 検証
- backend: `prisma validate`→`db push`、`nest build`、jest（セッターの replace-all・プロジェクト整合検証・toResponse の assignees 解決の単体）。
- frontend: tsc 0、vitest（`buildBusinessList` 純関数：ASIS起点グルーピング・TOBE/GAP対応付け・空ケース）、next build。
- ライブ smoke: 担当者 PUT→assignees 反映、業務一覧の3エンドポイント結合、未割当/0件表示、`EditGate`。

## 5. スコープ外（YAGNI）
- TOBE 側を起点にした一覧（v1 は ASIS 起点のみ）。
- 担当者のロール/RACI 区別（v1 は「担当者」フラットな多対多。RACI は既存の StakeholderSubProject 側）。
- 集約専用バックエンドエンドポイント（フロント結合で足りる）。
- 担当者の並び替えUI（order は配列順で保持。明示的な並べ替えUIは後追い可）。

## リスク
- `project/:projectId/all` のレスポンスに `assignees` を足すため、同レスポンスを使う他箇所（サイドバーの FlowTree 等）への影響は無い（additive キー追加のみ・既存キー不変）。
- 担当者セッターのクロスプロジェクト Stakeholder 検証を入れないと別プロジェクトの人を紐づけられる（→ projectId 一致を必須化）。
