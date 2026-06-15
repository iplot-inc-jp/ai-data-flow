# Jira CSV 取込 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Jira の課題エクスポート CSV を Task に取り込む経路を、既存 Backlog CSV 取込（`ImportBacklogTasksUseCase`）をミラーして追加する。`sourceKey='JIRA:<Issue key>'` で冪等 upsert（再取込で重複しない）。Jira API 同期は既に完成済みのため検証＋テスト追加のみ。

**Architecture:** backend は NestJS + クリーンアーキテクチャ（application/domain/infrastructure/presentation）。新 use-case `ImportJiraTasksUseCase` が Jira CSV をパースし Task を upsert。共有 util（`parseCsv` / `wouldFormCycle`）は既存 backlog use-case の export を再利用。frontend は Next.js App Router、`BacklogImportDialog` を複製した `JiraImportDialog`。

**Tech Stack:** NestJS, Prisma, TypeScript, Next.js (App Router), vitest/jest（既存テストランナーに合わせる）。

**前提:** 作業ブランチ `feat/jira-csv-import`（main でも methodology-pipeline でもない別ブランチ）。各タスク後に backend は `pnpm --filter @dataflow/backend build`（または既存の typecheck/test）が通ること。既存 Backlog CSV 取込の挙動は変更しない（冪等化は新規 Jira 経路のみ）。

---

## File Structure
- Create: `backend/src/application/use-cases/task/import-jira-tasks.use-case.ts`
- Create: `backend/src/application/use-cases/task/import-jira-tasks.use-case.spec.ts`
- Modify: `backend/src/application/use-cases/task/index.ts`（export 追加）
- Modify: `backend/src/presentation/controllers/task.controller.ts`（`ImportJiraDto` + `@Post('import-jira')` + DI）
- Modify: backend の Nest module（`ImportBacklogTasksUseCase` を providers 登録しているファイル）に `ImportJiraTasksUseCase` を追加
- Create: `frontend/src/components/jira-import-dialog.tsx`
- Modify: `frontend/src/lib/tasks.ts`（`importJira` 追加）
- Modify: `frontend/src/app/(dashboard)/dashboard/projects/[projectId]/tasks/page.tsx`（「Jiraから取込」ボタン + ダイアログ）
- Modify: `backend/src/infrastructure/services/trackers/trackers.mapping.spec.ts`（Jira 語彙の写像テスト追加＝同期の検証）

---

## Task 1: ImportJiraTasksUseCase（backend use-case）＋ユニットテスト

**Files:**
- Create: `backend/src/application/use-cases/task/import-jira-tasks.use-case.ts`
- Test: `backend/src/application/use-cases/task/import-jira-tasks.use-case.spec.ts`
- Modify: `backend/src/application/use-cases/task/index.ts`

> 共有 util は既存 `import-backlog-tasks.use-case.ts` から `parseCsv` と `wouldFormCycle`（両方 export 済み）を import して再利用する。`cell`/`optional`/`parseDate`/秒→時間 と Jira 用 `buildJiraColumnIndex`/`mapJiraStatus`/`mapJiraPriority` は本ファイルに小さく定義する（Backlog ファイルは変更しない）。

- [ ] **Step 1: 失敗するテストを書く**（リポジトリはモック。実 DB は使わない。`describe/it/expect` は既存 backend テストのランナー記法に合わせる＝同ディレクトリの他 `*.spec.ts` を1つ開いて import 行を踏襲すること）

