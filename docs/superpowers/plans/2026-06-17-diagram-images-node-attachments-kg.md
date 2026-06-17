# 図への画像D&D配置 ＋ ノード添付(動画/PDF/画像) ＋ ナレッジグラフ連携 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users drag-drop movable/resizable images onto the 3 diagram canvases (業務フロー / DFD / オブジェクト関係マップ), attach video/PDF/image files to any node and view them inline, and have node-attachments flow into the knowledge graph automatically (with on-demand Claude extraction).

**Architecture:** One unified polymorphic data layer reused by all 3 canvases — `DiagramElement` (free canvas elements, keyed by `diagramKind+diagramId`), `NodeAttachment` (node↔file join, keyed by `nodeKind+nodeId`), and `KnowledgeNodeLink` (KG entity ↔ diagram node bridge). Storage reuses the existing `Attachment` + Vercel Blob + `uploadProjectFile()` pipeline. KG reuses `KnowledgeDocument`(sourceType=ATTACHMENT) + `KnowledgeMention`. Backend = thin NestJS controllers (image-board/annotation style, direct `PrismaService`). Frontend = a React Flow custom node + a hand-rolled SVG element for ObjectMap, plus a shared `NodeInspectorPanel`.

**Tech Stack:** NestJS + Prisma (Postgres) backend; Next.js + React 18 + `@xyflow/react` ^12 frontend; class-validator DTOs; jest (backend, mock-prisma) + vitest (frontend, `environment: node`, pure-function tests only — no jsdom).

## Global Constraints

- All backend routes are under the global prefix `api` (set in `backend/src/app-setup.ts:66` via `app.setGlobalPrefix('api')`). Do NOT add `/api` in `@Controller(...)`.
- DTOs use `class-validator`; the global `ValidationPipe` runs with `{ whitelist: true, forbidNonWhitelisted: true, transform: true }` — every accepted body field MUST have a validator decorator or it is stripped/rejected.
- Project-scoped routes (`projects/:projectId/...`) use `@ApiBearerAuth() @ProjectScopedAccess() @UseGuards(ProjectAccessGuard)`. Flat `:id` routes inject `ProjectAccessService` and call `assertProjectAccess(projectId, userId, 'view'|'edit')` after loading the row's `projectId`.
- DB changes are **additive**; apply with `cd backend && npx prisma db push` then `npx prisma generate`. (Repo has no `prisma migrate` scripts; `db push` is the convention.)
- New Prisma enums: `DiagramKind { FLOW DFD OBJECT_MAP }`, `DiagramElementType { IMAGE ICON TEXT SHAPE ARROW }`, `DiagramNodeKind { FLOW_NODE DFD_NODE DATA_OBJECT }`. v1 ships `DiagramElementType.IMAGE` only.
- `KnowledgeNodeType` is `TAG | ENTITY`; diagram nodes map to `ENTITY`. Dedup key for KG entities is `@@unique([projectId, type, normalizedLabel])`; normalize labels with `normalizeLabel()` from `backend/src/domain/value-objects/normalize-label.vo.ts`.
- Frontend API client style (copy from `frontend/src/lib/data-objects.ts`): `const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021'`; a `headers()` helper that reads `localStorage.getItem('accessToken')` and sets `Authorization: Bearer`. Attachment file URL = `${API_URL}/api/attachments/${id}/file` (public, no auth).
- Video: ≤100MB browser-direct upload, simple `<video controls>` playback (no streaming/transcoding).
- Frontend vitest env is `node` (see `frontend/vitest.config.ts`). Write vitest tests for PURE functions only. React components are verified via `tsc`, `next build`, and manual browser checks — do NOT write fake/placeholder component tests.

---

## Phase 1 — Data model

### Task 1: Add enums, models, and back-relations to Prisma schema

**Files:**
- Modify: `backend/prisma/schema.prisma` (Project relations ~220-289; Attachment ~1409-1441; KnowledgeNode ~2629-2651; add enums + 3 models near the existing `ImageBoard`/`KnowledgeNode` blocks)

**Interfaces:**
- Produces (Prisma client models consumed by every backend task): `prisma.diagramElement`, `prisma.nodeAttachment`, `prisma.knowledgeNodeLink`; enums `DiagramKind`, `DiagramElementType`, `DiagramNodeKind`.

- [ ] **Step 1: Add the three enums** near the other enums at the top of `schema.prisma` (e.g. just after `enum ImageBoardElementType`):

```prisma
enum DiagramKind { FLOW DFD OBJECT_MAP }            // OBJECT_MAP = オブジェクト関係マップ(DataObject節点・ObjectMapCanvas)
enum DiagramElementType { IMAGE ICON TEXT SHAPE ARROW } // v1出荷は IMAGE のみ
enum DiagramNodeKind { FLOW_NODE DFD_NODE DATA_OBJECT }
```

- [ ] **Step 2: Add the three models** (place after the `ImageBoardElement` model):

```prisma
// 機能①: 3図共通の装飾フリー要素（移動/リサイズ可な画像など）
model DiagramElement {
  id          String             @id @default(uuid())
  projectId   String             @map("project_id")
  diagramKind DiagramKind        @map("diagram_kind")
  diagramId   String             @map("diagram_id") // FLOW=BusinessFlow.id / DFD=DfdDiagram.id / OBJECT_MAP=projectId
  type        DiagramElementType @default(IMAGE)
  positionX   Float              @default(0) @map("position_x")
  positionY   Float              @default(0) @map("position_y")
  width       Float?
  height      Float?
  rotation    Float              @default(0)
  z           Int                @default(0)
  attachmentId String?           @map("attachment_id")
  text        String             @default("") @db.Text
  color       String?
  style       Json?
  createdAt   DateTime           @default(now()) @map("created_at")
  updatedAt   DateTime           @updatedAt @map("updated_at")
  project    Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  attachment Attachment? @relation(fields: [attachmentId], references: [id], onDelete: SetNull)
  @@index([projectId])
  @@index([diagramKind, diagramId])
  @@map("diagram_elements")
}

// 機能②: 3図のノードへの添付（ノード側はポリモーフィック=FKなし）
model NodeAttachment {
  id           String          @id @default(uuid())
  projectId    String          @map("project_id")
  nodeKind     DiagramNodeKind @map("node_kind")
  nodeId       String          @map("node_id")
  attachmentId String          @map("attachment_id")
  order        Int             @default(0)
  caption      String?
  createdAt    DateTime        @default(now()) @map("created_at")
  project    Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  attachment Attachment @relation(fields: [attachmentId], references: [id], onDelete: Cascade)
  @@unique([nodeKind, nodeId, attachmentId])
  @@index([projectId])
  @@index([nodeKind, nodeId])
  @@map("node_attachments")
}

// 機能③: KGエンティティ ⟷ 図ノード の橋渡し（net-new）
model KnowledgeNodeLink {
  id              String      @id @default(cuid())
  projectId       String
  knowledgeNodeId String
  diagramKind     DiagramKind
  diagramNodeId   String
  createdAt       DateTime    @default(now())
  knowledgeNode KnowledgeNode @relation(fields: [knowledgeNodeId], references: [id], onDelete: Cascade)
  @@unique([knowledgeNodeId, diagramKind, diagramNodeId])
  @@index([projectId])
  @@index([diagramKind, diagramNodeId])
}
```

- [ ] **Step 3: Add back-relations.** In `model Project` (before the closing `@@unique([organizationId, slug])`):

```prisma
  diagramElements    DiagramElement[]
  nodeAttachments    NodeAttachment[]
  knowledgeNodeLinks KnowledgeNodeLink[]
```

In `model Attachment` (before `@@map("attachments")`):

```prisma
  diagramElements DiagramElement[]
  nodeAttachments NodeAttachment[]
```

In `model KnowledgeNode` (after `inRelations`, before `@@unique`):

```prisma
  diagramLinks KnowledgeNodeLink[]
```

- [ ] **Step 4: Apply schema and regenerate client**

Run: `cd backend && npx prisma validate && npx prisma db push && npx prisma generate`
Expected: `The database is now in sync with your Prisma schema.` and `Generated Prisma Client`.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(db): DiagramElement / NodeAttachment / KnowledgeNodeLink models (additive)"
```

---

## Phase 2 — Backend: DiagramElement CRUD (機能①)

### Task 2: DiagramElement controllers

**Files:**
- Create: `backend/src/presentation/controllers/diagram-element.controller.ts`
- Modify: `backend/src/app.module.ts` (import + register both controllers)
- Test: `backend/src/presentation/controllers/diagram-element.controller.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `ProjectAccessService`, `ProjectAccessGuard`, `@ProjectScopedAccess`, `@CurrentUser`, `CurrentUserPayload` (same imports image-board.controller.ts uses).
- Produces (frontend Task 12 relies on these routes/shapes):
  - `GET  /api/projects/:projectId/diagram-elements?diagramKind=&diagramId=` → `DiagramElementDto[]`
  - `POST /api/projects/:projectId/diagram-elements` body `{diagramKind, diagramId, type?, positionX?, positionY?, width?, height?, z?, attachmentId?, text?, color?}` → `DiagramElementDto`
  - `PATCH /api/diagram-elements/:id` body `{positionX?, positionY?, width?, height?, z?, rotation?, color?, text?}` → `DiagramElementDto`
  - `DELETE /api/diagram-elements/:id` → 204
  - `DiagramElementDto = { id, projectId, diagramKind, diagramId, type, positionX, positionY, width, height, rotation, z, attachmentId, text, color, createdAt }`

