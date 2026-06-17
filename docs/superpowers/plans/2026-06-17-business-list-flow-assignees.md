# 業務一覧（担当者=複数ステークホルダー × ASIS × 対応TOBE/GAP）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ステークホルダーを業務フローの担当者として多対多で紐づけ、ASIS起点で「担当者・ASIS業務フロー名・対応TOBE・GAP」を一覧できる「業務一覧」ページを追加する。

**Architecture:** join モデル `FlowStakeholder`（`MeetingStakeholder` 同型・additive）。担当者の設定は BusinessFlowController に薄い直 prisma セッター `PUT business-flows/:flowId/stakeholders`、業務フローレスポンスに `assignees` を prisma 直問い合わせで合流。一覧は新規集約エンドポイントを作らず、既存3エンドポイント（flows-all / gap-items / stakeholders）をフロントの純関数 `buildBusinessList` で結合。

**Tech Stack:** NestJS + Prisma（backend, jest）/ Next.js 14 App Router + React（frontend, vitest）。

> 注意: 本ブランチは並行セッションが同時編集中。各タスク開始時に対象ファイルの該当箇所を **Read で再確認**してから編集すること（特に layout.tsx の現状把握グループ・schema.prisma・business-flow.controller.ts）。

---

### Task 1: スキーマ — FlowStakeholder モデル ＋ 逆リレーション ＋ db push

**Files:**
- Modify: `backend/prisma/schema.prisma`（BusinessFlow / Stakeholder の relations に1行ずつ追加 ＋ 末尾に新モデル）

- [ ] **Step 1: BusinessFlow に逆リレーションを追加**

`model BusinessFlow { ... }` の relations 群（`kpisTobe Kpi[] @relation("KpiTobeFlow")` の直後あたり）に追加:
```prisma
  // この業務フローの担当者（ステークホルダー多対多）
  assignees           FlowStakeholder[]
```

- [ ] **Step 2: Stakeholder に逆リレーションを追加**

`model Stakeholder { ... }` の relations 群（`adoptionStatuses AdoptionStatus[]` の直後）に追加:
```prisma
  flowAssignments       FlowStakeholder[]
```

- [ ] **Step 3: 新モデルを末尾に追加**

```prisma
// 業務フローの担当者（ステークホルダー多対多）。MeetingStakeholder と同型。
model FlowStakeholder {
  id            String   @id @default(uuid())
  flowId        String   @map("flow_id")
  stakeholderId String   @map("stakeholder_id")
  order         Int      @default(0)
  createdAt     DateTime @default(now()) @map("created_at")

  flow        BusinessFlow @relation(fields: [flowId], references: [id], onDelete: Cascade)
  stakeholder Stakeholder  @relation(fields: [stakeholderId], references: [id], onDelete: Cascade)

  @@unique([flowId, stakeholderId])
  @@index([flowId])
  @@index([stakeholderId])
  @@map("flow_stakeholders")
}
```

- [ ] **Step 4: validate ＋ db push**