```ts
import { ImportJiraTasksUseCase } from './import-jira-tasks.use-case';

// 既存テストに合わせたモック生成ヘルパ。ITaskRepository / ProjectRepository /
// OrganizationRepository / ProjectAccessService の最小モックを返す。
function makeDeps(opts?: { existingBySourceKey?: Record<string, any> }) {
  const saved: any[] = [];
  const byId = new Map<string, any>();
  const bySourceKey = new Map<string, any>(Object.entries(opts?.existingBySourceKey ?? {}));
  let seq = 0;
  const taskRepository = {
    generateId: () => `t${++seq}`,
    save: async (t: any) => { saved.push(t); byId.set(t.id, t); },
    findById: async (id: string) => byId.get(id) ?? null,
    findByProjectIdAndSourceKey: async (_p: string, sk: string) => bySourceKey.get(sk) ?? null,
  };
  const projectRepository = { findById: async () => ({ id: 'p1', organizationId: 'o1' }) };
  const organizationRepository = { isMember: async () => true };
  const projectAccess = { assertProjectAccess: async () => {} };
  return { taskRepository, projectRepository, organizationRepository, projectAccess, saved, byId, bySourceKey };
}

const JIRA_CSV = [
  'Summary,Issue key,Status,Priority,Assignee,Due date,Original Estimate,Parent',
  '親タスク,PROJ-1,To Do,High,山田,2026-07-01,3600,',
  '子タスク,PROJ-2,In Progress,Lowest,田中,,7200,PROJ-1',
].join('\n');

describe('ImportJiraTasksUseCase', () => {
  it('Jira CSV を取り込み、列マッピング/status/priority写像/秒→時間/親解決が効く', async () => {
    const d = makeDeps();
    const uc = new ImportJiraTasksUseCase(
      d.taskRepository as any, d.projectRepository as any, d.organizationRepository as any, d.projectAccess as any,
    );
    const out = await uc.execute({ userId: 'u1', projectId: 'p1', csv: JIRA_CSV });
    expect(out.created).toBe(2);
    const parent = d.saved.find((t) => t.title === '親タスク');
    const child = d.saved.find((t) => t.title === '子タスク');
    expect(parent.status).toBe('OPEN');        // To Do
    expect(parent.priority).toBe('HIGH');      // High
    expect(parent.estimatedHours).toBe(1);     // 3600s → 1h
    expect(parent.sourceKey).toBe('JIRA:PROJ-1');
    expect(child.status).toBe('IN_PROGRESS');  // In Progress
    expect(child.priority).toBe('LOW');        // Lowest
    expect(child.parentId).toBe(parent.id);    // PROJ-1 を親解決
  });

  it('同じ Issue key を再取込すると新規作成でなく更新（冪等 upsert）', async () => {
    // 既存 Task（sourceKey=JIRA:PROJ-1）がある状態
    const existing: any = { id: 'old1', title: '旧件名', sourceKey: 'JIRA:PROJ-1', parentId: null,
      update(p: any) { Object.assign(this, p); }, reparent(pid: string | null) { this.parentId = pid; } };
    const d = makeDeps({ existingBySourceKey: { 'JIRA:PROJ-1': existing } });
    const uc = new ImportJiraTasksUseCase(
      d.taskRepository as any, d.projectRepository as any, d.organizationRepository as any, d.projectAccess as any,
    );
    const out = await uc.execute({ userId: 'u1', projectId: 'p1', csv: 'Summary,Issue key\n新件名,PROJ-1' });
    expect(out.created).toBe(0);
    expect(out.updated).toBe(1);
    expect(existing.title).toBe('新件名'); // 既存を更新（重複作成しない）
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm --filter @dataflow/backend test -- import-jira-tasks` （または既存の test スクリプトに合わせる。例: `pnpm --filter @dataflow/backend exec jest import-jira-tasks`）
Expected: FAIL（モジュール未存在）

- [ ] **Step 3: 実装する**（`import-backlog-tasks.use-case.ts` を雛形に。RBAC・2パス親解決・循環ガード・行数上限は同一ロジック。差分は列マッピング/写像/秒→時間/冪等upsert）

