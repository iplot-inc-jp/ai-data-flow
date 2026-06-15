# アップロードの共有プール統一（client直Blob→Attachment）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development または executing-plans。Steps は `- [ ]`。

**Goal:** 全ファイルアップロードを Vercel Blob への client 直アップロードに刷新し、`Attachment(blobUrl)` で共有プール化。アップロード（耐久化）と AI抽出（処理）を分離し、先にアップロード→取り込みは何度でも再開/再試行（再アップロード不要）。

**Architecture:** ブラウザ→Blob 直アップロード（token発行エンドポイント経由・関数を通らずサイズ制約なし）→ 完了後 register（冪等）で `Attachment(blobUrl, data=null)` 作成。配信は `data→blobUrl(302)→disk`。ナレッジ取り込みは ATTACHMENT ソース参照。Blob token 未設定（ローカル）はサーバ経由4MBにフォールバック。

**Tech Stack:** NestJS, Prisma(PostgreSQL `prisma db push`), `@vercel/blob`(server `put`/`/client` `handleUpload`+`upload`), Next.js, jest(backend), vitest(frontend)。

**前提:** backend dev=`npm run start:dev`(:5021)・pg :5460・FE :3007・demo@iplot.local/password123。スキーマ変更後 `npx prisma db push` ＋watch再起動。コミットは **feat/methodology-pipeline 上**（新ブランチ作らない）。backend に `@vercel/blob`^2.4.0 既存、frontend は追加要。

**現行コード確認済み（基盤コードはこれに準拠）:**
- `Attachment` create 形（attachment.controller.ts:182-215）: `id=uuid()`, `kind`= mime から IMAGE/PDF/FILE, `url=`/api/attachments/${id}/file``, `data=file.buffer`。`ATTACHMENT_SELECT`(44-) に data/blobUrl は無い。
- 配信 `serveFile`(attachment.controller.ts:558-585): `data!=null`→send / else 旧ディスク。
- `BlobStorageService`(blob-storage.service.ts): `save(key,bytes,ct)→{url}`, `read(urlOrKey)→Buffer`（https は Vercel Blob 公開ホストのみ許可＝blobUrl 読取可）。
- ingestion バイト取得 `fetchAttachmentBytes`(knowledge-ingestion.service.ts:436-460): `data`→Buffer / else `readUploadFile(disk)`。
- `assertProjectMember(prisma,projectId,userId)` ヘルパ（attachment.controller.ts 内）。

---

## File Structure
- Modify: `backend/prisma/schema.prisma`（Attachment.blobUrl）
- Create: `backend/src/presentation/controllers/blob-upload.controller.ts`（token発行＋register-blob）＋ `register-blob.spec.ts` 相当（use-case化せずcontrollerに薄く。テストは登録ロジックを純関数/サービス化して検証）
- Create: `backend/src/infrastructure/services/attachment-register.service.ts`（register の冪等ロジック・kind推定）＋ `.spec.ts`
- Modify: `backend/src/presentation/controllers/attachment.controller.ts`（serveFile に blobUrl 302・ATTACHMENT_SELECT に blobUrl 追加は不要）
- Modify: `backend/src/infrastructure/knowledge/knowledge-ingestion.service.ts`（fetchAttachmentBytes に blobUrl 分岐）
- Modify: `backend/src/app.module.ts`（BlobUploadController・AttachmentRegisterService 登録）
- Create: `frontend/src/lib/upload.ts`（uploadProjectFile: client直＋register / フォールバック）
- Modify: `frontend/package.json`（`@vercel/blob` 追加）
- Modify: `frontend/src/components/knowledge/NewBatchDialog.tsx`（アップロードタブ→uploadProjectFile→ATTACHMENTソース）
- Modify: 各添付UI（背景/タスク/io-types/DFD/業務定義）→ uploadProjectFile
- 再利用: `lib/project-attachments.ts`（サーバ経由フォールバックに流用）, `knowledge.ts`。

