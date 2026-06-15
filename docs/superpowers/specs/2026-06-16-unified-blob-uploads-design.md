# アップロードの共有プール統一（client直アップロード → Blob → Attachment）設計

作成日: 2026-06-16 / ブランチ: feat/methodology-pipeline

## 背景・目的

ファイルアップロードが2系統に分裂している:
- 汎用添付（背景の関連資料・タスク・業務フロー・io-types具体データ・DFD帳票）= `Attachment`、**DB(Bytes) 保管・4MB上限**（Vercel関数ボディ~4.5MB制約のため意図的に低く設定）。
- ナレッジ取り込み「アップロード」= `ingestion-uploads` → **Vercel Blob**（blobUrl, 50MB設定だが本番はサーバ関数経由なので実質~4.5MBで413）。

ユーザー要望（確定）:
1. **どのアップロードも同じプロセス・同じDBに**統一（共有プール）。「既存添付から選択」に全アップロードが出る。
2. **保管は Vercel Blob ＋参照URL**に寄せ、**4MBのDB制約を本当に外す** → サーバ関数を通さない **client直アップロード** に刷新（ブラウザ→Blob直接）。
3. **status管理を丁寧に**。**先にアップロード（Blob＋Attachment登録）しておけば、取り込み(AI抽出)は何度でも再開・再試行できる**（再アップロード不要）。

## 方針の核

**アップロード（耐久化）と AI抽出（処理）を分離する。**
- ステップ1: client が Blob へ直接アップロード → 完了後に **Attachment 行を登録**（projectId直下＋任意のスコープFK）。これで「素材」はDB上に耐久化され、全画面の「既存添付」に即出現。
- ステップ2: ナレッジ取り込みバッチは **ATTACHMENT ソース（attachmentId）** で素材を参照。AI抽出の status/再試行/再開は IngestionFile 側で管理し、**バイトは登録済み Attachment(blobUrl) から読む**＝何度再開しても再アップロード不要。

## アーキテクチャ / コンポーネント

### A. データモデル（additive）

`Attachment` に Blob 参照を追加:
```prisma
model Attachment {
  // ... 既存 ...
  blobUrl String? @map("blob_url") // Vercel Blob の公開URL。これがあれば data(DB Bytes) は使わない。
  // 取得/配信の優先順位: data(DB) → blobUrl(Blob) → url(旧ディスク)
}
```
`data Bytes?` は後方互換で残置（旧データ・小ファイルのサーバ経路フォールバック用）。db push（additive）。

### B. client直アップロード（@vercel/blob/client）

**token 発行エンドポイント**（既存ガード）:
- `POST /api/projects/:projectId/blob/upload-token` — `@vercel/blob/client` の `handleUpload({ body, request, onBeforeGenerateToken, onUploadCompleted })` を使う。
  - `onBeforeGenerateToken(pathname, clientPayload)`: `assertProjectAccess(projectId, userId, 'edit')` → `{ allowedContentTypes: [...許可], maximumSizeInBytes: 大きめ(例 100MB), addRandomSuffix: true, tokenPayload: JSON({projectId,userId,scope}) }`。
  - `onUploadCompleted({ blob, tokenPayload })`: **本番のみ届く**。Attachment を作成（後述 register と同一ロジック・blobUrl で冪等）。ローカルでは届かないため register に依存。
- `JwtAuthGuard` 配下（user 必須）。`handleUpload` は raw body を要求するので rawBody 経路と整合させる（既存 app-setup の rawBody 保持あり）。

**Attachment 登録エンドポイント**（client がアップロード完了後に必ず呼ぶ。冪等）:
- `POST /api/projects/:projectId/attachments/register-blob` body `{ blobUrl, pathname, filename, mimeType, size, kind?, scope?: {phaseId?/taskId?/flowId?/informationTypeId?}, folder?, displayName? }`
  - `assertProjectAccess(edit)` → 同じ `blobUrl` の Attachment が既存ならそれを返す（冪等＝onUploadCompleted と二重作成しない）。無ければ作成（`data=null, blobUrl=...`, kind は mimeType から推定）。
  - 返り値は通常の Attachment（id, url=/api/attachments/:id/file, …）。

**フロント共有ユーティリティ** `src/lib/upload.ts`:
- `uploadProjectFile(projectId, file, scope?): Promise<ProjectAttachment>`
  1. `@vercel/blob/client` の `upload(pathname, file, { access:'public', handleUploadUrl: '/api/projects/:id/blob/upload-token', clientPayload })` で Blob へ直接アップロード。
  2. 返った `{url}` で `register-blob` を呼び、Attachment を作成して返す。
  - **ローカル/未設定フォールバック**: Blob token 未設定環境（client upload が使えない）では、従来のサーバ経由 multipart 添付エンドポイント（`POST /projects/:id/attachments`、4MB）に自動フォールバック。`NEXT_PUBLIC_BLOB_UPLOAD=1` 等のフラグ or token エンドポイントの可用性で判定。

