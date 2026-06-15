# バッチ文書 → ナレッジグラフ自動生成 設計

- 日付: 2026-06-15
- ステータス: 設計合意済み（実装未着手）
- ブランチ: `feat/methodology-pipeline`
- 関連: `2026-06-14-project-understanding-sync-design.md`（ipro-bot からの理解同期。本設計とは独立。本設計は「プロジェクト内の文書ファイル群」を素材にする）

## 1. 背景・目的

Brain Pro は「プロジェクトの“脳”を、人とAIで共有する」ツール。現状、業務フロー/DFD/課題ツリー/データオブジェクト等の構造を**人手で**作り込む。本機能は、プロジェクトに溜まった**文書ファイル群（既存添付・新規アップロード・Google Drive）をバッチで読み、Claude(LLM) で実体・自動タグ・関係を抽出して、独立した「ナレッジグラフ」を自動生成する**。

ユーザー要望（原文要約）:
- 基本は Claude の LLM で抽出。**タグを自動生成**してナレッジグラフ的に。
- バッチ処理は途中で落ちていないか前提で、**各ファイルごとに細かくステータス・エラーメッセージ・試行回数を保存**し、**画面から個別リトライ／再開**できる。
- ファイル名一覧取得・ファイルアップロード。Excel は画像化。テキスト主体はテキスト抽出、画像主体は画像からメタ情報抽出。ナレッジグラフに追加。**この流れをステータス管理で処理**。
- ソースは「全部」＝アップロード＋既存ファイル＋Google Drive すべて。

grep の結果、`knowledge / ナレッジ / OCR / embedding / RAG / vector / entity extraction` 系の実装は現状ゼロ。本機能は新規。

## 2. スコープ

**IN**
- 取り込みバッチ（親）＋ファイル項目（子）の2階層ステータス管理。ファイル単位の status/step/progress/error/attempts、個別リトライ、未処理・失敗のみ再開。
- 3ソース（アップロード / 既存 Attachment / Google Drive）を共通の `IngestionFile` に正規化。
- **ZIP アップロード対応**: ZIP を上げると裏で自動展開（バッチのステータス管理下）、中の各ファイルを子項目として通常パイプラインに乗せる。
- 型別前処理 → Claude 多モーダル抽出 → ナレッジグラフへ冪等マージ。
- **プロジェクト設定で課金ガード**: 「AI抽出する/しない」「OCR/画像解析する/しない」をプロジェクト単位で管理（料金がかかるため）。バッチ単位で上書き可。
- ナレッジグラフ専用モデル（Document/Node/Mention/Relation）＋可視化キャンバス。
- バッチ管理ダッシュボード。
- MCP ツール＋ProjectBundle export/import のセクション追加。

**OUT（将来）**
- ベクトル検索 / 埋め込み / RAG 質問応答（contentText は保持するので後付け可能な土台だけ作る）。
- 抽出した実体を既存マスタ（DataObject / InformationType / BusinessFlow）へ自動昇格する連携（手動「昇格」導線は将来）。
- リアルタイム同期（Drive 変更の自動追従）。本機能は明示実行のバッチ。

## 3. アーキテクチャ

```
[バッチ作成] ソース選択(upload/既存/Drive) → ファイル名一覧 → 選択 → 開始
   └─ IngestionBatch 作成 + 各ファイルを IngestionFile(PENDING) として登録
        └─ 各 IngestionFile に対して BackgroundJob(type=KG_INGEST_FILE) を enqueue
             └─ JobService(QStash or inline) が 1ファイル=1ジョブ で実行:
                  FETCH      … 原本取得→Vercel Blob 保存(blobUrl)
                  PREPROCESS … 型別: PDF=Claude document / 画像=image / Excel=SheetJS表(+任意PDF化) / docx=mammoth / text=そのまま
                  EXTRACT    … ClaudeService.extractKnowledge(多モーダル) → {summary, tags[], entities[], relations[]}
                  MERGE      … KnowledgeDocument upsert / Node 名寄せ get-or-create / Mention / Relation(出所付き)
                  → IngestionFile.status=SUCCEEDED, batch カウンタ更新
[ダッシュボード] バッチ/ファイル状況・個別リトライ・再開・キャンセル
[グラフ画面] KnowledgeNode/Edge をキャンバス表示・ノード詳細(出典文書/スニペット)・検索/フィルタ
```