---

## Task 1: schema — Attachment.blobUrl

**Files:** `backend/prisma/schema.prisma`

- [ ] **Step 1: model Attachment に追加**（`data Bytes?` の近く）
```prisma
  blobUrl String? @map("blob_url") // Vercel Blob 公開URL。これがあれば data は使わない（取得/配信は data→blobUrl→url の順）。
```
- [ ] **Step 2: db push**
Run: `cd backend && npx prisma db push --schema=./prisma/schema.prisma`
Expected: `in sync`＋client 再生成。
- [ ] **Step 3: build**
Run: `cd backend && npm run build` → 成功。
- [ ] **Step 4: Commit**
```bash
git add backend/prisma/schema.prisma
git commit -m "feat(uploads): Attachment.blobUrl 追加（Blob参照・migration）"
```

---

## Task 2: backend — register サービス（冪等・kind推定）

**Files:** Create `backend/src/infrastructure/services/attachment-register.service.ts` ＋ `.spec.ts`、Modify `app.module.ts`

> register は「同じ blobUrl の Attachment があれば返す（冪等）、無ければ作成」。kind は mime から。client の register と本番 onUploadCompleted の二重を防ぐ。

- [ ] **Step 1: 失敗するテスト**
```ts
// backend/src/infrastructure/services/attachment-register.service.spec.ts
import { AttachmentRegisterService } from './attachment-register.service';

function makePrisma(existing?: any) {
  return {
    attachment: {
      findFirst: jest.fn(async () => existing ?? null),
      count: jest.fn(async () => 0),
      create: jest.fn(async ({ data }: any) => ({ id: 'new1', ...data })),
    },
  } as any;
}

describe('AttachmentRegisterService', () => {
  const input = {
    projectId: 'p1',
    blobUrl: 'https://x.public.blob.vercel-storage.com/a.pdf',
    filename: 'a.pdf',
    mimeType: 'application/pdf',
    size: 123,
  };

  it('同じ blobUrl が既存ならそれを返す（冪等・create しない）', async () => {
    const prisma = makePrisma({ id: 'old1', blobUrl: input.blobUrl });
    const svc = new AttachmentRegisterService(prisma);
    const r = await svc.register(input);
    expect(r.id).toBe('old1');
    expect(prisma.attachment.create).not.toHaveBeenCalled();
  });

  it('未登録なら data=null・blobUrl・kind推定で作成', async () => {
    const prisma = makePrisma(null);
    const svc = new AttachmentRegisterService(prisma);
    const r = await svc.register(input);
    const arg = prisma.attachment.create.mock.calls[0][0].data;
    expect(arg.blobUrl).toBe(input.blobUrl);
    expect(arg.data).toBeNull();
    expect(arg.kind).toBe('PDF'); // application/pdf
    expect(arg.url).toBe(`/api/attachments/${arg.id}/file`);
  });

  it('image/* は IMAGE、その他は FILE', async () => {
    const prisma = makePrisma(null);
    const svc = new AttachmentRegisterService(prisma);
    await svc.register({ ...input, mimeType: 'image/png' });
    expect(prisma.attachment.create.mock.calls[0][0].data.kind).toBe('IMAGE');
    await svc.register({ ...input, mimeType: 'application/zip' });
    expect(prisma.attachment.create.mock.calls[1][0].data.kind).toBe('FILE');
  });
});
```
- [ ] **Step 2: 落ちる確認**: `cd backend && npx jest attachment-register` → FAIL（モジュール無し）。
- [ ] **Step 3: 実装**
```ts
// backend/src/infrastructure/services/attachment-register.service.ts
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../persistence/prisma/prisma.service';

export interface RegisterBlobInput {
  projectId: string;
  blobUrl: string;
  filename: string;
  mimeType: string;
  size: number;
  displayName?: string | null;
  folder?: string | null;
  phaseId?: string | null;
  taskId?: string | null;
  flowId?: string | null;
  informationTypeId?: string | null;
}

function kindFromMime(mime: string): 'IMAGE' | 'PDF' | 'FILE' {
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime === 'application/pdf') return 'PDF';
  return 'FILE';
}

/**
 * client が Blob へ直アップロードした後に Attachment 行を作る（冪等）。
 * 同じ blobUrl が既にあればそれを返す（client register と本番 onUploadCompleted の二重防止）。
 */
@Injectable()
export class AttachmentRegisterService {
  constructor(private readonly prisma: PrismaService) {}

  async register(input: RegisterBlobInput) {
    const existing = await this.prisma.attachment.findFirst({
      where: { projectId: input.projectId, blobUrl: input.blobUrl },
    });
    if (existing) return existing;

    const id = randomUUID();
    const order = await this.prisma.attachment.count({
      where: {
        projectId: input.projectId,
        phaseId: input.phaseId ?? null,
        taskId: input.taskId ?? null,
        informationTypeId: input.informationTypeId ?? null,
        flowId: input.flowId ?? null,
      },
    });
    return this.prisma.attachment.create({
      data: {
        id,
        projectId: input.projectId,
        phaseId: input.phaseId ?? null,
        taskId: input.taskId ?? null,
        flowId: input.flowId ?? null,
        informationTypeId: input.informationTypeId ?? null,
        kind: kindFromMime(input.mimeType),
        filename: input.filename,
        displayName: input.displayName ?? null,
        folder: input.folder ?? null,
        mimeType: input.mimeType,
        url: `/api/attachments/${id}/file`,
        size: input.size,
        order,
        data: null,
        blobUrl: input.blobUrl,
      },
    });
  }
}
```
- [ ] **Step 4: 通る確認**: `npx jest attachment-register` → PASS（3件）。
- [ ] **Step 5: app.module providers に `AttachmentRegisterService` 追加＋import。** build。
- [ ] **Step 6: Commit**
```bash
git add backend/src/infrastructure/services/attachment-register.service.ts backend/src/infrastructure/services/attachment-register.service.spec.ts backend/src/app.module.ts
git commit -m "feat(uploads): AttachmentRegisterService（blobUrl 冪等登録・kind推定）＋DI（+test）"
```