```ts
import { Inject, Injectable } from '@nestjs/common';
import {
  Task, TaskStatus, TaskPriority,
  ITaskRepository, TASK_REPOSITORY,
  ProjectRepository, PROJECT_REPOSITORY,
  OrganizationRepository, ORGANIZATION_REPOSITORY,
  EntityNotFoundError, ForbiddenError,
} from '../../../domain';
import { ProjectAccessService } from '../../../infrastructure/services/project-access.service';
import { parseCsv, wouldFormCycle } from './import-backlog-tasks.use-case';

export interface ImportJiraTasksInput { userId: string; projectId: string; csv: string; }
export interface ImportJiraTasksRowError { row: number; message: string; }
export interface ImportJiraTasksOutput {
  created: number;
  updated: number;
  skipped: number;
  errors: ImportJiraTasksRowError[];
}

const MAX_IMPORT_ROWS = 2000;

/**
 * Jira の課題エクスポート CSV を Task に取り込む。Backlog 版をミラーするが、
 * - 列名は Jira 標準ヘッダ（Summary / Issue key / Status / Priority / Assignee / Due date /
 *   Original Estimate(秒) / Σ Time Spent(秒) / Parent）。
 * - status/priority は Jira 語彙で写像。
 * - sourceKey='JIRA:<Issue key>' で冪等 upsert（再取込で重複させない）。
 */
@Injectable()
export class ImportJiraTasksUseCase {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepository: ITaskRepository,
    @Inject(PROJECT_REPOSITORY) private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizationRepository: OrganizationRepository,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async execute(input: ImportJiraTasksInput): Promise<ImportJiraTasksOutput> {
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) throw new EntityNotFoundError('Project', input.projectId);
    const isMember = await this.organizationRepository.isMember(project.organizationId, input.userId);
    if (!isMember) throw new ForbiddenError('You are not a member of this organization');
    await this.projectAccess.assertProjectAccess(input.projectId, input.userId, 'edit');

    const errors: ImportJiraTasksRowError[] = [];
    const rows = parseCsv(input.csv);
    if (rows.length === 0) return { created: 0, updated: 0, skipped: 0, errors: [] };

    const col = buildJiraColumnIndex(rows[0]);
    if (col.title === undefined) {
      return { created: 0, updated: 0, skipped: 0, errors: [{ row: 0,
        message: 'CSVヘッダに「Summary」列が見つかりません（必須）。Jira の課題エクスポート CSV を貼り付けてください。' }] };
    }
    const dataRows = rows.slice(1);
    if (dataRows.length > MAX_IMPORT_ROWS) {
      return { created: 0, updated: 0, skipped: 0, errors: [{ row: 0,
        message: `取込可能な行数の上限（${MAX_IMPORT_ROWS}行）を超えています（${dataRows.length}行）。CSVを分割してください。` }] };
    }

    const keyToTaskId = new Map<string, string>();
    const duplicateKeys = new Set<string>();
    const processed: Array<{ rowNo: number; taskId: string; parentKey: string | null } | null> = [];
    let created = 0;
    let updated = 0;

    // ===== パス1: upsert（sourceKey で冪等）=====
    for (let i = 0; i < dataRows.length; i++) {
      const rowNo = i + 1;
      const fields = dataRows[i];
      if (fields.every((f) => f.trim() === '')) { processed.push(null); continue; }

      const title = cell(fields, col.title).trim();
      if (!title) {
        errors.push({ row: rowNo, message: 'Summary（件名）が空のためスキップしました' });
        processed.push(null);
        continue;
      }
      const key = cell(fields, col.key).trim();
      const props = {
        title,
        description: optional(cell(fields, col.description)),
        status: mapJiraStatus(cell(fields, col.status)),
        priority: mapJiraPriority(cell(fields, col.priority)),
        assigneeName: optional(cell(fields, col.assigneeName)),
        dueDate: parseDate(cell(fields, col.dueDate)),
        estimatedHours: secondsToHours(cell(fields, col.estimatedHours)),
        actualHours: secondsToHours(cell(fields, col.actualHours)),
      };

      try {
        let taskId: string;
        const sourceKey = key ? `JIRA:${key}` : null;
        const existing = sourceKey ? await this.taskRepository.findByProjectIdAndSourceKey(input.projectId, sourceKey) : null;
        if (existing) {
          existing.update(props); // 既存を更新（重複作成しない）
          await this.taskRepository.save(existing);
          taskId = existing.id;
          updated++;
        } else {
          const id = this.taskRepository.generateId();
          const task = Task.create({ projectId: input.projectId, sourceKey, ...props }, id);
          await this.taskRepository.save(task);
          taskId = id;
          created++;
        }

        if (key) {
          if (keyToTaskId.has(key)) {
            errors.push({ row: rowNo, message: `Issue key「${key}」が重複しています。この行は親解決の対象から除外しました（タスクは作成/更新済み）` });
            duplicateKeys.add(key);
          } else {
            keyToTaskId.set(key, taskId);
          }
        }
        const parentKey = cell(fields, col.parentKey).trim();
        processed.push({ rowNo, taskId, parentKey: parentKey || null });
      } catch (e) {
        errors.push({ row: rowNo, message: (e as Error)?.message ?? String(e) });
        processed.push(null);
      }
    }

    // ===== パス2: 親キー解決（Backlog 版と同一の循環ガード）=====
    const appliedParent = new Map<string, string>();
    for (const entry of processed) {
      if (!entry || !entry.parentKey) continue;
      const parentId = keyToTaskId.get(entry.parentKey);
      if (!parentId || parentId === entry.taskId) continue;
      if (duplicateKeys.has(entry.parentKey)) {
        errors.push({ row: entry.rowNo, message: `親キー「${entry.parentKey}」が重複しており紐付け先が一意でないため親なしにしました` });
        continue;
      }
      if (wouldFormCycle(appliedParent, entry.taskId, parentId)) {
        errors.push({ row: entry.rowNo, message: `親「${entry.parentKey}」を設定すると循環参照になるため親なしにしました` });
        continue;
      }
      try {
        const task = await this.taskRepository.findById(entry.taskId);
        if (!task) continue;
        task.reparent(parentId);
        await this.taskRepository.save(task);
        appliedParent.set(entry.taskId, parentId);
      } catch (e) {
        errors.push({ row: entry.rowNo, message: `親の紐付けに失敗: ${(e as Error)?.message ?? String(e)}` });
      }
    }

    const processedCount = processed.filter((c) => c !== null).length;
    const skipped = dataRows.length - processedCount;
    return { created, updated, skipped, errors };
  }
}

// ===== Jira 列マッピング =====
interface JiraColumnIndex {
  title?: number; key?: number; description?: number; status?: number; priority?: number;
  assigneeName?: number; dueDate?: number; estimatedHours?: number; actualHours?: number; parentKey?: number;
}
function buildJiraColumnIndex(header: string[]): JiraColumnIndex {
  const norm = (s: string) => (s ?? '').replace(/^﻿/, '').replace(/\s+/g, '').trim().toLowerCase();
  const find = (...names: string[]): number | undefined => {
    for (let i = 0; i < header.length; i++) {
      const h = norm(header[i]);
      if (names.some((n) => h === norm(n))) return i;
    }
    return undefined;
  };
  return {
    title: find('Summary', '件名'),
    key: find('Issue key', 'Issue Key', 'Key'),
    description: find('Description', '説明'),
    status: find('Status', '状態'),
    priority: find('Priority', '優先度'),
    assigneeName: find('Assignee', '担当者'),
    dueDate: find('Due date', 'Due Date', '期限'),
    estimatedHours: find('Original Estimate', 'Σ Original Estimate', 'Original estimate'),
    actualHours: find('Time Spent', 'Σ Time Spent', 'Time spent'),
    parentKey: find('Parent', 'Parent key', 'Parent id', 'Parent Issue'),
  };
}
function cell(fields: string[], index: number | undefined): string {
  if (index === undefined) return '';
  return fields[index] ?? '';
}
function optional(value: string): string | null {
  const t = (value ?? '').trim();
  return t === '' ? null : t;
}
// ===== Jira enum 写像 =====
export function mapJiraStatus(raw: string): TaskStatus {
  const v = (raw ?? '').trim().toLowerCase();
  if (['to do', 'todo', 'open', 'backlog', 'reopened'].includes(v)) return 'OPEN';
  if (['in progress', 'in review', 'doing'].includes(v)) return 'IN_PROGRESS';
  if (['resolved'].includes(v)) return 'RESOLVED';
  if (['done', 'closed', 'complete', 'completed'].includes(v)) return 'CLOSED';
  return 'OPEN';
}
export function mapJiraPriority(raw: string): TaskPriority {
  const v = (raw ?? '').trim().toLowerCase();
  if (['highest', 'high', 'blocker', 'critical'].includes(v)) return 'HIGH';
  if (['medium', 'normal'].includes(v)) return 'MEDIUM';
  if (['low', 'lowest', 'trivial', 'minor'].includes(v)) return 'LOW';
  return 'MEDIUM';
}
// ===== 値パーサ =====
function parseDate(raw: string): Date | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  const d = new Date(v.replace(/\//g, '-'));
  return Number.isNaN(d.getTime()) ? null : d;
}
/** Jira CSV の Original Estimate / Time Spent は秒。時間に換算。空/不正は null。 */
function secondsToHours(raw: string): number | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  const num = Number(v);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round((num / 3600) * 100) / 100;
}
```