- **実行基盤は既存 `BackgroundJob` / `JobService` / QStash を流用**。1ファイル=1ジョブにすることで、試行回数・自動リトライ・冪等な QUEUED→RUNNING claim・バッチ管理一覧（commit 7231024 の `batch-jobs-admin-panel`）がそのまま効く。
- **ドメインの可視状態は `IngestionFile`** が保持（BackgroundJob は実行の器、IngestionFile は業務的な細かいステータス）。両者は `IngestionFile.jobId` でリンク。
- **クリーンアーキ: 既存スライス流儀に合わせる**。entity = private constructor + `static create/reconstruct` + business メソッド（`touch()`）；repo interface + `export const X_REPOSITORY = Symbol(...)`；Prisma impl reconstruct/upsert/randomUUID；use-case authz = `assertProjectAccess`（既存 ProjectAccessService）。雛形は `asis-memo` / `flow-folder` スライス。

## 4. データモデル（Prisma, `backend/prisma/schema.prisma`）

### 4.1 取り込み（Ingestion）

```prisma
enum IngestionBatchStatus { PENDING EXPANDING RUNNING PARTIAL SUCCEEDED FAILED CANCELLED }
enum IngestionFileStatus  { PENDING FETCHING EXPANDING PREPROCESSING EXTRACTING MERGING SUCCEEDED FAILED SKIPPED }
enum IngestionSourceType  { UPLOAD ATTACHMENT DRIVE }

model IngestionBatch {
  id             String   @id @default(cuid())
  projectId      String
  name           String
  status         IngestionBatchStatus @default(PENDING)
  totalFiles     Int      @default(0)
  succeededFiles Int      @default(0)
  failedFiles    Int      @default(0)
  pendingFiles   Int      @default(0)
  options        Json?    // {extractTags, extractEntities, extractRelations, imagingMode, model}
  createdById    String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  startedAt      DateTime?
  finishedAt     DateTime?
  files          IngestionFile[]
  @@index([projectId])
}

model IngestionFile {
  id                  String   @id @default(cuid())
  batchId             String
  projectId           String
  sourceType          IngestionSourceType
  sourceRef           String?  // attachmentId / driveFileId（UPLOAD は null）
  filename            String
  displayName         String?
  mimeType            String?
  size                Int?
  blobUrl             String?  // 原本の保管先（Vercel Blob）
  isArchive           Boolean  @default(false) // ZIP 等のコンテナ（展開専用、グラフには載らない）
  parentFileId        String?  // どのアーカイブから展開されたか（ZIP 内エントリ）
  status              IngestionFileStatus @default(PENDING)
  step                String?  // 現在ステップの人間可読ラベル
  progress            Int      @default(0)
  attempts            Int      @default(0)
  maxAttempts         Int      @default(4)
  error               String?  @db.Text
  extractedText       String?  @db.Text  // 前処理で得たテキスト（監査/再抽出用）
  pageImageUrls       Json?    // 画像化した場合の Blob URL 群
  extractionResult    Json?    // Claude の生レスポンス（マージ前）
  jobId               String?  // → BackgroundJob.id
  knowledgeDocumentId String?  // 生成された KnowledgeDocument
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  startedAt           DateTime?
  finishedAt          DateTime?
  batch               IngestionBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)
  @@index([batchId])
  @@index([projectId])
  @@index([status])
}
```

### 4.2 ナレッジグラフ（Knowledge）

