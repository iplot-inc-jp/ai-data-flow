# バッチ文書 → ナレッジグラフ自動生成 実装プラン

> **For agentic workers:** 本プランは Workflow オーケストレーション（ultracode）で実装する。各チャンク=実装→tsc→敵対的レビュー→fix。schema を触るチャンク後は **workflow 内は `prisma generate` のみ**、`prisma db push`・watch 再起動・live smoke・commit は**オーケストレータ（メイン）**が行う（既存知見）。subagent はブランチを切らない・現在ブランチ `feat/methodology-pipeline` にコミット。

**Goal:** プロジェクトの文書ファイル群（アップロード/ZIP/既存添付/Drive）をバッチで読み、Claude で実体・自動タグ・関係を抽出してナレッジグラフを自動生成する。各ファイル単位の細かいステータス管理・個別リトライ・再開、AI/OCR の課金ガード付き。

**Architecture:** 取り込みは2階層（IngestionBatch→IngestionFile）。実行は既存 BackgroundJob/QStash を「1ファイル=1ジョブ」で流用。型別前処理（PDF/画像=Claude多モーダル、Excel/docx=テキスト、ZIP=fflate展開）→ Claude 抽出 → 専用 KG モデル（Document/Node/Mention/Relation）へ冪等マージ。クリーンアーキは `asis-memo` スライスを踏襲。

**Tech Stack:** NestJS + Prisma(Neon/Postgres), Next.js(app router), Anthropic SDK, Upstash QStash, Vercel Blob, xlsx(SheetJS), mammoth, fflate, jest(backend pure-logic), React Flow/自作SVG(graph)。

**参照 spec:** `docs/superpowers/specs/2026-06-15-knowledge-graph-batch-ingestion-design.md`

**ローカル実行:** backend `npm run start:dev` :5021 / frontend :3007 / pg docker :5460 / demo@iplot.local:password123。dep 変更後は backend 再起動・frontend は `rm -rf .next` 再起動。

---

## ファイル構成（新規/変更）

**Backend**
- 変更 `backend/prisma/schema.prisma` — enum/model 追加（§4 spec）＋ `Project` 逆リレーション。
- 新規 純ロジック（jest 対象, I/O 無し）:
  - `backend/src/infrastructure/knowledge/lib/normalize-label.ts`（名寄せキー）
  - `backend/src/infrastructure/knowledge/lib/xlsx-to-markdown.ts`（シート→Markdown表）
  - `backend/src/infrastructure/knowledge/lib/archive.ts`（zip 安全展開計画）
  - `backend/src/infrastructure/knowledge/lib/batch-status.ts`（親 status 集計）
  - `backend/src/infrastructure/knowledge/lib/merge-plan.ts`（抽出結果→グラフ反映の冪等計画）
  - 各 `*.spec.ts`（同階層）
- 新規 サービス:
  - `backend/src/infrastructure/services/blob-storage.service.ts`（Blob put/get、未設定時ディスク fallback）
  - `backend/src/infrastructure/knowledge/file-extraction.service.ts`（mime 判定＋テキスト抽出＋zip展開）
  - `backend/src/infrastructure/knowledge/knowledge-ingestion.service.ts`（1ファイルのパイプライン FETCH/PREPROCESS/EXTRACT/MERGE）
  - 変更 `backend/src/infrastructure/services/claude.service.ts` — `extractKnowledge()` 追加。
  - 変更 `backend/src/infrastructure/services/job.service.ts` — `KG_INGEST_FILE`/`KG_EXPAND_ARCHIVE` dispatch＋ALLOWED_TYPES。
- 新規 クリーンアーキ スライス（`asis-memo` 流儀: entity/repository/repository.impl/use-cases/index/controller）:
  - ingestion（IngestionBatch + IngestionFile を1スライス）
  - knowledge（KnowledgeDocument/Node/Mention/Relation の read + node/document 編集）
  - knowledge-settings（ProjectKnowledgeSettings）