> 実装後に確認: `Task.create` の props 形（`import-backlog` は `{projectId, title, description, status, priority, assigneeName, startDate, dueDate, estimatedHours, actualHours, category, milestone}` を渡す）に `sourceKey` を足して渡せること（task.entity.ts は `props.sourceKey` を受ける）。`existing.update(props)` の `UpdateTaskProps` が title/description/status/priority/assigneeName/dueDate/estimatedHours/actualHours を受けること（task.entity.ts:317 で確認済み）。型不一致が出たら実シグネチャに合わせる。

- [ ] **Step 4: index.ts に export 追加**

`backend/src/application/use-cases/task/index.ts` に1行追加:
```ts
export * from './import-jira-tasks.use-case';
```

- [ ] **Step 5: テストが通ることを確認**

Run: `pnpm --filter @dataflow/backend test -- import-jira-tasks`
Expected: PASS（2 tests）

- [ ] **Step 6: Commit**

```bash
git add backend/src/application/use-cases/task/import-jira-tasks.use-case.ts backend/src/application/use-cases/task/import-jira-tasks.use-case.spec.ts backend/src/application/use-cases/task/index.ts
git commit -m "feat(jira-csv): ImportJiraTasksUseCase（Jira課題CSV取込・sourceKey冪等upsert）"
```