```prisma
enum KnowledgeNodeType { TAG ENTITY }

model KnowledgeDocument {
  id              String   @id @default(cuid())
  projectId       String
  ingestionFileId String?  @unique   // 1ファイル=1文書ノード（再実行で置換）
  title           String
  summary         String?  @db.Text  // Claude 生成の要約
  contentText     String?  @db.Text  // 抽出全文（将来の検索/RAG 土台）
  sourceType      IngestionSourceType
  sourceRef       String?
  blobUrl         String?            // 原本リンク
  mimeType        String?
  positionX       Float?
  positionY       Float?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  mentions        KnowledgeMention[]
  relations       KnowledgeRelation[] @relation("RelationSourceDoc")
  @@index([projectId])
}

model KnowledgeNode {
  id              String   @id @default(cuid())
  projectId       String
  type            KnowledgeNodeType
  entityKind      String?            // PERSON/SYSTEM/ORG/CONCEPT/PRODUCT/EVENT/LOCATION/TERM/OTHER
  label           String
  normalizedLabel String             // 小文字化/trim/全半角正規化 → 名寄せキー
  description     String?  @db.Text
  color           String?
  mentionCount    Int      @default(0)
  positionX       Float?
  positionY       Float?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  mentions        KnowledgeMention[]
  outRelations    KnowledgeRelation[] @relation("RelationFrom")
  inRelations     KnowledgeRelation[] @relation("RelationTo")
  @@unique([projectId, type, normalizedLabel])   // 文書横断マージ
  @@index([projectId])
}

model KnowledgeMention {   // 文書 ↔ ノード
  id         String   @id @default(cuid())
  projectId  String
  documentId String
  nodeId     String
  relevance  Float?            // 0..1（任意）
  snippet    String?  @db.Text // 出現箇所の根拠
  createdAt  DateTime @default(now())
  document   KnowledgeDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)
  node       KnowledgeNode     @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  @@unique([documentId, nodeId])
  @@index([projectId])
  @@index([nodeId])
}

model KnowledgeRelation {   // ノード ↔ ノード（出所付き）
  id               String   @id @default(cuid())
  projectId        String
  fromNodeId       String
  toNodeId         String
  label            String?           // 「承認する」「依存」等
  type             String?
  confidence       Float?
  sourceDocumentId String?           // どの文書が主張したか（provenance）
  createdAt        DateTime @default(now())
  fromNode         KnowledgeNode @relation("RelationFrom", fields: [fromNodeId], references: [id], onDelete: Cascade)
  toNode           KnowledgeNode @relation("RelationTo",   fields: [toNodeId],   references: [id], onDelete: Cascade)
  sourceDocument   KnowledgeDocument? @relation("RelationSourceDoc", fields: [sourceDocumentId], references: [id], onDelete: SetNull)
  @@unique([projectId, fromNodeId, toNodeId, label, sourceDocumentId])
  @@index([projectId])
}
```

`Project` に逆リレーション（`ingestionBatches`, `knowledgeDocuments`, `knowledgeNodes`, …）を追加。`db push` 必須。

### 4.3 Google Drive 接続

```prisma
model DriveConnection {
  id              String   @id @default(cuid())
  projectId       String                 // or organizationId（下記 open question）
  email           String?
  refreshTokenEnc String   @db.Text       // AES-256-GCM（既存 crypto.ts / TOKEN_ENC_KEY）
  scope           String?
  createdById     String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([projectId])
}
```

### 4.4 プロジェクト設定（課金ガード）

```prisma
model ProjectKnowledgeSettings {
  id                  String   @id @default(cuid())
  projectId           String   @unique
  aiExtractionEnabled Boolean  @default(true)  // Claude による 実体/タグ/関係/要約 抽出（$）
  ocrEnabled          Boolean  @default(true)  // 画像/スキャンPDF を vision/document で読む（$$, 画像トークン）
  defaultModel        String?                  // 未設定なら EXTRACTION_MODEL
  imagingMode         String   @default("auto") // auto | always | never（Office→画像化の方針）
  maxFilesPerBatch    Int      @default(200)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}
```

- 未作成プロジェクトは既定値（全て ON）として扱う（get-or-create）。
- バッチ作成時の `IngestionBatch.options` でこの設定を**バッチ単位に上書き可**（既定はプロジェクト設定を継承）。実行時はジョブが「設定 ∧ バッチ option」で各ステップの実行可否を判定。

## 5. ファイル取得元（共通アダプタ）