- [ ] **Step 1: Write the failing test**

```typescript
// diagram-element.controller.spec.ts
import { DiagramElementController, DiagramElementByIdController } from './diagram-element.controller';

function makePrisma(overrides: any = {}) {
  return {
    diagramElement: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: any) => ({ id: 'de1', rotation: 0, z: 0, text: '', ...data })),
      findUnique: jest.fn(async () => ({ id: 'de1', projectId: 'p1' })),
      update: jest.fn(async ({ data }: any) => ({ id: 'de1', projectId: 'p1', ...data })),
      delete: jest.fn(async () => undefined),
    },
    ...overrides,
  } as any;
}
const access = () => ({ assertProjectAccess: jest.fn(async () => undefined) }) as any;
const user = { id: 'u1' } as any;

describe('DiagramElementController', () => {
  it('create persists diagramKind/diagramId/type with defaults', async () => {
    const prisma = makePrisma();
    const c = new DiagramElementController(prisma);
    const out = await c.create('p1', {
      diagramKind: 'FLOW', diagramId: 'f1', attachmentId: 'a1',
    } as any);
    const arg = prisma.diagramElement.create.mock.calls[0][0].data;
    expect(arg.projectId).toBe('p1');
    expect(arg.diagramKind).toBe('FLOW');
    expect(arg.type).toBe('IMAGE'); // default
    expect(out.id).toBe('de1');
  });

  it('list filters by diagramKind + diagramId', async () => {
    const prisma = makePrisma();
    const c = new DiagramElementController(prisma);
    await c.list('p1', 'FLOW' as any, 'f1');
    expect(prisma.diagramElement.findMany.mock.calls[0][0].where).toEqual({
      projectId: 'p1', diagramKind: 'FLOW', diagramId: 'f1',
    });
  });
});

describe('DiagramElementByIdController', () => {
  it('patch asserts edit access then updates only provided fields', async () => {
    const prisma = makePrisma();
    const acc = access();
    const c = new DiagramElementByIdController(prisma, acc);
    await c.patch(user, 'de1', { positionX: 10, positionY: 20 } as any);
    expect(acc.assertProjectAccess).toHaveBeenCalledWith('p1', 'u1', 'edit');
    const data = prisma.diagramElement.update.mock.calls[0][0].data;
    expect(data).toEqual({ positionX: 10, positionY: 20 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest diagram-element.controller -t "create persists"`
Expected: FAIL — cannot find module `./diagram-element.controller`.

- [ ] **Step 3: Write the controller** (copy decorators/auth from `image-board.controller.ts`):

```typescript
// diagram-element.controller.ts
import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException,
  Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { ProjectAccessService } from '../../infrastructure/services/project-access.service';
import { ProjectAccessGuard } from '../guards/project-access.guard';
import { ProjectScopedAccess } from '../decorators/project-scoped-access.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { CurrentUserPayload } from '../decorators/current-user.decorator';

const DIAGRAM_KINDS = ['FLOW', 'DFD', 'OBJECT_MAP'] as const;
const ELEMENT_TYPES = ['IMAGE', 'ICON', 'TEXT', 'SHAPE', 'ARROW'] as const;

class CreateDiagramElementDto {
  @IsIn(DIAGRAM_KINDS) diagramKind!: (typeof DIAGRAM_KINDS)[number];
  @IsString() diagramId!: string;
  @IsOptional() @IsIn(ELEMENT_TYPES) type?: (typeof ELEMENT_TYPES)[number];
  @IsOptional() @IsNumber() positionX?: number;
  @IsOptional() @IsNumber() positionY?: number;
  @IsOptional() @IsNumber() width?: number;
  @IsOptional() @IsNumber() height?: number;
  @IsOptional() @IsNumber() z?: number;
  @IsOptional() @IsString() attachmentId?: string;
  @IsOptional() @IsString() text?: string;
  @IsOptional() @IsString() color?: string;
}
class PatchDiagramElementDto {
  @IsOptional() @IsNumber() positionX?: number;
  @IsOptional() @IsNumber() positionY?: number;
  @IsOptional() @IsNumber() width?: number;
  @IsOptional() @IsNumber() height?: number;
  @IsOptional() @IsNumber() z?: number;
  @IsOptional() @IsNumber() rotation?: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() text?: string;
}

function toDto(e: any) {
  return {
    id: e.id, projectId: e.projectId, diagramKind: e.diagramKind, diagramId: e.diagramId,
    type: e.type, positionX: e.positionX, positionY: e.positionY, width: e.width ?? null,
    height: e.height ?? null, rotation: e.rotation ?? 0, z: e.z ?? 0,
    attachmentId: e.attachmentId ?? null, text: e.text ?? '', color: e.color ?? null,
    createdAt: e.createdAt,
  };
}

@ApiTags('図要素')
@ApiBearerAuth()
@ProjectScopedAccess()
@UseGuards(ProjectAccessGuard)
@Controller('projects/:projectId/diagram-elements')
export class DiagramElementController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Param('projectId') projectId: string,
    @Query('diagramKind') diagramKind: (typeof DIAGRAM_KINDS)[number],
    @Query('diagramId') diagramId: string,
  ) {
    const rows = await this.prisma.diagramElement.findMany({
      where: { projectId, diagramKind, diagramId },
      orderBy: [{ z: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toDto);
  }

  @Post()
  async create(@Param('projectId') projectId: string, @Body() dto: CreateDiagramElementDto) {
    const created = await this.prisma.diagramElement.create({
      data: {
        projectId, diagramKind: dto.diagramKind, diagramId: dto.diagramId,
        type: dto.type ?? 'IMAGE',
        positionX: dto.positionX ?? 0, positionY: dto.positionY ?? 0,
        width: dto.width ?? null, height: dto.height ?? null, z: dto.z ?? 0,
        attachmentId: dto.attachmentId ?? null, text: dto.text ?? '', color: dto.color ?? null,
      },
    });
    return toDto(created);
  }
}

@ApiTags('図要素')
@ApiBearerAuth()
@Controller('diagram-elements')
export class DiagramElementByIdController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  private async assert(id: string, userId: string, required: 'view' | 'edit') {
    const row = await this.prisma.diagramElement.findUnique({
      where: { id }, select: { projectId: true },
    });
    if (!row) throw new NotFoundException('図要素が見つかりません');
    await this.projectAccess.assertProjectAccess(row.projectId, userId, required);
  }

  @Patch(':id')
  async patch(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: PatchDiagramElementDto,
  ) {
    await this.assert(id, user.id, 'edit');
    const data: Prisma.DiagramElementUpdateInput = {};
    for (const k of ['positionX','positionY','width','height','z','rotation','color','text'] as const) {
      if (dto[k] !== undefined) (data as any)[k] = dto[k];
    }
    const updated = await this.prisma.diagramElement.update({ where: { id }, data });
    return toDto(updated);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    await this.assert(id, user.id, 'edit');
    await this.prisma.diagramElement.delete({ where: { id } });
  }
}
```

> Note: confirm the exact import paths for `PrismaService`, `ProjectScopedAccess`, `CurrentUser`, `ProjectAccessGuard`, `ProjectAccessService` by opening `image-board.controller.ts` and copying its import lines verbatim (paths above match that file's layout).

- [ ] **Step 4: Register controllers** in `backend/src/app.module.ts` — add to the imports block and the `controllers: [...]` array:

```typescript
import { DiagramElementController, DiagramElementByIdController } from './presentation/controllers/diagram-element.controller';
// ... in controllers: [...]
DiagramElementController,
DiagramElementByIdController,
```

- [ ] **Step 5: Run tests + build**

Run: `cd backend && npx jest diagram-element.controller && npx nest build`
Expected: tests PASS, build succeeds (0 errors).

- [ ] **Step 6: Commit**

```bash
git add backend/src/presentation/controllers/diagram-element.controller.ts backend/src/presentation/controllers/diagram-element.controller.spec.ts backend/src/app.module.ts
git commit -m "feat(api): DiagramElement CRUD (movable canvas elements)"
```

---

## Phase 3 — Backend: KG bridge service

### Task 3: DiagramKgBridgeService (ensureEntityForNode + registerAttachmentDocument)

**Files:**
- Create: `backend/src/infrastructure/knowledge/diagram-kg-bridge.service.ts`
- Modify: `backend/src/app.module.ts` (register as provider; or the knowledge module if one exists — match where `KnowledgeIngestionService` is provided)
- Test: `backend/src/infrastructure/knowledge/diagram-kg-bridge.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `normalizeLabel` from `backend/src/domain/value-objects/normalize-label.vo.ts`.
- Produces (Task 4 NodeAttachmentController + Task 6 extract use it):
  - `ensureEntityForNode(projectId: string, nodeKind: 'FLOW_NODE'|'DFD_NODE'|'DATA_OBJECT', nodeId: string, label: string): Promise<{ knowledgeNodeId: string }>`
  - `registerAttachmentDocument(input: { projectId: string; attachmentId: string; title: string; mimeType: string|null; blobUrl: string|null; linkNodeId?: string }): Promise<{ documentId: string }>`
  - `NODE_KIND_TO_DIAGRAM_KIND: Record<DiagramNodeKind, DiagramKind>` = `{ FLOW_NODE:'FLOW', DFD_NODE:'DFD', DATA_OBJECT:'OBJECT_MAP' }` (exported const)

- [ ] **Step 1: Write the failing test**

```typescript
// diagram-kg-bridge.service.spec.ts
import { DiagramKgBridgeService } from './diagram-kg-bridge.service';

function makePrisma() {
  return {
    knowledgeNode: { upsert: jest.fn(async () => ({ id: 'kn1' })) },
    knowledgeNodeLink: { upsert: jest.fn(async () => ({ id: 'lnk1' })) },
    knowledgeDocument: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ({ id: 'doc1', ...data })),
      update: jest.fn(async ({ data }: any) => ({ id: 'doc1', ...data })),
    },
    knowledgeMention: { createMany: jest.fn(async () => ({ count: 1 })) },
  } as any;
}

