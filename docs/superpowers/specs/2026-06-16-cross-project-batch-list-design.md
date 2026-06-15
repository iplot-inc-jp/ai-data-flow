# 設計仕様: クロスプロジェクト「ファイル取り込みバッチ」一覧（トップレベル画面）

作成日: 2026-06-16 / ブランチ: feat/methodology-pipeline

## 確定事項（ブレスト）
- 対象 = 既存のナレッジ取り込みバッチ（`IngestionBatch`）を **全プロジェクト横断**で一覧。
- 置き場所 = **トップレベル**サイドバー（`baseNav`、プロジェクト非依存）。
- super-admin = **自分の所属 org 内**で閲覧可能なバッチまで（所属外 org は初版では含めない）。
- 採用デフォルト: 200件 cap（新しい順・「最新200件」注記）、アイコン `Inbox`＋ラベル「取り込みバッチ」、プロジェクトはバッジ表示、失敗はファイル件数集計のみ（詳細は既存のバッチ詳細ページ）。
- 読み取り専用（作成/resume/cancel/delete とクロスプロジェクト BackgroundJob 一覧はスコープ外）。

## 1. 目的・スコープ
ユーザーが閲覧権限を持つ全プロジェクト横断で、既存の取り込みバッチを1画面に集約して読み取り専用で一覧表示する。各行はプロジェクト名を持ち、クリックで **既存の**詳細ルート `/dashboard/projects/[projectId]/knowledge/ingestion/[batchId]` に遷移。ステータスバッジ・件数・進捗バー・作成日のレンダリングは既存のプロジェクト別一覧と同一。実行中バッチがある間だけ4秒ポーリング。

### スコープ外（YAGNI）
バッチ新規作成・resume/cancel/delete・クロスプロジェクト BackgroundJob 一覧・ファイル単位インライン展開・サーバーページネーションUI・フィルタUI。

## 2. バックエンド

### 2.1 エンドポイント
**`GET /api/my/ingestion-batches`** — 専用コントローラ `MyIngestionBatchController`（`@Controller('my')` + `@Get('ingestion-batches')`）。既存 `@Controller('ingestion-batches')` の `@Get(':id')` とルート衝突しない。グローバル `JwtAuthGuard`（APP_GUARD）で認証。`@ProjectScopedAccess()`/`ProjectAccessGuard` は付けない（`projectId` 経路パラメータが無いため）。RBAC はユースケース内で能動的に行う。

### 2.2 ユースケース `GetAllAccessibleIngestionBatchesUseCase`（clean-arch）
依存（既存トークン/サービスを再利用）: `ORGANIZATION_REPOSITORY`(`OrganizationRepository.findByUserId(userId): Promise<Organization[]>`)、`PROJECT_REPOSITORY`(`ProjectRepository.findByOrganizationId(orgId): Promise<Project[]>`)、`INGESTION_BATCH_REPOSITORY`(`IIngestionBatchRepository.findByProjectId(projectId): Promise<IngestionBatch[]>`、createdAt降順)、`ProjectAccessService.resolveProjectAccess(projectId,userId): 'EDIT'|'VIEW'|null`。

手順:
1. `orgRepo.findByUserId(userId)` → 所属 org 一覧。
2. 各 org の `projectRepo.findByOrganizationId(org.id)` を集約 → 候補 Project（id/name）。
3. 各候補 project に `resolveProjectAccess(project.id, userId)` を**並列**(`Promise.all`)適用し、`null` 以外（VIEW/EDIT）のみ残す。これで super-admin / org OWNER・ADMIN / ProjectMember 0件後方互換 / 明示掲載モードの全分岐が自動で効く。
4. 残った project ごとに `batchRepo.findByProjectId(id)` を**並列**取得し、`{batch, projectName}` で集約。
5. 全体を `createdAt` 降順で再ソートし、**先頭200件**に cap。
6. `toIngestionBatchWithProjectOutput(batch, projectName)` で DTO 化して返す。

> 効率注記: `resolveProjectAccess` は project 毎に数クエリ。所属org×プロジェクト数が数十なら許容。並列化で緩和。将来スケール時に org role 先読みメモ化＋ProjectMember in句一括解決へ最適化可（初版はYAGNI）。