---

## Task 2: コントローラ endpoint ＋ DTO ＋ module 登録

**Files:**
- Modify: `backend/src/presentation/controllers/task.controller.ts`
- Modify: backend module（`ImportBacklogTasksUseCase` を providers 登録している `*.module.ts`）

- [ ] **Step 1: task.controller.ts に DTO・DI・endpoint を追加**（既存 `ImportBacklogDto`(L340) / `@Post('import-backlog')`(L421) / `importBacklog`(L434) をミラー）

import 追加（既存 `ImportBacklogTasksUseCase, ImportBacklogTasksOutput` の import に並べる）:
```ts
import {
  // ...既存...
  ImportJiraTasksUseCase,
  ImportJiraTasksOutput,
} from '../../application/use-cases/task'; // 既存 backlog use-case と同じ import 元に合わせる
```

DTO 追加（`ImportBacklogDto` の直後。既存の class-validator デコレータ記法に合わせる）:
```ts
class ImportJiraDto {
  csv!: string;
}
```
> `ImportBacklogDto` が `@IsString()` 等を付けているなら同じデコレータを付ける（既存定義を見て一致させる）。

コンストラクタに DI 追加:
```ts
    private readonly importJiraTasksUseCase: ImportJiraTasksUseCase,
```

endpoint 追加（`importBacklog` メソッドの直後。同じガード/`@Param('projectId')`/`req.user` 取得方法を踏襲）:
```ts
  @Post('import-jira')
  async importJira(
    @Param('projectId') projectId: string,
    @Req() req: AuthRequest,            // ← importBacklog と同じ引数の型/取得に合わせる
    @Body() dto: ImportJiraDto,
  ): Promise<ImportJiraTasksOutput> {
    return this.importJiraTasksUseCase.execute({
      userId: req.user.id,             // ← importBacklog と同じ userId 取得に合わせる
      projectId,
      csv: dto.csv,
    });
  }
```