---

## Task 3: backend — token発行＋register エンドポイント

**Files:** Create `backend/src/presentation/controllers/blob-upload.controller.ts`、Modify `app.module.ts`

> `@vercel/blob/client` の `handleUpload` で client token を発行。register は AttachmentRegisterService 経由。

- [ ] **Step 1: controller 実装**
```ts
// backend/src/presentation/controllers/blob-upload.controller.ts
import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, CurrentUserPayload } from '../decorators';
import { ProjectScopedAccess } from '../decorators/project-scoped-access.decorator';
import { ProjectAccessGuard } from '../guards/project-access.guard';
import { ProjectAccessService } from '../../infrastructure/services/project-access.service';
import {
  AttachmentRegisterService,
  RegisterBlobInput,
} from '../../infrastructure/services/attachment-register.service';

@ApiTags('アップロード(Blob)')
@ApiBearerAuth()
@ProjectScopedAccess()
@UseGuards(ProjectAccessGuard)
@Controller()
export class BlobUploadController {
  constructor(
    private readonly access: ProjectAccessService,
    private readonly register: AttachmentRegisterService,
  ) {}

  /**
   * client直アップロードの token 発行。@vercel/blob/client handleUpload。
   * BLOB_READ_WRITE_TOKEN 未設定（ローカル）なら 501 を返し、フロントはサーバ経由にフォールバック。
   */
  @Post('projects/:projectId/blob/upload-token')
  @ApiOperation({ summary: 'client直アップロードのトークン発行（Blob）' })
  async token(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      // フロントはこれを検知してサーバ経由 multipart にフォールバックする
      return { enabled: false };
    }
    const { handleUpload } = await import('@vercel/blob/client');
    return handleUpload({
      request: req,
      body: body as any,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async () => {
        await this.access.assertProjectAccess(projectId, user.id, 'edit');
        return {
          addRandomSuffix: true,
          maximumSizeInBytes: 100 * 1024 * 1024,
          // 許可 content-type は広め（ナレッジ/画像/PDF/Office/zip 等）
          allowedContentTypes: ['*/*'],
        };
      },
      // 本番のみ届く。ローカルは register に依存（冪等）。
      onUploadCompleted: async () => {
        /* no-op: 登録は client の register-blob で行う（冪等） */
      },
    });
  }

  @Post('projects/:projectId/attachments/register-blob')
  @ApiOperation({ summary: 'Blob直アップロード済みファイルを Attachment として登録（冪等）' })
  async registerBlob(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Body() body: Omit<RegisterBlobInput, 'projectId'>,
  ) {
    await this.access.assertProjectAccess(projectId, user.id, 'edit');
    return this.register.register({ ...body, projectId });
  }
}
```
> `handleUpload` の引数（request/body/token）は `@vercel/blob`^2.4.0 の `/client` 実装に合わせる。型が合わなければ `as any` で吸収しつつ、onBeforeGenerateToken の認可は必ず通す。`allowedContentTypes: ['*/*']` が不可なら主要 mime を列挙。
- [ ] **Step 2: app.module に `BlobUploadController` 登録＋import。** build。
- [ ] **Step 3: ライブ確認（後段 Task7 に集約）** — ここでは build のみ。
- [ ] **Step 4: Commit**
```bash
git add backend/src/presentation/controllers/blob-upload.controller.ts backend/src/app.module.ts
git commit -m "feat(uploads): Blob client直アップロードの token発行＋register-blob エンドポイント"
```