`SourceAdapter` インターフェイス（`list(): FileRef[]` / `fetchBytes(ref): {bytes, mimeType, filename}`）を3実装:
- **UPLOAD**: フロントが multipart で複数アップロード → 即 Vercel Blob 保存 → `IngestionFile(sourceType=UPLOAD, blobUrl)`。
- **ATTACHMENT**: 既存 `Attachment` をプロジェクト横断で一覧（背景資料/帳票/タスク添付等）→ 選択 → `data`(Bytes) or disk から取得。
- **DRIVE**: OAuth 接続済みなら Drive API `files.list`（フォルダ/検索）でファイル名一覧 → 選択 → `files.get?alt=media` でダウンロード。

3ソースとも結果は `IngestionFile` に正規化され、同一パイプラインに乗る。

**ZIP（アーカイブ）対応**: どのソースでも、mime が zip のファイルは `IngestionFile(isArchive=true)` として登録され、`KG_EXPAND_ARCHIVE` ジョブで**裏で自動展開**される（バッチは `EXPANDING` 表示）。展開ジョブは Blob から zip を取得 → 純JS unzip（`fflate`）で各エントリを Blob 保存 → 子 `IngestionFile(parentFileId=このアーカイブ, status=PENDING)` を作成 → 各子に `KG_INGEST_FILE` を enqueue。ネスト zip は深さ上限まで再帰。展開完了でアーカイブ自身は `SUCCEEDED`。ダッシュボードは アーカイブを子をぶら下げた展開可能な行として表示。**zip-bomb/パストラバーサル対策**（エントリ数・総解凍サイズ上限、絶対パス/`..` 拒否、対応拡張子のみ採用）必須。

## 6. ファイル1件の処理パイプライン

`JobService.dispatch` に `KG_INGEST_FILE` と `KG_EXPAND_ARCHIVE` を追加（`ALLOWED_TYPES` へも）。`KG_INGEST_FILE` は1ジョブ＝1 `IngestionFile`。各ステップ前後で `IngestionFile.status/step/progress` を更新（UI が細かく追える）。

| ステップ | status | 内容 |
|---|---|---|
| 取得 | FETCHING | 原本 bytes 取得 → Vercel Blob 保存（既に Blob ならスキップ）。`blobUrl` 確定 |
| （展開） | EXPANDING | `isArchive` なら `KG_EXPAND_ARCHIVE` で unzip → 子 IngestionFile 生成＆ enqueue（このファイルは以降へ進まず SUCCEEDED） |
| 前処理 | PREPROCESSING | mimeType で分岐（下表）。**OCR/画像解析は `ocrEnabled` が ON のときのみ** |
| 抽出 | EXTRACTING | **`aiExtractionEnabled` が ON のときのみ** `ClaudeService.extractKnowledge(...)` 多モーダル。OFF なら抽出テキストのみ保持して MERGE |
| マージ | MERGING | グラフへ冪等反映（文書ノードは常に作る。AI OFF 時はタグ/実体/関係なし） |
| 完了 | SUCCEEDED | `knowledgeDocumentId` 設定・batch カウンタ更新 |

**課金ガードの効き方（プロジェクト設定 ∧ バッチ option）**:
- `aiExtractionEnabled=false`: Claude を一切呼ばない。FETCH＋PREPROCESS（ローカルのテキスト抽出のみ）＋ KnowledgeDocument 作成（contentText 保持、summary/tags/entities/relations なし）。後から「AI再処理」可。
- `ocrEnabled=false`: 画像・スキャンPDF（テキスト層が無い PDF/画像ファイル）を vision/document に渡さない → それらは抽出テキスト空で SUCCEEDED か SKIPPED（理由を error に明記）。テキスト層のある PDF/Office/テキストは影響なし。
- いずれも**無音で飛ばさない**: スキップ理由を `IngestionFile.step/error` に残し、ダッシュボードで「設定によりスキップ」と分かる。

**型別前処理／Claude への渡し方（serverless で堅牢）**