- [ ] **Step 2: Nest module に provider 登録**

`ImportBacklogTasksUseCase` を providers に登録しているモジュールを探し、同じ配列に `ImportJiraTasksUseCase` を追加する:
```bash
grep -rn "ImportBacklogTasksUseCase" backend/src --include=*.module.ts
```
そのファイルの providers 配列に `ImportJiraTasksUseCase` を追加（import 文も）。

- [ ] **Step 3: build / typecheck**

Run: `pnpm --filter @dataflow/backend build`
Expected: 成功（0 エラー）。DI 解決エラー（provider 未登録）や型エラーが出たら Step1/2 を実シグネチャに合わせて修正。

- [ ] **Step 4: Commit**

```bash
git add backend/src/presentation/controllers/task.controller.ts backend/src/**/*.module.ts
git commit -m "feat(jira-csv): POST /projects/:id/tasks/import-jira エンドポイント＋DI登録"
```

---

## Task 3: フロント（JiraImportDialog ＋ lib ＋ ボタン）

**Files:**
- Create: `frontend/src/components/jira-import-dialog.tsx`
- Modify: `frontend/src/lib/tasks.ts`
- Modify: `frontend/src/app/(dashboard)/dashboard/projects/[projectId]/tasks/page.tsx`

- [ ] **Step 1: lib/tasks.ts に importJira を追加**（既存 `importBacklog`(L265) をミラー。戻り型は created/updated/skipped/errors）

`tasks.ts` の `importBacklog` の直後に:
```ts
  /** POST /api/projects/:projectId/tasks/import-jira { csv } */
  importJira: (projectId: string, csv: string) =>
    fetch(`${API_URL}/api/projects/${projectId}/tasks/import-jira`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',          // ← importBacklog と同じ fetch オプションに合わせる
      body: JSON.stringify({ csv }),
    }).then(/* importBacklog と同じレスポンス処理（res.json / エラーハンドリング）を踏襲 */),
```
> `importBacklog` の正確な fetch オプション・戻り型（`ImportBacklogResult` 等、L75 付近）を見て、`ImportJiraResult`（`updated` を含む）を定義 or 既存型に `updated?` を足して流用する。

- [ ] **Step 2: jira-import-dialog.tsx を作成**（`backlog-import-dialog.tsx` を複製し、文言/プレースホルダを Jira 向けに、`tasksApi.importBacklog`→`importJira`、`text-encoding` のデコードは流用。Jira CSV は通常 UTF-8 だが SJIS デコードも残してよい）

`frontend/src/components/backlog-import-dialog.tsx` を読み、以下を置換した複製を作る:
- コンポーネント名 `BacklogImportDialog` → `JiraImportDialog`、export も
- 見出し/説明文「Backlog」→「Jira」、ヘッダ例を Jira 列名（`Summary, Issue key, Status, Priority, Assignee, Due date, Original Estimate, Parent`）に
- 送信呼び出し `importBacklog` → `importJira`
- 結果表示に `updated`（更新件数）を追加（`作成 X / 更新 Y / スキップ Z`）。それ以外（ファイル選択・貼付・エンコード判定・エラー一覧）は同一。

- [ ] **Step 3: tasks/page.tsx にボタン＋ダイアログを配線**（「Backlogから取込」(L630) の隣に「Jiraから取込」、`<BacklogImportDialog>`(L1312) の隣に `<JiraImportDialog>`）

- import 追加: `import { JiraImportDialog } from '@/components/jira-import-dialog';`
- 開閉 state: 既存 Backlog ダイアログの open state（例 `backlogOpen`）に倣って `jiraOpen` を追加
- ボタン: 「Backlogから取込」ボタンの隣に同体裁で「Jiraから取込」（onClick で `setJiraOpen(true)`）
- ダイアログ: `<BacklogImportDialog>` の隣に `<JiraImportDialog open={jiraOpen} onClose / onImported>`（既存 Backlog ダイアログと同じ props 形に合わせる。取込成功時のタスク再取得コールバックも同じものを渡す）