### C. 配信（既存 GET /api/attachments/:id/file）

優先順位を `data → blobUrl → url(disk)` に:
- `data` 有: 従来通り DB バイト送出。
- `data` 無 & `blobUrl` 有: 公開 Blob URL へ **302 リダイレクト**（公開アクセスなので最速・関数を通さない）。
- どちらも無: 旧ディスク fallback。

### D. ナレッジ取り込みの統一

- NewBatchDialog「アップロード」タブ: `uploadProjectFile` で **Blob直アップロード→Attachment登録** に変更。アップロード済みファイルは即「既存添付」に出る。バッチ作成は **ATTACHMENT ソース（attachmentId）** で送る（UPLOAD/blobUrl ソースは後方互換で残置）。
- `fetchAttachmentBytes()`（ingestion）に `blobUrl` 分岐追加: `data → blobUrl(Blob fetch) → disk`。
- **status/再開**: 既存 IngestionFile の status（PENDING→…→SUCCEEDED/FAILED/SKIPPED）と resume/retry はそのまま。素材が Attachment(blobUrl) で耐久化されているため、**バッチ再開・ファイル再試行は再アップロード不要**で何度でも可能（要望3）。

### E. 全添付UIの移行（共有 util に集約）

現状サーバ経由 multipart で添付している箇所を `uploadProjectFile`（client直＋register）に移行:
- 背景・目的（関連資料）、タスク詳細、io-types 具体データ、DFD 帳票（情報種別）、業務定義/業務フロー添付、プロジェクト直下添付。
- 各UIは scope FK（taskId/flowId/informationTypeId 等）を register に渡す。サーバ経由フォールバックも同じ scope を使う。

## データフロー

1. ユーザーがファイル選択 → `uploadProjectFile`:
   - client → Blob 直アップロード（関数を通らない＝サイズ制約なし）。
   - → `register-blob` で Attachment(blobUrl) 作成（冪等）。
2. アップロード済み素材は全画面「既存添付」に出現（共有プール）。
3. ナレッジ取り込み: ATTACHMENT ソースで参照 → AI抽出。失敗/中断は IngestionFile status で管理し、**再開/再試行は同じ Attachment を再利用**（再アップロード不要）。
4. 配信: data→blobUrl(302)→disk。

## エラーハンドリング / status

- アップロードと登録を分離。Blob アップロード成功後に register が失敗しても、client は同じ blobUrl で register をリトライ可能（冪等）。
- onUploadCompleted（本番）と register（client）が両方走っても blobUrl 冪等で二重作成しない。
- ナレッジ取り込みの status は既存設計を踏襲（バッチ PENDING/EXPANDING/RUNNING/PARTIAL/SUCCEEDED/FAILED/CANCELLED、ファイル PENDING…SUCCEEDED/FAILED/SKIPPED、resume/retry）。
- Blob token 未設定（ローカル）: サーバ経由 4MB フォールバック（degraded だが動く）。

## テスト

- backend jest: register-blob 冪等（同 blobUrl で重複作成しない）・kind 推定・配信の blobUrl 分岐（302）・fetchAttachmentBytes の blobUrl 分岐。token エンドポイントは handleUpload をモックして認可のみ検証。
- frontend: lib/upload のフォールバック分岐（token 有→client直 / 無→サーバ経由）最小テスト、tsc/vitest/build。
- ライブ smoke: ローカル（Blob token 設定時）で client直アップロード→register→既存添付に出る→取り込み再試行で再アップロード無しを確認。token 無し時はサーバ経由で従来通り。

## スコープ外（YAGNI）

- 既存 DB(Bytes) 添付の Blob への一括移行（新規アップロードのみ Blob。既存は data 送出のまま）。
- Google Drive ソースの Attachment 化（DRIVE ソースのまま）。
- private Blob（公開URLで配信。秘匿が要るならフォローアップ）。

## 影響ファイル（想定）

- schema（Attachment.blobUrl）/ blob-storage.service（read 追加可）/ 新 token+register エンドポイント（attachment.controller か新 blob-upload.controller）/ attachment 配信（blobUrl 302）/ knowledge-ingestion.service（fetchAttachmentBytes blobUrl 分岐）/ NewBatchDialog（client直）/ 各添付UI（共有 util へ）/ 新 lib/upload.ts / app.module 配線。
- 依存: frontend に `@vercel/blob` 追加（client サブパス利用）。本番 env `BLOB_READ_WRITE_TOKEN`（既存・要確認）。