Run: `cd backend && npx prisma validate && npx prisma db push`
Expected: `The schema ... is valid 🚀` ＋ `Your database is now in sync`（additive・新テーブル作成）

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(db): FlowStakeholder（業務フロー担当者 多対多, additive）"
```

---

### Task 2: バックエンド — 担当者セッター `PUT business-flows/:flowId/stakeholders`（薄い直 prisma）

**Files:**
- Modify: `backend/src/presentation/controllers/business-flow.controller.ts`（DTO追加 ＋ ルート追加 ＋ private ヘルパ追加）

`BusinessFlowController` は constructor が重い（repo複数＋prisma＋各use-case）ため新 use-case は作らず、コントローラ内で `this.prisma` と既存 `assertFlowMembership(flowId,userId,'edit')` を使う（同コントローラが edges/annotations で既に取る方式）。

- [ ] **Step 1: 必要な import を確認・追加**

ファイル冒頭の import に以下が含まれているか Read で確認し、無ければ追加:
- `@nestjs/common` から `Put, Body, Param, HttpCode, HttpStatus, BadRequestException`
- `@nestjs/swagger` から `ApiOperation, ApiProperty, ApiParam`
- `class-validator` から `IsArray, IsString`
- `../decorators/current-user.decorator` から `CurrentUser, CurrentUserPayload`

- [ ] **Step 2: DTO を追加**（他の DTO クラス定義の近く、コントローラ class の上）

```typescript
class SetFlowStakeholdersDto {
  @ApiProperty({ description: '担当者(ステークホルダー)IDの配列（置き換え）', type: [String] })
  @IsArray()
  @IsString({ each: true })
  stakeholderIds: string[];
}
```

- [ ] **Step 3: ルート ＋ ヘルパを `BusinessFlowController` クラス内に追加**

```typescript
  @Put(':flowId/stakeholders')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '業務フローの担当者(ステークホルダー)を設定（置き替え）' })
  @ApiParam({ name: 'flowId', description: '業務フローID' })
  async setStakeholders(
    @CurrentUser() user: CurrentUserPayload,
    @Param('flowId') flowId: string,
    @Body() dto: SetFlowStakeholdersDto,
  ) {
    // flow→projectId をロードして edit 認可（クロステナント含め assertFlowMembership が担保）。
    const flow = await this.assertFlowMembership(flowId, user.id, 'edit');
    const uniqueIds = Array.from(new Set(dto.stakeholderIds ?? []));
    // 同一プロジェクトの Stakeholder のみ許可（誤紐付け/クロステナント防止）。
    if (uniqueIds.length > 0) {
      const found = await this.prisma.stakeholder.findMany({
        where: { id: { in: uniqueIds }, projectId: flow.projectId },
        select: { id: true },
      });
      if (found.length !== uniqueIds.length) {
        throw new BadRequestException('担当者に無効なステークホルダーが含まれています');
      }
    }
    await this.prisma.$transaction([
      this.prisma.flowStakeholder.deleteMany({ where: { flowId } }),
      ...(uniqueIds.length > 0
        ? [
            this.prisma.flowStakeholder.createMany({
              data: uniqueIds.map((stakeholderId, i) => ({ flowId, stakeholderId, order: i })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
    return { assignees: await this.loadFlowAssignees(flowId) };
  }

  /** 業務フローの担当者一覧（order 昇順, name 解決済み）。 */
  private async loadFlowAssignees(flowId: string) {
    const rows = await this.prisma.flowStakeholder.findMany({
      where: { flowId },
      include: { stakeholder: { select: { id: true, name: true } } },
      orderBy: { order: 'asc' },
    });
    return rows.map((r) => ({
      stakeholderId: r.stakeholderId,
      name: r.stakeholder.name,
      order: r.order,
    }));
  }
```

- [ ] **Step 4: ビルド**

Run: `cd backend && npx nest build`
Expected: 成功（出力なし）。型エラーがあれば import 不足を解消。

- [ ] **Step 5: Commit**

```bash
git add backend/src/presentation/controllers/business-flow.controller.ts
git commit -m "feat(api): PUT business-flows/:flowId/stakeholders（担当者 replace-all・プロジェクト整合検証）"
```

---

### Task 3: バックエンド — 業務フローレスポンスに `assignees` を合流（getById / getAllFlows）

**Files:**
- Modify: `backend/src/presentation/controllers/business-flow.controller.ts`（既存2エンドポイントに合流）

- [ ] **Step 1: `getAllFlows` に assignees を合流**

`getAllFlows` を以下に置き換える（プロジェクト内 FlowStakeholder を1クエリで取得→flowId でグループ→各 toResponse にマージ）:
```typescript
  @Get('project/:projectId/all')
  @ApiOperation({ summary: 'プロジェクトの全フロー一覧を取得（階層含む）' })
  async getAllFlows(@Param('projectId') projectId: string) {
    const flows = await this.flowRepository.findByProjectId(projectId);
    const rows = await this.prisma.flowStakeholder.findMany({
      where: { flow: { projectId } },
      include: { stakeholder: { select: { id: true, name: true } } },
      orderBy: { order: 'asc' },
    });
    const byFlow = new Map<string, { stakeholderId: string; name: string; order: number }[]>();
    for (const r of rows) {
      const arr = byFlow.get(r.flowId) ?? [];
      arr.push({ stakeholderId: r.stakeholderId, name: r.stakeholder.name, order: r.order });
      byFlow.set(r.flowId, arr);
    }
    return flows.map((f) => ({ ...this.toResponse(f), assignees: byFlow.get(f.id) ?? [] }));
  }
```

- [ ] **Step 2: `getById` の返却オブジェクトに assignees を追加**

`getById` の最後の `return { ...this.toResponse(flow), nodes: ..., edges: ..., children: ..., breadcrumbs }` の直前に:
```typescript
    const assignees = await this.loadFlowAssignees(id);
```
を追加し、return オブジェクトに `assignees,` を1行加える（`breadcrumbs,` の隣など）。

- [ ] **Step 3: ビルド ＋ ライブ smoke**

Run: `cd backend && npx nest build`
Expected: 成功。

ローカルバックエンド（:5021）が起動していれば smoke（demo ログイン→プロジェクト→ASISフロー作成→PUT stakeholders→GET all/単体に assignees 反映→別プロジェクトのstakeholderId は 400）。起動していなければ Task 6 の最終 smoke にまとめる。

- [ ] **Step 4: Commit**

```bash
git add backend/src/presentation/controllers/business-flow.controller.ts
git commit -m "feat(api): 業務フローレスポンスに assignees（担当者）を合流"
```

---

### Task 4: フロント — `lib/business-list.ts`（型 ＋ フェッチャ ＋ 純関数 buildBusinessList）＋ vitest

**Files:**
- Create: `frontend/src/lib/business-list.ts`
- Create: `frontend/src/lib/business-list.test.ts`

- [ ] **Step 1: 失敗するテストを書く**（`frontend/src/lib/business-list.test.ts`）

```typescript
import { describe, it, expect } from 'vitest';
import { buildBusinessList, type BusinessFlowItem, type GapItem } from './business-list';

const flows: BusinessFlowItem[] = [
  { id: 'asis1', name: '受注ASIS', kind: 'ASIS', assignees: [{ stakeholderId: 's1', name: '田中', order: 0 }] },
  { id: 'asis2', name: '出荷ASIS', kind: 'ASIS', assignees: [] },
  { id: 'tobe1', name: '受注TOBE', kind: 'TOBE', asisFlowId: 'asis1' },
  { id: 'tobe2', name: '受注TOBE2', kind: 'TOBE', asisFlowId: 'asis1' },
  { id: 'tobeX', name: '孤立TOBE', kind: 'TOBE', asisFlowId: null },
];
const gaps: GapItem[] = [
  { id: 'g1', asisFlowId: 'asis1', gapDescription: '手作業', priority: 'HIGH' },
  { id: 'g2', asisFlowId: 'asis1', gapDescription: '二重入力', priority: 'MEDIUM' },
  { id: 'g3', asisFlowId: null, gapDescription: '未紐付け' },
];

describe('buildBusinessList', () => {
  it('ASIS 起点で行を作り、対応TOBE/GAP を asisFlowId で対応付ける', () => {
    const rows = buildBusinessList(flows, gaps);
    expect(rows.map((r) => r.asis.id)).toEqual(['asis1', 'asis2']);
    const r1 = rows[0];
    expect(r1.tobes.map((t) => t.id)).toEqual(['tobe1', 'tobe2']);
    expect(r1.gaps.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(r1.asis.assignees?.[0]?.name).toBe('田中');
  });

  it('対応が無い ASIS は空配列を持つ', () => {
    const rows = buildBusinessList(flows, gaps);
    expect(rows[1].tobes).toEqual([]);
    expect(rows[1].gaps).toEqual([]);
  });

  it('asisFlowId を持たない TOBE/GAP はどの行にも入らない', () => {
    const rows = buildBusinessList(flows, gaps);
    const allTobeIds = rows.flatMap((r) => r.tobes.map((t) => t.id));
    const allGapIds = rows.flatMap((r) => r.gaps.map((g) => g.id));
    expect(allTobeIds).not.toContain('tobeX');
    expect(allGapIds).not.toContain('g3');
  });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `cd frontend && npx vitest run src/lib/business-list.test.ts`
Expected: FAIL（`business-list` から import 不可）

- [ ] **Step 3: 実装を書く**（`frontend/src/lib/business-list.ts`）

```typescript
// 業務一覧: ステークホルダー担当者 × ASIS業務フロー × 対応TOBE/GAP。
// 集約エンドポイントは作らず、既存3エンドポイントをフロントで結合する。
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

export type FlowAssignee = { stakeholderId: string; name: string; order: number };

export type BusinessFlowItem = {
  id: string;
  name: string;
  kind: 'ASIS' | 'TOBE';
  asisFlowId?: string | null;
  subProjectId?: string | null;
  assignees?: FlowAssignee[];
};

export type GapItem = {
  id: string;
  asisFlowId?: string | null;
  tobeFlowId?: string | null;
  gapDescription?: string | null;
  priority?: string | null;
  status?: string | null;
};

export type BusinessListRow = {
  asis: BusinessFlowItem;
  tobes: BusinessFlowItem[];
  gaps: GapItem[];
};

/** 純関数: ASIS 起点に TOBE/GAP を asisFlowId で対応付ける。 */
export function buildBusinessList(
  flows: BusinessFlowItem[],
  gaps: GapItem[],
): BusinessListRow[] {
  const tobesByAsis = new Map<string, BusinessFlowItem[]>();
  for (const f of flows) {
    if (f.kind === 'TOBE' && f.asisFlowId) {
      const arr = tobesByAsis.get(f.asisFlowId) ?? [];
      arr.push(f);
      tobesByAsis.set(f.asisFlowId, arr);
    }
  }
  const gapsByAsis = new Map<string, GapItem[]>();
  for (const g of gaps) {
    if (g.asisFlowId) {
      const arr = gapsByAsis.get(g.asisFlowId) ?? [];
      arr.push(g);
      gapsByAsis.set(g.asisFlowId, arr);
    }
  }
  return flows
    .filter((f) => f.kind === 'ASIS')
    .map((asis) => ({
      asis,
      tobes: tobesByAsis.get(asis.id) ?? [],
      gaps: gapsByAsis.get(asis.id) ?? [],
    }));
}

export async function listProjectFlows(projectId: string): Promise<BusinessFlowItem[]> {
  const res = await fetch(`${API_URL}/api/business-flows/project/${projectId}/all`, { headers: headers() });
  if (!res.ok) throw new Error('業務フローの取得に失敗しました');
  return res.json();
}

export async function listGapItemsRaw(projectId: string): Promise<GapItem[]> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/gap-items`, { headers: headers() });
  if (!res.ok) throw new Error('GAPの取得に失敗しました');
  return res.json();
}

export async function setFlowStakeholders(
  flowId: string,
  stakeholderIds: string[],
): Promise<{ assignees: FlowAssignee[] }> {
  const res = await fetch(`${API_URL}/api/business-flows/${flowId}/stakeholders`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ stakeholderIds }),
  });
  if (!res.ok) throw new Error('担当者の保存に失敗しました');
  return res.json();
}
```

> NOTE: `GET /api/projects/:projectId/gap-items` のレスポンスのフィールド名（`gapDescription`/`priority`/`status`/`asisFlowId`）は既存 gap-items ページの取得処理で確認すること。差異があれば `GapItem` 型を実レスポンスに合わせる（型のみ調整、ロジック不変）。

- [ ] **Step 4: テストが通ることを確認**

Run: `cd frontend && npx vitest run src/lib/business-list.test.ts`
Expected: PASS（3件）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/business-list.ts frontend/src/lib/business-list.test.ts
git commit -m "feat(web): business-list lib（buildBusinessList 純関数＋フェッチャ）＋ vitest"
```

---

### Task 5: フロント — 業務一覧ページ ＋ サイドバー「現状把握」追加

**Files:**
- Create: `frontend/src/app/(dashboard)/dashboard/projects/[projectId]/business-list/page.tsx`
- Modify: `frontend/src/app/(dashboard)/layout.tsx`（現状把握グループに項目追加 ＋ `ListChecks` import）

- [ ] **Step 1: ページを作成**

`business-list/page.tsx`。要件:
- `'use client'`、`useParams` で `projectId`、`useReadOnly()` で `canEdit`。
- マウント時に `Promise.all([listProjectFlows, listGapItemsRaw, listStakeholders])` を取得（`listStakeholders` は `@/lib/stakeholders`）。
- `buildBusinessList(flows, gaps)` で行を作る。`stakeholders`（id/name）は担当者ピッカー候補。
- テーブル（`useTableSort` + `SortableTh`、import: `@/lib/use-table-sort` / `@/components/ui/sortable-th`）。accessor:
  - `assignee`: `(r) => r.asis.assignees?.[0]?.name ?? '￿'`（無割当を末尾に）
  - `name`: `(r) => r.asis.name`
  - `tobeCount`: `(r) => r.tobes.length`
  - `gapCount`: `(r) => r.gaps.length`
- 列: 担当者 / ASIS業務フロー名 / 対応TOBE / GAP。
- **担当者セル**: 割当済みをチップ表示（×で外す）＋「選択」ボタンでポップオーバー（プロジェクト stakeholders のチェックボックス一覧）。`meeting-report-board.tsx`(L426-516) の chips＋popover＋`toggleStakeholder` 楽観更新パターンをミラー。保存は `setFlowStakeholders(asis.id, nextIds)`、楽観更新（失敗時は再取得）。`EditGate`（`@/components/edit-gate`）で囲み、閲覧専用は不可。
- **ASIS業務フロー名**: `Link` → `/dashboard/projects/${projectId}/flows/${r.asis.id}`。
- **対応TOBE**: 件数バッジ。per-row 開閉（`openTobe` ローカル Set）で TOBE 名一覧＋各 `…/flows/:tobeId` リンク。0件は「—」。
- **GAP**: 件数バッジ。per-row 開閉（`openGap` Set）で GAP（`gapDescription` ＋ priority バッジ）＋ `…/gap-items` リンク。0件は「—」。
- `PageHeader`（`@/components/ui/page-header`）title「業務一覧」、description「ステークホルダーの担当者を業務に紐づけ、ASIS起点で対応するTOBE・GAPを一覧します。」、`backHref`=`/dashboard/projects/${projectId}`。
- loading / error / 空状態（ASISフロー0件→「ASIS管理でフローを作成」リンク）。

担当者トグルの参考実装（ミラー）:
```typescript
const toggleAssignee = async (row: BusinessListRow, stakeholderId: string) => {
  const cur = (row.asis.assignees ?? []).map((a) => a.stakeholderId);
  const nextIds = cur.includes(stakeholderId)
    ? cur.filter((x) => x !== stakeholderId)
    : [...cur, stakeholderId];
  // 楽観更新
  setRows((prev) =>
    prev.map((r) =>
      r.asis.id === row.asis.id
        ? { ...r, asis: { ...r.asis, assignees: nextIds.map((id, i) => ({ stakeholderId: id, name: stakeholderById.get(id)?.name ?? '', order: i })) } }
        : r,
    ),
  );
  try {
    const { assignees } = await setFlowStakeholders(row.asis.id, nextIds);
    setRows((prev) => prev.map((r) => (r.asis.id === row.asis.id ? { ...r, asis: { ...r.asis, assignees } } : r)));
  } catch {
    await reload();
  }
};
```

- [ ] **Step 2: サイドバーに項目追加**（`layout.tsx`）

まず現状把握グループの現在の内容を Read で確認（並行編集のため）。`{ label: '現状把握', items: [...] }` の items に追加:
```typescript
{ name: '業務一覧', href: `${base}/business-list`, icon: ListChecks },
```
配置は「ASIS管理」「業務イメージボード」の後・「業務定義シート」の前後どちらでも可。
lucide-react の import に `ListChecks` が無ければ追加する。

- [ ] **Step 3: 型チェック ＋ ビルド**

Run: `cd frontend && npx tsc --noEmit`
Expected: エラー0

Run: `cd frontend && rm -rf .next && npx next build`
Expected: 成功（`/dashboard/projects/[projectId]/business-list` がコンパイルされる）

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/(dashboard)/dashboard/projects/[projectId]/business-list/page.tsx" "frontend/src/app/(dashboard)/layout.tsx"
git commit -m "feat(web): 業務一覧ページ（担当者チップ編集/対応TOBE・GAP展開）＋サイドバー現状把握に追加"
```

---

### Task 6: 検証（全体）＋ ライブ smoke

**Files:** なし（検証のみ）

- [ ] **Step 1: backend 全体検証**

Run: `cd backend && npx nest build && npx jest`
Expected: build 成功 ＋ jest 全 PASS（本機能で backend 単体テストは追加しない＝重い constructor のため。ロジックは frontend 純関数テスト＋ライブ smoke で担保）。

- [ ] **Step 2: frontend 全体検証**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npx next build`
Expected: tsc 0 / vitest 全 PASS（buildBusinessList 含む）/ next build 成功。

- [ ] **Step 3: ライブ smoke**（ローカル :5021 backend / :3007 frontend、demo@iplot.local/password123）

```
- demo ログイン→ project→ ASISフロー作成。
- PUT /api/business-flows/:flowId/stakeholders { stakeholderIds:[既存stakeholder] } → 200・assignees 反映。
- 別プロジェクトの stakeholderId を渡す → 400。
- GET /api/business-flows/project/:projectId/all → 該当フローに assignees 配列。
- /dashboard/projects/:id/business-list 200・担当者チップ表示・TOBE/GAP 件数＋展開・担当者付替え（楽観）。
```

- [ ] **Step 4: 最終確認**

`git status` clean・`git rev-parse --abbrev-ref HEAD` が feat/methodology-pipeline であることを確認。push/デプロイはユーザー指示時のみ。

---

## Self-Review 結果（spec 突合）
- 担当者=複数（多対多 FlowStakeholder）✅ Task1。replace-all セッター＋プロジェクト整合 ✅ Task2。レスポンス assignees ✅ Task3。
- フロント結合（集約なし）＋ buildBusinessList 純関数 ✅ Task4。担当者チップ複数選択編集・TOBE/GAP 件数+展開・現状把握配置・useTableSort・EditGate ✅ Task5。
- 検証（build/jest/tsc/vitest/build/smoke）✅ Task6。
- 型整合: `FlowAssignee`/`BusinessFlowItem`/`GapItem`/`BusinessListRow` は Task4 で定義し Task5 で使用。backend の `{stakeholderId,name,order}` 形と一致。
- プレースホルダ無し（gap-items のフィールド名のみ実レスポンス確認の注記＝既存挙動依存のため明示）。
