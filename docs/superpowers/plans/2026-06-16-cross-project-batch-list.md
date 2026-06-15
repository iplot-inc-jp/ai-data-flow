# Cross-Project Ingestion Batch List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A top-level sidebar page `/dashboard/batches` that lists knowledge-ingestion batches across every project the caller can view (read-only), backed by a new RBAC-filtered `GET /api/my/ingestion-batches`.

**Architecture:** New NestJS use-case enumerates the caller's orgs → projects → keeps those `ProjectAccessService.resolveProjectAccess` allows → aggregates each project's batches (existing `findByProjectId`), sorts newest-first, caps at 200, adds `projectName`. New controller `MyIngestionBatchController` (`GET /api/my/ingestion-batches`, own controller to avoid colliding with `ingestion-batches/:id`). Frontend adds an API client fn, a new page reusing the existing batch-row UI + a project badge (linking to the existing per-project detail route), and a `baseNav` entry.

**Tech Stack:** NestJS 10 + Prisma + jest; Next.js 14 App Router + vitest. Branch `feat/methodology-pipeline` (commit only here; never branch).

**Spec:** `docs/superpowers/specs/2026-06-16-cross-project-batch-list-design.md`

---

## Task 1: Backend DTO — IngestionBatchWithProjectOutput

**Files:** Modify `backend/src/application/use-cases/ingestion/ingestion-output.ts`

- [ ] **Step 1: Append the DTO + mapper** to the end of `ingestion-output.ts`:

```ts
export interface IngestionBatchWithProjectOutput extends IngestionBatchOutput {
  projectName: string;
}

export function toIngestionBatchWithProjectOutput(
  batch: IngestionBatch,
  projectName: string,
): IngestionBatchWithProjectOutput {
  return { ...toIngestionBatchOutput(batch), projectName };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/application/use-cases/ingestion/ingestion-output.ts
git commit -m "feat(batches): IngestionBatchWithProjectOutput DTO + mapper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Backend use-case — GetAllAccessibleIngestionBatchesUseCase

**Files:**
- Create `backend/src/application/use-cases/ingestion/get-all-accessible-ingestion-batches.use-case.ts`
- Test `backend/src/application/use-cases/ingestion/get-all-accessible-ingestion-batches.use-case.spec.ts`
- Modify `backend/src/application/use-cases/ingestion/index.ts` (export)

- [ ] **Step 1: Write the failing test**

```ts
// get-all-accessible-ingestion-batches.use-case.spec.ts
import { GetAllAccessibleIngestionBatchesUseCase } from './get-all-accessible-ingestion-batches.use-case';

function batch(id: string, projectId: string, createdAtIso: string) {
  return {
    id, projectId, name: `b-${id}`, status: 'SUCCEEDED',
    totalFiles: 1, succeededFiles: 1, failedFiles: 0, pendingFiles: 0,
    options: null, createdById: null,
    createdAt: new Date(createdAtIso), updatedAt: new Date(createdAtIso),
    startedAt: null, finishedAt: null,
  };
}

function makeDeps(opts: {
  orgs: Array<{ id: string }>;
  projectsByOrg: Record<string, Array<{ id: string; name: string }>>;
  accessByProject: Record<string, 'EDIT' | 'VIEW' | null>;
  batchesByProject: Record<string, ReturnType<typeof batch>[]>;
}) {
  return {
    orgRepo: { findByUserId: jest.fn(async () => opts.orgs) },
    projectRepo: { findByOrganizationId: jest.fn(async (orgId: string) => opts.projectsByOrg[orgId] ?? []) },
    batchRepo: { findByProjectId: jest.fn(async (pid: string) => opts.batchesByProject[pid] ?? []) },
    projectAccess: { resolveProjectAccess: jest.fn(async (pid: string) => opts.accessByProject[pid] ?? null) },
  };
}
function makeUseCase(d: ReturnType<typeof makeDeps>) {
  return new GetAllAccessibleIngestionBatchesUseCase(
    d.orgRepo as any, d.projectRepo as any, d.batchRepo as any, d.projectAccess as any,
  );
}