- 変更 `backend/src/app.module.ts` — providers/use-cases/controllers 配線。

**Frontend**
- 新規 `frontend/src/lib/knowledge.ts`（API client; raw fetch `${API_URL}/api...`, token=localStorage 'accessToken'）。
- 新規 ページ:
  - `frontend/src/app/dashboard/projects/[id]/knowledge/ingestion/page.tsx`（バッチ一覧＋作成）
  - `frontend/src/app/dashboard/projects/[id]/knowledge/ingestion/[batchId]/page.tsx`（バッチ詳細＝ファイル行ステータス）
  - `frontend/src/app/dashboard/projects/[id]/knowledge/graph/page.tsx`（グラフ可視化, Phase 2）
  - `frontend/src/app/dashboard/projects/[id]/knowledge/settings/page.tsx`（課金ガード設定）
- 新規 コンポーネント `frontend/src/components/knowledge/`（NewBatchDialog, FileStatusTable, KnowledgeGraphCanvas, NodeDetailPanel）。
- 変更 `frontend/src/app/dashboard/layout.tsx`（サイドバー「ナレッジ」群）。

---

## Phase 1 — コア（取り込み→抽出→グラフ格納→ダッシュボード／設定）

### Task 1: 依存追加 + Prisma スキーマ

**Files:** `backend/package.json`, `backend/prisma/schema.prisma`

- [ ] **Step 1: 依存インストール**

```bash
cd backend && npm i xlsx mammoth fflate @vercel/blob multer && npm i -D @types/multer
```

- [ ] **Step 2: schema に enum/model 追加**（spec §4 をそのまま。Phase1 は DriveConnection 以外すべて）

`schema.prisma` に追加：`IngestionBatchStatus`, `IngestionFileStatus`, `IngestionSourceType`, `KnowledgeNodeType` enum；`IngestionBatch`, `IngestionFile`, `KnowledgeDocument`, `KnowledgeNode`, `KnowledgeMention`, `KnowledgeRelation`, `ProjectKnowledgeSettings` model（フィールドは spec §4.1/4.2/4.4 のとおり）。`Project` に逆リレーション `ingestionBatches IngestionBatch[]` / `knowledgeDocuments KnowledgeDocument[]` / `knowledgeNodes KnowledgeNode[]` / `knowledgeRelations KnowledgeRelation[]`（onDelete は子側 Cascade）。

- [ ] **Step 3: generate（workflow 内）→ db push（オーケストレータ）**

```bash
cd backend && npx prisma generate          # workflow agent
cd backend && npx prisma db push           # オーケストレータが実行（DBに反映）
```
Expected: `prisma validate` 相当が通り、generate 成功。db push で 7 model 追加（DROP 無し）。

- [ ] **Step 4: Commit**（オーケストレータ）
```bash
git add backend/package.json backend/package-lock.json backend/prisma/schema.prisma && git commit -m "feat(knowledge): schema + deps（取り込み/ナレッジグラフ/設定）"
```

### Task 2: 純ロジック `normalize-label` + jest

**Files:** Create `backend/src/infrastructure/knowledge/lib/normalize-label.ts`, Test `…/normalize-label.spec.ts`

- [ ] **Step 1: 失敗するテスト**
```ts
import { normalizeLabel } from './normalize-label';
describe('normalizeLabel', () => {
  it('全半角・大小・前後空白・連続空白を正規化', () => {
    expect(normalizeLabel(' 受注  System ')).toBe('受注 system');
    expect(normalizeLabel('ＡＢＣ')).toBe('abc');         // 全角英字→半角小文字
    expect(normalizeLabel('在庫　管理')).toBe('在庫 管理'); // 全角空白→半角
  });
  it('空/記号のみは空文字', () => { expect(normalizeLabel('  ・  ')).toBe('・'); });
});
```
- [ ] **Step 2: 実行して失敗確認** `cd backend && npx jest normalize-label` Expected: FAIL（未実装）。
- [ ] **Step 3: 実装**
```ts
export function normalizeLabel(input: string): string {
  if (!input) return '';
  return input
    .normalize('NFKC')            // 全角英数記号/空白→半角
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
```
- [ ] **Step 4: 実行して合格** `cd backend && npx jest normalize-label` Expected: PASS。
- [ ] **Step 5: Commit** `git add backend/src/infrastructure/knowledge/lib/normalize-label.* && git commit -m "feat(knowledge): normalizeLabel（名寄せキー）"`