| 種別 | 前処理 | Claude へ |
|---|---|---|
| PDF | なし（自前レンダリング不要） | **document コンテンツブロック**（base64 PDF）。Claude がレイアウト＋画像＋テキストをネイティブに読む |
| 画像 png/jpg/webp | なし | **image ブロック**で画像メタ情報抽出（vision） |
| Excel/CSV | SheetJS で **Markdown 表**へ（テキスト主）。任意で「PDF化→document」ハイブリッド（外部変換キー設定時のみ。既定OFF＝第三者送信なし） | text（＋任意で document） |
| Word(docx) | mammoth でテキスト | text |
| PPTX | テキスト抽出（任意で画像化） | text（＋任意 image/document） |
| text/md/json | そのまま | text |
| ZIP/アーカイブ | 抽出ステップに進まず `KG_EXPAND_ARCHIVE` で展開（§5） | — |
| 未対応 mime | SKIPPED（理由を error に） | — |

**EXTRACT 出力契約**（`ClaudeService.extractKnowledge`）:
```ts
{
  summary: string,
  tags: string[],
  entities: { label: string, kind: string, description?: string }[],
  relations: { from: string, to: string, label?: string }[]  // from/to は tags or entities の label
}
```
構造化出力は既存 ClaudeService の方式（system で JSON-only 指示＋コードフェンス除去）に合わせる。信頼性のため tool_use/JSON schema 化は将来改善余地（本実装は既存パターン踏襲）。モデルは `EXTRACTION_MODEL`（既定 `claude-sonnet-4-6`、品質重視なら opus に切替可）。API キーは `CompanyKeyService.resolveForProject`（会社→ユーザー→env）。

**MERGE（冪等）**:
1. `KnowledgeDocument` を `ingestionFileId` で upsert（再実行時は既存を更新）。
2. **再実行のクリーン化**: 当該 document の既存 `KnowledgeMention` と `sourceDocumentId=この文書` の `KnowledgeRelation` を削除してから再生成（→重複しない）。
3. 各 tag/entity を `(projectId, type, normalizedLabel)` で get-or-create（名寄せ）。`mentionCount` 更新。
4. `KnowledgeMention(documentId, nodeId)` を作成（snippet/relevance 付与）。
5. 各 relation の from/to を normalizedLabel でノード解決（無ければ作成）→ `KnowledgeRelation` 作成。

## 7. ステータス管理・リトライ・再開

- **個別リトライ**: `POST /api/ingestion-files/:id/retry` → 当該ファイルの BackgroundJob を再投入（FAILED→QUEUED、attempts はそのまま積み増し）。MERGE が冪等なので安全。
- **再開**: `POST /api/ingestion-batches/:id/resume` → batch 内の `PENDING|FAILED|FETCHING…(stale)` を再投入。**画面の「再開」ボタン**がこれ。
- **stale 検出**: `RUNNING/EXTRACTING…` のまま `updatedAt` が閾値（例 10分）超過の項目は「落ちた」とみなし resume 対象に含める。QStash の自動リトライ（maxAttempts=4）と二重で保険。
- **キャンセル**: batch を CANCELLED、未実行ファイルを SKIPPED。
- **batch.status 集計**: 全 SUCCEEDED→SUCCEEDED、一部 FAILED→PARTIAL、全 FAILED→FAILED、実行中→RUNNING。ファイル完了のたびに親カウンタ＋status を再計算。

## 8. 画面（frontend）

サイドバーに新グループ「**ナレッジ**」（取り込み / グラフ）。

### 8.1 取り込みダッシュボード `/dashboard/projects/[id]/knowledge/ingestion`
- バッチ一覧（status バッジ・件数・作成日）。
- **新規バッチ**: ①ソース選択（アップロード（ZIP含む）/ 既存添付一覧から選択 / Drive 一覧から選択）→ ②ファイル一覧プレビュー → ③抽出オプション（**プロジェクト設定を初期値**に AI抽出/OCR/タグ/実体/関係 ON/OFF・モデルをバッチ上書き）→ ④開始。
- **バッチ詳細**: ファイル行ごとに `ファイル名 / 種別 / status バッジ / step / 進捗バー / 試行回数 / エラー(展開) / [リトライ][スキップ][原本]`。**ZIP は子ファイルをぶら下げた展開可能行**。上部に `[再開][全リトライ][キャンセル]`。一定間隔ポーリングで進捗更新。