---

## Task 4: backend — 配信(302)＋ingestion バイト取得 の blobUrl 対応

**Files:** Modify `attachment.controller.ts`（serveFile）、`knowledge-ingestion.service.ts`（fetchAttachmentBytes）

- [ ] **Step 1: serveFile に blobUrl 分岐**（`data!=null` 送出の直後・旧ディスクの前）
```ts
    if (row.data != null) {
      res.send(Buffer.from(row.data));
      return;
    }
    // Blob 直アップロード: 公開URLへ 302 リダイレクト（関数を通さず最速）
    if ((row as { blobUrl?: string | null }).blobUrl) {
      res.redirect(302, (row as { blobUrl: string }).blobUrl);
      return;
    }
```
- [ ] **Step 2: fetchAttachmentBytes に blobUrl 分岐**（`att.data` 分岐の直後・disk の前）。現行を Read して合わせる:
```ts
    if (att.data != null) {
      return { bytes: Buffer.from(att.data), mimeType: att.mimeType };
    }
    if ((att as { blobUrl?: string | null }).blobUrl) {
      const bytes = await this.blob.read((att as { blobUrl: string }).blobUrl);
      return { bytes, mimeType: att.mimeType };
    }
    // 既存ディスク fallback（現行のまま）
```
> `fetchAttachmentBytes` が select で `blobUrl` を取得するよう、当該 findUnique/findFirst の select に `blobUrl: true` を足す（現行 select を Read して追加）。`data` も select 済みのはず。
- [ ] **Step 3: build＋既存テスト緑**: `cd backend && npm run build && npm test`。
- [ ] **Step 4: Commit**
```bash
git add backend/src/presentation/controllers/attachment.controller.ts backend/src/infrastructure/knowledge/knowledge-ingestion.service.ts
git commit -m "feat(uploads): 配信を data→blobUrl(302)→disk に・ingestion 取得に blobUrl 分岐"
```

---

## Task 5: frontend — 共有アップロード util（client直＋フォールバック）

**Files:** Modify `frontend/package.json`、Create `frontend/src/lib/upload.ts`