### Task 3: 純ロジック `xlsx-to-markdown` + jest

**Files:** Create `…/lib/xlsx-to-markdown.ts`, Test `…/xlsx-to-markdown.spec.ts`

- [ ] **Step 1: 失敗するテスト**（SheetJS の `read` → 各シートを GFM 表へ）
```ts
import * as XLSX from 'xlsx';
import { xlsxBufferToMarkdown } from './xlsx-to-markdown';
function sample(): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([['名前','数量'],['りんご',3]]);
  XLSX.utils.book_append_sheet(wb, ws, '在庫');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
it('シート名見出し＋GFM表', () => {
  const md = xlsxBufferToMarkdown(sample());
  expect(md).toContain('## 在庫');
  expect(md).toContain('| 名前 | 数量 |');
  expect(md).toContain('| りんご | 3 |');
});
```
- [ ] **Step 2: 失敗確認** `npx jest xlsx-to-markdown` → FAIL。
- [ ] **Step 3: 実装**
```ts
import * as XLSX from 'xlsx';
export function xlsxBufferToMarkdown(buf: Buffer, maxRowsPerSheet = 2000): string {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const out: string[] = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], { header: 1, blankrows: false, defval: '' });
    out.push(`## ${name}`);
    if (!rows.length) { out.push('(空)'); continue; }
    const clipped = rows.slice(0, maxRowsPerSheet);
    const head = clipped[0].map((c) => String(c));
    out.push(`| ${head.join(' | ')} |`);
    out.push(`| ${head.map(() => '---').join(' | ')} |`);
    for (const r of clipped.slice(1)) out.push(`| ${head.map((_, i) => String(r[i] ?? '')).join(' | ')} |`);
    if (rows.length > maxRowsPerSheet) out.push(`… (${rows.length - maxRowsPerSheet} 行省略)`);
  }
  return out.join('\n');
}
```
- [ ] **Step 4: 合格** `npx jest xlsx-to-markdown` → PASS。
- [ ] **Step 5: Commit**

### Task 4: 純ロジック `archive`（zip 安全展開計画）+ jest

**Files:** Create `…/lib/archive.ts`, Test `…/archive.spec.ts`

- [ ] **Step 1: 失敗するテスト**（`fflate` で解凍し、安全フィルタ後のエントリ一覧を返す）
```ts
import { zipSync, strToU8 } from 'fflate';
import { planArchiveEntries } from './archive';
const zip = Buffer.from(zipSync({
  'a.txt': strToU8('hello'),
  '__MACOSX/x': strToU8('junk'),
  '../evil.txt': strToU8('bad'),
  'sub/b.csv': strToU8('x,y'),
}));
it('隠し/トラバーサルを除外し安全なエントリのみ', () => {
  const { entries, skipped } = planArchiveEntries(zip, { maxEntries: 100, maxTotalBytes: 1e9 });
  const names = entries.map(e => e.path).sort();
  expect(names).toEqual(['a.txt', 'sub/b.csv']);
  expect(skipped.some(s => s.reason === 'traversal')).toBe(true);
});
it('上限超過で打ち切り（無音にしない）', () => {
  const { entries, truncated } = planArchiveEntries(zip, { maxEntries: 1, maxTotalBytes: 1e9 });
  expect(entries.length).toBe(1);
  expect(truncated).toBe(true);
});
```
- [ ] **Step 2: 失敗確認** → FAIL。
- [ ] **Step 3: 実装**（`unzipSync`、`..`/絶対パス/`__MACOSX`/ドット始まり除外、合計サイズ・件数上限、`{path,bytes}` を返す）
```ts
import { unzipSync } from 'fflate';
export interface ArchiveEntry { path: string; bytes: Uint8Array; }
export interface ArchivePlan { entries: ArchiveEntry[]; skipped: { path: string; reason: string }[]; truncated: boolean; }
const isUnsafe = (p: string) =>
  p.includes('..') || p.startsWith('/') || p.startsWith('__MACOSX/') ||
  p.split('/').some((seg) => seg.startsWith('.')) || p.endsWith('/');