### 8.3 ナレッジ設定 `/dashboard/projects/[id]/knowledge/settings`（課金ガード）
- `aiExtractionEnabled` / `ocrEnabled` のトグル、`defaultModel`、`imagingMode`、`maxFilesPerBatch`。料金が発生する旨の注記。プロジェクト設定（`ProjectKnowledgeSettings`）を編集。

### 8.2 ナレッジグラフ `/dashboard/projects/[id]/knowledge/graph`
- object-map のキャンバス技術（自作 SVG ベース or React Flow）流用。ノード = タグ（単色）/ 実体（entityKind 別色）、エッジ = `KnowledgeRelation`（ラベル）。文書ノード表示は任意トグル（`KnowledgeMention` を細線）。
- レイアウト = 決定的クラスタ配置（タグ近傍に実体）＋手動ドラッグ位置永続（positionX/Y）＋「整形」再レイアウト。
- ノード click → 右パネル（label / kind / description / 出典文書＋snippet / 関連ノード）。文書 click → 要約＋原本リンク＋抽出タグ/実体。
- フィルタ（タグ/種別/文書）＋ラベル検索。

## 9. API（NestJS, グローバル prefix `api`）

- 取り込み: `POST projects/:id/ingestion-batches`（ソース＋ファイル指定で作成＆ジョブ投入）, `GET projects/:id/ingestion-batches`, `GET ingestion-batches/:id`(files 込み), `POST ingestion-batches/:id/resume`, `POST ingestion-batches/:id/cancel`, `DELETE ingestion-batches/:id`, `POST ingestion-files/:id/retry`, `POST ingestion-files/:id/skip`。
- アップロード: `POST projects/:id/ingestion-uploads`（multipart 複数 → Blob → IngestionFile 候補返却）。
- Drive: `GET projects/:id/drive/auth-url`, `GET drive/callback`, `GET projects/:id/drive/files?folder=`, `DELETE projects/:id/drive/connection`。
- グラフ: `GET projects/:id/knowledge/graph`(nodes+edges+documents), `GET knowledge-nodes/:id`(mentions 込み), `PATCH knowledge-nodes/:id`(label/description/color/position), `DELETE knowledge-nodes/:id`, `PATCH knowledge-documents/:id/position`, `GET projects/:id/knowledge/search?q=`。
- 設定: `GET projects/:id/knowledge/settings`(get-or-create 既定), `PUT projects/:id/knowledge/settings`。
- ワーカー: 既存 `POST /api/jobs/run`（QStash 署名）に `KG_INGEST_FILE` / `KG_EXPAND_ARCHIVE` を追加。`JobService.ALLOWED_TYPES` へ追加。

すべて `assertProjectAccess`（RBAC, super-admin bypass）。

## 10. インフラ・依存（新規）

- **Vercel Blob**（`@vercel/blob`）＋ `BLOB_READ_WRITE_TOKEN`。原本＋生成画像の保管。現状の Attachment は DB Bytes 4MB でバッチ文書に耐えないため。**ローカル fallback**: Blob トークン未設定時はディスク（`UPLOAD_DIR`）保存にフォールバック（既存 Attachment と同様）。
- 抽出 lib（純JS・serverless 可）: `xlsx`(SheetJS), `mammoth`(docx), `fflate`(zip 展開)。PDF は Claude 直のため変換 lib 不要。
- 外部変換（Office→画像/PDF）は**任意トグル**（`CLOUDCONVERT_API_KEY` 等が有る時のみ）。既定無効＝外部送信なし。
- アップロード body サイズ: バッチアップロードは Blob クライアントアップロード（ブラウザ→Blob 直）を優先し、サーバ body 制限（serverless 4.5MB）を回避。サーバ経由 multipart はフォールバック。

## 11. MCP / export-import