- [ ] **Step 1: 依存追加**
Run: `cd frontend && npm install @vercel/blob`
Expected: package.json に `@vercel/blob` 追加。
- [ ] **Step 2: 実装**
```ts
// frontend/src/lib/upload.ts
// 全添付の共有アップロード経路。Blob token があればブラウザ→Blob直アップロード→register、
// 無ければ（ローカル等）従来のサーバ経由 multipart 添付にフォールバック。
import { upload } from '@vercel/blob/client';
import { projectAttachmentApi, type ProjectAttachment } from '@/lib/project-attachments';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

export interface UploadScope {
  phaseId?: string;
  taskId?: string;
  flowId?: string;
  informationTypeId?: string;
  folder?: string;
  displayName?: string;
}

function authHeaders(json = true): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  const t = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

/**
 * 1ファイルをアップロードして Attachment を返す。
 * client直（Blob）を試し、token未設定/失敗時はサーバ経由(4MB)にフォールバック。
 */
export async function uploadProjectFile(
  projectId: string,
  file: File,
  scope: UploadScope = {},
): Promise<ProjectAttachment> {
  // 1) client直アップロード
  try {
    const blob = await upload(file.name, file, {
      access: 'public',
      handleUploadUrl: `${API_URL}/api/projects/${projectId}/blob/upload-token`,
      headers: authHeaders(false), // token エンドポイントは JwtAuthGuard 配下
    });
    // 2) register（冪等）
    const res = await fetch(
      `${API_URL}/api/projects/${projectId}/attachments/register-blob`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          blobUrl: blob.url,
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          ...scope,
        }),
      },
    );
    if (!res.ok) throw new Error('register-blob 失敗');
    return (await res.json()) as ProjectAttachment;
  } catch {
    // 3) フォールバック: サーバ経由 multipart（プロジェクト直下添付。4MB）
    //    scope 付き添付が要る箇所は呼び出し側で従来 API を使う（util は直下のみ）。
    return projectAttachmentApi.upload(projectId, file);
  }
}
```
> `@vercel/blob/client` の `upload` に `headers` で Authorization を渡せること（^2.x で対応）。渡せない版なら `fetchBeforeUpload`/`onUploadProgress` 等で代替するか、token エンドポイントを `@Public()` にして body の projectId+JWT を別途検証する設計に切替（その場合 onBeforeGenerateToken 内で手動 JWT 検証）。**実装時にSDK版を確認**。
> フォールバックは projectAttachmentApi.upload（直下）。scope付きが必須の画面は Task6 で個別に従来 scoped 添付 API を併用。
- [ ] **Step 3: tsc**: `cd frontend && npx tsc --noEmit` → 0。
- [ ] **Step 4: Commit**
```bash
git add frontend/package.json frontend/package-lock.json frontend/src/lib/upload.ts
git commit -m "feat(uploads): フロント共有アップロード util（client直Blob→register / サーバ経由フォールバック）"
```

---

## Task 6: frontend — ナレッジ取り込み「アップロード」を共有プール化（originating ask＋resume）

**Files:** Modify `frontend/src/components/knowledge/NewBatchDialog.tsx`、`frontend/src/lib/knowledge.ts`(必要なら)

- [ ] **Step 1: アップロードタブを uploadProjectFile に**
- 現行 `handleFiles`（`ingestionApi.upload` → uploads[]）を、`uploadProjectFile(projectId, file)` で Attachment を作る形に変更。返った Attachment を「選択済み既存添付」に加える（selectedAttIds に id を追加）か、uploads 相当の表示に。
- バッチ作成（handleSubmit）で UPLOAD ソースではなく **ATTACHMENT ソース**（sourceType:'ATTACHMENT', sourceRef: attachment.id, filename, mimeType, size）で送る。→ アップロード済みは即「既存添付」一覧にも出る（loadAttachments 再取得）。
- これで「先にアップロード→取り込みは attachmentId 参照で何度でも再開/再試行（再アップロード不要）」が成立（既存 resume/retry はそのまま）。
- [ ] **Step 2: tsc＋vitest＋build**: `cd frontend && npx tsc --noEmit && npm test && npm run build` → 緑。
- [ ] **Step 3: Commit**
```bash
git add "frontend/src/components/knowledge/NewBatchDialog.tsx" "frontend/src/lib/knowledge.ts"
git commit -m "feat(uploads): ナレッジ取り込みアップロードを共有プール化（client直→Attachment→ATTACHMENTソース）"
```