### 2.3 DTO（`ingestion-output.ts` に追記）
```ts
export interface IngestionBatchWithProjectOutput extends IngestionBatchOutput {
  projectName: string;
}
export function toIngestionBatchWithProjectOutput(
  batch: IngestionBatch, projectName: string,
): IngestionBatchWithProjectOutput {
  return { ...toIngestionBatchOutput(batch), projectName };
}
```
`projectId` は既存 `IngestionBatchOutput` に含まれるため詳細リンク構築に十分。件数はバッチ非正規化値をそのまま返す。

### 2.4 順序・上限
`createdAt` 降順、最大200件（cap）。サーバーページネーションなし。

### 2.5 テスト（use-case spec）
super-admin（所属org範囲）/ org OWNER・ADMIN / ProjectMember0件後方互換 / 明示掲載で非掲載は除外 / 複数プロジェクト混在の createdAt desc ソート / cap200 超過。

## 3. フロントエンド

### 3.1 API クライアント（`lib/knowledge.ts`）
- 型 `export interface IngestionBatchWithProject extends IngestionBatch { projectName: string }`。
- `ingestionApi.listAllBatches(): Promise<IngestionBatchWithProject[]>` → `GET /api/my/ingestion-batches`（既存 private `headers()`/`ok()` を流用）。
- 重複回避: `BATCH_STATUS_STYLE`（現在プロジェクト別ページのローカル定義）と日付整形 `formatBatchDate` を `knowledge.ts` に**切り出して export**。既存ページと新ページの両方が import する。既存 `BATCH_STATUS_LABEL`/`isBatchTerminal`/`IngestionBatchStatus` は流用。

### 3.2 新規ページ `/dashboard/batches`（`app/(dashboard)/dashboard/batches/page.tsx`）
`'use client'`。PageHeader（アイコン+「取り込みバッチ（横断）」+説明、actions は更新ボタンのみ）。state=`batches/loading/error`。`load()`=`ingestionApi.listAllBatches()`。マウントで load。ポーリング=非終端が1つでもあれば `setInterval(load,4000)`、終端で停止。ローディング=`Loader2`、空=Card+案内（作成導線なし）、エラー=`text-destructive`。一覧=既存バッチ行レイアウト流用＋**プロジェクト名バッジ**追加。行は `<Link href={/dashboard/projects/${b.projectId}/knowledge/ingestion/${b.id}}>`。最新200件 cap の注記。

### 3.3 サイドバー（`app/(dashboard)/layout.tsx`）
`baseNav` に `{ name: '取り込みバッチ', href: '/dashboard/batches', icon: Inbox }` を「プロジェクト」直後に追加（全ユーザー表示＝権限はバックエンドが各自分だけ返す）。`Inbox` を `lucide-react` import に追加。アクティブ判定・展開/折りたたみ両ビューは既存 `baseNav.map` で自動。

## 4. 受け入れ条件
- `GET /api/my/ingestion-batches` が VIEW 以上の全プロジェクトのバッチを createdAt desc・最大200件・projectName 付きで返す。権限の無いプロジェクトは漏れない（4分岐をテスト）。
- `/dashboard/batches` がトップレベルサイドバーに出て、行クリックで既存詳細へ遷移、実行中だけ4秒ポーリング、作成/編集導線なし。

## 5. 触るファイル
backend: `ingestion-output.ts`(追記) / `get-all-accessible-ingestion-batches.use-case.ts`(新) + `.spec.ts`(新) / `ingestion/index.ts`(export追記) / `ingestion.controller.ts`(MyIngestionBatchController 追記) / `app.module.ts`(controller+provider 登録)。
frontend: `lib/knowledge.ts`(型+listAllBatches+BATCH_STATUS_STYLE/formatBatchDate 切り出し) / `knowledge/ingestion/page.tsx`(切り出した helper を import に変更) / `dashboard/batches/page.tsx`(新) / `layout.tsx`(baseNav+Inbox import)。

## 6. リスク
ルート衝突（`/my/...` で回避）/ N+1性能（並列化＋将来最適化）/ 無制限ペイロード（200cap+注記）/ super-admin 所属外orgギャップ（確定: 初版は所属org内）/ helper重複（knowledge.ts 共通化で回避）/ baseNav 全ユーザー表示（空状態文言で違和感抑制）。