- MCP: `knowledge_ingest_start`(ソース＋ファイル→バッチ作成), `knowledge_batch_status`, `knowledge_file_retry`, `knowledge_graph_query`(nodes/edges/search)。まずは generic `api_request` でも代替可、curated は使い勝手向上のため。
- ProjectBundle: `knowledgeDocuments / knowledgeNodes / knowledgeMentions / knowledgeRelations` をセクション追加（FK 再マップは既存 idMap 方式）。`IngestionBatch/File` は実行ログ扱いで **export 対象外**（Drive 接続・Blob URL を含むため）。

## 12. 実装フェーズ（順次・各段で backend/frontend tsc 0・vitest・db push・live smoke・commit）

1. **コア**: スキーマ（Ingestion＋Knowledge＋Settings）＋ Blob ストレージ抽象＋ `KG_INGEST_FILE`/`KG_EXPAND_ARCHIVE` パイプライン（FETCH/EXPAND/PREPROCESS/EXTRACT/MERGE、AI/OCR ガード）＋ ClaudeService.extractKnowledge ＋ 取り込み・設定 API ＋ バッチダッシュボード＋設定画面。ソース = **アップロード（ZIP含む）＋既存添付**。
2. **グラフ可視化**: ナレッジグラフ・キャンバス＋ノード/文書詳細＋検索/フィルタ。
3. **Drive ソースアダプタ**: `DriveConnection`＋OAuth＋一覧/取込。
4. **MCP＋export/import** セクション。

各フェーズは「実装→spec整合レビュー→品質レビュー→fix」。共有ファイル（`app.module.ts` / `JobService` / `schema.prisma` / サイドバー `layout.tsx`）を触る作業は直列、分離トラックは並列。

## 13. テスト戦略

- **純ロジックの vitest**: `normalizeLabel`（名寄せ）, Markdown 表変換（Excel→text）, MERGE の冪等性（同入力2回でノード/エッジ重複なし）, batch.status 集計（PARTIAL/SUCCEEDED 判定）, stale 検出。Claude/Blob/Drive は I/O 境界でモック。
- **backend live smoke**: バッチ作成→ジョブ実行（inline）→ファイル SUCCEEDED→グラフ GET 200、リトライ/再開 200、冪等（2回流して件数不変）。
- **frontend tsc 0**。
- ClaudeService.extractKnowledge は API キー必須（無ければ 400）。キー無し環境では抽出ステップをモックして配線確認。

## 14. リスク・未決（実装時に既定で進める）

- **Office→画像化**: serverless では LibreOffice 不可。既定は SheetJS/mammoth のテキスト抽出＋PDFはClaude直。「必ず画像化」が要る資料は外部変換トグル（既定OFF）。→ ユーザー指示「Excel は画像化」は、PDF/画像はネイティブ多モーダルで満たし、Excel は表テキストを主とする（精度十分なら imaging 省略）。
- **DriveConnection のスコープ**: projectId 紐付け（既定）。会社共有が要れば organizationId へ拡張。
- **Vercel Blob 採用可否**: 既定採用（トークン未設定はディスク fallback）。不可なら Attachment DB-bytes に上限緩和で代替。
- **大量ファイル**: 1バッチの上限（例 200 ファイル）と並列度は QStash 同時実行に従う。超過は警告ログ（無音打ち切りしない）。
- **抽出の品質/ノイズ**: 自動タグが過剰生成しうる → ノードのマージ（名寄せ）＋低 mentionCount のフィルタ表示＋手動編集/削除で運用吸収。
- **ZIP セキュリティ**: zip-bomb（総解凍サイズ/エントリ数上限で打ち切り＋警告）、パストラバーサル（`..`/絶対パス拒否）、ネスト深さ上限、`__MACOSX`/隠しファイル除外。
- **課金ガードの既定値**: 新規は全 ON（=従来どおり課金あり）。料金懸念がある運用は設定で OFF。バッチ単位上書きで「今回だけ AI OFF で素材だけ溜める」も可。

## 15. 命名

- サイドバー群: 「ナレッジ」。サブ: 「取り込み」「ナレッジグラフ」「設定」。
- ジョブ種別: `KG_INGEST_FILE` / `KG_EXPAND_ARCHIVE`。
- ルート接頭辞: `/dashboard/projects/[id]/knowledge/...`、API は `.../knowledge/...` / `ingestion-batches` / `ingestion-files`。