---

## Task 7: frontend — 残りの添付UIを共有 util に移行

**Files（現行の upload handler を Read して uploadProjectFile に置換。scope FK を渡す）:**
- `dashboard/.../tasks/[taskId]/page.tsx`（taskId scope）
- `dashboard/.../io-types/_components/IoAttachmentsPanel.tsx`（informationTypeId scope）
- `components/dfd/InformationTypeRegistry.tsx`（informationTypeId scope）
- `dashboard/.../background/page.tsx`（プロジェクト直下）
- 業務定義/業務フロー添付（flowId scope）があれば。

- [ ] **Step 1: 各 handler を uploadProjectFile(projectId, file, { <scopeFK> }) に置換。** scoped 添付エンドポイントが別にある画面は、フォールバック時に従来 scoped API を使うため、現行呼び出しは温存しつつ client直を優先する薄いラッパにする（実装時に各画面の現行 API を Read）。
- [ ] **Step 2: tsc＋vitest＋build** → 緑。
- [ ] **Step 3: Commit**
```bash
git add frontend/src
git commit -m "feat(uploads): 各添付UI（タスク/io-types/DFD/背景/フロー）を共有アップロード util に移行"
```

---

## Task 8: 最終検証＋ライブ smoke
- [ ] **Step 1:** backend `npm test && npm run build`（緑）。frontend `npx tsc --noEmit && npm test && npm run build`（緑）。
- [ ] **Step 2: ライブ smoke（ローカル）:**
  - BLOB_READ_WRITE_TOKEN 未設定時: アップロード→サーバ経由フォールバックで Attachment 作成→「既存添付」に出る（200）。
  - （token 設定可能なら）client直→register→Attachment(blobUrl)→配信 GET /attachments/:id/file が 302。
  - ナレッジ取り込み: アップロード→ATTACHMENTソースでバッチ→失敗/キャンセル後に resume/retry が再アップロード無しで再実行（IngestionFile status 遷移）。
- [ ] **Step 3: 受け入れ確認:**
  1. 任意の添付UIでアップロードしたファイルが「既存添付」に出る（共有プール）。
  2. Blob token 設定時、4MB超のファイルが上げられる（client直）。未設定時は4MBサーバ経由で従来通り動く。
  3. 配信が data→blobUrl(302)→disk。
  4. ナレッジ取り込みが ATTACHMENT 参照で再開/再試行に再アップロード不要。
  5. backend/frontend ともテスト・build 緑。
- [ ] **Step 4:** `git status --porcelain` 空。

---

## 自己レビュー（writing-plans）
- **スペック網羅:** Attachment.blobUrl=T1 / register冪等=T2 / token+register endpoint=T3 / 配信302+ingestion取得=T4 / 共有util+フォールバック=T5 / ナレッジ共有プール+resume=T6 / 全UI移行=T7 / 検証=T8。spec の A–E＋status/resume を全カバー。
- **プレースホルダ:** SDK 版依存箇所（handleUpload 引数・upload headers）は「実装時にSDK版を確認」と明示（volatile な外部API）。代替策も併記。他に TBD なし。
- **型整合:** `RegisterBlobInput`（service↔controller↔lib body）、`uploadProjectFile(projectId,file,scope)`、`blobUrl` の select 追加、配信/取得の `data→blobUrl→disk` 一貫。
- **スコープ:** 1機能（アップロード統一）。既存DB添付の移行・Drive・private は対象外（spec 通り）。