describe('GetAllAccessibleIngestionBatchesUseCase', () => {
  it('excludes projects the user cannot access (resolveProjectAccess null)', async () => {
    const d = makeDeps({
      orgs: [{ id: 'o1' }],
      projectsByOrg: { o1: [{ id: 'pA', name: 'Project A' }, { id: 'pB', name: 'Project B' }] },
      accessByProject: { pA: 'VIEW', pB: null },
      batchesByProject: { pA: [batch('1', 'pA', '2026-06-10T00:00:00Z')], pB: [batch('2', 'pB', '2026-06-11T00:00:00Z')] },
    });
    const out = await makeUseCase(d).execute({ userId: 'u1' });
    expect(out.map((b) => b.id)).toEqual(['1']);
    expect(out[0].projectName).toBe('Project A');
    expect(out[0].projectId).toBe('pA');
  });

  it('aggregates across projects/orgs sorted by createdAt desc, deduping projects', async () => {
    const d = makeDeps({
      orgs: [{ id: 'o1' }, { id: 'o2' }],
      projectsByOrg: {
        o1: [{ id: 'pA', name: 'A' }],
        o2: [{ id: 'pB', name: 'B' }],
      },
      accessByProject: { pA: 'EDIT', pB: 'VIEW' },
      batchesByProject: {
        pA: [batch('old', 'pA', '2026-06-01T00:00:00Z'), batch('new', 'pA', '2026-06-15T00:00:00Z')],
        pB: [batch('mid', 'pB', '2026-06-10T00:00:00Z')],
      },
    });
    const out = await makeUseCase(d).execute({ userId: 'u1' });
    expect(out.map((b) => b.id)).toEqual(['new', 'mid', 'old']);
  });

  it('caps the result at 200 (newest first)', async () => {
    const many = Array.from({ length: 250 }, (_, i) =>
      batch(`b${i}`, 'pA', new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString()),
    );
    const d = makeDeps({
      orgs: [{ id: 'o1' }],
      projectsByOrg: { o1: [{ id: 'pA', name: 'A' }] },
      accessByProject: { pA: 'VIEW' },
      batchesByProject: { pA: many },
    });
    const out = await makeUseCase(d).execute({ userId: 'u1' });
    expect(out).toHaveLength(200);
    // newest first → first item is the largest timestamp (i=249)
    expect(out[0].id).toBe('b249');
  });

  it('returns empty when the user is in no orgs', async () => {
    const d = makeDeps({ orgs: [], projectsByOrg: {}, accessByProject: {}, batchesByProject: {} });
    expect(await makeUseCase(d).execute({ userId: 'u1' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest get-all-accessible-ingestion-batches`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the use-case**

```ts
// get-all-accessible-ingestion-batches.use-case.ts
import { Inject, Injectable } from '@nestjs/common';
import {
  OrganizationRepository, ORGANIZATION_REPOSITORY,
  ProjectRepository, PROJECT_REPOSITORY,
  IIngestionBatchRepository, INGESTION_BATCH_REPOSITORY,
} from '../../../domain';
import { ProjectAccessService } from '../../../infrastructure/services/project-access.service';
import {
  IngestionBatchWithProjectOutput,
  toIngestionBatchWithProjectOutput,
} from './ingestion-output';

/** 横断一覧の最大件数（最新順）。無制限ペイロード防止。 */
const MAX_BATCHES = 200;

export interface GetAllAccessibleIngestionBatchesInput {
  userId: string;
}

/**
 * 呼出ユーザーが閲覧可能な全プロジェクト横断の取り込みバッチ一覧。
 * 既存 RBAC（ProjectAccessService.resolveProjectAccess）を再利用して
 * アクセス可能プロジェクトだけに絞り、createdAt 降順・最大200件で返す。
 */
@Injectable()
export class GetAllAccessibleIngestionBatchesUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly orgRepo: OrganizationRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: ProjectRepository,
    @Inject(INGESTION_BATCH_REPOSITORY)
    private readonly batchRepo: IIngestionBatchRepository,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async execute(
    input: GetAllAccessibleIngestionBatchesInput,
  ): Promise<IngestionBatchWithProjectOutput[]> {
    // 1. 所属 org → 候補プロジェクト（org 横断・重複排除）
    const orgs = await this.orgRepo.findByUserId(input.userId);
    const projectLists = await Promise.all(
      orgs.map((o) => this.projectRepo.findByOrganizationId(o.id)),
    );
    const projectById = new Map<string, { id: string; name: string }>();
    for (const list of projectLists) {
      for (const p of list) projectById.set(p.id, { id: p.id, name: p.name });
    }
    const candidates = Array.from(projectById.values());

    // 2. 既存 RBAC でアクセス可能(VIEW/EDIT)のみ残す（並列）
    const levels = await Promise.all(
      candidates.map((p) => this.projectAccess.resolveProjectAccess(p.id, input.userId)),
    );
    const accessible = candidates.filter((_, i) => levels[i] !== null);

    // 3. 各プロジェクトのバッチを取得し projectName 付きで集約（並列）
    const perProject = await Promise.all(
      accessible.map(async (p) => {
        const batches = await this.batchRepo.findByProjectId(p.id);
        return batches.map((b) => toIngestionBatchWithProjectOutput(b, p.name));
      }),
    );

    // 4. createdAt 降順で横断ソート → cap
    const all = perProject.flat();
    all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return all.slice(0, MAX_BATCHES);
  }
}
```

> If `IIngestionBatchRepository` / `INGESTION_BATCH_REPOSITORY` / `OrganizationRepository` / `ProjectRepository` are not re-exported from the `../../../domain` barrel, import them from their concrete repository files (`../../../domain/repositories/ingestion-batch.repository`, etc.) — verify and adjust. tsc will catch this.

- [ ] **Step 4: Add the barrel export** to `backend/src/application/use-cases/ingestion/index.ts`:

```ts
export * from './get-all-accessible-ingestion-batches.use-case';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest get-all-accessible-ingestion-batches && npx tsc --noEmit`
Expected: 4 tests PASS; tsc 0 errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/application/use-cases/ingestion/get-all-accessible-ingestion-batches.use-case.ts backend/src/application/use-cases/ingestion/get-all-accessible-ingestion-batches.use-case.spec.ts backend/src/application/use-cases/ingestion/index.ts
git commit -m "feat(batches): GetAllAccessibleIngestionBatchesUseCase (RBAC cross-project + cap)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Backend controller + wiring

**Files:**
- Modify `backend/src/presentation/controllers/ingestion.controller.ts` (add `MyIngestionBatchController`)
- Modify `backend/src/app.module.ts`

- [ ] **Step 1: Append the new controller** to `ingestion.controller.ts` (after the existing controllers; reuse the file's existing imports for `Controller, Get, CurrentUser, CurrentUserPayload, ApiTags, ApiOperation, ApiBearerAuth` — add any missing). Also import the use-case + DTO type:

```ts
// add near other imports in ingestion.controller.ts:
import { GetAllAccessibleIngestionBatchesUseCase } from '../../application/use-cases/ingestion/get-all-accessible-ingestion-batches.use-case';
import { IngestionBatchWithProjectOutput } from '../../application/use-cases/ingestion/ingestion-output';

// append this controller class:
@ApiTags('取り込みバッチ')
@ApiBearerAuth()
@Controller('my')
export class MyIngestionBatchController {
  constructor(
    private readonly getAllAccessibleIngestionBatchesUseCase: GetAllAccessibleIngestionBatchesUseCase,
  ) {}

  @Get('ingestion-batches')
  @ApiOperation({ summary: '取り込みバッチ横断一覧（自分が閲覧可能な全プロジェクト）' })
  async listAll(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<IngestionBatchWithProjectOutput[]> {
    return this.getAllAccessibleIngestionBatchesUseCase.execute({ userId: user.id });
  }
}
```

> Verify `Get`, `CurrentUser`, `CurrentUserPayload`, `ApiTags`, `ApiOperation`, `ApiBearerAuth` are already imported in this file (the existing `IngestionBatchProjectController` uses them). Add any that are missing.

- [ ] **Step 2: Wire into `app.module.ts`**:
  1. Import: `import { MyIngestionBatchController } from './presentation/controllers/ingestion.controller';` — **if `ingestion.controller` controllers are already imported there**, just add `MyIngestionBatchController` to the existing import list. Also import `GetAllAccessibleIngestionBatchesUseCase` from `./application/use-cases/ingestion/get-all-accessible-ingestion-batches.use-case` (or the ingestion barrel if app.module imports use-cases that way — match the existing style).
  2. Add `MyIngestionBatchController,` to the `controllers:` array (near `IngestionBatchProjectController`).
  3. Add `GetAllAccessibleIngestionBatchesUseCase,` to the `providers:` array (near `GetIngestionBatchesUseCase`).

- [ ] **Step 3: Verify build + full jest**

Run: `cd backend && npm run build && npx jest`
Expected: build succeeds (DI resolves — `ORGANIZATION_REPOSITORY`/`PROJECT_REPOSITORY`/`INGESTION_BATCH_REPOSITORY`/`ProjectAccessService` already provided); jest green incl. the 4 new use-case tests.

- [ ] **Step 4: Commit**

```bash
git add backend/src/presentation/controllers/ingestion.controller.ts backend/src/app.module.ts
git commit -m "feat(batches): GET /api/my/ingestion-batches controller + wiring

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Frontend API client + shared helpers extraction

**Files:**
- Modify `frontend/src/lib/knowledge.ts`
- Modify `frontend/src/app/(dashboard)/dashboard/projects/[projectId]/knowledge/ingestion/page.tsx`

- [ ] **Step 1: In `knowledge.ts`, add the cross-project type** (after the `IngestionBatch` interface, ~line 89):

```ts
/** 横断一覧の1行（プロジェクト名付き）。GET /api/my/ingestion-batches */
export interface IngestionBatchWithProject extends IngestionBatch {
  projectName: string;
}
```

- [ ] **Step 2: In `knowledge.ts`, export the shared status style + date formatter** (place right after `BATCH_STATUS_LABEL` / `isBatchTerminal`, ~line 668):

```ts
/** バッチ状態 → バッジ配色（プロジェクト別/横断の両ページで共有）。 */
export const BATCH_STATUS_STYLE: Record<IngestionBatchStatus, string> = {
  PENDING: 'bg-gray-100 text-gray-600',
  EXPANDING: 'bg-blue-100 text-blue-700',
  RUNNING: 'bg-indigo-100 text-indigo-700',
  PARTIAL: 'bg-amber-100 text-amber-700',
  SUCCEEDED: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

/** ISO文字列 → ja-JP の日時表記。不正値はそのまま返す。 */
export function formatBatchDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}
```

- [ ] **Step 3: In `knowledge.ts`, add the client fn** inside the `ingestionApi` object (after `listBatches`):

```ts
/** 横断一覧。GET /api/my/ingestion-batches */
async listAllBatches(): Promise<IngestionBatchWithProject[]> {
  const res = await fetch(`${API_URL}/api/my/ingestion-batches`, { headers: headers() });
  return ok<IngestionBatchWithProject[]>(res, 'バッチ横断一覧の取得に失敗しました');
},
```

- [ ] **Step 4: Refactor the per-project page to use the shared helpers.** In `frontend/src/app/(dashboard)/dashboard/projects/[projectId]/knowledge/ingestion/page.tsx`:
  - Delete the local `const BATCH_STATUS_STYLE = {...}` (lines ~33-41) and the local `function formatDate(iso) {...}` (lines ~43-53).
  - Add `BATCH_STATUS_STYLE` and `formatBatchDate as formatDate` to the existing `@/lib/knowledge` import (so existing `formatDate(...)` call sites stay unchanged).

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/knowledge.ts "frontend/src/app/(dashboard)/dashboard/projects/[projectId]/knowledge/ingestion/page.tsx"
git commit -m "feat(batches): cross-project client fn + shared BATCH_STATUS_STYLE/formatBatchDate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Frontend top-level page /dashboard/batches

**Files:** Create `frontend/src/app/(dashboard)/dashboard/batches/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, RefreshCw, Inbox } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { cn } from '@/lib/utils'
import {
  ingestionApi,
  BATCH_STATUS_LABEL,
  BATCH_STATUS_STYLE,
  formatBatchDate,
  isBatchTerminal,
  type IngestionBatchWithProject,
} from '@/lib/knowledge'

/**
 * 取り込みバッチ 横断一覧（トップレベル）。
 * 閲覧権限のある全プロジェクトの取り込みバッチを読み取り専用で集約表示。
 * 行クリックで既存のプロジェクト別詳細へ遷移。実行中バッチがある間だけ4秒ポーリング。
 */
export default function CrossProjectBatchesPage() {
  const [batches, setBatches] = useState<IngestionBatchWithProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const list = await ingestionApi.listAllBatches()
      setBatches(list)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'バッチ一覧の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // 実行中バッチがある間だけポーリング（終端のみなら停止）
  useEffect(() => {
    const hasActive = batches.some((b) => !isBatchTerminal(b.status))
    if (!hasActive) {
      if (timer.current) {
        clearInterval(timer.current)
        timer.current = null
      }
      return
    }
    if (timer.current) return
    timer.current = setInterval(() => void load(), 4000)
    return () => {
      if (timer.current) {
        clearInterval(timer.current)
        timer.current = null
      }
    }
  }, [batches, load])

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Inbox}
        title="取り込みバッチ（横断）"
        description="閲覧権限のある全プロジェクトのナレッジ取り込みバッチをまとめて表示します（読み取り専用・最新200件）。"
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            更新
          </Button>
        }
      />

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          読み込み中…
        </div>
      ) : batches.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-2 text-center text-muted-foreground">
            <Inbox className="h-8 w-8" />
            <div>取り込みバッチがありません。</div>
            <div className="text-xs">各プロジェクトの「ナレッジ取り込み」画面から作成できます。</div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {batches.map((b) => (
            <Link
              key={b.id}
              href={`/dashboard/projects/${b.projectId}/knowledge/ingestion/${b.id}`}
              className="block"
            >
              <Card className="hover:border-primary/50 transition-colors">
                <CardContent className="py-3.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground whitespace-nowrap">
                        {b.projectName}
                      </span>
                      <span className="font-medium truncate">
                        {b.name || '（無題のバッチ）'}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
                          BATCH_STATUS_STYLE[b.status],
                        )}
                      >
                        {!isBatchTerminal(b.status) && (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        {BATCH_STATUS_LABEL[b.status]}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      作成: {formatBatchDate(b.createdAt)}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
                    <div>
                      全 {b.totalFiles} 件 / 完了 {b.succeededFiles} / 失敗 {b.failedFiles}
                    </div>
                    <div className="mt-1 h-1.5 w-32 rounded-full bg-secondary overflow-hidden ml-auto">
                      <div
                        className="h-full bg-emerald-500"
                        style={{
                          width: `${
                            b.totalFiles > 0
                              ? Math.round((b.succeededFiles / b.totalFiles) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

> Verify `PageHeader` accepts an `icon` prop (the project-map page uses `PageHeader` with `title/description/actions`; check whether it supports `icon`). If `PageHeader` has no `icon` prop, drop the `icon={Inbox}` line. tsc will flag it — adjust to the real `PageHeader` API.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "frontend/src/app/(dashboard)/dashboard/batches/page.tsx"
git commit -m "feat(batches): cross-project /dashboard/batches page (read-only, polling)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Frontend sidebar entry

**Files:** Modify `frontend/src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Add `Inbox` to the `lucide-react` import** (the import block ends ~line 50). Add `Inbox,` to the import list.

- [ ] **Step 2: Add the baseNav entry.** In the `baseNav` useMemo (~lines 601-613), add the entry right after the プロジェクト item:

```ts
const nav = [
  { name: 'ダッシュボード', href: '/dashboard', icon: Home },
  { name: 'プロジェクト', href: '/dashboard/projects', icon: FolderOpen },
  { name: '取り込みバッチ', href: '/dashboard/batches', icon: Inbox },
]
```
(Keep the existing `会社管理` push for super-admins below it unchanged.)

- [ ] **Step 3: Typecheck, full test suite, build**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npm run build`
Expected: tsc 0; vitest all green (unchanged count, no new frontend unit tests — this feature's logic is backend-tested); `next build` succeeds and compiles `/dashboard/batches`.

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/(dashboard)/layout.tsx"
git commit -m "feat(batches): top-level sidebar entry for cross-project batches

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Post-implementation
- Backend code review (RBAC correctness: no batch from a project the user can't view leaks; cap; sort).
- Manual smoke: as a user in ≥2 projects with batches, `/dashboard/batches` lists them newest-first with project badges; a project you lack access to never appears; clicking a row opens the existing per-project detail; an active batch triggers 4s polling.
- Deploy is a separate gated step (frontend + backend → PR → main → deploy) requiring explicit user approval. Schema unchanged (no `prisma db push` concern).

## Self-Review
- **Spec coverage:** §2.1 endpoint→Task 3; §2.2 use-case + RBAC→Task 2; §2.3 DTO→Task 1; §2.4 sort/cap→Task 2 (impl+tests); §3.1 client+shared helpers→Task 4; §3.2 page→Task 5; §3.3 sidebar→Task 6; §2.5 tests→Task 2. Read-only (no create/mutation) honored (Task 5 has no NewBatchDialog/actions). super-admin own-orgs scope = inherent in `orgRepo.findByUserId` (no findAll added).
- **Placeholders:** none — full code in every step; the two "verify the API" notes (domain barrel exports, `PageHeader.icon`) are explicit fallbacks, not vague TODOs.
- **Type consistency:** `IngestionBatchWithProjectOutput` (backend) ↔ `IngestionBatchWithProject` (frontend) both = batch fields + `projectName`. `toIngestionBatchWithProjectOutput(batch, projectName)` signature identical across Task 1 (def) and Task 2 (use). `BATCH_STATUS_STYLE`/`formatBatchDate` defined Task 4, consumed Task 5 + the refactored per-project page. Endpoint path `/api/my/ingestion-batches` identical in Task 3 (controller) and Task 4 (client).