describe('DiagramKgBridgeService', () => {
  it('ensureEntityForNode upserts an ENTITY node by normalizedLabel and links it', async () => {
    const prisma = makePrisma();
    const svc = new DiagramKgBridgeService(prisma);
    const { knowledgeNodeId } = await svc.ensureEntityForNode('p1', 'FLOW_NODE', 'fn1', '受注 登録');
    expect(knowledgeNodeId).toBe('kn1');
    const up = prisma.knowledgeNode.upsert.mock.calls[0][0];
    expect(up.where.projectId_type_normalizedLabel).toEqual({
      projectId: 'p1', type: 'ENTITY', normalizedLabel: '受注 登録',
    });
    const link = prisma.knowledgeNodeLink.upsert.mock.calls[0][0];
    expect(link.where.knowledgeNodeId_diagramKind_diagramNodeId).toEqual({
      knowledgeNodeId: 'kn1', diagramKind: 'FLOW', diagramNodeId: 'fn1',
    });
  });

  it('registerAttachmentDocument dedups by (projectId, ATTACHMENT, attachmentId) and links a mention', async () => {
    const prisma = makePrisma();
    const svc = new DiagramKgBridgeService(prisma);
    const { documentId } = await svc.registerAttachmentDocument({
      projectId: 'p1', attachmentId: 'a1', title: 'spec.pdf',
      mimeType: 'application/pdf', blobUrl: 'https://x/a.pdf', linkNodeId: 'kn1',
    });
    expect(documentId).toBe('doc1');
    expect(prisma.knowledgeDocument.findFirst.mock.calls[0][0].where).toEqual({
      projectId: 'p1', sourceType: 'ATTACHMENT', sourceRef: 'a1',
    });
    expect(prisma.knowledgeMention.createMany).toHaveBeenCalledWith({
      data: [{ projectId: 'p1', documentId: 'doc1', nodeId: 'kn1' }],
      skipDuplicates: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest diagram-kg-bridge`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the service**

```typescript
// diagram-kg-bridge.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { normalizeLabel } from '../../domain/value-objects/normalize-label.vo';

export type DiagramNodeKind = 'FLOW_NODE' | 'DFD_NODE' | 'DATA_OBJECT';
export type DiagramKind = 'FLOW' | 'DFD' | 'OBJECT_MAP';

export const NODE_KIND_TO_DIAGRAM_KIND: Record<DiagramNodeKind, DiagramKind> = {
  FLOW_NODE: 'FLOW', DFD_NODE: 'DFD', DATA_OBJECT: 'OBJECT_MAP',
};

@Injectable()
export class DiagramKgBridgeService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureEntityForNode(
    projectId: string, nodeKind: DiagramNodeKind, nodeId: string, label: string,
  ): Promise<{ knowledgeNodeId: string }> {
    const normalizedLabel = normalizeLabel(label || '');
    const node = await this.prisma.knowledgeNode.upsert({
      where: { projectId_type_normalizedLabel: { projectId, type: 'ENTITY', normalizedLabel } },
      create: { projectId, type: 'ENTITY', label: label || normalizedLabel, normalizedLabel },
      update: {},
      select: { id: true },
    });
    await this.prisma.knowledgeNodeLink.upsert({
      where: {
        knowledgeNodeId_diagramKind_diagramNodeId: {
          knowledgeNodeId: node.id, diagramKind: NODE_KIND_TO_DIAGRAM_KIND[nodeKind], diagramNodeId: nodeId,
        },
      },
      create: {
        projectId, knowledgeNodeId: node.id,
        diagramKind: NODE_KIND_TO_DIAGRAM_KIND[nodeKind], diagramNodeId: nodeId,
      },
      update: {},
    });
    return { knowledgeNodeId: node.id };
  }

  async registerAttachmentDocument(input: {
    projectId: string; attachmentId: string; title: string;
    mimeType: string | null; blobUrl: string | null; linkNodeId?: string;
  }): Promise<{ documentId: string }> {
    const { projectId, attachmentId, title, mimeType, blobUrl, linkNodeId } = input;
    const existing = await this.prisma.knowledgeDocument.findFirst({
      where: { projectId, sourceType: 'ATTACHMENT', sourceRef: attachmentId },
      select: { id: true },
    });
    const data = { projectId, title, sourceType: 'ATTACHMENT' as const, sourceRef: attachmentId, blobUrl, mimeType };
    const doc = existing
      ? await this.prisma.knowledgeDocument.update({ where: { id: existing.id }, data, select: { id: true } })
      : await this.prisma.knowledgeDocument.create({ data, select: { id: true } });
    if (linkNodeId) {
      await this.prisma.knowledgeMention.createMany({
        data: [{ projectId, documentId: doc.id, nodeId: linkNodeId }],
        skipDuplicates: true,
      });
    }
    return { documentId: doc.id };
  }
}
```

> Confirm `PrismaService` import path matches the knowledge services (open `knowledge-ingestion.service.ts` — it lives in the same `infrastructure/knowledge/` dir; copy its `PrismaService` import).

- [ ] **Step 4: Register provider** in `backend/src/app.module.ts` (add `DiagramKgBridgeService` to the `providers: [...]` array; import it at top).

- [ ] **Step 5: Run tests + build**

Run: `cd backend && npx jest diagram-kg-bridge && npx nest build`
Expected: PASS + build OK.

- [ ] **Step 6: Commit**

```bash
git add backend/src/infrastructure/knowledge/diagram-kg-bridge.service.ts backend/src/infrastructure/knowledge/diagram-kg-bridge.service.spec.ts backend/src/app.module.ts
git commit -m "feat(kg): DiagramKgBridgeService — entity-for-node + attachment document"
```

---

## Phase 4 — Backend: NodeAttachment CRUD (機能② + auto KG register)

### Task 4: NodeAttachment controllers with KG auto-registration

**Files:**
- Create: `backend/src/presentation/controllers/node-attachment.controller.ts`
- Modify: `backend/src/app.module.ts` (register both controllers)
- Test: `backend/src/presentation/controllers/node-attachment.controller.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `ProjectAccessService`, `DiagramKgBridgeService` (Task 3), `ProjectAccessGuard`.
- Produces (frontend Task 11 NodeInspectorPanel relies on these):
  - `GET  /api/projects/:projectId/node-attachments?nodeKind=&nodeId=` → `NodeAttachmentDto[]`
  - `POST /api/projects/:projectId/node-attachments` body `{nodeKind, nodeId, attachmentId, caption?}` → `NodeAttachmentDto` (also runs KG auto-register)
  - `PATCH /api/node-attachments/:id` body `{order?, caption?}` → `NodeAttachmentDto`
  - `DELETE /api/node-attachments/:id` → 204
  - `NodeAttachmentDto = { id, projectId, nodeKind, nodeId, attachmentId, order, caption, attachment: { id, filename, displayName, mimeType, kind, size, url, pageRange } }`

- [ ] **Step 1: Write the failing test**

```typescript
// node-attachment.controller.spec.ts
import { NodeAttachmentController } from './node-attachment.controller';

const ATT = { id: 'a1', filename: 'spec.pdf', displayName: null, mimeType: 'application/pdf', kind: 'PDF', size: 9, url: '/api/attachments/a1/file', pageRange: null, blobUrl: 'https://x/a.pdf' };

function makePrisma() {
  return {
    flowNode: { findUnique: jest.fn(async () => ({ id: 'fn1', label: '受注登録', flow: { projectId: 'p1' } })) },
    attachment: { findUnique: jest.fn(async () => ATT) },
    nodeAttachment: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: any) => ({ id: 'na1', order: 0, caption: null, ...data, attachment: ATT })),
    },
  } as any;
}
const bridge = () => ({
  ensureEntityForNode: jest.fn(async () => ({ knowledgeNodeId: 'kn1' })),
  registerAttachmentDocument: jest.fn(async () => ({ documentId: 'doc1' })),
}) as any;

describe('NodeAttachmentController.create', () => {
  it('creates the join row and auto-registers the attachment into the KG', async () => {
    const prisma = makePrisma();
    const b = bridge();
    const c = new NodeAttachmentController(prisma, b);
    const out = await c.create('p1', { nodeKind: 'FLOW_NODE', nodeId: 'fn1', attachmentId: 'a1' } as any);
    expect(out.id).toBe('na1');
    expect(b.ensureEntityForNode).toHaveBeenCalledWith('p1', 'FLOW_NODE', 'fn1', '受注登録');
    expect(b.registerAttachmentDocument).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'p1', attachmentId: 'a1', linkNodeId: 'kn1', title: 'spec.pdf',
    }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest node-attachment.controller`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the controller** (`projects/:projectId/...` is guard-protected; the flat `:id` controller asserts manually). Node label lookup per `nodeKind`:

```typescript
// node-attachment.controller.ts
import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException,
  Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { ProjectAccessService } from '../../infrastructure/services/project-access.service';
import { DiagramKgBridgeService } from '../../infrastructure/knowledge/diagram-kg-bridge.service';
import { ProjectAccessGuard } from '../guards/project-access.guard';
import { ProjectScopedAccess } from '../decorators/project-scoped-access.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { CurrentUserPayload } from '../decorators/current-user.decorator';

const NODE_KINDS = ['FLOW_NODE', 'DFD_NODE', 'DATA_OBJECT'] as const;
type NodeKind = (typeof NODE_KINDS)[number];

const ATTACHMENT_SELECT = {
  id: true, filename: true, displayName: true, mimeType: true,
  kind: true, size: true, url: true, pageRange: true, blobUrl: true,
} as const;

class CreateNodeAttachmentDto {
  @IsIn(NODE_KINDS) nodeKind!: NodeKind;
  @IsString() nodeId!: string;
  @IsString() attachmentId!: string;
  @IsOptional() @IsString() caption?: string;
}
class PatchNodeAttachmentDto {
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsString() caption?: string;
}

function toDto(r: any) {
  return {
    id: r.id, projectId: r.projectId, nodeKind: r.nodeKind, nodeId: r.nodeId,
    attachmentId: r.attachmentId, order: r.order ?? 0, caption: r.caption ?? null,
    attachment: r.attachment ? { ...r.attachment } : null,
  };
}

@ApiTags('ノード添付')
@ApiBearerAuth()
@ProjectScopedAccess()
@UseGuards(ProjectAccessGuard)
@Controller('projects/:projectId/node-attachments')
export class NodeAttachmentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bridge: DiagramKgBridgeService,
  ) {}

  /** Load the node's label + verify it belongs to projectId. Returns label or throws. */
  private async resolveNode(projectId: string, kind: NodeKind, nodeId: string): Promise<string> {
    if (kind === 'FLOW_NODE') {
      const n = await this.prisma.flowNode.findUnique({ where: { id: nodeId }, select: { label: true, flow: { select: { projectId: true } } } });
      if (!n || n.flow.projectId !== projectId) throw new NotFoundException('ノードが見つかりません');
      return n.label;
    }
    if (kind === 'DFD_NODE') {
      const n = await this.prisma.dfdNode.findUnique({ where: { id: nodeId }, select: { label: true, diagram: { select: { projectId: true } } } });
      if (!n || n.diagram.projectId !== projectId) throw new NotFoundException('ノードが見つかりません');
      return n.label;
    }
    const n = await this.prisma.dataObject.findUnique({ where: { id: nodeId }, select: { name: true, projectId: true } });
    if (!n || n.projectId !== projectId) throw new NotFoundException('オブジェクトが見つかりません');
    return n.name;
  }

  @Get()
  async list(
    @Param('projectId') projectId: string,
    @Query('nodeKind') nodeKind: NodeKind,
    @Query('nodeId') nodeId: string,
  ) {
    const rows = await this.prisma.nodeAttachment.findMany({
      where: { projectId, nodeKind, nodeId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: { attachment: { select: ATTACHMENT_SELECT } },
    });
    return rows.map(toDto);
  }

  @Post()
  async create(@Param('projectId') projectId: string, @Body() dto: CreateNodeAttachmentDto) {
    const label = await this.resolveNode(projectId, dto.nodeKind, dto.nodeId);
    const att = await this.prisma.attachment.findUnique({ where: { id: dto.attachmentId }, select: ATTACHMENT_SELECT });
    if (!att) throw new NotFoundException('添付ファイルが見つかりません');

    const created = await this.prisma.nodeAttachment.create({
      data: { projectId, nodeKind: dto.nodeKind, nodeId: dto.nodeId, attachmentId: dto.attachmentId, caption: dto.caption ?? null },
      include: { attachment: { select: ATTACHMENT_SELECT } },
    });

    // KG 常時登録（無課金・決定的）。失敗しても添付自体は成功させる。
    try {
      const { knowledgeNodeId } = await this.bridge.ensureEntityForNode(projectId, dto.nodeKind, dto.nodeId, label);
      await this.bridge.registerAttachmentDocument({
        projectId, attachmentId: dto.attachmentId,
        title: att.displayName || att.filename, mimeType: att.mimeType,
        blobUrl: (att as any).blobUrl ?? null, linkNodeId: knowledgeNodeId,
      });
    } catch (e) {
      // best-effort; ログのみ
      console.warn('[node-attachment] KG register failed', e);
    }
    return toDto(created);
  }
}

@ApiTags('ノード添付')
@ApiBearerAuth()
@Controller('node-attachments')
export class NodeAttachmentByIdController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  private async assert(id: string, userId: string, required: 'view' | 'edit') {
    const row = await this.prisma.nodeAttachment.findUnique({ where: { id }, select: { projectId: true } });
    if (!row) throw new NotFoundException('ノード添付が見つかりません');
    await this.projectAccess.assertProjectAccess(row.projectId, userId, required);
  }

  @Patch(':id')
  async patch(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: PatchNodeAttachmentDto) {
    await this.assert(id, user.id, 'edit');
    const data: { order?: number; caption?: string } = {};
    if (dto.order !== undefined) data.order = dto.order;
    if (dto.caption !== undefined) data.caption = dto.caption;
    const updated = await this.prisma.nodeAttachment.update({
      where: { id }, data, include: { attachment: { select: ATTACHMENT_SELECT } },
    });
    return toDto(updated);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    await this.assert(id, user.id, 'edit');
    await this.prisma.nodeAttachment.delete({ where: { id } });
  }
}
```

- [ ] **Step 4: Register controllers** in `backend/src/app.module.ts` (import + add `NodeAttachmentController`, `NodeAttachmentByIdController` to `controllers`).

- [ ] **Step 5: Run tests + build**

Run: `cd backend && npx jest node-attachment.controller && npx nest build`
Expected: PASS + build OK.

- [ ] **Step 6: Commit**

```bash
git add backend/src/presentation/controllers/node-attachment.controller.ts backend/src/presentation/controllers/node-attachment.controller.spec.ts backend/src/app.module.ts
git commit -m "feat(api): NodeAttachment CRUD + auto KG document registration"
```

---

## Phase 5 — Backend: orphan cleanup on node delete

### Task 5: Clean up NodeAttachment / KnowledgeNodeLink / DiagramElement on node & diagram delete

**Files:**
- Create: `backend/src/infrastructure/knowledge/diagram-cleanup.service.ts`
- Create: `backend/src/infrastructure/knowledge/diagram-cleanup.service.spec.ts`
- Modify: `backend/src/application/use-cases/dfd/dfd-node.use-cases.ts` (`DeleteDfdNodeUseCase.execute`)
- Modify: `backend/src/application/use-cases/data-object/data-object.use-cases.ts` (`DeleteDataObjectUseCase.execute`)
- Modify: `backend/src/infrastructure/persistence/repositories/flow-node.repository.impl.ts` (`delete()`)

**Interfaces:**
- Consumes: `PrismaService`, `NODE_KIND_TO_DIAGRAM_KIND` (Task 3).
- Produces: `DiagramCleanupService.cleanupNode(nodeKind, nodeId): Promise<void>` — deletes `NodeAttachment` rows for the node and `KnowledgeNodeLink` rows for `(diagramKind, diagramNodeId)`.

- [ ] **Step 1: Write the failing test**

```typescript
// diagram-cleanup.service.spec.ts
import { DiagramCleanupService } from './diagram-cleanup.service';

function makePrisma() {
  return {
    nodeAttachment: { deleteMany: jest.fn(async () => ({ count: 2 })) },
    knowledgeNodeLink: { deleteMany: jest.fn(async () => ({ count: 1 })) },
  } as any;
}

describe('DiagramCleanupService.cleanupNode', () => {
  it('deletes node attachments and the matching knowledge-node links (DATA_OBJECT→OBJECT_MAP)', async () => {
    const prisma = makePrisma();
    const svc = new DiagramCleanupService(prisma);
    await svc.cleanupNode('DATA_OBJECT', 'do1');
    expect(prisma.nodeAttachment.deleteMany).toHaveBeenCalledWith({ where: { nodeKind: 'DATA_OBJECT', nodeId: 'do1' } });
    expect(prisma.knowledgeNodeLink.deleteMany).toHaveBeenCalledWith({ where: { diagramKind: 'OBJECT_MAP', diagramNodeId: 'do1' } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest diagram-cleanup`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the service**

```typescript
// diagram-cleanup.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { NODE_KIND_TO_DIAGRAM_KIND, type DiagramNodeKind } from './diagram-kg-bridge.service';

@Injectable()
export class DiagramCleanupService {
  constructor(private readonly prisma: PrismaService) {}

  async cleanupNode(nodeKind: DiagramNodeKind, nodeId: string): Promise<void> {
    await this.prisma.nodeAttachment.deleteMany({ where: { nodeKind, nodeId } });
    await this.prisma.knowledgeNodeLink.deleteMany({
      where: { diagramKind: NODE_KIND_TO_DIAGRAM_KIND[nodeKind], diagramNodeId: nodeId },
    });
  }
}
```

- [ ] **Step 4: Wire into the delete paths.** Register `DiagramCleanupService` as a provider in `app.module.ts`. Then:

`DeleteDfdNodeUseCase` — inject `DiagramCleanupService` in the constructor and call it after `deleteNode`:
```typescript
await this.repo.deleteNode(input.id);
await this.cleanup.cleanupNode('DFD_NODE', input.id);
```

`DeleteDataObjectUseCase` — inject and call after `this.repo.delete(input.id)`:
```typescript
await this.repo.delete(input.id);
await this.cleanup.cleanupNode('DATA_OBJECT', input.id);
```

`FlowNodeRepositoryImpl.delete` — inject `DiagramCleanupService` (or call `prisma.nodeAttachment.deleteMany` + `prisma.knowledgeNodeLink.deleteMany` inline if injecting a service into a repository is awkward), after `this.prisma.flowNode.delete`:
```typescript
await this.prisma.flowNode.delete({ where: { id } });
await this.prisma.nodeAttachment.deleteMany({ where: { nodeKind: 'FLOW_NODE', nodeId: id } });
await this.prisma.knowledgeNodeLink.deleteMany({ where: { diagramKind: 'FLOW', diagramNodeId: id } });
```

> Known limitation (document in commit body): deleting an entire BusinessFlow/DfdDiagram cascades its nodes via DB FK but does NOT run `cleanupNode` per node, and `DiagramElement` rows keyed by `diagramId=flowId/diagramId` are not FK-cascaded. These orphans are harmless (never listed for a missing node/diagram) and are swept by project deletion (Project FK cascade). A full diagram-level sweep is out of v1 scope.

- [ ] **Step 5: Run tests + build**

Run: `cd backend && npx jest diagram-cleanup && npx nest build`
Expected: PASS + build OK.

- [ ] **Step 6: Commit**

```bash
git add backend/src/infrastructure/knowledge/diagram-cleanup.service.ts backend/src/infrastructure/knowledge/diagram-cleanup.service.spec.ts backend/src/application/use-cases/dfd/dfd-node.use-cases.ts backend/src/application/use-cases/data-object/data-object.use-cases.ts backend/src/infrastructure/persistence/repositories/flow-node.repository.impl.ts backend/src/app.module.ts
git commit -m "feat(cleanup): remove orphan node-attachments/KG links on node delete"
```

---

## Phase 6 — Backend: on-demand AI extraction

### Task 6: POST /knowledge-documents/:id/extract

**Files:**
- Create: `backend/src/infrastructure/knowledge/knowledge-document-extract.service.ts`
- Create: `backend/src/infrastructure/knowledge/knowledge-document-extract.service.spec.ts`
- Modify: `backend/src/presentation/controllers/knowledge.controller.ts` (add `@Post(':id/extract')` to `KnowledgeDocumentController`)
- Modify: `backend/src/app.module.ts` (register the service)

**Interfaces:**
- Consumes: `PrismaService`; `ClaudeService.extractKnowledge(input, apiKey, model?, usage?)`; the company-API-key service and `LlmUsageContext` used by `KnowledgeIngestionService` (copy its constructor injections + import lines); `normalizeLabel`.
- Produces: `POST /api/knowledge-documents/:id/extract` → `{ created: { nodes: number; mentions: number } }`.

- [ ] **Step 1: Read the reuse points.** Open `backend/src/infrastructure/knowledge/knowledge-ingestion.service.ts` and copy verbatim into the new service: (a) the constructor injections for the company-API-key service (`this.companyKey`) and `ClaudeService` (`this.claude`); (b) `buildExtractInput(kind, bytes, extractedText, filename)` logic (or call it if exported); (c) the `resolveGate`-style read of `ProjectKnowledgeSettings.aiExtractionEnabled`. These are real, existing members — locate and reuse them.

- [ ] **Step 2: Write the failing test** (gate-disabled path needs no Claude call):

```typescript
// knowledge-document-extract.service.spec.ts
import { KnowledgeDocumentExtractService } from './knowledge-document-extract.service';

function makePrisma(aiEnabled: boolean) {
  return {
    knowledgeDocument: { findUnique: jest.fn(async () => ({ id: 'doc1', projectId: 'p1', sourceType: 'ATTACHMENT', sourceRef: 'a1', mimeType: 'application/pdf' })) },
    projectKnowledgeSettings: { findUnique: jest.fn(async () => ({ aiExtractionEnabled: aiEnabled })) },
  } as any;
}
const claude = () => ({ extractKnowledge: jest.fn() }) as any;
const companyKey = () => ({ resolveForProject: jest.fn(async () => 'sk-test') }) as any;

describe('KnowledgeDocumentExtractService', () => {
  it('does nothing and returns zeros when aiExtractionEnabled is false', async () => {
    const prisma = makePrisma(false);
    const cl = claude();
    const svc = new KnowledgeDocumentExtractService(prisma, cl, companyKey());
    const out = await svc.extract('doc1', 'u1');
    expect(cl.extractKnowledge).not.toHaveBeenCalled();
    expect(out).toEqual({ created: { nodes: 0, mentions: 0 }, skipped: 'AI_DISABLED' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx jest knowledge-document-extract`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the service.** Implement `extract(documentId, userId)`:
  1. Load the document; if `sourceType !== 'ATTACHMENT'` or no `sourceRef`, return `{ created: { nodes: 0, mentions: 0 }, skipped: 'NO_SOURCE' }`.
  2. Read `projectKnowledgeSettings.aiExtractionEnabled` (default `true`); if false return `{ created: { nodes: 0, mentions: 0 }, skipped: 'AI_DISABLED' }`.
  3. Resolve the API key via the company-key service (`resolveForProject(projectId, userId)`); if none, throw the same error message ingestion uses.
  4. Load the attachment bytes: `data → blobUrl(fetch) → disk` (mirror `attachment.controller.ts serveFile`); infer FileKind from mimeType.
  5. `const input = buildExtractInput(kind, bytes, null, filename)`; `const extraction = await this.claude.extractKnowledge(input, apiKey, model, { projectId, area: 'KNOWLEDGE_EXTRACTION', userId })`.
  6. Merge: for each extracted entity → `knowledgeNode.upsert` on `projectId_type_normalizedLabel` (type ENTITY) using `normalizeLabel(label)`; collect ids; `knowledgeMention.createMany({ data: ids.map(nodeId => ({ projectId, documentId, nodeId })), skipDuplicates: true })`. Return counts.

```typescript
// knowledge-document-extract.service.ts (skeleton — fill bytes-loading + entity loop per steps above)
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { ClaudeService } from '../services/claude.service';
import { normalizeLabel } from '../../domain/value-objects/normalize-label.vo';
// import the SAME company-key service type that KnowledgeIngestionService injects.

@Injectable()
export class KnowledgeDocumentExtractService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
    private readonly companyKey: any, // replace `any` with the real injected type from ingestion service
  ) {}

  async extract(documentId: string, userId: string) {
    const doc = await this.prisma.knowledgeDocument.findUnique({ where: { id: documentId } });
    if (!doc || doc.sourceType !== 'ATTACHMENT' || !doc.sourceRef) {
      return { created: { nodes: 0, mentions: 0 }, skipped: 'NO_SOURCE' as const };
    }
    const settings = await this.prisma.projectKnowledgeSettings.findUnique({
      where: { projectId: doc.projectId }, select: { aiExtractionEnabled: true },
    });
    if (settings && settings.aiExtractionEnabled === false) {
      return { created: { nodes: 0, mentions: 0 }, skipped: 'AI_DISABLED' as const };
    }
    // ... steps 3-6 ...
    return { created: { nodes: 0, mentions: 0 } };
  }
}
```

- [ ] **Step 5: Add the route** to `KnowledgeDocumentController` in `knowledge.controller.ts` (follow the existing `PATCH /knowledge-documents/:id` access pattern — load doc → projectId → assert edit):

```typescript
@Post(':id/extract')
async extract(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
  // assert edit access on the document's project (copy the assert helper this controller already uses), then:
  return this.extractService.extract(id, user.id);
}
```

- [ ] **Step 6: Run tests + build**

Run: `cd backend && npx jest knowledge-document-extract && npx nest build`
Expected: PASS + build OK.

- [ ] **Step 7: Commit**

```bash
git add backend/src/infrastructure/knowledge/knowledge-document-extract.service.ts backend/src/infrastructure/knowledge/knowledge-document-extract.service.spec.ts backend/src/presentation/controllers/knowledge.controller.ts backend/src/app.module.ts
git commit -m "feat(kg): on-demand Claude extraction for an attachment document"
```

---

## Phase 7 — Frontend: API clients + pure helpers

### Task 7: lib/diagram-elements.ts + lib/node-attachments.ts + lib/diagram-media.ts (with tests)

**Files:**
- Create: `frontend/src/lib/diagram-elements.ts`
- Create: `frontend/src/lib/node-attachments.ts`
- Create: `frontend/src/lib/diagram-media.ts`
- Test: `frontend/src/lib/diagram-media.test.ts`
- Modify: `frontend/src/lib/knowledge.ts` (add `extractDocument`) — only if a knowledge client exists; otherwise add the call to `node-attachments.ts`.

**Interfaces:**
- Produces (consumed by Tasks 8-12):
  - `diagramElementApi.list(projectId, diagramKind, diagramId): Promise<DiagramElementDto[]>`, `.create(projectId, body)`, `.patch(id, body)`, `.remove(id)`
  - `nodeAttachmentApi.list(projectId, nodeKind, nodeId): Promise<NodeAttachmentDto[]>`, `.create(projectId, body)`, `.patch(id, body)`, `.remove(id)`, `.fileUrl(attachmentId): string`
  - Types `DiagramKind`, `DiagramElementDto`, `DiagramNodeKind`, `NodeAttachmentDto`, `AttachmentMeta`
  - `inferMediaKind(mimeType: string): 'image'|'video'|'pdf'|'other'`

- [ ] **Step 1: Write the failing test** (pure helper only):

```typescript
// diagram-media.test.ts
import { describe, it, expect } from 'vitest';
import { inferMediaKind } from './diagram-media';

describe('inferMediaKind', () => {
  it('classifies by mime type', () => {
    expect(inferMediaKind('image/png')).toBe('image');
    expect(inferMediaKind('image/svg+xml')).toBe('image');
    expect(inferMediaKind('video/mp4')).toBe('video');
    expect(inferMediaKind('application/pdf')).toBe('pdf');
    expect(inferMediaKind('application/zip')).toBe('other');
    expect(inferMediaKind('')).toBe('other');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/diagram-media.test.ts`
Expected: FAIL — cannot find `./diagram-media`.

- [ ] **Step 3: Write `diagram-media.ts`**

```typescript
// diagram-media.ts
export type MediaKind = 'image' | 'video' | 'pdf' | 'other';
export function inferMediaKind(mimeType: string): MediaKind {
  const m = (mimeType || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m === 'application/pdf') return 'pdf';
  return 'other';
}
```

- [ ] **Step 4: Write the two API clients** (copy `headers()` + `API_URL` from `data-objects.ts`):

```typescript
// diagram-elements.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';
function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}
export type DiagramKind = 'FLOW' | 'DFD' | 'OBJECT_MAP';
export interface DiagramElementDto {
  id: string; projectId: string; diagramKind: DiagramKind; diagramId: string;
  type: 'IMAGE' | 'ICON' | 'TEXT' | 'SHAPE' | 'ARROW';
  positionX: number; positionY: number; width: number | null; height: number | null;
  rotation: number; z: number; attachmentId: string | null; text: string; color: string | null;
}
export const diagramElementApi = {
  async list(projectId: string, diagramKind: DiagramKind, diagramId: string): Promise<DiagramElementDto[]> {
    const q = new URLSearchParams({ diagramKind, diagramId });
    const res = await fetch(`${API_URL}/api/projects/${projectId}/diagram-elements?${q}`, { headers: headers() });
    if (!res.ok) throw new Error('図要素の取得に失敗しました');
    return res.json();
  },
  async create(projectId: string, body: Partial<DiagramElementDto> & { diagramKind: DiagramKind; diagramId: string }): Promise<DiagramElementDto> {
    const res = await fetch(`${API_URL}/api/projects/${projectId}/diagram-elements`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error('図要素の作成に失敗しました');
    return res.json();
  },
  async patch(id: string, body: Partial<DiagramElementDto>): Promise<DiagramElementDto> {
    const res = await fetch(`${API_URL}/api/diagram-elements/${id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error('図要素の更新に失敗しました');
    return res.json();
  },
  async remove(id: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/diagram-elements/${id}`, { method: 'DELETE', headers: headers() });
    if (!res.ok && res.status !== 204) throw new Error('図要素の削除に失敗しました');
  },
};
```

```typescript
// node-attachments.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';
function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}
export type DiagramNodeKind = 'FLOW_NODE' | 'DFD_NODE' | 'DATA_OBJECT';
export interface AttachmentMeta {
  id: string; filename: string; displayName: string | null; mimeType: string;
  kind: 'IMAGE' | 'PDF' | 'FILE'; size: number; url: string; pageRange: string | null;
}
export interface NodeAttachmentDto {
  id: string; projectId: string; nodeKind: DiagramNodeKind; nodeId: string;
  attachmentId: string; order: number; caption: string | null; attachment: AttachmentMeta | null;
}
export const nodeAttachmentApi = {
  fileUrl(attachmentId: string): string { return `${API_URL}/api/attachments/${attachmentId}/file`; },
  async list(projectId: string, nodeKind: DiagramNodeKind, nodeId: string): Promise<NodeAttachmentDto[]> {
    const q = new URLSearchParams({ nodeKind, nodeId });
    const res = await fetch(`${API_URL}/api/projects/${projectId}/node-attachments?${q}`, { headers: headers() });
    if (!res.ok) throw new Error('ノード添付の取得に失敗しました');
    return res.json();
  },
  async create(projectId: string, body: { nodeKind: DiagramNodeKind; nodeId: string; attachmentId: string; caption?: string }): Promise<NodeAttachmentDto> {
    const res = await fetch(`${API_URL}/api/projects/${projectId}/node-attachments`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error('ノード添付の作成に失敗しました');
    return res.json();
  },
  async patch(id: string, body: { order?: number; caption?: string }): Promise<NodeAttachmentDto> {
    const res = await fetch(`${API_URL}/api/node-attachments/${id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error('ノード添付の更新に失敗しました');
    return res.json();
  },
  async remove(id: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/node-attachments/${id}`, { method: 'DELETE', headers: headers() });
    if (!res.ok && res.status !== 204) throw new Error('ノード添付の削除に失敗しました');
  },
  async extractDocument(documentId: string): Promise<{ created: { nodes: number; mentions: number } }> {
    const res = await fetch(`${API_URL}/api/knowledge-documents/${documentId}/extract`, { method: 'POST', headers: headers() });
    if (!res.ok) throw new Error('AI抽出に失敗しました');
    return res.json();
  },
};
```

- [ ] **Step 5: Run test + typecheck**

Run: `cd frontend && npx vitest run src/lib/diagram-media.test.ts && npx tsc --noEmit`
Expected: test PASS, tsc 0 errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/diagram-elements.ts frontend/src/lib/node-attachments.ts frontend/src/lib/diagram-media.ts frontend/src/lib/diagram-media.test.ts
git commit -m "feat(web): diagram-element + node-attachment API clients + media helpers"
```

---

## Phase 8 — Frontend: shared NodeInspectorPanel (機能②)

### Task 8: AttachmentViewer + NodeInspectorPanel

**Files:**
- Create: `frontend/src/components/diagram/AttachmentViewer.tsx`
- Create: `frontend/src/components/diagram/NodeInspectorPanel.tsx`

**Interfaces:**
- Consumes: `nodeAttachmentApi`, `inferMediaKind`, `uploadProjectFile` (`frontend/src/lib/upload.ts`), `FileDropZone` (`frontend/src/components/ui/file-drop-zone.tsx`).
- Produces: `<NodeInspectorPanel projectId nodeKind nodeId nodeLabel onClose />` (default export or named), used by Tasks 10-12. `<AttachmentViewer attachment={AttachmentMeta} />`.

- [ ] **Step 1: Write `AttachmentViewer.tsx`** — renders by media kind:

```tsx
import { nodeAttachmentApi, type AttachmentMeta } from '@/lib/node-attachments';
import { inferMediaKind } from '@/lib/diagram-media';
import { FileText } from 'lucide-react';

export function AttachmentViewer({ attachment }: { attachment: AttachmentMeta }) {
  const url = nodeAttachmentApi.fileUrl(attachment.id);
  const kind = inferMediaKind(attachment.mimeType);
  if (kind === 'image') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={attachment.filename} className="max-h-80 w-full rounded bg-gray-100 object-contain" />;
  }
  if (kind === 'video') {
    return <video src={url} controls className="max-h-80 w-full rounded bg-black" />;
  }
  if (kind === 'pdf') {
    return <iframe src={url} title={attachment.filename} className="h-80 w-full rounded border" />;
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 underline">
      <FileText className="h-4 w-4" /> {attachment.displayName || attachment.filename}
    </a>
  );
}
```

- [ ] **Step 2: Write `NodeInspectorPanel.tsx`** — a floating right panel with 添付 / ナレッジグラフ tabs. Loads attachments on mount; `FileDropZone` → `uploadProjectFile(projectId, file)` → `nodeAttachmentApi.create(...)`; list with `AttachmentViewer` + delete; KG tab shows linked docs + an "AI抽出" button calling `nodeAttachmentApi.extractDocument(documentId)`.

```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import { X, Trash2, Sparkles } from 'lucide-react';
import { FileDropZone } from '@/components/ui/file-drop-zone';
import { uploadProjectFile } from '@/lib/upload';
import { nodeAttachmentApi, type DiagramNodeKind, type NodeAttachmentDto } from '@/lib/node-attachments';
import { AttachmentViewer } from './AttachmentViewer';

export interface NodeInspectorPanelProps {
  projectId: string;
  nodeKind: DiagramNodeKind;
  nodeId: string;
  nodeLabel: string;
  onClose: () => void;
}

export function NodeInspectorPanel({ projectId, nodeKind, nodeId, nodeLabel, onClose }: NodeInspectorPanelProps) {
  const [items, setItems] = useState<NodeAttachmentDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'files' | 'kg'>('files');

  const reload = useCallback(() => {
    nodeAttachmentApi.list(projectId, nodeKind, nodeId).then(setItems).catch(() => setItems([]));
  }, [projectId, nodeKind, nodeId]);
  useEffect(() => { reload(); }, [reload]);

  const onFiles = useCallback(async (files: File[]) => {
    setBusy(true);
    try {
      for (const f of files) {
        const att = await uploadProjectFile(projectId, f);
        await nodeAttachmentApi.create(projectId, { nodeKind, nodeId, attachmentId: att.id });
      }
      reload();
    } finally { setBusy(false); }
  }, [projectId, nodeKind, nodeId, reload]);

  const remove = useCallback(async (id: string) => {
    await nodeAttachmentApi.remove(id); reload();
  }, [reload]);

  return (
    <div className="absolute right-3 top-3 z-30 w-80 rounded-lg border border-gray-200 bg-white shadow-lg">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="truncate text-sm font-semibold text-gray-700">{nodeLabel}</span>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex border-b text-xs">
        <button type="button" onClick={() => setTab('files')} className={`flex-1 py-2 ${tab === 'files' ? 'border-b-2 border-blue-500 font-semibold text-blue-600' : 'text-gray-500'}`}>添付</button>
        <button type="button" onClick={() => setTab('kg')} className={`flex-1 py-2 ${tab === 'kg' ? 'border-b-2 border-blue-500 font-semibold text-blue-600' : 'text-gray-500'}`}>ナレッジグラフ</button>
      </div>
      {tab === 'files' && (
        <div className="space-y-2 p-3">
          <FileDropZone onFiles={onFiles} busy={busy} accept="image/*,video/*,application/pdf" />
          <ul className="space-y-3">
            {items.map((it) => (
              <li key={it.id} className="rounded border p-2">
                {it.attachment && <AttachmentViewer attachment={it.attachment} />}
                <div className="mt-1 flex items-center justify-between">
                  <span className="truncate text-[11px] text-gray-500">{it.attachment?.displayName || it.attachment?.filename}</span>
                  <button type="button" onClick={() => remove(it.id)} className="text-red-500 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </li>
            ))}
            {items.length === 0 && <li className="text-center text-[11px] text-gray-400">添付はまだありません</li>}
          </ul>
        </div>
      )}
      {tab === 'kg' && (
        <div className="space-y-2 p-3 text-xs text-gray-600">
          <p>添付したファイルは自動的にナレッジグラフに登録されています。下のボタンでAI抽出（$）を実行できます。</p>
          {/* For v1, AI抽出 runs per-document; reuse the document ids surfaced by the graph view, or expose them later. */}
          <button type="button" className="inline-flex items-center gap-1 rounded bg-violet-600 px-2 py-1 text-white disabled:opacity-50" disabled>
            <Sparkles className="h-3.5 w-3.5" /> AI抽出（ナレッジグラフ画面から実行）
          </button>
        </div>
      )}
    </div>
  );
}
```

> The KG tab's per-document "AI抽出" wiring is intentionally minimal in v1 (the button is enabled on the dedicated knowledge-graph screen where document ids are listed). The `extractDocument` client (Task 7) is ready; full inline wiring is a fast follow.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/diagram/AttachmentViewer.tsx frontend/src/components/diagram/NodeInspectorPanel.tsx
git commit -m "feat(web): NodeInspectorPanel — node attachments + inline viewers"
```

---

## Phase 9 — Frontend: shared image-element React Flow node + drop helper

### Task 9: ImageElementNode + canvas drop helper (with test)

**Files:**
- Create: `frontend/src/components/diagram/ImageElementNode.tsx`
- Create: `frontend/src/components/diagram/diagram-drop.ts`
- Test: `frontend/src/components/diagram/diagram-drop.test.ts`

**Interfaces:**
- Produces:
  - `ImageElementNode` — React Flow custom node (`type: 'imageElement'`), data `{ url: string; onResizeEnd?: (id, {width,height}) => void }`, renders `<img>` filling the node + a `NodeResizer` when selected.
  - `firstImageOrMediaFile(files: File[]): File | null` and `isDroppableMedia(file: File): boolean` (pure; image/video/pdf accepted, image preferred for canvas placement) — image-only for canvas elements: `firstImageFile(files): File | null`.

- [ ] **Step 1: Write the failing test** (pure helper):

```typescript
// diagram-drop.test.ts
import { describe, it, expect } from 'vitest';
import { firstImageFile } from './diagram-drop';

const f = (name: string, type: string) => new File(['x'], name, { type });

describe('firstImageFile', () => {
  it('returns the first image file, ignoring non-images', () => {
    expect(firstImageFile([f('a.pdf','application/pdf'), f('b.png','image/png')])?.name).toBe('b.png');
    expect(firstImageFile([f('a.txt','text/plain')])).toBeNull();
    expect(firstImageFile([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/diagram/diagram-drop.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `diagram-drop.ts`**

```typescript
// diagram-drop.ts
export function firstImageFile(files: File[]): File | null {
  return files.find((f) => (f.type || '').toLowerCase().startsWith('image/')) ?? null;
}
```

- [ ] **Step 4: Write `ImageElementNode.tsx`** (mirror `ContentNode`'s NodeResizer usage):

```tsx
import { NodeResizer } from '@xyflow/react';

export type ImageElementNodeData = {
  url: string;
  onResizeEnd?: (id: string, size: { width: number; height: number }) => void;
};

export function ImageElementNode({ id, data, selected }: { id: string; data: ImageElementNodeData; selected?: boolean }) {
  return (
    <div className={`h-full w-full overflow-hidden rounded ${selected ? 'ring-2 ring-blue-500' : ''}`}>
      {data.onResizeEnd && (
        <NodeResizer
          minWidth={40} minHeight={40} isVisible={!!selected} keepAspectRatio={false}
          onResizeEnd={(_, p) => data.onResizeEnd?.(id, { width: Math.round(p.width), height: Math.round(p.height) })}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={data.url} alt="" className="h-full w-full object-contain" draggable={false} />
    </div>
  );
}
```

- [ ] **Step 5: Run test + typecheck**

Run: `cd frontend && npx vitest run src/components/diagram/diagram-drop.test.ts && npx tsc --noEmit`
Expected: PASS + 0 errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/diagram/ImageElementNode.tsx frontend/src/components/diagram/diagram-drop.ts frontend/src/components/diagram/diagram-drop.test.ts
git commit -m "feat(web): shared image-element React Flow node + drop helper"
```

---

## Phase 10 — Frontend: wire DFD canvas (machine: easiest React Flow path first)

### Task 10: DFD canvas — image drop, image-element node, node-click inspector

**Files:**
- Modify: `frontend/src/components/flow-editor/DfdCanvas.tsx` (or the path confirmed in survey — DFD canvas component)
- Modify: the DFD page that hosts `DfdCanvas` (passes `projectId`; provides diagram id = `DfdDiagram.id`)

**Interfaces:**
- Consumes: `diagramElementApi`, `ImageElementNode`, `firstImageFile`, `uploadProjectFile`, `NodeInspectorPanel`, `useReactFlow().screenToFlowPosition`.

- [ ] **Step 1: Register the node type.** Add `imageElement: ImageElementNode` to DfdCanvas `nodeTypes` (currently `{ function, external, datastore, boundary, annotation }`).

- [ ] **Step 2: Load + render image elements.** On mount (or via props), `diagramElementApi.list(projectId, 'DFD', diagramId)` → map each to a React Flow node `{ id, type: 'imageElement', position: { x: positionX, y: positionY }, width, height, data: { url: nodeAttachmentApi.fileUrl(attachmentId), onResizeEnd } }`, and concatenate into the `nodes` array passed to `<ReactFlow>`. Use `attachmentId` → `fileUrl`.

- [ ] **Step 3: Handle drop.** Add `onDrop`/`onDragOver` to the `<ReactFlow>` wrapper:

```tsx
const { screenToFlowPosition } = useReactFlow();
const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };
const onDrop = async (e: React.DragEvent) => {
  e.preventDefault();
  const file = firstImageFile(Array.from(e.dataTransfer.files));
  if (!file) return;
  const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
  const att = await uploadProjectFile(projectId, file);
  const created = await diagramElementApi.create(projectId, {
    diagramKind: 'DFD', diagramId, type: 'IMAGE', attachmentId: att.id,
    positionX: pos.x, positionY: pos.y, width: 200, height: 150,
  });
  // append created to local image-element state and re-render
};
```

- [ ] **Step 4: Persist move/resize.** For `imageElement` nodes, in `handleNodeDragStop` call `diagramElementApi.patch(node.id, { positionX: node.position.x, positionY: node.position.y })`; in `onResizeEnd` call `diagramElementApi.patch(id, { width, height })`. (Distinguish by `node.type === 'imageElement'`.)

- [ ] **Step 5: Node-click inspector.** In the existing `onNodeClick`, when a real DFD node (`function`/`external`/`datastore`) is clicked, set state `{ nodeId, nodeLabel }` and render `<NodeInspectorPanel projectId nodeKind="DFD_NODE" nodeId nodeLabel onClose=... />`. Skip `boundary`/`annotation`/`imageElement`.

- [ ] **Step 6: Verify**

Run: `cd frontend && npx tsc --noEmit && npx next build`
Then manual: open a DFD diagram → drag a PNG onto the canvas (appears, movable, resizable, survives reload) → click a function node → panel opens → drop a PDF + an MP4 → both list and play/preview → reload → attachments persist.
Expected: tsc/build clean; manual behaviors all pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/flow-editor/DfdCanvas.tsx <dfd page path>
git commit -m "feat(web): DFD canvas — image drop + node attachment inspector"
```

---

## Phase 11 — Frontend: wire 業務フロー (SwimlaneCanvas)

### Task 11: SwimlaneCanvas — image drop, image-element node, node-click inspector

**Files:**
- Modify: `frontend/src/components/flow-editor/SwimlaneCanvas.tsx`
- Modify: the flow page hosting `SwimlaneCanvas` (provides `projectId`; diagram id = `BusinessFlow.id`)

**Interfaces:** same as Task 10 with `diagramKind: 'FLOW'`, `nodeKind: 'FLOW_NODE'`.

- [ ] **Step 1: Register `imageElement: ImageElementNode`** in SwimlaneCanvas `nodeTypes` (currently `{ content, lane, annotation }`).

- [ ] **Step 2: Load + render** `diagramElementApi.list(projectId, 'FLOW', flowId)` as `imageElement` nodes (same mapping as Task 10 Step 2).

- [ ] **Step 3: Drop handler** on the ReactFlow wrapper (same as Task 10 Step 3 but `diagramKind: 'FLOW'`). SwimlaneCanvas already wraps with `ReactFlowProvider`, so `useReactFlow().screenToFlowPosition` is available in the inner component.

- [ ] **Step 4: Persist move/resize.** SwimlaneCanvas saves flow-node positions via the 整形 batch path, but `imageElement` nodes are independent: add an `onNodeDragStop` branch (or augment the existing one) that, when `node.type === 'imageElement'`, calls `diagramElementApi.patch(node.id, { positionX, positionY })`; wire `onResizeEnd` → `diagramElementApi.patch(id, { width, height })`.

- [ ] **Step 5: Node-click inspector.** SwimlaneCanvas uses a context-menu/selection model rather than a click panel. Add: on single click of a `content` node, set `{ nodeId, nodeLabel }` and render `<NodeInspectorPanel projectId nodeKind="FLOW_NODE" nodeId nodeLabel onClose />`. Do not interfere with the existing double-click (open child flow) / context-menu behaviors — gate the panel open on a plain left click without drag.

- [ ] **Step 6: Verify**

Run: `cd frontend && npx tsc --noEmit && npx next build`
Then manual: open a 業務フロー → drop image (movable/resizable/persists) → click a 業務 node → attach image/PDF/video → view → reload persists → double-click child-flow node still opens child flow (regression check).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/flow-editor/SwimlaneCanvas.tsx <flow page path>
git commit -m "feat(web): 業務フロー canvas — image drop + node attachment inspector"
```

---

## Phase 12 — Frontend: wire オブジェクト関係マップ (ObjectMapCanvas, hand-rolled SVG)

### Task 12: ObjectMapCanvas — SVG image element (drag/resize) + DataObject-click inspector

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/projects/[projectId]/object-map/_components/ObjectMapCanvas.tsx`
- Modify: `frontend/src/app/(dashboard)/dashboard/projects/[projectId]/object-map/page.tsx`

**Interfaces:** Consumes `diagramElementApi` (diagramKind `'OBJECT_MAP'`, diagramId = `projectId`), `nodeAttachmentApi.fileUrl`, `NodeInspectorPanel` (nodeKind `'DATA_OBJECT'`), the canvas's `screenToWorld`, and the scope-box drag/resize pattern (lines ~831-930).

- [ ] **Step 1: Load image elements.** In `page.tsx`, fetch `diagramElementApi.list(projectId, 'OBJECT_MAP', projectId)` and pass to `ObjectMapCanvas` as `imageElements` prop. Add optimistic state + debounced batch save analogous to `handleObjectMoved` (reuse the `pendingPos`/`posTimer` pattern but call `diagramElementApi.patch` per element, or add a debounced single-element patch).

- [ ] **Step 2: Render `<image>` elements** inside the SVG (after the objects `.map(...)`, before/after knobs), each as:

```tsx
{imageElements.map((el) => (
  <g key={el.id} transform={`translate(${draftPos[el.id]?.x ?? el.positionX},${draftPos[el.id]?.y ?? el.positionY})`}
     onPointerDown={(e) => handleImagePointerDown(e, el, 'move')}
     onClick={(e) => { e.stopPropagation(); setSelectedImageId(el.id); }}
     style={{ cursor: 'grab' }}>
    <image href={nodeAttachmentApi.fileUrl(el.attachmentId!)} width={el.width ?? 200} height={el.height ?? 150} preserveAspectRatio="xMidYMid meet" />
    {selectedImageId === el.id && (
      <>
        <rect x={-4} y={-4} width={(el.width ?? 200) + 8} height={(el.height ?? 150) + 8} rx={6} fill="none" stroke="#3b82f6" strokeWidth={2} />
        {/* bottom-right resize handle (mirror scope-box handle) */}
        <rect x={(el.width ?? 200) - 9} y={(el.height ?? 150) - 9} width={14} height={14} rx={3} fill="#fff" stroke="#3b82f6" strokeWidth={1.5} style={{ cursor: 'nwse-resize' }} onPointerDown={(e) => handleImagePointerDown(e, el, 'resize')} />
      </>
    )}
  </g>
))}
```

- [ ] **Step 3: Drag/resize state machine.** Add `handleImagePointerDown(e, el, mode)` modeled on `handleScopePointerDown` (store base x/y/w/h at pointerdown, compute deltas via `screenToWorld`, update `imageDraft` state on move, call `onImageGeometryChanged(el.id, { positionX, positionY, width, height })` on up only if moved). The parent persists via `diagramElementApi.patch`.

- [ ] **Step 4: Drop handler.** Add `onDrop`/`onDragOver` to the `<svg>`:

```tsx
onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
onDrop={async (e) => {
  e.preventDefault();
  const file = firstImageFile(Array.from(e.dataTransfer.files));
  if (!file) return;
  const world = screenToWorld(e.clientX, e.clientY);
  const att = await uploadProjectFile(projectId, file);
  const created = await diagramElementApi.create(projectId, { diagramKind: 'OBJECT_MAP', diagramId: projectId, type: 'IMAGE', attachmentId: att.id, positionX: world.x, positionY: world.y, width: 200, height: 150 });
  onImageCreated(created); // append to parent state
}}
```

- [ ] **Step 5: DataObject-click inspector.** The existing `handleNodeClick` calls `onSelectObject(obj.id)`. In `page.tsx`, when an object is selected, render `<NodeInspectorPanel projectId nodeKind="DATA_OBJECT" nodeId={selectedObjectId} nodeLabel={selectedObjectName} onClose={() => onSelectObject(null)} />` alongside the existing detail panel (or as a tab within it).

- [ ] **Step 6: Verify**

Run: `cd frontend && npx tsc --noEmit && npx next build`
Then manual: open オブジェクト関係マップ → drop image (drag/resize/persists) → click a DataObject → attach image/PDF/video → view → reload persists → existing object drag + relation-connect still work (regression check).

- [ ] **Step 7: Commit**

```bash
git add "frontend/src/app/(dashboard)/dashboard/projects/[projectId]/object-map/_components/ObjectMapCanvas.tsx" "frontend/src/app/(dashboard)/dashboard/projects/[projectId]/object-map/page.tsx"
git commit -m "feat(web): object-map canvas — image element drag/resize + node inspector"
```

---

## Phase 13 — Verification

### Task 13: Full-stack verification + KG check

**Files:** none (verification only)

- [ ] **Step 1: Backend suite**

Run: `cd backend && npx jest && npx nest build`
Expected: all tests PASS, build 0 errors.

- [ ] **Step 2: Frontend suite**

Run: `cd frontend && npx vitest run && npx tsc --noEmit && npx next build`
Expected: tests PASS, tsc 0 errors, build succeeds.

- [ ] **Step 3: End-to-end manual (all 3 canvases)**
  - On 業務フロー, DFD, and オブジェクト関係マップ: drop an image → it is placed, movable, resizable, and persists across reload.
  - On each, click a node → NodeInspectorPanel opens → attach an image, a PDF, and an MP4 (≤100MB) → all three render inline (img / iframe / video) → reload → attachments persist.
  - Open the knowledge-graph view: confirm each node that received an attachment now appears as an `ENTITY` node, and the attached file shows as a `KnowledgeDocument` linked (mention) to it.
  - Delete a node that had attachments → confirm its `NodeAttachment` and `KnowledgeNodeLink` rows are gone (no ghost entity link).

- [ ] **Step 4: Commit any fixups, then finish the branch** per superpowers:finishing-a-development-branch.

---

## Self-Review

**Spec coverage:** ① image D&D on 3 canvases → Tasks 9-12. ② node click → attach video/PDF/image + view → Tasks 4, 8, 10-12. ③ auto KG register → Tasks 3-4; AI on demand → Tasks 6-7. Unified polymorphic model (DiagramElement/NodeAttachment/KnowledgeNodeLink) → Task 1. Orphan cleanup → Task 5. Reuse of Attachment/Blob/uploadProjectFile/FileDropZone/KnowledgeDocument/KnowledgeMention → Tasks 4,7,8. All spec sections map to tasks.

**Placeholder scan:** Two intentional "look it up in the neighbouring file" pointers remain in Task 6 (company-API-key service type) and the import-path confirmations in Tasks 2-4 — these reference REAL, existing members and tell the implementer exactly which file to copy from, not invented APIs. The KG-tab inline AI抽出 button is explicitly scoped as minimal-in-v1 with the client method already shipped (Task 7) — not a hidden TODO.

**Type consistency:** `DiagramKind` (FLOW/DFD/OBJECT_MAP), `DiagramNodeKind` (FLOW_NODE/DFD_NODE/DATA_OBJECT), and `NODE_KIND_TO_DIAGRAM_KIND` are defined once (Tasks 1, 3) and reused identically in Tasks 4, 5, 7, 10-12. `DiagramElementDto` / `NodeAttachmentDto` field names match between backend `toDto` (Tasks 2, 4) and frontend types (Task 7). `inferMediaKind` / `firstImageFile` signatures match their tests and consumers.