- [ ] **Step 4: build**

Run: `pnpm --filter frontend build`
Expected: 成功。型/props 不一致が出たら既存 Backlog ダイアログの props 形に合わせる。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/jira-import-dialog.tsx frontend/src/lib/tasks.ts "frontend/src/app/(dashboard)/dashboard/projects/[projectId]/tasks/page.tsx"
git commit -m "feat(jira-csv): フロントに Jira CSV 取込ダイアログ＋「Jiraから取込」ボタン"
```

---

## Task 4: Jira API 同期の検証（写像テスト追加）

**Files:**
- Modify: `backend/src/infrastructure/services/trackers/trackers.mapping.spec.ts`

> Jira API 同期は実装済み。新規実装はせず、Jira 語彙が正しく写像されることをテストで固定して「完成」を裏付ける。

- [ ] **Step 1: 既存 spec を読み、同期側 mapStatus/mapPriority の Jira ケースを追加**

`trackers.mapping.spec.ts` を開き、既存テストの記法で Jira 値のケースを追加:
- status: `To Do`→OPEN, `In Progress`→IN_PROGRESS, `Done`→CLOSED/RESOLVED, `Resolved`→RESOLVED（同期側の実マッピング関数の期待値に合わせる）
- priority: `Highest`/`High`→HIGH, `Medium`→MEDIUM, `Low`/`Lowest`→LOW
> テスト対象はあくまで「tracker-import（API同期）側」の写像関数。CSV 側(`mapJiraStatus`/`mapJiraPriority`)は Task1 のテストで担保済み。

- [ ] **Step 2: テスト実行**

Run: `pnpm --filter @dataflow/backend test -- trackers.mapping`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/infrastructure/services/trackers/trackers.mapping.spec.ts
git commit -m "test(jira-sync): Jira 語彙の status/priority 写像ケースを追加（同期の検証）"
```

---

## Task 5: 最終検証

- [ ] **Step 1: backend テスト＋build**

Run: `pnpm --filter @dataflow/backend test && pnpm --filter @dataflow/backend build`
Expected: 全 green / build 成功

- [ ] **Step 2: frontend build**

Run: `pnpm --filter frontend build`
Expected: 成功

- [ ] **Step 3: 受け入れ確認**
1. backend に `POST /projects/:id/tasks/import-jira` が存在し `ImportJiraTasksUseCase` を呼ぶ。
2. Jira CSV を入れると Summary/Status/Priority/Assignee/Due date/Original Estimate(秒→時間)/Parent が正しく Task 化される。
3. 同じ Issue key を再取込しても重複作成されず更新（sourceKey='JIRA:KEY' upsert）。
4. フロントの tasks ページに「Jiraから取込」ボタンとダイアログがあり、作成/更新/スキップ件数が出る。
5. 既存 Backlog CSV 取込の挙動は不変。
6. backend/frontend とも build green。

---

## 自己レビュー（writing-plans）
- **スペック網羅:** use-case=Task1, endpoint/DI=Task2, フロント=Task3, 同期検証=Task4, 全体検証=Task5。承認設計の全項目に対応。
- **プレースホルダ:** 各コード手順に実コードを記載。`>` 注記は実シグネチャ（`Task.create` props・`UpdateTaskProps`・`importBacklog` の fetch形・ダイアログ props・module ファイル）の最終確認点で、型エラーで判明する確認事項（プレースホルダではない）。既存パターンのミラーのため実体は確定済み。
- **型整合:** `ImportJiraTasksOutput{created,updated,skipped,errors}` を use-case/endpoint/lib/dialog で一貫。`sourceKey='JIRA:<key>'`・`mapJiraStatus`/`mapJiraPriority`・`secondsToHours` を一貫使用。共有 `parseCsv`/`wouldFormCycle` は既存 export を再利用。