export function planArchiveEntries(buf: Buffer, opt: { maxEntries: number; maxTotalBytes: number }): ArchivePlan {
  const files = unzipSync(new Uint8Array(buf));
  const entries: ArchiveEntry[] = []; const skipped: ArchivePlan['skipped'] = [];
  let total = 0, truncated = false;
  for (const [path, bytes] of Object.entries(files)) {
    if (isUnsafe(path)) { skipped.push({ path, reason: path.includes('..') || path.startsWith('/') ? 'traversal' : 'hidden' }); continue; }
    if (entries.length >= opt.maxEntries || total + bytes.length > opt.maxTotalBytes) { truncated = true; break; }
    total += bytes.length; entries.push({ path, bytes });
  }
  return { entries, skipped, truncated };
}
```
- [ ] **Step 4: 合格 / Step 5: Commit**

### Task 5: 純ロジック `batch-status` + jest

**Files:** Create `…/lib/batch-status.ts`, Test `…/batch-status.spec.ts`

- [ ] **Step 1: 失敗するテスト**（葉ファイルの status 配列→親 batch status）
```ts
import { aggregateBatchStatus } from './batch-status';
it('全完了→SUCCEEDED / 一部失敗→PARTIAL / 全失敗→FAILED / 実行中→RUNNING / 未着手→PENDING', () => {
  expect(aggregateBatchStatus(['SUCCEEDED','SUCCEEDED'])).toBe('SUCCEEDED');
  expect(aggregateBatchStatus(['SUCCEEDED','FAILED'])).toBe('PARTIAL');
  expect(aggregateBatchStatus(['FAILED','FAILED'])).toBe('FAILED');
  expect(aggregateBatchStatus(['EXTRACTING','PENDING'])).toBe('RUNNING');
  expect(aggregateBatchStatus(['PENDING','PENDING'])).toBe('PENDING');
  expect(aggregateBatchStatus([])).toBe('PENDING');
});
```
- [ ] **Step 2-3: 実装**（SKIPPED は完了扱い、active=FETCHING/EXPANDING/PREPROCESSING/EXTRACTING/MERGING）
```ts
export type FileStatus = 'PENDING'|'FETCHING'|'EXPANDING'|'PREPROCESSING'|'EXTRACTING'|'MERGING'|'SUCCEEDED'|'FAILED'|'SKIPPED';
export type BatchStatus = 'PENDING'|'EXPANDING'|'RUNNING'|'PARTIAL'|'SUCCEEDED'|'FAILED'|'CANCELLED';
const ACTIVE: FileStatus[] = ['FETCHING','EXPANDING','PREPROCESSING','EXTRACTING','MERGING'];
const DONE: FileStatus[] = ['SUCCEEDED','SKIPPED'];
export function aggregateBatchStatus(files: FileStatus[]): BatchStatus {
  if (!files.length) return 'PENDING';
  if (files.some(s => ACTIVE.includes(s))) return 'RUNNING';
  const allSettled = files.every(s => DONE.includes(s) || s === 'FAILED');
  if (allSettled) {
    if (files.every(s => DONE.includes(s))) return 'SUCCEEDED';
    if (files.every(s => s === 'FAILED')) return 'FAILED';
    return 'PARTIAL';
  }
  if (files.every(s => s === 'PENDING')) return 'PENDING';
  return 'RUNNING';
}
```
- [ ] **Step 4-5: 合格 / Commit**

### Task 6: 純ロジック `merge-plan`（冪等マージ計画）+ jest

**Files:** Create `…/lib/merge-plan.ts`, Test `…/merge-plan.spec.ts`

抽出結果 `{summary,tags,entities,relations}` を、ノードの get-or-create（normalizeLabel キー）・mention・relation の**操作計画**に変換する純関数（DB I/O は呼び出し側）。relation の from/to を normalizeLabel で解決し、未知ラベルは新規ノードとして要求に含める。

- [ ] **Step 1: 失敗するテスト**
```ts
import { buildMergePlan } from './merge-plan';
const extraction = {
  summary: 's', tags: ['受注', '受注'], // 重複はまとめる
  entities: [{ label: '受注System', kind: 'SYSTEM' }],
  relations: [{ from: '受注', to: '受注System', label: '使う' }],
};
it('タグ/実体を正規化キーで一意化し、relation 端点を解決', () => {
  const plan = buildMergePlan(extraction);
  // ノード要求は normalizedLabel で一意（受注[TAG], 受注system[ENTITY]）
  expect(plan.nodes).toHaveLength(2);
  expect(plan.mentions).toHaveLength(2);
  expect(plan.relations[0]).toMatchObject({ fromKey: '受注', toKey: '受注system', label: '使う' });
});
```
- [ ] **Step 2-3: 実装**（型 `MergePlan { nodes:{type,entityKind?,label,normalizedLabel}[]; mentions:{normalizedLabel,type}[]; relations:{fromKey,toKey,label?}[] }`、tag→TAG/entity→ENTITY、from/to が既知ラベルに無ければ TAG ノードとして補完）。
- [ ] **Step 4-5: 合格 / Commit**

### Task 7: `BlobStorageService`（Blob put/get + ディスク fallback）

**Files:** Create `backend/src/infrastructure/services/blob-storage.service.ts`, Modify `app.module.ts`(provider)

- [ ] **Step 1: 実装**（`@Injectable()`。`BLOB_READ_WRITE_TOKEN` 有→`put(path, data, {access:'public'})` で URL、`fetch(url)` で取得。無→`UPLOAD_DIR` ディスク保存しローカル URL `/api/attachments?...` 相当の擬似 path を返す。メソッド `save(key, bytes, contentType): Promise<{url}>` / `read(urlOrKey): Promise<Buffer>`）。
- [ ] **Step 2: 配線**（app.module providers）。tsc 0 確認。live smoke は Task 12 で。
- [ ] **Step 3: Commit**

### Task 8: `FileExtractionService`（mime 判定＋テキスト抽出＋zip 展開）

**Files:** Create `backend/src/infrastructure/knowledge/file-extraction.service.ts`

- [ ] **Step 1: 実装**
  - `classify(mime, filename): 'pdf'|'image'|'spreadsheet'|'doc'|'text'|'archive'|'unsupported'`
  - `extractText(kind, bytes): Promise<{ text?: string; needsVision?: boolean }>` — spreadsheet=`xlsxBufferToMarkdown`、doc(docx)=`mammoth.extractRawText`、text=utf8、pdf=`{needsVision:true}`（Claude直）、image=`{needsVision:true}`。
  - `expand(bytes): ArchivePlan` — `planArchiveEntries`（上限は設定 maxFilesPerBatch 連携、既定 maxEntries=500, maxTotalBytes=500MB）。
- [ ] **Step 2: tsc 0 / Commit**

### Task 9: `ClaudeService.extractKnowledge`

**Files:** Modify `backend/src/infrastructure/services/claude.service.ts`

- [ ] **Step 1: 追加**（既存 `getClient(apiKey)`・`defaultModel()`・JSON 抽出ヘルパを流用）
```ts
export interface KnowledgeExtraction {
  summary: string;
  tags: string[];
  entities: { label: string; kind: string; description?: string }[];
  relations: { from: string; to: string; label?: string }[];
}
export interface ExtractInput {
  text?: string;                       // テキスト系
  pdfBase64?: string;                  // PDF（document ブロック）
  images?: { base64: string; mimeType: string }[]; // 画像（image ブロック）
  filename: string;
}
async extractKnowledge(input: ExtractInput, apiKey: string, model?: string): Promise<KnowledgeExtraction> {
  const client = this.getClient(apiKey);
  const content: any[] = [];
  if (input.pdfBase64) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.pdfBase64 } });
  for (const img of input.images ?? []) content.push({ type: 'image', source: { type: 'base64', media_type: img.mimeType, data: img.base64 } });
  if (input.text) content.push({ type: 'text', text: input.text.slice(0, 200_000) });
  content.push({ type: 'text', text: `上記は「${input.filename}」の内容。日本語で、JSONのみ返す:\n{"summary":"3行以内の要約","tags":["主題タグ"],"entities":[{"label":"固有物","kind":"PERSON|SYSTEM|ORG|CONCEPT|PRODUCT|EVENT|LOCATION|TERM|OTHER","description":"任意"}],"relations":[{"from":"ラベル","to":"ラベル","label":"関係"}]}` });
  const res = await client.messages.create({
    model: model || this.defaultModel(),
    max_tokens: 4096,
    system: 'あなたは文書からナレッジグラフ要素を抽出する。出力は指定 JSON のみ。tags/entities の label は簡潔な名詞句。relations の from/to は必ず tags か entities に現れる label を使う。',
    messages: [{ role: 'user', content }],
  });
  const txt = res.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  const parsed = this.parseJsonBlock(txt) as KnowledgeExtraction; // 既存のコードフェンス除去ヘルパ
  return { summary: parsed.summary ?? '', tags: parsed.tags ?? [], entities: parsed.entities ?? [], relations: parsed.relations ?? [] };
}
```
（`parseJsonBlock` 相当が無ければ既存の JSON 抽出処理を流用/小関数化。）
- [ ] **Step 2: tsc 0 / Commit**

### Task 10: クリーンアーキ スライス（ingestion / knowledge / knowledge-settings）

**Files:** 各 `backend/src/domain/entities/*.entity.ts`, `…/domain/repositories/*.repository.ts`(+`X_REPOSITORY` Symbol), `…/infrastructure/persistence/repositories/*.repository.impl.ts`, `…/application/use-cases/<slice>/*`, `…/presentation/controllers/*.controller.ts`, Modify `app.module.ts`。

`asis-memo` スライスを雛形に、以下を実装（フィールドは spec §4・§9 のとおり）:
- **ingestion**: `IngestionBatchRepository`/`IngestionFileRepository`。use-cases: `CreateIngestionBatch`(ソース指定→Batch＋File 群作成→各 File に Job enqueue), `GetIngestionBatches`, `GetIngestionBatchDetail`(files 込み), `ResumeBatch`, `CancelBatch`, `RetryFile`, `SkipFile`。controller ルートは spec §9。authz=`assertProjectAccess`。
- **knowledge**: read 用 `KnowledgeRepository`（graph 取得・node 取得・search）＋ `UpdateKnowledgeNode`/`DeleteKnowledgeNode`/`UpdateDocumentPosition`。
- **knowledge-settings**: `GetOrCreateSettings`/`UpdateSettings`（projectId @unique get-or-create）。
- [ ] **Step 1: 実装**（各 use-case は単一責務・`touch()` 規約）。
- [ ] **Step 2: 配線**（app.module providers/use-cases/controllers）。
- [ ] **Step 3: tsc 0 / Commit**（オーケストレータ）。

### Task 11: パイプライン `KnowledgeIngestionService` + Job 配線

**Files:** Create `backend/src/infrastructure/knowledge/knowledge-ingestion.service.ts`, Modify `job.service.ts`

- [ ] **Step 1: `processFile(fileId)` 実装**（状態機械。各段で `IngestionFile.status/step/progress` 更新）:
  1. FETCHING: blobUrl 無ければソースから bytes 取得→`BlobStorageService.save`→blobUrl 保存。
  2. isArchive→ここで終了（展開は `KG_EXPAND_ARCHIVE` 側）。
  3. 設定解決: `settings ∧ batch.options`（aiExtractionEnabled/ocrEnabled）。
  4. PREPROCESSING: `FileExtractionService.extractText`。needsVision かつ `ocrEnabled=false` → 抽出スキップ（step に「OCR無効によりスキップ」）。
  5. EXTRACTING: `aiExtractionEnabled` の時のみ `ClaudeService.extractKnowledge`（pdf/image/text を渡し分け）。OFF→`{summary:'',tags:[],entities:[],relations:[]}`。
  6. MERGING: `buildMergePlan` → KnowledgeDocument upsert(by ingestionFileId)＋当該文書の既存 mention/relation 削除→ノード get-or-create(normalizeLabel)＋mention＋relation 作成（PrismaService 直 or repository）。
  7. SUCCEEDED：knowledgeDocumentId 設定。各失敗は throw→Job 側 retry。
  8. 完了/失敗のたび batch カウンタ＋`aggregateBatchStatus` で親更新。
- [ ] **Step 2: `expandArchive(fileId)` 実装**（`KG_EXPAND_ARCHIVE`）: bytes→`FileExtractionService.expand`→各エントリを Blob 保存＋子 `IngestionFile(parentFileId, sourceType=UPLOAD, status=PENDING)` 作成→`KG_INGEST_FILE` enqueue。truncated/skipped を batch ログ（warning）に。アーカイブ自身 SUCCEEDED。
- [ ] **Step 3: `JobService` 配線**: `ALLOWED_TYPES` に `KG_INGEST_FILE`/`KG_EXPAND_ARCHIVE` 追加。`dispatch` に case 追加（service 呼び出し）。`CreateIngestionBatch` から `jobService.enqueue('KG_INGEST_FILE'|'KG_EXPAND_ARCHIVE', {fileId}, {projectId})`。
- [ ] **Step 4: tsc 0**。db push 済前提で **live smoke**（オーケストレータ）: バッチ作成(text/小xlsx/zip)→inline 実行→File SUCCEEDED→graph GET 200→冪等（再リトライで件数不変）。
- [ ] **Step 5: Commit**

### Task 12: フロントエンド（取り込みダッシュボード＋設定＋ナビ）

**Files:** `frontend/src/lib/knowledge.ts`, `…/knowledge/ingestion/page.tsx`, `…/ingestion/[batchId]/page.tsx`, `…/knowledge/settings/page.tsx`, `…/components/knowledge/{NewBatchDialog,FileStatusTable}.tsx`, Modify `dashboard/layout.tsx`

- [ ] **Step 1: API client**（`knowledge.ts`：batches CRUD/detail/resume/cancel、files retry/skip、uploads、settings get/put、graph get/search）。token=localStorage 'accessToken'、raw fetch。
- [ ] **Step 2: ダッシュボード**（一覧＋NewBatchDialog：ソース=アップロード（ZIP可・複数）/既存添付選択→開始。詳細：FileStatusTable＝行ごと status バッジ/step/進捗/試行/エラー展開/[リトライ][スキップ][原本]、ZIP は子展開行、上部[再開][全リトライ][キャンセル]、3–5秒ポーリング）。
- [ ] **Step 3: 設定ページ**（aiExtractionEnabled/ocrEnabled/defaultModel/imagingMode/maxFilesPerBatch、料金注記）。
- [ ] **Step 4: サイドバー**（「ナレッジ」群＝取り込み/ナレッジグラフ/設定）。
- [ ] **Step 5: frontend tsc 0**（`rm -rf .next` 後）。**Commit**。

---

## Phase 2 — ナレッジグラフ可視化

### Task 13: グラフレイアウト純ロジック + vitest（frontend）
`frontend/src/components/knowledge/knowledge-graph-layout.ts` — 決定的クラスタ配置（タグをアンカーに実体を周回配置、未配置のみ自動・positionX/Y があれば尊重）。`knowledge-graph-layout.test.ts`（重なり無し・決定性）。

### Task 14: `KnowledgeGraphCanvas` + 詳細パネル
`…/graph/page.tsx` ＋ `components/knowledge/{KnowledgeGraphCanvas,NodeDetailPanel}.tsx`。object-map のキャンバス技術流用。ノード=タグ/実体（種別色）、エッジ=relation（ラベル）。ノードclick→右パネル（label/kind/description/出典文書＋snippet/関連）。文書click→要約＋原本リンク。フィルタ（タグ/種別/文書）＋検索。ドラッグ位置 PATCH 永続。frontend tsc 0 / vitest / Commit。

---

## Phase 3 — Google Drive ソースアダプタ

### Task 15: `DriveConnection` スキーマ + OAuth + 一覧/取込
schema に `DriveConnection`（spec §4.3, refresh token は既存 `crypto`(AES-256-GCM)/`TOKEN_ENC_KEY` で暗号化）。backend: `DriveService`（OAuth code↔token、`files.list`、`files.get?alt=media`）＋controller（auth-url/callback/files/connection delete）。`SourceAdapter` の DRIVE 実装。frontend: NewBatchDialog に Drive タブ（接続→フォルダ/一覧→選択）。db push（オーケストレータ）→ live smoke → Commit。

---

## Phase 4 — MCP + export/import

### Task 16: MCP ツール
`mcp/tools/knowledge.mjs`：`knowledge_ingest_start`/`knowledge_batch_status`/`knowledge_file_retry`/`knowledge_graph_query`。`mcp/index.mjs` 登録。JSON-RPC 実検証。

### Task 17: ProjectBundle セクション
`project-bundle.service.ts` に `knowledgeDocuments/knowledgeNodes/knowledgeMentions/knowledgeRelations` の export/import（idMap FK 再マップ）。`IngestionBatch/File` は除外。round-trip 確認。

---

## Self-Review（spec 対応）

- ZIP（§2/§5/§6）→ Task 1(schema isArchive/parentFileId), Task 4(archive 純ロジック), Task 8(expand), Task 11 Step2(expandArchive)。✓
- 課金ガード（§4.4/§6/§8.3）→ Task 1(settings model), Task 10(settings slice), Task 11(設定∧option ゲート), Task 12 Step3(設定UI)。✓
- 細かいステータス/リトライ/再開（§7）→ Task 10(Resume/Retry/Skip use-cases), Task 11(状態機械＋stale は ResumeBatch が PENDING/FAILED/stale active を対象), Task 12(行UI)。✓
- 3ソース（§5）→ アップロード/既存添付=Phase1(Task 10/12)、Drive=Phase3(Task 15)。✓
- 型別前処理＋Claude多モーダル（§6）→ Task 8/9/11。✓
- KG モデル＋名寄せマージ（§4.2/§6 MERGE）→ Task 1/2/6/10/11。✓
- グラフ可視化（§8.2）→ Phase2 Task 13/14。✓
- MCP/export（§11）→ Phase4 Task 16/17。✓
- Blob 保管（§10）→ Task 7。✓

**型整合**: `KnowledgeExtraction`/`ExtractInput`(Task9) ↔ `buildMergePlan` 入力(Task6) は `{summary,tags,entities,relations}` で一致。`FileStatus`/`BatchStatus`(Task5) は schema enum と同名。`normalizeLabel`(Task2) を Task6/11 が使用。✓
